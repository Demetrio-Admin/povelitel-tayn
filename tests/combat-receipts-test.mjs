import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { handle } from '../src/cloud/combatHandler.js';
import { COMBAT_RECEIPT_TTL_MS, isCombatId, readPendingCombat } from '../src/cloud/combatReceipt.js';
import { PlayerSession, TOKENS_KEY } from '../src/cloud/PlayerSession.js';
import { SupabaseApi } from '../src/cloud/api.js';
import { GameState } from '../src/state/GameState.js';
import { STEP } from '../src/systems/combatReplay.js';
import { playBot } from './helpers/combat-bot.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const db = new PGlite();
const call = async (query, args = []) => (await db.query(query, args)).rows[0]?.value;
const asUser = (uid, query, args = []) => db.transaction(async tx => {
  await tx.exec('set local role authenticated');
  await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  return (await tx.query(query, args)).rows[0]?.value;
});
const act = (uid, action) => asUser(uid, 'select public.player_action($1::jsonb) as value', [{ id: randomUUID(), ...action }]);
const createPlayer = async () => {
  const uid = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [uid]);
  await asUser(uid, "select public.create_player('witch') as value");
  await db.query("insert into public.player_abilities(user_id, ability_id, level, unlocked) values ($1, 'telekinesis', 2, true), ($1, 'fire', 1, true)", [uid]);
  await db.query("update public.player_progress set hero_level = 5, hero_xp = 500 where user_id = $1", [uid]);
  await db.query("insert into public.player_inventory(user_id, item_id, quantity) values ($1, 'coins', 30), ($1, 'elixir_life', 3), ($1, 'elixir_mana', 2)", [uid]);
  return uid;
};
const auditCount = uid => call('select count(*)::int as value from game_admin.combats where user_id = $1', [uid]);
const start = (uid, spawn = 'rootling_01') => act(uid, { op: 'combat_start', spawn, enemy: 'rootling', balanceVersion: 40 });
const snapshot = uid => call('select public.combat_load($1) as value', [uid]);
const env = { SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
let clock = Date.now();
let pauseLookups = null;
let finishes = 0;
const tokens = new Map();

async function edgeFetch(url, options) {
  const route = new URL(url).pathname;
  const actor = tokens.get(options.headers.Authorization?.replace('Bearer ', ''));
  if (route === '/auth/v1/user') return actor ? reply({ id: actor }) : reply(null, 401);
  const { uid, fight_id, verdict } = JSON.parse(options.body);
  if (route.endsWith('/combat_load')) return reply(await snapshot(uid));
  if (route.endsWith('/combat_apply')) return reply(await call('select public.combat_apply($1, $2) as value', [uid, verdict]));
  if (route.endsWith('/combat_result')) {
    const result = await call('select public.combat_result($1, $2) as value', [uid, fight_id]);
    await pauseLookups?.();
    return reply(result);
  }
  if (route.endsWith('/combat_finish')) {
    finishes++;
    return reply(await call('select public.combat_finish($1, $2, $3) as value', [uid, fight_id, verdict]));
  }
  throw new Error(route);
}

function edge(token, body) {
  return handle(new Request(env.SUPABASE_URL + '/functions/v1/combat', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }), env, edgeFetch, () => clock);
}
const result = async (token, body) => (await edge(token, body)).json();
function replay(fight, options) {
  const played = playBot(fight.combatCtx, options);
  clock = fight.combatSince + Math.ceil(played.log.ticks * STEP * 1000) + 500;
  return played;
}

