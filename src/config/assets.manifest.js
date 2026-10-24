// Манифест ассетов. Ключи совпадают с Asset List из First Location Blueprint v0.1 §8–§13.
//
// Как подключать финальную графику постепенно:
//   1. положите PNG с прозрачным фоном в public/assets/...
//   2. укажите путь напротив ключа ниже;
//   3. если файл не указан (null) — PreloadScene сгенерирует graybox-заглушку с тем же ключом.
// Pivot всех объектов мира — нижний центр (origin 0.5, 1). Размер на экране задаётся DISPLAY_SIZE,
// поэтому исходники можно делать крупнее (например 512×512).

import { WORLD_MAP, WORLD_MAP_FILES } from './worldMap.js';
import { ROOM_FILES } from './city.rooms.js';
import { CHAPTER2_FILES, CHAPTER2_SIZES } from './chapter2.art.generated.js';
import { CITY_INTERIOR_FILES, CITY_INTERIOR_SIZES } from './city.interiors.generated.js';
import { CITY_FINAL_FILES, CITY_FINAL_SIZES } from './city.final.art.js';
import { CITY_WALK_FILES, CITY_WALK_SIZES } from './city.walk.art.js';
import { ARCHIVE_FILES, ARCHIVE_SIZES } from './city.archive.art.js';
import { NEIGHBORHOOD_FILES, NEIGHBORHOOD_SIZES } from './city.neighborhoods.art.js';
import { CHAPTER3_FILES, CHAPTER3_SIZES } from './chapter3.art.generated.js';
import { MONSTER_REDESIGN_FILES, MONSTER_REDESIGN_DIMENSIONS, MONSTER_WORLD_HEIGHTS } from './monster-redesign.art.js';
import { CITY_LIFE_FILES, CITY_LIFE_SIZES } from './cityLife.art.generated.js';
import { CITY_LIFE_PAINTED_FILES, CITY_LIFE_DIRECTION_FILES, CITY_LIFE_DIRECTION_SIZES } from './cityLife.painted.js';

