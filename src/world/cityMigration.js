// v0.37.0: однократный перенос сохранения на прогулочный план города (city_layout.version = 4).
// Позиция героя, точка возрождения и сдвинутые Телекинезом предметы переносятся вместе с маркером версии —
// поэтому перезагрузка или повторный вход в сцену ничего не двигает второй раз. Прогресс, предметы и события не трогаются.
import { cityArrival, CITY_LAYOUT_VERSION, CITY_POSITIONS, V3_CITY, legacyCityPoint } from '../config/city.plan.js';
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
  if (layout >= CITY_LAYOUT_VERSION) return false;
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
  return true;
}
