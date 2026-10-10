// Browser plugin not available; Playwright validates actual Phaser rendering and touch input.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_ANON_KEY = '';
const shots = process.env.UI_SHOTS_DIR || '/tmp/witch-viewport';
await fs.mkdir(shots, { recursive: true });
const vite = process.env.UI_BASE_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 5189, strictPort: true, hmr: false,
  fs: { allow: [process.cwd(), await fs.realpath('node_modules')] } } });
await vite?.listen();
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5189/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const checkFrame = async (page, portrait) => {
  await page.waitForFunction(portrait => {
    const host = document.getElementById('game').getBoundingClientRect();
    const canvas = document.querySelector('#game canvas')?.getBoundingClientRect();
    // v0.37.1: the canvas always fills its host; on landscape screens the host is a centred area up to 4:3
    // (a wider map instead of a narrow portrait strip).
    const page = document.documentElement.getBoundingClientRect();
    return canvas && Math.abs(host.width - canvas.width) < 1 && Math.abs(host.height - canvas.height) < 1
      && (portrait || (canvas.width / canvas.height <= 4 / 3 + .01 && Math.abs(host.x + host.width / 2 - page.width / 2) < 2));
  }, portrait);
  const result = await page.evaluate(() => {
    const game = window.__game, r = game.canvas.getBoundingClientRect(), host = document.getElementById('game').getBoundingClientRect();
    return { width: r.width, height: r.height, x: r.x, y: r.y, right: r.right, bottom: r.bottom,
      host: { x: host.x, y: host.y, right: host.right, bottom: host.bottom }, logical: { width: game.scale.width, height: game.scale.height },
      uniform: Math.abs(r.width / game.scale.width - r.height / game.scale.height) < .001 };
  });
  assert.ok(result.uniform, 'sprites keep a uniform scale');
  assert.ok(result.x >= result.host.x - 1 && result.y >= result.host.y - 1 && result.right <= result.host.right + 1 && result.bottom <= result.host.bottom + 1, JSON.stringify(result));
  return result;
};
// Convert authored UI coordinates through the actual anchor camera and canvas, including letterboxing.
const tap = async (page, point, layer = 'center', scene = 'UIScene') => {
  const at = await page.evaluate(({ point, layer, scene }) => {
    const game = window.__game, s = game.scene.getScene(scene), cam = s.viewport?.cameras[layer] || s.cameras.main;
    const box = game.canvas.getBoundingClientRect();
    return { x: box.x + (point.x - cam.scrollX) * box.width / game.scale.width,
      y: box.y + (point.y - cam.scrollY) * box.height / game.scale.height };
  }, { point, layer, scene });
  await page.touchscreen.tap(at.x, at.y);
  await page.waitForTimeout(180);
};
const tapText = async (page, label) => {
  const point = await page.evaluate(label => {
    const ui = window.__game.scene.getScene('UIScene');
    let text;
    const visit = o => { if (o.type === 'Text' && o.text === label && o.visible) text ||= o; (o.list || []).forEach(visit); };
    visit(ui.modal.container);
    if (!text) return null;
    const bounds = text.getBounds(); return { x: bounds.centerX, y: bounds.centerY };
  }, label);
  assert.ok(point, label);
  await tap(page, point);
};
try {
  for (const [width, height] of [[390, 638], [360, 800], [412, 915], [768, 1024], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 900, hasTouch: true });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base);
    await page.waitForFunction(() => window.__game?.scene.isActive('MenuScene'), null, { timeout: 120000 });
    assert.match(await page.title(), /Колдовство/);
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    await checkFrame(page, width < height);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}/${width}x${height}-menu.png` });
    if (width === 390) {
      const primary = await page.evaluate(() => {
        const r = window.__game.scene.getScene('MenuScene').primary.hit.getBounds();
        return { x: r.centerX, y: r.centerY };
      });
      await tap(page, primary, 'center', 'MenuScene');
    } else await page.goto(new URL('?skipmenu', base).href);
    await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('UIScene').dlg, null, { timeout: 120000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}/${width}x${height}-dialogue.png` });
    await page.evaluate(() => {
      const ui = window.__game.scene.getScene('UIScene'); ui.closeDialogue(true);
      window.__witch.settings.set('hints', false);
      window.__witch.state.markEvent('prologue_seen');
      ui.goalBanner?.destroy(); ui.goalBanner = null;
      window.__witch.state.addItem('moon_herb', 4);
    });
    await page.waitForTimeout(500);
    const frame = await checkFrame(page, width < height);
    const uiFit = await page.evaluate(() => {
      const s = window.__game.scene.getScene('UIScene'), { width, height } = s.scale.gameSize;
      const controls = [[s.portraitHit, 'topLeft'], [s.journalBtn.hit, 'topRight'], [s.menuBtn.hit, 'topRight'], [s.buttons.bag.bg, 'bottom']];
      return controls.every(([o, name]) => {
        const r = o.getBounds(), cam = s.viewport.cameras[name];
        return r.left - cam.scrollX >= 0 && r.right - cam.scrollX <= width && r.top - cam.scrollY >= 0 && r.bottom - cam.scrollY <= height;
      });
    });
    assert.ok(uiFit, 'HUD and bag hit areas stay inside the canvas');
    await page.screenshot({ path: `${shots}/${width}x${height}-map.png` });
    await tap(page, { x: 630, y: 1154 }, 'bottom');
    await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Сумка');
    await tapText(page, 'Расходники');
    await page.waitForFunction(() => window.__game.scene.getScene('UIScene').bagTab === 'consumables');
    await tapText(page, 'Ресурсы');
    await page.waitForFunction(() => window.__game.scene.getScene('UIScene').bagTab === 'resources');
    await page.screenshot({ path: `${shots}/${width}x${height}-bag.png` });
    await page.evaluate(() => window.__game.scene.getScene('UIScene').closeModal(null));
    // A free-map tap still reaches the world with the correct coordinates, after the new layout.
    await page.evaluate(() => { window.__lastTap = null; window.__witch.bus.on('world:tap', p => window.__lastTap = p); });
    const canvas = await page.locator('#game canvas').boundingBox();
    await page.touchscreen.tap(canvas.x + canvas.width * .48, canvas.y + canvas.height * .48);
    await page.waitForTimeout(100);
    const pointer = await page.evaluate(() => window.__lastTap);
    assert.ok(pointer, 'map touch dispatches movement');
    assert.ok(Math.abs(pointer.x / frame.logical.width - .48) < .01, 'world tap uses the expanded canvas coordinates');
    if (width === 390) {
      // Open a real HTML registration overlay and emulate a keyboard-only visual viewport resize.
      await page.evaluate(async () => {
        const { showRegister } = await import('/src/ui/accountUI.js');
        window.__registration = showRegister({ heroId: 'witch' }, { onCancel: () => {} });
      });
      await page.locator('.acc-field input').first().focus();
      const before = await page.locator('#game canvas').boundingBox();
      await page.evaluate(() => {
        Object.defineProperty(visualViewport, 'height', { configurable: true, value: 360 });
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForTimeout(180);
      const after = await page.locator('#game canvas').boundingBox();
      assert.ok(Math.abs(before.height - after.height) < 1, 'keyboard does not move/resize the map');
      const auth = await page.locator('.acc-ov').boundingBox();
      assert.ok(auth.y + auth.height <= 361, 'registration follows the visible keyboard area');
      await page.screenshot({ path: `${shots}/keyboard.png` });
      await page.evaluate(() => {
        document.activeElement.blur(); window.__registration.close(); delete visualViewport.height;
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await checkFrame(page, false);
      await page.setViewportSize({ width: 390, height: 844 });
      await checkFrame(page, true);
      await page.screenshot({ path: `${shots}/390x844-after-rotation.png` });
      await page.evaluate(() => { const ui = window.__game.scene.getScene('UIScene'); ui.closeModal(null); ui.openSettings(); });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${shots}/fullscreen-settings.png` });
      if (await page.evaluate(() => document.fullscreenEnabled)) {
        await tapText(page, 'На весь экран');
        await page.waitForFunction(() => !!document.fullscreenElement);
        await checkFrame(page, true);
        await tapText(page, 'Свернуть');
        await page.waitForFunction(() => !document.fullscreenElement);
        console.log('✓ Fullscreen enter/exit through a real touch gesture');
      }
      await page.evaluate(() => {
        const ui = window.__game.scene.getScene('UIScene'); ui.closeModal(null);
        window.__witch.abilities.unlock('telekinesis', 1);
        window.__game.scene.sleep('ExplorationScene');
        window.__game.scene.run('CombatScene', { enemyType: 'forest_scavenger', spawnId: 'forest_scavenger_01' });
        window.__game.scene.bringToTop('UIScene');
      });
      await page.waitForTimeout(700);
      await checkFrame(page, true);
      await page.screenshot({ path: `${shots}/390x844-combat.png` });
      const selected = await page.evaluate(() => {
        const c = window.__game.scene.getScene('CombatScene'), o = [...c.fieldViews.values()][0];
        return { x: o.home.x, y: o.home.y };
      });
      await tap(page, selected, 'center', 'CombatScene');
      assert.ok(await page.evaluate(() => window.__game.scene.getScene('CombatScene').cm.selectedId), 'combat field touch selects an object');
    }
    console.log(`✓ ${width}×${height}: full viewport, uniform sprites, menu/dialogue, HUD, touch bag tab and map tap`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('✓ No runtime/console errors; rotation and keyboard overlay checks passed.');
} finally { await browser.close(); await vite?.close(); }
