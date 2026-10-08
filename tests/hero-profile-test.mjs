import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { ENEMIES } from '../src/config/balance.enemies.js';
import { ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { GameState } from '../src/state/GameState.js';
import { localHeroProfile, heroProfileView } from '../src/systems/heroProfile.js';

const db = new PGlite(), q = (sql, params=[]) => db.query(sql,params);
const migration=readFileSync('supabase/migrations/20261008_hero_profiles.sql','utf8');
const as = async (uid, fn) => {
  await db.exec('set role authenticated');
  await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const rpc = (uid, id=null) => as(uid, async()=> (await q('select public.hero_profile($1) j',[id])).rows[0].j);
const make = async (nick=null) => {
  const uid=randomUUID(); await q('insert into auth.users(id) values($1)',[uid]);
  await as(uid,()=>q("select public.create_player('warlock')"));
  if(nick)await q('update public.profiles set nickname=$2,nickname_normalized=lower($2),registered_at=now() where id=$1',[uid,nick]);
  return uid;
};
try {
  await db.exec(readFileSync('tools/sql/auth-stub.sql','utf8'));
  await db.exec(execFileSync('git',['show','HEAD:supabase/schema.sql'],{encoding:'utf8',maxBuffer:2_000_000}));
  await db.exec(readFileSync('supabase/migrations/20261004_game_chat.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261004_chat_roles_v2.sql','utf8'));
  // Existing installations have the older coven response without playerId.
  await db.exec(readFileSync('supabase/migrations/20261007_covens.sql','utf8').replace("'playerId', p.player_id::text, ",''));
  const veteran=await make('Veteran');
  const guardian=ENEMY_SPAWNS.find(s=>s.enemy==='forest_guardian');
  await q("insert into public.player_world(user_id,kind,key,data) values($1,'enemy',$2,'{}')",[veteran,guardian.id]);
  await db.exec(migration); await db.exec(migration);
  const old=await rpc(veteran);
  assert.equal(old.strongest.enemy,'forest_guardian');assert.equal(old.strongest.wonAt,null);assert.equal(old.strongest.heroLevel,null);
  assert.equal(old.uniqueWins,1);
  const rows=await q('select * from public.hero_enemy_catalog');
  assert.equal(rows.rows.length,Object.keys(ENEMIES).length);
  for(const r of rows.rows){assert.equal(r.level,ENEMIES[r.enemy].level);assert.equal(r.rank,ENEMIES[r.enemy].rank);assert.equal(r.difficulty,ENEMIES[r.enemy].difficulty);}
  assert.equal((await q('select count(*) n from public.hero_enemy_spawns')).rows[0].n,ENEMY_SPAWNS.length);
  const player=await make('Player'),viewer=await make('Viewer'),guest=await make();
  await q("insert into public.player_quests(user_id,quest_id,status) values($1,'ch2_coven_ready','done')",[player]);
  const coven=await as(player,async()=> (await q("select public.coven_request('create','{\"name\":\"Лунный круг\"}') j")).rows[0].j);
  assert.equal(coven.ok,true);assert.ok(coven.coven.members[0].playerId,'migration patches old coven response with public player ID');
  await q("update public.coven_members set week_start=date_trunc('week',now() at time zone 'UTC')::date,week_given=85 where user_id=$1",[player]);
  await q('update public.player_progress set hero_level=14,hero_xp=7300 where user_id=$1',[player]);
  await q("insert into public.player_inventory(user_id,item_id,quantity) values($1,'coins',98765)",[player]);
  await q('update public.player_wallet set sapphires=87654 where user_id=$1',[player]);
  for(const id of ['telekinesis','fire','seal','ice']) await q('insert into public.player_abilities(user_id,ability_id,level,unlocked) values($1,$2,3,true)',[player,id]);
  const boss=ENEMY_SPAWNS.find(s=>s.enemy==='severin_boss');
  const start=async(spawn,enemy)=>as(player,async()=> (await q('select public.player_action($1::jsonb) j',[JSON.stringify({op:'combat_start',spawn,enemy,balanceVersion:30,id:randomUUID()})])).rows[0].j);
  const context=await start(boss.id,boss.enemy);
  await assert.rejects(()=>as(player,()=>q('select public.combat_apply($1,$2::jsonb)',[player,JSON.stringify({outcome:'victory'})])),/permission denied/);
  await assert.rejects(()=>as(player,()=>q("insert into public.hero_victories(user_id,enemy,spawn) values($1,'severin_boss',$2)",[player,boss.id])),/permission denied/);
  await assert.rejects(()=>as(viewer,()=>q('select * from public.hero_victories')),/permission denied/);
  const verdict={outcome:'victory',since:context.combatSince,spawn:boss.id,reward:{heroXP:600},potions:{},mana:100};
  const after=(await q('select public.combat_apply($1,$2::jsonb) j',[player,JSON.stringify(verdict)])).rows[0].j;
  assert.equal(after.action.ok,true);assert.equal(after.level,15);
  const id=(await q('select player_id from public.profiles where id=$1',[player])).rows[0].player_id;
  const profile=await rpc(viewer,id);
  assert.equal(profile.self,false);assert.equal(profile.strongest.enemy,'severin_boss');assert.equal(profile.strongest.heroLevel,14);assert.ok(profile.strongest.wonAt);
  assert.equal(profile.uniqueWins,1);assert.equal(profile.abilities.ice.level,3);
  assert.deepEqual(profile.coven,{name:'Лунный круг',role:'leader',given:85});
  assert.equal(heroProfileView(profile).gifts.filter(g=>g.active).length,3,'public profile uses default slots when no build is saved');
  for(const key of ['wallet','inventory','coins','sapphires','user_id','combatCtx','hp','mana','password'])assert.equal(Object.hasOwn(profile,key),false,key);
  assert.equal((await q('select public.combat_apply($1,$2::jsonb) j',[player,JSON.stringify(verdict)])).rows[0].j.action.ok,false);
  await as(player,()=>q('select public.sync_player($1::jsonb)',[JSON.stringify({objects:{fake_record:{enemy:'severin_boss',rank:99999}},enemies:[guardian.id]})]));
  assert.equal((await rpc(viewer,id)).uniqueWins,1);
  const weak=ENEMY_SPAWNS.find(s=>s.enemy==='forest_scavenger');
  const c2=await start(weak.id,weak.enemy);
  await q('select public.combat_apply($1,$2::jsonb)',[player,JSON.stringify({outcome:'defeat',since:c2.combatSince,spawn:weak.id,potions:{}})]);
  assert.equal((await rpc(viewer,id)).uniqueWins,1);
  const guestId=(await q('select player_id from public.profiles where id=$1',[guest])).rows[0].player_id;
  assert.equal((await rpc(viewer,guestId)).reason,'not_found');assert.equal((await rpc(guest)).self,true);
  await q("update public.profiles set last_seen_at=now()-interval '1 day' where id=$1",[player]);
  assert.equal((await rpc(viewer,id)).online,false);await as(player,()=>q('select public.hero_presence()'));
  assert.equal((await rpc(viewer,id)).online,true);
  await db.exec('set role anon');
  try { await assert.rejects(()=>q('select public.hero_profile()'),/permission denied/); }
  finally { await db.exec('reset role'); }
  await db.exec(migration);assert.equal((await rpc(viewer,id)).uniqueWins,1);
  // A fresh install of schema.sql includes the same RPCs and catalog.
  await db.exec(readFileSync('supabase/schema.sql','utf8'));
  assert.equal((await rpc(viewer,id)).strongest.heroLevel,14);
  console.log('✓ SQL: old wins restored without invented dates; verified boss win records pre-reward level; permissions, retry, defeat, presence, private wallet, coven roles/IDs and reruns passed.');
}finally{await db.close();}
const state=new GameState();state.unlockAbility('telekinesis',3);state.unlockAbility('fire',2);state.unlockAbility('seal',1);state.unlockAbility('ice',1);
state.data.defeatedEnemies=ENEMY_SPAWNS.filter(s=>['forest_scavenger','severin_boss'].includes(s.enemy)).map(s=>s.id);
state.data.wallet.sapphires=17;state.data.inventory.lunar_shard=999;
const view=heroProfileView(localHeroProfile(state));
assert.equal(view.gifts.filter(g=>g.active).length,3);assert.equal(view.strongest.name,'Северин Вейр');
assert.equal(view.uniqueWins,2);assert.equal(view.gifts.find(g=>g.id==='seal').icon,'icon_seal');
console.log('✓ Profile model: unique kinds, gift icons and default combat slots passed.');
