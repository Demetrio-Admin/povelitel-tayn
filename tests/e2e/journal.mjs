// Журнал в настоящем браузере: три вкладки одной строкой, карточки, без кнопки «Сумка». Снимки — JOURNAL_SHOTS_DIR (вне репозитория).
//   CHROME_PATH=... node tests/e2e/journal.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

process.env.VITE_SUPABASE_URL = ''; process.env.VITE_SUPABASE_ANON_KEY = '';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.JOURNAL_SHOTS_DIR || '/tmp/witch-rpg-journal';
await fs.mkdir(out, { recursive: true });
const modules = await fs.realpath(path.join(root, 'node_modules'));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5198, strictPort: true, hmr: false, fs: { allow: [root, modules] } } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ok = (m) => console.log('  ✓', m);
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5198/?reset&skipmenu');
  await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player, null, { timeout: 180000 });
  await page.evaluate(() => {
    const w = window.__witch, u = window.__game.scene.getScene('UIScene');
    for (const e of ['prologue_seen', 'unlock_telekinesis_1', 'altar_activated', 'lunar_quest_start', 'ch1_flame_a', 'chapter_1_complete']) w.state.markEvent?.(e);
    w.settings.set('hints', false); w.tutorial.hide();
    if (u.dlg) u.closeDialogue(true); u.closeModal(null);
    u.goalBanner?.destroy(); u.goalBanner = null;
    for (const id of ['sq_herbs', 'sq_hunter']) { try { w.log.accept(id); } catch {} }
    u.toasts.forEach(t => t.destroy()); u.toasts = [];
    w.state.addItem?.('moon_herb', 3);
    u.refreshQuest();
  });
  await page.waitForTimeout(500);
  const settle = (ms = 1500) => page.waitForFunction(() => { const u = window.__game.scene.getScene('UIScene'); return u.modal && !u.swapping && u.modal.container.alpha > 0.99 && u.modal.body.alpha > 0.99; }, null, { timeout: 30000 }).then(() => page.waitForTimeout(ms));
  for (const tab of ['goal', 'quests', 'tips']) {
    await page.evaluate((tab) => { const u = window.__game.scene.getScene('UIScene'); u.closeModal(null); u.journalTab = tab; u.openJournal(tab); }, tab);
    await settle();
    const info = await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); return { title: u.modal.opts.title, tabs: u.modal.opts.topTabs.map(t => t.label), selected: u.modal.opts.topTabs.findIndex(t => t.selected), buttons: u.modal.opts.buttons.map(b => b.label), scroll: !!u.modal.scroll?.max }; });
    assert.equal(info.title, 'Журнал');
    assert.deepEqual(info.buttons, ['Закрыть'], 'в Журнале только «Закрыть»');
    assert.equal(info.tabs.length, 3);
    await page.screenshot({ path: path.join(out, `journal-${tab}.png`) });
    ok(`вкладка «${tab}»: ${info.tabs.join(' | ')}, выбрана ${info.selected}, прокрутка: ${info.scroll}`);
  }
  // переключение вкладки нажатием
  await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); u.closeModal(null); u.openJournal('goal'); });
  await settle(300);
  await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); u.modal.opts.topTabs[1].onClick && u.switchModal(u.modal.opts.topTabs[1].onClick); });
  await settle(300);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('UIScene').journalTab), 'quests');
  ok('вкладки переключаются плавной сменой окна');
  assert.deepEqual(errors, [], 'ошибок страницы нет: ' + errors.join('; '));
  await context.close();
} catch (e) { failed = true; console.error('✗', e.message); }
await browser.close(); await server.close();
process.exit(failed ? 1 : 0);
