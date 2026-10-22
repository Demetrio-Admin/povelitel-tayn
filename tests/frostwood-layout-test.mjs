import assert from 'node:assert/strict';
import { FROSTWOOD_RECT, FROSTWOOD_ARRIVAL, frostwoodPoint } from '../src/config/frostwood.plan.js';
import { INTERACTIVES, ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { resolveMap } from '../src/world/mapData.js';
import { collectSolids } from '../src/world/solids.js';
import { buildNav, findPath, lineClear } from '../src/world/nav.js';
import { migrateFrostwoodSave } from '../src/world/frostwoodMigration.js';

const map = resolveMap(), r = FROSTWOOD_RECT;
const here = p => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const interactives = INTERACTIVES.filter(here), enemies = ENEMY_SPAWNS.filter(here);
const solids = collectSolids({ colliders: map.colliders, props: map.props,
  interactives, enemies, waterRects: [] });
const dims = { x: r.x, y: r.y, width: r.w, height: r.h, solids };
const grids = [buildNav(dims), buildNav({ ...dims, pad: 0 })];
assert.equal(interactives.length, 7);
assert.equal(enemies.length, 5);
for (const o of [...interactives, ...enemies]) {
  const path = findPath(grids, FROSTWOOD_ARRIVAL, o);
  assert.ok(path && Math.hypot(path.end.x - o.x, path.end.y - o.y) <= o.radius,
    o.id + ' is reachable from the entrance within interaction range');
  let from = FROSTWOOD_ARRIVAL;
  for (const to of path.points) {
    const cell = p => [Math.round((p.x - r.x) / grids[1].cell), Math.round((p.y - r.y) / grids[1].cell)];
    assert.ok(lineClear(grids[1], cell(from), cell(to)), o.id + ' never cuts through trees or water');
    from = to;
  }
}
for (const p of [[200, 280], [750, 990], [150, 1440], [570, 170]]) {
  assert.equal(findPath(grids, FROSTWOOD_ARRIVAL, frostwoodPoint(...p))?.complete,
    false, 'ponds and dense trees remain impassable');
}
for (const p of [[160,370],[850,1055],[210,1310],[820,235]]) {
  const destination=frostwoodPoint(...p), route=findPath(grids,FROSTWOOD_ARRIVAL,destination);
  assert.ok(route?.complete && Math.hypot(route.end.x-destination.x,route.end.y-destination.y)<8, 'bridges and sanctuary are reachable');
}
assert.equal(map.props.filter(here).length, 0, 'old loose decorations do not cover the painting');
const painting = map.grounds.filter(g => g.id === 'frostwood_painting');
assert.equal(painting.length, 1);
assert.ok(Math.abs(painting[0].w / painting[0].h - 1024 / 1536) < 1e-10);
console.log('✓ Frostwood: all 12 live targets reachable, water blocked, artwork proportions intact');

const state = {
  data: { player: { x: 3820, y: 2380 }, safePoint: { x: 4500, y: 620 },
    inventory: { lunar_shard: 7 }, completedEvents: ['chapter_2_complete'],
    worldObjects: { 'enc:fw_alpha': { state: 'fighting', x: 4500, y: 640 },
      'rep:fw_alpha': { wins: 3, at: 123456 } } },
  getObject(id) { return this.data.worldObjects[id]; },
  setObject(id, value) { this.data.worldObjects[id] = value; },
};
assert.equal(migrateFrostwoodSave(state), true);
assert.deepEqual(state.data.player, FROSTWOOD_ARRIVAL);
assert.deepEqual(state.data.safePoint, FROSTWOOD_ARRIVAL);
assert.deepEqual(state.data.worldObjects['enc:fw_alpha'], { state: 'fighting', ...FROSTWOOD_ARRIVAL });
assert.deepEqual(state.data.inventory, { lunar_shard: 7 });
assert.deepEqual(state.data.completedEvents, ['chapter_2_complete']);
assert.deepEqual(state.data.worldObjects['rep:fw_alpha'], { wins: 3, at: 123456 });
state.data.player = frostwoodPoint(500, 900);
const unchanged = structuredClone(state.data);
assert.equal(migrateFrostwoodSave(state), false);
assert.deepEqual(state.data, unchanged, 'reload preserves the new saved position');
delete state.data.worldObjects.frostwood_layout;
state.data.player = { x: 900, y: 5200 };
migrateFrostwoodSave(state);
assert.deepEqual(state.data.player, { x: 900, y: 5200 }, 'other locations are untouched');
console.log('✓ Migration: old positions and interrupted battle moved once, progress and timers preserved');
