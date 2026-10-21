import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { startState } from '../src/cloud/combatVerify.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { amuletEffect, amuletUpgradeCost, AMULETS } from '../src/config/build.js';
import { Alchemy } from '../src/systems/Alchemy.js';
import { amuletLine } from '../src/systems/gifts.js';
import { applyAction, fillDefaults } from '../src/cloud/playerModel.js';
import { playBot } from './helpers/combat-bot.mjs';
import { duelEnemyDef } from '../src/config/duel.js';
import { HEART, stormProfile, duelContext, report } from '../tools/balance/storm-heart.mjs';
import { STEP } from '../src/systems/combatReplay.js';
let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const near = (a, b, label) => { assert.ok(Math.abs(a-b) < 1e-6, `${label}: ${a} / ${b}`); checks++; };
function context(heartLevel = 5, branch = 'discharge', stormLevel = 5, balanceVersion = 40) {
  const p = stormProfile(branch, heartLevel, stormLevel); p.build.amulets = [HEART]; p.build.amuletLevels = { [HEART]: heartLevel };
  return { balanceVersion, level: 15, abilities: p.abilities, build: p.build, hp: 255, mana: 100, potions: {}, potionLoadout: [], spawn: 'fw_alpha', enemy: 'frost_alpha' };
}
function dummy(ctx = context()) {
  const state = startState(ctx, 1000);
  return new CombatManager({ enemyType: ctx.enemy, enemyDef: { hp: 1e6, arena: 'glade', normalAttack: null, strongAttack: null }, state, abilities: new AbilitySystem(state, null, null) });
}
function tick(cm, seconds) { for (let n = 0; n < Math.round(seconds / STEP); n++) { cm.tick(STEP); cm.drainEvents(); } }
function charge(cm) { for (let i = 0; i < 3; i++) check(cm.useAbility('telekinesis').ok, 'ordinary triple TK charges Storm'); check(cm.stormCharges === 3, 'full charges from actual hits'); }

