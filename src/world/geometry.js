// Чистая геометрия мира: шум, сплайны, «ленты» дорог и рек, пятна воды, проверки попадания.
// Не зависит ни от Phaser, ни от DOM — тестируется в node и используется в генераторе карты.

export function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Гладкий одномерный шум в [0, 1]. */
export function valueNoise(seed) {
  const rnd = mulberry32(seed);
  const lattice = Array.from({ length: 256 }, () => rnd());
  return (t) => {
    const i = Math.floor(t), f = t - i;
    const a = lattice[((i % 256) + 256) % 256], b = lattice[(((i + 1) % 256) + 256) % 256];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

/** Кривая Catmull-Rom через точки. Возвращает плотную ломаную. */
export function catmullRom(pts, samples = 10, closed = false) {
  const n = pts.length;
  if (n < 2) return pts.map(p => [p[0], p[1]]);
  const get = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    return pts[Math.max(0, Math.min(n - 1, i))];
  };
  const out = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < samples; s++) {
      const t = s / samples, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]]);
  return out;
}

/** Равномерная передискретизация ломаной с шагом step. Возвращает точки и накопленную длину. */
export function resample(pts, step) {
  const out = [[pts[0][0], pts[0][1]]];
  const dist = [0];
  let carry = 0, total = 0;
  for (let i = 1; i < pts.length; i++) {
    let [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    let seg = Math.hypot(x1 - x0, y1 - y0);
    while (carry + seg >= step) {
      const k = (step - carry) / seg;
      x0 += (x1 - x0) * k; y0 += (y1 - y0) * k;
      total += step;
      out.push([x0, y0]); dist.push(total);
      seg = Math.hypot(x1 - x0, y1 - y0);
      carry = 0;
    }
    carry += seg;
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1) {
    total += Math.hypot(last[0] - tail[0], last[1] - tail[1]);
    out.push([last[0], last[1]]); dist.push(total);
  }
  return { pts: out, dist, length: total };
}

/**
 * Лента вдоль оси: left(s, len) и right(s, len) — расстояния до левого и правого края.
 * Края получают скруглённые концы (taper — длина сужения в пикселях).
 */
export function ribbon(center, left, right, { step = 12, taper = 40 } = {}) {
  const r = resample(center, step);
  const n = r.pts.length;
  const L = [], R = [];
  const cap = (s) => {
    const a = Math.min(s, r.length - s);
    if (a >= taper) return 1;
    const t = Math.max(0, a / taper);
    return Math.sqrt(1 - (1 - t) * (1 - t)); // четверть окружности
  };
  for (let i = 0; i < n; i++) {
    const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
    const nx = -dy, ny = dx; // нормаль влево
    const s = r.dist[i];
    const c = cap(s);
    const lw = left(s, r.length) * c, rw = right(s, r.length) * c;
    L.push([r.pts[i][0] + nx * lw, r.pts[i][1] + ny * lw]);
    R.push([r.pts[i][0] - nx * rw, r.pts[i][1] - ny * rw]);
  }
  return [...L, ...R.reverse()];
}

/** Неровное пятно (пруд, поляна): эллипс с периодическими искажениями — шов не виден. */
export function blob(cx, cy, rx, ry, { seed = 1, n = 40, amp = 0.16, rotate = 0 } = {}) {
  const rnd = mulberry32(seed);
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const pts = [];
  const cos = Math.cos(rotate), sin = Math.sin(rotate);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + amp * (0.55 * Math.sin(2 * a + ph[0]) + 0.35 * Math.sin(3 * a + ph[1]) + 0.25 * Math.sin(5 * a + ph[2]) + 0.12 * Math.sin(7 * a + ph[3]));
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    pts.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
  }
  return catmullRom(pts, 4, true);
}

export function polygonBounds(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, x1, y1 };
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Расстояние от точки до ближайшего ребра полигона. */
export function distToEdge(x, y, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

/** Расстояние до полигона: 0 внутри, иначе до ближайшего ребра. */
export function distToPolygon(x, y, poly) {
  return pointInPolygon(x, y, poly) ? 0 : distToEdge(x, y, poly);
}

/**
 * Разбивает полигон на прямоугольники для физики (Arcade — только AABB).
 * Клетка считается занятой, если её центр внутри полигона; по строкам склеиваются
 * подряд идущие клетки, затем одинаковые полосы склеиваются по вертикали.
 */
export function polygonToRects(poly, cell = 16) {
  const b = polygonBounds(poly);
  const x0 = Math.floor(b.x / cell) * cell, y0 = Math.floor(b.y / cell) * cell;
  const cols = Math.ceil((b.x1 - x0) / cell), rows = Math.ceil((b.y1 - y0) / cell);
  const rects = [];
  let open = new Map(); // "ci:cj" -> прямоугольник, который можно удлинить вниз
  for (let r = 0; r < rows; r++) {
    const cy = y0 + (r + 0.5) * cell;
    const next = new Map();
    let c = 0;
    while (c < cols) {
      if (!pointInPolygon(x0 + (c + 0.5) * cell, cy, poly)) { c++; continue; }
      let e = c;
      while (e + 1 < cols && pointInPolygon(x0 + (e + 1.5) * cell, cy, poly)) e++;
      const key = `${c}:${e}`;
      const prev = open.get(key);
      if (prev) { prev.h += cell; next.set(key, prev); }
      else { const rc = { x: x0 + c * cell, y: y0 + r * cell, w: (e - c + 1) * cell, h: cell }; rects.push(rc); next.set(key, rc); }
      c = e + 1;
    }
    open = next;
  }
  return rects;
}
