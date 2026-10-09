// Тесты мира: форма дорог и воды, таблица коллизий, проходимость маршрута. node tests/world-test.js
import { CITY_ROOMS } from '../src/config/city.plan.js';
import { CITY_START, EAST_X } from '../src/config/world.city.js';
import { regionStart, FROSTWOOD_START, GRAVEYARD_START } from '../src/config/world.expeditions.js';
import { WORLD, COLLIDERS, INTERACTIVES, ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { ROADS, WATERS } from '../src/config/world.terrain.js';
import { ASSET_FILES } from '../src/config/assets.manifest.js';
import { buildRoad, buildTerrain, distToRoad, onWater } from '../src/world/terrain.js';
import { PROP_DEFS } from '../src/world/propDefs.js';
import { collectSolids, propSolid } from '../src/world/solids.js';
import { buildWalkGrid, floodFrom, reachableNear } from '../src/world/walk.js';
import { PROPS, applyEdits, diffEdits, applyPos, diffPos, exportEditsFile, resolveMap, saveDraft, loadDraft, DRAFT_KEY, baseTerrain, applyListEdits, applyTerrainEdits, diffList, diffTerrain } from '../src/world/mapData.js';
import * as TE from '../src/world/terrainEdit.js';
import { History, pickAt, snapValue, nextId, clamp } from '../src/world/editorCore.js';
import { checkWalkability } from '../src/world/check.js';
import { EDITS } from '../src/config/world.edits.js';
import { polygonToRects, pointInPolygon, polygonBounds } from '../src/world/geometry.js';

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failures++; console.log('  ✗', msg); } };
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };

// то, что реально в игре: базовые дороги, вода и стены + правки из world.edits.js
const LIVE = resolveMap({ storage: null, useDraft: false });
const terrain = buildTerrain({ ROADS: LIVE.roads, WATERS: LIVE.waters });
const solidsFor = (skip) => collectSolids({ colliders: LIVE.colliders, props: PROPS, interactives: INTERACTIVES, enemies: ENEMY_SPAWNS, waterRects: terrain.waterRects, skip: new Set(skip) });

console.log('\nМир: форма дорог и воды');
{
  ok(terrain.roads.length === LIVE.roads.length && terrain.waters.length === LIVE.waters.length, 'все дороги и водоёмы построены');
  const wob = terrain.roads.every(r => r.poly.length > 40);
  ok(wob, 'у каждой дороги полигон с десятками точек (не прямоугольник)');
  // ручей: непрерывная стена на x 706–814 в зоне запертых проходов
  const creek = terrain.waters.find(w => w.id === 'creek');
  let sealed = true, worst = null;
  for (let y = 3300; y <= 4140; y += 10) for (let x = 706; x <= 814; x += 4) if (!pointInPolygon(x, y, creek.poly)) { sealed = false; worst = [x, y]; }
  ok(sealed, 'ручей перекрывает полосу x 706–814 на y 3300–4140' + (worst ? ` (дыра в ${worst})` : ''));
  const bb = polygonBounds(creek.poly);
  ok(bb.y <= 1120 && bb.y1 >= 4140, 'ручей тянется от ворот до южного края западного леса');
  // у ручья изгибы: центр по x на разных высотах различается
  const xsAt = (y) => { const xs = []; for (let x = 600; x < 900; x += 2) if (pointInPolygon(x, y, creek.poly)) xs.push(x); return (xs[0] + xs[xs.length - 1]) / 2; };
  const cs = [1500, 2000, 2500].map(xsAt);
  ok(Math.max(...cs) - Math.min(...cs) > 6, 'ручей изгибается (центр смещается вдоль течения)');
  ok(terrain.waterRects.length > 30 && terrain.waterRects.length < 200, `коллизия воды — ${terrain.waterRects.length} прямоугольников`);
  // прямоугольники воды полностью лежат внутри полигонов
  const inside = terrain.waterRects.every(r => terrain.waters.some(w => pointInPolygon(r.x + r.w / 2, r.y + r.h / 2, w.poly)));
  ok(inside, 'центры прямоугольников воды лежат внутри воды');
  const sq = polygonToRects([[0, 0], [64, 0], [64, 32], [0, 32]], 16);
  ok(sq.length === 1 && sq[0].w === 64 && sq[0].h === 32, 'polygonToRects склеивает прямоугольник в один блок');
}

