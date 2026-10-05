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
// их выдают квесты главы II; v0.21.0 — события квестов 6–10, Хрупкость и Стабилизирующий — в следующем обновлении); до этого котёл его не показывает (chapter: 2 — скрыт, пока неизвестен).
Object.assign(RECIPES, {
  warm_potion: { kind: 'potion', chapter: 2, result: 'warm_potion', amount: 1, needs: { moon_herb: 1, frost_herb: 1, forest_mushroom: 1 },
    requires: ['ch2_nerys_met'], crafted: 'warm_potion_crafted', note: 'Морозник, прогретый лунной травой, — тепло изнутри.' },
  stabilizing_potion: { kind: 'potion', chapter: 2, result: 'stabilizing_potion', amount: 1, needs: { frost_herb: 2, rune_dust: 1, lunar_shard: 1 },
    requires: ['recipe_stabilizing_potion'], note: 'Успокаивает нестабильную магию в теле.' },
  brittle_flask: { kind: 'potion', chapter: 2, result: 'brittle_flask', amount: 1, needs: { ice_crystal: 1, tree_resin: 1, rune_dust: 1 },
    requires: ['recipe_brittle_flask'], note: 'Кристалл холода в смоле: разбивается о цель и делает её хрупкой.' },
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

export const RECIPE_ORDER = ['elixir_life', 'elixir_mana', 'resin_flask', 'warm_potion', 'stabilizing_potion', 'brittle_flask', 'crystal_guard',
  'lunar_wick', 'revealing_compound', 'restoration_bundle', 'reinforced_resin', 'astral_lens', 'amulet_frost'];
export const POTION_RECIPES = RECIPE_ORDER.filter(id => RECIPES[id].kind === 'potion');
/** v0.19.0: разделы котла по порядку показа. */
export const RECIPE_SECTIONS = { potion: 'Зелья', story: 'Для главного задания', component: 'Компоненты', tool: 'Инструменты', amulet: 'Амулеты' };
export const STORY_RECIPES = RECIPE_ORDER.filter(id => RECIPES[id].kind === 'story');
