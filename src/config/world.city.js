// v0.20.0 — глава II «Город под инеем»: дорога и город восточнее леса (docs/design/chapter-2-quests-v0.1.md).
// Мир расширен на восток (WORLD.width 1800 → 3600). Лес и город не соединены пешком: лес закрыт деревьями по x 1700–1800,
// переход — v0.27.0: через карту мира у выходов (kind 'exit': восточная тропа леса и начало дороги), см. config/locations.js.
// Здания — «разрезы», как дом Мирры: деревянные стены (kind 'wall') с проёмом двери и пол wooden_floor_01.
// Здесь только данные; они подмешиваются в world.layout.js (ZONES, GROUND, COLLIDERS, KEEP_CLEAR) и world.content.js
// (INTERACTIVES, ENEMY_SPAWNS, DECOR). Новые коллайдеры добавляются только в конец (id c<номер> в редакторе карты).

/** Куда попадает герой, идя из леса; и куда — возвращаясь в лес. */
export const CITY_START = { x: 1960, y: 3625 };
export const FOREST_RETURN = { x: 1200, y: 4416 };
/** Где начинается восточная часть мира (для проверки проходимости: её места проверяются от CITY_START). */
export const EAST_X = 1800;

export const CITY_ZONES = [
  { id: 'R', name: 'Дорога в большой мир', x: 1800, y: 3300, w: 560, h: 650, safePoint: { x: 1960, y: 3625 } },
  { id: 'AR', name: 'Городской Архив', x: 2440, y: 2560, w: 420, h: 480, interior: true, safePoint: { x: 2650, y: 3150 } },
  { id: 'SO', name: 'Общество Преображения', x: 2960, y: 2560, w: 500, h: 480, interior: true, safePoint: { x: 3210, y: 3150 } },
  { id: 'LB', name: 'Тайная лаборатория', x: 1840, y: 4060, w: 480, h: 700, interior: true, safePoint: { x: 2070, y: 3800 } },
  { id: 'DU', name: 'Зал Магической Дуэли', x: 2420, y: 4100, w: 440, h: 360, interior: true, safePoint: { x: 2640, y: 4020 } },
  { id: 'CV', name: 'Дом Ковенов', x: 2960, y: 4100, w: 500, h: 360, interior: true, safePoint: { x: 3210, y: 4020 } },
  { id: 'BK', name: 'Городской Банк', x: 3120, y: 3560, w: 400, h: 420, interior: true, safePoint: { x: 3320, y: 4030 } },
  { id: 'WH', name: 'Складской квартал', x: 2400, y: 4500, w: 1140, h: 500, safePoint: { x: 2910, y: 4050 } },
  { id: 'FQ', name: 'Замёрзший квартал', x: 2400, y: 1500, w: 1160, h: 1000, safePoint: { x: 2910, y: 3150 } },
  { id: 'P', name: 'Центральная площадь', x: 2360, y: 1500, w: 1240, h: 3500, safePoint: { x: 2600, y: 3625 } },
];

/** Пол: вся мостовая города и полы зданий-разрезов (поверх мостовой). */
export const CITY_GROUND = [
  { tex: 'city_paving', x: 2360, y: 1500, w: 1240, h: 3540 },
  { tex: 'city_wood_floor', x: 2440, y: 2560, w: 420, h: 480, interior: true, tint: 0xe9dcc4 },
  { tex: 'city_stone_floor', x: 2960, y: 2560, w: 500, h: 480, interior: true },
  // v0.22.0: Дуэльный зал и Дом Ковенов открыты (полы), тайная лаборатория к югу от дороги и проход к ней
  { tex: 'city_stone_floor', x: 2420, y: 4100, w: 440, h: 360, interior: true, tint: 0xc8c4bb },
  { tex: 'city_wood_floor', x: 2960, y: 4100, w: 500, h: 360, interior: true, tint: 0xc6d4bb },
  { tex: 'stone_path_01', x: 2020, y: 3950, w: 100, h: 120 },
  { tex: 'city_stone_floor', x: 1840, y: 4060, w: 480, h: 700, interior: true, tint: 0xb5c5c9 },
  { tex: 'city_wood_floor', x: 3120, y: 3560, w: 400, h: 420, interior: true, tint: 0xd5c5ad },
];

/** v0.22.0: дом-разрез с дверью вверху (вход с площади, которая севернее): doorX — левый край проёма, ширина 100. */
function buildingTop(x, y, w, h, doorX) {
  const t = 30;
  return [
    { kind: 'wall', x, y, w: doorX - x, h: t },
    { kind: 'wall', x: doorX + 100, y, w: x + w - doorX - 100, h: t },
    { kind: 'wall', x, y, w: t, h },
    { kind: 'wall', x: x + w - t, y, w: t, h },
    { kind: 'wall', x, y: y + h - t, w, h: t },
  ];
}

