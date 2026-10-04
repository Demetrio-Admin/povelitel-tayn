// Edge Function «combat» (v0.14.0): сервер проверяет бой. ФАЙЛ СОБРАН АВТОМАТИЧЕСКИ: node tools/build-combat-function.mjs. Руками не править.
//
// Игра пишет действия игрока в бою, а эта функция проигрывает запись тем же движком боя с состояния героя, которое база запомнила
// в начале боя (player_action combat_start), сама решает исход и атомарно записывает итог (SQL combat_apply). Присланному «я победил» верить нельзя.
//
// Развёртывание: Supabase → Edge Functions → Deploy a new function → имя «combat» → вставить этот файл → Deploy.
// Переменные SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам. Перед включением выполните supabase/schema.sql (combat_load / combat_apply).
//
// src/config/balance.hero.js
var HERO_BASE = {
  autoAttack: { damage: 6, intervalSec: 2 }
  // слабая автоатака, DPS 3
};
var HERO_LEVELS = [
  { level: 1, xp: 0, maxHp: 120, maxMana: 100, manaRegen: 3, damageMult: 1, note: "\u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437 I" },
  { level: 2, xp: 60, maxHp: 126, maxMana: 110, manaRegen: 3, damageMult: 1.05, note: "+10 \u043C\u0430\u043D\u044B, +5% \u0443\u0440\u043E\u043D\u0430" },
  { level: 3, xp: 150, maxHp: 132, maxMana: 110, manaRegen: 3, damageMult: 1.05, note: "\u0414\u043E\u0441\u0442\u0443\u043F \u043A \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u0443 II" },
  { level: 4, xp: 270, maxHp: 138, maxMana: 115, manaRegen: 3, damageMult: 1.08, note: "\u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437 II, \u043F\u0443\u0442\u044C \u043A \u041E\u0433\u043D\u044E" },
  { level: 5, xp: 430, maxHp: 144, maxMana: 120, manaRegen: 3, damageMult: 1.1, note: "\u0421\u0442\u0430\u0440\u044B\u0439 \u043B\u0435\u0441" },
  { level: 6, xp: 650, maxHp: 152, maxMana: 125, manaRegen: 3, damageMult: 1.12, note: "\u0410\u0441\u0442\u0440\u0430\u043B \u0438 \u0438\u0441\u043F\u044B\u0442\u0430\u043D\u0438\u0435" },
  { level: 7, xp: 940, maxHp: 160, maxMana: 135, manaRegen: 3, damageMult: 1.15, note: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435 \u0433\u043B\u0430\u0432\u044B" },
  { level: 8, xp: 1300, maxHp: 170, maxMana: 140, manaRegen: 3, damageMult: 1.18, note: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0432\u044B\u0445\u043E\u0434" },
  { level: 9, xp: 1750, maxHp: 180, maxMana: 145, manaRegen: 3, damageMult: 1.21, note: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435" },
  { level: 10, xp: 2350, maxHp: 190, maxMana: 155, manaRegen: 3, damageMult: 1.25, note: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435" }
];
var HERO_RECOVERY = {
  // Смерть не наказывает сильно (Combat Math §10).
  restoreHpAfterVictory: true,
  // v0.9: победа восстанавливает HP полностью (мана — фактический остаток)
  defeatHpFraction: 0.2,
  // v0.9: после поражения — 20% максимума HP (минимум 1), героиня остаётся рядом с врагом
  coinsLostOnDefeat: 5
  // штраф не больше 5 монет (не увеличивать)
};
var VITALS = {
  hpRegenPerSec: 1,
  // вне боя (в бою HP сам не восстанавливается)
  manaRegenWorld: 0.5,
  // в мире
  manaRegenHouse: 2,
  // в доме Мирры (зона A) — быстрее и бесплатно
  houseZone: "A",
  staleCombatSec: 15 * 60,
  // v0.12.0: бой, о завершении которого сервер не узнал за 15 минут, считается отступлением
  lowHpRetryWarn: 0.4,
  // перед «Сразиться снова» при HP ниже 40% — предупреждение
  combatLowHpHint: 0.45
  // в бою при HP ниже 45% подсказываем настой жизни
};

// src/config/resources.js
var RESOURCES = {
  moon_herb: { name: "\u041B\u0443\u043D\u043D\u0430\u044F \u0442\u0440\u0430\u0432\u0430", icon: "icon_moon_herb", color: 10480127, hint: "\u0420\u0430\u0441\u0442\u0451\u0442 \u043D\u0430 \u043F\u043E\u043B\u044F\u043D\u0430\u0445 \u043D\u043E\u0447\u043D\u044B\u043C \u0441\u0432\u0435\u0442\u043E\u043C. \u041D\u0443\u0436\u043D\u0430 \u0434\u043B\u044F \u043D\u0430\u0441\u0442\u043E\u0435\u0432 \u0438 \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u0430 II." },
  lunar_shard: { name: "\u041B\u0443\u043D\u043D\u044B\u0439 \u043E\u0441\u043A\u043E\u043B\u043E\u043A", icon: "icon_shard", color: 10480127, hint: "\u0417\u0430\u0441\u0442\u044B\u0432\u0448\u0438\u0439 \u043B\u0443\u043D\u043D\u044B\u0439 \u0441\u0432\u0435\u0442. \u041D\u0443\u0436\u0435\u043D \u0434\u043B\u044F \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F \u0434\u0430\u0440\u043E\u0432." },
  forest_mushroom: { name: "\u041B\u0435\u0441\u043D\u044B\u0435 \u0433\u0440\u0438\u0431\u044B", icon: "icon_mushroom", color: 14251082, hint: "\u0420\u0430\u0441\u0442\u0443\u0442 \u0432 \u0442\u0435\u043D\u0438 \u0441\u0442\u0430\u0440\u043E\u0433\u043E \u043B\u0435\u0441\u0430. \u041E\u0441\u043D\u043E\u0432\u0430 \u0446\u0435\u043B\u0435\u0431\u043D\u044B\u0445 \u043D\u0430\u0441\u0442\u043E\u0435\u0432." },
  tree_resin: { name: "\u0414\u0440\u0435\u0432\u0435\u0441\u043D\u0430\u044F \u0441\u043C\u043E\u043B\u0430", icon: "icon_resin", color: 15249482, hint: "\u041B\u0438\u043F\u043A\u0430\u044F \u0438 \u0433\u043E\u0440\u044E\u0447\u0430\u044F. \u0415\u0451 \u0441\u043E\u0431\u0438\u0440\u0430\u044E\u0442 \u0441 \u043A\u043E\u0440\u044B \u0438\u043B\u0438 \u0434\u043E\u0441\u0442\u0430\u044E\u0442 \u0438\u0437 \u0441\u043E\u0436\u0436\u0451\u043D\u043D\u044B\u0445 \u0437\u0430\u0440\u043E\u0441\u043B\u0435\u0439." },
  rune_dust: { name: "\u0420\u0443\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u044B\u043B\u044C", icon: "icon_dust", color: 13214463, hint: "\u041E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043E\u0442 \u0434\u0440\u0435\u0432\u043D\u0438\u0445 \u0440\u0443\u043D. \u0411\u0435\u0437 \u043D\u0435\u0451 \u043C\u0430\u0433\u0438\u044F \u043D\u0435 \u0434\u0435\u0440\u0436\u0438\u0442\u0441\u044F \u0432 \u0437\u0435\u043B\u044C\u0435." }
};
var POTIONS = {
  elixir_life: {
    name: "\u041D\u0430\u0441\u0442\u043E\u0439 \u0436\u0438\u0437\u043D\u0438",
    icon: "icon_potion_life",
    color: 14702186,
    effect: { type: "heal", amount: 0.45 },
    outside: true,
    text: "+45% \u0437\u0434\u043E\u0440\u043E\u0432\u044C\u044F. \u0412 \u0431\u043E\u044E \u0438 \u0438\u0437 \u0441\u0443\u043C\u043A\u0438."
  },
  elixir_mana: {
    name: "\u041B\u0443\u043D\u043D\u044B\u0439 \u044D\u043B\u0438\u043A\u0441\u0438\u0440",
    icon: "icon_potion_mana",
    color: 6993151,
    effect: { type: "mana", amount: 0.6 },
    outside: true,
    text: "+60% \u043C\u0430\u043D\u044B. \u0412 \u0431\u043E\u044E \u0438 \u0438\u0437 \u0441\u0443\u043C\u043A\u0438."
  },
  resin_flask: {
    name: "\u0421\u043C\u043E\u043B\u044F\u043D\u0430\u044F \u0441\u043A\u043B\u044F\u043D\u043A\u0430",
    icon: "icon_potion_fire",
    color: 16747066,
    effect: { type: "damage", amount: 45, burn: { dps: 6, durationSec: 4 } },
    text: "\u0411\u0440\u043E\u0441\u043E\u043A \u0432\u043E \u0432\u0440\u0430\u0433\u0430: 45 \u0443\u0440\u043E\u043D\u0430 \u0438 \u0433\u043E\u0440\u0435\u043D\u0438\u0435. \u0422\u043E\u043B\u044C\u043A\u043E \u0432 \u0431\u043E\u044E."
  }
};
var RESOURCE_ITEMS = {
  ...Object.fromEntries(Object.entries(RESOURCES).map(([id, r]) => [id, { name: r.name, icon: r.icon }])),
  ...Object.fromEntries(Object.entries(POTIONS).map(([id, r]) => [id, { name: r.name, icon: r.icon }]))
};
var POTION_BATTLE_LIMIT = 4;

// src/config/recipes.js
var RECIPES = {
  elixir_life: {
    kind: "potion",
    result: "elixir_life",
    amount: 1,
    needs: { moon_herb: 2, forest_mushroom: 1 },
    note: "\u041B\u0443\u043D\u043D\u0430\u044F \u0442\u0440\u0430\u0432\u0430 \u0438 \u0433\u0440\u0438\u0431, \u0442\u043E\u043C\u043B\u0451\u043D\u044B\u0435 \u0434\u043E \u0437\u043E\u043B\u043E\u0442\u0430."
  },
  elixir_mana: {
    kind: "potion",
    result: "elixir_mana",
    amount: 1,
    needs: { moon_herb: 1, rune_dust: 1 },
    note: "\u0420\u0443\u043D\u043D\u0430\u044F \u043F\u044B\u043B\u044C \u043D\u0435 \u0434\u0430\u0451\u0442 \u0441\u0432\u0435\u0442\u0443 \u0440\u0430\u0441\u0441\u0435\u044F\u0442\u044C\u0441\u044F."
  },
  resin_flask: {
    kind: "potion",
    result: "resin_flask",
    amount: 1,
    needs: { tree_resin: 2, rune_dust: 1 },
    note: "\u0421\u043C\u043E\u043B\u0430 \u0433\u043E\u0440\u0438\u0442 \u0434\u043E\u043B\u0433\u043E, \u043F\u044B\u043B\u044C \u0437\u0430\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u0435\u0451 \u043B\u0438\u043F\u043D\u0443\u0442\u044C \u043A \u0446\u0435\u043B\u0438."
  },
  // ---- сюжетные (v0.10.0): нужны в одной копии
  lunar_wick: {
    kind: "story",
    result: "lunar_wick",
    amount: 1,
    needs: { moon_herb: 1, tree_resin: 1, rune_dust: 1, lunar_flame: 3 },
    requires: ["lunar_quest_start"],
    crafted: "lunar_wick_crafted",
    blockedBy: ["lunar_wick_crafted", "lunar_quest_complete"],
    note: "\u0422\u0440\u0438 \u043E\u0433\u043E\u043D\u044C\u043A\u0430, \u0441\u0432\u0438\u0442\u044B\u0435 \u0442\u0440\u0430\u0432\u043E\u0439 \u0438 \u0441\u043C\u043E\u043B\u043E\u0439, \u2014 \u0441\u0432\u0435\u0442, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0430\u043B\u0442\u0430\u0440\u044C \u043F\u0440\u0438\u043C\u0435\u0442.",
    learn: "\u0420\u0435\u0446\u0435\u043F\u0442 \u043E\u0431\u044A\u044F\u0441\u043D\u0438\u0442 \u0421\u0435\u043B\u0435\u043D\u0430 \u0443 \u041B\u0443\u043D\u043D\u043E\u0433\u043E \u0430\u043B\u0442\u0430\u0440\u044F."
  },
  revealing_compound: {
    kind: "story",
    result: "revealing_compound",
    amount: 1,
    needs: { moon_herb: 1, forest_mushroom: 1, rune_dust: 1 },
    requires: ["lunar_quest_complete"],
    crafted: "revealing_compound_crafted",
    blockedBy: ["revealing_compound_crafted", "gate_marks_revealed"],
    note: "\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u0441\u0442\u0451\u0440\u0442\u044B\u0435 \u043D\u0430\u0440\u043E\u0447\u043D\u043E \u0437\u043D\u0430\u043A\u0438 \u0434\u0440\u0435\u0432\u043D\u0435\u0439 \u043C\u0430\u0433\u0438\u0438.",
    learn: "\u0420\u0435\u0446\u0435\u043F\u0442 \u0441\u0442\u0430\u043D\u0435\u0442 \u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043D, \u043A\u043E\u0433\u0434\u0430 \u0430\u043B\u0442\u0430\u0440\u044C \u0441\u043D\u043E\u0432\u0430 \u0437\u0430\u0441\u0432\u0435\u0442\u0438\u0442\u0441\u044F."
  },
  restoration_bundle: {
    kind: "story",
    result: "restoration_bundle",
    amount: 1,
    needs: { moon_herb: 2, tree_resin: 2, rune_dust: 2, lunar_shard: 1, rare_core: 1 },
    requires: ["lunar_quest_complete"],
    crafted: "restoration_bundle_crafted",
    blockedBy: ["restoration_bundle_crafted", "chapter_1_complete"],
    note: "\u042F\u0434\u0440\u043E \u0421\u0442\u0440\u0430\u0436\u0430, \u0441\u0442\u044F\u043D\u0443\u0442\u043E\u0435 \u0441\u043C\u043E\u043B\u043E\u0439 \u0438 \u043F\u044B\u043B\u044C\u044E, \u2014 \u043B\u0435\u043A\u0430\u0440\u0441\u0442\u0432\u043E \u0434\u043B\u044F \u0441\u0435\u0440\u0434\u0446\u0430 \u0440\u043E\u0449\u0438.",
    learn: "\u0420\u0435\u0446\u0435\u043F\u0442 \u0441\u0442\u0430\u043D\u0435\u0442 \u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043D, \u043A\u043E\u0433\u0434\u0430 \u0430\u043B\u0442\u0430\u0440\u044C \u0441\u043D\u043E\u0432\u0430 \u0437\u0430\u0441\u0432\u0435\u0442\u0438\u0442\u0441\u044F."
  }
};
var RECIPE_ORDER = ["elixir_life", "elixir_mana", "resin_flask", "lunar_wick", "revealing_compound", "restoration_bundle"];
var POTION_RECIPES = RECIPE_ORDER.filter((id) => RECIPES[id].kind === "potion");
var STORY_RECIPES = RECIPE_ORDER.filter((id) => RECIPES[id].kind === "story");

// src/config/heroes.js
var DEFAULT_HERO_ID = "witch";
var HEROES = [
  {
    id: "witch",
    gender: "female",
    name: "\u0412\u0435\u0434\u044C\u043C\u0430",
    title: "\u0423\u0447\u0435\u043D\u0438\u0446\u0430 \u043B\u0435\u0441\u043D\u043E\u0439 \u0432\u0435\u0434\u044C\u043C\u044B",
    textures: { down: "hero_down", up: "hero_up", side: "hero_side" }
  },
  {
    id: "warlock",
    gender: "male",
    name: "\u041A\u043E\u043B\u0434\u0443\u043D",
    title: "\u0423\u0447\u0435\u043D\u0438\u043A \u043B\u0435\u0441\u043D\u043E\u0439 \u0432\u0435\u0434\u044C\u043C\u044B",
    textures: { down: "warlock_down", up: "warlock_up", side: "warlock_side" }
  }
];
var BY_ID = new Map(HEROES.map((h) => [h.id, h]));

// src/state/hero.js
var fm = (female, male) => ({ female, male });

// src/config/world.content.js
var CONTENT_INTERACTIVES = [
  // ================================================================== ДОМ ВЕДЬМЫ (зона A)
  {
    id: "house_cauldron",
    kind: "alchemy",
    x: 1075,
    y: 5135,
    texture: "cauldron_01",
    collide: { w: 66, h: 26 },
    radius: 120,
    hint: "\u041A\u043E\u0442\u0451\u043B \u041C\u0438\u0440\u0440\u044B"
  },
  { id: "npc_mirra", kind: "npc", npc: "mirra", x: 825, y: 5110, texture: "npc_mirra", collide: { w: 30, h: 14 }, radius: 115 },
  {
    id: "house_wardrobe",
    kind: "inspect",
    x: 722,
    y: 5085,
    texture: "wardrobe_01",
    collide: { w: 70, h: 24 },
    radius: 100,
    markerDist: 150,
    lines: ["\u041F\u043B\u0430\u0442\u044C\u044F, \u043F\u043B\u0430\u0449\u0438, \u043E\u0434\u043D\u0430 \u0448\u043B\u044F\u043F\u0430 \u0441 \u0437\u0430\u043F\u043B\u0430\u0442\u043E\u0439. \u0412\u0441\u0451 \u043F\u0430\u0445\u043D\u0435\u0442 \u0441\u0443\u0448\u0451\u043D\u043E\u0439 \u043B\u0430\u0432\u0430\u043D\u0434\u043E\u0439.", fm("\u0412 \u0448\u043A\u0430\u0444\u0443 \u0432\u0438\u0441\u0438\u0442 \u0441\u0442\u0430\u0440\u0430\u044F \u043C\u0430\u043D\u0442\u0438\u044F. \u0420\u0443\u043A\u0430\u0432\u0430 \u043A\u043E\u0440\u043E\u0442\u043A\u043E\u0432\u0430\u0442\u044B \u2014 \u0432\u0438\u0434\u043D\u043E, \u043D\u043E\u0441\u0438\u043B\u0430 \u0434\u0440\u0443\u0433\u0430\u044F \u0432\u0435\u0434\u044C\u043C\u0430.", "\u0412 \u0448\u043A\u0430\u0444\u0443 \u0432\u0438\u0441\u0438\u0442 \u0441\u0442\u0430\u0440\u0430\u044F \u043C\u0430\u043D\u0442\u0438\u044F. \u0420\u0443\u043A\u0430\u0432\u0430 \u043A\u043E\u0440\u043E\u0442\u043A\u043E\u0432\u0430\u0442\u044B \u2014 \u0432\u0438\u0434\u043D\u043E, \u0435\u0451 \u043D\u043E\u0441\u0438\u043B\u0430 \u043A\u0430\u043A\u0430\u044F-\u0442\u043E \u0432\u0435\u0434\u044C\u043C\u0430."), "\u0428\u043A\u0430\u0444 \u0441\u043A\u0440\u0438\u043F\u043D\u0443\u043B. \u041A\u0430\u0436\u0435\u0442\u0441\u044F, \u0435\u043C\u0443 \u0442\u043E\u0436\u0435 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u043F\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C, \u043D\u043E \u043E\u043D \u043F\u043E\u043A\u0430 \u0432\u043E\u0437\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F."]
  },
  {
    id: "house_trunk",
    kind: "inspect",
    x: 985,
    y: 5255,
    texture: "trunk_01",
    collide: { w: 76, h: 22 },
    radius: 100,
    markerDist: 150,
    first: { items: { forest_mushroom: 1, tree_resin: 1 }, text: "\u0412 \u0441\u0443\u043D\u0434\u0443\u043A\u0435 \u2014 \u0437\u0430\u043F\u0430\u0441\u044B \u041C\u0438\u0440\u0440\u044B: \u0433\u0440\u0438\u0431 \u0438 \u043A\u0443\u0441\u043E\u0447\u0435\u043A \u0441\u043C\u043E\u043B\u044B. \xAB\u0411\u0435\u0440\u0438, \u043D\u0435 \u0436\u0430\u043B\u043A\u043E\xBB, \u2014 \u0448\u0435\u043F\u0447\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u043A\u0430." },
    lines: ["\u0421\u0443\u043D\u0434\u0443\u043A \u0441 \u043F\u0440\u0438\u043F\u0430\u0441\u0430\u043C\u0438. \u0421\u0443\u0448\u0451\u043D\u044B\u0435 \u0442\u0440\u0430\u0432\u044B, \u0441\u0432\u0435\u0447\u043D\u044B\u0435 \u043E\u0433\u0430\u0440\u043A\u0438, \u043C\u043E\u0442\u043A\u0438 \u0432\u0435\u0440\u0451\u0432\u043A\u0438.", "\u0417\u0434\u0435\u0441\u044C \u043B\u0435\u0436\u0438\u0442 \u0432\u0441\u0451, \u0447\u0442\u043E \u041C\u0438\u0440\u0440\u0430 \xAB\u043D\u0430 \u0432\u0441\u044F\u043A\u0438\u0439 \u0441\u043B\u0443\u0447\u0430\u0439\xBB \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u0441\u044B\u0432\u0430\u0435\u0442."]
  },
  {
    id: "house_cat",
    kind: "inspect",
    x: 975,
    y: 5170,
    texture: "cat_01",
    radius: 95,
    markerDist: 140,
    living: "cat",
    lines: ["\u041A\u043E\u0442 \u0423\u0433\u043E\u043B\u0451\u043A \u043C\u0443\u0440\u043B\u044B\u0447\u0435\u0442 \u0438 \u0436\u043C\u0443\u0440\u0438\u0442\u0441\u044F. \u0421\u043F\u0430\u0442\u044C \u2014 \u0435\u0433\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u0435 \u0440\u0435\u043C\u0435\u0441\u043B\u043E.", "\u0423\u0433\u043E\u043B\u0451\u043A \u043F\u0440\u0438\u043E\u0442\u043A\u0440\u044B\u043B \u043E\u0434\u0438\u043D \u0433\u043B\u0430\u0437, \u043E\u0446\u0435\u043D\u0438\u043B \u0432\u0430\u0441 \u0438 \u0441\u043D\u043E\u0432\u0430 \u0443\u0441\u043D\u0443\u043B.", "\u041C\u0443\u0440\u0440. \u0422\u0451\u043F\u043B\u044B\u0439 \u0438 \u043F\u0443\u0448\u0438\u0441\u0442\u044B\u0439, \u043A\u0430\u043A \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u0438\u0439 \u043A\u0430\u043C\u0438\u043D."]
  },
  {
    id: "house_bed",
    kind: "inspect",
    ghost: { w: 110, h: 50 },
    x: 735,
    y: 5128,
    radius: 100,
    markerDist: 130,
    lines: ["\u041A\u0440\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u0441\u0442\u0435\u043B\u0435\u043D\u0430 \u043B\u043E\u0441\u043A\u0443\u0442\u043D\u044B\u043C \u043E\u0434\u0435\u044F\u043B\u043E\u043C. \u041F\u043E\u0434\u0443\u0448\u043A\u0430 \u0435\u0449\u0451 \u0445\u0440\u0430\u043D\u0438\u0442 \u0442\u0435\u043F\u043B\u043E.", "\u0412\u044B\u0441\u043F\u0430\u0442\u044C\u0441\u044F \u043C\u043E\u0436\u043D\u043E \u0438 \u043F\u043E\u0442\u043E\u043C \u2014 \u043B\u0435\u0441 \u043D\u0435 \u0431\u0443\u0434\u0435\u0442 \u0436\u0434\u0430\u0442\u044C \u0432\u0435\u0447\u043D\u043E."]
  },
  {
    id: "house_shelf",
    kind: "inspect",
    ghost: { w: 140, h: 40 },
    x: 765,
    y: 4992,
    radius: 100,
    markerDist: 130,
    lines: ["\xAB\u0422\u0440\u0430\u0432\u043D\u0438\u043A\xBB, \xAB\u041B\u0443\u043D\u043D\u044B\u0435 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u0438\xBB, \xAB\u041E \u043D\u0440\u0430\u0432\u0435 \u043A\u0430\u043C\u0435\u043D\u043D\u044B\u0445 \u0437\u0432\u0435\u0440\u0435\u0439\xBB. \u0417\u0430\u043A\u043B\u0430\u0434\u043A\u0438 \u0442\u043E\u0440\u0447\u0430\u0442 \u043E\u0442\u043E\u0432\u0441\u044E\u0434\u0443.", "\u041D\u0430 \u043F\u043E\u043B\u043A\u0435 \u0441\u0442\u043E\u044F\u0442 \u0441\u043A\u043B\u044F\u043D\u043A\u0438 \u0441 \u043F\u043E\u0434\u043F\u0438\u0441\u044F\u043C\u0438: \xAB\u043A\u043E\u0440\u0435\u043D\u044C\xBB, \xAB\u043E\u0441\u043A\u043E\u043B\u043E\u043A\xBB, \xAB\u043D\u0435 \u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C\xBB."]
  },
  // ================================================================== ПОЛЯНА (зона B)
  { id: "npc_veda", kind: "npc", npc: "veda", x: 600, y: 4440, texture: "npc_veda", collide: { w: 30, h: 14 }, radius: 110 },
  { id: "herb_g1", kind: "gather", res: "moon_herb", amount: 1, respawnSec: 150, x: 510, y: 4420, texture: "moon_herb_01", radius: 90 },
  { id: "herb_g2", kind: "gather", res: "moon_herb", amount: 1, respawnSec: 150, x: 720, y: 4380, texture: "moon_herb_01", radius: 90 },
  { id: "herb_g3", kind: "gather", res: "moon_herb", amount: 1, respawnSec: 150, x: 600, y: 4690, texture: "moon_herb_01", radius: 90 },
  // ================================================================== ТРОПА (зоны C, D)
  { id: "herb_t1", kind: "gather", res: "moon_herb", amount: 1, respawnSec: 150, x: 1020, y: 3760, texture: "moon_herb_01", radius: 90 },
  { id: "resin_t1", kind: "gather", res: "tree_resin", amount: 1, respawnSec: 200, x: 1020, y: 3600, texture: "resin_log_01", collide: { w: 56, h: 18 }, radius: 100 },
  { id: "mush_t1", kind: "gather", res: "forest_mushroom", amount: 1, respawnSec: 200, x: 1450, y: 3400, texture: "mushrooms_brown_01", radius: 90 },
  // колючие заросли: нужен Огонь; внутри — смола (разведка «сожги препятствие → получи ресурс»)
  {
    id: "bramble_t1",
    kind: "fire",
    x: 1450,
    y: 3250,
    texture: "bramble_01",
    burnSec: 1.1,
    collide: { w: 70, h: 26 },
    lockedText: "\u041A\u043E\u043B\u044E\u0447\u0438\u0435 \u0437\u0430\u0440\u043E\u0441\u043B\u0438. \u041E\u0433\u043E\u043D\u044C \u0432\u044B\u0436\u0436\u0435\u0442 \u0438\u0445 \u2014 \u0432\u043D\u0443\u0442\u0440\u0438 \u0431\u043B\u0435\u0441\u0442\u0438\u0442 \u0441\u043C\u043E\u043B\u0430.",
    reveal: { spawnPickup: { item: "tree_resin", amount: 2, texture: "icon_resin" } }
  },
  // лагерь охотника
  { id: "npc_goran", kind: "npc", npc: "goran", x: 1410, y: 3950, texture: "npc_goran", collide: { w: 32, h: 14 }, radius: 110 },
  // ================================================================== АЛТАРЬ (зона E)
  { id: "npc_selena", kind: "npc", npc: "selena", x: 1300, y: 2295, texture: "npc_selena", radius: 120, elevated: 26 },
  {
    id: "rune_sigil",
    kind: "gather",
    res: "rune_dust",
    amount: 1,
    respawnSec: 240,
    x: 1360,
    y: 2110,
    texture: "rune_sigil_01",
    radius: 95,
    gatherText: "\u041F\u044B\u043B\u044C \u043E\u0441\u044B\u043F\u0430\u043B\u0430\u0441\u044C \u0441 \u0440\u0443\u043D\u043D\u043E\u0439 \u043F\u043B\u0438\u0442\u044B."
  },
  // лёгкая плита: сдвинуть Телекинезом → под ней пыль (источник «Телекинез»)
  {
    id: "rune_slab",
    kind: "telekinesis",
    mode: "push",
    x: 1110,
    y: 2350,
    texture: "rune_slab_01",
    weight: "light",
    target: { x: 1050, y: 2405 },
    collide: { w: 80, h: 26 },
    hint: "\u0420\u0443\u043D\u043D\u0430\u044F \u043F\u043B\u0438\u0442\u0430",
    hiddenReward: { spawnPickup: { item: "rune_dust", amount: 2, texture: "icon_dust" } }
  },
  { id: "herb_a1", kind: "gather", res: "moon_herb", amount: 1, respawnSec: 150, x: 1050, y: 2650, texture: "moon_herb_01", radius: 90 },
  { id: "resin_a1", kind: "gather", res: "tree_resin", amount: 1, respawnSec: 200, x: 960, y: 2820, texture: "resin_log_01", collide: { w: 56, h: 18 }, radius: 100 },
  {
    id: "crystal_a1",
    kind: "gather",
    res: "lunar_shard",
    amount: 1,
    respawnSec: 420,
    x: 1450,
    y: 2400,
    texture: "field_crystal",
    radius: 100,
    gatherText: "\u041A\u0440\u0438\u0441\u0442\u0430\u043B\u043B \u043B\u0443\u043D\u043D\u043E\u0433\u043E \u0441\u0432\u0435\u0442\u0430 \u0434\u0430\u043B \u043E\u0441\u043A\u043E\u043B\u043E\u043A."
  },
  { id: "mush_a1", kind: "gather", res: "forest_mushroom", amount: 1, respawnSec: 200, x: 580, y: 2880, texture: "mushrooms_brown_01", radius: 90 },
  // ================================================================== ЗАПАДНЫЙ ЛЕС (зона J)
  { id: "mush_j1", kind: "gather", res: "forest_mushroom", amount: 1, respawnSec: 200, x: 200, y: 3400, texture: "mushrooms_brown_01", radius: 90 },
  { id: "resin_j1", kind: "gather", res: "tree_resin", amount: 1, respawnSec: 200, x: 430, y: 3760, texture: "resin_log_01", collide: { w: 56, h: 18 }, radius: 100 },
  {
    id: "hollow_cache",
    kind: "chest",
    x: 170,
    y: 3500,
    texture: "chest_01",
    collide: { w: 50, h: 24 },
    reward: { items: { forest_mushroom: 2, rune_dust: 1 }, coins: 10 }
  },
  // ================================================================== v0.10.0 — первая глава
  // +5 рунической пыли (ТЗ §7): тайник охранника огонька (+1, один раз), охраняемый запас старого леса (+2 за каждый
  // победный цикл Корневика rootling_02, раз в 600 с), тайник на подходе к Стражу (+2, один раз, его стережёт rootling_05).
  {
    id: "guard_cache",
    kind: "chest",
    x: 1400,
    y: 2690,
    texture: "chest_01",
    collide: { w: 50, h: 24 },
    requiresEnemyDefeated: "lunar_guard",
    reward: { items: { rune_dust: 1 } }
  },
  {
    id: "dust_stash",
    kind: "stash",
    guard: "rootling_02",
    x: 175,
    y: 3255,
    texture: "dust_stash_01",
    emptyTexture: "dust_stash_empty",
    collide: { w: 60, h: 20 },
    radius: 105,
    items: { rune_dust: 2 },
    hint: "\u0417\u0430\u043F\u0430\u0441 \u0440\u0443\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u043F\u044B\u043B\u0438"
  },
  {
    id: "approach_cache",
    kind: "chest",
    x: 530,
    y: 1890,
    texture: "chest_01",
    collide: { w: 50, h: 24 },
    requiresEnemyDefeated: "rootling_05",
    reward: { items: { rune_dust: 2 } }
  },
  // Астрал I: учебный камень у алтаря (появляется, когда знаки на воротах проявлены) и сердце рощи за воротами
  {
    id: "seal_sigil",
    kind: "seal_sigil",
    x: 1110,
    y: 2140,
    texture: "seal_sigil_dim",
    litTexture: "seal_sigil_lit",
    radius: 115,
    requiresEvent: "gate_marks_revealed",
    doneEvent: "seal_training_complete",
    hint: "\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C \u0410\u0441\u0442\u0440\u0430\u043B\u0430"
  },
  {
    id: "forest_node",
    kind: "forest_node",
    x: 1480,
    y: 300,
    texture: "forest_node_broken",
    restoredTexture: "forest_node_restored",
    collide: { w: 230, h: 46 },
    radius: 175,
    requiresEvent: "ancient_gate_open",
    hint: "\u0421\u0435\u0440\u0434\u0446\u0435 \u0440\u043E\u0449\u0438"
  }
];
var CONTENT_ENEMIES = [
  {
    id: "scavenger_02",
    enemy: "young_scavenger",
    x: 1460,
    y: 3580,
    radius: 120,
    startEvent: "hunter_threat_01",
    requiresEvent: "sq_hunter_start"
  },
  // v0.10.0: пять Корневиков старого леса — пять разных мест (история первой победы у каждого своя).
  // repeatSec — место возобновляемое: охрана возвращается через 600 с с уменьшенной наградой (ENEMIES.rootling.repeatRewards).
  { id: "rootling_01", enemy: "rootling", x: 490, y: 3660, radius: 130, repeatSec: 600 },
  { id: "rootling_02", enemy: "rootling", x: 300, y: 3250, radius: 130, repeatSec: 600 },
  // охраняет запас пыли
  { id: "rootling_03", enemy: "rootling", x: 500, y: 2740, radius: 130, repeatSec: 600 },
  { id: "rootling_04", enemy: "rootling", x: 330, y: 2380, radius: 130 },
  { id: "rootling_05", enemy: "rootling", x: 390, y: 1940, radius: 130 },
  // охраняет тайник на подходе к Стражу
  // испытание за воротами: Страж узла (три фазы, ENEMIES.node_guardian)
  {
    id: "node_trial",
    enemy: "node_guardian",
    x: 1220,
    y: 270,
    radius: 170,
    collide: { w: 170, h: 150 },
    scale: 1.5,
    requiresEvent: "ancient_gate_open",
    defeatEvent: "chapter_trial_defeated"
  }
];
var CACHE_RESOURCE_REWARDS = {
  glade_cache: { tree_resin: 1 },
  trail_cache: { forest_mushroom: 1 },
  west_chest: { rune_dust: 1 }
};

// src/config/world.layout.js
var WORLD = {
  width: 1800,
  height: 5400,
  playerStart: { x: 900, y: 5200 },
  defaultSafePoint: { x: 900, y: 4820 }
};
var ZONES = [
  { id: "A", name: "\u0414\u043E\u043C \u0432\u0435\u0434\u044C\u043C\u044B", x: 640, y: 4880, w: 520, h: 420, safePoint: { x: 900, y: 5150 }, interior: true },
  { id: "B", name: "\u0421\u0442\u0430\u0440\u0442\u043E\u0432\u0430\u044F \u043F\u043E\u043B\u044F\u043D\u0430", x: 0, y: 4100, w: 1800, h: 780, safePoint: { x: 900, y: 4820 } },
  { id: "C", name: "\u041B\u0435\u0441\u043D\u0430\u044F \u0442\u0440\u043E\u043F\u0430", x: 820, y: 3300, w: 880, h: 800, safePoint: { x: 1250, y: 3850 } },
  { id: "D", name: "\u041F\u0435\u0440\u0432\u0430\u044F \u0431\u043E\u0435\u0432\u0430\u044F \u043F\u043E\u043B\u044F\u043D\u0430", x: 820, y: 2700, w: 880, h: 600, safePoint: { x: 1250, y: 3850 } },
  { id: "E", name: "\u041B\u0443\u043D\u043D\u044B\u0439 \u0430\u043B\u0442\u0430\u0440\u044C", x: 820, y: 1880, w: 880, h: 820, safePoint: { x: 1250, y: 2330 } },
  { id: "H", name: "\u0414\u0440\u0435\u0432\u043D\u0438\u0439 \u043A\u0440\u0443\u0433 \u041E\u0433\u043D\u044F", x: 820, y: 1100, w: 880, h: 780, safePoint: { x: 1250, y: 1760 } },
  { id: "J", name: "\u041D\u043E\u0432\u0430\u044F \u0447\u0430\u0441\u0442\u044C \u043B\u0435\u0441\u0430", x: 100, y: 1640, w: 600, h: 2460, safePoint: { x: 400, y: 3900 } },
  { id: "K", name: "\u041F\u043E\u043B\u044F\u043D\u0430 \u041B\u0435\u0441\u043D\u043E\u0433\u043E \u0421\u0442\u0440\u0430\u0436\u0430", x: 100, y: 1100, w: 600, h: 540, safePoint: { x: 400, y: 1760 } },
  { id: "L", name: "\u0414\u0440\u0435\u0432\u043D\u0438\u0435 \u0432\u043E\u0440\u043E\u0442\u0430", x: 0, y: 0, w: 1800, h: 1100, safePoint: { x: 900, y: 820 } }
];
var BASE_INTERACTIVES = [
  // A
  { id: "magic_book", kind: "book", x: 900, y: 5050, texture: "magic_book_01", collide: { w: 44, h: 22 } },
  // B
  {
    id: "glade_rock",
    kind: "telekinesis",
    mode: "push",
    x: 1150,
    y: 4520,
    texture: "rock_medium_01",
    weight: "medium",
    target: { x: 1300, y: 4590 },
    collide: { w: 96, h: 40 },
    hiddenReward: { spawnPickup: { item: "coins", amount: 20, texture: "icon_coin" } },
    countsAsFirstInteraction: true
  },
  {
    id: "moon_plant",
    kind: "telekinesis",
    mode: "pull",
    x: 520,
    y: 4520,
    texture: "moon_plant_01",
    collide: { w: 30, h: 14 },
    weight: "light",
    reward: { items: { moon_herb: 1 } },
    countsAsFirstInteraction: true
  },
  { id: "glade_cache", kind: "chest", x: 1580, y: 4300, texture: "chest_01", reward: { items: { coins: 15 } }, collide: { w: 50, h: 24 } },
  {
    id: "corrupted_roots",
    kind: "fire",
    x: 400,
    y: 4120,
    texture: "corrupted_roots_01",
    collide: { w: 200, h: 70 },
    burnSec: 1.4,
    opensPath: "west_forest",
    lockedEvent: "fire_required_01",
    destroyEvent: "fire_gate_open",
    panOnOpen: { x: 400, y: 3800 },
    lockedText: "\u0427\u0451\u0440\u043D\u044B\u0435 \u043A\u043E\u0440\u043D\u0438 \u043D\u0435 \u043F\u043E\u0434\u0434\u0430\u044E\u0442\u0441\u044F. \u041D\u0443\u0436\u0435\u043D \u041E\u0433\u043E\u043D\u044C."
  },
  // C
  { id: "trail_cache", kind: "chest", x: 1660, y: 3640, texture: "chest_01", reward: { items: { coins: 20 } }, collide: { w: 50, h: 24 } },
  // E / F
  { id: "lunar_altar", kind: "altar", x: 1250, y: 2215, texture: "lunar_altar_01", radius: 130 },
  {
    id: "flame_a",
    kind: "telekinesis",
    mode: "pull",
    x: 1600,
    y: 2280,
    texture: "lunar_flame_01",
    elevated: 70,
    weight: "light",
    reward: { items: { lunar_flame: 1 } },
    requiresEvent: "lunar_quest_start",
    radius: 160,
    hint: "\u041E\u0433\u043E\u043D\u0451\u043A \u043D\u0430 \u0432\u044B\u0441\u043E\u043A\u043E\u0439 \u0432\u0435\u0442\u043A\u0435"
  },
  {
    id: "altar_stone",
    kind: "telekinesis",
    mode: "push",
    x: 960,
    y: 2480,
    texture: "rock_medium_01",
    weight: "medium",
    target: { x: 1060, y: 2580 },
    collide: { w: 96, h: 40 },
    hiddenReward: { spawnPickup: { item: "lunar_flame", amount: 1, texture: "lunar_flame_01" } }
  },
  {
    id: "flame_c",
    kind: "pickup",
    x: 1610,
    y: 2660,
    item: "lunar_flame",
    amount: 1,
    texture: "lunar_flame_01",
    requiresEvent: "lunar_quest_start",
    requiresEnemyDefeated: "lunar_guard"
  },
  // G
  {
    id: "heavy_boulder",
    kind: "telekinesis",
    mode: "push",
    x: 1250,
    y: 1990,
    texture: "heavy_boulder_01",
    weight: "heavy",
    target: { x: 1500, y: 2140 },
    collide: { w: 200, h: 110 },
    radius: 150,
    opensPath: "fire_circle_path",
    doneEvent: "heavy_path_open",
    lockedEvent: "heavy_blocked_01",
    panOnOpen: { x: 1250, y: 1600 }
  },
  // H
  { id: "fire_circle", kind: "fire_circle", x: 1250, y: 1580, texture: "fire_circle_01", radius: 140 },
  { id: "ritual_torch", kind: "fire", x: 1470, y: 1520, texture: "torch_01", persistent: true, collide: { w: 24, h: 16 } },
  {
    id: "dry_bush",
    kind: "fire",
    x: 1030,
    y: 1720,
    texture: "dry_bush_01",
    burnSec: 1,
    collide: { w: 56, h: 24 },
    reveal: { spawnPickup: { item: "crimson_ember", amount: 1, texture: "icon_ember" } }
  },
  // J
  { id: "moonstone", kind: "pickup", x: 220, y: 3450, item: "moonstone", amount: 1, texture: "icon_shard" },
  { id: "west_chest", kind: "chest", x: 600, y: 2960, texture: "chest_01", reward: { items: { coins: 40, lunar_shard: 2 }, heroXP: 15 }, collide: { w: 50, h: 24 } },
  // L
  // v0.10.0: ворота — настоящая преграда; состав проявляет знаки, Печать (20 маны) открывает проход к узлу
  {
    id: "ancient_gate",
    kind: "gate",
    x: 900,
    y: 440,
    texture: "ancient_gate_01",
    collide: { w: 280, h: 60 },
    radius: 190,
    requiresEvent: "guardian_defeated",
    openEvent: "ancient_gate_open",
    opensPath: "node_glade",
    panOnOpen: { x: 1200, y: 260 }
  }
];
for (const o of BASE_INTERACTIVES) {
  const extra = CACHE_RESOURCE_REWARDS[o.id];
  if (extra) o.reward = { ...o.reward, items: { ...o.reward.items || {}, ...extra } };
}
var INTERACTIVES = [...BASE_INTERACTIVES, ...CONTENT_INTERACTIVES];
var BASE_ENEMY_SPAWNS = [
  { id: "scavenger_01", enemy: "forest_scavenger", x: 1250, y: 3010, radius: 180, startEvent: "combat_intro_01" },
  {
    id: "lunar_guard",
    enemy: "young_scavenger",
    x: 1500,
    y: 2610,
    radius: 120,
    startEvent: "lunar_guard_01",
    requiresEvent: "lunar_quest_start"
  },
  {
    id: "forest_guardian_01",
    enemy: "forest_guardian",
    x: 400,
    y: 1400,
    radius: 230,
    collide: { w: 240, h: 80 },
    startEvent: "forest_guardian_01",
    defeatEvent: "guardian_defeated",
    opensPath: "gate_path",
    scale: 1.5
  }
];
var ENEMY_SPAWNS = [...BASE_ENEMY_SPAWNS, ...CONTENT_ENEMIES];

// src/config/balance.abilities.js
var WEIGHT_CLASSES = ["light", "medium", "heavy"];
var ABILITIES = {
  telekinesis: {
    name: "\u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437",
    color: "telekinesis",
    levels: {
      1: {
        label: "\u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437 I",
        damage: 20,
        manaCost: 14,
        cooldownSec: 5,
        castSec: 0.15,
        maxWeight: "medium",
        // в мире: light + medium; heavy — нет
        heavyObjectBonus: 0.5,
        // тяжёлый объект поля: +50% (20 + 10 = 30)
        throwDamageBonus: 0,
        interruptsNormalCast: true,
        canTargetBossDirectly: false
      },
      2: {
        label: "\u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437 II",
        damage: 20,
        manaCost: 14,
        cooldownSec: 5,
        castSec: 0.15,
        maxWeight: "heavy",
        // тяжёлые объекты и новые проходы
        heavyObjectBonus: 0.5,
        throwDamageBonus: 0.35,
        // +35% урона бросками
        interruptsNormalCast: true,
        canTargetBossDirectly: false
      },
      // v0.11.1: ступень III — «два броска подряд»: после первого броска второй доступен без перезарядки в течение windowSec
      // (мана тратится за каждый). Дальше игрок выбирает ветку (branches), её числа накладываются поверх этой ступени.
      3: {
        label: "\u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437 III",
        damage: 20,
        manaCost: 14,
        cooldownSec: 5,
        castSec: 0.15,
        maxWeight: "heavy",
        heavyObjectBonus: 0.5,
        throwDamageBonus: 0.35,
        doubleCast: { windowSec: 2.5 },
        interruptsNormalCast: true,
        canTargetBossDirectly: false
      }
    },
    // Ветки ступени III. Накладка на числа ступени: set — заменить, add — прибавить, mul — умножить. У каждой ветки есть цена.
    branches: {
      lord: {
        name: "\u041F\u043E\u0432\u0435\u043B\u0438\u0442\u0435\u043B\u044C",
        fromLevel: 3,
        text: "\u041C\u0430\u0441\u0442\u0435\u0440 \u043F\u0440\u0435\u0440\u044B\u0432\u0430\u043D\u0438\u0439: \u043A\u0430\u0436\u0434\u043E\u0435 \u0443\u0434\u0430\u0447\u043D\u043E\u0435 \u043F\u0440\u0435\u0440\u044B\u0432\u0430\u043D\u0438\u0435 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u043F\u043E\u043B\u043E\u0432\u0438\u043D\u0443 \u043C\u0430\u043D\u044B \u0438 \u0443\u0441\u043A\u043E\u0440\u044F\u0435\u0442 \u043F\u0435\u0440\u0435\u0437\u0430\u0440\u044F\u0434\u043A\u0443 \u043D\u0430 3 \u0441.",
        tradeoff: "\u041F\u0440\u044F\u043C\u043E\u0439 \u0443\u0440\u043E\u043D \u043D\u0438\u0436\u0435 \u043D\u0430 10%.",
        mul: { damage: 0.9 },
        set: { interruptRefund: { cooldownSec: 3, manaPct: 0.5 } }
      },
      breaker: {
        name: "\u0420\u0430\u0437\u0440\u0443\u0448\u0438\u0442\u0435\u043B\u044C",
        fromLevel: 3,
        text: "\u0411\u0440\u043E\u0441\u043A\u0438 \u043A\u0430\u043C\u043D\u0435\u0439 \u0431\u044C\u044E\u0442 \u0441\u0438\u043B\u044C\u043D\u0435\u0435: \u0443\u0440\u043E\u043D \u0431\u0440\u043E\u0441\u043A\u0430\u043C\u0438 +30% (\u0432\u043C\u0435\u0441\u0442\u0435 \u0441\u043E \u0441\u0442\u0443\u043F\u0435\u043D\u044C\u044E \u2014 +65%).",
        tradeoff: "\u041A\u0430\u0436\u0434\u044B\u0439 \u0431\u0440\u043E\u0441\u043E\u043A \u0441\u0442\u043E\u0438\u0442 \u043D\u0430 4 \u043C\u0430\u043D\u044B \u0431\u043E\u043B\u044C\u0448\u0435.",
        add: { throwDamageBonus: 0.3, manaCost: 4 }
      }
    }
  },
  fire: {
    name: "\u041E\u0433\u043E\u043D\u044C",
    color: "fire",
    levels: {
      1: {
        label: "\u041E\u0433\u043E\u043D\u044C I",
        damage: 18,
        manaCost: 24,
        cooldownSec: 8,
        castSec: 0.3,
        burn: { dps: 4, durationSec: 4 },
        // повторный Огонь обновляет длительность
        interruptsNormalCast: false
      },
      // v0.11.0: +25% урона (18 → 22), горение сильнее и дольше (16 → 30 урона за поджог). Мана и перезарядка прежние.
      2: {
        label: "\u041E\u0433\u043E\u043D\u044C II",
        damage: 22,
        manaCost: 24,
        cooldownSec: 8,
        castSec: 0.3,
        burn: { dps: 5, durationSec: 6 },
        interruptsNormalCast: false
      }
    }
  },
  // v0.10.1: «Печать» стала Астралом. Внутренний id остаётся 'seal' (сохранения, сервер, события unlock_seal_1 и т.п.),
  // игроку везде показывается «Астрал». В бою Астрал не прерывает атаки (это умеет только Телекинез): он бьёт силой,
  // которая игнорирует броню и защитную кору (Enemy.incomingMultiplier). Вне боя — открывает скрытое и пробуждает древнее.
  seal: {
    name: "\u0410\u0441\u0442\u0440\u0430\u043B",
    color: "seal",
    // v0.10.0: открывает Селена после проявления знаков на воротах (первая глава).
    levels: {
      1: {
        label: "\u0410\u0441\u0442\u0440\u0430\u043B I",
        damage: 25,
        manaCost: 20,
        cooldownSec: 10,
        castSec: 0.3,
        ignoresDefense: true,
        // броня и кора не гасят удар
        interruptsStrongCast: false
        // прерывать сильные атаки может только Телекинез
      },
      // v0.11.0: Астрал II — сильнее удар (25 → 35, +40%), чуть дороже по мане. Свойства прежние.
      2: {
        label: "\u0410\u0441\u0442\u0440\u0430\u043B II",
        damage: 35,
        manaCost: 22,
        cooldownSec: 10,
        castSec: 0.3,
        ignoresDefense: true,
        interruptsStrongCast: false
      }
    }
  }
};
var WORLD_MANA_COST = {
  gather: 4,
  // сбор узла: трава, грибы, смола, пыль, осколок
  pull: 4,
  // притянуть растение / небольшой предмет Телекинезом
  push: { light: 8, medium: 12, heavy: 20 },
  // сдвинуть камень по весу
  fire: 16,
  // Огонь по препятствию, корням, кусту, факелу
  seal: 20
  // v0.10.1: значимое применение Астрала (учебный камень, ворота, сердце рощи)
};
var SCHOOL_XP_PER_USE = {
  exploration: { telekinesis: 6, fire: 6, seal: 6 },
  combat: { telekinesis: 5, fire: 5, seal: 5 }
};

// src/config/storyItems.js
var STORY_ITEMS = {
  lunar_wick: {
    name: "\u041B\u0443\u043D\u043D\u044B\u0439 \u0444\u0438\u0442\u0438\u043B\u044C",
    icon: "icon_wick",
    color: 10480127,
    purpose: "\u0412\u0435\u0440\u043D\u0451\u0442 \u0441\u0432\u0435\u0442 \u041B\u0443\u043D\u043D\u043E\u043C\u0443 \u0430\u043B\u0442\u0430\u0440\u044E. \u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u0443 \u0430\u043B\u0442\u0430\u0440\u044F."
  },
  revealing_compound: {
    name: "\u0421\u043E\u0441\u0442\u0430\u0432 \u044F\u0441\u043D\u043E\u0433\u043E \u0432\u0437\u0433\u043B\u044F\u0434\u0430",
    icon: "icon_compound",
    color: 13214463,
    purpose: "\u041F\u043E\u043A\u0430\u0436\u0435\u0442 \u0441\u0442\u0451\u0440\u0442\u044B\u0439 \u0437\u043D\u0430\u043A \u043D\u0430 \u0414\u0440\u0435\u0432\u043D\u0438\u0445 \u0432\u043E\u0440\u043E\u0442\u0430\u0445. \u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u0443 \u0432\u043E\u0440\u043E\u0442 \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u0431\u0435\u0434\u044B \u043D\u0430\u0434 \u0421\u0442\u0440\u0430\u0436\u0435\u043C."
  },
  restoration_bundle: {
    name: "\u0426\u0435\u043B\u0435\u0431\u043D\u044B\u0439 \u0441\u0431\u043E\u0440",
    icon: "icon_bundle",
    color: 8118922,
    purpose: "\u0412\u044B\u043B\u0435\u0447\u0438\u0442 \u0441\u0435\u0440\u0434\u0446\u0435 \u0440\u043E\u0449\u0438 \u0437\u0430 \u0432\u043E\u0440\u043E\u0442\u0430\u043C\u0438 \u0432\u043C\u0435\u0441\u0442\u0435 \u0441 \u0410\u0441\u0442\u0440\u0430\u043B\u043E\u043C (20 \u043C\u0430\u043D\u044B)."
  }
};
var STORY_USES = {
  lunar_wick: {
    requires: ["lunar_quest_start"],
    blockedBy: ["lunar_quest_complete"],
    events: ["lunar_quest_complete"],
    // прежняя разовая награда алтаря + гарантия цены Телекинеза II по школьному опыту и осколкам (трава и пыль — сами)
    reward: { heroXP: 50, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 3 }, topUp: { school: { telekinesis: 150 }, items: { lunar_shard: 5 } } }
  },
  revealing_compound: {
    requires: ["guardian_defeated"],
    blockedBy: ["gate_marks_revealed"],
    events: ["gate_marks_revealed"],
    reward: { heroXP: 30 }
  },
  restoration_bundle: {
    requires: ["chapter_trial_defeated", "unlock_seal_1"],
    blockedBy: ["chapter_1_complete"],
    mana: 20,
    events: ["chapter_1_complete"],
    reward: { heroXP: 100, coins: 30, schoolXP: { seal: 40 } }
  }
};
var FIRST_CRAFT = { event: "first_craft_complete", reward: { heroXP: 15 } };
var MIGRATION_V10 = {
  event: "mig_v10",
  guardian: "forest_guardian_01",
  item: "rare_core",
  notIf: ["restoration_bundle_crafted", "chapter_1_complete"]
};
function worldRules() {
  const world = {};
  const base = (o) => ({
    requires: o.requiresEvent ? [o.requiresEvent] : [],
    requiresEnemy: o.requiresEnemyDefeated ? [o.requiresEnemyDefeated] : []
  });
  const itemReward = (item, amount) => item === "coins" ? { coins: amount } : { items: { [item]: amount } };
  const tkLevel = (weight) => {
    for (const [lvl, st] of Object.entries(ABILITIES.telekinesis.levels)) if (WEIGHT_CLASSES.indexOf(weight) <= WEIGHT_CLASSES.indexOf(st.maxWeight)) return Number(lvl);
    return 99;
  };
  const pickupAfter = (o, spawn, parentState) => {
    if (spawn) world[`${o.id}_reward`] = { kind: "loot", mark: "collected", reward: itemReward(spawn.item, spawn.amount || 1), parent: { id: o.id, state: parentState } };
  };
  for (const o of INTERACTIVES) {
    switch (o.kind) {
      case "gather":
        world[o.id] = { kind: "gather", item: o.res, amount: o.amount || 1, respawnSec: o.respawnSec ?? 180, mana: WORLD_MANA_COST.gather, ...base(o) };
        break;
      case "chest":
        world[o.id] = { kind: "loot", mark: "opened", reward: o.reward, ...base(o) };
        break;
      case "pickup":
        world[o.id] = { kind: "loot", mark: "collected", reward: itemReward(o.item, o.amount || 1), ...base(o) };
        break;
      case "inspect":
        if (o.first) world[o.id] = { kind: "loot", mark: "looted", reward: { items: o.first.items }, ...base(o) };
        break;
      case "stash":
        world[o.id] = { kind: "stash", guard: o.guard, items: o.items, ...base(o) };
        break;
      case "telekinesis": {
        const weight = o.weight || "light";
        const mana2 = o.mode === "pull" ? WORLD_MANA_COST.pull : WORLD_MANA_COST.push[weight] ?? WORLD_MANA_COST.push.light;
        if (o.mode === "pull") world[o.id] = { kind: "loot", mark: "collected", reward: o.reward || {}, mana: mana2, ability: "telekinesis", minLevel: tkLevel(weight), ...base(o) };
        else world[o.id] = { kind: "cast", mana: mana2, ability: "telekinesis", minLevel: tkLevel(weight), blockedBy: [], ...base(o) };
        pickupAfter(o, o.hiddenReward?.spawnPickup, "moved");
        break;
      }
      case "fire":
        world[o.id] = { kind: "cast", mana: WORLD_MANA_COST.fire, ability: "fire", minLevel: 1, blockedBy: [], ...base(o) };
        pickupAfter(o, o.reveal?.spawnPickup, "destroyed");
        break;
      case "gate":
        world[o.id] = {
          kind: "cast",
          mana: WORLD_MANA_COST.seal,
          ability: "seal",
          minLevel: 1,
          blockedBy: [o.openEvent],
          requires: ["guardian_defeated", "gate_marks_revealed", "unlock_seal_1", "seal_training_complete"],
          requiresEnemy: []
        };
        break;
      case "seal_sigil":
        world[o.id] = { kind: "cast", mana: WORLD_MANA_COST.seal, ability: "seal", minLevel: 1, blockedBy: [o.doneEvent], ...base(o) };
        break;
      default:
        break;
    }
  }
  return world;
}
function serverRules() {
  const recipes = Object.fromEntries(Object.entries(RECIPES).map(([id, r]) => [id, {
    result: r.result,
    amount: r.amount,
    needs: r.needs,
    requires: r.requires || [],
    crafted: r.crafted || null,
    blockedBy: r.blockedBy || []
  }]));
  const house = ZONES.find((z) => z.id === VITALS.houseZone);
  const vitals = {
    hpRegenPerSec: VITALS.hpRegenPerSec,
    manaRegenWorld: VITALS.manaRegenWorld,
    manaRegenHouse: VITALS.manaRegenHouse,
    house: { x: house.x, y: house.y, w: house.w, h: house.h },
    defeatHpFraction: HERO_RECOVERY.defeatHpFraction,
    staleCombatSec: VITALS.staleCombatSec
  };
  const potions = Object.fromEntries(Object.entries(POTIONS).filter(([, p]) => p.outside && (p.effect.type === "heal" || p.effect.type === "mana")).map(([id, p]) => [id, { kind: p.effect.type, amount: p.effect.amount }]));
  return { recipes, uses: STORY_USES, firstCraft: FIRST_CRAFT, migration: MIGRATION_V10, vitals, potions, world: worldRules() };
}

// src/config/balance.progression.js
var ITEMS = {
  coins: { name: "\u041C\u043E\u043D\u0435\u0442\u044B", icon: "icon_coin" },
  lunar_shard: { name: "\u041B\u0443\u043D\u043D\u044B\u0439 \u043E\u0441\u043A\u043E\u043B\u043E\u043A", icon: "icon_shard" },
  lunar_flame: { name: "\u041B\u0443\u043D\u043D\u044B\u0439 \u043E\u0433\u043E\u043D\u0451\u043A", icon: "lunar_flame_01" },
  moon_herb: { name: "\u041B\u0443\u043D\u043D\u0430\u044F \u0442\u0440\u0430\u0432\u0430", icon: "moon_plant_01" },
  crimson_ember: { name: "\u0411\u0430\u0433\u0440\u043E\u0432\u044B\u0439 \u0443\u0433\u043E\u043B\u044C", icon: "icon_ember" },
  moonstone: { name: "\u041B\u0443\u043D\u043D\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C (\u0440\u0435\u0434\u043A\u0438\u0439)", icon: "icon_shard" },
  rare_core: { name: "\u0420\u0435\u0434\u043A\u043E\u0435 \u044F\u0434\u0440\u043E", icon: "icon_core" },
  ...RESOURCE_ITEMS,
  // v0.8: лесные грибы, смола, пыль и расходники (названия лунной травы и осколка берутся отсюда)
  // v0.10.0: сюжетные предметы первой главы
  ...Object.fromEntries(Object.entries(STORY_ITEMS).map(([id, it]) => [id, { name: it.name, icon: it.icon }]))
};
var TIMER_MODE = "live";
var UPGRADES = {
  telekinesis_2: {
    ability: "telekinesis",
    toLevel: 2,
    title: "\u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437 II",
    description: "\u0422\u044F\u0436\u0451\u043B\u044B\u0435 \u043E\u0431\u044A\u0435\u043A\u0442\u044B, +35% \u0443\u0440\u043E\u043D\u0430 \u0431\u0440\u043E\u0441\u043A\u0430\u043C\u0438, \u043D\u043E\u0432\u044B\u0435 \u043F\u0440\u043E\u0445\u043E\u0434\u044B.",
    requires: { heroLevel: 3, abilityLevel: 1, event: "lunar_quest_complete" },
    // v0.8: к осколкам добавились травы и пыль. Осколки награда за алтарь догоняет сама (topUp),
    // а травы и пыль игрок собирает сам — они растут заново (world.resources.js), так что застрять нельзя.
    cost: { schoolXP: 150, items: { lunar_shard: 5, moon_herb: 2, rune_dust: 1 }, noTopUp: ["moon_herb", "rune_dust"] },
    timerSec: { prototype: 60, live: 5 * 60 },
    startEvent: "telekinesis_2_start",
    completeEvent: "telekinesis_2_complete",
    doneText: "\u0422\u0435\u043F\u0435\u0440\u044C \u043C\u043E\u0436\u043D\u043E \u0441\u0434\u0432\u0438\u043D\u0443\u0442\u044C \u0442\u044F\u0436\u0451\u043B\u0443\u044E \u0433\u043B\u044B\u0431\u0443 \u0437\u0430 \u0430\u043B\u0442\u0430\u0440\u0451\u043C."
  },
  // v0.11.0 — вторая ступень Огня и Астрала. Лесенка таймеров: Телекинез II 5 мин → Огонь II 15 мин → Астрал II 30 мин.
  // Начать изучение можно на экране «Дары» (кнопка в Сумке); одно изучение за раз.
  fire_2: {
    ability: "fire",
    toLevel: 2,
    title: "\u041E\u0433\u043E\u043D\u044C II",
    description: "\u0423\u0440\u043E\u043D \u0432\u044B\u0448\u0435 \u043F\u0440\u0438\u043C\u0435\u0440\u043D\u043E \u043D\u0430 \u0447\u0435\u0442\u0432\u0435\u0440\u0442\u044C, \u0433\u043E\u0440\u0435\u043D\u0438\u0435 \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u0438 \u0434\u043E\u043B\u044C\u0448\u0435.",
    requires: { heroLevel: 6, abilityLevel: 1 },
    // шесть углей: пять Корневиков дают по одному (и при повторных встречах тоже) + один из сухого куста у Круга
    cost: { schoolXP: 180, items: { crimson_ember: 6 } },
    timerSec: { prototype: 90, live: 15 * 60 },
    doneText: "\u041F\u043B\u0430\u043C\u044F \u0431\u044C\u0451\u0442 \u0441\u0438\u043B\u044C\u043D\u0435\u0435, \u0430 \u0433\u043E\u0440\u0435\u043D\u0438\u0435 \u0434\u0435\u0440\u0436\u0438\u0442\u0441\u044F \u0434\u043E\u043B\u044C\u0448\u0435."
  },
  // v0.11.1 — ступень III Телекинеза: две ветки, выбирается одна (после изучения вторая закрывается).
  // Цена общая. Осколки и пыль добываются в мире заново; уровень 7 игрок получает к концу главы I.
  telekinesis_3_lord: {
    ability: "telekinesis",
    toLevel: 3,
    branch: "lord",
    title: "\u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437 III \xB7 \u041F\u043E\u0432\u0435\u043B\u0438\u0442\u0435\u043B\u044C",
    description: "\u0414\u0432\u0430 \u0431\u0440\u043E\u0441\u043A\u0430 \u043F\u043E\u0434\u0440\u044F\u0434. \u0412\u0435\u0442\u043A\u0430 \xAB\u041F\u043E\u0432\u0435\u043B\u0438\u0442\u0435\u043B\u044C\xBB: \u0443\u0434\u0430\u0447\u043D\u043E\u0435 \u043F\u0440\u0435\u0440\u044B\u0432\u0430\u043D\u0438\u0435 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u043F\u043E\u043B\u043E\u0432\u0438\u043D\u0443 \u043C\u0430\u043D\u044B \u0438 \u0443\u0441\u043A\u043E\u0440\u044F\u0435\u0442 \u043F\u0435\u0440\u0435\u0437\u0430\u0440\u044F\u0434\u043A\u0443.",
    requires: { heroLevel: 7, abilityLevel: 2 },
    cost: { schoolXP: 250, items: { lunar_shard: 8, rune_dust: 3 } },
    timerSec: { prototype: 90, live: 60 * 60 },
    doneText: "\u0414\u0432\u0430 \u0431\u0440\u043E\u0441\u043A\u0430 \u043F\u043E\u0434\u0440\u044F\u0434. \u041A\u0430\u0436\u0434\u043E\u0435 \u0443\u0434\u0430\u0447\u043D\u043E\u0435 \u043F\u0440\u0435\u0440\u044B\u0432\u0430\u043D\u0438\u0435 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u043C\u0430\u043D\u0443 \u0438 \u0443\u0441\u043A\u043E\u0440\u044F\u0435\u0442 \u043F\u0435\u0440\u0435\u0437\u0430\u0440\u044F\u0434\u043A\u0443."
  },
  telekinesis_3_breaker: {
    ability: "telekinesis",
    toLevel: 3,
    branch: "breaker",
    title: "\u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437 III \xB7 \u0420\u0430\u0437\u0440\u0443\u0448\u0438\u0442\u0435\u043B\u044C",
    description: "\u0414\u0432\u0430 \u0431\u0440\u043E\u0441\u043A\u0430 \u043F\u043E\u0434\u0440\u044F\u0434. \u0412\u0435\u0442\u043A\u0430 \xAB\u0420\u0430\u0437\u0440\u0443\u0448\u0438\u0442\u0435\u043B\u044C\xBB: \u0431\u0440\u043E\u0441\u043A\u0438 \u043A\u0430\u043C\u043D\u0435\u0439 \u0431\u044C\u044E\u0442 \u043D\u0430 30% \u0441\u0438\u043B\u044C\u043D\u0435\u0435, \u043D\u043E \u0441\u0442\u043E\u044F\u0442 \u043D\u0430 4 \u043C\u0430\u043D\u044B \u0431\u043E\u043B\u044C\u0448\u0435.",
    requires: { heroLevel: 7, abilityLevel: 2 },
    cost: { schoolXP: 250, items: { lunar_shard: 8, rune_dust: 3 } },
    timerSec: { prototype: 90, live: 60 * 60 },
    doneText: "\u0414\u0432\u0430 \u0431\u0440\u043E\u0441\u043A\u0430 \u043F\u043E\u0434\u0440\u044F\u0434, \u0438 \u043A\u0430\u0436\u0434\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C \u0431\u044C\u0451\u0442 \u0437\u0430\u043C\u0435\u0442\u043D\u043E \u0441\u0438\u043B\u044C\u043D\u0435\u0435."
  },
  seal_2: {
    ability: "seal",
    toLevel: 2,
    title: "\u0410\u0441\u0442\u0440\u0430\u043B II",
    description: "+40% \u0443\u0440\u043E\u043D\u0430: \u0410\u0441\u0442\u0440\u0430\u043B \u0431\u044C\u0451\u0442 \u0435\u0449\u0451 \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u0438 \u0432\u0441\u0451 \u0442\u0430\u043A \u0436\u0435 \u043F\u0440\u043E\u0431\u0438\u0432\u0430\u0435\u0442 \u0437\u0430\u0449\u0438\u0442\u0443.",
    requires: { heroLevel: 7, abilityLevel: 1 },
    cost: { schoolXP: 100, items: { lunar_shard: 6 } },
    timerSec: { prototype: 90, live: 30 * 60 },
    doneText: "\u0410\u0441\u0442\u0440\u0430\u043B \u0440\u0430\u0437\u0438\u0442 \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u2014 \u0442\u0435\u043D\u044C \u0425\u0440\u0430\u043D\u0438\u0442\u0435\u043B\u044F \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u0437\u0430\u0449\u0438\u0442\u0430."
  }
};
var BRANCH_RESPEC = { coins: 150 };
var EVENT_REWARDS = {
  first_world_interaction: { heroXP: 10 },
  lunar_quest_complete: { heroXP: 50, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 3 }, topUpFor: "telekinesis_2" },
  telekinesis_2_complete: { heroXP: 30 },
  heavy_path_open: { heroXP: 20 },
  unlock_fire_1: { heroXP: 30 },
  fire_gate_open: { heroXP: 20, schoolXP: { fire: 20 } },
  // v0.10.0: Селена открывает Печать I сюжетно — без уровня, платы и таймера. Учебный знак и ворота дают только
  // обычный школьный опыт мира (+6), отдельной награды «за обучение» нет.
  unlock_seal_1: { heroXP: 60 }
};

// src/config/game.config.js
var SAVE = {
  key: "witch_rpg_proto_save_v1",
  autosaveIntervalMs: 5e3
};

// src/state/vitals.js
var finite = (v) => typeof v === "number" && Number.isFinite(v);
var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
var maxHp = (state) => state.heroStats().maxHp;
var maxMana = (state) => state.heroStats().maxMana;
function hp(state) {
  const m = maxHp(state);
  const v = state.data.hp;
  return finite(v) ? clamp(v, 0, m) : m;
}
function mana(state) {
  const m = maxMana(state);
  const v = state.data.mana;
  return finite(v) ? clamp(v, 0, m) : m;
}
function setHp(state, v) {
  state.data.hp = clamp(finite(v) ? v : 0, 0, maxHp(state));
  return state.data.hp;
}
function setMana(state, v) {
  state.data.mana = clamp(finite(v) ? v : 0, 0, maxMana(state));
  return state.data.mana;
}
function materialize(state) {
  setHp(state, hp(state));
  setMana(state, mana(state));
}

// src/state/GameState.js
var SAVE_VERSION = 1;
function createDefaultState(heroId = DEFAULT_HERO_ID) {
  return {
    version: SAVE_VERSION,
    // v0.9.2: герой без сервера (режим разработки). Старое сохранение без поля — ведьма (подставляется при load).
    // Онлайн герой — метаданные профиля (PlayerSession.hero), в прогресс и patch на сервер не входит.
    heroId,
    heroLevel: 1,
    heroXP: 0,
    telekinesisLevel: 0,
    fireLevel: 0,
    sealLevel: 0,
    schoolXP: { telekinesis: 0, fire: 0, seal: 0 },
    unlockedAbilities: [],
    completedEvents: [],
    openedPaths: [],
    defeatedEnemies: [],
    inventory: { coins: 0, lunar_shard: 0, lunar_flame: 0 },
    // состояние отдельных объектов мира: { [id]: { state, x, y } }
    worldObjects: {},
    research: null,
    // { upgradeId, startedAt, durationMs }
    player: { x: WORLD.playerStart.x, y: WORLD.playerStart.y },
    safePoint: { ...WORLD.defaultSafePoint },
    hp: null,
    // null = полное (старые сохранения и новый персонаж); дальше — число 0…max (v0.9: общее для мира и боя)
    mana: null,
    // v0.9: текущая мана, та же семантика
    vitalsClock: null,
    // v0.12.0: мс, на которые верны hp и mana (настенные часы клиента)
    combatSince: null,
    // v0.12.0: сервер знает, что бой идёт (HP и мана стоят)
    stats: { playTimeMs: 0, combats: [] },
    tutorial: []
    // id показанных подсказок (TutorialSystem)
  };
}
var GameState = class {
  /**
   * storage — только для режима без сервера (разработка): тогда прогресс лежит в localStorage этого браузера.
   * В онлайн-режиме storage = null: данные приходят с сервера (PlayerSession → setData), а save() лишь сообщает
   * подписчикам, что прогресс изменился, — дальше его отправляет на сервер PlayerSession.
   */
  constructor(storage = null, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
    this.data = createDefaultState();
    this.listeners = /* @__PURE__ */ new Set();
    this.saveListeners = /* @__PURE__ */ new Set();
  }
  // ---------- persistence ----------
  /** Подписка на каждое сохранение (онлайн-режим: PlayerSession отправляет изменения на сервер). */
  onSave(fn) {
    this.saveListeners.add(fn);
    return () => this.saveListeners.delete(fn);
  }
  load() {
    if (!this.storage) return false;
    try {
      const raw = this.storage.getItem(SAVE.key);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed.version !== SAVE_VERSION) return false;
      this.data = { ...createDefaultState(), ...parsed };
      return true;
    } catch (e) {
      console.warn("[GameState] load failed", e);
      return false;
    }
  }
  hasSave() {
    try {
      return !!(this.storage && this.storage.getItem(SAVE.key));
    } catch (e) {
      return false;
    }
  }
  save() {
    if (this.storage) {
      try {
        this.storage.setItem(SAVE.key, JSON.stringify(this.data));
      } catch (e) {
      }
    }
    this.saveListeners.forEach((fn) => fn(this.data));
  }
  /**
   * Подменяет данные состоянием с сервера. Объект data остаётся тем же (меняются поля), поэтому ссылки на него
   * в сценах не устаревают. Подписчиков save() не зовёт — иначе полученное тут же ушло бы обратно.
   */
  setData(next) {
    const d = { ...createDefaultState(), ...next };
    for (const k of Object.keys(this.data)) if (!(k in d)) delete this.data[k];
    Object.assign(this.data, d);
    this.changed("replace");
  }
  /** Новая игра. heroId — выбранный герой (без него — ведьма). */
  reset(heroId = DEFAULT_HERO_ID) {
    this.data = createDefaultState(typeof heroId === "string" && heroId ? heroId : DEFAULT_HERO_ID);
    if (this.storage) this.storage.removeItem(SAVE.key);
    this.changed("reset");
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed(reason) {
    this.listeners.forEach((fn) => fn(reason, this));
  }
  // ---------- events / flags ----------
  hasEvent(key) {
    return this.data.completedEvents.includes(key);
  }
  markEvent(key) {
    if (this.hasEvent(key)) return false;
    this.data.completedEvents.push(key);
    return true;
  }
  isPathOpen(id) {
    return this.data.openedPaths.includes(id);
  }
  openPath(id) {
    if (!this.isPathOpen(id)) this.data.openedPaths.push(id);
  }
  isEnemyDefeated(id) {
    return this.data.defeatedEnemies.includes(id);
  }
  markEnemyDefeated(id) {
    if (!this.isEnemyDefeated(id)) this.data.defeatedEnemies.push(id);
  }
  getObject(id) {
    return this.data.worldObjects[id] || null;
  }
  setObject(id, patch) {
    this.data.worldObjects[id] = { ...this.data.worldObjects[id] || {}, ...patch };
  }
  // ---------- inventory ----------
  item(id) {
    return this.data.inventory[id] || 0;
  }
  addItem(id, amount = 1) {
    this.data.inventory[id] = this.item(id) + amount;
  }
  removeItem(id, amount = 1) {
    if (this.item(id) < amount) return false;
    this.data.inventory[id] -= amount;
    return true;
  }
  flamesCollected() {
    return this.item("lunar_flame");
  }
  // ---------- hero ----------
  levelRow(level = this.data.heroLevel) {
    return HERO_LEVELS.find((r) => r.level === level) || HERO_LEVELS[HERO_LEVELS.length - 1];
  }
  heroStats() {
    const r = this.levelRow();
    return { maxHp: r.maxHp, maxMana: r.maxMana, manaRegen: r.manaRegen, damageMult: r.damageMult };
  }
  nextLevelXP() {
    const next = HERO_LEVELS.find((r) => r.level === this.data.heroLevel + 1);
    return next ? next.xp : null;
  }
  /** Добавляет опыт героя. Возвращает список новых уровней. */
  addHeroXP(amount) {
    this.data.heroXP += amount;
    const gained = [];
    for (; ; ) {
      const next = HERO_LEVELS.find((r) => r.level === this.data.heroLevel + 1);
      if (!next || this.data.heroXP < next.xp) break;
      if (!gained.length) materialize(this);
      this.data.heroLevel = next.level;
      gained.push(next);
    }
    return gained;
  }
  addSchoolXP(school, amount) {
    this.data.schoolXP[school] = (this.data.schoolXP[school] || 0) + amount;
  }
  // ---------- abilities ----------
  abilityLevel(id) {
    return this.data[`${id}Level`] || 0;
  }
  isUnlocked(id) {
    return this.data.unlockedAbilities.includes(id) && this.abilityLevel(id) > 0;
  }
  unlockAbility(id, level = 1) {
    if (!this.data.unlockedAbilities.includes(id)) this.data.unlockedAbilities.push(id);
    this.data[`${id}Level`] = Math.max(this.abilityLevel(id), level);
  }
  /**
   * Применяет награду { heroXP, schoolXP:{}, items:{}, coins, topUpFor }.
   * Возвращает { levelUps, granted } для UI.
   */
  applyReward(reward = {}) {
    const granted = { heroXP: 0, schoolXP: {}, items: {} };
    if (reward.schoolXP) for (const [k, v] of Object.entries(reward.schoolXP)) {
      this.addSchoolXP(k, v);
      granted.schoolXP[k] = v;
    }
    if (reward.items) for (const [k, v] of Object.entries(reward.items)) {
      if (v > 0) {
        this.addItem(k, v);
        granted.items[k] = v;
      }
    }
    if (reward.coins) {
      this.addItem("coins", reward.coins);
      granted.items.coins = (granted.items.coins || 0) + reward.coins;
    }
    if (reward.topUpFor) {
      const up = UPGRADES[reward.topUpFor];
      if (up) {
        const school = up.ability;
        const needXP = up.cost.schoolXP - (this.data.schoolXP[school] || 0);
        if (needXP > 0) {
          this.addSchoolXP(school, needXP);
          granted.schoolXP[school] = (granted.schoolXP[school] || 0) + needXP;
        }
        for (const [k, v] of Object.entries(up.cost.items || {})) {
          if (up.cost.noTopUp?.includes(k)) continue;
          const need = v - this.item(k);
          if (need > 0) {
            this.addItem(k, need);
            granted.items[k] = (granted.items[k] || 0) + need;
          }
        }
      }
    }
    let levelUps = [];
    if (reward.heroXP) {
      levelUps = this.addHeroXP(reward.heroXP);
      granted.heroXP = reward.heroXP;
    }
    return { levelUps, granted };
  }
  // ---------- research (таймер изучения дара) ----------
  upgradeStatus(upgradeId) {
    const up = UPGRADES[upgradeId];
    if (!up) return { ok: false, reason: "unknown" };
    if (up.locked) return { ok: false, reason: "locked" };
    if (this.abilityLevel(up.ability) >= up.toLevel) return { ok: false, reason: "done" };
    if (this.data.research) return { ok: false, reason: this.data.research.upgradeId === upgradeId ? "in_progress" : "busy" };
    const r = up.requires || {};
    const checks = [];
    if (r.heroLevel) checks.push({ label: `\u0423\u0440\u043E\u0432\u0435\u043D\u044C ${r.heroLevel}`, have: this.data.heroLevel, need: r.heroLevel });
    if (r.abilityLevel) checks.push({ label: `${up.ability} ${r.abilityLevel}`, have: this.abilityLevel(up.ability), need: r.abilityLevel, hidden: true });
    checks.push({ label: "\u041E\u043F\u044B\u0442 \u0434\u0430\u0440\u0430", have: this.data.schoolXP[up.ability] || 0, need: up.cost.schoolXP });
    for (const [k, v] of Object.entries(up.cost.items || {})) checks.push({ label: k, item: k, have: this.item(k), need: v });
    const eventOk = !r.event || this.hasEvent(r.event);
    const ok = eventOk && checks.every((c) => c.have >= c.need);
    return { ok, reason: ok ? "ready" : eventOk ? "missing" : "event", checks };
  }
  startResearch(upgradeId) {
    const st = this.upgradeStatus(upgradeId);
    if (!st.ok) return false;
    const up = UPGRADES[upgradeId];
    this.data.schoolXP[up.ability] -= up.cost.schoolXP;
    for (const [k, v] of Object.entries(up.cost.items || {})) this.removeItem(k, v);
    this.data.research = { upgradeId, startedAt: this.now(), durationMs: up.timerSec[TIMER_MODE] * 1e3 };
    return true;
  }
  researchRemainingMs() {
    const r = this.data.research;
    if (!r) return 0;
    return Math.max(0, r.startedAt + r.durationMs - this.now());
  }
  /** Завершает исследование, если таймер истёк. Возвращает upgradeId или null. */
  completeResearchIfReady(force = false) {
    const r = this.data.research;
    if (!r) return null;
    if (!force && this.researchRemainingMs() > 0) return null;
    const up = UPGRADES[r.upgradeId];
    this.unlockAbility(up.ability, up.toLevel);
    if (up.branch) this.setBranch(up.ability, up.branch);
    this.data.research = null;
    return r.upgradeId;
  }
  // ---------- билд: ветки даров (v0.11.1) ----------
  // Хранится как объект мира 'player_build' ({ branches: { telekinesis: 'lord' } }): он уже сохраняется на сервере
  // («последний записал»), поэтому схему базы менять не пришлось. Слоты и амулеты лягут туда же.
  buildData() {
    const b = this.getObject("player_build");
    return { branches: { ...b && typeof b.branches === "object" && b.branches ? b.branches : {} } };
  }
  /** Выбранная ветка дара или null. Ветка действует, только пока она есть в данных дара и ступень её достигла. */
  branchOf(abilityId) {
    const id = this.buildData().branches[abilityId];
    const br = id && ABILITIES[abilityId]?.branches?.[id];
    return br && this.abilityLevel(abilityId) >= (br.fromLevel || 1) ? id : null;
  }
  setBranch(abilityId, branchId) {
    const b = this.buildData();
    b.branches[abilityId] = branchId;
    this.setObject("player_build", { branches: b.branches });
  }
  /** Смена ветки за монеты. Не в бою — это проверяет окно (в бою кнопки нет). */
  respecBranch(abilityId, branchId) {
    const br = ABILITIES[abilityId]?.branches?.[branchId];
    const cur = this.branchOf(abilityId);
    if (!br || !cur || this.abilityLevel(abilityId) < (br.fromLevel || 1)) return { ok: false, reason: "unavailable" };
    if (cur === branchId) return { ok: false, reason: "same" };
    if (this.item("coins") < BRANCH_RESPEC.coins) return { ok: false, reason: "coins", need: BRANCH_RESPEC.coins };
    this.removeItem("coins", BRANCH_RESPEC.coins);
    this.setBranch(abilityId, branchId);
    return { ok: true, price: BRANCH_RESPEC.coins };
  }
};

// src/cloud/playerModel.js
var RULES = serverRules();
var ABILITY_IDS = ["telekinesis", "fire", "seal"];
var SCHOOL_IDS = ["telekinesis", "fire", "seal"];
var uniq = (a) => [...new Set(a)];
function emptySnapshot() {
  return toSnapshot(createDefaultState());
}
function toSnapshot(d) {
  const abilities = {};
  for (const id of ABILITY_IDS) abilities[id] = { level: d[`${id}Level`] || 0, unlocked: (d.unlockedAbilities || []).includes(id) };
  return {
    level: d.heroLevel,
    xp: d.heroXP,
    school: { ...SCHOOL_IDS.reduce((o, k) => ({ ...o, [k]: 0 }), {}), ...d.schoolXP || {} },
    abilities,
    inventory: { ...d.inventory || {} },
    quests: uniq(d.completedEvents || []),
    paths: uniq(d.openedPaths || []),
    enemies: uniq(d.defeatedEnemies || []),
    objects: JSON.parse(JSON.stringify(d.worldObjects || {})),
    research: d.research ? { ...d.research } : null,
    pos: { x: d.player?.x ?? 0, y: d.player?.y ?? 0 },
    safe: { x: d.safePoint?.x ?? 0, y: d.safePoint?.y ?? 0 },
    hp: d.hp ?? null,
    mana: d.mana ?? null,
    vitalsAt: d.vitalsClock ?? null,
    // v0.12.0: момент (мс), на который верны hp и mana
    combatSince: d.combatSince ?? null,
    // v0.12.0: начало боя, о завершении которого сервер ещё не знает
    combatCtx: d.combatCtx ?? null,
    // v0.14.0: что сервер запомнил о герое в начале боя (по этому проверяется запись боя)
    play: d.stats?.playTimeMs || 0,
    combats: (d.stats?.combats || []).map((c) => ({ ...c })),
    tutorial: uniq(d.tutorial || [])
  };
}
function fromSnapshot(s, base = createDefaultState()) {
  const d = { ...base };
  d.heroLevel = s.level;
  d.heroXP = s.xp;
  d.schoolXP = { ...base.schoolXP, ...s.school || {} };
  d.unlockedAbilities = [];
  for (const id of ABILITY_IDS) {
    const a = s.abilities?.[id] || { level: 0, unlocked: false };
    d[`${id}Level`] = a.level || 0;
    if (a.unlocked) d.unlockedAbilities.push(id);
  }
  d.inventory = { ...base.inventory, ...s.inventory || {} };
  d.completedEvents = [...s.quests || []];
  d.openedPaths = [...s.paths || []];
  d.defeatedEnemies = [...s.enemies || []];
  d.worldObjects = JSON.parse(JSON.stringify(s.objects || {}));
  d.research = s.research ? { ...s.research } : null;
  d.player = { x: s.pos.x, y: s.pos.y };
  d.safePoint = { x: s.safe.x, y: s.safe.y };
  d.hp = s.hp ?? null;
  d.mana = s.mana ?? null;
  d.vitalsClock = s.vitalsAt ?? null;
  d.combatSince = s.combatSince ?? null;
  d.combatCtx = s.combatCtx ?? null;
  d.stats = { playTimeMs: s.play || 0, combats: (s.combats || []).map((c) => ({ ...c })) };
  d.tutorial = [...s.tutorial || []];
  return d;
}
var COMBAT_POTIONS = ["elixir_life", "elixir_mana", "resin_flask"];
function fillDefaults(raw) {
  const def = emptySnapshot();
  const { meta, action, ...s } = raw;
  return {
    snapshot: {
      ...def,
      ...s,
      school: { ...def.school, ...s.school || {} },
      abilities: { ...def.abilities, ...s.abilities || {} },
      inventory: { ...def.inventory, ...s.inventory || {} },
      pos: s.pos || def.pos,
      safe: s.safe || def.safe,
      hp: s.hp ?? null,
      mana: s.mana ?? null,
      // нет поля (старая схема) — «полный запас»; числовой 0 сохраняется
      vitalsAt: s.vitalsAt ?? null,
      combatSince: s.combatSince ?? null,
      combatCtx: s.combatCtx ?? null
    },
    meta: meta || {},
    action: action || null
  };
}

// src/config/balance.enemies.js
var ENEMIES = {
  forest_scavenger: {
    name: "\u041B\u0435\u0441\u043D\u043E\u0439 \u041F\u0430\u0434\u0430\u043B\u044C\u0449\u0438\u043A",
    texture: "enemy_scavenger",
    tier: "normal",
    // v0.10.0: первая встреча мягче (обучение до Огня) — 160 HP вместо 190, обычный удар 8 вместо 10, первый рывок через 6 с вместо 5
    hp: 160,
    normalAttack: { damage: 8, intervalSec: 3 },
    strongAttack: {
      name: "\u0420\u044B\u0432\u043E\u043A",
      damage: 24,
      prepSec: 2,
      cooldownSec: 9,
      firstDelaySec: 6,
      interruptBy: ["telekinesis"],
      hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!"
    },
    staggerSec: 1,
    interruptedCooldownSec: 6,
    defense: 0,
    rewards: { heroXP: 70, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 1 }, coins: 15 },
    arena: "glade"
  },
  // [ПРОТОТИП] «Маленький враг» у огонька C (Blueprint, зона E). В Combat Math не описан —
  // ослабленная версия Падальщика, бой ~12–18 сек.
  young_scavenger: {
    name: "\u041C\u043E\u043B\u043E\u0434\u043E\u0439 \u041F\u0430\u0434\u0430\u043B\u044C\u0449\u0438\u043A",
    texture: "enemy_scavenger_small",
    tier: "normal",
    hp: 110,
    normalAttack: { damage: 8, intervalSec: 3 },
    strongAttack: {
      name: "\u0420\u044B\u0432\u043E\u043A",
      damage: 18,
      prepSec: 2,
      cooldownSec: 10,
      firstDelaySec: 4,
      interruptBy: ["telekinesis"],
      hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!"
    },
    staggerSec: 1,
    interruptedCooldownSec: 6,
    defense: 0,
    rewards: { heroXP: 40, schoolXP: { telekinesis: 30 }, items: { lunar_shard: 1 }, coins: 10 },
    arena: "glade_small"
  },
  // Враг со слабостью из Combat Math §7. v0.10.0: пять Корневиков в старом лесу (world.layout.js, rootling_01…05).
  // Защита 20%, Огонь +50% и снимает защиту на 6 с. Первая победа на месте — rewards; повторная (возобновляемые места) — repeatRewards.
  rootling: {
    name: "\u041A\u043E\u0440\u043D\u0435\u0432\u0438\u043A",
    texture: "enemy_rootling",
    tier: "normal",
    hp: 230,
    normalAttack: { damage: 10, intervalSec: 3 },
    strongAttack: null,
    staggerSec: 0.8,
    defense: 0.2,
    weaknesses: { fire: 0.5 },
    onFireHit: { disableDefenseSec: 6 },
    rewards: { heroXP: 60, schoolXP: { fire: 30 }, items: { tree_resin: 1, crimson_ember: 1 }, coins: 15 },
    repeatRewards: { heroXP: 20, schoolXP: { fire: 3 }, items: { tree_resin: 1, crimson_ember: 1 }, coins: 6 },
    arena: "glade"
  },
  // Первый сильный противник прототипа (Blueprint, зона K «Поляна Лесного Стража»).
  // Числа — из «Сильный противник — Каменный Страж» (Combat Math §8): 420 HP, броня −45%,
  // кристалл разбивается Телекинезом → броня отключена 8 сек.
  // [АДАПТАЦИЯ] Полный босс Лесной Страж (1050 HP, фаза 3 требует Печать) в прототип не входит.
  // От него взято только правило: тяжёлый удар прерывается Телекинезом только через тяжёлый объект.
  // Чтобы включить «Огонь снимает кору» (фаза 2 босса), добавьте:
  //   onFireHit: { vulnerability: { bonus: 0.3, durationSec: 8 } }
  forest_guardian: {
    name: "\u041B\u0435\u0441\u043D\u043E\u0439 \u0421\u0442\u0440\u0430\u0436",
    texture: "enemy_guardian",
    tier: "strong",
    hp: 420,
    normalAttack: { damage: 14, intervalSec: 4.5 },
    // [АДАПТАЦИЯ] интервал в Combat Math не задан; 3 с делали бой непроходимым при HP героя 138
    strongAttack: {
      name: "\u0422\u044F\u0436\u0451\u043B\u044B\u0439 \u0443\u0434\u0430\u0440",
      damage: 32,
      prepSec: 2.5,
      cooldownSec: 10,
      firstDelaySec: 6,
      interruptBy: ["telekinesis_heavy"],
      hint: "\u0411\u0440\u043E\u0441\u044C\u0442\u0435 \u0442\u044F\u0436\u0451\u043B\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C!"
    },
    staggerSec: 1.2,
    interruptedCooldownSec: 7,
    defense: 0,
    armor: { value: 0.45, source: "crystal", disabledSec: 8 },
    rewards: { heroXP: 150, schoolXP: { telekinesis: 60, fire: 60 }, items: { rare_core: 1, lunar_shard: 3 }, coins: 60 },
    arena: "guardian"
  },
  // v0.10.0 — финальное испытание первой главы за Древними воротами. 900 HP (не старый босс на 1050), три фазы.
  // Параметры фаз — здесь, логика — objects/Enemy.js (phaseFor/applyPhase/checkPhase). Фаза i действует, пока HP > above.
  // Общие: обычная атака 12 / 4,5 с; сильная подготовка 2,5 с, КД 10 с, первая через 6 с; после прерывания — 7 с.
  node_guardian: {
    name: "\u0425\u0440\u0430\u043D\u0438\u0442\u0435\u043B\u044C \u0441\u0435\u0440\u0434\u0446\u0430",
    texture: "enemy_guardian",
    tint: 12577244,
    tier: "strong",
    hp: 900,
    normalAttack: { damage: 12, intervalSec: 4.5 },
    strongAttack: {
      name: "\u0423\u0434\u0430\u0440 \u0425\u0440\u0430\u043D\u0438\u0442\u0435\u043B\u044F",
      damage: 30,
      prepSec: 2.5,
      cooldownSec: 10,
      firstDelaySec: 6,
      interruptBy: ["telekinesis_heavy"],
      hint: "\u0411\u0440\u043E\u0441\u044C\u0442\u0435 \u0442\u044F\u0436\u0451\u043B\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C!"
    },
    staggerSec: 1.2,
    interruptedCooldownSec: 7,
    defense: 0,
    phases: [
      {
        above: 600,
        set: { armor: { value: 0.45, source: "crystal", disabledSec: 8 }, defense: 0, weaknesses: null, onFireHit: null },
        message: "\u041A\u0440\u0438\u0441\u0442\u0430\u043B\u044C\u043D\u0430\u044F \u0431\u0440\u043E\u043D\u044F! \u0420\u0430\u0437\u0431\u0435\u0439\u0442\u0435 \u043A\u0440\u0438\u0441\u0442\u0430\u043B\u043B \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C."
      },
      {
        above: 300,
        set: { armor: null, defense: 0.2, weaknesses: { fire: 0.5 }, onFireHit: { disableDefenseSec: 6 } },
        message: "\u0411\u0440\u043E\u043D\u044F \u043E\u0441\u044B\u043F\u0430\u043B\u0430\u0441\u044C, \u043D\u043E \u043A\u043E\u0440\u0430 \u043A\u0440\u0435\u043F\u043A\u0430. \u041E\u0433\u043E\u043D\u044C \u0432\u044B\u0436\u0436\u0435\u0442 \u0435\u0451, \u0430 \u0410\u0441\u0442\u0440\u0430\u043B \u043F\u0440\u043E\u0431\u044C\u0451\u0442 \u043D\u0430\u0441\u043A\u0432\u043E\u0437\u044C!",
        tint: 14726282
      },
      // v0.10.1: «тень вместо плоти» — обычные удары вязнут (защита 40%), Астрал игнорирует её и бьёт на 50% сильнее
      {
        above: 0,
        set: { armor: null, defense: 0.4, weaknesses: { seal: 0.5 }, onFireHit: null },
        strongAttack: { damage: 36, interruptBy: ["telekinesis"], hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!" },
        message: "\u0422\u0435\u043D\u044C \u0432\u043C\u0435\u0441\u0442\u043E \u043F\u043B\u043E\u0442\u0438! \u041E\u0431\u044B\u0447\u043D\u044B\u0435 \u0443\u0434\u0430\u0440\u044B \u0432\u044F\u0437\u043D\u0443\u0442 \u2014 \u043F\u0440\u043E\u0431\u0438\u0432\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0410\u0441\u0442\u0440\u0430\u043B. \u0421\u0438\u043B\u044C\u043D\u044B\u0439 \u0443\u0434\u0430\u0440 \u043F\u0440\u0435\u0440\u044B\u0432\u0430\u0435\u0442 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437.",
        tint: 13805823
      }
    ],
    rewards: { heroXP: 220, schoolXP: { telekinesis: 30, fire: 30, seal: 40 }, coins: 80 },
    arena: "node"
  }
};
var FIELD_OBJECTS = {
  light_rock: { name: "\u041A\u0430\u043C\u0435\u043D\u044C", texture: "field_rock_light", weight: "light", throwable: true, respawnSec: 7 },
  heavy_rock: { name: "\u0422\u044F\u0436\u0451\u043B\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C", texture: "field_rock_heavy", weight: "heavy", throwable: true, respawnSec: 9 },
  crystal: { name: "\u0417\u0430\u0449\u0438\u0442\u043D\u044B\u0439 \u043A\u0440\u0438\u0441\u0442\u0430\u043B\u043B", texture: "field_crystal", weight: "medium", throwable: false, breaksArmor: true, respawnAfterArmorSec: 10 }
};
var ARENAS = {
  glade: {
    ground: 2898468,
    objects: [
      { id: "rock_a", type: "light_rock", x: 180, y: 720 },
      { id: "heavy_a", type: "heavy_rock", x: 540, y: 700 }
    ]
  },
  glade_small: {
    ground: 2503978,
    objects: [
      { id: "rock_a", type: "light_rock", x: 220, y: 720 }
    ]
  },
  node: {
    ground: 1910564,
    objects: [
      { id: "crystal_a", type: "crystal", x: 590, y: 640 },
      { id: "heavy_a", type: "heavy_rock", x: 150, y: 760 },
      { id: "rock_a", type: "light_rock", x: 420, y: 800 }
    ]
  },
  guardian: {
    ground: 2237983,
    objects: [
      { id: "crystal_a", type: "crystal", x: 590, y: 640 },
      { id: "heavy_a", type: "heavy_rock", x: 150, y: 760 },
      { id: "rock_a", type: "light_rock", x: 420, y: 800 }
    ]
  }
};

// src/objects/Enemy.js
var Enemy = class {
  constructor(id, def) {
    this.id = id;
    this.baseDef = def;
    this.def = def;
    this.phase = 0;
    this.phaseEvents = [];
    this.name = def.name;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.normalTimer = def.normalAttack ? def.normalAttack.intervalSec : Infinity;
    this.strongCd = def.strongAttack ? def.strongAttack.firstDelaySec : Infinity;
    this.prepLeft = 0;
    this.staggerLeft = 0;
    this.burn = { left: 0, dps: 0, tick: 0 };
    this.defenseDisabledLeft = 0;
    this.armorDisabledLeft = 0;
    this.vulnerable = { left: 0, bonus: 0 };
    this.weakened = { left: 0, reduction: 0 };
    if (def.phases) this.applyPhase(this.phaseFor(this.hp));
  }
  // ---------- v0.10.0: фазы (Страж узла) ----------
  // def.phases = [{ above: HP, set: {armor, defense, weaknesses, onFireHit}, strongAttack: {...}, message, tint }, …]
  // Фаза i действует, пока HP > above (последняя — до конца). Фаза только растёт; один удар может пересечь
  // несколько порогов — тогда сразу включается последняя, а защита прежних фаз снимается.
  phaseFor(hp2) {
    const ph = this.baseDef.phases;
    for (let i = 0; i < ph.length; i++) if (hp2 > ph[i].above) return i;
    return ph.length - 1;
  }
  applyPhase(i) {
    const b = this.baseDef, p = b.phases[i];
    this.def = { ...b, ...p.set || {}, strongAttack: b.strongAttack ? { ...b.strongAttack, ...p.strongAttack || {} } : null };
    this.phase = i;
    this.armorDisabledLeft = 0;
    this.defenseDisabledLeft = 0;
    this.vulnerable = { left: 0, bonus: 0 };
  }
  checkPhase() {
    if (!this.baseDef.phases || !this.alive) return;
    const i = this.phaseFor(this.hp);
    if (i <= this.phase) return;
    const from = this.phase;
    this.applyPhase(i);
    const p = this.baseDef.phases[i];
    this.phaseEvents.push({ type: "phase", phase: i + 1, from: from + 1, message: p.message, tint: p.tint ?? null });
  }
  drainPhaseEvents() {
    const q = this.phaseEvents;
    this.phaseEvents = [];
    return q;
  }
  get alive() {
    return this.hp > 0;
  }
  get isPreparing() {
    return this.prepLeft > 0;
  }
  get prepProgress() {
    return this.def.strongAttack ? 1 - this.prepLeft / this.def.strongAttack.prepSec : 0;
  }
  get hasArmor() {
    return !!this.def.armor;
  }
  get armorActive() {
    return this.hasArmor && this.armorDisabledLeft <= 0;
  }
  get defenseActive() {
    return (this.def.defense || 0) > 0 && this.defenseDisabledLeft <= 0;
  }
  get burning() {
    return this.burn.left > 0;
  }
  /** Множитель входящего урона для школы ('auto' | 'telekinesis' | 'fire' | 'seal'). */
  incomingMultiplier(school) {
    let m = 1;
    const pierce = school === "seal";
    if (!pierce && this.defenseActive) m *= 1 - this.def.defense;
    if (!pierce && this.armorActive) m *= 1 - this.def.armor.value;
    const weak = this.def.weaknesses?.[school];
    if (weak) m *= 1 + weak;
    if (this.vulnerable.left > 0) m *= 1 + this.vulnerable.bonus;
    return m;
  }
  takeDamage(base, school, heroMult = 1) {
    if (!this.alive) return 0;
    const dmg = Math.max(1, Math.round(base * heroMult * this.incomingMultiplier(school)));
    this.hp = Math.max(0, this.hp - dmg);
    this.checkPhase();
    return dmg;
  }
  outgoingDamage(base) {
    const m = this.weakened.left > 0 ? 1 - this.weakened.reduction : 1;
    return Math.round(base * m);
  }
  applyBurn(dps, durationSec) {
    const wasBurning = this.burning;
    this.burn.left = durationSec;
    this.burn.dps = dps;
    if (!wasBurning) this.burn.tick = 1;
  }
  onFireHit() {
    const f = this.def.onFireHit;
    const out = [];
    if (!f) return out;
    if (f.disableDefenseSec) {
      this.defenseDisabledLeft = f.disableDefenseSec;
      out.push({ type: "defenseOff", sec: f.disableDefenseSec });
    }
    if (f.vulnerability) {
      this.vulnerable = { left: f.vulnerability.durationSec, bonus: f.vulnerability.bonus };
      out.push({ type: "vulnerable", sec: f.vulnerability.durationSec, bonus: f.vulnerability.bonus });
    }
    return out;
  }
  breakArmor() {
    if (!this.hasArmor) return false;
    this.armorDisabledLeft = this.def.armor.disabledSec;
    return true;
  }
  /** Попытка прервать сильную атаку. tags — набор тегов действия игрока. */
  tryInterrupt(tags) {
    if (!this.isPreparing) return { attempted: false };
    const allowed = this.def.strongAttack.interruptBy || [];
    const ok = tags.some((t) => allowed.includes(t));
    if (!ok) return { attempted: true, ok: false };
    this.prepLeft = 0;
    this.staggerLeft = this.def.staggerSec || 1;
    this.strongCd = this.def.interruptedCooldownSec ?? this.def.strongAttack.cooldownSec;
    this.normalTimer = Math.max(this.normalTimer, this.staggerLeft + 0.5);
    return { attempted: true, ok: true };
  }
  bind(sec) {
    this.staggerLeft = Math.max(this.staggerLeft, sec);
  }
  weaken(reduction, sec) {
    this.weakened = { left: sec, reduction };
  }
  /**
   * Шаг ИИ. Возвращает массив действий:
   *  { type: 'attack', damage } | { type: 'strongStart' } | { type: 'strongHit', damage } |
   *  { type: 'burnTick', damage } | { type: 'armorBack' } | { type: 'defenseBack' } | { type: 'vulnerableEnd' }
   */
  update(dt, heroMult = 1) {
    const out = [];
    if (!this.alive) return out;
    if (this.burn.left > 0) {
      this.burn.left -= dt;
      this.burn.tick -= dt;
      while (this.burn.tick <= 0 && this.alive) {
        this.burn.tick += 1;
        out.push({ type: "burnTick", damage: this.takeDamage(this.burn.dps, "fire", heroMult) });
      }
      if (this.burn.left <= 0) this.burn.left = 0;
    }
    if (this.armorDisabledLeft > 0) {
      this.armorDisabledLeft -= dt;
      if (this.armorDisabledLeft <= 0) out.push({ type: "armorBack" });
    }
    if (this.defenseDisabledLeft > 0) {
      this.defenseDisabledLeft -= dt;
      if (this.defenseDisabledLeft <= 0) out.push({ type: "defenseBack" });
    }
    if (this.vulnerable.left > 0) {
      this.vulnerable.left -= dt;
      if (this.vulnerable.left <= 0) out.push({ type: "vulnerableEnd" });
    }
    if (this.weakened.left > 0) this.weakened.left -= dt;
    if (!this.alive) return out;
    if (this.staggerLeft > 0) {
      this.staggerLeft -= dt;
      return out;
    }
    const strong = this.def.strongAttack;
    if (this.isPreparing) {
      this.prepLeft -= dt;
      if (this.prepLeft <= 0) {
        this.prepLeft = 0;
        this.strongCd = strong.cooldownSec;
        this.normalTimer = this.def.normalAttack.intervalSec;
        out.push({ type: "strongHit", damage: this.outgoingDamage(strong.damage), name: strong.name });
      }
      return out;
    }
    if (strong) {
      this.strongCd -= dt;
      if (this.strongCd <= 0) {
        this.prepLeft = strong.prepSec;
        out.push({ type: "strongStart", name: strong.name, prepSec: strong.prepSec, hint: strong.hint, interruptBy: strong.interruptBy });
        return out;
      }
    }
    this.normalTimer -= dt;
    if (this.normalTimer <= 0) {
      this.normalTimer += this.def.normalAttack.intervalSec;
      out.push({ type: "attack", damage: this.outgoingDamage(this.def.normalAttack.damage) });
    }
    return out;
  }
};

// src/state/EventBus.js
var EventBus = class {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  on(name, fn, ctx) {
    if (!this.map.has(name)) this.map.set(name, []);
    this.map.get(name).push({ fn, ctx });
    return () => this.off(name, fn, ctx);
  }
  off(name, fn, ctx) {
    const list = this.map.get(name);
    if (!list) return;
    this.map.set(name, list.filter((l) => !(l.fn === fn && (ctx === void 0 || l.ctx === ctx))));
  }
  offContext(ctx) {
    for (const [k, list] of this.map) this.map.set(k, list.filter((l) => l.ctx !== ctx));
  }
  emit(name, ...args) {
    const list = this.map.get(name);
    if (!list) return;
    [...list].forEach((l) => l.fn.apply(l.ctx, args));
  }
};
var bus = new EventBus();
var MSG = {
  WORLD_EVENT: "world:event",
  // (key, payload)
  QUEST_CHANGED: "quest:changed",
  HUD_REFRESH: "hud:refresh",
  TOAST: "ui:toast",
  // (text, color?)
  DIALOG: "ui:dialog",
  // ({ title, text, color, buttons })
  ABILITY_USE: "ability:use",
  // (abilityId)
  CONTEXT_ACTION: "ui:context",
  // ()
  WORLD_TAP: "world:tap",
  // ({x, y}) screen coords
  UI_MODE: "ui:mode",
  // ('exploration' | 'combat' | 'modal')
  OPEN_UPGRADE: "ui:upgrade",
  OPEN_BAG: "ui:bag",
  OPEN_GIFTS: "ui:gifts",
  REWARD: "ui:reward",
  // ({ title, granted, levelUps })
  RESEARCH_DONE: "research:done",
  MODAL_OPEN: "ui:modal-open",
  MODAL_CLOSED: "ui:modal-closed",
  FOCUS_CHANGED: "interaction:focus",
  // (info | null)
  COMBAT_CYCLE: "combat:cycle",
  FINAL_SCREEN: "ui:final",
  // v0.10.0: ({ outcome, reward }) — финал первой главы
  UNLOCK_SEAL: "story:unlock-seal",
  // v0.10.0: Селена открывает Печать I (после закрытия диалога)
  ZONE_CHANGED: "world:zone",
  // (zone)
  TUTORIAL: "ui:tutorial",
  // ({ id, text, target, ttl } | null)
  OPEN_PAUSE: "ui:pause",
  // v0.8
  OPEN_JOURNAL: "ui:journal",
  OPEN_ALCHEMY: "ui:alchemy",
  NPC_TALK: "npc:talk",
  // (npcId) — открыть окно диалога
  NPC_TALK_END: "npc:talk-end",
  // (npcId)
  CRAFTED: "alchemy:crafted",
  // ({ recipeId, result, amount })
  GATHERED: "gather:done",
  // ({ item, amount, id })
  HERO_SAY: "hero:say",
  // (text) — реплика героини над головой
  GUIDE_HINT: "guide:hint",
  // (text | null) — мягкая подсказка под панелью цели
  GUIDE_POINTER: "guide:pointer",
  // ({ x, y, angle, dist } | null) — стрелка к цели на краю экрана
  SIDE_QUEST: "quest:side",
  // (questId, 'start' | 'ready' | 'done')
  // v0.9
  MANA_SPENT: "vitals:mana-spent",
  // (cost) — действие в мире оплачено маной
  HUD_HIGHLIGHT: "ui:hud-highlight",
  // ('hp' | 'mana') — коротко подсветить индикатор
  OPEN_HEAL: "ui:heal",
  // () — окно лечения у Мирры (после закрытия диалога)
  STARTER_KIT: "story:starter-kit"
  // () — Мирра выдаёт стартовые зелья (после закрытия диалога)
};

// src/systems/abilityStats.js
function applyBranch(base, branch) {
  if (!branch) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(branch.set || {})) out[k] = v;
  for (const [k, v] of Object.entries(branch.add || {})) out[k] = (out[k] || 0) + v;
  for (const [k, v] of Object.entries(branch.mul || {})) if (typeof out[k] === "number") out[k] = Math.round(out[k] * v * 100) / 100;
  return out;
}
function statsFor(id, level, branchId = null) {
  if (!level) return null;
  const def = ABILITIES[id];
  const max = Math.max(...Object.keys(def.levels).map(Number));
  const base = def.levels[Math.min(level, max)];
  const branch = branchId ? def.branches?.[branchId] : null;
  return branch && level >= (branch.fromLevel || 1) ? { ...applyBranch(base, branch), branch: branchId } : base;
}

// src/systems/AbilitySystem.js
var ABILITY_ORDER = ["telekinesis", "fire", "seal"];
var AbilitySystem = class {
  constructor(state, quests, bus2) {
    this.state = state;
    this.quests = quests;
    this.bus = bus2;
  }
  def(id) {
    return ABILITIES[id];
  }
  level(id) {
    return this.state.abilityLevel(id);
  }
  isUnlocked(id) {
    return this.state.isUnlocked(id);
  }
  /** Параметры дара на текущей ступени с учётом выбранной ветки (или null). */
  stats(id) {
    return statsFor(id, this.level(id), this.state.branchOf(id));
  }
  label(id) {
    const s = this.stats(id);
    return s ? s.label : ABILITIES[id].name;
  }
  /** Может ли текущий Телекинез сдвинуть weight_class. */
  canMoveWeight(weightClass) {
    const s = this.stats("telekinesis");
    if (!s) return false;
    return WEIGHT_CLASSES.indexOf(weightClass) <= WEIGHT_CLASSES.indexOf(s.maxWeight);
  }
  /** Минимальная ступень Телекинеза для weight_class (для подсказок). */
  requiredTelekinesisLevel(weightClass) {
    const levels = ABILITIES.telekinesis.levels;
    for (const [lvl, s] of Object.entries(levels)) {
      if (WEIGHT_CLASSES.indexOf(weightClass) <= WEIGHT_CLASSES.indexOf(s.maxWeight)) return Number(lvl);
    }
    return Infinity;
  }
  unlock(id, level = 1) {
    this.state.unlockAbility(id, level);
    this.state.save();
    this.bus.emit(MSG.HUD_REFRESH);
  }
  grantUseXP(id, context = "exploration") {
    const xp = SCHOOL_XP_PER_USE[context]?.[id] || 0;
    if (xp) this.state.addSchoolXP(id, xp);
  }
  // ----- исследование -----
  startResearch(upgradeId) {
    if (!this.state.startResearch(upgradeId)) return false;
    const up = UPGRADES[upgradeId];
    if (up.startEvent) this.quests.complete(up.startEvent, { upgradeId });
    this.state.save();
    this.bus.emit(MSG.HUD_REFRESH);
    return true;
  }
  /** Вызывается каждый кадр из UIScene (работает и во время боя). */
  update(force = false) {
    const done = this.state.completeResearchIfReady(force);
    if (!done) return;
    const up = UPGRADES[done];
    this.state.save();
    if (up.completeEvent) this.quests.complete(up.completeEvent, { upgradeId: done });
    this.bus.emit(MSG.RESEARCH_DONE, done, up);
    this.bus.emit(MSG.HUD_REFRESH);
  }
};

// src/systems/CombatManager.js
var CombatManager = class {
  /**
   * @param {object} o
   * @param {string} o.enemyType ключ в ENEMIES
   * @param {import('../state/GameState.js').GameState} o.state
   * @param {import('./AbilitySystem.js').AbilitySystem} o.abilities
   */
  constructor({ enemyType, state, abilities }) {
    this.state = state;
    this.abilities = abilities;
    this.def = ENEMIES[enemyType];
    if (!this.def) throw new Error(`Unknown enemy type ${enemyType}`);
    this.enemy = new Enemy(enemyType, this.def);
    const hs = state.heroStats();
    this.hero = {
      maxHp: hs.maxHp,
      hp: hp(state),
      maxMana: hs.maxMana,
      mana: mana(state),
      regen: hs.manaRegen,
      damageMult: hs.damageMult,
      autoTimer: HERO_BASE.autoAttack.intervalSec
    };
    this.cooldowns = Object.fromEntries(ABILITY_ORDER.map((id) => [id, 0]));
    const arena = ARENAS[this.def.arena] || ARENAS.glade;
    this.arena = arena;
    this.fieldObjects = arena.objects.map((o) => ({ ...o, def: FIELD_OBJECTS[o.type], available: true, respawnLeft: 0 }));
    this.selectedId = null;
    this.time = 0;
    this.result = null;
    this.queue = [];
    this.stats = { abilityUses: { telekinesis: 0, fire: 0, seal: 0 }, interrupts: 0, damageTaken: 0, autoDamage: 0 };
  }
  emit(e) {
    this.queue.push(e);
  }
  /** v0.9: текущие HP и мана боя → общее состояние героини (HUD, профиль, сохранение видят одно и то же). */
  commit() {
    setHp(this.state, this.hero.hp);
    setMana(this.state, this.hero.mana);
  }
  drainEvents() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
  // ---------- выбор объектов поля ----------
  selectObject(id) {
    const o = this.fieldObjects.find((f) => f.id === id);
    if (!o || !o.available) return false;
    if (o.def.throwable && !this.canLift(o)) {
      this.emit({ type: "select", id: this.selectedId, refused: id, reason: "heavy" });
      return false;
    }
    this.selectedId = this.selectedId === id ? null : id;
    this.emit({ type: "select", id: this.selectedId });
    return true;
  }
  cycleSelection() {
    const avail = this.fieldObjects.filter((f) => f.available && (!f.def.throwable || this.canLift(f)));
    if (!avail.length) {
      this.selectedId = null;
      return;
    }
    const idx = avail.findIndex((f) => f.id === this.selectedId);
    const next = idx + 1 >= avail.length ? null : avail[idx + 1].id;
    this.selectedId = next;
    this.emit({ type: "select", id: next });
  }
  selectedObject() {
    return this.fieldObjects.find((f) => f.id === this.selectedId && f.available) || null;
  }
  /** Можно ли поднять объект текущим уровнем Телекинеза (ТК I — лёгкие и средние, ТК II — тяжёлые). */
  canLift(o) {
    return !o.def.weight || this.abilities.canMoveWeight(o.def.weight);
  }
  // ---------- состояние кнопок ----------
  abilityState(id) {
    const s = this.abilities.stats(id);
    if (!s || !this.abilities.isUnlocked(id)) return { id, state: "locked" };
    const cd = this.cooldowns[id];
    if (cd > 0) return { id, state: "cooldown", cdLeft: cd, cdFrac: cd / s.cooldownSec };
    if (this.hero.mana < s.manaCost) return { id, state: "nomana" };
    return { id, state: "ready" };
  }
  // ---------- действия игрока ----------
  useAbility(id) {
    if (this.result) return { ok: false, reason: "over" };
    const st = this.abilityState(id);
    if (st.state !== "ready") return { ok: false, reason: st.state };
    const s = this.abilities.stats(id);
    this.hero.mana -= s.manaCost;
    this.cooldowns[id] = this.startCooldown(id, s);
    this.stats.abilityUses[id]++;
    this.abilities.grantUseXP(id, "combat");
    if (id === "telekinesis") this.castTelekinesis(s);
    else if (id === "fire") this.castFire(s);
    else if (id === "seal") this.castSeal(s);
    this.flushPhases();
    this.checkResult();
    this.commit();
    return { ok: true };
  }
  /**
   * Перезарядка после применения. «Два броска подряд» (Телекинез III): первое применение не запускает перезарядку,
   * а открывает окно windowSec — второе в нём запускает обычную; не успели — перезарядка стартует, когда окно закрылось.
   */
  startCooldown(id, s) {
    if (!s.doubleCast) return s.cooldownSec;
    if (this.chain && this.chain.id === id) {
      this.chain = null;
      return s.cooldownSec;
    }
    this.chain = { id, left: s.doubleCast.windowSec, window: s.doubleCast.windowSec, cooldownSec: s.cooldownSec };
    this.emit({ type: "chain", id, sec: s.doubleCast.windowSec });
    return 0;
  }
  /**
   * v0.10.0: смена фазы врага (Страж узла) → событие для сцены. В фазах без брони кристалл поля больше не нужен —
   * он рассыпается и не возвращается (его роль — только первая фаза).
   */
  flushPhases() {
    for (const ev of this.enemy.drainPhaseEvents()) {
      if (!this.enemy.hasArmor) {
        for (const o of this.fieldObjects) {
          if (!o.def.breaksArmor || o.gone) continue;
          o.gone = true;
          o.available = false;
          o.respawnLeft = Infinity;
          if (this.selectedId === o.id) this.selectedId = null;
          this.emit({ type: "objectUsed", id: o.id, action: "shatter" });
        }
      }
      this.emit(ev);
    }
  }
  /**
   * v0.8: расходник из сумки (настой жизни / лунный эликсир / смоляная склянка). Мгновенно, без перезарядки и маны.
   * Возвращает { ok, reason? }. Предмет списывается из сумки; сохранение — на стороне сцены (state.save()).
   */
  usePotion(id) {
    if (this.result) return { ok: false, reason: "over" };
    const p = POTIONS[id];
    if (!p) return { ok: false, reason: "unknown" };
    if (this.state.item(id) < 1) return { ok: false, reason: "none" };
    if ((this.stats.potions || 0) >= POTION_BATTLE_LIMIT) return { ok: false, reason: "limit" };
    const h = this.hero, e = p.effect;
    if (e.type === "heal") {
      if (h.hp >= h.maxHp) return { ok: false, reason: "full" };
      const gain = Math.min(h.maxHp - h.hp, Math.round(h.maxHp * e.amount));
      h.hp += gain;
      this.emit({ type: "potion", id, kind: "heal", amount: gain });
    } else if (e.type === "mana") {
      if (h.mana >= h.maxMana) return { ok: false, reason: "full" };
      const gain = Math.min(h.maxMana - h.mana, Math.round(h.maxMana * e.amount));
      h.mana += gain;
      this.emit({ type: "potion", id, kind: "mana", amount: gain });
    } else if (e.type === "damage") {
      const dmg = this.enemy.takeDamage(e.amount, "fire", 1);
      this.emit({ type: "potion", id, kind: "damage", amount: dmg });
      this.emit({ type: "damage", target: "enemy", amount: dmg, school: "fire" });
      if (e.burn) {
        this.enemy.applyBurn(e.burn.dps, e.burn.durationSec);
        this.emit({ type: "status", status: "burn", sec: e.burn.durationSec });
      }
    } else return { ok: false, reason: "unknown" };
    this.state.removeItem(id, 1);
    this.stats.potions = (this.stats.potions || 0) + 1;
    this.flushPhases();
    this.checkResult();
    this.commit();
    return { ok: true };
  }
  /** Расходники, которые есть в сумке (для кнопок боя): [{ id, count }]. */
  potionsAvailable() {
    return Object.keys(POTIONS).map((id) => ({ id, count: this.state.item(id) })).filter((p) => p.count > 0);
  }
  castTelekinesis(s) {
    const obj = this.selectedObject();
    const tags = ["telekinesis"];
    if (obj && obj.def.breaksArmor) {
      obj.available = false;
      this.selectedId = null;
      const armor = this.enemy.def.armor;
      const broke = this.enemy.breakArmor();
      obj.respawnLeft = (armor ? armor.disabledSec : 0) + (obj.def.respawnAfterArmorSec || 0);
      this.emit({ type: "objectUsed", id: obj.id, action: "shatter" });
      if (broke) this.emit({ type: "armorBroken", sec: armor.disabledSec });
      this.handleInterrupt(tags);
      return;
    }
    let base = s.damage;
    if (obj && obj.def.throwable && this.canLift(obj)) {
      const heavy = obj.def.weight === "heavy";
      if (heavy) {
        base *= 1 + s.heavyObjectBonus;
        tags.push("telekinesis_heavy");
      }
      base *= 1 + (s.throwDamageBonus || 0);
      obj.available = false;
      obj.respawnLeft = obj.def.respawnSec;
      this.selectedId = null;
      this.emit({ type: "objectUsed", id: obj.id, action: "throw", heavy });
    }
    if (!s.interruptsNormalCast) tags.shift();
    this.handleInterrupt(tags);
    const dmg = this.enemy.takeDamage(base, "telekinesis", this.hero.damageMult);
    this.emit({ type: "damage", target: "enemy", amount: dmg, school: "telekinesis", heavy: tags.includes("telekinesis_heavy") });
  }
  castFire(s) {
    const dmg = this.enemy.takeDamage(s.damage, "fire", this.hero.damageMult);
    this.emit({ type: "damage", target: "enemy", amount: dmg, school: "fire" });
    this.enemy.applyBurn(s.burn.dps, s.burn.durationSec);
    this.emit({ type: "status", status: "burn", sec: s.burn.durationSec });
    for (const e of this.enemy.onFireHit()) this.emit({ type: "status", status: e.type, sec: e.sec, bonus: e.bonus });
    if (s.interruptsNormalCast) this.handleInterrupt(["fire"]);
  }
  // v0.10.1: Астрал — чистый урон сквозь броню и кору; атаки врага не прерывает (это только Телекинез)
  castSeal(s) {
    const dmg = this.enemy.takeDamage(s.damage, "seal", this.hero.damageMult);
    this.emit({ type: "damage", target: "enemy", amount: dmg, school: "seal" });
  }
  handleInterrupt(tags) {
    const r = this.enemy.tryInterrupt(tags);
    if (!r.attempted) return;
    if (r.ok) {
      this.stats.interrupts++;
      this.emit({ type: "interrupt", ok: true });
      this.refundInterrupt();
    } else this.emit({ type: "interrupt", ok: false, hint: this.enemy.def.strongAttack?.hint });
  }
  /** Ветка «Повелитель»: удачное прерывание возвращает часть маны и сокращает перезарядку Телекинеза. */
  refundInterrupt() {
    const s = this.abilities.stats("telekinesis");
    const r = s?.interruptRefund;
    if (!r) return;
    const gain = Math.round(s.manaCost * r.manaPct);
    this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + gain);
    this.cooldowns.telekinesis = Math.max(0, this.cooldowns.telekinesis - r.cooldownSec);
    if (this.chain?.id === "telekinesis") this.chain.cooldownSec = Math.max(0, this.chain.cooldownSec - r.cooldownSec);
    this.emit({ type: "refund", mana: gain, cooldownSec: r.cooldownSec });
  }
  // ---------- симуляция ----------
  /**
   * holdEnemy (v0.9, обучение): враг, его подготовка атаки и автоатака героини стоят, а мана героини, перезарядка даров
   * и возврат предметов поля идут — нужное действие никогда не блокируется. Восстановление маны в бою — только здесь.
   */
  tick(dt, { holdEnemy = false } = {}) {
    if (this.result) return;
    const h = this.hero;
    h.mana = Math.min(h.maxMana, h.mana + h.regen * dt);
    for (const id of ABILITY_ORDER) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    if (this.chain) {
      this.chain.left -= dt;
      if (this.chain.left <= 0) {
        this.cooldowns[this.chain.id] = Math.max(0, this.chain.cooldownSec - (this.chain.window ?? 0));
        this.chain = null;
      }
    }
    if (holdEnemy) {
      for (const o of this.fieldObjects) {
        if (o.available || o.gone) continue;
        o.respawnLeft -= dt;
        if (o.respawnLeft <= 0) {
          o.available = true;
          this.emit({ type: "objectRespawn", id: o.id });
        }
      }
      this.commit();
      return;
    }
    this.time += dt;
    h.autoTimer -= dt;
    if (h.autoTimer <= 0) {
      h.autoTimer += HERO_BASE.autoAttack.intervalSec;
      const dmg = this.enemy.takeDamage(HERO_BASE.autoAttack.damage, "auto", h.damageMult);
      this.stats.autoDamage += dmg;
      this.emit({ type: "damage", target: "enemy", amount: dmg, school: "auto" });
    }
    for (const o of this.fieldObjects) {
      if (o.available || o.gone) continue;
      o.respawnLeft -= dt;
      if (o.respawnLeft <= 0) {
        o.available = true;
        this.emit({ type: "objectRespawn", id: o.id });
      }
    }
    for (const a of this.enemy.update(dt, h.damageMult)) {
      switch (a.type) {
        case "attack":
          this.hitHero(a.damage, false);
          break;
        case "strongHit":
          this.hitHero(a.damage, true, a.name);
          break;
        case "strongStart":
          this.emit({ type: "warning", name: a.name, prepSec: a.prepSec, hint: a.hint, needsHeavy: a.interruptBy.includes("telekinesis_heavy") && !a.interruptBy.includes("telekinesis") });
          break;
        case "burnTick":
          this.emit({ type: "damage", target: "enemy", amount: a.damage, school: "fire", tick: true });
          break;
        case "armorBack":
          this.emit({ type: "armorBack" });
          break;
        default:
          this.emit({ type: "status", status: a.type });
      }
    }
    this.flushPhases();
    this.checkResult();
    this.commit();
  }
  hitHero(damage, strong, name) {
    this.hero.hp = Math.max(0, this.hero.hp - damage);
    this.stats.damageTaken += damage;
    this.emit({ type: "damage", target: "hero", amount: damage, strong, name });
  }
  checkResult() {
    if (this.result) return;
    if (this.enemy.hp <= 0) this.result = "victory";
    else if (this.hero.hp <= 0) this.result = "defeat";
    if (this.result) this.emit({ type: "result", result: this.result, time: this.time });
  }
};

