// Production layout, real collision data and locked story routes, without Phaser.
import assert from 'node:assert/strict';
import { ASSET_FILES, DISPLAY_SIZE } from '../src/config/assets.manifest.js';
import { WORLD, INTERACTIVES, ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { CITY_ZONES, CITY_GROUND, CITY_START } from '../src/config/world.city.js';
import { resolveMap, applyPos } from '../src/world/mapData.js';
import { buildTerrain } from '../src/world/terrain.js';
import { collectSolids } from '../src/world/solids.js';
import { buildNav, findPath } from '../src/world/nav.js';
import { checkWalkability, GATE_IDS } from '../src/world/check.js';

const map = resolveMap({ storage: null, useDraft: false });
const interactives = applyPos(INTERACTIVES, map.pos), enemies = applyPos(ENEMY_SPAWNS, map.pos);
const terrain = buildTerrain({ ROADS: map.roads, WATERS: map.waters });
const input = { colliders: map.colliders, props: map.props, interactives, enemies, terrain };
assert.deepEqual(checkWalkability(input), [], 'all destinations reachable, no bypass around story gates');
const grids = skip => [8, 0].map(pad => buildNav({ width: WORLD.width, height: WORLD.height, pad,
  solids: collectSolids({ ...input, waterRects: terrain.waterRects, skip: new Set(skip) }) }));
for (const [name, destination, skip] of [
  ['банк', { x: 3320, y: 3930 }, []], ['архив', { x: 2620, y: 2960 }, []],
  ['общество', { x: 3210, y: 2980 }, []], ['ковен', { x: 3210, y: 4240 }, []],
  ['лаборатория', { x: 2070, y: 4480 }, GATE_IDS], ['дуэль', { x: 2640, y: 4320 }, GATE_IDS],
]) {
  assert.ok(findPath(grids(skip), CITY_START, destination).complete, `${name}: enter the room through its door`);
}
const bank = CITY_ZONES.find(z => z.id === 'BK'), agatha = interactives.find(o => o.id === 'npc_banker');
assert.ok(agatha.x > bank.x && agatha.x < bank.x + bank.w && agatha.y > bank.y && agatha.y < bank.y + bank.h);
assert.ok(Math.min(agatha.x-bank.x, bank.x+bank.w-agatha.x, agatha.y-bank.y, bank.y+bank.h-agatha.y) > agatha.radius,
  'Agatha can only be addressed from inside the bank');
for (const room of CITY_ZONES.filter(z => z.interior)) {
  const floor = CITY_GROUND.find(g => g.x === room.x && g.y === room.y && g.w === room.w && g.h === room.h);
  assert.ok(floor?.interior && ASSET_FILES[floor.tex], `${room.id}: interior floor above outside frost`);
  for (const c of map.colliders.filter(c => c.tex && c.x >= room.x && c.x+c.w <= room.x+room.w && c.y >= room.y && c.y+c.h <= room.y+room.h)) {
    const [w,h] = DISPLAY_SIZE[c.tex];
    const x = c.x+c.w/2, y = c.y+c.h;
    assert.ok(x-w/2 >= room.x+20 && x+w/2 <= room.x+room.w-20 && y-h >= room.y+20,
      `${room.id}: ${c.tex} stays within the cutaway (${x},${y}; ${w}x${h})`);
  }
}
assert.equal(map.colliders.find(c => c.id === 'c105').x, 3600, 'expedition collider ids remain stable');
console.log('✓ Город: входы, разные полы, мебель внутри стен, Агата в банке и сюжетные преграды проверены.');
