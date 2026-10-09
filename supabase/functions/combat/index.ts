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
  { level: 6, xp: 650, maxHp: 152, maxMana: 125, manaRegen: 3.2, damageMult: 1.12, note: "\u0410\u0441\u0442\u0440\u0430\u043B \u0438 \u0438\u0441\u043F\u044B\u0442\u0430\u043D\u0438\u0435" },
  { level: 7, xp: 940, maxHp: 160, maxMana: 135, manaRegen: 3.2, damageMult: 1.15, note: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435 \u0433\u043B\u0430\u0432\u044B" },
  { level: 8, xp: 1300, maxHp: 170, maxMana: 140, manaRegen: 3.2, damageMult: 1.18, note: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0432\u044B\u0445\u043E\u0434" },
  { level: 9, xp: 1750, maxHp: 180, maxMana: 145, manaRegen: 3.2, damageMult: 1.21, note: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435" },
  { level: 10, xp: 2350, maxHp: 190, maxMana: 155, manaRegen: 3.2, damageMult: 1.25, note: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435" },
  // v0.18.0: глава II (docs/design/chapter-2-balance-v0.1.md §2)
  { level: 11, xp: 3100, maxHp: 202, maxMana: 165, manaRegen: 3.5, damageMult: 1.29, note: "\u041B\u0451\u0434 I" },
  { level: 12, xp: 4e3, maxHp: 214, maxMana: 175, manaRegen: 3.5, damageMult: 1.33, note: "\u041B\u0451\u0434 II" },
  { level: 13, xp: 5100, maxHp: 226, maxMana: 185, manaRegen: 3.5, damageMult: 1.37, note: "\u041B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u044F" },
  { level: 14, xp: 6400, maxHp: 240, maxMana: 195, manaRegen: 3.8, damageMult: 1.42, note: "\u041A\u043E\u0432\u0435\u043D\u044B" },
  { level: 15, xp: 7900, maxHp: 255, maxMana: 205, manaRegen: 3.8, damageMult: 1.48, note: "\u0424\u0438\u043D\u0430\u043B \u0433\u043B\u0430\u0432\u044B II" }
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
  rune_dust: { name: "\u0420\u0443\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u044B\u043B\u044C", icon: "icon_dust", color: 13214463, hint: "\u041E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043E\u0442 \u0434\u0440\u0435\u0432\u043D\u0438\u0445 \u0440\u0443\u043D. \u0411\u0435\u0437 \u043D\u0435\u0451 \u043C\u0430\u0433\u0438\u044F \u043D\u0435 \u0434\u0435\u0440\u0436\u0438\u0442\u0441\u044F \u0432 \u0437\u0435\u043B\u044C\u0435." },
  // v0.19.0 — глава II (docs/design/chapter-2-balance-v0.1.md §16): четыре новых ресурса, не больше
  frost_herb: { name: "\u041C\u043E\u0440\u043E\u0437\u043D\u0438\u043A", icon: "icon_frost_herb", color: 11069144, hint: "\u0420\u0430\u0441\u0442\u0435\u043D\u0438\u0435, \u0438\u0437\u043C\u0435\u043D\u0451\u043D\u043D\u043E\u0435 \u0445\u043E\u043B\u043E\u0434\u043D\u043E\u0439 \u043C\u0430\u0433\u0438\u0435\u0439. \u0420\u0430\u0441\u0442\u0451\u0442 \u0443 \u0433\u043E\u0440\u043E\u0434\u0430, \u043D\u0443\u0436\u0435\u043D \u0434\u043B\u044F \u0442\u0451\u043F\u043B\u044B\u0445 \u0438 \u0441\u0442\u0430\u0431\u0438\u043B\u0438\u0437\u0438\u0440\u0443\u044E\u0449\u0438\u0445 \u0441\u043E\u0441\u0442\u0430\u0432\u043E\u0432." },
  ice_crystal: { name: "\u041B\u0435\u0434\u044F\u043D\u043E\u0439 \u043A\u0440\u0438\u0441\u0442\u0430\u043B\u043B", icon: "icon_ice_crystal", color: 10479359, hint: "\u041D\u0435\u043E\u0431\u044B\u0447\u043D\u044B\u0439 \u043A\u0440\u0438\u0441\u0442\u0430\u043B\u043B \u0445\u043E\u043B\u043E\u0434\u0430: \u0432 \u043E\u0441\u043E\u0431\u044B\u0445 \u043C\u0435\u0441\u0442\u0430\u0445 \u0433\u043E\u0440\u043E\u0434\u0430 \u0438 \u0443 \u043C\u043E\u0440\u043E\u0437\u043D\u044B\u0445 \u043F\u0440\u043E\u0442\u0438\u0432\u043D\u0438\u043A\u043E\u0432." },
  frost_shard: { name: "\u0418\u043D\u0435\u0435\u0432\u044B\u0439 \u043E\u0441\u043A\u043E\u043B\u043E\u043A", icon: "icon_frost_shard", color: 8370431, hint: "\u0420\u0435\u0434\u043A\u0438\u0439 \u043E\u0441\u043A\u043E\u043B\u043E\u043A, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043E\u0442 \u0441\u0438\u043B\u044C\u043D\u044B\u0445 \u043C\u043E\u0440\u043E\u0437\u043D\u044B\u0445 \u0432\u0440\u0430\u0433\u043E\u0432. \u0412 \u043B\u0430\u0432\u043A\u0430\u0445 \u043D\u0435 \u043F\u0440\u043E\u0434\u0430\u0451\u0442\u0441\u044F." },
  cold_heart: { name: "\u0421\u0435\u0440\u0434\u0446\u0435 \u0445\u043E\u043B\u043E\u0434\u0430", icon: "icon_cold_heart", color: 6279423, hint: "\u041E\u0447\u0435\u043D\u044C \u0440\u0435\u0434\u043A\u0438\u0439 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442 \u0441\u0438\u043B\u044C\u043D\u0435\u0439\u0448\u0438\u0445 \u043F\u0440\u043E\u0442\u0438\u0432\u043D\u0438\u043A\u043E\u0432. \u041F\u0440\u0438\u0433\u043E\u0434\u0438\u0442\u0441\u044F \u0434\u043B\u044F \u0431\u0443\u0434\u0443\u0449\u0438\u0445 \u0430\u043C\u0443\u043B\u0435\u0442\u043E\u0432 \u0438 \u0441\u0442\u0443\u043F\u0435\u043D\u0435\u0439 \u041B\u044C\u0434\u0430." }
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
  },
  // v0.19.0 — глава II (chapter-2-balance-v0.1.md §18)
  warm_potion: {
    name: "\u0422\u0451\u043F\u043B\u044B\u0439 \u043D\u0430\u0441\u0442\u043E\u0439",
    icon: "icon_potion_warm",
    color: 16757610,
    effect: { type: "warm", resist: 0.6 },
    text: "\u0414\u043E \u043A\u043E\u043D\u0446\u0430 \u0431\u043E\u044F \u0445\u043E\u043B\u043E\u0434 \u0432\u0440\u0430\u0433\u0430 \u0441\u043B\u0430\u0431\u0435\u0435 \u043D\u0430 60%, \u0430 \u043D\u044B\u043D\u0435\u0448\u043D\u0438\u0439 \u0445\u043E\u043B\u043E\u0434 \u0441\u043D\u0438\u043C\u0430\u0435\u0442\u0441\u044F. \u0422\u043E\u043B\u044C\u043A\u043E \u0432 \u0431\u043E\u044E."
  },
  stabilizing_potion: {
    name: "\u0421\u0442\u0430\u0431\u0438\u043B\u0438\u0437\u0438\u0440\u0443\u044E\u0449\u0438\u0439 \u043D\u0430\u0441\u0442\u043E\u0439",
    icon: "icon_potion_stable",
    color: 11069144,
    effect: { type: "cleanse", heal: 0.15 },
    text: "\u0421\u043D\u0438\u043C\u0430\u0435\u0442 \u0445\u043E\u043B\u043E\u0434 \u0438 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 15% \u0437\u0434\u043E\u0440\u043E\u0432\u044C\u044F. \u041D\u0443\u0436\u0435\u043D \u0438 \u043F\u043E \u0441\u044E\u0436\u0435\u0442\u0443 \u2014 \u043F\u043E\u043C\u043E\u0447\u044C \u043F\u043E\u0441\u0442\u0440\u0430\u0434\u0430\u0432\u0448\u0438\u043C."
  },
  brittle_flask: {
    name: "\u0424\u043B\u0430\u043A\u043E\u043D \u0425\u0440\u0443\u043F\u043A\u043E\u0441\u0442\u0438",
    icon: "icon_potion_brittle",
    color: 10479359,
    effect: { type: "brittle", bonus: 0.4, sec: 5 },
    text: "\u0414\u0435\u043B\u0430\u0435\u0442 \u0432\u0440\u0430\u0433\u0430 \u0445\u0440\u0443\u043F\u043A\u0438\u043C \u043D\u0430 5 \u0441: \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0443\u0434\u0430\u0440 \u0434\u0430\u0440\u043E\u0432 +40%. \u0422\u043E\u043B\u044C\u043A\u043E \u0432 \u0431\u043E\u044E."
  },
  crystal_guard: {
    name: "\u041A\u0440\u0438\u0441\u0442\u0430\u043B\u044C\u043D\u0430\u044F \u0437\u0430\u0449\u0438\u0442\u0430",
    icon: "icon_potion_guard",
    color: 8370431,
    effect: { type: "guard", incoming: 0.75, sec: 12 },
    text: "\u0414\u0432\u0435\u043D\u0430\u0434\u0446\u0430\u0442\u044C \u0441\u0435\u043A\u0443\u043D\u0434 \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u043C\u044B\u0439 \u0443\u0440\u043E\u043D \u221225%. \u0422\u043E\u043B\u044C\u043A\u043E \u0432 \u0431\u043E\u044E."
  }
};
var CRAFT_ITEMS = {
  reinforced_resin: { name: "\u0423\u0441\u0438\u043B\u0435\u043D\u043D\u0430\u044F \u0441\u043C\u043E\u043B\u0430", icon: "icon_reinforced_resin", color: 15245386, text: "\u041A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442 \u0434\u043B\u044F \u0441\u0438\u043B\u044C\u043D\u044B\u0445 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u043E\u0432 \u0438 \u0443\u043B\u0443\u0447\u0448\u0435\u043D\u0438\u044F \u0430\u043C\u0443\u043B\u0435\u0442\u043E\u0432." },
  astral_lens: { name: "\u0410\u0441\u0442\u0440\u0430\u043B\u044C\u043D\u0430\u044F \u043B\u0438\u043D\u0437\u0430", icon: "icon_astral_lens", color: 10466559, text: "\u041D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0440\u044F\u0434\u043E\u0432: \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u0442\u0430\u0439\u043D\u0438\u043A\u0438 \u0438 \u0441\u043A\u0440\u044B\u0442\u044B\u0435 \u043C\u0430\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0441\u043B\u0435\u0434\u044B (\u0432 \u0433\u043E\u0440\u043E\u0434\u0435 \u0438 \u0432\u044B\u043B\u0430\u0437\u043A\u0430\u0445)." }
};
var RESOURCE_ITEMS = {
  ...Object.fromEntries(Object.entries(RESOURCES).map(([id, r]) => [id, { name: r.name, icon: r.icon }])),
  ...Object.fromEntries(Object.entries(POTIONS).map(([id, r]) => [id, { name: r.name, icon: r.icon }])),
  ...Object.fromEntries(Object.entries(CRAFT_ITEMS).map(([id, r]) => [id, { name: r.name, icon: r.icon }]))
};
var POTION_BATTLE_LIMIT = 4;

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
    reward: { heroXP: 50, coins: 100, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 3 }, topUp: { school: { telekinesis: 150 }, items: { lunar_shard: 5, coins: 195 } } }
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
    reward: { heroXP: 100, coins: 60, schoolXP: { seal: 40 } }
  }
};
var FIRST_CRAFT = { event: "first_craft_complete", reward: { heroXP: 15 } };
var MIGRATION_V10 = {
  event: "mig_v10",
  guardian: "forest_guardian_01",
  item: "rare_core",
  notIf: ["restoration_bundle_crafted", "chapter_1_complete"]
};

// src/config/build.js
var GIFT_IDS = ["telekinesis", "fire", "seal", "ice"];
var SLOT_RULES = { base: 3, extraAtLevel: null };
var AMULET_SLOTS = 2;
var AMULETS = {
  amulet_focus: {
    name: "\u0410\u043C\u0443\u043B\u0435\u0442 \u0421\u043E\u0441\u0440\u0435\u0434\u043E\u0442\u043E\u0447\u0435\u043D\u0438\u044F",
    icon: "icon_amulet_focus",
    rarity: "common",
    text: "\u0423\u0440\u043E\u043D \u0434\u0430\u0440\u043E\u0432 \u0438 \u0430\u0432\u0442\u043E\u0430\u0442\u0430\u043A\u0438 +12%.",
    tradeoff: "\u041D\u0435\u0442 \u0437\u0430\u0449\u0438\u0442\u044B: \u0432\u0440\u0430\u0433 \u0431\u044C\u0451\u0442 \u043A\u0430\u043A \u043E\u0431\u044B\u0447\u043D\u043E.",
    effect: { damageMult: 1.12 }
  },
  amulet_forest: {
    name: "\u041B\u0435\u0441\u043D\u043E\u0439 \u0430\u043C\u0443\u043B\u0435\u0442",
    icon: "icon_amulet_forest",
    rarity: "common",
    text: "\u041F\u043E\u043B\u0443\u0447\u0430\u0435\u043C\u044B\u0439 \u0443\u0440\u043E\u043D \u221220%.",
    tradeoff: "\u0423\u0440\u043E\u043D \u0433\u0435\u0440\u043E\u044F \u22128%.",
    effect: { incomingMult: 0.8, damageMult: 0.92 }
  },
  amulet_lunar: {
    name: "\u041B\u0443\u043D\u043D\u044B\u0439 \u0430\u043C\u0443\u043B\u0435\u0442",
    icon: "icon_amulet_lunar",
    rarity: "rare",
    text: "\u041E\u0434\u0438\u043D \u0440\u0430\u0437 \u0437\u0430 \u0431\u043E\u0439, \u043A\u043E\u0433\u0434\u0430 \u043C\u0430\u043D\u044B \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043C\u0435\u043D\u044C\u0448\u0435 20%, \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u043F\u043E\u043B\u043E\u0432\u0438\u043D\u0443 \u0437\u0430\u043F\u0430\u0441\u0430.",
    tradeoff: "\u0421\u0430\u043C \u043F\u043E \u0441\u0435\u0431\u0435 \u0441\u0438\u043B\u0443 \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0435\u0442.",
    effect: { manaRescue: { below: 0.2, gainPct: 0.5 } }
  },
  // v0.19.0: первый амулет Льда (рецепт главы II, chapter-2-balance-v0.1.md §18)
  amulet_frost: {
    name: "\u0410\u043C\u0443\u043B\u0435\u0442 \u0438\u043D\u0435\u044F",
    icon: "icon_amulet_frost",
    rarity: "rare",
    text: "\u0423\u0434\u0430\u0440 \u041B\u044C\u0434\u0430 +10%, \u0437\u0430\u043C\u0435\u0434\u043B\u0435\u043D\u0438\u0435 \u041B\u044C\u0434\u043E\u043C \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u043D\u0430 5%.",
    tradeoff: "\u0411\u0435\u0437 \u041B\u044C\u0434\u0430 \u0432 \u0431\u0438\u043B\u0434\u0435 \u043F\u043E\u0447\u0442\u0438 \u0431\u0435\u0441\u043F\u043E\u043B\u0435\u0437\u0435\u043D.",
    effect: { iceMult: 1.1, slowBonus: 0.05 }
  }
};
var AMULET_IDS = Object.keys(AMULETS);
var AMULET_UPGRADES = [
  { coins: 120, items: { tree_resin: 2, rune_dust: 1 } },
  { coins: 220, items: { ice_crystal: 2, rune_dust: 2 } },
  { coins: 400, items: { frost_shard: 2, lunar_shard: 3 } }
];
var AMULET_LEVEL_STEP = 0.25;
function amuletEffect(id, level = 0, legacy = false) {
  const e = AMULETS[id]?.effect;
  if (!e) return {};
  const k = 1 + AMULET_LEVEL_STEP * Math.max(0, Math.min(level || 0, AMULET_UPGRADES.length));
  const r = (v) => Math.round(v * 1e3) / 1e3;
  const out = { ...e };
  if (e.damageMult && e.damageMult > 1) out.damageMult = r(1 + (e.damageMult - 1) * k);
  if (e.incomingMult) out.incomingMult = r(1 - (1 - e.incomingMult) * k);
  if (e.manaRescue) out.manaRescue = { ...e.manaRescue, gainPct: legacy ? r(e.manaRescue.gainPct * k) : r(e.manaRescue.gainPct + 0.1 * Math.max(0, Math.min(level || 0, AMULET_UPGRADES.length))) };
  if (e.iceMult) out.iceMult = r(1 + (e.iceMult - 1) * k);
  if (e.slowBonus) out.slowBonus = r(e.slowBonus * k);
  return out;
}
var slotCount = (level, rules = SLOT_RULES) => rules.base + (rules.extraAtLevel != null && (level || 0) >= rules.extraAtLevel ? 1 : 0);
var defaultSlots = (unlocked, count, gifts = GIFT_IDS) => gifts.filter((g) => unlocked.includes(g)).slice(0, count);
var isStrArr = (a) => Array.isArray(a) && a.length <= 8 && a.every((x) => typeof x === "string");
var hasDup = (a) => new Set(a).size !== a.length;
function checkBuild(c, want, rules) {
  const hasSlots = want.slots !== void 0 && want.slots !== null;
  const hasAmulets = want.amulets !== void 0 && want.amulets !== null;
  if (hasSlots && !isStrArr(want.slots) || hasAmulets && !isStrArr(want.amulets) || !hasSlots && !hasAmulets) return { ok: false, reason: "bad" };
  if (c.combat) return { ok: false, reason: "combat" };
  if (hasSlots) {
    const a = want.slots;
    if (a.length === 0) return { ok: false, reason: "none" };
    if (hasDup(a)) return { ok: false, reason: "dup" };
    if (a.some((g) => !rules.gifts.includes(g))) return { ok: false, reason: "unknown" };
    if (a.some((g) => !c.unlocked.includes(g))) return { ok: false, reason: "locked" };
    if (a.length > slotCount(c.level, rules.slots)) return { ok: false, reason: "too_many" };
  }
  if (hasAmulets) {
    const a = want.amulets;
    if (hasDup(a)) return { ok: false, reason: "dup" };
    if (a.some((g) => !rules.amulets.includes(g))) return { ok: false, reason: "unknown" };
    if (a.some((g) => !c.owns(g))) return { ok: false, reason: "missing" };
    if (a.length > rules.amuletSlots) return { ok: false, reason: "too_many" };
  }
  return { ok: true };
}
function buildSlotRules() {
  return {
    slots: { ...SLOT_RULES },
    amuletSlots: AMULET_SLOTS,
    amulets: [...AMULET_IDS],
    gifts: [...GIFT_IDS],
    amuletUpgrades: AMULET_UPGRADES.map((u) => ({ coins: u.coins, items: { ...u.items } }))
  };
}