// src/systems/combatReplay.js
var STEP = 1 / 60;
var MAX_TICKS = 60 * 60 * 15;
var MAX_EVENTS = 2e3;
var MAX_HOLD_TICKS = 60 * 60 * 5;
var ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
var isInt = (n) => Number.isInteger(n) && n >= 0;
function normalizeLog(raw) {
  if (!raw || typeof raw !== "object" || raw.v !== 1) return null;
  if (!isInt(raw.ticks) || raw.ticks > MAX_TICKS) return null;
  if (!Array.isArray(raw.ev) || raw.ev.length > MAX_EVENTS) return null;
  if (!Array.isArray(raw.hold) || raw.hold.length > 200) return null;
  const ev = [];
  let last = 0;
  for (const e of raw.ev) {
    if (!Array.isArray(e) || e.length < 2 || e.length > 3) return null;
    const [t, code, arg] = e;
    if (!isInt(t) || t < last || t > raw.ticks) return null;
    if (code === "c") {
      if (e.length !== 2) return null;
      ev.push([t, "c"]);
    } else if (code === "a" || code === "p" || code === "s") {
      if (typeof arg !== "string" || !ID_RE.test(arg)) return null;
      ev.push([t, code, arg]);
    } else return null;
    last = t;
  }
  const hold = [];
  let prev = -1;
  for (const t of raw.hold) {
    if (!isInt(t) || t <= prev || t > raw.ticks) return null;
    hold.push(t);
    prev = t;
  }
  return { v: 1, ticks: raw.ticks, ev, hold };
}
function apply(cm, e) {
  const [, code, arg] = e;
  if (code === "a") return ABILITY_ORDER.includes(arg) && cm.useAbility(arg).ok;
  if (code === "p") return Object.hasOwn(POTIONS, arg) && cm.usePotion(arg).ok;
  if (code === "s") return cm.selectObject(arg);
  cm.cycleSelection();
  return true;
}
function replayCombat(cm, log) {
  cm.emit = () => {
  };
  const { ev, hold } = log;
  let e = 0, p = 0, held = false, heldTicks = 0, ignored = 0, i = 0;
  for (; ; i++) {
    while (e < ev.length && ev[e][0] === i) {
      if (!apply(cm, ev[e])) ignored++;
      e++;
    }
    if (cm.result || i >= log.ticks) break;
    while (p < hold.length && hold[p] === i) {
      held = !held;
      p++;
    }
    if (held) heldTicks++;
    cm.tick(STEP, { holdEnemy: held });
  }
  return { ticks: i, held: heldTicks, ignored };
}

