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
  { id: 'FQ', name: 'Замёрзший квартал', x: 2400, y: 1500, w: 1160, h: 1000, safePoint: { x: 2910, y: 3150 } },
  { id: 'P', name: 'Центральная площадь', x: 2360, y: 1500, w: 1240, h: 3500, safePoint: { x: 2600, y: 3625 } },
];

/** Пол: вся мостовая города и полы зданий-разрезов (поверх мостовой). */
export const CITY_GROUND = [
  { tex: 'stone_path_01', x: 2360, y: 1500, w: 1240, h: 3540 },
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
  { kind: 'trees', x: 2360, y: 0, w: 1240, h: 1460 },   // v0.21.0: город вырос на север (Замёрзший квартал)
  { kind: 'trees', x: 2360, y: 5040, w: 1240, h: 360 },
  // ---- городская стена (камень); ворота — проём в западной стене на y 3555–3700
  { kind: 'ruin', x: 2360, y: 1460, w: 40, h: 2095 },
  { kind: 'ruin', x: 2360, y: 3700, w: 40, h: 1340 },
  { kind: 'ruin', x: 2400, y: 1460, w: 1200, h: 40 },
  { kind: 'ruin', x: 2400, y: 5000, w: 1200, h: 40 },
  { kind: 'ruin', x: 3560, y: 1500, w: 40, h: 3500 },
  // ---- Архив и Общество Преображения (разрезы с дверью), Дуэльный зал и Дом Ковенов (пока закрыты)
  ...building(2440, 2560, 420, 480, 2600),
  ...building(2960, 2560, 500, 480, 3160),
  ...building(2420, 4100, 440, 360),
  ...building(2960, 4100, 500, 360),
  // ---- Замёрзший квартал: вход — улица между Архивом и Обществом (её закрывает ледяная стена frost_barrier, квест 7).
  // v0.21.0: внутри квартал делит каменная ограда (y 1960–2000) с затопленным проломом fq_water — его замораживают Льдом (квест 9).
  { kind: 'ruin', x: 2400, y: 1960, w: 460, h: 40 },
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
  // v0.21.0 (добавлено в конец): вторая половина ограды Замёрзшего квартала
  { kind: 'ruin', x: 2960, y: 1960, w: 600, h: 40 },
];

export const CITY_KEEP_CLEAR = [{ x: 1800, y: 3300, w: 1800, h: 1700 }, { x: 2360, y: 1460, w: 1240, h: 1840 }];

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

  // ---- v0.21.0: квест 6 «Пропавший груз» — Складской квартал (после боя со сборщиками)
  { id: 'wh_cargo', kind: 'telekinesis', mode: 'push', weight: 'medium', x: 3250, y: 4930, texture: 'crate_01', collide: { w: 70, h: 30 },
    target: { x: 3330, y: 4900 }, radius: 120, requiresEnemyDefeated: 'wh_elite', doneEvent: 'ch2_cargo_found', hint: 'Ящики с грузом',
    hiddenReward: { spawnPickup: { item: 'ice_crystal', amount: 1 } } },
  { id: 'wh_equipment', kind: 'seal_sigil', x: 2700, y: 4930, texture: 'trunk_01', litTexture: 'trunk_01', radius: 110,
    requiresEvent: 'ch2_cargo_found', doneEvent: 'ch2_serials_read', hint: 'Оборудование с клеймом',
    lockedText: 'Ящик с инструментами под инеем. Сначала разберитесь со сборщиками.',
    doneTitle: 'Списанное оборудование', doneText: 'Под Астралом проступили серийные номера и клеймо Общества Преображения. Рядом — печать: «Списано». Полгода назад. Кто-то пользуется оборудованием, которого официально нет.', doneButton: 'К Иларии' },

  // ---- квест 7 «Чужими руками» → квест 8: ледяная стена на улице к Замёрзшему кварталу. Видна всегда, растапливается Огнём после волны холода.
  { id: 'frost_barrier', kind: 'fire', x: 2910, y: 2560, texture: 'ice_wall_01', collide: { w: 100, h: 60 }, radius: 130,
    waitEvent: 'ch2_frost_wave', destroyEvent: 'ch2_quarter_open', burnSec: 1.6, hint: 'Ледяная стена',
    lockedText: 'Улицу к северному кварталу перегородила стена льда. Город запретил туда ходить — пока.',
    doneText: 'Лёд поплыл и осел. Путь в Замёрзший квартал открыт.' },

  // ---- квест 8 «То, что нельзя сжечь» — южная часть квартала
  { id: 'ice_construct', kind: 'fire', x: 2700, y: 2330, texture: 'ice_construct_01', collide: { w: 90, h: 30 }, radius: 130,
    requiresEvent: 'ch2_quarter_open', destroyEvent: 'ch2_construct_unstable', burnSec: 1.4, hint: 'Ледяная конструкция',
    doneText: 'Конструкция треснула — и холод рванулся наружу! Кто-то в синем плаще встал между вами и вспышкой.' },
  { id: 'npc_nerys', kind: 'npc', npc: 'nerys', x: 2800, y: 2230, texture: 'npc_nerys', radius: 140, requiresEvent: 'ch2_construct_unstable' },
  { id: 'fq_door', kind: 'seal_sigil', x: 3420, y: 2140, texture: 'frozen_door_01', litTexture: 'frozen_door_01', radius: 120,
    requiresEnemyDefeated: 'fq_collector', doneEvent: 'ch2_rescue_door', hint: 'Обледеневшая дверь',
    lockedText: 'За дверью кто-то стучит. Сначала — сборщик рядом.',
    doneTitle: 'Люди за дверью', doneText: 'Астрал показал узлы, на которых держится лёд. Нэрис разбила их одним касанием — и двое жителей вышли наружу, дрожа от холода.', doneButton: 'Дальше' },
  { id: 'fq_cellar', kind: 'telekinesis', mode: 'push', weight: 'medium', x: 2500, y: 2190, texture: 'crate_01', collide: { w: 70, h: 30 },
    target: { x: 2470, y: 2120 }, radius: 120, requiresEnemyDefeated: 'fq_critter', doneEvent: 'ch2_rescue_cellar', hint: 'Ящики над погребом',
    hiddenReward: { spawnPickup: { item: 'frost_herb', amount: 1 } } },
  { id: 'fq_cauldron', kind: 'alchemy', x: 3080, y: 2160, texture: 'cauldron_01', collide: { w: 66, h: 26 }, radius: 120, requiresEvent: 'ch2_nerys_met' },

  // ---- квест 9 «Холодная наука»: затопленный пролом в ограде замораживают Льдом — за ним тренировочный двор
  { id: 'fq_water', kind: 'ice', x: 2910, y: 2010, texture: 'water_patch_01', frozenTexture: 'ice_floor_01', walkable: true, collide: { w: 100, h: 50 }, radius: 130,
    doneEvent: 'ch2_water_frozen', hint: 'Затопленный пролом', lockedText: 'Вода из лопнувшей трубы залила пролом в ограде. Здесь пригодился бы Лёд.',
    doneText: 'Вода схватилась льдом — можно пройти.' },
];

