// Характеристики героя и таблица уровней.
// Источник: Combat Math v0.1 §1, §11; Progression & Economy v0.1 «Первые 10 уровней».
// Значения — абсолютные для каждого уровня, чтобы их легко было править.

export const HERO_BASE = {
  autoAttack: { damage: 6, intervalSec: 2 },  // слабая автоатака, DPS 3
};

// xp — суммарный опыт, нужный для достижения уровня.
// [ПРОТОТИП] Пороги XP в документах не заданы — подобраны так, чтобы по маршруту
// игрок получал ур. 2 после первого боя и ур. 3 к моменту Телекинеза II.
// v0.10.0: уровни 6–10 (стартовый баланс v0.1, первая глава); реген маны в бою — 3/с (было 4) на всех уровнях.
// Тот же набор (level, xp, maxHp, maxMana) — в SQL game_hero_levels (supabase/schema.sql); совпадение проверяет diff-test.
export const HERO_LEVELS = [
  { level: 1,  xp: 0,    maxHp: 120, maxMana: 100, manaRegen: 3, damageMult: 1.00, note: 'Телекинез I' },
  { level: 2,  xp: 60,   maxHp: 126, maxMana: 110, manaRegen: 3, damageMult: 1.05, note: '+10 маны, +5% урона' },
  { level: 3,  xp: 150,  maxHp: 132, maxMana: 110, manaRegen: 3, damageMult: 1.05, note: 'Доступ к Телекинезу II' },
  { level: 4,  xp: 270,  maxHp: 138, maxMana: 115, manaRegen: 3, damageMult: 1.08, note: 'Телекинез II, путь к Огню' },
  { level: 5,  xp: 430,  maxHp: 144, maxMana: 120, manaRegen: 3, damageMult: 1.10, note: 'Старый лес' },
  { level: 6,  xp: 650,  maxHp: 152, maxMana: 125, manaRegen: 3, damageMult: 1.12, note: 'Астрал и испытание' },
  { level: 7,  xp: 940,  maxHp: 160, maxMana: 135, manaRegen: 3, damageMult: 1.15, note: 'Завершение главы' },
  { level: 8,  xp: 1300, maxHp: 170, maxMana: 140, manaRegen: 3, damageMult: 1.18, note: 'Дополнительный выход' },
  { level: 9,  xp: 1750, maxHp: 180, maxMana: 145, manaRegen: 3, damageMult: 1.21, note: 'Продолжение' },
  { level: 10, xp: 2350, maxHp: 190, maxMana: 155, manaRegen: 3, damageMult: 1.25, note: 'Продолжение' },
];

export const HERO_RECOVERY = {
  // Смерть не наказывает сильно (Combat Math §10).
  restoreHpAfterVictory: true,     // v0.9: победа восстанавливает HP полностью (мана — фактический остаток)
  defeatHpFraction: 0.2,           // v0.9: после поражения — 20% максимума HP (минимум 1), героиня остаётся рядом с врагом
  coinsLostOnDefeat: 5,            // штраф не больше 5 монет (не увеличивать)
};

// v0.9 — общие HP и мана героини (мир + бой). Стартовые значения для теста, см. README «Баланс v0.9».
export const VITALS = {
  hpRegenPerSec: 1,          // вне боя (в бою HP сам не восстанавливается)
  manaRegenWorld: 0.5,       // в мире
  manaRegenHouse: 2,         // в доме Мирры (зона A) — быстрее и бесплатно
  houseZone: 'A',
  staleCombatSec: 15 * 60,   // v0.12.0: бой, о завершении которого сервер не узнал за 15 минут, считается отступлением
  lowHpRetryWarn: 0.4,       // перед «Сразиться снова» при HP ниже 40% — предупреждение
  combatLowHpHint: 0.45,     // в бою при HP ниже 45% подсказываем настой жизни
};

// v0.9 — лечение у Мирры за монеты: цена = ceil(недостающее HP / hpPerCoin)
export const HEALING = { hpPerCoin: 10 };
