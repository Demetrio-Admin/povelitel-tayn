// v0.37.0: walk the town in the real Phaser scene — keyboard along the main street from the road to the Northern yard,
// touch taps at the market, both story gates (Fire on the ice wall, Ice on the flooded passage), every door in and out,
// and a v0.36 save migrating once. Screenshots of each place; CITY_VIDEO=1 also records the phone walk.
// Browser plugin is unavailable in this environment; regular Playwright drives real keyboard and touch input.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { BUILDINGS, CITY_SPOTS, CITY_POSITIONS, V3_CITY, cityMapData } from '../../src/config/city.plan.js';
import { CITY_START } from '../../src/config/world.city.js';
import { catmullRom } from '../../src/world/geometry.js';

process.env.VITE_SUPABASE_URL=''; process.env.VITE_SUPABASE_ANON_KEY='';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.CITY_SHOTS_DIR || '/tmp/witch-rpg-city-layout';
await fs.mkdir(out, { recursive: true });
const modules = await fs.realpath(path.join(root, 'node_modules'));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5182, strictPort: true, hmr: false, fs: { allow: [root, modules] } } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// The walk follows the centre line of the real streets, in order, sampled every ~110 px.
const roads = Object.fromEntries(cityMapData().roads.map(r => [r.id.replace('city_street_', ''), r]));
const line = (id, from = 0, to = 1) => {
  const pts = catmullRom(roads[id].pts, 10), outPts = [];
  let acc = 0, total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  for (let i = 1, next = 0; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc >= next && acc >= from * total && acc <= to * total) { outPts.push({ x: pts[i][0], y: pts[i][1] }); next = acc + 110; }
  }
  return outPts;
};
const door = id => BUILDINGS.find(b => b.id === id).door;
const barrier = CITY_POSITIONS.frost_barrier, water = CITY_POSITIONS.fq_water;
const LEG = {
  gate: [...line('road', 0.45), ...line('main_gate', 0, 0.42)],
  market: line('main_gate', 0.42),
  square: [...line('main_market'), { x: 1490 + 5600, y: 3560 + 160 }],
  garden: line('main_garden', 0, 0.55),
  bridge: [...line('main_garden', 0.55), CITY_SPOTS.bridgeSouth],
  quarter: [{ x: barrier.x, y: barrier.y - 120 }, ...line('main_quarter', 0.08, 0.6)],
  passage: [...line('main_quarter', 0.6, 0.9).filter(p => p.y > water.y + 110), { x: water.x, y: water.y + 100 }],
  yard: [{ x: water.x, y: water.y - 120 }, CITY_SPOTS.yard, { x: CITY_SPOTS.yard.x, y: CITY_SPOTS.yard.y - 260 }],
  lab: [...line('road', 0, 0.45).reverse(), ...line('lab_trail', 0, 0.95)],
};

const full = (process.env.CITY_FULL_WALK ?? '390') .split(',');
const viewports = process.env.CITY_VIEWPORTS ? JSON.parse(process.env.CITY_VIEWPORTS)
  : [{ width: 390, height: 844, mobile: true }, { width: 320, height: 568, mobile: true }, { width: 1365, height: 900 }];
