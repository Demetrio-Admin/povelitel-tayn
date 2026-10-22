// v0.40.0 — «живой город» в настоящем Phaser: люди и звери ходят по улицам, вороны сидят на крышах и перелетают, жители у спасённого дома
// разговаривают, из труб идёт дым (после оттаивания), пока город замёрз — падает снег; лимиты не превышены, число объектов не растёт,
// настройка «Живой мир» всё выключает. Снимки — вне репозитория (CITY_LIFE_SHOTS_DIR).
//   node tests/e2e/city-life.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

process.env.VITE_SUPABASE_URL = ''; process.env.VITE_SUPABASE_ANON_KEY = '';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.CITY_LIFE_SHOTS_DIR || '/tmp/witch-rpg-city-life';
await fs.mkdir(out, { recursive: true });
const modules = await fs.realpath(path.join(root, 'node_modules'));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5195, strictPort: true, hmr: false, fs: { allow: [root, modules] } } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CI ? ['--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
const ok = (m) => console.log('  ✓', m);
// В headless-Chromium без видеокарты город рисуется 2–3 кадра в секунду, а игровое время идёт вместе с кадрами. Поэтому время города
// прокручиваем сами: те же update() и tick(), что вызывает игра, шагом 1/30 с. Рисует и снимает экран настоящий Phaser.
const simulate = (page, sec) => page.evaluate((sec) => {
  const s = window.__game.scene.getScene('ExplorationScene'), C = s.life.city;
  for (let i = 0; i < Math.round(sec * 30); i++) { C.update(1 / 30); if (i % 18 === 0) C.tick(s.cameras.main.worldView); }
}, sec);
const HERO_AT = { x: 7500, y: 1840 };     // у дома, откуда вышли спасённые жители; рядом главная улица квартала
let failed = false;

async function enterCity(thawed) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5195/?reset&skipmenu');
  await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.getScene('ExplorationScene')?.player, null, { timeout: 180000 });
  await page.evaluate(({ thawed, at }) => {
    const w = window.__witch, u = window.__game.scene.getScene('UIScene');
    for (const e of ['prologue_seen', 'chapter_1_complete', 'ch2_start', 'ch2_city_arrived', 'ch2_rescue_door', ...(thawed ? ['chapter_2_complete', 'ch2_severin_defeated'] : ['ch2_frost_wave'])]) w.state.markEvent(e);
    w.settings.set('hints', false); w.tutorial.hide();
    if (u.dlg) u.closeDialogue(true); u.closeModal(null);
    window.__game.scene.getScene('ExplorationScene').travelToLocation('city', at);
  }, { thawed, at: HERO_AT });
  await page.waitForFunction(() => { const s = window.__game.scene.getScene('ExplorationScene'); return s.player && s.loc?.id === 'city' && s.life?.city?.running; }, null, { timeout: 120000 });
  await page.evaluate(() => { Object.defineProperty(window.__game.loop, 'actualFps', { get: () => 60, set() {}, configurable: true });
    const C = window.__game.scene.getScene('ExplorationScene').life.city, take = C.takeOff.bind(C);   // считаем перелёты ворон
    window.__flights = 0; C.takeOff = (c, ...a) => { const was = c.state; take(c, ...a); if (was !== 'fly' && c.state === 'fly') window.__flights++; };
  });   // слабое «железо» тестового браузера — не повод включать лёгкий режим
  await page.waitForTimeout(800);
  return { page, errors, context };
}

