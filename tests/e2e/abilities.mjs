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

  const cmInfo = () => page.evaluate(() => { const c = window.__game.scene.getScene('CombatScene'); return { started: c.started, ended: c.ended, tut: c.tut?.step || null, fire: c.cm?.abilityState?.('fire')?.state, tele: c.cm?.abilityState?.('telekinesis')?.state, seal: c.cm?.abilityState?.('seal')?.state }; });
  const fight = async (enemyId, label) => {
    await page.evaluate((id) => {
      const e = window.__game.scene.getScene('ExplorationScene');
      const t = e.enemies.find(x => x.id === id) || e.enemies[0]; if (!t) throw new Error('нет врага ' + id);
      e.startCombat(t);
    }, enemyId);
    await page.waitForFunction(() => window.__game.scene.isActive('CombatScene') && window.__game.scene.getScene('CombatScene').started, null, { timeout: 25000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__game.scene.getScene('CombatScene').tut?.skip?.());   // обучение не мешает проверке кнопок
    await page.waitForTimeout(300);
    await shot('c-' + label);
    console.log(label, 'бой до:', JSON.stringify(await cmInfo()), JSON.stringify(await state()));
    for (const [name, x] of [['fire', 274], ['seal', 444], ['tele', 104]]) {
      const b = await page.evaluate(() => window.__uses.length);
      await click(x, 1164);
      const a = await page.evaluate(() => window.__uses.length);
      const c = await cmInfo();
      ok(a === b + 1, `${label}: кнопка ${name} дошла до шины`);
      console.log('   после', name, JSON.stringify(c));
    }
    const c = await cmInfo();
    ok(c.fire !== 'ready' || c.seal !== 'ready' || c.tele !== 'ready', `${label}: хотя бы один дар сработал (перезарядка пошла)`);
    await page.evaluate(() => { const c = window.__game.scene.getScene('CombatScene'); c.cm.enemy.hp = 0; });
    await page.waitForFunction(() => !window.__game.scene.isActive('CombatScene') || window.__game.scene.getScene('CombatScene').ended, null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(500);
    console.log(label, 'бой после:', JSON.stringify(await state()));
  };
  await fight('combat_intro_01', 'лес');
  // выйти из итогового окна боя
  await page.waitForFunction(() => window.__game.scene.isActive('ExplorationScene') && !window.__game.scene.isActive('CombatScene'), null, { timeout: 40000 }).catch(async () => {
    console.log('итог боя: ждём кнопку', JSON.stringify(await state()));
    await shot('c-outcome');
  });
  console.log('состояние после боя:', JSON.stringify(await state()));
  // после боя: окно итога закрыть (если есть) и проверить кнопки в мире
  const closeAny = async () => { for (let k = 0; k < 4; k++) { const had = await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); if (!u.modal) return false; u.closeModal(u.modal.buttons[0]); return true; }); if (!had) break; await page.waitForTimeout(500); } };
  await closeAny();
  {
    const b = await page.evaluate(() => ({ ...window.__exp || {}, uses: window.__uses.length }));
    await click(274, 1164);
    console.log('после боя, тап по Огню:', JSON.stringify(await state()));
    ok((await page.evaluate(() => window.__uses.length)) === b.uses + 1, 'после боя в лесу: кнопка Огня доходит до шины');
  }
  // переход в город и бой там
  await page.evaluate(() => { const s = window.__witch.state; ['ch2_start', 'ch2_city_arrived'].forEach(k => s.markEvent(k)); window.__witch.bus.emit('story:map-travel', 'city'); });
  await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene')?.loc?.id === 'city' && window.__witch.mode === 'exploration', null, { timeout: 25000 });
  await page.waitForTimeout(1500);
  console.log('в городе:', JSON.stringify(await state()));
  await fight('plaza_critter', 'город');
  await closeAny();
  console.log('после боя в городе:', JSON.stringify(await state()));
  console.log('ошибки страницы:', JSON.stringify(errors.filter(e => !/supabase|Failed to load resource|fonts/i.test(e))));
} catch (e) { failed++; console.error('  ✗', e.stack || e.message); }
await browser.close();
if (server) await server.close();
process.exit(failed ? 1 : 0);