const timings = [];
try {
  for (const viewport of viewports) {
    const name = String(viewport.width), walkAll = full.includes(name);
    const video = process.env.CITY_VIDEO && walkAll ? { dir: path.join(out, 'video'), size: { width: viewport.width, height: viewport.height } } : undefined;
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true, isMobile: !!viewport.mobile,
      deviceScaleFactor: 1, ...(video ? { recordVideo: video } : {}) });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(120000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400 && /\/assets\//.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
    const state = () => page.evaluate(() => {
      const s = window.__game.scene.getScene('ExplorationScene');
      return { x: s.player.x, y: s.player.y, zone: s.zone?.id, loc: s.loc?.id, mode: window.__witch.mode };
    });
    const calm = () => page.evaluate(() => {
      const s = window.__game.scene.getScene('ExplorationScene'), u = window.__game.scene.getScene('UIScene');
      u.toasts?.forEach(t => t.destroy()); if (u.toasts) u.toasts = []; u.goalBanner?.setVisible(false); u.hintPlate?.setVisible(false);
      s.heroSay = () => {}; s.speech?.c?.destroy(); s.speech = null;
      for (const e of s.enemies) e.grace = 1e9;   // the walk is about navigation; story fights have their own tests
    });
    const shot = async file => { await calm(); await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, `${name}-${file}.png`) }); };
    const ready = loc => page.waitForFunction(loc => window.__game.scene.getScene('ExplorationScene').loc?.id === loc && window.__witch.mode === 'exploration'
      && !window.__game.scene.getScene('ExplorationScene').cameras.main.fadeEffect.isRunning, loc);
    let held = new Set();
    const hold = async keys => {
      for (const k of held) if (!keys.has(k)) await page.keyboard.up(k);
      for (const k of keys) if (!held.has(k)) await page.keyboard.down(k);
      held = keys;
    };
    // Keyboard steering: eight directions toward the next point of the street, like a player holding arrow keys.
    const walk = async (label, pts, { blockedAt } = {}) => {
      const t0 = Date.now(); let i = 0, mark = await state(), markT = Date.now(), dist = 0, prev = mark;
      try {
        while (i < pts.length) {
          const p = await state();
          assert.equal(p.mode, 'exploration', label + ': walk interrupted');
          dist += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p;
          if (blockedAt && blockedAt(p)) throw new Error(`${label}: passed a closed gate at ${Math.round(p.x)},${Math.round(p.y)}`);
          const wp = pts[i], dx = wp.x - p.x, dy = wp.y - p.y, d = Math.hypot(dx, dy);
          if (d < (i === pts.length - 1 ? 34 : 70)) { i++; continue; }
          const keys = new Set();
          if (dx / d > 0.38) keys.add('ArrowRight'); if (dx / d < -0.38) keys.add('ArrowLeft');
          if (dy / d > 0.38) keys.add('ArrowDown'); if (dy / d < -0.38) keys.add('ArrowUp');
          await hold(keys);
          if (Math.hypot(p.x - mark.x, p.y - mark.y) > 10) { mark = p; markT = Date.now(); }
          if (Date.now() - markT > 9000) {
            await page.screenshot({ path: path.join(out, `${name}-stuck-${label}.png`) });
            throw new Error(`${label}: hero stuck at ${Math.round(p.x)},${Math.round(p.y)} heading to ${Math.round(wp.x)},${Math.round(wp.y)}`);
          }
          await page.waitForTimeout(70);
        }
      } finally { await hold(new Set()); }
      await page.waitForTimeout(300);
      timings.push({ viewport: name, leg: label, px: Math.round(dist), realSec: (Date.now() - t0) / 1000 });
      return state();
    };
    // Pushing against a closed gate: the hero must stay on the near side.
    const push = async (label, key, ms, limit) => {
      await hold(new Set([key])); await page.waitForTimeout(ms); await hold(new Set());
      const p = await state(); assert.ok(limit(p), `${label}: ${JSON.stringify(p)}`); return p;
    };
    const teleport = async p => {
      await page.evaluate(({ x, y }) => { const s = window.__game.scene.getScene('ExplorationScene'); s.player.stop(); s.player.setPosition(x, y); }, p);
      await page.waitForTimeout(900);
    };
    const tapWorld = async (x, y) => {
      const point = await page.evaluate(({ x, y }) => {
        window.__game.scale.updateBounds();
        const c = window.__game.scene.getScene('ExplorationScene').cameras.main;
        return { x: (x - c.worldView.x) * c.zoom, y: (y - c.worldView.y) * c.zoom, width: window.__game.scale.width, height: window.__game.scale.height };
      }, { x, y });
      const box = await page.locator('canvas').first().boundingBox();
      if (viewport.mobile) await page.touchscreen.tap(box.x + point.x * box.width / point.width, box.y + point.y * box.height / point.height);
      else await page.mouse.click(box.x + point.x * box.width / point.width, box.y + point.y * box.height / point.height);
    };
    try {
      await page.goto('http://127.0.0.1:5182/?reset&skipmenu');
      await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player, null, { timeout: 180000 });
      await page.evaluate(() => {
        const w = window.__witch, u = window.__game.scene.getScene('UIScene');
        for (const e of ['prologue_seen', 'chapter_1_complete', 'ch2_start', 'ch2_city_arrived', 'ch2_frost_wave']) w.state.markEvent(e);
        w.state.markEnemyDefeated('plaza_critter');
        w.state.data.heroLevel = 15; w.state.data.hp = 500; w.state.data.mana = 200;
        for (const id of ['telekinesis', 'fire', 'seal', 'ice']) w.abilities.unlock(id, 1);
        w.state.setBuild({ slots: ['fire', 'seal', 'ice'] });
        w.settings.set('hints', false); w.tutorial.hide();
        if (u.dlg) u.closeDialogue(true); u.closeModal(null);
        window.__game.scene.getScene('ExplorationScene').travelToLocation('city');
      });
      await ready('city');
      const start = await state();
      assert.ok(Math.hypot(start.x - CITY_START.x, start.y - CITY_START.y) < 2, 'arrives at the road sign');
      assert.equal(await page.evaluate(() => window.__witch.state.getObject('city_layout')?.version), 4);
      await shot('01-road');

      // ---- 1–4: gate and warehouse yards → market → square → garden, on the keyboard
      let p = await walk('gate', LEG.gate);
      assert.equal(p.zone, 'G'); await shot('02-gate-warehouses');
      p = await walk('market', LEG.market); assert.equal(p.zone, 'M'); await shot('03-market');
      // Touch: tap in front of the bank and in front of Boris; the hero walks there by the street.
      // A player taps what is on screen, so the merchant is reached in two taps across the market.
      const m = CITY_POSITIONS.npc_merchant;
      for (const [label, steps] of [['bank', [{ x: door('bank').x - 110, y: door('bank').y + 80 }]],
        ['merchant', [{ x: m.x + 220, y: m.y + 40 }, { x: m.x - 60, y: m.y + 80 }]]]) {
        for (const target of steps) {
          let near = false;
          for (let tries = 0; tries < 4 && !near; tries++) {
            await tapWorld(target.x, target.y);
            near = await page.waitForFunction(t => { const s = window.__game.scene.getScene('ExplorationScene'); return Math.hypot(s.player.x - t.x, s.player.y - t.y) < 40; }, target, { timeout: 15000 }).then(() => true, () => false);
          }
          assert.ok(near, 'tap to ' + label);
        }
        await shot('04-tap-' + label);
      }
      if (walkAll) {
        p = await walk('square', [...line('market').slice(0, 1), ...LEG.square]); assert.equal(p.zone, 'P'); await shot('05-square');
        p = await walk('garden', LEG.garden); assert.equal(p.zone, 'GD'); await shot('06-garden');
        // ---- 6: the bridge is the only way north, and the ice wall holds it
        p = await walk('bridge', LEG.bridge); await shot('07-bridge-ice-wall');
        await push('ice wall holds', 'ArrowUp', 3500, q => q.y > barrier.y + 8);
        await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').interaction.focus?.id === 'frost_barrier');
        await page.keyboard.press('Digit2');   // Fire
        await page.waitForFunction(() => window.__witch.state.getObject('frost_barrier')?.state === 'destroyed', null, { timeout: 60000 });
        assert.equal(await page.evaluate(() => window.__witch.state.hasEvent('ch2_quarter_open')), true);
        p = await walk('quarter', LEG.quarter); assert.equal(p.zone, 'FQ'); await shot('08-frozen-quarter');
        // ---- 7: the flooded passage holds until it is frozen
        p = await walk('passage', LEG.passage); await shot('09-flooded-passage');
        await push('flooded passage holds', 'ArrowUp', 3500, q => q.y > water.y + 4);
        await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').interaction.focus?.id === 'fq_water');
        await page.evaluate(async () => { const { MSG } = await import('/src/state/EventBus.js'); window.__witch.bus.emit(MSG.ABILITY_USE, 'ice'); });
        await page.waitForFunction(() => window.__witch.state.getObject('fq_water')?.state === 'frozen', null, { timeout: 60000 });
        p = await walk('yard', LEG.yard); assert.equal(p.zone, 'FY'); await shot('10-northern-yard');
        // ---- 8: the side trail outside the west wall to the laboratory, held by its seal
        await teleport(CITY_START); p = await walk('lab', LEG.lab); assert.equal(p.zone, 'R'); await shot('11-lab-trail');
        await push('lab seal holds', 'ArrowUp', 2500, q => q.y > CITY_POSITIONS.lab_seal.y + 4);
      } else {
        for (const [file, spot] of [['05-square', CITY_SPOTS.square], ['06-garden', CITY_SPOTS.garden], ['07-bridge', CITY_SPOTS.bridgeSouth], ['08-quarter', CITY_SPOTS.quarter], ['10-yard', CITY_SPOTS.yard]]) {
          await teleport(spot); await shot(file);
        }
      }
      console.log(`  ✓ ${name}: прогулка с клавиатуры${walkAll ? ' от дороги до Северного двора' : ''}, касания у банка и лавки`);

      if (walkAll) {
        // ---- every door leads into its room and back to its own doorstep
        await page.evaluate(() => { for (const e of ['ch2_lab_open', 'ch2_fin_seal', 'ch2_rescue_cellar', 'ch2_rescue_door']) window.__witch.state.markEvent(e);
          window.__witch.state.setObject('lab_seal', { state: 'frozen' }); window.__witch.state.setObject('fq_door', { state: 'destroyed' }); window.__witch.state.setObject('final_ward', { state: 'done' });
          window.__game.scene.getScene('ExplorationScene').refreshAll(); });
        for (const b of BUILDINGS.filter(b => !b.id.startsWith('north_'))) {
          const room = 'city_' + (b.id.startsWith('warehouse_') ? 'warehouse' : b.id);
          await page.evaluate(id => { const s = window.__game.scene.getScene('ExplorationScene'), d = s.objects.find(o => o.id === id); s.player.stop(); s.player.setPosition(d.x, d.y + 60); }, 'door_' + b.id);
          await page.waitForFunction(id => window.__game.scene.getScene('ExplorationScene').interaction.focus?.id === id, 'door_' + b.id);
          await page.keyboard.press('Space'); await ready(room);
          await page.evaluate(id => window.__game.scene.getScene('ExplorationScene').objects.find(o => o.id === id).interact(), 'room_exit_' + b.id);
          await ready('city');
          const back = await state();
          assert.ok(Math.hypot(back.x - b.door.x, back.y - b.door.y - 100) < 6, `${b.id}: returns to its own door ${JSON.stringify(back)}`);
        }
        console.log(`  ✓ ${name}: 10 дверей ведут в свои помещения и возвращают к своему дому`);

        // ---- a v0.36 save standing at the old bank moves once; reload keeps the new position
        const v3 = (x, y) => ({ x: V3_CITY.origin.x + x * V3_CITY.scale, y: V3_CITY.origin.y + y * V3_CITY.scale });
        const before = await page.evaluate(() => JSON.stringify(window.__witch.state.data.inventory));
        await page.evaluate(({ pos, safe }) => {
          const w = window.__witch, s = window.__game.scene.getScene('ExplorationScene');
          w.state.setObject('city_layout', { version: 3 }); w.state.data.player = pos; w.state.data.safePoint = safe;
          window.__oldPlayer = s.player; s.scene.restart();
        }, { pos: v3(2210, 2790), safe: v3(1500, 2780) });
        await page.waitForFunction(() => { const s = window.__game.scene.getScene('ExplorationScene'); return s.player && s.player !== window.__oldPlayer && s.loc?.id === 'city'; });
        const moved = await state(), bankFront = { x: door('bank').x, y: door('bank').y + 100 };
        assert.ok(Math.hypot(moved.x - bankFront.x, moved.y - bankFront.y) < 2, 'old bank doorstep → new bank doorstep ' + JSON.stringify(moved));
        assert.deepEqual(await page.evaluate(() => [window.__witch.state.getObject('city_layout').version, window.__witch.state.data.safePoint]), [4, CITY_SPOTS.market], 'safe point is the market where the hero now stands');
        await shot('12-migrated-old-save');
        await page.evaluate(() => { window.__game.scene.getScene('ExplorationScene').savePosition(); history.replaceState({}, '', '/?skipmenu'); });
        await page.reload();
        await page.waitForFunction(() => window.__game?.scene.getScene('ExplorationScene')?.loc?.id === 'city' && window.__witch.mode === 'exploration', null, { timeout: 180000 });
        const reloaded = await state();
        assert.ok(Math.hypot(reloaded.x - bankFront.x, reloaded.y - bankFront.y) < 2, 'reload does not move the hero again ' + JSON.stringify(reloaded));
        assert.equal(await page.evaluate(() => JSON.stringify(window.__witch.state.data.inventory)), before, 'items and currencies kept');
        console.log(`  ✓ ${name}: сохранение v0.36 переносится один раз; после перезагрузки позиция та же`);
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      await page.screenshot({ path: path.join(out, `${name}-failure.png`) }).catch(() => {});
      console.log(error.message, await state().catch(() => ({})));
      throw error;
    } finally { await context.close(); }
  }
  await fs.writeFile(path.join(out, 'walk-timings.json'), JSON.stringify(timings, null, 2));
  console.log('✓ City walk: keyboard, touch, gates, doors and migration —', out);
} finally { await browser.close(); await server.close(); }
