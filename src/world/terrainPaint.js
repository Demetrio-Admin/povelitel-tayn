// Рисование дорог и воды на Canvas 2D. Без Phaser и DOM: ctx и картинки текстур передаются снаружи.
// Мир режется на квадратные куски (chunk); каждый кусок рисуется независимо, но результат совпадает
// на границах — шум и «травинки» привязаны к мировым координатам, а не к куску.
import { mulberry32 } from './geometry.js';

export const CHUNK = 512;
const MARGIN = 70; // тень и бахрома выступают за контур

function pathPoly(ctx, poly) {
  ctx.beginPath();
  for (let i = 0; i < poly.length; i++) { if (i) ctx.lineTo(poly[i][0], poly[i][1]); else ctx.moveTo(poly[i][0], poly[i][1]); }
  ctx.closePath();
}

const touches = (b, c) => b.x1 + MARGIN >= c.x && b.x - MARGIN <= c.x + c.w && b.y1 + MARGIN >= c.y && b.y - MARGIN <= c.y + c.h;

function signedArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] * poly[i][1]) - (poly[i][0] * poly[j][1]);
  return a / 2;
}

function pattern(ctx, img, fallback) {
  try { if (img) { const p = ctx.createPattern(img, 'repeat'); if (p) return p; } } catch (e) { /* нет картинки — зальём цветом */ }
  return fallback;
}

/** Мелкие травинки и камешки вдоль края — прячут «ровную» границу. */
function fringe(ctx, poly, seed, kind) {
  const outward = signedArea(poly) > 0 ? -1 : 1;
  const rnd = mulberry32(seed);
  const n = poly.length;
  for (let i = 0; i < n; i += 2) {
    const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n], p = poly[i];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1;
    tx /= m; ty /= m;
    const nx = ty * outward, ny = -tx * outward;
    const r1 = rnd(), r2 = rnd(), r3 = rnd();
    if (r1 > 0.62) continue;
    const off = 1 + r2 * 7;
    const x = p[0] + nx * off, y = p[1] + ny * off;
    if (kind === 'water' ? r3 < 0.5 : r3 < 0.7) {
      // пучок травы
      ctx.strokeStyle = r3 < 0.25 ? 'rgba(78,98,52,0.85)' : 'rgba(36,56,32,0.9)';
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) {
        const ang = -Math.PI / 2 + (k - 1) * 0.5 + (r2 - 0.5) * 0.5;
        const len = 6 + r1 * 9;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
      }
    } else {
      ctx.fillStyle = kind === 'stone' ? 'rgba(96,98,96,0.8)' : 'rgba(112,96,76,0.85)';
      ctx.beginPath(); ctx.ellipse(x, y, 2 + r1 * 3, 1.6 + r2 * 2, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function paintWater(ctx, w, c, img, index) {
  const poly = w.poly;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // вязкий берег: тёмный ил, потом светлее
  pathPoly(ctx, poly);
  ctx.shadowColor = 'rgba(14,12,6,0.6)'; ctx.shadowBlur = 26;
  ctx.fillStyle = 'rgba(40,34,20,0.9)'; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(52,44,26,0.75)'; ctx.lineWidth = 30; ctx.stroke();
  ctx.strokeStyle = 'rgba(82,72,44,0.55)'; ctx.lineWidth = 18; ctx.stroke();
  // вода
  pathPoly(ctx, poly);
  ctx.fillStyle = pattern(ctx, img, '#1f4a4c'); ctx.fill();
  ctx.save();
  ctx.clip();
  // мелководье у берега светлее, глубина — темнее
  ctx.strokeStyle = 'rgba(120,150,104,0.22)'; ctx.lineWidth = 46; ctx.stroke();
  ctx.strokeStyle = 'rgba(150,172,116,0.22)'; ctx.lineWidth = 22; ctx.stroke();
  ctx.strokeStyle = 'rgba(8,24,28,0.5)'; ctx.lineWidth = 6; ctx.stroke();
  // блики: детерминированные штрихи по сетке мира
  const cell = 70;
  const b = w.bounds;
  const gx0 = Math.max(Math.floor(c.x / cell), Math.floor(b.x / cell)), gx1 = Math.min(Math.floor((c.x + c.w) / cell), Math.floor(b.x1 / cell));
  const gy0 = Math.max(Math.floor(c.y / cell), Math.floor(b.y / cell)), gy1 = Math.min(Math.floor((c.y + c.h) / cell), Math.floor(b.y1 / cell));
  ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const r = mulberry32((gx * 73856093) ^ (gy * 19349663) ^ (index * 83492791));
      if (r() > 0.45) continue;
      const x = gx * cell + r() * cell, y = gy * cell + r() * cell, len = 14 + r() * 22;
      ctx.strokeStyle = `rgba(190,224,214,${0.1 + r() * 0.12})`;
      ctx.beginPath(); ctx.moveTo(x - len / 2, y); ctx.quadraticCurveTo(x, y - 2.5, x + len / 2, y); ctx.stroke();
    }
  }
  ctx.restore();
  pathPoly(ctx, poly);
  ctx.strokeStyle = 'rgba(16,30,28,0.55)'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
  fringe(ctx, poly, 7000 + index, 'water');
}

