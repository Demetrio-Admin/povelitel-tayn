// Actual poststory snapshots/actions/combat. Calendar figures are simulated scenarios,
// not observed player cohorts or a promise of a particular random drop date.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { storyPass } from './story-pass.mjs';
import { simulate } from './full-cycle.mjs';
import { seededRandom, gatherRoute } from './boris-route.mjs';
import { applyAction } from '../../src/cloud/playerModel.js';
import { serverRules } from '../../src/config/serverRules.js';
import { INTERACTIVES } from '../../src/config/world.layout.js';
import { bagData, bagUsed } from '../../src/config/bag.js';
import { progressGate } from '../../src/config/build.js';

const R=serverRules(),merchant=INTERACTIVES.find(o=>o.id==='npc_merchant');
export const PROGRESSION_PLANS={
 telekinesis:['telekinesis_3_lord','telekinesis_4_lord','telekinesis_5_lord'],
 ice:['ice_4_shard','ice_5_shard'],
 fire:['fire_2','fire_3_arsonist','fire_4_arsonist','fire_5_arsonist'],
 seal:['seal_2','seal_3_seer','seal_4_seer','seal_5_seer'],
 storm:['storm_1','storm_2','storm_3_field','storm_4_field','storm_5_field'],
};
export class SessionClock {
 constructor(start,minutes){assert.ok(Number.isFinite(start)&&Number.isFinite(minutes)&&minutes>0&&minutes<=1440);this.start=start;this.budget=minutes*60;this.active=0;this.day=0;this.used=0;this.offline=0;this.combatOverrun=0;}
 advance(now,seconds,kind){
  assert.ok(Number.isFinite(seconds)&&seconds>=0);
  if(kind==='combat'){this.active+=seconds;this.used+=seconds;this.combatOverrun=Math.max(this.combatOverrun,this.used-this.budget);return now+seconds*1000;}
  let left=seconds;
  while(left>1e-9){
   if(this.used>=this.budget-1e-9){const next=this.start+(this.day+1)*86400000;const pause=Math.max(0,next-now);this.offline+=pause/1000;now+=pause;this.day++;this.used=0;}
   const take=Math.min(left,this.budget-this.used);now+=take*1000;left-=take;this.used+=take;this.active+=take;
  }
  return now;
 }
}
export function materialReserve(snapshot,plan){
 const next=plan.find(id=>(snapshot.abilities[R.research[id].ability]?.level||0)<R.research[id].toLevel&&snapshot.research?.upgradeId!==id);
 return next?Object.fromEntries(Object.entries(R.research[next].items).filter(([k])=>k!=='coins')):{};
}
export function researchDeficits(snapshot,id){
 const r=R.research[id];assert.ok(r,'unknown upgrade');
 return {coins:Math.max(0,r.items.coins-(snapshot.inventory.coins||0)),sapphires:Math.max(0,r.sapphires-snapshot.wallet.sapphires),schoolXP:Math.max(0,r.schoolXP-(snapshot.school[r.ability]||0)),items:Object.fromEntries(Object.entries(r.items).filter(([k,n])=>k!=='coins'&&(snapshot.inventory[k]||0)<n).map(([k,n])=>[k,n-(snapshot.inventory[k]||0)])),progressGate:!!r.progressTier&&!progressGate(snapshot.enemies,r.progressTier)};
}
export async function progressionPath({plan='ice',minutes=60,seed=1,maxActiveHours=400,maxCycles=3000,initialSnapshot=null,logProgress=false}={}){
 assert.ok(PROGRESSION_PLANS[plan]);const upgrades=PROGRESSION_PLANS[plan],snapshot=structuredClone(initialSnapshot||(await storyPass()).snapshot);
 assert.equal(snapshot.level,15);assert.ok(snapshot.quests.includes('chapter_2_complete'));
 // Origin is a stated poststory boundary at Boris. Story traversal time is outside this stage.
 snapshot.pos={x:merchant.x,y:merchant.y};let checkpoint={snapshot,now:snapshot.vitalsAt};
 const origin=checkpoint.now,initial={coins:snapshot.inventory.coins,sapphires:snapshot.wallet.sapphires,inventory:{...snapshot.inventory},school:{...snapshot.school},abilities:structuredClone(snapshot.abilities)};
 const clock=new SessionClock(origin,minutes),random=seededRandom(seed),milestones=[],starts=[],rows=[],bagPurchases=[];let status='budget',failure=null,bagRecovery=false,recoveryCount=0;
 function action(op,args={}){const r=applyAction(checkpoint.snapshot,{op,...args},checkpoint.now,random);checkpoint.snapshot=r.snapshot;return r.result;}
 function research(){
  if(checkpoint.snapshot.research){const result=action('research_finish');if(result.ok){const id=result.upgrade;milestones.push({id,activeHours:clock.active/3600,elapsedDays:(checkpoint.now-origin)/86400000,coins:checkpoint.snapshot.inventory.coins,sapphires:checkpoint.snapshot.wallet.sapphires,schoolXP:checkpoint.snapshot.school[R.research[id].ability],gateV:progressGate(checkpoint.snapshot.enemies,5)});}else assert.equal(result.reason,'wait');}
  if(!checkpoint.snapshot.research){const next=upgrades.find(id=>(checkpoint.snapshot.abilities[R.research[id].ability]?.level||0)<R.research[id].toLevel);if(!next){status='complete';return;}
   const before=structuredClone(checkpoint.snapshot),result=action('research_start',{upgrade:next});
   if(result.ok){const r=R.research[next];assert.equal(before.wallet.sapphires-checkpoint.snapshot.wallet.sapphires,r.sapphires);assert.equal(before.school[r.ability]-checkpoint.snapshot.school[r.ability],r.schoolXP);starts.push({id:next,activeHours:clock.active/3600,elapsedDays:(checkpoint.now-origin)/86400000,durationHours:r.durationMs/3600000,cost:{coins:r.items.coins,sapphires:r.sapphires,schoolXP:r.schoolXP,items:Object.fromEntries(Object.entries(r.items).filter(([k])=>k!=='coins'))}});}
   else assert.ok(['missing','sapphires','event'].includes(result.reason),JSON.stringify(result));
  }
 }
 function slots(s,region){const school=plan==='storm'?(s.abilities.storm.level>0?'storm':region==='graveyard'?'seal':'fire'):plan;const base=region==='graveyard'?['telekinesis','seal','ice']:['telekinesis','fire','ice'];if(!base.includes(school))base[2]=school;return base;}
 for(let cycle=0;cycle<maxCycles&&clock.active<maxActiveHours*3600;cycle++){
  research();if(status==='complete')break;
  // Accumulating unsellable boss materials uses actual bag space. Expansions are paid.
  const bag=bagData(checkpoint.snapshot.objects);if(bagUsed(checkpoint.snapshot.inventory)>bag.capacity-20&&checkpoint.snapshot.wallet.sapphires>=300){const r=action('bag_expand');assert.ok(r.ok,JSON.stringify(r));bagPurchases.push({activeHours:clock.active/3600,sapphires:300,capacity:bagData(checkpoint.snapshot.objects).capacity});}
  if(bagRecovery&&checkpoint.snapshot.wallet.sapphires>=300)bagRecovery=false;
  const savedClock={...clock},savedRandom=random.state();
  try{
   const next=upgrades.find(id=>(checkpoint.snapshot.abilities[R.research[id].ability]?.level||0)<R.research[id].toLevel&&checkpoint.snapshot.research?.upgradeId!==id);
   const needsCoal=next&&R.research[next].items.crimson_ember>(checkpoint.snapshot.inventory.crimson_ember||0);
   const minimumCoins=Math.max(1000,(R.research[next]?.items.coins||0)+300);
   if(bagRecovery||checkpoint.snapshot.inventory.coins<minimumCoins){
    const gathered=gatherRoute({checkpoint,cycles:1,seconds:600,route:'all',policy:'nearest',random,clock,reserve:s=>materialReserve(s,upgrades)});
    checkpoint=gathered.checkpoint;const r=gathered.cycles[0];rows.push({kind:'gather',...r,deltas:gathered.deltas,sales:r.netCoins,purchases:0,fees:0,combatCoins:0,fights:0,defeats:0});
   }else{
    const result=simulate({checkpoint,cycles:1,capacity:bagData(checkpoint.snapshot.objects).capacity,random,reserve:s=>materialReserve(s,upgrades),stocks:{potion_life_medium:2,potion_mana_medium:1,warm_potion:1,potion_crystal_shield:1},gatherSeconds:0,expeditionSeconds:600,regions:needsCoal?['forest','frostwood','graveyard']:(cycle%2?['graveyard','frostwood']:['frostwood','graveyard']),slotPicker:slots,clock,bossFirst:true,claimCaches:true,autoExpand:true});
   checkpoint=result.checkpoint;rows.push({...result.cycles[0],deltas:result.deltas,levels:Object.fromEntries(Object.entries(checkpoint.snapshot.abilities).map(([id,a])=>[id,a.level]))});
   }
  }catch(e){
   Object.assign(clock,savedClock);random.restore(savedRandom);
   // Insufficient room for temporary brewing ingredients is recoverable: gather
   // without consuming supplies until an actual 300-sapphire expansion is affordable.
   if(e.message==='expand bag: sapphires'){bagRecovery=true;recoveryCount++;continue;}
   status='blocked';failure=e.message;break;
  }
  if(logProgress&&cycle%25===0)console.error(plan,minutes,seed,cycle,clock.active/3600,milestones.at(-1)?.id||'-');
 }
 if(status!=='blocked')research();if(status!=='complete'&&status!=='blocked')status='budget';
 const next=upgrades.find(id=>(checkpoint.snapshot.abilities[R.research[id].ability]?.level||0)<R.research[id].toLevel);
 const totals={activeHours:clock.active/3600,elapsedDays:(checkpoint.now-origin)/86400000,offlineHours:clock.offline/3600,combatOverrunSeconds:Math.max(0,clock.combatOverrun),fights:rows.reduce((n,r)=>n+r.fights,0),defeats:rows.reduce((n,r)=>n+r.defeats,0),sales:rows.reduce((n,r)=>n+r.sales,0),purchases:rows.reduce((n,r)=>n+r.purchases,0),craftFees:rows.reduce((n,r)=>n+r.fees,0),combatCoins:rows.reduce((n,r)=>n+r.combatCoins,0),bagRecoveryCount:recoveryCount,bagSapphiresSpent:bagPurchases.length*300+rows.reduce((n,r)=>n+(r.bagSapphiresSpent||0),0)};
 const final={coins:checkpoint.snapshot.inventory.coins,sapphires:checkpoint.snapshot.wallet.sapphires,inventory:checkpoint.snapshot.inventory,school:checkpoint.snapshot.school,bag:bagData(checkpoint.snapshot.objects),abilities:checkpoint.snapshot.abilities};
 assert.equal(final.coins,initial.coins+totals.sales+totals.combatCoins-totals.purchases-totals.craftFees-starts.reduce((n,r)=>n+r.cost.coins,0),'full path coin conservation');
 for(const key of ['inventory','school'])for(const id of new Set([...Object.keys(initial[key]),...Object.keys(final[key])])){
  const earned=rows.reduce((n,r)=>n+(r.deltas?.[key]?.[id]||0),0);
  const spent=starts.reduce((n,r)=>n+(key==='school'?(R.research[r.id].ability===id?r.cost.schoolXP:0):(id==='coins'?r.cost.coins:(r.cost.items[id]||0))),0);
  assert.equal(final[key][id]||0,(initial[key][id]||0)+earned-spent,`${key} conservation ${id}`);
 }
 assert.equal(final.sapphires,initial.sapphires+rows.reduce((n,r)=>n+r.deltas.sapphires+(r.bagSapphiresSpent||0),0)-starts.reduce((n,r)=>n+r.cost.sapphires,0)-totals.bagSapphiresSpent,'sapphire conservation');
 return {plan,minutesPerDay:minutes,seed,status,failure,initial,totals,starts,milestones,bagPurchases,final,remaining:next?(checkpoint.snapshot.research?.upgradeId===next?{id:next,studying:true,secondsLeft:Math.max(0,(checkpoint.snapshot.research.startedAt+checkpoint.snapshot.research.durationMs-checkpoint.now)/1000)}:{id:next,studying:false,...researchDeficits(checkpoint.snapshot,next)}):null,cycles:rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const plan=process.argv.find(x=>x.startsWith('--plan='))?.split('=')[1]||'ice';console.log(JSON.stringify(await progressionPath({plan,logProgress:true}),null,2));}