export const ASSET_FILES = {
  frostwood_painted: 'assets/frostwood/frozen-sanctuary-v1.webp',
  graveyard_painted: 'assets/graveyard/spirit-cemetery-v1.webp',
  ...ROOM_FILES,
  icon_storm: 'assets/ui/storm.svg',
  welcome_cover: 'assets/ui/welcome-cover-lunar-v2.webp',
  welcome_settings: 'assets/ui/welcome-settings.svg',
  // Одобренный рисованный UI: тонкие медальоны без общей нижней рамки и меню.
  ui_craft_medallion: 'assets/ui/craft-medallion-rounded.webp',
  ui_craft_menu: 'assets/ui/craft-menu.webp', ui_craft_portrait: 'assets/ui/craft-portrait.webp',
  // герой (Hero & Sprite Spec v0.1 §18 — минимальный набор)
  hero_down: 'assets/heroes/lunar-v1/hero_down.webp', hero_up: 'assets/heroes/lunar-v1/hero_up.webp', hero_side: 'assets/heroes/lunar-v1/hero_side.webp', hero_shadow: null,
  // Колдун: финальные акварельные ракурсы, тот же холст 166×240 и масштаб, что у ведьмы.
  warlock_down: 'assets/heroes/lunar-v1/warlock_down.webp', warlock_up: 'assets/heroes/lunar-v1/warlock_up.webp', warlock_side: 'assets/heroes/lunar-v1/warlock_side.webp',
  // v0.28.0: живой мир (птицы, белка, заяц, лист)
  life_bird_1: 'assets/forest/life-bird-1.webp?v=forest-art-20261006', life_bird_2: 'assets/forest/life-bird-2.webp?v=forest-art-20261006', life_bird_3: 'assets/forest/life-bird-3.webp?v=forest-art-20261006',
  life_squirrel_1: 'assets/forest/life-squirrel-1.webp?v=forest-art-20261006', life_squirrel_2: 'assets/forest/life-squirrel-2.webp?v=forest-art-20261006', life_squirrel_3: 'assets/forest/life-squirrel-3.webp?v=forest-art-20261006',
  life_rabbit_1: 'assets/forest/life-rabbit-1.webp?v=forest-art-20261006', life_rabbit_2: 'assets/forest/life-rabbit-2.webp?v=forest-art-20261006', life_rabbit_3: 'assets/forest/life-rabbit-3.webp?v=forest-art-20261006', life_leaf: 'assets/sprites/life_leaf.webp?v=life-2',
  // деревья
  tree_autumn_01: 'assets/sprites/tree_autumn_01.webp', tree_autumn_02: 'assets/sprites/tree_autumn_02.webp', tree_dark_01: 'assets/sprites/tree_dark_01.webp', tree_dark_02: 'assets/sprites/tree_dark_02.webp', dead_tree_01: 'assets/sprites/dead_tree_01.webp', birch_01: 'assets/sprites/birch_01.webp',
  // камни
  rock_small_01: 'assets/sprites/rock_small_01.webp', rock_medium_01: 'assets/sprites/rock_medium_01.webp', heavy_boulder_01: 'assets/sprites/heavy_boulder_01.webp',
  // растения
  bush_01: 'assets/sprites/bush_01.webp', bush_02: 'assets/sprites/bush_02.webp', flower_white_01: 'assets/sprites/flower_white_01.webp', flower_purple_01: 'assets/sprites/flower_purple_01.webp',
  mushroom_red_01: 'assets/sprites/mushroom_red_01.webp', mushroom_blue_01: 'assets/sprites/mushroom_blue_01.webp', reeds_01: 'assets/sprites/reeds_01.webp', moon_plant_01: 'assets/sprites/moon_plant_01.webp?v=art-20261003', dry_bush_01: 'assets/sprites/dry_bush_01.webp',
  // props
  lantern_01: 'assets/sprites/lantern_01.webp', lantern_02: 'assets/sprites/lantern_02.webp', signpost_01: 'assets/sprites/signpost_01.webp', wooden_bridge_01: 'assets/sprites/wooden_bridge_01.webp', chest_01: 'assets/sprites/chest_01.webp?v=art-actions-20261003', chest_01_open: 'assets/sprites/chest_01_open.webp?v=art-actions-20261003',
  candle_group_01: 'assets/sprites/candle_group_01.webp', torch_01: 'assets/sprites/torch_01.webp', claw_marks_01: 'assets/sprites/claw_marks_01.webp',
  // ключевые объекты
  magic_book_01: 'assets/sprites/magic_book_01.webp?v=art-20261003', lunar_altar_01: 'assets/sprites/lunar_altar_01.webp', lunar_flame_01: 'assets/sprites/lunar_flame_01.webp?v=art-20261003', fire_circle_01: 'assets/sprites/fire_circle_01.webp',
  corrupted_roots_01: 'assets/sprites/corrupted_roots_01.webp', ancient_gate_01: 'assets/sprites/ancient_gate_01.webp',
  // ground tiles
  grass_ground_01: 'assets/sprites/grass_ground_01.webp', dirt_path_01: 'assets/sprites/dirt_path_01.webp', stone_path_01: 'assets/sprites/stone_path_01.webp', swamp_water_01: 'assets/sprites/swamp_water_01.webp', wooden_floor_01: 'assets/sprites/wooden_floor_01.webp', wall_wood_01: 'assets/sprites/wall_wood_01.webp', wall_ruin_01: 'assets/sprites/wall_ruin_01.webp',
  // враги
  enemy_scavenger: 'assets/sprites/enemy_scavenger.webp', enemy_scavenger_small: 'assets/sprites/enemy_scavenger_small.webp', enemy_guardian: 'assets/sprites/enemy_guardian.webp', enemy_rootling: 'assets/sprites/enemy_rootling.webp',
  // объекты боевого поля
  field_rock_light: 'assets/sprites/field_rock_light.webp', field_rock_heavy: 'assets/sprites/field_rock_heavy.webp', field_crystal: 'assets/sprites/field_crystal.webp',
  // UI-иконки
  icon_telekinesis: 'assets/sprites/icon_telekinesis.webp', icon_fire: 'assets/sprites/icon_fire.webp', icon_seal: 'assets/sprites/icon_seal.webp', icon_ice: 'assets/sprites/icon_ice.webp', npc_ilaria: 'assets/sprites/npc_ilaria.webp', npc_severin: 'assets/sprites/npc_severin.webp', npc_merchant: 'assets/sprites/npc_merchant.webp', npc_banker: 'assets/sprites/npc_banker.webp', npc_duelist: 'assets/sprites/npc_duelist.webp', portrait_ilaria: 'assets/sprites/portrait_ilaria.webp', portrait_severin: 'assets/sprites/portrait_severin.webp', portrait_merchant: 'assets/sprites/portrait_merchant.webp', portrait_banker: 'assets/sprites/portrait_banker.webp', portrait_duelist: 'assets/sprites/portrait_duelist.webp', enemy_frost_critter: 'assets/sprites/enemy_frost_critter.webp', world_map_01: 'assets/forest/world-map.webp?v=forest-art-20261006', enemy_frost_wolf: 'assets/sprites/enemy_frost_wolf.webp', enemy_frost_alpha: 'assets/sprites/enemy_frost_alpha.webp', enemy_grave_hound: 'assets/sprites/enemy_grave_hound.webp', enemy_barrow_warden: 'assets/sprites/enemy_barrow_warden.webp', enemy_grave_wisp: 'assets/sprites/enemy_grave_wisp.webp', tree_frost_01: 'assets/sprites/tree_frost_01.webp', tree_frost_02: 'assets/sprites/tree_frost_02.webp', dead_tree_grey_01: 'assets/sprites/dead_tree_grey_01.webp', gravestone_01: 'assets/sprites/gravestone_01.webp', gravestone_02: 'assets/sprites/gravestone_02.webp', crypt_01: 'assets/sprites/crypt_01.webp', ice_crystal_node_01: 'assets/sprites/ice_crystal_node_01.webp', snow_ground_01: 'assets/sprites/snow_ground_01.webp', grave_ground_01: 'assets/sprites/grave_ground_01.webp', npc_tikhon: 'assets/sprites/npc_tikhon.webp', portrait_tikhon: 'assets/sprites/portrait_tikhon.webp', npc_rowena: 'assets/sprites/npc_rowena.webp', portrait_rowena: 'assets/sprites/portrait_rowena.webp', enemy_volunteer: 'assets/sprites/enemy_volunteer.webp', enemy_experimental_construct: 'assets/sprites/enemy_experimental_construct.webp', enemy_severin: 'assets/sprites/enemy_severin.webp', astral_ward_01: 'assets/sprites/astral_ward_01.webp', npc_nerys: 'assets/sprites/npc_nerys.webp', portrait_nerys: 'assets/sprites/portrait_nerys.webp', enemy_frost_collector: 'assets/sprites/enemy_frost_collector.webp', enemy_frost_collector_elite: 'assets/sprites/enemy_frost_collector_elite.webp', enemy_ice_guardian: 'assets/sprites/enemy_ice_guardian.webp', ice_wall_01: 'assets/sprites/ice_wall_01.webp', ice_construct_01: 'assets/sprites/ice_construct_01.webp', water_patch_01: 'assets/sprites/water_patch_01.webp', ice_floor_01: 'assets/sprites/ice_floor_01.webp', frozen_door_01: 'assets/sprites/frozen_door_01.webp', fountain_frozen: 'assets/sprites/fountain_frozen.webp', crate_01: 'assets/sprites/crate_01.webp', barrel_01: 'assets/sprites/barrel_01.webp', market_stall_01: 'assets/sprites/market_stall_01.webp', notice_board_01: 'assets/sprites/notice_board_01.webp', frost_patch_01: 'assets/chapter2/frost-ground.webp', city_lamp_01: 'assets/sprites/city_lamp_01.webp', icon_frost_herb: 'assets/sprites/icon_frost_herb.webp', icon_ice_crystal: 'assets/sprites/icon_ice_crystal.webp', icon_frost_shard: 'assets/sprites/icon_frost_shard.webp', icon_cold_heart: 'assets/sprites/icon_cold_heart.webp', icon_potion_warm: 'assets/sprites/icon_potion_warm.webp', icon_potion_stable: 'assets/sprites/icon_potion_stable.webp', icon_potion_brittle: 'assets/sprites/icon_potion_brittle.webp', icon_potion_guard: 'assets/sprites/icon_potion_guard.webp', icon_reinforced_resin: 'assets/sprites/icon_reinforced_resin.webp', icon_astral_lens: 'assets/sprites/icon_astral_lens.webp', icon_amulet_focus: 'assets/sprites/icon_amulet_focus.webp', icon_amulet_forest: 'assets/sprites/icon_amulet_forest.webp', icon_amulet_lunar: 'assets/sprites/icon_amulet_lunar.webp', icon_amulet_frost: 'assets/sprites/icon_amulet_frost.webp', icon_sapphire: 'assets/sprites/icon_sapphire.webp?v=currency-art-20261007', icon_bag: 'assets/ui/craft-bag.webp', icon_hand: 'assets/sprites/icon_hand.webp',
  icon_coin: 'assets/sprites/icon_coin.webp?v=currency-art-20261007', icon_shard: 'assets/sprites/icon_shard.webp?v=art-20261003', icon_ember: 'assets/sprites/icon_ember.webp', icon_core: 'assets/sprites/icon_core.webp', icon_lock: 'assets/sprites/icon_lock.webp',
  // v0.8: NPC, интерьер, ресурсы, иконки
  npc_mirra: 'assets/sprites/npc_mirra.webp?v=art-20261003', npc_veda: 'assets/sprites/npc_veda.webp?v=art-20261003', npc_goran: 'assets/sprites/npc_goran.webp?v=art-20261003', npc_selena: 'assets/sprites/npc_selena.webp?v=art-20261003', bed_01: 'assets/sprites/bed_01.webp?v=art-20261003', table_01: 'assets/sprites/table_01.webp?v=art-20261003', bookshelf_01: 'assets/sprites/bookshelf_01.webp?v=art-20261003', cauldron_01: 'assets/sprites/cauldron_01.webp?v=art-20261003', wardrobe_01: 'assets/sprites/wardrobe_01.webp?v=art-20261003', rug_01: 'assets/sprites/rug_01.webp?v=art-20261003', herb_bundle_01: 'assets/sprites/herb_bundle_01.webp?v=art-20261003', plant_pot_01: 'assets/sprites/plant_pot_01.webp?v=art-20261003', cat_01: 'assets/sprites/cat_01.webp?v=art-20261003', trunk_01: 'assets/sprites/trunk_01.webp?v=art-20261003', moon_herb_01: 'assets/sprites/moon_herb_01.webp?v=art-20261003', mushrooms_brown_01: 'assets/sprites/mushrooms_brown_01.webp?v=art-20261003', resin_log_01: 'assets/sprites/resin_log_01.webp?v=art-20261003', rune_sigil_01: 'assets/sprites/rune_sigil_01.webp?v=art-20261003', rune_slab_01: 'assets/sprites/rune_slab_01.webp?v=art-20261003', bramble_01: 'assets/sprites/bramble_01.webp?v=art-20261003', campfire_01: 'assets/sprites/campfire_01.webp?v=art-20261003',
  portrait_mirra: 'assets/sprites/portrait_mirra.webp?v=art-20261003', portrait_veda: 'assets/sprites/portrait_veda.webp?v=art-20261003', portrait_goran: 'assets/sprites/portrait_goran.webp?v=art-20261003', portrait_selena: 'assets/sprites/portrait_selena.webp?v=art-20261003', icon_mushroom: 'assets/sprites/icon_mushroom.webp?v=art-20261003', icon_resin: 'assets/sprites/icon_resin.webp?v=art-20261003', icon_dust: 'assets/sprites/icon_dust.webp?v=art-20261003', icon_potion_life: 'assets/sprites/icon_potion_life.webp?v=art-20261003', icon_potion_mana: 'assets/sprites/icon_potion_mana.webp?v=art-20261003', icon_potion_fire: 'assets/sprites/icon_potion_fire.webp?v=art-20261003', icon_talk: 'assets/sprites/icon_talk.webp?v=medallions-20261003', icon_gather: 'assets/sprites/icon_gather.webp?v=medallions-20261003', icon_alchemy: 'assets/sprites/icon_alchemy.webp?v=medallions-20261003', icon_inspect: 'assets/sprites/icon_inspect.webp?v=medallions-20261003', icon_journal: 'assets/ui/craft-journal.webp',
  icon_fight: 'assets/sprites/icon_fight.webp', // v0.9: «Сразиться снова»
  icon_moon_herb: 'assets/sprites/icon_moon_herb.webp?v=art-20261003',
  // v0.8.2: меню и HUD
  icon_menu: 'assets/sprites/icon_menu.webp', icon_close: 'assets/sprites/icon_close.webp', icon_city: 'assets/sprites/icon_city.webp', icon_map: 'assets/sprites/icon_map.webp', icon_bank: 'assets/sprites/icon_bank.webp', icon_rating: 'assets/sprites/icon_rating.webp', icon_chat: 'assets/sprites/icon_chat.webp', icon_forum: 'assets/sprites/icon_forum.webp', icon_settings: 'assets/sprites/icon_settings.webp', icon_heart: 'assets/sprites/icon_heart.webp', icon_drop: 'assets/sprites/icon_drop.webp',
  // v0.10.0: сюжетные предметы первой главы (tools/art/v10_icons.py)
  icon_wick: 'assets/sprites/icon_wick.webp', icon_compound: 'assets/sprites/icon_compound.webp', icon_bundle: 'assets/sprites/icon_bundle.webp',
  // v0.10.0: объекты мира первой главы (tools/art/v10_world.py)
  forest_node_broken: 'assets/sprites/forest_node_broken.webp', forest_node_restored: 'assets/sprites/forest_node_restored.webp',
  seal_sigil_dim: 'assets/sprites/seal_sigil_dim.webp', seal_sigil_lit: 'assets/sprites/seal_sigil_lit.webp',
  dust_stash_01: 'assets/sprites/dust_stash_01.webp', dust_stash_empty: 'assets/sprites/dust_stash_empty.webp',
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
  enemy_guardian: [160, 210], enemy_ice_guardian: [170, 223], enemy_experimental_construct: [150, 197], enemy_severin: [124, 165], enemy_volunteer: [96, 140], enemy_scavenger: [116, 140],
  life_bird_1: [30, 25], life_bird_2: [30, 25], life_bird_3: [30, 25], life_squirrel_1: [42, 35], life_squirrel_2: [42, 35], life_squirrel_3: [42, 35], life_rabbit_1: [44, 36.67], life_rabbit_2: [44, 36.67], life_rabbit_3: [44, 36.67], life_leaf: [18, 12],
  // партия 2 (текстуры x2, размер на экране — по пропорциям арта)
  bush_01: [80, 68], bush_02: [80, 68], dry_bush_01: [84, 70], flower_white_01: [48, 46], flower_purple_01: [48, 46], mushroom_red_01: [52, 39], mushroom_blue_01: [46, 43],
  reeds_01: [64, 70], moon_plant_01: [60, 53], rock_small_01: [56, 47], lantern_01: [25, 90], lantern_02: [50, 100], signpost_01: [53, 90], torch_01: [36, 90],
  candle_group_01: [27, 44], claw_marks_01: [62, 72], wooden_bridge_01: [180, 145], fire_circle_01: [240, 167], enemy_scavenger_small: [101, 104], enemy_frost_critter: [101, 104], enemy_frost_wolf: [104, 107], enemy_frost_alpha: [130, 157], enemy_grave_hound: [120, 145], enemy_barrow_warden: [165, 216], enemy_grave_wisp: [84, 105], enemy_frost_collector: [86, 116], enemy_frost_collector_elite: [100, 135], enemy_rootling: [71, 96],
  field_rock_light: [76, 66], field_rock_heavy: [116, 93], field_crystal: [88, 110],
  // партия 3
  lunar_flame_01: [36, 48],
  chest_01: [60, 48], chest_01_open: [60, 64],
  // v0.8
  npc_mirra: [84, 126], world_map_01: [584, 760], tree_frost_01: [150, 220], tree_frost_02: [140, 210], dead_tree_grey_01: [110, 170], gravestone_01: [62, 76], gravestone_02: [72, 64], crypt_01: [200, 183], ice_crystal_node_01: [70, 64], npc_tikhon: [90, 132], portrait_tikhon: [128, 128], npc_rowena: [80, 128], portrait_rowena: [128, 128], astral_ward_01: [130, 106], npc_nerys: [80, 120], portrait_nerys: [128, 128], ice_wall_01: [140, 128], ice_construct_01: [150, 150], water_patch_01: [150, 82], ice_floor_01: [150, 82], frozen_door_01: [104, 110], npc_ilaria: [80, 120], npc_severin: [88, 128], npc_merchant: [90, 132], npc_banker: [84, 126], npc_duelist: [88, 128], portrait_ilaria: [128, 128], portrait_severin: [128, 128], portrait_merchant: [128, 128], portrait_banker: [128, 128], portrait_duelist: [128, 128], fountain_frozen: [240, 200], crate_01: [84, 78], barrel_01: [56, 76], market_stall_01: [240, 204], notice_board_01: [110, 124], frost_patch_01: [220, 120], city_lamp_01: [36, 104], npc_veda: [80, 120], npc_goran: [90, 132], npc_selena: [80, 128], bed_01: [112, 120], table_01: [112, 86], bookshelf_01: [150, 128], cauldron_01: [88, 100], wardrobe_01: [84, 136], rug_01: [250, 150], herb_bundle_01: [34, 62], plant_pot_01: [48, 72], cat_01: [76, 54], trunk_01: [84, 58], moon_herb_01: [56, 50], mushrooms_brown_01: [60, 46], resin_log_01: [84, 66], rune_sigil_01: [90, 50], rune_slab_01: [96, 56], bramble_01: [96, 80], campfire_01: [64, 56], portrait_mirra: [128, 128], portrait_veda: [128, 128], portrait_goran: [128, 128], portrait_selena: [128, 128], icon_moon_herb: [64, 64], icon_mushroom: [64, 64], icon_resin: [64, 64], icon_dust: [64, 64], icon_potion_life: [64, 64], icon_potion_mana: [64, 64], icon_potion_fire: [64, 64], icon_talk: [64, 64], icon_gather: [64, 64], icon_alchemy: [64, 64], icon_inspect: [64, 64], icon_journal: [64, 64],

};

