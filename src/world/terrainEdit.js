// Чистая логика правки дорог, воды и стен в редакторе карты. Без Phaser и DOM, проверяется tests/world-test.js.
import { catmullRom } from './geometry.js';

export const SAMPLES = 10;        // точек кривой на отрезок между контрольными точками (как в terrain.js)
export const MIN_POINTS = 2;
export const RECT_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Ось дороги или ручья как плотная ломаная — та же, из которой строится форма. */
export const centerline = (pts) => catmullRom(pts, SAMPLES);

/** Точка кривой ровно между контрольными точками i и i+1. */
export function curveMid(pts, i) {
  const c = catmullRom(pts, 2);
  return [Math.round(c[2 * i + 1][0]), Math.round(c[2 * i + 1][1])];
}

/**
 * Добавляет точку: после i (посередине отрезка), а у последней точки — продолжением линии.
 * Возвращает { pts, index } — новый массив и номер новой точки.
 */
export function addPointAfter(pts, i) {
  const n = pts.length;
  const out = pts.map(p => [p[0], p[1]]);
  if (i >= n - 1) {
    const a = out[n - 2], b = out[n - 1];
    const d = dist(a, b) || 1, len = Math.min(Math.max(d, 60), 140);
    out.push([Math.round(b[0] + ((b[0] - a[0]) / d) * len), Math.round(b[1] + ((b[1] - a[1]) / d) * len)]);
    return { pts: out, index: n };
  }
  out.splice(i + 1, 0, curveMid(pts, i));
  return { pts: out, index: i + 1 };
}

/** Продолжение линии перед первой точкой. */
export function addPointBefore(pts) {
  const out = pts.map(p => [p[0], p[1]]);
  const a = out[1], b = out[0];
  const d = dist(a, b) || 1, len = Math.min(Math.max(d, 60), 140);
  out.unshift([Math.round(b[0] + ((b[0] - a[0]) / d) * len), Math.round(b[1] + ((b[1] - a[1]) / d) * len)]);
  return { pts: out, index: 0 };
}

/** Убирает точку i. Меньше двух точек линия не бывает — тогда null. */
export function removePoint(pts, i) {
  if (pts.length <= MIN_POINTS || i < 0 || i >= pts.length) return null;
  return pts.filter((_, k) => k !== i).map(p => [p[0], p[1]]);
}

/** Выравнивает изгибы: каждая внутренняя точка тянется к середине соседей. Концы остаются на месте. */
export function smoothPoints(pts, k = 0.5) {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return [p[0], p[1]];
    const a = pts[i - 1], b = pts[i + 1];
    return [Math.round(p[0] * (1 - k) + ((a[0] + b[0]) / 2) * k), Math.round(p[1] * (1 - k) + ((a[1] + b[1]) / 2) * k)];
  });
}

/** Ближайшая к (x, y) точка ломаной: { x, y, d, idx } (idx — номер точки ломаной). */
export function nearestOnPolyline(line, x, y) {
  let best = { x: 0, y: 0, d: Infinity, idx: -1 };
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1], [x1, y1] = line[i];
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2)) : 0;
    const px = x0 + dx * t, py = y0 + dy * t, d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { x: px, y: py, d, idx: t > 0.5 ? i : i - 1 };
  }
  return best;
}

/** Номер отрезка между контрольными точками, к которому относится точка ломаной с номером idx. */
export const segmentOfSample = (idx, count) => Math.max(0, Math.min(count - 2, Math.floor(idx / SAMPLES)));

/**
 * Ближайшая контрольная точка среди фигур (кроме skipId) и расстояние до неё.
 * Нужна «магниту»: конец дороги прилипает к другой дороге — стык получается ровным.
 */
export function magnet(x, y, shapes, skipId, pointR, lineR) {
  let best = null;
  for (const s of shapes) {
    if (s.id === skipId || !s.pts) continue;
    for (const p of s.pts) { const d = Math.hypot(p[0] - x, p[1] - y); if (d <= pointR && (!best || d < best.d)) best = { x: p[0], y: p[1], d, kind: 'point', id: s.id }; }
  }
  if (best) return best;
  for (const s of shapes) {
    if (s.id === skipId || !s.pts) continue;
    const n = nearestOnPolyline(centerline(s.pts), x, y);
    if (n.d <= lineR && (!best || n.d < best.d)) best = { x: Math.round(n.x), y: Math.round(n.y), d: n.d, kind: 'line', id: s.id };
  }
  return best;
}

/** Ближайшая точка на чужих дорогах, где бы они ни были: для кнопки «Примкнуть». */
export function nearestOtherRoad(x, y, shapes, skipId, maxD = 500) {
  return magnet(x, y, shapes, skipId, maxD, maxD);
}

// ---------------------------------------------------------------- прямоугольники (стены)

export function handlePos(r, h) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return {
    nw: [r.x, r.y], n: [cx, r.y], ne: [r.x + r.w, r.y], e: [r.x + r.w, cy],
    se: [r.x + r.w, r.y + r.h], s: [cx, r.y + r.h], sw: [r.x, r.y + r.h], w: [r.x, cy],
  }[h];
}

/** Какая ручка прямоугольника под точкой (tol — допуск в пикселях мира) или null. */
export function hitRectHandle(r, x, y, tol) {
  let best = null, bd = tol;
  for (const h of RECT_HANDLES) {
    const p = handlePos(r, h), d = Math.hypot(p[0] - x, p[1] - y);
    if (d <= bd) { bd = d; best = h; }
  }
  return best;
}

/** Тянем ручку h в точку (x, y): двигаются только соответствующие края, размер не меньше min. */
export function resizeRect(r, h, x, y, min = 10) {
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  if (h.includes('w')) x0 = Math.min(x, x1 - min);
  if (h.includes('e')) x1 = Math.max(x, x0 + min);
  if (h.includes('n')) y0 = Math.min(y, y1 - min);
  if (h.includes('s')) y1 = Math.max(y, y0 + min);
  return { ...r, x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

export const inRect = (r, x, y, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/** Прямоугольник под точкой: побеждает самый маленький, чтобы стену внутри леса можно было выбрать. */
export function pickRect(list, x, y, pad = 0) {
  let best = null, ba = Infinity;
  for (const r of list) { if (!inRect(r, x, y, pad)) continue; const a = r.w * r.h; if (a < ba) { ba = a; best = r; } }
  return best;
}

/** Общий номер шума для новой фигуры: больше всех существующих. */
export const nextNoise = (...lists) => 1 + Math.max(-1, ...lists.flat().map(s => s.n ?? -1));
