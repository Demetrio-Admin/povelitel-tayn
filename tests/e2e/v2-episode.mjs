import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
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
    await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').canAct());
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
    const point = await canvasPoint('CombatScene', pos.x, pos.y, true);
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForFunction(id => window.__game.scene.getScene('CombatScene').selected === id, id);
  }
  async function cast(id) {
    const point = await page.evaluate(id => {
      const game = window.__game, ui = game.scene.getScene('UIScene'), box = game.canvas.getBoundingClientRect();
      const camera = ui.viewport.cameras.bottom, button = ui.buttons[id];
      return { x: box.left + (button.x - camera.scrollX) * box.width / camera.width,
        y: box.top + (button.y - camera.scrollY) * box.height / camera.height };
    }, id);
    await page.touchscreen.tap(point.x, point.y);
  }
  const ready = () => page.waitForFunction(() => {
    const scene = window.__game.scene.getScene('CombatScene');
    return scene.sys.isActive() && scene.started && !scene.ended;
  });
  const gateState = () => page.evaluate(() => {
    const scene = window.__game.scene.getScene('ExplorationScene');
    return { blocked: scene.hearth.blocker.body.enable, frozen: scene.hearth.frozen, y: scene.player.y,
      outsideReachable: scene.planPath(688, 949)?.complete };
  });

  assert.equal(await step(), 'intro');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').loc.id), 'mirra-hearth');
  assert.deepEqual(await gateState(), { blocked: true, frozen: false, y: 733, outsideReachable: false });
  await page.keyboard.down('s');
  await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').player.y >= 810);
  await page.waitForTimeout(500);
  await page.keyboard.up('s');
  assert.ok((await gateState()).y <= 832, 'The closed gate also stops direct movement');
  const outside = await canvasPoint('ExplorationScene', 688, 949, true);
  await page.touchscreen.tap(outside.x, outside.y);
  await page.waitForTimeout(450);
  assert.ok((await gateState()).y <= 832, 'A tap past the gate stops inside the yard');
  await visit('intro', true);
  await next();
  await next();
  await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').riftShield?.visible);
  assert.equal(await step(),'intro');
  await next();
  await waitStep('spark');
  console.log('Reached spark');

  await visit('spark');
  await ready();
  await cast('telekinesis');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('CombatScene').battle.tick), 0,
    'The first fight waits for the player to learn the combo');
  await stone('light');
  await cast('fire');
  await page.waitForFunction(() => window.__game.scene.getScene('CombatScene').battle.objects.light.tag === 'heat');
  await stone('light');
  await cast('telekinesis');
  await page.waitForFunction(() => window.__game.scene.getScene('CombatScene').battle.combos === 1);
  await waitStep('lantern');
  await next();
  await waitMode('exploration');
  await visit('lantern');
  await waitStep('upgrade');
  assert.equal(await page.evaluate(() => window.__witch.state.item('mirra_lantern_cracked')), 1);
  assert.equal(await page.evaluate(() => window.__witch.state.item('grimoire_page_fragment')), 1);
  console.log('Reached upgrade');

  await visit('upgrade');
  await modal();
  await next();
  await waitStep('frost');
  await page.waitForFunction(() => {
    const scene = window.__game.scene.getScene('ExplorationScene');
    return scene.hearth.frozen && scene.canAct();
  });
  assert.equal((await gateState()).blocked, true);
  console.log('Reached frost');
  await visit('frost');
  await ready();
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('CombatScene').battle.intervals.wand), 26);
  await waitStep('thaw');
  console.log('Reached thaw');
  await next();
  await page.waitForFunction(() => {
    const scene = window.__game.scene.getScene('ExplorationScene');
    return scene.canAct() && !scene.hearth.frozen;
  });
  assert.equal((await gateState()).blocked, true, 'The latch is still closed after the ice melts');
  await visit('thaw', true);
  await waitStep('veda');
  assert.equal((await gateState()).blocked, false);
  assert.equal((await gateState()).outsideReachable, true);
  console.log('Reached veda');
  await visit('veda');
  await next();
  await next();
  await waitStep('grom');
  console.log('Reached grom');
  await visit('grom');
  await next();
  await next();
  await waitStep('hunt');
  console.log('Reached hunt');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').companion.id), 'fox');

  await visit('workbench');
  await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').interaction.focus?.id === 'v2_workbench');
  await cast('fire');
  await next();
  await page.waitForFunction(() => window.__witch.state.getObject('horizon_campaign').workbenchRestored);
  console.log('Restored Mirra’s workbench');

  const reachedHunt=await page.evaluate(()=>{
    const world=window.__game.scene.getScene('ExplorationScene');
    const enemy=world.objects.find(o=>o.id==='v2_camp-edge' && o.isAvailable());
    if (!enemy||!world.canAct()) return false;
    const route=world.planPath(enemy.x,enemy.y);
    if (!route?.complete) return false;
    world.player.setPosition(route.end.x,route.end.y);
    world.interaction.setFocus(enemy);
    return world.interaction.act(null);
  });
  assert.ok(reachedHunt,'A walkable route connects the restored workbench to the first hunt');
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
  console.log('Phaser mobile playthrough passed. Walk and tap collisions, first combo, frozen and opened gate, camp, hunt and reload.');
} finally {
  await browser.close();
}
