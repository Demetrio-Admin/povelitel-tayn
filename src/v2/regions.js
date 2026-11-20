import { CITY_RECT, CITY_ROOMS, cityPoint } from '../config/city.plan.js';
import { HEARTH, HEARTH_START } from './hearth.js';

const maple = { x: 18000, y: 300, w: 3600, h: 2400 };
export const borPoint = (x, y) => ({ x: Math.round(maple.x + x * 4.8), y: Math.round(maple.y + y * 4.8) });
export const BOR = { id: 'amberwood', name: 'Янтарный Бор', rect: maple, arrival: borPoint(56, 438), tier: 1 };
export const TOWN = { id: 'city', name: 'Светлодол', rect: CITY_RECT, arrival: cityPoint(850, 5180), tier: 2 };
export const HEARTH_TRAIL = { x: 1781, y: 1111 };
export const BOR_TRACT = borPoint(714, 181);
export const TOWN_GATE = cityPoint(819, 5270);
export const TOWN_WEST_PASSAGE = cityPoint(660, 5170);
export const crossesTownWall = (from, to) =>
  (from.x<TOWN_WEST_PASSAGE.x)!==(to.x<TOWN_WEST_PASSAGE.x);
export const ACT_LOCATIONS = [HEARTH, BOR, TOWN, ...CITY_ROOMS];
export const actLocation = id => ACT_LOCATIONS.find(location => location.id === id);
export function actLocationAt({ x, y } = {}) {
  return ACT_LOCATIONS.find(({ rect: r }) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
}

const boxes = [
  // Banks match the painted stream. Breaks at both wooden bridges are wider than the hero's hitbox.
  [208,0,50,58],[235,58,42,42],[250,100,58,47],
  [261,184,51,25],[244,209,51,28],[234,237,52,27],
  [249,264,52,26],[273,290,46,33],
  [251,361,56,30],[236,391,51,29],[220,420,52,31],[216,451,61,49],
  // The scenery at the map edges and the three islands of trees.
  [28,30,70,91],[103,10,93,45],[330,12,185,61],[620,13,130,68],
  [18,192,51,100],[0,330,43,99],[72,468,151,32],[348,445,286,55],[666,344,84,156],
  [144,133,57,46],[325,217,62,39],[514,313,65,50],[678,228,72,37],
];
export const BOR_COLLIDERS = boxes.map(([x,y,w,h],index) => ({
  id: 'bor-ground-' + index, ...borPoint(x,y), w: Math.round(w*4.8), h: Math.round(h*4.8),
}));
export function borMap() { return { grounds: [], roads: [], waters: [], props: [], pos: {}, colliders: BOR_COLLIDERS }; }

const borSpawn = [
  [104,416],[103,359],[158,338],[187,318],[208,291],[119,274],[105,221],[91,163],
  [124,109],[191,82],[221,127],[215,179],[331,151],[392,125],[459,105],[568,104],
  [585,158],[651,152],[654,211],[597,257],[540,239],[437,263],[448,337],[392,385],
];
const townSpawn = [
  [680,5050],[1110,5170],[1340,5300],[1730,5270],[2210,5450],[2460,5170],
  [1110,4720],[1470,4810],[1670,4720],[2040,4700],[2350,4740],[2450,4440],
  [1330,4290],[1510,4090],[1700,3850],[2020,4020],[2360,3940],[2470,3600],
  [1320,3780],[1650,3320],[1870,3180],[2130,3060],[1510,2790],[2250,2650],
];
export const spawnZones = tier => (tier === 1 ? borSpawn.map(p=>borPoint(...p)) : townSpawn.map(p=>cityPoint(...p)));
const borGather = [
  [71,420],[129,381],[177,335],[76,274],[157,255],[181,226],[106,198],[191,170],[215,106],
  [336,135],[421,112],[496,151],[606,144],[649,195],[573,228],[463,254],[417,329],[578,383],
];
const townGather = [
  [640,5068],[1080,5320],[1425,5390],[1730,5190],[2235,5310],[2510,5050],
  [1100,4800],[1575,4624],[2010,4730],[2415,4674],[1425,4120],[1925,4030],
  [2220,4090],[2350,3750],[1280,3850],[1510,3420],[1820,3235],[2220,3100],
];
export const gatherZones = tier => (tier===1 ? borGather.map(p=>borPoint(...p)) : townGather.map(p=>cityPoint(...p)));
export const CITY_ACTORS = Object.freeze({ asya: cityPoint(1565,3732), grom: cityPoint(885,5190), boris: cityPoint(1460,4430) });
export function arrivalFor(id) { return actLocation(id)?.arrival ?? HEARTH_START; }
