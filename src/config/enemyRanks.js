// Уровень описывает сложность встречи; характеристики и награды боя не меняются.
// rank различает противников одного уровня для личного рекорда и будущего PvE-рейтинга.
export const ENEMY_RANKS = {
  young_scavenger: { level: 1, difficulty: 'normal', rank: 100 },
  forest_scavenger: { level: 2, difficulty: 'normal', rank: 200 },
  rootling: { level: 5, difficulty: 'normal', rank: 500 },
  forest_guardian: { level: 6, difficulty: 'elite', rank: 610 },
  node_guardian: { level: 8, difficulty: 'boss', rank: 820 },
  frost_critter: { level: 9, difficulty: 'normal', rank: 900 },
  frost_collector: { level: 10, difficulty: 'normal', rank: 1000 },
  frost_collector_elite: { level: 11, difficulty: 'elite', rank: 1110 },
  ice_guardian: { level: 12, difficulty: 'elite', rank: 1210 },
  volunteer: { level: 12, difficulty: 'normal', rank: 1200 },
  experimental_construct: { level: 13, difficulty: 'elite', rank: 1310 },
  frost_wolf: { level: 13, difficulty: 'normal', rank: 1300 },
  grave_wisp: { level: 13, difficulty: 'normal', rank: 1301 },
  grave_hound: { level: 14, difficulty: 'normal', rank: 1400 },
  frost_alpha: { level: 15, difficulty: 'boss', rank: 1520 },
  barrow_warden: { level: 15, difficulty: 'boss', rank: 1521 },
  severin_boss: { level: 15, difficulty: 'boss', rank: 1522 },
};
export const ENEMY_DIFFICULTY = { normal: 'Обычный', elite: 'Элитный', boss: 'Босс' };
export function enemyCaption(def) {
  return def.level ? `${def.name} · ур. ${def.level} · ${ENEMY_DIFFICULTY[def.difficulty] || 'Обычный'}` : def.name;
}
