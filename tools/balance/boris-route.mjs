// Reproducible search over a declared family of gathering policies, not a global optimum proof.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { emptySnapshot, applyAction, advanceVitals } from '../../src/cloud/playerModel.js';
import { INTERACTIVES } from '../../src/config/world.layout.js';
import { locationAt, locationById } from '../../src/config/locations.js';
import { bagUsed, bagData } from '../../src/config/bag.js';
import { serverRules } from '../../src/config/serverRules.js';
import { pathLength } from './full-cycle.mjs';

const R=serverRules(), nodes=new Map(INTERACTIVES.map(o=>[o.id,o])), merchant=nodes.get('npc_merchant');
export const ROUTE_REGIONS={forest:['forest'],city:['city'],forestCity:['forest','city'],frostwood:['frostwood'],graveyard:['graveyard'],expeditions:['frostwood','graveyard'],all:['forest','city','frostwood','graveyard']};
export const ROUTE_POLICIES=['nearest','value','valueRespawn'];
export function seededRandom(seed=1){
 let n=seed>>>0;const random=()=>{n=(n+0x6D2B79F5)>>>0;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
 random.state=()=>n;random.restore=value=>{n=value>>>0;};return random;
}
export function gatherRoute({route='forestCity',policy='value',capacity=100,tracker=-1,seed=1,cycles=3,seconds=3600,threshold=.85,checkpoint=null,reserve={},random=seededRandom(seed),clock=null}={}){
 assert.ok(ROUTE_REGIONS[route]&&ROUTE_POLICIES.includes(policy));assert.ok(Number.isInteger(capacity)&&capacity>=100&&capacity%50===0);assert.ok([-1,0,5].includes(tracker));assert.ok(Number.isFinite(seconds)&&seconds>0&&Number.isInteger(cycles)&&cycles>0);assert.ok(threshold>0&&threshold<=1);
 let s=emptySnapshot(),now=2e12,position={x:merchant.x,y:merchant.y};
 s.level=15;s.hp=255;s.mana=205;s.vitalsAt=now;s.pos={...position};s.quests=Object.keys(R.events);s.enemies=['fq_guardian','final_severin','node_trial'];
 s.inventory={coins:0,...(tracker>=0?{amulet_tracker:1}:{})};s.objects.player_bag={capacity,pending:{},version:29};s.objects.player_build={amulets:tracker>=0?['amulet_tracker']:[],amuletLevels:{amulet_tracker:Math.max(0,tracker)}};
 if(checkpoint){s=structuredClone(checkpoint.snapshot);now=checkpoint.now;position={...s.pos};capacity=bagData(s.objects).capacity;}
 const initial={inventory:{...s.inventory},school:{...s.school},sapphires:s.wallet.sapphires};const startInventory={...s.inventory}, candidates=INTERACTIVES.filter(o=>o.kind==='gather'&&R.shop.sell[o.res]&&ROUTE_REGIONS[route].includes(locationAt(o.x,o.y).id));
 let sellAt=Math.min(capacity,Math.max(capacity*threshold,bagUsed(s.inventory)+10));
 const rows=[];let time={},gathers={},visits=[];
 function tick(sec,kind){if(sec<=0)return;now=clock?clock.advance(now,sec,kind):now+sec*1000;advanceVitals(s,now);time[kind]=(time[kind]||0)+sec;}
 function walk(to){const p=pathLength(position,to);tick(p.seconds,'walk');position={...p.end};s.pos={...position};}
 function travelCost(to){const a=locationAt(position.x,position.y),b=locationAt(to.x,to.y);return a.id===b.id?pathLength(position,to).seconds:pathLength(position,nodes.get(a.exit)).seconds+5+pathLength(b.arrival,to).seconds;}
 function go(to){const a=locationAt(position.x,position.y),b=locationAt(to.x,to.y);if(a.id!==b.id){walk(nodes.get(a.exit));tick(5,'transition');position={...b.arrival};s.pos={...position};}walk(to);}
 function act(op,args){const r=applyAction(s,{op,...args},now,random);s=r.snapshot;assert.ok(r.result.ok,`${op}: ${JSON.stringify(r.result)}`);return r.result;}
 function sell(){go(merchant);const retained=typeof reserve==='function'?reserve(s):reserve;for(const [item,price] of Object.entries(R.shop.sell)){const qty=Math.max(0,(s.inventory[item]||0)-(retained[item]||0));if(qty){const result=act('shop_sell',{item,qty});assert.equal(result.gain,price*qty);tick(3,'trade');}}assert.equal(Object.keys(bagData(s.objects).pending).length,0);}
 for(let cycle=1;cycle<=cycles;cycle++){
  const from=now,coins=s.inventory.coins,sapphires=s.wallet.sapphires;time={};gathers={};visits=[];const end=now+seconds*1000;
  while(now<end){
   if(bagUsed(s.inventory)>=sellAt){const before=bagUsed(s.inventory);sell();if(bagUsed(s.inventory)>=before){assert.ok(before<capacity,'retained inventory fills gathering bag');sellAt=capacity;}else continue;}
   const rank=candidates.map(o=>{const travel=travelCost(o),ready=(s.objects[o.id]?.t??-Infinity)+o.respawnSec*1000,wait=Math.max(0,(ready-now)/1000-travel),cost=travel+wait+1;
    const score=policy==='nearest'?1/cost:policy==='value'?R.shop.sell[o.res]/cost:R.shop.sell[o.res]/(cost+o.respawnSec*.025);
    return{o,score,wait};}).sort((a,b)=>b.score-a.score||a.o.id.localeCompare(b.o.id));
   const {o}=rank[0];go(o);const ready=(s.objects[o.id]?.t??-Infinity)+o.respawnSec*1000;tick(Math.max(0,(ready-now)/1000),'respawn');
   if(now>=end)break;if(s.mana<4)tick((4-s.mana)/.5+.001,'mana');
   act('world',{obj:o.id});gathers[o.id]=(gathers[o.id]||0)+1;if(!visits.includes(o.id))visits.push(o.id);tick(1,'gather');
  }
  sell();if(s.mana<205)tick((205-s.mana)/.5+.001,'mana');
  const duration=(now-from)/1000,netCoins=s.inventory.coins-coins;
  const activeSeconds=Object.values(time).reduce((a,b)=>a+b,0);assert.ok(clock?duration+1e-4>=activeSeconds:Math.abs(duration-activeSeconds)<1e-4,'time conserved');
  for(const [id,n]of Object.entries(s.inventory))if(id!=='coins'&&!checkpoint)assert.equal(n,startInventory[id]||0,'closed stock '+id);
  assert.equal(s.hp,255);assert.equal(s.mana,205);assert.ok(bagUsed(s.inventory)<=capacity);
  rows.push({cycle,seconds:activeSeconds,elapsedSeconds:duration,netCoins,coinsPerHour:netCoins*3600/activeSeconds,sapphires:s.wallet.sapphires-sapphires,time,gathers,firstVisits:visits});
 }
 const delta=key=>Object.fromEntries([...new Set([...Object.keys(s[key]),...Object.keys(initial[key])])].map(id=>[id,(s[key][id]||0)-(initial[key][id]||0)]).filter(([,n])=>n));
 return {route,policy,capacity,tracker,seed,threshold,cycles:rows,...(checkpoint?{checkpoint:{snapshot:s,now},deltas:{inventory:delta('inventory'),school:delta('school'),sapphires:s.wallet.sapphires-initial.sapphires}}:{})};
}
export function searchRoutes({seconds=3600,cycles=3}={}){
 const results=[];for(const route of Object.keys(ROUTE_REGIONS))for(const policy of ROUTE_POLICIES)for(const capacity of [100,150])for(const tracker of [-1,0,5])results.push(gatherRoute({route,policy,capacity,tracker,seconds,cycles}));
 const rate=r=>{const steady=r.cycles.slice(1);return steady.reduce((n,x)=>n+x.netCoins,0)*3600/steady.reduce((n,x)=>n+x.seconds,0);};
 return {assumptions:{secondsPerCycle:seconds,cycles,walkSpeed:230,transitionSec:5,tradeSecPerItemType:3,gatherSec:1,manaPerGather:4,worldManaRegen:.5,prices:'serverRules().shop.sell',tracker:'already owned and equipped; acquisition cost excluded',scope:'poststory open gates; no fighting, aggro/contact or human delay model; only this finite policy family'},tested:results.length,results:results.map(r=>({...r,steadyCoinsPerHour:rate(r)})).sort((a,b)=>b.steadyCoinsPerHour-a.steadyCoinsPerHour)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(searchRoutes(),null,2));
