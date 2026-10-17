// The secluded approach outside the west wall. Buildings, forest blockers and the door seal stay put.
import { buildRoad } from '../world/terrain.js';
import { distToPolygon } from '../world/geometry.js';

export function dressLaboratoryTrail({ colliders, props, roads, point, buildings, questPositions }) {
  const origin = point(0, 0);
  // These rectangles define collision only. Their dark floor used to cover the lawn
  // and show straight edges between the trees along the entire western approach.
  for (const c of colliders) if (/^city_plan_forest_[0-4]$/.test(c.id)) c.forestUnderlay = false;
  const trail = roads.find(r => r.id === 'city_street_lab_trail');
  if (trail) Object.assign(trail, { kind: 'stone', texture: 'city_archive_worn_paving', tileScale: 0.34, urban: false });
  roads.push({ id: 'city_street_lab_forecourt', kind: 'stone', w: 130,
    pts: [[300, 4055], [375, 4055]].map(([x, y]) => { const p = point(x, y); return [p.x, p.y]; }),
    texture: 'city_archive_worn_paving', tileScale: 0.34, seamless: true });
  for (const [id, x, y, w, h] of [['clearing', 340, 4300, 590, 780], ['trail', 325, 5020, 590, 1050], ['junction', 325, 5300, 600, 530]]) {
    props.push({ id: 'lab_garden_ground_' + id, k: 'city_archive_garden_ground', ...point(x, y),
      w, h, solid: null, l: 'ground' });
  }
  // Keep old editable IDs; the crate moves into the side yard, away from the new workbench.
  const crate = props.find(p => p.k === 'city_crate' && p.x === origin.x + 480 && p.y === origin.y + 3990);
  if (crate) Object.assign(crate, point(565, 4050));
  const roadShapes = roads.map((r, i) => buildRoad(r, i));
  const overlaps = (a, b, pad = 8) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad &&
    a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
  let n = 0;
  const add = (k, x, y, extra = {}) => {
    const p = point(x, y), solid = extra.solid ?? null, scale = extra.s || 1;
    if (buildings.some(b => Math.abs(p.x - b.door.x) < 100 && p.y > b.door.y - 20 && p.y < b.door.y + 145)) return;
    if (Object.values(questPositions).some(q => Math.hypot(p.x - q.x, p.y - q.y) < 115)) return;
    if (roadShapes.some(r => distToPolygon(p.x, p.y, r.poly) < (solid ? 22 : 6))) return;
    const box = { x: p.x - (solid?.w || 2) * scale / 2, y: p.y - (solid?.h || 2) * scale,
      w: (solid?.w || 2) * scale, h: (solid?.h || 2) * scale };
    if (colliders.some(c => overlaps(box, c))) return;
    if (solid && props.some(q => q.solid && typeof q.solid === 'object' && overlaps(box,
      { x: q.x - q.solid.w * (q.s || 1) / 2, y: q.y - q.solid.h * (q.s || 1), w: q.solid.w * (q.s || 1), h: q.solid.h * (q.s || 1) }))) return;
    props.push({ id: 'lab_garden_' + n++, k, ...p, solid, ...extra });
  };
  // Forest trees already fill the blocked woodland. These smaller groups form the edge of the actual clearing.
  for (const [k, x, y, s] of [
    ['tree_dark_01', 140, 3730, 1.05], ['tree_autumn_02', 500, 3740, 1],
    ['birch_01', 560, 3870, 1], ['tree_dark_02', 145, 3920, 1],
    ['tree_autumn_01', 145, 4110, 1], ['tree_dark_01', 540, 4130, 1.05],
    ['tree_dark_02', 520, 5110, 1], ['tree_autumn_02', 130, 5150, 1.05],
    ['birch_01', 470, 5300, 1.05],
  ]) add(k, x, y, { s, solid: { w: 24, h: 16 } });
  add('city_lab_garden_workbench', 500, 4010, { w: 108, h: 98, solid: { w: 82, h: 22 } });
  add('city_walk_herbbed', 510, 4100, { w: 100, h: 58, solid: { w: 78, h: 18 } });
  add('rune_slab_01', 455, 3940, { s: 0.55, l: 'floor' });
  for (const [x, y] of [[175, 3990], [490, 4185], [285, 4460], [425, 4690], [210, 4940], [470, 5200]])
    add('lantern_01', x, y, { w: 42, h: 116, light: 34, solid: { w: 14, h: 10 } });
  for (const [x, y] of [[130, 4025], [535, 3980], [575, 4160], [205, 4190], [450, 4240],
    [220, 4360], [465, 4470], [250, 4600], [460, 4770], [170, 5080], [445, 5060], [460, 5280]]) {
    add('bush_02', x, y, { s: 0.75, solid: { w: 28, h: 14 } });
    add('flower_white_01', x + 20, y + 22, { s: 0.8 });
    add('flower_purple_01', x - 20, y + 30, { s: 0.8 });
    add('flower_white_01', x + 8, y + 48, { s: 0.65 });
  }
  // Low plants and stones may sit in the already-blocked forest margins: no new collision or route.
  for (const [x, y] of [[205, 4300], [445, 4360], [205, 4510], [445, 4600], [205, 4760], [445, 4880]]) {
    const p = point(x, y);
    if (!colliders.some(c => c.kind === 'trees' && p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h)) continue;
    for (const [k, dx, dy, s] of [['rock_medium_01', 0, 0, 0.8], ['bush_02', -30, 20, 0.9],
      ['flower_white_01', 42, 24, 0.9], ['flower_purple_01', -20, 46, 0.8], ['mushroom_blue_01', 28, 42, 0.65]])
      props.push({ id: 'lab_garden_margin_' + n++, k, ...point(x + dx, y + dy), s, solid: null, fill: true });
  }
  // Cover the exposed front edge of the northern blocker and the narrow (80px) western strip.
  // Their trunks remain inside existing blocked forest, so the clearing geometry does not change.
  for (const [k, x, y, s] of [
    ['tree_dark_01', 65, 3612, 1.1], ['tree_autumn_02', 170, 3600, 1.1],
    ['tree_dark_02', 285, 3610, 1.05], ['tree_autumn_01', 405, 3604, 1.1],
    ['birch_01', 520, 3615, 1.1], ['tree_dark_01', 605, 3595, 1.05],
    ['tree_autumn_02', 40, 3780, 1.1], ['tree_dark_01', 40, 3940, 1.12], ['birch_01', 40, 4080, 1.1],
  ]) props.push({ id: 'lab_garden_forest_edge_' + n++, k, ...point(x, y), s, solid: null, fill: true });
  for (const [i, x] of [95, 190, 280, 380, 480, 580].entries()) {
    props.push({ id: 'lab_garden_front_shrub_' + i, k: i % 2 ? 'bush_02' : 'bush_01',
      ...point(x, 3630 + (i % 3) * 8), s: 0.9, solid: null });
    props.push({ id: 'lab_garden_front_flowers_' + i, k: i % 2 ? 'flower_white_01' : 'flower_purple_01',
      ...point(x + 28, 3650 + (i % 3) * 8), s: 0.85, solid: null });
  }
  for (const [x, y] of [[220, 4330], [440, 4660], [220, 4890]])
    props.push({ id: 'lab_garden_woodland_lantern_' + n++, k: 'lantern_01', ...point(x, y),
      w: 40, h: 112, light: 34, solid: null, fill: true });
}
