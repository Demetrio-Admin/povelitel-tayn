import { COMBAT_BALANCE_VERSION } from './combatVersions.js';
// v0.16.0 — билд героя: слоты даров, один бесплатный пресет и амулеты.
// Хранится в объекте мира 'player_build' ({ branches, slots, amulets, preset }); его пишет только сервер (операции build_set / build_preset),
// поэтому он же попадает в боевой контекст, и сервер проигрывает бой с теми же слотами и амулетами.
// Правила здесь — чистые функции над простыми данными: их зовут и клиент (GameState), и JS-зеркало сервера (cloud/playerModel.js);
// SQL (supabase/schema.sql) повторяет их в тех же порядке проверок (проверяет tools/sql/diff-test.mjs).

/** Дары, которые можно ставить в слоты (порядок — порядок по умолчанию и на экране). */
export const GIFT_IDS = ['telekinesis', 'fire', 'seal', 'ice', 'storm'];   // v0.18.0: + Лёд

/**
 * Слоты даров: три. Четвёртый дар (Лёд) приходит в главе II на 11 уровне, и с ним начинается выбор «3 из 4»
 * (docs/design/stage-2-design-pack-v0.2.md §13), поэтому четвёртый слот уровнем пока не открывается: extraAtLevel = null.
 * Позже он может стать наградой выше 15 уровня или покупкой за сапфиры (тогда — число уровня или отдельное правило).
 */
export const SLOT_RULES = { base: 3, extraAtLevel: null };

export const AMULET_SLOTS = 2;

/**
 * Амулеты. Лежат в сумке и не тратятся; надеть можно два. Эффекты считает бой (CombatManager):
 *   damageMult — множитель урона героя; incomingMult — множитель урона, который получает герой;
 *   manaRescue — один раз за бой, когда маны становится меньше below от максимума, возвращает gainPct максимума.
 * У каждого есть цена — «чистой» силы нет (Дизайн: коридор силы).
 */
export const AMULETS = {
  amulet_focus: {
    name: 'Амулет Сосредоточения', icon: 'icon_amulet_focus', rarity: 'common',
    text: 'Урон даров и автоатаки +12%.', tradeoff: 'Нет защиты: враг бьёт как обычно.',
    effect: { damageMult: 1.12 },
  },
  amulet_forest: {
    name: 'Лесной амулет', icon: 'icon_amulet_forest', rarity: 'common',
    text: 'Получаемый урон −20%.', tradeoff: 'Урон героя −8%.',
    effect: { incomingMult: 0.8, damageMult: 0.92 },
  },
  amulet_lunar: {
    name: 'Лунный амулет', icon: 'icon_amulet_lunar', rarity: 'rare',
    text: 'Один раз за бой, когда маны остаётся меньше 20%, возвращает половину запаса.', tradeoff: 'Сам по себе силу не добавляет.',
    effect: { manaRescue: { below: 0.2, gainPct: 0.5 } },
  },
  // v0.19.0: первый амулет Льда (рецепт главы II, chapter-2-balance-v0.1.md §18)
  amulet_frost: {
    name: 'Амулет инея', icon: 'icon_amulet_frost', rarity: 'rare',
    text: 'Удар Льда +10%, замедление Льдом сильнее на 5%.', tradeoff: 'Без Льда в билде почти бесполезен.',
    effect: { iceMult: 1.1, slowBonus: 0.05 },
  },
  // v0.38.0: первый из трёх путей Сердца холода (глава III): холод Северина, отданный живой роще
  amulet_vetla: {
    name: 'Амулет ветлы', icon: 'icon_amulet_vetla', rarity: 'epic',
    text: 'Урон даров и автоатаки +8%, получаемый урон −12%.', tradeoff: 'Делается один раз — из Сердца холода, которое не купить.',
    effect: { damageMult: 1.08, incomingMult: 0.88 },
  },
};
Object.assign(AMULETS, {
  amulet_tracker: { name: 'Амулет Следопыта', icon: 'icon_amulet_forest', rarity: 'rare', text: 'Шанс дополнительного обычного ингредиента при сборе.', tradeoff: 'Не усиливает бой и не умножает сапфиры.', effect: { gatherBonus: 0.1 } },
  amulet_embers: { name: 'Амулет Углей', icon: 'icon_amulet_focus', rarity: 'epic', text: 'Усиливает Огонь, горение и лужу; позднее подавляет лечение горящей цели.', tradeoff: 'Специализация Огня.', effect: {} },
  amulet_breaker: { name: 'Амулет Камнелома', icon: 'icon_amulet_focus', rarity: 'epic', text: 'Усиливает тяжёлый бросок; позднее даёт щит после прерывания.', tradeoff: 'Нужны тяжёлые объекты и прерывания.', effect: {} },
  amulet_astral_eye: { name: 'Амулет Астрального ока', icon: 'icon_amulet_lunar', rarity: 'epic', text: 'Усиливает Астрал и продлевает уже открытую вспышку.', tradeoff: 'Не открывает вспышку на I–II.', effect: {} },
  amulet_blizzard: { name: 'Сердце метели', icon: 'icon_amulet_frost', rarity: 'epic', text: 'Усиливает Лёд и существующую Хрупкость.', tradeoff: 'Не открывает Хрупкость на Льде I.', effect: {} },
  amulet_storm_heart: { name: 'Грозовое сердце', icon: 'icon_amulet_lunar', rarity: 'epic', text: 'Усиливает урон Грозы. С +3 полный разряд возвращает ману не чаще раза в 12 с.', tradeoff: 'Нужна Гроза в слотах; для возврата маны — три заряда от других Даров.', effect: {} },
});
for (const [id,a] of Object.entries(AMULETS)) a.currency = ['amulet_embers','amulet_breaker','amulet_astral_eye','amulet_blizzard','amulet_storm_heart'].includes(id) ? 'sapphires' : 'coins';
export const AMULET_IDS = Object.keys(AMULETS);

