// Тесты мира: форма дорог и воды, таблица коллизий, проходимость маршрута. node tests/world-test.js
import { WORLD, COLLIDERS, INTERACTIVES, ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { ROADS, WATERS } from '../src/config/world.terrain.js';
import { PROPS } from '../src/config/world.props.js';
import { ASSET_FILES } from '../src/config/assets.manifest.js';
import { buildTerrain, distToRoad, onWater } from '../src/world/terrain.js';
import { PROP_DEFS } from '../src/world/propDefs.js';
import { collectSolids, propSolid } from '../src/world/solids.js';
import { buildWalkGrid, floodFrom, reachableNear } from '../src/world/walk.js';
import { applyEdits, diffEdits, applyPos, diffPos, exportEditsFile, resolveMap, saveDraft, loadDraft, DRAFT_KEY } from '../src/world/mapData.js';
import { History, pickAt, snapValue, nextId, clamp } from '../src/world/editorCore.js';
import { checkWalkability } from '../src/world/check.js';
import { polygonToRects, pointInPolygon, polygonBounds } from '../src/world/geometry.js';

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failures++; console.log('  ✗', msg); } };
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };

const terrain = buildTerrain({ ROADS, WATERS });
const solidsFor = (skip) => collectSolids({ colliders: COLLIDERS, props: PROPS, interactives: INTERACTIVES, enemies: ENEMY_SPAWNS, waterRects: terrain.waterRects, skip: new Set(skip) });

console.log('\nМир: форма дорог и воды');
{
  ok(terrain.roads.length === ROADS.length && terrain.waters.length === WATERS.length, 'все дороги и водоёмы построены');
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
  ok(PROPS.every(p => ASSET_FILES[p.k] !== undefined && PROP_DEFS[p.k]), 'у всех объектов есть текстура и запись в propDefs');
  const solidProps = PROPS.filter(p => propSolid(p));
  ok(solidProps.length >= 100, `твёрдых объектов в расстановке: ${solidProps.length}`);
  // ничего твёрдого на дороге и в воде
  const bad = solidProps.filter(p => distToRoad(terrain, p.x, p.y) === 0 || onWater(terrain, p.x, p.y));
  ok(bad.length === 0, 'на дорогах и в воде нет твёрдых объектов' + (bad.length ? ': ' + bad.slice(0, 3).map(p => p.id).join(',') : ''));
}

console.log('\nМир: проходимость');
{
  const W = WORLD.width, H = WORLD.height;
  const GATES = ['corrupted_roots', 'heavy_boulder', 'forest_guardian_01'];
  const objById = Object.fromEntries([...INTERACTIVES, ...ENEMY_SPAWNS].map(o => [o.id, o]));
  const near = (grid, seen, id, r) => { const o = objById[id]; return reachableNear(grid, seen, o.x, o.y, r ?? Math.min(o.radius || 100, 120)); };

  const closed = buildWalkGrid({ width: W, height: H, solids: solidsFor([]) });
  const seenC = floodFrom(closed, WORLD.playerStart.x, WORLD.playerStart.y);
  for (const id of ['magic_book', 'glade_rock', 'moon_plant', 'glade_cache', 'trail_cache', 'scavenger_01', 'lunar_altar', 'flame_a', 'altar_stone', 'flame_c', 'lunar_guard']) {
    ok(near(closed, seenC, id), `ворота закрыты: «${id}» достижим`);
  }
  for (const id of ['moonstone', 'west_chest', 'forest_guardian_01', 'fire_circle', 'dry_bush', 'ancient_gate']) {
    ok(!near(closed, seenC, id), `ворота закрыты: «${id}» НЕ достижим (нет обхода)`);
  }

  const open = buildWalkGrid({ width: W, height: H, solids: solidsFor(GATES) });
  const seenO = floodFrom(open, WORLD.playerStart.x, WORLD.playerStart.y);
  for (const o of [...INTERACTIVES, ...ENEMY_SPAWNS]) {
    if (['flame_c'].includes(o.id)) continue;
    ok(near(open, seenO, o.id), `ворота открыты: «${o.id}» достижим`);
  }
  // каждая дорога достижима по всей длине (кроме мест за закрытыми воротами)
  const roadOk = terrain.roads.every(r => { const mid = r.poly[Math.floor(r.poly.length / 4)]; return reachableNear(open, seenO, mid[0], mid[1], 60); });
  ok(roadOk, 'все дороги достижимы, когда ворота открыты');
}

console.log('\nМир: проверка редактора');
{
  const ENEMIES = ENEMY_SPAWNS;
  const none = checkWalkability({ colliders: COLLIDERS, props: PROPS, interactives: INTERACTIVES, enemies: ENEMIES, terrain });
  ok(none.length === 0, 'checkWalkability: у базовой расстановки проблем нет' + (none.length ? ': ' + none.map(p => p.text).join('; ') : ''));
  // «стена» из камней поперёк главной тропы в проходе между деревьями — проверка должна это заметить
  const wall = []; for (let x = 800; x < 1720; x += 30) wall.push({ id: 'w' + x, k: 'rock_small_01', x, y: 3200 });
  const bad = checkWalkability({ colliders: COLLIDERS, props: [...PROPS, ...wall], interactives: INTERACTIVES, enemies: ENEMIES, terrain });
  ok(bad.length > 5, 'checkWalkability: камни поперёк тропы замечены (' + bad.length + ' проблем)');
  // дыра в проходе корней: убрать «корни» из закрытых проходов нельзя, но можно сдвинуть блок деревьев
  const hole = COLLIDERS.filter(c => !(c.kind === 'trees' && c.x === 500 && c.y === 4030));
  const leak = checkWalkability({ colliders: hole, props: PROPS, interactives: INTERACTIVES, enemies: ENEMIES, terrain });
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
  ok(resolveMap({ storage: st, useDraft: true }).props.length === PROPS.length, 'без правок число объектов = базовому');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Тесты мира пройдены');
process.exit(failures ? 1 : 0);
