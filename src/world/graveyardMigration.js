import { GRAVEYARD_ARRIVAL, legacyGraveyardPoint } from '../config/graveyard.plan.js';

/** Move only old cemetery positions once; keep inventory, encounters and timers. */
export function migrateGraveyardSave(state) {
  if (state.getObject('graveyard_layout')?.version >= 1) return false;
  for (const key of ['player', 'safePoint']) {
    if (state.data[key] && legacyGraveyardPoint(state.data[key])) {
      state.data[key] = { ...GRAVEYARD_ARRIVAL };
    }
  }
  // A reload during a previous-layout battle resumes at the new safe entrance.
  for (const [id, value] of Object.entries(state.data.worldObjects || {})) {
    if (id.startsWith('enc:gy_') && value?.state === 'fighting' && legacyGraveyardPoint(value)) {
      Object.assign(value, GRAVEYARD_ARRIVAL);
    }
  }
  state.setObject('graveyard_layout', { version: 1 });
  return true;
}