console.log('\nМир: бесшовные стыки дорог');
{
  const defs = [
    { id: 'left', kind: 'dirt', w: 90, pts: [[40, 100], [230, 100]] },
    { id: 'right', kind: 'dirt', w: 90, pts: [[230, 100], [440, 100]] },
  ];
  const joined = defs.map((r, i) => buildRoad({ ...r, seamless: true }, i));
  const legacy = defs.map((r, i) => buildRoad(r, i));
  ok([80, 100, 120].every(y => joined.some(r => pointInPolygon(230, y, r.poly))), 'встречные бесшовные концы образуют дорогу полной ширины без зазора');
  ok(joined[0].bounds.x < 40 && joined[1].bounds.x1 > 440, 'бесшовные концы перекрывают место присоединения');
  ok(!legacy.some(r => pointInPolygon(230, 120, r.poly)), 'обычные дороги сохраняют прежние суженные концы');
}

console.log('\nМир: таблица коллизий');
{
  const mustBlock = ['bush_01', 'bush_02', 'rock_small_01', 'mushroom_red_01', 'mushroom_blue_01', 'tree_dark_01', 'tree_dark_02', 'tree_autumn_01', 'tree_autumn_02', 'birch_01', 'dead_tree_01', 'lantern_01', 'lantern_02', 'signpost_01'];
  ok(mustBlock.every(k => PROP_DEFS[k]?.solid), 'камни, кусты, грибы, деревья, фонари и указатели — твёрдые');
  const walk = ['flower_white_01', 'flower_purple_01', 'reeds_01', 'candle_group_01', 'claw_marks_01', 'wooden_bridge_01'];
  ok(walk.every(k => PROP_DEFS[k] && PROP_DEFS[k].solid === null), 'цветы, камыш, свечи, следы и мостик — проходимы');
  ok(propSolid({ k: 'bush_01', x: 100, y: 200 }).y === 178 && propSolid({ k: 'bush_01', x: 100, y: 200 }).w === 48, 'след куста: ширина 48, поднимается вверх от основания');
  ok(propSolid({ k: 'tree_dark_01', x: 1, y: 1, fill: 1 }) === null, 'лес-заполнитель отдельной коллизии не имеет (его закрывает блок)');
  const ids = new Set(PROPS.map(p => p.id));
  ok(ids.size === PROPS.length, 'id всех объектов расстановки уникальны');
  ok(PROPS.every(p => ASSET_FILES[p.k] !== undefined && (PROP_DEFS[p.k] || Object.hasOwn(p,'solid'))), 'у всех объектов есть текстура и определение проходимости');
  const solidProps = PROPS.filter(p => propSolid(p));
  ok(solidProps.length >= 100, `твёрдых объектов в расстановке: ${solidProps.length}`);
  // ничего твёрдого на дороге и в воде
  const bad = solidProps.filter(p => distToRoad(terrain, p.x, p.y) === 0 || onWater(terrain, p.x, p.y));
  ok(bad.length === 0, 'на дорогах и в воде нет твёрдых объектов' + (bad.length ? ': ' + bad.slice(0, 3).map(p => p.id).join(',') : ''));
}

