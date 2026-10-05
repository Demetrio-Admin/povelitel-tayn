// Модель экрана «Дары»: что показать про каждый дар, не завися от Phaser (поэтому проверяется тестами без браузера).
// Данные берутся из конфигов баланса и из GameState; окно (ui/windows11.js) только рисует.
import { ABILITIES } from '../config/balance.abilities.js';
import { UPGRADES, ITEMS, TIMER_MODE, BRANCH_RESPEC } from '../config/balance.progression.js';
import { SAPPHIRES } from '../config/sapphires.js';
import { statsFor } from './abilityStats.js';
import { AMULETS, AMULET_IDS, AMULET_SLOTS, GIFT_IDS } from '../config/build.js';

export const GIFT_ORDER = ['telekinesis', 'fire', 'seal', 'ice'];
const WEIGHT_RU = { light: 'лёгкие', medium: 'лёгкие и средние', heavy: 'любые, включая тяжёлые' };
const pct = (v) => `${Math.round(v * 100)}%`;
const num = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Строки с числами дара на ступени level (для показа игроку); branchId — выбранная ветка. */
export function statLines(id, level, branchId = null) {
  const s = statsFor(id, level, branchId);
  if (!s) return [];
  const out = [`Урон ${s.damage} · мана ${s.manaCost} · перезарядка ${num(s.cooldownSec)} с`];
  if (id === 'telekinesis') {
    out.push(`Поднимает: ${WEIGHT_RU[s.maxWeight] || s.maxWeight}`);
    if (s.throwDamageBonus) out.push(`Урон бросками +${pct(s.throwDamageBonus)}`);
    if (s.doubleCast) out.push(`Два броска подряд: второй в течение ${num(s.doubleCast.windowSec)} с без перезарядки`);
    if (s.interruptRefund) out.push(`Удачное прерывание: +${pct(s.interruptRefund.manaPct)} маны, перезарядка −${s.interruptRefund.cooldownSec} с`);
  } else if (id === 'fire') {
    out.push(`Горение: ${s.burn.dps} урона в секунду, ${num(s.burn.durationSec)} с (всего ${Math.round(s.burn.dps * s.burn.durationSec)})`);
    if (s.puddle) out.push(`Лужа смолы: ${s.puddle.dps} урона в секунду, ${num(s.puddle.durationSec)} с (всего ${Math.round(s.puddle.dps * s.puddle.durationSec)})`);
  } else if (id === 'seal') {
    if (s.ignoresDefense) out.push('Пробивает броню и кору');
    if (s.flash) out.push(`Вспышка: броня и кора выключены на ${num(s.flash.sec)} с${s.flash.vulnerability ? `, враг уязвим +${pct(s.flash.vulnerability)}` : ''}`);
  } else if (id === 'ice') {   // v0.18.0
    if (s.slow) out.push(`Замедление: враг на ${pct(s.slow.pct)} медленнее ${num(s.slow.sec)} с — больше времени на прерывание`);
    if (s.brittle) out.push(`Хрупкость ${num(s.brittle.sec)} с: следующий удар Телекинеза, Огня или Астрала +${pct(s.brittle.bonus)}, тяжёлый бросок разбивает броню`);
    if (s.shatter) out.push(`Удар Льда по хрупкой цели: урон ×${num(s.shatter.mult)}`);
  }
  return out;
}

/** Ступени дара, которые есть в данных, по возрастанию. */
export function upgradesOf(id) {
  return Object.entries(UPGRADES).filter(([, u]) => u.ability === id).sort((a, b) => a[1].toLevel - b[1].toLevel).map(([key, u]) => ({ id: key, ...u }));
}

/** Время изучения в секундах для текущего режима таймеров. */
export const researchSeconds = (up) => up.timerSec[TIMER_MODE];

/** Карточка одного варианта изучения (ступень или ветка ступени). */
function stepCard(state, id, up) {
  const st = state.upgradeStatus(up.id);
  const need = [];
  const r = up.requires || {};
  if (r.heroLevel) need.push({ label: `Уровень героя ${r.heroLevel}`, have: state.data.heroLevel, need: r.heroLevel });
  if (r.event && !state.hasEvent(r.event)) need.push({ label: 'Пробудить Лунный алтарь', have: 0, need: 1 });
  need.push({ label: 'Опыт дара', have: state.data.schoolXP[id] || 0, need: up.cost.schoolXP });
  for (const [k, v] of Object.entries(up.cost.items || {})) need.push({ label: ITEMS[k]?.name || k, item: k, have: state.item(k), need: v });
  const branch = up.branch ? ABILITIES[id].branches?.[up.branch] : null;
  return {
    id: up.id, title: up.title, description: up.description, toLevel: up.toLevel,
    branch: up.branch || null, branchName: branch?.name || null, branchText: branch?.text || null, branchTradeoff: branch?.tradeoff || null,
    status: st.reason,                 // ready | missing | event | busy | in_progress | done | locked
    canStart: !!st.ok,
    need: need.map((n) => ({ ...n, ok: n.have >= n.need })),
    seconds: researchSeconds(up),
    after: statLines(id, up.toLevel, up.branch || null),
  };
}

