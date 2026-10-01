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
  hero_down: null, hero_up: null, hero_side: null, hero_shadow: null,
  // деревья
  tree_autumn_01: null, tree_autumn_02: null, tree_dark_01: null, tree_dark_02: null, dead_tree_01: null, birch_01: null,
  // камни
  rock_small_01: null, rock_medium_01: null, heavy_boulder_01: null,
  // растения
  bush_01: null, bush_02: null, flower_white_01: null, flower_purple_01: null,
  mushroom_red_01: null, mushroom_blue_01: null, reeds_01: null, moon_plant_01: null, dry_bush_01: null,
  // props
  lantern_01: null, lantern_02: null, signpost_01: null, wooden_bridge_01: null, chest_01: null, chest_01_open: null,
  candle_group_01: null, torch_01: null, claw_marks_01: null,
  // ключевые объекты
  magic_book_01: null, lunar_altar_01: null, lunar_flame_01: null, fire_circle_01: null,
  corrupted_roots_01: null, ancient_gate_01: null,
  // ground tiles
  grass_ground_01: null, dirt_path_01: null, stone_path_01: null, swamp_water_01: null, wooden_floor_01: null, wall_wood_01: null,
  // враги
  enemy_scavenger: null, enemy_scavenger_small: null, enemy_guardian: null, enemy_rootling: null,
  // объекты боевого поля
  field_rock_light: null, field_rock_heavy: null, field_crystal: null,
  // UI-иконки
  icon_telekinesis: null, icon_fire: null, icon_seal: null, icon_bag: null, icon_hand: null,
  icon_coin: null, icon_shard: null, icon_ember: null, icon_core: null, icon_lock: null,
  // FX
  fx_dot: null, fx_glow: null, fx_ring: null,
};

// Размер объекта в мире (px при viewport 720×1280). Не зависит от разрешения исходника.
export const DISPLAY_SIZE = {
  hero_down: [64, 128], hero_up: [64, 128], hero_side: [64, 128],
  tree_autumn_01: [150, 210], tree_autumn_02: [140, 200], tree_dark_01: [150, 220], tree_dark_02: [140, 210],
  dead_tree_01: [110, 170], birch_01: [90, 220],
  heavy_boulder_01: [210, 150], rock_medium_01: [100, 72],
  ancient_gate_01: [300, 300], lunar_altar_01: [160, 110],
  enemy_guardian: [180, 200], enemy_scavenger: [120, 110],
};