const info = (page) => page.evaluate(() => {
  const s = window.__game.scene.getScene('ExplorationScene'), C = s.life?.city, h = s.player;
  const v = s.cameras.main.worldView;
  return {
    running: !!C?.running, lite: !!s.life?.lite, routes: C?.routes.length ?? 0, roofs: C?.roofs.length ?? 0,
    walkers: (C?.walkers || []).map(w => ({ id: (w.__id ??= (window.__wid = (window.__wid || 0) + 1)), facing: w.facing, tex: w.img.texture.key, hx: w.hx, hy: w.hy, waiting: w.wait > 0, angle: Math.round(w.img.angle), target: w.img.angle, flip: w.img.flipX, kind: w.kind, variant: w.variant, x: Math.round(w.img.x), y: Math.round(w.img.y), mode: w.mode, frame: w.frame, onScreen: w.img.x > v.x && w.img.x < v.right && w.img.y > v.y && w.img.y < v.bottom, d: Math.round(Math.hypot(h.x - w.img.x, h.y - w.img.y)) })),
    crows: (C?.crows || []).map(c => ({ state: c.state, x: Math.round(c.img.x), y: Math.round(c.img.y), tex: c.img.texture.key })),
    puffs: (C?.puffs || []).filter(p => p.img.visible).length, flakes: (C?.flakes || []).filter(f => f.img.visible).length,
    flights: window.__flights, chat: !!C?.chat, bubble: C?.chat?.bubble?.text ?? null,
    objs: s.children.list.length, tweens: s.tweens.getTweens().length, hero: [Math.round(h.x), Math.round(h.y)],
    view: [Math.round(v.x), Math.round(v.y), Math.round(v.width), Math.round(v.height)], fps: Math.round(s.game.loop.actualFps),
  };
});

