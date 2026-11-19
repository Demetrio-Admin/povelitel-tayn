import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { databaseRules } from '../tools/sql/rules-config.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const files = JSON.parse(read('supabase/fresh-install.json'));
const recovery = 'migrations/20261021_rebalance_recovery.sql';
const chapter3 = 'migrations/20261022_chapter3_levels.sql';
const receipts = 'migrations/202611150001_combat_receipts.sql';
const uid = 'b5be365d-a441-4a88-9c69-d395735849aa';

async function apply(db, scripts) {
  for (const file of scripts) await db.exec(read(`supabase/${file}`));
}

async function verifyContract(db) {
  const { rows: [contract] } = await db.query(`
    select
      position('game_admin.core_player_action' in pg_get_functiondef('public.player_action(jsonb)'::regprocedure)) > 0 as wrapped,
      position('game_admin.core_combat_apply' in pg_get_functiondef('public.combat_apply(uuid,jsonb)'::regprocedure)) > 0 as combat_wrapped,
      to_regclass('public.coven_payouts') is not null as covens,
      to_regprocedure('public.chat_request(text,jsonb,uuid)') is not null as chat,
      to_regprocedure('public.telemetry_log(text,jsonb)') is not null as telemetry,
      has_function_privilege('authenticated', 'public.combat_apply(uuid,jsonb)', 'execute') as player_can_apply_combat,
      has_function_privilege('service_role', 'public.combat_apply(uuid,jsonb)', 'execute') as edge_can_apply_combat,
      public._game_rules() as rules
  `);
  const { rules, ...surface } = contract;
  assert.deepEqual(surface, {
    wrapped: true, combat_wrapped: true, covens: true, chat: true, telemetry: true,
    player_can_apply_combat: false, edge_can_apply_combat: true,
  });
  assert.deepEqual(rules, databaseRules(), 'SQL rules match the JS rules after install and upgrade');
}

async function playerData(db) {
  const { rows: [player] } = await db.query(`
    select
      p.player_id, p.nickname, g.pos_x, g.research, g.combat_since, g.combat_ctx,
      w.sapphires, i.quantity,
      (select count(*) from public.sapphire_ledger where user_id = p.id) as wallet_entries,
      (select count(*) from game_admin.entries where user_id = p.id) as admin_entries
    from public.profiles p
    join public.player_progress g on g.user_id = p.id
    join public.player_wallet w on w.user_id = p.id
    join public.player_inventory i on i.user_id = p.id and i.item_id = 'moon_herb'
    where p.id = $1
  `, [uid]);
  assert.ok(player, 'original profile, progress, wallet and inventory still exist');
  return player;
}

const fresh = new PGlite();
const existing = new PGlite();
try {
  await fresh.exec(read('tools/sql/auth-stub.sql'));
  await apply(fresh, files);
  await verifyContract(fresh);

  await existing.exec(read('tools/sql/auth-stub.sql'));
  await apply(existing, files.filter(file => file !== recovery && file !== chapter3 && file !== receipts));
  await existing.query('insert into auth.users(id) values ($1)', [uid]);
  await existing.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await existing.query("select public.create_player('witch')");
  await existing.query("select public.claim_nickname($1, 'SavedWitch', 'savedwitch')", [uid]);
  await existing.query("select public.admin_grant_sapphires($1, 45, 'upgrade fixture', 'upgrade-test')", [uid]);
  await existing.query("insert into public.player_inventory(user_id, item_id, quantity) values ($1, 'moon_herb', 3)", [uid]);
  await existing.query(`
    update public.player_progress
    set pos_x = 412, research = '{"ability":"fire"}', combat_since = now(), combat_ctx = '{"balanceVersion":39}'
    where user_id = $1
  `, [uid]);
  const before = await playerData(existing);
  const backup = await existing.dumpDataDir('none');

  const restored = new PGlite({ loadDataDir: backup });
  try {
    assert.deepEqual(await playerData(restored), before, 'backup round trip preserves player data');
    for (let round = 0; round < 2; round++) {
      await apply(restored, [recovery, chapter3, receipts]);
      await verifyContract(restored);
      assert.deepEqual(await playerData(restored), before, 'upgrade and retry preserve player data and audit history');
    }
  } finally {
    await restored.close();
  }
  console.log('Fresh install, backup restore and repeatable upgrade passed.');
} finally {
  await Promise.all([fresh.close(), existing.close()]);
}
