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
      flyers: L?.flyers.size ?? 0, leaves: !!L?.leavesOn, calm: !!L?.calm, objs: s.children.list.length, tweens: s.tweens.getTweens().length,
      view: (() => { const v = s.cameras.main.worldView; return [Math.round(v.x), Math.round(v.y), Math.round(v.width), Math.round(v.height)]; })(), hero: [Math.round(s.player.x), Math.round(s.player.y)], waters: s.terrain.waterRects.length,
      angles: L ? [...L.swaying.values()].every(v => Math.abs(v.item.img.angle) <= 3.1) : true };
  });

  // на медленном программном рендере в CI FPS низкий — «лёгкий режим» мешал бы проверке, поэтому держим счётчик медленных тиков на нуле
  await page.evaluate(() => { const L = window.__game.scene.getScene('ExplorationScene').life; window.__keepFull = setInterval(() => { L.slow = 0; }, 100); });
  const until = (fn, arg, ms = 40000) => page.waitForFunction(fn, arg, { timeout: ms });
  // герой у ручья: ждём, пока камера доедет, и появится рябь
  await page.evaluate(() => { const s = window.__game.scene.getScene('ExplorationScene'); s.player.sprite.setPosition(700, 2500); s.cameras.main.centerOn(700, 2500 - 200); });
  await until(() => window.__game.scene.getScene('ExplorationScene').life.ripples.some(r => r.visible));
  let a = await info();
  assert.ok(a.running && !a.lite, 'менеджер запущен: ' + JSON.stringify(a));
  assert.ok(a.sway >= 1 && a.sway <= 22 && a.angles, 'качаются от 1 до 22 деревьев: ' + a.sway);
  assert.ok(a.ripples >= 1 && a.pool <= 8, 'у ручья есть рябь: ' + a.ripples + ' из пула ' + a.pool);
  assert.ok(a.leaves, 'листья идут');
  ok(`у ручья: качается ${a.sway} деревьев, рябь ${a.ripples}/${a.pool}, листья идут`);
  await page.screenshot({ path: path.join(out, '01-creek.png') });

  // зверёк бежит к дереву или кусту: путь без воды, камней и дома, конец — у основания выбранного дерева
  const runs = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('ExplorationScene'), L = sc.life, out = [];
    const hero = { x: sc.player.x, y: sc.player.y };
    for (let i = 0; i < 25; i++) {
      const r = L.pickRun(sc.cameras.main.worldView, hero);
      if (!r) continue;
      let bad = 0;
      for (let t = 0; t <= 1; t += 0.05) {
        const x = r.a.x + (r.b.x - r.a.x) * t, y = r.a.y + (r.b.y - r.a.y) * t;
        if (sc.terrain.waterRects.some(w => x >= w.x - 4 && x <= w.x + w.w + 4 && y >= w.y - 4 && y <= w.y + w.h + 4)) bad++;
        if (x > 600 && x < 1200 && y > 4840 && y < 5340) bad++;
      }
      out.push({ bad, hide: /^(tree_|birch_|bush_|dead_tree)/.test(r.target.k), near: Math.hypot(r.b.x - r.target.x, r.b.y - r.target.y) });
    }
    return out;
  });
  assert.ok(runs.length >= 1, 'у ручья нашёлся путь к дереву или кусту');
  assert.ok(runs.every(r => r.bad === 0 && r.hide && r.near < 20), 'бег: без воды и дома, до дерева или куста: ' + JSON.stringify(runs.slice(0, 4)));
  ok(`зверёк бежит к дереву: ${runs.length} из 25 подборов, ни одного через воду или дом`);
  // птица и зверёк
  await page.evaluate(() => { const L = window.__game.scene.getScene('ExplorationScene').life; L.flyBird(); for (let i = 0; i < 12 && L.flyers.size < 2; i++) L.runAnimal(); });
  a = await info();
  assert.ok(a.flyers >= 1, 'птица или зверёк в полёте: ' + a.flyers);
  await page.screenshot({ path: path.join(out, '02-bird.png') });
  await until(() => window.__game.scene.getScene('ExplorationScene').life.flyers.size === 0, null, 60000);
  a = await info();
  assert.equal(a.flyers, 0, 'птица и зверёк пролетели и убраны');
  ok('птица и зверёк пролетают и пропадают без остатка');

  // утечки: число объектов и твинов со временем не растёт
  const before = await info();
  await page.evaluate(() => { const L = window.__game.scene.getScene('ExplorationScene').life; for (let i = 0; i < 6; i++) { L.flyBird(); L.runAnimal(); } });
  await until(() => window.__game.scene.getScene('ExplorationScene').life.flyers.size === 0, null, 90000);
  const after = await info();
  assert.ok(after.flyers === 0 && after.objs <= before.objs + 3 && after.tweens <= before.tweens + 6 + 4 * 9, `без утечек: объектов ${before.objs}→${after.objs}, твинов ${before.tweens}→${after.tweens}`);
  ok(`без утечек: объектов ${before.objs}→${after.objs}, твинов ${before.tweens}→${after.tweens}`);

  // герой уходит в другой угол леса — качаются деревья уже там, у ручья пусто
  await page.evaluate(() => { const s = window.__game.scene.getScene('ExplorationScene'); s.player.sprite.setPosition(1300, 4300); s.cameras.main.centerOn(1300, 4100); });
  await until(() => { const L = window.__game.scene.getScene('ExplorationScene').life; return L.swaying.size >= 1 && ![...L.swaying.values()].some(v => v.item.img.y < 3500); });
  a = await info();
  assert.ok(a.sway >= 1 && a.sway <= 22, 'в другом углу качаются другие деревья: ' + a.sway);
  ok('при движении по лесу качаются ближние деревья (' + a.sway + '), дальние стоят');

  // в доме Мирры: ни листьев, ни птиц, ни зверька
  await page.evaluate(() => { const s = window.__game.scene.getScene('ExplorationScene'); s.player.sprite.setPosition(900, 5150); s.cameras.main.centerOn(900, 4950); });
  await until(() => { const sc = window.__game.scene.getScene('ExplorationScene'); return sc.life.calm && !sc.life.leavesOn; });
  a = await info();
  assert.ok(a.calm && !a.leaves, 'в доме тихо: листья выключены');
  const visibleLeaves = await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').life.leaves.filter(l => l.visible).length);
  await page.waitForTimeout(1500);
  const left = await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').life.leaves.filter(l => l.visible).length);
  assert.equal(left, 0, 'листья растаяли в доме (было видно ' + visibleLeaves + ')');
  ok('в доме Мирры листья не падают и зверьки не бегают');
  await page.evaluate(() => { const s = window.__game.scene.getScene('ExplorationScene'); s.player.sprite.setPosition(1300, 4300); s.cameras.main.centerOn(1300, 4100); });
  await until(() => { const sc = window.__game.scene.getScene('ExplorationScene'); return !sc.life.calm && sc.life.leavesOn; });
  ok('вышла из дома — листья снова идут');

  // настройка «Живой мир»
  await page.evaluate(() => window.__witch.settings?.set?.('anim', false));
  await page.waitForTimeout(300);
  a = await info();
  assert.ok(!a.running && a.sway === 0 && a.pool === 0 && !a.leaves, 'выключено: ничего не качается и не летит: ' + JSON.stringify(a));
  await page.evaluate(() => window.__witch.settings?.set?.('anim', true));
  await until(() => window.__game.scene.getScene('ExplorationScene').life.running);
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