console.log('\nМир: проходимость');
{
  const W = WORLD.width, H = WORLD.height;
  const GATES = ['corrupted_roots', 'heavy_boulder', 'forest_guardian_01', 'ancient_gate', 'node_trial', 'frost_barrier', 'fq_water', 'lab_seal', 'final_ward'];
  const objById = Object.fromEntries([...INTERACTIVES, ...ENEMY_SPAWNS].map(o => [o.id, o]));
  const near = (grid, seen, id, r) => { const o = objById[id]; return reachableNear(grid, seen, o.x, o.y, r ?? Math.min(o.radius || 100, 120)); };

  const closed = buildWalkGrid({ width: W, height: H, solids: solidsFor([]) });
  const seenC = floodFrom(closed, WORLD.playerStart.x, WORLD.playerStart.y);
  for (const id of ['magic_book', 'glade_rock', 'moon_plant', 'glade_cache', 'trail_cache', 'scavenger_01', 'lunar_altar', 'flame_a', 'altar_stone', 'flame_c', 'lunar_guard']) {
    ok(near(closed, seenC, id), `ворота закрыты: «${id}» достижим`);
  }
  for (const id of ['moonstone', 'west_chest', 'forest_guardian_01', 'fire_circle', 'dry_bush', 'ancient_gate', 'rootling_01', 'dust_stash', 'approach_cache', 'node_trial', 'forest_node']) {
    ok(!near(closed, seenC, id), `ворота закрыты: «${id}» НЕ достижим (нет обхода)`);
  }

  const open = buildWalkGrid({ width: W, height: H, solids: solidsFor(GATES) });
  const seenO = floodFrom(open, WORLD.playerStart.x, WORLD.playerStart.y);
  // v0.20.0: восточная часть мира (дорога и город) — отдельный участок, туда переходят по указателю; её места проверяются от CITY_START
  const seenE = floodFrom(open, CITY_START.x, CITY_START.y);
  // v0.24.0: участки вылазок — тоже отдельные (указатели из города)
  const seenFW = floodFrom(open, FROSTWOOD_START.x, FROSTWOOD_START.y), seenGY = floodFrom(open, GRAVEYARD_START.x, GRAVEYARD_START.y);
  const seenRooms=new Map(CITY_ROOMS.map(r=>[r.arrival,floodFrom(open,r.arrival.x,r.arrival.y)]));
  const seenOf = (o) => { const p = regionStart(o, WORLD.playerStart, CITY_START, EAST_X); return seenRooms.get(p) || (p === CITY_START ? seenE : p === FROSTWOOD_START ? seenFW : p === GRAVEYARD_START ? seenGY : seenO); };
  for (const o of [...INTERACTIVES, ...ENEMY_SPAWNS]) {
    if (['flame_c'].includes(o.id)) continue;
    ok(near(open, seenOf(o), o.id), `ворота открыты: «${o.id}» достижим`);
  }
  ok(!near(open, seenE, 'fw_alpha') && !near(open, seenE, 'gy_warden') && !near(open, seenFW, 'gy_warden'), 'вылазки пешком из города не достичь: только указатели');
  // лес и город пешком не соединены: из леса в город не пройти, только указателем
  ok(!near(open, seenO, 'npc_ilaria'), 'из леса в город пешком не пройти (только через карту мира у выхода)');
  ok(near(open, seenO, 'exit_forest') && near(open, seenE, 'exit_city') && near(open, seenFW, 'exit_frostwood') && near(open, seenGY, 'exit_graveyard'), 'выходы «Карта мира» достижимы во всех локациях');
  // v0.10.0: Древние ворота — настоящая преграда (стена по бокам), а узел за ними стережёт испытание
  {
    const g1 = buildWalkGrid({ width: W, height: H, solids: solidsFor(['corrupted_roots', 'heavy_boulder', 'forest_guardian_01']) });
    const s1 = floodFrom(g1, WORLD.playerStart.x, WORLD.playerStart.y);
    ok(near(g1, s1, 'ancient_gate') && !near(g1, s1, 'forest_node') && !near(g1, s1, 'node_trial'), 'ворота закрыты до Астрала: поляна узла не достижима в обход ворот');
    // зона, где испытание начинается само (эллипс триггера), считается непроходимой: обойти его к узлу нельзя
    const t = objById.node_trial, rx = t.radius * 0.7, ry = t.radius * 0.55 * 0.7;
    const zone = { x: t.x - rx, y: t.y - ry, w: rx * 2, h: ry * 2, src: 'trigger' };
    const g2 = buildWalkGrid({ width: W, height: H, solids: [...solidsFor(['corrupted_roots', 'heavy_boulder', 'forest_guardian_01', 'ancient_gate']), zone] });
    const s2 = floodFrom(g2, WORLD.playerStart.x, WORLD.playerStart.y);
    ok(reachableNear(g2, s2, t.x - t.radius, t.y, 60) && !near(g2, s2, 'forest_node', 60), 'ворота открыты: к испытанию подойти можно, к узлу мимо него — нет');
  }
  // каждая дорога достижима по всей длине (кроме мест за закрытыми воротами)
  const roadOk = terrain.roads.every(r => { const mid = r.poly[Math.floor(r.poly.length / 4)]; return reachableNear(open, seenOf({ x: mid[0], y: mid[1] }), mid[0], mid[1], 60); });
  ok(roadOk, 'все дороги достижимы, когда ворота открыты');
}

