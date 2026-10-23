import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { startState, verifyCombat } from '../src/cloud/combatVerify.js';
import { applyAction, emptySnapshot, fillDefaults } from '../src/cloud/playerModel.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { duelEnemyDef } from '../src/config/duel.js';
import { DUEL_PACING, duelVersionFor } from '../src/config/duelPacing.js';
import { TEMPO_PROFILES as profiles, tempoContext, tempoFight, tempoMatrix, tempoSummary, tempoDriver } from '../tools/balance/duel-tempo.mjs';
import { playBot } from './helpers/combat-bot.mjs';
import { STEP } from '../src/systems/combatReplay.js';
let checks=0;
const check=(v,label)=>{assert.ok(v,label);checks++};
const near=(a,b,label)=>{assert.ok(Math.abs(a-b)<1e-6,`${label}: ${a} / ${b}`);checks++};
const basic=profiles.find(p=>p.id==='basic_i');
check(duelVersionFor(999,2)===1&&duelVersionFor('40',3)===1,'version selector rejects unsupported or type-forged balance values');
function battle(ctx=tempoContext(basic,basic)) {
 const st=startState(ctx,1000);
 return new CombatManager({enemyType:'duel_mage',enemyDef:duelEnemyDef(ctx.duel.opponent,ctx.duel.version),state:st,abilities:new AbilitySystem(st,null,null)});
}
function advance(cm,seconds){for(let n=0;n<Math.round(seconds/STEP);n++)cm.tick(STEP)}
{
 const cm=battle();
 for(const school of ['fire','seal','ice','storm','telekinesis','auto']) {
  const hp=cm.enemy.hp;cm.enemy.takeDamage(100,school);near(hp-cm.enemy.hp,40,'one arena multiplier: '+school);
  cm.enemy.hp=255;
 }
 const d=cm.duelBattle.defender;
 near(cm.hero.maxHp,255,'real attacker HP');near(d.hero.maxHp,255,'real defender HP');
 d.shields.potion={amount:70,left:12};cm.enemy.takeDamage(100,'fire');
 near(cm.enemy.hp,255,'shield absorbs paced damage');near(d.shields.potion.amount,30,'shield is not scaled');
 cm.enemy.takeDamage(100,'fire');near(cm.enemy.hp,245,'only unabsorbed remainder reaches HP');
 d.shields.potion={amount:70,left:12};cm.enemy.hp=255;cm.enemy.takeDamage(100,'seal',1,{shieldPierce:.75});
 near(cm.enemy.hp,225,'shield bypass after arena scaling');near(d.shields.potion.amount,60,'bypass applies once');
 d.shields={};cm.enemy.hp=100;near(cm.enemy.heal(100),100,'healing retains absolute amount');
 const hp=cm.hero.hp;cm.duelBody.applyBurn(10,2);cm.duelBody.update(1,1);near(hp-cm.hero.hp,4,'burn scaled once');
 cm.duelBody.clearBurn();const ground=cm.hero.hp;cm.duelBody.applyPuddle(10,2);cm.duelBody.update(1,1);near(ground-cm.hero.hp,4,'puddle scaled once');
 const c=tempoContext(basic,basic);c.potions={resin_flask:1,potion_life_medium:1};c.potionLoadout=['resin_flask','potion_life_medium'];
 const potion=battle(c),before=potion.enemy.hp;check(potion.usePotion('resin_flask').ok,'damage flask is usable');near(before-potion.enemy.hp,18,'damage flask uses same arena rule');
 potion.hero.hp=50;check(potion.usePotion('potion_life_medium').ok,'healing potion is usable');near(potion.hero.hp,150,'restorative potion keeps fixed HP');
 const mana=battle();mana.hero.mana=0;mana.cooldowns.fire=4;mana.tickResources(1);
 near(mana.hero.mana,3.8,'mana regen not slowed by arena multiplier');near(mana.cooldowns.fire,3,'ordinary cooldown not extended');
 const pveState=startState({...c,spawn:'scavenger_01',enemy:'forest_scavenger',duel:undefined},1000);
 const pve=new CombatManager({enemyType:'forest_scavenger',state:pveState,abilities:new AbilitySystem(pveState,null,null)});
 const prior=pve.enemy.hp;pve.enemy.takeDamage(100,'seal');near(prior-pve.enemy.hp,100,'PvE has no arena multiplier');
}
for(const id of ['telekinesis','fire','storm']) {
 const cm=battle(tempoContext(profiles[0],profiles[0]));const d=cm.duelBattle.defender;
 const hp=cm.enemy.hp,mp=cm.hero.mana;
 check(cm.useAbility(id).ok&&cm.duelBattle.beginCast(d,id).ok,'both sides begin '+id);
 const duration=id==='telekinesis'?.35:.8;
 near(cm.duelBody.pending.duration,duration,'player readable preparation');near(d.duelBody.pending.duration,duration,'AI same school preparation');
 near(mp-cm.hero.mana,cm.abilities.stats(id).manaCost,'real mana paid at beginning');
 near(cm.enemy.hp,hp,'no immediate damage during preparation');
}
{
 const cm=battle(tempoContext(profiles[0],profiles[0],2)),d=cm.duelBattle.defender;
 cm.useAbility('telekinesis');cm.duelBattle.beginCast(d,'telekinesis');
 near(cm.duelBody.pending.duration,.15,'old player preparation frozen');near(d.duelBody.pending.duration,.65,'old AI preparation frozen');
 const before=d.hero.hp;cm.enemy.takeDamage(100,'fire');near(before-d.hero.hp,100,'old Duel has no damage reduction');
}
{
 // The player reacts after the AI's visible fire warning, rather than predicting the cast.
 const opp=structuredClone(basic);opp.build.slots=['fire','seal'];
 const cm=battle(tempoContext(profiles.find(p=>p.id==='heavy_throw_v'),opp));
 advance(cm,.5);check(cm.enemy.isPreparing,'AI warning is already visible');
 check(cm.useAbility('telekinesis').ok,'player reacts with TK');advance(cm,.35);
 check(cm.stats.interrupts===1&&!cm.enemy.isPreparing&&cm.enemy.interruptGraceLeft>2.9,'reactive interruption succeeds and grants grace');
 near(cm.shields.breaker.amount,50,'real interruption amulet reward');
 while(!cm.enemy.isPreparing&&cm.time<3)cm.tick(STEP);
 check(cm.enemy.isPreparing&&cm.enemy.interruptGraceLeft>0,'AI begins another cast during grace');
 const uses=cm.stats.interrupts;check(cm.useAbility('telekinesis').ok,'second natural chain cast');advance(cm,.35);
 check(cm.stats.interrupts===uses&&cm.enemy.isPreparing,'second cast cannot interrupt protected target');
 check(cm.drainEvents().some(e=>e.type==='interrupt'&&!e.ok&&e.hint.includes('Устойчивость')),'failed counter explains the protected state');
 advance(cm,1);check(cm.drainEvents().some(e=>e.type==='damage'&&e.target==='hero'&&e.school==='seal'),'protected cast actually resolves');
 const left=cm.enemy.interruptGraceLeft;cm.enemy.cleanse();near(cm.enemy.interruptGraceLeft,left,'cleanse does not remove positive interrupt protection');
 advance(cm,2);near(cm.enemy.interruptGraceLeft,0,'protection expires on the combat clock');
}
{
 // The ordinary AI can also react and finish TK before a player's slower fire windup.
 const cm=battle();const mana=cm.hero.mana;check(cm.useAbility('fire').ok,'player prepares fire');advance(cm,.75);
 check(!cm.duelBody.pending&&cm.duelBody.interruptGraceLeft>0&&cm.duelBattle.defender.stats.interrupts===1,'AI can perform a reactive counter');
 check(cm.hero.mana<mana&&cm.enemy.hp===255,'interrupted cast spends mana and has no fire hit');
}
const frozen=JSON.parse(fs.readFileSync('tests/fixtures/duel-tempo-v2.json','utf8'));
for(const c of frozen.cases){assert.deepEqual(tempoFight(c.ctx,c.policy,false,false),c.result,'v2 engine fingerprint');checks++;}
const matrix=tempoMatrix(3),summary=tempoSummary(matrix);
check(matrix.length===200&&matrix.every(r=>r.outcome&&r.verified),'all ordinary/object/potion comparisons terminate and replay');
check(summary.mirrorUnder3===0&&summary.mirrorMin>=6&&summary.max<120,'equal builds have response time; finite matches with potions');
check(matrix.some(r=>r.outcome==='victory')&&matrix.some(r=>r.outcome==='defeat'),'matrix includes both outcomes');
check(matrix.some(r=>r.heroStormHits>0)&&matrix.some(r=>r.defenderStormHits>0),'both sides can execute Storm');
check(matrix.some(r=>r.manaFromHeart>0)&&matrix.some(r=>r.defenderHeartRefundAt!=null),'Storm Heart refunds remain active on both sides');

