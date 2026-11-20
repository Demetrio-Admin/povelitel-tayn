import { CORE, ECONOMY, namedEncounter, baseBattleCoins, tideAt } from '../config/horizon/rules.js';
import { QUESTS, QUEST_BY_ID, PROLOGUE } from './quests.js';
import { award, dayAt, gearSpace, TIERS_41 } from './progression.js';
import { HORIZON_TABLES } from '../config/horizon/tables.generated.js';
import { spawnZones } from './regions.js';

const prelude = ['intro','spark','lantern','upgrade','frost','thaw','veda','grom','hunt'];
export const townOpen = p => questDone(p, 'treegazer') || p.huntLevel >= 21;
export const nextRegionOpen = p => questDone(p, 'august') || p.huntLevel >= 41;

export function questDone(p,id) {
  if (id==='workbench') return !!p.workbenchRestored;
  const early=PROLOGUE.find(row=>row[0]===id);
  if (early) return prelude.indexOf(p.step)>=prelude.indexOf(early[2]);
  const quest=QUEST_BY_ID[id];
  return !!quest && (p.tasks[id] || 0)>=quest.steps.length;
}
export function milestones(p, name) {
  switch(name) {
    case 'wand15': return p.wandLevel >= CORE.wand_visual_every;
    case 'star2': return Object.values(p.gifts).some(g=>g.stars>=2);
    case 'tide20': return p.dailyWins >= 20 && p.date===dayAt(Date.now());
    case 'blue': return Object.values(p.gifts).some(g=>['blue','purple','orange','gold'].includes(g.color));
    case 'build2': return !!p.presets[1] && !!p.presets[2];
    case 'chest': return p.chestOpens>0;
    default: return true;
  }
}
export function questStep(p, quest) {
  if (!quest || questDone(p,quest.id) || !quest.needs.every(id=>questDone(p,id))) return null;
  if (!(quest.act===1 ? p.step==='hunt' : townOpen(p))) return null;
  const index=p.tasks[quest.id] || 0;
  const step=quest.steps[index];
  return step && milestones(p,step.milestone) ? {...step,index} : null;
}
export function mainQuest(p, tier) {
  const tracked=QUEST_BY_ID[p.tracked];
  if (tracked?.act===tier && questStep(p,tracked)) return tracked;
  return QUESTS.find(q=>q.act===tier && q.kind==='story' && questStep(p,q));
}
export const taskTarget = (id,index) => 'v2-quest-'+id+'-'+index;
export function advanceQuest(p, quest, index) {
  const step=questStep(p,quest);
  if (!step || step.index!==index) return p;
  let next={...p,tasks:{...p.tasks,[quest.id]:index+1}};
  if (step.take || step.learn) next=award(next,{items:step.take,learn:step.learn});
  if (index+1===quest.steps.length) {
    next=award(next,quest.reward);
    if (next.tracked===quest.id) next={...next,tracked:null};
  }
  return next;
}
export function plannedEncounter(quest,step) {
  const encounter=namedEncounter(taskTarget(quest.id,step.index),step.pack,step.level,quest.act);
  return {...encounter,arena:step.arena ?? encounter.arena,quest:quest.id,index:step.index};
}
const mixes = {
  1:['t1_solo_grab','t1_solo_imp','t1_solo_thorn','t1_duo_anomaly','t1_duo_outpost','t1_trio_birch'],
  2:['t2_solo_collector','t2_solo_imp','t2_solo_collector','t2_duo_plaza','t2_duo_society','t2_trio_quarter'],
};
const maxActive=ECONOMY['hunt.max_active'];
const fieldKey = tier => String(tier);
function zoneOpen(p, point) {
  if (!point) return false;
  if (point.gate === 'flood') return p.tasks.flood > 0;
  return !point.gate || questDone(p, point.gate);
}
export function populateHunt(p,tier,now,away,walkable) {
  const key=fieldKey(tier);
  const zones=spawnZones(tier), zoneCount=zones.length;
  const saved=p.field[key] || [];
  const lanes=[...saved];
  let changed=false;
  for (let i=0;i<maxActive;i++) {
    const old=lanes[i];
    const oldOpen=old && zoneOpen(p,zones[old.zone]);
    if (oldOpen && (!old.readyAt || old.readyAt>now)) continue;
    const occupied=new Set(lanes.filter((row,index)=>row && index!==i && !row.readyAt).map(row=>row.zone));
    const generation=(old?.generation ?? -1)+1;
    const first=(i*5+tier*2+generation*7)%zoneCount;
    const options=Array.from({length:zoneCount},(_,offset)=>(first+offset)%zoneCount);
    const zone=options.find(point=>point!==old?.zone && !occupied.has(point) && zoneOpen(p,zones[point]) &&
      walkable(point) && (!oldOpen || away(point)));
    if (zone===undefined) continue;
    lanes[i]={zone,generation}; changed=true;
  }
  return changed?{...p,field:{...p.field,[key]:lanes}}:p;
}
export function fieldEncounter(p,tier,zone) {
  const point=spawnZones(tier)[zone];
  if (!zoneOpen(p,point)) return null;
  const lane=p.field[fieldKey(tier)]?.findIndex(row=>row?.zone===zone&&!row.readyAt)??-1;
  if (lane<0) return null;
  const row=p.field[fieldKey(tier)][lane];
  const {band}=point;
  const offset=[ECONOMY['hunt.window_min'],0,0,1,1,ECONOMY['hunt.window_max']][band];
  const range=TIERS_41['tier_'+tier];
  const level=Math.max(range.min_lvl,Math.min(range.max_lvl,p.huntLevel+offset));
  const id='field-'+tier+'-'+lane+'-'+row.generation;
  return {...namedEncounter(id,mixes[tier][band],level,tier),tier,lane,zone};
}

