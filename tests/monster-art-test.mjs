import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MONSTER_REDESIGN_FILES, MONSTER_WORLD_HEIGHTS } from '../src/config/monster-redesign.art.js';
import { ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { ENEMIES } from '../src/config/balance.enemies.js';
import { silhouetteBounds, monsterCombatScale, applyMonsterArt } from '../src/world/monsterArt.js';

// Wide transparent margins and alpha dust must not count as the creature's body.
const pixels = new Uint8ClampedArray(8 * 10 * 4);
pixels[3] = 1;
for (let y = 2; y <= 8; y++) for (let x = 3; x <= 6; x++) pixels[(y * 8 + x) * 4 + 3] = 255;
assert.deepEqual(silhouetteBounds(pixels, 8, 10), { left: 3, top: 2, right: 6, bottom: 8, width: 4, height: 7 });
assert.equal(silhouetteBounds(new Uint8ClampedArray(16), 2, 2), null);

const keys = Object.keys(MONSTER_REDESIGN_FILES);
assert.equal(keys.length, 25);
assert.deepEqual(Object.keys(MONSTER_WORLD_HEIGHTS), keys);
for (const key of keys) {
  assert(ENEMY_SPAWNS.some(s => (s.texture || ENEMIES[s.enemy]?.texture) === key), `${key} has a real spawn`);
  const height = MONSTER_WORLD_HEIGHTS[key];
  assert(height >= 80 && height <= 260, `${key}: intentional world size`);
  for (const mul of [1.2, 1.5, 1.7]) assert(height * monsterCombatScale(height, mul) <= 310.001, `${key}: combat HUD space`);
  const file = MONSTER_REDESIGN_FILES[key].split('?')[0];
  assert(file.endsWith('.webp'), `${key}: optimized WebP retained`);
  const bytes = fs.readFileSync(new URL('../public/' + file, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
}
assert(MONSTER_WORLD_HEIGHTS.enemy_rootling < 110, 'rootling stays below the visible heroine including hat');
assert(MONSTER_WORLD_HEIGHTS.enemy_guardian > MONSTER_WORLD_HEIGHTS.enemy_scavenger);
assert(MONSTER_WORLD_HEIGHTS.enemy_frost_alpha > MONSTER_WORLD_HEIGHTS.enemy_frost_wolf);
// PvP hero art must not be replaced, rescaled or sent through the monster cache.
assert.equal(applyMonsterArt({ scene: { textures: { get() { throw Error('hero texture was accessed'); } } } }, 'warlock_down'), false);
console.log('Monster art: 25 species retain WebP and real spawns; silhouette padding, small enemies, bosses, arena cap and PvP isolation passed.');
