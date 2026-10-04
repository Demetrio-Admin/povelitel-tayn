// Маршруты tap-to-move: обход препятствий, закрытые цели, узкие проходы, реальный мир. node tests/nav-test.mjs
import { buildNav, findPath, lineClear, NAV } from '../src/world/nav.js';
import { WORLD, INTERACTIVES, ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { buildTerrain } from '../src/world/terrain.js';
import { collectSolids } from '../src/world/solids.js';
import { PROPS, resolveMap } from '../src/world/mapData.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const len = (pts, from) => { let L = 0, p = from; for (const q of pts) { L += Math.hypot(q.x - p.x, q.y - p.y); p = q; } return L; };
/** Каждый отрезок пути чист на сетке (без запаса пути не должны задевать препятствия). */
const pathClear = (g, from, pts) => {
  let p = from;
  for (const q of pts) {
    if (!lineClear(g, [Math.round(p.x / g.cell), Math.round(p.y / g.cell)], [Math.round(q.x / g.cell), Math.round(q.y / g.cell)])) return false;
    p = q;
  }
  return true;
};
const mk = (solids, pad) => buildNav({ width: 800, height: 800, solids, pad });

console.log('\nМаршруты: простые случаи');
{
  const g = [mk([], 0)];
  const r = findPath(g, { x: 100, y: 100 }, { x: 600, y: 500 });
  ok(r.complete && r.points.length === 1 && Math.hypot(r.end.x - 600, r.end.y - 500) < 1, 'открытое поле: одна точка — прямо к цели');
}
{
  // стена с проёмом справа: x 0–600, y 380–420
  const solids = [{ x: 0, y: 380, w: 600, h: 40 }];
  const grids = [mk(solids, 8), mk(solids, 0)];
  const from = { x: 200, y: 700 }, to = { x: 200, y: 100 };
  const r = findPath(grids, from, to);
  ok(r.complete && r.points.length >= 2, `стена с проёмом: путь в обход (${r.points.length} точек)`);
  ok(pathClear(grids[0], from, r.points), 'ни один отрезок не задевает препятствие');
  const direct = Math.hypot(to.x - from.x, to.y - from.y), around = len(r.points, from);
  ok(around > direct && around < 1450, `обход разумной длины: ${Math.round(around)} px против ${Math.round(direct)} по прямой`);
  const maxX = Math.max(...r.points.map(p => p.x));
  ok(maxX > 600, 'путь действительно идёт через проём справа от стены');
}

console.log('\nМаршруты: закрытые цели');
{
  const solids = [{ x: 300, y: 300, w: 120, h: 120 }];   // цель внутри блока
  const g = [mk(solids, 8), mk(solids, 0)];
  const r = findPath(g, { x: 100, y: 600 }, { x: 360, y: 360 });
  ok(!r.complete, 'цель внутри препятствия: complete = false');
  ok(Math.hypot(r.end.x - 360, r.end.y - 360) < 130 && pathClear(g[0], { x: 100, y: 600 }, r.points), `идём к ближайшей достижимой точке (${Math.round(Math.hypot(r.end.x - 360, r.end.y - 360))} px от цели)`);
}
{
  const solids = [{ x: 0, y: 380, w: 800, h: 40 }];      // сплошная стена: за ней не пройти
  const g = [mk(solids, 8), mk(solids, 0)];
  const r = findPath(g, { x: 400, y: 700 }, { x: 400, y: 100 });
  ok(r && !r.complete && r.end.y > 420, `цель за глухой стеной: подходим к стене (y = ${Math.round(r.end.y)}), сквозь неё не идём`);
}

console.log('\nМаршруты: узкие места');
{
  // проём 40 px: тело 34, с запасом 42 — не проходит, без запаса — проходит
  const solids = [{ x: 0, y: 380, w: 380, h: 40 }, { x: 420, y: 380, w: 380, h: 40 }];
  const grids = [mk(solids, 8), mk(solids, 0)];
  const r = findPath(grids, { x: 400, y: 700 }, { x: 400, y: 100 });
  ok(r.complete, 'проём шире тела, но уже запаса: проходим по сетке без запаса');
  const solids2 = [{ x: 0, y: 380, w: 390, h: 40 }, { x: 410, y: 380, w: 390, h: 40 }]; // 20 px — меньше тела
  const r2 = findPath([mk(solids2, 8), mk(solids2, 0)], { x: 400, y: 700 }, { x: 400, y: 100 });
  ok(!r2.complete && r2.end.y > 420, 'проём уже тела: не пытаемся протиснуться');
}
{
  // старт на границе препятствия (прижались к стене)
  const solids = [{ x: 300, y: 300, w: 200, h: 100 }];
  const g = [mk(solids, 8), mk(solids, 0)];
  const r = findPath(g, { x: 400, y: 401 }, { x: 400, y: 700 });
  ok(r && r.complete, 'старт вплотную к стене: путь строится');
}

console.log('\nМаршруты: реальный мир (первая глава)');
{
  const LIVE = resolveMap({ storage: null, useDraft: false });
  const terrain = buildTerrain({ ROADS: LIVE.roads, WATERS: LIVE.waters });
  const GATES = ['corrupted_roots', 'heavy_boulder', 'forest_guardian_01', 'ancient_gate', 'node_trial'];
  const solidsFor = (skip) => collectSolids({ colliders: LIVE.colliders, props: PROPS, interactives: INTERACTIVES, enemies: ENEMY_SPAWNS, waterRects: terrain.waterRects, skip: new Set(skip) });
  const dims = { width: WORLD.width, height: WORLD.height };
  const t0 = performance.now();
  const openS = solidsFor(GATES), closedS = solidsFor([]);
  const gOpen = [buildNav({ ...dims, solids: openS }), buildNav({ ...dims, solids: openS, pad: 0 })];
  const gClosed = [buildNav({ ...dims, solids: closedS }), buildNav({ ...dims, solids: closedS, pad: 0 })];
  const build = (performance.now() - t0) / 2;
  ok(build < 400, `сборка сетки мира: ${Math.round(build)} мс`);
  const start = WORLD.playerStart;
  let worst = 0, bad = [], unreachable = [];
  for (const o of [...INTERACTIVES, ...ENEMY_SPAWNS]) {
    if (o.id === 'flame_c') continue;
    const t = performance.now();
    const r = findPath(gOpen, start, { x: o.x, y: o.y });
    worst = Math.max(worst, performance.now() - t);
    if (!r || r.points.length === 0) { unreachable.push(o.id); continue; }
    if (!pathClear(gOpen[1], start, r.points)) bad.push(o.id);
    if (Math.hypot(r.end.x - o.x, r.end.y - o.y) > Math.max(o.radius || 100, 130)) unreachable.push(o.id + '(далеко)');
  }
  ok(bad.length === 0, 'пути ко всем объектам не задевают препятствия' + (bad.length ? ': ' + bad.join(',') : ''));
  ok(unreachable.length === 0, 'к каждому объекту (ворота открыты) путь приводит в зону взаимодействия' + (unreachable.length ? ': ' + unreachable.join(',') : ''));
  ok(worst < 250, `самый долгий поиск пути: ${Math.round(worst)} мс`);
  // ворота закрыты: за ними пути нет, подходим к воротам и останавливаемся
  const o = INTERACTIVES.find(i => i.id === 'moonstone') || ENEMY_SPAWNS.find(i => i.id === 'forest_guardian_01');
  const r = findPath(gClosed, start, { x: o.x, y: o.y });
  ok(r && !r.complete && pathClear(gClosed[1], start, r.points), `ворота закрыты: «${o.id}» недостижим, путь заканчивается у преграды без прохода сквозь неё`);
  // случайные тапы по миру: путь всегда чист и конец достижим
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let tapsBad = 0, n = 0;
  for (let k = 0; k < 120; k++) {
    const to = { x: 40 + rnd() * (WORLD.width - 80), y: 40 + rnd() * (WORLD.height - 80) };
    const r = findPath(gClosed, start, to); n++;
    if (!r || !pathClear(gClosed[1], start, r.points)) tapsBad++;
  }
  ok(tapsBad === 0, `${n} случайных тапов по миру: во всех путь чист`);
}

if (failures) { console.log(`\n${failures} проверок не прошли`); process.exit(1); }
console.log('\nМаршруты: всё в порядке');
