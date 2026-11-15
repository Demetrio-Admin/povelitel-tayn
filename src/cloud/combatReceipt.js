export const COMBAT_RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const isCombatId = id => typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);

const storageKey = userId => `witch_combat_pending_v1:${userId}`;

export function readPendingCombat(storage, userId, now) {
  if (!userId) return null;
  try {
    const value = JSON.parse(storage?.getItem(storageKey(userId)) || 'null');
    if (isCombatId(value?.id) && Number.isFinite(value.since) && now - value.since < COMBAT_RECEIPT_TTL_MS) return value.id;
    if (value !== null) storage?.removeItem(storageKey(userId));
  } catch { /* Recovery still works within the current scene when storage is disabled. */ }
  return null;
}

export function rememberPendingCombat(storage, userId, id, now) {
  if (!userId || !isCombatId(id)) return;
  try { storage?.setItem(storageKey(userId), JSON.stringify({ id, since: now })); } catch { /* Optional storage. */ }
}

export function forgetPendingCombat(storage, userId, id) {
  if (!userId || !isCombatId(id)) return;
  try {
    const key = storageKey(userId);
    if (JSON.parse(storage?.getItem(key) || 'null')?.id === id) storage?.removeItem(key);
  } catch { /* Optional storage. */ }
}
