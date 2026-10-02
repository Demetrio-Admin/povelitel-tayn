// v0.8 — ресурсы мира и расходники. Только данные: чистая логика в systems/Alchemy.js, рисунок — в сценах.
// Всё хранится как обычные предметы инвентаря (state.data.inventory), поэтому сервер не требует изменений схемы.

/** Пять ресурсов: способ добычи указан в world.resources.js, здесь — название, иконка и подпись. */
export const RESOURCES = {
  moon_herb:       { name: 'Лунная трава',      icon: 'moon_plant_01', color: 0x9fe9ff, hint: 'Растёт на полянах ночным светом. Нужна для настоев и изучения Телекинеза II.' },
  lunar_shard:     { name: 'Лунный осколок',    icon: 'icon_shard',    color: 0x9fe9ff, hint: 'Застывший лунный свет. Нужен для изучения даров.' },
  forest_mushroom: { name: 'Лесные грибы',      icon: 'icon_mushroom', color: 0xd9744a, hint: 'Растут в тени старого леса. Основа целебных настоев.' },
  tree_resin:      { name: 'Древесная смола',   icon: 'icon_resin',    color: 0xe8b04a, hint: 'Липкая и горючая. Её собирают с коры или достают из сожжённых зарослей.' },
  rune_dust:       { name: 'Руническая пыль',   icon: 'icon_dust',     color: 0xc9a2ff, hint: 'Остаётся от древних рун. Без неё магия не держится в зелье.' },
};

/** Расходники. effect применяется в бою (CombatManager.usePotion). */
export const POTIONS = {
  elixir_life: { name: 'Настой жизни',   icon: 'icon_potion_life', color: 0xe0566a, effect: { type: 'heal', amount: 0.45 },
    text: 'Возвращает 45% здоровья в бою.' },
  elixir_mana: { name: 'Лунный эликсир', icon: 'icon_potion_mana', color: 0x6ab4ff, effect: { type: 'mana', amount: 0.6 },
    text: 'Возвращает 60% маны в бою.' },
  resin_flask: { name: 'Смоляная склянка', icon: 'icon_potion_fire', color: 0xff8a3a, effect: { type: 'damage', amount: 45, burn: { dps: 6, durationSec: 4 } },
    text: 'Бросок во врага: 45 урона и горение.' },
};

/** Предметы для таблицы ITEMS (иконка, название). */
export const RESOURCE_ITEMS = {
  ...Object.fromEntries(Object.entries(RESOURCES).map(([id, r]) => [id, { name: r.name, icon: r.icon }])),
  ...Object.fromEntries(Object.entries(POTIONS).map(([id, r]) => [id, { name: r.name, icon: r.icon }])),
};

export const RESOURCE_ORDER = ['moon_herb', 'forest_mushroom', 'tree_resin', 'rune_dust', 'lunar_shard'];
export const POTION_ORDER = ['elixir_life', 'elixir_mana', 'resin_flask'];

/** Сколько зелий можно выпить за один бой (чтобы зелья помогали, а не отменяли бой). */
export const POTION_BATTLE_LIMIT = 4;
