// Render the production chapter II pack in real Phaser, including story state transitions.
// Screenshots stay outside the repository. CHROME_PATH optionally selects an installed Chromium.
// ART_SHOTS_DIR=/tmp/chapter2-art node tests/e2e/chapter2-art.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.ART_SHOTS_DIR || '/tmp/chapter2-art';
await fs.mkdir(out, { recursive: true });
const server = process.env.UI_BASE_URL ? null : await createServer({ root, server: { host: '127.0.0.1', port: 5180, strictPort: true, hmr: false } });
await server?.listen();
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5180/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ok = message => console.log('  ✓', message);
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (/Texture.*not found|__MISSING/.test(m.text()) || m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && /\/assets\/chapter2\//.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(new URL('?reset&skipmenu', base).href);
  await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player);
  await page.evaluate(async () => {
    const w = window.__witch, { EV } = await import('/src/config/events.js');
    for (const event of Object.values(EV)) w.state.markEvent(event);
    w.state.markEvent('prologue_seen');
    for (const id of ['scavenger_01', 'guardian_01', 'chapter_trial_01']) w.state.markEnemyDefeated(id);
    w.state.markEvent('chapter_1_complete'); w.state.markEvent('ch2_start');
    w.state.data.heroLevel = 15; w.state.data.hp = 500; w.state.data.mana = 100;
    w.state.data.stats.combats.push({ enemy: 'forest_scavenger', result: 'victory', timeSec: 25 });
    for (const id of ['telekinesis', 'fire', 'seal', 'ice']) w.abilities.unlock(id, id === 'telekinesis' ? 3 : 1);
    w.state.setBuild({ slots: ['telekinesis', 'seal', 'ice'] });
    w.settings.set('hints', false); w.tutorial.hide();
    const ui=window.__game.scene.getScene('UIScene');
    if (ui.dlg) ui.closeDialogue(true);
    ui.closeModal(null);
    window.__game.scale.refresh();
    w.bus.emit('story:map-travel', 'city');
  });
  await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').loc?.id === 'city' && window.__witch.mode === 'exploration');
  const events = async list => page.evaluate(list => {
    const w = window.__witch, s = window.__game.scene.getScene('ExplorationScene');
    for (const event of list) w.state.markEvent(event);
    s.refreshAll(); w.bus.emit('quest:changed'); w.bus.emit('ui:hud-refresh');
  }, list);
  const position = async (x, y) => {
    await page.evaluate(({x,y}) => {
      const s = window.__game.scene.getScene('ExplorationScene');
      window.__game.scene.getScene('UIScene').goalBanner?.destroy();
      s.player.stop(); s.player.setPosition(x,y);
      // Fixture teleport: snap the camera before converting world coordinates to a touch.
      // Headless software rendering may defer its next frame until the screenshot/input.
      s.cameras.main.stopFollow();
      s.cameras.main.centerOn(x,y-s.followOffsetY);
      s.cameras.main.preRender();
      for (const e of s.enemies) e.grace = 10000;
    }, {x,y});
    await page.waitForTimeout(1100);
  };
  const shot = async (name, x, y) => {
    if (x != null) await position(x,y);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };
  const clickWorld = async (x,y) => {
    const cam = await page.evaluate(() => {
      window.__game.scale.updateBounds();
      const c = window.__game.scene.getScene('ExplorationScene').cameras.main;
      return {x:c.worldView.x,y:c.worldView.y,zoom:c.zoom};
    });
    const box = await page.locator('canvas').first().boundingBox();
    await page.touchscreen.tap(box.x + (x-cam.x)*cam.zoom*box.width/720, box.y + (y-cam.y)*cam.zoom*box.height/1280);
    await page.waitForTimeout(200);
  };
  await events(['ch2_city_arrived', 'ch2_plaza_cleared', 'ch2_met_ilaria', 'ch2_trace_found']);
  await page.evaluate(() => {
    window.__witch.state.markEnemyDefeated('plaza_critter');
    const s=window.__game.scene.getScene('ExplorationScene');
    s.enemies.find(e=>e.id==='plaza_critter').clear(false); s.refreshAll();
  });
  await shot('01-plaza', 2780,3670);
  await shot('02-market-bank', 3290,3680);
  await shot('03-archive', 2650,2910);
  await shot('04-society', 3220,2850);
  const humans = await page.evaluate(() => {
    const s = window.__game.scene.getScene('ExplorationScene');
    return s.objects.filter(o => o.cfg.kind === 'npc').map(o => [o.id, o.sprite.displayHeight]);
  });
  assert.ok(humans.every(([,height]) => height >= 116 && height <= 128), JSON.stringify(humans));
  ok('городские люди одного масштаба с героем, все NPC используют новые рисунки');
  await position(2620,3330); await clickWorld(2560,3220);
  await page.waitForFunction(() => window.__witch.modalOpen && window.__game.scene.getScene('UIScene').dlg?.npcId === 'ilaria', null, {timeout:10000}).catch(async error => {
    console.log(await page.evaluate(() => { const s=window.__game.scene.getScene('ExplorationScene'),u=window.__game.scene.getScene('UIScene'),o=s.objects.find(o=>o.id==='npc_ilaria'),p=u.input.activePointer; return {player:[s.player.x,s.player.y],camera:s.cameras.main.worldView,pointer:[p.x,p.y],world:s.cameras.main.getWorldPoint(p.x,p.y),canAct:s.canAct(),focus:s.interaction.focus?.id,modal:u.modal?.opts,mode:[window.__witch.mode,u.mode],npc:[o.x,o.y,o.isAvailable()],target:s.player.moveTarget}; }));
    await shot('failure-dialogue'); throw error;
  });
  await page.waitForTimeout(600);
  await shot('05-dialogue-ilaria');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.scene.getScene('UIScene').closeModal(null));
  ok('нажатие на Иларию открывает настоящий диалог и её портрет');
  await events(['ch2_cargo_start', 'ch2_severin_asked', 'ch2_frost_wave', 'ch2_quarter_open', 'ch2_construct_unstable', 'ch2_nerys_met', 'ch2_choice_start']);
  await shot('06-frozen-houses',2910,1820);
  const houses = await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').colliderObjects.filter(o => o.texture?.key === 'city_frozen_house').map(o => [o.x,o.y,o.displayWidth,o.displayHeight]));
  assert.equal(houses.length,4);
  await shot('07-rescue-quarter',3020,2350);
  await position(2910,2090); await clickWorld(2910,1980);
  await page.waitForFunction(() => window.__witch.state.getObject('fq_water')?.state === 'frozen',null,{timeout:8000}).catch(async error => {
    console.log(await page.evaluate(() => { const s=window.__game.scene.getScene('ExplorationScene'),u=window.__game.scene.getScene('UIScene'),o=s.objects.find(o=>o.id==='fq_water'),p=u.input.activePointer,w=window.__witch; return {player:[s.player.x,s.player.y],pointer:[p.x,p.y],world:s.cameras.main.getWorldPoint(p.x,p.y),scale:{bounds:window.__game.scale.canvasBounds,display:window.__game.scale.displayScale},canAct:s.canAct(),focus:s.interaction.focus?.id,slots:w.state.equippedGifts(),ice:w.state.isUnlocked('ice'),saved:o.saved,modal:u.modal?.opts,target:s.player.moveTarget}; }));
    await shot('failure-water'); throw error;
  });
  await page.waitForTimeout(700);
  const ice = await page.evaluate(() => {
    const o = window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id==='fq_water');
    return {texture:o.sprite.texture.key,blocked:!!o.blocker};
  });
  assert.deepEqual(ice,{texture:'ice_floor_01',blocked:false});
  await shot('08-ice-crossing');
  ok('нажатие на воду замораживает её и открывает проход');
  await page.evaluate(() => {
    const w = window.__witch;
    w.state.markEnemyDefeated('fq_collector'); w.state.markEnemyDefeated('fq_critter');
    const s=window.__game.scene.getScene('ExplorationScene');
    s.enemies.filter(e=>['fq_collector','fq_critter'].includes(e.id)).forEach(e=>e.clear(false));
    s.refreshAll();
  });
  await position(3360,2220); await clickWorld(3340,2085);
  await page.waitForFunction(() => window.__witch.state.hasEvent('ch2_rescue_door'));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__game.scene.getScene('UIScene').closeModal(null));
  await shot('08b-rescued-residents',3360,2250);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id==='fq_door').sprite.texture.key),'city_door_open');
  await position(2560,2260); await clickWorld(2500,2190);
  await page.waitForFunction(() => window.__witch.state.hasEvent('ch2_rescue_cellar'));
  await shot('08c-open-cellar',2570,2260);
  await events(['ch2_lab_found']);
  await position(2070,3990); await clickWorld(2070,4025);
  await page.waitForFunction(() => window.__witch.state.getObject('lab_seal')?.state === 'frozen');
  await shot('08d-open-laboratory',2070,4030);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id==='lab_seal').sprite.texture.key),'city_lab_door_open');
  ok('дверь, погреб и вход лаборатории меняются после настоящих действий игрока');
  await events(['ch2_lab_open', 'ch2_vol_1', 'ch2_vol_2']);
  await shot('09-laboratory',2070,4480);
  await shot('10-coven',3220,4280);
  await shot('11-warehouses',2910,4850);
  await events(['ch2_final_start']);
  await shot('12-final-plaza',2780,3850);
  await events(['ch2_severin_defeated', 'chapter_2_complete']);
  const thawed = await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').colliderObjects.filter(o => o.texture?.key === 'city_house').map(o => [o.x,o.y,o.displayWidth,o.displayHeight]));
  assert.deepEqual(thawed,houses);
  await shot('13-thawed-houses',2910,1820);
  await shot('14-restored-plaza',2780,3670);
  ok('после победы дома оттаивают с прежними размерами и координатами');

  for (const [loc,x,y] of [['frostwood',4500,750],['graveyard',4500,3490]]) {
    await page.evaluate(loc => window.__witch.bus.emit('story:map-travel',loc),loc);
    await page.waitForFunction(loc => window.__game.scene.getScene('ExplorationScene').loc?.id === loc,loc);
    await shot('expedition-'+loc,x,y);
  }
  ok('вылазки используют новые деревья, склеп, монстров и тайники');
  await page.setViewportSize({width:1365,height:900});
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__game.scale.refresh());
  const desktop = await page.locator('canvas').first().boundingBox();
  assert.ok(Math.abs(desktop.width/desktop.height-9/16)<0.01 && desktop.width<1365);
  await shot('desktop-graveyard');
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__game.scale.refresh());
  ok('на широком экране игра сохраняет портретные пропорции');

  for (const [enemy,spawn,arena] of [['frost_collector','wh_collector_1','city'],['ice_guardian','fq_guardian','frost'],['volunteer','vol_2','lab'],['severin_boss','final_severin','duel'],['frost_alpha','fw_alpha','frostwood'],['barrow_warden','gy_warden','graveyard']]) {
    await page.evaluate(({enemy,spawn}) => {
      const g=window.__game,w=window.__witch;
      g.scene.stop('CombatScene'); g.scene.sleep('ExplorationScene');
      w.state.data.combatCtx=null; w.state.data.hp=500;w.state.data.mana=100;w.modalOpen=false;
      g.scene.run('CombatScene',{enemyType:enemy,spawnId:spawn});g.scene.bringToTop('UIScene');
    }, {enemy,spawn});
    await page.waitForFunction(() => window.__game.scene.getScene('CombatScene')?.started);
    const view = await page.evaluate(() => {
      const s=window.__game.scene.getScene('CombatScene');
      return {arena:s.arenaArt?.texture.key,enemy:s.enemySprite.texture.key,height:s.enemySprite.displayHeight,hero:s.heroSprite.displayHeight};
    });
    assert.equal(view.arena,'arena_'+arena);assert.ok(Math.abs(view.hero-144)<5);
    if (['volunteer','severin_boss'].includes(enemy)) assert.ok(view.height>=140&&view.height<160,JSON.stringify(view));
    if (spawn==='vol_2') assert.equal(view.enemy,'enemy_volunteer_miron');
    await shot('battle-'+arena);
    ok(`арена ${arena}: новый фон и правильный масштаб бойцов`);
  }
  assert.deepEqual(errors.filter(e=>!/fonts|supabase|ERR_CERT|Failed to load resource/.test(e)),[]);
  ok('новые текстуры загружаются, ошибок Phaser нет');
  console.log('Снимки:',out);
} finally {
  await browser.close(); await server?.close();
}
