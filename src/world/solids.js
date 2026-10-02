// Единый источник коллизий мира: прямоугольники блоков, объектов, воды и «следа» каждого объекта.
// Сцена строит из этого списка физические тела, а тесты проходимости проверяют ровно его же.
import { PROP_DEFS } from './propDefs.js';

/** Прямоугольник коллизии объекта-декора (x, y — верхний левый угол) или null. */
export function propSolid(p) {
  if (p.fill) return null; // лес-заполнитель закрыт большим блоком
  const s = PROP_DEFS[p.k]?.solid;
  if (!s) return null;
  const k = p.s || 1;
  const w = Math.round(s.w * k), h = Math.round(s.h * k);
  return { x: p.x - w / 2, y: p.y - h, w, h };
}

/** Коллизия у интерактивного объекта / врага: collide { w, h } от точки основания. */
export function baseSolid(cfg) {
  if (!cfg.collide) return null;
  return { x: cfg.x - cfg.collide.w / 2, y: cfg.y - cfg.collide.h, w: cfg.collide.w, h: cfg.collide.h };
}

/**
 * Полный список физических препятствий.
 * skip — множество id интерактивных объектов и врагов, чьи блокираторы не нужны (проверка «ворота открыты»).
 */
export function collectSolids({ colliders, props, interactives, enemies, waterRects, skip = new Set() }) {
  const out = [];
  for (const c of colliders) out.push({ x: c.x, y: c.y, w: c.w, h: c.h, src: `collider:${c.kind}` });
  for (const r of waterRects) out.push({ x: r.x, y: r.y, w: r.w, h: r.h, src: 'water' });
  for (const p of props) { const s = propSolid(p); if (s) out.push({ ...s, src: `prop:${p.id}` }); }
  for (const o of interactives) { if (skip.has(o.id)) continue; const s = baseSolid(o); if (s) out.push({ ...s, src: `obj:${o.id}` }); }
  for (const e of enemies) { if (skip.has(e.id)) continue; const s = baseSolid(e); if (s) out.push({ ...s, src: `enemy:${e.id}` }); }
  return out;
}
