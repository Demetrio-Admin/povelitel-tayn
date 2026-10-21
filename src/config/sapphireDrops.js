import { INTERACTIVES, ENEMY_SPAWNS } from './world.layout.js';
import { CITY_INTERACTIVES } from './world.city.js';
import { CITY_GATHERING } from './cityGathering.js';
import { EXP_INTERACTIVES } from './world.expeditions.js';
const city = new Set([...CITY_INTERACTIVES,...CITY_GATHERING].map(o=>o.id));
const expedition = new Set(EXP_INTERACTIVES.map(o=>o.id));
export const SAPPHIRE_DROPS = { world: {}, combat: {} };
for (const o of INTERACTIVES) {
 const c = city.has(o.id), e = expedition.has(o.id);
 if (o.kind === 'gather') SAPPHIRE_DROPS.world[o.id] = { chance: e ? .15 : c ? .12 : .1, amount: e ? 6 : c ? 3 : 2 };
 if (o.kind === 'stash') SAPPHIRE_DROPS.world[o.id] = { chance: e ? .8 : .4, amount: e ? 25 : 5 };
 if (o.kind === 'chest' && !o.reward?.sapphires) SAPPHIRE_DROPS.world[o.id] = { chance: c ? .3 : .2, amount: c ? 10 : 5 };
}
SAPPHIRE_DROPS.world.fq_cauldron = { chance: 1, amount: 20 };
for (const o of ENEMY_SPAWNS) {
 let rule;
 if (['frost_alpha','barrow_warden','severin_boss'].includes(o.enemy)) rule = [.85,45];
 else if (['node_guardian','frost_collector_elite','ice_guardian','experimental_construct'].includes(o.enemy)) rule = [.6,12];
 else if (o.enemy === 'forest_guardian') rule = [.5,8];
 else if (o.enemy === 'rootling') rule = [.25,3];
 else if (/^(fw_|gy_)/.test(o.id)) rule = [.35,8];
 else if (['forest_scavenger','young_scavenger'].includes(o.enemy)) rule = [.2,2];
 else rule = [.3,4];
 SAPPHIRE_DROPS.combat[o.id] = { chance: rule[0], amount: rule[1] };
}
export function rollSapphires(kind, id, random = Math.random) {
 const r = SAPPHIRE_DROPS[kind]?.[id]; return r && random() < r.chance ? r.amount : 0;
}