console.log('\nМир: проверка редактора');
{
  const ENEMIES = ENEMY_SPAWNS;
  const base=baseTerrain();
  const baseT = buildTerrain({ ROADS:base.roads, WATERS:base.waters });
  const none = checkWalkability({ colliders: base.cols, props: PROPS, interactives: INTERACTIVES, enemies: ENEMIES, terrain: baseT });
  ok(none.length === 0, 'checkWalkability: у базовой расстановки проблем нет' + (none.length ? ': ' + none.map(p => p.text).join('; ') : ''));
  // то, что реально в игре: базовая расстановка + правки из редактора (world.edits.js)
  const live = resolveMap({ storage: null, useDraft: false });
  const withEdits = checkWalkability({ colliders: live.colliders, props: live.props, interactives: applyPos(INTERACTIVES, live.pos), enemies: applyPos(ENEMIES, live.pos), terrain });
  ok(withEdits.length === 0, `checkWalkability: карта с правками из редактора проходима (${Object.keys(EDITS.props).length} объектов, дорог ${Object.keys(EDITS.roads || {}).length}, воды ${Object.keys(EDITS.waters || {}).length}, стен ${Object.keys(EDITS.cols || {}).length})` + (withEdits.length ? ': ' + withEdits.map(p => p.text).join('; ') : ''));
  // «стена» из камней поперёк главной тропы в проходе между деревьями — проверка должна это заметить
  const wall = []; for (let x = 800; x < 1720; x += 30) wall.push({ id: 'w' + x, k: 'rock_small_01', x, y: 3200 });
  const bad = checkWalkability({ colliders: COLLIDERS, props: [...PROPS, ...wall], interactives: INTERACTIVES, enemies: ENEMIES, terrain: baseT });
  ok(bad.length > 5, 'checkWalkability: камни поперёк тропы замечены (' + bad.length + ' проблем)');
  // дыра в проходе корней: убрать «корни» из закрытых проходов нельзя, но можно сдвинуть блок деревьев
  const hole = base.cols.filter(c => !(c.kind === 'trees' && c.x === 500 && c.y === 4030));
  const leak = checkWalkability({ colliders: hole, props: PROPS, interactives: INTERACTIVES, enemies: ENEMIES, terrain: baseT });
  ok(leak.some(p => /в обход/.test(p.text)), 'checkWalkability: щель в лесном блоке пускает в обход корней — замечено');
}

console.log('\nМир: ядро редактора');
{
  const h = new History(3); const log = [];
  const op = (n) => ({ label: n, undo: () => log.push('u' + n), redo: () => log.push('r' + n) });
  h.push(op(1)); h.push(op(2)); h.undo(); h.undo(); h.redo();
  ok(log.join() === 'u2,u1,r1' && h.canUndo && h.canRedo, 'History: отмена и повтор идут в правильном порядке');
  h.push(op(3)); ok(!h.canRedo, 'History: новая правка сбрасывает «повтор»');
  h.push(op(4)); h.push(op(5)); h.push(op(6)); ok(h.undoStack.length === 3, 'History: глубина ограничена');
  const E = (id, x0, y0, x1, y1) => ({ id, bounds: () => ({ x0, y0, x1, y1 }) });
  const crown = E('crown', 0, 0, 200, 300), flower = E('flower', 80, 250, 120, 290), far = E('far', 500, 500, 520, 520);
  ok(pickAt([crown, flower, far], 100, 270).id === 'flower', 'pickAt: под кроной выбирается маленький цветок');
  ok(pickAt([crown, flower, far], 100, 50).id === 'crown' && pickAt([crown, flower, far], 400, 400) === null, 'pickAt: по кроне — дерево, по пустому месту — ничего');
  ok(pickAt([E('a', 0, 0, 10, 10), E('b', 0, 5, 10, 15)], 5, 7).id === 'b', 'pickAt: при равной площади — тот, что ниже');
  ok(snapValue(13, 8) === 16 && snapValue(13.4, 0) === 13 && snapValue(-3, 16) === 0, 'snapValue: сетка и округление');
  ok(nextId(new Set(['n001', 'n002'])) === 'n003' && nextId(new Set()) === 'n001', 'nextId: свободный номер');
  ok(clamp(5, 0, 3) === 3 && clamp(-1, 0, 3) === 0, 'clamp');
}

