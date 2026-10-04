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
      // v0.11.0: +25% урона (18 → 22), горение сильнее и дольше (16 → 30 урона за поджог). Мана и перезарядка прежние.
      2: {
        label: 'Огонь II',
        damage: 22, manaCost: 24, cooldownSec: 8, castSec: 0.3,
        burn: { dps: 5, durationSec: 6 },
        interruptsNormalCast: false,
      },
    },
  },
  // v0.10.1: «Печать» стала Астралом. Внутренний id остаётся 'seal' (сохранения, сервер, события unlock_seal_1 и т.п.),
  // игроку везде показывается «Астрал». В бою Астрал не прерывает атаки (это умеет только Телекинез): он бьёт силой,
  // которая игнорирует броню и защитную кору (Enemy.incomingMultiplier). Вне боя — открывает скрытое и пробуждает древнее.
  seal: {
    name: 'Астрал',
    color: 'seal',
    // v0.10.0: открывает Селена после проявления знаков на воротах (первая глава).
    levels: {
      1: {
        label: 'Астрал I',
        damage: 25, manaCost: 20, cooldownSec: 10, castSec: 0.3,
        ignoresDefense: true,          // броня и кора не гасят удар
        interruptsStrongCast: false,   // прерывать сильные атаки может только Телекинез
      },
      // v0.11.0: Астрал II — сильнее удар (25 → 35, +40%), чуть дороже по мане. Свойства прежние.
      2: {
        label: 'Астрал II',
        damage: 35, manaCost: 22, cooldownSec: 10, castSec: 0.3,
        ignoresDefense: true,
        interruptsStrongCast: false,
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
  seal: 20,                                    // v0.10.1: значимое применение Астрала (учебный камень, ворота, сердце рощи)
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
