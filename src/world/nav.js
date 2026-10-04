// Маршруты для tap-to-move: поиск пути вокруг препятствий по сетке проходимости (world/walk.js).
// Не зависит от Phaser: сцена передаёт список препятствий, модуль возвращает точки пути.
//
// Как работает:
//  1. buildNav — сетка с шагом 8 px; тело героини надувается на запас, чтобы путь не касался углов.
//  2. findPath — A* (8 направлений, без срезания углов). Цель внутри препятствия или за стеной →
//     путь до ближайшей достижимой точки (complete = false). Если с запасом пройти нельзя (узкий проём),
//     повторяем без запаса.
//  3. Путь выпрямляется: лишние промежуточные точки убираются, если между точками чистая линия.
import { buildWalkGrid } from './walk.js';

export const NAV = { cell: 8, hero: { w: 34, h: 22 }, pad: 8, maxNodes: 60000, snapRing: 14 };

/** Сетка для поиска пути. pad — запас на ширину/высоту тела (px). */
export function buildNav({ width, height, solids, pad = NAV.pad, cell = NAV.cell, hero = NAV.hero }) {
  return buildWalkGrid({ width, height, solids, hero: { w: hero.w + pad, h: hero.h + pad / 2 }, cell });
}

const free = (g, i, j) => i >= 0 && j >= 0 && i < g.cols && j < g.rows && !g.blocked[j * g.cols + i];

/** Ближайшая свободная клетка к (i, j) в пределах ring клеток; null, если нет. */
function snapFree(g, i, j, ring) {
  i = Math.max(0, Math.min(g.cols - 1, i)); j = Math.max(0, Math.min(g.rows - 1, j));
  if (free(g, i, j)) return [i, j];
  let best = null, bd = Infinity;
  for (let r = 1; r <= ring; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (!free(g, i + di, j + dj)) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = [i + di, j + dj]; }
    }
    if (best) return best;
  }
  return null;
}

/** Чистая ли линия между двумя клетками (проход по всем клеткам, которых касается отрезок). */
export function lineClear(g, a, b) {
  let u0 = a[0] + 0.5, v0 = a[1] + 0.5; const u1 = b[0] + 0.5, v1 = b[1] + 0.5;
  let i = a[0], j = a[1];
  const du = u1 - u0, dv = v1 - v0;
  const si = du > 0 ? 1 : -1, sj = dv > 0 ? 1 : -1;
  const tdu = du !== 0 ? Math.abs(1 / du) : Infinity, tdv = dv !== 0 ? Math.abs(1 / dv) : Infinity;
  let tu = du !== 0 ? (du > 0 ? (i + 1 - u0) : (u0 - i)) * tdu : Infinity;
  let tv = dv !== 0 ? (dv > 0 ? (j + 1 - v0) : (v0 - j)) * tdv : Infinity;
  const n = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + 2;
  for (let k = 0; k < n; k++) {
    if (!free(g, i, j)) return false;
    if (i === b[0] && j === b[1]) return true;
    if (tu < tv) { tu += tdu; i += si; } else if (tv < tu) { tv += tdv; j += sj; } else { tu += tdu; tv += tdv; i += si; j += sj; }
  }
  return true;
}

class Heap { // двоичная куча по f
  constructor() { this.k = []; this.f = []; }
  get size() { return this.k.length; }
  push(key, f) {
    const k = this.k, F = this.f; let n = k.length; k.push(key); F.push(f);
    while (n > 0) { const p = (n - 1) >> 1; if (F[p] <= F[n]) break; [k[p], k[n]] = [k[n], k[p]]; [F[p], F[n]] = [F[n], F[p]]; n = p; }
  }
  pop() {
    const k = this.k, F = this.f, top = k[0], lk = k.pop(), lf = F.pop();
    if (k.length) {
      k[0] = lk; F[0] = lf; let n = 0;
      for (;;) {
        const l = 2 * n + 1, r = l + 1; let m = n;
        if (l < k.length && F[l] < F[m]) m = l;
        if (r < k.length && F[r] < F[m]) m = r;
        if (m === n) break;
        [k[m], k[n]] = [k[n], k[m]]; [F[m], F[n]] = [F[n], F[m]]; n = m;
      }
    }
    return top;
  }
}

