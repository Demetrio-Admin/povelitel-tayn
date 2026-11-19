import { HORIZON_TABLES } from './tables.generated.js';

export const CORE = Object.fromEntries(HORIZON_TABLES.core_curves.map(row => [row.param_key, row.value]));
export const ECONOMY = Object.fromEntries(HORIZON_TABLES.economy_tide.map(row => [row.section + '.' + row.key, row.value]));
export const TIDE = HORIZON_TABLES.economy_tide.filter(row => row.section === 'tide');
export const PACKS = Object.fromEntries(HORIZON_TABLES.encounter_packs.map(row => [row.pack_id, row]));
export const GIFT_RULES = Object.fromEntries(HORIZON_TABLES.gifts_40.map(row => [row.id, row]));
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

const HP_MULTIPLIERS = { normal: CORE.mob_hp_mult, elite: CORE.elite_hp_mult, boss: CORE.boss_hp_mult };

export function encounterHp(level, difficulty, share) {
  return Math.round(CORE.base_power * HP_MULTIPLIERS[difficulty] * levelScale(level) * share);
}

export function coverage(scope, primary) {
  switch (scope) {
    case 'single': return primary ? 1 : 0;
    case 'splash': return primary ? 1 : CORE.scope_splash_secondary;
    case 'chain':
    case 'all': return CORE.scope_all;
    default: throw new Error('Unknown target scope: ' + scope);
  }
}

function ratingEffect(rating, scale, cap, denominator) {
  return cap * rating / (rating + denominator * scale);
}

export function defensiveRatings(level, { armor = 0, resistance = 0, cooldown = 0, crit = 0 } = {}) {
  const scale = levelScale(level);
  return {
    armor: ratingEffect(armor, scale, CORE.armor_cap, CORE.armor_k),
    resistance: ratingEffect(resistance, scale, CORE.status_resist_cap, CORE.status_resist_k),
    cooldown: ratingEffect(cooldown, scale, CORE.cdr_cap, CORE.cdr_k),
    crit: ratingEffect(crit, scale, CORE.crit_cap, CORE.crit_k),
  };
}

export function incomingDamage(base, { armor = 0, resistance = 0, potion = 0, amulet = 0 } = {}) {
  const remaining = (1 - armor) * (1 - resistance) * (1 - potion) * (1 - amulet);
  return Math.max(base * CORE.min_damage_floor, base * remaining);
}

export function effectiveCooldown(base, reduction = 0) {
  return base * (1 - Math.min(reduction, CORE.max_total_cdr));
}
