// v0.25.0 — Ковены, первая версия (stage-2-design-pack §26): создание и вступление, название и девиз, список участников, роли
// (глава, советник, участник), чат ковена (вкладка в общем чате) и общая недельная цель.
// Неделя ковена (с понедельника, UTC): участники приносят материалы и выполняют поручения доски — копятся очки ковена.
// Когда цель недели набрана, каждый, кто внёс хотя бы minGiven очков, один раз забирает награду недели.
// Таблицы, роли и чат — в supabase/migrations/20261007_covens.sql; материалы и награда — операции сервера coven_give / coven_claim.

export const COVENS = {
  requires: 'ch2_coven_ready',   // знакомство с Ковенами — квест 14 «Не в одиночку»
  maxMembers: 20,
  goal: 400,                     // очков ковена за неделю
  minGiven: 20,                  // личный вклад, чтобы забрать награду недели
  dailyPoints: 10,               // за каждое выполненное поручение доски
  maxGive: 99,
  // очки за единицу материала
  points: { moon_herb: 1, forest_mushroom: 1, tree_resin: 1, frost_herb: 2, rune_dust: 2, lunar_shard: 3, ice_crystal: 5 },
  reward: { coins: 120, items: { ice_crystal: 2, frost_shard: 1 } },
};

export const COVEN_ROLES = { leader: 'Глава', officer: 'Советник', member: 'Участник' };

/** Для сервера (_game_rules). */
export function covenRules() {
  return { requires: COVENS.requires, maxMembers: COVENS.maxMembers, goal: COVENS.goal, minGiven: COVENS.minGiven,
    dailyPoints: COVENS.dailyPoints, maxGive: COVENS.maxGive, points: COVENS.points, reward: COVENS.reward };
}
