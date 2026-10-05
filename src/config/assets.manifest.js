// Манифест ассетов. Ключи совпадают с Asset List из First Location Blueprint v0.1 §8–§13.
//
// Как подключать финальную графику постепенно:
//   1. положите PNG с прозрачным фоном в public/assets/...
//   2. укажите путь напротив ключа ниже;
//   3. если файл не указан (null) — PreloadScene сгенерирует graybox-заглушку с тем же ключом.
// Pivot всех объектов мира — нижний центр (origin 0.5, 1). Размер на экране задаётся DISPLAY_SIZE,
// поэтому исходники можно делать крупнее (например 512×512).

export const ASSET_FILES = {
  // Одобренный рисованный UI: тонкие медальоны без общей нижней рамки и меню.
  ui_craft_medallion: 'assets/ui/craft-medallion-rounded.webp',
  ui_craft_menu: 'assets/ui/craft-menu.webp', ui_craft_portrait: 'assets/ui/craft-portrait.webp',
  // герой (Hero & Sprite Spec v0.1 §18 — минимальный набор)
  hero_down: 'assets/sprites/hero_down.png', hero_up: 'assets/sprites/hero_up.png', hero_side: 'assets/sprites/hero_side.png', hero_shadow: null,
  // Колдун: финальные акварельные ракурсы, тот же холст 166×240 и масштаб, что у ведьмы.
  warlock_down: 'assets/sprites/warlock_down.png', warlock_up: 'assets/sprites/warlock_up.png', warlock_side: 'assets/sprites/warlock_side.png',
  // деревья
  tree_autumn_01: 'assets/sprites/tree_autumn_01.png', tree_autumn_02: 'assets/sprites/tree_autumn_02.png', tree_dark_01: 'assets/sprites/tree_dark_01.png', tree_dark_02: 'assets/sprites/tree_dark_02.png', dead_tree_01: 'assets/sprites/dead_tree_01.png', birch_01: 'assets/sprites/birch_01.png',
  // камни
  rock_small_01: 'assets/sprites/rock_small_01.png', rock_medium_01: 'assets/sprites/rock_medium_01.png', heavy_boulder_01: 'assets/sprites/heavy_boulder_01.png',
  // растения
  bush_01: 'assets/sprites/bush_01.png', bush_02: 'assets/sprites/bush_02.png', flower_white_01: 'assets/sprites/flower_white_01.png', flower_purple_01: 'assets/sprites/flower_purple_01.png',
  mushroom_red_01: 'assets/sprites/mushroom_red_01.png', mushroom_blue_01: 'assets/sprites/mushroom_blue_01.png', reeds_01: 'assets/sprites/reeds_01.png', moon_plant_01: 'assets/sprites/moon_plant_01.png?v=art-20261003', dry_bush_01: 'assets/sprites/dry_bush_01.png',
  // props
  lantern_01: 'assets/sprites/lantern_01.png', lantern_02: 'assets/sprites/lantern_02.png', signpost_01: 'assets/sprites/signpost_01.png', wooden_bridge_01: 'assets/sprites/wooden_bridge_01.png', chest_01: 'assets/sprites/chest_01.png?v=art-actions-20261003', chest_01_open: 'assets/sprites/chest_01_open.png?v=art-actions-20261003',
  candle_group_01: 'assets/sprites/candle_group_01.png', torch_01: 'assets/sprites/torch_01.png', claw_marks_01: 'assets/sprites/claw_marks_01.png',
  // ключевые объекты
  magic_book_01: 'assets/sprites/magic_book_01.png?v=art-20261003', lunar_altar_01: 'assets/sprites/lunar_altar_01.png', lunar_flame_01: 'assets/sprites/lunar_flame_01.png?v=art-20261003', fire_circle_01: 'assets/sprites/fire_circle_01.png',
  corrupted_roots_01: 'assets/sprites/corrupted_roots_01.png', ancient_gate_01: 'assets/sprites/ancient_gate_01.png',
  // ground tiles
  grass_ground_01: 'assets/sprites/grass_ground_01.png', dirt_path_01: 'assets/sprites/dirt_path_01.png', stone_path_01: 'assets/sprites/stone_path_01.png', swamp_water_01: 'assets/sprites/swamp_water_01.png', wooden_floor_01: 'assets/sprites/wooden_floor_01.png', wall_wood_01: 'assets/sprites/wall_wood_01.png', wall_ruin_01: 'assets/sprites/wall_ruin_01.png',
  // враги
  enemy_scavenger: 'assets/sprites/enemy_scavenger.png', enemy_scavenger_small: 'assets/sprites/enemy_scavenger_small.png', enemy_guardian: 'assets/sprites/enemy_guardian.png', enemy_rootling: 'assets/sprites/enemy_rootling.png',
  // объекты боевого поля
  field_rock_light: 'assets/sprites/field_rock_light.png', field_rock_heavy: 'assets/sprites/field_rock_heavy.png', field_crystal: 'assets/sprites/field_crystal.png',
  // UI-иконки
  icon_telekinesis: 'assets/sprites/icon_telekinesis.png', icon_fire: 'assets/sprites/icon_fire.png', icon_seal: 'assets/sprites/icon_seal.png', icon_ice: 'assets/sprites/icon_ice.png', icon_sapphire: 'assets/sprites/icon_sapphire.png', icon_bag: 'assets/ui/craft-bag.webp', icon_hand: 'assets/sprites/icon_hand.png',
  icon_coin: 'assets/sprites/icon_coin.png', icon_shard: 'assets/sprites/icon_shard.png?v=art-20261003', icon_ember: 'assets/sprites/icon_ember.png', icon_core: 'assets/sprites/icon_core.png', icon_lock: 'assets/sprites/icon_lock.png',
  // v0.8: NPC, интерьер, ресурсы, иконки
  npc_mirra: 'assets/sprites/npc_mirra.png?v=art-20261003', npc_veda: 'assets/sprites/npc_veda.png?v=art-20261003', npc_goran: 'assets/sprites/npc_goran.png?v=art-20261003', npc_selena: 'assets/sprites/npc_selena.png?v=art-20261003', bed_01: 'assets/sprites/bed_01.png?v=art-20261003', table_01: 'assets/sprites/table_01.png?v=art-20261003', bookshelf_01: 'assets/sprites/bookshelf_01.png?v=art-20261003', cauldron_01: 'assets/sprites/cauldron_01.png?v=art-20261003', wardrobe_01: 'assets/sprites/wardrobe_01.png?v=art-20261003', rug_01: 'assets/sprites/rug_01.png?v=art-20261003', herb_bundle_01: 'assets/sprites/herb_bundle_01.png?v=art-20261003', plant_pot_01: 'assets/sprites/plant_pot_01.png?v=art-20261003', cat_01: 'assets/sprites/cat_01.png?v=art-20261003', trunk_01: 'assets/sprites/trunk_01.png?v=art-20261003', moon_herb_01: 'assets/sprites/moon_herb_01.png?v=art-20261003', mushrooms_brown_01: 'assets/sprites/mushrooms_brown_01.png?v=art-20261003', resin_log_01: 'assets/sprites/resin_log_01.png?v=art-20261003', rune_sigil_01: 'assets/sprites/rune_sigil_01.png?v=art-20261003', rune_slab_01: 'assets/sprites/rune_slab_01.png?v=art-20261003', bramble_01: 'assets/sprites/bramble_01.png?v=art-20261003', campfire_01: 'assets/sprites/campfire_01.png?v=art-20261003',
  portrait_mirra: 'assets/sprites/portrait_mirra.png?v=art-20261003', portrait_veda: 'assets/sprites/portrait_veda.png?v=art-20261003', portrait_goran: 'assets/sprites/portrait_goran.png?v=art-20261003', portrait_selena: 'assets/sprites/portrait_selena.png?v=art-20261003', icon_mushroom: 'assets/sprites/icon_mushroom.png?v=art-20261003', icon_resin: 'assets/sprites/icon_resin.png?v=art-20261003', icon_dust: 'assets/sprites/icon_dust.png?v=art-20261003', icon_potion_life: 'assets/sprites/icon_potion_life.png?v=art-20261003', icon_potion_mana: 'assets/sprites/icon_potion_mana.png?v=art-20261003', icon_potion_fire: 'assets/sprites/icon_potion_fire.png?v=art-20261003', icon_talk: 'assets/sprites/icon_talk.png?v=medallions-20261003', icon_gather: 'assets/sprites/icon_gather.png?v=medallions-20261003', icon_alchemy: 'assets/sprites/icon_alchemy.png?v=medallions-20261003', icon_inspect: 'assets/sprites/icon_inspect.png?v=medallions-20261003', icon_journal: 'assets/ui/craft-journal.webp',
  icon_fight: 'assets/sprites/icon_fight.png', // v0.9: «Сразиться снова»
  icon_moon_herb: 'assets/sprites/icon_moon_herb.png?v=art-20261003',
  // v0.8.2: меню и HUD
  icon_menu: 'assets/sprites/icon_menu.png', icon_close: 'assets/sprites/icon_close.png', icon_city: 'assets/sprites/icon_city.png', icon_bank: 'assets/sprites/icon_bank.png', icon_rating: 'assets/sprites/icon_rating.png', icon_chat: 'assets/sprites/icon_chat.png', icon_forum: 'assets/sprites/icon_forum.png', icon_settings: 'assets/sprites/icon_settings.png', icon_heart: 'assets/sprites/icon_heart.png', icon_drop: 'assets/sprites/icon_drop.png',
  // v0.10.0: сюжетные предметы первой главы (tools/art/v10_icons.py)
  icon_wick: 'assets/sprites/icon_wick.png', icon_compound: 'assets/sprites/icon_compound.png', icon_bundle: 'assets/sprites/icon_bundle.png',
  // v0.10.0: объекты мира первой главы (tools/art/v10_world.py)
  forest_node_broken: 'assets/sprites/forest_node_broken.png', forest_node_restored: 'assets/sprites/forest_node_restored.png',
  seal_sigil_dim: 'assets/sprites/seal_sigil_dim.png', seal_sigil_lit: 'assets/sprites/seal_sigil_lit.png',
  dust_stash_01: 'assets/sprites/dust_stash_01.png', dust_stash_empty: 'assets/sprites/dust_stash_empty.png',
  // FX
  fx_dot: null, fx_glow: null, fx_ring: null,
};

