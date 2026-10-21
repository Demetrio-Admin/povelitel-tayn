import { UPGRADES } from '../../src/config/balance.progression.js';
import { AMULET_UPGRADES, SAPPHIRE_AMULET_PRICES } from '../../src/config/build.js';
export function currencyHours(cost, rates){
 if((cost.coins>0&&!(rates.coins>0))||(cost.sapphires>0&&!(rates.sapphires>0)))return null;
 return Math.max(cost.coins?cost.coins/rates.coins:0,cost.sapphires?cost.sapphires/rates.sapphires:0);
}
export function budgets(rates){const costs={bag:{sapphires:300},fireII:UPGRADES.fire_2.cost,telekinesisIII:UPGRADES.telekinesis_3_lord.cost,giftIV:UPGRADES.fire_4_arsonist.cost,giftV:UPGRADES.fire_5_arsonist.cost,stormI:UPGRADES.storm_1.cost,coinAmulet:{coins:AMULET_UPGRADES.reduce((n,r)=>n+r.coins,0)},sapphireAmulet:{sapphires:SAPPHIRE_AMULET_PRICES.reduce((a,b)=>a+b,0)},stormIToV:{sapphires:['storm_1','storm_2','storm_3_field','storm_4_field','storm_5_field'].reduce((n,id)=>n+UPGRADES[id].cost.sapphires,0)}};return Object.fromEntries(Object.entries(costs).map(([id,c])=>[id,{coins:c.coins||0,sapphires:c.sapphires||0,hours:currencyHours(c,rates)}]));}
// Currency-only thresholds: no skill XP/material/time gate or increased future income is assumed.
