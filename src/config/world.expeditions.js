// v0.24.0 — вылазки (stage-2-design-pack §24–25): настоящие опасные места к востоку от города (мир шире: 3600 → 5400).
// Морозный лес (север) и Старое кладбище (юг) — отдельные локации (v0.27.0: config/locations.js), переход — через карту мира у выхода. Внутри: сбор, несколько боёв, сильный противник в конце и его запас (одна выдача за победный цикл, как запас у Корневика).
// Места возобновляются (repeatSec): одна вылазка — 10–15 минут; звери возвращаются через 10 минут, вожак и страж — через час.
// Разные районы — разные дары: в лесу звери горят, но не боятся холода; на кладбище Огонь почти бесполезен, а Астрал пробивает защиту.
// Открываются после главы II (chapter_2_complete).

export const EXP_X = 3700;   // восточнее — участки вылазок (проходимость проверяется от их точек входа)
export const FROSTWOOD_START = { x: 3820, y: 2380 };
export const GRAVEYARD_START = { x: 3820, y: 5060 };
const OPEN = 'chapter_2_complete';

export const EXP_ZONES = [
  { id: 'FW', name: 'Морозный лес', x: 3700, y: 300, w: 1600, h: 2200, safePoint: FROSTWOOD_START },
  { id: 'GY', name: 'Старое кладбище', x: 3700, y: 2800, w: 1600, h: 2400, safePoint: GRAVEYARD_START },
];

export const EXP_GROUND = [
  { tex: 'snow_ground_01', x: 3700, y: 300, w: 1600, h: 2200 },
  { tex: 'grave_ground_01', x: 3700, y: 2800, w: 1600, h: 2400 },
];

export const EXP_COLLIDERS = [
  // лес вокруг участков и между ними
  { kind: 'trees', x: 3600, y: 0, w: 100, h: 5400 },
  { kind: 'trees', x: 3700, y: 0, w: 1700, h: 300 },
  { kind: 'trees', x: 3700, y: 2500, w: 1700, h: 300 },
  { kind: 'trees', x: 3700, y: 5200, w: 1700, h: 200 },
  { kind: 'trees', x: 5300, y: 0, w: 100, h: 5400 },
  // Морозный лес: чащи, между которыми вьётся тропа на север
  { kind: 'trees', x: 3700, y: 1900, w: 700, h: 180 },
  { kind: 'trees', x: 4600, y: 1900, w: 700, h: 180 },
  { kind: 'trees', x: 4150, y: 1300, w: 1150, h: 160 },
  { kind: 'trees', x: 3700, y: 760, w: 1050, h: 160 },
  // Старое кладбище: ограды рядов и склеп
  { kind: 'ruin', x: 3700, y: 4500, w: 650, h: 40 },
  { kind: 'ruin', x: 4550, y: 4500, w: 750, h: 40 },
  { kind: 'ruin', x: 3700, y: 3700, w: 900, h: 40 },
  { kind: 'ruin', x: 4800, y: 3700, w: 500, h: 40 },
  { kind: 'furniture', x: 4400, y: 3040, w: 200, h: 50, tex: 'crypt_01' },
];

export const EXP_KEEP_CLEAR = [{ x: 3600, y: 0, w: 1800, h: 5400 }];

const EXP_OBJECT_LIST = [
  // v0.27.0: выходы на карту мира (вылазки — отдельные локации; описание места — на карте, config/locations.js)
  { id: 'exit_frostwood', kind: 'exit', x: 3760, y: 2440, texture: 'signpost_01', collide: { w: 24, h: 10 }, radius: 110, hint: 'Карта мира' },
  { id: 'exit_graveyard', kind: 'exit', x: 3760, y: 5120, texture: 'signpost_01', collide: { w: 24, h: 10 }, radius: 110, hint: 'Карта мира' },
  // Морозный лес: сбор
  { id: 'fw_herb_1', kind: 'gather', res: 'frost_herb', amount: 1, respawnSec: 300, x: 4500, y: 2300, texture: 'city_frost_herb', radius: 90 },
  { id: 'fw_herb_2', kind: 'gather', res: 'frost_herb', amount: 1, respawnSec: 300, x: 3900, y: 1650, texture: 'city_frost_herb', radius: 90 },
  { id: 'fw_herb_3', kind: 'gather', res: 'frost_herb', amount: 1, respawnSec: 300, x: 5100, y: 1100, texture: 'city_frost_herb', radius: 90 },
  { id: 'fw_crystal_1', kind: 'gather', res: 'ice_crystal', amount: 1, respawnSec: 900, x: 5150, y: 2250, texture: 'ice_crystal_node_01', collide: { w: 50, h: 18 }, radius: 90 },
  { id: 'fw_crystal_2', kind: 'gather', res: 'ice_crystal', amount: 1, respawnSec: 900, x: 3850, y: 600, texture: 'ice_crystal_node_01', collide: { w: 50, h: 18 }, radius: 90 },
  { id: 'fw_cache', kind: 'stash', guard: 'fw_alpha', x: 4500, y: 450, texture: 'city_wolf_cache', collide: { w: 70, h: 22 }, emptyTexture: 'city_wolf_cache_empty', radius: 110,
    items: { frost_shard: 1, ice_crystal: 1 }, hint: 'Логово вожака', label: 'Забрать добычу', guardText: 'Логово стережёт Вожак метели.' },
  // Старое кладбище: сбор
  { id: 'gy_dust_1', kind: 'gather', res: 'rune_dust', amount: 1, respawnSec: 300, x: 4100, y: 4800, texture: 'rune_sigil_01', radius: 90 },
  { id: 'gy_dust_2', kind: 'gather', res: 'rune_dust', amount: 1, respawnSec: 300, x: 5100, y: 3950, texture: 'rune_sigil_01', radius: 90 },
  { id: 'gy_mush_1', kind: 'gather', res: 'forest_mushroom', amount: 1, respawnSec: 300, x: 5050, y: 4900, texture: 'mushrooms_brown_01', radius: 90 },
  { id: 'gy_mush_2', kind: 'gather', res: 'forest_mushroom', amount: 1, respawnSec: 300, x: 3900, y: 4100, texture: 'mushrooms_brown_01', radius: 90 },
  { id: 'gy_shard_1', kind: 'gather', res: 'lunar_shard', amount: 1, respawnSec: 900, x: 3900, y: 3300, texture: 'field_crystal', collide: { w: 60, h: 20 }, radius: 90 },
  { id: 'gy_cache', kind: 'stash', guard: 'gy_warden', x: 4800, y: 3050, texture: 'city_grave_cache', collide: { w: 60, h: 22 }, emptyTexture: 'city_grave_cache_empty', radius: 110,
    items: { frost_shard: 1, lunar_shard: 2 }, hint: 'Сокровище кургана', label: 'Забрать добычу', guardText: 'Сокровище стережёт Страж кургана.' },
];
export const EXP_INTERACTIVES = EXP_OBJECT_LIST.map(o => (o.kind === 'exit' ? o : { ...o, requiresEvent: OPEN }));

