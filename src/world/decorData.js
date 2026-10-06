// Stable, editable decorative placements. Existing ids and collision-free footprints are preserved.
import { CITY_COLLIDERS, CITY_ROOM_DECOR } from '../config/world.city.js';
import { EXP_COLLIDERS } from '../config/world.expeditions.js';
import { CONTENT_DECOR } from '../config/world.content.js';
import { LOCATIONS, locationAt } from '../config/locations.js';
import { mulberry32 } from './geometry.js';

// Preserve the original seeded northern tree border, but make each tree editable.
const forestBorder = [];
const forest = LOCATIONS.find(l => l.id === 'forest');
const borderRandom = mulberry32(9001);
const borderKeys = ['tree_dark_01', 'tree_dark_02', 'tree_autumn_01', 'tree_autumn_02'];
for (let y = forest.rect.y - forest.extraTop + 90; y <= forest.rect.y; y += 85) {
  for (let x = forest.rect.x - 20; x < forest.rect.x + forest.rect.w + 40; x += 70 + borderRandom() * 30) {
    const k = borderKeys[Math.floor(borderRandom() * borderKeys.length)];
    forestBorder.push({ id: `forest_border_${forestBorder.length}`, k,
      x: x + (borderRandom() - 0.5) * 20, y: y + (borderRandom() - 0.5) * 20,
      f: borderRandom() < 0.5 ? 1 : 0, solid: null, fill: true });
  }
}

// City-only visual layers. Solid forest blocks already define collision; filler
// trees are placed inside them without rebaking or changing the first forest.
export function cityForestDecor() {
  const props = [];
  const keys = ['tree_dark_01', 'tree_dark_02', 'tree_autumn_01', 'tree_autumn_02', 'birch_01'];
  let seed = 20261006;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (const c of CITY_COLLIDERS.filter(c => c.kind === 'trees' && c.w >= 150)) {
    const top = Math.max(1260, c.y);
    for (let y = top + 60; y < c.y + c.h; y += 74) {
      for (let x = c.x + 45; x < c.x + c.w - 30; x += 85) {
        props.push({ id: `city_forest_${props.length}`, k: keys[Math.floor(random() * keys.length)],
          x: x + (random() - 0.5) * 20, y: y + (random() - 0.5) * 16, flip: random() < 0.5 });
      }
    }
  }
  return props;
}

/** Fill already blocked expedition thickets; no new obstacles or route changes. */
export function expeditionForestDecor(loc) {
  if (!loc?.expedition) return [];
  const props = [], r = loc.rect;
  const keys = loc.id === 'frostwood' ? ['tree_frost_01', 'tree_frost_01', 'tree_frost_02'] : ['dead_tree_grey_01'];
  let n = 0;
  for (const c of EXP_COLLIDERS.filter(c => c.kind === 'trees')) {
    const x0 = Math.max(c.x, r.x), x1 = Math.min(c.x + c.w, r.x + r.w);
    const y0 = Math.max(c.y, r.y), y1 = Math.min(c.y + c.h, r.y + r.h);
    if (x1 <= x0 || y1 <= y0) continue;
    for (let y = y0 + 55; y < y1; y += 88) {
      for (let x = x0 + Math.min(45, (x1-x0)/2); x < x1-20; x += 95) {
        props.push({ id: `exp_forest_${loc.id}_${n}`, k: keys[n % keys.length], x, y: y + (n % 3) * 4,
          flip: n % 2 === 0, scale: c.h < 200 && c.w > 200 ? 0.72 : 1 });
        n++;
      }
    }
  }
  return props;
}

const decor = (d) => ({
  ...d, f: d.flip ? 1 : 0, s: d.scale || 1,
  l: d.ground ? 'room-floor' : d.floor ? 'floor' : 'main', solid: null,
});
const city = [...cityForestDecor().map(d => decor({ ...d, fill: true }))];
for (const x of [2425, 3535]) for (const y of [1660,1840,2280,2460,3160,3360,3860,4020,4800,4960]) {
  city.push(decor({id:`city_bush_${x}_${y}`,k:'bush_02',x,y,scale:0.72}));
  city.push(decor({id:`city_flower_${x}_${y}`,k:'flower_white_01',x:x+(x<3000?16:-16),y:y+8,scale:0.65}));
}
CITY_ROOM_DECOR.forEach((d,i)=>city.push(decor({...d,id:`city_room_${i}`,k:d.key})));
city.push(...[
  {id:'city_market_barrel',k:'city_barrel',x:3470,y:3450},
  {id:'city_market_crate',k:'city_crate',x:3440,y:3500},
  {id:'city_rescued_cellar',k:'city_cellar',x:2500,y:2190,ground:true,requires:'ch2_rescue_cellar'},
  {id:'city_patient_miron',k:'city_patient_miron',x:2170,y:4450,requires:'ch2_vol_2'},
  {id:'city_resident_woman',k:'city_resident_woman',x:3410,y:2280,requires:'ch2_rescue_door'},
  {id:'city_resident_man',k:'city_resident_man',x:3480,y:2320,requires:'ch2_rescue_door'},
].map(decor));
export const WORLD_DECOR = [
  ...forestBorder,
  ...CONTENT_DECOR.filter(d=>!(d.k==='frost_patch_01' && locationAt(d.x,d.y).id==='city')).map(decor),
  ...city,
  ...LOCATIONS.flatMap(loc=>expeditionForestDecor(loc).map(d=>decor({...d,fill:true}))),
];