console.log('\nМир: правки и черновик редактора');
{
  const base = [{ id: 'a', k: 'bush_01', x: 10, y: 20 }, { id: 'b', k: 'rock_small_01', x: 30, y: 40, s: 1.2 }, { id: 'c', k: 'birch_01', x: 50, y: 60, f: 1 }];
  const cur = [{ id: 'a', k: 'bush_01', x: 15, y: 20 }, { id: 'c', k: 'birch_01', x: 50, y: 60 }, { id: 'n1', k: 'tree_dark_01', x: 7, y: 8, f: 1 }];
  const d = diffEdits(base, cur, { gate: { x: 1, y: 2 } });
  ok(d.props.a.x === 15 && d.props.b === null && d.props.c.f === 0 && d.add.length === 1 && d.add[0].id === 'n1', 'diffEdits: сдвиг, удаление, снятие зеркала, добавление');
  ok(!('y' in d.props.a), 'diffEdits: неизменённые поля не попадают в правку');
  const back = applyEdits(base, d);
  ok(JSON.stringify(back.map(p => p.id)) === JSON.stringify(['a', 'c', 'n1']) && back[0].x === 15 && !back[1].f && back[2].f === 1, 'applyEdits(diff) воспроизводит правленый список');
  ok(base[0].x === 10, 'applyEdits не меняет исходные данные');
  const lst = [{ id: 'rock', x: 100, y: 200, target: { x: 200, y: 300 }, panOnOpen: { x: 1, y: 2 } }, { id: 'x', x: 5, y: 5 }];
  const moved = applyPos(lst, { rock: { x: 120, y: 190 } });
  ok(moved[0].x === 120 && moved[0].target.x === 220 && moved[0].target.y === 290 && moved[0].panOnOpen.x === 21 && moved[1] !== lst[1] && moved[1].x === 5, 'applyPos: объект и его цели едут вместе, остальным — копия');
  ok(JSON.stringify(diffPos(lst, { rock: { x: 120, y: 190 }, x: { x: 5, y: 5 } })) === '{"rock":{"x":120,"y":190}}', 'diffPos: только реально сдвинутые');
  const file = exportEditsFile(d);
  const parsed = JSON.parse(file.slice(file.indexOf('export const EDITS = ') + 21, file.lastIndexOf(';')));
  ok(parsed.props.a.x === 15 && file.startsWith('//') && file.includes('export const EDITS'), 'exportEditsFile даёт корректный файл');
  const st = memStorage();
  ok(resolveMap({ storage: st, useDraft: true }).fromDraft === false, 'без черновика берётся world.edits.js');
  saveDraft(st, { v: 1, props: { t0001: null }, add: [], pos: {} });
  ok(loadDraft(st)?.props.t0001 === null && resolveMap({ storage: st, useDraft: true }).fromDraft && resolveMap({ storage: st, useDraft: false }).fromDraft === false, 'черновик применяется только в режиме редактора/?draft');
  st.setItem(DRAFT_KEY, '{oops'); ok(loadDraft(st) === null, 'битый черновик игнорируется');
  const expected = LIVE.props.length;
  ok(resolveMap({ storage: st, useDraft: true }).props.length === expected, `битый черновик → расстановка из world.edits.js (${expected} объектов)`);
}

