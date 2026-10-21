import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { CombatManager } from '../src/systems/CombatManager.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { DUEL, duelEnemyDef } from '../src/config/duel.js';
import { AMULET_IDS, amuletEffect } from '../src/config/build.js';
import { startState, verifyCombat } from '../src/cloud/combatVerify.js';
import { emptySnapshot, fillDefaults, applyAction, combatApply } from '../src/cloud/playerModel.js';
import { playBot } from './helpers/combat-bot.mjs';
import { STEP } from '../src/systems/combatReplay.js';
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const abilities = level => Object.fromEntries(['telekinesis','fire','seal','ice','storm'].map(id => [id, { unlocked: true, level }]));
const profile = (level = 5, slots = ['telekinesis','fire','storm'], branches = {}) => ({ level: 15, abilities: abilities(level), build: { slots, amulets: [], branches } });
function context(opponent = profile(), player = profile()) {
  return { spawn: 'duel', enemy: 'duel_mage', balanceVersion: 38, level: player.level, hp: 255, mana: 205, abilities: player.abilities, build: player.build,
    potions: { potion_life_medium: 3, potion_crystal_shield: 2, stabilizing_potion: 2 }, potionLoadout: ['potion_life_medium','potion_crystal_shield','stabilizing_potion'],
    duel: { version: 2, rating: 1000, opponent: { ...opponent, rating: 1000 } } };
}
function battle(ctx = context()) {
  const state = startState(ctx, 1000);
  return new CombatManager({ enemyType: 'duel_mage', enemyDef: duelEnemyDef(ctx.duel.opponent, ctx.duel.version), state, abilities: new AbilitySystem(state, null, null) });
}
function cast(cm, actor, id) { const r = cm.duelBattle.beginCast(actor, id); assert.ok(r.ok, JSON.stringify(r)); cm.duelBattle.advanceCast(actor, 1); }
function reset(actor, id) { actor.cooldowns[id] = 0; actor.hero.mana = actor.hero.maxMana; }
{
 const opp = profile(5, ['fire','ice','storm'], { fire:'arsonist',ice:'frost',storm:'field' });
 const cm = battle(context(opp)); const d = cm.duelBattle.defender;
 check(d.state.equippedGifts().join() === 'fire,ice,storm' && !d.state.isEquipped('seal'), 'only equipped gifts act');
 for (const id of opp.build.slots) check(d.abilities.level(id) === 5 && d.abilities.stats(id).branch === opp.build.branches[id], id+' level/branch');
 check(d.hero.maxHp === 255 && d.hero.maxMana === 205 && d.hero.regen === 3.8, 'real hero HP, mana and regen; no artificial equipment HP');
 const before = d.hero.mana; check(cm.duelBattle.beginCast(d,'fire').ok, 'AI starts channel');
 check(d.hero.mana === before-d.abilities.stats('fire').manaCost && cm.enemy.isPreparing, 'channel pays real mana and has warning');
 check(!cm.duelBattle.beginCast(d,'ice').ok, 'cannot cast concurrently');
 const hp=cm.hero.hp;cm.duelBattle.advanceCast(d,1);
 check(cm.hero.hp<hp && cm.duelBody.burning && d.stormCharges===1, 'real fire hits, burns and charges Storm');
 check(!cm.duelBattle.beginCast(d,'fire').ok, 'real cooldown');
 reset(d,'fire');d.hero.mana=0;check(!cm.duelBattle.beginCast(d,'fire').ok,'no mana means no cast');
 check(!cm.duelBattle.beginCast(d,'seal').ok,'unselected unlocked gift stays benched');
}
for (const id of AMULET_IDS) {
 const opp=profile();opp.build.amulets=[id];opp.build.amuletLevels={[id]:5};
 const cm=battle(context(opp)), d=cm.duelBattle.defender, e=amuletEffect(id,5);
 if(e.damageMult)check(d.hero.damageMult===Math.round(1.48*e.damageMult*1000)/1000,id+' damage');
 if(e.incomingMult){const hp=d.hero.hp;cm.enemy.takeDamage(100,'fire');check(d.hero.hp===hp-Math.round(100*e.incomingMult),id+' actual incoming reduction');}
 if(e.fireMult)check(d.schoolMult.fire===e.fireMult&&d.burnMult===e.burnMult&&d.antiheal===e.antiheal,id+' fire/burn/antiheal');
 if(e.heavyMult)check(d.heavyMult===e.heavyMult&&d.interruptShield===e.interruptShield,id+' heavy/interrupt shield');
 if(e.sealMult)check(d.schoolMult.seal===e.sealMult&&d.flashBonus===e.flashBonus,id+' astral flash');
 if(e.iceMult)check(d.iceMult===e.iceMult&&(d.slowBonus=== (e.slowBonus||0))&&d.brittleBonus===(e.brittleBonus||0),id+' ice modifiers');
 if(e.manaRescue){d.hero.mana=10;d.checkManaRescue();check(d.hero.mana===205&&d.manaRescueUsed,id+' rescue once');d.hero.mana=10;d.checkManaRescue();check(d.hero.mana===10,'rescue cannot repeat');}
 if(e.gatherBonus)check(d.hero.damageMult===1.48&&d.incomingMult===1,'gather-only amulet invents no combat bonus');
}
{
 const player=profile(5,['telekinesis','fire','ice'],{telekinesis:'lord'}),cm=battle(context(profile(),player)),d=cm.duelBattle.defender;
 cm.duelBattle.beginCast(d,'fire');cast(cm,cm,'telekinesis');
 check(!cm.enemy.isPreparing&&d.duelBody.staggerLeft>0,'player interrupts actual AI cast');
 check(cm.shields.lord.amount===80&&cm.nextThrowBonus===.5&&cm.stats.interrupts===1,'lord V interrupt ward/refund/next throw');
 const defender=profile(5,['telekinesis','fire','ice'],{telekinesis:'lord'});defender.build.amulets=['amulet_breaker'];defender.build.amuletLevels={amulet_breaker:5};
 const duel=battle(context(defender));const ai=duel.duelBattle.defender;
 duel.useAbility('fire');cast(duel,ai,'telekinesis');
 check(!duel.duelBody.isPreparing&&ai.shields.lord.amount===80&&ai.shields.breaker.amount===50,'AI interruption uses real branch and amulet shields');
 ai.shields={a:{amount:50,left:10},b:{amount:50,left:10}};const hp=ai.hero.hp;
 duel.enemy.takeDamage(80,'seal',1,{shieldPierce:.75});
 check(ai.hero.hp===hp-60&&duel.enemy.shield===80,'shield bypass applies once across multiple shields');
}
{
 const cm=battle(context(profile(5,['telekinesis','ice','storm'],{telekinesis:'breaker',storm:'discharge'}))),d=cm.duelBattle.defender;
 for(let i=0;i<3;i++)cast(cm,d,'telekinesis');
 check(d.stormCharges===3&&d.cooldowns.telekinesis>0,'three-throw V chain charges full Storm');
 cm.hero.hp=255;cm.hero.maxHp=255;cm.hero.hp=10000;const hp=cm.hero.hp;
 cast(cm,d,'storm');check(d.stormCharges===0&&hp-cm.hero.hp===Math.round(32*2.35*1.48)*2,'full discharge V adds a real second hit');
 check(d.stats.abilityUses.storm===1,'AI Storm consumes one use');
 const field=battle(context(profile(5,['storm'],{storm:'field'}))),f=field.duelBattle.defender;
 f.stormCharges=3;f.hero.mana=30;cast(field,f,'storm');
 check(field.duelBody.weakened.reduction===.3&&field.duelBody.weakened.left===8&&f.hero.mana===24,'field V weakens and refunds 20 MP');
}
{
 const cm=battle(context(profile(5,['fire'],{fire:'arsonist'}))),d=cm.duelBattle.defender;
 d.antiheal=.4;
 for(let i=0;i<3;i++){reset(d,'fire');cm.hero.hp=10000;cast(cm,d,'fire');}
 check(cm.duelBody.burnStacks.length===3,'three independent burns from defender');
 cm.hero.hp=50;cm.hero.maxHp=255;cm.usePotion('potion_life_medium');check(cm.hero.hp===110,'defender antiheal reduces real healing by 40%');
 cm.usePotion('stabilizing_potion');check(!cm.duelBody.burning&&cm.duelBody.burnStacks.length===0,'cleanse removes defender burns');
 const slow=battle(context(profile(5,['ice'],{ice:'frost'}))),ice=slow.duelBattle.defender;
 cast(slow,ice,'ice');check(slow.heroChill.pct===.65&&slow.duelBody.weakened.reduction===.4,'frost V chills and weakens player');
}
{
 const cm=battle(context(profile(5,['fire'],{fire:'blaster'}))),d=cm.duelBattle.defender;
 cm.hero.hp=10000;cast(cm,d,'fire');const first=10000-cm.hero.hp;
 reset(d,'fire');const before=cm.hero.hp;cast(cm,d,'fire');
 check(before-cm.hero.hp>first*3&&!cm.duelBody.inPuddle,'blaster V detonates remaining burn without puddle');
 const shard=battle(context(profile(5,['ice'],{ice:'shard'}))),s=shard.duelBattle.defender;
 shard.hero.hp=10000;cast(shard,s,'ice');const initial=10000-shard.hero.hp;
 reset(s,'ice');const hp=shard.hero.hp;cast(shard,s,'ice');
 check(hp-shard.hero.hp>=initial*2.9&&!shard.duelBody.isBrittle,'shard V consumes brittle in a real triple hit');
 const piercer=battle(context(profile(5,['seal'],{seal:'piercer'}))),p=piercer.duelBattle.defender;
 piercer.shields.potion={amount:70,left:12};cast(piercer,p,'seal');
 check(piercer.hero.hp===178&&piercer.shields.potion.amount===45,'piercer V bypass and shield bonus affect player shield');
 const seer=battle(context(profile(5,['seal','fire'],{seal:'seer'}))),seerActor=seer.duelBattle.defender;
 seer.hero.hp=10000;cast(seer,seerActor,'seal');cast(seer,seerActor,'fire');
 check(seerActor.hero.mana===165&&seer.duelBody.vulnerable.bonus===.25,'seer V vulnerability and other-gift mana refund');
}
const legacy=JSON.parse(fs.readFileSync('tests/fixtures/duel-legacy-v1.json','utf8'));
for(const c of legacy.cases){
 const p=playBot(c.ctx,{seed:7,policy:c.policy,potions:false,maxTicks:18000});
 assert.deepEqual({outcome:p.cm.result,time:p.cm.time,hp:p.cm.hero.hp,mana:p.cm.hero.mana,enemyHp:p.cm.enemy.hp,stats:p.cm.stats},c.result,'old Duel protocol '+c.ctx.balanceVersion);checks++;
}
// Different/equal loadouts must all terminate and replay exactly; no RNG in the AI.
const profiles=[profile(1),profile(3,['telekinesis','fire','ice'],{telekinesis:'lord',fire:'blaster',ice:'shard'}),profile(5,['telekinesis','fire','storm'],{telekinesis:'breaker',fire:'arsonist',storm:'discharge'}),profile(5,['seal','ice','storm'],{seal:'seer',ice:'frost',storm:'field'})];
const matrix=[];
for(let i=0;i<profiles.length;i++)for(let j=0;j<profiles.length;j++){
 const ctx=context(profiles[j],profiles[i]);const p=playBot(ctx,{seed:7,potions:false,maxTicks:18000});
 check(!!p.cm.result,`loadouts ${i}/${j} terminate`);
 const snap={...emptySnapshot(),combatSince:1000,combatCtx:ctx};const v=verifyCombat(snap,p.log,1000+p.log.ticks*STEP*1000+1000);
 check(v.ok&&v.verdict.outcome===p.cm.result&&v.verdict.mana===p.cm.hero.mana,`loadouts ${i}/${j} deterministic replay`);
 check(!v.verdict.reward.items.sapphires&& !('sapphireDrops' in ctx),'Duel has no random PvE sapphires');
 matrix.push({attacker:i,defender:j,outcome:p.cm.result,seconds:Math.round(p.cm.time*10)/10,heroHp:p.cm.hero.hp,defenderHp:p.cm.enemy.hp,defenderUses:p.cm.duelBattle.defender.stats.abilityUses});
}
// Real SQL start freezes equipment and version; later changes to the other player cannot alter the replay.
const db=new PGlite();
try {
 await db.exec(fs.readFileSync('tools/sql/auth-stub.sql','utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/rebalance-baseline-schema.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021_rebalance_recovery.sql','utf8'));
 const uid=randomUUID(),opp=randomUUID(),q=(sql,args=[])=>db.query(sql,args);
 const as=async (id,fn)=>{await db.exec('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn()}finally{await db.exec('reset role')}};
 for(const id of [uid,opp]){
  await q('insert into auth.users(id)values($1)',[id]);await as(id,()=>q("select create_player('witch')"));
  await q("select _add_event($1,'chapter_2_complete')",[id]);await q('update player_progress set hero_level=15,hero_xp=7900,hp=255,mana=205 where user_id=$1',[id]);
  for(const gift of ['telekinesis','fire','storm'])await q('select _unlock_ability($1,$2,5)',[id,gift]);
 }
 await q("update profiles set nickname='Defender',nickname_normalized='defender' where id=$1",[opp]);
 const frozenBuild={slots:['telekinesis','fire','storm'],amulets:['amulet_embers'],amuletLevels:{amulet_embers:5},branches:{fire:'arsonist',telekinesis:'breaker',storm:'discharge'}};
 await q('select _merge_build($1,$2::jsonb)',[opp,JSON.stringify(frozenBuild)]);
 const act=async args=>(await as(uid,()=>q('select player_action($1::jsonb) j',[JSON.stringify({id:randomUUID(),...args})]))).rows[0].j;
 const started=await act({op:'duel_start',balanceVersion:38,duelVersion:2});
 check(started.action.ok&&started.combatCtx.duel.version===2&&!started.combatCtx.duel.opponent.ghost,'SQL chooses real opponent and stamps v2');
 assert.deepEqual(started.combatCtx.duel.opponent.build,frozenBuild);checks++;
 await q("select _merge_build($1,'{\"branches\":{\"fire\":\"blaster\"},\"amuletLevels\":{\"amulet_embers\":0}}')",[opp]);
 const current=(await as(uid,()=>q('select get_player() j'))).rows[0].j;
 assert.deepEqual(current.combatCtx.duel.opponent,started.combatCtx.duel.opponent);checks++;
 const p=playBot(started.combatCtx,{policy:'idle',potions:false,maxTicks:18000});
 const v=verifyCombat(fillDefaults(started).snapshot,p.log,started.combatSince+p.log.ticks*STEP*1000+1000);
 check(v.ok&&v.verdict.outcome==='defeat','SQL-frozen snapshot verifies AI win');
 const settled=(await q('select combat_apply($1,$2::jsonb) j',[uid,JSON.stringify(v.verdict)])).rows[0].j;
 check(settled.action.ok&&settled.objects.duel.losses===1,'SQL settles rating/attempt/result');
 check((await q('select count(*)::int n from player_sapphire_drops where user_id=$1',[uid])).rows[0].n===0,'SQL never invokes PvE sapphire roll for Duel');
 const dup=(await q('select combat_apply($1,$2::jsonb) j',[uid,JSON.stringify(v.verdict)])).rows[0].j;
 check(dup.action.reason==='no_combat','Duel settlement remains idempotent');
 const old=await act({op:'duel_start',balanceVersion:38});check(old.combatCtx.duel.version===1,'old clients retain old defender');
}finally{await db.close()}
console.log(`Duel defender: ${checks} checks passed; ${matrix.length} equal/different loadout replays.`);
if(process.argv.includes('--report'))fs.writeFileSync('docs/design/duel-defender-results.json',JSON.stringify({date:'2026-10-21',kind:'local deterministic bot, not player win-rate',profiles,matrix},null,2)+'\n');
