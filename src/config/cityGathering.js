import { cityPoint } from './city.plan.js';
// Twelve additional nodes use the existing city geometry, textures and 4 MP gathering action.
const rows = [
 ['moon_01','moon_herb',1320,4580,180,'ch2_city_arrived','moon_plant_01'],
 ['moon_02','moon_herb',1900,4590,180,'ch2_city_arrived','moon_plant_01'],
 ['moon_03','moon_herb',1700,3070,180,'ch2_city_arrived','moon_plant_01'],
 ['mushrooms_brown_01','forest_mushroom',1180,4780,240,'ch2_city_arrived','mushrooms_brown_01'],
 ['mushroom_02','forest_mushroom',1850,3900,240,'ch2_city_arrived','mushrooms_brown_01'],
 ['resin_01','tree_resin',1220,3950,240,'ch2_city_arrived','resin_log_01'],
 ['resin_02','tree_resin',1820,2740,240,'ch2_city_arrived','resin_log_01'],
 ['dust_01','rune_dust',1370,2880,360,'ch2_cargo_reported','rune_sigil_01'],
 ['dust_02','rune_dust',1800,3270,360,'ch2_cargo_reported','rune_sigil_01'],
 ['lunar_01','lunar_shard',1450,2590,900,'ch2_cargo_reported','field_crystal'],
 ['frost_01','frost_herb',1800,1880,300,'ch2_nerys_met','city_frost_herb'],
 ['ice_01','ice_crystal',1900,900,1200,'ch2_quarter_cleared','ice_crystal_node_01'],
];
export const CITY_GATHERING = rows.map(([id,res,x,y,respawnSec,requiresEvent,texture]) => ({ id: `city_gather_${id}`, kind: 'gather', res, amount: 1, ...cityPoint(x,y), respawnSec, requiresEvent, texture, radius: 110 }));