// Damage/refund isolation: each case is a new fight; only its initial charge count is supplied.
const damage = [15, 19, 24, 30, 43, 60], mana = [0, 0, 0, 10, 14, 20];
for (let n = 0; n <= 5; n++) {
  const e = amuletEffect(HEART, n);
  near((e.stormMult - 1) * 100, damage[n], 'explicit damage curve');
  check((e.stormRefund?.mana || 0) === mana[n], 'explicit mana curve');
  check(amuletLine(e).includes(`Гроза +${damage[n]}%`), 'build UI shows real damage');
  if (n >= 3) check(amuletLine(e).includes(`${mana[n]} MP`) && amuletLine(e).includes('12 с'), 'build UI explains refund and limit');
  for (const branch of ['discharge', 'field']) for (const level of [1, 5]) for (const charges of [0, 2, 3]) {
    const cm = dummy(context(n, branch, level)); cm.stormCharges = charges;
    const s = cm.abilities.stats('storm'), base = s.damage * (1 + charges * s.chargeBonus) * cm.hero.damageMult * e.stormMult;
    const before = cm.enemy.hp; check(cm.useAbility('storm').ok, 'Storm cast');
    const expected = Math.round(base) + (charges === 3 && s.fullDischarge ? Math.round(base * s.fullDischarge) : 0);
    near(before - cm.enemy.hp, expected, 'both Storm hits use actual amulet multiplier');
    near(cm.hero.mana, 100 - s.manaCost + (charges === 3 ? (s.stormField?.mana || 0) + mana[n] : 0), 'full-only, independent branch and amulet refunds');
    check(cm.stormCharges === 0, 'charges consumed once');
  }
}
// The natural 8s Storm cooldown permits casts faster than the amulet's 12s refund interval.
{
  const c = context(); c.mana = 205; const cm = dummy(c), refunds = [];
  for (let cast = 0; cast < 3; cast++) {
    if (cast) tick(cm, 8.1);
    charge(cm); const before = cm.hero.mana;
    check(cm.useAbility('storm').ok, 'natural full Storm cast');
    near(cm.hero.mana, before - 26 + (cast === 1 ? 0 : 20), 'refund cannot repeat after only 8s');
    refunds.push(...cm.drainEvents().filter(e => e.type === 'stormRefund').map(e => e.mana));
  }
  assert.deepEqual(refunds, [20, 20]); checks++;
}
{
  // Lunar can fill mana while paying for Storm. The amulet never exceeds the maximum,
  // and a full-cap activation still starts its internal interval.
  const c = context(); c.mana = 30; c.build.amulets.push('amulet_lunar'); c.build.amuletLevels.amulet_lunar = 5;
  const cm = dummy(c); cm.stormCharges = 3;
  check(cm.useAbility('storm').ok && cm.hero.mana === 205 && cm.manaRescueUsed, 'Lunar rescue and Heart clamp to max mana');
  check(cm.stormAmuletRefundAt === 0 && !cm.drainEvents().some(e => e.type === 'stormRefund'), 'no false positive mana amount at full cap');
  const without = context(); without.build.amulets = [];
  check(dummy(without).schoolMult.storm === 1, 'unworn Heart does not act');
  const benched = context(); benched.build.slots = ['telekinesis', 'fire'];
  check(dummy(benched).useAbility('storm').reason === 'benched', 'Heart does not equip Storm');
  const fireA = dummy(), fireB = dummy(without); fireA.useAbility('fire'); fireB.useAbility('fire');
  check(fireA.enemy.hp === fireB.enemy.hp, 'other schools are not amplified');
  for (const v of [29, 30, 38, 39]) check(dummy(context(5, 'field', 5, v)).schoolMult.storm === 1, 'Heart absent from old physics');
}
{
  // Real interruption spends preparation mana but does not consume charges or pay a refund.
  const p = stormProfile('discharge', 5), ctx = duelContext(p, p); ctx.mana = 100;
  const state = startState(ctx, 1000), cm = new CombatManager({ enemyType: 'duel_mage', enemyDef: duelEnemyDef(ctx.duel.opponent, 2), state, abilities: new AbilitySystem(state, null, null) });
  cm.stormCharges = 3; check(cm.useAbility('storm').ok, 'player begins full Storm');
  const d = cm.duelBattle.defender;
  check(cm.duelBattle.beginCast(d, 'telekinesis').ok, 'AI begins counter'); cm.duelBattle.advanceCast(d, 1);
  check(!cm.duelBody.pending && cm.stormAmuletRefundAt === -Infinity && cm.stormCharges === 3, 'interrupted full Storm has no refund');
  const attacker = stormProfile('field', 5), defender = stormProfile('discharge', 4), duel = duelContext(attacker, defender);
  const st = startState(duel, 1000), battle = new CombatManager({ enemyType: 'duel_mage', enemyDef: duelEnemyDef(duel.duel.opponent, 2), state: st, abilities: new AbilitySystem(st, null, null) });
  const ai = battle.duelBattle.defender;
  near(battle.schoolMult.storm, 1.6, 'attacker Heart level'); near(ai.schoolMult.storm, 1.43, 'defender Heart level');
  ai.hero.mana = 100; ai.stormCharges = 3;
  check(battle.duelBattle.beginCast(ai, 'storm').ok, 'defender casts full Storm'); battle.duelBattle.advanceCast(ai, 1);
  near(ai.hero.mana, 100 - 26 + 14, 'defender gets its own real refund');
  // Timer belongs to this AI actor, not its target.
  check(ai.stormAmuletRefundAt === 0 && battle.stormAmuletRefundAt === -Infinity, 'separate refund timers');
}
for (const c of JSON.parse(fs.readFileSync('tests/fixtures/storm-v39.json', 'utf8')).cases) {
  const p = playBot(c.ctx, { seed: 7, potions: false });
  assert.deepEqual({ outcome: p.cm.result, time: p.cm.time, hp: p.cm.hero.hp, mana: p.cm.hero.mana, enemyHp: p.cm.enemy.hp, stats: p.cm.stats }, c.result); checks++;
}
const comparisons = report();
check(comparisons.pve.length === 56 && comparisons.duels.length === 72, 'all levels and branches have terminating verified PvE/Duel comparisons');
check(comparisons.offensiveDuels.length === 12, 'all-V offensive probes also terminate and verify');
check(comparisons.duels.some(r => r.stormHits > 0) && comparisons.duels.some(r => r.defenderStormHits > 0), 'Duel comparisons contain resolved Storm hits from both sides');
for (const level of [3, 4, 5]) check(comparisons.duels.some(r => r.heartLevel === level && r.manaFromHeart > 0) && comparisons.duels.some(r => r.heartLevel === level && r.defenderHeartRefundAt != null), 'natural Duel refunds occur on both sides at +'+level);
check(Object.values(AMULETS).filter(a => a.currency === 'coins').length === 5 && Object.values(AMULETS).filter(a => a.currency === 'sapphires').length === 5, 'five coin / five sapphire catalogue');
for (let n = 0; n < 5; n++) {
  const c = amuletUpgradeCost(HEART, n);
  check(c.sapphires === [300, 900, 2500, 6500, 15000][n] && c.coins === 0 && !Object.keys(c.items).length, 'unchanged sapphire upgrade prices');
}