/** v0.19.0: редкость амулета (подпись и цвет в окне). */
export const RARITY = {
  common: { name: 'обычный', color: 0xd9cbb0 },
  rare: { name: 'редкий', color: 0x6fa8ff },
  epic: { name: 'эпический', color: 0xc77dff },
  legendary: { name: 'легендарный', color: 0xffb547 },
};

/**
 * v0.19.0: улучшение амулета +1…+3 (chapter-2-balance-v0.1.md §23). Каждый уровень усиливает главное свойство на 25%
 * (+3 — на 75%); цена-недостаток не меняется. Цена уровня N — AMULET_UPGRADES[N − 1]: монеты + материалы.
 */
export const AMULET_UPGRADES = [
 { coins: 1000, items: { tree_resin: 2, rune_dust: 1 } },
 { coins: 5000, items: { ice_crystal: 2, rune_dust: 2 } },
 { coins: 15000, items: { frost_shard: 2, lunar_shard: 3 } },
 { coins: 40000, items: { reinforced_resin: 3, lunar_shard: 6, crafting_core: 2 } },
 { coins: 100000, items: { reinforced_resin: 6, rune_dust: 12, frost_shard: 4, crafting_core: 4 } },
];
export const SAPPHIRE_AMULET_PRICES = [300, 900, 2500, 6500, 15000];
export const amuletUpgradeCost = (id,level) => level >= 5 ? null : AMULETS[id]?.currency === 'sapphires' ? { sapphires: SAPPHIRE_AMULET_PRICES[level], coins: 0, items: {} } : AMULET_UPGRADES[level];
export function progressGate(enemies, tier) {
 const won = id => enemies.includes(id);
 if (tier === 1) return won('scavenger_01');
 if (tier === 2) return won('forest_guardian_01');
 if (tier === 3) return won('node_trial');
 if (tier === 4) return won('fq_guardian');
 return won('final_severin') && (won('fw_alpha') || won('gy_warden'));
}
export const AMULET_LEVEL_STEP = 0.25;

/** Действующие числа амулета с учётом уровня улучшения (одна функция для боя и окна). */
export function legacyAmuletEffect(id, level = 0, legacy = false) {
  const e = AMULETS[id]?.effect;
  if (!e) return {};
  const k = 1 + AMULET_LEVEL_STEP * Math.max(0, Math.min(level || 0, 3));
  const r = (v) => Math.round(v * 1000) / 1000;
  const out = { ...e };
  if (e.damageMult && e.damageMult > 1) out.damageMult = r(1 + (e.damageMult - 1) * k);
  if (e.incomingMult) out.incomingMult = r(1 - (1 - e.incomingMult) * k);
  if (e.manaRescue) out.manaRescue = { ...e.manaRescue, gainPct: legacy ? r(e.manaRescue.gainPct * k) : r(e.manaRescue.gainPct + 0.1 * Math.max(0, Math.min(level || 0, 3))) };
  if (e.iceMult) out.iceMult = r(1 + (e.iceMult - 1) * k);
  if (e.slowBonus) out.slowBonus = r(e.slowBonus * k);
  return out;
}

