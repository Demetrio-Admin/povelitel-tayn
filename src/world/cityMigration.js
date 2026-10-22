// v0.37.0: однократный перенос сохранения на прогулочный план города (city_layout.version = 4).
// Позиция героя, точка возрождения и сдвинутые Телекинезом предметы переносятся вместе с маркером версии —
// поэтому перезагрузка или повторный вход в сцену ничего не двигает второй раз. Прогресс, предметы и события не трогаются.
import { cityArrival, CITY_LAYOUT_VERSION, CITY_POSITIONS, CITY_ROOMS, LEGACY_ROOM_RECTS, V3_CITY, legacyCityPoint } from '../config/city.plan.js';
import { INTERACTIVES } from '../config/world.layout.js';

const inRect = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
/** Координаты сдвинутого предмета из любого прежнего плана города (v1 — разрезы, v2 — просторный, v3 — компактный). */
const oldCityObject = (o, layout) => legacyCityPoint(o) || inRect(o, V3_CITY.rect)
  || (layout < 3 && o.x >= 6000 && o.x < 9720 && o.y >= 600 && o.y < 4920);

export function cityLayoutOf(state) {
  return state.getObject('city_layout')?.version || 2;
}

/** Returns true when the save was moved to the current plan. */
export function migrateCitySave(state) {
  const layout = cityLayoutOf(state);
  if (layout >= CITY_LAYOUT_VERSION) {
    const warehouses=migrateWarehouseSave(state);
    return migratePaintedRooms(state)||warehouses;
  }
  const has = k => state.hasEvent(k);
  if (state.data.player) state.data.player = { ...cityArrival(state.data.player, has, layout) };
  if (state.data.safePoint) state.data.safePoint = { ...cityArrival(state.data.safePoint, has, layout) };
  for (const [id, o] of Object.entries(state.data.worldObjects || {})) {
    if (o?.state !== 'moved' || !Number.isFinite(o.x) || !Number.isFinite(o.y) || !CITY_POSITIONS[id]) continue;
    if (!oldCityObject(o, layout)) continue;
    // A pushed crate stays pushed: it rests at its new target beside the same door or path.
    const cfg = INTERACTIVES.find(c => c.id === id);
    if (cfg?.target) Object.assign(o, { x: cfg.target.x, y: cfg.target.y });
  }
  state.setObject('city_layout', { version: CITY_LAYOUT_VERSION });
  migrateWarehouseSave(state);
  migratePaintedRooms(state);
  return true;
}

/** Split the old shared hall once, without resetting story, battles or inventory. */
export function migrateWarehouseSave(state) {
  if (state.getObject('city_warehouses')?.version >= 1) return false;
  const oldHall = { x: 10200, y: 5200, w: 1440, h: 1680 };
  for (const field of ['player', 'safePoint']) {
    const p = state.data[field];
    if (!p || !inRect(p, oldHall)) continue;
    const key = p.x < 10920 ? 'warehouse_a' : 'warehouse_b';
    state.data[field] = { ...CITY_ROOMS.find(r => r.key === key).arrival };
  }
  const cargo = state.getObject('wh_cargo');
  if (cargo?.state === 'moved' && Number.isFinite(cargo.x) && Number.isFinite(cargo.y) && inRect(cargo, oldHall)) {
    const target = INTERACTIVES.find(o => o.id === 'wh_cargo').target;
    Object.assign(cargo, target);
  }
  state.setObject('city_warehouses', { version: 1 });
  return true;
}

/** One-time relocation to the approved room layouts; ordinary progress is untouched. */
export function migratePaintedRooms(state) {
  const version=state.getObject('city_interiors')?.version||0;
  if(version>=2)return false;
  for(const field of ['player','safePoint']){
    const p=state.data[field];if(!p)continue;
    const old=LEGACY_ROOM_RECTS.find(r=>inRect(p,r));
    // Version 1 already migrated the first eight rooms. Only the two new homes change now.
    const room=old&&CITY_ROOMS.find(r=>r.key===old.key&&r.painted&&(version<1||['cellar','rescue'].includes(r.key)));
    if(room)state.data[field]={...room.arrival};
  }
  const cargo=state.getObject('wh_cargo');
  if(version<1&&cargo?.state==='moved')Object.assign(cargo,INTERACTIVES.find(o=>o.id==='wh_cargo').target);
  state.setObject('city_interiors',{version:2});return true;
}
