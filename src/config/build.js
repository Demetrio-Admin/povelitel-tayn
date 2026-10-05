// v0.16.0 — билд героя: слоты даров, один бесплатный пресет и амулеты.
// Хранится в объекте мира 'player_build' ({ branches, slots, amulets, preset }); его пишет только сервер (операции build_set / build_preset),
// поэтому он же попадает в боевой контекст, и сервер проигрывает бой с теми же слотами и амулетами.
// Правила здесь — чистые функции над простыми данными: их зовут и клиент (GameState), и JS-зеркало сервера (cloud/playerModel.js);
// SQL (supabase/schema.sql) повторяет их в тех же порядке проверок (проверяет tools/sql/diff-test.mjs).

/** Дары, которые можно ставить в слоты (порядок — порядок по умолчанию и на экране). */
export const GIFT_IDS = ['telekinesis', 'fire', 'seal'];

/** Слоты даров: три с начала, четвёртый — с extraAtLevel уровня героя (задел под платное расширение — позже). */
export const SLOT_RULES = { base: 3, extraAtLevel: 10 };

export const AMULET_SLOTS = 2;

/**
 * Амулеты. Лежат в сумке и не тратятся; надеть можно два. Эффекты считает бой (CombatManager):
 *   damageMult — множитель урона героя; incomingMult — множитель урона, который получает герой;
 *   manaRescue — один раз за бой, когда маны становится меньше below от максимума, возвращает gainPct максимума.
 * У каждого есть цена — «чистой» силы нет (Дизайн: коридор силы).
 */
export const AMULETS = {
  amulet_focus: {
    name: 'Амулет Сосредоточения', icon: 'icon_core',
    text: 'Урон даров и автоатаки +12%.', tradeoff: 'Нет защиты: враг бьёт как обычно.',
    effect: { damageMult: 1.12 },
  },
  amulet_forest: {
    name: 'Лесной амулет', icon: 'icon_ember',
    text: 'Получаемый урон −20%.', tradeoff: 'Урон героя −8%.',
    effect: { incomingMult: 0.8, damageMult: 0.92 },
  },
  amulet_lunar: {
    name: 'Лунный амулет', icon: 'icon_shard',
    text: 'Один раз за бой, когда маны остаётся меньше 20%, возвращает половину запаса.', tradeoff: 'Сам по себе силу не добавляет.',
    effect: { manaRescue: { below: 0.2, gainPct: 0.5 } },
  },
};
export const AMULET_IDS = Object.keys(AMULETS);

/** Сколько слотов даров у героя этого уровня. */
export const slotCount = (level, rules = SLOT_RULES) => rules.base + ((level || 0) >= rules.extraAtLevel ? 1 : 0);

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
  return { slots: { ...SLOT_RULES }, amuletSlots: AMULET_SLOTS, amulets: [...AMULET_IDS], gifts: [...GIFT_IDS] };
}
