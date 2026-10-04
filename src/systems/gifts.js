// Модель экрана «Дары»: что показать про каждый дар, не завися от Phaser (поэтому проверяется тестами без браузера).
// Данные берутся из конфигов баланса и из GameState; окно (ui/windows11.js) только рисует.
import { ABILITIES } from '../config/balance.abilities.js';
import { UPGRADES, ITEMS, TIMER_MODE } from '../config/balance.progression.js';

export const GIFT_ORDER = ['telekinesis', 'fire', 'seal'];
const WEIGHT_RU = { light: 'лёгкие', medium: 'лёгкие и средние', heavy: 'любые, включая тяжёлые' };
const pct = (v) => `${Math.round(v * 100)}%`;
const num = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Строки с числами дара на ступени level (для показа игроку). */
export function statLines(id, level) {
  const s = ABILITIES[id]?.levels?.[level];
  if (!s) return [];
  const out = [`Урон ${s.damage} · мана ${s.manaCost} · перезарядка ${num(s.cooldownSec)} с`];
  if (id === 'telekinesis') {
    out.push(`Поднимает: ${WEIGHT_RU[s.maxWeight] || s.maxWeight}`);
    if (s.throwDamageBonus) out.push(`Урон бросками +${pct(s.throwDamageBonus)}`);
  } else if (id === 'fire') {
    out.push(`Горение: ${s.burn.dps} урона в секунду, ${num(s.burn.durationSec)} с (всего ${Math.round(s.burn.dps * s.burn.durationSec)})`);
  } else if (id === 'seal') {
    if (s.ignoresDefense) out.push('Пробивает броню и кору');
  }
  return out;
}

/** Ступени дара, которые есть в данных, по возрастанию. */
export function upgradesOf(id) {
  return Object.entries(UPGRADES).filter(([, u]) => u.ability === id).sort((a, b) => a[1].toLevel - b[1].toLevel).map(([key, u]) => ({ id: key, ...u }));
}

/** Время изучения в секундах для текущего режима таймеров. */
export const researchSeconds = (up) => up.timerSec[TIMER_MODE];

/**
 * Следующая ступень дара: статус, требования (с текущими значениями), время, строки «станет». null — выше нет данных.
 * state — GameState.
 */
export function nextStep(state, id) {
  const lvl = state.abilityLevel(id);
  const up = upgradesOf(id).find((u) => u.toLevel > lvl);
  if (!up) return null;
  const st = state.upgradeStatus(up.id);
  const need = [];
  const r = up.requires || {};
  if (r.heroLevel) need.push({ label: `Уровень героя ${r.heroLevel}`, have: state.data.heroLevel, need: r.heroLevel });
  if (r.event && !state.hasEvent(r.event)) need.push({ label: 'Пробудить Лунный алтарь', have: 0, need: 1 });
  need.push({ label: 'Опыт дара', have: state.data.schoolXP[id] || 0, need: up.cost.schoolXP });
  for (const [k, v] of Object.entries(up.cost.items || {})) need.push({ label: ITEMS[k]?.name || k, item: k, have: state.item(k), need: v });
  return {
    id: up.id, title: up.title, description: up.description, toLevel: up.toLevel,
    status: st.reason,                 // ready | missing | event | busy | in_progress | done | locked
    canStart: !!st.ok,
    need: need.map((n) => ({ ...n, ok: n.have >= n.need })),
    seconds: researchSeconds(up),
    after: statLines(id, up.toLevel),
  };
}

/** Три карточки для окна: дар, ступень, текущие числа, следующая ступень. */
export function giftCards(state) {
  return GIFT_ORDER.map((id) => {
    const level = state.abilityLevel(id);
    const open = state.isUnlocked(id);
    return {
      id, name: ABILITIES[id].name, level, open,
      xp: state.data.schoolXP[id] || 0,
      now: open ? statLines(id, level) : [],
      next: open ? nextStep(state, id) : null,
      maxed: open && !upgradesOf(id).some((u) => u.toLevel > level),
    };
  });
}
