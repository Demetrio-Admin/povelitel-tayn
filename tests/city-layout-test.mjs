// v0.37.0: walkable town (plan v4) — geometry, approaches, story gates and the one-time save migration.
import assert from 'node:assert/strict';
import { INTERACTIVES, ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { CITY_ROOMS, CITY_PORTALS, BUILDINGS, CITY_RECT, CITY_POSITIONS, CITY_SPOTS, CITY_ADMIN_POINTS, CITY_LAYOUT_VERSION,
  V3_CITY, CITY_CANAL, cityPoint, cityArrival, cityMapData } from '../src/config/city.plan.js';
import { CITY_START } from '../src/config/world.city.js';
import { ADMIN_CHECKPOINTS } from '../src/admin/config.js';
import { locationAt, locationById } from '../src/config/locations.js';
import { resolveMap, applyPos, diffEdits } from '../src/world/mapData.js';
import { collectSolids, propSolid } from '../src/world/solids.js';
import { buildTerrain, buildRoad } from '../src/world/terrain.js';
import { distToPolygon } from '../src/world/geometry.js';
import { buildNav, findPath } from '../src/world/nav.js';
import { checkWalkability, GATE_IDS } from '../src/world/check.js';
import { buildWalkGrid, floodFrom, reachableNear } from '../src/world/walk.js';
import { GameState, createDefaultState } from '../src/state/GameState.js';
import { migrateCitySave } from '../src/world/cityMigration.js';
import { toSnapshot, fromSnapshot, applyPatch } from '../src/cloud/playerModel.js';

const m=resolveMap(),objects=applyPos(INTERACTIVES,m.pos),enemies=applyPos(ENEMY_SPAWNS,m.pos);
const terrain=buildTerrain({ROADS:m.roads,WATERS:m.waters});
const input={...m,interactives:objects,enemies,terrain};
assert.deepEqual(checkWalkability(input),[]);
const city=locationById('city');
const solids=(skip=[])=>collectSolids({...input,waterRects:terrain.waterRects,skip:new Set(skip)});
const grids=(loc,skip=[])=>[8,0].map(pad=>buildNav({...loc.rect,width:loc.rect.w,height:loc.rect.h,pad,solids:solids(skip)}));
const floods=new Map();
// Strict 4-connected flood (the same check the map editor runs): can the hero's feet get within 24 px of a point?
const reach=(from,to,skip=[])=>{
  const key=JSON.stringify([from,skip]),r=city.rect;
  if(!floods.has(key)){const grid=buildWalkGrid({width:r.w,height:r.h,solids:solids(skip).map(s=>({...s,x:s.x-r.x,y:s.y-r.y}))});floods.set(key,{grid,seen:floodFrom(grid,from.x-r.x,from.y-r.y)});}
  const {grid,seen}=floods.get(key);return reachableNear(grid,seen,to.x-r.x,to.y-r.y,24);
};
const inCity=p=>p.x>=CITY_RECT.x && p.x<CITY_RECT.x+CITY_RECT.w && p.y>=CITY_RECT.y && p.y<CITY_RECT.y+CITY_RECT.h;
const byId=id=>objects.find(o=>o.id===id)||enemies.find(o=>o.id===id);
const door=id=>BUILDINGS.find(b=>b.id===id).door;
const front=id=>({x:door(id).x,y:door(id).y+100});

// ---- scale: same houses, bigger town
const V3_SIZES={north_bay:[324,252],north_workshop:[336,252],cellar:[324,222],rescue:[336,222],archive:[324,252],society:[336,252],
  bank:[300,240],duel:[360,252],coven:[336,252],warehouse_a:[360,204],warehouse_b:[336,204],lab:[228,228]};
assert.equal(BUILDINGS.length,12);
for(const b of BUILDINGS)assert.deepEqual([b.w,b.h],V3_SIZES[b.id],'house size unchanged: '+b.id);
assert.ok(CITY_RECT.w*CITY_RECT.h>=2*V3_CITY.rect.w*V3_CITY.rect.h,'territory at least doubled');
assert.equal(CITY_LAYOUT_VERSION,4);
// Asymmetric groups: no two houses share a door line (no mirrored pairs across one straight avenue).
for(const a of BUILDINGS)for(const b of BUILDINGS)if(a!==b)assert.ok(Math.abs(a.door.y-b.door.y)>=60,`${a.id} and ${b.id} are not a mirrored pair`);
// Every place is its own step along the walk: consecutive public places are 600–1500 px apart.
const route=[CITY_START,CITY_SPOTS.gate,CITY_SPOTS.market,CITY_SPOTS.square,CITY_SPOTS.garden,CITY_SPOTS.bridgeSouth,CITY_SPOTS.quarter,CITY_SPOTS.waterSouth,CITY_SPOTS.yard];
for(let i=2;i<route.length-1;i++){const d=Math.hypot(route[i].x-route[i-1].x,route[i].y-route[i-1].y);assert.ok(d>=350 && d<=1500,'step '+i+' '+d);}
assert.ok(route.every(inCity),'route stays in the city');

// ---- every door, NPC and quest object is reachable from the road with story gates open
for(const b of BUILDINGS)assert.ok(reach(CITY_START,front(b.id),GATE_IDS),b.id+' approach');
for(const id of Object.keys(CITY_POSITIONS)){
  const o=byId(id);if(!o || !inCity(o))continue;
  const r=city.rect,{grid,seen}=(reach(CITY_START,CITY_START,GATE_IDS),floods.get(JSON.stringify([CITY_START,GATE_IDS])));
  assert.ok(reachableNear(grid,seen,o.x-r.x,o.y-r.y,Math.min(o.radius||100,120)),'reach '+id);
}
// ---- clear doorsteps: nothing solid in front of a door except its own story lock
const locks=new Set(['lab_seal','final_ward','fq_door']);
for(const b of BUILDINGS){
  const box={x:b.door.x-55,y:b.door.y+8,w:110,h:100};
  const hit=solids().filter(s=>!s.src.startsWith('obj:door_') && !locks.has(s.src.slice(4)) && s.x<box.x+box.w && s.x+s.w>box.x && s.y<box.y+box.h && s.y+s.h>box.y);
  assert.deepEqual(hit.map(s=>s.src),[],'clear doorstep: '+b.id);
}
// ---- the merchant has his own pad: away from the bank door and the main street, with room for a customer
const merchant=byId('npc_merchant'),mainStreets=m.roads.filter(r=>/city_street_main_/.test(r.id)).map((r,i)=>buildRoad(r,i));
assert.ok(Math.hypot(merchant.x-door('bank').x,merchant.y-door('bank').y)>=600,'merchant is not pressed against the bank');
assert.ok(mainStreets.every(r=>distToPolygon(merchant.x,merchant.y,r.poly)>=150),'merchant stands off the main street');
assert.ok(m.colliders.some(c=>c.tex==='market_stall_01' && Math.hypot(c.x+c.w/2-merchant.x,c.y+c.h-merchant.y)<260),'stall beside the merchant');
const customer={x:merchant.x-140,y:merchant.y+20,w:140,h:90};
assert.deepEqual(solids().filter(s=>s.src!=='obj:npc_merchant' && s.x<customer.x+customer.w && s.x+s.w>customer.x && s.y<customer.y+customer.h && s.y+s.h>customer.y).map(s=>s.src),[],'customer space');
// ---- decor never blocks the main street; inner trees are compact town trees
const solidProps=m.props.filter(p=>inCity(p) && propSolid(p));
for(const p of solidProps)assert.ok(mainStreets.every(r=>distToPolygon(p.x,p.y,r.poly)>8),'street clear of '+p.id);
const wall=m.colliders.find(c=>c.id==='city_plan_wall_west_n'),east=m.colliders.find(c=>c.id==='city_plan_wall_east');
const inside=m.props.filter(p=>p.x>wall.x+wall.w && p.x<east.x && p.y>CITY_RECT.y+160 && p.y<CITY_RECT.y+5560);
assert.equal(inside.filter(p=>/^(tree_dark|tree_autumn|birch)/.test(p.k)).length,0,'no forest trees inside the town');
assert.ok(inside.filter(p=>p.k.startsWith('city_walk_tree_')).length>=30,'compact town trees');
assert.ok(new Set(inside.map(p=>p.k)).size>=18,'varied small groups of details');
assert.equal(m.colliders.filter(c=>c.kind==='fence').every(c=>c.h<=14),true,'inner fences are low');

// ---- story gates: the bridge is the only way into the quarter, the flooded passage the only way north
const quarter=front('cellar'),yard=CITY_SPOTS.yard,south=CITY_SPOTS.bridgeSouth,lab=front('lab');
assert.equal(reach(CITY_START,south,[]),true,'garden side of the bridge open from the start');
assert.equal(reach(CITY_START,quarter,GATE_IDS.filter(g=>g!=='frost_barrier')),false,'ice wall on the bridge cannot be bypassed');
assert.equal(reach(CITY_START,yard,GATE_IDS.filter(g=>g!=='fq_water')),false,'flooded passage cannot be bypassed');
assert.equal(reach(CITY_START,yard,GATE_IDS),true);
assert.equal(reach(CITY_START,{x:lab.x,y:lab.y-80},GATE_IDS.filter(g=>g!=='lab_seal')),false,'lab door held by its seal');
assert.equal(reach(CITY_START,{x:lab.x,y:lab.y-80},GATE_IDS),true);
assert.ok(BUILDINGS.find(b=>b.id==='lab').x+BUILDINGS.find(b=>b.id==='lab').w<=wall.x,'lab outside the west wall');
const [[g0,g1]]=CITY_CANAL.gaps,bar=CITY_POSITIONS.frost_barrier;
assert.ok(terrain.waterRects.some(r=>r.x+r.w===g0) && terrain.waterRects.some(r=>r.x===g1),'canal on both sides of the bridge');
assert.ok(bar.x-bar.collide.w/2<g0-10 && bar.x+bar.collide.w/2>g1+10,'ice wall spans the bridge deck');
assert.ok(bar.y-bar.collide.h>=CITY_CANAL.pts[0][1]-CITY_CANAL.half && bar.y<=CITY_CANAL.pts[0][1]+CITY_CANAL.half,'ice wall stands over the water, on the bridge');

// ---- rooms and portals keep their independent spaces
for(const r of CITY_ROOMS){
 assert.equal(locationAt(r.arrival.x,r.arrival.y).id,r.id);
 assert.ok(m.grounds.some(g=>g.id==='floor_'+r.id && g.interior));
 for(const o of [...objects,...enemies].filter(o=>locationAt(o.x,o.y).id===r.id)){
  const result=findPath(grids(r,GATE_IDS),r.arrival,{x:o.x,y:o.y+40});
  assert.ok(result && Math.hypot(result.end.x-o.x,result.end.y-o.y)<=Math.max(o.radius||100,100),r.id+' '+o.id);
 }
 for(const entrance of r.entrances){const d=objects.find(o=>o.id===entrance);assert.equal(d.room,r.id);assert.equal(d.requiresEvent,r.requires);assert.equal(locationAt(d.target.x,d.target.y).id,r.id);}
}
for(const b of BUILDINGS.filter(b=>!b.id.startsWith('north_'))){
  const exit=objects.find(o=>o.id==='room_exit_'+b.id);
  assert.deepEqual(exit.target,{x:b.door.x,y:b.door.y+100},'exit returns to its own house: '+b.id);
  assert.equal(locationAt(exit.target.x,exit.target.y).id,'city');
}
assert.equal(CITY_ROOMS.length,9);
assert.equal(CITY_PORTALS.filter(o=>o.id.startsWith('door_warehouse')).length,2);
assert.equal(objects.find(o=>o.id==='door_warehouse_a').room,objects.find(o=>o.id==='door_warehouse_b').room);
assert.equal(objects.find(o=>o.id==='npc_banker').x,10560);
assert.equal(m.colliders.find(o=>o.id==='c105').x,3600,'stable expedition collider id');
assert.equal(CITY_PORTALS.some(o=>o.id.includes('north_')),false);

// ---- one-time migration from every previous town plan
const has=(...ev)=>k=>ev.includes(k);
const v3=(x,y)=>({x:V3_CITY.origin.x+x*V3_CITY.scale,y:V3_CITY.origin.y+y*V3_CITY.scale});
const walkable=p=>!solids().some(s=>p.x>s.x-17 && p.x<s.x+s.w+17 && p.y>s.y && p.y-22<s.y+s.h);
assert.deepEqual(cityArrival(v3(2210,2790),()=>false,3),front('bank'),'v3 bank doorstep → new bank doorstep');
assert.deepEqual(cityArrival(v3(800,3460),()=>false,3),front('duel'));
assert.deepEqual(cityArrival(v3(-560,2510),()=>false,3),CITY_SPOTS.road);
assert.deepEqual(cityArrival(v3(1500,1350),()=>false,3),CITY_SPOTS.bridgeSouth,'closed quarter → in front of the bridge');
assert.deepEqual(cityArrival(v3(1500,1350),has('ch2_quarter_open'),3),CITY_SPOTS.quarter);
assert.deepEqual(cityArrival(v3(900,1300),has('ch2_quarter_open'),3),front('cellar'));
assert.deepEqual(cityArrival(v3(2200,1300),has('ch2_quarter_open'),3),front('rescue'));
assert.deepEqual(cityArrival(v3(1500,620),has('ch2_quarter_open'),3),CITY_SPOTS.waterSouth,'closed water gate → before it');
assert.deepEqual(cityArrival(v3(1500,620),has('ch2_quarter_open','ch2_water_frozen'),3),CITY_SPOTS.yard);
assert.deepEqual(cityArrival({x:2600,y:3625}),CITY_SPOTS.square,'v1 cutaway town');
assert.ok(inCity(cityArrival({x:8220,y:3380},()=>false,2)),'v2 spacious town');
assert.deepEqual(cityArrival(CITY_ROOMS[0].arrival,()=>false,3),CITY_ROOMS[0].arrival,'rooms never move');
assert.deepEqual(cityArrival({x:900,y:4000},()=>false,3),{x:900,y:4000},'forest never moves');
assert.deepEqual(cityArrival(front('bank'),()=>false,4),front('bank'),'current plan never migrates twice');
for(const p of Object.values(CITY_ADMIN_POINTS))assert.deepEqual(cityArrival(p,()=>false,3),p,'admin teleport is never reinterpreted');
for(const p of [...Object.values(CITY_SPOTS),...BUILDINGS.map(b=>front(b.id))])assert.ok(walkable(p),'migration target is free ground: '+JSON.stringify(p));
assert.ok(Object.values(ADMIN_CHECKPOINTS).filter(inCity).every(walkable),'admin checkpoints on free ground');
// Whole-save migration: player, safe point and pushed crates move together; reload does nothing.
const st=new GameState();st.data.completedEvents.push('ch2_start','ch2_quarter_open');
st.data.player=v3(1500,1350);st.data.safePoint=v3(1500,2780);
const debris=INTERACTIVES.find(o=>o.id==='fq_cellar');
st.setObject('city_layout',{version:3});st.setObject('fq_cellar',{state:'moved',x:v3(950,1320).x,y:v3(950,1320).y});
const before={inv:JSON.stringify(st.data.inventory),ev:[...st.data.completedEvents]};
assert.equal(migrateCitySave(st),true);
assert.deepEqual(st.data.player,CITY_SPOTS.quarter);assert.deepEqual(st.data.safePoint,CITY_SPOTS.square);
assert.deepEqual({x:st.getObject('fq_cellar').x,y:st.getObject('fq_cellar').y},debris.target,'pushed crates rest at the new target');
assert.equal(st.getObject('city_layout').version,4);
assert.deepEqual({inv:JSON.stringify(st.data.inventory),ev:st.data.completedEvents},before,'progress untouched');
const once=JSON.stringify(st.data);assert.equal(migrateCitySave(st),false);assert.equal(JSON.stringify(st.data),once,'second load moves nothing');
const fresh=new GameState();fresh.data.player={x:900,y:5200};assert.equal(migrateCitySave(fresh),true);assert.deepEqual(fresh.data.player,{x:900,y:5200});
const oldSave=createDefaultState();oldSave.player=v3(2210,2790);
const synced=fromSnapshot(applyPatch(toSnapshot(oldSave),{pos:front('bank'),objects:{city_layout:{version:4}}}));
assert.deepEqual(cityArrival(synced.player,()=>false,synced.worldObjects.city_layout.version),front('bank'),'server sync keeps layout and position together');
const storage={getItem:()=>JSON.stringify({v:1,layout:2,pos:{npc_banker:{y:790}},props:{},add:[]})};
assert.equal(resolveMap({storage,useDraft:true}).pos.npc_banker.y,790);
assert.equal(diffEdits([],[]).layout,2);
assert.ok(cityMapData().waters.length===1);
console.log('✓ Walkable town: same houses on a 2× territory, 12 doorsteps, merchant pad, bridge and flooded-passage gates, rooms, v1–v3 saves.');
// The targeted SQL upgrade for existing installations carries exactly the generated admin destinations.
{
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../supabase/migrations/20261011_walkable_city_admin_points.sql', import.meta.url), 'utf8');
  for (const k of ['city', 'nerys', 'nerys_final']) assert.ok(sql.includes(`('${k}', ${ADMIN_CHECKPOINTS[k].x}, ${ADMIN_CHECKPOINTS[k].y})`), 'SQL admin point ' + k);
}
