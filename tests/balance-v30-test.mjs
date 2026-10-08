import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { applyAction } from '../src/cloud/playerModel.js';
import { BALANCE_MIGRATION } from '../src/config/balance.progression.js';
import { serverRules } from '../src/config/serverRules.js';
import { amuletEffect } from '../src/config/build.js';
import { storyPass } from '../tools/balance/story-pass.mjs';

const db = new PGlite(), rules = serverRules(), migration = readFileSync('supabase/migrations/20261007_balance_v30.sql', 'utf8');
const q = (s, p = []) => db.query(s, p);
let uid;
const asPlayer = async fn => {
  await db.exec('set role authenticated'); await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const snapshot = () => asPlayer(async () => (await q('select public.get_player() j')).rows[0].j);
const newPlayer = async () => { uid = randomUUID(); await q('insert into auth.users(id) values($1)', [uid]); await asPlayer(() => q("select public.create_player('witch')")); return uid; };
const flags = async ids => { for (const id of ids) await q('select public._add_event($1,$2)', [uid,id]); };
const seed = async items => { for (const [id,n] of Object.entries(items)) await q('insert into public.player_inventory(user_id,item_id,quantity) values($1,$2,$3) on conflict(user_id,item_id) do update set quantity=excluded.quantity', [uid,id,n]); };
const action = async (op, args = {}) => {
  const before = await snapshot(), a = { op, ...args, id: randomUUID() };
  const after = await asPlayer(async () => (await q('select public.player_action($1::jsonb) j', [JSON.stringify(a)])).rows[0].j);
  const js = applyAction(before, a, after.vitalsAt);
  assert.equal(js.result.ok, after.action.ok, `${op}: JS/SQL result`);
  assert.equal(js.snapshot.wallet.sapphires, after.wallet.sapphires, `${op}: JS/SQL wallet`);
  assert.deepEqual(js.snapshot.inventory, after.inventory, `${op}: JS/SQL inventory`);
  assert.equal(js.snapshot.xp, after.xp); assert.equal(js.snapshot.level, after.level);
  return after;
};
try {
  await db.exec(readFileSync('tools/sql/auth-stub.sql','utf8'));
  let previous;
  try { previous = execFileSync('git',['show','c906679:supabase/schema.sql'],{encoding:'utf8',maxBuffer:2_000_000,stdio:['ignore','pipe','ignore']}); }
  catch { previous = readFileSync('supabase/schema.sql','utf8'); }
  await db.exec(previous);
  const veteran = await newPlayer();
  await q('delete from public.player_quests where user_id=$1 and quest_id=$2',[uid,BALANCE_MIGRATION.event]);
  await flags(Object.keys(BALANCE_MIGRATION.coins)); await seed({ coins: 700, moon_herb: 12, amulet_lunar: 1 });
  await q("insert into public.player_abilities(user_id,ability_id,level,unlocked) values($1,'telekinesis',2,true)",[uid]);
  await q('update public.player_progress set hero_xp=7300,hero_level=14,hp=77,mana=31 where user_id=$1',[uid]);
  const delta = Object.values(BALANCE_MIGRATION.coins).reduce((a,b)=>a+b,0);
  await db.exec(migration); let s = await snapshot();
  assert.equal(s.inventory.coins,700+delta); assert.equal(s.inventory.moon_herb,12); assert.equal(s.abilities.telekinesis.level,2);
  assert.equal(s.wallet.sapphires,2); assert.equal(s.xp,7900); assert.equal(s.level,15);
  await db.exec(migration); assert.equal((await snapshot()).inventory.coins,700+delta); assert.equal((await snapshot()).wallet.sapphires,2);
  await assert.rejects(()=>asPlayer(()=>q('select public._balance_v30($1)',[uid])),/permission denied/);
  console.log('✓ SQL migration applies missing rewards once, preserves items/gifts and reaches level 15 for completed chapter II.');
  const old = await newPlayer();
  await q('delete from public.player_quests where user_id=$1 and quest_id=$2',[uid,BALANCE_MIGRATION.event]);
  await flags(['unlock_telekinesis_1','lunar_quest_complete']); await seed({ coins: 10 });
  await q("insert into public.player_abilities(user_id,ability_id,level,unlocked) values($1,'telekinesis',1,true)",[uid]);
  await db.exec(migration); assert.equal((await snapshot()).inventory.coins,195);
  console.log('✓ Old pre-Telekinesis save receives the 195-coin safety floor.');
  await newPlayer();
  assert.equal((await action('bank_welcome')).action.reason,'locked');
  for (const id of ['sq_mushrooms','sq_resin','sq_veda_stock']) assert.equal((await action('quest_accept',{quest:id})).action.reason,'locked');
  await seed({ moon_herb: 4, forest_mushroom: 3, tree_resin: 5 });
  for (const id of ['sq_herbs','sq_mushrooms','sq_resin','sq_veda_stock']) {
    if(id==='sq_mushrooms') await flags(['fire_gate_open']);
    if(id==='sq_veda_stock') await flags(['chapter_1_complete']);
    assert.equal((await action('quest_accept',{quest:id})).action.ok,true);
    if(id==='sq_veda_stock') {
      await seed({ tree_resin: 1 }); const b = await snapshot();
      assert.equal((await action('quest_turn_in',{quest:id})).action.reason,'not_ready');
      assert.deepEqual((await snapshot()).inventory,b.inventory); await seed({ tree_resin: 2 });
    }
    assert.equal((await action('quest_turn_in',{quest:id})).action.ok,true);
    assert.equal((await action('quest_turn_in',{quest:id})).action.reason,'already');
  }
  s = await snapshot(); assert.equal(s.inventory.coins,170); assert.equal(s.xp,65); assert.equal(s.wallet.sapphires,1);
  assert.equal(s.inventory.elixir_life,2); assert.equal(s.inventory.elixir_mana,1);
  assert.equal((await action('world',{obj:'sapphire_trail_cache'})).action.reason,'locked');
  await flags(['unlock_telekinesis_1','guardian_defeated','ch2_city_arrived']);
  for(const id of ['sapphire_trail_cache','sapphire_oldwood_cache','sapphire_city_cache_1']) {
    assert.equal((await action('world',{obj:id})).action.ok,true);
    assert.equal((await action('world',{obj:id})).action.ok,false);
  }
  for(const key of ['ch2_quarter_cleared','ch2_coven_ready','chapter_2_complete']) {
    await flags(rules.events[key].requires); assert.equal((await action('event',{key})).action.ok,true);
    assert.equal((await action('event',{key})).action.reason,'already');
  }
  assert.equal((await action('world',{obj:'sapphire_city_cache_2'})).action.ok,true);
  assert.equal((await action('bank_welcome')).action.ok,true); assert.equal((await action('bank_welcome')).action.reason,'already');
  assert.equal((await snapshot()).wallet.sapphires,15);
  const rewards = await q("select sum(delta)::int n from public.sapphire_ledger where user_id=$1 and kind in ('reward','welcome')",[uid]); assert.equal(rewards.rows[0].n,15);
  const freshCoins = (await snapshot()).inventory.coins; await db.exec(migration); assert.equal((await snapshot()).inventory.coins,freshCoins);
  // Character reset retains the account wallet and ledger: no second cache payout on a new character.
  await asPlayer(()=>q("select public.reset_player('warlock')")); await flags(['unlock_telekinesis_1']);
  const resetChest = await asPlayer(async()=>(await q('select public.player_action($1::jsonb) j',[JSON.stringify({op:'world',obj:'sapphire_trail_cache',id:randomUUID()})])).rows[0].j);
  assert.equal(resetChest.wallet.sapphires,15);
  s = await action('combat_start',{spawn:'scavenger_01',enemy:'forest_scavenger',balanceVersion:30}); assert.equal(s.combatCtx.balanceVersion,30);
  console.log('✓ Veda consumes resources atomically; all nine sapphire sources total 15, with no repeat payout after retries or character reset.');
} finally { await db.close(); }
const lunar = [0,1,2,3,9].map(n=>amuletEffect('amulet_lunar',n).manaRescue.gainPct);
assert.deepEqual(lunar,[.5,.6,.7,.8,.8]);
const report = await storyPass();
assert.ok(report.first.beforeTK>=195); assert.ok(report.payments.every(p=>p.before>=p.price)); assert.equal(report.final.level,15);
assert.equal(report.fights.length,new Set(report.fights.map(f=>f.spawn)).size);
assert.equal(report.final.sapphires,7); // two plot rewards + finale; no bank, caches or side quests on this route.
console.log(`✓ Verified story route, no side quests/repeated enemies: ${report.first.coins} coins after chapter I; ${report.final.coins} after chapter II; level ${report.final.level}.`);
