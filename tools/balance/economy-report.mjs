import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { searchRoutes, gatherRoute } from './boris-route.mjs';
import { progressionPath, PROGRESSION_PLANS } from './progression-path.mjs';
import { storyPass } from './story-pass.mjs';
import { COMBAT_BALANCE_VERSION } from '../../src/config/combatVersions.js';

export function summarizePath(result){
 const {cycles,...summary}=result,aggregates={};
 for(const row of cycles){const key=row.kind==='gather'?'gather':JSON.stringify(row.levels);const a=aggregates[key]||={cycles:0,seconds:0,netCoins:0,sapphires:0,fights:0,defeats:0};a.cycles++;a.seconds+=row.seconds;a.netCoins+=row.netCoins;a.sapphires+=row.deltas.sapphires;a.fights+=row.fights;a.defeats+=row.defeats;}
 return {...summary,cycleAggregates:aggregates};
}
export async function economyReport({seeds=[1,7],minutes=[30,60,120],plans=Object.keys(PROGRESSION_PLANS),pathResults=null}={}){
 const search=searchRoutes(), finalists=[];
 for(const capacity of [100,150])for(const tracker of [-1,0,5]){
  const best=search.results.find(r=>r.capacity===capacity&&r.tracker===tracker);
  for(const seed of [1,7,19,41]){
   const r=gatherRoute({...best,cycles:3,seed}),steady=r.cycles.slice(1);finalists.push({...r,steadyCoinsPerHour:steady.reduce((n,x)=>n+x.netCoins,0)*3600/steady.reduce((n,x)=>n+x.seconds,0)});
  }
 }
 const snapshot=pathResults?null:(await storyPass()).snapshot,paths=pathResults||[];
 if(!pathResults)for(const plan of plans)for(const daily of minutes)for(const seed of seeds){
  const result=await progressionPath({plan,minutes:daily,seed,initialSnapshot:snapshot});
  console.error(plan,daily,seed,result.status,result.totals.activeHours.toFixed(2),result.failure||'');
  paths.push(summarizePath(result));
 }
 return {balanceVersion:COMBAT_BALANCE_VERSION,assumptions:{origin:'After deterministic main-story pass, at Boris; main-story traversal time excluded; actual 920 coins and school XP retained; no side-quest/daily/coven/duel/payment income',dailyPlay:'30/60/120 active minutes per 24 h from model origin; a combat can finish past session boundary; movement/wait/craft/trade may span offline break; no offline income or school XP',research:'Real single queue, live timers; costs/XP consumed; finish/start checked at closed cycle boundaries (conservative polling delay)',strategy:'One target school to V; reserve only next unstarted research materials. Gather all/nearest for coins when below max(1000,next coin price+300). Otherwise alternate frostwood/graveyard first; bosses first, collect their cache immediately; add forest combats for missing embers. Ten-minute expedition windows plus actual service/return time.',supplies:'Life medium x2, mana medium x1, warm x1, crystal shield x1; four fixed slots, actual purchases and one-item crafts; final HP/MP and supplies restored after each expedition',equipment:'Actual main-story forest amulet +0, no free additional equipment; bags expand for 300 sapphires when nearly full or brewing needs temporary space; gather-only recovery if the expansion is not yet affordable; retained rare resources are not assumed sellable',random:'Fixed combat bot seed; independent seeded actual loot sequences. Two progression seeds and four finalist seeds are examples, not confidence intervals.',limits:'Not globally optimal routing or levelling; aggro/contact and human reaction delays excluded; not a new-player story duration estimate; amulet +5/all schools together not simulated; no economy config changes'},boris:{assumptions:search.assumptions,tested:search.tested,results:search.results.map(({cycles,...r})=>({...r,cycles:cycles.map(({gathers,firstVisits,...c})=>c)})),finalists},paths};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const output=process.argv.find(x=>x.startsWith('--output='))?.slice(9)||'docs/design/economy-progression-results-20261021.json';
 const report=await economyReport();writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.error(`Saved ${output}`);
}
