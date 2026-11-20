import assert from 'node:assert/strict';
import { HorizonBattle, HORIZON_STEP_MS } from '../src/systems/HorizonBattle.js';
import { resolveHorizonBattle } from '../src/v2/battleResolution.js';
import { completeActStep } from '../src/v2/campaign.js';
import { fieldEncounter, gather, plannedEncounter, populateHunt, questDone, questStep } from '../src/v2/actProgress.js';
import { battleContext, claimMirraLantern, finishDialogue, restoreWorkbench, starterState, STORY_ENCOUNTERS, upgradeWand } from '../src/v2/episode.js';
import { craftPotion, forgeAmulet, hydrateActProgress, levelTrack, startColor, starGift, trade, TIERS_41 } from '../src/v2/progression.js';
import { QUESTS, QUEST_BY_ID } from '../src/v2/quests.js';

let now=Date.UTC(2026,10,20,12);
let p=hydrateActProgress(starterState(),{coins:0,moon_herb:0},0);
const cast=(battle,gift,object)=>battle.command({type:object?'cast_on_object':'cast',gift,object});
const expedition=[];

function play(encounter, state) {
  const context=battleContext(state,encounter);
  const battle=new HorizonBattle(context);
  const boss=encounter.enemies[0].role==='boss';
  const coldBoss=encounter.packId==='t2_boss_august';
  while (!battle.result && battle.tick<3600) {
    const target=battle.enemies[battle.focus];
    const stones=Object.values(battle.objects).filter(stone=>stone.respawnAt<=battle.tick);
    const charged=stones.find(stone=>stone.tag==='heat');
    const loose=stones.find(stone=>!stone.tag);
    if (target.shield && cast(battle,'seal')) {
      // Strip the shield before spending the mana on damage.
    } else if (target.castUntil && (!coldBoss || target.castCount%2===0) &&
      ((charged || loose) ? cast(battle,'telekinesis',(charged || loose).id) : !coldBoss && cast(battle,'telekinesis'))) {
      // Save a throw for August's frost wave.
    } else {
      if (battle.hero.hp < battle.hero.maxHp*.64) {
        battle.command({type:'potion',id:'potion_life_medium'}) || battle.command({type:'potion',id:'potion_life_small'});
      }
      if (battle.hero.hp < battle.hero.maxHp*.93) cast(battle,'lunar_veil');
      if (coldBoss && battle.hero.hp < battle.hero.maxHp*.78) {
        battle.command({type:'potion',id:'potion_guard'}) || battle.command({type:'potion',id:'potion_warm'});
      }
      if (battle.hero.mana >= 30 && target.heat>0 && !loose && !charged) cast(battle,'crimson_burst');
      if (battle.hero.mana >= 38 && loose && (loose.id!=='crystal' || !coldBoss || battle.hero.mana >= 80)) cast(battle,'fire',loose.id);
      if (charged && (!boss || target.nextCast > battle.tick+100)) cast(battle,'telekinesis',charged.id);
      if (battle.hero.mana >= 52 && !charged && !loose) cast(battle,'fire');
      if (battle.hero.mana >= 24 && coldBoss && stones.some(stone=>stone.id==='crystal'&&!stone.tag) && battle.hero.mana < 50) {
        cast(battle,'seal','crystal');
      }
      if (!coldBoss && battle.hero.mana>=24) {
        if (boss && target.heat>=2) battle.command({type:'potion',id:'potion_resin_flask'});
        else if (target.heat<2) battle.command({type:'potion',id:'potion_fire_flask'});
      }
    }
    battle.advance();
  }
  return {battle,seconds:battle.tick*HORIZON_STEP_MS/1000};
}

function victory(encounter,p) {
  const {battle,seconds}=play(encounter,p);
  assert.equal(battle.result,'victory',
    [encounter.name,encounter.level,'hero',p.huntLevel,'HP',battle.hero.hp,'enemy',battle.enemies.map(e=>e.hp),
      'seconds',seconds,'ranks',p.vigor,p.wandLevel,p.loadout.map(id=>p.gifts[id].rank),'coins',p.coins].join(' '));
  now+=seconds*1000;
  const resolved=resolveHorizonBattle(p,battleContext(p,encounter),battle.record(),now);
  assert.ok(resolved.victory);
  return {next:resolved.state,seconds};
}

function upgrade(tracks) {
  const targets=tracks.filter(id=>id==='wand'||id==='vigor'||p.gifts[id]);
  for (let i=1;i<p.huntLevel;i++) for (const id of targets) {
    const rank=id==='wand'?p.wandLevel:id==='vigor'?p.vigor:p.gifts[id].rank;
    if (rank<=i && p.coins>70) p=levelTrack(p,id) || p;
  }
  for (const id of p.loadout) p=starGift(p,id) || p;
}

