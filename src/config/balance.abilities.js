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
      // v0.11.1: ступень III — «два броска подряд»: после первого броска второй доступен без перезарядки в течение windowSec
      // (мана тратится за каждый). Дальше игрок выбирает ветку (branches), её числа накладываются поверх этой ступени.
      3: {
        label: 'Телекинез III',
        damage: 20, manaCost: 14, cooldownSec: 5, castSec: 0.15,
        maxWeight: 'heavy',
        heavyObjectBonus: 0.5,
        throwDamageBonus: 0.35,
        doubleCast: { windowSec: 2.5 },
        interruptsNormalCast: true,
        canTargetBossDirectly: false,
      },
    },
    // Ветки ступени III. Накладка на числа ступени: set — заменить, add — прибавить, mul — умножить. У каждой ветки есть цена.
    branches: {
      lord: {
        name: 'Повелитель', fromLevel: 3,
        text: 'Мастер прерываний: каждое удачное прерывание возвращает половину маны и ускоряет перезарядку на 3 с.',
        tradeoff: 'Прямой урон ниже на 10%.',
        mul: { damage: 0.9 },
        set: { interruptRefund: { cooldownSec: 3, manaPct: 0.5 } },
      },
      breaker: {
        name: 'Разрушитель', fromLevel: 3,
        text: 'Броски камней бьют сильнее: урон бросками +30% (вместе со ступенью — +65%).',
        tradeoff: 'Каждый бросок стоит на 4 маны больше.',
        add: { throwDamageBonus: 0.3, manaCost: 4 },
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
      // v0.16.0: ступень III — «лужа смолы»: удар оставляет на земле горящую лужу, она жжёт врага отдельно от горения.
      // Повторный Огонь обновляет и горение, и лужу (не складывает). Ветки накладываются поверх этих чисел.
      3: {
        label: 'Огонь III',
        damage: 22, manaCost: 26, cooldownSec: 8, castSec: 0.3,
        burn: { dps: 5, durationSec: 6 },
        puddle: { dps: 3, durationSec: 5 },
        interruptsNormalCast: false,
      },
    },
    // Ветки ступени III (выбирается одна, смена — за монеты вне боя).
    branches: {
      arsonist: {
        name: 'Поджигатель', fromLevel: 3,
        text: 'Огонь держится: горение 5 урона в секунду восемь секунд, лужа смолы горит шесть.',
        tradeoff: 'Прямой удар слабее на 20%.',
        mul: { damage: 0.8 },
        set: { burn: { dps: 5, durationSec: 8 }, puddle: { dps: 3, durationSec: 6 } },
      },
      blaster: {
        name: 'Взрывник', fromLevel: 3,
        text: 'Огонь взрывается: прямой удар сильнее на 80%.',
        tradeoff: 'Лужи нет, перезарядка на 1 с дольше, на 4 маны дороже.',
        mul: { damage: 1.8 },
        add: { cooldownSec: 1, manaCost: 4 },
        set: { puddle: null },
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
      // v0.16.0: Астрал III — «вспышка»: удар на миг ослепляет врага, и его броня и защитная кора перестают гасить урон
      // всех остальных даров и автоатаки (flash.sec секунд). Ветки накладываются поверх этих чисел.
      3: {
        label: 'Астрал III',
        damage: 35, manaCost: 24, cooldownSec: 10, castSec: 0.3,
        ignoresDefense: true,
        interruptsStrongCast: false,
        flash: { sec: 2 },
      },
    },
    branches: {
      seer: {
        name: 'Видящий', fromLevel: 3,
        text: 'Вспышка длится 4 с и открывает слабое место: враг получает на 15% больше урона от всего.',
        tradeoff: 'Сам удар слабее на 15%.',
        mul: { damage: 0.85 },
        set: { flash: { sec: 4, vulnerability: 0.15 } },
      },
      piercer: {
        name: 'Пробивающий', fromLevel: 3,
        text: 'Удар Астрала сильнее на 40%.',
        tradeoff: 'Вспышка короче (1 с), перезарядка на 2 с дольше.',
        mul: { damage: 1.4 },
        add: { cooldownSec: 2 },
        set: { flash: { sec: 1 } },
      },
    },
  },
  // v0.18.0 — Лёд, четвёртый дар (глава II, docs/design/chapter-2-story-v0.1.md §19–22, §33). Внутренний id — 'ice'.
  // В бою: замедление врага (его атаки и подготовка сильного удара идут медленнее — больше времени на прерывание);
  // со ступени II — «Хрупкость»: следующий удар Телекинеза, Огня или Астрала сильнее, а тяжёлый бросок по хрупкой цели
  // ещё и разбивает броню. Ступени I–III открывает сюжет (обучение у Нэрис), без долгих таймеров.
  ice: {
    name: 'Лёд',
    color: 'ice',
    levels: {
      1: {
        label: 'Лёд I',
        damage: 14, manaCost: 18, cooldownSec: 7, castSec: 0.3,
        slow: { pct: 0.35, sec: 4 },
        interruptsNormalCast: false,
      },
      2: {
        label: 'Лёд II',
        damage: 16, manaCost: 20, cooldownSec: 7, castSec: 0.3,
        slow: { pct: 0.35, sec: 4 },
        brittle: { sec: 5, bonus: 0.4 },
        interruptsNormalCast: false,
      },
      3: {
        label: 'Лёд III',
        damage: 18, manaCost: 22, cooldownSec: 7, castSec: 0.3,
        slow: { pct: 0.4, sec: 5 },
        brittle: { sec: 5, bonus: 0.4 },
        interruptsNormalCast: false,
      },
    },
    branches: {
      frost: {
        name: 'Мороз', fromLevel: 3,
        text: 'Контроль: замедление сильнее и дольше — враг на 55% медленнее шесть секунд.',
        tradeoff: 'Сам удар слабее на 15%.',
        mul: { damage: 0.85 },
        set: { slow: { pct: 0.55, sec: 6 } },
      },
      shard: {
        name: 'Осколок', fromLevel: 3,
        text: 'Урон через Хрупкость: удар Льда по хрупкой цели раскалывает её — урон ×2,2, а Хрупкость от других даров сильнее (+70%).',
        tradeoff: 'Замедление слабое: 20% на три секунды.',
        set: { slow: { pct: 0.2, sec: 3 }, brittle: { sec: 5, bonus: 0.7 }, shatter: { mult: 2.2 } },
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
  ice: 14,                                     // v0.18.0: заморозить воду, механизм, нестабильный предмет
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
  exploration: { telekinesis: 6, fire: 6, seal: 6, ice: 6 },
  combat: { telekinesis: 5, fire: 5, seal: 5, ice: 5 },
};