/** Дом-разрез: стены по краю и проём двери внизу (doorX — левый край проёма, ширина 100). */
function building(x, y, w, h, doorX = null, doorW = 100) {
  const t = 30, out = [
    { kind: 'wall', x, y, w, h: t },
    { kind: 'wall', x, y, w: t, h },
    { kind: 'wall', x: x + w - t, y, w: t, h },
  ];
  if (doorX == null) out.push({ kind: 'wall', x, y: y + h - t, w, h: t });
  else out.push({ kind: 'wall', x, y: y + h - t, w: doorX - x, h: t }, { kind: 'wall', x: doorX + doorW, y: y + h - t, w: x + w - doorX - doorW, h: t });
  return out;
}

export const CITY_COLLIDERS = [
  // ---- всё, что вне дороги и города, — лес (тёмная заливка, деревья — украшения ниже)
  { kind: 'trees', x: 1800, y: 0, w: 560, h: 3300 },
  { kind: 'trees', x: 1800, y: 3950, w: 220, h: 110 },   // v0.22.0: к югу от дороги — проход к тайной лаборатории (x 2020–2120)
  { kind: 'trees', x: 2360, y: 0, w: 1240, h: 1460 },   // v0.21.0: город вырос на север (Замёрзший квартал)
  { kind: 'trees', x: 2360, y: 5040, w: 1240, h: 360 },
  // ---- городская стена (камень); ворота — проём в западной стене на y 3555–3700
  { kind: 'ruin', x: 2360, y: 1460, w: 40, h: 2095 },
  { kind: 'ruin', x: 2360, y: 3700, w: 40, h: 1340 },
  { kind: 'ruin', x: 2400, y: 1460, w: 1200, h: 40 },
  { kind: 'ruin', x: 2400, y: 5000, w: 1200, h: 40 },
  { kind: 'ruin', x: 3560, y: 1500, w: 40, h: 3500 },
  // ---- Архив и Общество Преображения (разрезы с дверью). v0.22.0: Дуэльный зал и Дом Ковенов — с дверью на площадь
  //      (дверь зала закрыта астральным барьером final_ward до финала главы)
  ...building(2440, 2560, 420, 480, 2600),
  ...building(2960, 2560, 500, 480, 3160),
  ...buildingTop(2420, 4100, 440, 360, 2590),
  ...buildingTop(2960, 4100, 500, 360, 3160),
  // ---- Замёрзший квартал: вход — улица между Архивом и Обществом (её закрывает ледяная стена frost_barrier, квест 7).
  // v0.21.0: внутри квартал делит каменная ограда (y 1960–2000) с затопленным проломом fq_water — его замораживают Льдом (квест 9).
  { kind: 'ruin', x: 2400, y: 1960, w: 460, h: 40 },
  { kind: 'ruin', x: 2400, y: 2500, w: 40, h: 60 },
  { kind: 'ruin', x: 2440, y: 2500, w: 420, h: 60 },
  { kind: 'ruin', x: 2960, y: 2500, w: 600, h: 60 },
  // ---- предметы с картинкой (низ спрайта на нижней кромке)
  { kind: 'furniture', x: 2700, y: 3520, w: 180, h: 60, tex: 'fountain_frozen' },
  { kind: 'furniture', x: 3240, y: 3360, w: 220, h: 50, tex: 'market_stall_01' },
  { kind: 'furniture', x: 2470, y: 2730, w: 140, h: 40, tex: 'city_archive_shelf' },
  { kind: 'furniture', x: 2660, y: 2730, w: 140, h: 40, tex: 'city_archive_shelf' },
  { kind: 'furniture', x: 2525, y: 2865, w: 160, h: 35, tex: 'city_archive_desk' },
  { kind: 'furniture', x: 3010, y: 2740, w: 190, h: 40, tex: 'city_society_workbench' },
  { kind: 'furniture', x: 3310, y: 2740, w: 70, h: 40, tex: 'city_coolant_stable' },
  { kind: 'furniture', x: 3010, y: 2910, w: 100, h: 30, tex: 'city_equipment' },
  { kind: 'furniture', x: 3205, y: 3840, w: 230, h: 30, tex: 'city_bank_counter' },
  { kind: 'furniture', x: 2425, y: 4645, w: 300, h: 65, tex: 'city_warehouse' },
  { kind: 'furniture', x: 2640, y: 4700, w: 70, h: 40, tex: 'city_barrel' },
  { kind: 'furniture', x: 3225, y: 4645, w: 300, h: 65, tex: 'city_warehouse' },
  { kind: 'furniture', x: 3380, y: 4800, w: 100, h: 40, tex: 'city_crate' },
  // v0.21.0 (добавлено в конец): вторая половина ограды Замёрзшего квартала
  { kind: 'ruin', x: 2960, y: 1960, w: 600, h: 40 },
  // v0.22.0 (добавлено в конец): лес вокруг тайной лаборатории и её каменные стены (вход — пролом x 2020–2120, его держит печать lab_seal)
  { kind: 'trees', x: 2120, y: 3950, w: 240, h: 110 },
  { kind: 'trees', x: 1800, y: 4060, w: 40, h: 1340 },
  { kind: 'trees', x: 2320, y: 4060, w: 40, h: 1340 },
  { kind: 'trees', x: 1840, y: 4760, w: 480, h: 640 },
  { kind: 'ruin', x: 1840, y: 4060, w: 180, h: 40 },
  { kind: 'ruin', x: 2120, y: 4060, w: 200, h: 40 },
  { kind: 'ruin', x: 1840, y: 4720, w: 480, h: 40 },
  { kind: 'furniture', x: 1885, y: 4430, w: 150, h: 35, tex: 'city_society_workbench' },
  { kind: 'furniture', x: 2180, y: 4230, w: 100, h: 35, tex: 'city_coven_cabinet' },
  { kind: 'furniture', x: 3010, y: 4275, w: 120, h: 35, tex: 'city_coven_cabinet' },
  // Residential facades in the formerly empty northern edge; physical footprint matches their base.
  { kind: 'furniture', x: 2415, y: 1510, w: 430, h: 90, tex: 'city_house' },
  { kind: 'furniture', x: 3125, y: 1510, w: 430, h: 90, tex: 'city_house' },
  { kind: 'furniture', x: 3280, y: 2910, w: 120, h: 30, tex: 'city_equipment' },
  { kind: 'furniture', x: 1885, y: 4240, w: 150, h: 35, tex: 'city_lab_machine' },
  { kind: 'furniture', x: 2125, y: 4505, w: 150, h: 35, tex: 'city_lab_machine' },
  { kind: 'furniture', x: 2000, y: 4680, w: 100, h: 30, tex: 'city_equipment' },
  { kind: 'furniture', x: 2435, y: 4540, w: 50, h: 20, tex: 'city_barrel' },
  { kind: 'furniture', x: 3445, y: 4540, w: 50, h: 20, tex: 'city_barrel' },
  { kind: 'furniture', x: 2685, y: 4545, w: 70, h: 25, tex: 'city_crate' },
  { kind: 'furniture', x: 3335, y: 4575, w: 70, h: 25, tex: 'city_crate' },
];

