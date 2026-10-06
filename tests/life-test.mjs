// v0.28.0 — «живой мир»: выбор качающихся деревьев и точек ряби, ассеты, настройка.
//   node tests/life-test.mjs
import fs from 'fs';
import { LIFE, swayAmplitude, pickSwayers, pickWaterSpot, pathClear, isHideout } from '../src/world/life.js';
import { ZONES } from '../src/config/world.layout.js';
import { ASSET_FILES, DISPLAY_SIZE } from '../src/config/assets.manifest.js';
import { createDefaultSettings, Settings } from '../src/state/Settings.js';
import { WORLD } from '../src/config/world.layout.js';
import { resolveMap } from '../src/world/mapData.js';
import { buildTerrain } from '../src/world/terrain.js';
import { AMBIENT } from '../src/config/world.content.js';
import { touchesLocation, locationById } from '../src/config/locations.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const seeded = (s) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };

console.log('\nЖивой мир: данные');
{
  for (const k of ['life_bird_1', 'life_bird_2', 'life_bird_3', 'life_squirrel_1', 'life_squirrel_2', 'life_squirrel_3', 'life_rabbit_1', 'life_rabbit_2', 'life_rabbit_3', 'life_leaf']) {
    ok(ASSET_FILES[k] && fs.existsSync('public/' + ASSET_FILES[k].split('?')[0]) && DISPLAY_SIZE[k], `ассет ${k}: файл и размер`);
  }
  ok(swayAmplitude('tree_dark_01') > 0 && swayAmplitude('birch_01') > 0 && swayAmplitude('reeds_01') > swayAmplitude('tree_dark_01'), 'деревья и камыш качаются, камыш сильнее');
  ok(swayAmplitude('rock_small_01') === 0 && swayAmplitude('chest_01') === 0 && swayAmplitude('wooden_bridge_01') === 0, 'камни, сундуки и мост — стоят на месте');
  ok(createDefaultSettings().anim === true, 'настройка «Живой мир» включена по умолчанию');
  const st = new Settings(null); st.toggle('anim'); ok(st.get('anim') === false, 'настройку можно выключить');
  ok(AMBIENT.some(a => a.id.startsWith('creek_fireflies') && touchesLocation(a.rect, locationById('forest'))), 'светлячки у ручья лежат в лесу Мирры');
  ok(LIFE.maxRipples <= 10 && LIFE.maxSwayers <= 24 && LIFE.leafCount <= 12, 'пулы маленькие: рябь ≤ 10, качающихся деревьев ≤ 24, листьев ≤ 12');
}

console.log('\nЖивой мир: выбор деревьев');
{
  const items = [];
  const r = seeded(5);
  for (let i = 0; i < 590; i++) items.push({ id: 't' + i, x: r() * 1800, y: r() * 5400 });
  const view = { x: 400, y: 2000, width: 720, height: 1280 };
  const pick = pickSwayers(items, view, LIFE.maxSwayers);
  ok(pick.length === LIFE.maxSwayers, `из 590 деревьев выбрано ровно ${LIFE.maxSwayers}`);
  ok(pick.every(p => p.x > view.x - 161 && p.x < view.x + view.width + 161 && p.y > view.y - 161 && p.y < view.y + view.height + 281), 'все выбранные — рядом с экраном');
  const cx = view.x + 360, cy = view.y + 640, d = (p) => Math.hypot(p.x - cx, p.y - cy);
  ok(pick.every((p, i) => i === 0 || d(pick[i - 1]) <= d(p)), 'сначала самые близкие к центру камеры');
  ok(pickSwayers(items, { x: -5000, y: -5000, width: 700, height: 1200 }, 14).length === 0, 'далеко от деревьев никто не качается');
}

console.log('\nЖивой мир: путь зверька');
{
  const house = ZONES.find(z => z.interior);
  ok(!!house && house.id === 'A', 'дом Мирры помечен как interior — туда зверьки не заходят');
  ok(isHideout('tree_dark_01') && isHideout('bush_02') && isHideout('birch_01') && !isHideout('rock_small_01') && !isHideout('reeds_01') && !isHideout('flower_white_01'), 'прятаться можно за деревом, берёзой, кустом — не за камнем и цветком');
  const free = { water: [], solids: [], avoid: [], hero: null };
  ok(pathClear({ x: 0, y: 0 }, { x: 300, y: 0 }, free), 'пустое поле — путь чист');
  ok(!pathClear({ x: 0, y: 0 }, { x: 300, y: 0 }, { ...free, water: [{ x: 140, y: -20, w: 60, h: 40 }] }), 'через воду бежать нельзя');
  ok(!pathClear({ x: 0, y: 0 }, { x: 300, y: 0 }, { ...free, solids: [{ x: 140, y: -20, w: 30, h: 40 }] }), 'через камень или ствол бежать нельзя');
  ok(pathClear({ x: 0, y: 0 }, { x: 300, y: 0 }, { ...free, solids: [{ x: 280, y: -20, w: 30, h: 40 }] }), 'само дерево у цели не мешает добежать');
  ok(!pathClear({ x: 600, y: 4600 }, { x: 900, y: 5000 }, { ...free, avoid: [house] }) && pathClear({ x: 200, y: 4000 }, { x: 300, y: 4100 }, { ...free, avoid: [house] }), 'дом Мирры обходится, а рядом с ним путь чист');
  ok(!pathClear({ x: 0, y: 0 }, { x: 300, y: 0 }, { ...free, hero: { x: 150, y: 30 } }) && pathClear({ x: 0, y: 0 }, { x: 300, y: 0 }, { ...free, hero: { x: 150, y: 400 } }), 'зверёк не бежит прямо на героиню');
}

console.log('\nЖивой мир: рябь на воде');
{
  const LIVE = resolveMap({ storage: null, useDraft: false });
  const terrain = buildTerrain({ ROADS: LIVE.roads, WATERS: LIVE.waters });
  const inWater = (p) => terrain.waterRects.some(w => p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h);
  const rnd = seeded(11);
  const creekView = { x: 400, y: 2000, width: 720, height: 1280 };
  let n = 0, bad = 0;
  for (let i = 0; i < 200; i++) { const p = pickWaterSpot(terrain.waterRects, creekView, rnd); if (p) { n++; if (!inWater(p) || p.x < creekView.x || p.x > creekView.x + creekView.width || p.y < creekView.y || p.y > creekView.y + creekView.height) bad++; } }
  ok(n === 200 && bad === 0, 'у ручья: каждая точка ряби — внутри воды и внутри экрана');
  const dry = pickWaterSpot(terrain.waterRects, { x: 1200, y: 1900, width: 400, height: 500 }, rnd);
  ok(dry === null, 'на сухом экране рябь не появляется');
}

console.log(failures ? `\n✗ Провалов: ${failures}` : '\n✓ Живой мир: всё в порядке');
process.exit(failures ? 1 : 0);
