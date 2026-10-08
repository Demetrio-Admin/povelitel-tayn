import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { applyAction, combatApply } from '../src/cloud/playerModel.js';
import { verifyCombat } from '../src/cloud/combatVerify.js';
import { playBot } from './helpers/combat-bot.mjs';
import { SHOP } from '../src/config/shop.js';
import { bagUsed } from '../src/config/bag.js';
import { shopQuote, shopView } from '../src/systems/shopModel.js';
import { GameState } from '../src/state/GameState.js';

const db = new PGlite(), uid = randomUUID(), q = (sql, params = []) => db.query(sql, params);
const asPlayer = async fn => {
  await db.exec('set role authenticated'); await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const snapshot = () => asPlayer(async () => (await q('select public.get_player() j')).rows[0].j);
const inventory = async items => { for (const [id, n] of Object.entries(items)) await q('insert into player_inventory(user_id,item_id,quantity) values($1,$2,$3) on conflict(user_id,item_id) do update set quantity=excluded.quantity', [uid, id, n]); };
async function act(op, args = {}, id = randomUUID()) {
  const before = await snapshot(), action = { op, ...args, id };
  const after = await asPlayer(async () => (await q('select public.player_action($1::jsonb) j', [JSON.stringify(action)])).rows[0].j);
  if (!after.action.duplicate) {
    const js = applyAction(before, action, after.vitalsAt);
    assert.equal(js.result.ok, after.action.ok, op);
    if (!after.action.ok) assert.equal(js.result.reason, after.action.reason, op);
    assert.deepEqual(js.snapshot.inventory, after.inventory, op + ' inventory');
    assert.deepEqual(js.snapshot.objects.player_bag, after.objects.player_bag, op + ' bag');
  }
  return after;
}
try {
  await db.exec(readFileSync('tools/sql/auth-stub.sql', 'utf8'));
  let previous;
  try { previous = execFileSync('git', ['show', '48c32f7:supabase/schema.sql'], { encoding: 'utf8', maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { previous = readFileSync('supabase/schema.sql', 'utf8'); }
  await db.exec(previous);
  await q('insert into auth.users(id) values($1)', [uid]); await asPlayer(() => q("select public.create_player('warlock')"));
  await inventory({ moon_herb: 289, forest_mushroom: 34, coins: 3235 });
  await q("select _bag_write($1,'{\"capacity\":100,\"pending\":{\"rune_dust\":2},\"version\":29}')", [uid]);
  await q('select _add_event($1,$2)', [uid, SHOP.requires]);
  const beforeUpgrade = await snapshot(), migration = readFileSync('supabase/migrations/20261008_shop_bag_combat.sql', 'utf8');
  await db.exec(migration); await db.exec(migration);
  const upgraded = await snapshot();
  assert.deepEqual(upgraded.inventory, beforeUpgrade.inventory); assert.deepEqual(upgraded.objects.player_bag, beforeUpgrade.objects.player_bag);
  assert.equal((await q("select (_game_rules()->'shop'->>'maxQty')::int n")).rows[0].n, SHOP.maxQty);
  console.log('✓ Repeatable upgrade preserves overfilled inventory, currencies and pending loot.');
  let s = await act('shop_sell', { item: 'moon_herb', qty: 100, price: 999999 }, 'shop-sell-100-01');
  assert.equal(s.inventory.moon_herb, 189); assert.equal(s.inventory.coins, 3735);
  s = await act('shop_sell', { item: 'moon_herb', qty: 100 }, 'shop-sell-100-01'); assert.equal(s.action.duplicate, true); assert.equal(s.inventory.coins, 3735);
  s = await act('shop_sell', { item: 'moon_herb', qty: 189 }); assert.equal(s.inventory.moon_herb, 0); assert.equal(s.inventory.coins, 4680);
  for (const qty of [1, 10]) assert.equal((await act('shop_sell', { item: 'forest_mushroom', qty })).action.ok, true);
  const beforeInvalid = await snapshot();
  for (const qty of [0, -1, 1.5, '100', SHOP.maxQty + 1]) assert.equal((await act('shop_sell', { item: 'forest_mushroom', qty })).action.reason, 'bad');
  assert.equal((await act('shop_sell', { item: 'forest_mushroom', qty: 100 })).action.reason, 'missing');
  assert.deepEqual((await snapshot()).inventory, beforeInvalid.inventory);
  assert.equal((await act('shop_buy', { item: 'moon_herb', qty: 10 })).action.ok, true);
  console.log('✓ 1/10/100 and full-stack trades use server prices; retries and invalid quantities cannot duplicate coins.');
  await inventory({ moon_herb: 100, forest_mushroom: 0 });
  await q("update player_progress set hero_level=15,hp=255,mana=205,pos_x=1100,pos_y=4900,safe_x=1100,safe_y=4900 where user_id=$1", [uid]);
  for (const id of ['telekinesis', 'fire', 'seal', 'ice']) await q('insert into player_abilities(user_id,ability_id,level,unlocked) values($1,$2,3,true) on conflict(user_id,ability_id) do update set level=3,unlocked=true', [uid, id]);
  await q("select _add_event($1,'sq_hunter_start')", [uid]);
  for (const [spawn, enemy] of [['scavenger_01', 'forest_scavenger'], ['scavenger_02', 'young_scavenger']]) {
    const pending = (await snapshot()).objects.player_bag.pending;
    const start = await act('combat_start', { spawn, enemy, balanceVersion: 30 }); assert.equal(start.action.ok, true);
    assert.deepEqual(start.objects.player_bag.pending, pending); assert.equal(bagUsed(start.inventory), 100);
    const played = playBot(start.combatCtx, { seed: 1, policy: 'smart' });
    const verified = verifyCombat(start, played.log, start.combatSince + played.log.ticks * 1000 / 60 + 1000);
    assert.equal(verified.ok, true, spawn + ": " + verified.reason); assert.equal(verified.verdict.outcome, 'victory');
    const js = combatApply(start, verified.verdict, start.vitalsAt);
    const after = (await q('select public.combat_apply($1,$2::jsonb) j', [uid, JSON.stringify(verified.verdict)])).rows[0].j;
    assert.equal(after.action.ok, true); assert.deepEqual(after.inventory, js.snapshot.inventory); assert.deepEqual(after.objects.player_bag, js.snapshot.objects.player_bag);
    assert.equal(bagUsed(after.inventory), 100);
    for (const [id, n] of Object.entries(verified.verdict.reward.items || {})) if (id !== 'coins') assert.equal(after.objects.player_bag.pending[id], (pending[id] || 0) + n);
    const repeated = (await q('select public.combat_apply($1,$2::jsonb) j', [uid, JSON.stringify(verified.verdict)])).rows[0].j;
    assert.equal(repeated.action.ok, false); assert.deepEqual(repeated.objects.player_bag, after.objects.player_bag);
  }
  assert.equal((await act('bag_claim', { item: 'rune_dust', qty: 2 })).action.reason, 'bag_full');
  await act('shop_sell', { item: 'moon_herb', qty: 10 });
  const claimed = await act('bag_claim', { item: 'rune_dust', qty: 2 }, 'shop-claim-dust-01');
  assert.equal(claimed.action.ok, true); assert.equal(claimed.inventory.rune_dust, 2);
  assert.equal((await act('bag_claim', { item: 'rune_dust', qty: 2 }, 'shop-claim-dust-01')).inventory.rune_dust, 2);
  console.log('✓ Two verified victories work with a full bag; loot accumulates safely and can be claimed once after selling.');
  const state = new GameState(null, { load: () => null, save: () => {} }); state.data.inventory = { moon_herb: 289, coins: 3235 }; state.markEvent(SHOP.requires);
  let view = shopView(state); assert.equal(shopQuote(view, 'sell', 'moon_herb', 100).total, 500); assert.equal(shopQuote(view, 'sell', 'moon_herb', 289).allowed, true);
  assert.equal(shopQuote(view, 'buy', 'moon_herb', 1).allowed, false);
  state.data.inventory.moon_herb = 90; view = shopView(state); assert.equal(shopQuote(view, 'buy', 'moon_herb', 10).allowed, true); assert.equal(shopQuote(view, 'buy', 'moon_herb', 11).allowed, false);
  console.log('✓ Shop preview respects real stock, coins and free bag capacity.');
} finally { await db.close(); }
