import { HORIZON_TABLES } from './tables.generated.js';

export const CORE = Object.fromEntries(HORIZON_TABLES.core_curves.map(row => [row.param_key, row.value]));
export const ECONOMY = Object.fromEntries(HORIZON_TABLES.economy_tide.map(row => [row.section + '.' + row.key, row.value]));
export const TIDE = HORIZON_TABLES.economy_tide.filter(row => row.section === 'tide');
export const PACKS = Object.fromEntries(HORIZON_TABLES.encounter_packs.map(row => [row.pack_id, row]));
export const STARTER_GIFTS = Object.fromEntries(HORIZON_TABLES.gifts_40
  .filter(row => ['fire', 'telekinesis'].includes(row.id)).map(row => [row.id, row]));
export const FOX = HORIZON_TABLES.companions.find(row => row.id === 'fox');

export function tideAt(winsBefore) {
  return TIDE.find(row => row.threshold === null || winsBefore < row.threshold);
}

export function baseBattleCoins(level) {
  return Math.floor(ECONOMY['coins.base_fight'] * ECONOMY['coins.reward_growth'] ** (level - 1));
}

export function levelScale(level) {
  const earlyLevels = Math.min(level, CORE.target_year_levels) - 1;
  return CORE.power_growth ** earlyLevels * CORE.paragon_power_growth ** Math.max(0, level - CORE.target_year_levels);
}

export function wandInterval(rank) {
  const { wand_start_interval: start, wand_min_interval: min, wand_decay_ranks: decay } = CORE;
  return min + (start - min) * Math.exp(-rank / decay);
}
