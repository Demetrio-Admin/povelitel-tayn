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
  maxTickSec: 0.25,          // один кадр не может начислить больше (скрытая вкладка, подвисание)
  lowHpRetryWarn: 0.4,       // перед «Сразиться снова» при HP ниже 40% — предупреждение
  combatLowHpHint: 0.45,     // в бою при HP ниже 45% подсказываем настой жизни
};

// v0.9 — лечение у Мирры за монеты: цена = ceil(недостающее HP / hpPerCoin)
export const HEALING = { hpPerCoin: 10 };
