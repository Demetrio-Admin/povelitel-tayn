// Структура первой локации. Источник: First Location Production Blueprint v0.1 §1–§6.
// Одна карта, разбитая на зоны. Мир собирается из отдельных объектов (конструктор).
// Координаты в пикселях мира. Для прямоугольников x/y — левый верхний угол.
// Для объектов x/y — точка основания (нижний центр), как pivot героя.
//
// Маршрут (снизу вверх, «вперед» = вверх экрана):
//   A Дом → B Поляна → C Тропа → D Боевая поляна → E/F Лунный алтарь → G Тяжёлая глыба
//   → H Круг Огня → (возврат) I Корни у поляны → J Новая часть леса → K Страж → L Ворота

import { CONTENT_INTERACTIVES, CONTENT_ENEMIES, CACHE_RESOURCE_REWARDS } from './world.content.js';
import { CITY_ZONES, CITY_GROUND, CITY_COLLIDERS, CITY_KEEP_CLEAR, CITY_INTERACTIVES, CITY_ENEMIES } from './world.city.js';
export { CLEARINGS } from './world.content.js';

export const WORLD = {
  width: 3600,   // v0.20.0: восточнее леса — дорога и город (world.city.js)
  height: 5400,
  playerStart: { x: 900, y: 5200 },
  defaultSafePoint: { x: 900, y: 4820 },
};

export const ZONES = [
  { id: 'A', name: 'Дом ведьмы',           x: 640, y: 4880, w: 520,  h: 420,  safePoint: { x: 900, y: 5150 }, interior: true },
  { id: 'B', name: 'Стартовая поляна',     x: 0,   y: 4100, w: 1800, h: 780,  safePoint: { x: 900, y: 4820 } },
  { id: 'C', name: 'Лесная тропа',         x: 820, y: 3300, w: 880,  h: 800,  safePoint: { x: 1250, y: 3850 } },
  { id: 'D', name: 'Первая боевая поляна', x: 820, y: 2700, w: 880,  h: 600,  safePoint: { x: 1250, y: 3850 } },
  { id: 'E', name: 'Лунный алтарь',       x: 820, y: 1880, w: 880,  h: 820,  safePoint: { x: 1250, y: 2330 } },
  { id: 'H', name: 'Древний круг Огня',    x: 820, y: 1100, w: 880,  h: 780,  safePoint: { x: 1250, y: 1760 } },
  { id: 'J', name: 'Новая часть леса',     x: 100, y: 1640, w: 600,  h: 2460, safePoint: { x: 400, y: 3900 } },
  { id: 'K', name: 'Поляна Лесного Стража', x: 100, y: 1100, w: 600, h: 540, safePoint: { x: 400, y: 1760 } },
  { id: 'L', name: 'Древние ворота',        x: 0,   y: 0,    w: 1800, h: 1100, safePoint: { x: 900, y: 820 } },
  ...CITY_ZONES,   // v0.20.0: глава II
];

// Поверхности (Layer 1 — Ground). Базовая трава кладётся на весь мир автоматически.
// Дороги и вода — кривые формы, они описаны в world.terrain.js. Здесь остался только пол дома.
export const GROUND = [
  { tex: 'wooden_floor_01', x: 640,  y: 4880, w: 520, h: 420 },
  ...CITY_GROUND,
];

// Места, где генератор не ставит случайный декор: проёмы между блоками, проходы к воротам.
export const KEEP_CLEAR = [
  { x: 300,  y: 3990, w: 200, h: 200 },  // проём корней
  { x: 1120, y: 1860, w: 260, h: 200 },  // проход под глыбу
  { x: 250,  y: 1260, w: 300, h: 240 },  // проход Стража
  { x: 820,  y: 330,  w: 160, h: 220 },  // ворота
  { x: 700,  y: 125,  w: 960, h: 210 },  // v0.10.0: поляна узла за воротами (то же, что CLEARINGS в world.content.js)
  ...CITY_KEEP_CLEAR,
];

