import assert from 'node:assert/strict';
import { GRAVEYARD_RECT, GRAVEYARD_ARRIVAL, graveyardPoint } from '../src/config/graveyard.plan.js';
import { INTERACTIVES, ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { resolveMap } from '../src/world/mapData.js';
import { collectSolids } from '../src/world/solids.js';
import { buildNav, findPath, lineClear } from '../src/world/nav.js';
import { migrateGraveyardSave } from '../src/world/graveyardMigration.js';

const map = resolveMap(), r = GRAVEYARD_RECT;
const here = p => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const interactives = INTERACTIVES.filter(here), enemies = ENEMY_SPAWNS.filter(here);
const solids = collectSolids({ colliders: map.colliders, props: map.props,
  interactives, enemies, waterRects: [] });
const dims = { x: r.x, y: r.y, width: r.w, height: r.h, solids };
const grids = [buildNav(dims), buildNav({ ...dims, pad: 0 })];
assert.equal(interactives.length, 7);
assert.equal(enemies.length, 5);
for (const o of [...interactives, ...enemies]) {
  const path = findPath(grids, GRAVEYARD_ARRIVAL, o);
  assert.ok(path && Math.hypot(path.end.x - o.x, path.end.y - o.y) <= o.radius,
    o.id + ' is reachable from the entrance within interaction range');
  let from = GRAVEYARD_ARRIVAL;
  for (const to of path.points) {
    const cell = p => [Math.round((p.x - r.x) / grids[1].cell), Math.round((p.y - r.y) / grids[1].cell)];
    assert.ok(lineClear(grids[1], cell(from), cell(to)), o.id + ' never cuts through a grave');
    from = to;
  }
}
for (const p of [[200, 900], [750, 1100], [555, 80]]) {
  assert.equal(findPath(grids, GRAVEYARD_ARRIVAL, graveyardPoint(...p))?.complete,
    false, 'graves and chapel remain impassable');
}
assert.equal(map.props.filter(here).length, 0, 'old loose decorations do not cover the painting');
const painting = map.grounds.filter(g => g.id === 'graveyard_painting');
assert.equal(painting.length, 1);
assert.ok(Math.abs(painting[0].w / painting[0].h - 941 / 1672) < 1e-10);
console.log('✓ Cemetery: all 12 live targets reachable, graves blocked, artwork proportions intact');

const state = {
  data: { player: { x: 3820, y: 5060 }, safePoint: { x: 4500, y: 3300 },
    inventory: { lunar_shard: 7 }, completedEvents: ['chapter_2_complete'],
    worldObjects: { 'enc:gy_warden': { state: 'fighting', x: 4500, y: 3320 },
      'rep:gy_warden': { wins: 3, at: 123456 } } },
  getObject(id) { return this.data.worldObjects[id]; },
  setObject(id, value) { this.data.worldObjects[id] = value; },
};
assert.equal(migrateGraveyardSave(state), true);
assert.deepEqual(state.data.player, GRAVEYARD_ARRIVAL);
assert.deepEqual(state.data.safePoint, GRAVEYARD_ARRIVAL);
assert.deepEqual(state.data.worldObjects['enc:gy_warden'], { state: 'fighting', ...GRAVEYARD_ARRIVAL });
assert.deepEqual(state.data.inventory, { lunar_shard: 7 });
assert.deepEqual(state.data.completedEvents, ['chapter_2_complete']);
assert.deepEqual(state.data.worldObjects['rep:gy_warden'], { wins: 3, at: 123456 });
state.data.player = graveyardPoint(500, 900);
const unchanged = structuredClone(state.data);
assert.equal(migrateGraveyardSave(state), false);
assert.deepEqual(state.data, unchanged, 'reload preserves the new saved position');
delete state.data.worldObjects.graveyard_layout;
state.data.player = { x: 900, y: 5200 };
migrateGraveyardSave(state);
assert.deepEqual(state.data.player, { x: 900, y: 5200 }, 'other locations are untouched');
console.log('✓ Migration: old positions and interrupted battle moved once, progress and timers preserved');
