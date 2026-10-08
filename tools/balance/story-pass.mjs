// Deterministic economy check: no side quests, daily orders, paid gifts or repeated enemies.
// Chapter I uses the normal resource route; chapter II runs authoritative actions and verified combat logs.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { run } from './chapter-report.mjs';
import { applyAction, combatApply } from '../../src/cloud/playerModel.js';
import { verifyCombat } from '../../src/cloud/combatVerify.js';
import { serverRules } from '../../src/config/serverRules.js';
import { STEP } from '../../src/systems/combatReplay.js';
import { playBot } from '../../tests/helpers/combat-bot.mjs';

export async function storyPass() {
  const first = await run('main');
  let s = first.snapshot, time = 2e12;
  const fights = [], payments = [], coinsAtStart = s.inventory.coins;
  const act = (op, args = {}) => {
    time += 300_000;
    const r = applyAction(s, { op, ...args }, time); s = r.snapshot;
    assert.ok(r.result.ok, `${op} ${JSON.stringify(args)}: ${JSON.stringify(r.result)}`);
    return r.result;
  };
  const event = key => act('event', { key });
  const world = obj => act('world', { obj });
  const slots = (...slots) => act('build_set', { slots });
  let supplyCoins = 0;
  const buy = (item, qty) => { const before = s.inventory.coins; act('shop_buy', { item, qty }); supplyCoins += before - s.inventory.coins; };
  const craft = recipe => {
    for (const [item, n] of Object.entries(serverRules().recipes[recipe].needs)) {
      const missing = Math.max(0, n - (s.inventory[item] || 0));
      if (missing) buy(item, missing);
    }
    return act('craft', { recipe });
  };
  const replenish = (target = 2) => {
    while ((s.inventory.elixir_life || 0) < target) {
      for (const [item, n] of Object.entries({ moon_herb: 2, forest_mushroom: 1 })) {
        const missing = Math.max(0, n - (s.inventory[item] || 0));
        if (missing) buy(item, missing);
      }
      craft('elixir_life');
    }
  };
  const driver = (cm, input) => {
    const e = cm.enemy, ready = id => cm.abilityState(id).state === 'ready';
    const heavy = cm.fieldObjects.find(o => o.available && o.def.weight === 'heavy' && cm.canLift(o));
    const light = cm.fieldObjects.find(o => o.available && o.def.throwable && o.def.weight !== 'heavy');
    const crystal = cm.fieldObjects.find(o => o.available && o.def.breaksArmor);
    const throwAt = o => { if (o) input('s', o.id); return input('a', 'telekinesis'); };
    if (cm.hero.hp < cm.hero.maxHp * .4) input('p', 'elixir_life');
    if (cm.hero.mana < 20) input('p', 'elixir_mana');
    if (e.isPreparing && ready('telekinesis')) { throwAt(e.def.strongAttack.interruptBy.includes('telekinesis') ? light : heavy); return; }
    const soon = e.def.strongAttack && e.strongCd < 2.5;
    if (crystal && e.armorActive && ready('telekinesis') && !soon) { throwAt(crystal); return; }
    if (ready('ice')) { input('a', 'ice'); return; }
    if (ready('seal') && cm.hero.mana >= 34 && !soon) { input('a', 'seal'); return; }
    if (ready('fire')) { input('a', 'fire'); return; }
    if (ready('telekinesis') && !soon) throwAt(light);
  };
  const fight = (spawn, enemy) => {
    if (['wh_elite', 'fq_guardian', 'lab_construct', 'final_severin'].includes(spawn)) replenish(spawn === 'final_severin' ? 4 : 2);
    act('combat_start', { spawn, enemy, balanceVersion: 30 });
    let best;
    for (let seed = 1; seed <= 8 && !best; seed++) {
      const play = playBot(s.combatCtx, { seed, policy: 'smart', driver });
      if (play.cm.result === 'victory') best = play;
    }
    assert.ok(best, `${spawn}: no victory at level ${s.level}, life potions ${s.inventory.elixir_life || 0}`);
    time = s.combatSince + best.log.ticks * STEP * 1000 + 1000;
    const v = verifyCombat(s, best.log, time); assert.ok(v.ok, `${spawn}: ${v.reason}`);
    s = combatApply(s, v.verdict, time).snapshot;
    fights.push({ spawn, level: s.level, seconds: +best.cm.time.toFixed(1), potions: best.cm.stats.potions || 0, coins: v.verdict.reward?.items?.coins || 0 });
  };
  act('build_set', { amulets: ['amulet_forest'] });
  event('ch2_start'); event('ch2_city_arrived');
  fight('plaza_critter', 'frost_critter'); event('ch2_met_ilaria');
  world('plaza_trace'); world('plaza_debris'); event('ch2_trace_found'); world('archive_document'); event('ch2_met_severin');
  event('city_merchant_open'); event('ch2_cargo_start');
  fight('wh_collector_1', 'frost_collector'); fight('wh_collector_2', 'frost_collector'); fight('wh_elite', 'frost_collector_elite');
  world('wh_cargo'); world('wh_cargo_reward'); world('wh_equipment'); event('ch2_cargo_reported');
  event('ch2_severin_asked'); fight('lab_critter', 'frost_critter'); event('ch2_frost_wave');
  world('frost_barrier'); world('ice_construct'); event('ch2_nerys_met');
  fight('fq_collector', 'frost_collector'); fight('fq_critter', 'frost_critter');
  world('fq_door'); world('fq_cellar'); event('ch2_rescue_done'); craft('warm_potion'); event('unlock_ice_1');
  slots('ice', 'telekinesis', 'fire'); world('fq_water'); fight('fq_training', 'frost_critter');
  event('ch2_ice_trained'); event('ch2_choice_start');
  fight('fq_deep_1', 'frost_collector'); fight('fq_deep_2', 'frost_collector'); fight('fq_guardian', 'ice_guardian');
  event('ch2_quarter_cleared'); payments.push({ lesson: 'ice_2', before: s.inventory.coins, price: 500 }); event('unlock_ice_2');
  fight('yard_brittle_1', 'frost_collector'); fight('yard_brittle_2', 'frost_collector'); craft('brittle_flask');
  event('ch2_brittle_done'); event('ch2_lab_found'); slots('ice', 'telekinesis', 'seal'); world('lab_seal');
  fight('vol_1', 'volunteer'); fight('vol_2', 'volunteer'); fight('lab_construct', 'experimental_construct');
  world('lab_chest'); world('lab_herb_1'); world('lab_herb_2'); craft('stabilizing_potion'); craft('stabilizing_potion');
  event('ch2_stabilized'); world('lab_journal'); event('ch2_lab_reported');
  event('ch2_view_methods'); event('ch2_severin_confronted'); event('ch2_coven_met');
  fight('unstable_1', 'frost_collector'); fight('unstable_2', 'frost_collector'); craft('crystal_guard'); event('ch2_coven_supplies');
  event('ch2_coven_ready'); event('ch2_final_start'); world('final_rift'); world('final_ward');
  slots('fire', 'telekinesis', 'ice'); world('final_ice_wall'); world('final_debris');
  payments.push({ lesson: 'ice_3', before: s.inventory.coins, price: 1500 }); event('ch2_ice3_shard');
  slots('ice', 'telekinesis', 'seal'); fight('final_severin', 'severin_boss');
  world('final_letters'); event('ch2_epilogue'); const xpBeforeFinalReward = s.xp; event('chapter_2_complete');
  assert.equal(s.level, 15); assert.equal(s.abilities.telekinesis.level, 2); assert.equal(s.abilities.fire.level, 1); assert.equal(s.abilities.seal.level, 1);
  return { first: { coins: coinsAtStart, xp: first.end.xp, level: first.end.lvl, beforeTK: first.beforeTK, fights: first.fights },
    payments, fights, supplyCoins, xpBeforeFinalReward, final: { coins: s.inventory.coins, xp: s.xp, level: s.level, sapphires: s.wallet.sapphires }, snapshot: s };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { snapshot, ...report } = await storyPass(); console.log(JSON.stringify(report, null, 2));
}