console.log('\nМир: правки дорог, воды и стен');
{
  const b = baseTerrain();
  ok(b.roads.every(r=>!r.pts.some(p=>p[0]>=1800 && p[0]<3600)) && b.waters.length === WATERS.length && b.cols.some(c=>c.id==='city_plan_building_bank') && b.cols.some(c=>c.id==='c105'), 'baseTerrain: все дороги, вода и стены на месте');
  ok(b.cols[0].id === 'c0' && new Set(b.cols.map(c => c.id)).size === b.cols.length, 'у каждой стены есть id (c0, c1…), id уникальны');
  ok(b.roads.every(r => r.n === ROADS.findIndex(original=>original.id===r.id)), 'у базовых дорог номер шума = место в списке');
  // без правок живой мир = исходные данные
  const none = applyTerrainEdits({});
  ok(JSON.stringify(none.roads) === JSON.stringify(b.roads) && JSON.stringify(none.colliders) === JSON.stringify(b.cols), 'без правок дороги и стены не меняются');
  ok(JSON.stringify(diffTerrain({ roads: b.roads, waters: b.waters, colliders: b.cols })) === '{}', 'diffTerrain: без изменений — пусто (файл не раздувается)');

  // сдвиг точки дороги, новая дорога, удаление воды, сдвиг и новая стена, удаление стены
  const cur = baseTerrain();
  cur.roads.find(r => r.id === 'main').pts[3] = [1200, 4100];
  cur.roads.push({ id: 'rd001', kind: 'stone', w: 100, n: 7, pts: [[100, 100], [200, 150]] });
  cur.roads = cur.roads.filter(r => r.id !== 'roots');
  cur.waters = cur.waters.filter(w => w.id !== 'pond');
  cur.cols.find(c => c.id === 'c5').x += 16;
  cur.cols.push({ id: 'cn001', kind: 'wall', x: 10, y: 20, w: 30, h: 40 });
  cur.cols = cur.cols.filter(c => c.id !== 'c6');
  const d = diffTerrain({ roads: cur.roads, waters: cur.waters, colliders: cur.cols });
  ok(Object.keys(d.roads).sort().join() === 'main,rd001,roots' && d.roads.roots === null && d.roads.main.pts[3][0] === 1200, 'diffTerrain: изменённая, новая и удалённая дорога');
  ok(d.waters.pond === null && Object.keys(d.waters).length === 1, 'diffTerrain: удалённый водоём');
  ok(d.cols.c6 === null && d.cols.cn001.w === 30 && d.cols.c5.x === b.cols[5].x + 16, 'diffTerrain: стены — сдвиг, новая, удалённая');
  const back = applyTerrainEdits(d);
  ok(JSON.stringify(back.roads.map(r => r.id)) === JSON.stringify(cur.roads.map(r => r.id)) && JSON.stringify(back.roads) === JSON.stringify(cur.roads), 'applyTerrainEdits(diff) воспроизводит дороги точь-в-точь');
  ok(JSON.stringify(back.waters) === JSON.stringify(cur.waters) && JSON.stringify(back.colliders) === JSON.stringify(cur.cols), 'applyTerrainEdits(diff) воспроизводит воду и стены');
  ok(ROADS[0].n === undefined && COLLIDERS[0].id === undefined, 'исходные world.terrain.js / world.layout.js не меняются');
  // удаление дороги не меняет вид соседних: шум берётся из n, а не из позиции в списке
  const t0 = buildTerrain({ ROADS: b.roads, WATERS: b.waters });
  const t1 = buildTerrain({ ROADS: back.roads, WATERS: back.waters });
  const mainA = t0.roads.find(r => r.id === 'main'), mainB = t1.roads.find(r => r.id === 'main');
  const westA = t0.roads.find(r => r.id === 'west'), westB = t1.roads.find(r => r.id === 'west');
  ok(JSON.stringify(westA.poly) === JSON.stringify(westB.poly), 'удаление «roots» не меняет форму соседней дороги «west»');
  ok(mainA.poly.length !== mainB.poly.length || JSON.stringify(mainA.poly) !== JSON.stringify(mainB.poly), 'сдвиг точки меняет форму дороги');
  // файл и черновик
  const file = exportEditsFile({ v: 1, props: {}, add: [], pos: {}, ...d });
  const parsed = JSON.parse(file.slice(file.indexOf('export const EDITS = ') + 21, file.lastIndexOf(';')));
  ok(parsed.roads.rd001.pts.length === 2 && parsed.cols.cn001.kind === 'wall', 'exportEditsFile сохраняет дороги, воду и стены');
  const st = memStorage();
  saveDraft(st, { v: 1, props: {}, add: [], pos: {}, ...d });
  const rm = resolveMap({ storage: st, useDraft: true });
  ok(rm.fromDraft && rm.roads.length === cur.roads.length && rm.colliders.length === cur.cols.length && !rm.waters.some(w => w.id === 'pond'), 'resolveMap берёт дороги, воду и стены из черновика');
  const rm2 = resolveMap({ storage: st, useDraft: false });
  ok(!rm2.fromDraft && rm2.roads.length === LIVE.roads.length, 'без режима редактора черновик дорог не применяется');
  // старый черновик/файл без разделов дорог по-прежнему читается
  saveDraft(st, { v: 1, props: {}, add: [], pos: {} });
  const rm3 = resolveMap({ storage: st, useDraft: true });
  ok(rm3.roads.length === b.roads.length && rm3.colliders.length === b.cols.length, 'черновик старого формата (без дорог и стен) читается');
}

