// v0.9.2: ведьма и колдун в настоящей игре (Chromium + touch) против сервера Supabase по HTTP —
// новый гость, регистрация, вход из предпросмотра другого героя (в обе стороны), повторный вход, портрет HUD и профиль.
// Сервер: tests/helpers/fake-http.mjs (BACKEND=pg — настоящие SQL-функции на Postgres; по умолчанию — JS-зеркало).
// Игра собирается с VITE_SUPABASE_URL=http://127.0.0.1:8174 и VITE_SUPABASE_ANON_KEY=anon-key.
// Запуск: UI_BASE_URL=http://…/ [BACKEND=pg] [UI_SHOTS_DIR=…] node tests/e2e/hero-online.mjs
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { startFakeHttp } from '../helpers/fake-http.mjs';
import { SupabaseApi } from '../../src/cloud/api.js';
import { PlayerSession, TOKENS_KEY } from '../../src/cloud/PlayerSession.js';
import { GameState } from '../../src/state/GameState.js';
import { CLOUD } from '../../src/config/cloud.config.js';

const BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:5173/';
const OUT = process.env.UI_SHOTS_DIR || '/tmp/witch-rpg-hero-online';
fs.mkdirSync(OUT, { recursive: true });
const { srv, close } = await startFakeHttp({ backend: process.env.BACKEND || 'model', port: +(process.env.SERVER_PORT || 8174), delayMs: 120 });

// Этот набор проверяет персонажа; полный чат проверяется в tests/e2e/chat.mjs.
// FakeSupabase для персонажа не реализует chat_request, хотя клиент теперь запрашивает значок непрочитанного.
const characterRoute = srv.route;
srv.route = async function(method, url, headers, body) {
  if (url.pathname === '/rest/v1/rpc/chat_request' && body?.op === 'bootstrap') {
    const user = this.userByAccess(headers);
    if (!user) return this.reply(401, { code: '28000', message: 'not_authenticated' });
    return this.reply(200, {
      me: { ref: user.id, roles: ['player'], policyVersion: 2, revision: 0, staffRevision: 0 },
      rooms: [], sanctions: [], mentions: 0, supportUnread: 0,
    });
  }
  return characterRoute.call(this, method, url, headers, body);
};

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const SUF = Math.random().toString(36).slice(2, 6).replace(/[0-9]/g, (d) => 'abcdefghij'[d]);
const PASS = 'Лунный-пароль-1';

/** Аккаунт, созданный «на другом устройстве» (в этом процессе, через тот же сервер). */
async function account(hero, nickname) {
  const mem = new Map();
  const st = new GameState(null);
  const api = new SupabaseApi({ url: srv.url, anonKey: srv.anonKey, loginDomain: CLOUD.loginDomain, fetchFn: srv.fetch });
  const s = new PlayerSession({ api, state: st, storage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) }, setTimer: () => 0, clearTimer: () => {} });
  await s.registerNew({ hero, nickname, password: PASS, password2: PASS });
  st.addItem('coins', hero === 'witch' ? 17 : 23); st.markEvent('prologue_seen'); st.save(); await s.flush();
  return { nickname, coins: st.item('coins'), uid: s.userId, auth: mem.get(TOKENS_KEY) };
}

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];

async function device(name, { width = 390, height = 844 } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location().url;
    // Ожидаемый отказ серверного доступа проверяется сценарием блокировки ниже.
    if (name === 'restricted' && url.endsWith('/rest/v1/rpc/get_player') && m.text().includes('403')) return;
    errs.push(`${name}: ${m.text()} (${url})`);
  });
  const ev = (f, a) => p.evaluate(f, a);
  const tap = async (x, y) => {
    const s = await ev(({ x, y }) => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x + x * r.width / 720, y: r.y + y * r.height / 1280 }; }, { x, y });
    await p.touchscreen.tap(s.x, s.y); await p.waitForTimeout(250);
  };
  const shot = (n) => p.screenshot({ path: path.join(OUT, `${width}x${height}-online-${n}.png`) });
  const menu = async () => {
    await p.waitForFunction(() => { const g = window.__game; const m = g?.scene.getScene('MenuScene'); return g?.scene.isActive('MenuScene') && m.picker && !m.cameras.main.fadeEffect.isRunning; }, null, { timeout: 120000 });
    await p.waitForTimeout(300);
  };
  const inGame = () => p.waitForFunction(() => window.__game?.scene.isActive('ExplorationScene') && window.__game.scene.isActive('UIScene') && window.__witch.session?.status === 'ready', null, { timeout: 120000 });
  const pickToggle = async (id) => { const t = await ev((id) => { const b = window.__game.scene.getScene('MenuScene').picker.toggles.find(t => t.heroId === id); return { x: b.hit.x, y: b.hit.y }; }, id); await tap(t.x, t.y); };
  const fillForm = async (values) => { const inputs = p.locator('.acc-card input:not([type=button])'); for (let i = 0; i < values.length; i++) await inputs.nth(i).fill(values[i]); await p.locator('.acc-card button[type=submit]').click(); };
  const look = () => ev(() => {
    const ex = window.__game.scene.getScene('ExplorationScene'), ui = window.__game.scene.getScene('UIScene');
    return { session: window.__witch.session.hero, world: ex.player.view.texture.key, portrait: ui.portrait.texture.key, coins: window.__witch.state.item('coins') };
  });
  return { p, ctx, ev, tap, shot, menu, inGame, pickToggle, fillForm, look };
}