// Размер объекта в мире (px при viewport 720×1280). Не зависит от разрешения исходника.
export const DISPLAY_SIZE = {
  hero_down: [64, 128], hero_up: [64, 128], hero_side: [64, 128],
  warlock_down: [64, 128], warlock_up: [64, 128], warlock_side: [64, 128],
  icon_wick: [64, 64], icon_compound: [64, 64], icon_bundle: [64, 64],
  forest_node_broken: [300, 209], forest_node_restored: [300, 209], seal_sigil_dim: [108, 60], seal_sigil_lit: [108, 60],
  dust_stash_01: [96, 70], dust_stash_empty: [96, 70],
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
  chest_01: [60, 48], chest_01_open: [60, 64],
  // v0.8
  npc_mirra: [84, 126], npc_veda: [80, 120], npc_goran: [90, 132], npc_selena: [80, 128], bed_01: [112, 120], table_01: [112, 86], bookshelf_01: [150, 128], cauldron_01: [88, 100], wardrobe_01: [84, 136], rug_01: [250, 150], herb_bundle_01: [34, 62], plant_pot_01: [48, 72], cat_01: [76, 54], trunk_01: [84, 58], moon_herb_01: [56, 50], mushrooms_brown_01: [60, 46], resin_log_01: [84, 66], rune_sigil_01: [90, 50], rune_slab_01: [96, 56], bramble_01: [96, 80], campfire_01: [64, 56], portrait_mirra: [128, 128], portrait_veda: [128, 128], portrait_goran: [128, 128], portrait_selena: [128, 128], icon_moon_herb: [64, 64], icon_mushroom: [64, 64], icon_resin: [64, 64], icon_dust: [64, 64], icon_potion_life: [64, 64], icon_potion_mana: [64, 64], icon_potion_fire: [64, 64], icon_talk: [64, 64], icon_gather: [64, 64], icon_alchemy: [64, 64], icon_inspect: [64, 64], icon_journal: [64, 64],

};

/** Рисунки-заглушки, не готовые к релизу. Оба героя используют финальные PNG. */
export const TEMPORARY_ART = [];
