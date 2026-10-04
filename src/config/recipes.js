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

export const RECIPE_ORDER = ['elixir_life', 'elixir_mana', 'resin_flask', 'lunar_wick', 'revealing_compound', 'restoration_bundle'];
export const POTION_RECIPES = RECIPE_ORDER.filter(id => RECIPES[id].kind === 'potion');
export const STORY_RECIPES = RECIPE_ORDER.filter(id => RECIPES[id].kind === 'story');
