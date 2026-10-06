// v0.14.0 — проверка боя на сервере. Без Phaser и DOM; в Edge Function combat попадает тем же кодом (tools/build-combat-function.mjs).
//
// Как это работает. В начале боя сервер сам запоминает состояние героя (player_action combat_start → combatCtx: уровень, дары, ветки,
// зелья, HP и мана — всё из его данных, клиент называет только место боя и врага). Бой идёт на фиксированном шаге без случайных чисел,
// поэтому игра записывает действия игрока (systems/combatReplay.js), а здесь тот же движок (CombatManager) проигрывает запись
// с запомненного состояния и сам решает: победа, поражение или бой не закончен. Присланному клиентом «я победил» веры нет.
// verdict — итог для combatApply (playerModel.js; в базе — SQL combat_apply): исход, мана, выпитые зелья, награда, штраф, события.
//
// Чего проверка НЕ ловит: «идеального» игрока-бота. Любая запись, которую движок принимает, — это запись, которую мог сыграть человек
// (дар можно применить только при готовности и хватающей мане, враг бьёт по своим правилам). Защита от ботов — отдельная задача (рейтинг, этап 4+).
import { GameState } from '../state/GameState.js';
import { fromSnapshot, emptySnapshot, COMBAT_POTIONS } from './playerModel.js';
import { CombatManager } from '../systems/CombatManager.js';
import { AbilitySystem } from '../systems/AbilitySystem.js';
import { normalizeLog, replayCombat, STEP, MAX_HOLD_TICKS } from '../systems/combatReplay.js';
import { enemyDownNow, repKey, repState } from '../state/enemyRep.js';
import { ENEMIES } from '../config/balance.enemies.js';
import { ENEMY_SPAWNS } from '../config/world.layout.js';
import { EVENT_REWARDS } from '../config/balance.progression.js';
import { HERO_RECOVERY } from '../config/balance.hero.js';
import { COMBAT_TUTORIAL } from '../config/story.js';
import { DUEL, duelEnemyDef, ratingDelta } from '../config/duel.js';

/** Сколько секунд боя можно «набрать» сверх реального времени с момента combat_start (часы клиента и сервера расходятся). */
export const SLACK_SEC = 10;

const add = (o, k, n) => { if (n) o[k] = (o[k] || 0) + n; };
const mergeReward = (into, g) => {
  into.heroXP = (into.heroXP || 0) + (g.heroXP || 0);
  for (const [k, v] of Object.entries(g.schoolXP || {})) { into.schoolXP = into.schoolXP || {}; add(into.schoolXP, k, v); }
  for (const [k, v] of Object.entries(g.items || {})) { into.items = into.items || {}; add(into.items, k, v); }
};

/** Состояние героя в начале боя (из combatCtx) — на нём проигрывается запись. */
export function startState(ctx, nowMs = Date.now()) {
  const snap = emptySnapshot();
  snap.level = ctx.level;
  snap.abilities = JSON.parse(JSON.stringify(ctx.abilities));
  snap.inventory = { ...ctx.potions };
  snap.hp = ctx.hp; snap.mana = ctx.mana;
  snap.objects = ctx.build ? { player_build: JSON.parse(JSON.stringify(ctx.build)) } : {};
  const st = new GameState(null, () => nowMs);
  st.setData(fromSnapshot(snap));
  return st;
}

/** Описание места боя из конфига мира или null. */
export function spawnOf(spawnId) { return ENEMY_SPAWNS.find(x => x.id === spawnId) || null; }

/**
 * Проверить запись боя.
 * @param snap  текущий снимок игрока с сервера (с combatSince и combatCtx)
 * @param rawLog запись боя от клиента (неподтверждённая)
 * @param nowMs время сервера, мс
 * @returns { ok: true, verdict } или { ok: false, reason }
 *   reason: no_combat (бой не начинался / уже принят), bad_log, bad_spawn, locked (место ещё закрыто), down (враг уже побеждён),
 *           too_fast (в записи больше шагов, чем прошло времени)
 */
