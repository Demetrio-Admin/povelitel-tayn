// Кнопки даров (Телекинез, Огонь, Астрал) в настоящем Phaser с настоящими нажатиями мыши: в мире и в бою (обучение пропущено).
//   npm run test:abilities
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:5175/';
let server = null;
if (!process.env.UI_BASE_URL) {
  const { createServer } = await import('vite');
  server = await createServer({ root, server: { host: '127.0.0.1', port: 5175, strictPort: true } });
  await server.listen();
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CI ? ['--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
let failed = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failed++; console.log('  ✗', m); } };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('?reset&skipmenu', BASE).href);
  await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player);
  await page.waitForTimeout(1500);
  const click = async (x, y) => {
    const p = await page.evaluate(({ x, y }) => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x + x * b.width / 720, y: b.y + y * b.height / 1280 }; }, { x, y });
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(250);
  };
  const uses = () => page.evaluate(() => window.__uses.length);
  await page.evaluate(() => {
    window.__uses = []; window.__witch.bus.on('ability:use', (id) => window.__uses.push(id));
    const s = window.__witch.state;
    for (const g of ['telekinesis', 'fire', 'seal']) s.unlockAbility(g, 1);
    const u = window.__game.scene.getScene('UIScene'); u.dockKey = null; u.refreshDock();
  });
  await page.waitForTimeout(400);
  for (const [name, x] of [['Телекинез', 104], ['Огонь', 274], ['Астрал', 444]]) {
    const b = await uses(); await click(x, 1164);
    ok(await uses() === b + 1, `в мире: кнопка «${name}» доходит до игры`);
  }
  await page.evaluate(() => { const e = window.__game.scene.getScene('ExplorationScene'); e.startCombat(e.enemies[0]); });
  await page.waitForFunction(() => window.__game.scene.isActive('CombatScene') && window.__game.scene.getScene('CombatScene').started, null, { timeout: 25000 });
  await page.evaluate(() => window.__game.scene.getScene('CombatScene').tut?.skip?.());
  await page.waitForTimeout(500);
  const cd = (id) => page.evaluate((id) => window.__game.scene.getScene('CombatScene').cm.abilityState(id).state, id);
  for (const [id, name, x] of [['fire', 'Огонь', 274], ['seal', 'Астрал', 444], ['telekinesis', 'Телекинез', 104]]) {
    await click(x, 1164);
    ok(await cd(id) !== 'ready', `в бою: «${name}» сработал (пошла перезарядка)`);
  }
  ok(!errors.filter(e => !/supabase|Failed to load resource|fonts/i.test(e)).length, 'без ошибок на странице');
} catch (e) { failed++; console.error('  ✗', e.stack || e.message); }
await browser.close();
if (server) await server.close();
console.log(failed ? '\n✗ Кнопки даров: провал' : '\n✓ Кнопки даров: всё в порядке');
process.exit(failed ? 1 : 0);
