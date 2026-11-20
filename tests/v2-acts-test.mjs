import assert from 'node:assert/strict';
import { CORE, GIFT_RULES, MOBS_41, PACKS, defensiveRatings, namedEncounter } from '../src/config/horizon/rules.js';
import { HORIZON_TABLES } from '../src/config/horizon/tables.generated.js';
import { ASSET_FILES } from '../src/config/assets.manifest.js';
import { HorizonBattle, replayHorizonBattle } from '../src/systems/HorizonBattle.js';
import { QUESTS, QUEST_BY_ID, PROLOGUE } from '../src/v2/quests.js';
import { BOR, TOWN, actLocationAt, gatherZones, spawnZones } from '../src/v2/regions.js';
import { ACT_CITY_PORTALS, ACT_ROOMS, actRoomMap, resizeRoomPoint } from '../src/v2/rooms.js';
import { CITY_ROOMS } from '../src/config/city.plan.js';
import { advanceQuest, fieldEncounter, gather, nextRegionOpen, plannedEncounter, populateHunt, questDone, questStep, settleField, townOpen } from '../src/v2/actProgress.js';
import { actsTargets, canUsePortal } from '../src/v2/actWorld.js';
import { amuletOffer, award, craftPotion, finishRitual, hydrateActProgress, openChest, startColor } from '../src/v2/progression.js';

const now=Date.UTC(2026,10,20,12);
const player=()=>hydrateActProgress({
  step:'hunt',workbenchRestored:true,huntLevel:21,wandRank:8,fox:true,bestiary:{},respawns:{},totalWins:0,dailyWins:0,
},{coins:3000,moon_herb:30,tree_resin:25,frost_herb:40,rune_dust:20,cold_heart:2},1500);
const finish=(p,id)=>{
  const q=QUEST_BY_ID[id];
  while (questStep(p,q)) p=advanceQuest(p,q,questStep(p,q).index);
  assert.ok(questDone(p,id),id);
  return p;
};
assert.deepEqual([BOR.rect.w,BOR.rect.h,TOWN.rect.w,TOWN.rect.h],[3600,2400,2880,5760]);
assert.deepEqual(ACT_ROOMS.map(({rect})=>[rect.w,rect.h]),[
  [720,960],[900,1500],[900,1320],[960,2160],[1080,1680],[840,1200],
  [720,1680],[720,1680],[720,960],[720,960],
]);
for (const [index,room] of ACT_ROOMS.entries()) {
  const {rect,arrival}=room;
  const map=actRoomMap(room);
  assert.equal(actLocationAt(arrival),room);
  assert.deepEqual(resizeRoomPoint(CITY_ROOMS[index].arrival),arrival);
  assert.equal(ACT_CITY_PORTALS.find(door=>door.room===room.id).target.y,arrival.y);
  assert.equal(map.grounds[0].w,rect.w);
  assert.equal(map.grounds[0].h,rect.h);
  assert.ok(map.colliders.some(c=>c.id===room.id+'_wall_back' && c.w===rect.w));
}
assert.deepEqual([QUESTS.filter(q=>q.act===1).length+PROLOGUE.length,QUESTS.filter(q=>q.act===2).length],[27,30]);
assert.equal(new Set(QUESTS.map(q=>q.id)).size,QUESTS.length);
const anomaly=QUEST_BY_ID.first_anomaly;
const firstEncounter=plannedEncounter(anomaly,questStep({...player(),huntLevel:1},anomaly));
assert.equal(actLocationAt(anomaly.steps[0].where).id,'mirra-hearth');
assert.deepEqual([firstEncounter.level,firstEncounter.arena],[4,['light']]);
for (const [id,index] of [['treegazer',0],['august',1]]) {
  const q=QUEST_BY_ID[id];
  assert.deepEqual(plannedEncounter(q,{...q.steps[index],index}).arena,['heavy','crystal']);
}
assert.equal(amuletOffer(award(player(),{items:{recipe_amulet_forest:1}}),'amulet_forest').cost.coins,0);
const duelDoor=actsTargets().find(cfg=>cfg.id==='door_duel');
assert.ok(canUsePortal(player(),duelDoor));
assert.equal(canUsePortal({...player(),tasks:{lab_journal:2}},duelDoor),false);
assert.ok(canUsePortal({...player(),tasks:{lab_journal:2,august:1}},duelDoor));
for (const {id,texture} of actsTargets()) {
  if (texture && !['horizon_asya','horizon_hearth_fence'].includes(texture)) assert.ok(Object.hasOwn(ASSET_FILES,texture),id+' · '+texture);
}
for (const q of QUESTS) {
  for (const id of q.needs) assert.ok(QUEST_BY_ID[id]||PROLOGUE.some(r=>r[0]===id),id);
  for (const step of q.steps) {
    const place=actLocationAt(step.where);
    assert.ok(place&& (q.act===1 ? !place.id.startsWith('city') : place.id.startsWith('city')),q.id);
    if (step.pack) assert.ok(PACKS[step.pack]?.archetypes,step.pack);
    if (step.gift) assert.ok(GIFT_RULES[step.gift],step.gift);
  }
}
for (const pack of HORIZON_TABLES.encounter_packs.filter(p=>p.archetypes)) {
  assert.equal(pack.count,pack.archetypes.length);
  for (const id of pack.archetypes) assert.ok(MOBS_41[id],id);
  assert.ok(namedEncounter('verify',pack.pack_id,1,1).arena.every(Boolean));
}
const firstAct=QUESTS.filter(q=>q.act===1&&q.kind==='story').reduce((p,q)=>finish(p,q.id),{...player(),huntLevel:20});
assert.ok(townOpen(firstAct));
assert.ok(!townOpen({...player(),huntLevel:20}));
assert.ok(townOpen(player()));
for (const order of [['warehouse_a','warehouse_b'],['warehouse_b','warehouse_a']]) {
  let p=['fountain','klara','pavement','archive'].reduce(finish,player());
  for (const id of order) assert.ok(questStep(p,QUEST_BY_ID[id]));
  p=finish(p,order[0]);
  assert.ok(questDone(p,order[0]));
  assert.ok(!questDone(p,order[1]));
  assert.ok(!questStep(p,QUEST_BY_ID.cold_truth));
  p=finish(p,order[1]);
  assert.ok(p.gifts.ice); assert.ok(p.gifts.seal_crack);
  p=['cold_truth','bridge_wall','cellar_house','rescue_house','flood','lab_seal','lab_journal','august'].reduce(finish,p);
  assert.ok(nextRegionOpen(p)); assert.equal(p.activeCompanion,'robin');
  assert.ok(p.gifts.storm);
  assert.equal(p.inv.cold_heart,4);
  assert.equal(advanceQuest(p,QUEST_BY_ID.august,2),p);
}
for (const tier of [1,2]) {
  assert.equal(spawnZones(tier).length,24);
  assert.equal(gatherZones(tier).length,18);
  let p=populateHunt({...player(),huntLevel:tier===1?10:26},tier,now,()=>true,()=>true);
  assert.equal(p.field[tier].length,12);
  assert.equal(new Set(p.field[tier].map(l=>l.zone)).size,12);
  const old=p.field[tier][0];
  const encounter=fieldEncounter(p,tier,old.zone);
  assert.ok(Math.abs(encounter.level-p.huntLevel)<=2);
  p=settleField(p,encounter,false,now);
  assert.equal(settleField(p,encounter,false,now),p);
  assert.equal(populateHunt(p,tier,now+29000,()=>true,()=>true),p);
  assert.equal(populateHunt(p,tier,now+30000,()=>false,()=>true),p);
  const rebuilt=populateHunt(p,tier,now+30000,()=>true,()=>true);
  assert.notEqual(rebuilt.field[tier][0].zone,old.zone);
}
const northZone=spawnZones(2).findIndex(zone=>zone.gate==='bridge_wall');
const yardZone=spawnZones(2).findIndex(zone=>zone.gate==='flood');
const district={...player(),field:{2:[{zone:northZone,generation:0},{zone:yardZone,generation:0}]}};
assert.equal(fieldEncounter(district,2,northZone),null);
assert.ok(fieldEncounter({...district,tasks:{bridge_wall:1}},2,northZone));
assert.equal(fieldEncounter({...district,tasks:{bridge_wall:1}},2,yardZone),null);
assert.ok(fieldEncounter({...district,tasks:{bridge_wall:1,flood:1}},2,yardZone));
const rare=gather({...player(),satchel:150},1,0,now);
assert.equal(rare.take,3);
assert.equal(gather(rare.next,1,0,now),null);
const green=startColor(player(),'fire',now,true);
assert.equal(green.gifts.fire.color,'green');
const blue=startColor(green,'fire',now);
assert.equal(blue.gifts.fire.color,'green');
assert.equal(finishRitual(blue,'fire',now,false),null);
assert.equal(finishRitual(blue,'fire',now+1800000).gifts.fire.color,'blue');
assert.equal(openChest({...player(),sapphires:149},'tier_1',1),null);
const tenth=openChest({...player(),chestOpens:9},'tier_2',1);
assert.equal(tenth.next.chestOpens,10);
for (const name of Object.keys(tenth.found)) assert.ok(Object.values(GIFT_RULES).find(g=>g.name===name).rarity!=='common');
assert.ok(craftPotion({...player(),satchel:150},'potion_fire_flask'));
const ctx={balanceVersion:41,heroLevel:21,vigor:21,wandRank:16,wandLevel:21,pet:'robin',
  slots:['fire','telekinesis','seal'],potions:{potion_life_small:4,potion_fire_flask:2},
  encounter:namedEncounter('replay','t2_trio_quarter',21,2)};
