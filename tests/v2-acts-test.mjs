import assert from 'node:assert/strict';
import { CORE, GIFT_RULES, MOBS_41, PACKS, namedEncounter } from '../src/config/horizon/rules.js';
import { HORIZON_TABLES } from '../src/config/horizon/tables.generated.js';
import { HorizonBattle, replayHorizonBattle } from '../src/systems/HorizonBattle.js';
import { QUESTS, QUEST_BY_ID, PROLOGUE } from '../src/v2/quests.js';
import { BOR, TOWN, actLocationAt, gatherZones, spawnZones } from '../src/v2/regions.js';
import { advanceQuest, fieldEncounter, gather, nextRegionOpen, populateHunt, questDone, questStep, settleField, townOpen } from '../src/v2/actProgress.js';
import { award, craftPotion, finishRitual, hydrateActProgress, openChest, startColor } from '../src/v2/progression.js';

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
assert.deepEqual([QUESTS.filter(q=>q.act===1).length+PROLOGUE.length,QUESTS.filter(q=>q.act===2).length],[27,30]);
assert.equal(new Set(QUESTS.map(q=>q.id)).size,QUESTS.length);
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
