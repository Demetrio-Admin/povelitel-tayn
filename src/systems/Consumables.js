// v0.9 — восстановительные зелья вне боя (из сумки). Тот же эффект, что в бою (POTIONS[id].effect), без Phaser.
// Не тратит лимит расходников боя; при полном запасе предмет не расходуется; восстанавливается только недостающее.
import { POTIONS } from '../config/resources.js';
import * as vitals from '../state/vitals.js';

/** { ok, reason?: 'none'|'full'|'combat'|'unknown', kind?, amount? } */
export function drinkOutside(state, id) {
  const p = POTIONS[id];
  if (!p) return { ok: false, reason: 'unknown' };
  if (!p.outside) return { ok: false, reason: 'combat' };
  if (state.item(id) < 1) return { ok: false, reason: 'none' };
  const e = p.effect;
  if (e.type === 'heal') {
    if (vitals.hp(state) >= vitals.maxHp(state)) return { ok: false, reason: 'full', kind: 'heal' };
    if (!state.removeItem(id, 1)) return { ok: false, reason: 'none' };
    const amount = vitals.restoreHp(state, Math.round(vitals.maxHp(state) * e.amount));
    state.save();
    return { ok: true, kind: 'heal', amount };
  }
  if (e.type === 'mana') {
    if (vitals.mana(state) >= vitals.maxMana(state)) return { ok: false, reason: 'full', kind: 'mana' };
    if (!state.removeItem(id, 1)) return { ok: false, reason: 'none' };
    const amount = vitals.restoreMana(state, Math.round(vitals.maxMana(state) * e.amount));
    state.save();
    return { ok: true, kind: 'mana', amount };
  }
  return { ok: false, reason: 'combat' };
}
