// Рецепты котла в доме ведьмы (v0.8; v0.10.0 — первая глава: шесть рецептов, три из них сюжетные).
// Каждый рецепт: ингредиенты → одна штука; 100% успех, без монет, маны, ожидания и уровней.
// Правила изготовления проверяет и применяет одна атомарная операция (player_action { op: 'craft' }) —
// на сервере (supabase/schema.sql) и её JS-зеркало (cloud/playerModel.js applyAction). Поля, которые читает сервер:
//   result, amount, needs, requires (события, без которых рецепт ещё неизвестен), crafted (событие изготовления),
//   blockedBy (после этих событий сюжетный предмет больше не изготавливается — он уже есть или уже применён).
// Остальные поля (kind, note, learn, purpose) — только для интерфейса.
export const RECIPES = {
  elixir_life: { kind: 'potion', result: 'elixir_life', amount: 1, needs: { moon_herb: 2, forest_mushroom: 1 },
    note: 'Лунная трава и гриб, томлёные до золота.' },
  elixir_mana: { kind: 'potion', result: 'elixir_mana', amount: 1, needs: { moon_herb: 1, rune_dust: 1 },
    note: 'Рунная пыль не даёт свету рассеяться.' },
  resin_flask: { kind: 'potion', result: 'resin_flask', amount: 1, needs: { tree_resin: 2, rune_dust: 1 },
    note: 'Смола горит долго, пыль заставляет её липнуть к цели.' },
  // ---- сюжетные (v0.10.0): нужны в одной копии
  lunar_wick: { kind: 'story', result: 'lunar_wick', amount: 1,
    needs: { moon_herb: 1, tree_resin: 1, rune_dust: 1, lunar_flame: 3 },
    requires: ['lunar_quest_start'], crafted: 'lunar_wick_crafted', blockedBy: ['lunar_wick_crafted', 'lunar_quest_complete'],
    note: 'Три огонька, свитые травой и смолой, — свет, который алтарь примет.',
    learn: 'Рецепт объяснит Селена у Лунного алтаря.' },
  revealing_compound: { kind: 'story', result: 'revealing_compound', amount: 1,
    needs: { moon_herb: 1, forest_mushroom: 1, rune_dust: 1 },
    requires: ['lunar_quest_complete'], crafted: 'revealing_compound_crafted', blockedBy: ['revealing_compound_crafted', 'gate_marks_revealed'],
    note: 'Показывает стёртые нарочно знаки древней магии.',
    learn: 'Рецепт станет известен, когда алтарь снова засветится.' },
  restoration_bundle: { kind: 'story', result: 'restoration_bundle', amount: 1,
    needs: { moon_herb: 2, tree_resin: 2, rune_dust: 2, lunar_shard: 1, rare_core: 1 },
    requires: ['lunar_quest_complete'], crafted: 'restoration_bundle_crafted', blockedBy: ['restoration_bundle_crafted', 'chapter_1_complete'],
    note: 'Ядро Стража, стянутое смолой и пылью, — лекарство для сердца рощи.',
    learn: 'Рецепт станет известен, когда алтарь снова засветится.' },
};

// ---- v0.19.0: глава II (docs/design/chapter-2-balance-v0.1.md §18). Рецепт становится известен по сюжету (события requires,
// их выдают квесты главы II; v0.21.0 — события квестов 6–10; v0.22.0 — Флакон хрупкости (Лёд II) и Стабилизирующий настой (лаборатория)); до этого котёл его не показывает (chapter: 2 — скрыт, пока неизвестен).
Object.assign(RECIPES, {
  warm_potion: { kind: 'potion', chapter: 2, result: 'warm_potion', amount: 1, needs: { moon_herb: 1, frost_herb: 1, forest_mushroom: 1 },
    requires: ['ch2_nerys_met'], crafted: 'warm_potion_crafted', note: 'Морозник, прогретый лунной травой, — тепло изнутри.' },
  stabilizing_potion: { kind: 'potion', chapter: 2, result: 'stabilizing_potion', amount: 1, needs: { frost_herb: 2, rune_dust: 1, lunar_shard: 1 },
    requires: ['ch2_lab_open'], note: 'Успокаивает нестабильную магию в теле.' },
  brittle_flask: { kind: 'potion', chapter: 2, result: 'brittle_flask', amount: 1, needs: { ice_crystal: 1, tree_resin: 1, rune_dust: 1 },
    requires: ['unlock_ice_2'], crafted: 'brittle_flask_crafted', note: 'Кристалл холода в смоле: разбивается о цель и делает её хрупкой.' },
  crystal_guard: { kind: 'potion', chapter: 2, result: 'crystal_guard', amount: 1, needs: { ice_crystal: 1, forest_mushroom: 1, tree_resin: 1 },
    requires: ['ch2_quarter_cleared'], note: 'Тонкая ледяная корка поверх кожи — на один серьёзный бой.' },
  reinforced_resin: { kind: 'component', chapter: 2, result: 'reinforced_resin', amount: 1, needs: { tree_resin: 2, crimson_ember: 1, frost_herb: 1 },
    requires: ['ch2_cargo_found'], note: 'Смола, закалённая углём и холодом.' },
  astral_lens: { kind: 'tool', chapter: 2, result: 'astral_lens', amount: 1, needs: { rune_dust: 2, lunar_shard: 1, ice_crystal: 1 },
    requires: ['ch2_cargo_reported'], note: 'Линза из льда и лунного осколка.' },
  amulet_frost: { kind: 'amulet', chapter: 2, result: 'amulet_frost', amount: 1,
    needs: { lunar_shard: 4, rune_dust: 4, ice_crystal: 3, frost_shard: 1, coins: 250 },
    requires: ['ch2_quarter_cleared'], blockedBy: ['amulet_frost_crafted'], crafted: 'amulet_frost_crafted',
    note: 'Первый амулет Льда. Нужен один: дальше его улучшают.' },
});