// Explicit curves preserve all four original models at +0…+3.
export function amuletEffect(id, level = 0, legacy = false, modern = true, balanceVersion = COMBAT_BALANCE_VERSION) {
 if (!modern) return legacyAmuletEffect(id, level, legacy);
 const n = Math.max(0, Math.min(5, Math.trunc(level) || 0));
 const at = a => a[n];
 switch (id) {
 case 'amulet_focus': return { damageMult: 1 + at([.12,.15,.18,.21,.25,.30]) };
 case 'amulet_forest': return { incomingMult: at([.8,.75,.7,.65,.625,.6]), damageMult: .92 };
 case 'amulet_lunar': return { manaRescue: { below: .2, gainPct: at([.5,.6,.7,.8,.9,1]) } };
 case 'amulet_frost': return { iceMult: 1 + at([.1,.125,.15,.175,.23,.3]), slowBonus: at([.05,.063,.075,.088,.095,.1]) };
 case 'amulet_tracker': return { gatherBonus: at([.1,.12,.15,.18,.21,.25]) };
 case 'amulet_embers': return { fireMult: 1+at([.12,.17,.23,.3,.43,.6]), burnMult: 1+at([.2,.25,.32,.4,.58,.8]), antiheal: at([0,0,0,.25,.32,.4]) };
 case 'amulet_breaker': return { heavyMult: 1+at([.25,.33,.43,.55,.75,1]), interruptShield: at([0,0,0,25,35,50]) };
 case 'amulet_astral_eye': return { sealMult: 1+at([.12,.18,.26,.35,.5,.7]), flashBonus: at([.5,.65,.8,1,1.4,2]) };
 case 'amulet_blizzard': return { iceMult: 1+at([.15,.19,.24,.3,.43,.6]), brittleBonus: at([0,0,0,.05,.1,.15]) };
 case 'amulet_storm_heart': return balanceVersion >= 40 ? { stormMult: 1+at([.15,.19,.24,.3,.43,.6]), stormRefund: n >= 3 ? { mana: at([0,0,0,10,14,20]), cooldownSec: 12 } : null } : {};
 default: return {};
 }
}

/** Сколько слотов даров у героя этого уровня. */
export const slotCount = (level, rules = SLOT_RULES) => rules.base + (rules.extraAtLevel != null && (level || 0) >= rules.extraAtLevel ? 1 : 0);

/** Слоты по умолчанию (пока игрок их не настраивал): первые N открытых даров по порядку. */
export const defaultSlots = (unlocked, count, gifts = GIFT_IDS) => gifts.filter((g) => unlocked.includes(g)).slice(0, count);

const isStrArr = (a) => Array.isArray(a) && a.length <= 8 && a.every((x) => typeof x === 'string');
const hasDup = (a) => new Set(a).size !== a.length;

/**
 * Проверка выбора слотов и амулетов. Порядок проверок общий с SQL.
 * @param {object} c { level, unlocked: [id], owns: (id) => bool, combat: bool }  — состояние героя
 * @param {object} want { slots?: [id], amulets?: [id] }  — что выбрано (отсутствует — не менять)
 * @param {object} rules { slots, amuletSlots, amulets: [id], gifts: [id] }  — правила (из RULES.build на сервере)
 * @returns {{ ok: true } | { ok: false, reason: string }} reason: bad | combat | none | dup | unknown | locked | missing | too_many
 */
export function checkBuild(c, want, rules) {
  const hasSlots = want.slots !== undefined && want.slots !== null;
  const hasAmulets = want.amulets !== undefined && want.amulets !== null;
  if ((hasSlots && !isStrArr(want.slots)) || (hasAmulets && !isStrArr(want.amulets)) || (!hasSlots && !hasAmulets)) return { ok: false, reason: 'bad' };
  if (c.combat) return { ok: false, reason: 'combat' };
  if (hasSlots) {
    const a = want.slots;
    if (a.length === 0) return { ok: false, reason: 'none' };
    if (hasDup(a)) return { ok: false, reason: 'dup' };
    if (a.some((g) => !rules.gifts.includes(g))) return { ok: false, reason: 'unknown' };
    if (a.some((g) => !c.unlocked.includes(g))) return { ok: false, reason: 'locked' };
    if (a.length > slotCount(c.level, rules.slots)) return { ok: false, reason: 'too_many' };
  }
  if (hasAmulets) {
    const a = want.amulets;
    if (hasDup(a)) return { ok: false, reason: 'dup' };
    if (a.some((g) => !rules.amulets.includes(g))) return { ok: false, reason: 'unknown' };
    if (a.some((g) => !c.owns(g))) return { ok: false, reason: 'missing' };
    if (a.length > rules.amuletSlots) return { ok: false, reason: 'too_many' };
  }
  return { ok: true };
}

/** Правила для сервера и клиента из этого файла. */
export function buildSlotRules() {
  return { slots: { ...SLOT_RULES }, amuletSlots: AMULET_SLOTS, amulets: [...AMULET_IDS], gifts: [...GIFT_IDS],
    amuletCurrencies: Object.fromEntries(Object.entries(AMULETS).map(([id,a]) => [id,a.currency])), sapphireAmuletPrices: SAPPHIRE_AMULET_PRICES, amuletUpgrades: AMULET_UPGRADES.map((u) => ({ coins: u.coins, items: { ...u.items } })) };
}
