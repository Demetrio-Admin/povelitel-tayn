// Генератор расстановки мира: лес-заполнитель, камыш у воды, декор из DECOR и случайная «мелочь».
// Запускается один раз (tools/world/bake.mjs) и пишет результат в world.props.js, который потом
// правится руками в редакторе карты. Детерминирован: один seed — один результат.
import { mulberry32, pointInPolygon } from './geometry.js';
import { distToRoad, distToWater } from './terrain.js';
import { PROP_DEFS } from './propDefs.js';

export const TREE_KEYS = ['tree_dark_01', 'tree_dark_02', 'tree_autumn_01', 'tree_dark_01', 'tree_autumn_02', 'tree_dark_02', 'birch_01'];
export const SCATTER_KEYS = ['flower_white_01', 'flower_purple_01', 'bush_01', 'bush_02', 'mushroom_red_01', 'rock_small_01', 'flower_white_01', 'bush_01'];

const inRect = (x, y, r, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
const r1 = (v) => Math.round(v);
const r2 = (v) => Math.round(v * 100) / 100;

export function generateProps({ WORLD, ZONES, COLLIDERS, DECOR, INTERACTIVES, ENEMY_SPAWNS, KEEP_CLEAR, terrain, extraBottom = 500, seed = 1337, scatterCount = 340 }) {
  const rnd = mulberry32(seed);
  const props = [];
  let nTree = 0, nScatter = 0, nReed = 0;

  const addTree = (x, y, fill) => {
    const k = TREE_KEYS[Math.floor(rnd() * TREE_KEYS.length)];
    const s = 0.85 + rnd() * 0.3;
    const f = rnd() > 0.5 ? 1 : 0;
    const p = { id: `t${String(++nTree).padStart(4, '0')}`, k, x: r1(x), y: r1(y) };
    if (f) p.f = 1;
    if (Math.abs(s - 1) > 0.02) p.s = r2(s);
    if (fill) p.fill = 1;
    props.push(p);
  };

  const plantTrees = (r, single) => {
    if (single) { addTree(r.x + r.w / 2, r.y + r.h, false); return; }
    const sx = 82, sy = 66;
    const cols = Math.max(1, Math.round(r.w / sx));
    const rows = Math.max(1, Math.round(r.h / sy));
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = r.x + (i + 0.5) * (r.w / cols) + (rnd() - 0.5) * 24;
        const y = r.y + (j + 1) * (r.h / rows) - 4 + (rnd() - 0.5) * 14;
        addTree(x, y, true);
      }
    }
  };

  // 1. лес за пределами мира и сплошные лесные блоки
  plantTrees({ x: 0, y: WORLD.height, w: WORLD.width, h: extraBottom }, false);
  for (const c of COLLIDERS) if (c.kind === 'trees') plantTrees(c, c.single);

  // 2. камыш по берегам
  for (const w of terrain.waters) {
    const poly = w.poly;
    const step = w.type === 'river' ? 34 : 14;
    for (let i = Math.floor(rnd() * 8); i < poly.length; i += step + Math.floor(rnd() * step)) {
      const [x, y] = poly[i];
      props.push({ id: `r${String(++nReed).padStart(3, '0')}`, k: 'reeds_01', x: r1(x), y: r1(y) });
    }
  }

  // 3. декор из слоя DECOR (фонари, свечи, указатели, грибы…)
  DECOR.forEach((d, i) => {
    const p = { id: `d${String(i + 1).padStart(2, '0')}`, k: d.key, x: d.x, y: d.y };
    if (d.layer && d.layer !== 'main') p.l = d.layer;
    if (d.light) p.light = d.light;
    props.push(p);
  });

  // 4. случайная мелочь: цветы, кусты, камни, грибы — вне дорог, воды, блоков и ключевых мест
  const zoneA = ZONES.find(z => z.id === 'A');
  const blocks = [...COLLIDERS, ...GROUND_RECTS(zoneA), ...KEEP_CLEAR];
  let placed = 0;
  for (let i = 0; i < 4000 && placed < scatterCount; i++) {
    const x = 110 + rnd() * (WORLD.width - 220);
    const y = 120 + rnd() * (WORLD.height - 200);
    const key = SCATTER_KEYS[Math.floor(rnd() * SCATTER_KEYS.length)];
    const solid = !!PROP_DEFS[key]?.solid;
    if (blocks.some(r => inRect(x, y, r, 18))) continue;
    if (INTERACTIVES.some(o => Math.hypot(o.x - x, o.y - y) < 130)) continue;
    if (ENEMY_SPAWNS.some(o => Math.hypot(o.x - x, o.y - y) < 120)) continue;
    if (distToRoad(terrain, x, y) < (solid ? 34 : 10)) continue;
    if (distToWater(terrain, x, y) < (solid ? 44 : 16)) continue;
    // не лепим твёрдые предметы вплотную друг к другу — проходы не должны смыкаться
    if (solid && props.some(p => p.id.startsWith('s') && PROP_DEFS[p.k]?.solid && Math.hypot(p.x - x, p.y - y) < 70)) continue;
    const f = rnd() > 0.5 ? 1 : 0;
    const s = 0.9 + rnd() * 0.25;
    const p = { id: `s${String(++nScatter).padStart(3, '0')}`, k: key, x: r1(x), y: r1(y) };
    if (f) p.f = 1;
    if (Math.abs(s - 1) > 0.02) p.s = r2(s);
    props.push(p);
    placed++;
  }
  return props;
}

function GROUND_RECTS(zoneA) { return zoneA ? [zoneA] : []; }

/** Для тестов: попадает ли точка в воду. */
export function inWater(terrain, x, y) { return terrain.waters.some(w => pointInPolygon(x, y, w.poly)); }
