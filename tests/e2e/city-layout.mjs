// Real Phaser: room art, small markers, entering the bank and speaking across the counter.
// Browser plugin is unavailable in this environment; regular Playwright drives real touch input.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.CITY_SHOTS_DIR || '/tmp/witch-rpg-city-layout';
await fs.mkdir(out, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5182, strictPort: true, hmr: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [name, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1365, height: 900 }]]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: name === 'mobile', deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400 && /\/assets\//.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
    try {
      await page.goto('http://127.0.0.1:5182/?reset&skipmenu');
      await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player);
      await page.evaluate(async () => {
        const w = window.__witch, u = window.__game.scene.getScene('UIScene'), { EV } = await import('/src/config/events.js');
        for (const event of Object.values(EV)) w.state.markEvent(event);
        for (const event of ['prologue_seen', 'chapter_1_complete', 'ch2_start', 'ch2_city_arrived', 'ch2_plaza_cleared', 'ch2_met_ilaria', 'ch2_trace_found']) w.state.markEvent(event);
        w.state.markEnemyDefeated('plaza_critter');
        w.state.data.heroLevel = 15; w.state.data.hp = 500; w.state.data.mana = 200;
        for (const id of ['telekinesis', 'fire', 'seal', 'ice']) w.abilities.unlock(id, id === 'telekinesis' ? 3 : 1);
        w.state.setBuild({ slots: ['telekinesis', 'seal', 'ice'] });
        w.settings.set('hints', false); w.tutorial.hide();
        if (u.dlg) u.closeDialogue(true); u.closeModal(null);
        w.bus.emit('story:map-travel', 'city');
      });
      await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').loc?.id === 'city' && window.__witch.mode === 'exploration');
      const position = async (x,y) => {
        await page.evaluate(({x,y}) => {
          const s = window.__game.scene.getScene('ExplorationScene'), u = window.__game.scene.getScene('UIScene');
          u.goalBanner?.destroy(); s.speech?.c.destroy(); s.speech = null;
          // Suppress timed story speech in visual fixtures; leave HUD and interactions visible.
          s.heroSay = () => {};
          s.player.stop(); s.player.setPosition(x,y);
          s.cameras.main.stopFollow(); s.cameras.main.centerOn(x,y-s.followOffsetY); s.cameras.main.preRender();
          for (const e of s.enemies) e.grace = 10000;
        }, {x,y});
        await page.waitForTimeout(800);
      };
      const shot = async filename => page.screenshot({ path: path.join(out, `${name}-${filename}.png`) });
      const tapWorld = async (x,y) => {
        const point = await page.evaluate(({x,y}) => {
          window.__game.scale.updateBounds();
          const c = window.__game.scene.getScene('ExplorationScene').cameras.main;
          return { x:(x-c.worldView.x)*c.zoom, y:(y-c.worldView.y)*c.zoom };
        }, {x,y});
        const box = await page.locator('canvas').first().boundingBox();
        await page.touchscreen.tap(box.x+point.x*box.width/720, box.y+point.y*box.height/1280);
      };
      const events = async list => page.evaluate(list => {
        const w=window.__witch, s=window.__game.scene.getScene('ExplorationScene');
        for (const event of list) w.state.markEvent(event);
        s.refreshAll();
      }, list);
      const art = await page.evaluate(() => {
        const s = window.__game.scene.getScene('ExplorationScene');
        return ['bank_counter','bank_safe','archive_shelf','archive_desk','society_workbench','coven_cabinet','coven_table','duel_rack','stone_floor']
          .map(id => { const t=s.textures.get('city_'+id); return {id, missing:t.key==='__MISSING', width:t.getSourceImage().width}; });
      });
      assert.ok(art.every(a => !a.missing && a.width > 20), JSON.stringify(art));

      await position(2570,3460);
      const marker = await page.evaluate(() => {
        const s=window.__game.scene.getScene('ExplorationScene'), board=s.objects.find(o=>o.id==='city_board'), m=s.interaction.markers.get(board).m;
        return { width:m.displayWidth, height:m.displayHeight, source:m.texture.getSourceImage().width, visible:m.visible, focus:s.interaction.focus?.id };
      });
      assert.ok(marker.visible && marker.source > 128 && marker.width >= 44 && marker.width <= 52 && marker.height <= 52, JSON.stringify(marker));
      assert.equal(marker.focus, 'city_board');
      assert.equal(await page.evaluate(() => Math.max(window.__game.scene.getScene('UIScene').ctxIcon.displayWidth, window.__game.scene.getScene('UIScene').ctxIcon.displayHeight)),60);
      await shot('01-board');
      await tapWorld(2480,3360);
      await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Доска поручений');
      await page.evaluate(() => window.__game.scene.getScene('UIScene').closeModal(null));
      await page.waitForTimeout(400);
      await position(2700,3460);
      assert.equal(await page.evaluate(() => {
        const s=window.__game.scene.getScene('ExplorationScene'),b=s.objects.find(o=>o.id==='city_board'); return s.interaction.markers.get(b).m.displayWidth;
      }),40);
      console.log(`  ✓ ${name}: большой исходник книги отображается маленьким значком; доска открывается касанием`);

      await position(3320,4060); await shot('02-bank-entrance');
      await tapWorld(3320,3770);
      await page.waitForFunction(() => window.__game.scene.getScene('UIScene').dlg?.npcId === 'banker', null, { timeout: 20000 });
      const atBank = await page.evaluate(() => { const s=window.__game.scene.getScene('ExplorationScene');return{x:s.player.x,y:s.player.y,zone:s.zone.id}; });
      assert.ok(atBank.x>3150 && atBank.x<3490 && atBank.y<3980 && atBank.y>3590, JSON.stringify(atBank));
      assert.ok(Math.hypot(atBank.x-3320,atBank.y-3830)<=145,JSON.stringify(atBank));
      assert.equal(atBank.zone,'BK');
      await shot('03-agatha-dialogue');
      await page.evaluate(() => window.__game.scene.getScene('UIScene').closeDialogue(true));
      await page.waitForTimeout(400);
      await position(3320,3930); await shot('04-bank');
      console.log(`  ✓ ${name}: герой входит в дверь банка и разговаривает с Агатой за стойкой`);

      for (const [filename,x,y] of [['05-archive',2630,2950],['06-society',3210,2970],['07-coven',3210,4290]]) {
        await position(x,y); await shot(filename);
      }
      await events(['ch2_lab_open','ch2_vol_1','ch2_vol_2','ch2_frost_wave','ch2_quarter_open','ch2_nerys_met']);
      for (const [filename,x,y] of [['08-laboratory',2070,4480],['09-residential',3330,2310],['10-warehouses',2910,4830]]) {
        await position(x,y); await shot(filename);
      }
      await events(['ch2_severin_defeated','chapter_2_complete']);
      await position(2640,4380); await shot('11-duel');
      const floors = await page.evaluate(() => {
        const s=window.__game.scene.getScene('ExplorationScene');
        return s.children.list.filter(o=>o.type==='TileSprite' && o.displayTexture?.key==='city_stone_floor').length;
      });
      assert.equal(floors,3);
      // Reload an old save where a new house, bank wall or counter now stands.
      // A legitimate position in the entrance must keep its exact coordinates.
      for (const [x,y,recover] of [[2700,2100,true],[3320,3575,true],[3320,3850,true],[3320,3930,false]]) {
        await page.evaluate(({x,y}) => {
          const s=window.__game.scene.getScene('ExplorationScene');
          window.__witch.state.data.player={x,y}; window.__oldReloadPlayer=s.player; s.scene.restart();
        },{x,y});
        await page.waitForFunction(()=>{
          const s=window.__game.scene.getScene('ExplorationScene');
          return s.player && s.player!==window.__oldReloadPlayer && s.loc?.id==='city';
        });
        const saved=await page.evaluate(()=>{
          const s=window.__game.scene.getScene('ExplorationScene'),p=s.player,b=p.sprite.body;
          return {x:p.x,y:p.y,saved:window.__witch.state.data.player,
            blocked:s.colliderObjects.some(o=>o.body && b.x+b.width>o.body.x && b.x<o.body.x+o.body.width && b.y+b.height>o.body.y && b.y<o.body.y+o.body.height)};
        });
        assert.equal(saved.blocked,false,JSON.stringify(saved));
        if (recover) {
          assert.ok(Math.hypot(saved.x-x,saved.y-y)>0 && Math.hypot(saved.x-x,saved.y-y)<=160,JSON.stringify(saved));
          assert.deepEqual(saved.saved,{x:saved.x,y:saved.y});
        } else assert.deepEqual({x:saved.x,y:saved.y},{x,y});
      }
      console.log(`  ✓ ${name}: старые сохранения внутри новой мебели освобождаются рядом; свободная позиция не меняется`);
      assert.deepEqual(errors, []);
      console.log(`  ✓ ${name}: все помещения отрисованы; приборы, книги и стойки загружены; ошибок нет`);
    } catch (error) {
      await shotOnFailure(page,name,error); throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }

async function shotOnFailure(page,name,error) {
  await page.screenshot({ path:path.join(out,`${name}-failure.png`) }).catch(()=>{});
  console.log(error.message);
  console.log(await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene'),u=window.__game.scene.getScene('UIScene');return{player:[s.player.x,s.player.y],zone:s.zone?.id,focus:s.interaction.focus?.id,modal:u.modal?.opts?.title,dialogue:u.dlg?.npcId,mode:window.__witch.mode};}).catch(()=>({})));
}