try {
  const files = JSON.parse(read('supabase/fresh-install.json'));
  const receiptMigration = files.at(-1);
  await db.exec(read('tools/sql/auth-stub.sql'));
  for (const file of files.slice(0, -1)) await db.exec(read(`supabase/${file}`));

  const legacy = await createPlayer();
  const old = await start(legacy, 'rootling_03');
  assert.equal(old.combatCtx.combatId, undefined);
  await db.exec(read(`supabase/${receiptMigration}`));
  await db.exec(read(`supabase/${receiptMigration}`));
  const legacySync = await asUser(legacy, "select public.sync_player('{}') as value");
  assert.equal(legacySync.combatCtx.combatId, undefined, 'old active context survives migration and sync');
  tokens.set('old', legacy);
  const legacyPlay = replay(old, { seed: 11 });
  assert.equal((await result('old', { log: legacyPlay.log })).action.outcome, 'victory');

  const uid = await createPlayer();
  const other = await createPlayer();
  tokens.set('original-device', uid);
  tokens.set('other-device', uid);
  tokens.set('other-account', other);
  const idRequest = { op: 'combat_start', spawn: 'rootling_01', enemy: 'rootling', balanceVersion: 40, id: randomUUID() };
  const original = await act(uid, idRequest);
  const combatId = original.combatCtx.combatId;
  assert.ok(isCombatId(combatId));
  assert.equal((await act(uid, idRequest)).combatCtx.combatId, combatId, 'retry of start keeps its ID');
  assert.equal((await result('other-account', { combatId })).action.reason, 'result_unavailable');
  assert.equal((await edge('wrong-token', { combatId })).status, 401);
  assert.equal((await edge('original-device', { combatId: 'invalid-id' })).status, 400);
  assert.equal((await result('original-device', { combatId })).action.reason, 'result_pending');

  const store = new Map();
  const storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const auth = { access_token: 'original-device', refresh_token: 'unused', expires_at: Date.now() + 3_600_000, user: { id: uid } };
  storage.setItem(TOKENS_KEY, JSON.stringify(auth));
  let dropReply = true;
  function session() {
    const api = new SupabaseApi({ url: env.SUPABASE_URL, anonKey: 'fixture', fetchFn: async (url, opts) => {
      const body = JSON.parse(opts.body);
      const route = new URL(url).pathname;
      if (route.endsWith('/get_player')) return reply(await snapshot(uid));
      if (route.endsWith('/sync_player')) return reply(await asUser(uid, 'select public.sync_player($1::jsonb) as value', [body.patch]));
      assert.ok(route.endsWith('/functions/v1/combat'), route);
      const response = await edge('original-device', body);
      if (dropReply) throw new TypeError('Response lost after request');
      return response;
    } });
    return new PlayerSession({ api, state: new GameState(null), storage, setTimer: () => 1, clearTimer: () => {} });
  }
  const first = session();
  assert.equal(await first.restore(), 'ready');
  const played = replay(original, { seed: 7 });
  assert.equal(played.cm.result, 'victory');
  assert.equal((await first.submitCombat(played.log, combatId)).reason, 'network');
  assert.equal(readPendingCombat(storage, uid, Date.now()), combatId);
  assert.equal(readPendingCombat(storage, other, Date.now()), null);
  const after = await snapshot(uid);
  assert.ok(after.xp > original.xp);
  assert.equal(await auditCount(uid), 1);
  assert.equal(finishes, 1, 'transport retry reads the result instead of finishing again');

  dropReply = false;
  const refreshed = session();
  let recovered;
  refreshed.onChange((event, _, data) => { if (event === 'combat-recovered') recovered = data; });
  assert.equal(await refreshed.restore(), 'ready');
  assert.equal(recovered?.id, combatId);
  assert.equal(recovered?.action.verdict.outcome, 'victory');
  assert.equal(refreshed.state.data.heroXP, after.xp);
  assert.equal(readPendingCombat(storage, uid, Date.now()), combatId, 'receipt remains pending until shown and acknowledged');
  refreshed.acknowledgeCombat(combatId, uid);
  assert.equal(readPendingCombat(storage, uid, Date.now()), null);
  assert.equal((await result('other-account', { combatId })).action.reason, 'result_unavailable', 'another account cannot read a confirmed receipt');

  const next = await start(uid, 'rootling_02');
  const older = await result('other-device', { combatId });
  assert.deepEqual(older.action, recovered.action);
  assert.equal(older.combatCtx.combatId, next.combatCtx.combatId);
  assert.ok(older.meta.rev > after.meta.rev, 'lookup pairs the old outcome with the current revision');
  const oldRetry = await result('other-device', { combatId, log: played.log });
  assert.deepEqual(oldRetry.action, older.action);
  assert.equal((await snapshot(uid)).combatCtx.combatId, next.combatCtx.combatId, 'retry cannot finish the new fight');
  assert.equal(await auditCount(uid), 1);
  await act(uid, { op: 'combat_end', outcome: 'retreat' });

  await db.query("insert into public.player_quests(user_id, quest_id) values ($1, 'chapter_2_complete')", [uid]);
  const duel = await act(uid, { op: 'duel_start', balanceVersion: 40, duelVersion: 3 });
  assert.ok(duel.action.ok, JSON.stringify(duel.action));
  const duelId = duel.combatCtx.combatId;
  const lost = replay(duel, { policy: 'idle', maxTicks: 60 * 300 });
  assert.equal(lost.cm.result, 'defeat');
  let arrived = 0;
  let release;
  const rendezvous = new Promise(resolve => { release = resolve; });
  pauseLookups = async () => { if (++arrived === 2) release(); await rendezvous; };
  const [a, b] = await Promise.all([
    result('original-device', { combatId: duelId, log: lost.log }),
    result('other-device', { combatId: duelId, log: lost.log }),
  ]);
  pauseLookups = null;
  assert.equal(a.action.verdict.outcome, 'defeat');
  assert.deepEqual(a.action.verdict, b.action.verdict);
  assert.equal(Number(Boolean(a.action.recovered)) + Number(Boolean(b.action.recovered)), 1);
  assert.equal(a.action.verdict.duel.rating, duel.combatCtx.duel.rating + a.action.verdict.duel.delta);
  assert.equal(a.objects.duel.losses, 1);
  assert.equal(a.inventory.coins, duel.inventory.coins + a.action.verdict.reward.items.coins);
  assert.equal(a.meta.rev, b.meta.rev);

  await db.query('update public.player_progress set hp = 1, vitals_at = now() where user_id = $1', [uid]);
  const hazardous = await start(uid, 'rootling_04');
  const loss = replay(hazardous, { maxTicks: 60 * 180, driver: (battle, act) => {
    if (battle.time < STEP) act('p', 'elixir_life');
  } });
  assert.equal(loss.cm.result, 'defeat');
  const lossResult = await result('original-device', { combatId: hazardous.combatCtx.combatId, log: loss.log });
  assert.equal(lossResult.action.verdict.outcome, 'defeat');
  assert.ok(lossResult.action.verdict.coinsLost > 0);
  assert.equal(lossResult.action.verdict.coinsLost, hazardous.inventory.coins - lossResult.inventory.coins);
  assert.equal(lossResult.action.verdict.potions.elixir_life, 1);
  assert.equal(lossResult.inventory.elixir_life, hazardous.inventory.elixir_life - 1);

  const ledger = await db.query('select action from public.combat_receipts where user_id = $1', [uid]);
  assert.equal(ledger.rows.length, 3);
  assert.ok(ledger.rows.every(row => !row.action.log && !row.action.inventory));
  await assert.rejects(asUser(uid, 'select public.combat_result($1, $2)', [uid, combatId]), /permission denied/i);
  await assert.rejects(asUser(uid, 'select public.combat_finish($1, $2, $3)', [uid, combatId, {}]), /permission denied/i);
  await assert.rejects(asUser(uid, 'select * from public.combat_receipts'), /permission denied/i);
  await db.query("update public.combat_receipts set created_at = now() - $1::bigint * interval '1 millisecond' where combat_id = $2", [COMBAT_RECEIPT_TTL_MS + 1000, combatId]);
  assert.equal((await result('other-device', { combatId })).action.reason, 'result_unavailable');
  await db.query('select public.combat_receipts_cleanup()');
  assert.equal(await call('select count(*)::int as value from public.combat_receipts where user_id = $1', [uid]), 2);
  assert.ok((await result('other-device', { combatId: duelId })).action.ok);
  console.log('Combat receipts: legacy, lost response, reload, concurrent duel retry, privacy and expiry passed.');
} finally {
  await db.close();
}
