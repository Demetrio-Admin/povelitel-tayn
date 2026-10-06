// v0.27.0 — локации и карта мира в настоящем Phaser: в сцене только текущая локация, камера не видит соседей,
// переход с карты у выхода перезапускает сцену уже в новой локации. Снимки — вне репозитория (LOC_SHOTS_DIR).
//   node tests/e2e/locations.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.LOC_SHOTS_DIR || '/tmp/witch-rpg-locations';
await fs.mkdir(out, { recursive: true });
const BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:5174/';
let server = null;
if (!process.env.UI_BASE_URL) {
  const { createServer } = await import('vite');
  server = await createServer({ root, server: { host: '127.0.0.1', port: 5174, strictPort: true } });
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
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(new URL('?reset&skipmenu', BASE).href);
  await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player);
  await page.waitForTimeout(1500);
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });

  // что сейчас в сцене: локация, границы камеры и мира, объекты вне локации
  const look = () => page.evaluate(() => {
    const s = window.__game.scene.getScene('ExplorationScene'), cam = s.cameras.main, b = cam._bounds, r = s.loc?.rect;
    const outside = [...s.objects, ...s.enemies].filter(o => { const x = o.cfg?.x ?? o.x, y = o.cfg?.y ?? o.y; return x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h; }).map(o => o.id);
    return { loc: s.loc?.id, cam: { x: b.x, y: b.y, w: b.width, h: b.height }, rect: r, phys: { x: s.physics.world.bounds.x, w: s.physics.world.bounds.width },
      player: { x: Math.round(s.player.x), y: Math.round(s.player.y) }, outside, n: s.objects.length + s.enemies.length,
      exits: s.objects.filter(o => o.cfg?.kind === 'exit').map(o => o.id), mode: window.__witch.mode };
  });
  const travel = async (id) => {
    await page.evaluate((id) => window.__witch.bus.emit('story:map-travel', id), id);
    await page.waitForFunction((id) => { const s = window.__game.scene.getScene('ExplorationScene'); return s?.loc?.id === id && s.player && window.__witch.mode === 'exploration'; }, id, { timeout: 20000 });
    await page.waitForTimeout(1200);
  };

  let L = await look();
  assert.equal(L.loc, 'forest'); assert.deepEqual(L.outside, []); assert.deepEqual(L.exits, ['exit_forest']);
  assert.ok(L.cam.x === 0 && L.cam.w === 1800 && L.phys.w === 1800, 'камера и физика — только лес: ' + JSON.stringify(L));
  ok(`лес Мирры: ${L.n} объектов, все внутри; камера ${L.cam.w}×${L.cam.h}; один выход`);
  await shot('01-forest');

  // закрытая локация не открывается даже событием
  await page.evaluate(() => window.__witch.bus.emit('story:map-travel', 'city'));
  await page.waitForTimeout(900);
  assert.equal((await look()).loc, 'forest');
  ok('город до главы II не открыт: переход не случился');

  // карта у выхода
  await page.evaluate(() => { window.__witch.state.markEvent('ch2_start'); window.__witch.bus.emit('ui:open-map', { exit: 'exit_forest' }); });
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => window.__game.scene.getScene('UIScene').modal?.opts?.title);
  assert.equal(t, 'Карта мира');
  await shot('02-map-at-exit');
  await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); u.mapSel = 'city'; u.openMap({ exit: 'exit_forest' }); });
  await page.waitForTimeout(500);
  const go = await page.evaluate(() => window.__game.scene.getScene('UIScene').modal.buttons.length);
  assert.equal(go, 2, 'у выхода, выбран город: «Отправиться» и «Остаться»');
  await shot('02b-map-city-selected');
  await page.evaluate(() => window.__game.scene.getScene('UIScene').closeModal(null));
  ok('у выхода открывается карта мира');

  await travel('city');
  L = await look();
  assert.deepEqual(L.outside, []); assert.deepEqual(L.exits, ['exit_city']);
  assert.ok(L.cam.x === 1800 && L.cam.w === 1800 && L.cam.y === 1300 && L.phys.x === 1800, 'камера — только город: ' + JSON.stringify(L));
  assert.ok(Math.abs(L.player.x - 2020) < 300, 'герой у входа в город: ' + JSON.stringify(L.player));
  ok(`город: ${L.n} объектов, все внутри; камера с x=${L.cam.x}, ${L.cam.w}×${L.cam.h}; герой ${L.player.x},${L.player.y}`);
  await shot('03-city');
  const saved = await page.evaluate(() => JSON.parse(JSON.stringify(window.__witch.state.data.player)));
  assert.ok(saved.x >= 1800, 'позиция в городе сохранена');

  await page.evaluate(() => window.__witch.state.markEvent('chapter_2_complete'));
  for (const id of ['frostwood', 'graveyard', 'forest']) {
    await travel(id);
    L = await look();
    assert.deepEqual(L.outside, [], id); assert.equal(L.exits.length, 1, id);
    ok(`${id}: ${L.n} объектов, все внутри; камера ${L.cam.x},${L.cam.y} ${L.cam.w}×${L.cam.h}`);
    await shot('04-' + id);
  }
  // меню → «Карта» в локации: только посмотреть
  await page.evaluate(() => window.__game.scene.getScene('UIScene').openMap());
  await page.waitForTimeout(500);
  const btns = await page.evaluate(() => window.__game.scene.getScene('UIScene').modal.buttons.length);
  assert.equal(btns, 1);
  await shot('05-map-view');
  ok('карта из меню — только для просмотра');
  assert.deepEqual(errors.filter(e => !/supabase|Failed to load resource|fonts/i.test(e)), []);
  ok('без ошибок на странице');
} catch (e) { failed = true; console.error('  ✗', e.message); }
await browser.close();
if (server) await server.close();
console.log(failed ? '\n✗ Локации в браузере: провал' : '\n✓ Локации в браузере: всё в порядке');
process.exit(failed ? 1 : 0);