console.log(`\nСервер: ${srv.backend === 'pg' ? 'настоящие SQL-функции (Postgres)' : 'JS-зеркало схемы'}`);

console.log('\n1. Новый гость-колдун');
{
  const d = await device('guest');
  await d.p.goto(BASE); await d.menu();
  await d.shot('start-witch');
  await d.pickToggle('warlock'); await d.shot('start-warlock');
  ok(srv.calls.filter(c => c.path.startsWith('/rest/')).length === 0 && !(await d.ev(() => window.__witch.session.signedIn)), 'переключение в меню не обращается к серверу и не создаёт профиль');
  await d.tap(360, 1046);                     // «Начать игру»
  await d.p.waitForFunction(() => !!window.__game.scene.getScene('MenuScene').choice);
  await d.shot('choice');
  await d.tap(360, 530);                      // «Играть как гость»
  await d.inGame(); await d.p.waitForTimeout(1500);
  let l = await d.look();
  ok(l.session === 'warlock' && l.world === 'warlock_down' && l.portrait.includes('warlock_down'), `гость создан колдуном: профиль, мир, портрет HUD (${JSON.stringify(l)})`);
  await d.shot('game-warlock');
  await d.ev(() => { const u = window.__game.scene.getScene('UIScene'); u.closeDialogue?.(true); u.openHeroProfile(); });
  await d.p.waitForTimeout(500);
  const prof = await d.ev(() => { const u = window.__game.scene.getScene('UIScene'); return { title: u.modal?.opts?.title, labels: u.children.list.flatMap(function walk(o) { return [...(o.type === 'Text' ? [o.text] : []), ...((o.list || []).flatMap(walk))]; }) }; });
  ok(prof.title === 'Колдун' && prof.labels.includes('Ученик лесной ведьмы'), 'профиль: «Колдун», «Ученик лесной ведьмы»');
  await d.shot('profile-warlock');
  // Перезагрузка гостя: загрузить тот же профиль и сразу открыть мир, без экрана «Продолжить».
  const saved = await d.ev(async () => {
    const s = window.__witch;
    s.savePosition(); await s.session.flush();
    return { uid: s.session.userId, coins: s.state.item('coins'), pos: s.state.data.player };
  });
  await d.p.goto(BASE); await d.inGame();
  ok(!(await d.ev(() => window.__game.scene.isActive('MenuScene'))), 'перезагрузка гостя сразу открывает мир без меню');
  const restored = await d.ev(() => ({ uid: window.__witch.session.userId, coins: window.__witch.state.item('coins'), pos: window.__witch.state.data.player }));
  ok(restored.uid === saved.uid && restored.coins === saved.coins && JSON.stringify(restored.pos) === JSON.stringify(saved.pos), 'гость возвращается к своему персонажу, ресурсам и позиции');
  await d.shot('resume-warlock');
  l = await d.look();
  ok(l.world === 'warlock_down' && l.portrait.includes('warlock_down'), 'после повторного входа — колдун в мире и в портрете');
  await d.ctx.close();
}

console.log('\n2. Регистрация ведьмы и вход с другого устройства');
{
  const nick = `Vedma_${SUF}`;
  const d = await device('reg');
  await d.p.goto(BASE); await d.menu();
  await d.tap(360, 1046); await d.p.waitForFunction(() => !!window.__game.scene.getScene('MenuScene').choice);
  await d.tap(360, 718);                      // «Создать аккаунт»
  await d.p.waitForSelector('.acc-card input');
  await d.fillForm([nick, PASS, PASS]);
  await d.inGame();
  let l = await d.look();
  ok(l.session === 'witch' && l.world === 'hero_down', 'регистрация с выбранной ведьмой: ведьма');
  await d.ctx.close();
  const e = await device('reg-login');
  await e.p.goto(BASE); await e.menu();
  await e.pickToggle('warlock');              // на этом устройстве в предпросмотре — колдун
  await e.tap(205, 1160);                     // «Войти»
  await e.p.waitForSelector('.acc-card input');
  await e.fillForm([nick, PASS]);
  await e.inGame(); await e.p.waitForTimeout(1000);
  l = await e.look();
  ok(l.session === 'witch' && l.world === 'hero_down' && l.portrait.includes('hero_down'), `предпросмотр колдуна → вход в аккаунт ведьмы: ведьма (мир, портрет) ${JSON.stringify(l)}`);
  await e.shot('login-witch-from-warlock-preview');
  await e.p.goto(BASE); await e.inGame();
  ok(!(await e.ev(() => window.__game.scene.isActive('MenuScene'))) && (await e.look()).session === 'witch', 'зарегистрированный игрок после загрузки сразу в мире со своим героем');
  await e.ctx.close();
}

