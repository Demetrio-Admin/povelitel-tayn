// Противники и боевые объекты поля. Источник: Combat Math v0.1 §6–§9.
// Все тайминги — в секундах.
//
// interruptBy — чем можно прервать сильную атаку:
//   'telekinesis'        — любое применение Телекинеза
//   'telekinesis_heavy'  — только бросок тяжёлого объекта поля
//   (v0.10.1: Астрал, внутренний id 'seal', атаки не прерывает — только урон сквозь броню и кору)

export const ENEMIES = {
  forest_scavenger: {
    name: 'Лесной Падальщик',
    texture: 'enemy_scavenger',
    tier: 'normal',
    // v0.10.0: первая встреча мягче (обучение до Огня) — 160 HP вместо 190, обычный удар 8 вместо 10, первый рывок через 6 с вместо 5
    hp: 160,
    normalAttack: { damage: 8, intervalSec: 3 },
    strongAttack: {
      name: 'Рывок', damage: 24, prepSec: 2, cooldownSec: 9, firstDelaySec: 6,
      interruptBy: ['telekinesis'],
      hint: 'Прервите Телекинезом!',
    },
    staggerSec: 1.0,
    interruptedCooldownSec: 6,
    defense: 0,
    rewards: { heroXP: 70, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 1 }, coins: 15 },
    arena: 'glade',
  },

  // [ПРОТОТИП] «Маленький враг» у огонька C (Blueprint, зона E). В Combat Math не описан —
  // ослабленная версия Падальщика, бой ~12–18 сек.
  young_scavenger: {
    name: 'Молодой Падальщик',
    texture: 'enemy_scavenger_small',
    tier: 'normal',
    hp: 110,
    normalAttack: { damage: 8, intervalSec: 3 },
    strongAttack: {
      name: 'Рывок', damage: 18, prepSec: 2, cooldownSec: 10, firstDelaySec: 4,
      interruptBy: ['telekinesis'],
      hint: 'Прервите Телекинезом!',
    },
    staggerSec: 1.0,
    interruptedCooldownSec: 6,
    defense: 0,
    rewards: { heroXP: 40, schoolXP: { telekinesis: 30 }, items: { lunar_shard: 1 }, coins: 10 },
    arena: 'glade_small',
  },

  // v0.20.0 — глава II (chapter-2-balance-v0.1.md §9). Инеевый зверёк: быстрые удары с холодом (замедляют героя),
  // ледяной рывок прерывается Телекинезом, слабость к Огню. Бой ~20–25 с у героя 8–9 уровня.
  frost_critter: {
    name: 'Инеевый зверёк',
    texture: 'enemy_frost_critter',
    tier: 'normal',
    hp: 440,
    normalAttack: { damage: 11, intervalSec: 2.5, chill: { pct: 0.3, sec: 2.5 } },
    strongAttack: {
      name: 'Ледяной рывок', damage: 26, prepSec: 1.8, cooldownSec: 9, firstDelaySec: 5,
      interruptBy: ['telekinesis'],
      hint: 'Прервите Телекинезом!',
    },
    staggerSec: 1.0,
    interruptedCooldownSec: 6,
    defense: 0,
    weaknesses: { fire: 0.3 },
    rewards: { heroXP: 80, schoolXP: { fire: 20, telekinesis: 20 }, items: { frost_herb: 1 }, coins: 20 },
    repeatRewards: { heroXP: 14, schoolXP: { fire: 3 }, coins: 5 },
    arena: 'city',
  },

  // v0.21.0 — Морозный сборщик (квест 6 «Пропавший груз», chapter-2-balance §9): магический конструкт. Защитная корка
  // гасит 35% урона — Астрал её пробивает, Огонь растапливает на 5 с. Дальний ледяной залп замедляет перезарядки;
  // «Ледяной таран» прерывается Телекинезом. Бой ≈30–40 с у героя 9–10 уровня.
  frost_collector: {
    name: 'Морозный сборщик',
    texture: 'enemy_frost_collector',
    tier: 'normal',
    hp: 520,
    normalAttack: { damage: 11, intervalSec: 2.8, chill: { pct: 0.3, sec: 2.5 } },
    strongAttack: {
      name: 'Ледяной таран', damage: 28, prepSec: 2.0, cooldownSec: 10, firstDelaySec: 6,
      interruptBy: ['telekinesis'],
      hint: 'Прервите Телекинезом!',
    },
    staggerSec: 1.0,
    interruptedCooldownSec: 6,
    defense: 0.35,
    onFireHit: { disableDefenseSec: 5 },
    rewards: { heroXP: 70, schoolXP: { seal: 20, telekinesis: 15 }, items: { frost_herb: 1 }, coins: 25 },
    repeatRewards: { heroXP: 28, schoolXP: { seal: 3 }, coins: 9 },
    arena: 'city',
  },

  // Усиленный сборщик — босс склада (квест 6). Корка толще, таран тяжелее; без Астрала и Огня бой заметно дольше.
  frost_collector_elite: {
    name: 'Усиленный сборщик',
    texture: 'enemy_frost_collector_elite',
    tier: 'strong',
    hp: 760,
    normalAttack: { damage: 12, intervalSec: 3.0, chill: { pct: 0.35, sec: 3 } },
    strongAttack: {
      name: 'Ледяной таран', damage: 32, prepSec: 2.2, cooldownSec: 10, firstDelaySec: 6,
      interruptBy: ['telekinesis'],
      hint: 'Прервите Телекинезом!',
    },
    staggerSec: 1.1,
    interruptedCooldownSec: 7,
    defense: 0.4,
    onFireHit: { disableDefenseSec: 5 },
    rewards: { heroXP: 70, schoolXP: { seal: 30, telekinesis: 20, fire: 20 }, items: { ice_crystal: 1, rune_dust: 1 }, coins: 35 },
    arena: 'city',
  },

  // v0.21.0 — Ледяной страж (квест 10 «Выбор»): первый серьёзный билд-чек главы II (55–75 с). Кристальная броня −45%
  // (Телекинез разбивает кристалл, Астрал пробивает), Огонь бьёт на 25% сильнее; тяжёлый удар — только тяжёлым камнем,
  // а Лёд замедляет его подготовку. Обычный удар холодит. Без Телекинеза бой проходим — просто дольше и с зельями.
  ice_guardian: {
    name: 'Ледяной страж',
    texture: 'enemy_ice_guardian',
    tier: 'strong',
    hp: 780,
    normalAttack: { damage: 12, intervalSec: 3.8, chill: { pct: 0.35, sec: 3 } },
    strongAttack: {
      name: 'Ледяной молот', damage: 32, prepSec: 2.6, cooldownSec: 11, firstDelaySec: 7,
      interruptBy: ['telekinesis_heavy'],
      hint: 'Бросьте тяжёлый камень!',
    },
    staggerSec: 1.2,
    interruptedCooldownSec: 7,
    defense: 0,
    armor: { value: 0.45, source: 'crystal', disabledSec: 8 },
    weaknesses: { fire: 0.25 },
    rewards: { heroXP: 140, schoolXP: { telekinesis: 40, fire: 40, seal: 40, ice: 40 }, items: { ice_crystal: 2, frost_shard: 1 }, coins: 60 },
    repeatRewards: { heroXP: 55, schoolXP: { ice: 5 }, items: { ice_crystal: 1 }, coins: 16 },
    arena: 'frost',
  },

  // Враг со слабостью из Combat Math §7. v0.10.0: пять Корневиков в старом лесу (world.layout.js, rootling_01…05).
  // Защита 20%, Огонь +50% и снимает защиту на 6 с. Первая победа на месте — rewards; повторная (возобновляемые места) — repeatRewards.
  rootling: {
    name: 'Корневик',
    texture: 'enemy_rootling',
    tier: 'normal',
    hp: 230,
    normalAttack: { damage: 10, intervalSec: 3 },
    strongAttack: null,
    staggerSec: 0.8,
    defense: 0.2,
    weaknesses: { fire: 0.5 },
    onFireHit: { disableDefenseSec: 6 },
    rewards: { heroXP: 60, schoolXP: { fire: 30 }, items: { tree_resin: 1, crimson_ember: 1 }, coins: 15 },
    repeatRewards: { heroXP: 20, schoolXP: { fire: 3 }, items: { tree_resin: 1, crimson_ember: 1 }, coins: 6 },
    arena: 'glade',
  },

  // Первый сильный противник прототипа (Blueprint, зона K «Поляна Лесного Стража»).
  // Числа — из «Сильный противник — Каменный Страж» (Combat Math §8): 420 HP, броня −45%,
  // кристалл разбивается Телекинезом → броня отключена 8 сек.
  // [АДАПТАЦИЯ] Полный босс Лесной Страж (1050 HP, фаза 3 требует Печать) в прототип не входит.
  // От него взято только правило: тяжёлый удар прерывается Телекинезом только через тяжёлый объект.
  // Чтобы включить «Огонь снимает кору» (фаза 2 босса), добавьте:
  //   onFireHit: { vulnerability: { bonus: 0.3, durationSec: 8 } }
  forest_guardian: {
    name: 'Лесной Страж',
    texture: 'enemy_guardian',
    tier: 'strong',
    hp: 420,
    normalAttack: { damage: 14, intervalSec: 4.5 }, // [АДАПТАЦИЯ] интервал в Combat Math не задан; 3 с делали бой непроходимым при HP героя 138
    strongAttack: {
      name: 'Тяжёлый удар', damage: 32, prepSec: 2.5, cooldownSec: 10, firstDelaySec: 6,
      interruptBy: ['telekinesis_heavy'],
      hint: 'Бросьте тяжёлый камень!',
    },
    staggerSec: 1.2,
    interruptedCooldownSec: 7,
    defense: 0,
    armor: { value: 0.45, source: 'crystal', disabledSec: 8 },
    rewards: { heroXP: 150, schoolXP: { telekinesis: 60, fire: 60 }, items: { rare_core: 1, lunar_shard: 3, amulet_forest: 1 }, coins: 60 },
    arena: 'guardian',
  },

  // v0.10.0 — финальное испытание первой главы за Древними воротами. 900 HP (не старый босс на 1050), три фазы.
  // Параметры фаз — здесь, логика — objects/Enemy.js (phaseFor/applyPhase/checkPhase). Фаза i действует, пока HP > above.
  // Общие: обычная атака 12 / 4,5 с; сильная подготовка 2,5 с, КД 10 с, первая через 6 с; после прерывания — 7 с.
  node_guardian: {
    name: 'Хранитель сердца',
    texture: 'enemy_guardian',
    tint: 0xbfe9dc,
    tier: 'strong',
    hp: 900,
    normalAttack: { damage: 12, intervalSec: 4.5 },
    strongAttack: {
      name: 'Удар Хранителя', damage: 30, prepSec: 2.5, cooldownSec: 10, firstDelaySec: 6,
      interruptBy: ['telekinesis_heavy'],
      hint: 'Бросьте тяжёлый камень!',
    },
    staggerSec: 1.2,
    interruptedCooldownSec: 7,
    defense: 0,
    phases: [
      { above: 600, set: { armor: { value: 0.45, source: 'crystal', disabledSec: 8 }, defense: 0, weaknesses: null, onFireHit: null },
        message: 'Кристальная броня! Разбейте кристалл Телекинезом.' },
      { above: 300, set: { armor: null, defense: 0.2, weaknesses: { fire: 0.5 }, onFireHit: { disableDefenseSec: 6 } },
        message: 'Броня осыпалась, но кора крепка. Огонь выжжет её, а Астрал пробьёт насквозь!', tint: 0xe0b48a },
      // v0.10.1: «тень вместо плоти» — обычные удары вязнут (защита 40%), Астрал игнорирует её и бьёт на 50% сильнее
      { above: 0, set: { armor: null, defense: 0.4, weaknesses: { seal: 0.5 }, onFireHit: null },
        strongAttack: { damage: 36, interruptBy: ['telekinesis'], hint: 'Прервите Телекинезом!' },
        message: 'Тень вместо плоти! Обычные удары вязнут — пробивает только Астрал. Сильный удар прерывает Телекинез.', tint: 0xd2a8ff },
    ],
    rewards: { heroXP: 220, schoolXP: { telekinesis: 30, fire: 30, seal: 40 }, coins: 80 },
    arena: 'node',
  },
};

