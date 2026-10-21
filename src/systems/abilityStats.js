// Параметры дара на ступени с учётом выбранной ветки. Одна функция для боя, мира и экрана «Дары»,
// чтобы числа, которые видит игрок, всегда совпадали с теми, что считает бой.
import { ABILITIES } from '../config/balance.abilities.js';
import { COMBAT_BALANCE_VERSION } from '../config/combatVersions.js';

/** Накладывает ветку на параметры ступени. set — заменить, add — прибавить, mul — умножить. */
export function applyBranch(base, branch) {
  if (!branch) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(branch.set || {})) out[k] = v;
  for (const [k, v] of Object.entries(branch.add || {})) out[k] = (out[k] || 0) + v;
  for (const [k, v] of Object.entries(branch.mul || {})) if (typeof out[k] === 'number') out[k] = Math.round(out[k] * v * 100) / 100;
  return out;
}

/** Параметры дара id на ступени level (выше известной берётся последняя) с веткой branchId; null — дар не открыт. */
export function statsFor(id, level, branchId = null, balanceVersion = COMBAT_BALANCE_VERSION) {
  if (!level) return null;
  const def = ABILITIES[id];
  if (!def) return null;
  const max = Math.max(...Object.keys(def.levels).map(Number));
  const base = def.levels[Math.min(level, max)];
  const branch = branchId ? def.branches?.[branchId] : null;
  const result = branch && level >= (branch.fromLevel || 1) ? { ...applyBranch(base, branch), branch: branchId } : { ...base };
  const stats = { ...result, ...(base.advancedBranches?.[branchId] || {}) };
  if (balanceVersion < 39 && id === 'fire' && level >= 5 && branchId === 'arsonist') stats.burn = { ...stats.burn, durationSec: 12 };
  return stats;
}
