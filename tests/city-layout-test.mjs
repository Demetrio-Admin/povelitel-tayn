import assert from 'node:assert/strict';
import { INTERACTIVES, ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { CITY_ROOMS, CITY_PORTALS, BUILDINGS, CITY_RECT, cityPoint, cityArrival } from '../src/config/city.plan.js';
import { locationAt, locationById } from '../src/config/locations.js';
import { resolveMap, applyPos, diffEdits } from '../src/world/mapData.js';
import { collectSolids } from '../src/world/solids.js';
import { buildTerrain } from '../src/world/terrain.js';
import { buildNav, findPath } from '../src/world/nav.js';
import { checkWalkability, GATE_IDS } from '../src/world/check.js';
import { createDefaultState } from '../src/state/GameState.js';
import { toSnapshot, fromSnapshot, applyPatch } from '../src/cloud/playerModel.js';
const m=resolveMap(),objects=applyPos(INTERACTIVES,m.pos),enemies=applyPos(ENEMY_SPAWNS,m.pos);
const terrain=buildTerrain({ROADS:m.roads,WATERS:m.waters});
const input={...m,interactives:objects,enemies,terrain};
assert.deepEqual(checkWalkability(input),[]);
const grids=(loc,skip=[])=>[8,0].map(pad=>buildNav({...loc.rect,width:loc.rect.w,height:loc.rect.h,pad,
  solids:collectSolids({...input,waterRects:terrain.waterRects,skip:new Set(skip)})}));
const city=locationById('city');
for(const b of BUILDINGS)assert.ok(findPath(grids(city,GATE_IDS),cityPoint(1500,2780),{x:b.door.x,y:b.door.y+100})?.complete,b.id+' approach');
for(const r of CITY_ROOMS){
 assert.equal(locationAt(r.arrival.x,r.arrival.y).id,r.id);
 assert.ok(m.grounds.some(g=>g.id==='floor_'+r.id && g.interior));
 for(const o of [...objects,...enemies].filter(o=>locationAt(o.x,o.y).id===r.id)){
  const result=findPath(grids(r,GATE_IDS),r.arrival,{x:o.x,y:o.y+40});
  assert.ok(result && Math.hypot(result.end.x-o.x,result.end.y-o.y)<=Math.max(o.radius||100,100),r.id+' '+o.id);
 }
 for(const entrance of r.entrances){const d=objects.find(o=>o.id===entrance);assert.equal(d.room,r.id);assert.equal(d.requiresEvent,r.requires);assert.equal(locationAt(d.target.x,d.target.y).id,r.id);}
}
assert.equal(CITY_ROOMS.length,9);
assert.equal(CITY_PORTALS.filter(o=>o.id.startsWith('door_warehouse')).length,2);
assert.equal(objects.find(o=>o.id==='door_warehouse_a').room,objects.find(o=>o.id==='door_warehouse_b').room);
assert.equal(objects.find(o=>o.id==='npc_banker').x,10560);
assert.equal(m.colliders.find(o=>o.id==='c105').x,3600,'stable expedition collider id');
assert.ok(CITY_RECT.w<2300 && CITY_RECT.h<2700,'compact outdoor map');
assert.equal(CITY_PORTALS.some(o=>o.id.includes('north_')),false);
const quarter=cityPoint(1500,1350),yard=cityPoint(1500,620),start=cityPoint(1500,2780);
assert.equal(findPath(grids(city),start,quarter)?.complete,false,'ice gate cannot be bypassed');
assert.equal(findPath(grids(city,['frost_barrier']),start,yard)?.complete,false,'water gate cannot be bypassed');
assert.equal(findPath(grids(city,['frost_barrier','fq_water']),start,yard)?.complete,true);
assert.deepEqual(cityArrival({x:2600,y:3625}),start);
assert.deepEqual(cityArrival({x:2910,y:1700},k=>k==='ch2_water_frozen'),yard);
assert.deepEqual(cityArrival(CITY_ROOMS[0].arrival),CITY_ROOMS[0].arrival);
assert.deepEqual(cityArrival({x:8220,y:3380}),start,'old spacious-city position migrates');
assert.deepEqual(cityArrival(start,()=>false,3),start,'compact position never migrates twice');
const oldSave=createDefaultState();oldSave.player={x:8220,y:3380};
const migrated=fromSnapshot(applyPatch(toSnapshot(oldSave),{pos:start,objects:{city_layout:{version:3}}}));
assert.deepEqual(cityArrival(migrated.player,()=>false,migrated.worldObjects.city_layout.version),start,'server sync keeps layout and position together');
const storage={getItem:()=>JSON.stringify({v:1,layout:2,pos:{npc_banker:{y:790}},props:{},add:[]})};
assert.equal(resolveMap({storage,useDraft:true}).pos.npc_banker.y,790);
assert.equal(diffEdits([],[]).layout,2);
console.log('✓ Spacious town: 12 approaches, 9 rooms, warehouse doors, old saves and quest gates.');