const db = new PGlite();
try {
  await db.exec(fs.readFileSync('tools/sql/auth-stub.sql', 'utf8'));
  await db.exec(fs.readFileSync('tests/fixtures/rebalance-baseline-schema.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021_rebalance_recovery.sql', 'utf8'));
  const uid = randomUUID(), q = (sql, args = []) => db.query(sql, args);
  await q('insert into auth.users(id)values($1)', [uid]);
  const as = async fn => { await db.exec('set role authenticated'); await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]); try { return await fn(); } finally { await db.exec('reset role'); } };
  await as(() => q("select create_player('witch')"));
  const act = async args => (await as(() => q('select player_action($1::jsonb) j', [JSON.stringify({ id: randomUUID(), ...args })]))).rows[0].j;
  await q('delete from player_inventory where user_id=$1', [uid]);
  for (const [id, n] of Object.entries({ ice_crystal: 4, lunar_shard: 4, rune_dust: 4, crafting_core: 1, coins: 600, amulet_focus: 1, amulet_lunar: 1 })) await q('insert into player_inventory(user_id,item_id,quantity)values($1,$2,$3)', [uid, id, n]);
  const locked = await act({ op: 'craft', recipe: HEART }); check(locked.action.reason === 'locked' && locked.inventory.coins === 600, 'SQL chapter gate');
  await q("select _add_event($1,'chapter_2_complete')", [uid]);
  const noStorm = await act({ op: 'craft', recipe: HEART }); check(noStorm.action.reason === 'locked' && noStorm.inventory.crafting_core === 1, 'SQL requires learned Storm, not just a chapter flag');
  const localLocked = applyAction(fillDefaults(noStorm).snapshot, { op: 'craft', recipe: HEART }, 1000);
  check(localLocked.result.reason === 'locked', 'JS model requires learned Storm');
  // Alchemy reads the same ability gate for older accounts that already learned Storm.
  const state = startState({ ...context(), abilities: noStorm.abilities }, 1000); state.markEvent('chapter_2_complete');
  check(new Alchemy(state).status(HEART).state === 'locked', 'cauldron gate agrees');
  await q("select _unlock_ability($1,'storm',1)", [uid]);
  await q("update player_inventory set quantity=0 where user_id=$1 and item_id='crafting_core'", [uid]);
  await q("insert into player_inventory(user_id,item_id,quantity)values($1,'rare_core',1)", [uid]);
  const storyCore = await act({ op: 'craft', recipe: HEART });
  check(storyCore.action.reason === 'missing' && storyCore.inventory.rare_core === 1 && storyCore.inventory.coins === 600, 'story core cannot replace the repeatable crafting core');
  await q("update player_inventory set quantity=1 where user_id=$1 and item_id='crafting_core'", [uid]);
  await q('update player_inventory set quantity=599 where user_id=$1 and item_id=\'coins\'', [uid]);
  const poor = await act({ op: 'craft', recipe: HEART }); check(poor.action.reason === 'missing' && poor.inventory.crafting_core === 1 && poor.inventory.ice_crystal === 4, 'SQL no partial material payment');
  await q('update player_inventory set quantity=600 where user_id=$1 and item_id=\'coins\'', [uid]);
  const action = { id: randomUUID(), op: 'craft', recipe: HEART }, made = await act(action), dup = await act(action);
  check(made.action.ok && made.inventory[HEART] === 1 && !(made.inventory.coins > 0) && !(made.inventory.crafting_core > 0) && made.inventory.rare_core === 1, 'exact recipe creates one unique +0 Heart without spending the story core');
  assert.deepEqual(dup.inventory, made.inventory); checks++;
  check((await act({ op: 'craft', recipe: HEART })).action.reason === 'done', 'base amulet cannot be farmed by recrafting');
  check((await act({ op: 'amulet_upgrade', amulet: HEART })).action.reason === 'progress', 'upgrade victory gates remain');
  for (const enemy of ['scavenger_01', 'forest_guardian_01', 'node_trial', 'fq_guardian', 'final_severin', 'fw_alpha']) await q("insert into player_world(user_id,kind,key,data)values($1,'enemy',$2,'{}')on conflict do nothing", [uid, enemy]);
  await q("select admin_grant_sapphires($1,25200,'test','test')", [uid]);
  let total = 25200;
  for (let n = 0; n < 5; n++) {
    const up = { id: randomUUID(), op: 'amulet_upgrade', amulet: HEART }, s = await act(up); total -= [300,900,2500,6500,15000][n];
    check(s.action.ok && s.objects.player_build.amuletLevels[HEART] === n+1 && s.wallet.sapphires === total && !(s.inventory.coins > 0), 'SQL exact sapphire tier '+(n+1));
    if (n === 2) check((await act(up)).wallet.sapphires === total, 'repeat upgrade request cannot charge twice');
  }
  check((await act({ op: 'amulet_upgrade', amulet: HEART })).action.reason === 'max', 'max +5 enforced');
  check((await act({ op: 'build_set', amulets: [HEART,'amulet_focus','amulet_lunar'] })).action.reason === 'too_many', 'still two amulet slots');
  check((await act({ op: 'build_set', amulets: [HEART,'amulet_lunar'] })).action.ok, 'Heart equips through authoritative build');
  await q('update player_progress set hero_level=15,hero_xp=7900,hp=255,mana=205 where user_id=$1', [uid]);
  const started = await act({ op: 'combat_start', spawn: 'fw_alpha', enemy: 'frost_alpha', balanceVersion: 40 });
  check(started.combatCtx.balanceVersion === 40 && started.combatCtx.sapphireDrops === 1 && started.combatCtx.build.amuletLevels[HEART] === 5, 'SQL freezes new item and version 40');
  await act({ op: 'combat_end', outcome: 'retreat' });
  for (const version of [40,39,38,30,999,'40']) {
    const s = await act({ op: 'duel_start', balanceVersion: version, duelVersion: 2 });
    const expected = [40,39,38,30].includes(version) ? version : 29;
    check(s.combatCtx.balanceVersion === expected && s.combatCtx.duel.version === (expected >= 38 ? 2 : 1) && !s.combatCtx.sapphireDrops, 'known/unknown Duel protocol selection');
    await act({ op: 'combat_end', outcome: 'retreat' });
  }
} finally { await db.close(); }
console.log(`Storm Heart: ${checks} checks passed; 56 PvE + 84 Duel verified comparisons, natural refund timing and SQL.`);