export function settleField(p,encounter,foxBonus,now) {
  if (!Number.isInteger(encounter.zone) || fieldEncounter(p,encounter.tier,encounter.zone)?.id!==encounter.id) return p;
  const wins=p.date===dayAt(now)?p.dailyWins:0;
  const tide=tideAt(wins);
  const tier=TIERS_41['tier_'+encounter.tier];
  const boost=p.blessingUntil>now?2:1;
  const coins=Math.floor(baseBattleCoins(encounter.level)*tide.value*boost*(foxBonus?1+CORE.episode_fox_kill_coins:1));
  const totalWins=(p.totalWins || 0)+1;
  const huntLevel=encounter.level>=p.huntLevel?Math.min(tier.max_lvl+1,p.huntLevel+1):p.huntLevel;
  const lanes=[...p.field[fieldKey(encounter.tier)]];
  lanes[encounter.lane]={...lanes[encounter.lane],readyAt:now+1000*ECONOMY['hunt.respawn_seconds']};
  const bestiary={...p.bestiary};
  for (const id of encounter.enemyIds) bestiary[id]=(bestiary[id] || 0)+1;
  const qty=boost*(Math.floor(totalWins*tide.value)-Math.floor((totalWins-1)*tide.value));
  const room=Math.max(0,p.satchel-gearSpace(p));
  return award({...p,totalWins,huntLevel,date:dayAt(now),dailyWins:wins+1,bestiary,field:{...p.field,[fieldKey(encounter.tier)]:lanes}},
    {coins,items:{[tier.common_id]:Math.min(room,qty)},shards:encounter.level>p.huntLevel&&totalWins%4===0?{[encounter.tier===1?'fire':'ice']:1}:{}});
}
export function gather(p,tier,zone,now) {
  const key=tier+'-'+zone;
  const current=p.gathering;
  const day=dayAt(now);
  if ((current.points?.[key] || 0)>now || gearSpace(p)>=p.satchel) return null;
  const n=current.day===day?current.n || 0:0;
  const rich=HUNT_GATHER_LIMIT;
  const base=zone%3===0?3:5;
  const bonus=ECONOMY['gather.post_rich_mult'];
  const qty=n<rich?base:Math.floor((n-rich+1)*base*bonus)-Math.floor((n-rich)*base*bonus);
  const ids=TIERS_41['tier_'+tier];
  const item=zone%3===0?ids.rare_id:ids.common_id;
  const take=Math.min(qty,p.satchel-gearSpace(p));
  return { take,item,next:award({...p,gathering:{day,n:n+1,points:{...current.points,[key]:now+70000}}},{items:{[item]:take}}) };
}
const HUNT_GATHER_LIMIT = HORIZON_TABLES.economy_tide.find(row=>row.key==='rich_nodes').threshold;

export function dailyElite(p,tier,now) {
  const key=String(tier), day=dayAt(now);
  if (!questDone(p,tier===1?'bor_crown_3':'town_crown_3') || p.eliteDay[key]===day) return null;
  const pack=tier===1?'t1_elite_ember':'t2_elite_golem';
  const region=TIERS_41['tier_'+tier];
  const level=Math.min(region.max_lvl,Math.max(region.min_lvl,p.huntLevel));
  return {...namedEncounter('elite-'+key+'-'+day,pack,level,tier),eliteTier:tier};
}
export function settleElite(p,encounter,now) {
  const tier=encounter.eliteTier;
  if (dailyElite(p,tier,now)?.id!==encounter.id) return p;
  const {catalyst_id}=TIERS_41['tier_'+tier];
  return award({...p,eliteDay:{...p.eliteDay,[tier]:dayAt(now)}},
    {coins:4*baseBattleCoins(encounter.level),sapphires:10,items:{[catalyst_id]:1},shards:{[tier===1?'crimson_burst':'ice_shatter']:6}});
}

export function disturbedAnomaly(p,tier,slot,now) {
  const id=tier+'-'+slot;
  const gone=p.anomalies?.[id];
  return { id, ready: !gone || now>=gone.at, generation:gone?.generation || 0 };
}
export const ANOMALY_GIFTS=['fire','telekinesis','seal','ice','fire','seal'];
export function claimAnomaly(p,tier,slot,now) {
  const a=disturbedAnomaly(p,tier,slot,now);
  if (!a.ready) return null;
  const row=TIERS_41['tier_'+tier];
  const key=slot===0?row.catalyst_id:row.rare_id;
  return award({...p,anomalies:{...p.anomalies,[a.id]:{at:now+ECONOMY['world.anomaly_respawn_sec']*1000,generation:a.generation+1}}},
    {items:{[key]:slot===0?1:3},shards:{[tier===1?'resin_thread':'spark_seed']:3},sapphires:slot===0?5:0});
}
