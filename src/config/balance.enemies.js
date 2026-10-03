// Противники и боевые объекты поля. Источник: Combat Math v0.1 §6–§9.
// Все тайминги — в секундах.
//
// interruptBy — чем можно прервать сильную атаку:
//   'telekinesis'        — любое применение Телекинеза
//   'telekinesis_heavy'  — только бросок тяжёлого объекта поля
//   'seal'               — Печать

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
      interruptBy: ['telekinesis', 'seal'],
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
      interruptBy: ['telekinesis', 'seal'],
      hint: 'Прервите Телекинезом!',
    },
    staggerSec: 1.0,
    interruptedCooldownSec: 6,
    defense: 0,
    rewards: { heroXP: 40, schoolXP: { telekinesis: 30 }, items: { lunar_shard: 1 }, coins: 10 },
    arena: 'glade_small',
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
    rewards: { heroXP: 60, schoolXP: { fire: 30 }, items: { tree_resin: 1 }, coins: 15 },
    repeatRewards: { heroXP: 20, schoolXP: { fire: 3 }, items: { tree_resin: 1 }, coins: 6 },
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
      interruptBy: ['telekinesis_heavy', 'seal'],
      hint: 'Бросьте тяжёлый камень!',
    },
    staggerSec: 1.2,
    interruptedCooldownSec: 7,
    defense: 0,
    armor: { value: 0.45, source: 'crystal', disabledSec: 8 },
    rewards: { heroXP: 150, schoolXP: { telekinesis: 60, fire: 60 }, items: { rare_core: 1, lunar_shard: 3 }, coins: 60 },
    arena: 'guardian',
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
