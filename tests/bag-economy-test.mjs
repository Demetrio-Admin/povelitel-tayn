import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { applyAction } from '../src/cloud/playerModel.js';
import { serverRules } from '../src/config/serverRules.js';
import { bagUsed, BAG, GIFT_PRICES } from '../src/config/bag.js';

const db = new PGlite(), uid = randomUUID();
const q = (sql, params = []) => db.query(sql, params);
const asPlayer = async fn => {
  await db.exec('set role authenticated'); await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const snapshot = () => asPlayer(async () => (await q('select public.get_player() j')).rows[0].j);
const seed = async items => { for (const [id, n] of Object.entries(items)) await q('insert into public.player_inventory(user_id,item_id,quantity) values($1,$2,$3) on conflict(user_id,item_id) do update set quantity=excluded.quantity', [uid, id, n]); };
const sapphires = n => q('insert into public.player_wallet(user_id,sapphires) values($1,$2) on conflict(user_id) do update set sapphires=excluded.sapphires', [uid, n]);
const capacity = n => q("select public._bag_write($1,$2::jsonb)", [uid, JSON.stringify({ capacity: n, pending: {}, version: BAG.version })]);
const events = async ids => { for (const id of ids) await q('select public._add_event($1,$2)', [uid, id]); };
const action = async (op, args = {}, id = randomUUID()) => {
  const before = await snapshot(), act = { op, ...args, id };
  const after = await asPlayer(async () => (await q('select public.player_action($1::jsonb) j', [JSON.stringify(act)])).rows[0].j);
  if (!after.action.duplicate) {
    const js = applyAction(before, act, after.vitalsAt);
    assert.equal(js.result.ok, after.action.ok, `${op}: JS/SQL outcome`);
    if (!after.action.ok) assert.equal(js.result.reason, after.action.reason, `${op}: JS/SQL reason`);
    assert.deepEqual(js.snapshot.inventory, after.inventory, `${op}: JS/SQL inventory`);
    assert.deepEqual(js.snapshot.objects.player_bag, after.objects.player_bag, `${op}: JS/SQL bag`);
    assert.equal(js.snapshot.wallet.sapphires, after.wallet.sapphires, `${op}: JS/SQL sapphire balance`);
  }
  return after;
};
try {
  await db.exec(readFileSync('tools/sql/auth-stub.sql', 'utf8'));
  // Apply the concrete update to the previous production schema, twice.
  let previousSchema;
  try { previousSchema = execFileSync('git', ['show', 'efc3d24:supabase/schema.sql'], { encoding: 'utf8', maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { previousSchema = readFileSync('supabase/schema.sql', 'utf8'); } // Shallow CI checkout: still verify existing-data preservation and repeatability.
  await db.exec(previousSchema);
  await q('insert into auth.users(id) values($1)', [uid]);
  await asPlayer(() => q("select public.create_player('witch')"));
  await seed({ moon_herb: 275, coins: 2608, amulet_lunar: 1, lunar_flame: 3 }); await sapphires(3);
  await q("insert into public.player_abilities(user_id,ability_id,level,unlocked) values($1,'fire',3,true)", [uid]);
  const migration = readFileSync('supabase/migrations/20261007_bag_gift_economy.sql', 'utf8');
  await db.exec(migration); await db.exec(migration);
  let s = await snapshot();
  assert.equal(s.inventory.moon_herb, 275); assert.equal(s.inventory.coins, 2608); assert.equal(s.wallet.sapphires, 3); assert.equal(s.abilities.fire.level, 3);
  assert.equal(s.objects.player_bag.capacity, 100); assert.equal(bagUsed(s.inventory), 275);
  console.log('✓ Repeatable migration preserves old overfilled bags, wallets and learned gifts.');
  const forged = await asPlayer(async () => (await q('select public.sync_player($1::jsonb) j', [JSON.stringify({ objects: { player_bag: { capacity: 99999, pending: { cold_heart: 99 } } }, sapphires: 99999 })])).rows[0].j);
  assert.equal(forged.objects.player_bag.capacity, 100); assert.deepEqual(forged.objects.player_bag.pending, {}); assert.equal(forged.wallet.sapphires, 3);
  await assert.rejects(() => asPlayer(() => q("select public._bag_write($1,'{}')", [uid])), /permission denied/);
  console.log('✓ Browser sync and direct helper calls cannot forge capacity, rewards or money.');
  await db.exec(readFileSync('supabase/migrations/20261007_balance_v30.sql', 'utf8'));
  // v0.32.0: курс 1 ₽ = 10 сапфиров — последняя схема перекрывает правила миграции v0.30 (цены в сапфирах ×10) и один раз умножает кошелёк
  await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
  await sapphires(700);
  const buyId = 'expand-bag-test-01'; s = await action('bag_expand', { price: 0, increment: 99999 }, buyId);
  assert.equal(s.objects.player_bag.capacity, 150); assert.equal(s.wallet.sapphires, 400);
  s = await action('bag_expand', {}, buyId); assert.equal(s.action.duplicate, true); assert.equal(s.objects.player_bag.capacity, 150); assert.equal(s.wallet.sapphires, 400);
  for (let i=0;i<25;i++) await action('bag_discard', { item: 'coins', qty: 1 });
  s = await action('bag_expand', {}, buyId); assert.equal(s.action.duplicate, true); assert.equal(s.objects.player_bag.capacity, 150); assert.equal(s.wallet.sapphires, 400);
  await sapphires(0); s = await action('bag_expand'); assert.equal(s.action.reason, 'sapphires'); assert.equal(s.objects.player_bag.capacity, 150);
  console.log('✓ +50 places costs exactly 300 sapphires, retries never charge twice, insufficient funds do not change capacity.');
  await q('delete from public.player_inventory where user_id=$1', [uid]); await seed({ moon_herb: 100, coins: 20000 }); await capacity(100);
  const gather = Object.entries(serverRules().world).find(([, r]) => r.kind === 'gather' && !r.requires.length && !r.requiresEnemy.length);
  assert.ok(gather);
  const before = await snapshot(); s = await action('world', { obj: gather[0] }); assert.equal(s.action.reason, 'bag_full'); assert.equal(s.mana, before.mana); assert.equal(s.objects[gather[0]], undefined);
  await events([serverRules().shop.requires]); s = await action('shop_buy', { item: 'moon_herb', qty: 1 }); assert.equal(s.action.reason, 'bag_full'); assert.equal(s.inventory.coins, 20000);
  s = await action('bag_discard', { item: 'coins', qty: 1 }); assert.equal(s.action.reason, 'bad');
  for (const qty of [-1, 0, 1.5, '1', 1e12]) assert.equal((await action('bag_discard', { item: 'moon_herb', qty })).action.reason, 'bad');
  console.log('✓ Full-bag gathering and buying roll back mana, coins and world marks; currency cannot be discarded.');
  await events(['ch2_city_arrived','ch2_plaza_cleared']); s = await action('event', { key: 'ch2_met_ilaria' }); assert.ok(s.action.ok); assert.equal(s.objects.player_bag.pending.frost_herb, 1); assert.equal(bagUsed(s.inventory), 100);
  s = await action('combat_start', { spawn: 'bad', enemy: 'bad' }); assert.equal(s.action.reason, 'bag_pending');
  s = await action('bag_claim', { item: 'frost_herb', qty: 1 }); assert.equal(s.action.reason, 'bag_full'); assert.equal(s.objects.player_bag.pending.frost_herb, 1);
  s = await action('bag_discard', { item: 'moon_herb', qty: 1 }); assert.ok(s.action.ok);
  s = await action('bag_claim', { item: 'frost_herb', qty: 1 }, 'claim-bag-test-01'); assert.ok(s.action.ok); assert.deepEqual(s.objects.player_bag.pending, {}); assert.equal(bagUsed(s.inventory), 100);
  s = await action('bag_claim', { item: 'frost_herb', qty: 1 }, 'claim-bag-test-01'); assert.equal(s.inventory.frost_herb, 1);
  // A full bag still allows crafting when consuming ingredients creates space.
  await seed({ forest_mushroom: 1, moon_herb: 99, frost_herb: 0 });
  s = await action('craft', { recipe: 'elixir_life' }); assert.ok(s.action.ok); assert.ok(bagUsed(s.inventory) < 100);
  console.log('✓ Guaranteed rewards wait safely; claiming is atomic, repeat-safe, and normal crafting can free space.');
  await capacity(1000); await seed({ coins: 20000, crimson_ember: 6, lunar_shard: 30, rune_dust: 10, moon_herb: 2 });
  await q("update public.player_progress set hero_level=8,school_xp='{"+'"fire":1000,"telekinesis":1000,"seal":1000,"ice":1000'+"}' where user_id=$1", [uid]);
  await q("update public.player_abilities set level=1 where user_id=$1 and ability_id='fire'", [uid]);
  await sapphires(599); const preResearch = await snapshot(); s = await action('research_start', { upgrade: 'fire_2' }); assert.equal(s.action.reason, 'sapphires'); assert.equal(s.inventory.coins, preResearch.inventory.coins); assert.equal(s.inventory.crimson_ember, 6); assert.equal(s.school.fire, 1000); assert.equal(s.research, null);
  await sapphires(600); s = await action('research_start', { upgrade: 'fire_2' }, 'gift-fire-2-test-01'); assert.ok(s.action.ok); assert.equal(s.inventory.coins, 18000); assert.equal(s.wallet.sapphires, 0); assert.equal(s.inventory.crimson_ember, 0); assert.equal(s.school.fire, 820);
  s = await action('research_start', { upgrade: 'fire_2' }, 'gift-fire-2-test-01'); assert.equal(s.action.duplicate, true); assert.equal(s.inventory.coins, 18000);
  await q("update public.player_progress set research=jsonb_set(research,'{startedAt}','0') where user_id=$1", [uid]);
  s = await action('research_finish'); assert.equal(s.abilities.fire.level, 2);
  assert.deepEqual(GIFT_PRICES.tier3, { coins: 10000, sapphires: 2000 });
  console.log('✓ Gift research charges both currencies, materials and XP once; refusal is atomic and completion raises the gift.');
  await events(['ch2_quarter_cleared']); await seed({ coins: 500 }); await sapphires(0);
  s = await action('event', { key: 'unlock_ice_2' }); assert.ok(s.action.ok); assert.equal(s.abilities.ice.level, 2); assert.equal(s.inventory.coins, 0); assert.equal(s.wallet.sapphires, 0);
  await events(['ch2_fin_tk', 'ch2_fin_fire', 'ch2_fin_ice', 'ch2_fin_seal']); await seed({ coins: 1499 });
  s = await action('event', { key: 'ch2_ice3_shard' }); assert.equal(s.action.reason, 'missing'); assert.equal(s.abilities.ice.level, 2);
  await seed({ coins: 1500 }); s = await action('event', { key: 'ch2_ice3_shard' }); assert.ok(s.action.ok); assert.equal(s.inventory.coins, 0); assert.equal(s.abilities.ice.level, 3);
  console.log('✓ Nerys story upgrades require the stated coins and no sapphires; no free event bypass.');
  await capacity(150);
  s = await asPlayer(async () => (await q("select public.reset_player('warlock') j")).rows[0].j);
  assert.equal(s.objects.player_bag.capacity, 150); assert.deepEqual(s.objects.player_bag.pending, {});
  console.log('✓ Paid capacity survives character reset; pending rewards and old items reset normally.');
} catch (error) { console.error(error); throw error; } finally { await db.close(); }
