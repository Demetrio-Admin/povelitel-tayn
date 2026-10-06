// v0.17.0 — модель кошелька сапфиров для окон (без Phaser, проверяется тестами). Баланс и решения — на сервере.
import { SAPPHIRES } from '../config/sapphires.js';

/** «1 сапфир», «2 сапфира», «5 сапфиров». */
export function sapphireWord(n) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return 'сапфиров';
  if (b === 1) return 'сапфир';
  if (b >= 2 && b <= 4) return 'сапфира';
  return 'сапфиров';
}
export const sapphires = (n) => `${n} ${sapphireWord(n)}`;

const fmtMin = (min) => (min >= 60 && min % 60 === 0 ? `${min / 60} ч` : `${min} мин`);

/**
 * Варианты ускорения идущего изучения: [{ chunks, label, price, can, why? }]. Сервер всё равно сам ограничит снятое время
 * (не больше 75% полного, остаток не меньше минуты) и возьмёт плату только за реально снятые шаги.
 */
export function speedupOptions(state) {
  const r = state.data.research;
  if (!r) return [];
  const S = SAPPHIRES.speedup;
  const left = state.researchRemainingMs();
  const full = Number.isFinite(r.fullMs) ? r.fullMs : r.durationMs;
  const elapsed = state.now() - r.startedAt;
  const maxCut = r.durationMs - Math.max(full - Math.floor(full * S.maxCutPct), elapsed + S.minLeftSec * 1000);
  const stepsLeft = state.speedupStepsLeftToday();
  const out = [1, 4].map((chunks) => {
    const cutMs = Math.min(chunks * S.chunkMin * 60_000, Math.max(0, maxCut));
    const steps = Math.min(chunks, Math.ceil(cutMs / (S.chunkMin * 60_000)));
    const price = steps * S.price;
    let why = null;
    if (left <= 0) why = 'done';
    else if (maxCut <= 0) why = 'limit';
    else if (stepsLeft <= 0) why = 'daily';
    else if (state.sapphires() < price) why = 'sapphires';
    const mins = cutMs > 0 ? Math.max(1, Math.round(cutMs / 60_000)) : chunks * S.chunkMin;   // столько реально снимется (у конца таймера — меньше)
    return { chunks, label: `−${fmtMin(mins)} · ${sapphires(Math.max(price, S.price))}`, price, can: !why, why };
  });
  // если второй вариант снимает столько же, сколько первый (таймер почти на пределе), он не нужен
  return out[1].price <= out[0].price ? [out[0]] : out;
}

/** Что показать в окне кошелька. */
export function walletView(state) {
  const w = state.data.wallet || {};
  return {
    balance: state.sapphires(),
    welcome: !w.welcome ? SAPPHIRES.welcome : 0,
    stepsLeftToday: state.speedupStepsLeftToday(),
    uses: [
      `Ускорить изучение дара: −${SAPPHIRES.speedup.chunkMin} мин за ${sapphires(SAPPHIRES.speedup.price)} (не больше ${SAPPHIRES.speedup.dailyChunks} раз в сутки и не больше ${Math.round(SAPPHIRES.speedup.maxCutPct * 100)}% таймера)`,
      `Сменить ветку дара: ${sapphires(SAPPHIRES.respec)} вместо монет`,
      `Ещё один пресет билда: ${sapphires(SAPPHIRES.preset.price)} (всего до ${SAPPHIRES.preset.max})`,
    ],
  };
}

/** Текст отказа сервера по операциям с сапфирами. */
export function sapphireFailText(r) {
  switch (r?.reason) {
    case 'sapphires': return `Не хватает сапфиров: нужно ${sapphires(r.need)}.`;
    case 'limit': return 'Это изучение уже ускорено до предела — остаток дождитесь.';
    case 'daily': return 'Ускорения на сегодня закончились — завтра будут снова.';
    case 'none': return 'Сейчас ничего не изучается.';
    case 'max': return 'Все пресеты уже открыты.';
    case 'already': return 'Приветственные сапфиры уже получены.';
    case 'network': return 'Нет связи с сервером — попробуйте ещё раз.';
    default: return 'Не получилось.';
  }
}