// Production chapter II pack; approved chapter I files stay at their original keys.
Object.assign(ASSET_FILES, CHAPTER2_FILES);
Object.assign(DISPLAY_SIZE, CHAPTER2_SIZES);
Object.assign(ASSET_FILES, CITY_INTERIOR_FILES);
Object.assign(DISPLAY_SIZE, CITY_INTERIOR_SIZES);
Object.assign(ASSET_FILES, CITY_FINAL_FILES);
Object.assign(DISPLAY_SIZE, CITY_FINAL_SIZES);
Object.assign(ASSET_FILES, CITY_WALK_FILES);
Object.assign(DISPLAY_SIZE, CITY_WALK_SIZES);
Object.assign(ASSET_FILES, ARCHIVE_FILES);
Object.assign(DISPLAY_SIZE, ARCHIVE_SIZES);
Object.assign(ASSET_FILES, NEIGHBORHOOD_FILES);
Object.assign(DISPLAY_SIZE, NEIGHBORHOOD_SIZES);
// v0.38.0: глава III «Безымянная роща» — прототипная графика, нарисованная кодом (tools/art/ch3_grove_art.py).
// Финальная рисованная карта переопределяется после пакета главы III.
Object.assign(ASSET_FILES, CITY_LIFE_FILES);   // прототипы «живого города» (tools/art/city_life_art.py)
Object.assign(DISPLAY_SIZE, CITY_LIFE_SIZES);
Object.assign(ASSET_FILES, CITY_LIFE_PAINTED_FILES);
Object.assign(ASSET_FILES, CITY_LIFE_DIRECTION_FILES);
Object.assign(DISPLAY_SIZE, CITY_LIFE_DIRECTION_SIZES);
Object.assign(ASSET_FILES, CHAPTER3_FILES);
Object.assign(DISPLAY_SIZE, CHAPTER3_SIZES);
Object.assign(ASSET_FILES, WORLD_MAP_FILES);
// Visual-only override. All 25 monsters are individually addressable, including the heart boss.
Object.assign(ASSET_FILES, MONSTER_REDESIGN_FILES);
for (const [key, [pixelWidth, pixelHeight]] of Object.entries(MONSTER_REDESIGN_DIMENSIONS)) {
  const screenHeight = MONSTER_WORLD_HEIGHTS[key];
  DISPLAY_SIZE[key] = [Math.round(screenHeight * pixelWidth / pixelHeight), screenHeight];
}
DISPLAY_SIZE.world_map_01 = [WORLD_MAP.width, WORLD_MAP.height];
for (const key of Object.keys(WORLD_MAP_FILES).filter(k => k.startsWith('map_marker_'))) DISPLAY_SIZE[key] = [96, 96];
DISPLAY_SIZE.map_current_ribbon = [130, 42];

/** Рисунки-заглушки, не готовые к релизу. Оба героя используют финальные PNG.
 *  v0.38.0: вся графика главы III пока прототипная (список финальной — docs/design/chapter-3-art-inventory-v0.1.md). */
export const TEMPORARY_ART = [...Object.keys(CHAPTER3_FILES).filter(k => k !== 'world_map_01' && !MONSTER_REDESIGN_FILES[k]), ...Object.keys(CITY_LIFE_FILES).filter(k => !CITY_LIFE_PAINTED_FILES[k])];