// Коллизии (Blueprint §6): крупные деревья, здания, вода, камни, стены руин.
// kind определяет визуальное заполнение: trees → лес (деревья в world.props.js), wall → стена дома,
// ruin → старый камень, furniture → мебель. Вода — отдельно, world.terrain.js.
export const COLLIDERS = [
  // границы мира (лес)
  { kind: 'trees', x: 0,    y: 0,    w: 100, h: 4880 },
  { kind: 'trees', x: 1700, y: 0,    w: 100, h: 3550 },
  { kind: 'trees', x: 1700, y: 3700, w: 100, h: 1180 },
  { kind: 'trees', x: 1760, y: 3550, w: 40,  h: 150 },
  { kind: 'trees', x: 100,  y: 0,    w: 1600, h: 110 },
  // A — дом ведьмы
  { kind: 'wall', x: 640,  y: 4880, w: 220, h: 30 },
  { kind: 'wall', x: 940,  y: 4880, w: 220, h: 30 },
  { kind: 'wall', x: 640,  y: 4880, w: 30,  h: 420 },
  { kind: 'wall', x: 1130, y: 4880, w: 30,  h: 420 },
  { kind: 'wall', x: 640,  y: 5270, w: 520, h: 30 },
  // v0.8: tex — картинка мебели (вместо прямоугольника с подписью); размер на экране — DISPLAY_SIZE
  { kind: 'furniture', x: 690,  y: 5150, w: 90,  h: 100, label: 'кровать', tex: 'bed_01' },
  { kind: 'furniture', x: 1010, y: 4960, w: 100, h: 60,  label: 'стол', tex: 'table_01' },
  { kind: 'furniture', x: 690,  y: 4910, w: 150, h: 34,  label: 'полки', tex: 'bookshelf_01' },
  { kind: 'furniture', x: 960,  y: 4910, w: 140, h: 34,  label: 'полки', tex: 'bookshelf_01' },
  { kind: 'trees', x: 100,  y: 4880, w: 540, h: 520 },
  { kind: 'trees', x: 1160, y: 4880, w: 640, h: 520 },
  // B — стартовая поляна: вход в западный лес закрыт корнями (проем 300–500)
  { kind: 'trees', x: 100,  y: 4030, w: 200, h: 110 },
  { kind: 'trees', x: 500,  y: 4030, w: 200, h: 110 },
  // C — лесная тропа
  { kind: 'trees', x: 820,  y: 3300, w: 130, h: 800 },
  { kind: 'trees', x: 1550, y: 3300, w: 150, h: 250 },
  { kind: 'trees', x: 1550, y: 3700, w: 150, h: 400 },
  // D — первая боевая поляна (коридор мимо врага)
  { kind: 'trees', x: 820,  y: 2900, w: 280, h: 220 },
  { kind: 'trees', x: 1400, y: 2900, w: 300, h: 220 },
  // E — лунный алтарь
  { kind: 'ruin',  x: 1180, y: 2170, w: 140, h: 50, label: 'алтарь' },
  { kind: 'trees', x: 1560, y: 2360, w: 80,  h: 50, single: true },
  // G — тяжёлый проход (проем 1150–1350 закрыт глыбой)
  { kind: 'ruin',  x: 820,  y: 1900, w: 330, h: 120 },
  { kind: 'ruin',  x: 1350, y: 1900, w: 350, h: 120 },
  // H — круг Огня (тупик)
  { kind: 'trees', x: 820,  y: 1250, w: 880, h: 50 },
  // J — новая часть леса (извилистая тропа)
  { kind: 'trees', x: 100,  y: 3600, w: 230, h: 120 },
  { kind: 'trees', x: 470,  y: 3200, w: 230, h: 120 },
  { kind: 'trees', x: 100,  y: 2700, w: 240, h: 120 },
  { kind: 'trees', x: 460,  y: 2250, w: 240, h: 120 },
  // K — поляна Стража (проем 280–520 закрыт Стражем)
  { kind: 'ruin',  x: 100,  y: 1300, w: 180, h: 160 },
  { kind: 'ruin',  x: 520,  y: 1300, w: 180, h: 160 },
  // L — древние ворота
  { kind: 'ruin',  x: 640,  y: 330,  w: 120, h: 110 },
  { kind: 'ruin',  x: 1040, y: 330,  w: 120, h: 110 },
  // v0.10.0: древняя стена по обе стороны ворот — за ворота можно попасть только через них (Печать открывает проход).
  // Новые стены — в конце списка: базовые c0… сохраняют свои номера для правок редактора.
  { kind: 'ruin',  x: 100,  y: 330,  w: 540, h: 110 },
  { kind: 'ruin',  x: 1160, y: 330,  w: 540, h: 110 },
  // v0.20.0: дорога и город (только в конец — id коллайдеров c<номер>)
  ...CITY_COLLIDERS,
];

