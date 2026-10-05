// v0.20.0 — глава II «Город под инеем»: дорога и город восточнее леса (docs/design/chapter-2-quests-v0.1.md).
// Мир расширен на восток (WORLD.width 1800 → 3600). Лес и город не соединены пешком: лес закрыт деревьями по x 1700–1800,
// переход — указатели (kind 'travel') на восточной тропе леса и в начале дороги, а также пункт «Город» в меню.
// Здания — «разрезы», как дом Мирры: деревянные стены (kind 'wall') с проёмом двери и пол wooden_floor_01.
// Здесь только данные; они подмешиваются в world.layout.js (ZONES, GROUND, COLLIDERS, KEEP_CLEAR) и world.content.js
// (INTERACTIVES, ENEMY_SPAWNS, DECOR). Новые коллайдеры добавляются только в конец (id c<номер> в редакторе карты).

/** Куда попадает герой, идя из леса; и куда — возвращаясь в лес. */
export const CITY_START = { x: 1960, y: 3625 };
export const FOREST_RETURN = { x: 1600, y: 3625 };
/** Где начинается восточная часть мира (для проверки проходимости: её места проверяются от CITY_START). */
export const EAST_X = 1800;

export const CITY_ZONES = [
  { id: 'R', name: 'Дорога в большой мир', x: 1800, y: 3300, w: 560, h: 650, safePoint: { x: 1960, y: 3625 } },
  { id: 'AR', name: 'Городской Архив', x: 2440, y: 2560, w: 420, h: 480, safePoint: { x: 2650, y: 3150 } },
  { id: 'SO', name: 'Общество Преображения', x: 2960, y: 2560, w: 500, h: 480, safePoint: { x: 3210, y: 3150 } },
  { id: 'DU', name: 'Зал Магической Дуэли', x: 2420, y: 4100, w: 440, h: 360, safePoint: { x: 2640, y: 4020 } },
  { id: 'CV', name: 'Дом Ковенов', x: 2960, y: 4100, w: 500, h: 360, safePoint: { x: 3210, y: 4020 } },
  { id: 'WH', name: 'Складской квартал', x: 2400, y: 4500, w: 1140, h: 500, safePoint: { x: 2910, y: 4050 } },
  { id: 'FQ', name: 'Замёрзший квартал', x: 2400, y: 1900, w: 1140, h: 600, safePoint: { x: 2910, y: 3150 } },
  { id: 'P', name: 'Центральная площадь', x: 2360, y: 1900, w: 1240, h: 3100, safePoint: { x: 2600, y: 3625 } },
];

/** Пол: вся мостовая города и полы зданий-разрезов (поверх мостовой). */
export const CITY_GROUND = [
  { tex: 'stone_path_01', x: 2360, y: 1900, w: 1240, h: 3140 },
  { tex: 'wooden_floor_01', x: 2440, y: 2560, w: 420, h: 480 },
  { tex: 'wooden_floor_01', x: 2960, y: 2560, w: 500, h: 480 },
];

/** Дом-разрез: стены по краю и проём двери внизу (doorX — левый край проёма, ширина 100). */
function building(x, y, w, h, doorX = null) {
  const t = 30, out = [
    { kind: 'wall', x, y, w, h: t },
    { kind: 'wall', x, y, w: t, h },
    { kind: 'wall', x: x + w - t, y, w: t, h },
  ];
  if (doorX == null) out.push({ kind: 'wall', x, y: y + h - t, w, h: t });
  else out.push({ kind: 'wall', x, y: y + h - t, w: doorX - x, h: t }, { kind: 'wall', x: doorX + 100, y: y + h - t, w: x + w - doorX - 100, h: t });
  return out;
}

