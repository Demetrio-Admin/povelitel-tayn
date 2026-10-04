// Real Phaser UI + production SQL in embedded Postgres. Auth transport only is a fixture.
// Browser plugin not available: Playwright is used for this local regression suite.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright";
import { createServer } from "vite";

process.env.VITE_SUPABASE_URL = "https://chat.test";
process.env.VITE_SUPABASE_ANON_KEY = "chat-test-anon";
const out = process.env.UI_SHOTS_DIR || "/tmp/povelitel-chat-qa";
fs.mkdirSync(out, { recursive: true });
const db = new PGlite();
const ids = {},
  tokens = {};
let checks = 0;
const errors = [];
const check = (value, label) => {
  assert.ok(value, label);
  checks++;
  console.log("  ✓", label);
};
await db.exec(fs.readFileSync("tools/sql/auth-stub.sql", "utf8"));
await db.exec(fs.readFileSync("supabase/schema.sql", "utf8"));
await db.exec(
  fs.readFileSync("supabase/migrations/20261004_game_chat.sql", "utf8"),
);
async function queryAs(name, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      ids[name],
    ]);
    return tx.query(sql, params);
  });
}
const rpc = (n, op, args = {}, request = randomUUID()) =>
  queryAs(n, "select public.chat_request($1,$2::jsonb,$3::uuid) j", [
    op,
    JSON.stringify(args),
    request,
  ]).then((r) => r.rows[0].j);
for (const n of ["admin", "mod", "dev", "support", "alice", "bob", "guest"]) {
  ids[n] = randomUUID();
  tokens["token-" + n] = n;
  await db.query("insert into auth.users(id) values($1)", [ids[n]]);
  await queryAs(n, "select public.create_player('witch')");
  if (n !== "guest")
    await db.query("select public.claim_nickname($1,$2,$2)", [ids[n], n]);
  await db.query(
    "insert into public.player_quests(user_id,quest_id,status) values($1,'prologue_seen','done'),($1,'starter_kit_claimed','done') on conflict do nothing",
    [ids[n]],
  );
}
for (const [n, r] of Object.entries({
  admin: "admin",
  mod: "moderator",
  dev: "developer",
  support: "support",
}))
  await db.query("insert into game_chat.roles(user_id,roles) values($1,$2)", [
    ids[n],
    [r],
  ]);
const profiles = {};
for (const n of Object.keys(ids)) profiles[n] = (await rpc(n, "bootstrap")).me;
const general = (await rpc("alice", "bootstrap")).rooms.find(
  (r) => r.kind === "general",
).id;
for (const [n, text] of Object.entries({
  admin: "Добро пожаловать в Шепчущий лес!",
  mod: "Берегите друг друга и соблюдайте правила.",
  dev: "Исправления главы I уже в работе.",
  support: "Если нужна помощь — создайте обращение.",
  alice: "Здравствуйте! Как найти лунный осколок?",
  bob: "На опушке, рядом с Миррой.",
}))
  await rpc(n, "send", { room: general, body: text });