const SQ2 = Math.SQRT2;
const octile = (dx, dy) => { dx = Math.abs(dx); dy = Math.abs(dy); return dx + dy + (SQ2 - 2) * Math.min(dx, dy); };

/** Путь по клеткам: { cells: [[i, j], …], reached } — reached: дошли именно до цели (иначе — до самой близкой клетки). */
function astar(g, s, goal, maxNodes) {
  const { cols } = g, n = cols * g.rows;
  const gs = new Float32Array(n).fill(Infinity), par = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const heap = new Heap(), start = s[1] * cols + s[0], goalK = goal[1] * cols + goal[0];
  gs[start] = 0; heap.push(start, octile(goal[0] - s[0], goal[1] - s[1]));
  let best = start, bestH = octile(goal[0] - s[0], goal[1] - s[1]), reached = false, pops = 0;
  while (heap.size) {
    const k = heap.pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goalK) { best = k; reached = true; break; }
    const i = k % cols, j = (k / cols) | 0;
    const h = octile(goal[0] - i, goal[1] - j);
    if (h < bestH || (h === bestH && gs[k] < gs[best])) { bestH = h; best = k; }
    if (++pops > maxNodes) break;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (!free(g, ni, nj)) continue;
      if (di && dj && (!free(g, i + di, j) || !free(g, i, j + dj))) continue; // углы не срезаем
      const nk = nj * cols + ni;
      if (closed[nk]) continue;
      const ng = gs[k] + (di && dj ? SQ2 : 1);
      if (ng < gs[nk]) { gs[nk] = ng; par[nk] = k; heap.push(nk, ng + octile(goal[0] - ni, goal[1] - nj)); }
    }
  }
  const cells = [];
  for (let k = best; k !== -1; k = par[k]) cells.push([k % cols, (k / cols) | 0]);
  cells.reverse();
  return { cells, reached };
}

/** Выпрямление: из каждой точки идём к самой дальней, до которой чистая линия. */
export function smooth(g, cells) {
  if (cells.length <= 2) return cells.slice();
  const out = [cells[0]];
  let a = 0;
  while (a < cells.length - 1) {
    let b = a + 1;
    for (let c = cells.length - 1; c > a + 1; c--) if (lineClear(g, cells[a], cells[c])) { b = c; break; }
    out.push(cells[b]); a = b;
  }
  return out;
}

/**
 * Путь от from до to (мировые px). grids — сетки по порядку попыток (сначала с запасом, потом без).
 * Возвращает { points: [{x, y}], complete, end } или null (старт зажат так, что пути нет).
 *  complete — цель достижима; end — последняя точка пути (при complete цель, иначе ближайшая достижимая).
 */
export function findPath(grids, from, to) {
  const list = Array.isArray(grids) ? grids : [grids];
  let fallback = null;
  for (const g of list) {
    const c = g.cell;
    const s = snapFree(g, Math.round(from.x / c), Math.round(from.y / c), NAV.snapRing);
    if (!s) continue;
    const goalWanted = [Math.round(to.x / c), Math.round(to.y / c)];
    const goal = snapFree(g, goalWanted[0], goalWanted[1], NAV.snapRing) || goalWanted;
    const goalFree = free(g, goalWanted[0], goalWanted[1]);
    const { cells, reached } = astar(g, s, goal, NAV.maxNodes);
    const sm = smooth(g, cells);
    const points = sm.map(([i, j]) => ({ x: i * c, y: j * c }));
    // цель свободна и достигнута — последняя точка ровно в нужном месте, а не в центре клетки
    const complete = reached && goalFree;
    if (complete && points.length) points[points.length - 1] = { x: to.x, y: to.y };
    // старт в клетке уже не нужен: герой стоит рядом
    if (points.length > 1) points.shift();
    const res = { points, complete, end: points.length ? points[points.length - 1] : { x: from.x, y: from.y } };
    if (complete || reached) return res;       // «reached» без complete: цель в препятствии, подошли вплотную
    if (!fallback) fallback = res;
  }
  return fallback;
}