const db=new PGlite();
try {
 await db.exec(fs.readFileSync('tools/sql/auth-stub.sql','utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/rebalance-baseline-schema.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021_rebalance_recovery.sql','utf8'));
 const uid=randomUUID(),opp=randomUUID(),q=(sql,args=[])=>db.query(sql,args);
 const as=async(id,fn)=>{await db.exec('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn()}finally{await db.exec('reset role')}};
 for(const id of [uid,opp]){
  await q('insert into auth.users(id)values($1)',[id]);await as(id,()=>q("select create_player('witch')"));await q("select _add_event($1,'chapter_2_complete')",[id]);
  await q('update player_progress set hero_level=15,hero_xp=7900,hp=255,mana=205 where user_id=$1',[id]);
  for(const gift of ['telekinesis','fire','storm'])await q('select _unlock_ability($1,$2,5)',[id,gift]);
  await q('select _merge_build($1,$2::jsonb)',[id,JSON.stringify(profiles[0].build)]);
 }
 await q("update profiles set nickname='TempoDefender',nickname_normalized='tempodefender' where id=$1",[opp]);
 const act=async args=>(await as(uid,()=>q('select player_action($1::jsonb) j',[JSON.stringify({id:randomUUID(),...args})]))).rows[0].j;
 const started=await act({op:'duel_start',balanceVersion:40,duelVersion:3});
 check(started.action.ok&&started.combatCtx.duel.version===3&&!started.combatCtx.duel.opponent.ghost,'SQL picks real defender and stamps v3');
 const restart=await act({op:'duel_start',balanceVersion:40,duelVersion:2});
 check(restart.action.reason==='combat'&&restart.combatCtx.duel.version===3&&restart.objects.duel.used===1,'active fight cannot be downgraded or charged twice');
 const frozenOpponent=started.combatCtx.duel.opponent;
 await q("select _merge_build($1,'{\"branches\":{\"fire\":\"blaster\"},\"amuletLevels\":{\"amulet_storm_heart\":0}}')",[opp]);
 const current=(await as(uid,()=>q('select get_player() j'))).rows[0].j;assert.deepEqual(current.combatCtx.duel.opponent,frozenOpponent);checks++;
 const play=playBot(started.combatCtx,{driver:tempoDriver('objects'),seed:7,potions:false});
 const now=started.combatSince+play.log.ticks/60*1000+1000;
 const snap=fillDefaults(started).snapshot,v=verifyCombat(snap,play.log,now);check(v.ok&&v.verdict.outcome===play.cm.result,'SQL snapshot verifies complete v3 fight');
 check(verifyCombat(snap,{...play.log,hold:[0]},now).reason==='bad_log','Duel v3 rejects tutorial pause recordings');
 assert.deepEqual(verifyCombat(snap,{...play.log,duelVersion:2,balanceVersion:29},now),v);checks++;
 const result=(await q('select combat_apply($1,$2::jsonb) j',[uid,JSON.stringify(v.verdict)])).rows[0].j;
 check(result.action.ok&&result.objects.duel.used===1&&result.objects.duel.wins+result.objects.duel.losses===1,'result preserves rating and daily attempt semantics');
 check(result.objects.duel.rating===1000+v.verdict.duel.delta,'rating uses original Elo');
 const duplicate=(await q('select combat_apply($1,$2::jsonb) j',[uid,JSON.stringify(v.verdict)])).rows[0].j;
 check(duplicate.action.reason==='no_combat'&&duplicate.objects.duel.rating===result.objects.duel.rating,'settlement idempotent');
 check((await q('select count(*)::int n from player_sapphire_drops where user_id=$1',[uid])).rows[0].n===0,'v3 never creates PvE sapphire receipts');
 // A new Duel is only started by the current protocol; superseded or forged requests are refused before an attempt is charged.
 await act({op:'combat_end',outcome:'retreat'});
 const usedBefore=(await as(uid,()=>q('select get_player() j'))).rows[0].j.objects.duel.used;
 for(const [balanceVersion,duelVersion] of [[40,2],[40,1],[38,3],[39,3],[30,3],[40,'3'],['40',3],[40,99],[999,2],[undefined,undefined]]){
  const got=await act({op:'duel_start',balanceVersion,duelVersion});
  check(!got.action.ok&&got.action.reason==='update_required'&&!got.combatCtx,'SQL refuses new Duel on superseded or type-forged protocol');
  const s=emptySnapshot();s.quests=['chapter_2_complete'];const local=applyAction(s,{op:'duel_start',balanceVersion,duelVersion},1000);
  check(local.result.reason==='update_required'&&!local.snapshot.combatCtx,'JS mirror refuses the same requests');
 }
 check((await as(uid,()=>q('select get_player() j'))).rows[0].j.objects.duel.used===usedBefore,'refused starts do not charge attempts');
 const again=await act({op:'duel_start',balanceVersion:40,duelVersion:3});
 check(again.action.ok&&again.combatCtx.duel.version===3,'current protocol still starts');
 await act({op:'combat_end',outcome:'retreat'});
 for(let i=0;i<6;i++){check((await act({op:'duel_start',balanceVersion:40,duelVersion:3})).action.ok,'attempt '+(i+3)+' of 8 is available');await act({op:'combat_end',outcome:'retreat'});}
 check((await act({op:'duel_start',balanceVersion:40,duelVersion:3})).action.reason==='attempts','still eight attempts per day');
}finally{await db.close()}
console.log(`Duel tempo: ${checks} checks passed; 64 frozen v2 battles, 200 verified v3 comparisons, reactive counters and SQL.`);
