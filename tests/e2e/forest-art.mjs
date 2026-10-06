// Real Phaser regression: existing crossroads sign, illustrated map, small animated
// wildlife, and a full bird crossing while the camera moves. Shots stay outside the repo.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.FOREST_SHOTS_DIR || '/tmp/witch-rpg-forest-art';
await fs.mkdir(out, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5181, strictPort: true, hmr: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ok = message => console.log('  ✓', message);
try {
  for (const [name, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1365, height: 900 }]]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: name === 'mobile', deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400 && /\/assets\//.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto('http://127.0.0.1:5181/?reset&skipmenu');
    await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player);
    assert.match(await page.title(), /Колдовство/);
    assert.ok(await page.locator('canvas').count());
    const art = await page.evaluate(() => {
      const s = window.__game.scene.getScene('ExplorationScene');
      return ['world_map_01', 'life_bird_1', 'life_bird_2', 'life_bird_3', 'life_rabbit_1', 'life_rabbit_2', 'life_rabbit_3', 'life_squirrel_1', 'life_squirrel_2', 'life_squirrel_3']
        .map(k => ({ k, width: s.textures.get(k).getSourceImage().width, height: s.textures.get(k).getSourceImage().height }));
    });
    assert.ok(art.every(a => a.k === 'world_map_01' ? a.width === 876 && a.height === 1140 : a.width === 192 && a.height === 160), JSON.stringify(art));
    ok(`${name}: all ten real images decoded and loaded, no fallback textures`);
    await page.evaluate(() => {
      const w = window.__witch, s = window.__game.scene.getScene('ExplorationScene'), u = window.__game.scene.getScene('UIScene');
      w.state.markEvent('prologue_seen'); w.settings.set('hints', false); w.tutorial.hide();
      if (u.dlg) u.closeDialogue(true); u.closeModal(null); u.goalBanner?.destroy();
      s.player.stop(); s.player.setPosition(1184, 4416);
      s.cameras.main.stopFollow(); s.cameras.main.centerOn(1184, 4416 - s.followOffsetY); s.cameras.main.preRender();
      // Software-rendered CI can be slow; test full animation rather than adaptive Lite mode.
      window.__fullLife = setInterval(() => { s.life.slow = 0; s.life.lite = false; }, 50);
      for (const timer of s.life.timers.slice(1)) timer.remove(false);
      for (const f of [...s.life.flyers]) f.kill();
      for (const e of s.enemies) e.grace = 10000;
    });
    await page.waitForTimeout(600);
    const signs = await page.evaluate(() => {
      const s = window.__game.scene.getScene('ExplorationScene');
      return { exits: s.objects.filter(o => o.cfg.kind === 'exit').map(o => [o.id, o.x, o.y]),
        decor: [...s.propViews.values()].filter(v => v.p.k === 'signpost_01').length };
    });
    assert.deepEqual(signs, { exits: [['exit_forest', 1104, 4416]], decor: 0 });
    await page.screenshot({ path: path.join(out, `${name}-01-crossroads.png`) });
    const tapGame = async (x, y) => {
      const box = await page.locator('canvas').first().boundingBox();
      await page.touchscreen.tap(box.x + x * box.width / 720, box.y + y * box.height / 1280);
    };
    const point = await page.evaluate(() => {
      window.__game.scale.updateBounds();
      const cam = window.__game.scene.getScene('ExplorationScene').cameras.main;
      return { x: (1104 - cam.worldView.x) * cam.zoom, y: (4370 - cam.worldView.y) * cam.zoom };
    });
    await tapGame(point.x, point.y);
    await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Карта мира');
    await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.container.alpha > 0.99);
    await page.screenshot({ path: path.join(out, `${name}-02-map.png`) });
    ok(`${name}: real touch on the crossroads sign opens the world map`);

    // New picture, same unlocking and travel rules.
    const cityLabel = await page.evaluate(() => {
      const content = window.__game.scene.getScene('UIScene').modal.container.list.find(o => o.type === 'Container' && o.list.some(child => child.text === 'Город 🔒'));
      const label = content.list.find(o => o.text === 'Город 🔒');
      const hit = content.list.find(o => o.type === 'Zone' && Math.abs(o.x - label.x) < 2 && Math.abs(o.y - label.y - 1) < 3);
      const p = hit.getWorldTransformMatrix().transformPoint(0, 0); return { x: p.x, y: p.y };
    });
    await tapGame(cityLabel.x, cityLabel.y);
    await page.waitForFunction(() => window.__game.scene.getScene('UIScene').mapSel === 'city');
    assert.equal(await page.evaluate(() => window.__game.scene.getScene('UIScene').modal.buttons.length), 1);
    await page.evaluate(() => {
      window.__witch.state.markEvent('ch2_start');
      const u = window.__game.scene.getScene('UIScene'); u.mapSel = 'city'; u.openMap({ exit: 'exit_forest' });
    });
    assert.equal(await page.evaluate(() => window.__game.scene.getScene('UIScene').modal.buttons.length), 2);
    await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.container.alpha > 0.99);
    // Click the actual destination label and footer, not just emit a travel event.
    const go = await page.evaluate(() => {
      const u = window.__game.scene.getScene('UIScene');
      const b = u.modal.views[0]; return { x: b.hit.x, y: b.hit.y };
    });
    await tapGame(go.x, go.y);
    await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').loc?.id === 'city');
    await page.evaluate(() => window.__witch.bus.emit('story:map-travel', 'forest'));
    await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').loc?.id === 'forest' && window.__witch.mode === 'exploration');
    const arrival = await page.evaluate(() => { const p = window.__game.scene.getScene('ExplorationScene').player; return [Math.round(p.x), Math.round(p.y)]; });
    assert.ok(Math.abs(arrival[0] - 1200) < 30 && Math.abs(arrival[1] - 4416) < 30, JSON.stringify(arrival));
    await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); u.mapSel = 'city'; u.openMap(); });
    assert.equal(await page.evaluate(() => window.__game.scene.getScene('UIScene').modal.buttons.length), 1);
    await page.evaluate(() => window.__game.scene.getScene('UIScene').closeModal(null));
    ok(`${name}: locked city stays closed; unlocked trip works; return is at the crossroads; menu map remains view-only`);

    if (name === 'mobile') {
      await page.evaluate(() => {
        clearInterval(window.__fullLife);
        const s = window.__game.scene.getScene('ExplorationScene'), L = s.life;
        s.player.stop(); s.player.setPosition(1220, 4500);
        s.cameras.main.stopFollow(); s.cameras.main.centerOn(1220, 4500 - s.followOffsetY); s.cameras.main.preRender();
        for (const timer of L.timers.slice(1)) timer.remove(false);
        for (const f of [...L.flyers]) f.kill();
        window.__fullLife = setInterval(() => { L.slow = 0; L.lite = false; }, 50);
        L.nextAnimal = 'life_rabbit_';
        window.__animals = [L.runAnimal(), L.runAnimal()].filter(Boolean);
      });
      const animals = await page.evaluate(() => window.__animals.map(f => ({ key: f.img.texture.key, x: f.img.x, y: f.img.y, w: f.img.displayWidth, h: f.img.displayHeight })));
      assert.equal(animals.length, 2);
      assert.ok(animals.some(a => a.key.startsWith('life_rabbit_') && a.w <= 44.1 && a.h <= 36.8));
      assert.ok(animals.some(a => a.key.startsWith('life_squirrel_') && a.w <= 42.1 && a.h <= 35.1));
      await page.waitForTimeout(300);
      const moving = await page.evaluate(() => window.__animals.filter(f => !f.dead).map(f => ({ key: f.img.texture.key, x: f.img.x, y: f.img.y, w: f.img.displayWidth })));
      assert.ok(moving.some(a => animals.some(b => b.key.split('_').slice(0, 2).join() === a.key.split('_').slice(0, 2).join() && Math.hypot(a.x - b.x, a.y - b.y) > 10)));
      await page.screenshot({ path: path.join(out, 'mobile-03-small-animals.png') });
      await page.waitForFunction(() => window.__animals.every(f => f.dead), null, { timeout: 30000 });
      ok('rabbit and squirrel both run, animate at the small scale and hide behind their destination');

      for (const direction of [1, -1]) {
        await page.evaluate(direction => {
          const s = window.__game.scene.getScene('ExplorationScene'), L = s.life;
          const original = L.rnd;
          const seq = [direction === 1 ? 0.1 : 0.9, 0.3, 0.8, 0.2, 0.4]; let at = 0;
          L.rnd = () => seq[at++ % seq.length]; L.flyBird(); L.rnd = original;
          window.__bird = [...L.flyers].find(f => f.img.texture.key.startsWith('life_bird_'));
          window.__birdExit = null;
          const img = window.__bird.img, destroy = img.destroy;
          img.destroy = function () { window.__birdExit = { x: this.x, w: this.displayWidth, edge: s.cameras.main.width }; return destroy.call(this); };
          s.tweens.timeScale = 3;
        }, direction);
        const start = await page.evaluate(() => { const img = window.__bird.img; return { x: img.x, w: img.displayWidth, scroll: img.scrollFactorX }; });
        assert.equal(start.scroll, 0); assert.ok(start.w <= 30.1);
        await page.waitForFunction(() => { const b = window.__bird, W = window.__game.scene.getScene('ExplorationScene').cameras.main.width; return !b.dead && b.img.x > W * 0.35 && b.img.x < W * 0.65; }, null, { timeout: 40000 });
        await page.evaluate(() => {
          const s = window.__game.scene.getScene('ExplorationScene');
          // Shift the camera while the bird is in the middle of the road.
          s.cameras.main.centerOn(850, 3650); s.cameras.main.preRender();
        });
        assert.equal(await page.evaluate(() => window.__bird.dead), false);
        if (direction === 1) await page.screenshot({ path: path.join(out, 'mobile-04-bird-crossing.png') });
        await page.waitForFunction(() => window.__birdExit, null, { timeout: 40000 });
        const exit = await page.evaluate(() => window.__birdExit);
        assert.ok(direction === 1 ? exit.x - exit.w / 2 > exit.edge : exit.x + exit.w / 2 < 0, JSON.stringify(exit));
        assert.equal(await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').life.flyers.size), 0);
      }
      ok('bird crosses the entire screen in both directions while the camera moves; removed only outside the opposite edge, without leftovers');
      await page.evaluate(() => { window.__game.scene.getScene('ExplorationScene').tweens.timeScale = 1; window.__witch.settings.set('anim', false); });
      assert.equal(await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').life.running), false);
      ok('the live-world setting still stops the animations');
    }
    assert.deepEqual(errors.filter(e => !/supabase|fonts.googleapis/i.test(e)), []);
    ok(`${name}: no page, console or asset-loading errors`);
    await context.close();
  }
} finally {
  await browser.close(); await server.close();
}
console.log('\n✓ Forest art and movement: all browser checks passed');