function prepare(tier, potions=2) {
  while (p.inv.moon_herb>40) p=trade(p,'moon_herb',TIERS_41.tier_1,false);
  for (const id of ['potion_life_small','potion_fire_flask']) {
    while ((p.inv[id]||0)<potions) {
      const next=craftPotion(p,id);
      if (next) { p=next; continue; }
      const rare=id==='potion_fire_flask'&&(p.inv.tree_resin||0)<2;
      const zones=rare?[0,3,6,9,12,15]:[1,2,4,5,7,8];
      const material=zones.map(zone=>gather(p,1,zone,now)).find(Boolean);
      if (!material) break;
      p=material.next;
    }
  }
  if (tier===2 && !p.amulet) p=forgeAmulet(p,'amulet_forest',now) || p;
}

function huntTo(level,tier,{ extra=0, tracks=['wand','vigor',...p.loadout] }={}) {
  while (p.huntLevel < level || extra>0) {
    p=populateHunt(p,tier,now,()=>true,()=>true);
    const encounters=p.field[tier].map(lane=>fieldEncounter(p,tier,lane.zone))
      .filter(e=>e && (p.huntLevel<level ? e.level>=p.huntLevel : e.level<=level));
    const offer=encounters.sort((a,b)=>a.enemies.length-b.enemies.length || a.level-b.level)[0];
    if (!offer) {
      now=Math.min(...p.field[tier].map(row=>row.readyAt).filter(t=>t>now));
      assert.ok(Number.isFinite(now), 'No progressing hunt encounter');
      continue;
    }
    const atLevel=p.huntLevel>=level;
    const outcome=victory(offer,p);
    p=outcome.next;
    if (atLevel) extra--;
    upgrade(tracks);
  }
}

function runQuest(q) {
  while (!questDone(p,q.id)) {
    const step=questStep(p,q);
    assert.ok(step,q.id);
    if (!step.pack) {
      if (step.needsTactical) prepare(q.act,1);
      const {next,error}=completeActStep(p,q,step.index);
      assert.ok(next,error);
      p=next;
      continue;
    }
    huntTo(step.level,q.act);
    if (q.id==='treegazer') {
      runQuest(QUEST_BY_ID.veda_cauldron);
      assert.ok(p.gifts.lunar_veil);
      p={...p,loadout:['fire','telekinesis','lunar_veil']};
      huntTo(20,1,{extra:16,tracks:['vigor','wand','telekinesis']});
      p=craftPotion(p,'potion_resin_flask') || p;
      p=startColor(p,'fire',now) || p;
    }
    if (q.id==='august') {
      huntTo(40,2,{extra:12,tracks:['vigor','wand','telekinesis']});
      while (p.inv.frost_herb>22) p=trade(p,'frost_herb',TIERS_41.tier_2,false);
      for (const id of ['potion_life_medium','potion_life_medium','potion_life_medium','potion_guard','potion_guard']) {
        const brewed=craftPotion(p,id);
        assert.ok(brewed,id);
        p=brewed;
      }
      p={...p,loadout:['lunar_veil','telekinesis','seal']};
    }
    prepare(q.act,q.id==='treegazer'||q.id==='august'?4:2);
    const encounter=plannedEncounter(q,step);
    if (q.id==='treegazer') assert.equal(p.amulet,null);
    const outcome=victory(encounter,p);
    expedition.push([q.id,step.level,outcome.seconds]);
    p=outcome.next;
    upgrade(['wand','vigor',...p.loadout]);
  }
}

p=finishDialogue(p);
assert.throws(()=>resolveHorizonBattle(p,battleContext(p,STORY_ENCOUNTERS.spark),{ticks:1,actions:[]},now),/Unfinished/);
p=victory(STORY_ENCOUNTERS.spark,p).next;
p=upgradeWand(claimMirraLantern(p));
p=victory(STORY_ENCOUNTERS.frost,p).next;
p=restoreWorkbench(finishDialogue(finishDialogue(finishDialogue(p))));
assert.deepEqual([p.huntLevel,p.coins,p.sapphires],[1,95,0]);
for (const q of QUESTS.filter(q=>q.kind==='story')) {
  if (q.act===2 && p.gifts.seal && !p.loadout.includes('seal')) p={...p,loadout:['fire','telekinesis','seal']};
  runQuest(q);
}
assert.ok(questDone(p,'treegazer')&&questDone(p,'august'));
assert.ok(p.huntLevel>=40);
for (const [id,min,max] of [['treegazer',90,120],['august',90,140]]) {
  const seconds=expedition.find(row=>row[0]===id)[2];
  assert.ok(seconds>=min && seconds<=max,id+' '+seconds+'s');
}
console.log('V2 clean progression ·',expedition.map(([id,level,seconds])=>id+' L'+level+' '+seconds+'s').join(' · '));