export function verifyCombat(snap, rawLog, nowMs) {
  const fail = (reason) => ({ ok: false, reason });
  const ctx = snap?.combatCtx;
  if (snap?.combatSince == null || !ctx) return fail('no_combat');
  const log = normalizeLog(rawLog);
  if (!log) return fail('bad_log');
  if (ctx.spawn === 'duel') return verifyDuel(snap, ctx, log, nowMs);   // v0.26.0: Магическая Дуэль
  const spawn = spawnOf(ctx.spawn);
  if (!spawn || spawn.enemy !== ctx.enemy || !Object.hasOwn(ENEMIES, ctx.enemy)) return fail('bad_spawn');
  if (spawn.requiresEvent && !snap.quests.includes(spawn.requiresEvent)) return fail('locked');
  const cur = new GameState(null, () => nowMs);
  cur.setData(fromSnapshot(snap));
  if (enemyDownNow(cur, spawn)) return fail('down');
  if (log.ticks * STEP > (nowMs - snap.combatSince) / 1000 + SLACK_SEC) return fail('too_fast');

  // --- проигрываем бой с запомненного состояния
  const st = startState(ctx, nowMs);
  const cm = new CombatManager({ enemyType: ctx.enemy, state: st, abilities: new AbilitySystem(st, null, null) });
  const run = replayCombat(cm, log);
  const tutorial = spawn.id === COMBAT_TUTORIAL.spawnId && !snap.enemies.includes(spawn.id);
  if (run.held > 0 && (!tutorial || run.held > MAX_HOLD_TICKS)) return fail('bad_log');

  const since = snap.combatSince;
  const outcome = cm.result || 'retreat';
  const verdict = { outcome, since, spawn: spawn.id, ticks: run.ticks, mana: cm.hero.mana };
  if (outcome === 'retreat') return { ok: true, verdict };   // запись оборвалась, не дойдя до конца боя

  // зелья: сколько выпито (сумка стартового состояния минус остаток)
  verdict.potions = {};
  for (const id of COMBAT_POTIONS) add(verdict.potions, id, (ctx.potions[id] || 0) - st.item(id));

  // опыт даров за применения в бою — всегда (и при поражении), как раньше (CombatManager.useAbility)
  const reward = { heroXP: 0, schoolXP: {}, items: {} };
  mergeReward(reward, { schoolXP: { ...st.data.schoolXP } });

  if (outcome === 'victory') {
    const first = !cur.isEnemyDefeated(spawn.id);
    const def = cm.def;
    const base = first || !def.repeatRewards ? def.rewards : def.repeatRewards;
    const before = cur.data.heroLevel;
    mergeReward(reward, cur.applyReward(base).granted);
    verdict.events = [];
    if (spawn.defeatEvent && first && cur.markEvent(spawn.defeatEvent)) {
      verdict.events.push(spawn.defeatEvent);
      const er = EVENT_REWARDS[spawn.defeatEvent];
      if (er) mergeReward(reward, cur.applyReward(er).granted);
    }
    if (spawn.opensPath) verdict.path = spawn.opensPath;
    if (spawn.repeatSec) { const r = repState(cur, spawn.id); verdict.rep = { key: repKey(spawn.id), wins: (r?.wins || 0) + 1, at: nowMs }; }
    verdict.first = first;
    verdict.levelsGained = cur.data.heroLevel - before;
  } else {
    verdict.coinsLost = Math.min(cur.item('coins'), HERO_RECOVERY.coinsLostOnDefeat);
  }
  // нулевые поля убираем — ответ короче, SQL проще
  if (!reward.heroXP) delete reward.heroXP;
  verdict.reward = reward;
  verdict.entry = {
    enemy: ctx.enemy, spawnId: spawn.id, result: outcome, timeSec: Math.round(cm.time * 10) / 10,
    interrupts: cm.stats.interrupts, uses: { ...cm.stats.abilityUses },
  };
  return { ok: true, verdict };
}

/**
 * v0.26.0: проверка Магической Дуэли. Соперник — профиль из слепка, запомненного сервером на старте (combatCtx.duel.opponent);
 * та же запись боя проигрывается тем же движком. Итог: награда Дуэли (без штрафа монет), изменение рейтинга по Эло, история.
 */
function verifyDuel(snap, ctx, log, nowMs) {
  const fail = (reason) => ({ ok: false, reason });
  const d = ctx.duel;
  if (ctx.enemy !== 'duel_mage' || !d || typeof d !== 'object' || !d.opponent || typeof d.opponent !== 'object') return fail('bad_spawn');
  if (log.ticks * STEP > (nowMs - snap.combatSince) / 1000 + SLACK_SEC) return fail('too_fast');
  const st = startState(ctx, nowMs);
  const cm = new CombatManager({ enemyType: 'duel_mage', enemyDef: duelEnemyDef(d.opponent), state: st, abilities: new AbilitySystem(st, null, null) });
  const run = replayCombat(cm, log);
  if (run.held > 0) return fail('bad_log');
  const outcome = cm.result || 'retreat';
  const verdict = { outcome, since: snap.combatSince, spawn: 'duel', ticks: run.ticks, mana: cm.hero.mana };
  if (outcome === 'retreat') return { ok: true, verdict };
  verdict.potions = {};
  for (const id of COMBAT_POTIONS) add(verdict.potions, id, (ctx.potions[id] || 0) - st.item(id));
  const win = outcome === 'victory';
  const reward = { heroXP: 0, schoolXP: {}, items: {} };
  mergeReward(reward, { schoolXP: { ...st.data.schoolXP } });
  const r = win ? DUEL.reward.victory : DUEL.reward.defeat;
  mergeReward(reward, { heroXP: r.heroXP || 0, items: r.coins ? { coins: r.coins } : {} });
  if (!reward.heroXP) delete reward.heroXP;
  verdict.reward = reward;
  const my = Number.isFinite(d.rating) ? d.rating : DUEL.baseRating, opp = Number.isFinite(d.opponent.rating) ? d.opponent.rating : DUEL.baseRating;
  verdict.duel = { win, delta: ratingDelta(my, opp, win), opponent: String(d.opponent.name || '').slice(0, 40) };
  verdict.entry = {
    enemy: 'duel_mage', spawnId: 'duel', result: outcome, timeSec: Math.round(cm.time * 10) / 10,
    interrupts: cm.stats.interrupts, uses: { ...cm.stats.abilityUses },
  };
  return { ok: true, verdict };
}
