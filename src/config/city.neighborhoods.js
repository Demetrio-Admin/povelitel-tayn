// Continue the approved Archive garden treatment without moving buildings or story objects.
import { buildRoad } from '../world/terrain.js';
import { distToPolygon } from '../world/geometry.js';
import { inArchiveDistrict } from './city.archive.js';

export function dressCityNeighborhoods({ colliders, props, roads, point, buildings, questPositions }) {
  const stall = colliders.find(c => c.id === 'city_plan_market');
  if (stall) Object.assign(stall, { tex: 'city_neighborhood_market_stall', editorStyle: { w: 180, h: 160 } });
  const origin = point(0, 0);
  const loadingLamp = props.find(p => p.id === 'city_plan_lamp_01_2');
  if (loadingLamp) Object.assign(loadingLamp, point(1420, 5340));
  const inside = p => p.x > origin.x + 680 && p.x < origin.x + 2600 &&
    p.y > origin.y + 160 && p.y < origin.y + 5560;
  const archive = p => inArchiveDistrict(p.x - origin.x, p.y - origin.y);
  // Remove the old regularly spaced tree/hedge ornaments; retain each house's useful furniture and story details.
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    if (inside(p) && !archive(p) && /^city_walk_(tree_|hedge|flowerbed)/.test(p.k)) props.splice(i, 1);
  }
  for (const r of roads) if (r.kind === 'stone') {
    r.texture = 'city_archive_worn_paving'; r.tileScale = 0.34; r.urban = false;
  }
  // Reuse the irregular transparent lawn material. Northern frost remains a separate story-controlled layer.
  for (const [id, x, y, w, h] of [
    ['square', 1640, 4050, 1920, 1040], ['market', 1640, 4810, 1920, 1040],
    ['gate', 1640, 5570, 1920, 940], ['quarter', 1640, 2080, 1920, 944], ['north', 1640, 1090, 1920, 920],
  ]) props.push({ id: 'neighborhood_ground_' + id, k: 'city_archive_garden_ground',
    ...point(x, y), w, h, solid: null, l: 'ground', ...(y < 2081 ? { frost: true } : {}) });

  const lane = (id, w, pts) => roads.push({ id: 'city_street_neighborhood_' + id, kind: 'stone', w,
    pts: pts.map(([x, y]) => { const p = point(x, y); return [p.x, p.y]; }),
    texture: 'city_archive_worn_paving', tileScale: 0.34, seamless: true });
  // Small real routes join the existing side walks, rather than decorative dead-end strips.
  lane('market_link', 88, [[1430, 4430], [1550, 4510], [1680, 4600]]);
  lane('bank_link', 88, [[1800, 4390], [1920, 4350], [2050, 4310]]);
  lane('fountain_south', 94, [[1380, 3560], [1390, 3710], [1500, 3780]]);
  lane('herb_garden', 64, [[2220, 3490], [2080, 3690], [2180, 3890], [2350, 4010]]);
  lane('warehouse_a', 90, [[1150, 5090], [1320, 5210], [1490, 5220], [1600, 5060]]);
  const streetShapes = roads.map((r, i) => buildRoad(r, i));
  const intersects = (a, b, pad = 8) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad &&
    a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
  let index = 0;
  const add = (k, x, y, extra = {}) => {
    const p = point(x, y), solid = extra.solid ?? null;
    if (archive(p) || !inside(p)) return;
    if (buildings.some(b => Math.abs(p.x - b.door.x) < 112 && p.y > b.door.y - 25 && p.y < b.door.y + 150)) return;
    if (Object.values(questPositions).some(q => Math.hypot(p.x - q.x, p.y - q.y) < 135)) return;
    if (!solid && streetShapes.some(r => distToPolygon(p.x, p.y, r.poly) < 12)) return;
    if (!solid && colliders.some(c => p.x > c.x - 8 && p.x < c.x + c.w + 8 && p.y > c.y - 8 && p.y < c.y + c.h + 8)) return;
    if (solid) {
      const scale = extra.s || 1;
      const box = { x: p.x - solid.w * scale / 2, y: p.y - solid.h * scale, w: solid.w * scale, h: solid.h * scale };
      if (colliders.some(c => intersects(box, c)) || streetShapes.some(r => distToPolygon(p.x, p.y, r.poly) < 38)) return;
      if (props.some(q => q.solid && typeof q.solid === 'object' && intersects(box,
        { x: q.x - q.solid.w * (q.s || 1) / 2, y: q.y - q.solid.h * (q.s || 1), w: q.solid.w * (q.s || 1), h: q.solid.h * (q.s || 1) }))) return;
    }
    props.push({ id: 'neighborhood_' + index++, k, ...p, solid, ...(y < 2080 ? { frost: true } : {}), ...extra });
  };
  const tree = (k, x, y, s = 1) => {
    const before = props.length;
    add(k, x, y, { s, solid: { w: 26, h: 16 } });
    if (props.length === before) return;
    add('bush_02', x - 48, y + 24, { s: 0.7, solid: { w: 26, h: 12 } });
    add('flower_white_01', x + 34, y + 16, { s: 0.8 });
    add('flower_purple_01', x - 30, y + 40, { s: 0.75 });
  };
  const grove = list => list.forEach(([x, y, k, s]) => tree(k, x, y, s));
  // Plaza: grove behind the duel hall, shaded fountain garden, herb borders at the coven side.
  grove([
    [760, 3260, 'tree_dark_01', 1.15], [870, 3210, 'tree_autumn_01', 1.1],
    [1340, 3190, 'tree_dark_02', 1], [760, 3540, 'tree_autumn_02', 1.1],
    [950, 3650, 'birch_01', 1.1], [1150, 3760, 'tree_autumn_01', 1.05],
    [790, 3870, 'tree_dark_02', 1.1], [850, 4030, 'tree_autumn_01', 1.15],
    [1250, 3940, 'tree_dark_01', 1.05], [1850, 3830, 'tree_autumn_02', 1.05],
    [2020, 3680, 'tree_dark_01', 1], [2160, 3500, 'birch_01', 1.1],
    [2420, 3300, 'tree_autumn_01', 1.1], [2510, 3490, 'tree_dark_02', 1.15],
    [2490, 3790, 'tree_autumn_02', 1.08], [2430, 3990, 'tree_dark_01', 1.1],
    [2090, 3930, 'birch_01', 1], [1790, 3190, 'tree_dark_02', 0.9],
  ]);
  // Market: orchard on the west, bank garden on the east; customer and noticeboard remain clear.
  grove([
    [760, 4180, 'tree_dark_01', 1.1], [900, 4260, 'tree_autumn_01', 1.1],
    [1120, 4200, 'tree_dark_02', 1], [1150, 4500, 'tree_autumn_02', 1.1],
    [800, 4550, 'birch_01', 1.1], [940, 4680, 'tree_dark_01', 1.1],
    [1310, 4670, 'tree_autumn_01', 1], [1880, 4660, 'tree_autumn_02', 1.1],
    [2200, 4540, 'birch_01', 1.08], [2400, 4640, 'tree_dark_02', 1.1],
    [2500, 4430, 'tree_autumn_01', 1.12], [2350, 4200, 'tree_dark_01', 1.12],
    [2230, 4050, 'tree_autumn_02', 1], [2020, 4560, 'tree_dark_02', 0.95],
    [1020, 4050, 'tree_autumn_02', 1.05], [1120, 4110, 'birch_01', 1],
    [2060, 3910, 'tree_dark_01', 1.05], [2190, 4000, 'tree_autumn_01', 1],
    [2340, 4530, 'tree_autumn_02', 1.05], [2500, 4730, 'birch_01', 1],
  ]);
  // Gate: working yards stay open; larger trees frame the loading areas and southern resting place.
  grove([
    [780, 4810, 'tree_dark_01', 1.12], [940, 4770, 'tree_autumn_02', 1.08],
    [1490, 4820, 'tree_dark_02', 1], [2430, 4900, 'tree_autumn_01', 1.15],
    [2500, 5140, 'tree_dark_01', 1.1], [2370, 5370, 'tree_autumn_02', 1.1],
    [2130, 5500, 'tree_dark_02', 1.12], [1850, 5480, 'tree_autumn_01', 1.1],
    [1480, 5500, 'birch_01', 1.1], [1120, 5500, 'tree_autumn_02', 1.1],
    [850, 5450, 'tree_dark_01', 1.1], [780, 5310, 'tree_autumn_01', 1.05],
    [2010, 4800, 'tree_dark_02', 1], [2260, 4800, 'birch_01', 1.05],
  ]);
  // Cold residential gardens keep the existing frost semantics, so they thaw with the chapter.
  grove([
    [780, 1320, 'tree_dark_01', 1.1], [920, 1410, 'tree_autumn_02', 1],
    [1410, 1370, 'tree_dark_02', 1.1], [800, 1570, 'tree_dark_02', 1],
    [790, 1910, 'birch_01', 1.1], [1140, 2040, 'tree_dark_01', 1],
    [1400, 2000, 'tree_autumn_02', 1], [2440, 1950, 'tree_dark_01', 1.15],
    [2350, 1780, 'tree_autumn_01', 1.05], [2470, 1510, 'tree_dark_02', 1.1],
    [2260, 1300, 'birch_01', 1.1], [2010, 1280, 'tree_dark_01', 1.05],
    [1160, 1240, 'tree_dark_02', 1], [2440, 1230, 'tree_autumn_02', 1.05],
    [790, 420, 'tree_dark_01', 1.15], [920, 300, 'tree_autumn_01', 1.05],
    [1420, 270, 'tree_dark_02', 1.08], [2040, 250, 'birch_01', 1.1],
    [2450, 450, 'tree_dark_01', 1.12], [2470, 740, 'tree_autumn_02', 1],
    [2410, 1010, 'tree_dark_02', 1.05], [2140, 1010, 'tree_autumn_01', 1],
    [1360, 1000, 'tree_dark_01', 1.05], [800, 970, 'birch_01', 1.1],
    [840, 760, 'tree_dark_02', 1], [2490, 260, 'tree_dark_02', 1.1],
  ]);
  // Layered borders sit at courtyard edges, never fill the event space or the walkable centre.
  for (const [x, y] of [
    [790, 3470], [1110, 3710], [1240, 3860], [1840, 3750], [2080, 3550], [2480, 3670],
    [2410, 3880], [2070, 4020], [800, 4120], [1080, 4280], [1160, 4590], [1320, 4630],
    [1910, 4620], [2200, 4460], [2480, 4530], [2330, 4090], [790, 4870], [1440, 4820],
    [2290, 4840], [2450, 5290], [2220, 5460], [1780, 5420], [1350, 5460], [950, 5400],
    [810, 1370], [1380, 1300], [840, 1960], [2300, 1860], [2400, 1400], [2070, 1320],
    [800, 530], [960, 890], [1350, 960], [2120, 960], [2410, 920], [2320, 360],
    // Flowering banks beside the routes, not another row of evenly spaced trees.
    [1130, 3530], [1170, 3590], [1290, 3800], [1310, 3980], [1390, 4070],
    [1710, 3830], [1800, 3900], [1960, 3770], [2210, 3650], [2280, 3750], [2460, 3840],
    [1030, 4140], [1210, 4150], [1320, 4220], [1360, 4300], [1190, 4560], [1090, 4620],
    [1780, 4180], [1820, 4100], [2290, 4390], [2330, 4450], [2110, 4590], [1980, 4650],
    [1340, 4770], [1260, 4820], [1390, 4900], [1880, 4820], [2160, 4860], [2360, 4940],
    [1230, 5360], [1330, 5420], [1690, 5370], [1860, 5400], [2050, 5430], [2200, 5370],
    [1010, 1400], [1110, 1350], [1310, 1440], [1370, 1530], [2160, 1390], [2290, 1460],
    [2280, 1930], [2140, 2040], [1190, 1970], [1290, 2020], [850, 1690],
    [880, 650], [1020, 880], [1160, 940], [1320, 920], [2130, 930], [2310, 980],
  ]) {
    add('bush_02', x, y, { s: 0.85, solid: { w: 30, h: 14 } });
    add('bush_01', x - 32, y + 22, { s: 0.7, solid: { w: 24, h: 12 } });
    add('flower_white_01', x + 30, y + 18, { s: 0.85 });
    add('flower_purple_01', x - 22, y + 40, { s: 0.8 });
    add('flower_white_01', x + 12, y + 48, { s: 0.65 });
    add('flower_purple_01', x + 54, y + 30, { s: 0.75 });
    add('flower_white_01', x - 46, y + 52, { s: 0.7 });
  }
  for (const [x, y] of [[1190, 3830], [1880, 3860], [2210, 3500], [2380, 4010], [1160, 4300],
    [1870, 4510], [2240, 4430], [900, 5330], [1490, 5370], [2240, 5340],
    [900, 1860], [2250, 1710], [1440, 1200], [2000, 990], [1040, 890]])
    add('city_walk_lamp', x, y, { w: 42, h: 114, light: 36, solid: { w: 14, h: 10 } });

  // Sparse ornamental accents from the selected city preview. Append with stable IDs
  // so every existing tree, decoration, doorstep and route keeps its placement.
  for (const [id, k, x, y, s] of [
    ['plaza_lilac', 'city_walk_tree_plum', 1140, 3560, 1.4],
    ['plaza_sage', 'city_walk_tree_sage', 1875, 3500, 1.4],
    ['garden_amber', 'city_walk_tree_amber', 1925, 3760, 1.35],
    ['market_sage', 'city_walk_tree_sage', 1300, 4265, 1.35],
    ['bank_lilac', 'city_walk_tree_plum', 2310, 4305, 1.4],
  ]) props.push({ id: 'city_ornamental_' + id, k, ...point(x, y), s, solid: { w: 18, h: 10 } });
}
