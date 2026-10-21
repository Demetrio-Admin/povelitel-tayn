import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { applyAction, emptySnapshot, combatApply, fillDefaults } from '../src/cloud/playerModel.js';
import { startState, verifyCombat } from '../src/cloud/combatVerify.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { statsFor } from '../src/systems/abilityStats.js';
import { RECIPES } from '../src/config/recipes.js';
import { AMULETS, AMULET_UPGRADES, amuletEffect } from '../src/config/build.js';
import { POTIONS, potionLoadout } from '../src/config/resources.js';
import { ASSET_FILES } from '../src/config/assets.manifest.js';
import { CITY_GATHERING } from '../src/config/cityGathering.js';
import { SAPPHIRE_DROPS } from '../src/config/sapphireDrops.js';
import { UPGRADES } from '../src/config/balance.progression.js';
import { duelEnemyDef } from '../src/config/duel.js';
import { Enemy } from '../src/objects/Enemy.js';
import { playBot } from './helpers/combat-bot.mjs';
let checks=0;const check=(condition,label)=>{assert.ok(condition,label);checks++;};
const wins=['scavenger_01','forest_guardian_01','node_trial','fq_guardian','final_severin','fw_alpha'];
const zero=()=>.999999;
function context(level=15) { return { spawn:'fw_wolf_1',enemy:'frost_wolf',level,balanceVersion:38,abilities:Object.fromEntries(['telekinesis','fire','seal','ice','storm'].map(id=>[id,{level:5,unlocked:true}])), hp:255,mana:205,potions:Object.fromEntries(Object.keys(POTIONS).map(id=>[id,10])), potionLoadout:['potion_life_regen','potion_mana_regen','potion_crystal_shield','stabilizing_potion'], build:{slots:['telekinesis','fire','storm'],amulets:[],branches:{telekinesis:'breaker',fire:'arsonist',storm:'discharge'}} }; }
function battle(ctx=context()) { const state=startState(ctx,1000); return new CombatManager({enemyType:ctx.enemy,state,abilities:new AbilitySystem(state,null,null)}); }
try {
 check(duelEnemyDef({level:15,name:'Гроза',abilities:{storm:{level:5,unlocked:true}},build:{slots:['storm']}}).strongAttack.damage>0,'storm snapshot remains valid in asynchronous duel');
 check(Object.values(RECIPES).every(r=>r.amount===1),'one craft always yields one item');
 check(RECIPES.potion_life_regen.needs.coins===25 && RECIPES.potion_mana_regen.needs.coins===30,'agreed regeneration fees');
 check(Object.keys(AMULETS).length===9 && AMULET_UPGRADES.map(x=>x.coins).join() === '1000,5000,15000,40000,100000','nine amulets and unchanged coin chain');
 check(CITY_GATHERING.length===12 && CITY_GATHERING.every(o=>o.texture in ASSET_FILES),'city nodes use real textures');
 check(['fw_cache','gy_cache'].every(id=>SAPPHIRE_DROPS.world[id].amount===25),'guarded expedition sapphires');
 check(Object.keys(UPGRADES).filter(k=>/^(telekinesis|fire|seal|ice)_[45]_/.test(k)).length===16,'16 advanced studies');
 for(const id of ['telekinesis','fire','seal','ice'])for(const branch of Object.keys((await import('../src/config/balance.abilities.js')).ABILITIES[id].branches))for(const lv of [4,5]) check(statsFor(id,lv,branch).label.endsWith(lv===4?'IV':'V'),`${id} ${branch} ${lv}`);
 {
  const cm=battle();cm.hero.hp=1;cm.hero.mana=1;cm.hero.regen=0;
  check(cm.usePotion('potion_life_regen').ok,'regeneration starts');
  check(cm.usePotion('potion_mana_regen').reason==='cooldown','restoratives share cooldown');
  for(let i=0;i<360;i++)cm.tick(1/60,{holdEnemy:true});
  check(Math.abs(cm.hero.hp-121)<1e-6,'health regeneration totals exactly 120');
  for(let i=0;i<241;i++)cm.tick(1/60,{holdEnemy:true});
  check(cm.usePotion('potion_mana_regen').ok,'mana regeneration starts after cooldown');
  for(let i=0;i<600;i++)cm.tick(1/60,{holdEnemy:true});
  check(Math.abs(cm.hero.mana-121)<1e-6,'mana regeneration totals exactly 120');
  check(cm.usePotion('elixir_life').reason==='benched','server frozen quick types enforced');
 }
 {
  const cm=battle();cm.usePotion('potion_crystal_shield');const hp=cm.hero.hp;cm.hitHero(50,false);check(cm.hero.hp===hp && cm.shields.potion.amount===20,'shield absorbs before health');cm.hitHero(50,false);check(cm.hero.hp===hp-30,'shield only absorbs remaining capacity');
 }
 {
  const cm=battle();cm.enemy.hp=cm.enemy.maxHp=10000;
  for(const id of ['fire','telekinesis','fire']) {cm.cooldowns[id]=0;cm.hero.mana=205;cm.useAbility(id);}
  check(cm.stormCharges===3,'one charge per direct application');
  cm.tick(.1);check(cm.stormCharges===3,'periodic damage adds no charge');
  cm.hero.mana=205;check(cm.useAbility('storm').ok && cm.stormCharges===0,'storm spends charges');
  check(cm.drainEvents().filter(e=>e.type==='damage'&&e.school==='storm').length===2,'full discharge extra hit');
 }
 {
  const e=new Enemy('test',{name:'Test',hp:1000,arena:'duel'},true); e.shield=100; e.takeDamage(80,'seal',1,{shieldPierce:.75});check(e.hp===940 && e.shield===80,'piercer bypasses absorbing shield');
  e.applyBurn(5,10,3,.4); e.applyBurn(5,10,3,.4);e.applyBurn(5,10,3,.4);check(e.burnStacks.length===3,'independent burn layers');e.hp=500;check(e.heal(100)===60,'antiheal works only on burning enemy');
 }
 const db=new PGlite();const q=(s,p=[])=>db.query(s,p);const uid=randomUUID();
 const as=async f=>{await db.exec('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);try{return await f()}finally{await db.exec('reset role')}};
 const snap=()=>as(async()=> (await q('select get_player() j')).rows[0].j);
 const seed=async items=>{for(const[k,n]of Object.entries(items))await q('insert into player_inventory(user_id,item_id,quantity)values($1,$2,$3)on conflict(user_id,item_id)do update set quantity=excluded.quantity',[uid,k,n]);};
 async function act(op,args={}){const before=await snap(), a={op,...args,id:randomUUID()};const result=await as(async()=>(await q('select player_action($1::jsonb) j',[JSON.stringify(a)])).rows[0].j);const mirror=applyAction(before,a,result.vitalsAt,()=>result.action.sapphires>0?0:.999999);assert.equal(mirror.result.ok,result.action.ok,op+' SQL result');assert.equal(mirror.result.reason,result.action.reason,op+' reason');assert.deepEqual(mirror.snapshot.inventory,result.inventory,op+' inventory');assert.equal(mirror.snapshot.wallet.sapphires,result.wallet.sapphires,op+' wallet');return result;}
 try {
  await db.exec(fs.readFileSync('tools/sql/auth-stub.sql','utf8'));
  await db.exec(fs.readFileSync('tests/fixtures/rebalance-baseline-schema.sql','utf8'));
  await q('insert into auth.users(id)values($1)',[uid]);await as(()=>q("select create_player('witch')"));
  const migration=fs.readFileSync('supabase/migrations/20261021_rebalance_recovery.sql','utf8');await db.exec(migration);await db.exec(migration);
  check(true,'migration applies twice over deployed schema');
  await seed({coins:1000000,moon_herb:20,forest_mushroom:20,tree_resin:20,rune_dust:20,lunar_shard:20,frost_herb:20,ice_crystal:20,reinforced_resin:20,crafting_core:20,frost_shard:20,amulet_focus:1,amulet_embers:1});
  await q("select _bag_write($1,'{\"capacity\":1000,\"pending\":{},\"version\":29}')",[uid]);
  for(const ev of ['ch2_city_arrived','ch2_nerys_met','ch2_lab_open','ch2_quarter_cleared'])await q('select _add_event($1,$2)',[uid,ev]);
  await q('update player_progress set hero_level=15,hero_xp=7900,hp=1,mana=1,vitals_at=now() where user_id=$1',[uid]);
  check((await act('craft',{recipe:'potion_life_medium'})).action.ok,'fixed potion craft SQL');
  check((await act('drink',{item:'potion_life_medium'})).action.ok,'fixed outside drink SQL');
  check((await act('drink',{item:'potion_life_medium'})).action.reason==='none','empty flask not consumed');
  await seed({potion_mana_medium:2});check((await act('drink',{item:'potion_mana_medium'})).action.reason==='cooldown','cross-kind outside cooldown SQL');
  check((await act('world',{obj:'fq_cauldron'})).action.sapphires===20,'optional study: one-time 20 sapphires');
  check((await act('craft',{recipe:'potion_life_regen'})).action.ok,'regeneration study unlocks recipe');
  check((await act('world',{obj:'fq_cauldron'})).action.reason==='done','study cannot repeat');
  check((await act('amulet_upgrade',{amulet:'amulet_focus'})).action.reason==='progress','amulet victory gate SQL');
  for(const id of wins)await q("insert into player_world(user_id,kind,key,data)values($1,'enemy',$2,'{}')on conflict do nothing",[uid,id]);
  await q('select admin_grant_sapphires($1,50000,\'test\',\'test\')',[uid]);
  for(let i=0;i<5;i++)check((await act('amulet_upgrade',{amulet:'amulet_embers'})).action.ok,'sapphire amulet step '+i);
  check((await act('amulet_upgrade',{amulet:'amulet_embers'})).action.reason==='max','max amulet SQL');
  await q("select _unlock_ability($1,'fire',3)",[uid]);await q("select _merge_build($1,'{\"branches\":{\"fire\":\"arsonist\"}}')",[uid]);
  await q("update player_progress set school_xp=school_xp||'{\"fire\":5000}' where user_id=$1",[uid]);
  check((await act('research_start',{upgrade:'fire_4_blaster'})).action.reason==='event','cannot silently switch branch while buying IV');
  check((await act('research_start',{upgrade:'fire_4_arsonist'})).action.ok,'advanced study SQL');
  await q("update player_progress set research=jsonb_set(research,'{startedAt}','0') where user_id=$1",[uid]);
  check((await act('research_finish')).abilities.fire.level===4,'advanced study finishes at IV');
  check((await act('potion_loadout',{potions:['potion_life_regen','potion_mana_medium','potion_crystal_shield']})).action.ok,'quick slots SQL');
  check((await act('potion_loadout',{potions:['elixir_life','elixir_life']})).action.reason==='bad','duplicate quick slot rejected');
  check((await act('combat_start',{spawn:'scavenger_01',enemy:'forest_scavenger',balanceVersion:38})).combatCtx.balanceVersion===38,'server stamps new version');
  check((await act('potion_loadout',{potions:[]})).action.reason==='combat','loadout frozen in combat');await act('combat_end',{outcome:'retreat'});
  await q('select setseed(.2)');let zeroCycle;for(let i=0;i<80;i++){const n=(await q("select _active_sapphire_drop($1,'world','city_gather_moon_01',$2,$3) n",[uid,'test-'+i,'test-'+i])).rows[0].n;if(Number(n)===0)zeroCycle='test-'+i;}
  check(!!zeroCycle,'zero rolls are persisted');const before=(await snap()).wallet.sapphires;
  await q("select _active_sapphire_drop($1,'world','city_gather_moon_01',$2,$2)",[uid,zeroCycle]);check((await snap()).wallet.sapphires===before,'zero cannot reroll');
  const rows=(await q('select count(*) n from player_sapphire_drops where user_id=$1',[uid])).rows[0].n;check(Number(rows)===81,'one receipt per cycle including study');
  check((await q("select has_table_privilege('authenticated','public.player_sapphire_drops','select') s")).rows[0].s===false,'private receipt ACL');
  const old=await snap();const forged=await as(async()=>(await q("select sync_player($1::jsonb) j",[JSON.stringify({objects:{potion_state:{restoreReadyAt:0},player_build:{potions:[]}}})])).rows[0].j);assert.deepEqual(forged.objects.potion_state,old.objects.potion_state);check(true,'client sync cannot forge cooldown');
  await q("select _add_event($1,'chapter_2_complete')",[uid]);await q("select _unlock_ability($1,'telekinesis',2)",[uid]);await q("select _unlock_ability($1,'ice',3)",[uid]);
  await act('build_set',{slots:['telekinesis','fire','ice']});
  await q('update player_progress set hp=255,mana=205 where user_id=$1',[uid]);
  const start=await act('combat_start',{spawn:'fw_wolf_1',enemy:'frost_wolf',balanceVersion:38});
  const bot=playBot(start.combatCtx,{policy:'smart',seed:1});assert.equal(bot.cm.result,'victory');
  const now=(start.combatSince||0)+bot.log.ticks/60*1000+1000;
  const verified=verifyCombat(fillDefaults(start).snapshot,bot.log,now);assert.ok(verified.ok);
  const verdict={...verified.verdict,reward:{...verified.verdict.reward,sapphires:999999}};
  const settled=(await q('select combat_apply($1,$2::jsonb) j',[uid,JSON.stringify(verdict)])).rows[0].j;
  check(settled.action.ok && (settled.action.sapphires||0)<=8,'SQL combat uses configured source amount');
  const settledAgain=(await q('select combat_apply($1,$2::jsonb) j',[uid,JSON.stringify(verdict)])).rows[0].j;
  check(settledAgain.action.reason==='no_combat' && settledAgain.wallet.sapphires===settled.wallet.sapphires,'SQL battle cannot settle twice');
  // Verified modern replay: terminal result, then service applies exactly once. No client sapphire amount accepted.
  const s=emptySnapshot();s.level=15;s.xp=7900;s.vitalsAt=1000;s.hp=255;s.mana=205;s.abilities=context().abilities;s.objects.player_build={slots:['telekinesis','fire','storm'],amulets:[],branches:{telekinesis:'breaker',fire:'arsonist',storm:'discharge'}};
  let run=applyAction(s,{op:'combat_start',spawn:'scavenger_01',enemy:'forest_scavenger',balanceVersion:38},1000,zero).snapshot;
  const play=playBot(run.combatCtx,{seed:1,policy:'smart'});const v=verifyCombat(run,play.log,1000+play.log.ticks/60*1000+1000);check(v.ok,'new server replay accepted');
  const applied=combatApply(run,{...v.verdict,reward:{...v.verdict.reward,sapphires:999999}},1000+play.log.ticks/60*1000+1000,()=>0);
  check(applied.snapshot.wallet.sapphires===2,'combat amount comes from source rule');check(combatApply(applied.snapshot,v.verdict,100000,()=>0).result.reason==='no_combat','battle applies once');
 } finally {await db.close();}
 console.log(`Rebalance recovery: ${checks} meaningful checks passed`);
} catch(e) {console.error(e.stack?.split('\n').slice(0,7).join('\n')||e.message);if(e.where)console.error(e.where);process.exitCode=1;}
