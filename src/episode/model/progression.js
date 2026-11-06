// Episode-only tuning over existing upgrade IDs, recipe IDs and GameState fields.
// Never call these functions for the online state. No wallet or paid modifiers.
import { UPGRADES } from '../../config/balance.progression.js';
import { RECIPES } from '../../config/recipes.js';
import { powerLevel, learnedMoves } from '../../config/magic.powers.js';
import { HERO, WOLF } from './combat.js';
import { atLeast } from './story.js';

export const ENCOUNTERS = {
  forest_wolf: { ...WOLF, id: 'forest_wolf', name: 'Лесной волк', texture: 'enemy_frost_wolf', hp: 38, idle: [1.9, 2.4], reward: { coins: 20, moon_herb: 1, forest_mushroom: 1 }, xp: 14 },
  forest_spirit: { ...WOLF, id: 'forest_spirit', name: 'Лесной дух', texture: 'enemy_guardian', hp: 130, armor: .25, regen: 1.1, reward: { coins: 40, rune_dust: 2, tree_resin: 1, lunar_shard: 1 }, xp: 25 },
  frost_wolf: { ...WOLF, texture: 'enemy_frost_wolf', hp: 500, regen: .3, reward: { coins: 80, lunar_shard: 2 }, xp: 35,
    actions: { ...WOLF.actions, leap: { ...WOLF.actions.leap, dmg: 33 }, bite: { ...WOLF.actions.bite, dmg: 13 } } },
};
export const EPISODE_UPGRADES = {
  telekinesis_2: { ...UPGRADES.telekinesis_2, cost: { coins: 45, schoolXP: 20, items: { tree_resin: 1 } }, timerSec: { live: 3, prototype: 3 }, explanation: 'Удержание в бою; тяжёлое становится послушнее в мире.' },
  fire_3_arsonist: { ...UPGRADES.fire_3_arsonist, cost: { coins: 65, schoolXP: 35, items: { tree_resin: 2, rune_dust: 1 } }, timerSec: { live: 3, prototype: 3 }, explanation: 'Пламя оставляет горение: новый способ одолеть крепкого противника.' },
};
export function upgradeStatus(data, ep, id) {
  const u = EPISODE_UPGRADES[id];
  if (!u) return { ok: false, reason: 'Неизвестное улучшение.' };
  if (!atLeast(ep, 'melt')) return { ok: false, reason: 'Сначала завершите ритуал Проводника.' };
  if (data.research) return { ok: false, reason: 'Уже идёт изучение. Оно завершится через несколько секунд.' };
  if (powerLevel(data, u.ability) >= u.toLevel) return { ok: false, reason: 'Уже изучено.' };
  if (powerLevel(data, u.ability) < u.toLevel - 1) return { ok: false, reason: 'Сначала откройте предыдущую ступень.' };
  const needs = { ...u.cost.items, coins: u.cost.coins };
  if (Object.entries(needs).some(([k, n]) => (data.inventory[k] || 0) < n) || (data.schoolXP[u.ability] || 0) < u.cost.schoolXP) return { ok: false, reason: 'Не хватает ресурсов: соберите смолу, сразитесь с волком или духом, продайте настой.' };
  return { ok: true, upgrade: u };
}
export function beginEpisodeResearch(state, ep, id) {
  const st = upgradeStatus(state.data, ep, id);
  if (!st.ok) return st;
  const u = st.upgrade, d = state.data;
  for (const [k, n] of Object.entries({ ...u.cost.items, coins: u.cost.coins })) d.inventory[k] = (d.inventory[k] || 0) - n;
  d.schoolXP[u.ability] -= u.cost.schoolXP;
  // Existing timer/completion machinery completes this canonical upgrade and branch.
  d.research = { upgradeId: id, startedAt: state.now(), durationMs: u.timerSec.prototype * 1000 };
  state.save();
  return { ok: true };
}
export const BREW_ID = 'potion_life_small';
export function brewEpisode(data) {
  const r = RECIPES[BREW_ID];
  if (Object.entries(r.needs).some(([k, n]) => (data.inventory[k] || 0) < n)) return false;
  for (const [k, n] of Object.entries(r.needs)) data.inventory[k] -= n;
  data.inventory[r.result] = (data.inventory[r.result] || 0) + r.amount;
  return true;
}
export function sellEpisodePotion(data) {
  if (!(data.inventory[BREW_ID] > 0)) return false;
  data.inventory[BREW_ID]--; data.inventory.coins = (data.inventory.coins || 0) + 25;
  return true;
}
export function encounterReward(data, enemy, usedPowers) {
  for (const [k, n] of Object.entries(enemy.reward)) data.inventory[k] = (data.inventory[k] || 0) + n;
  for (const id of new Set(usedPowers)) data.schoolXP[id] = (data.schoolXP[id] || 0) + enemy.xp;
}
export function battleOptions(data, ep, enemyId) {
  const tier = Math.max(powerLevel(data, 'fire'), powerLevel(data, 'telekinesis'));
  const hero = { ...HERO, hp: 80 + tier * 12, mana: 50 + tier * 5 };
  return { enemy: ENCOUNTERS[enemyId] || ENCOUNTERS.frost_wolf, hero, powers: data, familiar: !!ep.morven,
    potion: !!ep.usePotion && (data.inventory[BREW_ID] || 0) > 0,
    amulet: ep.amulet && data.inventory[ep.amulet] > 0 ? ep.amulet : null };
}
export function defaultLoadout(data) {
  const learned = learnedMoves(data);
  return ['flame', 'throw', 'push', 'ward'].filter(id => learned.includes(id)).concat(learned).filter((id, i, a) => a.indexOf(id) === i).slice(0, 4);
}