// ИСТОЧНИК для генератора карты (tools/world/bake.mjs). Игра читает готовый список из world.props.js,
// а правки расстановки делаются в редакторе (?edit) и лежат в world.edits.js.
// layer: back | main | front. light: радиус тёплого свечения.
export const DECOR = [
  { key: 'candle_group_01', x: 1080, y: 4990, layer: 'main', light: 120 },
  { key: 'candle_group_01', x: 720,  y: 4945, layer: 'main', light: 100 },
  { key: 'lantern_01', x: 830,  y: 4850, layer: 'main', light: 170 },
  { key: 'lantern_01', x: 1000, y: 4250, layer: 'main', light: 170 },
  { key: 'signpost_01', x: 1100, y: 4200, layer: 'main' },
  { key: 'wooden_bridge_01', x: 1435, y: 3770, layer: 'back' },
  { key: 'lantern_02', x: 1150, y: 3650, layer: 'main', light: 160 },
  { key: 'lantern_02', x: 1116, y: 3350, layer: 'main', light: 160 },
  { key: 'mushroom_red_01', x: 1500, y: 3480, layer: 'main' },
  { key: 'mushroom_blue_01', x: 1000, y: 3950, layer: 'main' },
  { key: 'lantern_01', x: 1120, y: 2270, layer: 'main', light: 180 },
  { key: 'candle_group_01', x: 1360, y: 2240, layer: 'main', light: 120 },
  { key: 'reeds_01', x: 760, y: 2600, layer: 'front' },
  { key: 'reeds_01', x: 760, y: 3500, layer: 'front' },
  { key: 'reeds_01', x: 760, y: 1800, layer: 'front' },
  { key: 'mushroom_red_01', x: 250, y: 3100, layer: 'main' },
  { key: 'claw_marks_01', x: 380, y: 2000, layer: 'back' },
  { key: 'claw_marks_01', x: 440, y: 1780, layer: 'back' },
  { key: 'dead_tree_01', x: 600, y: 1900, layer: 'main' },
  { key: 'lantern_02', x: 260, y: 3820, layer: 'main', light: 150 },
  { key: 'candle_group_01', x: 720, y: 470, layer: 'main', light: 140 },
  { key: 'candle_group_01', x: 1080, y: 470, layer: 'main', light: 140 },
  { key: 'lantern_01', x: 800, y: 900, layer: 'main', light: 170 },
];

