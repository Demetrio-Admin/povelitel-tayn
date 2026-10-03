// Рисует карту мира в PNG (трава, дороги, вода, объекты, коллизии) — для проверки без браузера.
//   CANVAS_PATH=<путь к @napi-rs/canvas> node tools/world/render-map.mjs [папка вывода]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.CANVAS_PATH || '@napi-rs/canvas');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.argv[2] || path.join(ROOT, 'tools/world/shots');
fs.mkdirSync(OUT, { recursive: true });

import { CONTENT_DECOR } from '../../src/config/world.content.js';
import { WORLD, INTERACTIVES, ENEMY_SPAWNS, GROUND } from '../../src/config/world.layout.js';
import { ASSET_FILES, DISPLAY_SIZE } from '../../src/config/assets.manifest.js';
import { buildTerrain } from '../../src/world/terrain.js';
import { paintTerrainChunk, terrainChunks } from '../../src/world/terrainPaint.js';
import { resolveMap, applyPos } from '../../src/world/mapData.js';
import { collectSolids } from '../../src/world/solids.js';
import { ENEMIES } from '../../src/config/balance.enemies.js';

const EXTRA = 500;
const W = WORLD.width, H = WORLD.height + EXTRA;
const map = resolveMap({});
const terrain = buildTerrain({ ROADS: map.roads, WATERS: map.waters });
const COLLIDERS = map.colliders; // с правками из редактора
const img = {};
const load = async (k) => { if (!img[k] && ASSET_FILES[k]) img[k] = await loadImage(path.join(ROOT, 'public', ASSET_FILES[k].split('?')[0])); return img[k]; };

const full = createCanvas(W, H), g = full.getContext('2d');
g.fillStyle = g.createPattern(await load('grass_ground_01'), 'repeat'); g.fillRect(0, 0, W, H);
const imgs = { dirt: await load('dirt_path_01'), stone: await load('stone_path_01'), water: await load('swamp_water_01') };
for (const c of terrainChunks(terrain, W, H)) { const cv = createCanvas(c.w, c.h); paintTerrainChunk(cv.getContext('2d'), c, terrain, imgs); g.drawImage(cv, c.x, c.y); }
// пол дома, стены
for (const gr of GROUND) { const t = await load(gr.tex); g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(gr.x, gr.y, gr.w, gr.h); }
for (const c of COLLIDERS) if (c.kind === 'trees') { g.fillStyle = '#172114'; g.fillRect(c.x, c.y, c.w, c.h); }

// все спрайты — по Y
const items = [];
for (const p of map.props) items.push({ k: p.k, x: p.x, y: p.y, f: p.f, s: p.s || 1 });
const objs = applyPos(INTERACTIVES, map.pos), ens = applyPos(ENEMY_SPAWNS, map.pos);
for (const o of objs) if (!['pickup'].includes(o.kind) || o.texture) items.push({ k: o.texture, x: o.x, y: o.y - (o.elevated || 0), s: 1 });
for (const d of CONTENT_DECOR) items.push({ k: d.k, x: d.x, y: d.floor ? -1 : d.y, dy: d.y, f: d.flip, s: 1 });
for (const c of COLLIDERS) if (c.tex) items.push({ k: c.tex, x: c.x + c.w / 2, y: c.y + c.h, s: 1 });
for (const e of ens) items.push({ k: ENEMIES[e.enemy].texture, x: e.x, y: e.y, s: e.scale || 1 });
items.sort((a, b) => a.y - b.y);
for (const it of items) {
  const im = await load(it.k); if (!im) continue;
  const [dw, dh] = DISPLAY_SIZE[it.k] || [im.width, im.height];
  const w = dw * it.s, h = dh * it.s;
  g.save(); g.translate(it.x, it.dy ?? it.y);
  if (it.f) g.scale(-1, 1);
  g.drawImage(im, -w / 2, -h, w, h); g.restore();
}
// стены/руины (без текстуры — контуром)
for (const c of COLLIDERS) if (c.kind !== 'trees' && !c.tex) { g.fillStyle = c.kind === 'ruin' ? '#5b5a60' : '#6a4a30'; g.fillRect(c.x, c.y - 30, c.w, c.h + 30); }

const save = (name, cv) => fs.writeFileSync(path.join(OUT, name), cv.toBuffer('image/png'));
const scaled = (sx, sy, sw, sh, sc) => { const c = createCanvas(Math.round(sw * sc), Math.round(sh * sc)); c.getContext('2d').drawImage(full, sx, sy, sw, sh, 0, 0, c.width, c.height); return c; };
save('map_overview.png', scaled(0, 0, W, H, 0.3));
for (const [n, x, y, w, h, sc] of [['map_house', 600, 4850, 600, 500, 1.4], ['map_start', 300, 4150, 1300, 950, 0.7], ['map_trail', 700, 3150, 1000, 1000, 0.7], ['map_west', 50, 2200, 800, 1000, 0.7], ['map_altar', 850, 1950, 800, 1000, 0.8], ['map_gate', 300, 250, 1400, 900, 0.7]]) save(n + '.png', scaled(x, y, w, h, sc));
// дополнительные кадры: CROPS="имя:x,y,w,h,масштаб;…"
for (const part of (process.env.CROPS || '').split(';').filter(Boolean)) { const [n, a] = part.split(':'); const [x, y, w, h, sc] = a.split(',').map(Number); save(n + '.png', scaled(x, y, w, h, sc || 0.7)); }

// слой коллизий поверх обзора
const solids = collectSolids({ colliders: COLLIDERS, props: map.props, interactives: objs, enemies: ens, waterRects: terrain.waterRects });
const cl = createCanvas(Math.round(W * 0.3), Math.round(H * 0.3)), cg = cl.getContext('2d');
cg.drawImage(scaled(0, 0, W, H, 0.3), 0, 0);
for (const s of solids) { cg.fillStyle = s.src.startsWith('prop') ? 'rgba(255,60,40,0.85)' : s.src === 'water' ? 'rgba(60,140,255,0.45)' : 'rgba(255,200,40,0.45)'; cg.fillRect(s.x * 0.3, s.y * 0.3, Math.max(1.2, s.w * 0.3), Math.max(1.2, s.h * 0.3)); }
save('map_colliders.png', cl);
console.log('ok →', OUT, 'solids', solids.length);