// src/state/enemyRep.js
var repKey = (spawnId) => `rep:${spawnId}`;
function repState(state, spawnId) {
  return state.getObject(repKey(spawnId)) || null;
}
function enemyDownNow(state, cfg) {
  if (!state.isEnemyDefeated(cfg.id)) return false;
  if (!cfg.repeatSec) return true;
  const r = repState(state, cfg.id);
  if (!r || !Number.isFinite(r.at)) return false;
  return state.now() - r.at < cfg.repeatSec * 1e3;
}

// src/config/story.js
var COMBAT_TUTORIAL = {
  spawnId: "scavenger_01",
  steps: ["intro", "select", "throw", "interrupt"],
  text: {
    intro: fm("\u0413\u0435\u0440\u043E\u0438\u043D\u044F \u0430\u0442\u0430\u043A\u0443\u0435\u0442 \u0441\u0430\u043C\u0430. \u0412\u044B \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0442\u0435 \u0435\u0439 \u043C\u0430\u0433\u0438\u0435\u0439 \u0438 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u0430\u043C\u0438.", "\u0413\u0435\u0440\u043E\u0439 \u0430\u0442\u0430\u043A\u0443\u0435\u0442 \u0441\u0430\u043C. \u0412\u044B \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0442\u0435 \u0435\u043C\u0443 \u043C\u0430\u0433\u0438\u0435\u0439 \u0438 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u0430\u043C\u0438."),
    select: "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043D\u0430 \u043A\u0430\u043C\u0435\u043D\u044C, \u0447\u0442\u043E\u0431\u044B \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0435\u0433\u043E.",
    throw: "\u0422\u0435\u043F\u0435\u0440\u044C \u0431\u0440\u043E\u0441\u044C\u0442\u0435 \u043A\u0430\u043C\u0435\u043D\u044C \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C.",
    interrupt: "\u0412\u0440\u0430\u0433 \u0433\u043E\u0442\u043E\u0432\u0438\u0442 \u0440\u044B\u0432\u043E\u043A. \u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0435\u0433\u043E \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!",
    confirm: "\u0410\u0442\u0430\u043A\u0430 \u043F\u0440\u0435\u0440\u0432\u0430\u043D\u0430 \u2014 \u0432\u044B \u0438\u0437\u0431\u0435\u0436\u0430\u043B\u0438 \u0441\u0438\u043B\u044C\u043D\u043E\u0433\u043E \u0443\u0434\u0430\u0440\u0430.",
    remindSelect: "\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435: \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u043D\u0430 \u043A\u0430\u043C\u0435\u043D\u044C, \u043F\u043E\u0442\u043E\u043C \u2014 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437."
  },
  feedback: {
    noSelection: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u043D\u0430 \u043A\u0430\u043C\u0435\u043D\u044C \u2014 \u0431\u0440\u043E\u0441\u043E\u043A \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u043F\u0440\u043E\u0441\u0442\u043E\u0433\u043E \u0443\u0434\u0430\u0440\u0430.",
    wrongAbility: "\u0421\u0435\u0439\u0447\u0430\u0441 \u043D\u0443\u0436\u0435\u043D \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437.",
    notThrowable: "\u042D\u0442\u043E\u0442 \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u043D\u0435 \u0431\u0440\u043E\u0441\u0438\u0442\u044C. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u0430\u043C\u0435\u043D\u044C.",
    cooldown: "\u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437 \u0435\u0449\u0451 \u043D\u0435 \u0433\u043E\u0442\u043E\u0432 \u2014 \u043F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435, \u043F\u043E\u043A\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0441\u044F \u043A\u0440\u0443\u0433.",
    nomana: "\u041C\u0430\u043B\u043E \u043C\u0430\u043D\u044B \u0434\u043B\u044F \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u0430: \u043F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u0438\u043B\u0438 \u0432\u044B\u043F\u0435\u0439\u0442\u0435 \u041B\u0443\u043D\u043D\u044B\u0439 \u044D\u043B\u0438\u043A\u0441\u0438\u0440."
  }
};
var COMBAT_HINTS = {
  firstDamage: { id: "ch:hp", text: fm("\u041A\u0440\u0430\u0441\u043D\u0430\u044F \u043F\u043E\u043B\u043E\u0441\u0430 \u0432\u0432\u0435\u0440\u0445\u0443 \u2014 \u0437\u0434\u043E\u0440\u043E\u0432\u044C\u0435 \u0433\u0435\u0440\u043E\u0438\u043D\u0438. \u0415\u0441\u043B\u0438 \u043E\u043D\u043E \u043A\u043E\u043D\u0447\u0438\u0442\u0441\u044F, \u0431\u043E\u0439 \u043F\u0440\u043E\u0438\u0433\u0440\u0430\u043D.", "\u041A\u0440\u0430\u0441\u043D\u0430\u044F \u043F\u043E\u043B\u043E\u0441\u0430 \u0432\u0432\u0435\u0440\u0445\u0443 \u2014 \u0437\u0434\u043E\u0440\u043E\u0432\u044C\u0435 \u0433\u0435\u0440\u043E\u044F. \u0415\u0441\u043B\u0438 \u043E\u043D\u043E \u043A\u043E\u043D\u0447\u0438\u0442\u0441\u044F, \u0431\u043E\u0439 \u043F\u0440\u043E\u0438\u0433\u0440\u0430\u043D.") },
  lowHp: { text: "\u0417\u0434\u043E\u0440\u043E\u0432\u044C\u0435 \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u0435! \u041D\u0430\u0441\u0442\u043E\u0439 \u0436\u0438\u0437\u043D\u0438 (\u043A\u0440\u0430\u0441\u043D\u0430\u044F \u0441\u043A\u043B\u044F\u043D\u043A\u0430 \u0441\u043B\u0435\u0432\u0430) \u0432\u0435\u0440\u043D\u0451\u0442 \u043F\u043E\u0447\u0442\u0438 \u043F\u043E\u043B\u043E\u0432\u0438\u043D\u0443." },
  lowMana: { text: "\u041C\u0430\u043B\u043E \u043C\u0430\u043D\u044B \u0434\u043B\u044F \u0434\u0430\u0440\u0430. \u041B\u0443\u043D\u043D\u044B\u0439 \u044D\u043B\u0438\u043A\u0441\u0438\u0440 (\u0441\u0438\u043D\u044F\u044F \u0441\u043A\u043B\u044F\u043D\u043A\u0430) \u0432\u043E\u0441\u043F\u043E\u043B\u043D\u0438\u0442 \u0437\u0430\u043F\u0430\u0441." },
  flask: { id: "ch:flask", text: "\u0421\u043C\u043E\u043B\u044F\u043D\u0430\u044F \u0441\u043A\u043B\u044F\u043D\u043A\u0430 (\u043E\u0440\u0430\u043D\u0436\u0435\u0432\u0430\u044F) \u043E\u0431\u0436\u0438\u0433\u0430\u0435\u0442 \u0432\u0440\u0430\u0433\u0430 \u0438 \u0431\u0435\u0440\u0435\u0436\u0451\u0442 \u043C\u0430\u043D\u0443." }
};

