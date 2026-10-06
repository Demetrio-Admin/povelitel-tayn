import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { ITEMS } from "../src/config/balance.progression.js";
import { roleOf, rankOf, canManage, isModerator, isSupport, isDeveloper } from "../src/cloud/ChatService.js";

const db = new PGlite(), users = {}, me = {};
let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; console.log("  ✓", label); };
const sql = (s, p = []) => db.query(s, p);
async function as(n, fn) {
  await db.exec("set role authenticated");
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [users[n]]);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
const call = (n, op, args = {}, id = randomUUID()) => as(n, async () => (await sql("select public.chat_request($1,$2::jsonb,$3::uuid) j", [op, JSON.stringify(args), id])).rows[0].j);
const deny = async (n, op, args = {}, pattern = /chat_forbidden|chat_protected/) => { await assert.rejects(() => call(n, op, args), pattern); checks++; };
const migrate = async () => {
  await db.exec(readFileSync("supabase/migrations/20261004_chat_roles_v2.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261005_chat_amulet_catalog.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261006_chat_catalog_ch2.sql", "utf8"));   // v0.19.0
  await db.exec(readFileSync("supabase/migrations/20261007_covens.sql", "utf8"));             // v0.25.0: Ковены и их чат
};
try {
  for (const f of ["tools/sql/auth-stub.sql", "supabase/schema.sql", "supabase/migrations/20261004_game_chat.sql"]) await db.exec(readFileSync(f, "utf8"));
  const names = ["player", "moderator", "support", "developer", "admin", "owner", "alice", "bob", "guest"];
  for (const n of names) {
    users[n] = randomUUID(); await sql("insert into auth.users(id) values($1)", [users[n]]);
    await as(n, () => sql("select public.create_player('witch')"));
    if (n !== "guest") await sql("select public.claim_nickname($1,$2,$2)", [users[n], n]);
  }
  for (const n of names.slice(1, 6)) await sql("insert into game_chat.roles(user_id,roles) values($1,$2)", [users[n], [n]]);
  await sql("insert into game_chat.roles(user_id,roles) values($1,array['support','developer','moderator'])", [users.bob]);
  await migrate(); await migrate();
  check((await call("bob", "bootstrap")).me.roles.join() === "developer", "legacy combined roles normalize to the highest one, repeatably");
  await sql("update game_chat.roles set roles='{}' where user_id=$1", [users.bob]);
  await assert.rejects(() => sql("update game_chat.roles set roles=array['support','moderator'] where user_id=$1", [users.bob]), /chat_one_role/); checks++;
  for (const n of names) me[n] = (await call(n, "bootstrap")).me;
  const roles = names.slice(0, 6);
  for (let i = 0; i < roles.length; i++) {
    const n = roles[i]; check(rankOf(me[n]) === i && roleOf(me[n]) === n, `client rank ${n}`);
    assert.equal(isModerator(me[n]), i >= 1); assert.equal(isSupport(me[n]), i >= 2); assert.equal(isDeveloper(me[n]), i >= 3);
    for (let j = 0; j < roles.length; j++) {
      const target = roles[j], allowed = i > j;
      assert.equal(canManage(me[n], me[target]), allowed);
      const args = { ref: me[target].ref, kind: "warn", reason: "Matrix" };
      if (allowed) await call(n, "sanction", args); else await deny(n, "sanction", args);
    }
  }
  check(true, "all 36 actor/target combinations enforce staff hierarchy on server and client");
  const room = (await call("alice", "bootstrap")).rooms.find((r) => r.kind === "general").id;
  const msg = await call("alice", "send", { room, body: "Player message" });
  for (const n of roles) check((await call(n, "history", { room })).messages[0].author.playerId === me.alice.playerId, `numeric IDs visible to ${n}`);
  await deny("alice", "edit", { message: msg.id, revision: "0", body: "Edited" });
  await deny("alice", "delete", { message: msg.id, revision: "0", reason: "Own deletion" });
  const deleted = await call("support", "delete", { message: msg.id, revision: "0", reason: "Spam" });
  check(deleted.deleted && deleted.body === null, "support inherits public moderation");
  await deny("developer", "restore", { message: msg.id, revision: deleted.revision });
  await call("support", "restore", { message: msg.id, revision: deleted.revision });
  await sql("update game_chat.messages set deleted_at=now()-interval '25 hours',deleted_by=$1,revision=revision+1 where id=$2", [users.support, msg.id]);
  await deny("support", "restore", { message: msg.id, revision: "3" });
  const mute = await call("moderator", "sanction", { ref: me.alice.ref, kind: "mute", minutes: 43200, reason: "30 days" });
  await deny("moderator", "sanction", { ref: me.alice.ref, kind: "mute", minutes: 43201, reason: "Too long" });
  await deny("moderator", "sanction", { ref: me.alice.ref, kind: "mute", minutes: 0, reason: "Forever" });
  await deny("moderator", "sanction", { ref: me.alice.ref, kind: "game", minutes: 10, reason: "Game ban" });
  await deny("support", "revoke_sanction", { ref: me.alice.ref, sanction: mute.id, reason: "Not mine" });
  await call("moderator", "revoke_sanction", { ref: me.alice.ref, sanction: mute.id, reason: "Mine" });
  const ban = await call("support", "sanction", { ref: me.alice.ref, kind: "game", minutes: 0, reason: "Permanent" });
  await assert.rejects(() => as("alice", () => sql("select public.get_player()")), /game_banned/); checks++;
  await call("support", "revoke_sanction", { ref: me.alice.ref, sanction: ban.id, reason: "Mine" });
  check(true, "moderator 30-day cap, support permanent game bans and own revocation");
  const lookup = await call("owner", "roles_lookup", { playerId: me.bob.playerId });
  await deny("admin", "roles_set", { playerId: me.bob.playerId, roles: ["admin"], revision: lookup.revision, reason: "Promote" });
  await deny("owner", "roles_set", { playerId: me.bob.playerId, roles: ["support", "developer"], revision: lookup.revision, reason: "Multiple" });
  const assigned = await call("owner", "roles_set", { playerId: me.bob.playerId, roles: ["admin"], revision: lookup.revision, reason: "Appoint admin" });
  check(assigned.roles.join() === "admin", "owner assigns administrators by ID in game");
  await deny("admin", "roles_set", { playerId: me.bob.playerId, roles: [], revision: assigned.revision, reason: "Peer" });
  await call("owner", "roles_set", { playerId: me.bob.playerId, roles: [], revision: assigned.revision, reason: "Remove admin" });
  for (const n of ["player", "moderator", "support"]) await deny(n, "player_lookup", { playerId: me.alice.playerId });
  // Existing balance is server data; sync_player no longer accepts inventory deltas.
  await sql("insert into public.player_inventory(user_id,item_id,quantity) values($1,'coins',31) on conflict(user_id,item_id) do update set quantity=excluded.quantity", [users.alice]);
  const p = await call("developer", "player_lookup", { playerId: me.alice.playerId });
  check(Object.keys(p.catalog).sort().join() === Object.keys(ITEMS).sort().join() && Object.entries(ITEMS).every(([id, item]) => p.catalog[id] === item.name), "server resource IDs and names match the game");
  const args = { playerId: p.playerId, revision: p.inventoryRevision, item: "coins", delta: 100, reason: "Compensation" }, request = randomUUID();
  const given = await call("developer", "resources", args, request);
  check(given.inventory.coins === 131 && (await call("developer", "resources", args, request)).inventory.coins === 131, "resource grants persist exactly once on retry");
  await deny("developer", "resources", args, /chat_conflict/);
  await deny("developer", "resources", { ...args, revision: given.inventoryRevision, delta: -132 }, /chat_invalid_request/);
  await deny("developer", "resources", { ...args, revision: given.inventoryRevision, item: "made_up" }, /chat_invalid_request/);
  const synced = await as("alice", async () => (await sql("select public.sync_player('{\"inv\":{\"coins\":2}}') j")).rows[0].j);
  check(synced.inventory.coins === 131, "client inventory deltas cannot alter a staff grant");
  const current = await call("developer", "player_lookup", { playerId: me.alice.playerId });
  const taken = await call("developer", "resources", { ...args, revision: current.inventoryRevision, delta: -20 });
  check(taken.inventory.coins === 111, "resource withdrawal is exact and audited");
  const renamed = await call("developer", "rename", { playerId: me.alice.playerId, revision: taken.staffRevision, nickname: "Alina", reason: "Rename" });
  check(renamed.nickname === "Alina", "developer changes player nickname");
  const login = async (norm) => (await sql("select public.nickname_login($1) j", [norm])).rows[0].j;
  check(await login("alice") === null && await login("alina") === "alice", "only the new nickname resolves login; existing Auth identity and password are preserved");
  await deny("developer", "rename", { playerId: me.alice.playerId, revision: renamed.staffRevision, nickname: "bоb", reason: "Mixed alphabets" }, /chat_invalid_request/);
  await deny("developer", "rename", { playerId: me.alice.playerId, revision: renamed.staffRevision, nickname: "bob", reason: "Duplicate" }, /nickname_taken/);
  await assert.rejects(() => sql("select public.claim_nickname($1,'alice','alice')", [users.guest]), /nickname_taken/); checks++;
  await deny("developer", "resources", { ...args, playerId: me.admin.playerId, revision: "0" });
  await deny("developer", "rename", { playerId: me.owner.playerId, revision: "0", nickname: "NewOwner", reason: "Protected" });
  const audits = await call("moderator", "audit");
  check(audits.some((e) => e.action === "resources" && e.detail.before === 131 && e.detail.after === 111) && audits.some((e) => e.action === "rename" && e.detail.before === "alice" && e.detail.after === "Alina"), "audit includes reasons and before/after values");
  for (const n of ["player", "moderator"]) await deny(n, "templates");
  const tpl = await call("support", "template_save", { title: "Connection", body: "Reload the game." });
  let templates = await call("developer", "templates");
  check(templates.some((t) => t.id === tpl.id), "support creates shared server templates; developer inherits access");
  await call("developer", "template_save", { template: tpl.id, revision: "0", title: "Connection", body: "Check connection first." });
  await deny("support", "template_archive", { template: tpl.id, revision: "0" }, /chat_conflict/);
  await call("admin", "template_archive", { template: tpl.id, revision: "1" });
  check(!(await call("support", "templates")).some((t) => t.id === tpl.id), "archived templates disappear from reply choices");
  const ticket = (await call("alice", "ticket_create", { category: "bug", subject: "Problem", body: "PLAYER SECRET" })).ticket;
  await call("developer", "ticket_take", { ticket, revision: "0" });
  await call("developer", "ticket_note", { ticket, revision: "1", body: "INTERNAL SECRET" });
  await deny("support", "ticket", { ticket }, /chat_take_ticket/);
  const transfer = { ticket, revision: "2", body: "Needs account administrator" }, transferId = randomUUID();
  await call("developer", "ticket_escalate", transfer, transferId);
  await call("developer", "ticket_escalate", transfer, transferId);
  await deny("developer", "ticket", { ticket }, /chat_take_ticket/);
  await deny("support", "ticket_take", { ticket, revision: "3" });
  check((await call("admin", "tickets", { filter: "escalated" }))[0].id === ticket, "escalations enter the administrator queue and revoke former assignee access");
  await call("admin", "ticket_take", { ticket, revision: "3" });
  check((await call("admin", "ticket", { ticket })).notes.length === 2 && !("notes" in await call("alice", "ticket", { ticket })), "admin receives the assigned thread; player never sees internal notes");
  await call("admin", "ticket_transfer", { ticket, revision: "4", ref: me.developer.ref, body: "Sanitized steps" });
  const task = (await call("developer", "tasks"))[0];
  check(task.description === "Sanitized steps" && !JSON.stringify(task).includes("SECRET"), "technical task does not expose the ticket thread");
  await call("developer", "task_answer", { task: task.id, revision: task.revision, body: "Fixed" });
  await deny("developer", "ticket", { ticket }, /chat_take_ticket/);
  const dm = (await call("alice", "dm_open", { ref: me.bob.ref })).room;
  for (const n of roles.slice(1)) await deny(n, "history", { room: dm });
  // v0.25.0: чат ковена — только участникам (полная проверка ковенов — tools/sql/coven-test.mjs)
  await sql("insert into public.player_quests(user_id,quest_id) values($1,'ch2_coven_ready') on conflict do nothing", [users.alice]);
  const cv = await as("alice", async () => (await sql("select public.coven_request('create',$1::jsonb) j", [JSON.stringify({ name: "Ковен Алисы" })])).rows[0].j);
  check(cv.ok && cv.coven.myRole === "leader", "coven created with its leader");
  const croom = (await call("alice", "bootstrap")).rooms.find((r) => r.kind === "coven");
  check(croom && croom.title === "Ковен Алисы" && !(await call("bob", "bootstrap")).rooms.some((r) => r.kind === "coven"), "coven chat room is visible only to members");
  await deny("bob", "history", { room: croom.id });
  for (const table of ["templates", "notes", "roles", "audit"]) { await assert.rejects(() => as("player", () => sql(`select * from game_chat.${table}`)), /permission denied/); checks++; }
  await assert.rejects(() => as("player", () => sql("select game_chat.staff_player($1,$1)", [users.player])), /permission denied/); checks++;
  await db.exec(readFileSync("supabase/schema.sql", "utf8")); await migrate();
  check(await login("alice") === null && await login("alina") === "alice" && (await call("developer", "player_lookup", { playerId: me.alice.playerId })).inventory.coins === 111, "repeat installs preserve renamed login and inventory");
  // Lost privileged responses must not replay after demotion.
  await sql("update game_chat.roles set roles='{}',revision=revision+1 where user_id=$1", [users.developer]);
  await assert.rejects(() => call("developer", "resources", args, request), /chat_forbidden/); checks++; // same UUID after demotion
  check(true, "protected tables and live role checks prevent client bypasses");
  console.log(`\n${checks} role-policy checks passed`);
} finally { await db.close(); }