// Объекты боевого поля.
export const FIELD_OBJECTS = {
  light_rock:  { name: 'Камень',            texture: 'field_rock_light', weight: 'light', throwable: true, respawnSec: 7 },
  heavy_rock:  { name: 'Тяжёлый камень',    texture: 'field_rock_heavy', weight: 'heavy', throwable: true, respawnSec: 9 },
  crystal:     { name: 'Защитный кристалл',  texture: 'field_crystal',    weight: 'medium', throwable: false, breaksArmor: true, respawnAfterArmorSec: 10 },
};

// Расстановка объектов поля по аренам (координаты в viewport 720×1280).
export const ARENAS = {
  // v0.20.0: городская мостовая — обломки ящиков вместо камней
  city: {
    ground: 0x2a2c33,
    objects: [
      { id: 'rock_a', type: 'light_rock', x: 190, y: 720 },
      { id: 'heavy_a', type: 'heavy_rock', x: 540, y: 710 },
    ],
  },
  // v0.21.0: Замёрзший квартал — кристалл стража и тяжёлый камень
  frost: {
    ground: 0x26313a,
    objects: [
      { id: 'crystal_a', type: 'crystal', x: 590, y: 640 },
      { id: 'heavy_a', type: 'heavy_rock', x: 150, y: 760 },
      { id: 'rock_a', type: 'light_rock', x: 420, y: 800 },
    ],
  },
  glade: {
    ground: 0x2c3a24,
    objects: [
      { id: 'rock_a', type: 'light_rock', x: 180, y: 720 },
      { id: 'heavy_a', type: 'heavy_rock', x: 540, y: 700 },
    ],
  },
  glade_small: {
    ground: 0x26352a,
    objects: [
      { id: 'rock_a', type: 'light_rock', x: 220, y: 720 },
    ],
  },
  node: {
    ground: 0x1d2724,
    objects: [
      { id: 'crystal_a', type: 'crystal', x: 590, y: 640 },
      { id: 'heavy_a', type: 'heavy_rock', x: 150, y: 760 },
      { id: 'rock_a', type: 'light_rock', x: 420, y: 800 },
    ],
  },
  guardian: {
    ground: 0x22261f,
    objects: [
      { id: 'crystal_a', type: 'crystal', x: 590, y: 640 },
      { id: 'heavy_a', type: 'heavy_rock', x: 150, y: 760 },
      { id: 'rock_a', type: 'light_rock', x: 420, y: 800 },
    ],
  },
};

export const COMBAT = {
  introSec: 1.0,
  autoTarget: 'enemy',
  logDurations: true,
};