// src/config/bag.js
var BAG = { initial: 100, increment: 50, price: 300, max: 1e9, version: 29 };
var BAG_ITEMS = [...Object.keys(RESOURCES), ...Object.keys(POTIONS), ...Object.keys(CRAFT_ITEMS), "crimson_ember", "moonstone"];
var counted = new Set(BAG_ITEMS);
var takesBagSpace = (id) => counted.has(id);
var bagUsed = (inventory) => BAG_ITEMS.reduce((n, id) => n + Math.max(0, Number(inventory?.[id]) || 0), 0);
function bagData(objects) {
  const raw = objects?.player_bag;
  return {
    capacity: Number.isInteger(raw?.capacity) && raw.capacity >= BAG.initial && raw.capacity <= BAG.max ? raw.capacity : BAG.initial,
    pending: Object.fromEntries(Object.entries(raw?.pending || {}).filter(([id, n]) => counted.has(id) && Number.isInteger(n) && n > 0)),
    version: raw?.version === BAG.version ? BAG.version : 0
  };
}
var bagView = (state) => {
  const b = bagData(state.data.worldObjects), used = bagUsed(state.data.inventory);
  return { ...b, used, free: Math.max(0, b.capacity - used), price: BAG.price, increment: BAG.increment };
};
var bagRules = () => ({ ...BAG, items: BAG_ITEMS });
var GIFT_PRICES = {
  storyTelekinesis: { coins: 150, sapphires: 0 },
  storyIce2: { coins: 500, sapphires: 0 },
  storyIce3: { coins: 1500, sapphires: 0 },
  tier2: { coins: 2e3, sapphires: 600 },
  tier3: { coins: 1e4, sapphires: 2e3 }
};

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
  // v0.16.0: амулеты (лежат в сумке, надеваются на экране «Дары»)
  ...Object.fromEntries(Object.entries(AMULETS).map(([id, a]) => [id, { name: a.name, icon: a.icon }])),
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
  },
  // v0.16.0 — ступень III Огня и Астрала: по две ветки (выбирается одна; цена общая). Уровень героя 8 — «дополнительный выход» после главы I.
  fire_3_arsonist: {
    ability: "fire",
    toLevel: 3,
    branch: "arsonist",
    title: "\u041E\u0433\u043E\u043D\u044C III \xB7 \u041F\u043E\u0434\u0436\u0438\u0433\u0430\u0442\u0435\u043B\u044C",
    description: "\u041B\u0443\u0436\u0430 \u0441\u043C\u043E\u043B\u044B \u043F\u043E\u0441\u043B\u0435 \u0443\u0434\u0430\u0440\u0430. \u0412\u0435\u0442\u043A\u0430 \xAB\u041F\u043E\u0434\u0436\u0438\u0433\u0430\u0442\u0435\u043B\u044C\xBB: \u0433\u043E\u0440\u0435\u043D\u0438\u0435 \u0438 \u043B\u0443\u0436\u0430 \u0434\u0435\u0440\u0436\u0430\u0442\u0441\u044F \u0434\u043E\u043B\u044C\u0448\u0435, \u043D\u043E \u043F\u0440\u044F\u043C\u043E\u0439 \u0443\u0434\u0430\u0440 \u0441\u043B\u0430\u0431\u0435\u0435 \u043D\u0430 20%.",
    requires: { heroLevel: 8, abilityLevel: 2 },
    cost: { schoolXP: 300, items: { crimson_ember: 10 } },
    timerSec: { prototype: 120, live: 90 * 60 },
    doneText: "\u041E\u0433\u043E\u043D\u044C \u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u0433\u043E\u0440\u044F\u0449\u0443\u044E \u043B\u0443\u0436\u0443, \u0438 \u043F\u043B\u0430\u043C\u044F \u0434\u0435\u0440\u0436\u0438\u0442\u0441\u044F \u0437\u0430\u043C\u0435\u0442\u043D\u043E \u0434\u043E\u043B\u044C\u0448\u0435."
  },
  fire_3_blaster: {
    ability: "fire",
    toLevel: 3,
    branch: "blaster",
    title: "\u041E\u0433\u043E\u043D\u044C III \xB7 \u0412\u0437\u0440\u044B\u0432\u043D\u0438\u043A",
    description: "\u0412\u0435\u0442\u043A\u0430 \xAB\u0412\u0437\u0440\u044B\u0432\u043D\u0438\u043A\xBB: \u043F\u0440\u044F\u043C\u043E\u0439 \u0443\u0434\u0430\u0440 \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u043D\u0430 80%, \u043D\u043E \u0431\u0435\u0437 \u043B\u0443\u0436\u0438, \u0434\u043E\u0440\u043E\u0436\u0435 \u0438 \u0441 \u0434\u043E\u043B\u0433\u043E\u0439 \u043F\u0435\u0440\u0435\u0437\u0430\u0440\u044F\u0434\u043A\u043E\u0439.",
    requires: { heroLevel: 8, abilityLevel: 2 },
    cost: { schoolXP: 300, items: { crimson_ember: 10 } },
    timerSec: { prototype: 120, live: 90 * 60 },
    doneText: "\u041E\u0433\u043E\u043D\u044C \u0432\u0437\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u0432 \u0446\u0435\u043B\u044C \u2014 \u043E\u0434\u0438\u043D \u0443\u0434\u0430\u0440, \u043D\u043E \u043A\u0430\u043A\u043E\u0439."
  },
  seal_3_seer: {
    ability: "seal",
    toLevel: 3,
    branch: "seer",
    title: "\u0410\u0441\u0442\u0440\u0430\u043B III \xB7 \u0412\u0438\u0434\u044F\u0449\u0438\u0439",
    description: "\u0412\u0441\u043F\u044B\u0448\u043A\u0430 \u0441\u043D\u0438\u043C\u0430\u0435\u0442 \u0431\u0440\u043E\u043D\u044E \u0438 \u043A\u043E\u0440\u0443. \u0412\u0435\u0442\u043A\u0430 \xAB\u0412\u0438\u0434\u044F\u0449\u0438\u0439\xBB: \u0432\u0441\u043F\u044B\u0448\u043A\u0430 \u0434\u043B\u0438\u0442\u0441\u044F 4 \u0441, \u0438 \u0432\u0440\u0430\u0433 \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442 \u043D\u0430 15% \u0431\u043E\u043B\u044C\u0448\u0435 \u0443\u0440\u043E\u043D\u0430, \u043D\u043E \u0441\u0430\u043C \u0443\u0434\u0430\u0440 \u0441\u043B\u0430\u0431\u0435\u0435 \u043D\u0430 15%.",
    requires: { heroLevel: 8, abilityLevel: 2 },
    cost: { schoolXP: 300, items: { lunar_shard: 10, rune_dust: 4 } },
    timerSec: { prototype: 120, live: 120 * 60 },
    doneText: "\u041F\u043E\u0441\u043B\u0435 \u0443\u0434\u0430\u0440\u0430 \u0410\u0441\u0442\u0440\u0430\u043B\u0430 \u0432\u0440\u0430\u0433 \u0431\u0435\u0437\u0437\u0430\u0449\u0438\u0442\u0435\u043D \u0438 \u0443\u044F\u0437\u0432\u0438\u043C."
  },
  seal_3_piercer: {
    ability: "seal",
    toLevel: 3,
    branch: "piercer",
    title: "\u0410\u0441\u0442\u0440\u0430\u043B III \xB7 \u041F\u0440\u043E\u0431\u0438\u0432\u0430\u044E\u0449\u0438\u0439",
    description: "\u0412\u0441\u043F\u044B\u0448\u043A\u0430 \u0441\u043D\u0438\u043C\u0430\u0435\u0442 \u0431\u0440\u043E\u043D\u044E \u0438 \u043A\u043E\u0440\u0443. \u0412\u0435\u0442\u043A\u0430 \xAB\u041F\u0440\u043E\u0431\u0438\u0432\u0430\u044E\u0449\u0438\u0439\xBB: \u0443\u0434\u0430\u0440 \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u043D\u0430 40%, \u043D\u043E \u0432\u0441\u043F\u044B\u0448\u043A\u0430 \u043A\u043E\u0440\u043E\u0447\u0435, \u0430 \u043F\u0435\u0440\u0435\u0437\u0430\u0440\u044F\u0434\u043A\u0430 \u0434\u043B\u0438\u043D\u043D\u0435\u0435.",
    requires: { heroLevel: 8, abilityLevel: 2 },
    cost: { schoolXP: 300, items: { lunar_shard: 10, rune_dust: 4 } },
    timerSec: { prototype: 120, live: 120 * 60 },
    doneText: "\u0410\u0441\u0442\u0440\u0430\u043B \u0431\u044C\u0451\u0442 \u0442\u0430\u043A, \u0447\u0442\u043E \u0437\u0430\u0449\u0438\u0442\u0430 \u043D\u0435 \u0443\u0441\u043F\u0435\u0432\u0430\u0435\u0442 \u0432\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F."
  }
};
for (const [id, up] of Object.entries(UPGRADES)) {
  Object.assign(up.cost, id === "telekinesis_2" ? GIFT_PRICES.storyTelekinesis : up.toLevel === 2 ? GIFT_PRICES.tier2 : GIFT_PRICES.tier3);
}
var BRANCH_RESPEC = { coins: 150 };
var EVENT_REWARDS = {
  unlock_telekinesis_1: { coins: 50 },
  first_world_interaction: { heroXP: 10 },
  lunar_quest_complete: { heroXP: 50, coins: 100, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 3 }, topUpFor: "telekinesis_2" },
  telekinesis_2_complete: { heroXP: 30 },
  heavy_path_open: { heroXP: 20 },
  unlock_fire_1: { heroXP: 30 },
  fire_gate_open: { heroXP: 20, schoolXP: { fire: 20 } },
  // v0.10.0: Селена открывает Печать I сюжетно — без уровня, платы и таймера. Учебный знак и ворота дают только
  // обычный школьный опыт мира (+6), отдельной награды «за обучение» нет.
  unlock_seal_1: { heroXP: 60 },
  // v0.20.0 — глава II, квесты 1–5 (chapter-2-balance-v0.1.md §4; опыт боёв — в наградах врагов)
  ch2_city_arrived: { heroXP: 220, coins: 80 },
  ch2_met_ilaria: { heroXP: 200, coins: 90, items: { frost_herb: 1 } },
  ch2_trace_found: { heroXP: 300, coins: 100, items: { frost_herb: 2, rune_dust: 1 } },
  ch2_archive_read: { heroXP: 320, coins: 110 },
  ch2_met_severin: { heroXP: 340, coins: 100, items: { warm_potion: 1 } },
  // v0.21.0: квесты 6–10 (квест — минус опыт обязательных боёв, chapter-2-balance §4)
  ch2_cargo_reported: { heroXP: 270, coins: 150, items: { frost_herb: 2 } },
  ch2_frost_wave: { heroXP: 280, coins: 120 },
  ch2_nerys_met: { heroXP: 60 },
  ch2_rescue_done: { heroXP: 300, coins: 180, items: { moon_herb: 1, frost_herb: 1, forest_mushroom: 1 } },
  // травы на первый Тёплый настой
  unlock_ice_1: { heroXP: 60 },
  ch2_ice_trained: { heroXP: 240, coins: 100 },
  ch2_quarter_cleared: { heroXP: 340, coins: 200, items: { ice_crystal: 2 } },
  // v0.22.0: квесты 11–15
  unlock_ice_2: { heroXP: 60, items: { ice_crystal: 1, tree_resin: 1, rune_dust: 1 } },
  // материалы на первый Флакон хрупкости
  ch2_brittle_done: { heroXP: 240, coins: 100 },
  ch2_stabilized: { heroXP: 120 },
  ch2_lab_reported: { heroXP: 300, coins: 220, items: { frost_shard: 1, lunar_shard: 2 } },
  ch2_severin_confronted: { heroXP: 380, coins: 100 },
  ch2_coven_met: { heroXP: 60 },
  ch2_coven_ready: { heroXP: 300, coins: 220, items: { ice_crystal: 2 } },
  ch2_epilogue: { heroXP: 250 },
  chapter_2_complete: { heroXP: 300, coins: 330, topUp: { heroXP: 7900 }, items: { frost_shard: 1 } }
  // + 50 сапфиров и титул «Переживший иней» (EVENT_ACTIONS)
};
var BALANCE_MIGRATION = {
  event: "balance_v30_applied",
  coins: {
    unlock_telekinesis_1: 50,
    lunar_quest_complete: 100,
    chapter_1_complete: 30,
    ch2_city_arrived: EVENT_REWARDS.ch2_city_arrived.coins - 60,
    ch2_met_ilaria: EVENT_REWARDS.ch2_met_ilaria.coins - 50,
    ch2_trace_found: EVENT_REWARDS.ch2_trace_found.coins - 80,
    ch2_archive_read: EVENT_REWARDS.ch2_archive_read.coins - 90,
    ch2_met_severin: EVENT_REWARDS.ch2_met_severin.coins - 80,
    ch2_cargo_reported: EVENT_REWARDS.ch2_cargo_reported.coins - 120,
    ch2_frost_wave: EVENT_REWARDS.ch2_frost_wave.coins - 90,
    ch2_rescue_done: EVENT_REWARDS.ch2_rescue_done.coins - 140,
    ch2_ice_trained: EVENT_REWARDS.ch2_ice_trained.coins - 60,
    ch2_quarter_cleared: EVENT_REWARDS.ch2_quarter_cleared.coins - 160,
    ch2_brittle_done: EVENT_REWARDS.ch2_brittle_done.coins - 70,
    ch2_lab_reported: EVENT_REWARDS.ch2_lab_reported.coins - 180,
    ch2_severin_confronted: EVENT_REWARDS.ch2_severin_confronted.coins - 80,
    ch2_coven_ready: EVENT_REWARDS.ch2_coven_ready.coins - 180,
    chapter_2_complete: EVENT_REWARDS.chapter_2_complete.coins - 150
  },
  sapphires: { ch2_quarter_cleared: 10, ch2_coven_ready: 10 }
};

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
      },
      // v0.16.0: ступень III — «лужа смолы»: удар оставляет на земле горящую лужу, она жжёт врага отдельно от горения.
      // Повторный Огонь обновляет и горение, и лужу (не складывает). Ветки накладываются поверх этих чисел.
      3: {
        label: "\u041E\u0433\u043E\u043D\u044C III",
        damage: 22,
        manaCost: 26,
        cooldownSec: 8,
        castSec: 0.3,
        burn: { dps: 5, durationSec: 6 },
        puddle: { dps: 3, durationSec: 5 },
        interruptsNormalCast: false
      }
    },
    // Ветки ступени III (выбирается одна, смена — за монеты вне боя).
    branches: {
      arsonist: {
        name: "\u041F\u043E\u0434\u0436\u0438\u0433\u0430\u0442\u0435\u043B\u044C",
        fromLevel: 3,
        text: "\u041E\u0433\u043E\u043D\u044C \u0434\u0435\u0440\u0436\u0438\u0442\u0441\u044F: \u0433\u043E\u0440\u0435\u043D\u0438\u0435 5 \u0443\u0440\u043E\u043D\u0430 \u0432 \u0441\u0435\u043A\u0443\u043D\u0434\u0443 \u0432\u043E\u0441\u0435\u043C\u044C \u0441\u0435\u043A\u0443\u043D\u0434, \u043B\u0443\u0436\u0430 \u0441\u043C\u043E\u043B\u044B \u0433\u043E\u0440\u0438\u0442 \u0448\u0435\u0441\u0442\u044C.",
        tradeoff: "\u041F\u0440\u044F\u043C\u043E\u0439 \u0443\u0434\u0430\u0440 \u0441\u043B\u0430\u0431\u0435\u0435 \u043D\u0430 20%.",
        mul: { damage: 0.8 },
        set: { burn: { dps: 5, durationSec: 8 }, puddle: { dps: 3, durationSec: 6 } }
      },
      blaster: {
        name: "\u0412\u0437\u0440\u044B\u0432\u043D\u0438\u043A",
        fromLevel: 3,
        text: "\u041E\u0433\u043E\u043D\u044C \u0432\u0437\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F: \u043F\u0440\u044F\u043C\u043E\u0439 \u0443\u0434\u0430\u0440 \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u043D\u0430 80%.",
        tradeoff: "\u041B\u0443\u0436\u0438 \u043D\u0435\u0442, \u043F\u0435\u0440\u0435\u0437\u0430\u0440\u044F\u0434\u043A\u0430 \u043D\u0430 1 \u0441 \u0434\u043E\u043B\u044C\u0448\u0435, \u043D\u0430 4 \u043C\u0430\u043D\u044B \u0434\u043E\u0440\u043E\u0436\u0435.",
        mul: { damage: 1.8 },
        add: { cooldownSec: 1, manaCost: 4 },
        set: { puddle: null }
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
      },
      // v0.16.0: Астрал III — «вспышка»: удар на миг ослепляет врага, и его броня и защитная кора перестают гасить урон
      // всех остальных даров и автоатаки (flash.sec секунд). Ветки накладываются поверх этих чисел.
      3: {
        label: "\u0410\u0441\u0442\u0440\u0430\u043B III",
        damage: 35,
        manaCost: 24,
        cooldownSec: 10,
        castSec: 0.3,
        ignoresDefense: true,
        interruptsStrongCast: false,
        flash: { sec: 2 }
      }
    },
    branches: {
      seer: {
        name: "\u0412\u0438\u0434\u044F\u0449\u0438\u0439",
        fromLevel: 3,
        text: "\u0412\u0441\u043F\u044B\u0448\u043A\u0430 \u0434\u043B\u0438\u0442\u0441\u044F 4 \u0441 \u0438 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u0442 \u0441\u043B\u0430\u0431\u043E\u0435 \u043C\u0435\u0441\u0442\u043E: \u0432\u0440\u0430\u0433 \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442 \u043D\u0430 15% \u0431\u043E\u043B\u044C\u0448\u0435 \u0443\u0440\u043E\u043D\u0430 \u043E\u0442 \u0432\u0441\u0435\u0433\u043E.",
        tradeoff: "\u0421\u0430\u043C \u0443\u0434\u0430\u0440 \u0441\u043B\u0430\u0431\u0435\u0435 \u043D\u0430 15%.",
        mul: { damage: 0.85 },
        set: { flash: { sec: 4, vulnerability: 0.15 } }
      },
      piercer: {
        name: "\u041F\u0440\u043E\u0431\u0438\u0432\u0430\u044E\u0449\u0438\u0439",
        fromLevel: 3,
        text: "\u0423\u0434\u0430\u0440 \u0410\u0441\u0442\u0440\u0430\u043B\u0430 \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u043D\u0430 40%.",
        tradeoff: "\u0412\u0441\u043F\u044B\u0448\u043A\u0430 \u043A\u043E\u0440\u043E\u0447\u0435 (1 \u0441), \u043F\u0435\u0440\u0435\u0437\u0430\u0440\u044F\u0434\u043A\u0430 \u043D\u0430 2 \u0441 \u0434\u043E\u043B\u044C\u0448\u0435.",
        mul: { damage: 1.4 },
        add: { cooldownSec: 2 },
        set: { flash: { sec: 1 } }
      }
    }
  },
  // v0.18.0 — Лёд, четвёртый дар (глава II, docs/design/chapter-2-story-v0.1.md §19–22, §33). Внутренний id — 'ice'.
  // В бою: замедление врага (его атаки и подготовка сильного удара идут медленнее — больше времени на прерывание);
  // со ступени II — «Хрупкость»: следующий удар Телекинеза, Огня или Астрала сильнее, а тяжёлый бросок по хрупкой цели
  // ещё и разбивает броню. Ступени I–III открывает сюжет (обучение у Нэрис), без долгих таймеров.
  ice: {
    name: "\u041B\u0451\u0434",
    color: "ice",
    levels: {
      1: {
        label: "\u041B\u0451\u0434 I",
        damage: 14,
        manaCost: 18,
        cooldownSec: 7,
        castSec: 0.3,
        slow: { pct: 0.35, sec: 4 },
        interruptsNormalCast: false
      },
      2: {
        label: "\u041B\u0451\u0434 II",
        damage: 16,
        manaCost: 20,
        cooldownSec: 7,
        castSec: 0.3,
        slow: { pct: 0.35, sec: 4 },
        brittle: { sec: 5, bonus: 0.4 },
        interruptsNormalCast: false
      },
      3: {
        label: "\u041B\u0451\u0434 III",
        damage: 18,
        manaCost: 22,
        cooldownSec: 7,
        castSec: 0.3,
        slow: { pct: 0.4, sec: 5 },
        brittle: { sec: 5, bonus: 0.4 },
        interruptsNormalCast: false
      }
    },
    branches: {
      frost: {
        name: "\u041C\u043E\u0440\u043E\u0437",
        fromLevel: 3,
        text: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C: \u0437\u0430\u043C\u0435\u0434\u043B\u0435\u043D\u0438\u0435 \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u0438 \u0434\u043E\u043B\u044C\u0448\u0435 \u2014 \u0432\u0440\u0430\u0433 \u043D\u0430 55% \u043C\u0435\u0434\u043B\u0435\u043D\u043D\u0435\u0435 \u0448\u0435\u0441\u0442\u044C \u0441\u0435\u043A\u0443\u043D\u0434.",
        tradeoff: "\u0421\u0430\u043C \u0443\u0434\u0430\u0440 \u0441\u043B\u0430\u0431\u0435\u0435 \u043D\u0430 15%.",
        mul: { damage: 0.85 },
        set: { slow: { pct: 0.55, sec: 6 } }
      },
      shard: {
        name: "\u041E\u0441\u043A\u043E\u043B\u043E\u043A",
        fromLevel: 3,
        text: "\u0423\u0440\u043E\u043D \u0447\u0435\u0440\u0435\u0437 \u0425\u0440\u0443\u043F\u043A\u043E\u0441\u0442\u044C: \u0443\u0434\u0430\u0440 \u041B\u044C\u0434\u0430 \u043F\u043E \u0445\u0440\u0443\u043F\u043A\u043E\u0439 \u0446\u0435\u043B\u0438 \u0440\u0430\u0441\u043A\u0430\u043B\u044B\u0432\u0430\u0435\u0442 \u0435\u0451 \u2014 \u0443\u0440\u043E\u043D \xD72,2, \u0430 \u0425\u0440\u0443\u043F\u043A\u043E\u0441\u0442\u044C \u043E\u0442 \u0434\u0440\u0443\u0433\u0438\u0445 \u0434\u0430\u0440\u043E\u0432 \u0441\u0438\u043B\u044C\u043D\u0435\u0435 (+70%).",
        tradeoff: "\u0417\u0430\u043C\u0435\u0434\u043B\u0435\u043D\u0438\u0435 \u0441\u043B\u0430\u0431\u043E\u0435: 20% \u043D\u0430 \u0442\u0440\u0438 \u0441\u0435\u043A\u0443\u043D\u0434\u044B.",
        set: { slow: { pct: 0.2, sec: 3 }, brittle: { sec: 5, bonus: 0.7 }, shatter: { mult: 2.2 } }
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
  seal: 20,
  // v0.10.1: значимое применение Астрала (учебный камень, ворота, сердце рощи)
  ice: 14
  // v0.18.0: заморозить воду, механизм, нестабильный предмет
};
var SCHOOL_XP_PER_USE = {
  exploration: { telekinesis: 6, fire: 6, seal: 6, ice: 6 },
  combat: { telekinesis: 5, fire: 5, seal: 5, ice: 5 }
};

// src/config/city.plan.js
var CITY_ORIGIN = { x: 6720, y: 600 };
var cityPoint = (x, y) => ({ x: CITY_ORIGIN.x + x, y: CITY_ORIGIN.y + y });
var BUILDINGS = [
  ["north_bay", "\u0421\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0434\u043E\u043C", 200, 100, 540, 420, 470, 520, null],
  ["north_workshop", "\u0414\u043E\u043C \u0441 \u043C\u0430\u0441\u0442\u0435\u0440\u0441\u043A\u043E\u0439", 2240, 100, 560, 420, 2520, 520, null],
  ["cellar", "\u0414\u043E\u043C \u0441 \u043F\u043E\u0433\u0440\u0435\u0431\u043E\u043C", 200, 860, 540, 370, 470, 1230, "ch2_rescue_cellar"],
  ["rescue", "\u0414\u043E\u043C \u0437\u0430 \u043B\u0435\u0434\u044F\u043D\u043E\u0439 \u0434\u0432\u0435\u0440\u044C\u044E", 2240, 860, 560, 370, 2520, 1230, "ch2_rescue_door"],
  ["archive", "\u0413\u043E\u0440\u043E\u0434\u0441\u043A\u043E\u0439 \u0410\u0440\u0445\u0438\u0432", 200, 1640, 540, 420, 470, 2060, null],
  ["society", "\u041E\u0431\u0449\u0435\u0441\u0442\u0432\u043E \u041F\u0440\u0435\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F", 2240, 1640, 560, 420, 2520, 2060, null],
  ["bank", "\u0413\u043E\u0440\u043E\u0434\u0441\u043A\u043E\u0439 \u0411\u0430\u043D\u043A", 2300, 2290, 500, 400, 2550, 2690, null],
  ["duel", "\u041C\u0430\u0433\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0414\u0443\u044D\u043B\u044C", 200, 2940, 600, 420, 500, 3360, "ch2_fin_seal"],
  ["coven", "\u0414\u043E\u043C \u041A\u043E\u0432\u0435\u043D\u043E\u0432", 2240, 2940, 560, 420, 2520, 3360, null],
  ["warehouse_a", "\u0421\u043A\u043B\u0430\u0434 \u0410", 200, 3710, 600, 340, 500, 4050, null],
  ["warehouse_b", "\u0421\u043A\u043B\u0430\u0434 \u0411", 2240, 3710, 560, 340, 2520, 4050, null],
  ["lab", "\u0422\u0430\u0439\u043D\u0430\u044F \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u044F", -700, 2920, 380, 380, -510, 3300, "ch2_lab_open"]
].map(([id, name, x, y, w, h, dx, dy, requires]) => ({ id, name, ...cityPoint(x, y), w, h, door: cityPoint(dx, dy), requires }));
var layouts = [
  ["bank", "\u0413\u043E\u0440\u043E\u0434\u0441\u043A\u043E\u0439 \u0411\u0430\u043D\u043A", 10200, 200, 720, 960],
  ["archive", "\u0413\u043E\u0440\u043E\u0434\u0441\u043A\u043E\u0439 \u0410\u0440\u0445\u0438\u0432", 11800, 200, 900, 1500],
  ["society", "\u041E\u0431\u0449\u0435\u0441\u0442\u0432\u043E \u041F\u0440\u0435\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F", 13400, 200, 900, 1320],
  ["lab", "\u0422\u0430\u0439\u043D\u0430\u044F \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u044F", 10200, 2600, 960, 2160],
  ["duel", "\u041C\u0430\u0433\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0414\u0443\u044D\u043B\u044C", 11800, 2600, 1080, 1680],
  ["coven", "\u0414\u043E\u043C \u041A\u043E\u0432\u0435\u043D\u043E\u0432", 13400, 2600, 840, 1200],
  ["warehouse", "\u0421\u043A\u043B\u0430\u0434\u0441\u043A\u043E\u0439 \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0441", 10200, 5200, 1440, 1680],
  ["cellar", "\u0414\u043E\u043C \u0441 \u043F\u043E\u0433\u0440\u0435\u0431\u043E\u043C", 11800, 5200, 720, 960],
  ["rescue", "\u0414\u043E\u043C \u0437\u0430 \u043B\u0435\u0434\u044F\u043D\u043E\u0439 \u0434\u0432\u0435\u0440\u044C\u044E", 13400, 5200, 720, 960]
];
var CITY_ROOMS = layouts.map(([key, name, x, y, w, h]) => {
  const doors = BUILDINGS.filter((b) => key === "warehouse" ? b.id.startsWith("warehouse_") : b.id === key);
  return {
    id: "city_" + key,
    key,
    name,
    interior: true,
    parent: "city",
    rect: { x, y, w, h },
    requires: doors[0]?.requires,
    lockedText: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0443 \u0432\u0445\u043E\u0434\u0430.",
    arrival: { x: x + w / 2, y: y + h - 180 },
    exit: "room_exit_" + doors[0].id,
    entrances: doors.map((b) => "door_" + b.id),
    extraTop: 120,
    extraBottom: 180
  };
});
var room = (key) => CITY_ROOMS.find((r) => r.key === key);
var rp = (key, x, y) => ({ x: room(key).rect.x + x, y: room(key).rect.y + y });
var CITY_PORTALS = BUILDINGS.filter((b) => !b.id.startsWith("north_")).flatMap((b) => {
  const key = b.id.startsWith("warehouse_") ? "warehouse" : b.id, r = room(key);
  const entryX = key === "warehouse" ? b.id === "warehouse_a" ? 300 : 1140 : r.rect.w / 2;
  const inside = rp(key, entryX, r.rect.h - 180);
  return [
    {
      id: "door_" + b.id,
      kind: "room_door",
      x: b.door.x,
      y: b.door.y + 36,
      ghost: { w: 160, h: 100 },
      radius: 150,
      target: inside,
      room: r.id,
      hint: "\u0412\u043E\u0439\u0442\u0438: " + b.name,
      requiresEvent: b.requires
    },
    {
      id: "room_exit_" + b.id,
      kind: "room_door",
      ...rp(key, entryX, r.rect.h - 55),
      ghost: { w: 160, h: 80 },
      radius: 130,
      target: { x: b.door.x, y: b.door.y + 170 },
      room: "city",
      hint: "\u0412\u044B\u0439\u0442\u0438: " + b.name
    }
  ];
});
var CITY_POSITIONS = Object.fromEntries([
  ["exit_city", cityPoint(-650, 2510)],
  ["frostherb_r1", cityPoint(-480, 2380)],
  ["frostherb_r2", cityPoint(-500, 2800)],
  ["resin_r1", cityPoint(-660, 2640)],
  ["city_board", cityPoint(370, 2430)],
  ["npc_merchant", cityPoint(2120, 2930)],
  ["plaza_trace", cityPoint(1540, 2740)],
  ["plaza_debris", cityPoint(1930, 2370)],
  ["sapphire_city_cache_1", cityPoint(730, 2710)],
  ["sapphire_city_cache_2", cityPoint(2040, 3470)],
  ["npc_ilaria", rp("archive", 260, 1050)],
  ["archive_document", rp("archive", 330, 650)],
  ["npc_severin", rp("society", 360, 710)],
  ["npc_banker", rp("bank", 360, 510)],
  ["npc_rowena", rp("coven", 270, 610)],
  ["npc_duelist", rp("duel", 260, 1280)],
  ["frost_barrier", { ...cityPoint(1500, 1520), collide: { w: 540, h: 40 }, editorStyle: { w: 580, h: 160 } }],
  ["fq_water", { ...cityPoint(1500, 780), collide: { w: 540, h: 40 }, editorStyle: { w: 540, h: 90 } }],
  ["ice_construct", cityPoint(1230, 1350)],
  ["npc_nerys", cityPoint(1580, 1230)],
  ["fq_cellar", cityPoint(540, 1280)],
  ["fq_door", cityPoint(2520, 1280)],
  ["fq_cauldron", cityPoint(2110, 1350)],
  ["lab_seal", cityPoint(-510, 3340)],
  ["lab_herb_1", rp("lab", 140, 720)],
  ["lab_herb_2", rp("lab", 810, 940)],
  ["lab_chest", rp("lab", 160, 1880)],
  ["lab_cauldron", rp("lab", 820, 1880)],
  ["npc_tikhon", rp("lab", 240, 1540)],
  ["lab_journal", rp("lab", 710, 1720)],
  ["wh_cargo", rp("warehouse", 1110, 440)],
  ["wh_equipment", rp("warehouse", 400, 630)],
  ["final_debris", cityPoint(730, 3530)],
  ["final_ice_wall", cityPoint(2180, 2810)],
  ["final_rift", cityPoint(280, 3470)],
  ["final_ward", cityPoint(500, 3400)],
  ["npc_nerys_final", cityPoint(850, 3430)],
  ["final_letters", rp("duel", 840, 590)],
  ["npc_severin_after", rp("duel", 770, 820)],
  ["plaza_critter", cityPoint(1620, 2790)],
  ["road_scavenger", cityPoint(-300, 2510)],
  ["wh_collector_1", rp("warehouse", 430, 1160)],
  ["wh_collector_2", rp("warehouse", 1050, 900)],
  ["wh_elite", rp("warehouse", 790, 490)],
  ["lab_critter", cityPoint(2410, 2220)],
  ["fq_critter", cityPoint(850, 1340)],
  ["fq_collector", cityPoint(2280, 1350)],
  ["fq_training", cityPoint(1500, 590)],
  ["fq_deep_1", cityPoint(940, 320)],
  ["fq_deep_2", cityPoint(2060, 320)],
  ["fq_guardian", cityPoint(1500, 300)],
  ["yard_brittle_1", cityPoint(870, 650)],
  ["yard_brittle_2", cityPoint(2120, 650)],
  ["vol_1", rp("lab", 390, 1240)],
  ["vol_2", rp("lab", 680, 960)],
  ["lab_construct", rp("lab", 480, 450)],
  ["unstable_1", cityPoint(2050, 3450)],
  ["unstable_2", cityPoint(950, 3670)],
  ["final_critter", cityPoint(1390, 2610)],
  ["final_collector", cityPoint(1770, 2870)],
  ["final_construct", cityPoint(1020, 3410)],
  ["final_severin", rp("duel", 540, 600)]
]);
var plannedObject = (o) => {
  const p = CITY_POSITIONS[o.id];
  if (!p) return { ...o };
  const out = { ...o, ...p };
  if (o.target) out.target = { x: o.target.x + p.x - o.x, y: o.target.y + p.y - o.y };
  return out;
};
function cityZoneData() {
  const roomZones = CITY_ROOMS.map((r) => ({ id: { archive: "AR", society: "SO", lab: "LB", duel: "DU", coven: "CV", bank: "BK", warehouse: "WH", cellar: "RC", rescue: "RD" }[r.key], name: r.name, ...r.rect, interior: true, safePoint: r.arrival }));
  return [
    ...roomZones,
    { id: "FQ", name: "\u0417\u0430\u043C\u0451\u0440\u0437\u0448\u0438\u0439 \u043A\u0432\u0430\u0440\u0442\u0430\u043B", ...cityPoint(0, 0), w: 3e3, h: 1520, safePoint: cityPoint(1500, 1610) },
    { id: "P", name: "\u0426\u0435\u043D\u0442\u0440\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u043B\u043E\u0449\u0430\u0434\u044C", ...cityPoint(0, 2100), w: 3e3, h: 800, safePoint: cityPoint(1500, 2780) },
    { id: "R", name: "\u0414\u043E\u0440\u043E\u0433\u0430 \u0432 \u0433\u043E\u0440\u043E\u0434", ...cityPoint(-720, 2300), w: 720, h: 1240, safePoint: cityPoint(-560, 2510) }
  ];
}

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

// src/config/world.city.js
var CITY_GROUND = [
  { tex: "city_paving", x: 2360, y: 1500, w: 1240, h: 3540 },
  { tex: "city_wood_floor", x: 2440, y: 2560, w: 420, h: 480, interior: true, tint: 15326404 },
  { tex: "city_stone_floor", x: 2960, y: 2560, w: 500, h: 480, interior: true },
  // v0.22.0: Дуэльный зал и Дом Ковенов открыты (полы), тайная лаборатория к югу от дороги и проход к ней
  { tex: "city_stone_floor", x: 2420, y: 4100, w: 440, h: 360, interior: true, tint: 13157563 },
  { tex: "city_wood_floor", x: 2960, y: 4100, w: 500, h: 360, interior: true, tint: 13030587 },
  { tex: "stone_path_01", x: 2020, y: 3950, w: 100, h: 120 },
  { tex: "city_stone_floor", x: 1840, y: 4060, w: 480, h: 700, interior: true, tint: 11912649 },
  { tex: "city_wood_floor", x: 3120, y: 3560, w: 400, h: 420, interior: true, tint: 14009773 }
];
function buildingTop(x, y, w, h, doorX) {
  const t = 30;
  return [
    { kind: "wall", x, y, w: doorX - x, h: t },
    { kind: "wall", x: doorX + 100, y, w: x + w - doorX - 100, h: t },
    { kind: "wall", x, y, w: t, h },
    { kind: "wall", x: x + w - t, y, w: t, h },
    { kind: "wall", x, y: y + h - t, w, h: t }
  ];
}
function building(x, y, w, h, doorX = null, doorW = 100) {
  const t = 30, out = [
    { kind: "wall", x, y, w, h: t },
    { kind: "wall", x, y, w: t, h },
    { kind: "wall", x: x + w - t, y, w: t, h }
  ];
  if (doorX == null) out.push({ kind: "wall", x, y: y + h - t, w, h: t });
  else out.push({ kind: "wall", x, y: y + h - t, w: doorX - x, h: t }, { kind: "wall", x: doorX + doorW, y: y + h - t, w: x + w - doorX - doorW, h: t });
  return out;
}
var CITY_COLLIDERS = [
  // ---- всё, что вне дороги и города, — лес (тёмная заливка, деревья — украшения ниже)
  { kind: "trees", x: 1800, y: 0, w: 560, h: 3300 },
  { kind: "trees", x: 1800, y: 3950, w: 220, h: 110 },
  // v0.22.0: к югу от дороги — проход к тайной лаборатории (x 2020–2120)
  { kind: "trees", x: 2360, y: 0, w: 1240, h: 1460 },
  // v0.21.0: город вырос на север (Замёрзший квартал)
  { kind: "trees", x: 2360, y: 5040, w: 1240, h: 360 },
  // ---- городская стена (камень); ворота — проём в западной стене на y 3555–3700
  { kind: "ruin", x: 2360, y: 1460, w: 40, h: 2095 },
  { kind: "ruin", x: 2360, y: 3700, w: 40, h: 1340 },
  { kind: "ruin", x: 2400, y: 1460, w: 1200, h: 40 },
  { kind: "ruin", x: 2400, y: 5e3, w: 1200, h: 40 },
  { kind: "ruin", x: 3560, y: 1500, w: 40, h: 3500 },
  // ---- Архив и Общество Преображения (разрезы с дверью). v0.22.0: Дуэльный зал и Дом Ковенов — с дверью на площадь
  //      (дверь зала закрыта астральным барьером final_ward до финала главы)
  ...building(2440, 2560, 420, 480, 2600),
  ...building(2960, 2560, 500, 480, 3160),
  ...buildingTop(2420, 4100, 440, 360, 2590),
  ...buildingTop(2960, 4100, 500, 360, 3160),
  // ---- Замёрзший квартал: вход — улица между Архивом и Обществом (её закрывает ледяная стена frost_barrier, квест 7).
  // v0.21.0: внутри квартал делит каменная ограда (y 1960–2000) с затопленным проломом fq_water — его замораживают Льдом (квест 9).
  { kind: "ruin", x: 2400, y: 1960, w: 460, h: 40 },
  { kind: "ruin", x: 2400, y: 2500, w: 40, h: 60 },
  { kind: "ruin", x: 2440, y: 2500, w: 420, h: 60 },
  { kind: "ruin", x: 2960, y: 2500, w: 600, h: 60 },
  // ---- предметы с картинкой (низ спрайта на нижней кромке)
  { kind: "furniture", x: 2700, y: 3520, w: 180, h: 60, tex: "fountain_frozen" },
  { kind: "furniture", x: 3240, y: 3360, w: 220, h: 50, tex: "market_stall_01" },
  { kind: "furniture", x: 2470, y: 2730, w: 140, h: 40, tex: "city_archive_shelf" },
  { kind: "furniture", x: 2660, y: 2730, w: 140, h: 40, tex: "city_archive_shelf" },
  { kind: "furniture", x: 2525, y: 2865, w: 160, h: 35, tex: "city_archive_desk" },
  { kind: "furniture", x: 3010, y: 2740, w: 190, h: 40, tex: "city_society_workbench" },
  { kind: "furniture", x: 3310, y: 2740, w: 70, h: 40, tex: "city_coolant_stable" },
  { kind: "furniture", x: 3010, y: 2910, w: 100, h: 30, tex: "city_equipment" },
  { kind: "furniture", x: 3205, y: 3840, w: 230, h: 30, tex: "city_bank_counter" },
  { kind: "furniture", x: 2425, y: 4645, w: 300, h: 65, tex: "city_warehouse" },
  { kind: "furniture", x: 2640, y: 4700, w: 70, h: 40, tex: "city_barrel" },
  { kind: "furniture", x: 3225, y: 4645, w: 300, h: 65, tex: "city_warehouse" },
  { kind: "furniture", x: 3380, y: 4800, w: 100, h: 40, tex: "city_crate" },
  // v0.21.0 (добавлено в конец): вторая половина ограды Замёрзшего квартала
  { kind: "ruin", x: 2960, y: 1960, w: 600, h: 40 },
  // v0.22.0 (добавлено в конец): лес вокруг тайной лаборатории и её каменные стены (вход — пролом x 2020–2120, его держит печать lab_seal)
  { kind: "trees", x: 2120, y: 3950, w: 240, h: 110 },
  { kind: "trees", x: 1800, y: 4060, w: 40, h: 1340 },
  { kind: "trees", x: 2320, y: 4060, w: 40, h: 1340 },
  { kind: "trees", x: 1840, y: 4760, w: 480, h: 640 },
  { kind: "ruin", x: 1840, y: 4060, w: 180, h: 40 },
  { kind: "ruin", x: 2120, y: 4060, w: 200, h: 40 },
  { kind: "ruin", x: 1840, y: 4720, w: 480, h: 40 },
  { kind: "furniture", x: 1885, y: 4430, w: 150, h: 35, tex: "city_society_workbench" },
  { kind: "furniture", x: 2180, y: 4230, w: 100, h: 35, tex: "city_coven_cabinet" },
  { kind: "furniture", x: 3010, y: 4275, w: 120, h: 35, tex: "city_coven_cabinet" },
  // Residential facades in the formerly empty northern edge; physical footprint matches their base.
  { kind: "furniture", x: 2415, y: 1510, w: 430, h: 90, tex: "city_house" },
  { kind: "furniture", x: 3125, y: 1510, w: 430, h: 90, tex: "city_house" },
  { kind: "furniture", x: 3280, y: 2910, w: 120, h: 30, tex: "city_equipment" },
  { kind: "furniture", x: 1885, y: 4240, w: 150, h: 35, tex: "city_lab_machine" },
  { kind: "furniture", x: 2125, y: 4505, w: 150, h: 35, tex: "city_lab_machine" },
  { kind: "furniture", x: 2e3, y: 4680, w: 100, h: 30, tex: "city_equipment" },
  { kind: "furniture", x: 2435, y: 4540, w: 50, h: 20, tex: "city_barrel" },
  { kind: "furniture", x: 3445, y: 4540, w: 50, h: 20, tex: "city_barrel" },
  { kind: "furniture", x: 2685, y: 4545, w: 70, h: 25, tex: "city_crate" },
  { kind: "furniture", x: 3335, y: 4575, w: 70, h: 25, tex: "city_crate" }
];
var CITY_EXTRA_COLLIDERS = [
  ...building(3120, 3560, 400, 420, 3250, 140),
  { kind: "furniture", x: 3380, y: 3720, w: 85, h: 35, tex: "city_bank_safe" },
  { kind: "furniture", x: 3170, y: 3720, w: 80, h: 30, tex: "trunk_01" },
  { kind: "furniture", x: 2690, y: 2935, w: 110, h: 30, tex: "city_archive_shelf" },
  { kind: "furniture", x: 3320, y: 4380, w: 90, h: 30, tex: "trunk_01" },
  { kind: "furniture", x: 3060, y: 4380, w: 170, h: 30, tex: "city_coven_table" },
  { kind: "furniture", x: 2465, y: 4250, w: 80, h: 30, tex: "city_duel_rack" },
  { kind: "furniture", x: 2730, y: 4250, w: 80, h: 30, tex: "city_duel_rack" },
  { kind: "furniture", x: 2415, y: 2070, w: 430, h: 80, tex: "city_frozen_house" },
  { kind: "furniture", x: 3125, y: 2050, w: 430, h: 80, tex: "city_frozen_house" },
  { kind: "furniture", x: 2110, y: 4640, w: 140, h: 35, tex: "city_archive_desk" },
  { kind: "furniture", x: 2205, y: 4400, w: 70, h: 30, tex: "bed_01" },
  { kind: "furniture", x: 1885, y: 4530, w: 70, h: 30, tex: "bed_01" }
];
var CITY_KEEP_CLEAR = [{ x: 1800, y: 3300, w: 1800, h: 1700 }, { x: 2360, y: 1460, w: 1240, h: 1840 }, { x: 1800, y: 3950, w: 560, h: 1450 }];
var CITY_INTERACTIVES = [
  {
    id: "sapphire_city_cache_1",
    kind: "chest",
    x: 2730,
    y: 3480,
    texture: "chest_01",
    radius: 100,
    collide: { w: 50, h: 24 },
    requiresEvent: "ch2_city_arrived",
    reward: { sapphires: 10 },
    hint: "\u0422\u0430\u0439\u043D\u0438\u043A \u0443 \u043F\u043B\u043E\u0449\u0430\u0434\u0438"
  },
  {
    id: "sapphire_city_cache_2",
    kind: "chest",
    x: 2910,
    y: 3960,
    texture: "chest_01",
    radius: 100,
    collide: { w: 50, h: 24 },
    requiresEvent: "ch2_quarter_cleared",
    reward: { sapphires: 10 },
    hint: "\u0422\u0430\u0439\u043D\u0438\u043A \u0443 \u0441\u0442\u0430\u0440\u043E\u0439 \u043E\u0433\u0440\u0430\u0434\u044B"
  },
  // v0.27.0: выходы на карту мира (лес и город — разные локации, переход — только через карту у выхода)
  // Прежний декоративный указатель d05 у перекрёстка теперь открывает карту.
  { id: "exit_forest", kind: "exit", x: 1104, y: 4416, texture: "signpost_01", radius: 110, collide: { w: 24, h: 10 }, hint: "\u041A\u0430\u0440\u0442\u0430 \u043C\u0438\u0440\u0430" },
  { id: "exit_city", kind: "exit", x: 1880, y: 3625, texture: "signpost_01", collide: { w: 24, h: 10 }, radius: 110, hint: "\u041A\u0430\u0440\u0442\u0430 \u043C\u0438\u0440\u0430" },
  // дорога: ресурсы
  { id: "frostherb_r1", kind: "gather", res: "frost_herb", amount: 1, respawnSec: 240, x: 2060, y: 3420, texture: "city_frost_herb", radius: 90, requiresEvent: "ch2_start" },
  { id: "frostherb_r2", kind: "gather", res: "frost_herb", amount: 1, respawnSec: 240, x: 2240, y: 3880, texture: "city_frost_herb", radius: 90, requiresEvent: "ch2_start" },
  { id: "resin_r1", kind: "gather", res: "tree_resin", amount: 1, respawnSec: 240, x: 1920, y: 3860, texture: "resin_log_01", radius: 90 },
  // площадь. v0.23.0: доска поручений (5 поручений дня, взять 3) — открывается после квеста 10
  { id: "city_board", kind: "board", x: 2480, y: 3420, texture: "notice_board_01", collide: { w: 80, h: 20 }, radius: 120, hint: "\u0414\u043E\u0441\u043A\u0430 \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u0439" },
  { id: "npc_ilaria", kind: "npc", npc: "ilaria", x: 2560, y: 3260, texture: "npc_ilaria", collide: { w: 50, h: 24 }, radius: 140 },
  { id: "npc_merchant", kind: "npc", npc: "merchant", x: 3350, y: 3500, texture: "npc_merchant", collide: { w: 50, h: 24 }, radius: 140 },
  { id: "npc_banker", kind: "npc", npc: "banker", x: 3320, y: 3745, texture: "npc_banker", collide: { w: 50, h: 24 }, radius: 180 },
  { id: "npc_duelist", kind: "npc", npc: "duelist", x: 2640, y: 4040, texture: "npc_duelist", collide: { w: 50, h: 24 }, radius: 140 },
  {
    id: "plaza_trace",
    kind: "seal_sigil",
    x: 2860,
    y: 3720,
    texture: "city_frost_trace",
    litTexture: "city_frost_trace",
    litTint: 15259391,
    radius: 120,
    requiresEvent: "ch2_met_ilaria",
    doneEvent: "ch2_trace_astral",
    hint: "\u0418\u043D\u0435\u0439 \u043D\u0430 \u043A\u0430\u043C\u043D\u044F\u0445",
    lockedText: "\u0418\u043D\u0435\u0439 \u043B\u0451\u0433 \u0443\u0437\u043E\u0440\u043E\u043C \u2014 \u0431\u0443\u0434\u0442\u043E \u043A\u0442\u043E-\u0442\u043E \u0432\u044B\u0436\u0435\u0433 \u0435\u0433\u043E \u043C\u0430\u0433\u0438\u0435\u0439. \u0411\u0435\u0437 \u0410\u0441\u0442\u0440\u0430\u043B\u0430 \u043D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u0442\u044C.",
    doneTitle: "\u0421\u043B\u0435\u0434 \u043F\u0440\u043E\u044F\u0432\u0438\u043B\u0441\u044F",
    doneText: "\u0410\u0441\u0442\u0440\u0430\u043B \u043F\u0440\u043E\u044F\u0432\u0438\u043B \u043F\u043E\u0434 \u0438\u043D\u0435\u0435\u043C \u0437\u043D\u0430\u043A\u0438: \u0440\u0443\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u044B\u043B\u044C, \u0441\u043B\u0435\u0434\u044B \u043B\u0443\u043D\u043D\u044B\u0445 \u043E\u0441\u043A\u043E\u043B\u043A\u043E\u0432 \u2014 \u0438 \u043A\u043B\u0435\u0439\u043C\u043E \u043C\u0430\u0441\u0442\u0435\u0440\u0441\u043A\u043E\u0439, \u043A\u043E\u0442\u043E\u0440\u043E\u0433\u043E \u0432\u044B \u043D\u0438\u043A\u043E\u0433\u0434\u0430 \u043D\u0435 \u0432\u0438\u0434\u0435\u043B\u0438.",
    doneButton: "\u0414\u0430\u043B\u044C\u0448\u0435"
  },
  {
    id: "plaza_debris",
    kind: "telekinesis",
    mode: "push",
    weight: "light",
    x: 2960,
    y: 3420,
    texture: "city_crate",
    collide: { w: 70, h: 30 },
    target: { x: 3040, y: 3380 },
    radius: 120,
    requiresEvent: "ch2_met_ilaria",
    doneEvent: "ch2_trace_debris",
    hint: "\u0420\u0430\u0437\u0431\u0438\u0442\u044B\u0439 \u044F\u0449\u0438\u043A",
    hiddenReward: { spawnPickup: { item: "frost_herb", amount: 2 } }
  },
  // Архив: старый документ, который читает Астрал
  {
    id: "archive_document",
    kind: "seal_sigil",
    x: 2605,
    y: 2900,
    elevated: 50,
    texture: "city_archive_document",
    litTexture: "city_archive_document",
    litTint: 15259391,
    radius: 110,
    requiresEvent: "ch2_trace_found",
    doneEvent: "ch2_archive_read",
    hint: "\u0421\u0442\u0430\u0440\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
    lockedText: "\u041F\u044B\u043B\u044C\u043D\u044B\u0435 \u043F\u0430\u043F\u043A\u0438 \u043E \u0445\u043E\u043B\u043E\u0434\u043D\u043E\u0439 \u043C\u0430\u0433\u0438\u0438. \u0418\u043B\u0430\u0440\u0438\u044F \u0441\u043A\u0430\u0436\u0435\u0442, \u0447\u0442\u043E \u0438\u0441\u043A\u0430\u0442\u044C.",
    doneTitle: "\u041E\u0431\u0449\u0435\u0441\u0442\u0432\u043E \u041F\u0440\u0435\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F",
    doneText: "\u041F\u043E\u0434 \u0410\u0441\u0442\u0440\u0430\u043B\u043E\u043C \u0432\u044B\u0446\u0432\u0435\u0442\u0448\u0438\u0435 \u0441\u0442\u0440\u043E\u043A\u0438 \u043F\u0440\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u0438 \u0441\u043D\u043E\u0432\u0430. \u041B\u0435\u0434\u044F\u043D\u0430\u044F \u043C\u0430\u0433\u0438\u044F \u0432 \u044D\u0442\u0438\u0445 \u043A\u0440\u0430\u044F\u0445 \u0440\u0435\u0434\u043A\u0430 \u2014 \u0430 \u043D\u0435\u0434\u0430\u0432\u043D\u043E \u0432\u0441\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u043E \u043D\u0435\u0439 \u0437\u0430\u0431\u0440\u0430\u043B \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u041E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 \u041F\u0440\u0435\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F. \u041F\u043E\u0434\u043F\u0438\u0441\u044C: \u0421\u0435\u0432\u0435\u0440\u0438\u043D \u0412\u0435\u0439\u0440.",
    doneButton: "\u041A \u041E\u0431\u0449\u0435\u0441\u0442\u0432\u0443"
  },
  // Общество Преображения
  { id: "npc_severin", kind: "npc", npc: "severin", x: 3210, y: 2890, texture: "npc_severin", collide: { w: 50, h: 24 }, radius: 140, hideEvent: "ch2_final_start" },
  // ---- v0.21.0: квест 6 «Пропавший груз» — Складской квартал (после боя со сборщиками)
  {
    id: "wh_cargo",
    kind: "telekinesis",
    mode: "push",
    weight: "medium",
    x: 3250,
    y: 4930,
    texture: "city_crate",
    collide: { w: 70, h: 30 },
    target: { x: 3330, y: 4900 },
    radius: 120,
    requiresEnemyDefeated: "wh_elite",
    doneEvent: "ch2_cargo_found",
    hint: "\u042F\u0449\u0438\u043A\u0438 \u0441 \u0433\u0440\u0443\u0437\u043E\u043C",
    hiddenReward: { spawnPickup: { item: "ice_crystal", amount: 1 } }
  },
  {
    id: "wh_equipment",
    kind: "seal_sigil",
    x: 2700,
    y: 4930,
    texture: "city_equipment",
    litTexture: "city_equipment",
    litTint: 15259391,
    radius: 110,
    requiresEvent: "ch2_cargo_found",
    doneEvent: "ch2_serials_read",
    hint: "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0441 \u043A\u043B\u0435\u0439\u043C\u043E\u043C",
    lockedText: "\u042F\u0449\u0438\u043A \u0441 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u0430\u043C\u0438 \u043F\u043E\u0434 \u0438\u043D\u0435\u0435\u043C. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0430\u0437\u0431\u0435\u0440\u0438\u0442\u0435\u0441\u044C \u0441\u043E \u0441\u0431\u043E\u0440\u0449\u0438\u043A\u0430\u043C\u0438.",
    doneTitle: "\u0421\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0435 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435",
    doneText: "\u041F\u043E\u0434 \u0410\u0441\u0442\u0440\u0430\u043B\u043E\u043C \u043F\u0440\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u0438 \u0441\u0435\u0440\u0438\u0439\u043D\u044B\u0435 \u043D\u043E\u043C\u0435\u0440\u0430 \u0438 \u043A\u043B\u0435\u0439\u043C\u043E \u041E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 \u041F\u0440\u0435\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F. \u0420\u044F\u0434\u043E\u043C \u2014 \u043F\u0435\u0447\u0430\u0442\u044C: \xAB\u0421\u043F\u0438\u0441\u0430\u043D\u043E\xBB. \u041F\u043E\u043B\u0433\u043E\u0434\u0430 \u043D\u0430\u0437\u0430\u0434. \u041A\u0442\u043E-\u0442\u043E \u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435\u043C, \u043A\u043E\u0442\u043E\u0440\u043E\u0433\u043E \u043E\u0444\u0438\u0446\u0438\u0430\u043B\u044C\u043D\u043E \u043D\u0435\u0442.",
    doneButton: "\u041A \u0418\u043B\u0430\u0440\u0438\u0438"
  },
  // ---- квест 7 «Чужими руками» → квест 8: ледяная стена на улице к Замёрзшему кварталу. Видна всегда, растапливается Огнём после волны холода.
  {
    id: "frost_barrier",
    kind: "fire",
    x: 2910,
    y: 2560,
    texture: "ice_wall_01",
    collide: { w: 100, h: 60 },
    radius: 130,
    waitEvent: "ch2_frost_wave",
    destroyEvent: "ch2_quarter_open",
    burnSec: 1.6,
    hint: "\u041B\u0435\u0434\u044F\u043D\u0430\u044F \u0441\u0442\u0435\u043D\u0430",
    lockedText: "\u0423\u043B\u0438\u0446\u0443 \u043A \u0441\u0435\u0432\u0435\u0440\u043D\u043E\u043C\u0443 \u043A\u0432\u0430\u0440\u0442\u0430\u043B\u0443 \u043F\u0435\u0440\u0435\u0433\u043E\u0440\u043E\u0434\u0438\u043B\u0430 \u0441\u0442\u0435\u043D\u0430 \u043B\u044C\u0434\u0430. \u0413\u043E\u0440\u043E\u0434 \u0437\u0430\u043F\u0440\u0435\u0442\u0438\u043B \u0442\u0443\u0434\u0430 \u0445\u043E\u0434\u0438\u0442\u044C \u2014 \u043F\u043E\u043A\u0430.",
    doneText: "\u041B\u0451\u0434 \u043F\u043E\u043F\u043B\u044B\u043B \u0438 \u043E\u0441\u0435\u043B. \u041F\u0443\u0442\u044C \u0432 \u0417\u0430\u043C\u0451\u0440\u0437\u0448\u0438\u0439 \u043A\u0432\u0430\u0440\u0442\u0430\u043B \u043E\u0442\u043A\u0440\u044B\u0442."
  },
  // ---- квест 8 «То, что нельзя сжечь» — южная часть квартала
  {
    id: "ice_construct",
    kind: "fire",
    x: 2700,
    y: 2330,
    texture: "ice_construct_01",
    collide: { w: 90, h: 30 },
    radius: 130,
    requiresEvent: "ch2_quarter_open",
    destroyEvent: "ch2_construct_unstable",
    burnSec: 1.4,
    hint: "\u041B\u0435\u0434\u044F\u043D\u0430\u044F \u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F",
    doneText: "\u041A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u0442\u0440\u0435\u0441\u043D\u0443\u043B\u0430 \u2014 \u0438 \u0445\u043E\u043B\u043E\u0434 \u0440\u0432\u0430\u043D\u0443\u043B\u0441\u044F \u043D\u0430\u0440\u0443\u0436\u0443! \u041A\u0442\u043E-\u0442\u043E \u0432 \u0441\u0438\u043D\u0435\u043C \u043F\u043B\u0430\u0449\u0435 \u0432\u0441\u0442\u0430\u043B \u043C\u0435\u0436\u0434\u0443 \u0432\u0430\u043C\u0438 \u0438 \u0432\u0441\u043F\u044B\u0448\u043A\u043E\u0439."
  },
  { id: "npc_nerys", kind: "npc", npc: "nerys", x: 2800, y: 2230, texture: "npc_nerys", collide: { w: 30, h: 14 }, radius: 140, requiresEvent: "ch2_construct_unstable", hideEvent: "ch2_final_start" },
  {
    id: "fq_door",
    kind: "seal_sigil",
    x: 3340,
    y: 2150,
    texture: "frozen_door_01",
    litTexture: "city_door_open",
    radius: 120,
    requiresEnemyDefeated: "fq_collector",
    doneEvent: "ch2_rescue_door",
    hint: "\u041E\u0431\u043B\u0435\u0434\u0435\u043D\u0435\u0432\u0448\u0430\u044F \u0434\u0432\u0435\u0440\u044C",
    lockedText: "\u0417\u0430 \u0434\u0432\u0435\u0440\u044C\u044E \u043A\u0442\u043E-\u0442\u043E \u0441\u0442\u0443\u0447\u0438\u0442. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u2014 \u0441\u0431\u043E\u0440\u0449\u0438\u043A \u0440\u044F\u0434\u043E\u043C.",
    doneTitle: "\u041B\u044E\u0434\u0438 \u0437\u0430 \u0434\u0432\u0435\u0440\u044C\u044E",
    doneText: "\u0410\u0441\u0442\u0440\u0430\u043B \u043F\u043E\u043A\u0430\u0437\u0430\u043B \u0443\u0437\u043B\u044B, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u0434\u0435\u0440\u0436\u0438\u0442\u0441\u044F \u043B\u0451\u0434. \u041D\u044D\u0440\u0438\u0441 \u0440\u0430\u0437\u0431\u0438\u043B\u0430 \u0438\u0445 \u043E\u0434\u043D\u0438\u043C \u043A\u0430\u0441\u0430\u043D\u0438\u0435\u043C \u2014 \u0438 \u0434\u0432\u043E\u0435 \u0436\u0438\u0442\u0435\u043B\u0435\u0439 \u0432\u044B\u0448\u043B\u0438 \u043D\u0430\u0440\u0443\u0436\u0443, \u0434\u0440\u043E\u0436\u0430 \u043E\u0442 \u0445\u043E\u043B\u043E\u0434\u0430.",
    doneButton: "\u0414\u0430\u043B\u044C\u0448\u0435"
  },
  {
    id: "fq_cellar",
    kind: "telekinesis",
    mode: "push",
    weight: "medium",
    x: 2500,
    y: 2190,
    texture: "city_crate",
    collide: { w: 70, h: 30 },
    target: { x: 2440, y: 2260 },
    radius: 120,
    requiresEnemyDefeated: "fq_critter",
    doneEvent: "ch2_rescue_cellar",
    hint: "\u042F\u0449\u0438\u043A\u0438 \u043D\u0430\u0434 \u043F\u043E\u0433\u0440\u0435\u0431\u043E\u043C",
    hiddenReward: { spawnPickup: { item: "frost_herb", amount: 1 } }
  },
  { id: "fq_cauldron", kind: "alchemy", x: 3080, y: 2160, texture: "cauldron_01", collide: { w: 66, h: 26 }, radius: 120, requiresEvent: "ch2_nerys_met" },
  // ---- квест 9 «Холодная наука»: затопленный пролом в ограде замораживают Льдом — за ним тренировочный двор
  {
    id: "fq_water",
    kind: "ice",
    x: 2910,
    y: 2010,
    texture: "water_patch_01",
    frozenTexture: "ice_floor_01",
    walkable: true,
    collide: { w: 100, h: 50 },
    radius: 130,
    doneEvent: "ch2_water_frozen",
    hint: "\u0417\u0430\u0442\u043E\u043F\u043B\u0435\u043D\u043D\u044B\u0439 \u043F\u0440\u043E\u043B\u043E\u043C",
    lockedText: "\u0412\u043E\u0434\u0430 \u0438\u0437 \u043B\u043E\u043F\u043D\u0443\u0432\u0448\u0435\u0439 \u0442\u0440\u0443\u0431\u044B \u0437\u0430\u043B\u0438\u043B\u0430 \u043F\u0440\u043E\u043B\u043E\u043C \u0432 \u043E\u0433\u0440\u0430\u0434\u0435. \u0417\u0434\u0435\u0441\u044C \u043F\u0440\u0438\u0433\u043E\u0434\u0438\u043B\u0441\u044F \u0431\u044B \u041B\u0451\u0434.",
    doneText: "\u0412\u043E\u0434\u0430 \u0441\u0445\u0432\u0430\u0442\u0438\u043B\u0430\u0441\u044C \u043B\u044C\u0434\u043E\u043C \u2014 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0439\u0442\u0438."
  },
  // ---- v0.22.0, квест 12 «Добровольцы»: тайная лаборатория к югу от дороги. Вход держит нестабильная печать — её успокаивает Лёд.
  {
    id: "lab_seal",
    kind: "ice",
    x: 2070,
    y: 4100,
    texture: "city_lab_door",
    frozenTexture: "city_lab_door_open",
    walkable: true,
    groundWhenFrozen: false,
    collide: { w: 100, h: 40 },
    radius: 130,
    waitEvent: "ch2_lab_found",
    doneEvent: "ch2_lab_open",
    hint: "\u041D\u0435\u0441\u0442\u0430\u0431\u0438\u043B\u044C\u043D\u0430\u044F \u043F\u0435\u0447\u0430\u0442\u044C",
    lockedText: "\u0421\u0442\u0430\u0440\u0430\u044F \u0434\u0432\u0435\u0440\u044C \u0432 \u0441\u043A\u043B\u043E\u043D\u0435 \u0445\u043E\u043B\u043C\u0430, \u043D\u0430 \u043D\u0435\u0439 \u0434\u0440\u043E\u0436\u0438\u0442 \u0447\u0443\u0436\u0430\u044F \u043F\u0435\u0447\u0430\u0442\u044C. \u0427\u0442\u043E \u0437\u0430 \u043D\u0435\u0439 \u2014 \u043F\u043E\u043A\u0430 \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E.",
    doneText: "\u041B\u0451\u0434 \u0443\u0441\u043F\u043E\u043A\u043E\u0438\u043B \u043F\u0435\u0447\u0430\u0442\u044C \u2014 \u043C\u0430\u0433\u0438\u044F \u0437\u0430\u043C\u0435\u0440\u043B\u0430, \u0438 \u0434\u0432\u0435\u0440\u044C \u043F\u043E\u0434\u0430\u043B\u0430\u0441\u044C."
  },
  { id: "lab_herb_1", kind: "gather", res: "frost_herb", amount: 1, respawnSec: 240, x: 1900, y: 4230, texture: "city_frost_herb", radius: 90, requiresEvent: "ch2_lab_open" },
  { id: "lab_herb_2", kind: "gather", res: "frost_herb", amount: 1, respawnSec: 240, x: 2270, y: 4300, texture: "city_frost_herb", radius: 90, requiresEvent: "ch2_lab_open" },
  {
    id: "lab_chest",
    kind: "chest",
    x: 1910,
    y: 4680,
    texture: "chest_01",
    collide: { w: 50, h: 24 },
    openTexture: "chest_01_open",
    radius: 110,
    requiresEvent: "ch2_lab_open",
    reward: { items: { rune_dust: 2, lunar_shard: 2, frost_herb: 2 } }
  },
  { id: "lab_cauldron", kind: "alchemy", x: 2260, y: 4690, texture: "cauldron_01", collide: { w: 66, h: 26 }, radius: 120, requiresEvent: "ch2_lab_open" },
  { id: "npc_tikhon", kind: "npc", npc: "tikhon", x: 1990, y: 4580, texture: "npc_tikhon", collide: { w: 30, h: 14 }, radius: 130, requiresEvent: "ch2_vol_1" },
  {
    id: "lab_journal",
    kind: "seal_sigil",
    x: 2180,
    y: 4675,
    elevated: 50,
    texture: "city_lab_journal",
    litTexture: "city_lab_journal",
    litTint: 15259391,
    radius: 110,
    requiresEnemyDefeated: "lab_construct",
    doneEvent: "ch2_lab_journal",
    hint: "\u041B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u043D\u044B\u0439 \u0436\u0443\u0440\u043D\u0430\u043B",
    doneTitle: "\u0416\u0443\u0440\u043D\u0430\u043B \u043E\u043F\u044B\u0442\u043E\u0432",
    doneText: "\u0410\u0441\u0442\u0440\u0430\u043B \u043F\u0440\u043E\u044F\u0432\u0438\u043B \u0441\u0442\u0451\u0440\u0442\u044B\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B. \xAB\u0418\u0441\u043F\u044B\u0442\u0443\u0435\u043C\u044B\u0439 \u21164 \u2014 \u043F\u0440\u0438\u0448\u0451\u043B \u0441\u0430\u043C, \u0445\u043E\u0447\u0435\u0442 \u0437\u0430\u0449\u0438\u0449\u0430\u0442\u044C \u0441\u0435\u043C\u044C\u044E\xBB. \xAB\u0414\u043E\u0437\u0430 \u0441\u043D\u0438\u0436\u0435\u043D\u0430 \u043F\u043E \u0443\u043A\u0430\u0437\u0430\u043D\u0438\u044E \u0421. \u0412.\xBB. \u041F\u043E\u0434\u043F\u0438\u0441\u044C \u043F\u043E\u0434 \u043E\u0442\u0447\u0451\u0442\u043E\u043C \u2014 \u0421\u0435\u0432\u0435\u0440\u0438\u043D \u0412\u0435\u0439\u0440. \u041E\u043D \u0437\u043D\u0430\u043B.",
    doneButton: "\u041A \u0418\u043B\u0430\u0440\u0438\u0438"
  },
  // ---- квест 15 «Город под инеем»: экзамен по четырём дарам на площади (даров — три из четырёх, слоты можно менять)
  {
    id: "final_debris",
    kind: "telekinesis",
    mode: "push",
    weight: "heavy",
    x: 2760,
    y: 3960,
    texture: "city_debris",
    collide: { w: 70, h: 30 },
    target: { x: 2820, y: 3900 },
    radius: 120,
    requiresEvent: "ch2_final_start",
    doneEvent: "ch2_fin_tk",
    hint: "\u0417\u0430\u0432\u0430\u043B \u0443 \u0414\u0443\u044D\u043B\u044C\u043D\u043E\u0433\u043E \u0437\u0430\u043B\u0430"
  },
  {
    id: "final_ice_wall",
    kind: "fire",
    x: 3100,
    y: 3700,
    texture: "ice_wall_01",
    radius: 130,
    requiresEvent: "ch2_final_start",
    destroyEvent: "ch2_fin_fire",
    burnSec: 1.4,
    hint: "\u041B\u0435\u0434\u044F\u043D\u0430\u044F \u043F\u0440\u0435\u0433\u0440\u0430\u0434\u0430",
    doneText: "\u041F\u0440\u0435\u0433\u0440\u0430\u0434\u0430 \u0440\u0430\u0441\u0442\u0430\u044F\u043B\u0430 \u2014 \u0443\u043B\u0438\u0446\u0430 \u043A \u0440\u044B\u043D\u043A\u0443 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u0430."
  },
  // Existing id/event retained for saved games and server validation; the object is a damaged experimental device.
  {
    id: "final_rift",
    kind: "ice",
    x: 2520,
    y: 3880,
    texture: "city_coolant",
    collide: { w: 80, h: 26 },
    frozenTexture: "city_coolant_stable",
    radius: 130,
    requiresEvent: "ch2_final_start",
    doneEvent: "ch2_fin_ice",
    hint: "\u041F\u043E\u0432\u0440\u0435\u0436\u0434\u0451\u043D\u043D\u044B\u0439 \u0440\u0435\u0437\u0435\u0440\u0432\u0443\u0430\u0440",
    lockedText: "\u0418\u0437 \u0442\u0440\u0435\u0441\u043D\u0443\u0432\u0448\u0435\u0433\u043E \u0440\u0435\u0437\u0435\u0440\u0432\u0443\u0430\u0440\u0430 \u0432\u044B\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043C\u0430\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0445\u043E\u043B\u043E\u0434. \u041B\u0451\u0434 \u0441\u0442\u0430\u0431\u0438\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u0442 \u043F\u0440\u0438\u0431\u043E\u0440.",
    doneText: "\u041B\u0451\u0434 \u0441\u0442\u044F\u043D\u0443\u043B \u0442\u0440\u0435\u0449\u0438\u043D\u044B \u2014 \u0440\u0435\u0437\u0435\u0440\u0432\u0443\u0430\u0440 \u0437\u0430\u0442\u0438\u0445."
  },
  {
    id: "final_ward",
    kind: "seal_sigil",
    x: 2640,
    y: 4130,
    texture: "astral_ward_01",
    litTexture: "astral_ward_01",
    collide: { w: 100, h: 30 },
    opens: true,
    radius: 130,
    requiresEvent: "ch2_final_start",
    doneEvent: "ch2_fin_seal",
    hint: "\u0410\u0441\u0442\u0440\u0430\u043B\u044C\u043D\u044B\u0439 \u0431\u0430\u0440\u044C\u0435\u0440",
    lockedText: "\u0414\u0443\u044D\u043B\u044C\u043D\u044B\u0439 \u0437\u0430\u043B \u0437\u0430\u043A\u0440\u044B\u0442.",
    doneTitle: "\u0411\u0430\u0440\u044C\u0435\u0440 \u0441\u043D\u044F\u0442",
    doneText: "\u0410\u0441\u0442\u0440\u0430\u043B \u043D\u0430\u0448\u0451\u043B \u0448\u0432\u044B \u0431\u0430\u0440\u044C\u0435\u0440\u0430 \u2014 \u0438 \u0437\u0430\u0432\u0435\u0441\u0430 \u0440\u0430\u0441\u0441\u044B\u043F\u0430\u043B\u0430\u0441\u044C \u0438\u0441\u043A\u0440\u0430\u043C\u0438. \u0418\u0437\u043D\u0443\u0442\u0440\u0438 \u0442\u044F\u043D\u0435\u0442 \u0445\u043E\u043B\u043E\u0434\u043E\u043C \u0438 \u0433\u043E\u043B\u043E\u0441\u043E\u043C \u0421\u0435\u0432\u0435\u0440\u0438\u043D\u0430.",
    doneButton: "\u0414\u0430\u043B\u044C\u0448\u0435"
  },
  { id: "npc_nerys_final", kind: "npc", npc: "nerys", x: 2800, y: 4040, texture: "npc_nerys", collide: { w: 30, h: 14 }, radius: 140, requiresEvent: "ch2_final_start" },
  {
    id: "final_letters",
    kind: "seal_sigil",
    x: 2510,
    y: 4280,
    texture: "city_letters",
    litTexture: "city_letters",
    litTint: 15259391,
    radius: 110,
    requiresEnemyDefeated: "final_severin",
    doneEvent: "ch2_letters_read",
    hint: "\u0417\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043F\u0438\u0441\u044C\u043C\u0430",
    doneTitle: "\u0427\u0443\u0436\u0430\u044F \u0440\u0443\u043A\u0430",
    doneText: "\u041F\u043E\u0434 \u0410\u0441\u0442\u0440\u0430\u043B\u043E\u043C \u0448\u0438\u0444\u0440 \u043F\u043E\u043F\u043B\u044B\u043B. \u0414\u0435\u043D\u044C\u0433\u0438, \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B, \u0441\u0442\u0430\u0440\u044B\u0435 \u0441\u0445\u0435\u043C\u044B \u2014 \u0432\u0441\u0451 \u044D\u0442\u043E \u0421\u0435\u0432\u0435\u0440\u0438\u043D\u0443 \u043F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u043B \u043A\u0442\u043E-\u0442\u043E \u0434\u0440\u0443\u0433\u043E\u0439. \u041F\u043E\u0434\u043F\u0438\u0441\u0438 \u043D\u0435\u0442. \u0422\u043E\u043B\u044C\u043A\u043E \u0437\u043D\u0430\u043A \u2014 \u0442\u043E\u0442 \u0441\u0430\u043C\u044B\u0439 \u0441\u0442\u0451\u0440\u0442\u044B\u0439 \u0443\u0437\u043E\u0440 \u0441 \u0414\u0440\u0435\u0432\u043D\u0438\u0445 \u0432\u043E\u0440\u043E\u0442 \u0432 \u043B\u0435\u0441\u0443 \u041C\u0438\u0440\u0440\u044B.",
    doneButton: "\u041A \u0418\u043B\u0430\u0440\u0438\u0438"
  },
  { id: "npc_severin_after", kind: "npc", npc: "severin", x: 2780, y: 4380, texture: "npc_severin", collide: { w: 32, h: 14 }, radius: 130, requiresEvent: "ch2_severin_defeated" },
  // ---- квест 14 «Не в одиночку»: Дом Ковенов
  { id: "npc_rowena", kind: "npc", npc: "rowena", x: 3240, y: 4300, texture: "npc_rowena", collide: { w: 50, h: 24 }, radius: 140 }
];
var CITY_ENEMIES = [
  // морозная вспышка на площади (квест 2): появляется, когда герой пришёл в город
  { id: "plaza_critter", enemy: "frost_critter", x: 2780, y: 3800, radius: 130, requiresEvent: "ch2_city_arrived", defeatEvent: "ch2_plaza_cleared" },
  // знакомый противник на дороге (квест 1, необязательный)
  { id: "road_scavenger", enemy: "young_scavenger", x: 2120, y: 3640, radius: 110, requiresEvent: "ch2_start" },
  // v0.21.0 — квест 6: Складской квартал
  { id: "wh_collector_1", enemy: "frost_collector", x: 2560, y: 4800, radius: 120, requiresEvent: "ch2_cargo_start", repeatSec: 600 },
  { id: "wh_collector_2", enemy: "frost_collector", x: 3240, y: 4720, radius: 120, requiresEvent: "ch2_cargo_start", repeatSec: 600 },
  { id: "wh_elite", enemy: "frost_collector_elite", x: 2930, y: 4880, radius: 130, requiresEvent: "ch2_cargo_start", defeatEvent: "ch2_wh_boss" },
  // квест 7: зверь, сбежавший из закрытой лаборатории, — у дверей Общества
  { id: "lab_critter", enemy: "frost_critter", x: 3210, y: 3240, radius: 120, requiresEvent: "ch2_severin_asked", defeatEvent: "ch2_lab_critter" },
  // квест 8: Замёрзший квартал (появляются после знакомства с Нэрис)
  { id: "fq_critter", enemy: "frost_critter", x: 2560, y: 2400, radius: 120, requiresEvent: "ch2_nerys_met", repeatSec: 480 },
  { id: "fq_collector", enemy: "frost_collector", x: 3300, y: 2300, radius: 120, requiresEvent: "ch2_nerys_met" },
  // квест 9: тренировочный двор за проломом
  { id: "fq_training", enemy: "frost_critter", x: 2910, y: 1830, radius: 110, requiresEvent: "unlock_ice_1", defeatEvent: "ch2_training_done" },
  // квест 10 «Выбор»: глубина квартала
  { id: "fq_deep_1", enemy: "frost_collector", x: 2600, y: 1740, radius: 120, requiresEvent: "ch2_choice_start", defeatEvent: "ch2_deep_1", repeatSec: 600 },
  { id: "fq_deep_2", enemy: "frost_collector", x: 3240, y: 1740, radius: 120, requiresEvent: "ch2_choice_start", defeatEvent: "ch2_deep_2", repeatSec: 600 },
  { id: "fq_guardian", enemy: "ice_guardian", x: 2910, y: 1690, radius: 140, requiresEvent: "ch2_choice_start", defeatEvent: "ch2_ice_guardian_defeated", repeatSec: 1200 },
  // v0.22.0 — квест 11 «Хрупкость»: учебные бои во дворе
  { id: "yard_brittle_1", enemy: "frost_collector", x: 2480, y: 1880, radius: 110, requiresEvent: "unlock_ice_2", defeatEvent: "ch2_brittle_1" },
  { id: "yard_brittle_2", enemy: "frost_collector", x: 3400, y: 1880, radius: 110, requiresEvent: "unlock_ice_2", defeatEvent: "ch2_brittle_2" },
  // квест 12: добровольцы и конструкт в лаборатории
  { id: "vol_1", enemy: "volunteer", x: 1970, y: 4320, radius: 110, requiresEvent: "ch2_lab_open", defeatEvent: "ch2_vol_1" },
  { id: "vol_2", enemy: "volunteer", texture: "enemy_volunteer_miron", x: 2150, y: 4400, radius: 110, requiresEvent: "ch2_lab_open", defeatEvent: "ch2_vol_2" },
  { id: "lab_construct", enemy: "experimental_construct", x: 2080, y: 4600, radius: 120, requiresEvent: "ch2_lab_open", defeatEvent: "ch2_lab_construct", repeatSec: 900 },
  // квест 14: нестабильные конструкции в городе
  { id: "unstable_1", enemy: "frost_collector", x: 3e3, y: 3980, radius: 110, requiresEvent: "ch2_coven_met", defeatEvent: "ch2_unstable_1" },
  { id: "unstable_2", enemy: "frost_collector", x: 2720, y: 4660, radius: 110, requiresEvent: "ch2_coven_met", defeatEvent: "ch2_unstable_2" },
  // квест 15: город во льду и Северин в Дуэльном зале
  { id: "final_critter", enemy: "frost_critter", x: 2900, y: 3420, radius: 110, requiresEvent: "ch2_final_start" },
  { id: "final_collector", enemy: "frost_collector", x: 3010, y: 3620, radius: 110, requiresEvent: "ch2_final_start" },
  { id: "final_construct", enemy: "experimental_construct", x: 2480, y: 3560, radius: 120, requiresEvent: "ch2_final_start" },
  { id: "final_severin", enemy: "severin_boss", x: 2640, y: 4320, radius: 130, requiresEvent: "ch2_ice3", defeatEvent: "ch2_severin_defeated" }
];
var CITY_DECOR = [
  ...[3330, 3420, 3510, 3990, 4080, 4170].map((y, i) => ({ id: `ct_tree_${i}`, k: i % 2 ? "tree_dark_02" : "tree_dark_01", x: i === 4 ? 2250 : 1840 + i % 3 * 170, y: y < 3600 ? 3300 : 4030 })),
  // v0.22.0: проход к лаборатории свободен
  ...[1900, 2050, 2200, 2330].map((x, i) => ({ id: `ct_treeN_${i}`, k: "tree_dark_01", x, y: 3290 })),
  ...[1880, 1960, 2200, 2330].map((x, i) => ({ id: `ct_treeS_${i}`, k: "tree_dark_02", x, y: 4060 })),
  ...[[2440, 3530], [2440, 3800], [3040, 3240], [3040, 4e3], [2900, 4300], [2900, 2470]].map(([x, y], i) => ({ id: `ct_lamp_${i}`, k: "city_lamp_01", x, y })),
  { id: "ct_frost_1", k: "frost_patch_01", x: 2760, y: 3700, floor: true },
  { id: "ct_frost_2", k: "frost_patch_01", x: 2980, y: 3860, floor: true },
  { id: "ct_frost_3", k: "frost_patch_01", x: 2620, y: 3560, floor: true },
  { id: "bank_lamp_w", k: "city_lamp_01", x: 3170, y: 4030 },
  { id: "bank_lamp_e", k: "city_lamp_01", x: 3470, y: 4030 },
  // v0.21.0: Замёрзший квартал — иней на мостовой и фонари
  ...[[2560, 2300], [3180, 2420], [2680, 2080], [3360, 2060], [2560, 1660], [3240, 1640], [2700, 1880], [3420, 1860]].map(([x, y], i) => ({ id: `fq_frost_${i}`, k: "frost_patch_01", x, y, floor: true })),
  ...[[2440, 2470], [3520, 2470], [2440, 1940], [3520, 1940], [2440, 1540], [3520, 1540]].map(([x, y], i) => ({ id: `fq_lamp_${i}`, k: "city_lamp_01", x, y }))
];

// src/config/world.expeditions.js
var FROSTWOOD_START = { x: 3820, y: 2380 };
var GRAVEYARD_START = { x: 3820, y: 5060 };
var OPEN = "chapter_2_complete";
var EXP_ZONES = [
  { id: "FW", name: "\u041C\u043E\u0440\u043E\u0437\u043D\u044B\u0439 \u043B\u0435\u0441", x: 3700, y: 300, w: 1600, h: 2200, safePoint: FROSTWOOD_START },
  { id: "GY", name: "\u0421\u0442\u0430\u0440\u043E\u0435 \u043A\u043B\u0430\u0434\u0431\u0438\u0449\u0435", x: 3700, y: 2800, w: 1600, h: 2400, safePoint: GRAVEYARD_START }
];
var EXP_GROUND = [
  { tex: "snow_ground_01", x: 3700, y: 300, w: 1600, h: 2200 },
  { tex: "grave_ground_01", x: 3700, y: 2800, w: 1600, h: 2400 }
];
var EXP_COLLIDERS = [
  // лес вокруг участков и между ними
  { kind: "trees", x: 3600, y: 0, w: 100, h: 5400 },
  { kind: "trees", x: 3700, y: 0, w: 1700, h: 300 },
  { kind: "trees", x: 3700, y: 2500, w: 1700, h: 300 },
  { kind: "trees", x: 3700, y: 5200, w: 1700, h: 200 },
  { kind: "trees", x: 5300, y: 0, w: 100, h: 5400 },
  // Морозный лес: чащи, между которыми вьётся тропа на север
  { kind: "trees", x: 3700, y: 1900, w: 700, h: 180 },
  { kind: "trees", x: 4600, y: 1900, w: 700, h: 180 },
  { kind: "trees", x: 4150, y: 1300, w: 1150, h: 160 },
  { kind: "trees", x: 3700, y: 760, w: 1050, h: 160 },
  // Старое кладбище: ограды рядов и склеп
  { kind: "ruin", x: 3700, y: 4500, w: 650, h: 40 },
  { kind: "ruin", x: 4550, y: 4500, w: 750, h: 40 },
  { kind: "ruin", x: 3700, y: 3700, w: 900, h: 40 },
  { kind: "ruin", x: 4800, y: 3700, w: 500, h: 40 },
  { kind: "furniture", x: 4400, y: 3040, w: 200, h: 50, tex: "crypt_01" }
];
var EXP_KEEP_CLEAR = [{ x: 3600, y: 0, w: 1800, h: 5400 }];
var EXP_OBJECT_LIST = [
  // v0.27.0: выходы на карту мира (вылазки — отдельные локации; описание места — на карте, config/locations.js)
  { id: "exit_frostwood", kind: "exit", x: 3760, y: 2440, texture: "signpost_01", collide: { w: 24, h: 10 }, radius: 110, hint: "\u041A\u0430\u0440\u0442\u0430 \u043C\u0438\u0440\u0430" },
  { id: "exit_graveyard", kind: "exit", x: 3760, y: 5120, texture: "signpost_01", collide: { w: 24, h: 10 }, radius: 110, hint: "\u041A\u0430\u0440\u0442\u0430 \u043C\u0438\u0440\u0430" },
  // Морозный лес: сбор
  { id: "fw_herb_1", kind: "gather", res: "frost_herb", amount: 1, respawnSec: 300, x: 4500, y: 2300, texture: "city_frost_herb", radius: 90 },
  { id: "fw_herb_2", kind: "gather", res: "frost_herb", amount: 1, respawnSec: 300, x: 3900, y: 1650, texture: "city_frost_herb", radius: 90 },
  { id: "fw_herb_3", kind: "gather", res: "frost_herb", amount: 1, respawnSec: 300, x: 5100, y: 1100, texture: "city_frost_herb", radius: 90 },
  { id: "fw_crystal_1", kind: "gather", res: "ice_crystal", amount: 1, respawnSec: 900, x: 5150, y: 2250, texture: "ice_crystal_node_01", collide: { w: 50, h: 18 }, radius: 90 },
  { id: "fw_crystal_2", kind: "gather", res: "ice_crystal", amount: 1, respawnSec: 900, x: 3850, y: 600, texture: "ice_crystal_node_01", collide: { w: 50, h: 18 }, radius: 90 },
  {
    id: "fw_cache",
    kind: "stash",
    guard: "fw_alpha",
    x: 4500,
    y: 450,
    texture: "city_wolf_cache",
    collide: { w: 70, h: 22 },
    emptyTexture: "city_wolf_cache_empty",
    radius: 110,
    items: { frost_shard: 1, ice_crystal: 1 },
    hint: "\u041B\u043E\u0433\u043E\u0432\u043E \u0432\u043E\u0436\u0430\u043A\u0430",
    label: "\u0417\u0430\u0431\u0440\u0430\u0442\u044C \u0434\u043E\u0431\u044B\u0447\u0443",
    guardText: "\u041B\u043E\u0433\u043E\u0432\u043E \u0441\u0442\u0435\u0440\u0435\u0436\u0451\u0442 \u0412\u043E\u0436\u0430\u043A \u043C\u0435\u0442\u0435\u043B\u0438."
  },
  // Старое кладбище: сбор
  { id: "gy_dust_1", kind: "gather", res: "rune_dust", amount: 1, respawnSec: 300, x: 4100, y: 4800, texture: "rune_sigil_01", radius: 90 },
  { id: "gy_dust_2", kind: "gather", res: "rune_dust", amount: 1, respawnSec: 300, x: 5100, y: 3950, texture: "rune_sigil_01", radius: 90 },
  { id: "gy_mush_1", kind: "gather", res: "forest_mushroom", amount: 1, respawnSec: 300, x: 5050, y: 4900, texture: "mushrooms_brown_01", radius: 90 },
  { id: "gy_mush_2", kind: "gather", res: "forest_mushroom", amount: 1, respawnSec: 300, x: 3900, y: 4100, texture: "mushrooms_brown_01", radius: 90 },
  { id: "gy_shard_1", kind: "gather", res: "lunar_shard", amount: 1, respawnSec: 900, x: 3900, y: 3300, texture: "field_crystal", collide: { w: 60, h: 20 }, radius: 90 },
  {
    id: "gy_cache",
    kind: "stash",
    guard: "gy_warden",
    x: 4800,
    y: 3050,
    texture: "city_grave_cache",
    collide: { w: 60, h: 22 },
    emptyTexture: "city_grave_cache_empty",
    radius: 110,
    items: { frost_shard: 1, lunar_shard: 2 },
    hint: "\u0421\u043E\u043A\u0440\u043E\u0432\u0438\u0449\u0435 \u043A\u0443\u0440\u0433\u0430\u043D\u0430",
    label: "\u0417\u0430\u0431\u0440\u0430\u0442\u044C \u0434\u043E\u0431\u044B\u0447\u0443",
    guardText: "\u0421\u043E\u043A\u0440\u043E\u0432\u0438\u0449\u0435 \u0441\u0442\u0435\u0440\u0435\u0436\u0451\u0442 \u0421\u0442\u0440\u0430\u0436 \u043A\u0443\u0440\u0433\u0430\u043D\u0430."
  }
];
var EXP_INTERACTIVES = EXP_OBJECT_LIST.map((o) => o.kind === "exit" ? o : { ...o, requiresEvent: OPEN });
var EXP_ENEMY_LIST = [
  { id: "fw_wolf_1", enemy: "frost_wolf", x: 4150, y: 2250, radius: 120, repeatSec: 600 },
  { id: "fw_wolf_2", enemy: "frost_wolf", x: 4800, y: 1650, radius: 120, repeatSec: 600 },
  { id: "fw_wolf_3", enemy: "frost_wolf", x: 4e3, y: 1150, radius: 120, repeatSec: 600 },
  { id: "fw_wolf_4", enemy: "frost_wolf", x: 4950, y: 900, radius: 120, repeatSec: 600 },
  { id: "fw_alpha", enemy: "frost_alpha", x: 4500, y: 620, radius: 140, repeatSec: 3600 },
  { id: "gy_wisp_1", enemy: "grave_wisp", x: 4300, y: 4850, radius: 120, repeatSec: 600 },
  { id: "gy_hound_1", enemy: "grave_hound", x: 4900, y: 4700, radius: 120, repeatSec: 600 },
  { id: "gy_wisp_2", enemy: "grave_wisp", x: 4300, y: 4100, radius: 120, repeatSec: 600 },
  { id: "gy_hound_2", enemy: "grave_hound", x: 4950, y: 4150, radius: 120, repeatSec: 600 },
  { id: "gy_warden", enemy: "barrow_warden", x: 4500, y: 3300, radius: 140, repeatSec: 3600 }
];
var EXP_ENEMIES = EXP_ENEMY_LIST.map((e) => ({ ...e, requiresEvent: OPEN }));
var EXP_DECOR = [
  // заснеженные ели вдоль чащ и по краям
  ...[[3760, 520], [3990, 470], [5240, 520], [5240, 1500], [3760, 1450], [5240, 2350], [4700, 2440], [4380, 1720], [4740, 1180], [4250, 640]].map(([x, y], i) => ({ id: `fw_tree_${i}`, k: i % 2 ? "tree_frost_02" : "tree_frost_01", x, y })),
  ...[[4300, 1980], [4900, 1600], [4100, 1500], [4700, 800], [5e3, 2200], [3900, 900]].map(([x, y], i) => ({ id: `fw_frost_${i}`, k: "frost_patch_01", x, y, floor: true })),
  // надгробия рядами, сухие деревья, свечи у склепа
  ...[3850, 4e3, 4150, 4700, 4850, 5e3, 5150].flatMap((x, i) => [
    { id: `gy_stone_a${i}`, k: i % 2 ? "gravestone_02" : "gravestone_01", x, y: 4650 },
    { id: `gy_stone_b${i}`, k: i % 2 ? "gravestone_01" : "gravestone_02", x: x + 30, y: 3880 }
  ]),
  ...[[3760, 3050], [5240, 3100], [5240, 4350], [3760, 4350], [4650, 5150]].map(([x, y], i) => ({ id: `gy_dead_${i}`, k: "dead_tree_grey_01", x, y })),
  { id: "gy_candles_1", k: "candle_group_01", x: 4380, y: 3110 },
  { id: "gy_candles_2", k: "candle_group_01", x: 4640, y: 3110 }
];

// src/config/world.content.js
var CONTENT_INTERACTIVES = [
  // Rare one-time discoveries. Sapphire rewards never go through gather or repeat enemies.
  {
    id: "sapphire_trail_cache",
    kind: "chest",
    x: 1200,
    y: 3900,
    texture: "chest_01",
    radius: 100,
    collide: { w: 50, h: 24 },
    requiresEvent: "unlock_telekinesis_1",
    reward: { sapphires: 10 },
    hint: "\u0422\u0430\u0439\u043D\u0438\u043A \u0443 \u0434\u043E\u0440\u043E\u0433\u0438"
  },
  {
    id: "sapphire_oldwood_cache",
    kind: "chest",
    x: 520,
    y: 1750,
    texture: "chest_01",
    radius: 100,
    collide: { w: 50, h: 24 },
    requiresEvent: "guardian_defeated",
    reward: { sapphires: 10 },
    hint: "\u0422\u0430\u0439\u043D\u0438\u043A \u0421\u0442\u0430\u0440\u043E\u0433\u043E \u043B\u0435\u0441\u0430"
  },
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
  { id: "npc_selena", kind: "npc", npc: "selena", x: 1300, y: 2295, texture: "npc_selena", collide: { w: 30, h: 14 }, radius: 120, elevated: 26 },
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
    collide: { w: 60, h: 20 },
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
var CONTENT_DECOR = [
  { id: "dc_rug", k: "rug_01", x: 905, y: 5222, floor: true },
  { id: "dc_herbs_l", k: "herb_bundle_01", x: 866, y: 4918 },
  { id: "dc_herbs_r", k: "herb_bundle_01", x: 936, y: 4918, flip: true },
  { id: "dc_plant", k: "plant_pot_01", x: 1108, y: 5250 },
  { id: "dc_campfire", k: "campfire_01", x: 1462, y: 3978, fire: true },
  ...CITY_DECOR,
  // v0.20.0: город
  ...EXP_DECOR
  // v0.24.0: вылазки
];

// src/config/world.layout.js
var WORLD = {
  width: 14560,
  // Separate coordinate islands: forest, expeditions, spacious city and its rooms.
  height: 7120,
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
  { id: "L", name: "\u0414\u0440\u0435\u0432\u043D\u0438\u0435 \u0432\u043E\u0440\u043E\u0442\u0430", x: 0, y: 0, w: 1800, h: 1100, safePoint: { x: 900, y: 820 } },
  ...cityZoneData(),
  // v0.20.0: глава II
  ...EXP_ZONES
  // v0.24.0: вылазки
];
var GROUND = [
  { tex: "wooden_floor_01", x: 640, y: 4880, w: 520, h: 420 },
  ...CITY_GROUND,
  ...EXP_GROUND
];
var KEEP_CLEAR = [
  { x: 300, y: 3990, w: 200, h: 200 },
  // проём корней
  { x: 1120, y: 1860, w: 260, h: 200 },
  // проход под глыбу
  { x: 250, y: 1260, w: 300, h: 240 },
  // проход Стража
  { x: 820, y: 330, w: 160, h: 220 },
  // ворота
  { x: 700, y: 125, w: 960, h: 210 },
  // v0.10.0: поляна узла за воротами (то же, что CLEARINGS в world.content.js)
  ...CITY_KEEP_CLEAR,
  ...EXP_KEEP_CLEAR
];
var COLLIDERS = [
  // границы мира (лес)
  { kind: "trees", x: 0, y: 0, w: 100, h: 4880 },
  { kind: "trees", x: 1700, y: 0, w: 100, h: 3550 },
  { kind: "trees", x: 1700, y: 3700, w: 100, h: 1180 },
  { kind: "trees", x: 1760, y: 3550, w: 40, h: 150 },
  { kind: "trees", x: 100, y: 0, w: 1600, h: 110 },
  // A — дом ведьмы
  { kind: "wall", x: 640, y: 4880, w: 220, h: 30 },
  { kind: "wall", x: 940, y: 4880, w: 220, h: 30 },
  { kind: "wall", x: 640, y: 4880, w: 30, h: 420 },
  { kind: "wall", x: 1130, y: 4880, w: 30, h: 420 },
  { kind: "wall", x: 640, y: 5270, w: 520, h: 30 },
  // v0.8: tex — картинка мебели (вместо прямоугольника с подписью); размер на экране — DISPLAY_SIZE
  { kind: "furniture", x: 690, y: 5150, w: 90, h: 100, label: "\u043A\u0440\u043E\u0432\u0430\u0442\u044C", tex: "bed_01" },
  { kind: "furniture", x: 1010, y: 4960, w: 100, h: 60, label: "\u0441\u0442\u043E\u043B", tex: "table_01" },
  { kind: "furniture", x: 690, y: 4910, w: 150, h: 34, label: "\u043F\u043E\u043B\u043A\u0438", tex: "bookshelf_01" },
  { kind: "furniture", x: 960, y: 4910, w: 140, h: 34, label: "\u043F\u043E\u043B\u043A\u0438", tex: "bookshelf_01" },
  { kind: "trees", x: 100, y: 4880, w: 540, h: 520 },
  { kind: "trees", x: 1160, y: 4880, w: 640, h: 520 },
  // B — стартовая поляна: вход в западный лес закрыт корнями (проем 300–500)
  { kind: "trees", x: 100, y: 4030, w: 200, h: 110 },
  { kind: "trees", x: 500, y: 4030, w: 200, h: 110 },
  // C — лесная тропа
  { kind: "trees", x: 820, y: 3300, w: 130, h: 800 },
  { kind: "trees", x: 1550, y: 3300, w: 150, h: 250 },
  { kind: "trees", x: 1550, y: 3700, w: 150, h: 400 },
  // D — первая боевая поляна (коридор мимо врага)
  { kind: "trees", x: 820, y: 2900, w: 280, h: 220 },
  { kind: "trees", x: 1400, y: 2900, w: 300, h: 220 },
  // E — лунный алтарь
  { kind: "ruin", x: 1180, y: 2170, w: 140, h: 50, label: "\u0430\u043B\u0442\u0430\u0440\u044C" },
  { kind: "trees", x: 1560, y: 2360, w: 80, h: 50, single: true },
  // G — тяжёлый проход (проем 1150–1350 закрыт глыбой)
  { kind: "ruin", x: 820, y: 1900, w: 330, h: 120 },
  { kind: "ruin", x: 1350, y: 1900, w: 350, h: 120 },
  // H — круг Огня (тупик)
  { kind: "trees", x: 820, y: 1250, w: 880, h: 50 },
  // J — новая часть леса (извилистая тропа)
  { kind: "trees", x: 100, y: 3600, w: 230, h: 120 },
  { kind: "trees", x: 470, y: 3200, w: 230, h: 120 },
  { kind: "trees", x: 100, y: 2700, w: 240, h: 120 },
  { kind: "trees", x: 460, y: 2250, w: 240, h: 120 },
  // K — поляна Стража (проем 280–520 закрыт Стражем)
  { kind: "ruin", x: 100, y: 1300, w: 180, h: 160 },
  { kind: "ruin", x: 520, y: 1300, w: 180, h: 160 },
  // L — древние ворота
  { kind: "ruin", x: 640, y: 330, w: 120, h: 110 },
  { kind: "ruin", x: 1040, y: 330, w: 120, h: 110 },
  // v0.10.0: древняя стена по обе стороны ворот — за ворота можно попасть только через них (Печать открывает проход).
  // Новые стены — в конце списка: базовые c0… сохраняют свои номера для правок редактора.
  { kind: "ruin", x: 100, y: 330, w: 540, h: 110 },
  { kind: "ruin", x: 1160, y: 330, w: 540, h: 110 },
  // v0.20.0: дорога и город (только в конец — id коллайдеров c<номер>)
  ...CITY_COLLIDERS,
  ...EXP_COLLIDERS,
  // v0.24.0: после городских (номера коллайдеров города не сдвигаются)
  ...CITY_EXTRA_COLLIDERS
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
  { id: "lunar_altar", kind: "altar", x: 1250, y: 2215, texture: "lunar_altar_01", collide: { w: 120, h: 36 }, radius: 130 },
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
  { id: "fire_circle", kind: "fire_circle", x: 1250, y: 1580, texture: "fire_circle_01", collide: { w: 130, h: 36 }, radius: 140 },
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
var INTERACTIVES = [...BASE_INTERACTIVES, ...CONTENT_INTERACTIVES, ...CITY_INTERACTIVES, ...EXP_INTERACTIVES, ...CITY_PORTALS].map(plannedObject);
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
var ENEMY_SPAWNS = [...BASE_ENEMY_SPAWNS, ...CONTENT_ENEMIES, ...CITY_ENEMIES, ...EXP_ENEMIES].map(plannedObject);

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

// src/config/sapphires.js
var SAPPHIRES = {
  perRuble: 10,
  rublesPerSapphire: 0.1,
  // ускорение изучения: за price сапфиров таймер короче на chunkMin минут; совсем до нуля нельзя (остаётся не меньше minLeftSec
  // и не меньше (1 − maxCutPct) полного времени); за сутки (UTC) — не больше dailyChunks таких шагов
  speedup: { chunkMin: 15, price: 10, maxCutPct: 0.75, minLeftSec: 60, dailyChunks: 24 },
  respec: 50,
  // смена ветки вместо монет (BRANCH_RESPEC.coins)
  preset: { price: 150, max: 3 },
  // первый пресет бесплатный, следующие — за сапфиры, всего не больше max
  welcome: 30,
  welcomeEvent: "ch2_city_arrived"
  // один раз — за открытие кошелька (в главе II — «Банк»)
};
function sapphireRules() {
  const s = SAPPHIRES.speedup;
  return {
    speedup: { chunkMs: s.chunkMin * 6e4, price: s.price, maxCutPct: s.maxCutPct, minLeftMs: s.minLeftSec * 1e3, dailyChunks: s.dailyChunks },
    respec: SAPPHIRES.respec,
    presetPrice: SAPPHIRES.preset.price,
    presetMax: SAPPHIRES.preset.max,
    welcome: SAPPHIRES.welcome,
    welcomeEvent: SAPPHIRES.welcomeEvent
  };
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
    iceLevel: 0,
    // v0.18.0
    schoolXP: { telekinesis: 0, fire: 0, seal: 0, ice: 0 },
    unlockedAbilities: [],
    completedEvents: [BALANCE_MIGRATION.event],
    openedPaths: [],
    defeatedEnemies: [],
    inventory: { coins: 0, lunar_shard: 0, lunar_flame: 0 },
    // состояние отдельных объектов мира: { [id]: { state, x, y } }
    worldObjects: { player_bag: { capacity: BAG.initial, pending: {}, version: BAG.version } },
    research: null,
    // { upgradeId, startedAt, durationMs, fullMs? } (fullMs — полное время до ускорений за сапфиры)
    wallet: { sapphires: 0, daily: {}, welcome: false },
    // v0.17.0: кошелёк сапфиров — только от сервера
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
      if (!this.hasEvent(BALANCE_MIGRATION.event)) {
        for (const [ev, n] of Object.entries(BALANCE_MIGRATION.coins)) if (this.hasEvent(ev)) this.addItem("coins", n);
        for (const [ev, n] of Object.entries(BALANCE_MIGRATION.sapphires)) if (this.hasEvent(ev)) this.data.wallet.sapphires += n;
        if (this.hasEvent("lunar_quest_complete") && this.data.telekinesisLevel < 2) this.addItem("coins", Math.max(0, 195 - this.item("coins")));
        if (this.hasEvent("chapter_2_complete")) this.addHeroXP(Math.max(0, 7900 - this.data.heroXP));
        this.markEvent(BALANCE_MIGRATION.event);
        this.save();
      }
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
  awardItem(id, amount = 1) {
    const b = bagView(this);
    if (amount > 0 && takesBagSpace(id) && amount > b.free) {
      b.pending[id] = (b.pending[id] || 0) + amount;
      this.setObject("player_bag", { capacity: b.capacity, pending: b.pending, version: BAG.version });
    } else this.addItem(id, amount);
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
    if (reward.items) for (const [k, v] of Object.entries(reward.items).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (v > 0) {
        this.awardItem(k, v);
        granted.items[k] = v;
      }
    }
    if (reward.sapphires) {
      this.data.wallet.sapphires += reward.sapphires;
      granted.sapphires = reward.sapphires;
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
          const need = v - this.item(k) - (bagView(this).pending[k] || 0);
          if (need > 0) {
            this.awardItem(k, need);
            granted.items[k] = (granted.items[k] || 0) + need;
          }
        }
      }
    }
    let levelUps = [];
    const xp = Math.max(reward.heroXP || 0, (reward.topUp?.heroXP || 0) - this.data.heroXP);
    if (xp) {
      levelUps = this.addHeroXP(xp);
      granted.heroXP = xp;
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
    checks.push({ label: "\u041C\u043E\u043D\u0435\u0442\u044B", item: "coins", have: this.item("coins"), need: up.cost.coins || 0 });
    checks.push({ label: "\u0421\u0430\u043F\u0444\u0438\u0440\u044B", have: this.sapphires(), need: up.cost.sapphires || 0 });
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
    this.removeItem("coins", up.cost.coins || 0);
    this.data.wallet.sapphires -= up.cost.sapphires || 0;
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
    const o = b && typeof b === "object" ? b : {};
    const ids = (a) => Array.isArray(a) ? a.filter((x) => typeof x === "string") : null;
    return {
      branches: { ...o.branches && typeof o.branches === "object" ? o.branches : {} },
      slots: ids(o.slots),
      // null — слоты не настраивались: действуют первые открытые дары
      amulets: ids(o.amulets) || [],
      // v0.19.0: уровни улучшения амулетов { амулет: 1…3 }
      amuletLevels: Object.fromEntries(Object.entries(o.amuletLevels && typeof o.amuletLevels === "object" ? o.amuletLevels : {}).filter(([k, v]) => AMULETS[k] && Number.isInteger(v) && v > 0).map(([k, v]) => [k, Math.min(v, AMULET_UPGRADES.length)])),
      preset: o.preset && typeof o.preset === "object" ? { slots: ids(o.preset.slots) || [], amulets: ids(o.preset.amulets) || [] } : null,
      // v0.17.0: пресеты по номерам (1 — бесплатный, 2… — открытые за сапфиры) и сколько их открыто
      presetSlots: Number.isInteger(o.presetSlots) && o.presetSlots >= 1 ? Math.min(o.presetSlots, SAPPHIRES.preset.max) : 1,
      presets: Object.fromEntries(Array.from({ length: SAPPHIRES.preset.max }, (_, i) => {
        const p = o[i === 0 ? "preset" : `preset${i + 1}`];
        return [i + 1, p && typeof p === "object" ? { slots: ids(p.slots) || [], amulets: ids(p.amulets) || [] } : null];
      }))
    };
  }
  /** Выбранная ветка дара или null. Ветка действует, только пока она есть в данных дара и ступень её достигла. */
  branchOf(abilityId) {
    const id = this.buildData().branches[abilityId];
    const br = id && ABILITIES[abilityId]?.branches?.[id];
    return br && this.abilityLevel(abilityId) >= (br.fromLevel || 1) ? id : null;
  }
  setBranch(abilityId, branchId) {
    const raw = this.getObject("player_build");
    const o = raw && typeof raw === "object" ? raw : {};
    this.setObject("player_build", { ...o, branches: { ...o.branches && typeof o.branches === "object" ? o.branches : {}, [abilityId]: branchId } });
  }
  // ---------- v0.17.0: сапфиры (баланс — только от сервера) ----------
  sapphires() {
    return Number(this.data.wallet?.sapphires) || 0;
  }
  /** Сколько шагов ускорения изучения ещё можно сегодня (сутки UTC). */
  speedupStepsLeftToday() {
    const d = this.data.wallet?.daily || {};
    const day = Math.floor(this.now() / 864e5);
    return SAPPHIRES.speedup.dailyChunks - (d.d === day ? d.n || 0 : 0);
  }
  // ---------- слоты даров, пресет и амулеты (v0.16.0, config/build.js) ----------
  /** Сколько слотов даров у героини. */
  giftSlotCount() {
    return slotCount(this.data.heroLevel);
  }
  /** Дары, которые сейчас в слотах (действуют в бою). Пока слоты не настраивали — первые открытые по порядку. */
  equippedGifts() {
    const unlocked = GIFT_IDS.filter((g) => this.isUnlocked(g));
    const b = this.buildData();
    if (!b.slots) return defaultSlots(unlocked, this.giftSlotCount());
    return b.slots.filter((g) => unlocked.includes(g)).slice(0, this.giftSlotCount());
  }
  isEquipped(id) {
    return this.equippedGifts().includes(id);
  }
  /** Надетые амулеты (их эффекты считает бой). */
  equippedAmulets() {
    return this.buildData().amulets.filter((a) => AMULETS[a]);
  }
  hasAmulet(id) {
    return this.equippedAmulets().includes(id);
  }
  buildContext(inCombat = false) {
    return { level: this.data.heroLevel, unlocked: GIFT_IDS.filter((g) => this.isUnlocked(g)), owns: (id) => this.item(id) >= 1, combat: inCombat };
  }
  /** Выбрать слоты и/или амулеты ({ slots?, amulets? }). Проверка общая с сервером (checkBuild). */
  setBuild(want, inCombat = false) {
    const r = checkBuild(this.buildContext(inCombat), want, buildSlotRules());
    if (!r.ok) return r;
    const raw = this.getObject("player_build");
    const o = raw && typeof raw === "object" ? { ...raw } : {};
    if (want.slots != null) o.slots = [...want.slots];
    if (want.amulets != null) o.amulets = [...want.amulets];
    this.setObject("player_build", o);
    return { ok: true };
  }
  /** Единственный бесплатный пресет: сохранить текущие слоты и амулеты / применить сохранённые. */
  buildPreset(mode, inCombat = false, slot = 1) {
    if (mode !== "save" && mode !== "load") return { ok: false, reason: "bad" };
    if (!Number.isInteger(slot) || slot < 1 || slot > SAPPHIRES.preset.max) return { ok: false, reason: "bad" };
    if (inCombat) return { ok: false, reason: "combat" };
    if (slot > this.buildData().presetSlots) return { ok: false, reason: "locked" };
    const key = slot === 1 ? "preset" : `preset${slot}`;
    const raw = this.getObject("player_build");
    const o = raw && typeof raw === "object" ? { ...raw } : {};
    if (mode === "save") {
      o[key] = { slots: this.equippedGifts(), amulets: this.equippedAmulets() };
      this.setObject("player_build", o);
      return { ok: true };
    }
    if (mode === "load") {
      const p = this.buildData().presets[slot];
      if (!p) return { ok: false, reason: "empty" };
      o.slots = [...p.slots];
      o.amulets = [...p.amulets];
      this.setObject("player_build", o);
      return { ok: true };
    }
    return { ok: false, reason: "bad" };
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
Object.assign(RECIPES, {
  warm_potion: {
    kind: "potion",
    chapter: 2,
    result: "warm_potion",
    amount: 1,
    needs: { moon_herb: 1, frost_herb: 1, forest_mushroom: 1 },
    requires: ["ch2_nerys_met"],
    crafted: "warm_potion_crafted",
    note: "\u041C\u043E\u0440\u043E\u0437\u043D\u0438\u043A, \u043F\u0440\u043E\u0433\u0440\u0435\u0442\u044B\u0439 \u043B\u0443\u043D\u043D\u043E\u0439 \u0442\u0440\u0430\u0432\u043E\u0439, \u2014 \u0442\u0435\u043F\u043B\u043E \u0438\u0437\u043D\u0443\u0442\u0440\u0438."
  },
  stabilizing_potion: {
    kind: "potion",
    chapter: 2,
    result: "stabilizing_potion",
    amount: 1,
    needs: { frost_herb: 2, rune_dust: 1, lunar_shard: 1 },
    requires: ["ch2_lab_open"],
    note: "\u0423\u0441\u043F\u043E\u043A\u0430\u0438\u0432\u0430\u0435\u0442 \u043D\u0435\u0441\u0442\u0430\u0431\u0438\u043B\u044C\u043D\u0443\u044E \u043C\u0430\u0433\u0438\u044E \u0432 \u0442\u0435\u043B\u0435."
  },
  brittle_flask: {
    kind: "potion",
    chapter: 2,
    result: "brittle_flask",
    amount: 1,
    needs: { ice_crystal: 1, tree_resin: 1, rune_dust: 1 },
    requires: ["unlock_ice_2"],
    crafted: "brittle_flask_crafted",
    note: "\u041A\u0440\u0438\u0441\u0442\u0430\u043B\u043B \u0445\u043E\u043B\u043E\u0434\u0430 \u0432 \u0441\u043C\u043E\u043B\u0435: \u0440\u0430\u0437\u0431\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u043E \u0446\u0435\u043B\u044C \u0438 \u0434\u0435\u043B\u0430\u0435\u0442 \u0435\u0451 \u0445\u0440\u0443\u043F\u043A\u043E\u0439."
  },
  crystal_guard: {
    kind: "potion",
    chapter: 2,
    result: "crystal_guard",
    amount: 1,
    needs: { ice_crystal: 1, forest_mushroom: 1, tree_resin: 1 },
    requires: ["ch2_quarter_cleared"],
    note: "\u0422\u043E\u043D\u043A\u0430\u044F \u043B\u0435\u0434\u044F\u043D\u0430\u044F \u043A\u043E\u0440\u043A\u0430 \u043F\u043E\u0432\u0435\u0440\u0445 \u043A\u043E\u0436\u0438 \u2014 \u043D\u0430 \u043E\u0434\u0438\u043D \u0441\u0435\u0440\u044C\u0451\u0437\u043D\u044B\u0439 \u0431\u043E\u0439."
  },
  reinforced_resin: {
    kind: "component",
    chapter: 2,
    result: "reinforced_resin",
    amount: 1,
    needs: { tree_resin: 2, crimson_ember: 1, frost_herb: 1 },
    requires: ["ch2_cargo_found"],
    note: "\u0421\u043C\u043E\u043B\u0430, \u0437\u0430\u043A\u0430\u043B\u0451\u043D\u043D\u0430\u044F \u0443\u0433\u043B\u0451\u043C \u0438 \u0445\u043E\u043B\u043E\u0434\u043E\u043C."
  },
  astral_lens: {
    kind: "tool",
    chapter: 2,
    result: "astral_lens",
    amount: 1,
    needs: { rune_dust: 2, lunar_shard: 1, ice_crystal: 1 },
    requires: ["ch2_cargo_reported"],
    note: "\u041B\u0438\u043D\u0437\u0430 \u0438\u0437 \u043B\u044C\u0434\u0430 \u0438 \u043B\u0443\u043D\u043D\u043E\u0433\u043E \u043E\u0441\u043A\u043E\u043B\u043A\u0430."
  },
  amulet_frost: {
    kind: "amulet",
    chapter: 2,
    result: "amulet_frost",
    amount: 1,
    needs: { lunar_shard: 4, rune_dust: 4, ice_crystal: 3, frost_shard: 1, coins: 250 },
    requires: ["ch2_quarter_cleared"],
    blockedBy: ["amulet_frost_crafted"],
    crafted: "amulet_frost_crafted",
    note: "\u041F\u0435\u0440\u0432\u044B\u0439 \u0430\u043C\u0443\u043B\u0435\u0442 \u041B\u044C\u0434\u0430. \u041D\u0443\u0436\u0435\u043D \u043E\u0434\u0438\u043D: \u0434\u0430\u043B\u044C\u0448\u0435 \u0435\u0433\u043E \u0443\u043B\u0443\u0447\u0448\u0430\u044E\u0442."
  }
});
var RECIPE_ORDER = [
  "elixir_life",
  "elixir_mana",
  "resin_flask",
  "warm_potion",
  "stabilizing_potion",
  "brittle_flask",
  "crystal_guard",
  "lunar_wick",
  "revealing_compound",
  "restoration_bundle",
  "reinforced_resin",
  "astral_lens",
  "amulet_frost"
];
var POTION_RECIPES = RECIPE_ORDER.filter((id) => RECIPES[id].kind === "potion");
var STORY_RECIPES = RECIPE_ORDER.filter((id) => RECIPES[id].kind === "story");

// src/config/quests.js
var SIDE_QUESTS = {
  sq_herbs: {
    title: "\u041B\u0443\u043D\u043D\u044B\u0435 \u0442\u0440\u0430\u0432\u044B \u0434\u043B\u044F \u0412\u0435\u0434\u044B",
    giver: "veda",
    place: "\u0421\u0442\u0430\u0440\u0442\u043E\u0432\u0430\u044F \u043F\u043E\u043B\u044F\u043D\u0430",
    summary: "\u0422\u0440\u0430\u0432\u043D\u0438\u0446\u0430 \u0412\u0435\u0434\u0430 \u0432\u0430\u0440\u0438\u0442 \u043D\u0430\u0441\u0442\u043E\u0439 \u0438 \u043F\u0440\u043E\u0441\u0438\u0442 \u043F\u0440\u0438\u043D\u0435\u0441\u0442\u0438 \u0442\u0440\u0438 \u043B\u0443\u043D\u043D\u044B\u0435 \u0442\u0440\u0430\u0432\u044B. \u041E\u043D\u0438 \u0440\u0430\u0441\u0442\u0443\u0442 \u043D\u0430 \u043F\u043E\u043B\u044F\u043D\u0435 \u0438 \u0432 \u043B\u0435\u0441\u0443 \u2014 \u0438\u0445 \u043C\u043E\u0436\u043D\u043E \u0441\u043E\u0440\u0432\u0430\u0442\u044C \u0438\u043B\u0438 \u043F\u0440\u0438\u0442\u044F\u043D\u0443\u0442\u044C \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C.",
    objectives: [{ type: "item", item: "moon_herb", count: 3, text: "\u041B\u0443\u043D\u043D\u044B\u0435 \u0442\u0440\u0430\u0432\u044B" }],
    turnIn: { npc: "veda", consume: { moon_herb: 3 } },
    reward: { heroXP: 15, coins: 25, items: { elixir_life: 1 } },
    rewardText: "\u041D\u0430\u0441\u0442\u043E\u0439 \u0436\u0438\u0437\u043D\u0438, 25 \u043C\u043E\u043D\u0435\u0442, 15 \u043E\u043F\u044B\u0442\u0430"
  },
  sq_mushrooms: {
    title: "\u0413\u0440\u0438\u0431\u044B \u0434\u043B\u044F \u0441\u0443\u0448\u0438\u043B\u043A\u0438",
    giver: "veda",
    place: "\u0421\u0442\u0430\u0440\u0442\u043E\u0432\u0430\u044F \u043F\u043E\u043B\u044F\u043D\u0430",
    summary: "\u0412\u0435\u0434\u0435 \u043D\u0443\u0436\u043D\u044B \u0434\u0432\u0430 \u043B\u0435\u0441\u043D\u044B\u0445 \u0433\u0440\u0438\u0431\u0430. \u0421\u043E\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0445 \u0432 \u0421\u0442\u0430\u0440\u043E\u043C \u043B\u0435\u0441\u0443 \u0434\u043B\u044F \u0441\u0443\u0448\u0438\u043B\u043A\u0438 \u0442\u0440\u0430\u0432\u043D\u0438\u0446\u044B.",
    requires: { event: "sq_herbs_done", events: ["fire_gate_open"] },
    objectives: [{ type: "item", item: "forest_mushroom", count: 2, text: "\u041B\u0435\u0441\u043D\u044B\u0435 \u0433\u0440\u0438\u0431\u044B" }],
    turnIn: { npc: "veda", consume: { forest_mushroom: 2 } },
    reward: { coins: 35, heroXP: 15, items: { elixir_mana: 1 } },
    rewardText: "\u041B\u0443\u043D\u043D\u044B\u0439 \u044D\u043B\u0438\u043A\u0441\u0438\u0440, 35 \u043C\u043E\u043D\u0435\u0442, 15 \u043E\u043F\u044B\u0442\u0430"
  },
  sq_resin: {
    title: "\u0421\u043C\u043E\u043B\u0430 \u0434\u043B\u044F \u043C\u0430\u0437\u0438",
    giver: "veda",
    place: "\u0421\u0442\u0430\u0440\u0442\u043E\u0432\u0430\u044F \u043F\u043E\u043B\u044F\u043D\u0430",
    summary: "\u041F\u0440\u0438\u043D\u0435\u0441\u0438\u0442\u0435 \u0412\u0435\u0434\u0435 \u0442\u0440\u0438 \u043A\u0443\u0441\u043E\u0447\u043A\u0430 \u0434\u0440\u0435\u0432\u0435\u0441\u043D\u043E\u0439 \u0441\u043C\u043E\u043B\u044B \u0434\u043B\u044F \u043B\u0435\u0447\u0435\u0431\u043D\u043E\u0439 \u043C\u0430\u0437\u0438.",
    requires: { event: "sq_mushrooms_done" },
    objectives: [{ type: "item", item: "tree_resin", count: 3, text: "\u0414\u0440\u0435\u0432\u0435\u0441\u043D\u0430\u044F \u0441\u043C\u043E\u043B\u0430" }],
    turnIn: { npc: "veda", consume: { tree_resin: 3 } },
    reward: { coins: 45, heroXP: 15, items: { elixir_life: 1 } },
    rewardText: "\u041D\u0430\u0441\u0442\u043E\u0439 \u0436\u0438\u0437\u043D\u0438, 45 \u043C\u043E\u043D\u0435\u0442, 15 \u043E\u043F\u044B\u0442\u0430"
  },
  sq_veda_stock: {
    title: "\u0417\u0430\u043F\u0430\u0441 \u0442\u0440\u0430\u0432\u043D\u0438\u0446\u044B",
    giver: "veda",
    place: "\u0421\u0442\u0430\u0440\u0442\u043E\u0432\u0430\u044F \u043F\u043E\u043B\u044F\u043D\u0430",
    summary: "\u041B\u0435\u0441 \u043E\u0436\u0438\u043B. \u041F\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0437\u0430\u043F\u0430\u0441\u044B \u0412\u0435\u0434\u044B: \u043E\u0434\u043D\u0430 \u043B\u0443\u043D\u043D\u0430\u044F \u0442\u0440\u0430\u0432\u0430, \u043E\u0434\u0438\u043D \u0433\u0440\u0438\u0431 \u0438 \u0434\u0432\u0430 \u043A\u0443\u0441\u043E\u0447\u043A\u0430 \u0441\u043C\u043E\u043B\u044B.",
    requires: { event: "sq_resin_done", events: ["chapter_1_complete"] },
    objectives: [
      { type: "item", item: "moon_herb", count: 1, text: "\u041B\u0443\u043D\u043D\u0430\u044F \u0442\u0440\u0430\u0432\u0430" },
      { type: "item", item: "forest_mushroom", count: 1, text: "\u041B\u0435\u0441\u043D\u044B\u0435 \u0433\u0440\u0438\u0431\u044B" },
      { type: "item", item: "tree_resin", count: 2, text: "\u0414\u0440\u0435\u0432\u0435\u0441\u043D\u0430\u044F \u0441\u043C\u043E\u043B\u0430" }
    ],
    turnIn: { npc: "veda", consume: { moon_herb: 1, forest_mushroom: 1, tree_resin: 2 } },
    reward: { coins: 65, heroXP: 20, sapphires: 10 },
    rewardText: "65 \u043C\u043E\u043D\u0435\u0442, 10 \u0441\u0430\u043F\u0444\u0438\u0440\u043E\u0432, 20 \u043E\u043F\u044B\u0442\u0430"
  },
  sq_dust: {
    title: "\u041F\u044B\u043B\u044C \u0434\u0440\u0435\u0432\u043D\u0438\u0445 \u0440\u0443\u043D",
    giver: "selena",
    place: "\u041B\u0443\u043D\u043D\u044B\u0439 \u0430\u043B\u0442\u0430\u0440\u044C",
    summary: "\u0414\u0443\u0445 \u0430\u043B\u0442\u0430\u0440\u044F \u0421\u0435\u043B\u0435\u043D\u0430 \u043F\u0440\u043E\u0441\u0438\u0442 \u043D\u0430\u0439\u0442\u0438 \u0440\u0443\u043D\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u043F\u044B\u043B\u044C \u0443 \u0430\u043B\u0442\u0430\u0440\u044F: \u0435\u0451 \u043C\u043E\u0436\u043D\u043E \u0441\u043E\u0431\u0440\u0430\u0442\u044C \u0441 \u0440\u0443\u043D\u043D\u043E\u0439 \u043F\u043B\u0438\u0442\u044B \u0438\u043B\u0438 \u043D\u0430\u0439\u0442\u0438 \u043F\u043E\u0434 \u0441\u0434\u0432\u0438\u043D\u0443\u0442\u044B\u043C \u043A\u0430\u043C\u043D\u0435\u043C.",
    objectives: [{ type: "item", item: "rune_dust", count: 1, text: "\u0420\u0443\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u044B\u043B\u044C" }],
    turnIn: { npc: "selena", consume: { rune_dust: 1 } },
    reward: { heroXP: 20, schoolXP: { telekinesis: 15 }, items: { lunar_shard: 1, elixir_mana: 1, amulet_lunar: 1 } },
    rewardText: "\u041B\u0443\u043D\u043D\u044B\u0439 \u0430\u043C\u0443\u043B\u0435\u0442, \u043B\u0443\u043D\u043D\u044B\u0439 \u043E\u0441\u043A\u043E\u043B\u043E\u043A, \u043B\u0443\u043D\u043D\u044B\u0439 \u044D\u043B\u0438\u043A\u0441\u0438\u0440, 20 \u043E\u043F\u044B\u0442\u0430",
    requires: { event: "lunar_quest_start" }
    // Селена просит пыль, когда алтарь уже заговорил с героиней
  },
  sq_hunter: {
    title: "\u041F\u0430\u0434\u0430\u043B\u044C\u0449\u0438\u043A \u0443 \u0442\u0440\u043E\u043F\u044B",
    giver: "goran",
    place: "\u041B\u0435\u0441\u043D\u0430\u044F \u0442\u0440\u043E\u043F\u0430",
    summary: "\u041E\u0445\u043E\u0442\u043D\u0438\u043A \u0413\u043E\u0440\u0430\u043D \u043F\u0440\u043E\u0441\u0438\u0442 \u043F\u0440\u043E\u0433\u043D\u0430\u0442\u044C \u043F\u0430\u0434\u0430\u043B\u044C\u0449\u0438\u043A\u0430, \u0440\u0430\u0437\u043E\u0440\u0438\u0432\u0448\u0435\u0433\u043E \u0435\u0433\u043E \u043B\u0430\u0433\u0435\u0440\u044C \u0443 \u0440\u0443\u0447\u044C\u044F. \u041E\u0433\u043E\u043D\u044C \u043F\u0443\u0433\u0430\u0435\u0442 \u0437\u0432\u0435\u0440\u044F, \u0431\u0440\u043E\u0448\u0435\u043D\u043D\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C \u0440\u0430\u043D\u0438\u0442.",
    objectives: [{ type: "enemy", id: "scavenger_02", text: "\u041F\u0440\u043E\u0433\u043D\u0430\u0442\u044C \u043F\u0430\u0434\u0430\u043B\u044C\u0449\u0438\u043A\u0430" }],
    turnIn: { npc: "goran", consume: {} },
    reward: { heroXP: 25, coins: 40, items: { tree_resin: 2, resin_flask: 1, amulet_focus: 1 } },
    rewardText: "\u0410\u043C\u0443\u043B\u0435\u0442 \u0421\u043E\u0441\u0440\u0435\u0434\u043E\u0442\u043E\u0447\u0435\u043D\u0438\u044F, \u0441\u043C\u043E\u043B\u044F\u043D\u0430\u044F \u0441\u043A\u043B\u044F\u043D\u043A\u0430, 2 \u0441\u043C\u043E\u043B\u044B, 40 \u043C\u043E\u043D\u0435\u0442, 25 \u043E\u043F\u044B\u0442\u0430"
  }
};
var SIDE_QUEST_ORDER = ["sq_herbs", "sq_mushrooms", "sq_resin", "sq_veda_stock", "sq_hunter", "sq_dust"];
var questEvent = (id, kind) => `${id}_${kind}`;

// src/config/shop.js
var SHOP = {
  requires: "city_merchant_open",
  buy: {
    moon_herb: 18,
    forest_mushroom: 20,
    tree_resin: 16,
    rune_dust: 28,
    lunar_shard: 45,
    frost_herb: 22,
    ice_crystal: 55
  },
  sellPct: 0.33,
  maxQty: 1e6
};
var sellPrice = (id) => SHOP.buy[id] ? Math.floor(SHOP.buy[id] * SHOP.sellPct) : 0;
function shopRules() {
  return { requires: SHOP.requires, buy: { ...SHOP.buy }, sell: Object.fromEntries(Object.keys(SHOP.buy).map((k) => [k, sellPrice(k)])), maxQty: SHOP.maxQty };
}

// src/config/daily.js
var DAILY = {
  requires: "ch2_quarter_cleared",
  // доска открывается во второй половине главы II (после квеста 10)
  offers: 5,
  picks: 3,
  dayMs: 864e5,
  sapphires: 3
  // v0.32.0: сапфиры за каждое выполненное поручение (3 в день × 3 = 9; брать можно не больше picks)
};
var DAILY_POOL = {
  herbs_alchemist: {
    giver: "\u0411\u043E\u0440\u0438\u0441, \u043B\u0430\u0432\u043A\u0430",
    title: "\u041C\u043E\u0440\u043E\u0437\u043D\u0438\u043A \u0434\u043B\u044F \u043D\u0430\u0441\u0442\u043E\u0435\u043A",
    text: "\u0410\u043B\u0445\u0438\u043C\u0438\u043A\u0443 \u0441 \u0440\u044B\u043D\u043A\u0430 \u043D\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u043C\u043E\u0440\u043E\u0437\u043D\u0438\u043A\u0430 \u2014 \u043F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u0438 \u0433\u0440\u0435\u044E\u0442\u0441\u044F \u043D\u0430\u0441\u0442\u043E\u0439\u043A\u0430\u043C\u0438.",
    goal: { type: "deliver", items: { frost_herb: 4 } },
    reward: { heroXP: 40, coins: 30, items: { moon_herb: 1 } }
  },
  archive_crystal: {
    giver: "\u0418\u043B\u0430\u0440\u0438\u044F, \u0410\u0440\u0445\u0438\u0432",
    title: "\u041E\u0431\u0440\u0430\u0437\u0435\u0446 \u0434\u043B\u044F \u0410\u0440\u0445\u0438\u0432\u0430",
    text: "\u0410\u0440\u0445\u0438\u0432\u0443 \u043D\u0443\u0436\u0435\u043D \u043E\u0431\u0440\u0430\u0437\u0435\u0446 \u043B\u0435\u0434\u044F\u043D\u043E\u0433\u043E \u043A\u0440\u0438\u0441\u0442\u0430\u043B\u043B\u0430 \u2014 \u0441\u0440\u0430\u0432\u043D\u0438\u0442\u044C \u0441 \u0437\u0430\u043F\u0438\u0441\u044F\u043C\u0438 \u043E \u043F\u0440\u043E\u0448\u043B\u044B\u0445 \u0432\u0441\u043F\u044B\u0448\u043A\u0430\u0445.",
    goal: { type: "deliver", items: { ice_crystal: 1 } },
    reward: { heroXP: 50, coins: 25, items: { rune_dust: 1 } }
  },
  warm_test: {
    giver: "\u041D\u044D\u0440\u0438\u0441",
    title: "\u0418\u0441\u043F\u044B\u0442\u0430\u0442\u044C \u0442\u0451\u043F\u043B\u044B\u0439 \u043D\u0430\u0441\u0442\u043E\u0439",
    text: "\u041D\u044D\u0440\u0438\u0441 \u043F\u0440\u043E\u0441\u0438\u0442 \u0442\u0451\u043F\u043B\u044B\u0439 \u043D\u0430\u0441\u0442\u043E\u0439 \u2014 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043D\u043E\u0432\u0443\u044E \u0437\u0430\u043A\u0432\u0430\u0441\u043A\u0443 \u043C\u043E\u0440\u043E\u0437\u043D\u0438\u043A\u0430.",
    goal: { type: "deliver", items: { warm_potion: 1 } },
    reward: { heroXP: 45, coins: 35, items: { ice_crystal: 1 } }
  },
  guard_resin: {
    giver: "\u0413\u043E\u0440\u043E\u0434\u0441\u043A\u0430\u044F \u0441\u0442\u0440\u0430\u0436\u0430",
    title: "\u0421\u043C\u043E\u043B\u0430 \u0434\u043B\u044F \u0444\u0430\u043A\u0435\u043B\u043E\u0432",
    text: "\u041D\u043E\u0447\u043D\u044B\u0435 \u043F\u0430\u0442\u0440\u0443\u043B\u0438 \u0436\u0433\u0443\u0442 \u0444\u0430\u043A\u0435\u043B\u044B \u0432\u0442\u0440\u043E\u0435 \u0447\u0430\u0449\u0435. \u041D\u0443\u0436\u043D\u0430 \u0441\u043C\u043E\u043B\u0430.",
    goal: { type: "deliver", items: { tree_resin: 3 } },
    reward: { heroXP: 35, coins: 25, items: { forest_mushroom: 1 } }
  },
  society_dust: {
    giver: "\u041E\u0431\u0449\u0435\u0441\u0442\u0432\u043E \u041F\u0440\u0435\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F",
    title: "\u041F\u044B\u043B\u044C \u0434\u043B\u044F \u043F\u0440\u0438\u0431\u043E\u0440\u043E\u0432",
    text: "\u0427\u0435\u0441\u0442\u043D\u0430\u044F \u0447\u0430\u0441\u0442\u044C \u041E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 \u0447\u0438\u043D\u0438\u0442 \u0441\u0432\u043E\u0438 \u043F\u0440\u0438\u0431\u043E\u0440\u044B \u2014 \u0438\u043C \u043D\u0443\u0436\u043D\u0430 \u0440\u0443\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u044B\u043B\u044C.",
    goal: { type: "deliver", items: { rune_dust: 2 } },
    reward: { heroXP: 40, coins: 30, items: { lunar_shard: 1 } }
  },
  healer_elixirs: {
    giver: "\u041B\u0435\u043A\u0430\u0440\u044C \u0443 \u0444\u043E\u043D\u0442\u0430\u043D\u0430",
    title: "\u041D\u0430\u0441\u0442\u043E\u0438 \u0434\u043B\u044F \u043E\u0431\u043C\u043E\u0440\u043E\u0436\u0435\u043D\u043D\u044B\u0445",
    text: "\u041F\u043E\u0441\u043B\u0435 \u0432\u043E\u043B\u043D\u044B \u0445\u043E\u043B\u043E\u0434\u0430 \u0443 \u043B\u0435\u043A\u0430\u0440\u044F \u043E\u0447\u0435\u0440\u0435\u0434\u044C. \u0414\u0432\u0430 \u043D\u0430\u0441\u0442\u043E\u044F \u0436\u0438\u0437\u043D\u0438 \u0441\u043F\u0430\u0441\u0443\u0442 \u0447\u0435\u0439-\u0442\u043E \u0432\u0435\u0447\u0435\u0440.",
    goal: { type: "deliver", items: { elixir_life: 2 } },
    reward: { heroXP: 50, coins: 40 }
  },
  coven_mushrooms: {
    giver: "\u0420\u043E\u0432\u0435\u043D\u0430, \u041A\u043E\u0432\u0435\u043D",
    title: "\u0413\u0440\u0438\u0431\u044B \u0434\u043B\u044F \u043E\u0431\u0435\u0440\u0435\u0433\u043E\u0432",
    text: "\u041A\u043E\u0432\u0435\u043D \u043F\u043B\u0435\u0442\u0451\u0442 \u043E\u0431\u0435\u0440\u0435\u0433\u0438 \u0434\u043B\u044F \u0441\u0442\u0435\u043D. \u041D\u0443\u0436\u043D\u044B \u043B\u0435\u0441\u043D\u044B\u0435 \u0433\u0440\u0438\u0431\u044B.",
    goal: { type: "deliver", items: { forest_mushroom: 3 } },
    reward: { heroXP: 35, coins: 25, items: { frost_herb: 1 } }
  },
  hunt_collectors: {
    giver: "\u0421\u043A\u043B\u0430\u0434\u0441\u043A\u043E\u0439 \u043A\u0432\u0430\u0440\u0442\u0430\u043B",
    title: "\u0421\u0431\u043E\u0440\u0449\u0438\u043A\u0438 \u0432\u0435\u0440\u043D\u0443\u043B\u0438\u0441\u044C",
    text: "\u041D\u0430 \u0441\u043A\u043B\u0430\u0434\u0430\u0445 \u0438 \u0432 \u0417\u0430\u043C\u0451\u0440\u0437\u0448\u0435\u043C \u043A\u0432\u0430\u0440\u0442\u0430\u043B\u0435 \u0441\u043D\u043E\u0432\u0430 \u0431\u0440\u043E\u0434\u044F\u0442 \u043C\u043E\u0440\u043E\u0437\u043D\u044B\u0435 \u0441\u0431\u043E\u0440\u0449\u0438\u043A\u0438. \u041E\u0442\u0433\u043E\u043D\u0438\u0442\u0435 \u0434\u0432\u043E\u0438\u0445.",
    goal: { type: "wins", spawns: ["wh_collector_1", "wh_collector_2", "fq_deep_1", "fq_deep_2"], count: 2 },
    reward: { heroXP: 60, coins: 40, items: { ice_crystal: 1 } }
  },
  hunt_critter: {
    giver: "\u0416\u0438\u0442\u0435\u043B\u0438 \u043A\u0432\u0430\u0440\u0442\u0430\u043B\u0430",
    title: "\u0417\u0432\u0435\u0440\u0451\u043A \u0443 \u043F\u043E\u0433\u0440\u0435\u0431\u0430",
    text: "\u0418\u043D\u0435\u0435\u0432\u044B\u0439 \u0437\u0432\u0435\u0440\u0451\u043A \u0441\u043D\u043E\u0432\u0430 \u0441\u043A\u0440\u0435\u0431\u0451\u0442\u0441\u044F \u0443 \u043F\u043E\u0433\u0440\u0435\u0431\u0430 \u043D\u0430 \u0437\u0430\u043F\u0430\u0434\u0435 \u043A\u0432\u0430\u0440\u0442\u0430\u043B\u0430.",
    goal: { type: "wins", spawns: ["fq_critter"], count: 1 },
    reward: { heroXP: 40, coins: 25, items: { frost_herb: 2 } }
  },
  hunt_rootlings: {
    giver: "\u041C\u0438\u0440\u0440\u0430",
    title: "\u041A\u043E\u0440\u043D\u0435\u0432\u0438\u043A\u0438 \u0443 \u0442\u0440\u043E\u043F\u044B",
    text: "\u041C\u0438\u0440\u0440\u0430 \u043F\u0438\u0448\u0435\u0442: \u043A\u043E\u0440\u043D\u0435\u0432\u0438\u043A\u0438 \u0432 \u0441\u0442\u0430\u0440\u043E\u043C \u043B\u0435\u0441\u0443 \u0441\u043D\u043E\u0432\u0430 \u043E\u0436\u0438\u0432\u0438\u043B\u0438\u0441\u044C. \u0414\u0432\u043E\u0438\u0445 \u0445\u0432\u0430\u0442\u0438\u0442, \u0447\u0442\u043E\u0431\u044B \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u0440\u0438\u0442\u0438\u0445\u043B\u0438.",
    goal: { type: "wins", spawns: ["rootling_01", "rootling_02", "rootling_03"], count: 2 },
    reward: { heroXP: 45, coins: 30, items: { tree_resin: 2 } }
  },
  construct_test: {
    giver: "\u041D\u044D\u0440\u0438\u0441",
    title: "\u041A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0442 \u0432 \u043F\u043E\u0433\u0440\u0435\u0431\u0435",
    text: "\u0412 \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u0438 \u0441\u043D\u043E\u0432\u0430 \u0441\u043E\u0431\u0440\u0430\u043B\u0441\u044F \u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0442. \u0420\u0430\u0437\u0431\u0435\u0440\u0438\u0442\u0435 \u0435\u0433\u043E \u2014 \u041D\u044D\u0440\u0438\u0441 \u0438\u0437\u0443\u0447\u0438\u0442 \u043E\u0431\u043B\u043E\u043C\u043A\u0438.",
    goal: { type: "wins", spawns: ["lab_construct"], count: 1 },
    requires: "ch2_lab_open",
    reward: { heroXP: 60, coins: 40, items: { ice_crystal: 2 } }
  },
  guardian_hunt: {
    giver: "\u0421\u0442\u0440\u0430\u0436\u0430 \u043A\u0432\u0430\u0440\u0442\u0430\u043B\u0430",
    title: "\u041B\u0435\u0434\u044F\u043D\u043E\u0439 \u0441\u0442\u0440\u0430\u0436",
    text: "\u0412 \u0433\u043B\u0443\u0431\u0438\u043D\u0435 \u0417\u0430\u043C\u0451\u0440\u0437\u0448\u0435\u0433\u043E \u043A\u0432\u0430\u0440\u0442\u0430\u043B\u0430 \u0441\u043D\u043E\u0432\u0430 \u0441\u0442\u043E\u0438\u0442 \u041B\u0435\u0434\u044F\u043D\u043E\u0439 \u0441\u0442\u0440\u0430\u0436. \u041F\u0440\u043E\u0439\u0434\u0438\u0442\u0435 \u043C\u0438\u043C\u043E \u043D\u0435\u0433\u043E \u2014 \u0447\u0435\u0440\u0435\u0437 \u043D\u0435\u0433\u043E.",
    goal: { type: "wins", spawns: ["fq_guardian"], count: 1 },
    reward: { heroXP: 60, coins: 40, items: { ice_crystal: 1 } }
  },
  // v0.24.0: охота в вылазках (после главы II)
  hunt_wolves: {
    giver: "\u041E\u0445\u043E\u0442\u043D\u0438\u043A\u0438 \u0443 \u0441\u0435\u0432\u0435\u0440\u043D\u043E\u0439 \u0434\u043E\u0440\u043E\u0433\u0438",
    title: "\u0412\u043E\u043B\u0447\u0438\u0446\u044B \u043C\u0435\u0442\u0435\u043B\u0438",
    text: "\u041C\u043E\u0440\u043E\u0437\u043D\u044B\u0435 \u0432\u043E\u043B\u0447\u0438\u0446\u044B \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0442 \u043A \u0441\u0435\u0432\u0435\u0440\u043D\u043E\u0439 \u0434\u043E\u0440\u043E\u0433\u0435 \u0432\u0441\u0451 \u0431\u043B\u0438\u0436\u0435. \u041E\u0442\u0433\u043E\u043D\u0438\u0442\u0435 \u0442\u0440\u043E\u0438\u0445.",
    goal: { type: "wins", spawns: ["fw_wolf_1", "fw_wolf_2", "fw_wolf_3", "fw_wolf_4"], count: 3 },
    requires: "chapter_2_complete",
    reward: { heroXP: 60, coins: 40, items: { ice_crystal: 1 } }
  },
  hunt_wisps: {
    giver: "\u0421\u0442\u043E\u0440\u043E\u0436 \u043A\u043B\u0430\u0434\u0431\u0438\u0449\u0430",
    title: "\u041E\u0433\u043E\u043D\u044C\u043A\u0438 \u043D\u0430 \u043F\u043E\u0433\u043E\u0441\u0442\u0435",
    text: "\u041F\u043E \u043D\u043E\u0447\u0430\u043C \u043D\u0430\u0434 \u043C\u043E\u0433\u0438\u043B\u0430\u043C\u0438 \u0441\u043D\u043E\u0432\u0430 \u0431\u0440\u043E\u0434\u044F\u0442 \u043E\u0433\u043E\u043D\u044C\u043A\u0438. \u0421\u0442\u043E\u0440\u043E\u0436 \u043F\u0440\u043E\u0441\u0438\u0442 \u0440\u0430\u0437\u0432\u0435\u044F\u0442\u044C \u0434\u0432\u043E\u0438\u0445.",
    goal: { type: "wins", spawns: ["gy_wisp_1", "gy_wisp_2"], count: 2 },
    requires: "chapter_2_complete",
    reward: { heroXP: 55, coins: 35, items: { rune_dust: 2 } }
  }
};
for (const o of Object.values(DAILY_POOL)) o.reward = { ...o.reward, sapphires: DAILY.sapphires };
var DAILY_ORDER = Object.keys(DAILY_POOL);
function dailyRules() {
  return {
    requires: DAILY.requires,
    offers: DAILY.offers,
    picks: DAILY.picks,
    dayMs: DAILY.dayMs,
    order: DAILY_ORDER,
    pool: Object.fromEntries(Object.entries(DAILY_POOL).map(([id, o]) => [id, { goal: o.goal, reward: o.reward, requires: o.requires || null }]))
  };
}

// src/config/covens.js
var COVENS = {
  requires: "ch2_coven_ready",
  // знакомство с Ковенами — квест 14 «Не в одиночку»
  maxMembers: 20,
  cycle: { days: 3, startDay: 20731 },
  // номер суток UTC первого цикла (понедельник 5 октября 2026); циклы идут подряд по 3 суток
  goal: 400,
  // базовая цель цикла (очков ковена)
  goalStep: 200,
  // лестница: +200 за выполненный цикл, −200 за невыполненный
  goalMax: 1500,
  // потолок цели (и пула: 10% от 1500 = 150)
  minGiven: 20,
  // минимальный личный вклад: и для обычной награды, и для пятёрки…
  minGivenPct: 5,
  // …но не меньше 5% от цели (400 → 20, 1000 → 50, 1500 → 75)
  dailyPoints: 10,
  // за каждое выполненное поручение доски
  maxGive: 99,
  // очки за единицу материала
  points: { moon_herb: 1, forest_mushroom: 1, tree_resin: 1, frost_herb: 2, rune_dust: 2, lunar_shard: 3, ice_crystal: 5 },
  // обычная награда цикла (при базовой цели; монеты растут вместе с целью: 50 монет за каждые 400 очков)
  reward: { coins: 50, items: { ice_crystal: 1 } },
  top: { size: 5, poolPct: 10, poolMax: 150, shares: [30, 25, 20, 15, 10], claimDays: 14 }
  // пул сапфиров пятёрке; забрать — 14 суток
};
function covenRules() {
  return {
    requires: COVENS.requires,
    maxMembers: COVENS.maxMembers,
    goal: COVENS.goal,
    goalStep: COVENS.goalStep,
    goalMax: COVENS.goalMax,
    cycleDays: COVENS.cycle.days,
    cycleStartDay: COVENS.cycle.startDay,
    minGiven: COVENS.minGiven,
    minGivenPct: COVENS.minGivenPct,
    dailyPoints: COVENS.dailyPoints,
    maxGive: COVENS.maxGive,
    points: COVENS.points,
    reward: COVENS.reward,
    topSize: COVENS.top.size,
    poolPct: COVENS.top.poolPct,
    poolMax: COVENS.top.poolMax,
    shares: COVENS.top.shares,
    claimDays: COVENS.top.claimDays
  };
}

// src/config/duel.js
var DUEL = {
  requires: "chapter_2_complete",
  attemptsPerDay: 8,
  // 5–10 значимых боёв в день (§31)
  baseRating: 1e3,
  k: 32,
  // Эло: изменение за бой — до 32 очков
  dayMs: 864e5,
  // Сезон 0 — тестовый, 4 недели (§33); следующие идут подряд той же длины. При смене сезона рейтинг сжимается к базовому наполовину.
  season: { startMs: Date.UTC(2026, 9, 5), lengthDays: 28 },
  matchWindow: 200,
  // соперник ищется в этом окне рейтинга, дальше — ближайший
  reward: { victory: { coins: 30, heroXP: 20 }, defeat: { coins: 10 } },
  // v0.34.0: сапфиры арены. Итог сезона — по лиге на момент его конца (нужно не меньше minBattles боёв в этом сезоне);
  // бонус за новую лигу выдаётся один раз за всё время (по лучшему рейтингу сезона). Выдача идемпотентна: ключи arena:<сезон> и league:<лига>.
  sapphires: {
    minBattles: 5,
    season: { bronze: 10, silver: 20, gold: 40, platinum: 60, diamond: 90, master: 120, legend: 150 },
    promo: { silver: 10, gold: 20, platinum: 30, diamond: 50, master: 70, legend: 100 },
    // лучшие игроки сезона (по итоговому рейтингу, при равенстве — по победам): сапфиры за 1-е, 2-е, 3-е место; нужен тот же минимум боёв.
    // Забирается в следующем сезоне (таблица прошлого сезона после этого уже не сравнима) — при «Вызове», итоге боя или открытии окна Дуэли.
    top: [200, 100, 50]
  }
};
var LEAGUES = [
  { id: "bronze", name: "\u0411\u0440\u043E\u043D\u0437\u0430", from: 0 },
  { id: "silver", name: "\u0421\u0435\u0440\u0435\u0431\u0440\u043E", from: 1100 },
  { id: "gold", name: "\u0417\u043E\u043B\u043E\u0442\u043E", from: 1250 },
  { id: "platinum", name: "\u041F\u043B\u0430\u0442\u0438\u043D\u0430", from: 1400 },
  { id: "diamond", name: "\u0410\u043B\u043C\u0430\u0437", from: 1550 },
  { id: "master", name: "\u041C\u0430\u0441\u0442\u0435\u0440", from: 1700 },
  { id: "legend", name: "\u0412\u044B\u0441\u0448\u0430\u044F \u043B\u0438\u0433\u0430", from: 1850 }
];
function ratingDelta(my, opp, win) {
  const expected = 1 / (1 + 10 ** ((opp - my) / 400));
  return Math.round(DUEL.k * ((win ? 1 : 0) - expected));
}
var levelRow = (lvl) => HERO_LEVELS[Math.max(1, Math.min(HERO_LEVELS.length, Math.floor(lvl) || 1)) - 1];
function duelSlots(opp) {
  const open = GIFT_IDS.filter((g) => opp.abilities?.[g]?.unlocked && (opp.abilities[g].level || 0) > 0);
  const slots = Array.isArray(opp.build?.slots) ? opp.build.slots.filter((g) => open.includes(g)) : [];
  return (slots.length ? slots : open).slice(0, SLOT_RULES.base);
}
var SIGNATURE = {
  fire: { name: "\u041E\u0433\u043D\u0435\u043D\u043D\u044B\u0439 \u0448\u0430\u0440", damage: 26, prepSec: 2, cooldownSec: 9, interruptBy: ["telekinesis"], hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!" },
  ice: { name: "\u041B\u0435\u0434\u044F\u043D\u043E\u0435 \u043A\u043E\u043F\u044C\u0451", damage: 24, prepSec: 2.2, cooldownSec: 10, interruptBy: ["telekinesis"], hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!" },
  seal: { name: "\u0410\u0441\u0442\u0440\u0430\u043B\u044C\u043D\u044B\u0439 \u0443\u0434\u0430\u0440", damage: 28, prepSec: 2.4, cooldownSec: 10, interruptBy: ["telekinesis_heavy"], hint: "\u0411\u0440\u043E\u0441\u044C\u0442\u0435 \u0442\u044F\u0436\u0451\u043B\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C!" },
  telekinesis: { name: "\u041A\u0430\u043C\u0435\u043D\u043D\u044B\u0439 \u0433\u0440\u0430\u0434", damage: 25, prepSec: 2, cooldownSec: 9, interruptBy: ["telekinesis"], hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!" }
};
var PRIORITY = ["fire", "ice", "seal", "telekinesis"];
function duelEnemyDef(opp) {
  const lv = levelRow(opp.level), mult = lv.damageMult;
  const slots = duelSlots(opp);
  const amulets = Array.isArray(opp.build?.amulets) ? opp.build.amulets.slice(0, 2) : [];
  const main = [...slots].sort((a, b) => (opp.abilities[b]?.level || 0) - (opp.abilities[a]?.level || 0) || PRIORITY.indexOf(a) - PRIORITY.indexOf(b))[0] || "telekinesis";
  const sig = SIGNATURE[main];
  const weaknesses = {};
  for (const g of GIFT_IDS) if (!slots.includes(g)) weaknesses[g] = 0.25;
  const hero = HEROES.find((h) => h.id === opp.hero) || HEROES.find((h) => h.id === DEFAULT_HERO_ID);
  return {
    name: opp.name || "\u0422\u0435\u043D\u044C \u0434\u0443\u044D\u043B\u044F\u043D\u0442\u0430",
    texture: hero.textures.down,
    tier: "strong",
    hp: Math.round(lv.maxHp * 4.2 * (1 + 0.05 * amulets.length)),
    normalAttack: { damage: Math.round(9 * mult), intervalSec: 2.8, ...slots.includes("ice") ? { chill: { pct: 0.3, sec: 2.5 } } : {} },
    strongAttack: { ...sig, damage: Math.round(sig.damage * mult), firstDelaySec: 5 },
    staggerSec: 1,
    interruptedCooldownSec: 6,
    defense: slots.includes("seal") ? 0.2 : 0,
    ...slots.includes("seal") ? { onFireHit: { disableDefenseSec: 4 } } : {},
    ...(opp.abilities?.telekinesis?.level || 0) >= 3 && slots.includes("telekinesis") ? { armor: { value: 0.35, source: "crystal", disabledSec: 8 } } : {},
    weaknesses,
    rewards: {},
    arena: "duel",
    duel: { slots, main }
  };
}
function duelRules() {
  return {
    requires: DUEL.requires,
    attemptsPerDay: DUEL.attemptsPerDay,
    baseRating: DUEL.baseRating,
    k: DUEL.k,
    dayMs: DUEL.dayMs,
    seasonStartMs: DUEL.season.startMs,
    seasonMs: DUEL.season.lengthDays * DUEL.dayMs,
    matchWindow: DUEL.matchWindow,
    reward: DUEL.reward,
    leagues: LEAGUES.map((l) => ({ id: l.id, from: l.from })),
    sapphires: DUEL.sapphires
  };
}

// src/config/enemyRanks.js
var ENEMY_RANKS = {
  young_scavenger: { level: 1, difficulty: "normal", rank: 100 },
  forest_scavenger: { level: 2, difficulty: "normal", rank: 200 },
  rootling: { level: 5, difficulty: "normal", rank: 500 },
  forest_guardian: { level: 6, difficulty: "elite", rank: 610 },
  node_guardian: { level: 8, difficulty: "boss", rank: 820 },
  frost_critter: { level: 9, difficulty: "normal", rank: 900 },
  frost_collector: { level: 10, difficulty: "normal", rank: 1e3 },
  frost_collector_elite: { level: 11, difficulty: "elite", rank: 1110 },
  ice_guardian: { level: 12, difficulty: "elite", rank: 1210 },
  volunteer: { level: 12, difficulty: "normal", rank: 1200 },
  experimental_construct: { level: 13, difficulty: "elite", rank: 1310 },
  frost_wolf: { level: 13, difficulty: "normal", rank: 1300 },
  grave_wisp: { level: 13, difficulty: "normal", rank: 1301 },
  grave_hound: { level: 14, difficulty: "normal", rank: 1400 },
  frost_alpha: { level: 15, difficulty: "boss", rank: 1520 },
  barrow_warden: { level: 15, difficulty: "boss", rank: 1521 },
  severin_boss: { level: 15, difficulty: "boss", rank: 1522 }
};

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
  // v0.20.0 — глава II (chapter-2-balance-v0.1.md §9). Инеевый зверёк: быстрые удары с холодом (замедляют героя),
  // ледяной рывок прерывается Телекинезом, слабость к Огню. Бой ~20–25 с у героя 8–9 уровня.
  frost_critter: {
    name: "\u0418\u043D\u0435\u0435\u0432\u044B\u0439 \u0437\u0432\u0435\u0440\u0451\u043A",
    texture: "enemy_frost_critter",
    tier: "normal",
    hp: 440,
    normalAttack: { damage: 11, intervalSec: 2.5, chill: { pct: 0.3, sec: 2.5 } },
    strongAttack: {
      name: "\u041B\u0435\u0434\u044F\u043D\u043E\u0439 \u0440\u044B\u0432\u043E\u043A",
      damage: 26,
      prepSec: 1.8,
      cooldownSec: 9,
      firstDelaySec: 5,
      interruptBy: ["telekinesis"],
      hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!"
    },
    staggerSec: 1,
    interruptedCooldownSec: 6,
    defense: 0,
    weaknesses: { fire: 0.3 },
    rewards: { heroXP: 80, schoolXP: { fire: 20, telekinesis: 20 }, items: { frost_herb: 1 }, coins: 20 },
    repeatRewards: { heroXP: 14, schoolXP: { fire: 3 }, coins: 5 },
    arena: "city"
  },
  // v0.21.0 — Морозный сборщик (квест 6 «Пропавший груз», chapter-2-balance §9): магический конструкт. Защитная корка
  // гасит 35% урона — Астрал её пробивает, Огонь растапливает на 5 с. Дальний ледяной залп замедляет перезарядки;
  // «Ледяной таран» прерывается Телекинезом. Бой ≈30–40 с у героя 9–10 уровня.
  frost_collector: {
    name: "\u041C\u043E\u0440\u043E\u0437\u043D\u044B\u0439 \u0441\u0431\u043E\u0440\u0449\u0438\u043A",
    texture: "enemy_frost_collector",
    tier: "normal",
    hp: 520,
    normalAttack: { damage: 11, intervalSec: 2.8, chill: { pct: 0.3, sec: 2.5 } },
    strongAttack: {
      name: "\u041B\u0435\u0434\u044F\u043D\u043E\u0439 \u0442\u0430\u0440\u0430\u043D",
      damage: 28,
      prepSec: 2,
      cooldownSec: 10,
      firstDelaySec: 6,
      interruptBy: ["telekinesis"],
      hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!"
    },
    staggerSec: 1,
    interruptedCooldownSec: 6,
    defense: 0.35,
    onFireHit: { disableDefenseSec: 5 },
    rewards: { heroXP: 70, schoolXP: { seal: 20, telekinesis: 15 }, items: { frost_herb: 1 }, coins: 25 },
    repeatRewards: { heroXP: 28, schoolXP: { seal: 3 }, coins: 9 },
    arena: "city"
  },
  // Усиленный сборщик — босс склада (квест 6). Корка толще, таран тяжелее; без Астрала и Огня бой заметно дольше.
  frost_collector_elite: {
    name: "\u0423\u0441\u0438\u043B\u0435\u043D\u043D\u044B\u0439 \u0441\u0431\u043E\u0440\u0449\u0438\u043A",
    texture: "enemy_frost_collector_elite",
    tier: "strong",
    hp: 760,
    normalAttack: { damage: 12, intervalSec: 3, chill: { pct: 0.35, sec: 3 } },
    strongAttack: {
      name: "\u041B\u0435\u0434\u044F\u043D\u043E\u0439 \u0442\u0430\u0440\u0430\u043D",
      damage: 32,
      prepSec: 2.2,
      cooldownSec: 10,
      firstDelaySec: 6,
      interruptBy: ["telekinesis"],
      hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!"
    },
    staggerSec: 1.1,
    interruptedCooldownSec: 7,
    defense: 0.4,
    onFireHit: { disableDefenseSec: 5 },
    rewards: { heroXP: 70, schoolXP: { seal: 30, telekinesis: 20, fire: 20 }, items: { ice_crystal: 1, rune_dust: 1 }, coins: 35 },
    arena: "city"
  },
  // v0.21.0 — Ледяной страж (квест 10 «Выбор»): первый серьёзный билд-чек главы II (55–75 с). Кристальная броня −45%
  // (Телекинез разбивает кристалл, Астрал пробивает), Огонь бьёт на 25% сильнее; тяжёлый удар — только тяжёлым камнем,
  // а Лёд замедляет его подготовку. Обычный удар холодит. Без Телекинеза бой проходим — просто дольше и с зельями.
  ice_guardian: {
    name: "\u041B\u0435\u0434\u044F\u043D\u043E\u0439 \u0441\u0442\u0440\u0430\u0436",
    texture: "enemy_ice_guardian",
    tier: "strong",
    hp: 780,
    normalAttack: { damage: 12, intervalSec: 3.8, chill: { pct: 0.35, sec: 3 } },
    strongAttack: {
      name: "\u041B\u0435\u0434\u044F\u043D\u043E\u0439 \u043C\u043E\u043B\u043E\u0442",
      damage: 32,
      prepSec: 2.6,
      cooldownSec: 11,
      firstDelaySec: 7,
      interruptBy: ["telekinesis_heavy"],
      hint: "\u0411\u0440\u043E\u0441\u044C\u0442\u0435 \u0442\u044F\u0436\u0451\u043B\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C!"
    },
    staggerSec: 1.2,
    interruptedCooldownSec: 7,
    defense: 0,
    armor: { value: 0.45, source: "crystal", disabledSec: 8 },
    weaknesses: { fire: 0.25 },
    rewards: { heroXP: 140, schoolXP: { telekinesis: 40, fire: 40, seal: 40, ice: 40 }, items: { ice_crystal: 2, frost_shard: 1 }, coins: 60 },
    repeatRewards: { heroXP: 55, schoolXP: { ice: 5 }, items: { ice_crystal: 1 }, coins: 16 },
    arena: "frost"
  },
  // v0.22.0 — Доброволец, потерявший контроль (квест 12, chapter-2-balance §10). Не монстр: победа — «обезвредить»,
  // повторно не появляется (место не возобновляется). Нестабильная магия: холодные удары, «Выброс» прерывает Телекинез.
  volunteer: {
    name: "\u0414\u043E\u0431\u0440\u043E\u0432\u043E\u043B\u0435\u0446 \u0431\u0435\u0437 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044F",
    texture: "enemy_volunteer",
    tier: "normal",
    hp: 600,
    normalAttack: { damage: 13, intervalSec: 2.7, chill: { pct: 0.3, sec: 2.5 } },
    strongAttack: {
      name: "\u0412\u044B\u0431\u0440\u043E\u0441 \u0445\u043E\u043B\u043E\u0434\u0430",
      damage: 30,
      prepSec: 2,
      cooldownSec: 9,
      firstDelaySec: 5,
      interruptBy: ["telekinesis"],
      hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!"
    },
    staggerSec: 1,
    interruptedCooldownSec: 6,
    defense: 0.2,
    weaknesses: { seal: 0.3 },
    rewards: { heroXP: 90, schoolXP: { seal: 15, ice: 15 }, coins: 20 },
    arena: "lab"
  },
  // Экспериментальный конструкт (квест 12 и дальше, §9): 60–80 с. Кристальная броня и защитная корка; Огонь растапливает корку.
  experimental_construct: {
    name: "\u042D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442\u0430\u043B\u044C\u043D\u044B\u0439 \u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0442",
    texture: "enemy_experimental_construct",
    tier: "strong",
    hp: 850,
    normalAttack: { damage: 12, intervalSec: 3.4, chill: { pct: 0.35, sec: 3 } },
    strongAttack: {
      name: "\u041B\u0435\u0434\u044F\u043D\u043E\u0439 \u0440\u0430\u0437\u0440\u044F\u0434",
      damage: 34,
      prepSec: 2.4,
      cooldownSec: 10,
      firstDelaySec: 6,
      interruptBy: ["telekinesis_heavy"],
      hint: "\u0411\u0440\u043E\u0441\u044C\u0442\u0435 \u0442\u044F\u0436\u0451\u043B\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C!"
    },
    staggerSec: 1.1,
    interruptedCooldownSec: 7,
    defense: 0,
    armor: { value: 0.4, source: "crystal", disabledSec: 8 },
    weaknesses: { fire: 0.2 },
    rewards: { heroXP: 100, schoolXP: { telekinesis: 30, fire: 30, seal: 30, ice: 30 }, items: { ice_crystal: 1, frost_shard: 1 }, coins: 40 },
    repeatRewards: { heroXP: 65, schoolXP: { ice: 5 }, items: { ice_crystal: 1 }, coins: 18 },
    arena: "lab"
  },
  // v0.22.0 — финальный босс главы II: Северин Вейр (квест 15, §11). Первый бой «маг против мага», 120–180 с, три фазы.
  // 1 «Дуэль» — защитный барьер (−25%, Астрал пробивает, Огонь снимает на 5 с), Ледяное копьё прерывает Телекинез.
  // 2 «Перегрузка» — кристальная броня эксперимента (тяжёлый камень разбивает кристалл), удар сильнее, Огонь +30%.
  // 3 «Предел» — магия рвётся: защита 40%, только Астрал и Лёд бьют в полную силу; тяжёлый удар — тяжёлым камнем.
  severin_boss: {
    name: "\u0421\u0435\u0432\u0435\u0440\u0438\u043D \u0412\u0435\u0439\u0440",
    texture: "enemy_severin",
    tier: "strong",
    hp: 1500,
    normalAttack: { damage: 11, intervalSec: 3.4, chill: { pct: 0.3, sec: 3 } },
    strongAttack: {
      name: "\u041B\u0435\u0434\u044F\u043D\u043E\u0435 \u043A\u043E\u043F\u044C\u0451",
      damage: 28,
      prepSec: 2.2,
      cooldownSec: 11,
      firstDelaySec: 6,
      interruptBy: ["telekinesis"],
      hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!"
    },
    staggerSec: 1.1,
    interruptedCooldownSec: 7,
    defense: 0,
    phases: [
      {
        above: 1e3,
        set: { defense: 0.25, armor: null, weaknesses: null, onFireHit: { disableDefenseSec: 5 } },
        message: "\u0411\u0430\u0440\u044C\u0435\u0440 \u0421\u0435\u0432\u0435\u0440\u0438\u043D\u0430 \u0433\u0430\u0441\u0438\u0442 \u0443\u0434\u0430\u0440\u044B. \u0410\u0441\u0442\u0440\u0430\u043B \u043F\u0440\u043E\u0431\u0438\u0432\u0430\u0435\u0442 \u0435\u0433\u043E, \u041E\u0433\u043E\u043D\u044C \u0441\u043D\u0438\u043C\u0430\u0435\u0442 \u043D\u0430 5 \u0441\u0435\u043A\u0443\u043D\u0434."
      },
      {
        above: 480,
        set: {
          defense: 0,
          armor: { value: 0.45, source: "crystal", disabledSec: 8 },
          weaknesses: { fire: 0.3 },
          onFireHit: null,
          normalAttack: { damage: 12, intervalSec: 3.2, chill: { pct: 0.35, sec: 3 } }
        },
        strongAttack: { name: "\u041F\u0435\u0440\u0435\u0433\u0440\u0443\u0437\u043A\u0430", damage: 32, interruptBy: ["telekinesis_heavy"], hint: "\u0411\u0440\u043E\u0441\u044C\u0442\u0435 \u0442\u044F\u0436\u0451\u043B\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C!" },
        message: "\xAB\u0421\u0438\u0441\u0442\u0435\u043C\u0430 \u0434\u0435\u0440\u0436\u0438\u0442!\xBB \u042D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442 \u0434\u0430\u0451\u0442 \u0421\u0435\u0432\u0435\u0440\u0438\u043D\u0443 \u043A\u0440\u0438\u0441\u0442\u0430\u043B\u044C\u043D\u0443\u044E \u0431\u0440\u043E\u043D\u044E. \u0420\u0430\u0437\u0431\u0435\u0439\u0442\u0435 \u043A\u0440\u0438\u0441\u0442\u0430\u043B\u043B \u0442\u044F\u0436\u0451\u043B\u044B\u043C \u043A\u0430\u043C\u043D\u0435\u043C.",
        tint: 11068671
      },
      {
        above: 0,
        set: { defense: 0.4, armor: null, weaknesses: { seal: 0.4, ice: 0.4 }, onFireHit: null },
        strongAttack: { name: "\u041F\u0440\u0435\u0434\u0435\u043B", damage: 34, prepSec: 2.6, interruptBy: ["telekinesis_heavy"], hint: "\u0411\u0440\u043E\u0441\u044C\u0442\u0435 \u0442\u044F\u0436\u0451\u043B\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C!" },
        message: "\xAB\u042F \u043D\u0435 \u043C\u043E\u0433\u0443 \u0435\u0451 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C\u2026\xBB \u041C\u0430\u0433\u0438\u044F \u0440\u0432\u0451\u0442\u0441\u044F \u043D\u0430\u0440\u0443\u0436\u0443: \u0432 \u043F\u043E\u043B\u043D\u0443\u044E \u0441\u0438\u043B\u0443 \u0431\u044C\u044E\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0410\u0441\u0442\u0440\u0430\u043B \u0438 \u041B\u0451\u0434.",
        tint: 13805823
      }
    ],
    rewards: { heroXP: 350, schoolXP: { telekinesis: 40, fire: 40, seal: 40, ice: 60 }, items: { cold_heart: 1 }, coins: 150 },
    arena: "duel"
  },
  // v0.24.0 — вылазки (stage-2-design-pack §24–25). Отрицательная «слабость» — сопротивление: этот дар бьёт слабее.
  // Морозный лес: звери не боятся холода (Лёд −40…50%), зато горят (Огонь +30…40%).
  frost_wolf: {
    name: "\u041C\u043E\u0440\u043E\u0437\u043D\u0430\u044F \u0432\u043E\u043B\u0447\u0438\u0446\u0430",
    texture: "enemy_frost_wolf",
    tier: "normal",
    hp: 650,
    normalAttack: { damage: 14, intervalSec: 2.4, chill: { pct: 0.3, sec: 2.5 } },
    strongAttack: { name: "\u041F\u0440\u044B\u0436\u043E\u043A \u0438\u0437 \u043C\u0435\u0442\u0435\u043B\u0438", damage: 30, prepSec: 1.9, cooldownSec: 9, firstDelaySec: 5, interruptBy: ["telekinesis"], hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!" },
    staggerSec: 1,
    interruptedCooldownSec: 6,
    defense: 0,
    weaknesses: { fire: 0.4, ice: -0.4 },
    rewards: { heroXP: 50, schoolXP: { fire: 10 }, items: { frost_herb: 1 }, coins: 15 },
    repeatRewards: { heroXP: 25, schoolXP: { fire: 3 }, items: { frost_herb: 1 }, coins: 8 },
    arena: "frostwood"
  },
  frost_alpha: {
    name: "\u0412\u043E\u0436\u0430\u043A \u043C\u0435\u0442\u0435\u043B\u0438",
    texture: "enemy_frost_alpha",
    tier: "strong",
    hp: 1300,
    normalAttack: { damage: 13, intervalSec: 3, chill: { pct: 0.4, sec: 3 } },
    strongAttack: { name: "\u0412\u043E\u0439 \u0441\u0442\u0430\u0438", damage: 34, prepSec: 2.4, cooldownSec: 10, firstDelaySec: 6, interruptBy: ["telekinesis_heavy"], hint: "\u0411\u0440\u043E\u0441\u044C\u0442\u0435 \u0442\u044F\u0436\u0451\u043B\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C!" },
    staggerSec: 1.2,
    interruptedCooldownSec: 7,
    defense: 0.2,
    onFireHit: { disableDefenseSec: 6 },
    weaknesses: { fire: 0.3, ice: -0.5 },
    rewards: { heroXP: 150, schoolXP: { fire: 30, telekinesis: 20 }, items: { ice_crystal: 2 }, coins: 60 },
    repeatRewards: { heroXP: 70, schoolXP: { fire: 5 }, items: { ice_crystal: 1 }, coins: 25 },
    arena: "frostwood"
  },
  // Старое кладбище: огоньки и стражи кургана — плотная защита, Огонь их почти не берёт, Астрал пробивает.
  grave_wisp: {
    name: "\u041C\u043E\u0433\u0438\u043B\u044C\u043D\u044B\u0439 \u043E\u0433\u043E\u043D\u0451\u043A",
    texture: "enemy_grave_wisp",
    tier: "normal",
    hp: 560,
    normalAttack: { damage: 13, intervalSec: 2.6 },
    strongAttack: { name: "\u0425\u043E\u043B\u043E\u0434\u043D\u044B\u0439 \u0448\u0451\u043F\u043E\u0442", damage: 28, prepSec: 2, cooldownSec: 9, firstDelaySec: 5, interruptBy: ["telekinesis"], hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!" },
    staggerSec: 1,
    interruptedCooldownSec: 6,
    defense: 0.45,
    weaknesses: { seal: 0.5, fire: -0.3 },
    rewards: { heroXP: 50, schoolXP: { seal: 10 }, items: { rune_dust: 1 }, coins: 15 },
    repeatRewards: { heroXP: 25, schoolXP: { seal: 3 }, items: { rune_dust: 1 }, coins: 8 },
    arena: "graveyard"
  },
  grave_hound: {
    name: "\u041C\u043E\u0433\u0438\u043B\u044C\u043D\u044B\u0439 \u043F\u0451\u0441",
    texture: "enemy_grave_hound",
    tier: "normal",
    hp: 700,
    normalAttack: { damage: 15, intervalSec: 2.5 },
    strongAttack: { name: "\u041C\u0451\u0440\u0442\u0432\u0430\u044F \u0445\u0432\u0430\u0442\u043A\u0430", damage: 32, prepSec: 2, cooldownSec: 9, firstDelaySec: 5, interruptBy: ["telekinesis"], hint: "\u041F\u0440\u0435\u0440\u0432\u0438\u0442\u0435 \u0422\u0435\u043B\u0435\u043A\u0438\u043D\u0435\u0437\u043E\u043C!" },
    staggerSec: 1,
    interruptedCooldownSec: 6,
    defense: 0,
    weaknesses: { fire: 0.3, telekinesis: -0.3 },
    rewards: { heroXP: 50, schoolXP: { fire: 10 }, items: { forest_mushroom: 1 }, coins: 15 },
    repeatRewards: { heroXP: 25, schoolXP: { fire: 3 }, items: { forest_mushroom: 1 }, coins: 8 },
    arena: "graveyard"
  },
  barrow_warden: {
    name: "\u0421\u0442\u0440\u0430\u0436 \u043A\u0443\u0440\u0433\u0430\u043D\u0430",
    texture: "enemy_barrow_warden",
    tier: "strong",
    hp: 1400,
    normalAttack: { damage: 13, intervalSec: 3.4 },
    strongAttack: { name: "\u0423\u0434\u0430\u0440 \u043A\u0443\u0440\u0433\u0430\u043D\u0430", damage: 36, prepSec: 2.6, cooldownSec: 11, firstDelaySec: 7, interruptBy: ["telekinesis_heavy"], hint: "\u0411\u0440\u043E\u0441\u044C\u0442\u0435 \u0442\u044F\u0436\u0451\u043B\u044B\u0439 \u043A\u0430\u043C\u0435\u043D\u044C!" },
    staggerSec: 1.2,
    interruptedCooldownSec: 7,
    defense: 0,
    armor: { value: 0.45, source: "crystal", disabledSec: 8 },
    weaknesses: { seal: 0.4, fire: -0.4 },
    rewards: { heroXP: 150, schoolXP: { seal: 30, telekinesis: 20 }, items: { lunar_shard: 2, rune_dust: 2 }, coins: 60 },
    repeatRewards: { heroXP: 70, schoolXP: { seal: 5 }, items: { lunar_shard: 1 }, coins: 25 },
    arena: "graveyard"
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
    rewards: { heroXP: 150, schoolXP: { telekinesis: 60, fire: 60 }, items: { rare_core: 1, lunar_shard: 3, amulet_forest: 1 }, coins: 60 },
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
  // v0.20.0: городская мостовая — обломки ящиков вместо камней
  city: {
    ground: 2763827,
    objects: [
      { id: "rock_a", type: "light_rock", x: 190, y: 720 },
      { id: "heavy_a", type: "heavy_rock", x: 540, y: 710 }
    ]
  },
  // v0.24.0: вылазки
  frostwood: { ground: 3819090, objects: [{ id: "crystal_a", type: "crystal", x: 590, y: 640 }, { id: "heavy_a", type: "heavy_rock", x: 150, y: 760 }, { id: "rock_a", type: "light_rock", x: 420, y: 800 }] },
  graveyard: { ground: 2369578, objects: [{ id: "crystal_a", type: "crystal", x: 590, y: 640 }, { id: "heavy_a", type: "heavy_rock", x: 150, y: 760 }, { id: "rock_a", type: "light_rock", x: 420, y: 800 }] },
  // v0.22.0: тайная лаборатория и Дуэльный зал (финал главы II)
  lab: {
    ground: 2762291,
    objects: [
      { id: "crystal_a", type: "crystal", x: 590, y: 640 },
      { id: "heavy_a", type: "heavy_rock", x: 150, y: 760 },
      { id: "rock_a", type: "light_rock", x: 420, y: 800 }
    ]
  },
  duel: {
    ground: 2828856,
    objects: [
      { id: "crystal_a", type: "crystal", x: 590, y: 640 },
      { id: "heavy_a", type: "heavy_rock", x: 150, y: 760 },
      { id: "rock_a", type: "light_rock", x: 420, y: 800 }
    ]
  },
  // v0.21.0: Замёрзший квартал — кристалл стража и тяжёлый камень
  frost: {
    ground: 2502970,
    objects: [
      { id: "crystal_a", type: "crystal", x: 590, y: 640 },
      { id: "heavy_a", type: "heavy_rock", x: 150, y: 760 },
      { id: "rock_a", type: "light_rock", x: 420, y: 800 }
    ]
  },
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
for (const [id, def] of Object.entries(ENEMIES)) Object.assign(def, ENEMY_RANKS[id]);

// src/config/ratings.js
var MONSTER_LEVELS = Object.fromEntries(Object.entries(ENEMIES).map(([id, def]) => [id, def.level]));
var RATINGS = {
  top: 50,
  // сколько мест показывает таблица
  onlineSec: 100,
  // игрок «в игре», если подавал знак не позже этого
  pingSec: 45,
  // как часто открытая игра подаёт знак
  cacheSec: 20
  // таблицы в окне не запрашиваются чаще
};
function ratingsRules() {
  return {
    top: RATINGS.top,
    onlineSec: RATINGS.onlineSec,
    levels: { ...MONSTER_LEVELS },
    rank: Object.fromEntries(Object.keys(MONSTER_LEVELS).map((k) => [k, ENEMIES[k].rank])),
    power: Object.fromEntries(Object.keys(MONSTER_LEVELS).map((k) => [k, ENEMIES[k]?.hp || 0])),
    spawns: Object.fromEntries(ENEMY_SPAWNS.filter((s) => MONSTER_LEVELS[s.enemy]).map((s) => [s.id, s.enemy]))
  };
}

// src/config/serverRules.js
function grantOf(r = {}) {
  const g = {};
  if (r.topUp) g.topUp = structuredClone(r.topUp);
  if (r.heroXP) g.heroXP = r.heroXP;
  if (r.coins) g.coins = r.coins;
  if (r.items && Object.keys(r.items).length) g.items = { ...r.items };
  if (r.schoolXP && Object.keys(r.schoolXP).length) g.schoolXP = { ...r.schoolXP };
  const up = r.topUpFor ? UPGRADES[r.topUpFor] : null;
  if (up) {
    const items = {};
    for (const [k, v] of Object.entries(up.cost.items || {})) if (!up.cost.noTopUp?.includes(k)) items[k] = v;
    g.topUp = { school: { [up.ability]: up.cost.schoolXP }, items };
  }
  return g;
}
var EVENT_ACTIONS = {
  prologue_seen: {},
  mirra_taught_alchemy: {},
  // подсказки «здесь нужен дар / сила»: отмечаются при первом взгляде на закрытый объект, наград нет
  fire_required_01: {},
  heavy_blocked_01: {},
  unlock_telekinesis_1: { unlock: { telekinesis: 1 } },
  lunar_quest_start: { requires: ["unlock_telekinesis_1"] },
  unlock_fire_1: { requires: ["heavy_path_open"], unlock: { fire: 1 } },
  unlock_seal_1: { requires: ["gate_marks_revealed"], unlock: { seal: 1 } },
  // v0.20.0 — глава II, квесты 1–5 (диалоги Мирры, Иларии, Северина, торговца; первый вход на площадь)
  ch2_start: { requires: ["chapter_1_complete"] },
  ch2_city_arrived: { requires: ["ch2_start"] },
  ch2_met_ilaria: { requires: ["ch2_plaza_cleared"] },
  ch2_trace_found: { requires: ["ch2_trace_astral", "ch2_trace_debris"] },
  ch2_met_severin: { requires: ["ch2_archive_read"] },
  city_merchant_open: { requires: ["ch2_city_arrived"] },
  // v0.21.0 — квесты 6–10 (торговец, Илария, Северин, Нэрис)
  ch2_cargo_start: { requires: ["ch2_met_severin"] },
  ch2_cargo_reported: { requires: ["ch2_cargo_found", "ch2_serials_read"] },
  ch2_severin_asked: { requires: ["ch2_cargo_reported"] },
  ch2_frost_wave: { requires: ["ch2_lab_critter"] },
  ch2_nerys_met: { requires: ["ch2_construct_unstable"] },
  ch2_rescue_done: { requires: ["ch2_rescue_door", "ch2_rescue_cellar"] },
  unlock_ice_1: { requires: ["ch2_rescue_done", "warm_potion_crafted"], unlock: { ice: 1 } },
  ch2_ice_trained: { requires: ["ch2_training_done"] },
  ch2_choice_start: { requires: ["ch2_ice_trained"] },
  ch2_quarter_cleared: { requires: ["ch2_ice_guardian_defeated", "ch2_deep_1", "ch2_deep_2"], sapphires: 10 },
  // v0.22.0 — квесты 11–15 (Нэрис, Тихон, Илария, Северин, Ровена, Мирра)
  unlock_ice_2: { requires: ["ch2_quarter_cleared"], consume: { coins: GIFT_PRICES.storyIce2.coins }, unlock: { ice: 2 } },
  ch2_brittle_done: { requires: ["ch2_brittle_1", "ch2_brittle_2", "brittle_flask_crafted"] },
  ch2_lab_found: { requires: ["ch2_brittle_done"] },
  ch2_stabilized: { requires: ["ch2_vol_1", "ch2_vol_2"], consume: { stabilizing_potion: 2 } },
  ch2_lab_reported: { requires: ["ch2_stabilized", "ch2_lab_journal"] },
  // ответ героя Северину — без ветвления сюжета, только отношение (его вспомнит Мирра)
  ch2_view_danger: { requires: ["ch2_lab_reported"], blockedBy: ["ch2_severin_confronted"] },
  ch2_view_methods: { requires: ["ch2_lab_reported"], blockedBy: ["ch2_severin_confronted"] },
  ch2_view_market: { requires: ["ch2_lab_reported"], blockedBy: ["ch2_severin_confronted"] },
  ch2_view_unsure: { requires: ["ch2_lab_reported"], blockedBy: ["ch2_severin_confronted"] },
  ch2_severin_confronted: { requires: ["ch2_lab_reported"] },
  ch2_coven_met: { requires: ["ch2_severin_confronted"] },
  ch2_coven_supplies: { requires: ["ch2_coven_met"], consume: { crystal_guard: 1, frost_herb: 2 } },
  ch2_coven_ready: { requires: ["ch2_unstable_1", "ch2_unstable_2", "ch2_coven_supplies"], sapphires: 10 },
  ch2_final_start: { requires: ["ch2_coven_ready"] },
  // Лёд III перед боем: ветка выбирается один раз (ch2_ice3 — общая отметка, по ней появляется Северин)
  ch2_ice3_frost: { requires: ["ch2_fin_tk", "ch2_fin_fire", "ch2_fin_ice", "ch2_fin_seal"], blockedBy: ["ch2_ice3"], consume: { coins: GIFT_PRICES.storyIce3.coins }, unlock: { ice: 3 }, branch: { ice: "frost" }, marks: ["ch2_ice3"] },
  ch2_ice3_shard: { requires: ["ch2_fin_tk", "ch2_fin_fire", "ch2_fin_ice", "ch2_fin_seal"], blockedBy: ["ch2_ice3"], consume: { coins: GIFT_PRICES.storyIce3.coins }, unlock: { ice: 3 }, branch: { ice: "shard" }, marks: ["ch2_ice3"] },
  ch2_epilogue: { requires: ["ch2_letters_read"] },
  chapter_2_complete: { requires: ["ch2_epilogue"], marks: ["title_frost_survivor"], sapphires: 50 }
};
function worldRules() {
  const world = {};
  const base = (o) => ({
    requires: [o.requiresEvent, o.waitEvent].filter(Boolean),
    // v0.21.0: waitEvent — объект виден, но поддаётся после события
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
  const school = (ability) => ({ [ability]: SCHOOL_XP_PER_USE.exploration[ability] || 0 });
  const effects = (o) => {
    const events = [];
    if (o.countsAsFirstInteraction) events.push("first_world_interaction");
    for (const k of [o.doneEvent, o.openEvent, o.destroyEvent]) if (k) events.push(k);
    const out = { events };
    if (o.opensPath) out.path = o.opensPath;
    return out;
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
        if (o.mode === "pull") world[o.id] = { kind: "loot", mark: "collected", reward: o.reward || {}, mana: mana2, ability: "telekinesis", minLevel: tkLevel(weight), school: school("telekinesis"), ...effects(o), ...base(o) };
        else world[o.id] = { kind: "cast", mark: "moved", mana: mana2, ability: "telekinesis", minLevel: tkLevel(weight), blockedBy: [], school: school("telekinesis"), ...effects(o), ...base(o) };
        pickupAfter(o, o.hiddenReward?.spawnPickup, "moved");
        break;
      }
      case "fire":
        world[o.id] = {
          kind: "cast",
          mark: o.persistent ? "burning" : "destroyed",
          mana: WORLD_MANA_COST.fire,
          ability: "fire",
          minLevel: 1,
          blockedBy: [],
          school: school("fire"),
          ...effects(o),
          ...base(o)
        };
        pickupAfter(o, o.reveal?.spawnPickup, "destroyed");
        break;
      case "ice":
        world[o.id] = {
          kind: "cast",
          mark: "frozen",
          mana: WORLD_MANA_COST.ice,
          ability: "ice",
          minLevel: o.minLevel || 1,
          blockedBy: [],
          school: school("ice"),
          ...effects(o),
          ...base(o)
        };
        break;
      case "gate":
        world[o.id] = {
          kind: "cast",
          mana: WORLD_MANA_COST.seal,
          ability: "seal",
          minLevel: 1,
          blockedBy: [o.openEvent],
          school: school("seal"),
          ...effects(o),
          requires: ["guardian_defeated", "gate_marks_revealed", "unlock_seal_1", "seal_training_complete"],
          requiresEnemy: []
        };
        break;
      case "seal_sigil":
        world[o.id] = { kind: "cast", mana: WORLD_MANA_COST.seal, ability: "seal", minLevel: 1, blockedBy: [o.doneEvent], school: school("seal"), ...effects(o), ...base(o) };
        break;
      default:
        break;
    }
  }
  return world;
}
function questRules() {
  const out = {};
  for (const id of SIDE_QUEST_ORDER) {
    const q = SIDE_QUESTS[id];
    out[id] = {
      start: questEvent(id, "start"),
      done: questEvent(id, "done"),
      requires: q.requires?.event || null,
      requiresAll: q.requires?.events || [],
      sapphires: q.reward?.sapphires || 0,
      objectives: q.objectives.map((o) => o.type === "item" ? { type: "item", item: o.item, count: o.count } : o.type === "enemy" ? { type: "enemy", id: o.id } : { type: "event", key: o.key }),
      consume: { ...q.turnIn?.consume || {} },
      reward: grantOf(q.reward)
    };
  }
  return out;
}
function researchRules() {
  const out = {};
  for (const [id, up] of Object.entries(UPGRADES)) {
    const r = up.requires || {};
    out[id] = {
      ability: up.ability,
      toLevel: up.toLevel,
      branch: up.branch || null,
      locked: !!up.locked,
      heroLevel: r.heroLevel || 0,
      abilityLevel: r.abilityLevel || 0,
      event: r.event || null,
      schoolXP: up.cost.schoolXP,
      items: { ...up.cost.items || {}, coins: up.cost.coins || 0 },
      sapphires: up.cost.sapphires || 0,
      durationMs: up.timerSec[TIMER_MODE] * 1e3,
      startEvent: up.startEvent || null,
      completeEvent: up.completeEvent || null
    };
  }
  return out;
}
function buildRules() {
  const branches = {};
  for (const [id, a] of Object.entries(ABILITIES)) {
    if (!a.branches) continue;
    branches[id] = Object.fromEntries(Object.entries(a.branches).map(([b, v]) => [b, { fromLevel: v.fromLevel || 1 }]));
  }
  return { respecCoins: BRANCH_RESPEC.coins, branches, ...buildSlotRules() };
}
function spawnStartRules() {
  const out = {};
  for (const s of ENEMY_SPAWNS) if (s.startEvent) out[s.id] = { event: s.startEvent, requires: s.requiresEvent || null };
  return out;
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
  const events = Object.fromEntries(Object.entries(EVENT_ACTIONS).map(([k, e]) => [k, {
    requires: e.requires || [],
    unlock: e.unlock || {},
    // v0.22.0: blockedBy — событие уже не нужно; consume — что забирает (предметы); branch — ветка дара вместе с открытием;
    // marks — ещё события вместе с этим (с их наградами); sapphires — сапфиры в награду (журнал сапфиров, один раз)
    blockedBy: e.blockedBy || [],
    consume: e.consume || {},
    branch: e.branch || {},
    marks: e.marks || [],
    sapphires: e.sapphires || 0
  }]));
  const eventRewards = Object.fromEntries(Object.entries(EVENT_REWARDS).map(([k, r]) => [k, grantOf(r)]));
  return {
    balanceMigration: BALANCE_MIGRATION,
    recipes,
    uses: STORY_USES,
    firstCraft: FIRST_CRAFT,
    migration: MIGRATION_V10,
    vitals,
    potions,
    world: worldRules(),
    events,
    eventRewards,
    quests: questRules(),
    research: researchRules(),
    build: buildRules(),
    spawnStart: spawnStartRules(),
    sapphires: sapphireRules(),
    bag: bagRules(),
    shop: shopRules(),
    // v0.19.0: торговец
    daily: dailyRules(),
    // v0.23.0: доска поручений
    covens: covenRules(),
    // v0.25.0: Ковены (недельная цель)
    duel: duelRules(),
    // v0.26.0: Магическая Дуэль
    ratings: ratingsRules(),
    // v0.29.0: рейтинги (уровни монстров) и «в игре»
    combatPotions: Object.keys(POTIONS)
    // v0.19.0: какие расходники бой запоминает в начале и списывает по итогам
  };
}

// src/cloud/playerModel.js
var RULES = serverRules();
var ABILITY_IDS = ["telekinesis", "fire", "seal", "ice"];
var SCHOOL_IDS = ["telekinesis", "fire", "seal", "ice"];
var num = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e15;
var isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var uniq = (a) => [...new Set(a)];
function walletOf(w) {
  const o = isObj(w) ? w : {};
  const daily = isObj(o.daily) && num(o.daily.d) && num(o.daily.n) ? { d: o.daily.d, n: o.daily.n } : {};
  return { sapphires: num(o.sapphires) ? o.sapphires : 0, daily, welcome: o.welcome === true };
}
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
    wallet: walletOf(d.wallet),
    // v0.17.0: сапфиры (пишет только сервер)
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
  d.wallet = walletOf(s.wallet);
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
var COMBAT_POTIONS = [...RULES.combatPotions];
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
    this.puddle = { left: 0, dps: 0, tick: 0 };
    this.slow = { left: 0, pct: 0 };
    this.brittle = { left: 0, bonus: 0 };
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
  get inPuddle() {
    return this.puddle.left > 0;
  }
  get slowed() {
    return this.slow.left > 0;
  }
  get isBrittle() {
    return this.brittle.left > 0;
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
  /** v0.18.0: замедление Льдом. Не складывается: берётся сильнейшее, длительность — наибольшая. */
  applySlow(pct, sec) {
    if (this.slow.left > 0 && this.slow.pct > pct) {
      this.slow.left = Math.max(this.slow.left, sec);
      return;
    }
    this.slow = { left: Math.max(sec, this.slow.pct === pct ? this.slow.left : 0), pct };
  }
  /** v0.18.0: Хрупкость. Новая заменяет старую, если сильнее или дольше. */
  applyBrittle(bonus, sec) {
    if (this.brittle.left > 0 && this.brittle.bonus > bonus) {
      this.brittle.left = Math.max(this.brittle.left, sec);
      return;
    }
    this.brittle = { left: sec, bonus };
  }
  /** Снять Хрупкость ударом: возвращает бонус (0 — цель не хрупкая). */
  consumeBrittle() {
    if (this.brittle.left <= 0) return 0;
    const b = this.brittle.bonus;
    this.brittle = { left: 0, bonus: 0 };
    return b;
  }
  /** v0.16.0: лужа смолы. Как и горение — не складывается, повторный Огонь обновляет длительность и силу. */
  applyPuddle(dps, durationSec) {
    const was = this.inPuddle;
    this.puddle.left = durationSec;
    this.puddle.dps = dps;
    if (!was) this.puddle.tick = 1;
  }
  /**
   * v0.16.0: вспышка Астрала III. На sec секунд броня и защитная кора не гасят урон (только если они есть у врага);
   * vulnerability — враг получает на столько больше урона от всего. Возвращает события для сцены.
   */
  flash(sec, vulnerability = 0) {
    const out = [{ type: "flash", sec }];
    if (this.hasArmor && sec > this.armorDisabledLeft) this.armorDisabledLeft = sec;
    if ((this.def.defense || 0) > 0 && sec > this.defenseDisabledLeft) this.defenseDisabledLeft = sec;
    if (vulnerability > 0) {
      this.vulnerable = { left: Math.max(this.vulnerable.left, sec), bonus: Math.max(this.vulnerable.left > 0 ? this.vulnerable.bonus : 0, vulnerability) };
      out.push({ type: "vulnerable", sec, bonus: vulnerability });
    }
    return out;
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
    if (this.puddle.left > 0) {
      this.puddle.left -= dt;
      this.puddle.tick -= dt;
      while (this.puddle.tick <= 0 && this.alive) {
        this.puddle.tick += 1;
        out.push({ type: "burnTick", damage: this.takeDamage(this.puddle.dps, "fire", heroMult), puddle: true });
      }
      if (this.puddle.left <= 0) this.puddle.left = 0;
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
    if (this.brittle.left > 0) {
      this.brittle.left -= dt;
      if (this.brittle.left <= 0) {
        this.brittle = { left: 0, bonus: 0 };
        out.push({ type: "brittleEnd" });
      }
    }
    let tdt = dt;
    if (this.slow.left > 0) {
      tdt = dt * (1 - this.slow.pct);
      this.slow.left -= dt;
      if (this.slow.left <= 0) {
        this.slow = { left: 0, pct: 0 };
        out.push({ type: "slowEnd" });
      }
    }
    if (!this.alive) return out;
    if (this.staggerLeft > 0) {
      this.staggerLeft -= dt;
      return out;
    }
    dt = tdt;
    const strong = this.def.strongAttack;
    if (this.isPreparing) {
      this.prepLeft -= dt;
      if (this.prepLeft <= 0) {
        this.prepLeft = 0;
        this.strongCd = strong.cooldownSec;
        this.normalTimer = this.def.normalAttack.intervalSec;
        out.push({ type: "strongHit", damage: this.outgoingDamage(strong.damage), name: strong.name, chill: strong.chill || null });
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
      out.push({ type: "attack", damage: this.outgoingDamage(this.def.normalAttack.damage), chill: this.def.normalAttack.chill || null });
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
  CHAPTER_FINALE: "story:chapter-finale",
  // v0.22.0: (номер главы) — итоговое окно главы
  UNLOCK_GIFT: "story:unlock-gift",
  // v0.21.0: (id) — сюжетный дар из диалога (Лёд I у Нэрис)
  TRAVEL: "world:travel",
  // v0.20.0: переход между лесом и городом ({ x, y, text })
  OPEN_SHOP: "ui:open-shop",
  // v0.20.0: лавка торговца (из диалога)
  OPEN_DAILY: "ui:open-daily",
  // v0.23.0: доска поручений
  OPEN_COVENS: "ui:open-covens",
  // v0.25.0: окно Ковенов
  OPEN_MAP: "ui:open-map",
  // v0.27.0: карта мира ({ exit } — открыта у выхода, можно отправиться; без exit — только посмотреть)
  MAP_TRAVEL: "story:map-travel",
  // v0.27.0: (id локации) — отправиться с карты мира
  OPEN_DUEL: "ui:open-duel",
  // v0.26.0: окно Магической Дуэли
  DUEL_START: "story:duel-start",
  // v0.26.0: вызов на Дуэль (ExplorationScene)
  OPEN_WALLET: "ui:open-wallet",
  // v0.20.0: кошелёк / банк (из диалога и меню)   // v0.10.0: Селена открывает Печать I (после закрытия диалога)
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
var ABILITY_ORDER = ["telekinesis", "fire", "seal", "ice"];
var AbilitySystem = class {
  constructor(state, quests, bus2) {
    this.state = state;
    this.quests = quests;
    this.bus = bus2;
    this.mirror = null;
    this.holdUntil = 0;
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
    if (up.startEvent) this.quests.complete(up.startEvent, { upgradeId }, { mirror: false });
    this.mirror?.({ op: "research_start", upgrade: upgradeId });
    this.state.save();
    this.bus.emit(MSG.HUD_REFRESH);
    return true;
  }
  /** Вызывается каждый кадр из UIScene (работает и во время боя). */
  update(force = false) {
    if (this.mirror && this.state.data.research && this.state.now() < this.holdUntil) return;
    const done = this.state.completeResearchIfReady(force);
    if (!done) return;
    const up = UPGRADES[done];
    this.state.save();
    if (up.completeEvent) this.quests.complete(up.completeEvent, { upgradeId: done }, { mirror: false });
    this.mirror?.({ op: "research_finish" })?.then((r) => {
      if (r && !r.ok && r.reason === "wait") this.holdUntil = this.state.now() + (r.left || 1) * 1e3 + 500;
    });
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
  constructor({ enemyType, enemyDef = null, state, abilities }) {
    this.state = state;
    this.abilities = abilities;
    this.def = enemyDef || ENEMIES[enemyType];
    if (!this.def) throw new Error(`Unknown enemy type ${enemyType}`);
    this.enemy = new Enemy(enemyType, this.def);
    const hs = state.heroStats();
    const legacy = state.data.combatCtx?.balanceVersion === 29;
    this.hero = {
      maxHp: hs.maxHp,
      hp: hp(state),
      maxMana: hs.maxMana,
      mana: mana(state),
      regen: legacy ? 3 : hs.manaRegen,
      damageMult: hs.damageMult,
      autoTimer: HERO_BASE.autoAttack.intervalSec
    };
    this.amulets = state.equippedAmulets ? state.equippedAmulets() : [];
    const lv = state.buildData ? state.buildData().amuletLevels || {} : {};
    const effs = this.amulets.map((a) => amuletEffect(a, lv[a] || 0, legacy));
    let dm = 1, inc = 1, im = 1, sb = 0;
    for (const e of effs) {
      if (e.damageMult) dm *= e.damageMult;
      if (e.incomingMult) inc *= e.incomingMult;
      if (e.iceMult) im *= e.iceMult;
      if (e.slowBonus) sb += e.slowBonus;
    }
    this.hero.damageMult = Math.round(this.hero.damageMult * dm * 1e3) / 1e3;
    this.incomingMult = inc;
    this.iceMult = im;
    this.slowBonus = sb;
    this.manaRescue = effs.map((e) => e.manaRescue).find(Boolean) || null;
    this.manaRescueUsed = false;
    this.heroChill = { left: 0, pct: 0 };
    this.cooldowns = Object.fromEntries(ABILITY_ORDER.map((id) => [id, 0]));
    const arena = ARENAS[this.def.arena] || ARENAS.glade;
    this.arena = arena;
    this.fieldObjects = arena.objects.map((o) => ({ ...o, def: FIELD_OBJECTS[o.type], available: true, respawnLeft: 0 }));
    this.selectedId = null;
    this.time = 0;
    this.result = null;
    this.queue = [];
    this.stats = { abilityUses: { telekinesis: 0, fire: 0, seal: 0, ice: 0 }, interrupts: 0, damageTaken: 0, autoDamage: 0 };
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
    if (this.state.isEquipped && !this.state.isEquipped(id)) return { id, state: "benched" };
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
    this.checkManaRescue();
    this.cooldowns[id] = this.startCooldown(id, s);
    this.stats.abilityUses[id]++;
    this.abilities.grantUseXP(id, "combat");
    if (id === "telekinesis") this.castTelekinesis(s);
    else if (id === "fire") this.castFire(s);
    else if (id === "seal") this.castSeal(s);
    else if (id === "ice") this.castIce(s);
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
    } else if (e.type === "warm") {
      if (this.chillResist >= e.resist) return { ok: false, reason: "full" };
      this.chillResist = e.resist;
      this.heroChill = { left: 0, pct: 0 };
      this.emit({ type: "potion", id, kind: "warm" });
    } else if (e.type === "cleanse") {
      const gain = Math.min(h.maxHp - h.hp, Math.round(h.maxHp * e.heal));
      if (gain <= 0 && !(this.heroChill.left > 0)) return { ok: false, reason: "full" };
      h.hp += gain;
      this.heroChill = { left: 0, pct: 0 };
      this.emit({ type: "potion", id, kind: "heal", amount: gain });
    } else if (e.type === "brittle") {
      this.enemy.applyBrittle(e.bonus, e.sec);
      this.emit({ type: "potion", id, kind: "brittle" });
      this.emit({ type: "status", status: "brittle", sec: e.sec, bonus: e.bonus });
    } else if (e.type === "guard") {
      this.guard = { left: e.sec, mult: e.incoming };
      this.emit({ type: "potion", id, kind: "guard", sec: e.sec });
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
    const br = this.enemy.consumeBrittle();
    if (br) {
      base *= 1 + br;
      this.emit({ type: "status", status: "shatter", bonus: br });
      if (tags.includes("telekinesis_heavy") && this.enemy.armorActive && this.enemy.breakArmor()) this.emit({ type: "armorBroken", sec: this.enemy.def.armor.disabledSec });
    }
    const dmg = this.enemy.takeDamage(base, "telekinesis", this.hero.damageMult);
    this.emit({ type: "damage", target: "enemy", amount: dmg, school: "telekinesis", heavy: tags.includes("telekinesis_heavy") });
  }
  castFire(s) {
    const br = this.enemy.consumeBrittle();
    if (br) this.emit({ type: "status", status: "shatter", bonus: br });
    const dmg = this.enemy.takeDamage(s.damage * (1 + br), "fire", this.hero.damageMult);
    this.emit({ type: "damage", target: "enemy", amount: dmg, school: "fire" });
    this.enemy.applyBurn(s.burn.dps, s.burn.durationSec);
    this.emit({ type: "status", status: "burn", sec: s.burn.durationSec });
    if (s.puddle) {
      this.enemy.applyPuddle(s.puddle.dps, s.puddle.durationSec);
      this.emit({ type: "status", status: "puddle", sec: s.puddle.durationSec });
    }
    for (const e of this.enemy.onFireHit()) this.emit({ type: "status", status: e.type, sec: e.sec, bonus: e.bonus });
    if (s.interruptsNormalCast) this.handleInterrupt(["fire"]);
  }
  // v0.10.1: Астрал — чистый урон сквозь броню и кору; атаки врага не прерывает (это только Телекинез)
  castSeal(s) {
    const br = this.enemy.consumeBrittle();
    if (br) this.emit({ type: "status", status: "shatter", bonus: br });
    const dmg = this.enemy.takeDamage(s.damage * (1 + br), "seal", this.hero.damageMult);
    this.emit({ type: "damage", target: "enemy", amount: dmg, school: "seal" });
    if (s.flash && this.enemy.alive) {
      for (const e of this.enemy.flash(s.flash.sec, s.flash.vulnerability || 0)) {
        if (e.type === "vulnerable") this.emit({ type: "status", status: "vulnerable", sec: e.sec, bonus: e.bonus });
        else this.emit(e);
      }
    }
  }
  /** v0.16.0: Лунный амулет — один раз за бой, когда маны меньше below от максимума, возвращает gainPct максимума. */
  checkManaRescue() {
    const r = this.manaRescue;
    if (!r || this.manaRescueUsed || this.hero.mana >= this.hero.maxMana * r.below) return;
    this.manaRescueUsed = true;
    const gain = Math.min(this.hero.maxMana - this.hero.mana, Math.round(this.hero.maxMana * r.gainPct));
    this.hero.mana += gain;
    this.emit({ type: "manaRescue", mana: gain });
  }
  /**
   * v0.18.0: Лёд — урон, замедление врага, со ступени II — Хрупкость. Ветка «Осколок»: удар по хрупкой цели раскалывает её
   * (урон ×shatter.mult, Хрупкость снимается и в этот раз заново не накладывается — иначе каждый удар был бы усиленным).
   */
  castIce(s) {
    let base = s.damage, shattered = false;
    if (s.shatter && this.enemy.isBrittle) {
      this.enemy.consumeBrittle();
      base *= s.shatter.mult;
      shattered = true;
      this.emit({ type: "status", status: "shatter", bonus: s.shatter.mult - 1, ice: true });
    }
    const dmg = this.enemy.takeDamage(base * this.iceMult, "ice", this.hero.damageMult);
    this.emit({ type: "damage", target: "enemy", amount: dmg, school: "ice" });
    if (!this.enemy.alive) return;
    if (s.slow) {
      const pct = Math.min(0.8, Math.round((s.slow.pct + this.slowBonus) * 1e3) / 1e3);
      this.enemy.applySlow(pct, s.slow.sec);
      this.emit({ type: "status", status: "slow", sec: s.slow.sec, pct });
    }
    if (s.brittle && !shattered) {
      this.enemy.applyBrittle(s.brittle.bonus, s.brittle.sec);
      this.emit({ type: "status", status: "brittle", sec: s.brittle.sec, bonus: s.brittle.bonus });
    }
    if (s.interruptsNormalCast) this.handleInterrupt(["ice"]);
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
    let hdt = dt;
    if (this.heroChill.left > 0) {
      hdt = dt * (1 - this.heroChill.pct);
      this.heroChill.left -= dt;
      if (this.heroChill.left <= 0) {
        this.heroChill = { left: 0, pct: 0 };
        this.emit({ type: "chillEnd" });
      }
    }
    h.mana = Math.min(h.maxMana, h.mana + h.regen * hdt);
    if (this.guard?.left > 0) {
      this.guard.left -= dt;
      if (this.guard.left <= 0) {
        this.guard = null;
        this.emit({ type: "guardEnd" });
      }
    }
    for (const id of ABILITY_ORDER) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - hdt);
    if (this.chain) {
      this.chain.left -= hdt;
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
          this.chillHero(a.chill);
          break;
        case "strongHit":
          this.hitHero(a.damage, true, a.name);
          this.chillHero(a.chill);
          break;
        case "strongStart":
          this.emit({ type: "warning", name: a.name, prepSec: a.prepSec, hint: a.hint, needsHeavy: a.interruptBy.includes("telekinesis_heavy") && !a.interruptBy.includes("telekinesis") });
          break;
        case "burnTick":
          this.emit({ type: "damage", target: "enemy", amount: a.damage, school: "fire", tick: true, puddle: !!a.puddle });
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
  /** v0.18.0: холод врага ({ pct, sec }) — сильнейший действует, длительность обновляется. */
  chillHero(c) {
    if (!c || this.hero.hp <= 0) return;
    const pct = c.pct * (this.chillResist ? 1 - this.chillResist : 1);
    if (pct <= 0) return;
    this.heroChill = { left: Math.max(this.heroChill.left, c.sec), pct: Math.max(this.heroChill.left > 0 ? this.heroChill.pct : 0, pct) };
    this.emit({ type: "chill", sec: c.sec, pct });
  }
  hitHero(damage, strong, name) {
    damage = Math.max(1, Math.round(damage * this.incomingMult * (this.guard?.left > 0 ? this.guard.mult : 1)));
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
  snap.combatCtx = { ...ctx, balanceVersion: ctx.balanceVersion === 30 ? 30 : 29 };
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
  if (ctx.spawn === "duel") return verifyDuel(snap, ctx, log, nowMs);
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
function verifyDuel(snap, ctx, log, nowMs) {
  const fail2 = (reason) => ({ ok: false, reason });
  const d = ctx.duel;
  if (ctx.enemy !== "duel_mage" || !d || typeof d !== "object" || !d.opponent || typeof d.opponent !== "object") return fail2("bad_spawn");
  if (log.ticks * STEP > (nowMs - snap.combatSince) / 1e3 + SLACK_SEC) return fail2("too_fast");
  const st = startState(ctx, nowMs);
  const cm = new CombatManager({ enemyType: "duel_mage", enemyDef: duelEnemyDef(d.opponent), state: st, abilities: new AbilitySystem(st, null, null) });
  const run = replayCombat(cm, log);
  if (run.held > 0) return fail2("bad_log");
  const outcome = cm.result || "retreat";
  const verdict = { outcome, since: snap.combatSince, spawn: "duel", ticks: run.ticks, mana: cm.hero.mana };
  if (outcome === "retreat") return { ok: true, verdict };
  verdict.potions = {};
  for (const id of COMBAT_POTIONS) add(verdict.potions, id, (ctx.potions[id] || 0) - st.item(id));
  const win = outcome === "victory";
  const reward = { heroXP: 0, schoolXP: {}, items: {} };
  mergeReward(reward, { schoolXP: { ...st.data.schoolXP } });
  const r = win ? DUEL.reward.victory : DUEL.reward.defeat;
  mergeReward(reward, { heroXP: r.heroXP || 0, items: r.coins ? { coins: r.coins } : {} });
  if (!reward.heroXP) delete reward.heroXP;
  verdict.reward = reward;
  const my = Number.isFinite(d.rating) ? d.rating : DUEL.baseRating, opp = Number.isFinite(d.opponent.rating) ? d.opponent.rating : DUEL.baseRating;
  verdict.duel = { win, delta: ratingDelta(my, opp, win), opponent: String(d.opponent.name || "").slice(0, 40) };
  verdict.entry = {
    enemy: "duel_mage",
    spawnId: "duel",
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
