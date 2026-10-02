// Проверка расстановки: можно ли дойти до всех мест, когда проходы открыты, и закрыты ли ворота, пока их не открыли.
// Используется редактором карты (кнопка «Проверить проходимость») и тестами.
import { WORLD } from '../config/world.layout.js';
import { buildWalkGrid, floodFrom, reachableNear } from './walk.js';
import { collectSolids } from './solids.js';

export const GATE_IDS = ['corrupted_roots', 'heavy_boulder', 'forest_guardian_01'];
// Что должно оставаться недостижимым, пока проходы закрыты: за ними — следующие зоны маршрута.
export const BEHIND_GATES = ['moonstone', 'west_chest', 'forest_guardian_01', 'fire_circle', 'dry_bush', 'ancient_gate'];

export function checkWalkability({ colliders, props, interactives, enemies, terrain, start = WORLD.playerStart }) {
  const all = [...interactives, ...enemies];
  const byId = Object.fromEntries(all.map(o => [o.id, o]));
  const near = (grid, seen, id) => { const o = byId[id]; return !o || reachableNear(grid, seen, o.x, o.y, Math.min(o.radius || 100, 120)); };
  const solidsFor = (skip) => collectSolids({ colliders, props, interactives, enemies, waterRects: terrain.waterRects, skip: new Set(skip) });
  const dims = { width: WORLD.width, height: WORLD.height };

  const problems = [];
  const open = buildWalkGrid({ ...dims, solids: solidsFor(GATE_IDS) });
  const seenO = floodFrom(open, start.x, start.y);
  for (const o of all) if (o.id !== 'flame_c' && !near(open, seenO, o.id)) problems.push({ id: o.id, text: `«${o.id}» недостижим даже с открытыми проходами` });

  const closed = buildWalkGrid({ ...dims, solids: solidsFor([]) });
  const seenC = floodFrom(closed, start.x, start.y);
  for (const id of BEHIND_GATES) if (byId[id] && near(closed, seenC, id)) problems.push({ id, text: `«${id}» достижим в обход закрытых проходов` });
  return problems;
}
