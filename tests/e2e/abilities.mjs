// Кнопки даров (Телекинез, Огонь, Астрал) в настоящем Phaser с настоящими нажатиями мыши: вне боя и в бою.
//   node tests/e2e/abilities.mjs
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.AB_SHOTS_DIR || '/tmp/witch-rpg-abilities';
await fs.mkdir(out, { recursive: true });
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: false, deviceScaleFactor: 1 });
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(new URL('?reset&skipmenu', BASE).href);
  await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player);
  await page.waitForTimeout(1500);
  const shot = (n) => page.screenshot({ path: path.join(out, n + '.png') });
  const click = async (x, y) => {
    const p = await page.evaluate(({ x, y }) => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x + x * b.width / 720, y: b.y + y * b.height / 1280 }; }, { x, y });
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(250);
  };
  const state = () => page.evaluate(() => ({ mode: window.__witch.mode, modalOpen: window.__witch.modalOpen, offline: window.__witch.offline,
    ui: { mode: window.__game.scene.getScene('UIScene').mode, modal: !!window.__game.scene.getScene('UIScene').modal },
    busy: !!window.__witch.actions?.busy, exp: window.__game.scene.isActive('ExplorationScene'), combat: window.__game.scene.isActive('CombatScene') }));
  // сколько раз кнопка дара дошла до шины
  await page.evaluate(() => { window.__uses = []; window.__witch.bus.on('ability:use', (id) => window.__uses.push(id)); });
  const MSGNAME = await page.evaluate(() => 'ability:use');
  console.log('состояние в начале:', JSON.stringify(await state()));

  // открыть дары героя и поставить в слоты
  await page.evaluate(() => {
    const s = window.__witch.state;
    for (const g of ['telekinesis', 'fire', 'seal']) s.unlockAbility(g, 1);
    ['prologue_seen', 'unlock_telekinesis_1', 'unlock_fire_1', 'unlock_seal_1'].forEach(k => s.markEvent(k));
    window.__game.scene.getScene('UIScene').dockKey = null; window.__game.scene.getScene('UIScene').refreshDock();
  });
  await page.waitForTimeout(500);
  console.log('дары открыты:', JSON.stringify(await state()));
  await shot('01-explore');
  for (const [i, x] of [[0, 104], [1, 274], [2, 444]]) {
    const before = await page.evaluate(() => window.__uses.length);
    await click(x, 1164);
    const after = await page.evaluate(() => window.__uses.length);
    ok(after === before + 1, `вне боя: кнопка ${i + 1} дошла до шины (${after - before})`);
  }
  const uses = await page.evaluate(() => window.__uses.join());
  console.log('использования:', uses, JSON.stringify(await state()));
  const toastText = await page.evaluate(() => { const o = []; const w = (x) => { if (typeof x.text === 'string' && x.text) o.push(x.text); (x.list || []).forEach?.(w); }; window.__game.scene.getScene('UIScene').children.list.forEach(w); return o.slice(0, 60); });
  console.log('тексты на экране:', JSON.stringify(toastText));
  await shot('02-after-taps');

  // v0.27.0: после перехода между локациями (перезапуск сцены) кнопки обязаны работать так же
  await page.evaluate(() => {
    const P = Object.getPrototypeOf(window.__game.scene.getScene('ExplorationScene'));
    window.__exp = { calls: 0, acted: 0 };
    const orig = P.onAbility;
    P.onAbility = function (id) { window.__exp.calls++; if (this.canAct()) window.__exp.acted++; return orig.call(this, id); };
    const s = window.__witch.state; s.markEvent('ch2_start'); s.markEvent('chapter_2_complete');
  });
  const listeners = () => page.evaluate(() => ({ ability: (window.__witch.bus.map.get('ability:use') || []).map(l => l.ctx?.constructor?.name || typeof l.ctx).join(), ctx: (window.__witch.bus.map.get('ui:open-map') || []).length }));
  console.log('слушатели до перехода:', JSON.stringify(await listeners()));
  for (const id of ['city', 'forest']) {
    await page.evaluate((id) => window.__witch.bus.emit('story:map-travel', id), id);
    await page.waitForFunction((id) => { const s = window.__game.scene.getScene('ExplorationScene'); return s?.loc?.id === id && window.__witch.mode === 'exploration'; }, id, { timeout: 20000 });
    await page.waitForTimeout(1500);
    console.log('после перехода в', id, JSON.stringify(await state()), JSON.stringify(await listeners()));
    const b = await page.evaluate(() => ({ ...window.__exp, uses: window.__uses.length }));
    await click(274, 1164);
    const a = await page.evaluate(() => ({ ...window.__exp, uses: window.__uses.length }));
    ok(a.uses === b.uses + 1 && a.calls === b.calls + 1 && a.acted === b.acted + 1, `после перехода в «${id}»: кнопка Огня доходит до сцены и сцена действует ` + JSON.stringify([b, a]));
  }
  // меню → «Карта» → закрыть → кнопки живы
  await page.evaluate(() => window.__game.scene.getScene('UIScene').openMap());
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__game.scene.getScene('UIScene').closeModal(window.__game.scene.getScene('UIScene').modal.buttons[0]));
  await page.waitForTimeout(300);
  {
    const b = await page.evaluate(() => ({ ...window.__exp }));
    await click(274, 1164);
    const a = await page.evaluate(() => ({ ...window.__exp }));
    ok(a.acted === b.acted + 1, 'после закрытия карты: кнопка Огня действует ' + JSON.stringify(await state()));
  }

  // бой
  await page.evaluate(() => {
    const e = window.__game.scene.getScene('ExplorationScene');
    const t = e.enemies.find(x => x.id === 'combat_intro_01') || e.enemies[0];
    e.startCombat(t);
  });
  await page.waitForFunction(() => window.__game.scene.isActive('CombatScene') && window.__game.scene.getScene('CombatScene').started, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log('в бою:', JSON.stringify(await state()));
  await page.evaluate(() => { const c = window.__game.scene.getScene('CombatScene'); console.log('tut', c.tut?.step); });
  await shot('03-combat');
  const cmInfo = () => page.evaluate(() => { const c = window.__game.scene.getScene('CombatScene'); return { started: c.started, ended: c.ended, tut: c.tut?.step || null, mana: Math.round(c.cm?.player?.mana ?? -1), cdFire: c.cm?.abilityState?.('fire')?.state, inputs: c.rec?.inputs?.length ?? c.rec?.events?.length ?? null }; });
  console.log('cm до:', JSON.stringify(await cmInfo()));
  const before = await page.evaluate(() => window.__uses.length);
  await click(274, 1164);
  await page.waitForTimeout(400);
  console.log('cm после:', JSON.stringify(await cmInfo()), JSON.stringify(await state()));
  const after = await page.evaluate(() => window.__uses.length);
  ok(after === before + 1, 'в бою: кнопка Огня дошла до шины');
  await shot('04-combat-after');
  console.log('ошибки страницы:', JSON.stringify(errors.filter(e => !/supabase|Failed to load resource|fonts/i.test(e))));
} catch (e) { failed++; console.error('  ✗', e.stack || e.message); }
await browser.close();
if (server) await server.close();
process.exit(failed ? 1 : 0);