try {
  // ---------- город после оттаивания: людно, дым, разговор, вороны
  {
    const { page, errors, context } = await enterCity(true);
    const first = await info(page);
    assert.ok(first.running && first.routes >= 10, `маршруты по улицам найдены (${first.routes})`); ok(`маршруты по улицам: ${first.routes}`);
    assert.ok(first.roofs >= 6, `крыши для ворон найдены (${first.roofs})`); ok(`крыши: ${first.roofs}`);
    await page.screenshot({ path: `${out}/thawed-00.png` });
    const maxSeen = { person: 0, cat: 0, dog: 0, crowsFly: 0, puffs: 0 };
    let sawChat = false, sawBubbleText = false, minHeroDist = 1e9, offscreenSpawn = 0, variants = new Set();
    for (let i = 1; i <= 16; i++) {
      await simulate(page, 2.5);
      await page.waitForTimeout(150);
      const s = await info(page);
      for (const k of ['person', 'cat', 'dog']) maxSeen[k] = Math.max(maxSeen[k], s.walkers.filter(w => w.kind === k).length);
      maxSeen.crowsFly = Math.max(maxSeen.crowsFly, s.crows.filter(c => c.state === 'fly').length);
      maxSeen.puffs = Math.max(maxSeen.puffs, s.puffs);
      sawChat ||= s.chat; sawBubbleText ||= !!s.bubble && s.bubble !== '…';
      for (const w of s.walkers) { variants.add(w.variant); if (w.kind === 'person') minHeroDist = Math.min(minHeroDist, w.d); }
      if (i === 3 || i === 8 || i === 14) await page.screenshot({ path: `${out}/thawed-${String(i).padStart(2, '0')}.png` });
      assert.ok(s.walkers.filter(w => w.kind === 'person').length <= 5 && s.walkers.filter(w => w.kind !== 'person').length <= 3, 'не больше 5 людей и 3 зверей');
      assert.equal(s.crows.length, 3, 'вороны: три');
    }
    console.log('  [info]', JSON.stringify({ maxSeen, sawChat, sawBubbleText, minHeroDist, variants: [...variants] }));
    assert.ok(maxSeen.person >= 1, 'горожане появляются'); ok(`горожан одновременно до ${maxSeen.person}`);
    // (кошки и собаки на месте у дома могут и не появиться: рядом с героиней улицы не годятся — их проверяет прогулка ниже)
    assert.ok(sawChat, 'жители у дома разговаривают'); ok('жители разговаривают');
    assert.ok(maxSeen.puffs > 0, 'идёт дым из труб'); ok(`дым: клубов до ${maxSeen.puffs}`);
    const last = await info(page);
    assert.ok(last.flights >= 1, `вороны перелетают с крыши на крышу (${last.flights})`); ok(`перелётов ворон: ${last.flights}`);
    assert.equal(last.flakes, 0, 'снега после оттаивания нет'); ok('снега нет');

    // ---------- героиня идёт по городу: прохожие не толпятся вокруг неё, идут правильной стороной, звери смотрят мордой по ходу
    {
      const spots = await page.evaluate(() => {
        const s = window.__game.scene.getScene('ExplorationScene'), C = s.life.city, out = [];
        for (const r of C.routes.slice(0, 12)) { const mid = r.pts[Math.floor(r.pts.length / 2)]; out.push([Math.round(mid[0]), Math.round(mid[1])]); }
        return out;
      });
      assert.ok(spots.length >= 6, 'есть улицы для прогулки');
      const seen = { up: 0, down: 0, petVertical: 0, pets: 0, crowdMax: 0, nearMin: 1e9, badFacing: [], badAngle: [] };
      const back = tex => /^cl_(man|woman)_[ab]_b_\d$/.test(tex);
      for (const [x, y] of spots) {
        await page.evaluate(([x, y]) => { const s = window.__game.scene.getScene('ExplorationScene'); s.player.setPosition(x, y); const c = s.cameras.main; c.stopFollow(); c.centerOn(x, y); c.preRender(); }, [x, y]);   // камера в headless не успевает за героиней сама
        for (let i = 0; i < 40; i++) {
          await simulate(page, 0.5);
          const st = await info(page);
          if (i >= 8) {   // первые секунды после «телепорта» не считаем: герой мог встать прямо на чьём-то пути
            seen.crowdMax = Math.max(seen.crowdMax, st.walkers.filter(w => w.d < 380).length);
            for (const w of st.walkers) if (w.kind === 'person') seen.nearMin = Math.min(seen.nearMin, w.d);
          }
          for (const w of st.walkers) {
            // снимки крупным планом: человек, идущий вверх (спиной), и зверь на вертикальной улице
            const shot = async (name) => {
              await page.waitForTimeout(700);   // дать настоящему Phaser дорисовать кадр с этим состоянием
              const at = await page.evaluate((id) => {
                const sc = window.__game.scene.getScene('ExplorationScene'), cam = sc.cameras.main, W = sc.city?.walkers || sc.life.city.walkers;
                const t = W.find(x => x.__id === id); if (!t) return null;
                const r = window.__game.canvas.getBoundingClientRect(), k = r.width / window.__game.config.width;
                return { x: r.left + (t.img.x - cam.worldView.x) * cam.zoom * k, y: r.top + (t.img.y - cam.worldView.y) * cam.zoom * k, k: cam.zoom * k };
              }, w.id);
              if (!(at && at.x > 50 && at.x < 340 && at.y > 140 && at.y < 780)) return false;
              await page.screenshot({ path: `${out}/${name}.png`, clip: { x: at.x - 70, y: at.y - 150, width: 140, height: 190 } });
              return true;
            };
            if (w.onScreen && w.kind === 'person' && w.hy < -0.7 && !w.waiting && !seen.shotBack) seen.shotBack = await shot('closeup-person-back');
            if (w.onScreen && w.kind === 'person' && w.hy > 0.7 && !w.waiting && !seen.shotFront) seen.shotFront = await shot('closeup-person-front');
            if (w.onScreen && w.kind !== 'person' && w.mode === 'run' && Math.abs(w.hy) > 0.8 && !seen.shotPet) seen.shotPet = await shot('closeup-pet-vertical');
            if (w.kind !== 'person') seen.pets++;
            if (w.waiting || w.hy === undefined) continue;
            if (w.kind === 'person') {
              if (w.hy < -0.55) { seen.up++; if (!back(w.tex)) seen.badFacing.push(`${w.variant}: идёт вверх (hy ${w.hy.toFixed(2)}), но кадр ${w.tex}`); }
              else if (w.hy > -0.15) { seen.down++; if (back(w.tex)) seen.badFacing.push(`${w.variant}: идёт вниз/вбок (hy ${w.hy.toFixed(2)}), но кадр ${w.tex}`); }
            } else if (w.mode !== 'sit' && Math.abs(w.hy) > 0.8) {
              seen.petVertical++;
              if (Math.abs(w.angle) < 40) seen.badAngle.push(`${w.variant}: по вертикали, угол ${w.angle}`);
            }
          }
        }
      }
      console.log('  [info] прогулка', JSON.stringify({ ...seen, badFacing: seen.badFacing.length, badAngle: seen.badAngle.length }));
      assert.ok(seen.up > 5 && seen.down > 5, `видели ходьбу вверх и вниз (${seen.up}/${seen.down})`); ok(`горожане: вверх ${seen.up} / вниз ${seen.down} замеров`);
      assert.deepEqual(seen.badFacing.slice(0, 5), [], 'идущий вверх повёрнут спиной, вниз — лицом'); ok('вверх — спиной, вниз — лицом');
      assert.ok(seen.pets > 0, 'звери встречаются во время прогулки'); ok(`звери встречены (${seen.pets} замеров)`);
      assert.ok(seen.petVertical > 10 && seen.badAngle.length <= seen.petVertical * 0.08, `зверь на вертикальной улице повёрнут мордой по ходу, а не боком (${seen.badAngle.length} из ${seen.petVertical} не успели довернуть)`); ok(`звери повёрнуты по ходу (замеров по вертикали: ${seen.petVertical})`);
      assert.ok(seen.crowdMax <= 3, `возле героини не толпа (макс. ${seen.crowdMax} в радиусе 380 px)`); ok(`рядом с героиней не больше ${seen.crowdMax}`);
      assert.ok(seen.nearMin >= 85, `прохожие не лезут на героиню (ближе всего ${seen.nearMin} px)`); ok(`ближе всего прохожий подошёл на ${seen.nearMin} px`);
    }
    assert.deepEqual(errors, [], 'ошибок страницы нет'); ok('ошибок страницы нет');
    // объекты не копятся: ещё 20 с, число не растёт заметно
    const before = (await info(page)).objs; await simulate(page, 90); const after = await info(page);
    assert.ok(after.objs <= before + 12, `число объектов сцены не растёт (${before} → ${after.objs})`); ok(`объекты сцены: ${before} → ${after.objs}`);
    // настройка «Живой мир» выключает
    await page.evaluate(() => window.__witch.settings.set('anim', false)); await page.waitForTimeout(500);
    const off = await info(page);
    assert.equal(off.running, false); ok('настройка «Живой мир» выключает город');
    await page.evaluate(() => window.__witch.settings.set('anim', true)); await page.waitForTimeout(800);
    assert.equal((await info(page)).running, true); ok('и включает обратно');
    await context.close();
  }
  // ---------- замёрзший город: меньше людей, снег, без дыма
  {
    const { page, errors, context } = await enterCity(false);
    await simulate(page, 4); await page.waitForTimeout(200);
    const s = await info(page);
    assert.ok(s.flakes > 0 && s.puffs === 0, 'пока город замёрз — снег, без дыма'); ok(`снег: ${s.flakes} снежинок, дыма нет`);
    await page.screenshot({ path: `${out}/frozen-00.png` });
    await simulate(page, 40);
    const t = await info(page);
    assert.ok(t.walkers.filter(w => w.kind === 'person').length <= 2 && t.walkers.filter(w => w.kind !== 'person').length <= 1, 'в замёрзшем городе ≤ 2 людей и ≤ 1 зверя'); ok('замёрзший город малолюден');
    assert.deepEqual(errors, []);
    await context.close();
  }
} catch (e) {
  failed = true; console.error(e);
} finally {
  await browser.close(); await server.close();
}
if (failed) process.exit(1);
console.log('✓ Живой город в браузере: люди, звери, вороны, разговор, дым и снег. Снимки:', out);