// src/cloud/combatVerify.js
var SLACK_SEC = 10;
var add = (o, k, n) => {
  if (n) o[k] = (o[k] || 0) + n;
};
var mergeReward = (into, g) => {
  into.heroXP = (into.heroXP || 0) + (g.heroXP || 0);
  for (const [k, v] of Object.entries(g.schoolXP || {})) {
    into.schoolXP = into.schoolXP || {};
    add(into.schoolXP, k, v);
  }
  for (const [k, v] of Object.entries(g.items || {})) {
    into.items = into.items || {};
    add(into.items, k, v);
  }
};
function startState(ctx, nowMs = Date.now()) {
  const snap = emptySnapshot();
  snap.level = ctx.level;
  snap.abilities = JSON.parse(JSON.stringify(ctx.abilities));
  snap.inventory = { ...ctx.potions };
  snap.hp = ctx.hp;
  snap.mana = ctx.mana;
  snap.objects = ctx.build ? { player_build: JSON.parse(JSON.stringify(ctx.build)) } : {};
  const st = new GameState(null, () => nowMs);
  st.setData(fromSnapshot(snap));
  return st;
}
function spawnOf(spawnId) {
  return ENEMY_SPAWNS.find((x) => x.id === spawnId) || null;
}
function verifyCombat(snap, rawLog, nowMs) {
  const fail2 = (reason) => ({ ok: false, reason });
  const ctx = snap?.combatCtx;
  if (snap?.combatSince == null || !ctx) return fail2("no_combat");
  const log = normalizeLog(rawLog);
  if (!log) return fail2("bad_log");
  const spawn = spawnOf(ctx.spawn);
  if (!spawn || spawn.enemy !== ctx.enemy || !Object.hasOwn(ENEMIES, ctx.enemy)) return fail2("bad_spawn");
  if (spawn.requiresEvent && !snap.quests.includes(spawn.requiresEvent)) return fail2("locked");
  const cur = new GameState(null, () => nowMs);
  cur.setData(fromSnapshot(snap));
  if (enemyDownNow(cur, spawn)) return fail2("down");
  if (log.ticks * STEP > (nowMs - snap.combatSince) / 1e3 + SLACK_SEC) return fail2("too_fast");
  const st = startState(ctx, nowMs);
  const cm = new CombatManager({ enemyType: ctx.enemy, state: st, abilities: new AbilitySystem(st, null, null) });
  const run = replayCombat(cm, log);
  const tutorial = spawn.id === COMBAT_TUTORIAL.spawnId && !snap.enemies.includes(spawn.id);
  if (run.held > 0 && (!tutorial || run.held > MAX_HOLD_TICKS)) return fail2("bad_log");
  const since = snap.combatSince;
  const outcome = cm.result || "retreat";
  const verdict = { outcome, since, spawn: spawn.id, ticks: run.ticks, mana: cm.hero.mana };
  if (outcome === "retreat") return { ok: true, verdict };
  verdict.potions = {};
  for (const id of COMBAT_POTIONS) add(verdict.potions, id, (ctx.potions[id] || 0) - st.item(id));
  const reward = { heroXP: 0, schoolXP: {}, items: {} };
  mergeReward(reward, { schoolXP: { ...st.data.schoolXP } });
  if (outcome === "victory") {
    const first = !cur.isEnemyDefeated(spawn.id);
    const def = cm.def;
    const base = first || !def.repeatRewards ? def.rewards : def.repeatRewards;
    const before = cur.data.heroLevel;
    mergeReward(reward, cur.applyReward(base).granted);
    verdict.events = [];
    if (spawn.defeatEvent && first && cur.markEvent(spawn.defeatEvent)) {
      verdict.events.push(spawn.defeatEvent);
      const er = EVENT_REWARDS[spawn.defeatEvent];
      if (er) mergeReward(reward, cur.applyReward(er).granted);
    }
    if (spawn.opensPath) verdict.path = spawn.opensPath;
    if (spawn.repeatSec) {
      const r = repState(cur, spawn.id);
      verdict.rep = { key: repKey(spawn.id), wins: (r?.wins || 0) + 1, at: nowMs };
    }
    verdict.first = first;
    verdict.levelsGained = cur.data.heroLevel - before;
  } else {
    verdict.coinsLost = Math.min(cur.item("coins"), HERO_RECOVERY.coinsLostOnDefeat);
  }
  if (!reward.heroXP) delete reward.heroXP;
  verdict.reward = reward;
  verdict.entry = {
    enemy: ctx.enemy,
    spawnId: spawn.id,
    result: outcome,
    timeSec: Math.round(cm.time * 10) / 10,
    interrupts: cm.stats.interrupts,
    uses: { ...cm.stats.abilityUses }
  };
  return { ok: true, verdict };
}

