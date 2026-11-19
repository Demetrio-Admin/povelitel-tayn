import { GIFT_RULES } from './rules.js';

// Local playtest tuning. The version 41 tables and database export omit these choices.
export const PREVIEW_CORE = Object.freeze({
  "episode_wand_rank_step": 8,
  "episode_wand_base_mult": 0.86,
  "episode_wand_upgrade_power": 1.065,
  "episode_enemy_hit_mult": 0.7,
  "episode_enemy_attack_interval": 2.5,
  "episode_enemy_cast_every": 3,
  "episode_enemy_cast_duration": 1.2,
  "episode_enemy_cast_mult": 1.8,
  "episode_heat_tick_mult": 0.13,
  "episode_heat_duration": 4,
  "episode_solo_first_attack_sec": 2,
  "episode_ward_shield": 0.15
});

export const PREVIEW_GIFTS = Object.freeze({
  fire: { ...GIFT_RULES.fire, mana: GIFT_RULES.fire.mana ?? 12, cd_sec: GIFT_RULES.fire.cd_sec ?? 4, sp_mult: GIFT_RULES.fire.sp_mult ?? 0.9 },
  telekinesis: { ...GIFT_RULES.telekinesis, mana: GIFT_RULES.telekinesis.mana ?? 9, cd_sec: GIFT_RULES.telekinesis.cd_sec ?? 3, sp_mult: GIFT_RULES.telekinesis.sp_mult ?? 0.55 },
});
