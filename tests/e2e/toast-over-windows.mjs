// Сообщения («не хватает…») должны лежать выше окон и меню, а подсказки — не липнуть к экрану.
//   CHROME_PATH=... node tests/e2e/toast-over-windows.mjs      (снимки — в TOAST_SHOTS_DIR, вне репозитория)
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

process.env.VITE_SUPABASE_URL = ''; process.env.VITE_SUPABASE_ANON_KEY = '';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.TOAST_SHOTS_DIR || '/tmp/witch-rpg-toast';
await fs.mkdir(out, { recursive: true });
const modules = await fs.realpath(path.join(root, 'node_modules'));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5197, strictPort: true, hmr: false, fs: { allow: [root, modules] } } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ok = (m) => console.log('  ✓', m);
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5197/?reset&skipmenu');
  await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player, null, { timeout: 180000 });
  await page.evaluate(() => {
    const w = window.__witch, u = window.__game.scene.getScene('UIScene');
    for (const e of ['prologue_seen', 'chapter_1_complete']) w.state.markEvent?.(e);
    w.settings.set('hints', false); w.tutorial.hide();
    if (u.dlg) u.closeDialogue(true); u.closeModal(null);
    u.goalBanner?.destroy(); u.goalBanner = null;
  });
  await page.waitForTimeout(600);
  // открытое окно (котёл) + сообщение о нехватке
  const state = await page.evaluate(async () => {
    const u = window.__game.scene.getScene('UIScene');
    u.openModal({ title: 'Котёл Мирры', text: 'Выберите рецепт.\n\n'.repeat(6), buttons: [{ label: 'Закрыть', primary: true }] });
    await new Promise(r => setTimeout(r, 500));
    u.toast('Не хватает: Лунная трава 1/3, Лесной гриб 0/1.\nГде взять лунная трава: светящиеся цветы на поляне и вдоль тропы', 0xd96b5f);
    await new Promise(r => setTimeout(r, 900));
    const t = u.toasts[u.toasts.length - 1];
    return { toastDepth: t.depth, modalDepth: u.modal.container.depth, y: t.y, alpha: t.alpha, list: u.children.list.filter(o => o.visible).sort((a, b) => b.depth - a.depth).slice(0, 1).map(o => o.depth) };
  });
  assert.ok(state.toastDepth > state.modalDepth, 'toast выше окна');
  assert.ok(state.list[0] === state.toastDepth, 'toast — самый верхний объект сцены');
  ok(`toast (${state.toastDepth}) выше окна (${state.modalDepth}), самый верхний объект сцены`);
  await page.screenshot({ path: path.join(out, 'toast-over-modal.png') });
  // меню
  await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); u.closeModal(null); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); u.openMenu(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); u.toast('Не хватает маны: 3 / 8.\nПодождите — мана восстанавливается сама.', 0x6fa8ff); });
  await page.waitForFunction(() => { const u = window.__game.scene.getScene('UIScene'); return u.toasts.length >= 2 && u.toasts.every(t => t.alpha > 0.99); }, null, { timeout: 30000 });
  const menuState = await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); return { menu: !!u.modal?.menu, toasts: u.toasts.map(t => ({ d: t.depth, y: Math.round(t.y) })), top: u.children.list.filter(o => o.visible).sort((a, b) => b.depth - a.depth)[0].depth }; });
  assert.ok(menuState.menu && menuState.toasts.every(t => t.d === menuState.top), 'при открытом меню все сообщения выше меню');
  await page.screenshot({ path: path.join(out, 'toast-over-menu.png') });
  ok('поверх меню: ' + JSON.stringify(menuState.toasts));
  assert.deepEqual(errors, [], 'ошибок страницы нет: ' + errors.join('; '));
  await context.close();
} catch (e) { failed = true; console.error('✗', e.message); }
await browser.close(); await server.close();
process.exit(failed ? 1 : 0);