export const CITY_COLLIDERS = [
  // ---- всё, что вне дороги и города, — лес (тёмная заливка, деревья — украшения ниже)
  { kind: 'trees', x: 1800, y: 0, w: 560, h: 3300 },
  { kind: 'trees', x: 1800, y: 3950, w: 560, h: 1450 },
  { kind: 'trees', x: 2360, y: 0, w: 1240, h: 1860 },
  { kind: 'trees', x: 2360, y: 5040, w: 1240, h: 360 },
  // ---- городская стена (камень); ворота — проём в западной стене на y 3555–3700
  { kind: 'ruin', x: 2360, y: 1860, w: 40, h: 1695 },
  { kind: 'ruin', x: 2360, y: 3700, w: 40, h: 1340 },
  { kind: 'ruin', x: 2400, y: 1860, w: 1200, h: 40 },
  { kind: 'ruin', x: 2400, y: 5000, w: 1200, h: 40 },
  { kind: 'ruin', x: 3560, y: 1900, w: 40, h: 3100 },
  // ---- Архив и Общество Преображения (разрезы с дверью), Дуэльный зал и Дом Ковенов (пока закрыты)
  ...building(2440, 2560, 420, 480, 2600),
  ...building(2960, 2560, 500, 480, 3160),
  ...building(2420, 4100, 440, 360),
  ...building(2960, 4100, 500, 360),
  // ---- Замёрзший квартал пока закрыт ледяной стеной между Архивом и Обществом (откроется по сюжету)
  { kind: 'ruin', x: 2860, y: 2500, w: 100, h: 60 },
  { kind: 'ruin', x: 2400, y: 2500, w: 40, h: 60 },
  { kind: 'ruin', x: 2440, y: 2500, w: 420, h: 60 },
  { kind: 'ruin', x: 2960, y: 2500, w: 600, h: 60 },
  // ---- предметы с картинкой (низ спрайта на нижней кромке)
  { kind: 'furniture', x: 2700, y: 3520, w: 180, h: 60, tex: 'fountain_frozen' },
  { kind: 'furniture', x: 3240, y: 3360, w: 220, h: 50, tex: 'market_stall_01' },
  { kind: 'furniture', x: 2470, y: 2600, w: 140, h: 40, tex: 'bookshelf_01' },
  { kind: 'furniture', x: 2650, y: 2600, w: 140, h: 40, tex: 'bookshelf_01' },
  { kind: 'furniture', x: 2560, y: 2820, w: 110, h: 40, tex: 'table_01' },
  { kind: 'furniture', x: 3000, y: 2600, w: 140, h: 40, tex: 'bookshelf_01' },
  { kind: 'furniture', x: 3300, y: 2620, w: 90, h: 40, tex: 'cauldron_01' },
  { kind: 'furniture', x: 3060, y: 2840, w: 110, h: 40, tex: 'table_01' },
  { kind: 'furniture', x: 3330, y: 3770, w: 110, h: 40, tex: 'table_01' },
  { kind: 'furniture', x: 2480, y: 4620, w: 100, h: 40, tex: 'crate_01' },
  { kind: 'furniture', x: 2640, y: 4700, w: 70, h: 40, tex: 'barrel_01' },
  { kind: 'furniture', x: 3120, y: 4640, w: 100, h: 40, tex: 'crate_01' },
  { kind: 'furniture', x: 3380, y: 4800, w: 100, h: 40, tex: 'crate_01' },
];

export const CITY_KEEP_CLEAR = [{ x: 1800, y: 3300, w: 1800, h: 1700 }];

