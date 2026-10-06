// Browser plugin not available: real Phaser, portrait touch input, HTTP server with delayed actions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { startFakeHttp } from '../helpers/fake-http.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.ICE_SHOTS_DIR || '/tmp/witch-nerys-ice'; await fs.mkdir(out, { recursive: true });
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:8174'; process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
const { srv, close } = await startFakeHttp({ port: 8174, delayMs: 200 });
const vite = await createServer({ root, server: { host: '127.0.0.1', port: 5188, strictPort: true, hmr: false } }); await vite.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push({text:m.text(),url:m.location().url}); });
  const url = 'http://127.0.0.1:5188/';
  console.log('Loading menu');
  await page.goto(url); await page.waitForFunction(() => window.__witch?.session, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__game?.scene.isActive('MenuScene'), null, {timeout:120000});
  assert.match(await page.title(), /Колдовство/);
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  await page.evaluate(() => window.__witch.session.playAsGuest('witch'));
  const uid = await page.evaluate(() => window.__witch.session.userId);
  srv.grant(uid, { xp: 2400, quests: ['prologue_seen', 'mig_v10', 'unlock_telekinesis_1', 'unlock_fire_1', 'unlock_seal_1', 'chapter_1_complete', 'ch2_start', 'ch2_city_arrived',
    'ch2_construct_unstable', 'ch2_nerys_met', 'ch2_rescue_door', 'ch2_rescue_cellar', 'warm_potion_crafted'],
    abilities: { telekinesis: { level: 2, unlocked: true }, fire: { level: 2, unlocked: true }, seal: { level: 2, unlocked: true } } });
  await page.evaluate(async () => { const S = window.__witch; S.settings.set('hints', false); S.state.data.player = { x: 2800, y: 2280 }; S.state.save(); await S.session.flush({ force: true }); });
  const ready = () => page.waitForFunction(() => window.__game?.scene.isActive('ExplorationScene') && window.__game.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene').player && window.__witch?.session.status === 'ready', null, { timeout: 120000 });
  assert.deepEqual(srv.players.get(uid).snap.pos, {x:2800,y:2280});
  console.log('Loading city');
  await page.goto(url + '?skipmenu'); await ready();
  await page.evaluate(() => {
    const u = window.__game.scene.getScene('UIScene'), orig = u.toast.bind(u); window.__toasts = [];
    u.toast = (text, color) => { window.__toasts.push(String(text)); return orig(text, color); };
  });
  const tap = async point => {
    const box = await page.locator('canvas').first().boundingBox();
    assert.ok(point && point.x >= 0 && point.x <= 720 && point.y >= 0 && point.y <= 1280, JSON.stringify(point));
    await page.touchscreen.tap(box.x + point.x * box.width / 720, box.y + point.y * box.height / 1280);
    await page.waitForTimeout(180);
  };
  const tapLabel = async label => {
    const point = await page.evaluate(label => {
      const ui = window.__game.scene.getScene('UIScene'), all = [];
      const visit = o => { if (o.type === 'Text') all.push(o); for (const c of o.list || []) visit(c); };
      visit(ui.modal.container);
      const t = all.find(t => t.visible && t.text === label); if (!t) return null;
      const b = t.getBounds(); return { x: b.centerX, y: b.centerY };
    }, label);
    await tap(point);
  };
  const talk = async expected => {
    await page.evaluate(() => {
      const e = window.__game.scene.getScene('ExplorationScene'), o = e.objects.find(o => o.id === 'npc_nerys');
      e.interaction.setFocus(null); e.player.setPosition(o.x, o.y + 100); e.interaction.setFocus(o);
    });
    await page.waitForTimeout(350);
    await page.waitForFunction(() => !window.__witch.actions.busy);
    console.log('Talk state', await page.evaluate(() => { const e=window.__game.scene.getScene('ExplorationScene'),u=window.__game.scene.getScene('UIScene');return {loc:e.loc.id,player:[e.player.x,e.player.y],focus:e.interaction.focus?.id,ctx:u.ctx.visible,modal:u.modal?.opts?.title,mode:u.mode}; }));
    const point = await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); const b = u.ctxBg.getBounds(); return { x: b.centerX, y: b.centerY }; });
    await tap(point);
    try { await page.waitForFunction(() => window.__game.scene.getScene('UIScene').dlg, null, {timeout:5000}); }
    catch(e) { await page.screenshot({path:path.join(out,'failure.png')});console.log('After tap',await page.evaluate(()=>{const e=window.__game.scene.getScene('ExplorationScene'),u=window.__game.scene.getScene('UIScene');return{focus:e.interaction.focus?.id,modal:u.modal?.opts?.title,active:window.__witch.dialogue.active,toasts:window.__toasts};}));throw e; }
    assert.equal(await page.evaluate(() => window.__witch.dialogue.cur.variant.id), expected);
    // Tap Далее once to reveal each line, then once to advance. No synthetic dialogue methods.
    for (let i = 0; i < 12; i++) {
      const status = await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'); return { typing: u.dlg.typing, choices: !!window.__witch.dialogue.view().choices }; });
      if (!status.typing && status.choices) return;
      await tapLabel('Далее');
    }
    throw new Error('Dialogue did not reach choices');
  };
  await talk('nerys_rescue_ready');
  assert.equal(await page.evaluate(() => window.__witch.state.isUnlocked('ice')), false);
  await tapLabel('Сварю.');
  await page.evaluate(() => window.__witch.actions.chain);
  await page.waitForFunction(() => !window.__witch.actions.busy && window.__witch.state.hasEvent('ch2_rescue_done'));
  assert.equal(srv.players.get(uid).snap.quests.includes('ch2_rescue_done'), true);
  await talk('nerys_lesson_ready');
  await page.screenshot({ path: path.join(out, 'nerys-lesson.png') });
  srv.delayMs = 700;
  await tapLabel('Попробую.');
  assert.equal(await page.evaluate(() => window.__witch.state.isUnlocked('ice')), false, 'no optimistic gift before RPC');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('UIScene').modal?.opts?.title), undefined);
  await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Лёд I');
  assert.equal(srv.players.get(uid).snap.abilities.ice.unlocked, true);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, 'ice-confirmed.png') });
  await tapLabel('Выбрать дары');
  await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Дары');
  // Fourth gift stays in reserve until the player chooses a free slot.
  const labels = await page.evaluate(() => { const u = window.__game.scene.getScene('UIScene'), a = []; const visit = o => { if (o.type === 'Text' && /— в слоте|— в запасе/.test(o.text)) a.push(o.text); for (const c of o.list || []) visit(c); }; visit(u.modal.container); return a; });
  const fire = labels.find(t => /Огонь.*в слоте/.test(t)), ice = labels.find(t => /Лёд.*в запасе/.test(t));
  assert.ok(fire && ice, JSON.stringify(labels));
  srv.delayMs = 200;
  await tapLabel(fire); await page.evaluate(() => window.__witch.actions.chain);
  await tapLabel(ice); await page.evaluate(() => window.__witch.actions.chain);
  assert.equal(await page.evaluate(() => window.__witch.state.equippedGifts().includes('ice')), true);
  await page.screenshot({ path: path.join(out, 'ice-in-slot.png') });
  await tapLabel('Закрыть');
  await page.evaluate(async () => { window.__witch.savePosition?.(); await window.__witch.session.flush({ force: true }); });
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => window.__witch.state.isUnlocked('ice') && window.__witch.state.hasEvent('unlock_ice_1') && window.__witch.state.equippedGifts().includes('ice')), true);
  assert.equal(await page.evaluate(() => window.__witch.dialogue.pick('nerys').id), 'nerys_water_active');
  await page.screenshot({ path: path.join(out, 'ice-after-reload.png') });
  const actions = srv.calls.filter(c => c.path.endsWith('/player_action')).map(c => c.body.action);
  assert.equal(actions.filter(a => a.key === 'unlock_ice_1').length, 1);
  // FakeSupabase implements gameplay RPCs; optional chat/telemetry RPCs intentionally return 404.
  const unexpected = errors.filter(e => !(typeof e === 'object' && /404/.test(e.text) && /\/rpc\/(chat_request|telemetry_log)$/.test(e.url)));
  assert.deepEqual(unexpected, []);
  console.log('✓ Mobile: early potion -> rescue hand-in -> Nerys lesson -> delayed server grant -> equip Ice -> reload; no unexpected console errors.');
  await context.close();
} finally { await browser.close(); await vite.close(); await close(); }