// New recipes replace manufacture of legacy percentage flasks. Old stock remains usable.
RECIPES.elixir_life.result = 'potion_life_small'; RECIPES.elixir_life.needs = { moon_herb: 1, forest_mushroom: 1 };
RECIPES.elixir_mana.result = 'potion_mana_small';
const brew = (result, needs, coins, requires = []) => ({ kind: 'potion', chapter: requires.length ? 2 : 1, result, amount: 1, needs: { ...needs, ...(coins ? { coins } : {}) }, requires });
Object.assign(RECIPES, {
  potion_life_small: brew('potion_life_small', { moon_herb: 1, forest_mushroom: 1 }, 0),
  potion_mana_small: brew('potion_mana_small', { moon_herb: 1, rune_dust: 1 }, 0),
  potion_life_medium: brew('potion_life_medium', { moon_herb: 2, forest_mushroom: 2, tree_resin: 1 }, 15, ['ch2_city_arrived']),
  potion_mana_medium: brew('potion_mana_medium', { rune_dust: 2, lunar_shard: 1 }, 20, ['ch2_city_arrived']),
  potion_life_large: brew('potion_life_large', { moon_herb: 3, forest_mushroom: 2, reinforced_resin: 1 }, 40, ['ch2_lab_open']),
  potion_mana_large: brew('potion_mana_large', { rune_dust: 3, lunar_shard: 2, ice_crystal: 1 }, 50, ['ch2_lab_open']),
  potion_life_regen: brew('potion_life_regen', { moon_herb: 1, forest_mushroom: 2, frost_herb: 1 }, 25, ['regen_potions_learned']),
  potion_mana_regen: brew('potion_mana_regen', { moon_herb: 2, rune_dust: 1, frost_herb: 1 }, 30, ['regen_potions_learned']),
  potion_crystal_shield: brew('potion_crystal_shield', { ice_crystal: 1, forest_mushroom: 1, tree_resin: 1 }, 20, ['ch2_quarter_cleared']),
  // Graveyard wisps become available after chapter II; their strong hit burns the hero.
  potion_antiburn: { ...brew('potion_antiburn', { frost_herb: 2, forest_mushroom: 1, ice_crystal: 1 }, 15, ['chapter_2_complete']),
    note: 'Морозник и кристалл гасят пламя на коже. Защищает от нового горения, пока действует настой.' },
});
RECIPES.crystal_guard = { ...RECIPES.potion_crystal_shield };
for (const [id, fee] of Object.entries({ warm_potion: 10, stabilizing_potion: 15, brittle_flask: 15 })) RECIPES[id].needs.coins = fee;
const amuletRecipes = {
 amulet_focus: [{ lunar_shard: 3, rune_dust: 2, reinforced_resin: 1 },200,'ch2_city_arrived'],
 amulet_forest: [{ forest_mushroom: 4, tree_resin: 3, moon_herb: 2 },200,'ch2_city_arrived'],
 amulet_lunar: [{ lunar_shard: 5, rune_dust: 3, reinforced_resin: 1 },400,'ch2_city_arrived'],
 amulet_tracker: [{ moon_herb: 3, forest_mushroom: 3, tree_resin: 2, rune_dust: 1 },250,'ch2_city_arrived'],
 amulet_embers: [{ crimson_ember: 4, reinforced_resin: 2, lunar_shard: 2 },350,'ch2_cargo_found'],
 amulet_breaker: [{ reinforced_resin: 3, lunar_shard: 3, rune_dust: 2 },350,'ch2_cargo_reported'],
 amulet_astral_eye: [{ rune_dust: 5, lunar_shard: 4, ice_crystal: 1 },450,'ch2_cargo_reported'],
 amulet_blizzard: [{ lunar_shard: 5, rune_dust: 5, ice_crystal: 4, frost_shard: 2 },1000,'chapter_2_complete'],
};
for (const [id,[needs,coins,event]] of Object.entries(amuletRecipes)) RECIPES[id] = { kind: 'amulet', chapter: 2, result: id, amount: 1, needs: { ...needs, coins }, requires: [event], crafted: `${id}_crafted`, blockedBy: [`${id}_crafted`] };
export const RECIPE_ORDER = Object.keys(RECIPES).filter(id => !['elixir_life', 'elixir_mana', 'crystal_guard'].includes(id));
export const POTION_RECIPES = RECIPE_ORDER.filter(id => RECIPES[id].kind === 'potion');
/** v0.19.0: разделы котла по порядку показа. */
export const RECIPE_SECTIONS = { potion: 'Зелья', story: 'Для главного задания', component: 'Компоненты', tool: 'Инструменты', amulet: 'Амулеты' };
export const STORY_RECIPES = RECIPE_ORDER.filter(id => RECIPES[id].kind === 'story');
