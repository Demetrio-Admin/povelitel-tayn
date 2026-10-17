// A local art pass, not a new city layout: entrances, quest positions, canal and save coordinates stay stable.
import { buildRoad } from '../world/terrain.js';
import { distToPolygon } from '../world/geometry.js';

export const ARCHIVE_DISTRICT = { x: 680, y: 2190, w: 1920, h: 930 };
export const inArchiveDistrict = (x, y) => x >= 680 && x <= 2600 && y >= 2190 && y <= 3120;

export function dressArchiveDistrict({ colliders, props, roads, point, buildings, questPositions }) {
  const local = p => ({ x: p.x - point(0, 0).x, y: p.y - point(0, 0).y });
  // Retain IDs outside the district, and remove the old isolated lawn ornaments inside it.
  for (let i = props.length - 1; i >= 0; i--) {
    const p = local(props[i]);
    if (inArchiveDistrict(p.x, p.y)) props.splice(i, 1);
  }
  // A softly transparent, irregular ground patch blends into the existing town lawn.
  props.push({ id: 'archive_garden_ground', k: 'city_archive_garden_ground', ...point(1640, 3190),
    w: 1920, h: 1040, solid: null, l: 'ground' });

  const worn = new Set(['main_garden', 'archive_lane', 'archive_court', 'society_lane', 'society_court', 'embankment', 'bridge']);
  for (const r of roads) if (worn.has(r.id.replace('city_street_', ''))) {
    r.texture = 'city_archive_worn_paving'; r.tileScale = 0.34; r.urban = false;
    if (r.id === 'city_street_archive_court') {
      r.w = 110;
      r.pts = [[1250, 2590], [1250, 2710]].map(([x, y]) => { const p = point(x, y); return [p.x, p.y]; });
    }
  }
  const lane = (id, w, pts) => roads.push({ id: 'city_street_archive_' + id, kind: 'stone', w,
    pts: pts.map(([x, y]) => { const p = point(x, y); return [p.x, p.y]; }),
    texture: 'city_archive_worn_paving', tileScale: 0.34, seamless: true });
  // A connected, irregular forecourt and a smaller side pocket for reading.
  lane('forecourt', 130, [[1230, 2685], [1370, 2735], [1500, 2730], [1600, 2700]]);
  lane('reading', 100, [[1350, 2740], [1270, 2820], [1200, 2850]]);
  lane('garden_loop', 66, [[1200, 2850], [1030, 2850], [895, 2730], [880, 2570], [920, 2390], [1060, 2252]]);

  const bench = (id, x, y) => {
    const c = colliders.find(c => c.id === 'city_plan_bench_' + id);
    if (c) Object.assign(c, point(x - 48, y - 17));
  };
  bench(4, 1130, 2805); bench(5, 2260, 2308); bench(6, 1060, 2300); bench(7, 1990, 2300);
  const oldFence = colliders.find(c => c.id === 'city_plan_fence_archive_garden');
  if (oldFence) Object.assign(oldFence, point(880, 2960), { w: 200 });
  const fence = (id, x, y, w) => colliders.push({ id: 'archive_fence_' + id, kind: 'fence',
    ...point(x, y), w, h: 12, style: 'iron' });
  fence('reading_south', 1220, 2960, 170); // Opening leads back to the street and the garden loop.
  fence('archive_side', 950, 2560, 115);
  fence('society_south', 2150, 2910, 170);

  const streetShapes = roads.map((r, i) => buildRoad(r, i));
  const mainStreets = streetShapes.filter(r => /city_street_main_/.test(r.id));
  const blocked = (p, solid) => {
    if (!solid) return false;
    const box = { x: p.x - solid.w / 2, y: p.y - solid.h, w: solid.w, h: solid.h };
    return colliders.some(c => c.x < box.x + box.w + 6 && c.x + c.w > box.x - 6 &&
      c.y < box.y + box.h + 6 && c.y + c.h > box.y - 6);
  };
  let n = 0;
  const add = (k, x, y, extra = {}) => {
    const p = point(x, y), solid = extra.solid ?? null;
    if (buildings.some(b => Math.abs(p.x - b.door.x) < 95 && p.y > b.door.y - 20 && p.y < b.door.y + 140)) return;
    if (Object.values(questPositions).some(q => Math.hypot(p.x - q.x, p.y - q.y) < 125)) return;
    if (solid && (blocked(p, solid) || mainStreets.some(r => distToPolygon(p.x, p.y, r.poly) < 32) ||
      streetShapes.some(r => distToPolygon(p.x, p.y, r.poly) < 20))) return;
    props.push({ id: 'archive_courtyard_' + n++, k, ...p, solid, ...extra });
  };
  const tree = (k, x, y, s = 1) => {
    const p = point(x, y);
    // Keep trunks and a broad margin off every path; crowns may overhang planted borders.
    if (streetShapes.some(r => distToPolygon(p.x, p.y, r.poly) < 38)) return;
    add(k, x, y, { s, solid: { w: 26, h: 16 } });
  };
  // Large authored groups replace the evenly scattered town trees. Reuse the first chapter's paintings.
  for (const [x, y, k, s] of [
    [760, 2360, 'tree_dark_01', 1.12], [900, 2330, 'tree_autumn_01', 1.12],
    [1040, 2330, 'tree_dark_02', 1], [1180, 2280, 'tree_dark_01', 0.95], [1380, 2290, 'tree_autumn_02', 1],
    [800, 2510, 'tree_autumn_02', 1.05],
    [760, 2690, 'tree_dark_01', 1.08], [815, 2860, 'tree_autumn_01', 1.18],
    [910, 2990, 'birch_01', 1.1], [790, 3080, 'tree_dark_02', 1.1],
    [1070, 3090, 'tree_autumn_02', 1.05], [1240, 3110, 'tree_dark_01', 1],
    [1400, 3000, 'tree_autumn_01', 1.05], [1430, 2480, 'tree_dark_02', 0.85],
    [1040, 2810, 'tree_autumn_01', 1.1], [1070, 2990, 'tree_dark_02', 1],
    [1040, 3010, 'tree_dark_02', 1.1], [1320, 2970, 'birch_01', 1.08],
    [1020, 2700, 'tree_dark_01', 1.05], [1350, 2860, 'tree_autumn_02', 1],
    [1450, 2870, 'birch_01', 1.05], [1760, 2890, 'tree_dark_01', 1],
    [1260, 3110, 'tree_autumn_02', 1.05], [1380, 3115, 'tree_dark_01', 1.1],
    [1790, 2920, 'tree_dark_02', 1], [1770, 3080, 'tree_autumn_02', 1],
    [1800, 2370, 'tree_autumn_02', 1.12], [1940, 2390, 'tree_dark_01', 1],
    [2110, 2410, 'tree_autumn_01', 1.08], [2280, 2470, 'tree_dark_02', 1.12],
    [2430, 2420, 'tree_autumn_02', 1.08], [2500, 2600, 'tree_dark_01', 1.12],
    [2420, 2800, 'tree_autumn_01', 1.1], [2260, 2950, 'birch_01', 1.1],
    [2430, 3100, 'tree_dark_02', 1.08], [2070, 3090, 'tree_autumn_02', 1.08],
    [1810, 3060, 'tree_dark_01', 1], [1710, 2850, 'tree_autumn_01', 0.9],
  ]) tree(k, x, y, s);

  add('city_archive_reading_table', 1200, 2930, { solid: { w: 112, h: 34 } });
  add('city_archive_shelf', 1090, 2600, { w: 80, h: 70, solid: { w: 64, h: 20 } });
  add('city_final_archive_desk', 1460, 2555, { w: 66, h: 55, solid: { w: 52, h: 18 } });
  add('city_sign_archive', 1440, 2650, { id: 'city_plan_archive_sign', w: 62, h: 70 });
  add('rune_slab_01', 2150, 2795, { l: 'floor', s: 0.65 });
  add('city_sign_society', 2160, 2720, { id: 'city_plan_society_sign', w: 62, h: 70 });
  // Lanterns mark the courtyard opening and the waterfront; no obstacle at either doorstep.
  for (const [x, y] of [[1390, 2820], [960, 2740], [1465, 2370], [1730, 2470], [2250, 2820], [900, 2192], [1250, 2192], [1950, 2192], [2350, 2192]])
    add('city_walk_lamp', x, y, { w: 42, h: 114, light: 36, solid: { w: 14, h: 10 } });
  for (const [x, y] of [[880, 2960], [1080, 2960], [1220, 2960], [1390, 2960], [950, 2560], [1065, 2560]])
    add('city_walk_wall_post', x, y, { w: 30, h: 66 });

  // Underplanting follows the sides of real routes, never a uniform filler grid.
  for (const [x, y] of [[760, 2420], [1000, 2320], [800, 2650], [880, 2910], [1020, 2970], [1230, 2990], [1350, 2860],
    [1430, 2410], [1750, 2350], [2040, 2340], [2250, 2410], [2430, 2530], [2340, 2810], [2200, 2950], [1850, 2960]]) {
    add('bush_02', x, y, { s: 0.9, solid: { w: 38, h: 18 } });
    add('flower_white_01', x + 34, y + 12, { s: 0.8 });
    add('flower_purple_01', x - 24, y + 22, { s: 0.85 });
  }
  for (const [x, y] of [[900, 2760], [1160, 2910], [1380, 2750], [1100, 2360], [2180, 2840]])
    add('city_walk_planter', x, y, { w: 64, h: 52, solid: { w: 48, h: 16 } });
  for (const [x, y] of [[840, 2360], [850, 2990], [2460, 2990], [2300, 2370]])
    add('rock_small_01', x, y, { s: 0.85, solid: { w: 32, h: 16 } });
  for (const [x, y] of [[980, 2200], [1190, 2200], [2010, 2200], [2360, 2200]])
    add('reeds_01', x, y, { s: 0.65 });
  // Deep planted borders frame the shared court; small leaf/flower layers stay below the walking space.
  for (const [x, y] of [[1040, 2430], [1030, 2560], [1050, 2730], [1410, 2590], [1470, 2470],
    [1750, 2470], [1730, 2580], [1720, 2700], [1670, 3000], [1420, 2910], [1300, 3000], [1090, 2950]]) {
    add('bush_01', x, y, { s: 0.8, solid: { w: 28, h: 12 } });
    add('bush_02', x - 26, y + 18, { s: 0.65, solid: { w: 22, h: 10 } });
    add('flower_white_01', x + 25, y + 17, { s: 0.85 });
    add('flower_purple_01', x - 20, y + 32, { s: 0.9 });
    add('flower_white_01', x + 8, y + 44, { s: 0.6 });
  }
}
