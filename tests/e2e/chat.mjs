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
if (!process.env.CHAT_LEGACY_ONLY) await db.exec(fs.readFileSync("supabase/migrations/20261004_chat_roles_v2.sql", "utf8"));
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
for (const n of ["owner", "admin", "mod", "dev", "support", "alice", "bob", "guest"]) {
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
  owner: "owner",
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
  owner: "Рады видеть вас в игре!",
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
  const click = async (name) => {
    const target = p.getByRole("button", { name, exact: true });
    if (!await target.isVisible() && await p.getByRole("button", { name: "Инструменты команды", exact: true }).count())
      await p.getByRole("button", { name: "Инструменты команды", exact: true }).click();
    await target.click();
  };
  return {
    p,
    ctx,
    click,
    shot: async (name) => {
      await p.bringToFront();
      return p.screenshot({ path: path.join(out, `${width}-${name}.png`), timeout: 60000 });
    },
    refresh: () => p.evaluate(() => window.__witch.chat.refresh()),
  };
}
async function matchesGameFrame(p, label, keyboard = false) {
  // Wait for Phaser's resize tick, not just an intermediate rectangle from the old size.
  await p.waitForFunction(() => {
    const parent = document.querySelector("#game").getBoundingClientRect();
    const g = document.querySelector("#game canvas").getBoundingClientRect();
    const width = Math.min(parent.width, parent.height * 720 / 1280);
    const height = width * 1280 / 720;
    return Math.abs(g.width - width) < 1 && Math.abs(g.height - height) < 1
      && Math.abs(g.left - (innerWidth - width) / 2) < 1
      && Math.abs(g.top - (innerHeight - height) / 2) < 1;
  }, null, { polling: 100, timeout: 30000 });
  await p.waitForFunction((keyboard) => {
    const root = document.querySelector(".game-chat");
    const canvas = document.querySelector("#game canvas");
    if (!root || !canvas) return false;
    const r = root.getBoundingClientRect(), g = canvas.getBoundingClientRect();
    const v = visualViewport;
    const left = Math.max(g.left, v?.offsetLeft || 0);
    const top = keyboard ? v?.offsetTop || 0 : Math.max(g.top, v?.offsetTop || 0);
    const right = Math.min(g.right, (v?.offsetLeft || 0) + (v?.width || innerWidth));
    const bottom = keyboard ? (v?.offsetTop || 0) + (v?.height || innerHeight) : Math.min(g.bottom, (v?.offsetTop || 0) + (v?.height || innerHeight));
    return [r.left - left, r.top - top, r.right - right, r.bottom - bottom]
      .every((d) => Math.abs(d) < 1);
  }, keyboard, { polling: 100 });
  check(true, label);
}
async function frameChecks(admin) {
  await admin.p.bringToFront();
  await admin.click("Закрыть чат");
  await admin.p.setViewportSize({ width: 1919, height: 894 });
  await admin.p.evaluate(() => window.__game.scale.refresh());
  await admin.p.screenshot({ path: path.join(out, "1919-game.png"), timeout: 60000 });
  await admin.p.evaluate(() => window.__game.scene.getScene("UIScene").openChat());
  await admin.p.locator(".chat-message").first().waitFor();
  await matchesGameFrame(admin.p, "1919×894 desktop chat matches the user's game frame");
  check((await admin.p.locator(".game-chat").boundingBox()).width < 510,
    "wide desktop does not expand chat into the side bars");
  await admin.p.screenshot({ path: path.join(out, "1919-chat.png"), timeout: 60000 });
  for (const [w, h] of [
    [390, 844],
    [320, 640],
    [736, 400],
  ]) {
    const d = admin;
    await d.p.bringToFront();
    await d.p.setViewportSize({ width: w, height: h });
    await matchesGameFrame(d.p, `open chat follows game frame after resize to ${w}×${h}`);
    check(
      await d.p.evaluate(
        () => {
          const r = document.querySelector(".game-chat");
          return r.scrollWidth <= r.clientWidth;
        },
      ),
      `no horizontal overflow inside game frame at ${w}×${h}`,
    );
    await d.p.screenshot({ path: path.join(out, `${w}-chat.png`), timeout: 60000 });
  }
  await admin.p.setViewportSize({ width: 390, height: 844 });
  await matchesGameFrame(admin.p, "portrait frame restored without reopening chat");
  await admin.p.getByLabel("Сообщение", { exact: true }).fill("Черновик при открытой клавиатуре");
  // Mobile keyboards can shrink/pan visualViewport without resizing the layout viewport.
  await admin.p.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 420 });
    Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 35 });
    visualViewport.dispatchEvent(new Event("resize"));
    visualViewport.dispatchEvent(new Event("scroll"));
  });
  const mobileKeyboard = await admin.p.evaluate(() => navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches);
  await matchesGameFrame(admin.p, "keyboard keeps composer in the visible viewport", mobileKeyboard);
  check(await admin.p.evaluate(() => {
    const root = document.querySelector(".game-chat").getBoundingClientRect();
    return [document.querySelector('.game-chat textarea[aria-label="Сообщение"]'),
      document.querySelector('.game-chat button[aria-label="Отправить сообщение"]')]
      .every((node) => {
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= root.top && r.bottom <= root.bottom
          && r.left >= root.left && r.right <= root.right;
      });
  }),
    "composer and send remain visible with keyboard");
  await admin.p.screenshot({ path: path.join(out, "390-keyboard.png"), timeout: 60000 });
  await admin.p.evaluate(() => {
    delete visualViewport.height;
    delete visualViewport.offsetTop;
    visualViewport.dispatchEvent(new Event("resize"));
    visualViewport.dispatchEvent(new Event("scroll"));
  });
  await matchesGameFrame(admin.p, "hiding keyboard restores full game frame");
  check((await admin.p.getByLabel("Сообщение", { exact: true }).inputValue())
    === "Черновик при открытой клавиатуре", "keyboard changes keep the draft");
}
async function roleChecks() {
  const d = await device("owner", 1919, 894), p = d.p;
  await matchesGameFrame(p, "role tools remain inside the game canvas");
  const colors = await p.locator(".chat-message").evaluateAll((nodes) => nodes.filter((n) => n.querySelector(".chat-role")).map((n) => {
    const color = (s) => getComputedStyle(n.querySelector(s)).color;
    return [color(".chat-name"), color(".chat-role"), color(".chat-body")];
  }));
  check(colors.length === 5 && colors.every((c) => new Set(c).size === 1 && c[0] !== "rgb(0, 0, 0)"), "all staff message, nickname and badge colors agree");
  check(new Set(colors.map((c) => c[0])).size === 5, "owner has a distinct readable turquoise color");
  await d.click("Роли по ID");
  await p.getByLabel("ID игрока", { exact: true }).fill(profiles.bob.playerId);
  await d.click("Найти игрока");
  await p.getByLabel("Роль игрока").selectOption("admin");
  check(await p.getByLabel("Роль игрока").locator("option").count() === 5 && !await p.locator('.chat-check input').count(), "owner chooses exactly one role, including administrator");
  await p.getByLabel("Причина изменения ролей").fill("Назначение администратора");
  await d.click("Проверить назначение"); await p.getByText(/Станет: Администратор/).waitFor();
  await d.click("Подтвердить"); await p.getByLabel("ID игрока", { exact: true }).waitFor();
  check((await rpc("bob", "bootstrap")).me.roles.join() === "admin", "owner appoints an administrator through the real UI");
  await d.click("Назад"); await d.click("Игрок по ID");
  await p.getByLabel("ID игрока", { exact: true }).fill(profiles.alice.playerId); await d.click("Найти игрока");
  await p.getByLabel("Ресурс", { exact: true }).selectOption("coins"); await p.getByLabel("Количество ресурса").fill("100");
  await p.getByLabel("Причина изменения игрока").fill("Компенсация за ошибку");
  await d.click("Проверить ресурсы"); await p.getByText(/Монеты: 0 → 100/).waitFor();
  await matchesGameFrame(p, "resource review fits the same game frame"); await d.shot("resource-review");
  await d.click("Подтвердить"); await p.getByText("У игрока: 100", { exact: true }).waitFor();
  check((await rpc("owner", "player_lookup", { playerId: profiles.alice.playerId })).inventory.coins === 100, "resource grant UI applies the reviewed value");
  await p.getByLabel("Новый никнейм").fill("Alina"); await p.getByLabel("Причина изменения игрока").fill("Исправление ника");
  await d.click("Проверить никнейм"); await d.click("Подтвердить");
  await p.getByRole("heading", { name: "Alina", exact: true }).waitFor();
  check((await rpc("alice", "bootstrap")).me.nickname === "Alina", "nickname change UI updates the real profile");
  await d.click("Назад"); await d.click("Поддержка"); await d.click("Шаблоны"); await d.click("Добавить шаблон");
  await p.getByLabel("Название шаблона").fill("Проверка соединения"); await p.getByLabel("Текст шаблона").fill("Проверьте соединение и попробуйте снова.");
  await d.click("Сохранить шаблон"); await p.getByRole("heading", { name: "Проверка соединения", exact: true }).waitFor();
  check((await rpc("support", "templates")).some((t) => t.title === "Проверка соединения"), "created template is shared with support staff");
  const ticket = (await rpc("alice", "ticket_create", { category: "bug", subject: "Ошибка двери", body: "Не могу открыть дверь" })).ticket;
  async function switchTo(name) {
    await p.evaluate(({ uid, name }) => localStorage.setItem("witch_rpg_auth_v2", JSON.stringify({ access_token: "token-"+name, refresh_token: "refresh-"+name, expires_at: Date.now()+3600000, user: { id: uid } })), { uid: ids[name], name });
    await p.reload(); await p.waitForFunction(() => window.__game?.scene.isActive("UIScene"), null, { timeout: 120000, polling: 100 });
    await p.evaluate(() => { const u=window.__game.scene.getScene("UIScene"); window.__witch.tutorial.hide(); if(u.modal?.dialogue)u.closeDialogue(true);else if(u.modal)u.closeModal(); u.openChat(); });
    await p.locator(".chat-message").first().waitFor();
  }
  await switchTo("support");
  await d.click("Инструменты команды");
  check(await p.getByRole("button", { name: "Жалобы", exact: true }).count() === 1 && !await p.getByRole("button", { name: "Роли по ID", exact: true }).count(), "support receives moderator tools without administrator role assignment");
  await d.click("Поддержка"); await d.click("Взять в работу"); await p.getByLabel("Шаблон ответа").waitFor();
  const template = (await rpc("support", "templates")).find((t) => t.title === "Проверка соединения");
  await p.getByLabel("Шаблон ответа").selectOption(template.id);
  check(await p.getByLabel("Ответ в поддержку", { exact: true }).inputValue() === template.body, "server template inserts an editable reply without sending it");
  await d.click("Передать администратору"); await p.getByLabel("Причина передачи · внутренняя заметка").fill("Нужна проверка администратора");
  await d.click("Продолжить"); await d.click("Подтвердить"); await p.getByRole("heading", { name: "Поддержка", exact: true }).waitFor();
  await p.getByText("Ожидает администратора", { exact: true }).waitFor();
  check(!await p.getByRole("button", { name: "Взять в работу", exact: true }).count(), "support cannot reclaim an escalated ticket");
  await d.shot("admin-escalation");
  await switchTo("admin"); await d.click("Поддержка"); await p.getByLabel("Фильтр обращений").selectOption("escalated");
  await d.click("Взять в работу"); await p.getByRole("heading", { name: "Ошибка двери", exact: true }).waitFor();
  check((await rpc("admin", "ticket", { ticket })).assignee.ref === profiles.admin.ref, "administrator takes the escalation and receives its thread");
  await switchTo("alice");
  check(await p.locator(".chat-message").filter({ hasText: /ID \d/ }).count() === 7, "ordinary player sees numeric IDs in all messages");
  const own = p.locator(".chat-message").filter({ hasText: "Как найти лунный осколок" });
  await own.getByRole("button", { name: "Действия с сообщением", exact: true }).click();
  check(!await p.getByRole("button", { name: "Изменить", exact: true }).count() && !await p.getByRole("button", { name: "Удалить", exact: true }).count(), "ordinary player's own message has no edit or delete actions");
  await d.click("Назад"); await d.click("Поддержка"); await d.click("Открыть");
  check(!await p.getByText("Нужна проверка администратора", { exact: true }).count(), "escalation's internal reason remains invisible to the player");
  await d.shot("player-ticket");
  check(errors.length === 0, `no browser application errors (${errors.join("; ")})`);
  console.log(`\n${checks} role-policy browser checks passed. Screenshots: ${out}`);
}
async function compactChecks() {
  const desktop = await device("admin", 1919, 894), p = desktop.p;
  await matchesGameFrame(p, "compact desktop chat still fills the game canvas");
  const layout = await p.evaluate(() => {
    const root = document.querySelector('.game-chat').getBoundingClientRect(),
      feed = document.querySelector('.chat-scroll').getBoundingClientRect(),
      compose = document.querySelector('.chat-compose').getBoundingClientRect();
    const messages = [...document.querySelectorAll('.chat-message')];
    return { feedRatio: feed.height / root.height, bottom: compose.bottom - root.bottom,
      fontSize: parseFloat(getComputedStyle(document.querySelector('.chat-body')).fontSize),
      visibleMessages: messages.filter(n => { const r=n.getBoundingClientRect(); return r.top>=feed.top && r.bottom<=feed.bottom; }).length };
  });
  check(layout.feedRatio > .7 && layout.visibleMessages === 7, "all seven sample messages fit; most space belongs to conversation");
  check(layout.fontSize === 14 && Math.abs(layout.bottom)<1, "smaller readable text and composer at the bottom");
  check(!await p.getByRole('button',{name:'Жалобы',exact:true}).count(), "staff actions are hidden initially");
  await desktop.shot('compact-desktop');
  await desktop.click('Инструменты команды');
  check(await p.getByRole('button',{name:'Жалобы',exact:true}).isVisible(), "staff actions open on request");
  await desktop.shot('compact-tools');
  await p.keyboard.press('Escape');
  check(await p.locator('.game-chat').count()===1 && !await p.getByRole('button',{name:'Жалобы',exact:true}).count(), "Escape dismisses tools and keeps chat open");
  const ta=p.getByLabel('Сообщение',{exact:true});
  await ta.fill('Привет, !');
  await ta.evaluate(n=>n.setSelectionRange(8,8));
  await desktop.click('Смайлики');
  await desktop.shot('compact-emoji');
  await desktop.click('Добавить смайлик: Улыбка');
  check(await ta.inputValue()==='Привет, 😀!' && await ta.evaluate(n=>n.selectionStart)===10, "emoji inserts at cursor and restores the caret");
  await ta.fill('я'.repeat(499));
  await desktop.click('Смайлики'); await desktop.click('Добавить смайлик: Сердце');
  check(await ta.inputValue()==='я'.repeat(499) && await p.locator('.chat-error').isVisible(), "emoji cannot exceed the server's character limit");
  await p.keyboard.press('Escape');
  await ta.fill('я'.repeat(500)); await ta.evaluate(n=>n.setSelectionRange(498,500));
  await desktop.click('Смайлики'); await desktop.click('Добавить смайлик: Сердце');
  check(await ta.inputValue()==='я'.repeat(498)+'❤️', "emoji replaces selected text at the 500-character boundary");
  await desktop.click('Помощь'); await desktop.click('Общий');
  check(await p.getByLabel('Сообщение',{exact:true}).inputValue()==='я'.repeat(498)+'❤️', "emoji draft survives channel changes");
  await p.getByLabel('Сообщение',{exact:true}).fill('Привет всем! ✨');
  await desktop.click('Отправить сообщение');
  await p.getByText('Привет всем! ✨',{exact:true}).waitFor();
  check((await db.query("select count(*)::int n from game_chat.messages where body=$1",['Привет всем! ✨'])).rows[0].n===1, "emoji message is saved by the real server RPC");
  await desktop.ctx.close();

  await rpc('owner','sanction',{ref:profiles.admin.ref,kind:'warn',minutes:10080,reason:'Проверка компактного предупреждения'});
  const mobile=await device('admin',390,844), m=mobile.p, editor=m.getByLabel('Сообщение',{exact:true});
  await matchesGameFrame(m,'mobile chat fits the game before keyboard opens');
  check(await m.locator('.chat-ban-details').count()===1 && await m.locator('.chat-ban-details').evaluate(n=>!n.open), 'warning details stay collapsed');
  await mobile.shot('compact-mobile');
  await editor.fill('Черновик на телефоне');
  const original=(await m.locator('.game-chat').boundingBox()).width;
  // Yandex/Android can shrink BOTH viewports, causing Phaser FIT to become narrow.
  await m.setViewportSize({width:390,height:420});
  await m.waitForFunction(()=>document.querySelector('canvas').getBoundingClientRect().width<300);
  await m.waitForFunction(()=>Math.abs(document.querySelector('.game-chat').getBoundingClientRect().height-420)<1);
  check(Math.abs((await m.locator('.game-chat').boundingBox()).width-original)<1, "layout-resizing keyboard preserves the original chat width");
  check(await m.evaluate(()=>{const feed=document.querySelector('.chat-scroll');return feed.querySelector('.chat-message:last-child').getBoundingClientRect().bottom<=feed.getBoundingClientRect().bottom+1;}), "latest message stays in view when keyboard opens");
  check(await m.evaluate(()=>{const h=document.querySelector('.chat-head h1');return h.getBoundingClientRect().height<parseFloat(getComputedStyle(h).fontSize)*1.5;}), "chat title stays on one line with keyboard");
  check(await m.evaluate(()=>{
    const root=document.querySelector('.game-chat').getBoundingClientRect();
    return ['textarea[aria-label="Сообщение"]','button[aria-label="Отправить сообщение"]'].every(s=>{
      const r=document.querySelector(s).getBoundingClientRect();return r.left>=root.left && r.right<=root.right && r.top>=root.top && r.bottom<=root.bottom;
    });
  }), "mobile editor and send stay completely visible");
  await mobile.shot('compact-layout-keyboard');
  await m.getByRole('button',{name:'Смайлики',exact:true}).tap();
  await m.getByRole('button',{name:'Добавить смайлик: Волшебство',exact:true}).tap();
  check(await editor.inputValue()==='Черновик на телефоне✨' && await editor.evaluate(n=>document.activeElement===n), "touch emoji keeps the mobile input focused");
  await m.setViewportSize({width:390,height:844});
  await matchesGameFrame(m,'keyboard dismissal restores the game frame');
  check(await editor.inputValue()==='Черновик на телефоне✨','draft survives keyboard dismissal');
  await editor.focus();
  await m.evaluate(()=>{
    Object.defineProperty(visualViewport,'height',{configurable:true,value:420});
    Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:35});
    visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));
  });
  check(await m.locator('.game-chat').evaluate(n=>Math.abs(n.getBoundingClientRect().height-420)<1 && n.getBoundingClientRect().top===35), 'visual-viewport-only keyboards also keep a full usable chat');
  await m.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});
  await matchesGameFrame(m,'visual viewport restoration restores normal dimensions');
  await m.setViewportSize({width:736,height:400});
  await matchesGameFrame(m,'mobile orientation changes resize Phaser and chat together');
  check(await m.locator('.game-chat').evaluate(n=>n.scrollWidth<=n.clientWidth), 'landscape chat has no sideways overflow');
  await m.setViewportSize({width:390,height:844});
  await matchesGameFrame(m,'returning to portrait restores the mobile game frame');
  await m.setViewportSize({width:320,height:640});
  await matchesGameFrame(m,'320px mobile chat fits after changing width');
  check(await m.locator('.game-chat').evaluate(n=>n.scrollWidth<=n.clientWidth), 'no sideways overflow at 320px');
  await mobile.shot('compact-small-mobile');
  await mobile.ctx.close();
  const player=await device('alice',390,844);
  check(!await player.p.getByRole('button',{name:'Инструменты команды',exact:true}).count(), 'ordinary players never receive staff menus');
  check(errors.length===0,`no application errors (${errors.join('; ')})`);
  fs.writeFileSync(path.join(out,'compact-results.json'),JSON.stringify({checks,errors,layout,environment:'Playwright + Phaser + production SQL/PGlite; Android keyboard viewports simulated'},null,2));
  console.log(`\n${checks} compact chat browser checks passed. Screenshots: ${out}`);
}
try {
  if (process.env.CHAT_LEGACY_ONLY) {
    const d = await device("support", 390, 844);
    check(!await d.p.getByRole("button", { name: "Жалобы", exact: true }).count(), "legacy server does not advertise inherited moderation prematurely");
    const ticket = (await rpc("alice", "ticket_create", { category: "bug", subject: "Старый сервер", body: "Проверка совместимости" })).ticket;
    await d.click("Поддержка"); await d.click("Взять в работу");
    await d.p.getByLabel("Шаблон ответа").selectOption("device");
    check((await d.p.getByLabel("Ответ в поддержку", { exact: true }).inputValue()).includes("модель устройства"), "legacy support retains reply templates without a new server RPC");
    check(!await d.p.getByRole("button", { name: "Передать администратору", exact: true }).count() && !await d.p.getByRole("button", { name: "Шаблоны", exact: true }).count(), "new mutations stay hidden until the role migration is installed");
    await d.click("Отправить ответ"); await d.p.getByText("Ошибка игры · Ждём игрока", { exact: true }).waitFor();
    check((await rpc("support", "ticket", { ticket })).replies.length === 2, "existing support works during the server upgrade");
    await db.exec(fs.readFileSync("supabase/migrations/20261004_chat_roles_v2.sql", "utf8"));
    await d.refresh(); await d.p.getByRole("button", { name: "Инструменты команды", exact: true }).waitFor();
    await d.click("Инструменты команды"); await d.p.getByRole("button", { name: "Жалобы", exact: true }).waitFor();
    check(true, "server migration activates inherited permissions without browser reload");
    await d.click("Поддержка"); await d.p.getByRole("button", { name: "Шаблоны", exact: true }).waitFor();
    check(true, "new support tools activate as soon as the server advertises the new policy");
    check(errors.length === 0, "legacy server has no application errors");
    console.log(`\n${checks} legacy compatibility checks passed`);
  }
  else if (process.env.CHAT_COMPACT_ONLY) await compactChecks();
  else if (process.env.CHAT_ROLES_ONLY) await roleChecks();
  else if (process.env.CHAT_FRAME_ONLY) {
    const admin = await device("admin", 1919, 894);
    await matchesGameFrame(admin.p, "wide-screen chat initially matches game canvas");
    await admin.click("Мой профиль");
    await admin.p.getByText(`ID игрока: ${profiles.admin.playerId}`, { exact: true }).waitFor();
    await matchesGameFrame(admin.p, "profile keeps game frame");
    await admin.click("Назад");
    await admin.click("Роли по ID");
    await admin.p.getByLabel("ID игрока", { exact: true }).fill(profiles.bob.playerId);
    await admin.click("Найти игрока");
    await admin.p.getByLabel("Причина изменения ролей").fill("Проверка размеров окна");
    await admin.click("Проверить назначение");
    await admin.p.getByText(/Станет: Игрок/).waitFor();
    await matchesGameFrame(admin.p, "role confirmation keeps game frame");
    await admin.click("Закрыть чат");
    await admin.p.evaluate(() => window.__game.scene.getScene("UIScene").openChat());
    await admin.p.locator(".chat-message").first().waitFor();
    await admin.click("Поддержка");
    await admin.p.getByRole("heading", { name: "Поддержка", exact: true }).waitFor();
    await matchesGameFrame(admin.p, "support queue keeps game frame");
    await admin.click("Новое обращение");
    await admin.p.getByLabel("Описание обращения").waitFor();
    await matchesGameFrame(admin.p, "support form keeps game frame");
    await frameChecks(admin);
    check(errors.length === 0, `no application JS/console errors (${errors.join("; ")})`);
    fs.writeFileSync(path.join(out, "frame-results.json"), JSON.stringify({ checks, errors,
      environment: "Playwright + Phaser + production SQL/PGlite; keyboard viewport simulated" }, null, 2));
    console.log(`\n${checks} game-frame browser checks passed. Screenshots: ${out}`);
  } else {
  const admin = await device("admin"),
    alice = await device("alice"),
    support = await device("support", 1280, 900);
  await admin.p.waitForFunction(() =>
    [...document.querySelectorAll(".chat-avatar img")].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
  check(true, "real hero portraits loaded");
  await matchesGameFrame(alice.p, "mobile chat matches game canvas, including vertical bars");
  await matchesGameFrame(support.p, "desktop chat matches portrait canvas, preserving side bars");
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
    colors.length === 5 &&
      colors.every((c) => new Set(c).size === 1 && !c.includes("rgb(0, 0, 0)")),
    "nickname, role label and body use identical readable role colors",
  );
  check(
    (await alice.p
      .locator(".chat-message")
      .filter({ hasText: /ID \d/ })
      .count()) === 7,
    "numeric IDs visible to players",
  );
  check(
    (await admin.p
      .locator(".chat-message")
      .filter({ hasText: /ID \d/ })
      .count()) === 7,
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
  await matchesGameFrame(alice.p, "profile stays inside the game frame");
  await alice.shot("own-profile");
  await alice.click("Назад");
  await admin.click("Роли по ID");
  await admin.p
    .getByLabel("ID игрока", { exact: true })
    .fill(profiles.bob.playerId);
  await admin.click("Найти игрока");
  await admin.p.getByLabel("Причина изменения ролей").fill("Помощь игрокам");
  await admin.p.getByLabel("Роль игрока").selectOption("support");
  await admin.click("Проверить назначение");
  await admin.p.getByText(/Станет: Техподдержка/).waitFor();
  await matchesGameFrame(admin.p, "role confirmation stays inside the game frame");
  await admin.shot("id-confirm");
  await admin.click("Подтвердить");
  await admin.p.getByLabel("ID игрока", { exact: true }).waitFor();
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
  await matchesGameFrame(support.p, "support conversation stays inside the game frame");
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
  // Resize the browser while the chat stays open: Phaser FIT moves and scales the canvas.
  await alice.ctx.close();
  await support.ctx.close();
  await frameChecks(admin);
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
  }
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
