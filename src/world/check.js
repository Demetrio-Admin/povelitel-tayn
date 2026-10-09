import { locationAt, locationById } from '../config/locations.js';
// Проверка расстановки: можно ли дойти до всех мест, когда проходы открыты, и закрыты ли ворота, пока их не открыли.
// Используется редактором карты (кнопка «Проверить проходимость») и тестами.
import { WORLD } from '../config/world.layout.js';
import { CITY_GATE_IDS, CITY_BEHIND_GATES } from '../config/world.city.js';
import { buildWalkGrid, floodFrom, reachableNear } from './walk.js';
import { collectSolids } from './solids.js';

export const GATE_IDS = ['corrupted_roots', 'heavy_boulder', 'forest_guardian_01', 'ancient_gate', 'node_trial', ...CITY_GATE_IDS];
// Что должно оставаться недостижимым, пока проходы закрыты: за ними — следующие зоны маршрута.
export const BEHIND_GATES = ['moonstone', 'west_chest', 'forest_guardian_01', 'fire_circle', 'dry_bush', 'ancient_gate', 'node_trial', 'forest_node'];

export function checkWalkability({ colliders, props, interactives, enemies, terrain, start = WORLD.playerStart }) {
  const all = [...interactives, ...enemies];
  const byId = Object.fromEntries(all.map(o => [o.id, o]));
  const solidsFor = skip => collectSolids({colliders,props,interactives,enemies,waterRects:terrain.waterRects,skip:new Set(skip)});
  const gridFor = (loc,skip) => {
    const r=loc.rect;
    return buildWalkGrid({width:r.w,height:r.h,solids:solidsFor(skip).map(s=>({...s,x:s.x-r.x,y:s.y-r.y}))});
  };
  const near = (grid,seen,o,loc) => reachableNear(grid,seen,o.x-loc.rect.x,o.y-loc.rect.y,Math.min(o.radius||100,120));
  const problems=[], floods=new Map();
  for(const o of all){
    if(o.id==='flame_c')continue;
    const loc=locationAt(o.x,o.y);
    if(!floods.has(loc.id)){
      const grid=gridFor(loc,GATE_IDS),p=loc.id==='forest'?start:loc.arrival;
      floods.set(loc.id,{grid,seen:floodFrom(grid,p.x-loc.rect.x,p.y-loc.rect.y)});
    }
    const {grid,seen}=floods.get(loc.id);
    if(!near(grid,seen,o,loc))problems.push({id:o.id,text:`«${o.id}» недостижим даже с открытыми проходами`});
  }
  for(const [location,ids] of [['forest',BEHIND_GATES],['city',CITY_BEHIND_GATES]]){
    const loc=locationById(location),grid=gridFor(loc,[]),p=location==='forest'?start:loc.arrival;
    const seen=floodFrom(grid,p.x-loc.rect.x,p.y-loc.rect.y);
    for(const id of ids){
      const o=byId[id];
      if(!o || locationAt(o.x,o.y).id!==location)continue;
      if(near(grid,seen,o,loc))problems.push({id,text:`«${id}» достижим в обход закрытых проходов`});
    }
  }
  return problems;
}