// v0.20.0: квесты 1–5 главы II (chapter-2-quests-v0.1.md): дорога, площадь, след, Архив, Общество.
export const CITY_INTERACTIVES = [
  // переходы между лесом и городом
  { id: 'travel_to_city', kind: 'travel', x: 1640, y: 3625, texture: 'signpost_01', radius: 110, target: CITY_START, requiresEvent: 'ch2_start',
    hint: 'Дорога в город', lockedText: 'Восточная тропа уходит к большому миру. Сначала нужно закончить дела в лесу — и поговорить с Миррой.',
    text: 'Тропа выводит из леса на большую дорогу. Впереди — город.' },
  { id: 'travel_to_forest', kind: 'travel', x: 1880, y: 3625, texture: 'signpost_01', radius: 110, target: FOREST_RETURN,
    hint: 'Тропа в лес', text: 'Знакомая тропа — домой, к Мирре.' },
  // дорога: ресурсы
  { id: 'frostherb_r1', kind: 'gather', res: 'frost_herb', amount: 1, respawnSec: 240, x: 2060, y: 3420, texture: 'moon_herb_01', radius: 90, requiresEvent: 'ch2_start' },
  { id: 'frostherb_r2', kind: 'gather', res: 'frost_herb', amount: 1, respawnSec: 240, x: 2240, y: 3880, texture: 'moon_herb_01', radius: 90, requiresEvent: 'ch2_start' },
  { id: 'resin_r1', kind: 'gather', res: 'tree_resin', amount: 1, respawnSec: 240, x: 1920, y: 3860, texture: 'resin_log_01', radius: 90 },
  // площадь
  { id: 'npc_ilaria', kind: 'npc', npc: 'ilaria', x: 2560, y: 3260, texture: 'npc_ilaria', collide: { w: 50, h: 24 }, radius: 140 },
  { id: 'npc_merchant', kind: 'npc', npc: 'merchant', x: 3350, y: 3500, texture: 'npc_merchant', collide: { w: 50, h: 24 }, radius: 140 },
  { id: 'npc_banker', kind: 'npc', npc: 'banker', x: 3380, y: 3880, texture: 'npc_banker', collide: { w: 50, h: 24 }, radius: 140 },
  { id: 'npc_duelist', kind: 'npc', npc: 'duelist', x: 2640, y: 4040, texture: 'npc_duelist', collide: { w: 50, h: 24 }, radius: 140 },
  { id: 'plaza_trace', kind: 'seal_sigil', x: 2860, y: 3720, texture: 'seal_sigil_dim', litTexture: 'seal_sigil_lit', radius: 120,
    requiresEvent: 'ch2_met_ilaria', doneEvent: 'ch2_trace_astral', hint: 'Иней на камнях',
    lockedText: 'Иней лёг узором — будто кто-то выжег его магией. Без Астрала не разобрать.',
    doneTitle: 'След проявился', doneText: 'Астрал проявил под инеем знаки: руническая пыль, следы лунных осколков — и клеймо мастерской, которого вы никогда не видели.', doneButton: 'Дальше' },
  { id: 'plaza_debris', kind: 'telekinesis', mode: 'push', weight: 'light', x: 2960, y: 3420, texture: 'crate_01', collide: { w: 70, h: 30 },
    target: { x: 3040, y: 3380 }, radius: 120, requiresEvent: 'ch2_met_ilaria', doneEvent: 'ch2_trace_debris', hint: 'Разбитый ящик',
    hiddenReward: { spawnPickup: { item: 'frost_herb', amount: 2 } } },
  // Архив: старый документ, который читает Астрал
  { id: 'archive_document', kind: 'seal_sigil', x: 2615, y: 2880, texture: 'magic_book_01', litTexture: 'magic_book_01', radius: 110,
    requiresEvent: 'ch2_trace_found', doneEvent: 'ch2_archive_read', hint: 'Старый документ',
    lockedText: 'Пыльные папки о холодной магии. Илария скажет, что искать.',
    doneTitle: 'Общество Преображения', doneText: 'Под Астралом выцветшие строки проступили снова. Ледяная магия в этих краях редка — а недавно все записи о ней забрал исследователь Общества Преображения. Подпись: Северин Вейр.', doneButton: 'К Обществу' },
  // Общество Преображения
  { id: 'npc_severin', kind: 'npc', npc: 'severin', x: 3210, y: 2760, texture: 'npc_severin', collide: { w: 50, h: 24 }, radius: 140 },
];

/** Враги главы II, часть 1. */
export const CITY_ENEMIES = [
  // морозная вспышка на площади (квест 2): появляется, когда герой пришёл в город
  { id: 'plaza_critter', enemy: 'frost_critter', x: 2780, y: 3800, radius: 130, requiresEvent: 'ch2_city_arrived', defeatEvent: 'ch2_plaza_cleared' },
  // знакомый противник на дороге (квест 1, необязательный)
  { id: 'road_scavenger', enemy: 'young_scavenger', x: 2120, y: 3640, radius: 110, requiresEvent: 'ch2_start' },
];

/** Украшения города и дороги: деревья вдоль опушки, фонари, доска объявлений, пятна инея. */
export const CITY_DECOR = [
  ...[3330, 3420, 3510, 3990, 4080, 4170].map((y, i) => ({ id: `ct_tree_${i}`, k: i % 2 ? 'tree_dark_02' : 'tree_dark_01', x: 1840 + (i % 3) * 170, y: y < 3600 ? 3300 : 4030 })),
  ...[1900, 2050, 2200, 2330].map((x, i) => ({ id: `ct_treeN_${i}`, k: 'tree_dark_01', x, y: 3290 })),
  ...[1900, 2050, 2200, 2330].map((x, i) => ({ id: `ct_treeS_${i}`, k: 'tree_dark_02', x, y: 4060 })),
  { id: 'ct_board', k: 'notice_board_01', x: 2480, y: 3420 },
  ...[[2440, 3530], [2440, 3800], [3040, 3240], [3040, 4000], [2900, 4300], [2900, 2470]].map(([x, y], i) => ({ id: `ct_lamp_${i}`, k: 'city_lamp_01', x, y })),
  { id: 'ct_frost_1', k: 'frost_patch_01', x: 2760, y: 3700, floor: true },
  { id: 'ct_frost_2', k: 'frost_patch_01', x: 2980, y: 3860, floor: true },
  { id: 'ct_frost_3', k: 'frost_patch_01', x: 2620, y: 3560, floor: true },
  { id: 'ct_candles', k: 'candle_group_01', x: 2780, y: 2650 },
];

/** v0.20.0: событие «впервые пришёл в зону» (ExplorationScene.updateZone → quests.complete; сервер проверяет условия EVENT_ACTIONS). */
export const ZONE_EVENTS = {
  P: { event: 'ch2_city_arrived', requires: ['ch2_start'] },
};