// Append AFTER expedition colliders in world.layout.js so every existing c<number> stays stable.
export const CITY_EXTRA_COLLIDERS = [
  ...building(3120, 3560, 400, 420, 3250, 140),
  { kind: 'furniture', x: 3380, y: 3720, w: 85, h: 35, tex: 'city_bank_safe' },
  { kind: 'furniture', x: 3170, y: 3720, w: 80, h: 30, tex: 'trunk_01' },
  { kind: 'furniture', x: 2690, y: 2935, w: 110, h: 30, tex: 'city_archive_shelf' },
  { kind: 'furniture', x: 3320, y: 4380, w: 90, h: 30, tex: 'trunk_01' },
  { kind: 'furniture', x: 3060, y: 4380, w: 170, h: 30, tex: 'city_coven_table' },
  { kind: 'furniture', x: 2465, y: 4250, w: 80, h: 30, tex: 'city_duel_rack' },
  { kind: 'furniture', x: 2730, y: 4250, w: 80, h: 30, tex: 'city_duel_rack' },
  { kind: 'furniture', x: 2415, y: 2070, w: 430, h: 80, tex: 'city_frozen_house' },
  { kind: 'furniture', x: 3125, y: 2050, w: 430, h: 80, tex: 'city_frozen_house' },
  { kind: 'furniture', x: 2110, y: 4640, w: 140, h: 35, tex: 'city_archive_desk' },
  { kind: 'furniture', x: 2205, y: 4400, w: 70, h: 30, tex: 'bed_01' },
  { kind: 'furniture', x: 1885, y: 4530, w: 70, h: 30, tex: 'bed_01' },
];

