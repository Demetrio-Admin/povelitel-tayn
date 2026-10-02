// Манифест ассетов. Ключи совпадают с Asset List из First Location Blueprint v0.1 §8–§13.
//
// Как подключать финальную графику постепенно:
//   1. положите PNG с прозрачным фоном в public/assets/...
//   2. укажите путь напротив ключа ниже;
//   3. если файл не указан (null) — PreloadScene сгенерирует graybox-заглушку с тем же ключом.
// Pivot всех объектов мира — нижний центр (origin 0.5, 1). Размер на экране задаётся DISPLAY_SIZE,
// поэтому исходники можно делать крупнее (например 512×512).

export const ASSET_FILES = {
  // герой (Hero & Sprite Spec v0.1 §18 — минимальный набор)
  hero_down: 'assets/sprites/hero_down.png', hero_up: 'assets/sprites/hero_up.png', hero_side: 'assets/sprites/hero_side.png', hero_shadow: null,
  // деревья
  tree_autumn_01: 'assets/sprites/tree_autumn_01.png', tree_autumn_02: 'assets/sprites/tree_autumn_02.png', tree_dark_01: 'assets/sprites/tree_dark_01.png', tree_dark_02: 'assets/sprites/tree_dark_02.png', dead_tree_01: 'assets/sprites/dead_tree_01.png', birch_01: 'assets/sprites/birch_01.png',
  // камни
  rock_small_01: 'assets/sprites/rock_small_01.png', rock_medium_01: 'assets/sprites/rock_medium_01.png', heavy_boulder_01: 'assets/sprites/heavy_boulder_01.png',
  // растения
  bush_01: 'assets/sprites/bush_01.png', bush_02: 'assets/sprites/bush_02.png', flower_white_01: 'assets/sprites/flower_white_01.png', flower_purple_01: 'assets/sprites/flower_purple_01.png',
  mushroom_red_01: 'assets/sprites/mushroom_red_01.png', mushroom_blue_01: 'assets/sprites/mushroom_blue_01.png', reeds_01: 'assets/sprites/reeds_01.png', moon_plant_01: 'assets/sprites/moon_plant_01.png', dry_bush_01: 'assets/sprites/dry_bush_01.png',
  // props
  lantern_01: 'assets/sprites/lantern_01.png', lantern_02: 'assets/sprites/lantern_02.png', signpost_01: 'assets/sprites/signpost_01.png', wooden_bridge_01: 'assets/sprites/wooden_bridge_01.png', chest_01: 'assets/sprites/chest_01.png', chest_01_open: 'assets/sprites/chest_01_open.png',
  candle_group_01: 'assets/sprites/candle_group_01.png', torch_01: 'assets/sprites/torch_01.png', claw_marks_01: 'assets/sprites/claw_marks_01.png',
  // ключевые объекты
  magic_book_01: 'assets/sprites/magic_book_01.png', lunar_altar_01: 'assets/sprites/lunar_altar_01.png', lunar_flame_01: 'assets/sprites/lunar_flame_01.png', fire_circle_01: 'assets/sprites/fire_circle_01.png',
  corrupted_roots_01: 'assets/sprites/corrupted_roots_01.png', ancient_gate_01: 'assets/sprites/ancient_gate_01.png',
  // ground tiles
  grass_ground_01: 'assets/sprites/grass_ground_01.png', dirt_path_01: 'assets/sprites/dirt_path_01.png', stone_path_01: 'assets/sprites/stone_path_01.png', swamp_water_01: 'assets/sprites/swamp_water_01.png', wooden_floor_01: 'assets/sprites/wooden_floor_01.png', wall_wood_01: 'assets/sprites/wall_wood_01.png', wall_ruin_01: 'assets/sprites/wall_ruin_01.png',
  // враги
  enemy_scavenger: 'assets/sprites/enemy_scavenger.png', enemy_scavenger_small: 'assets/sprites/enemy_scavenger_small.png', enemy_guardian: 'assets/sprites/enemy_guardian.png', enemy_rootling: 'assets/sprites/enemy_rootling.png',
  // объекты боевого поля
  field_rock_light: 'assets/sprites/field_rock_light.png', field_rock_heavy: 'assets/sprites/field_rock_heavy.png', field_crystal: 'assets/sprites/field_crystal.png',
  // UI-иконки
  icon_telekinesis: 'assets/sprites/icon_telekinesis.png', icon_fire: 'assets/sprites/icon_fire.png', icon_seal: 'assets/sprites/icon_seal.png', icon_bag: 'assets/sprites/icon_bag.png', icon_hand: 'assets/sprites/icon_hand.png',
  icon_coin: 'assets/sprites/icon_coin.png', icon_shard: 'assets/sprites/icon_shard.png', icon_ember: 'assets/sprites/icon_ember.png', icon_core: 'assets/sprites/icon_core.png', icon_lock: 'assets/sprites/icon_lock.png',
  // FX
  fx_dot: null, fx_glow: null, fx_ring: null,
};

// Размер объекта в мире (px при viewport 720×1280). Не зависит от разрешения исходника.
export const DISPLAY_SIZE = {
  hero_down: [64, 128], hero_up: [64, 128], hero_side: [64, 128],
  tree_autumn_01: [150, 210], tree_autumn_02: [140, 200], tree_dark_01: [150, 220], tree_dark_02: [140, 210],
  dead_tree_01: [110, 170], birch_01: [90, 220],
  heavy_boulder_01: [210, 150], rock_medium_01: [100, 77],
  ancient_gate_01: [300, 300], lunar_altar_01: [160, 110],
  enemy_guardian: [160, 210], enemy_scavenger: [116, 140],
  // партия 2 (текстуры x2, размер на экране — по пропорциям арта)
  bush_01: [80, 68], bush_02: [80, 68], dry_bush_01: [84, 70], flower_white_01: [48, 46], flower_purple_01: [48, 46], mushroom_red_01: [52, 39], mushroom_blue_01: [46, 43],
  reeds_01: [64, 70], moon_plant_01: [60, 53], rock_small_01: [56, 47], lantern_01: [25, 90], lantern_02: [50, 100], signpost_01: [53, 90], torch_01: [36, 90],
  candle_group_01: [27, 44], claw_marks_01: [62, 72], wooden_bridge_01: [180, 145], fire_circle_01: [240, 167], enemy_scavenger_small: [101, 104], enemy_rootling: [71, 96],
  field_rock_light: [76, 66], field_rock_heavy: [116, 93], field_crystal: [88, 110],
  // партия 3
  lunar_flame_01: [36, 48],

};
