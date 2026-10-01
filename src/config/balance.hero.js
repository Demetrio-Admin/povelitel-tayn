// Характеристики героя и таблица уровней.
// Источник: Combat Math v0.1 §1, §11; Progression & Economy v0.1 «Первые 10 уровней».
// Значения — абсолютные для каждого уровня, чтобы их легко было править.

export const HERO_BASE = {
  autoAttack: { damage: 6, intervalSec: 2 },  // слабая автоатака, DPS 3
};

// xp — суммарный опыт, нужный для достижения уровня.
// [ПРОТОТИП] Пороги XP в документах не заданы — подобраны так, чтобы по маршруту
// игрок получал ур. 2 после первого боя и ур. 3 к моменту Телекинеза II.
export const HERO_LEVELS = [
  { level: 1, xp: 0,   maxHp: 120, maxMana: 100, manaRegen: 4, damageMult: 1.00, note: 'Телекинез I' },
  { level: 2, xp: 60,  maxHp: 126, maxMana: 110, manaRegen: 4, damageMult: 1.05, note: '+10 маны, +5% урона' },
  { level: 3, xp: 150, maxHp: 132, maxMana: 110, manaRegen: 4, damageMult: 1.05, note: 'Доступ к Телекинезу II' },
  { level: 4, xp: 270, maxHp: 138, maxMana: 115, manaRegen: 4, damageMult: 1.08, note: 'Пассивный талант (не в прототипе)' },
  { level: 5, xp: 430, maxHp: 144, maxMana: 120, manaRegen: 4, damageMult: 1.10, note: 'Развитие Огня' },
];

export const HERO_RECOVERY = {
  // Смерть не наказывает сильно (Combat Math §10).
  restoreHpAfterVictory: true,
  restoreHpAfterDefeat: true,
  coinsLostOnDefeat: 5,
};
