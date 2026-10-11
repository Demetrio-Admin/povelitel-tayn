import { BUILDINGS } from '../config/city.plan.js';

/** The doorway follows the editable footprint, including off-centre facades. */
export function buildingDoor(c) {
  const b = BUILDINGS.find(b => b.id === c.building);
  return b ? { x: c.x + (b.door.x - b.x) * c.w / b.w, y: c.y + c.h } : null;
}

/** Moving an exterior moves its entrance and outdoor return point, never the room. */
export function linkBuildingPortals(list, colliders) {
  const doors = new Map(colliders.filter(c => c.building).map(c => [c.building, buildingDoor(c)]));
  return list.map(cfg => {
    if (cfg.kind !== 'room_door') return cfg;
    const entry = cfg.id.startsWith('door_');
    const id = cfg.id.replace(/^(door_|room_exit_)/, '');
    const door = doors.get(id), b = BUILDINGS.find(b => b.id === id);
    if (!door || !b) return cfg;
    const dx = door.x - b.door.x, dy = door.y - b.door.y;
    return entry ? { ...cfg, x: cfg.x + dx, y: cfg.y + dy }
      : { ...cfg, target: { x: cfg.target.x + dx, y: cfg.target.y + dy } };
  });
}