function paintRoadBase(ctx, r) {
  ctx.save();
  ctx.lineJoin = 'round';
  pathPoly(ctx, r.poly);
  ctx.shadowColor = r.kind === 'stone' ? 'rgba(10,14,8,0.65)' : 'rgba(28,18,8,0.6)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = 'rgba(40,28,14,0.8)'; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  // утоптанный край — землистая кайма, переходящая в траву
  ctx.strokeStyle = r.kind === 'stone' ? 'rgba(48,56,38,0.55)' : 'rgba(78,58,32,0.5)';
  ctx.lineWidth = 16; ctx.stroke();
  ctx.restore();
}

function paintRoadFill(ctx, r, img, index) {
  ctx.save();
  ctx.lineJoin = 'round';
  pathPoly(ctx, r.poly);
  ctx.fillStyle = pattern(ctx, img, r.kind === 'stone' ? '#5d6068' : '#7b5a3a'); ctx.fill();
  if (r.seamless) { ctx.restore(); return; }
  ctx.clip();
  const stone = r.kind === 'stone';
  ctx.strokeStyle = stone ? 'rgba(24,38,20,0.5)' : 'rgba(44,28,12,0.42)'; ctx.lineWidth = 22; ctx.stroke();
  ctx.strokeStyle = stone ? 'rgba(14,22,12,0.5)' : 'rgba(30,18,8,0.4)'; ctx.lineWidth = 8; ctx.stroke();
  ctx.restore();
  fringe(ctx, r.poly, 3000 + index * 31, stone ? 'stone' : 'dirt');
}

/** Clip away neighbours before painting edges: only the boundary of the road network remains.
 * Separate even-odd clips also work for three-way overlaps, unlike a single even-odd union.
 * Fills share world-space texture coordinates, including across chunk boundaries.
 */
function paintJoinedRoadEdge(ctx, r, roads, chunk, index) {
  ctx.save();
  for (const other of roads) {
    if (other === r || !other.seamless || other.kind !== r.kind) continue;
    if (other.bounds.x > r.bounds.x1 + MARGIN || other.bounds.x1 < r.bounds.x - MARGIN ||
        other.bounds.y > r.bounds.y1 + MARGIN || other.bounds.y1 < r.bounds.y - MARGIN) continue;
    pathPoly(ctx, other.poly);
    ctx.rect(chunk.x - MARGIN, chunk.y - MARGIN, chunk.w + MARGIN * 2, chunk.h + MARGIN * 2);
    ctx.clip('evenodd');
  }
  ctx.save();
  pathPoly(ctx, r.poly);
  ctx.clip();
  ctx.lineJoin = 'round';
  const stone = r.kind === 'stone';
  ctx.strokeStyle = stone ? 'rgba(24,38,20,0.5)' : 'rgba(44,28,12,0.42)'; ctx.lineWidth = 22; ctx.stroke();
  ctx.strokeStyle = stone ? 'rgba(14,22,12,0.5)' : 'rgba(30,18,8,0.4)'; ctx.lineWidth = 8; ctx.stroke();
  ctx.restore();
  fringe(ctx, r.poly, 3000 + index * 31, stone ? 'stone' : 'dirt');
  ctx.restore();
}

/**
 * Рисует на ctx кусок мира chunk {x,y,w,h}. ctx уже имеет размер chunk.w × chunk.h.
 * imgs: { dirt, stone, water } — картинки текстур (или null: тогда однотонная заливка).
 */
export function paintTerrainChunk(ctx, chunk, terrain, imgs = {}) {
  ctx.save();
  ctx.clearRect(0, 0, chunk.w, chunk.h);
  ctx.translate(-chunk.x, -chunk.y);
  terrain.waters.forEach((w, i) => { if (touches(w.bounds, chunk)) paintWater(ctx, w, chunk, imgs.water, w.n ?? i); });
  const roads = terrain.roads.map((r, i) => [r, r.n ?? i]).filter(([r]) => touches(r.bounds, chunk));
  roads.forEach(([r]) => paintRoadBase(ctx, r));
  roads.forEach(([r, i]) => paintRoadFill(ctx, r, r.kind === 'stone' ? imgs.stone : imgs.dirt, i));
  const joined = roads.map(([r]) => r);
  roads.forEach(([r, i]) => { if (r.seamless) paintJoinedRoadEdge(ctx, r, joined, chunk, i); });
  ctx.restore();
}

/** Список кусков, в которые что-то попадает: [{ cx, cy, x, y, w, h }]. */
export function terrainChunks(terrain, worldW, worldH, size = CHUNK) {
  const shapes = [...terrain.roads, ...terrain.waters];
  const out = [];
  for (let cy = 0; cy * size < worldH; cy++) {
    for (let cx = 0; cx * size < worldW; cx++) {
      const c = { cx, cy, x: cx * size, y: cy * size, w: Math.min(size, worldW - cx * size), h: Math.min(size, worldH - cy * size) };
      if (shapes.some(s => touches(s.bounds, c))) out.push(c);
    }
  }
  return out;
}
