// v0.8 — ресурсы мира и расходники. Только данные: чистая логика в systems/Alchemy.js, рисунок — в сценах.
// Всё хранится как обычные предметы инвентаря (state.data.inventory), поэтому сервер не требует изменений схемы.

/** Пять ресурсов: способ добычи указан в world.resources.js, здесь — название, иконка и подпись. */
export const RESOURCES = {
  moon_herb:       { name: 'Лунная трава',      icon: 'icon_moon_herb', color: 0x9fe9ff, hint: 'Растёт на полянах ночным светом. Нужна для настоев и изучения Телекинеза II.' },
  lunar_shard:     { name: 'Лунный осколок',    icon: 'icon_shard',    color: 0x9fe9ff, hint: 'Застывший лунный свет. Нужен для изучения даров.' },
  forest_mushroom: { name: 'Лесные грибы',      icon: 'icon_mushroom', color: 0xd9744a, hint: 'Растут в тени старого леса. Основа целебных настоев.' },
  tree_resin:      { name: 'Древесная смола',   icon: 'icon_resin',    color: 0xe8b04a, hint: 'Липкая и горючая. Её собирают с коры или достают из сожжённых зарослей.' },
  rune_dust:       { name: 'Руническая пыль',   icon: 'icon_dust',     color: 0xc9a2ff, hint: 'Остаётся от древних рун. Без неё магия не держится в зелье.' },
  // v0.19.0 — глава II (docs/design/chapter-2-balance-v0.1.md §16): четыре новых ресурса, не больше
  frost_herb:      { name: 'Морозник',          icon: 'icon_frost_herb', color: 0xa8e6d8, hint: 'Растение, изменённое холодной магией. Растёт у города, нужен для тёплых и стабилизирующих составов.' },
  ice_crystal:     { name: 'Ледяной кристалл',  icon: 'icon_ice_crystal', color: 0x9fe6ff, hint: 'Необычный кристалл холода: в особых местах города и у морозных противников.' },
  frost_shard:     { name: 'Инеевый осколок',   icon: 'icon_frost_shard', color: 0x7fb8ff, hint: 'Редкий осколок, который остаётся от сильных морозных врагов. В лавках не продаётся.' },
  cold_heart:      { name: 'Сердце холода',     icon: 'icon_cold_heart', color: 0x5fd0ff, hint: 'Очень редкий компонент сильнейших противников. Пригодится для будущих амулетов и ступеней Льда.' },
};

/** Расходники. effect применяется в бою (CombatManager.usePotion); outside: true — можно выпить из сумки вне боя (v0.9). */
export const POTIONS = {
  elixir_life: { name: 'Настой жизни',   icon: 'icon_potion_life', color: 0xe0566a, effect: { type: 'heal', amount: 0.45 },
    outside: true, text: '+45% здоровья. В бою и из сумки.' },
  elixir_mana: { name: 'Лунный эликсир', icon: 'icon_potion_mana', color: 0x6ab4ff, effect: { type: 'mana', amount: 0.6 },
    outside: true, text: '+60% маны. В бою и из сумки.' },
  resin_flask: { name: 'Смоляная склянка', icon: 'icon_potion_fire', color: 0xff8a3a, effect: { type: 'damage', amount: 45, burn: { dps: 6, durationSec: 4 } },
    text: 'Бросок во врага: 45 урона и горение. Только в бою.' },
  // v0.19.0 — глава II (chapter-2-balance-v0.1.md §18)
  warm_potion: { name: 'Тёплый настой', icon: 'icon_potion_warm', color: 0xffb36a, effect: { type: 'warm', resist: 0.6 },
    text: 'До конца боя холод врага слабее на 60%, а нынешний холод снимается. Только в бою.' },
  stabilizing_potion: { name: 'Стабилизирующий настой', icon: 'icon_potion_stable', color: 0xa8e6d8, effect: { type: 'cleanse', heal: 0.15 },
    text: 'Снимает холод и возвращает 15% здоровья. Нужен и по сюжету — помочь пострадавшим.' },
  brittle_flask: { name: 'Флакон Хрупкости', icon: 'icon_potion_brittle', color: 0x9fe6ff, effect: { type: 'brittle', bonus: 0.4, sec: 5 },
    text: 'Делает врага хрупким на 5 с: следующий удар даров +40%. Только в бою.' },
  crystal_guard: { name: 'Кристальная защита', icon: 'icon_potion_guard', color: 0x7fb8ff, effect: { type: 'guard', incoming: 0.75, sec: 12 },
    text: 'Двенадцать секунд получаемый урон −25%. Только в бою.' },
};

/** v0.19.0: промежуточные компоненты и инструменты (не пьются, а идут в крафт или применяются в мире). */
export const CRAFT_ITEMS = {
  reinforced_resin: { name: 'Усиленная смола', icon: 'icon_reinforced_resin', color: 0xe8a04a, text: 'Компонент для сильных предметов и улучшения амулетов.' },
  astral_lens: { name: 'Астральная линза', icon: 'icon_astral_lens', color: 0x9fb4ff, text: 'Несколько зарядов: показывает тайники и скрытые магические следы (в городе и вылазках).' },
};

/** Предметы для таблицы ITEMS (иконка, название). */
export const RESOURCE_ITEMS = {
  ...Object.fromEntries(Object.entries(RESOURCES).map(([id, r]) => [id, { name: r.name, icon: r.icon }])),
  ...Object.fromEntries(Object.entries(POTIONS).map(([id, r]) => [id, { name: r.name, icon: r.icon }])),
  ...Object.fromEntries(Object.entries(CRAFT_ITEMS).map(([id, r]) => [id, { name: r.name, icon: r.icon }])),
};

export const RESOURCE_ORDER = ['moon_herb', 'forest_mushroom', 'tree_resin', 'rune_dust', 'lunar_shard', 'frost_herb', 'ice_crystal', 'frost_shard', 'cold_heart'];
/** v0.19.0: ресурсы главы I — их сумка показывает всегда; новые — когда они уже есть. */
export const BASE_RESOURCES = ['moon_herb', 'forest_mushroom', 'tree_resin', 'rune_dust', 'lunar_shard'];
export const POTION_ORDER = ['elixir_life', 'elixir_mana', 'resin_flask', 'warm_potion', 'stabilizing_potion', 'brittle_flask', 'crystal_guard'];

/** Сколько зелий можно выпить за один бой (чтобы зелья помогали, а не отменяли бой). */
export const POTION_BATTLE_LIMIT = 4;
