// Магические дары. Источник: Combat Math v0.1 §2–§5, Progression & Economy v0.1, Concept v0.1 §10.
// levels[N] — параметры дара на ступени N. Логика читает только эти числа.

export const WEIGHT_CLASSES = ['light', 'medium', 'heavy'];

export const ABILITIES = {
  telekinesis: {
    name: 'Телекинез',
    color: 'telekinesis',
    levels: {
      1: {
        label: 'Телекинез I',
        damage: 20, manaCost: 14, cooldownSec: 5, castSec: 0.15,
        maxWeight: 'medium',           // в мире: light + medium; heavy — нет
        heavyObjectBonus: 0.5,         // тяжёлый объект поля: +50% (20 + 10 = 30)
        throwDamageBonus: 0,
        interruptsNormalCast: true,
        canTargetBossDirectly: false,
      },
      2: {
        label: 'Телекинез II',
        damage: 20, manaCost: 14, cooldownSec: 5, castSec: 0.15,
        maxWeight: 'heavy',            // тяжёлые объекты и новые проходы
        heavyObjectBonus: 0.5,
        throwDamageBonus: 0.35,        // +35% урона бросками
        interruptsNormalCast: true,
        canTargetBossDirectly: false,
      },
    },
  },
  fire: {
    name: 'Огонь',
    color: 'fire',
    levels: {
      1: {
        label: 'Огонь I',
        damage: 18, manaCost: 24, cooldownSec: 8, castSec: 0.3,
        burn: { dps: 4, durationSec: 4 },   // повторный Огонь обновляет длительность
        interruptsNormalCast: false,
      },
    },
  },
  seal: {
    name: 'Печать',
    color: 'seal',
    // v0.10.0: открывает Селена после проявления знаков на воротах (первая глава).
    levels: {
      1: {
        label: 'Печать I',
        damage: 0, manaCost: 20, cooldownSec: 10, castSec: 0.3,
        bindSec: 1.5,
        weaken: { damageReduction: 0.15, durationSec: 5 },
        interruptsStrongCast: true,
      },
    },
  },
};

// v0.9 — цена магии в мире (мана за одно выполненное действие). Неуспешное действие бесплатно.
export const WORLD_MANA_COST = {
  gather: 4,                                   // сбор узла: трава, грибы, смола, пыль, осколок
  pull: 4,                                     // притянуть растение / небольшой предмет Телекинезом
  push: { light: 8, medium: 12, heavy: 20 },   // сдвинуть камень по весу
  fire: 16,                                    // Огонь по препятствию, корням, кусту, факелу
  seal: 20,                                    // v0.10.0: значимое применение Печати (учебный знак, ворота, ремонт узла)
};

// Анимация магии в мире.
export const EXPLORATION_MAGIC = {
  manaCost: 0,
  telekinesisMoveSec: 0.9,
  telekinesisPullSec: 0.6,
  liftHeight: 26,
};

// Магический опыт школы за использование дара (Progression & Economy: «Магический опыт школы»).
export const SCHOOL_XP_PER_USE = {
  exploration: { telekinesis: 6, fire: 6, seal: 6 },
  combat: { telekinesis: 5, fire: 5, seal: 5 },
};
