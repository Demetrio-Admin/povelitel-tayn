import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { startState, verifyCombat } from '../src/cloud/combatVerify.js';
import { emptySnapshot, applyAction } from '../src/cloud/playerModel.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { RECIPES, POTION_RECIPES } from '../src/config/recipes.js';
import { duelEnemyDef } from '../src/config/duel.js';
import { playBot } from './helpers/combat-bot.mjs';
import { STEP } from '../src/systems/combatReplay.js';

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const near = (a, b, message) => { assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} / ${b}`); checks++; };
const item = 'potion_antiburn';
const build = { slots: ['fire'], amulets: [], branches: { fire: 'arsonist' } };
const ctx = (version = 39, level = 5) => ({ balanceVersion: version, level: 15, hp: 255, mana: 205,
  spawn: 'gy_wisp_1', enemy: 'grave_wisp', abilities: { fire: { level, unlocked: true } }, build,
  potions: { [item]: 3, stabilizing_potion: 1 }, potionLoadout: [item, 'stabilizing_potion'] });
function battle(context = ctx(), dummy = true) {
  const state = startState(context, 1000);
  return new CombatManager({ enemyType: context.enemy,
    enemyDef: context.duel ? duelEnemyDef(context.duel.opponent, 2) : dummy ? { hp: 1e6, arena: 'glade', normalAttack: null, strongAttack: null } : null,
    state, abilities: new AbilitySystem(state, null, null) });
}
function duelContext(version = 39) {
  return { ...ctx(version), spawn: 'duel', enemy: 'duel_mage', duel: { version: 2, rating: 1000,
    opponent: { level: 15, abilities: ctx(version).abilities, build, rating: 1000 } } };
}
function tick(cm, seconds) { for (let n = 0; n < Math.round(seconds / STEP); n++) { cm.tick(STEP); cm.drainEvents(); } }

// Three real casts: no resets, fabricated charges, or direct insertion of burn layers.
for (const [version, level, expected] of [[38, 5, 2], [39, 4, 2], [39, 5, 3]]) {
  const cm = battle(ctx(version, level)); let casts = 0;
  while (casts < 3 && cm.time < 30) {
    if (cm.abilityState('fire').state === 'ready') { check(cm.useAbility('fire').ok, 'natural fire cast'); casts++; }
    if (casts < 3) cm.tick(STEP);
    cm.drainEvents();
  }
  check(casts === 3 && cm.enemy.burnStacks.length === expected, `v${version} fire ${level} ordinary stack count`);
  near(cm.enemy.heal(100), expected === 3 ? 70 : 100, 'full-stack antiheal');
  if (expected === 3) {
    tick(cm, 2.1);
    check(cm.enemy.burnStacks.length === 2, 'oldest independent layer expires');
    near(cm.enemy.heal(100), 100, 'antiheal ends with the third layer');
  }
}
// Both Duel actors inherit the same saved protocol. A durable target isolates layer timing.
for (const version of [38, 39]) {
  const cm = battle(duelContext(version));
  cm.hero.hp = cm.hero.maxHp = cm.duelBody.maxHp = 10000;
  const d = cm.duelBattle.defender;
  check(d.abilities.stats('fire').burn.durationSec === (version === 39 ? 18 : 12), 'defender uses saved physics');
  while ((d.stats.abilityUses.fire || 0) < 3 && cm.time < 30) { cm.tick(STEP); cm.drainEvents(); }
  // Wait for the third AI windup; the player never casts or resets timers.
  while (d.duelBody.pending && cm.time < 30) { cm.tick(STEP); cm.drainEvents(); }
  check(cm.time < 30 && d.stats.abilityUses.fire === 3, 'three AI casts completed with ordinary timers');
  check(cm.duelBody.burnStacks.length === (version === 39 ? 3 : 2), 'ordinary defender stack count');
  near(cm.duelBody.heal(100), version === 39 ? 70 : 100, 'defender full-stack antiheal');
}

// Old live contexts retain actual fingerprints captured before the fix, not regenerated expectations.
for (const c of JSON.parse(fs.readFileSync('tests/fixtures/burn-v38.json', 'utf8')).cases) {
  const p = playBot(c.ctx, { policy: c.policy, seed: 7, potions: false });
  assert.deepEqual({ outcome: p.cm.result, time: p.cm.time, hp: p.cm.hero.hp, mana: p.cm.hero.mana, enemyHp: p.cm.enemy.hp, stats: p.cm.stats }, c.result);
  checks++;
}

{
  const cm = battle();
  cm.heroBurn = { left: 6, rate: 10 }; cm.heroChill = { left: 5, pct: .4 };
  check(cm.usePotion(item).ok && !cm.heroBurn && cm.heroChill.left === 5, 'only burn is cleansed');
  check(cm.state.item(item) === 2 && cm.potionUses.tactical === 1 && cm.potionCooldown.tactical === 12, 'one item, shared tactical count/CD');
  check(cm.usePotion('stabilizing_potion').reason === 'cooldown', 'other tactical potion shares cooldown');
  cm.heroBurn = { left: 4, rate: 10 }; const hp = cm.hero.hp;
  tick(cm, 4); near(hp - cm.hero.hp, 16, 'new PvE burn reduced by 60%');
  const before = cm.hero.hp; cm.hitHero(10, true); near(before - cm.hero.hp, 10, 'direct damage unchanged');
  tick(cm, 16); check(!cm.burnWard, 'protection expires after 20 seconds');
  cm.heroBurn = { left: 1, rate: 10 }; const unprotected = cm.hero.hp;
  tick(cm, 1); near(unprotected - cm.hero.hp, 10, 'burn after expiry deals full damage');
  check(cm.usePotion(item).ok && cm.burnWard.left === 20, 'second potion refreshes protection');
  tick(cm, 12); check(cm.usePotion(item).reason === 'limit' && cm.state.item(item) === 1, 'two tactical uses per battle');
}
{
  const cm = battle(); cm.usePotion(item); cm.burnWard.left = .5; cm.heroBurn = { left: 1, rate: 10 };
  const hp = cm.hero.hp; cm.tickResources(1); near(hp - cm.hero.hp, 7, 'partial protected PvE step');
  const old = battle(ctx(38)); check(old.usePotion(item).reason === 'unknown' && old.state.item(item) === 3, 'new potion cannot change v38 physics');
  const benched = ctx(); benched.potionLoadout = [];
  check(battle(benched).usePotion(item).reason === 'benched', 'potion must be selected before battle');
  const refresh = battle(); refresh.usePotion(item); tick(refresh, 12.1);
  check(refresh.usePotion(item).ok && refresh.burnWard.left === 20 && refresh.burnWard.resist === .6, 'early repeat refreshes duration without stacking resistance');
}
{
  const cm = battle(duelContext()); const body = cm.duelBody;
  body.applyBurn(10, 18, 3, .4); body.applyBurn(10, 18, 3, .4); body.fullBurnAntiheal = { count: 3, reduction: .3 };
  body.applySlow(.4, 6); body.applyPuddle(10, 6); body.weaken(.3, 6);
  check(cm.usePotion(item).ok && !body.burning && !body.burnStacks.length && !body.antiheal && !body.fullBurnAntiheal, 'Duel burn layers and their antiheal removed');
  check(body.slowed && body.inPuddle && body.weakened.left > 0, 'other Duel statuses remain');
  const direct = cm.hero.hp; body.takeDamage(10, 'fire'); near(direct - cm.hero.hp, 10, 'Duel direct fire unchanged');
  const burn = cm.hero.hp; body.applyBurn(10, 4, 3); body.update(1, 1);
  near(burn - cm.hero.hp, 14, 'Duel burn tick 4 plus unaffected puddle tick 10');
  cm.tickResources(20); const expired = cm.hero.hp; body.takeDamage(10, 'fire', 1, { burnTick: true });
  near(expired - cm.hero.hp, 10, 'Duel burn no longer reduced after expiry');
}

// Real PvE and Duel logs spend the new consumable and agree with the server replay.
for (const context of [ctx(), duelContext()]) {
  const played = playBot(context, { driver: (cm, act) => {
    if ((cm.heroBurn?.left > 0 || cm.duelBody?.burning) && !cm.burnWard) act('p', item);
  } });
  check(!!played.cm.result && played.st.item(item) < 3, 'real fight ends after drinking protection');
  const snap = { ...emptySnapshot(), quests: ['chapter_2_complete'], combatCtx: context, combatSince: 1000 };
  const v = verifyCombat(snap, played.log, 2000 + played.log.ticks * STEP * 1000);
  check(v.ok && v.verdict.outcome === played.cm.result && v.verdict.mana === played.cm.hero.mana, 'server replay agrees');
  check(v.verdict.potions[item] === 3 - played.st.item(item), 'server records exact number of protection flasks');
  if (context.duel) check(!v.verdict.reward.items.sapphires, 'Duel has no random PvE sapphires');
}

check(POTION_RECIPES.length === 14 && RECIPES[item].amount === 1, 'full fourteen-item catalogue, one per craft');
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
  const seed = async inventory => { await q('delete from player_inventory where user_id=$1', [uid]); for (const [id, n] of Object.entries(inventory)) await q('insert into player_inventory(user_id,item_id,quantity)values($1,$2,$3)', [uid, id, n]); };
  const materials = { frost_herb: 2, forest_mushroom: 1, ice_crystal: 1, coins: 15 };
  await seed(materials);
  check((await act({ op: 'craft', recipe: item })).action.reason === 'locked', 'SQL recipe locked before burning enemies open');
  await q("select _add_event($1,'chapter_2_complete')", [uid]);
  await seed({ ...materials, coins: 14 });
  const failed = await act({ op: 'craft', recipe: item });
  check(!failed.action.ok && failed.inventory.coins === 14 && failed.inventory.frost_herb === 2, 'insufficient coins: no partial payment');
  await seed(materials);
  const action = { id: randomUUID(), op: 'craft', recipe: item }, made = await act(action), again = await act(action);
  check(made.action.ok && made.inventory[item] === 1 && !(made.inventory.coins > 0) && !(made.inventory.frost_herb > 0), 'SQL full recipe gives exactly one flask');
  assert.deepEqual(again.inventory, made.inventory); checks++;
  check(!(await act({ op: 'drink', item })).action.ok, 'battle-only potion cannot be drunk outside');
  await act({ op: 'potion_loadout', potions: [item] });
  const started = await act({ op: 'combat_start', spawn: 'gy_wisp_1', enemy: 'grave_wisp', balanceVersion: 39 });
  check(started.combatCtx.balanceVersion === 39 && started.combatCtx.sapphireDrops === 1 && started.combatCtx.potions[item] === 1, 'SQL stamps v39 and freezes potion stock');
  await act({ op: 'combat_end', outcome: 'retreat' });
  const newer = await act({ op: 'duel_start', balanceVersion: 39, duelVersion: 2 });
  check(newer.action.reason === 'update_required' && !newer.combatCtx, 'SQL refuses new Duels on the superseded v39/v2 protocol');
  await act({ op: 'combat_end', outcome: 'retreat' });
  for (const version of [38, 30, 999, '39']) {
    const actual = [38, 30].includes(version) ? version : 29;
    const s = await act({ op: 'combat_start', spawn: 'gy_wisp_1', enemy: 'grave_wisp', balanceVersion: version });
    check(s.combatCtx.balanceVersion === actual, 'SQL supports known versions and rejects unknown/type-forged requests');
    await act({ op: 'combat_end', outcome: 'retreat' });
    const mirror = applyAction(emptySnapshot(), { op: 'combat_start', spawn: 'gy_wisp_1', enemy: 'grave_wisp', balanceVersion: version }, 1000).snapshot;
    check(mirror.combatCtx.balanceVersion === actual, 'JS/SQL version selection agrees');
  }
} finally { await db.close(); }
console.log(`Burn and protection: ${checks} checks passed; natural cooldowns, v38 fingerprints, PvE/Duel replays and SQL.`);