const EXP_ENEMY_LIST = [
  { id: 'fw_wolf_1', enemy: 'frost_wolf', x: 4150, y: 2250, radius: 120, repeatSec: 600 },
  { id: 'fw_wolf_2', enemy: 'frost_wolf', x: 4800, y: 1650, radius: 120, repeatSec: 600 },
  { id: 'fw_wolf_3', enemy: 'frost_wolf', x: 4000, y: 1150, radius: 120, repeatSec: 600 },
  { id: 'fw_wolf_4', enemy: 'frost_wolf', x: 4950, y: 900, radius: 120, repeatSec: 600 },
  { id: 'fw_alpha', enemy: 'frost_alpha', x: 4500, y: 620, radius: 140, repeatSec: 3600 },
  { id: 'gy_wisp_1', enemy: 'grave_wisp', x: 4300, y: 4850, radius: 120, repeatSec: 600 },
  { id: 'gy_hound_1', enemy: 'grave_hound', x: 4900, y: 4700, radius: 120, repeatSec: 600 },
  { id: 'gy_wisp_2', enemy: 'grave_wisp', x: 4300, y: 4100, radius: 120, repeatSec: 600 },
  { id: 'gy_hound_2', enemy: 'grave_hound', x: 4950, y: 4150, radius: 120, repeatSec: 600 },
  { id: 'gy_warden', enemy: 'barrow_warden', x: 4500, y: 3300, radius: 140, repeatSec: 3600 },
];
/** Бои, сбор и запасы вылазок сервер засчитывает только после главы II (как и указатели туда). */
export const EXP_ENEMIES = EXP_ENEMY_LIST.map(e => ({ ...e, requiresEvent: OPEN }));

export const EXP_DECOR = [
  // заснеженные ели вдоль чащ и по краям
  ...[[3760, 520], [3990, 470], [5240, 520], [5240, 1500], [3760, 1450], [5240, 2350], [4700, 2440], [4380, 1720], [4740, 1180], [4250, 640]]
    .map(([x, y], i) => ({ id: `fw_tree_${i}`, k: i % 2 ? 'tree_frost_02' : 'tree_frost_01', x, y })),
  ...[[4300, 1980], [4900, 1600], [4100, 1500], [4700, 800], [5000, 2200], [3900, 900]].map(([x, y], i) => ({ id: `fw_frost_${i}`, k: 'frost_patch_01', x, y, floor: true })),
  // надгробия рядами, сухие деревья, свечи у склепа
  ...[3850, 4000, 4150, 4700, 4850, 5000, 5150].flatMap((x, i) => [
    { id: `gy_stone_a${i}`, k: i % 2 ? 'gravestone_02' : 'gravestone_01', x, y: 4650 },
    { id: `gy_stone_b${i}`, k: i % 2 ? 'gravestone_01' : 'gravestone_02', x: x + 30, y: 3880 },
  ]),
  ...[[3760, 3050], [5240, 3100], [5240, 4350], [3760, 4350], [4650, 5150]].map(([x, y], i) => ({ id: `gy_dead_${i}`, k: 'dead_tree_grey_01', x, y })),
  { id: 'gy_candles_1', k: 'candle_group_01', x: 4380, y: 3110 },
  { id: 'gy_candles_2', k: 'candle_group_01', x: 4640, y: 3110 },
];

/** С какой точки проверять, достижимо ли место: лес Мирры, город или участок вылазки (они не соединены пешком). */
export function regionStart(o, forestStart, cityStart, eastX) {
  if (o.x >= EXP_X) return o.y < 2650 ? FROSTWOOD_START : GRAVEYARD_START;
  if (o.x >= eastX) return cityStart;
  return forestStart;
}
