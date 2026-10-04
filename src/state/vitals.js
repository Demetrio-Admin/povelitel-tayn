// v0.9 — общие HP и мана героини: одни и те же запасы в мире, в бою, в HUD, профиле и сумке. Без Phaser.
// Хранятся в GameState.data.hp / data.mana (дробные; округляется только отображение).
// null — «полный запас» (старые сохранения и новый персонаж): при первом изменении становится числом.
// v0.12.0: настоящие HP и мана хранит сервер и восстанавливает по своему времени (в том числе офлайн). Здесь — зеркало для экрана:
// между ответами сервера значения идут по тем же скоростям от настенных часов (data.vitalsClock), а ответ сервера их поправляет.
import { VITALS, HERO_RECOVERY, HEALING } from '../config/balance.hero.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const EPS = 1e-9;

export const maxHp = (state) => state.heroStats().maxHp;
export const maxMana = (state) => state.heroStats().maxMana;

/** Текущее HP (null → максимум; всегда 0…max, без NaN). */
export function hp(state) { const m = maxHp(state); const v = state.data.hp; return finite(v) ? clamp(v, 0, m) : m; }
export function mana(state) { const m = maxMana(state); const v = state.data.mana; return finite(v) ? clamp(v, 0, m) : m; }

export function setHp(state, v) { state.data.hp = clamp(finite(v) ? v : 0, 0, maxHp(state)); return state.data.hp; }
export function setMana(state, v) { state.data.mana = clamp(finite(v) ? v : 0, 0, maxMana(state)); return state.data.mana; }

/** Перед повышением уровня: «полный» запас фиксируется числом, чтобы новый максимум не дал скрытого восстановления. */
export function materialize(state) { setHp(state, hp(state)); setMana(state, mana(state)); }

/** Запасы в пределах текущего максимума (после загрузки, ответа сервера, смены уровня). null остаётся null. */
export function normalize(state) {
  const d = state.data;
  if (d.hp !== null && d.hp !== undefined) setHp(state, d.hp); else d.hp = null;
  if (d.mana !== null && d.mana !== undefined) setMana(state, d.mana); else d.mana = null;
}

export const canAfford = (state, cost) => mana(state) + EPS >= cost;

/**
 * Списать ману. false — не хватает (ничего не меняется). Списанное копится в data.manaSpent: PlayerSession отправляет
 * серверу прирост (mana_spent), а сервер вычитает его из своей маны.
 */
export function spendMana(state, cost) {
  if (!(cost > 0)) return true;
  if (!canAfford(state, cost)) return false;
  const before = mana(state);
  setMana(state, Math.max(0, before - cost));
  state.data.manaSpent = (state.data.manaSpent || 0) + (before - mana(state));
  return true;
}

/** Вернуть ману, списанную через spendMana (сбор отменён): уменьшает и счётчик потраченного. */
export function refundMana(state, amount) {
  const back = restoreMana(state, amount);
  state.data.manaSpent = Math.max(0, (state.data.manaSpent || 0) - back);
  return back;
}

/** Восстановить; возвращает фактически добавленное (0, если запас полный). */
export function restoreHp(state, amount) { const before = hp(state); setHp(state, before + Math.max(0, amount)); return hp(state) - before; }
export function restoreMana(state, amount) { const before = mana(state); setMana(state, before + Math.max(0, amount)); return mana(state) - before; }

/**
 * Пассивное восстановление по настенным часам: HP и мана растут с теми же скоростями, что считает сервер, пока герой
 * вне боя — окна, диалоги и скрытая вкладка не мешают. nowMs — Date.now(); inHouse — дом Мирры (мана быстрее).
 * Во время боя (data.combatSince) время не засчитывается. Возвращает true, если что-то изменилось.
 */
export function regenWall(state, nowMs, { inHouse = false } = {}) {
  const d = state.data;
  const from = finite(d.vitalsClock) ? d.vitalsClock : nowMs;
  d.vitalsClock = nowMs;
  if (d.combatSince != null) return false;
  const t = Math.max(0, (nowMs - from) / 1000);
  if (t <= 0) return false;
  const h0 = hp(state), m0 = mana(state);
  const hMax = maxHp(state), mMax = maxMana(state);
  if (h0 < hMax) setHp(state, h0 + VITALS.hpRegenPerSec * t);
  if (m0 < mMax) setMana(state, m0 + (inHouse ? VITALS.manaRegenHouse : VITALS.manaRegenWorld) * t);
  return hp(state) !== h0 || mana(state) !== m0;
}

/** Победа: HP — новый максимум (после наград и уровня), мана — фактический остаток. */
export function afterVictory(state, manaLeft) { setMana(state, manaLeft); setHp(state, maxHp(state)); }

/** Поражение: 20% максимума HP (минимум 1), мана — фактический остаток. */
export function afterDefeat(state, manaLeft) {
  setMana(state, manaLeft);
  setHp(state, Math.max(1, Math.ceil(maxHp(state) * HERO_RECOVERY.defeatHpFraction)));
}

/** Цена лечения у Мирры: ceil(недостающее HP / 10). Полное HP → 0. */
export function healPrice(curHp, max) {
  const missing = Math.max(0, max - (finite(curHp) ? curHp : max));
  return Math.ceil(missing / HEALING.hpPerCoin - EPS);
}

/** Для интерфейса: целые числа. */
export const view = (state) => ({ hp: Math.ceil(hp(state)), maxHp: maxHp(state), mana: Math.floor(mana(state) + EPS), maxMana: maxMana(state) });
