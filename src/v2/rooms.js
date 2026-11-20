import { CITY_PORTALS, CITY_POSITIONS, CITY_ROOMS } from '../config/city.plan.js';
import { dressPaintedRooms } from '../config/city.rooms.js';

const dimensions = {
  bank: [720, 960],
  archive: [900, 1500],
  society: [900, 1320],
  lab: [960, 2160],
  duel: [1080, 1680],
  coven: [840, 1200],
  warehouse_a: [720, 1680],
  warehouse_b: [720, 1680],
  cellar: [720, 960],
  rescue: [720, 960],
};

const contains = (r, point) => point && point.x >= r.x && point.x < r.x + r.w &&
  point.y >= r.y && point.y < r.y + r.h;
const resize = (point, from, to) => ({
  ...point,
  x: to.x + (point.x - from.x) * to.w / from.w,
  y: to.y + (point.y - from.y) * to.h / from.h,
});

export const ACT_ROOMS = CITY_ROOMS.map(room => {
  const [w, h] = dimensions[room.key];
  const rect = { ...room.rect, w, h };
  return { ...room, rect, arrival: resize(room.arrival, room.rect, rect) };
});

export function resizeRoomPoint(point) {
  const index = CITY_ROOMS.findIndex(({ rect }) => contains(rect, point));
  if (index === -1) return point;
  const from = CITY_ROOMS[index].rect, to = ACT_ROOMS[index].rect;
  const resized = resize(point, from, to);
  if (point.approach) resized.approach = resize(point.approach, from, to);
  return resized;
}

export const ACT_CITY_POSITIONS = Object.fromEntries(
  Object.entries(CITY_POSITIONS).map(([id, point]) => [id, resizeRoomPoint(point)]),
);
export const ACT_CITY_PORTALS = CITY_PORTALS.map(door => ({
  ...resizeRoomPoint(door), target: resizeRoomPoint(door.target),
}));

export function actRoomMap(room) {
  const map = {
    grounds: [{ id: 'floor_' + room.id, ...room.rect }],
    roads: [], waters: [], props: [], pos: {}, colliders: [],
  };
  dressPaintedRooms(map, [room]);
  return map;
}
