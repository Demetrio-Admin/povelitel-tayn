import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let checks = 0;
const check = (v, m) => {
  assert.ok(v, m);
  checks++;
  console.log("  ✓", m);
};
const sql = (s, p = []) => db.query(s, p);
const migration = readFileSync(
  "supabase/migrations/20261004_game_chat.sql",
  "utf8",
);
const users = Object.fromEntries(
  ["owner", "admin", "mod", "dev", "support", "alice", "bob", "guest"].map(
    (n) => [n, randomUUID()],
  ),
);
async function as(n, fn) {
  await db.exec("set role authenticated");
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [users[n]]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const call = (n, op, args = {}, id = randomUUID()) =>
  as(
    n,
    async () =>
      (
        await sql("select public.chat_request($1,$2::jsonb,$3::uuid) j", [
          op,
          JSON.stringify(args),
          id,
        ])
      ).rows[0].j,
  );
const deny = async (
  n,
  op,
  args,
  pattern = /chat_forbidden|permission denied/,
) => {
  await assert.rejects(() => call(n, op, args), pattern);
  checks++;
  console.log("  ✓ denied", n, op);
};
try {
  await db.exec(readFileSync("tools/sql/auth-stub.sql", "utf8"));
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
  for (const [n, id] of Object.entries(users)) {
    await sql("insert into auth.users(id) values($1)", [id]);
    await as(n, () => sql("select public.create_player('witch')"));
    if (n !== "guest")
      await sql("select public.claim_nickname($1,$2,$3)", [id, n, n]);
  }
  // Seed existing server progress: v0.15+ sync_player cannot grant XP or resources.
  await sql("update public.player_progress set hero_xp=160,hero_level=2 where user_id=$1", [users.alice]);
  await sql("insert into public.player_inventory(user_id,item_id,quantity) values($1,'coins',31) on conflict(user_id,item_id) do update set quantity=excluded.quantity", [users.alice]);
  await db.exec(migration);
  await db.exec(migration);
  for (const [n, role] of Object.entries({
    owner: "owner",
    admin: "admin",
    mod: "moderator",
    dev: "developer",
    support: "support",
  }))
    await sql("insert into game_chat.roles(user_id,roles) values($1,$2)", [
      users[n],
      [role],
    ]);
  const me = {};
  for (const n of Object.keys(users)) me[n] = (await call(n, "bootstrap")).me;
  check(
    new Set(Object.values(me).map((p) => p.playerId)).size === 8,
    "permanent unique IDs backfilled",
  );
  const snap = await as(
    "alice",
    async () => (await sql("select public.get_player() j")).rows[0].j,
  );
  check(
    snap.xp === 160 &&
      snap.inventory.coins === 31 &&
      snap.meta.playerId === me.alice.playerId,
    "migration preserves progress and supplies own ID",
  );
  const rooms = (await call("alice", "bootstrap")).rooms;
  const room = rooms.find((r) => r.kind === "general").id;
  const news = rooms.find((r) => r.kind === "news").id;
  const id = randomUUID();
  const msg = await call(
    "alice",
    "send",
    { room, body: "Привет <img onerror=alert(1)>!" },
    id,
  );
  check(
    (
      await call(
        "alice",
        "send",
        { room, body: "Привет <img onerror=alert(1)>!" },
        id,
      )
    ).id === msg.id,
    "retry is idempotent",
  );
  await deny("alice", "send", { room, body: "different" }, /chat_rate_limited/);
  await deny("alice", "send", { room, body: "different" }, /chat_rate_limited/);
  await deny("guest", "send", { room, body: "Гость" }, /chat_register/);
  await deny("support", "delete", {
    message: msg.id,
    revision: "0",
    reason: "spam",
  });
  await deny("dev", "sanction", {
    ref: me.alice.ref,
    kind: "mute",
    minutes: 10,
    reason: "spam",
  });
  await deny("alice", "send", { room: news, body: "Fake announcement" });
  await call("dev", "send", { room: news, body: "Официальная новость" });
  const h = await call("bob", "history", { room });
  check(
    !("playerId" in h.messages[0].author),
    "no other numeric ID in player DTO",
  );
  check(
    !(
      "playerId" in (await call("mod", "history", { room })).messages[0].author
    ),
    "moderators do not receive other numeric IDs",
  );
  check(
    (await call("admin", "history", { room })).messages[0].author.playerId ===
      me.alice.playerId,
    "administrators see IDs",
  );
  await deny("mod", "roles_lookup", { playerId: me.alice.playerId });
  await deny("admin", "roles_lookup", {playerId:"9999999999999999999"},/chat_invalid_id/);
  const lookup = await call("admin", "roles_lookup", {
    playerId: me.bob.playerId,
  });
  await deny(
    "admin",
    "roles_set",
    { playerId: me.bob.playerId, roles: ["support"], reason: "team" },
    /chat_conflict/,
  );
  await call("admin", "roles_set", {
    playerId: me.bob.playerId,
    revision: lookup.revision,
    roles: ["support"],
    reason: "team",
  });
  await deny(
    "admin",
    "roles_set",
    {
      playerId: me.bob.playerId,
      revision: lookup.revision,
      roles: [],
      reason: "team",
    },
    /chat_conflict/,
  );
  await deny(
    "admin",
    "roles_set",
    { playerId: me.owner.playerId, revision: "0", roles: [], reason: "team" },
    /chat_protected/,
  );
  await deny(
    "admin",
    "roles_set",
    { ref: me.alice.ref, revision: "0", roles: ["admin"], reason: "team" },
    /chat_invalid_request/,
  );
  await deny(
    "admin",
    "roles_set",
    {
      playerId: me.bob.playerId,
      message: msg.id,
      revision: "0",
      roles: ["support"],
      reason: "spoof target",
    },
    /chat_invalid_request/,
  );
  const edited = await call("alice", "edit", {
    message: msg.id,
    revision: "0",
    body: "Исправлено",
  });
  check(
    edited.body === "Исправлено" && edited.revision === "1",
    "own edit persists and increments revision",
  );
  const deleted = await call("mod", "delete", {
    message: msg.id,
    revision: "1",
    reason: "spam",
  });
  check(deleted.body === null, "deleted content removed from response");
  await deny("admin","delete",{message:msg.id,revision:deleted.revision,reason:"take restoration ownership"},/chat_conflict/);
  const delta = await call("alice", "history", { room, after: msg.seq });
  check(
    delta.messages[0].deleted && delta.messages[0].body === null,
    "offline delta carries tombstone",
  );
  await call("mod", "restore", { message: msg.id, revision: "2" });
  await call("alice", "report", { message: msg.id, reason: "test evidence" });
  check(
    (await call("mod", "reports")).length === 1,
    "server report snapshot available to moderator",
  );
  const sanction = await call("mod", "sanction", {
    ref: me.alice.ref,
    kind: "mute",
    minutes: 10,
    reason: "spam",
  });
  await deny("alice", "send", { room, body: "muted" }, /chat_muted/);
  await deny(
    "mod",
    "sanction",
    { ref: me.dev.ref, kind: "mute", minutes: 10, reason: "spam" },
    /chat_protected/,
  );
  await deny("mod", "sanction", {
    ref: me.alice.ref,
    kind: "mute",
    minutes: 1441,
    reason: "spam",
  });
  const t = (
    await call("alice", "ticket_create", {
      category: "appeal",
      subject: "Обжалование",
      body: "Прошу пересмотреть",
    })
  ).ticket;
  await deny("dev", "ticket", { ticket: t }, /chat_take_ticket/);
  await call("support", "ticket_take", { ticket: t, revision: "0" });
  await call("support", "ticket_note", {
    ticket: t,
    revision: "1",
    body: "INTERNAL SECRET",
  });
  const pt = await call("alice", "ticket", { ticket: t });
  check(
    !JSON.stringify(pt).includes("SECRET") && !("notes" in pt),
    "internal notes never reach player",
  );
  await call("support", "ticket_solve", {
    ticket: t,
    revision: "2",
    body: "Ограничение пересмотрено",
  });
  await call("alice", "ticket_close", { ticket: t, revision: "3" });
  await call("alice", "ticket_reopen", { ticket: t, revision: "4" });
  check(
    (await call("alice", "ticket", { ticket: t })).status === "work",
    "support solve → close → reopen",
  );
  await call("support", "ticket_transfer", {
    ticket: t,
    revision: "5",
    ref: me.dev.ref,
    body: "Reviewed technical steps, v0.10.0",
  });
  const tasks = await call("dev", "tasks");
  check(
    tasks[0].description.includes("Reviewed") &&
      !JSON.stringify(tasks).includes("SECRET") &&
      !("ticket" in tasks[0]),
    "developer only receives reviewed task",
  );
  await call("dev", "task_answer", {
    task: tasks[0].id,
    revision: "0",
    body: "Исправлено",
  });
  await call("mod", "revoke_sanction", {
    ref: me.alice.ref,
    sanction: sanction.id,
    reason: "appeal approved",
  });
  const dm = (await call("alice", "dm_open", { ref: me.bob.ref })).room;
  await deny("dev", "history", { room: dm });
  await call("alice", "send", { room: dm, body: "Личное" }).catch((e) => {
    if (!e.message.includes("rate_limited")) throw e;
  });
  await deny("alice", "ignore", { ref: me.bob.ref, ignored: true }); // staff protection
  const ban = await call("admin", "sanction", {
    ref: me.alice.ref,
    kind: "game",
    minutes: 10,
    reason: "game restriction",
  });
  for (const [fn, arg] of [
    ["get_player", ""],
    ["create_player", "'witch'"],
    ["reset_player", "'witch'"],
    ["sync_player", "'{}'"],
    ["player_action", '\'{"op":"heal"}\''],
  ])
    await assert.rejects(
      () => as("alice", () => sql(`select public.${fn}(${arg})`)),
      /game_banned/,
    );
  check(
    (await call("alice", "bootstrap")).rooms.length === 0,
    "game ban blocks all game RPCs and public rooms with existing token",
  );
  check(
    (await call("alice", "ticket", { ticket: t })).id === t,
    "support remains accessible while game banned",
  );
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
  await assert.rejects(
    () => as("alice", () => sql("select public.get_player()")),
    /game_banned/,
  );
  checks++;
  await call("admin", "revoke_sanction", {
    ref: me.alice.ref,
    sanction: ban.id,
    reason: "lift",
  });
  await as("alice", () => sql("select public.reset_player('warlock')"));
  check(
    (await call("alice", "bootstrap")).me.playerId === me.alice.playerId,
    "reset does not change ID",
  );
  await assert.rejects(
    () => as("alice", () => sql("select * from game_chat.notes")),
    /permission denied/,
  );
  checks++;
  await assert.rejects(
    () =>
      as("alice", () => sql("select game_chat.is_admin($1)", [users.alice])),
    /permission denied/,
  );
  checks++;
  await assert.rejects(
    () =>
      as("alice", () =>
        sql("select setval('public.profiles_player_id_seq',1)"),
      ),
    /permission denied/,
  );
  checks++;
  await db.exec("set role anon");
  await assert.rejects(
    () => sql("select public.chat_request('bootstrap')"),
    /permission denied/,
  );
  await db.exec("reset role");
  checks++;
  await db.exec(readFileSync("supabase/schema.sql", "utf8")); // later base schema update must retain game ban protection
  await db.exec(migration);
  check(
    (await call("alice", "bootstrap")).me.playerId === me.alice.playerId,
    "base schema and repeated chat upgrade preserve identity",
  );
  // Limits, mentions, receipts and staff-only privacy use SQL, not client assumptions.
  await sql("delete from game_chat.requests where user_id=$1 and op='send'", [
    users.alice,
  ]);
  const unicode = await call("alice", "send", { room, body: "🌙".repeat(500) });
  check(
    Array.from(unicode.body).length === 500,
    "500 Unicode codepoints accepted",
  );
  await sql("delete from game_chat.requests where user_id=$1 and op='send'", [
    users.alice,
  ]);
  await deny(
    "alice",
    "send",
    { room, body: "🌙".repeat(501) },
    /chat_invalid_text/,
  );
  await deny(
    "alice",
    "send",
    { room, body: "@a @b @c @d" },
    /chat_invalid_text/,
  );
  await call("alice", "send", { room, body: "@dev посмотрим вместе" });
  check(
    (await call("dev", "bootstrap")).mentions === 1,
    "mention notification derived on server",
  );
  await call("dev", "read", {
    room,
    cursor: (await call("dev", "history", { room })).cursor,
  });
  check(
    (await call("dev", "bootstrap")).mentions === 0,
    "read receipt clears mention notification",
  );
  await call("support", "ticket_read", {
    ticket: t,
    revision: (await call("support", "ticket", { ticket: t })).revision,
  });
  check(
    (await call("support", "bootstrap")).supportUnread === 0,
    "ticket read receipt clears badge",
  );
  check(
    !("playerId" in (await call("support", "ticket", { ticket: t })).author),
    "support does not receive private numeric ID",
  );
  await sql("delete from game_chat.requests where user_id=$1 and op=$2", [
    users.alice,
    "send",
  ]);
  await call("alice", "ignore", { ref: me.dev.ref, ignored: true }).then(
    () => assert.fail("staff ignore allowed"),
    (e) => assert.match(e.message, /chat_forbidden/),
  );
  console.log(`\n${checks} chat database checks passed`);
} finally {
  await db.close();
}