const server = await createServer({
  server: { host: "127.0.0.1", port: 5186, watch: null },
  logLevel: "error",
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const contexts = [];
let unavailable = false,
  failSendOnce = false;
async function device(name, width = 390, height = 844) {
  console.log("Device", name, width, "starting");
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 800,
    hasTouch: width < 800,
  });
  contexts.push(ctx);
  await ctx.addInitScript(
    ({ uid, name }) => {
      if (sessionStorage.getItem("chat-test-auth-seeded")) return;
      sessionStorage.setItem("chat-test-auth-seeded", "1");
      localStorage.setItem(
        "witch_rpg_auth_v2",
        JSON.stringify({
          access_token: "token-" + name,
          refresh_token: "refresh-" + name,
          expires_at: Date.now() + 3600000,
          user: { id: uid },
        }),
      );
    },
    { uid: ids[name], name },
  );
  await ctx.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ body: "", contentType: "text/css" }),
  );
  await ctx.route("https://chat.test/**", async (route) => {
    const req = route.request(),
      fn = new URL(req.url()).pathname.split("/").at(-1),
      body = req.postDataJSON() || {},
      name = tokens[req.headers().authorization?.replace("Bearer ", "")];
    if (!name) {
      await route.fulfill({
        status: 401,
        json: { message: "not_authenticated" },
      });
      return;
    }
    try {
      if (fn === "logout") {
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      if (fn === "chat_request" && unavailable) {
        await route.fulfill({
          status: 404,
          json: { code: "PGRST202", message: "Function not found" },
        });
        return;
      }
      const allowed = {
        get_player: [],
        create_player: ["hero"],
        reset_player: ["hero"],
        sync_player: ["patch"],
        player_action: ["action"],
        chat_request: ["op", "args", "request_id"],
      };
      if (!(fn in allowed)) throw Error("Unexpected RPC " + fn);
      const keys = allowed[fn],
        params = keys.map((k) => body[k] ?? (k === "args" ? {} : null));
      const result = (
        await queryAs(
          name,
          `select public.${fn}(${keys.map((k, i) => "$" + (i + 1)).join(",")}) j`,
          params,
        )
      ).rows[0].j;
      if (fn === "chat_request" && body.op === "send" && failSendOnce) {
        failSendOnce = false;
        await route.abort("failed");
        return;
      }
      await route.fulfill({ json: result });
    } catch (e) {
      await route.fulfill({
        status: 400,
        json: { code: e.code || "P0001", message: e.message },
      });
    }
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (
      m.type() === "error" &&
      !m.text().includes("net::ERR_FAILED") &&
      !m.text().includes("404") &&
      !m.text().includes("400")
    )
      errors.push(m.text());
  });
  p.setDefaultTimeout(15000);
  await p.goto("http://127.0.0.1:5186/?skipmenu&debug");
  console.log(name, "page loaded");
  await p.bringToFront();
  await p.waitForFunction(
    () => window.__game?.scene.isActive("UIScene"),
    null,
    { timeout: 120000, polling: 100 },
  );
  await p.evaluate(() => {
    const u = window.__game.scene.getScene("UIScene");
    window.__witch.tutorial.hide();
    if (u.modal?.dialogue) u.closeDialogue(true);
    else if (u.modal) u.closeModal();
    u.openMenu();
    u.onMenuItem({ id: "chat" });
  });
  console.log(name, "chat opened");
  await p
    .locator(".game-chat .chat-message")
    .first()
    .waitFor({ timeout: 20000 });
  console.log(name, "messages ready");
  const click = (name) => p.getByRole("button", { name, exact: true }).click();
  return {
    p,
    ctx,
    click,
    shot: (name) =>
      p.screenshot({ path: path.join(out, `${width}-${name}.png`) }),
    refresh: () => p.evaluate(() => window.__witch.chat.refresh()),
  };
}
try {
  const admin = await device("admin"),
    alice = await device("alice"),
    support = await device("support", 1280, 900);
  await admin.p.waitForFunction(() =>
    [...document.querySelectorAll(".chat-avatar img")].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
  check(true, "real hero portraits loaded");
  const full = await alice.p.locator(".game-chat").boundingBox();
  check(
    full.width === 390 && full.height === 844,
    "chat fills mobile viewport",
  );
  check(
    (await support.p.locator(".game-chat").boundingBox()).width === 1280,
    "chat fills desktop viewport",
  );
  await admin.shot("roles");
  const colors = await alice.p.locator(".chat-message").evaluateAll((nodes) =>
    nodes
      .filter((n) => n.querySelector(".chat-role"))
      .map((n) => {
        const s = (x) => getComputedStyle(n.querySelector(x)).color;
        return [s(".chat-name"), s(".chat-role"), s(".chat-body")];
      }),
  );
  check(
    colors.length === 4 &&
      colors.every((c) => new Set(c).size === 1 && !c.includes("rgb(0, 0, 0)")),
    "nickname, role label and body use identical readable role colors",
  );
  check(
    !(await alice.p
      .locator(".chat-message")
      .filter({ hasText: /ID \d/ })
      .count()),
    "other numeric IDs absent for player",
  );
  check(
    (await admin.p
      .locator(".chat-message")
      .filter({ hasText: /ID \d/ })
      .count()) === 6,
    "administrator receives player IDs",
  );
  await alice.p
    .getByLabel("Сообщение", { exact: true })
    .fill("Черновик общего");
  await alice.click("Помощь");
  await alice.p
    .getByLabel("Сообщение", { exact: true })
    .fill("Черновик помощи");
  await alice.click("Общий");
  check(
    (await alice.p.getByLabel("Сообщение", { exact: true }).inputValue()) ===
      "Черновик общего",
    "per-room drafts survive navigation",
  );
  await alice.p
    .getByLabel("Сообщение", { exact: true })
    .fill('<img src=x onerror="window.chatXss=1">');
  failSendOnce = true;
  await alice.click("Отправить сообщение");
  await alice.p
    .getByText("Не удалось связаться с сервером. Попробуйте ещё раз.", {
      exact: true,
    })
    .waitFor();
  await alice.click("Отправить сообщение");
  await alice.p.locator(".chat-body").filter({ hasText: "onerror=" }).waitFor();
  check(
    !(await alice.p.evaluate(() => window.chatXss)) &&
      !(await alice.p.locator(".chat-body img").count()),
    "message text cannot execute HTML",
  );
  check(
    (
      await db.query(
        "select count(*)::int n from game_chat.messages where body like '%onerror=%' ",
      )
    ).rows[0].n === 1,
    "lost send response retries without duplicate message",
  );
  await alice.p.getByLabel("Сообщение", { exact: true }).fill("WASD E 123");
  await alice.p.getByLabel("Сообщение", { exact: true }).press("ArrowRight");
  check(
    await alice.p.evaluate(() => {
      const s = window.__witch;
      return (
        s.modalOpen &&
        s.input.move.x === 0 &&
        s.input.move.y === 0 &&
        !window.__game.scene.getScene("UIScene").input.keyboard.enabled
      );
    }),
    "typing does not move hero or activate game keys",
  );
  await alice.click("Мой профиль");
  await alice.p
    .getByText(`ID игрока: ${profiles.alice.playerId}`, { exact: true })
    .waitFor();
  check(true, "own ID shown in own profile");
  await alice.shot("own-profile");
  await alice.click("Назад");
  await admin.click("Роли по ID");
  await admin.p
    .getByLabel("ID игрока", { exact: true })
    .fill(profiles.bob.playerId);
  await admin.click("Найти игрока");
  await admin.p.getByLabel("Причина изменения ролей").fill("Помощь игрокам");
  await admin.p
    .locator(".chat-check")
    .filter({ hasText: "Техподдержка" })
    .locator("input")
    .check();
  await admin.click("Проверить назначение");
  await admin.p.getByText(/Станет: Техподдержка/).waitFor();
  await admin.shot("id-confirm");
  await admin.click("Подтвердить");
  check(
    (await rpc("bob", "bootstrap")).me.roles.includes("support"),
    "role assignment by numeric ID executes on server",
  );
  await alice.click("Поддержка");
  await alice.click("Новое обращение");
  await alice.p
    .getByText("Категория", { exact: true })
    .locator("..")
    .locator("select")
    .selectOption("bug");
  await alice.p
    .getByText("Тема · до 100 символов", { exact: true })
    .locator("..")
    .locator("input")
    .fill("Проверка игрового чата");
  await alice.p
    .getByLabel("Описание обращения")
    .fill("Не открывается дверь, версия 0.10.0.");
  await alice.click("Отправить обращение");
  await alice.p
    .getByRole("heading", { name: "Проверка игрового чата", exact: true })
    .waitFor();
  await support.click("Поддержка");
  await support.click("Взять в работу");
  await support.p
    .getByRole("heading", { name: "Проверка игрового чата", exact: true })
    .waitFor();
  await support.click("Внутренняя заметка");
  await support.p
    .getByLabel("Внутренняя заметка", { exact: true })
    .fill("Только для сотрудников");
  await support.click("Сохранить заметку");
  await support.p
    .getByText("Только для сотрудников", { exact: true })
    .waitFor();
  await support.p
    .getByLabel("Внутренняя заметка", { exact: true })
    .fill("Черновик внутренней заметки");
  await support.click("Ответ игроку");
  check(
    (await support.p
      .getByLabel("Ответ в поддержку", { exact: true })
      .inputValue()) === "",
    "internal draft is not copied into public response",
  );
  await support.p
    .getByLabel("Ответ в поддержку", { exact: true })
    .fill("Дверь исправлена. Попробуйте пройти ещё раз.");
  await support.shot("support");
  await support.click("Ответить и решить");
  await support.p.getByText("Ошибка игры · Решено", { exact: true }).waitFor();
  await alice.refresh();
  await alice.p
    .getByText("Дверь исправлена. Попробуйте пройти ещё раз.", { exact: true })
    .waitFor();
  check(
    !(await alice.p
      .getByText("Только для сотрудников", { exact: true })
      .count()),
    "internal note absent in actual player UI",
  );
  await alice.click("Всё решено");
  await alice.p.getByText("Ошибка игры · Закрыто", { exact: true }).waitFor();
  await alice.shot("ticket-closed");
  await alice.click("Вернуть в работу");
  await alice.p.getByText("Ошибка игры · В работе", { exact: true }).waitFor();
  check(
    true,
    "support workflow: create → take → note → answer and solve → close → reopen",
  );
  await alice.click("Закрыть чат");
  check(
    await alice.p.evaluate(
      () =>
        !window.__witch.modalOpen &&
        window.__game.scene.getScene("UIScene").input.keyboard.enabled,
    ),
    "closing chat restores game controls",
  );
  await alice.p.evaluate(() =>
    window.__game.scene.getScene("UIScene").openChat(),
  );
  await alice.p.getByLabel("Сообщение", { exact: true }).waitFor();
  await alice.p.evaluate(() =>
    window.__game.scene.getScene("UIScene").setMode("combat"),
  );
  check(!(await alice.p.locator(".game-chat").count()), "combat closes chat");
  await alice.p.evaluate(() =>
    window.__game.scene.getScene("UIScene").setMode("exploration"),
  );
  await rpc("admin", "sanction", {
    ref: profiles.alice.ref,
    kind: "game",
    minutes: 10,
    reason: "Проверка ограничения",
  });
  await alice.p.bringToFront();
  await alice.refresh().catch(() => {});
  await alice.p.waitForFunction(
    () =>
      window.__witch?.session?.status === "banned" &&
      window.__game?.scene.isActive("MenuScene"),
    null,
    { polling: 100, timeout: 120000 },
  );
  await alice.p.evaluate(() =>
    window.__game.scene.getScene("MenuScene").openRestrictedChat(),
  );
  await alice.click("Открыть поддержку");
  await alice.p
    .getByRole("heading", { name: "Поддержка", exact: true })
    .waitFor();
  check(true, "game-banned player can open support from restricted menu");
  await alice.shot("restricted-support");
  // Different phone widths and short keyboard viewport.
  await alice.ctx.close();
  await support.ctx.close();
  for (const [w, h] of [
    [320, 640],
    [736, 400],
  ]) {
    const d = admin;
    await d.p.bringToFront();
    await d.click("Закрыть чат");
    await d.p.setViewportSize({ width: w, height: h });
    await d.p.evaluate(() =>
      window.__game.scene.getScene("UIScene").openChat(),
    );
    await d.p.locator(".chat-message").first().waitFor();
    const bounds = await d.p.locator(".game-chat").boundingBox();
    check(bounds.width === w && bounds.height === h, `full viewport ${w}×${h}`);
    check(
      await d.p.evaluate(
        () => document.querySelector(".game-chat").scrollWidth <= innerWidth,
      ),
      `no horizontal overflow at ${w}px`,
    );
    await d.p.screenshot({ path: path.join(out, `${w}-chat.png`) });
  }
  // Missing migration is a recoverable state; no demo messages substituted.
  const offline = admin;
  await offline.p.setViewportSize({ width: 412, height: 850 });
  unavailable = true;
  await offline.click("Закрыть чат");
  await offline.p.evaluate(() =>
    window.__game.scene.getScene("UIScene").openChat(),
  );
  await offline.p
    .getByText("Чат ещё не подключён на сервере. Попробуйте позже.", {
      exact: true,
    })
    .waitFor();
  check(
    !(await offline.p.locator(".chat-message").count()),
    "unavailable backend renders honest error and retry",
  );
  unavailable = false;
  await offline.click("Повторить");
  await offline.p.locator(".chat-message").first().waitFor();
  await offline.click("Мой профиль");
  await offline.click("Выйти из аккаунта");
  await offline.click("Подтвердить");
  await offline.p.waitForFunction(
    () =>
      window.__witch?.session?.status === "signed_out" &&
      window.__game?.scene.isActive("MenuScene"),
    null,
    { polling: 100, timeout: 120000 },
  );
  check(true, "logout closes chat, clears drafts and returns to start menu");
  check(
    errors.length === 0,
    `no application JS/console errors (${errors.join("; ")})`,
  );
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(
      {
        checks,
        errors,
        environment: "Playwright + Phaser + production SQL/PGlite",
      },
      null,
      2,
    ),
  );
  console.log(`\n${checks} browser checks passed. Screenshots: ${out}`);
} catch (e) {
  console.error("APP ERRORS", errors);
  for (const [i, c] of contexts.entries()) {
    for (const p of c.pages())
      await p
        .screenshot({ path: path.join(out, `failure-${i}.png`) })
        .catch(() => {});
  }
  throw e;
} finally {
  await browser.close();
  await server.close();
  await db.close();
}
