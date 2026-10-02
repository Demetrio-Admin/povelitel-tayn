// v0.8 — рецепты котла в доме ведьмы. Простая схема: ингредиенты → один расходник. Никаких уровней и шансов.
export const RECIPES = {
  elixir_life: { result: 'elixir_life', amount: 1, needs: { moon_herb: 2, forest_mushroom: 1 },
    note: 'Лунная трава и гриб, томлёные до золота.' },
  elixir_mana: { result: 'elixir_mana', amount: 1, needs: { moon_herb: 1, rune_dust: 1 },
    note: 'Рунная пыль не даёт свету рассеяться.' },
  resin_flask: { result: 'resin_flask', amount: 1, needs: { tree_resin: 2, rune_dust: 1 },
    note: 'Смола горит долго, пыль заставляет её липнуть к цели.' },
};

export const RECIPE_ORDER = ['elixir_life', 'elixir_mana', 'resin_flask'];