// src/cloud/combatHandler.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
var fail = (status, code) => json(status, { error_code: code });
var MAX_BODY = 256 * 1024;
async function handle(req, env, fetchFn = fetch, now = Date.now) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "method_not_allowed");
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return fail(500, "not_configured");
  const admin = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) admin.Authorization = `Bearer ${key}`;
  let body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return fail(413, "too_large");
    body = JSON.parse(text);
  } catch {
    return fail(400, "bad_request");
  }
  if (!body || typeof body !== "object") return fail(400, "bad_request");
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "unauthorized");
  const who = await fetchFn(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!who.ok) return fail(401, "unauthorized");
  const user = await who.json();
  if (!user?.id) return fail(401, "unauthorized");
  const rpc = (name, args) => fetchFn(`${base}/rest/v1/rpc/${name}`, { method: "POST", headers: admin, body: JSON.stringify(args) });
  const loaded = await rpc("combat_load", { uid: user.id });
  if (!loaded.ok) return fail(loaded.status === 404 ? 404 : 500, loaded.status === 404 ? "not_deployed" : "server_error");
  const raw = await loaded.json();
  if (!raw) return fail(409, "no_player");
  const { snapshot, meta } = fillDefaults(raw);
  const t = now();
  const v = verifyCombat(snapshot, body.log, t);
  if (!v.ok) return json(200, { ...raw, action: { ok: false, reason: v.reason } });
  const applied = await rpc("combat_apply", { uid: user.id, verdict: v.verdict });
  if (!applied.ok) return fail(500, "server_error");
  const res = await applied.json();
  return json(200, { ...res, action: { ...res.action || {}, verdict: v.verdict }, meta: res.meta ?? meta });
}
var D = globalThis.Deno;
if (D?.serve) {
  D.serve((req) => handle(req, {
    SUPABASE_URL: D.env.get("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: D.env.get("SUPABASE_SERVICE_ROLE_KEY")
  }));
}
export {
  handle
};
