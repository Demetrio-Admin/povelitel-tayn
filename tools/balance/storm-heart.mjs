// Short, reproducible PvE/Duel comparisons. Uses actual casts, mana, cooldowns and server replay.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { playBot } from '../../tests/helpers/combat-bot.mjs';
import { emptySnapshot } from '../../src/cloud/playerModel.js';
import { verifyCombat } from '../../src/cloud/combatVerify.js';
import { COMBAT_BALANCE_VERSION } from '../../src/config/combatVersions.js';
export const HEART = 'amulet_storm_heart';
export function stormProfile(branch = 'discharge', heartLevel = null, stormLevel = 5, style = 'throws') {
  const slots = style === 'caster' ? ['fire', 'seal', 'storm'] : ['telekinesis', 'fire', 'storm'];
  return { level: 15, abilities: Object.fromEntries(slots.map(id => [id, { level: id === 'storm' ? stormLevel : 5, unlocked: true }])),
    build: { slots, amulets: heartLevel == null ? ['amulet_focus', 'amulet_lunar'] : [HEART, 'amulet_lunar'],
      amuletLevels: heartLevel == null ? { amulet_focus: 5, amulet_lunar: 5 } : { [HEART]: heartLevel, amulet_lunar: 5 },
      branches: { telekinesis: 'breaker', fire: 'arsonist', seal: 'seer', storm: branch } } };
}
export function stormDriver(cm, act) {
  const ready = id => cm.abilityState(id).state === 'ready';
  if (cm.enemy.isPreparing && ready('telekinesis')) { act('a', 'telekinesis'); return; }
  if (cm.stormCharges === 3 && ready('storm')) { act('a', 'storm'); return; }
  for (const id of ['telekinesis', 'fire', 'seal']) if (ready(id)) { act('a', id); return; }
}
export function duelProfile(branch, heartLevel, style = 'throws') {
  const p = stormProfile(branch, heartLevel, 5, style);
  // A real defensive build leaves time to charge Storm; all-V support can end a Duel before any discharge.
  for (const [id, ability] of Object.entries(p.abilities)) if (id !== 'storm') ability.level = 1;
  p.build.amulets[1] = 'amulet_forest'; delete p.build.amuletLevels.amulet_lunar; p.build.amuletLevels.amulet_forest = 5;
  return p;
}
export function duelContext(attacker, defender, balanceVersion = COMBAT_BALANCE_VERSION) {
  return { balanceVersion, level: attacker.level, abilities: attacker.abilities, build: attacker.build, hp: 255, mana: 205,
    spawn: 'duel', enemy: 'duel_mage', potions: {}, potionLoadout: [],
    duel: { version: 2, rating: 1000, opponent: { ...defender, rating: 1000 } } };
}
export function checkedFight(ctx, driver = stormDriver) {
  const p = playBot(ctx, { driver, seed: 7, potions: false });
  assert.ok(p.cm.result, 'fight terminates');
  const snap = { ...emptySnapshot(), quests: ['chapter_2_complete'], enemies: [], combatCtx: ctx, combatSince: 1000 };
  const v = verifyCombat(snap, p.log, 2000 + p.log.ticks / 60 * 1000);
  assert.ok(v.ok && v.verdict.outcome === p.cm.result && v.verdict.mana === p.cm.hero.mana, 'server replay agrees');
  if (ctx.duel) assert.ok(!v.verdict.reward.items.sapphires && !ctx.sapphireDrops, 'Duel has no PvE sapphire roll');
  const events = p.cm.drainEvents(), defender = p.cm.duelBattle?.defender;
  return { outcome: p.cm.result, seconds: +p.cm.time.toFixed(3), hp: p.cm.hero.hp, mana: p.cm.hero.mana,
    stormHits: events.filter(e => e.type === 'damage' && e.school === 'storm' && e.target === 'enemy').length,
    defenderStormHits: events.filter(e => e.type === 'damage' && e.school === 'storm' && e.target === 'hero').length,
    manaFromHeart: events.filter(e => e.type === 'stormRefund').reduce((n,e) => n + e.mana, 0),
    defenderHeartRefundAt: Number.isFinite(defender?.stormAmuletRefundAt) ? defender.stormAmuletRefundAt : null,
    uses: p.cm.stats.abilityUses, defenderUses: p.cm.duelBattle?.defender.stats.abilityUses || null };
}
export function report() {
  const pve = [], duels = [], offensiveDuels = [];
  for (const style of ['throws', 'caster']) for (const branch of ['discharge', 'field']) for (const heartLevel of [null, 0, 1, 2, 3, 4, 5]) {
    const p = stormProfile(branch, heartLevel, 5, style);
    for (const [spawn, enemy] of [['fw_alpha', 'frost_alpha'], ['gy_warden', 'barrow_warden']]) {
      const ctx = { ...duelContext(p, p), spawn, enemy }; delete ctx.duel;
      pve.push({ style, branch, heartLevel, spawn, ...checkedFight(ctx) });
    }
  }
  // All tiers meet both branches, worn by the attacker, defender, and in equal pairs.
  for (const branch of ['discharge', 'field']) for (const heartLevel of [0, 1, 2, 3, 4, 5]) {
    const p = duelProfile(branch, heartLevel), baseline = duelProfile(branch, null), other = duelProfile(branch === 'field' ? 'discharge' : 'field', 5);
    for (const [kind, attacker, defender] of [['equal', p, p], ['attacker', p, baseline], ['defender', baseline, p], ['different_branch', p, other]]) {
      duels.push({ branch, heartLevel, kind, ...checkedFight(duelContext(attacker, defender)) });
    }
    const caster = duelProfile(branch, heartLevel, 'caster');
    for (const [kind, attacker, defender] of [['caster_attacker', caster, p], ['caster_defender', p, caster]]) duels.push({ branch, heartLevel, kind, ...checkedFight(duelContext(attacker, defender)) });
    const offensive = stormProfile(branch, heartLevel);
    offensiveDuels.push({ branch, heartLevel, ...checkedFight(duelContext(offensive, offensive)) });
  }
  return { date: '2026-10-21', balanceVersion: COMBAT_BALANCE_VERSION, kind: 'deterministic local bot, not player win rates',
    assumptions: 'Level 15, no potions. PvE: all gifts V, TK Breaker/Fire Arsonist or Fire Arsonist/Astral Seer, Lunar +5 companion. Duel: support gifts I, Storm V, Forest +5 companion so real charges/discharges occur before death. Offensive Duel probes retain all gifts V and Lunar +5. Baseline replaces Heart with Focus +5. Each replay verified by server engine. Attacker reacts every 10 fixed ticks; defender uses ordinary Duel AI.', pve, duels, offensiveDuels };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(report(), null, 2));
