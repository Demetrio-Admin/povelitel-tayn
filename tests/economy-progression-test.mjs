import assert from 'node:assert/strict';
import { gatherRoute, seededRandom } from '../tools/balance/boris-route.mjs';
import { SessionClock, materialReserve, researchDeficits, progressionPath } from '../tools/balance/progression-path.mjs';
import { simulate, pathLength } from '../tools/balance/full-cycle.mjs';
import { storyPass } from '../tools/balance/story-pass.mjs';
import { serverRules } from '../src/config/serverRules.js';
import { INTERACTIVES } from '../src/config/world.layout.js';
const R=serverRules();let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(v,m)=>{assert.ok(v,m);checks++;};
const a=gatherRoute({seconds:600,cycles:2}),b=gatherRoute({seconds:600,cycles:2});eq(a,b,'seeded gathering is reproducible');
for(const c of a.cycles){ok(c.netCoins>0);ok(Math.abs(c.seconds-Object.values(c.time).reduce((n,v)=>n+v,0))<1e-4,'no omitted service time');ok(c.time.trade>0);ok(c.seconds>=600,'return/service is charged');}
const nodes=new Map(INTERACTIVES.map(o=>[o.id,o]));for(const id of new Set(a.cycles.flatMap(c=>Object.keys(c.gathers)))){const count=a.cycles.reduce((n,c)=>n+(c.gathers[id]||0),0);ok(count<=1+Math.floor(a.cycles.reduce((n,c)=>n+c.seconds,0)/nodes.get(id).respawnSec),'real respawn ceiling '+id);}
assert.throws(()=>gatherRoute({seconds:0}));checks++;assert.throws(()=>new SessionClock(0,0));checks++;
const clock=new SessionClock(0,30);let now=clock.advance(0,1790,'walk');now=clock.advance(now,30,'combat');eq(now,1820000,'combat never spans an offline break');eq(clock.combatOverrun,20);now=clock.advance(now,60,'trade');eq(now,86460000);eq(clock.active,1880);eq(clock.offline,84580);ok(Math.abs(now/1000-clock.active-clock.offline)<1e-6);
const crossing=new SessionClock(0,30);eq(crossing.advance(0,1810,'wait'),86410000);eq(crossing.active,1810);eq(crossing.offline,84600);
const route=pathLength({x:7500,y:1060},nodes.get('frostherb_r2'));ok(route.seconds>0);ok(Math.hypot(route.end.x-5985,route.end.y-4800)<=130,'long city path continues without teleporting');
const first=simulate({returnCheckpoint:true,capital:1500,cycles:1,gatherSeconds:120,expeditionSeconds:300});const saved=structuredClone(first.checkpoint);
const x=simulate({checkpoint:first.checkpoint,capital:0,cycles:1,gatherSeconds:120,expeditionSeconds:300}),y=simulate({checkpoint:first.checkpoint,capital:50000,cycles:1,gatherSeconds:120,expeditionSeconds:300});eq(x.checkpoint,y.checkpoint,'continuation gets no seeded money, equipment or stocks');eq(first.checkpoint,saved,'checkpoint not mutated');eq(x.assumptions.initialAnalyticalCapital,null);eq(x.assumptions.seededStocks,false);
const packed=structuredClone(first.checkpoint);for(const id of ['potion_life_medium','potion_mana_medium','warm_potion','potion_crystal_shield'])packed.snapshot.inventory[id]=0;
packed.snapshot.inventory.crafting_core=95;packed.snapshot.inventory.coins=10000;packed.snapshot.wallet.sapphires=1000;
const expanded=simulate({checkpoint:packed,cycles:1,gatherSeconds:0,expeditionSeconds:0,autoExpand:true});ok(expanded.cycles[0].bagSapphiresSpent>0,'temporary ingredient space is paid');eq(packed.snapshot.wallet.sapphires-expanded.checkpoint.snapshot.wallet.sapphires,expanded.cycles[0].bagSapphiresSpent);ok(expanded.checkpoint.snapshot.objects.player_bag.capacity>100);eq(expanded.checkpoint.snapshot.inventory.crafting_core,95,'cannot silently sell rare materials');
const {snapshot}=await storyPass(),original=structuredClone(snapshot);const plan=['ice_4_shard','ice_5_shard'];eq(materialReserve(snapshot,plan),{lunar_shard:6,rune_dust:4,ice_crystal:2});
const studying=structuredClone(snapshot);studying.research={upgradeId:'ice_4_shard'};eq(materialReserve(studying,plan),{lunar_shard:10,rune_dust:8,crafting_core:2},'paid materials not reserved twice');
const d=researchDeficits(snapshot,'ice_5_shard');eq(d.progressGate,true,'boss not seeded as defeated');ok(d.schoolXP>0,'school experience is a consumed budget');
for(const school of ['ice','storm']){
 const result=await progressionPath({initialSnapshot:snapshot,plan:school,minutes:30,maxActiveHours:1});eq(result.status,'budget','short path remains reachable, including locked Storm I');eq(result.initial.coins,920);eq(result.initial.school,snapshot.school);ok(result.totals.fights>0);ok(result.totals.offlineHours>0);eq(result.final.abilities.storm.level,0,'no free Storm');eq(result.milestones.length,0,'cannot bypass currency/timer');ok(result.final.bag.capacity>=100);ok(result.cycles.every(c=>c.deltas),'resource ledger for every cycle');
}
const crowded=structuredClone(snapshot);crowded.inventory={coins:2000,amulet_forest:1,crafting_core:127,frost_shard:100,lunar_shard:6,rune_dust:4,ice_crystal:2,potion_life_medium:2,potion_mana_medium:1,warm_potion:1,potion_crystal_shield:1};crowded.objects.player_bag={capacity:250,pending:{},version:29};crowded.wallet.sapphires=0;
const recovery=await progressionPath({initialSnapshot:crowded,plan:'ice',maxActiveHours:5});eq(recovery.status,'budget','bag shortage falls back to actual gathering');ok(recovery.totals.bagRecoveryCount>0,'exercise bag recovery instead of an unreachable result');ok(recovery.totals.activeHours>=5,'no uncharged retry loop');
eq(snapshot,original,'analysis never edits starting save');eq(R.recipes.potion_life_regen.needs.coins,25);eq(R.recipes.potion_mana_regen.needs.coins,30);for(const r of Object.values(R.recipes).filter(r=>r.kind==='potion'))eq(r.amount,1,'strictly one potion per craft');
const restored=seededRandom(5),savedRandom=restored.state(),draw=restored();restored.restore(savedRandom);eq(restored(),draw,'failed analytical attempt restores drop stream');
const rng1=seededRandom(7),rng2=seededRandom(7);eq(Array.from({length:20},()=>rng1()),Array.from({length:20},()=>rng2()));
console.log(`${checks} economy/progression checks passed: route closure/respawn, no seeded continuation capital, real poststory budgets, offline clock, locked schools and fixed craft prices.`);
