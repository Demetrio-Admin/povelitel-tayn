// Полное прохождение эпизода «Первое пламя» (/episode/) в браузере: настоящие касания для тапов по миру,
// мини-игр магии (удержание, ведение пальцем, поток) и кнопок боя. Длинные переходы — после проверки маршрута A*
// (герой ставится в конец найденного пути), потому что облачный браузер рисует несколько кадров в секунду.
// Нужен Chromium Playwright (или CHROME_PATH).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { smartPolicy } from '../../src/episode/model/combat.js';

process.env.VITE_SUPABASE_URL = ''; process.env.VITE_SUPABASE_ANON_KEY = '';
const vite = process.env.UI_BASE_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 5194, strictPort: true } });
await vite?.listen();
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5194/';
const shots = process.env.UI_SHOTS_DIR || '/tmp/witch-episode';
await fs.mkdir(shots, { recursive: true });
const [W, H] = (process.env.EPISODE_SIZE || '390x844').split('x').map(Number);
const t0 = Date.now();
const log = (...a) => console.log(`${Math.round((Date.now() - t0) / 1000)}s`, ...a);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  const errors = [], api = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/supabase|\/rest\/v1|\/auth\/v1|\/functions\/v1/.test(r.url())) api.push(r.url()); });
  // производственное сохранение в том же браузере не должно меняться
  await page.goto(new URL('favicon.ico', base).href);
  await page.evaluate(() => localStorage.setItem('witch_rpg_proto_save_v1', 'production-save'));
  await page.goto(new URL('episode/', base).href);

  const ready = () => page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.ready && !window.__game.scene.getScene('ExplorationScene').inTransition, null, { timeout: 180000 });
  const sleep = (ms) => page.waitForTimeout(ms);
  const ev = (fn, arg) => page.evaluate(`(${fn.toString()})(window.__game.scene.getScene('ExplorationScene'), window.__game.scene.getScene('UIScene'), window.__episode, ${JSON.stringify(arg ?? null)})`);
  const toCss = (x, y, world = true) => page.evaluate(([x, y, world]) => {
    const g = window.__game, c = g.scene.getScene('ExplorationScene').cameras.main, r = g.canvas.getBoundingClientRect(), k = r.width / g.scale.gameSize.width;
    return world ? { x: r.left + (x - c.worldView.x) * c.zoom * k, y: r.top + (y - c.worldView.y) * c.zoom * k } : { x: r.left + x * k, y: r.top + y * k };
  }, [x, y, world]);
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y, id: 1 }] });
  const step = () => ev((e, u, ep) => ep.ep.step);
  const expectStep = async (s) => { const cur = await step(); log('step', cur); assert.equal(cur, s); };
  const obj = (id) => ev((e, u, ep, id) => { const o = e.objects.find(x => x.id === id); return o && { x: o.x, y: o.baseY }; }, id);
  const shot = (n) => page.screenshot({ path: `${shots}/${n}.png` });

  async function go(id, dy = 70) {
    const o = await obj(id);
    const r = await ev((e, u, ep, [x, y]) => {
      const route = e.planPath(x, y); if (!route) return null;
      const d = Math.hypot(route.end.x - x, route.end.y - y);
      if (d < 90) { e.player.stop(); e.player.setPosition(route.end.x, route.end.y); e.cameras.main.centerOn(route.end.x, route.end.y); }
      return Math.round(d);
    }, [o.x, o.y + dy]);
    assert.ok(r != null && r < 90, `A* reaches ${id} (${r})`);
    await sleep(900);
  }
  async function tapObj(id, dy = -30) { const o = await obj(id); const p = await toCss(o.x, o.y + dy); await page.touchscreen.tap(p.x, p.y); await sleep(500); }
  async function clearUi(max = 40) {
    for (let i = 0; i < max; i++) {
      const st = await ev((e, u) => ({ dlg: !!u.dlg, modal: !!u.modal }));
      if (!st.dlg && !st.modal) return;
      await ev((e, u) => {
        if (u.dlg) { if (u.dlg.typing) u.finishTyping(); else { const v = window.__witch.dialogue.view(); if (v?.last && v.choices?.length) u.dialogueChoose(0); else u.dialogueTap(); } }
        else u.pressModalButton(true);
      });
      await sleep(250);
    }
  }
  const magicOn = () => page.evaluate(() => window.__game.scene.isActive('EpisodeMagicScene'));
  const waitMagic = () => page.waitForFunction(() => window.__game.scene.isActive('EpisodeMagicScene') && window.__game.scene.getScene('EpisodeMagicScene').model, null, { timeout: 20000 });
  async function heat({ overheat = false } = {}) {
    await waitMagic();
    const at = await toCss(360, 700, false); let down = false;
    for (let i = 0; i < 1500 && await magicOn(); i++) {
      const m = await page.evaluate(() => { const x = window.__game.scene.getScene('EpisodeMagicScene').model; const h = x?.heat || x; return h && { v: h.value, vel: h.vel, band: h.task.band }; });
      if (!m) break;
      const mid = m.band[0] + (m.band[1] - m.band[0]) * 0.45;
      const want = overheat || m.v + Math.max(0, m.vel) * 0.35 < mid;
      if (want !== down) { await touch(want ? 'touchStart' : 'touchEnd', at); down = want; }
      await sleep(40);
    }
    if (down) await touch('touchEnd', at);
    await sleep(800);
  }
  async function drag() {
    await waitMagic();
    const m = await page.evaluate(() => { const x = window.__game.scene.getScene('EpisodeMagicScene').model; return { x: x.x, y: x.y, tx: x.target.x, ty: x.target.y }; });
    await touch('touchStart', await toCss(m.x, m.y - 40));
    for (let i = 1; i <= 30; i++) { await touch('touchMove', await toCss(m.x + (m.tx - m.x) * i / 30, m.y - 40 + (m.ty - m.y) * i / 30)); await sleep(60); }
    const end = await toCss(m.tx, m.ty - 40);
    for (let i = 0; i < 750; i++) {
      const inside = await page.evaluate(() => { const x = window.__game.scene.getScene('EpisodeMagicScene')?.model; return !x || Math.hypot(x.x - x.target.x, x.y - x.target.y) < x.radius * 0.6; });
      if (inside) break; await touch('touchMove', end); await sleep(80);
    }
    await touch('touchEnd', end); await sleep(900);
  }
  async function stream() {
    await waitMagic(); let down = false, last = null;
    for (let i = 0; i < 1500 && await magicOn(); i++) {
      const s = await page.evaluate(() => window.__game.scene.getScene('EpisodeMagicScene').model?.spots?.find(p => !p.done) || null);
      if (!s) break;
      const p = await toCss(s.x, s.y);
      if (!down) { await touch('touchStart', p); down = true; } else await touch('touchMove', p);
      last = p; await sleep(120);
    }
    if (down) await touch('touchEnd', last); await sleep(900);
  }
  async function fight() {
    await page.waitForFunction(() => window.__game.scene.getScene('EpisodeCombatScene')?.goBtn, null, { timeout: 30000 });
    await sleep(500); await shot('loadout');
    const go = await page.evaluate(() => { const b = window.__game.scene.getScene('EpisodeCombatScene').goBtn.hit; return { x: b.x, y: b.y }; });
    const gp = await toCss(go.x, go.y, false); await page.touchscreen.tap(gp.x, gp.y);
    await page.waitForFunction(() => !!window.__episodeBattle, null, { timeout: 10000 });
    let next = 0, shotDone = false;
    for (let i = 0; i < 4000; i++) {
      const st = await page.evaluate(`(() => { const b = window.__episodeBattle; if (!b || b.result) return { done: true };
        const it = b.intent(); const late = it.state === 'windup' && it.progress * b.def.actions[it.action].windup < 0.4;
        const id = late ? null : (${smartPolicy.toString()})(b); const s = window.__game.scene.getScene('EpisodeCombatScene');
        const btn = id === 'focus' ? s.focusPos : s.buttons.find(x => x.id === id); return { id, x: btn?.x, y: btn?.y, t: b.time }; })()`);
      if (st.done) break;
      if (st.id && st.x != null && Date.now() > next) { const p = await toCss(st.x, st.y, false); await page.touchscreen.tap(p.x, p.y); next = Date.now() + 450; }
      if (!shotDone && st.t > 6) { shotDone = true; await shot('fight'); }
      await sleep(80);
    }
    const r = await page.evaluate(() => { const s = window.__game.scene.getScene('EpisodeCombatScene'); return { result: s.battle.result, stats: s.battle.stats, time: Math.round(s.battle.time) }; });
    await shot('fight-end');
    return r;
  }

  await ready();
  await page.waitForFunction(() => !!window.__game.scene.getScene('UIScene').dlg, null, { timeout: 60000 });
  await shot('intro'); await clearUi(); await expectStep('goran');
  // HUD эпизода: строка цели под верхней панелью
  assert.equal(await ev((e, u) => u.goalText.text), 'Расспросить Горана у костра');

  await go('ep_goran'); await tapObj('ep_goran'); await clearUi(); await expectStep('tree');
  // дерево закрывает северную тропу
  assert.ok(await ev((e) => { const r = e.planPath(1250, 2100); return !r || Math.hypot(r.end.x - 1250, r.end.y - 2100) > 200; }), 'the fallen tree blocks the north trail');
  await go('ep_tree', 170); await tapObj('ep_tree', -20); await shot('drag'); await drag(); await expectStep('wall');
  await go('ep_wall', 100); await tapObj('ep_wall', -60); await sleep(1500); await shot('wall'); await expectStep('ask_fire');
  await go('ep_mirra'); await tapObj('ep_mirra'); await clearUi(); await expectStep('spark');
  await go('ep_circle', 90); await tapObj('ep_circle', -20); await heat(); await clearUi(); await expectStep('herbs');
  assert.ok(await ev(() => window.__witch.abilities.isUnlocked('fire')), 'fire awakened');

  // ошибка и её последствие, затем урок
  await go('ep_herbs_1'); await tapObj('ep_herbs_1', -20); await sleep(800); await shot('heat'); await heat({ overheat: true });
  await shot('charred'); await clearUi();
  assert.deepEqual(await ev((e, u, ep) => ({ lesson: ep.ep.lesson, charred: ep.ep.charred, control: ep.control() })), { lesson: true, charred: 1, control: 1 });
  await go('ep_herbs_2'); await tapObj('ep_herbs_2', -20); await heat(); await clearUi(); await expectStep('gather');

  // сохранение тестового прогресса переживает перезагрузку
  await ev((e) => e.savePosition());
  await page.reload(); await ready(); await sleep(1500); await clearUi();
  await expectStep('gather');
  assert.ok(await ev(() => window.__witch.abilities.isUnlocked('fire')), 'fire after reload');

  for (const id of ['ep_resin_2', 'ep_resin_1']) { await go(id); await tapObj(id, -10); await heat(); await clearUi(); }
  assert.equal(await ev((e, u, ep) => ep.control()), 2, 'three good uses → confident fire');
  await go('ep_lantern_1', 60); await tapObj('ep_lantern_1', -40); await sleep(900);
  assert.equal(await ev((e) => window.__game.scene.isActive('EpisodeMagicScene') || !e.objects.find(o => o.id === 'ep_lantern_1').isDone()), false, 'simple flame in one touch');
  await clearUi();
  for (const id of ['ep_moon_2', 'ep_moon_4', 'ep_moon_1']) { await go(id, 50); await tapObj(id, -10); await sleep(700); }
  await go('ep_shard', 60); await tapObj('ep_shard', -10); await sleep(1500); await clearUi();
  await expectStep('ritual');

  await go('ep_circle', 90); await tapObj('ep_circle', -20); await sleep(1500); await shot('ritual'); await heat(); await clearUi(); await expectStep('melt');
  assert.deepEqual(await ev(() => window.__witch.state.data.inventory.tree_resin || 0), 0, 'the ritual used the ingredients');
  await go('ep_wall', 110); await tapObj('ep_wall', -60); await sleep(1500); await shot('stream'); await stream();
  const result = await fight();
  log('fight', JSON.stringify(result));
  assert.equal(result.result, 'victory');
  assert.ok(result.stats.interrupts + result.stats.combos >= 1, 'the fight used interrupts or combos');
  await page.evaluate(() => { const s = window.__game.scene.getScene('EpisodeCombatScene'); s.leave(s.battle.result); });
  await sleep(900); await clearUi(); await expectStep('enter');

  await go('ep_frost_path', 60); await tapObj('ep_frost_path', -30); await sleep(2500); await ready(); await sleep(1500);
  await shot('frostwood'); await expectStep('sanctuary');
  assert.equal(await ev((e) => e.loc.id), 'frostwood');
  await go('ep_crystal', 120); await tapObj('ep_crystal', -60); await stream(); await sleep(1500);
  await shot('spirit'); await clearUi(1); await sleep(900); await shot('end');
  await expectStep('done');

  assert.equal(await page.evaluate(() => localStorage.getItem('witch_rpg_proto_save_v1')), 'production-save', 'production save untouched');
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('witch_episode_v1:'))), 'episode save is isolated');
  assert.deepEqual(api, []); assert.deepEqual(errors, []);

  // основной маршрут по-прежнему запускает обычные сцены без эпизода
  await page.goto(new URL('?skipmenu', base).href);
  await page.waitForFunction(() => window.__game?.scene.isActive('UIScene'), null, { timeout: 120000 });
  assert.equal(await page.evaluate(() => !!window.__episode || window.__game.scene.keys.EpisodeMagicScene !== undefined), false);
  log('Episode «Первое пламя» browser E2E passed');
} finally { await browser?.close(); await vite?.close(); }
