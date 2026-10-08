// v0.8 Content & Interaction Pass — наполнение мира: ресурсы, NPC, интерьер дома, угроза для охотника.
// Объекты подключаются в world.layout.js (в конец INTERACTIVES / ENEMY_SPAWNS), поэтому для редактора карты (?edit),
// проверки проходимости и тестов они такие же, как и остальные. Положение можно двигать в редакторе (правка pos по id).
//
// Виды (kind) новых интерактивных объектов:
//   gather  — ресурс, который можно собрать; res — id предмета, amount, respawnSec — через сколько вырастет заново
//   npc     — персонаж (npc — id из npcs.js, реплики в dialogues.js)
//   alchemy — котёл (окно рецептов из recipes.js)
//   inspect — осмотр: lines — реплики героини по кругу, first — награда при первом осмотре
// Остальные виды (telekinesis, fire, chest, pickup) — существующие.
import { fm } from '../state/hero.js';
import { CITY_DECOR } from './world.city.js';
import { EXP_DECOR } from './world.expeditions.js';   // v0.9.2: реплики героя с вариантами для ведьмы / колдуна (разрешает heroSay)

export const CONTENT_INTERACTIVES = [
  // Rare one-time discoveries. Sapphire rewards never go through gather or repeat enemies.
  { id: 'sapphire_trail_cache', kind: 'chest', x: 1200, y: 3900, texture: 'chest_01', radius: 100,
    collide: { w: 50, h: 24 }, requiresEvent: 'unlock_telekinesis_1', reward: { sapphires: 10 }, hint: 'Тайник у дороги' },
  { id: 'sapphire_oldwood_cache', kind: 'chest', x: 520, y: 1750, texture: 'chest_01', radius: 100,
    collide: { w: 50, h: 24 }, requiresEvent: 'guardian_defeated', reward: { sapphires: 10 }, hint: 'Тайник Старого леса' },
  // ================================================================== ДОМ ВЕДЬМЫ (зона A)
  { id: 'house_cauldron', kind: 'alchemy', x: 1075, y: 5135, texture: 'cauldron_01', collide: { w: 66, h: 26 }, radius: 120,
    hint: 'Котёл Мирры' },
  { id: 'npc_mirra', kind: 'npc', npc: 'mirra', x: 825, y: 5110, texture: 'npc_mirra', collide: { w: 30, h: 14 }, radius: 115 },
  { id: 'house_wardrobe', kind: 'inspect', x: 722, y: 5085, texture: 'wardrobe_01', collide: { w: 70, h: 24 }, radius: 100, markerDist: 150,
    lines: ['Платья, плащи, одна шляпа с заплатой. Всё пахнет сушёной лавандой.', fm('В шкафу висит старая мантия. Рукава коротковаты — видно, носила другая ведьма.', 'В шкафу висит старая мантия. Рукава коротковаты — видно, её носила какая-то ведьма.'), 'Шкаф скрипнул. Кажется, ему тоже хочется поговорить, но он пока воздерживается.'] },
  { id: 'house_trunk', kind: 'inspect', x: 985, y: 5255, texture: 'trunk_01', collide: { w: 76, h: 22 }, radius: 100, markerDist: 150,
    first: { items: { forest_mushroom: 1, tree_resin: 1 }, text: 'В сундуке — запасы Мирры: гриб и кусочек смолы. «Бери, не жалко», — шепчет записка.' },
    lines: ['Сундук с припасами. Сушёные травы, свечные огарки, мотки верёвки.', 'Здесь лежит всё, что Мирра «на всякий случай» не выбрасывает.'] },
  { id: 'house_cat', kind: 'inspect', x: 975, y: 5170, texture: 'cat_01', radius: 95, markerDist: 140, living: 'cat',
    lines: ['Кот Уголёк мурлычет и жмурится. Спать — его главное ремесло.', 'Уголёк приоткрыл один глаз, оценил вас и снова уснул.', 'Мурр. Тёплый и пушистый, как маленький камин.'] },
  { id: 'house_bed', kind: 'inspect', ghost: { w: 110, h: 50 }, x: 735, y: 5128, radius: 100, markerDist: 130,
    lines: ['Кровать застелена лоскутным одеялом. Подушка ещё хранит тепло.', 'Выспаться можно и потом — лес не будет ждать вечно.'] },
  { id: 'house_shelf', kind: 'inspect', ghost: { w: 140, h: 40 }, x: 765, y: 4992, radius: 100, markerDist: 130,
    lines: ['«Травник», «Лунные календари», «О нраве каменных зверей». Закладки торчат отовсюду.', 'На полке стоят склянки с подписями: «корень», «осколок», «не пробовать».'] },

  // ================================================================== ПОЛЯНА (зона B)
  { id: 'npc_veda', kind: 'npc', npc: 'veda', x: 600, y: 4440, texture: 'npc_veda', collide: { w: 30, h: 14 }, radius: 110 },
  { id: 'herb_g1', kind: 'gather', res: 'moon_herb', amount: 1, respawnSec: 150, x: 510, y: 4420, texture: 'moon_herb_01', radius: 90 },
  { id: 'herb_g2', kind: 'gather', res: 'moon_herb', amount: 1, respawnSec: 150, x: 720, y: 4380, texture: 'moon_herb_01', radius: 90 },
  { id: 'herb_g3', kind: 'gather', res: 'moon_herb', amount: 1, respawnSec: 150, x: 600, y: 4690, texture: 'moon_herb_01', radius: 90 },

  // ================================================================== ТРОПА (зоны C, D)
  { id: 'herb_t1', kind: 'gather', res: 'moon_herb', amount: 1, respawnSec: 150, x: 1020, y: 3760, texture: 'moon_herb_01', radius: 90 },
  { id: 'resin_t1', kind: 'gather', res: 'tree_resin', amount: 1, respawnSec: 200, x: 1020, y: 3600, texture: 'resin_log_01', collide: { w: 56, h: 18 }, radius: 100 },
  { id: 'mush_t1', kind: 'gather', res: 'forest_mushroom', amount: 1, respawnSec: 200, x: 1450, y: 3400, texture: 'mushrooms_brown_01', radius: 90 },
  // колючие заросли: нужен Огонь; внутри — смола (разведка «сожги препятствие → получи ресурс»)
  { id: 'bramble_t1', kind: 'fire', x: 1450, y: 3250, texture: 'bramble_01', burnSec: 1.1, collide: { w: 70, h: 26 },
    lockedText: 'Колючие заросли. Огонь выжжет их — внутри блестит смола.',
    reveal: { spawnPickup: { item: 'tree_resin', amount: 2, texture: 'icon_resin' } } },
  // лагерь охотника
  { id: 'npc_goran', kind: 'npc', npc: 'goran', x: 1410, y: 3950, texture: 'npc_goran', collide: { w: 32, h: 14 }, radius: 110 },

  // ================================================================== АЛТАРЬ (зона E)
  { id: 'npc_selena', kind: 'npc', npc: 'selena', x: 1300, y: 2295, texture: 'npc_selena', radius: 120, elevated: 26 },
  { id: 'rune_sigil', kind: 'gather', res: 'rune_dust', amount: 1, respawnSec: 240, x: 1360, y: 2110, texture: 'rune_sigil_01', radius: 95,
    gatherText: 'Пыль осыпалась с рунной плиты.' },
  // лёгкая плита: сдвинуть Телекинезом → под ней пыль (источник «Телекинез»)
  { id: 'rune_slab', kind: 'telekinesis', mode: 'push', x: 1110, y: 2350, texture: 'rune_slab_01', weight: 'light', target: { x: 1050, y: 2405 },
    collide: { w: 80, h: 26 }, hint: 'Рунная плита',
    hiddenReward: { spawnPickup: { item: 'rune_dust', amount: 2, texture: 'icon_dust' } } },
  { id: 'herb_a1', kind: 'gather', res: 'moon_herb', amount: 1, respawnSec: 150, x: 1050, y: 2650, texture: 'moon_herb_01', radius: 90 },
  { id: 'resin_a1', kind: 'gather', res: 'tree_resin', amount: 1, respawnSec: 200, x: 960, y: 2820, texture: 'resin_log_01', collide: { w: 56, h: 18 }, radius: 100 },
  { id: 'crystal_a1', kind: 'gather', res: 'lunar_shard', amount: 1, respawnSec: 420, x: 1450, y: 2400, texture: 'field_crystal', radius: 100,
    gatherText: 'Кристалл лунного света дал осколок.' },
  { id: 'mush_a1', kind: 'gather', res: 'forest_mushroom', amount: 1, respawnSec: 200, x: 580, y: 2880, texture: 'mushrooms_brown_01', radius: 90 },

  // ================================================================== ЗАПАДНЫЙ ЛЕС (зона J)
  { id: 'mush_j1', kind: 'gather', res: 'forest_mushroom', amount: 1, respawnSec: 200, x: 200, y: 3400, texture: 'mushrooms_brown_01', radius: 90 },
  { id: 'resin_j1', kind: 'gather', res: 'tree_resin', amount: 1, respawnSec: 200, x: 430, y: 3760, texture: 'resin_log_01', collide: { w: 56, h: 18 }, radius: 100 },
  { id: 'hollow_cache', kind: 'chest', x: 170, y: 3500, texture: 'chest_01', collide: { w: 50, h: 24 },
    reward: { items: { forest_mushroom: 2, rune_dust: 1 }, coins: 10 } },

  // ================================================================== v0.10.0 — первая глава
  // +5 рунической пыли (ТЗ §7): тайник охранника огонька (+1, один раз), охраняемый запас старого леса (+2 за каждый
  // победный цикл Корневика rootling_02, раз в 600 с), тайник на подходе к Стражу (+2, один раз, его стережёт rootling_05).
  { id: 'guard_cache', kind: 'chest', x: 1400, y: 2690, texture: 'chest_01', collide: { w: 50, h: 24 },
    requiresEnemyDefeated: 'lunar_guard', reward: { items: { rune_dust: 1 } } },
  { id: 'dust_stash', kind: 'stash', guard: 'rootling_02', x: 175, y: 3255, texture: 'dust_stash_01', emptyTexture: 'dust_stash_empty',
    collide: { w: 60, h: 20 }, radius: 105, items: { rune_dust: 2 }, hint: 'Запас рунической пыли' },
  { id: 'approach_cache', kind: 'chest', x: 530, y: 1890, texture: 'chest_01', collide: { w: 50, h: 24 },
    requiresEnemyDefeated: 'rootling_05', reward: { items: { rune_dust: 2 } } },
  // Астрал I: учебный камень у алтаря (появляется, когда знаки на воротах проявлены) и сердце рощи за воротами
  { id: 'seal_sigil', kind: 'seal_sigil', x: 1110, y: 2140, texture: 'seal_sigil_dim', litTexture: 'seal_sigil_lit', radius: 115,
    requiresEvent: 'gate_marks_revealed', doneEvent: 'seal_training_complete', hint: 'Учебный камень Астрала' },
  { id: 'forest_node', kind: 'forest_node', x: 1480, y: 300, texture: 'forest_node_broken', restoredTexture: 'forest_node_restored',
    collide: { w: 230, h: 46 }, radius: 175, requiresEvent: 'ancient_gate_open', hint: 'Сердце рощи' },
];

