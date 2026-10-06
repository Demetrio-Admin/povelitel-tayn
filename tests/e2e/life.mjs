// v0.28.0 — «живой мир» в настоящем Phaser: рябь у ручья, качаются только ближние деревья, птица и зверёк пролетают и пропадают,
// число объектов сцены со временем не растёт, настройка «Живой мир» выключает всё. Снимки — вне репозитория (LIFE_SHOTS_DIR).
//   node tests/e2e/life.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.LIFE_SHOTS_DIR || '/tmp/witch-rpg-life';
await fs.mkdir(out, { recursive: true });
const BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:5176/';
let server = null;
if (!process.env.UI_BASE_URL) {
  const { createServer } = await import('vite');
  server = await createServer({ root, server: { host: '127.0.0.1', port: 5176, strictPort: true } });
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
  const info = () => page.evaluate(() => {
    const s = window.__game.scene.getScene('ExplorationScene'), L = s.life;
    return { running: !!L?.running, lite: !!L?.lite, sway: L?.swaying.size ?? 0, ripples: L ? L.ripples.filter(r => r.visible).length : 0, pool: L?.ripples.length ?? 0,
      flyers: L?.flyers.size ?? 0, leaves: !!L?.leaves, objs: s.children.list.length, tweens: s.tweens.getTweens().length,
      angles: L ? [...L.swaying.values()].every(v => Math.abs(v.img.angle) <= 3.1) : true };
  });

  // герой у ручья
  await page.evaluate(() => { const s = window.__game.scene.getScene('ExplorationScene'); s.player.sprite.setPosition(700, 2500); });
  await page.waitForTimeout(3500);
  let a = await info();
  assert.ok(a.running && !a.lite, 'менеджер запущен: ' + JSON.stringify(a));
  assert.ok(a.sway >= 1 && a.sway <= 14 && a.angles, 'качаются от 1 до 14 деревьев: ' + a.sway);
  assert.ok(a.ripples >= 1 && a.pool <= 8, 'у ручья есть рябь: ' + a.ripples + ' из пула ' + a.pool);
  assert.ok(a.leaves, 'листья идут');
  ok(`у ручья: качается ${a.sway} деревьев, рябь ${a.ripples}/${a.pool}, листья идут`);
  await page.screenshot({ path: path.join(out, '01-creek.png') });

  // птица и зверёк
  await page.evaluate(() => { const L = window.__game.scene.getScene('ExplorationScene').life; L.flyBird(); L.runAnimal(); });
  await page.waitForTimeout(500);
  a = await info();
  assert.ok(a.flyers >= 1, 'птица или зверёк в полёте: ' + a.flyers);
  await page.screenshot({ path: path.join(out, '02-bird.png') });
  await page.waitForTimeout(11000);
  a = await info();
  assert.equal(a.flyers, 0, 'птица и зверёк пролетели и убраны');
  ok('птица и зверёк пролетают и пропадают без остатка');

  // утечки: число объектов и твинов со временем не растёт
  const before = await info();
  await page.evaluate(() => { const L = window.__game.scene.getScene('ExplorationScene').life; for (let i = 0; i < 6; i++) { L.flyBird(); L.runAnimal(); } });
  await page.waitForTimeout(16000);
  const after = await info();
  assert.ok(after.flyers === 0 && after.objs <= before.objs + 3 && after.tweens <= before.tweens + 6, `без утечек: объектов ${before.objs}→${after.objs}, твинов ${before.tweens}→${after.tweens}`);
  ok(`без утечек: объектов ${before.objs}→${after.objs}, твинов ${before.tweens}→${after.tweens}`);

  // герой уходит в другой угол леса — качаются деревья уже там, у ручья пусто
  await page.evaluate(() => { const s = window.__game.scene.getScene('ExplorationScene'); s.player.sprite.setPosition(1300, 4300); });
  await page.waitForTimeout(2500);
  a = await info();
  assert.ok(a.sway >= 1 && a.sway <= 14, 'в другом углу качаются другие деревья: ' + a.sway);
  ok('при движении по лесу качаются ближние деревья (' + a.sway + '), дальние стоят');

  // настройка «Живой мир»
  await page.evaluate(() => window.__witch.settings?.set?.('anim', false));
  await page.waitForTimeout(300);
  a = await info();
  assert.ok(!a.running && a.sway === 0 && a.pool === 0 && !a.leaves, 'выключено: ничего не качается и не летит: ' + JSON.stringify(a));
  await page.evaluate(() => window.__witch.settings?.set?.('anim', true));
  await page.waitForTimeout(1500);
  a = await info();
  assert.ok(a.running && a.sway >= 1, 'включено обратно: снова работает');
  ok('настройка «Живой мир» выключает и включает анимации');

  assert.deepEqual(errors.filter(e => !/supabase|Failed to load resource|fonts/i.test(e)), []);
  ok('без ошибок на странице');
} catch (e) { failed = true; console.error('  ✗', e.message); }
await browser.close();
if (server) await server.close();
console.log(failed ? '\n✗ Живой мир в браузере: провал' : '\n✓ Живой мир в браузере: всё в порядке');
process.exit(failed ? 1 : 0);