/** Small non-solid details grouped by use; furniture footprints live above, never here. */
export const CITY_ROOM_DECOR = [
  // Archive: reading lamp, papers, storage; the manuscript is on the actual reading desk.
  { key: 'candle_group_01', x: 2500, y: 2840, scale: 0.65 },
  { key: 'city_letters', x: 2760, y: 2750, scale: 0.45 },
  { key: 'plant_pot_01', x: 2500, y: 2960 },
  // Society: an orderly measurement corner rather than another bedroom.
  { key: 'rune_slab_01', x: 3220, y: 2730, scale: 0.7, ground: true },
  { key: 'city_archive_document', x: 3350, y: 2890, scale: 0.45 },
  { key: 'plant_pot_01', x: 3390, y: 2980 },
  // Bank: only a short runner in the customer area; safe and money are behind the counter.
  { key: 'rug_01', x: 3320, y: 3940, scale: 0.52, ground: true, tint: 0xb9c3a0 },
  { key: 'plant_pot_01', x: 3185, y: 3930, solid: null },   // стоят по краям прохода к стойке — проходимы
  { key: 'plant_pot_01', x: 3460, y: 3930, solid: null },
  // Coven: herbs, shared supplies, tea and a warm corner for visitors.
  { key: 'herb_bundle_01', x: 3380, y: 4230 },
  { key: 'herb_bundle_01', x: 3320, y: 4230 },
  { key: 'plant_pot_01', x: 3380, y: 4300 },
  { key: 'candle_group_01', x: 3340, y: 4390, scale: 0.65 },
  // Laboratory: cold instruments, bedside supplies, and the experiment journal on a desk.
  { key: 'city_equipment', x: 1930, y: 4450, scale: 0.45 },
  { key: 'herb_bundle_01', x: 2250, y: 4200 },
  { key: 'city_barrel', x: 2260, y: 4630, scale: 0.7 },
  // Entrance signs belong beside doors, below the cutaway's back walls.
  { key: 'city_sign_archive', x: 2775, y: 3120 },
  { key: 'city_sign_society', x: 3380, y: 3120 },
  { key: 'city_sign_duel', x: 2490, y: 4050 },
  { key: 'city_sign_coven', x: 3355, y: 4050 },
];

export const CITY_KEEP_CLEAR = [{ x: 1800, y: 3300, w: 1800, h: 1700 }, { x: 2360, y: 1460, w: 1240, h: 1840 }, { x: 1800, y: 3950, w: 560, h: 1450 }];