console.log('\nМир: геометрия правки линий и стен');
{
  const pts = [[0, 0], [100, 0], [200, 0], [300, 0]];
  const a = TE.addPointAfter(pts, 1);
  ok(a.pts.length === 5 && a.index === 2 && Math.abs(a.pts[2][0] - 150) <= 1 && Math.abs(a.pts[2][1]) <= 1, 'addPointAfter: точка встаёт на кривую посередине отрезка');
  const e = TE.addPointAfter(pts, 3);
  ok(e.pts.length === 5 && e.index === 4 && e.pts[4][0] > 300 && e.pts[4][0] <= 300 + 140, 'addPointAfter у конца продолжает линию');
  const s = TE.addPointBefore(pts);
  ok(s.pts.length === 5 && s.pts[0][0] < 0 && s.index === 0, 'addPointBefore продолжает линию в начале');
  ok(TE.removePoint(pts, 1).length === 3 && TE.removePoint([[0, 0], [1, 1]], 0) === null, 'removePoint: минимум две точки остаётся');
  const zig = [[0, 0], [100, 80], [200, 0], [300, 80], [400, 0]];
  const sm = TE.smoothPoints(zig);
  ok(sm[0][1] === 0 && sm[4][1] === 0 && sm[1][1] < 80 && sm[2][1] > 0, 'smoothPoints: концы на месте, зигзаг сглаживается');
  const roadsT = [{ id: 'a', pts: [[0, 0], [200, 0], [400, 0]] }, { id: 'b', pts: [[200, 100], [200, 300]] }];
  const m1 = TE.magnet(260, 12, roadsT, 'b', 30, 26);
  ok(m1 && m1.kind === 'line' && m1.y === 0 && Math.abs(m1.x - 260) <= 1, 'magnet: конец прилипает к оси соседней дороги');
  const m2 = TE.magnet(190, 10, roadsT, 'b', 30, 26);
  ok(m2 && m2.kind === 'point' && m2.x === 200 && m2.y === 0, 'magnet: к контрольной точке — приоритетнее оси');
  ok(TE.magnet(200, 400, roadsT, 'b', 30, 26) === null && TE.magnet(0, 0, roadsT, 'a', 30, 26) === null, 'magnet: далеко или своя линия — не прилипает');
  const near = TE.nearestOtherRoad(300, 500, roadsT, 'x');
  ok(near && near.id === 'b', 'nearestOtherRoad: находит ближайшую дорогу');
  const r = { x: 100, y: 100, w: 200, h: 50 };
  ok(TE.hitRectHandle(r, 301, 99, 12) === 'ne' && TE.hitRectHandle(r, 200, 100, 12) === 'n' && TE.hitRectHandle(r, 200, 125, 12) === null, 'hitRectHandle: углы и стороны');
  const r2 = TE.resizeRect(r, 'se', 400, 300);
  ok(r2.x === 100 && r2.w === 300 && r2.h === 200, 'resizeRect: юго-восточная ручка тянет правый и нижний края');
  const r3 = TE.resizeRect(r, 'w', 350, 0);
  ok(r3.w === 10 && r3.x === 290, 'resizeRect: размер не меньше 10 даже за противоположный край');
  ok(TE.pickRect([{ x: 0, y: 0, w: 1000, h: 1000 }, r], 150, 120).w === 200, 'pickRect: побеждает меньший прямоугольник');
  ok(TE.nextNoise([{ n: 3 }], [{ n: 9 }]) === 10, 'nextNoise: больше всех существующих');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Тесты мира пройдены');
process.exit(failures ? 1 : 0);
