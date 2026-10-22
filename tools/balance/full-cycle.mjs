// Closed-stock economy model. Currency rates are model outputs, never player guarantees.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { emptySnapshot, applyAction, combatApply, advanceVitals, maxVitals } from '../../src/cloud/playerModel.js';
import { verifyCombat } from '../../src/cloud/combatVerify.js';
import { playBot } from '../../tests/helpers/combat-bot.mjs';
import { INTERACTIVES, ENEMY_SPAWNS, WORLD } from '../../src/config/world.layout.js';
import { serverRules } from '../../src/config/serverRules.js';
import { ENEMIES } from '../../src/config/balance.enemies.js';
import { HERO_LEVELS } from '../../src/config/balance.hero.js';
import { PLAYER } from '../../src/config/game.config.js';
import { locationAt, locationById } from '../../src/config/locations.js';
import { buildNav, findPath } from '../../src/world/nav.js';
import { buildTerrain } from '../../src/world/terrain.js';
import { collectSolids } from '../../src/world/solids.js';
import { PROPS, resolveMap } from '../../src/world/mapData.js';
import { bagData, bagUsed } from '../../src/config/bag.js';
import { POTIONS } from '../../src/config/resources.js';
import { COMBAT_BALANCE_VERSION } from '../../src/config/combatVersions.js';
const R=serverRules(), nodes=new Map(INTERACTIVES.map(o=>[o.id,o])), enemies=new Map(ENEMY_SPAWNS.map(o=>[o.id,o]));
const merchant=nodes.get('npc_merchant');
const profiles={
 story:{levels:[2,1,1,3,0],amulets:['amulet_forest'],amuletLevels:{},branches:{ice:'shard'}},
 prepared:{levels:[2,1,1,3,0],amulets:['amulet_forest','amulet_lunar'],amuletLevels:{},branches:{ice:'shard'}},
 developed:{levels:[3,2,2,3,0],amulets:['amulet_forest','amulet_focus'],amuletLevels:{amulet_forest:1,amulet_focus:1},branches:{ice:'shard',telekinesis:'lord'}},
 specialist:{levels:[5,5,5,5,5],amulets:['amulet_embers','amulet_astral_eye'],amuletLevels:{amulet_embers:5,amulet_astral_eye:5},branches:{ice:'shard',telekinesis:'lord',fire:'arsonist',seal:'seer',storm:'field'}},
 specialist_mana:{levels:[5,5,5,5,5],amulets:['amulet_embers','amulet_lunar'],amuletLevels:{amulet_embers:5,amulet_lunar:5},branches:{ice:'shard',telekinesis:'lord',fire:'arsonist',seal:'seer',storm:'field'}},
};
export const PROFILE_IDS=Object.keys(profiles);
const zero=()=>.999999, eValue=(kind,id)=>{const r=R.sapphireDrops[kind]?.[id];return r?r.chance*r.amount:0;};
let grid;const lengths=new Map();
export function pathLength(from,to){
 const key=[from.x,from.y,to.x,to.y].map(Math.round).join(':');if(lengths.has(key))return lengths.get(key);
 if(!grid){const map=resolveMap({storage:null,useDraft:false}),terrain=buildTerrain({ROADS:map.roads,WATERS:map.waters});
 const skip=new Set([...ENEMY_SPAWNS.map(o=>o.id),'corrupted_roots','heavy_boulder','ancient_gate','frost_barrier','fq_water','lab_seal','final_ward']);
 const solids=collectSolids({colliders:map.colliders,props:PROPS,interactives:INTERACTIVES,enemies:ENEMY_SPAWNS,waterRects:terrain.waterRects,skip});grid=[buildNav({...WORLD,solids}),buildNav({...WORLD,solids,pad:0})];}
 let d=0,p=from;
 // Long city legs can exhaust the navigator's per-search node budget. Continue from
 // the reachable endpoint, exactly as repeated movement requests; never teleport.
 for(let attempt=0;attempt<12;attempt++){
  const r=findPath(grid,p,to);assert.ok(r,`unreachable ${to.id||key}`);const before={...p};
  for(const n of r.points){d+=Math.hypot(n.x-p.x,n.y-p.y);p=n;}
  if(Math.hypot(p.x-to.x,p.y-to.y)<=Math.max(to.radius||100,130)){const result={seconds:d/PLAYER.speed,end:{...p}};lengths.set(key,result);return result;}
  assert.ok(Math.hypot(p.x-before.x,p.y-before.y)>1,`unreachable ${to.id||key} from ${from.x},${from.y}`);
 }
 throw new Error(`navigation budget exceeded ${to.id||key}`);
}
export function simulate({profile='prepared',capacity=100,potion='medium',policy='economy',cycles=2,capital=20000,gatherSeconds=1200,expeditionSeconds=3600,balanceVersion=COMBAT_BALANCE_VERSION, checkpoint=null, random=zero, reserve={}, stocks=null, regions=['frostwood','graveyard'], slotPicker=null, clock=null, bossFirst=false, claimCaches=false, autoExpand=false, returnCheckpoint=false}={}){
 const p=profiles[profile];assert.ok(p,'profile');let s=emptySnapshot(),now=2e12,position={x:merchant.x,y:merchant.y};
 const life=`potion_life_${potion}`,mana=`potion_mana_${potion}`,target=stocks||{[life]:6,[mana]:6,warm_potion:4,potion_crystal_shield:4};
 s.level=15;s.xp=7900;s.hp=255;s.mana=205;s.vitalsAt=now;s.pos={...position};s.wallet.sapphires=0;
 s.quests=[...Object.keys(R.events),'regen_potions_learned'];s.enemies=[...ENEMY_SPAWNS.filter(o=>!o.repeatSec).map(o=>o.id)];
 const ids=['telekinesis','fire','seal','ice','storm'];s.abilities=Object.fromEntries(ids.map((id,i)=>[id,{level:p.levels[i],unlocked:p.levels[i]>0}]));
 s.inventory={...target,coins:capital,...Object.fromEntries(p.amulets.map(id=>[id,1]))};s.objects.player_build={amulets:p.amulets,amuletLevels:p.amuletLevels,branches:p.branches,slots:['telekinesis','fire','ice'],potions:Object.keys(target)};s.objects.player_bag={capacity,pending:{},version:29};
 if(checkpoint){s=structuredClone(checkpoint.snapshot);now=checkpoint.now;position={...s.pos};assert.equal(s.level,15,'poststory continuation');}
 const starting={inventory:{...s.inventory},school:{...s.school},sapphires:s.wallet.sapphires};
 const advance=(seconds,kind)=>{const next=clock?clock.advance(now,seconds,kind):now+seconds*1000;assert.ok(next>=now+seconds*1000-.001,'clock monotonic');now=next;};
 let metrics;const rows=[];
 const tick=(seconds,kind='wait')=>{if(!(seconds>0))return;advance(seconds,kind);advanceVitals(s,now);metrics.time[kind]=(metrics.time[kind]||0)+seconds;};
 function act(op,args={}){const r=applyAction(s,{op,...args},now,random);s=r.snapshot;return r.result;}
 if(checkpoint&&stocks)assert.ok(act('potion_loadout',{potions:Object.keys(target)}).ok);
 function walk(to){const d=pathLength(position,to);tick(d.seconds,'walk');position={...d.end};s.pos={...position};}
 function go(to){let a=locationAt(position.x,position.y),b=locationAt(to.x,to.y);
  if(a.id!==b.id){
   if(a.room){const exit=nodes.get('room_exit_'+a.id);assert.ok(exit,`room exit ${a.id}`);walk(exit);tick(5,'transition');position={...exit.target};a=locationAt(position.x,position.y);}
   if(a.id!==b.id){if(b.room)throw new Error('Full-cycle model expects an outdoor cauldron');walk(nodes.get(a.exit));tick(5,'transition');position={...b.arrival};s.pos={...position};}
  }walk(to);
 }
 function collect(o){go(o);if(o.kind==='gather'&&s.mana<4)tick((4-s.mana)/.5+.001);const r=act('world',{obj:o.id});if(r.ok){metrics.expectedSapphires+=eValue('world',o.id);metrics.gathers++;tick(1,'gather');}return r;}
 function ensureSpace(n){while(autoExpand&&capacity-bagUsed(s.inventory)<n){const r=act('bag_expand');assert.ok(r.ok,`expand bag: ${r.reason}`);capacity=bagData(s.objects).capacity;metrics.bagSapphiresSpent+=r.price;tick(3,'bag');}}
 function service(){go(merchant);
  const retained=typeof reserve==='function'?reserve(s):reserve;const needs={};for(const[id,n]of Object.entries(target)){const qty=Math.max(0,n-(s.inventory[id]||0));for(const[k,v]of Object.entries(R.recipes[id].needs))if(k!=='coins')needs[k]=(needs[k]||0)+v*qty;}
  const sell=()=>{for(const[k,price]of Object.entries(R.shop.sell)){const n=Math.max(0,(s.inventory[k]||0)-(needs[k]||0)-(retained[k]||0));if(n){const r=act('shop_sell',{item:k,qty:n});assert.ok(r.ok);metrics.sales+=r.gain??price*n;tick(3,'trade');}}};sell();
  for(let pass=0;pass<2;pass++){for(const[k,n]of Object.entries(bagData(s.objects).pending)){ensureSpace(n);if(n<=capacity-bagUsed(s.inventory)){const r=act('bag_claim',{item:k,qty:n});assert.ok(r.ok);}}sell();}
  for(const[k,n]of Object.entries(needs)){const owned=s.inventory[k]||0,missing=Math.max(0,n+Math.min(retained[k]||0,owned)-owned);if(missing){ensureSpace(missing);const r=act('shop_buy',{item:k,qty:missing});assert.ok(r.ok,`refill ${k}: ${r.reason}`);metrics.purchases+=r.cost;tick(3,'trade');}}
  const missing=Object.entries(target).filter(([id,n])=>(s.inventory[id]||0)<n);
  if(missing.length){go(nodes.get('fq_cauldron'));for(const[id,n]of missing)while((s.inventory[id]||0)<n){const r=act('craft',{recipe:id});assert.ok(r.ok,`craft ${id}: ${r.reason}`);metrics.fees+=R.recipes[id].needs.coins||0;metrics.crafts++;tick(2,'craft');}go(merchant);}
  {const mv=maxVitals(s.level);if(s.hp<mv.hp)tick(mv.hp-s.hp+.001);if(s.mana<mv.mana)tick((mv.mana-s.mana)/.5+.001);}
 }
 function fight(o){
  if((s.inventory[life]||0)<1||(policy==='drink'&&(s.inventory[mana]||0)<1))service();go(o);
  const want=policy==='wait'?205:policy==='economy'?130:35;if(s.mana<want)tick((want-s.mana)/.5);
  const region=locationAt(o.x,o.y).id;const slots=slotPicker?slotPicker(s,region):profile.startsWith('specialist')?(region==='graveyard'?['telekinesis','seal','storm']:['telekinesis','fire','storm']):['telekinesis','ice',region==='graveyard'?'seal':'fire'];
  assert.ok(act('build_set',{slots}).ok);const start=act('combat_start',{spawn:o.id,enemy:o.enemy,balanceVersion});assert.ok(start.ok);
  const driver=(cm,input)=>{const e=cm.enemy,ready=id=>cm.abilityState(id).state==='ready',isBoss=['frost_alpha','barrow_warden'].includes(o.enemy);
   if((cm.heroChill.left>0&&!cm.chillResist)&&(isBoss||policy==='drink'))input('p','warm_potion');
   if(isBoss&&cm.hero.hp<cm.hero.maxHp*.8)input('p','potion_crystal_shield');
   if(cm.hero.hp<cm.hero.maxHp*.55)input('p',life);
   if(policy!=='wait'&&cm.hero.mana<(policy==='drink'?cm.hero.maxMana-100:18)&&cm.potionUses.restore<2)input('p',mana);
   const heavy=cm.fieldObjects.find(f=>f.available&&f.def.weight==='heavy'&&cm.canLift(f)),light=cm.fieldObjects.find(f=>f.available&&f.def.throwable&&cm.canLift(f)),crystal=cm.fieldObjects.find(f=>f.available&&f.def.breaksArmor);
   const cast=(id,obj)=>{if(obj)input('s',obj.id);return input('a',id)};
   if(e.isPreparing&&ready('telekinesis')){const heavyNeeded=e.tactic?.channel?e.tactic.interruptBy.includes('telekinesis_heavy'):e.def.strongAttack?.interruptBy.includes('telekinesis_heavy')&&!e.def.strongAttack?.interruptBy.includes('telekinesis');if(!heavyNeeded||heavy){cast('telekinesis',heavyNeeded?heavy:light);return;}}
   const soon=e.def.strongAttack&&e.strongCd<2.5;
   if(crystal&&e.armorActive&&ready('telekinesis')&&!soon){cast('telekinesis',crystal);return;}
   if(ready('storm')&&cm.stormCharges===3){cast('storm');return;}
   if(ready('ice')&&(!e.isBrittle||policy==='drink')){cast('ice');return;}
   if(ready('fire')&&(!e.burning||policy==='drink'||s.abilities.fire.level>=4)){cast('fire');return;}
   if(ready('seal')&&!soon){cast('seal');return;}
   if(ready('telekinesis')&&(!soon||cm.chain)){cast('telekinesis',heavy||light);return;}
  };
  const played=playBot(s.combatCtx,{driver,maxTicks:60*600});assert.ok(played.cm.result,`fight did not terminate ${o.id}`);
  const duration=played.log.ticks/60;advance(duration,'combat');metrics.time.combat=(metrics.time.combat||0)+duration;
  const v=verifyCombat(s,played.log,now+1);assert.ok(v.ok,`verify ${o.id}: ${v.reason}`);const coins=s.inventory.coins||0;
  s=combatApply(s,v.verdict,now,random).snapshot;metrics.combatCoins+=(s.inventory.coins||0)-coins;metrics.fights++;if(played.cm.result!=='victory')metrics.defeats++;
  if(played.cm.result==='victory')metrics.expectedSapphires+=eValue('combat',o.id);
 }
 for(let cycle=0;cycle<cycles;cycle++){
  const from=now,coins=s.inventory.coins;metrics={time:{},expectedSapphires:0,gathers:0,fights:0,defeats:0,crafts:0,sales:0,purchases:0,fees:0,combatCoins:0,bagSapphiresSpent:0};
  if(gatherSeconds>0)go(locationById('forest').arrival);const gatherEnd=now+gatherSeconds*1000;
  const forest=INTERACTIVES.filter(o=>o.kind==='gather'&&locationAt(o.x,o.y).id==='forest');let guard=0;
  while(now<gatherEnd&&bagUsed(s.inventory)<capacity&&guard++<2000){const ready=forest.filter(o=>!s.objects[o.id]||now>=s.objects[o.id].t+o.respawnSec*1000).sort((a,b)=>Math.hypot(a.x-position.x,a.y-position.y)-Math.hypot(b.x-position.x,b.y-position.y));if(!ready.length){tick(Math.min(30,(gatherEnd-now)/1000));continue;}collect(ready[0]);}
  service();const end=now+expeditionSeconds*1000;let loops=0;
  while(now<end&&loops++<100){let did=false;
   for(const region of regions){
    const route=ENEMY_SPAWNS.filter(o=>locationAt(o.x,o.y).id===region&&o.repeatSec);if(bossFirst)route.sort((a,b)=>(['frost_alpha','barrow_warden'].includes(b.enemy)?1:0)-(['frost_alpha','barrow_warden'].includes(a.enemy)?1:0));
    for(const o of route){if(now>=end)break;const rep=s.objects['rep:'+o.id];if(rep&&now<rep.at+o.repeatSec*1000)continue;fight(o);did=true;if(claimCaches)for(const cache of INTERACTIVES.filter(c=>c.kind==='stash'&&c.guard===o.id)){const wins=s.objects['rep:'+o.id]?.wins||0;if(wins>(s.objects[cache.id]?.claimed||0)){const r=collect(cache);assert.ok(r.ok,`cache ${cache.id}: ${r.reason}`);}}}
    for(const o of INTERACTIVES.filter(o=>locationAt(o.x,o.y).id===region&&['gather','stash'].includes(o.kind))){if(now>=end||bagUsed(s.inventory)>=capacity)break;const st=s.objects[o.id];if(o.kind==='gather'&&st&&now<st.t+o.respawnSec*1000)continue;if(o.kind==='stash'){const wins=s.objects['rep:'+o.guard]?.wins||0;if(wins<=(st?.claimed||0))continue;}const r=collect(o);if(!r.ok&&r.reason!=='bag_full')assert.fail(`collect ${o.id}: ${r.reason}`);if(r.ok)did=true;}
   }
   if(!did)tick(Math.min(60,(end-now)/1000));if(bagUsed(s.inventory)>capacity-10)service();
  }
  service();const elapsedSeconds=(now-from)/1000,seconds=Object.values(metrics.time).reduce((a,b)=>a+b,0),net=s.inventory.coins-coins;
  assert.ok(Math.abs(net-(metrics.combatCoins+metrics.sales-metrics.purchases-metrics.fees))<1e-6,'currency conservation');assert.ok(Math.abs(clock?Math.max(0,seconds-elapsedSeconds):seconds-elapsedSeconds)<1e-4,'time conservation');
  for(const[id,n]of Object.entries(target))assert.equal(s.inventory[id],n,'closed potion stock '+id);assert.equal(s.hp,maxVitals(s.level).hp);assert.equal(s.mana,maxVitals(s.level).mana);assert.equal(Object.keys(bagData(s.objects).pending).length,0);assert.ok(bagUsed(s.inventory)<=capacity);
  rows.push({cycle:cycle+1,seconds,elapsedSeconds,netCoins:net,coinsPerHour:net*3600/seconds,sapphiresPerHour:metrics.expectedSapphires*3600/seconds,...metrics,bagUsed:bagUsed(s.inventory),rare:{crafting_core:s.inventory.crafting_core||0,frost_shard:s.inventory.frost_shard||0},capital:s.inventory.coins});
 }
 const delta=key=>Object.fromEntries([...new Set([...Object.keys(s[key]),...Object.keys(starting[key])])].map(id=>[id,(s[key][id]||0)-(starting[key][id]||0)]).filter(([,n])=>n));
 return {profile,capacity,potion,policy,...(checkpoint||returnCheckpoint?{checkpoint:{snapshot:s,now}}:{}),deltas:{inventory:delta('inventory'),school:delta('school'),sapphires:s.wallet.sapphires-starting.sapphires},assumptions:{balanceVersion,transition:5,trade:3,craft:2,gather:1,walkSpeed:PLAYER.speed,gatherSeconds,expeditionSeconds,initialAnalyticalCapital:checkpoint?null:capital,seededStocks:!checkpoint,startingCoins:starting.inventory.coins},cycles:rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const all=process.argv.includes('--all'),results=[];const versionArg=process.argv.find(s=>s.startsWith('--balance-version='));const balanceVersion=versionArg?Number(versionArg.split('=')[1]):COMBAT_BALANCE_VERSION;assert.ok([38,39,40].includes(balanceVersion),'supported analysis version');for(const profile of all?PROFILE_IDS:['prepared'])for(const capacity of all?[100,150]:[100])for(const potion of all?['medium','regen']:['medium'])for(const policy of all?['wait','economy','drink']:['economy']){const r=simulate({profile,capacity,potion,policy,balanceVersion});const {checkpoint,...report}=r;results.push(report);console.error(profile,capacity,potion,policy,r.cycles.at(-1).coinsPerHour.toFixed(1));}console.log(JSON.stringify(results,null,2));}
