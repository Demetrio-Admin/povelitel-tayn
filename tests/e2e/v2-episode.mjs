import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.UI_BASE_URL || 'http://127.0.0.1:5196/');
  await page.waitForFunction(() => window.__game?.scene.isActive('ExplorationScene') && window.__game.scene.isActive('UIScene'), null, { timeout: 45000 });
  const step = () => page.evaluate(() => window.__witch.state.getObject('horizon_campaign')?.step);
  const waitStep = step => page.waitForFunction(id => window.__witch.state.getObject('horizon_campaign')?.step === id, step);
  const waitMode = mode => page.waitForFunction(want => window.__witch.mode === want && !window.__witch.modalOpen, mode);

  async function canvasPoint(sceneKey, x, y, world = false) {
    return page.evaluate(({ sceneKey, x, y, world }) => {
      const game = window.__game, scene = game.scene.getScene(sceneKey), canvas = game.canvas;
      const cam = scene.cameras.main, box = canvas.getBoundingClientRect();
      const ratioX = box.width / game.scale.gameSize.width;
      const ratioY = box.height / game.scale.gameSize.height;
      return {
        x: box.left + (world ? (x - cam.worldView.x) * cam.zoom : x) * ratioX,
        y: box.top + (world ? (y - cam.worldView.y) * cam.zoom : y) * ratioY,
      };
    }, { sceneKey, x, y, world });
  }

  async function visit(id, touch = false) {
    const target = await page.evaluate(id => {
      const scene = window.__game.scene.getScene('ExplorationScene');
      const obj = scene.objects.find(o => o.id === 'v2_' + id && o.isAvailable());
      if (!obj) return null;
      return { x: obj.x, y: obj.y - Math.min(40, obj.sprite.displayHeight / 3) };
    }, id);
    assert.ok(target, 'Available world target ' + id);
    if (touch) {
      const p = await canvasPoint('ExplorationScene', target.x, target.y, true);
      assert.ok(p.x >= 0 && p.x <= 390 && p.y >= 0 && p.y <= 844, 'Mirra can be tapped on screen');
      await page.touchscreen.tap(p.x, p.y);
      return;
    }
    await page.evaluate(({ x, y }) => {
      const scene = window.__game.scene.getScene('ExplorationScene');
      const cam = scene.cameras.main;
      scene.onTap({ x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom });
    }, target);
  }

  const modal = () => page.waitForFunction(() => !!window.__game.scene.getScene('UIScene').modal);
  async function next() {
    await modal();
    await page.evaluate(() => window.__game.scene.getScene('UIScene').pressModalButton(true));
  }
  async function stone(id) {
    const pos = await page.evaluate(id => {
      const battle = window.__game.scene.getScene('CombatScene');
      return { x: battle.stones[id].x, y: battle.stones[id].y - 29 };
    }, id);
    const point = await canvasPoint('CombatScene', pos.x, pos.y);
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForFunction(id => window.__game.scene.getScene('CombatScene').selected === id, id);
  }
  const cast = id => page.evaluate(id => {
    const ui = window.__game.scene.getScene('UIScene');
    ui.pressDock(ui.dock.findIndex(slot => slot.id === id));
  }, id);
  const ready = () => page.waitForFunction(() => {
    const scene = window.__game.scene.getScene('CombatScene');
    return scene.sys.isActive() && scene.started && !scene.ended;
  });

  assert.equal(await step(), 'intro');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').loc.id), 'forest');
  await visit('intro', true);
  for (let i = 0; i < 3; i++) await next();
  await waitStep('spark');

  await visit('spark');
  await ready();
  await stone('light');
  await cast('fire');
  await page.waitForFunction(() => window.__game.scene.getScene('CombatScene').battle.objects.light.tag === 'heat');
  await stone('light');
  await cast('telekinesis');
  await page.waitForFunction(() => window.__game.scene.getScene('CombatScene').battle.combos === 1);
  await waitStep('upgrade');
  await next();
  await waitMode('exploration');

  await visit('upgrade');
  await modal();
  await next();
  await waitStep('frost');
  await visit('frost');
  await ready();
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('CombatScene').battle.intervals.wand), 26);
  await waitStep('thaw');
  await next();
  await next();
  await waitStep('veda');
  await visit('veda');
  await next();
  await next();
  await waitStep('grom');
  await visit('grom');
  await next();
  await next();
  await waitStep('hunt');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').companion.id), 'fox');

  await visit('camp-edge');
  await ready();
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('CombatScene').battle.fox), true);
  await page.waitForFunction(() => window.__witch.state.getObject('horizon_campaign').dailyWins === 1);
  await next();
  await waitMode('exploration');
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.isActive('ExplorationScene'));
  assert.equal(await step(), 'hunt');
  assert.equal(await page.evaluate(() => window.__witch.state.getObject('horizon_campaign').dailyWins), 1);
  assert.deepEqual(errors, []);
  console.log('Phaser mobile playthrough passed. Forest, original scenes and HUD, two story battles, camp, hunt and reload.');
} finally {
  await browser.close();
}
