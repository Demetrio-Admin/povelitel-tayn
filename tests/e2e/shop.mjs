// Browser plugin not available; real Phaser + HTML, touch input, local server-action mirror.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
process.env.VITE_SUPABASE_URL = ''; process.env.VITE_SUPABASE_ANON_KEY = '';
const shots = process.env.UI_SHOTS_DIR || '/tmp/witch-shop'; await fs.mkdir(shots, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1', port: 5192, strictPort: true, hmr: false, fs: { allow: [process.cwd(), await fs.realpath('node_modules')] } } }); await vite.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  for (const [width, height] of [[390,638], [360,800], [1280,900]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: width < 900 });
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://127.0.0.1:5192/?skipmenu&reset&hero=warlock');
    await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('UIScene').dlg, null, { timeout: 120000 });
    assert.match(await page.title(), /Колдовство/); assert.equal(await page.locator('vite-error-overlay').count(), 0);
    await page.evaluate(() => {
      const w = window.__witch, u = window.__game.scene.getScene('UIScene'); u.closeDialogue(true); w.settings.set('hints', false); w.tutorial.hide(); w.state.markEvent('prologue_seen');
      w.state.data.inventory = { coins: 3235, moon_herb: 289, forest_mushroom: 34, tree_resin: 15, rune_dust: 10 };
      w.state.setObject('player_bag', { capacity: 100, version: 29, pending: { rune_dust: 2 } }); w.state.markEvent('city_merchant_open');
      u.goalBanner?.destroy(); u.goalBanner = null; u.refreshHud(); u.openShop('Лавка Бориса');
    });
    await page.getByRole('dialog', { name: 'Лавка Бориса', exact: true }).waitFor();
    const bounded = await page.evaluate(() => {
      const p = document.querySelector('.shop-window .acc-shell').getBoundingClientRect(), g = window.__game.canvas.getBoundingClientRect();
      const c = document.querySelector('.shop-card'), s = document.querySelector('.shop-submit').getBoundingClientRect();
      return { inside: p.x >= g.x-1 && p.y >= g.y-1 && p.right <= g.right+1 && p.bottom <= g.bottom+1,
        overflow: c.scrollWidth > c.clientWidth+1, submitInside: s.bottom <= p.bottom && s.top >= p.top };
    });
    assert.deepEqual(bounded, { inside: true, overflow: false, submitInside: true });
    assert.equal(await page.locator('.shop-product').count(), 7); assert.equal(await page.getByRole('tab', { name: 'Продать', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: 'Шаг 100', exact: true }).tap(); await page.getByRole('button', { name: 'Увеличить количество', exact: true }).tap();
    assert.equal(await page.getByRole('textbox', { name: 'Количество', exact: true }).inputValue(), '101');
    await page.getByRole('button', { name: 'Уменьшить количество', exact: true }).tap();
    assert.equal(await page.getByRole('textbox', { name: 'Количество', exact: true }).inputValue(), '1');
    await page.getByRole('button', { name: 'Шаг 10', exact: true }).tap(); await page.getByRole('button', { name: 'Увеличить количество', exact: true }).tap();
    assert.equal(await page.getByRole('textbox', { name: 'Количество', exact: true }).inputValue(), '11');
    await page.getByRole('textbox', { name: 'Количество', exact: true }).fill('0');
    assert.equal(await page.locator('.shop-submit').isDisabled(), true);
    await page.getByRole('textbox', { name: 'Количество', exact: true }).fill('100');
    assert.match(await page.locator('.shop-total').innerText(), /500/);
    await page.screenshot({ path: `${shots}/${width}x${height}-sell.png` });
    await page.evaluate(() => { const w=window.__witch, sell=w.actions.shopSell.bind(w.actions); w.__sellRequests=0; w.actions.shopSell=async (...args)=>{w.__sellRequests++;await new Promise(r=>setTimeout(r,250));return sell(...args);}; });
    await page.getByRole('button', { name: 'Продать 100 шт.', exact: true }).tap();
    assert.equal(await page.locator('.shop-submit').isDisabled(), true);
    await page.evaluate(() => document.querySelector('.shop-submit').dispatchEvent(new MouseEvent('click', { bubbles:true })));
    await page.getByRole('status').filter({ hasText: 'Продано: 100 шт.' }).waitFor();
    assert.equal(await page.evaluate(() => window.__witch.__sellRequests),1,'double click sends one trade');
    const inventory = () => page.evaluate(() => window.__witch.state.data.inventory);
    assert.equal((await inventory()).moon_herb, 189); assert.equal((await inventory()).coins, 3735);
    await page.getByRole('button', { name: 'Всё', exact: true }).tap(); assert.equal(await page.getByRole('textbox', { name: 'Количество', exact: true }).inputValue(), '189');
    await page.getByRole('button', { name: 'Продать 189 шт.', exact: true }).tap(); await page.getByRole('status').filter({ hasText: 'Продано: 189 шт.' }).waitFor();
    assert.equal((await inventory()).moon_herb, 0); assert.equal((await inventory()).coins, 4680);
    assert.equal(await page.locator('.shop-submit').isDisabled(), true);
    await page.getByRole('tab', { name: 'Купить', exact: true }).tap(); await page.getByRole('textbox', { name: 'Количество', exact: true }).fill('10');
    await page.getByRole('button', { name: 'Купить 10 шт.', exact: true }).tap(); await page.getByRole('status').filter({ hasText: 'Куплено: 10 шт.' }).waitFor();
    assert.equal((await inventory()).moon_herb, 10); assert.equal((await inventory()).coins, 4500);
    await page.locator('.shop-product[data-item="ice_crystal"]').tap(); await page.screenshot({ path: `${shots}/${width}x${height}-buy.png` });
    await page.getByRole('button', { name: 'Закрыть окно', exact: true }).tap();
    assert.equal(await page.evaluate(() => window.__witch.modalOpen), false); assert.equal(await page.evaluate(() => window.__game.scene.getScene('UIScene').modal), null);
    await page.evaluate(() => window.__game.scene.getScene('UIScene').openShop('Лавка Бориса')); await page.getByRole('dialog', { name: 'Лавка Бориса', exact: true }).waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.shop-window').count(), 0);
    console.log(`✓ Shop ${width}×${height}: bounded window, touch 1/10/100 steps, sell 100/all, buy 10, totals, scroll, X/Escape, reopen.`);
    await page.close();
  }
  assert.deepEqual(errors, []); console.log('✓ No page or console errors.');
} finally { await browser.close(); await vite.close(); }