// v0.20.0: квесты 1–5 главы II (chapter-2-quests-v0.1.md): дорога, площадь, след, Архив, Общество.
export const CITY_INTERACTIVES = [
  { id: 'sapphire_city_cache_1', kind: 'chest', x: 2730, y: 3480, texture: 'chest_01', radius: 100,
    collide: { w: 50, h: 24 }, requiresEvent: 'ch2_city_arrived', reward: { sapphires: 10 }, hint: 'Тайник у площади' },
  { id: 'sapphire_city_cache_2', kind: 'chest', x: 2910, y: 3960, texture: 'chest_01', radius: 100,
    collide: { w: 50, h: 24 }, requiresEvent: 'ch2_quarter_cleared', reward: { sapphires: 10 }, hint: 'Тайник у старой ограды' },
  // v0.27.0: выходы на карту мира (лес и город — разные локации, переход — только через карту у выхода)
  // Прежний декоративный указатель d05 у перекрёстка теперь открывает карту.
  { id: 'exit_forest', kind: 'exit', x: 1104, y: 4416, texture: 'signpost_01', radius: 110, collide: { w: 24, h: 10 }, hint: 'Карта мира' },
  { id: 'exit_city', kind: 'exit', x: 1880, y: 3625, texture: 'signpost_01', collide: { w: 24, h: 10 }, radius: 110, hint: 'Карта мира' },
  // дорога: ресурсы
  { id: 'frostherb_r1', kind: 'gather', res: 'frost_herb', amount: 1, respawnSec: 240, x: 2060, y: 3420, texture: 'city_frost_herb', radius: 90, requiresEvent: 'ch2_start' },
  { id: 'frostherb_r2', kind: 'gather', res: 'frost_herb', amount: 1, respawnSec: 240, x: 2240, y: 3880, texture: 'city_frost_herb', radius: 90, requiresEvent: 'ch2_start' },
  { id: 'resin_r1', kind: 'gather', res: 'tree_resin', amount: 1, respawnSec: 240, x: 1920, y: 3860, texture: 'resin_log_01', radius: 90 },
  // площадь. v0.23.0: доска поручений (5 поручений дня, взять 3) — открывается после квеста 10
  { id: 'city_board', kind: 'board', x: 2480, y: 3420, texture: 'notice_board_01', collide: { w: 80, h: 20 }, radius: 120, hint: 'Доска поручений' },
  { id: 'npc_ilaria', kind: 'npc', npc: 'ilaria', x: 2560, y: 3260, texture: 'npc_ilaria', collide: { w: 50, h: 24 }, radius: 140 },
  { id: 'npc_merchant', kind: 'npc', npc: 'merchant', x: 3350, y: 3500, texture: 'npc_merchant', collide: { w: 50, h: 24 }, radius: 140 },
  { id: 'npc_banker', kind: 'npc', npc: 'banker', x: 3320, y: 3745, texture: 'npc_banker', collide: { w: 50, h: 24 }, radius: 180 },
  { id: 'npc_duelist', kind: 'npc', npc: 'duelist', x: 2640, y: 4040, texture: 'npc_duelist', collide: { w: 50, h: 24 }, radius: 140 },
  { id: 'plaza_trace', kind: 'seal_sigil', x: 2860, y: 3720, texture: 'city_frost_trace', litTexture: 'city_frost_trace', litTint: 0xe8d6ff, radius: 120,
    requiresEvent: 'ch2_met_ilaria', doneEvent: 'ch2_trace_astral', hint: 'Иней на камнях',
    lockedText: 'Иней лёг узором — будто кто-то выжег его магией. Без Астрала не разобрать.',
    doneTitle: 'След проявился', doneText: 'Астрал проявил под инеем знаки: руническая пыль, следы лунных осколков — и клеймо мастерской, которого вы никогда не видели.', doneButton: 'Дальше' },
  { id: 'plaza_debris', kind: 'telekinesis', mode: 'push', weight: 'light', x: 2960, y: 3420, texture: 'city_crate', collide: { w: 70, h: 30 },
    target: { x: 3040, y: 3380 }, radius: 120, requiresEvent: 'ch2_met_ilaria', doneEvent: 'ch2_trace_debris', hint: 'Разбитый ящик',
    hiddenReward: { spawnPickup: { item: 'frost_herb', amount: 2 } } },
  // Архив: старый документ, который читает Астрал
  { id: 'archive_document', kind: 'seal_sigil', x: 2605, y: 2900, elevated: 50, texture: 'city_archive_document', litTexture: 'city_archive_document', litTint: 0xe8d6ff, radius: 110,
    requiresEvent: 'ch2_trace_found', doneEvent: 'ch2_archive_read', hint: 'Старый документ',
    lockedText: 'Пыльные папки о холодной магии. Илария скажет, что искать.',
    doneTitle: 'Общество Преображения', doneText: 'Под Астралом выцветшие строки проступили снова. Ледяная магия в этих краях редка — а недавно все записи о ней забрал исследователь Общества Преображения. Подпись: Северин Вейр.', doneButton: 'К Обществу' },
  // Общество Преображения
  { id: 'npc_severin', kind: 'npc', npc: 'severin', x: 3210, y: 2890, texture: 'npc_severin', collide: { w: 50, h: 24 }, radius: 140, hideEvent: 'ch2_final_start' },

  // ---- v0.21.0: квест 6 «Пропавший груз» — Складской квартал (после боя со сборщиками)
  { id: 'wh_cargo', kind: 'telekinesis', mode: 'push', weight: 'medium', x: 3250, y: 4930, texture: 'city_crate', collide: { w: 70, h: 30 },
    target: { x: 3330, y: 4900 }, radius: 120, requiresEnemyDefeated: 'wh_elite', doneEvent: 'ch2_cargo_found', hint: 'Ящики с грузом',
    hiddenReward: { spawnPickup: { item: 'ice_crystal', amount: 1 } } },
  { id: 'wh_equipment', kind: 'seal_sigil', x: 2700, y: 4930, texture: 'city_equipment', litTexture: 'city_equipment', litTint: 0xe8d6ff, radius: 110,
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
  { id: 'npc_nerys', kind: 'npc', npc: 'nerys', x: 2800, y: 2230, texture: 'npc_nerys', collide: { w: 30, h: 14 }, radius: 140, requiresEvent: 'ch2_construct_unstable', hideEvent: 'ch2_final_start' },
  { id: 'fq_door', kind: 'seal_sigil', x: 3340, y: 2150, texture: 'frozen_door_01', litTexture: 'city_door_open', radius: 120,
    requiresEnemyDefeated: 'fq_collector', doneEvent: 'ch2_rescue_door', hint: 'Обледеневшая дверь',
    lockedText: 'За дверью кто-то стучит. Сначала — сборщик рядом.',
    doneTitle: 'Люди за дверью', doneText: 'Астрал показал узлы, на которых держится лёд. Нэрис разбила их одним касанием — и двое жителей вышли наружу, дрожа от холода.', doneButton: 'Дальше' },
  { id: 'fq_cellar', kind: 'telekinesis', mode: 'push', weight: 'medium', x: 2500, y: 2190, texture: 'city_crate', collide: { w: 70, h: 30 },
    target: { x: 2440, y: 2260 }, radius: 120, requiresEnemyDefeated: 'fq_critter', doneEvent: 'ch2_rescue_cellar', hint: 'Ящики над погребом',
    hiddenReward: { spawnPickup: { item: 'frost_herb', amount: 1 } } },
  { id: 'fq_cauldron', kind: 'alchemy', x: 3080, y: 2160, texture: 'cauldron_01', collide: { w: 66, h: 26 }, radius: 120, requiresEvent: 'ch2_nerys_met' },

  // ---- квест 9 «Холодная наука»: затопленный пролом в ограде замораживают Льдом — за ним тренировочный двор
  { id: 'fq_water', kind: 'ice', x: 2910, y: 2010, texture: 'water_patch_01', frozenTexture: 'ice_floor_01', walkable: true, collide: { w: 100, h: 50 }, radius: 130,
    doneEvent: 'ch2_water_frozen', hint: 'Затопленный пролом', lockedText: 'Вода из лопнувшей трубы залила пролом в ограде. Здесь пригодился бы Лёд.',
    doneText: 'Вода схватилась льдом — можно пройти.' },

  // ---- v0.22.0, квест 12 «Добровольцы»: тайная лаборатория к югу от дороги. Вход держит нестабильная печать — её успокаивает Лёд.
  { id: 'lab_seal', kind: 'ice', x: 2070, y: 4100, texture: 'city_lab_door', frozenTexture: 'city_lab_door_open', walkable: true, groundWhenFrozen: false, collide: { w: 100, h: 40 }, radius: 130,
    waitEvent: 'ch2_lab_found', doneEvent: 'ch2_lab_open', hint: 'Нестабильная печать',
    lockedText: 'Старая дверь в склоне холма, на ней дрожит чужая печать. Что за ней — пока неизвестно.',
    doneText: 'Лёд успокоил печать — магия замерла, и дверь подалась.' },
  { id: 'lab_herb_1', kind: 'gather', res: 'frost_herb', amount: 1, respawnSec: 240, x: 1900, y: 4230, texture: 'city_frost_herb', radius: 90, requiresEvent: 'ch2_lab_open' },
  { id: 'lab_herb_2', kind: 'gather', res: 'frost_herb', amount: 1, respawnSec: 240, x: 2270, y: 4300, texture: 'city_frost_herb', radius: 90, requiresEvent: 'ch2_lab_open' },
  { id: 'lab_chest', kind: 'chest', x: 1910, y: 4680, texture: 'chest_01', collide: { w: 50, h: 24 }, openTexture: 'chest_01_open', radius: 110, requiresEvent: 'ch2_lab_open',
    reward: { items: { rune_dust: 2, lunar_shard: 2, frost_herb: 2 } } },
  { id: 'lab_cauldron', kind: 'alchemy', x: 2260, y: 4690, texture: 'cauldron_01', collide: { w: 66, h: 26 }, radius: 120, requiresEvent: 'ch2_lab_open' },
  { id: 'npc_tikhon', kind: 'npc', npc: 'tikhon', x: 1990, y: 4580, texture: 'npc_tikhon', collide: { w: 30, h: 14 }, radius: 130, requiresEvent: 'ch2_vol_1' },
  { id: 'lab_journal', kind: 'seal_sigil', x: 2180, y: 4675, elevated: 50, texture: 'city_lab_journal', litTexture: 'city_lab_journal', litTint: 0xe8d6ff, radius: 110,
    requiresEnemyDefeated: 'lab_construct', doneEvent: 'ch2_lab_journal', hint: 'Лабораторный журнал',
    doneTitle: 'Журнал опытов', doneText: 'Астрал проявил стёртые страницы. «Испытуемый №4 — пришёл сам, хочет защищать семью». «Доза снижена по указанию С. В.». Подпись под отчётом — Северин Вейр. Он знал.', doneButton: 'К Иларии' },

  // ---- квест 15 «Город под инеем»: экзамен по четырём дарам на площади (даров — три из четырёх, слоты можно менять)
  { id: 'final_debris', kind: 'telekinesis', mode: 'push', weight: 'heavy', x: 2760, y: 3960, texture: 'city_debris', collide: { w: 70, h: 30 },
    target: { x: 2820, y: 3900 }, radius: 120, requiresEvent: 'ch2_final_start', doneEvent: 'ch2_fin_tk', hint: 'Завал у Дуэльного зала' },
  { id: 'final_ice_wall', kind: 'fire', x: 3100, y: 3700, texture: 'ice_wall_01', radius: 130, requiresEvent: 'ch2_final_start', destroyEvent: 'ch2_fin_fire',
    burnSec: 1.4, hint: 'Ледяная преграда', doneText: 'Преграда растаяла — улица к рынку свободна.' },
  // Existing id/event retained for saved games and server validation; the object is a damaged experimental device.
  { id: 'final_rift', kind: 'ice', x: 2520, y: 3880, texture: 'city_coolant', collide: { w: 80, h: 26 }, frozenTexture: 'city_coolant_stable', radius: 130, requiresEvent: 'ch2_final_start', doneEvent: 'ch2_fin_ice',
    hint: 'Повреждённый резервуар', lockedText: 'Из треснувшего резервуара вырывается магический холод. Лёд стабилизирует прибор.', doneText: 'Лёд стянул трещины — резервуар затих.' },
  { id: 'final_ward', kind: 'seal_sigil', x: 2640, y: 4130, texture: 'astral_ward_01', litTexture: 'astral_ward_01', collide: { w: 100, h: 30 }, opens: true, radius: 130,
    requiresEvent: 'ch2_final_start', doneEvent: 'ch2_fin_seal', hint: 'Астральный барьер',
    lockedText: 'Дуэльный зал закрыт.',
    doneTitle: 'Барьер снят', doneText: 'Астрал нашёл швы барьера — и завеса рассыпалась искрами. Изнутри тянет холодом и голосом Северина.', doneButton: 'Дальше' },
  { id: 'npc_nerys_final', kind: 'npc', npc: 'nerys', x: 2800, y: 4040, texture: 'npc_nerys', collide: { w: 30, h: 14 }, radius: 140, requiresEvent: 'ch2_final_start' },
  { id: 'final_letters', kind: 'seal_sigil', x: 2510, y: 4280, texture: 'city_letters', litTexture: 'city_letters', litTint: 0xe8d6ff, radius: 110,
    requiresEnemyDefeated: 'final_severin', doneEvent: 'ch2_letters_read', hint: 'Зашифрованные письма',
    doneTitle: 'Чужая рука', doneText: 'Под Астралом шифр поплыл. Деньги, материалы, старые схемы — всё это Северину передавал кто-то другой. Подписи нет. Только знак — тот самый стёртый узор с Древних ворот в лесу Мирры.', doneButton: 'К Иларии' },
  { id: 'npc_severin_after', kind: 'npc', npc: 'severin', x: 2780, y: 4380, texture: 'npc_severin', collide: { w: 32, h: 14 }, radius: 130, requiresEvent: 'ch2_severin_defeated' },
  // ---- квест 14 «Не в одиночку»: Дом Ковенов
  { id: 'npc_rowena', kind: 'npc', npc: 'rowena', x: 3240, y: 4300, texture: 'npc_rowena', collide: { w: 50, h: 24 }, radius: 140 },
];

/** Враги главы II, часть 1. */
export const CITY_ENEMIES = [
  // морозная вспышка на площади (квест 2): появляется, когда герой пришёл в город
  { id: 'plaza_critter', enemy: 'frost_critter', x: 2780, y: 3800, radius: 130, requiresEvent: 'ch2_city_arrived', defeatEvent: 'ch2_plaza_cleared' },
  // знакомый противник на дороге (квест 1, необязательный)
  { id: 'road_scavenger', enemy: 'young_scavenger', x: 2120, y: 3640, radius: 110, requiresEvent: 'ch2_start' },
  // v0.21.0 — квест 6: Складской квартал
  { id: 'wh_collector_1', enemy: 'frost_collector', x: 2560, y: 4800, radius: 120, requiresEvent: 'ch2_cargo_start', repeatSec: 600 },
  { id: 'wh_collector_2', enemy: 'frost_collector', x: 3240, y: 4720, radius: 120, requiresEvent: 'ch2_cargo_start', repeatSec: 600 },
  { id: 'wh_elite', enemy: 'frost_collector_elite', x: 2930, y: 4880, radius: 130, requiresEvent: 'ch2_cargo_start', defeatEvent: 'ch2_wh_boss' },
  // квест 7: зверь, сбежавший из закрытой лаборатории, — у дверей Общества
  { id: 'lab_critter', enemy: 'frost_critter', x: 3210, y: 3240, radius: 120, requiresEvent: 'ch2_severin_asked', defeatEvent: 'ch2_lab_critter' },
  // квест 8: Замёрзший квартал (появляются после знакомства с Нэрис)
  { id: 'fq_critter', enemy: 'frost_critter', x: 2560, y: 2400, radius: 120, requiresEvent: 'ch2_nerys_met', repeatSec: 480 },
  { id: 'fq_collector', enemy: 'frost_collector', x: 3300, y: 2300, radius: 120, requiresEvent: 'ch2_nerys_met' },
  // квест 9: тренировочный двор за проломом
  { id: 'fq_training', enemy: 'frost_critter', x: 2910, y: 1830, radius: 110, requiresEvent: 'unlock_ice_1', defeatEvent: 'ch2_training_done' },
  // квест 10 «Выбор»: глубина квартала
  { id: 'fq_deep_1', enemy: 'frost_collector', x: 2600, y: 1740, radius: 120, requiresEvent: 'ch2_choice_start', defeatEvent: 'ch2_deep_1', repeatSec: 600 },
  { id: 'fq_deep_2', enemy: 'frost_collector', x: 3240, y: 1740, radius: 120, requiresEvent: 'ch2_choice_start', defeatEvent: 'ch2_deep_2', repeatSec: 600 },
  { id: 'fq_guardian', enemy: 'ice_guardian', x: 2910, y: 1690, radius: 140, requiresEvent: 'ch2_choice_start', defeatEvent: 'ch2_ice_guardian_defeated', repeatSec: 1200 },
  // v0.22.0 — квест 11 «Хрупкость»: учебные бои во дворе
  { id: 'yard_brittle_1', enemy: 'frost_collector', x: 2480, y: 1880, radius: 110, requiresEvent: 'unlock_ice_2', defeatEvent: 'ch2_brittle_1' },
  { id: 'yard_brittle_2', enemy: 'frost_collector', x: 3400, y: 1880, radius: 110, requiresEvent: 'unlock_ice_2', defeatEvent: 'ch2_brittle_2' },
  // квест 12: добровольцы и конструкт в лаборатории
  { id: 'vol_1', enemy: 'volunteer', x: 1970, y: 4320, radius: 110, requiresEvent: 'ch2_lab_open', defeatEvent: 'ch2_vol_1' },
  { id: 'vol_2', enemy: 'volunteer', texture: 'enemy_volunteer_miron', x: 2150, y: 4400, radius: 110, requiresEvent: 'ch2_lab_open', defeatEvent: 'ch2_vol_2' },
  { id: 'lab_construct', enemy: 'experimental_construct', x: 2080, y: 4600, radius: 120, requiresEvent: 'ch2_lab_open', defeatEvent: 'ch2_lab_construct', repeatSec: 900 },
  // квест 14: нестабильные конструкции в городе
  { id: 'unstable_1', enemy: 'frost_collector', x: 3000, y: 3980, radius: 110, requiresEvent: 'ch2_coven_met', defeatEvent: 'ch2_unstable_1' },
  { id: 'unstable_2', enemy: 'frost_collector', x: 2720, y: 4660, radius: 110, requiresEvent: 'ch2_coven_met', defeatEvent: 'ch2_unstable_2' },
  // квест 15: город во льду и Северин в Дуэльном зале
  { id: 'final_critter', enemy: 'frost_critter', x: 2900, y: 3420, radius: 110, requiresEvent: 'ch2_final_start' },
  { id: 'final_collector', enemy: 'frost_collector', x: 3010, y: 3620, radius: 110, requiresEvent: 'ch2_final_start' },
  { id: 'final_construct', enemy: 'experimental_construct', x: 2480, y: 3560, radius: 120, requiresEvent: 'ch2_final_start' },
  { id: 'final_severin', enemy: 'severin_boss', x: 2640, y: 4320, radius: 130, requiresEvent: 'ch2_ice3', defeatEvent: 'ch2_severin_defeated' },
];

/** Украшения города и дороги: деревья вдоль опушки, фонари, доска объявлений, пятна инея. */
export const CITY_DECOR = [
  ...[3330, 3420, 3510, 3990, 4080, 4170].map((y, i) => ({ id: `ct_tree_${i}`, k: i % 2 ? 'tree_dark_02' : 'tree_dark_01', x: i === 4 ? 2250 : 1840 + (i % 3) * 170, y: y < 3600 ? 3300 : 4030 })),   // v0.22.0: проход к лаборатории свободен
  ...[1900, 2050, 2200, 2330].map((x, i) => ({ id: `ct_treeN_${i}`, k: 'tree_dark_01', x, y: 3290 })),
  ...[1880, 1960, 2200, 2330].map((x, i) => ({ id: `ct_treeS_${i}`, k: 'tree_dark_02', x, y: 4060 })),
  ...[[2440, 3530], [2440, 3800], [3040, 3240], [3040, 4000], [2900, 4300], [2900, 2470]].map(([x, y], i) => ({ id: `ct_lamp_${i}`, k: 'city_lamp_01', x, y })),
  { id: 'ct_frost_1', k: 'frost_patch_01', x: 2760, y: 3700, floor: true },
  { id: 'ct_frost_2', k: 'frost_patch_01', x: 2980, y: 3860, floor: true },
  { id: 'ct_frost_3', k: 'frost_patch_01', x: 2620, y: 3560, floor: true },
  { id: 'bank_lamp_w', k: 'city_lamp_01', x: 3170, y: 4030 },
  { id: 'bank_lamp_e', k: 'city_lamp_01', x: 3470, y: 4030 },
  // v0.21.0: Замёрзший квартал — иней на мостовой и фонари
  ...[[2560, 2300], [3180, 2420], [2680, 2080], [3360, 2060], [2560, 1660], [3240, 1640], [2700, 1880], [3420, 1860]].map(([x, y], i) => ({ id: `fq_frost_${i}`, k: 'frost_patch_01', x, y, floor: true })),
  ...[[2440, 2470], [3520, 2470], [2440, 1940], [3520, 1940], [2440, 1540], [3520, 1540]].map(([x, y], i) => ({ id: `fq_lamp_${i}`, k: 'city_lamp_01', x, y })),
];

/** v0.20.0: событие «впервые пришёл в зону» (ExplorationScene.updateZone → quests.complete; сервер проверяет условия EVENT_ACTIONS). */
export const ZONE_EVENTS = {
  P: { event: 'ch2_city_arrived', requires: ['ch2_start'] },
};

/** v0.23.0: возобновляемые места города (repeatSec) — охота для доски поручений и повторный фарм кристаллов (chapter-2-balance §30). */

/** v0.21.0: проходы города для проверки проходимости (закрыты, пока их не открыл сюжет) и места за ними. */
export const CITY_GATE_IDS = ['frost_barrier', 'fq_water', 'lab_seal', 'final_ward'];
export const CITY_BEHIND_GATES = ['npc_nerys', 'ice_construct', 'fq_door', 'fq_training', 'fq_guardian', 'lab_journal', 'vol_1', 'lab_construct', 'final_severin', 'final_letters'];