console.log('\n3. Обратный случай и аккаунт колдуна, созданный на другом устройстве');
{
  const acc = await account('warlock', `Koldun_${SUF}`);
  const d = await device('login-warlock');
  await d.p.goto(BASE); await d.menu();      // предпросмотр по умолчанию — ведьма
  await d.tap(360, 1046); await d.p.waitForFunction(() => !!window.__game.scene.getScene('MenuScene').choice);
  await d.tap(360, 868);                      // «У меня уже есть аккаунт»
  await d.p.waitForSelector('.acc-card input');
  await d.fillForm([acc.nickname, PASS]);
  await d.inGame(); await d.p.waitForTimeout(1000);
  const l = await d.look();
  ok(l.session === 'warlock' && l.world === 'warlock_down' && l.portrait.includes('warlock_down') && l.coins === acc.coins, `предпросмотр ведьмы → вход в аккаунт колдуна: колдун и его прогресс ${JSON.stringify(l)}`);
  // смена аккаунта на этом же устройстве (как «Войти в другой аккаунт» в профиле): после перезапуска — портрет нового героя
  const accW = await account('witch', `Vedunya_${SUF}`);
  await d.ev(async ({ n, p }) => { await window.__witch.session.login({ nickname: n, password: p }); }, { n: accW.nickname, p: PASS });
  await d.p.goto(BASE); await d.inGame(); await d.p.waitForTimeout(800);
  const l2 = await d.look();
  ok(l2.session === 'witch' && l2.world === 'hero_down' && l2.portrait.includes('hero_down') && l2.coins === accW.coins, 'вход в другой аккаунт: портрет и герой сменились (без старого медальона)');
  ok(!(await d.ev(() => window.__game.scene.isActive('MenuScene'))), 'смена аккаунта сразу открывает мир нового игрока');
  await d.ev(() => window.__witch.session.logout());
  await d.p.goto(BASE); await d.menu();
  ok(!(await d.ev(() => window.__game.scene.isActive('ExplorationScene'))) && !(await d.ev(() => window.__witch.session.signedIn)), 'после выхода открывается вход/выбор героя, а не мир предыдущего аккаунта');
  await d.ctx.close();
}

console.log('\n4. Блокировка сохраняет доступ только к поддержке');
{
  const acc = await account('warlock', `Restricted_${SUF}`);
  const originalRoute = srv.route;
  srv.route = async function(method, url, headers, body) {
    if (this.userByAccess(headers)?.id === acc.uid) {
      if (url.pathname === '/rest/v1/rpc/get_player') return this.reply(403, { code: 'P0001', message: 'game_banned' });
      if (url.pathname === '/rest/v1/rpc/chat_request' && body?.op === 'bootstrap') {
        return this.reply(200, { me: { nickname: acc.nickname, registered: true, hero: 'warlock', playerId: 41 }, sanctions: [{ kind: 'game', reason: 'Проверка ограничения' }] });
      }
    }
    return originalRoute.call(this, method, url, headers, body);
  };
  const d = await device('restricted');
  try {
    await d.ctx.addInitScript(({ key, auth }) => localStorage.setItem(key, auth), { key: TOKENS_KEY, auth: acc.auth });
    for (const suffix of ['', '?skipmenu']) {
      await d.p.goto(new URL(suffix, BASE).href);
      await d.menu();
      const r = await d.ev(() => ({ status: window.__witch.session.status, mode: window.__game.scene.getScene('MenuScene').mode, world: window.__game.scene.isActive('ExplorationScene') }));
      ok(r.status === 'banned' && r.mode === 'restricted' && !r.world, `блокировка: мир закрыт, доступна поддержка (${suffix || 'обычный вход'})`);
    }
  } finally { await d.ctx.close(); srv.route = originalRoute; }
}

ok(!errs.length, 'без ошибок в консоли страниц' + (errs.length ? ': ' + errs.join(' | ') : ''));
console.log(failures ? `\n✗ Провалено проверок: ${failures}` : '\n✓ Герой профиля: гость, регистрация, вход и повторный вход работают');
await b.close(); await close();
process.exit(failures ? 1 : 0);
