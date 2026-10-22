import { FROSTWOOD_ARRIVAL, legacyFrostwoodPoint } from '../config/frostwood.plan.js';

/** Relocate only old forest positions once, keeping progress and repeat timers. */
export function migrateFrostwoodSave(state) {
  if(state.getObject('frostwood_layout')?.version>=1)return false;
  for(const key of ['player','safePoint']) {
    if(state.data[key]&&legacyFrostwoodPoint(state.data[key]))state.data[key]={...FROSTWOOD_ARRIVAL};
  }
  for(const [id,value] of Object.entries(state.data.worldObjects||{})) {
    if(id.startsWith('enc:fw_')&&value?.state==='fighting'&&legacyFrostwoodPoint(value))Object.assign(value,FROSTWOOD_ARRIVAL);
  }
  state.setObject('frostwood_layout',{version:1});
  return true;
}