/**
 * Варианты следующей ступени дара: одна карточка, а на ступени с ветками — по карточке на ветку (выбирается одна).
 * Пустой список — выше ступеней нет. state — GameState.
 */
export function nextChoices(state, id) {
  const lvl = state.abilityLevel(id);
  const ups = upgradesOf(id).filter((u) => u.toLevel > lvl);
  if (!ups.length) return [];
  const to = ups[0].toLevel;
  return ups.filter((u) => u.toLevel === to).map((u) => stepCard(state, id, u));
}

/** Первый вариант следующей ступени или null (для простых проверок). */
export function nextStep(state, id) { return nextChoices(state, id)[0] || null; }

/** Какие ветки можно взять вместо текущей и сколько это стоит (смена мгновенная, за монеты). */
export function respecOptions(state, id) {
  const cur = state.branchOf(id);
  if (!cur) return [];
  return Object.entries(ABILITIES[id].branches || {}).filter(([k]) => k !== cur)
    .map(([k, b]) => ({ id: k, name: b.name, price: BRANCH_RESPEC.coins, canPay: state.item('coins') >= BRANCH_RESPEC.coins,
      sapphires: SAPPHIRES.respec, canPaySapphires: state.sapphires() >= SAPPHIRES.respec }));
}

const pickBranch = (id, b) => { const x = ABILITIES[id].branches[b]; return { name: x.name, text: x.text, tradeoff: x.tradeoff }; };

/** Три карточки для окна: дар, ступень, текущие числа, следующая ступень. */
export function giftCards(state) {
  return GIFT_ORDER.map((id) => {
    const level = state.abilityLevel(id);
    const open = state.isUnlocked(id);
    return {
      id, name: ABILITIES[id].name, level, open,
      equipped: open && state.isEquipped(id),   // v0.16.0: стоит ли дар в слоте
      xp: state.data.schoolXP[id] || 0,
      branch: open && state.branchOf(id) ? { id: state.branchOf(id), ...pickBranch(id, state.branchOf(id)) } : null,
      now: open ? statLines(id, level, state.branchOf(id)) : [],
      choices: open ? nextChoices(state, id) : [],
      next: open ? nextStep(state, id) : null,
      respec: open ? respecOptions(state, id) : [],
      maxed: open && !upgradesOf(id).some((u) => u.toLevel > level),
    };
  });
}

/**
 * v0.16.0: билд для экрана «Дары»: слоты даров, амулеты, пресет. Только данные — решения принимает GameState / сервер.
 * slots — открытые дары с отметкой «в слоте»; amulets — амулеты, которые есть в сумке (equipped — надеты).
 */
export function buildView(state) {
  const equipped = state.equippedGifts();
  const worn = state.equippedAmulets();
  return {
    slotCount: state.giftSlotCount(),
    slotsUsed: equipped.length,
    slots: GIFT_IDS.filter((id) => state.isUnlocked(id)).map((id) => ({ id, name: ABILITIES[id].name, equipped: equipped.includes(id) })),
    amuletSlots: AMULET_SLOTS,
    amulets: AMULET_IDS.filter((id) => state.item(id) >= 1).map((id) => ({ id, name: AMULETS[id].name, text: AMULETS[id].text, tradeoff: AMULETS[id].tradeoff, equipped: worn.includes(id) })),
    hasPreset: !!state.buildData().preset,
    // v0.17.0: пресеты по номерам и следующий, который можно открыть за сапфиры
    presets: Array.from({ length: state.buildData().presetSlots }, (_, i) => ({ n: i + 1, saved: !!state.buildData().presets[i + 1] })),
    nextPreset: state.buildData().presetSlots < SAPPHIRES.preset.max
      ? { n: state.buildData().presetSlots + 1, price: SAPPHIRES.preset.price, canPay: state.sapphires() >= SAPPHIRES.preset.price } : null,
  };
}

/** Что получится, если нажать на дар в слотах: новый набор или причина отказа ('none' — последний дар, 'full' — все слоты заняты). */
export function toggleSlot(state, id) {
  const cur = state.equippedGifts();
  if (cur.includes(id)) return cur.length <= 1 ? { ok: false, reason: 'none' } : { ok: true, slots: cur.filter((g) => g !== id) };
  if (cur.length >= state.giftSlotCount()) return { ok: false, reason: 'full' };
  return { ok: true, slots: [...GIFT_IDS.filter((g) => state.isUnlocked(g) && (cur.includes(g) || g === id))] };
}

/** То же для амулета: надеть / снять; 'full' — оба слота заняты. */
export function toggleAmulet(state, id) {
  const cur = state.equippedAmulets();
  if (cur.includes(id)) return { ok: true, amulets: cur.filter((a) => a !== id) };
  if (cur.length >= AMULET_SLOTS) return { ok: false, reason: 'full' };
  return { ok: true, amulets: [...cur, id] };
}