// v0.10.0: поляна узла за Древними воротами. Твёрдые кусты и камни генератора внутри прямоугольника убираются
// (цветы остаются) — см. world/mapData.js resolveMap. Старые координаты карты не сдвигаются.
export const CLEARINGS = [
  { id: 'node_glade', x: 700, y: 125, w: 960, h: 210 },
];

// Угроза для охотника: появляется, когда Горан попросил о помощи (sq_hunter_start).
export const CONTENT_ENEMIES = [
  { id: 'scavenger_02', enemy: 'young_scavenger', x: 1460, y: 3580, radius: 120, startEvent: 'hunter_threat_01',
    requiresEvent: 'sq_hunter_start' },
  // v0.10.0: пять Корневиков старого леса — пять разных мест (история первой победы у каждого своя).
  // repeatSec — место возобновляемое: охрана возвращается через 600 с с уменьшенной наградой (ENEMIES.rootling.repeatRewards).
  { id: 'rootling_01', enemy: 'rootling', x: 490, y: 3660, radius: 130, repeatSec: 600 },
  { id: 'rootling_02', enemy: 'rootling', x: 300, y: 3250, radius: 130, repeatSec: 600 },   // охраняет запас пыли
  { id: 'rootling_03', enemy: 'rootling', x: 500, y: 2740, radius: 130, repeatSec: 600 },
  { id: 'rootling_04', enemy: 'rootling', x: 330, y: 2380, radius: 130 },
  { id: 'rootling_05', enemy: 'rootling', x: 390, y: 1940, radius: 130 },                   // охраняет тайник на подходе к Стражу
  // испытание за воротами: Страж узла (три фазы, ENEMIES.node_guardian)
  { id: 'node_trial', enemy: 'node_guardian', x: 1220, y: 270, radius: 170, collide: { w: 170, h: 150 }, scale: 1.5,
    requiresEvent: 'ancient_gate_open', defeatEvent: 'chapter_trial_defeated' },
];

