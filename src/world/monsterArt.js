// Render the approved WebP art once per loaded texture, for both Canvas and WebGL.
// Files, alpha, lazy packs and gameplay coordinates stay independent of this cache.
import { MONSTER_WORLD_HEIGHTS } from '../config/monster-redesign.art.js';
import { env } from '../ui/widgets.js';

const PREFIX = 'monster:readable-v1:';
const DENSITY = 2;
const caches = new WeakMap();

/** Ignore nearly transparent compression dust when measuring the actual silhouette. */
export function silhouetteBounds(data, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] < 64) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}

function prepare(scene, key) {
  const target = MONSTER_WORLD_HEIGHTS[key];
  if (!target) return null; // Hero portraits in duels and other art are untouched.
  const tm = scene?.textures, cacheKey = PREFIX + key;
  if (!tm?.exists || !tm?.get || !tm?.addCanvas) return null;
  if (!caches.has(tm)) caches.set(tm, new Map());
  const cache = caches.get(tm);
  if (tm.exists(cacheKey) && cache.has(key)) return cache.get(key);
  const texture = tm.get(key), source = texture?.getSourceImage();
  if (!source?.width || !source?.height || texture.customData?.placeholder) return null;
  // Two pixels per world pixel, capped for large bosses; no extra network assets.
  const ratio = Math.min(1, Math.min(512, target * DENSITY) / source.height);
  const w = Math.max(1, Math.round(source.width * ratio)), h = Math.max(1, Math.round(source.height * ratio));
  const body = env.createCanvas(w, h), bc = body.getContext('2d');
  bc.imageSmoothingEnabled = true; bc.imageSmoothingQuality = 'high';
  bc.drawImage(source, 0, 0, w, h);
  const pixels = bc.getImageData(0, 0, w, h);
  if (!pixels?.data) return null; // The non-rendering UI smoke adapter has no pixel buffer.
  const bounds = silhouetteBounds(pixels.data, w, h);
  if (!bounds) return null;
  // Pixel-based light correction also works on browsers without Canvas filter support.
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (!pixels.data[i + 3]) continue;
    for (let c = 0; c < 3; c++) pixels.data[i + c] = (pixels.data[i + c] * 1.13 - 128) * 1.035 + 128;
  }
  bc.putImageData(pixels, 0, 0);
  const pad = 4, cw = w + pad * 2, ch = h + pad * 2;
  const canvas = env.createCanvas(cw, ch), ctx = canvas.getContext('2d');
  const mask = env.createCanvas(w, h), mc = mask.getContext('2d');
  mc.drawImage(body, 0, 0);
  mc.globalCompositeOperation = 'source-in'; mc.fillStyle = '#e8d5ae'; mc.fillRect(0, 0, w, h);
  // A soft, sub-pixel reflected edge rather than a thick selection outline.
  const edge = Math.max(0.7, bounds.height / target * 0.55);
  ctx.globalAlpha = 0.22; ctx.filter = 'blur(0.6px)';
  for (const [dx, dy] of [[-edge, 0], [edge, 0], [0, -edge], [0, edge]]) ctx.drawImage(mask, pad + dx, pad + dy);
  ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.drawImage(body, pad, pad); ctx.filter = 'none';
  const art = {
    key: cacheKey, width: cw / bounds.height * target, height: ch / bounds.height * target,
    originY: (pad + bounds.bottom + 1) / ch,
    visibleWidth: bounds.width / bounds.height * target, visibleHeight: target,
  };
  const generated = tm.addCanvas(cacheKey, canvas);
  if (generated) generated.customData = { ...generated.customData, monsterArt: art };
  cache.set(key, art);
  return art;
}

/** Same visible size despite differing transparent margins; feet keep the spawn anchor. */
export function applyMonsterArt(sprite, key) {
  const art = prepare(sprite.scene, key);
  if (!art) return false;
  sprite.setTexture(art.key).setDisplaySize(art.width, art.height).setOrigin(0.5, art.originY);
  sprite.monsterArt = art;
  return true;
}

export function addMonsterShadow(scene, sprite, depth) {
  if (!sprite.monsterArt) return null;
  const width = Math.min(sprite.monsterArt.visibleWidth * 0.74, sprite.monsterArt.visibleHeight * 1.1);
  return scene.add.image(sprite.x, sprite.y - 1, 'hero_shadow').setDisplaySize(width, Math.max(14, width * 0.24))
    .setAlpha(0.64).setDepth(depth);
}

/** Arena enlargement must leave room above the monster for the combat HUD. */
export function monsterCombatScale(visibleHeight, requestedScale) {
  return Math.min(requestedScale, 310 / visibleHeight);
}