/** Враги главы II, часть 1. */
export const CITY_ENEMIES = [
  // морозная вспышка на площади (квест 2): появляется, когда герой пришёл в город
  { id: 'plaza_critter', enemy: 'frost_critter', x: 2780, y: 3800, radius: 130, requiresEvent: 'ch2_city_arrived', defeatEvent: 'ch2_plaza_cleared' },
  // знакомый противник на дороге (квест 1, необязательный)
  { id: 'road_scavenger', enemy: 'young_scavenger', x: 2120, y: 3640, radius: 110, requiresEvent: 'ch2_start' },
  // v0.21.0 — квест 6: Складской квартал
  { id: 'wh_collector_1', enemy: 'frost_collector', x: 2560, y: 4800, radius: 120, requiresEvent: 'ch2_cargo_start' },
  { id: 'wh_collector_2', enemy: 'frost_collector', x: 3240, y: 4720, radius: 120, requiresEvent: 'ch2_cargo_start' },
  { id: 'wh_elite', enemy: 'frost_collector_elite', x: 2930, y: 4880, radius: 130, requiresEvent: 'ch2_cargo_start', defeatEvent: 'ch2_wh_boss' },
  // квест 7: зверь, сбежавший из закрытой лаборатории, — у дверей Общества
  { id: 'lab_critter', enemy: 'frost_critter', x: 3210, y: 3240, radius: 120, requiresEvent: 'ch2_severin_asked', defeatEvent: 'ch2_lab_critter' },
  // квест 8: Замёрзший квартал (появляются после знакомства с Нэрис)
  { id: 'fq_critter', enemy: 'frost_critter', x: 2560, y: 2400, radius: 120, requiresEvent: 'ch2_nerys_met' },
  { id: 'fq_collector', enemy: 'frost_collector', x: 3300, y: 2300, radius: 120, requiresEvent: 'ch2_nerys_met' },
  // квест 9: тренировочный двор за проломом
  { id: 'fq_training', enemy: 'frost_critter', x: 2910, y: 1830, radius: 110, requiresEvent: 'unlock_ice_1', defeatEvent: 'ch2_training_done' },
  // квест 10 «Выбор»: глубина квартала
  { id: 'fq_deep_1', enemy: 'frost_collector', x: 2600, y: 1740, radius: 120, requiresEvent: 'ch2_choice_start', defeatEvent: 'ch2_deep_1' },
  { id: 'fq_deep_2', enemy: 'frost_collector', x: 3240, y: 1740, radius: 120, requiresEvent: 'ch2_choice_start', defeatEvent: 'ch2_deep_2' },
  { id: 'fq_guardian', enemy: 'ice_guardian', x: 2910, y: 1690, radius: 140, requiresEvent: 'ch2_choice_start', defeatEvent: 'ch2_ice_guardian_defeated' },
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
  // v0.21.0: Замёрзший квартал — иней на мостовой и фонари
  ...[[2560, 2300], [3180, 2420], [2680, 2080], [3360, 2060], [2560, 1660], [3240, 1640], [2700, 1880], [3420, 1860]].map(([x, y], i) => ({ id: `fq_frost_${i}`, k: 'frost_patch_01', x, y, floor: true })),
  ...[[2440, 2470], [3520, 2470], [2440, 1940], [3520, 1940], [2440, 1540], [3520, 1540]].map(([x, y], i) => ({ id: `fq_lamp_${i}`, k: 'city_lamp_01', x, y })),
];

/** v0.20.0: событие «впервые пришёл в зону» (ExplorationScene.updateZone → quests.complete; сервер проверяет условия EVENT_ACTIONS). */
export const ZONE_EVENTS = {
  P: { event: 'ch2_city_arrived', requires: ['ch2_start'] },
};

/** v0.21.0: проходы города для проверки проходимости (закрыты, пока их не открыл сюжет) и места за ними. */
export const CITY_GATE_IDS = ['frost_barrier', 'fq_water'];
export const CITY_BEHIND_GATES = ['npc_nerys', 'ice_construct', 'fq_door', 'fq_training', 'fq_guardian'];