// Интерактивные объекты (Layer 4). Все — отдельные GameObjects (Blueprint §4).
// kind: book | telekinesis | fire | seal | altar | fire_circle | chest | pickup
const BASE_INTERACTIVES = [
  // A
  { id: 'magic_book', kind: 'book', x: 900, y: 5050, texture: 'magic_book_01', collide: { w: 44, h: 22 } },
  // B
  { id: 'glade_rock', kind: 'telekinesis', mode: 'push', x: 1150, y: 4520, texture: 'rock_medium_01',
    weight: 'medium', target: { x: 1300, y: 4590 }, collide: { w: 96, h: 40 },
    hiddenReward: { spawnPickup: { item: 'coins', amount: 20, texture: 'icon_coin' } }, countsAsFirstInteraction: true },
  { id: 'moon_plant', kind: 'telekinesis', mode: 'pull', x: 520, y: 4520, texture: 'moon_plant_01', collide: { w: 30, h: 14 },
    weight: 'light', reward: { items: { moon_herb: 1 } }, countsAsFirstInteraction: true },
  { id: 'glade_cache', kind: 'chest', x: 1580, y: 4300, texture: 'chest_01', reward: { items: { coins: 15 } }, collide: { w: 50, h: 24 } },
  { id: 'corrupted_roots', kind: 'fire', x: 400, y: 4120, texture: 'corrupted_roots_01',
    collide: { w: 200, h: 70 }, burnSec: 1.4, opensPath: 'west_forest',
    lockedEvent: 'fire_required_01', destroyEvent: 'fire_gate_open', panOnOpen: { x: 400, y: 3800 },
    lockedText: 'Чёрные корни не поддаются. Нужен Огонь.' },
  // C
  { id: 'trail_cache', kind: 'chest', x: 1660, y: 3640, texture: 'chest_01', reward: { items: { coins: 20 } }, collide: { w: 50, h: 24 } },
  // E / F
  { id: 'lunar_altar', kind: 'altar', x: 1250, y: 2215, texture: 'lunar_altar_01', radius: 130 },
  { id: 'flame_a', kind: 'telekinesis', mode: 'pull', x: 1600, y: 2280, texture: 'lunar_flame_01', elevated: 70,
    weight: 'light', reward: { items: { lunar_flame: 1 } }, requiresEvent: 'lunar_quest_start', radius: 160,
    hint: 'Огонёк на высокой ветке' },
  { id: 'altar_stone', kind: 'telekinesis', mode: 'push', x: 960, y: 2480, texture: 'rock_medium_01',
    weight: 'medium', target: { x: 1060, y: 2580 }, collide: { w: 96, h: 40 },
    hiddenReward: { spawnPickup: { item: 'lunar_flame', amount: 1, texture: 'lunar_flame_01' } } },
  { id: 'flame_c', kind: 'pickup', x: 1610, y: 2660, item: 'lunar_flame', amount: 1, texture: 'lunar_flame_01',
    requiresEvent: 'lunar_quest_start', requiresEnemyDefeated: 'lunar_guard' },
  // G
  { id: 'heavy_boulder', kind: 'telekinesis', mode: 'push', x: 1250, y: 1990, texture: 'heavy_boulder_01',
    weight: 'heavy', target: { x: 1500, y: 2140 }, collide: { w: 200, h: 110 }, radius: 150,
    opensPath: 'fire_circle_path', doneEvent: 'heavy_path_open', lockedEvent: 'heavy_blocked_01',
    panOnOpen: { x: 1250, y: 1600 } },
  // H
  { id: 'fire_circle', kind: 'fire_circle', x: 1250, y: 1580, texture: 'fire_circle_01', radius: 140 },
  { id: 'ritual_torch', kind: 'fire', x: 1470, y: 1520, texture: 'torch_01', persistent: true, collide: { w: 24, h: 16 } },
  { id: 'dry_bush', kind: 'fire', x: 1030, y: 1720, texture: 'dry_bush_01', burnSec: 1.0, collide: { w: 56, h: 24 },
    reveal: { spawnPickup: { item: 'crimson_ember', amount: 1, texture: 'icon_ember' } } },
  // J
  { id: 'moonstone', kind: 'pickup', x: 220, y: 3450, item: 'moonstone', amount: 1, texture: 'icon_shard' },
  { id: 'west_chest', kind: 'chest', x: 600, y: 2960, texture: 'chest_01', reward: { items: { coins: 40, lunar_shard: 2 }, heroXP: 15 }, collide: { w: 50, h: 24 } },
  // L
  // v0.10.0: ворота — настоящая преграда; состав проявляет знаки, Печать (20 маны) открывает проход к узлу
  { id: 'ancient_gate', kind: 'gate', x: 900, y: 440, texture: 'ancient_gate_01', collide: { w: 280, h: 60 }, radius: 190,
    requiresEvent: 'guardian_defeated', openEvent: 'ancient_gate_open', opensPath: 'node_glade', panOnOpen: { x: 1200, y: 260 } },
];

// v0.8: к существующим сундукам добавлены ресурсы (тайники), остальное наполнение — в world.content.js
for (const o of BASE_INTERACTIVES) {
  const extra = CACHE_RESOURCE_REWARDS[o.id];
  if (extra) o.reward = { ...o.reward, items: { ...(o.reward.items || {}), ...extra } };
}
export const INTERACTIVES = [...BASE_INTERACTIVES, ...CONTENT_INTERACTIVES, ...CITY_INTERACTIVES];

// Враги-триггеры на карте. Бой начинается при входе в радиус.
const BASE_ENEMY_SPAWNS = [
  { id: 'scavenger_01', enemy: 'forest_scavenger', x: 1250, y: 3010, radius: 180, startEvent: 'combat_intro_01' },
  { id: 'lunar_guard', enemy: 'young_scavenger', x: 1500, y: 2610, radius: 120, startEvent: 'lunar_guard_01',
    requiresEvent: 'lunar_quest_start' },
  { id: 'forest_guardian_01', enemy: 'forest_guardian', x: 400, y: 1400, radius: 230, collide: { w: 240, h: 80 },
    startEvent: 'forest_guardian_01', defeatEvent: 'guardian_defeated', opensPath: 'gate_path', scale: 1.5 },
];
export const ENEMY_SPAWNS = [...BASE_ENEMY_SPAWNS, ...CONTENT_ENEMIES, ...CITY_ENEMIES];
