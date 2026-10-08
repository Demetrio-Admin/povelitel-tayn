// v0.25.0 — Ковены, первая версия (stage-2-design-pack §26): создание и вступление, название и девиз, список участников, роли
// (глава, советник, участник), чат ковена (вкладка в общем чате) и общая цель.
// v0.33.0 — цель считается не за неделю, а за цикл в 3 дня (границы — по UTC, от cycle.startDay), и растёт «лестницей»:
//   цикл выполнен — цель следующего цикла +200 (до потолка), не выполнен (в том числе пропущен) — −200 (не ниже базовой 400).
//   В конце выполненного цикла сервер фиксирует пятёрку лучших по личному вкладу и делит между ними пул сапфиров:
//   10% от цели, не больше poolMax; по местам — доли shares; кто не набрал минимум — в пятёрку не попадает, а невостребованная
//   часть пула не перераспределяется (иначе мини-ковен из двух-трёх аккаунтов забирал бы весь пул).
// Каждый, кто внёс не меньше минимума, один раз за цикл сразу после выполнения цели забирает обычную награду (монеты и кристалл).
// Таблицы, роли и чат — в supabase/migrations/20261007_covens.sql, циклы и выплаты — в 20261008_coven_cycles.sql;
// материалы и награды — операции сервера coven_give / coven_claim / coven_payout.

export const COVENS = {
  requires: 'ch2_coven_ready',   // знакомство с Ковенами — квест 14 «Не в одиночку»
  maxMembers: 20,
  cycle: { days: 3, startDay: 20731 },   // номер суток UTC первого цикла (понедельник 5 октября 2026); циклы идут подряд по 3 суток
  goal: 400,                     // базовая цель цикла (очков ковена)
  goalStep: 200,                 // лестница: +200 за выполненный цикл, −200 за невыполненный
  goalMax: 1500,                 // потолок цели (и пула: 10% от 1500 = 150)
  minGiven: 20,                  // минимальный личный вклад: и для обычной награды, и для пятёрки…
  minGivenPct: 5,                // …но не меньше 5% от цели (400 → 20, 1000 → 50, 1500 → 75)
  dailyPoints: 10,               // за каждое выполненное поручение доски
  maxGive: 99,
  // очки за единицу материала
  points: { moon_herb: 1, forest_mushroom: 1, tree_resin: 1, frost_herb: 2, rune_dust: 2, lunar_shard: 3, ice_crystal: 5 },
  // обычная награда цикла (при базовой цели; монеты растут вместе с целью: 50 монет за каждые 400 очков)
  reward: { coins: 50, items: { ice_crystal: 1 } },
  top: { size: 5, poolPct: 10, poolMax: 150, shares: [30, 25, 20, 15, 10], claimDays: 14 },   // пул сапфиров пятёрке; забрать — 14 суток
};

export const COVEN_ROLES = { leader: 'Глава', officer: 'Советник', member: 'Участник' };

// ---- те же расчёты, что в SQL (_coven_*): проверяются сравнением с настоящим Postgres (tools/sql/coven-cycles-test.mjs)
const DAY = 86_400_000;
/** Начало цикла (номер суток UTC), в котором находится момент nowMs. */
export const covenCycleStartDay = (nowMs, c = COVENS.cycle) => c.startDay + Math.floor((Math.floor(nowMs / DAY) - c.startDay) / c.days) * c.days;
/** Конец цикла (мс), в котором находится момент nowMs. */
export const covenCycleEndMs = (nowMs, c = COVENS.cycle) => (covenCycleStartDay(nowMs, c) + c.days) * DAY;
/** Цель следующего цикла: выполнен — +шаг (до потолка), нет — −шаг (не ниже базовой). */
export const covenGoalAfter = (goal, success, C = COVENS) => (success ? Math.min(goal + C.goalStep, C.goalMax) : Math.max(goal - C.goalStep, C.goal));
/** Минимальный личный вклад при цели goal. */
export const covenMinGiven = (goal, C = COVENS) => Math.max(C.minGiven, Math.ceil(goal * C.minGivenPct / 100));
/** Пул сапфиров пятёрке за выполненный цикл с целью goal. */
export const covenPool = (goal, T = COVENS.top) => Math.min(Math.floor(goal * T.poolPct / 100), T.poolMax);
/** Доли пула по местам (целые сапфиры, остаток не раздаётся). */
export const covenShares = (pool, T = COVENS.top) => T.shares.slice(0, T.size).map((p) => Math.floor(pool * p / 100));
/** Обычная награда цикла при цели goal: монеты растут вместе с целью (кратно 5), предметы те же. */
export const covenRewardFor = (goal, C = COVENS) => ({ coins: Math.round(C.reward.coins * goal / C.goal / 5) * 5, items: C.reward.items });

/** Для сервера (_game_rules). */
export function covenRules() {
  return { requires: COVENS.requires, maxMembers: COVENS.maxMembers, goal: COVENS.goal, goalStep: COVENS.goalStep, goalMax: COVENS.goalMax,
    cycleDays: COVENS.cycle.days, cycleStartDay: COVENS.cycle.startDay, minGiven: COVENS.minGiven, minGivenPct: COVENS.minGivenPct,
    dailyPoints: COVENS.dailyPoints, maxGive: COVENS.maxGive, points: COVENS.points, reward: COVENS.reward,
    topSize: COVENS.top.size, poolPct: COVENS.top.poolPct, poolMax: COVENS.top.poolMax, shares: COVENS.top.shares, claimDays: COVENS.top.claimDays };
}
