// v0.29.0 — окно «Рейтинг» в настоящем Phaser: меню → «Рейтинг», четыре вкладки, таблицы с сервера (подставлены), «Онлайн».
// Снимки — вне репозитория (RATING_SHOTS_DIR).
//   node tests/e2e/ratings.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.RATING_SHOTS_DIR || '/tmp/witch-rpg-rating';
await fs.mkdir(out, { recursive: true });
const BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:5177/';
let server = null;
if (!process.env.UI_BASE_URL) {
  const { createServer } = await import('vite');
  server = await createServer({ root, server: { host: '127.0.0.1', port: 5177, strictPort: true } });
  await server.listen();
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CI ? ['--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
const ok = (m) => console.log('  ✓', m);
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('?reset&skipmenu', BASE).href);
  await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player);
  await page.waitForTimeout(1200);
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const ui = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms });
  const texts = () => ui(() => { const u = window.__game.scene.getScene('UIScene'), out = []; const walk = (o) => { if (typeof o.text === 'string' && o.text) out.push(o.text); (o.list || []).forEach(walk); }; if (u.modal) walk(u.modal.container); return out.join(' | '); });

  // без сервера: только свои результаты
  await ui(() => window.__game.scene.getScene('UIScene').openRating());
  await until(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Рейтинг');
  let t = await texts();
  assert.ok(['Уровень', 'Монстры', 'Арена', 'Онлайн'].every(x => t.includes(x)) && t.includes('Уровень героя: 1') && t.includes('онлайн-аккаунте'), 'без сервера: вкладки и свои результаты: ' + t);
  await shot('01-offline');
  ok('рейтинг без сервера: вкладки и свои результаты');
  await ui(() => window.__game.scene.getScene('UIScene').closeModal(null));

  // с сервером (ответы подставлены)
  await ui(() => {
    const top = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));
    const BOARD = {
      level: { top: top(30, (r) => ({ rank: r, nickname: 'Игрок' + r, hero: r % 2 ? 'witch' : 'warlock', level: Math.max(1, 16 - r), xp: 100, me: r === 7 })), me: { rank: 7, level: 9, xp: 100 } },
      monster: { top: top(12, (r) => ({ rank: r, nickname: 'Игрок' + r, enemy: ['severin_boss', 'frost_alpha', 'ice_guardian', 'rootling'][r % 4], level: [12, 12, 10, 2][r % 4], me: r === 3 })), me: { rank: 3, enemy: 'ice_guardian', level: 10 } },
      arena: { season: 0, endsAt: '2026-11-02T00:00:00Z', top: top(10, (r) => ({ rank: r, nickname: 'Игрок' + r, rating: 1900 - r * 60, wins: 12 - r, losses: r, me: r === 4 })), me: { rank: 4, rating: 1660, wins: 8, losses: 4 } },
    };
    const ONLINE = { count: 6, guests: 2, players: [{ nickname: 'Лира', hero: 'witch', level: 15, fighting: true }, { nickname: 'Вы', hero: 'warlock', level: 9, me: true }, { nickname: 'Тень', hero: 'witch', level: 4 }, { nickname: 'Рэй', hero: 'warlock', level: 2 }] };
    window.__witch.session = { signedIn: true, registered: true, _authed: async (fn) => fn('t'), api: { ratingsBoard: async () => BOARD, onlinePlayers: async () => ONLINE } };
    const u = window.__game.scene.getScene('UIScene'); u.ratingCache = null; u.ratingTab = null;
    window.__witch.state.markEvent('chapter_2_complete');
    u.openMenu?.();
  });
  await until(() => window.__game.scene.getScene('UIScene').modal?.menu);
  await ui(() => window.__game.scene.getScene('UIScene').modal.items.find(i => i.item.id === 'rating').hit.emit('pointerdown'));
  await until(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Рейтинг');
  await until(() => window.__game.scene.getScene('UIScene').modal.container.list && true);
  await page.waitForTimeout(800);
  t = await texts();
  assert.ok(t.includes('Ваше место: 7') && t.includes('1. Игрок1 — уровень 15') && t.includes('7. Игрок7 — уровень 9'), 'уровень: ' + t.slice(0, 400));
  await shot('02-level');
  ok('меню → «Рейтинг» → «Уровень»: таблица с местом игрока');
  for (const [tab, name, expect] of [['monster', '03-monsters', 'Ледяной страж (ур. 10)'], ['arena', '04-arena', 'Платина'], ['online', '05-online', 'Сейчас в игре: 6']]) {
    await ui((tab) => window.__game.scene.getScene('UIScene').openRating(tab), tab);
    await page.waitForTimeout(900);
    t = await texts();
    assert.ok(t.includes(expect), `вкладка ${tab}: нет «${expect}»: ` + t.slice(0, 400));
    await shot(name);
    ok(`вкладка «${tab}»: ${expect}`);
  }
  assert.ok(t.includes('Лира — Ведьма, уровень 15 · в бою') && t.includes('Вы (вы) — Колдун, уровень 9'), 'онлайн: герой, уровень, «в бою»');
  assert.deepEqual(errors.filter(e => !/supabase|Failed to load resource|fonts/i.test(e)), []);
  ok('без ошибок на странице');
} catch (e) { failed = true; console.error('  ✗', e.message); }
await browser.close();
if (server) await server.close();
console.log(failed ? '\n✗ Рейтинг в браузере: провал' : '\n✓ Рейтинг в браузере: всё в порядке');
process.exit(failed ? 1 : 0);