const boss=new HorizonBattle({...ctx,heroLevel:16,encounter:namedEncounter('treegazer','t1_boss_treegazer',20,1)});
assert.equal(boss.enemies[0].maxHp,Math.round(1400 * 1.065 ** 19));
assert.equal(boss.enemies[0].rating.armor,defensiveRatings(20,{armor:30}).armor);
const battle=new HorizonBattle(ctx);
for (let i=0;i<3;i++) assert.ok(battle.command({type:'potion',id:'potion_life_small'}));
assert.ok(!battle.command({type:'potion',id:'potion_life_small'}));
assert.ok(battle.command({type:'cast_on_object',gift:'fire',object:'heavy'}));
assert.ok(battle.command({type:'cast_on_object',gift:'telekinesis',object:'heavy'}));
assert.ok(battle.combos>0);
for (let i=0;i<300&&!battle.result;i++) {
  battle.advance();
  assert.ok(battle.enemies.filter(e=>e.castUntil>battle.tick).length<=CORE.pack_max_concurrent_casts);
}
const replay=replayHorizonBattle(ctx,battle.record());
assert.deepEqual(replay.enemies,battle.enemies);
assert.deepEqual(replay.hero,battle.hero);
assert.deepEqual(replay.usedPotions,battle.usedPotions);
assert.ok(battle.enemies.every(row=>!Number.isNaN(row.hp)));
console.log('V2 acts: 57 quests, independent warehouses, world limits, progression, rewards, and deterministic combat verified.');