// Награды сундуков и тайников, добавленные в v0.8 к существующим (ресурсы из «тайников»).
export const CACHE_RESOURCE_REWARDS = {
  glade_cache: { tree_resin: 1 },
  trail_cache: { forest_mushroom: 1 },
  west_chest: { rune_dust: 1 },
};

// Неинтерактивные украшения (рисуются сценой, depth по Y). k — ключ текстуры, floor: true — на полу под ногами.
export const CONTENT_DECOR = [
  { id: 'dc_rug', k: 'rug_01', x: 905, y: 5222, floor: true },
  { id: 'dc_herbs_l', k: 'herb_bundle_01', x: 866, y: 4918 },
  { id: 'dc_herbs_r', k: 'herb_bundle_01', x: 936, y: 4918, flip: true },
  { id: 'dc_plant', k: 'plant_pot_01', x: 1108, y: 5250 },
  { id: 'dc_campfire', k: 'campfire_01', x: 1462, y: 3978, fire: true },
  ...CITY_DECOR,   // v0.20.0: город
  ...EXP_DECOR,    // v0.24.0: вылазки
];

// Живые мелочи: мерцание свечей, пылинки в воздухе дома. Рисуются сценой.
export const AMBIENT = [
  { id: 'house_motes', kind: 'motes', rect: { x: 680, y: 4930, w: 440, h: 330 }, color: 0xffe9b0, quantity: 1, frequency: 700 },
  { id: 'glade_fireflies', kind: 'motes', rect: { x: 380, y: 4280, w: 420, h: 360 }, color: 0xbff7ff, quantity: 1, frequency: 900 },
  // v0.28.0: светлячки у ручья
  { id: 'creek_fireflies_n', kind: 'motes', rect: { x: 640, y: 1500, w: 300, h: 520 }, color: 0xbff7ff, quantity: 1, frequency: 1100 },
  { id: 'creek_fireflies_s', kind: 'motes', rect: { x: 640, y: 3250, w: 300, h: 520 }, color: 0xbff7ff, quantity: 1, frequency: 1100 },
  { id: 'altar_sparks', kind: 'motes', rect: { x: 1100, y: 2150, w: 340, h: 260 }, color: 0x9fe9ff, quantity: 1, frequency: 800 },
];
