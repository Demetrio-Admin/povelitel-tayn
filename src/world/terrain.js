// Построение дорог и воды из данных world.terrain.js: полигоны, коллизии воды, запросы «где я».
import { catmullRom, ribbon, blob, valueNoise, polygonBounds, pointInPolygon, distToPolygon, polygonToRects } from './geometry.js';

export const WATER_CELL = 16;

/** n — номер шума: у базовых фигур это их место в world.terrain.js, у новых из редактора — свой, сохранённый в правках. */
export function buildRoad(r, index = 0) {
  index = r.n ?? index;
  const borderless = r.borderless === true;
  const seamless = r.seamless === true || borderless;
  const nL = valueNoise(100 + index * 7), nR = valueNoise(300 + index * 11), nW = valueNoise(500 + index * 13);
  const center = catmullRom(r.pts, 10);
  const hw = r.w / 2;
  const left = (s) => hw * (0.86 + 0.28 * nL(s / 95) + 0.12 * (nW(s / 260) - 0.5));
  const right = (s) => hw * (0.86 + 0.28 * nR(s / 95) + 0.12 * (nW(s / 260) - 0.5));
  const poly = ribbon(center, left, right, { step: 10, taper: r.w * 0.55, roundCaps: seamless });
  return { id: r.id, kind: r.kind, seamless, borderless, n: index, poly, bounds: polygonBounds(poly) };
}

/** Только контур (без прямоугольников коллизии) — для быстрого показа в редакторе. */
export function buildWater(w, index = 0, { rects: rects_ = true } = {}) {
  index = w.n ?? index;
  let poly;
  if (w.type === 'river') {
    const nL = valueNoise(900 + index * 5), nR = valueNoise(950 + index * 5);
    const center = catmullRom(w.pts, 10);
    // base — гарантированная половина ширины, extra — «дыхание» берегов наружу
    poly = ribbon(center, (s) => w.base + w.extra * nL(s / 85), (s) => w.base + w.extra * nR(s / 85), { step: 10, taper: 70 });
  } else {
    poly = blob(w.cx, w.cy, w.rx, w.ry, { seed: w.seed, amp: w.amp, rotate: w.rotate || 0 });
  }
  const rects = rects_ ? polygonToRects(poly, WATER_CELL) : [];
  return { id: w.id, type: w.type, n: index, poly, bounds: polygonBounds(poly), rects };
}

export function buildTerrain({ ROADS, WATERS }) {
  const roads = ROADS.map((r, i) => buildRoad(r, i));
  const waters = WATERS.map((w, i) => buildWater(w, i));
  return { roads, waters, waterRects: waters.flatMap(w => w.rects) };
}

const near = (b, x, y, m) => x >= b.x - m && x <= b.x1 + m && y >= b.y - m && y <= b.y1 + m;

/** Расстояние до ближайшей дороги (0 — на дороге). */
export function distToRoad(terrain, x, y, maxD = 200) {
  let best = Infinity;
  for (const r of terrain.roads) if (near(r.bounds, x, y, maxD)) best = Math.min(best, distToPolygon(x, y, r.poly));
  return best;
}

export function distToWater(terrain, x, y, maxD = 200) {
  let best = Infinity;
  for (const w of terrain.waters) if (near(w.bounds, x, y, maxD)) best = Math.min(best, distToPolygon(x, y, w.poly));
  return best;
}

export function onWater(terrain, x, y) {
  return terrain.waters.some(w => near(w.bounds, x, y, 0) && pointInPolygon(x, y, w.poly));
}
