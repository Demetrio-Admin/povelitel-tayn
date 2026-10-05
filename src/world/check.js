// Проверка расстановки: можно ли дойти до всех мест, когда проходы открыты, и закрыты ли ворота, пока их не открыли.
// Используется редактором карты (кнопка «Проверить проходимость») и тестами.
import { WORLD } from '../config/world.layout.js';
import { CITY_START, EAST_X, CITY_GATE_IDS, CITY_BEHIND_GATES } from '../config/world.city.js';
import { regionStart } from '../config/world.expeditions.js';
import { buildWalkGrid, floodFrom, reachableNear } from './walk.js';
import { collectSolids } from './solids.js';

export const GATE_IDS = ['corrupted_roots', 'heavy_boulder', 'forest_guardian_01', 'ancient_gate', 'node_trial', ...CITY_GATE_IDS];
// Что должно оставаться недостижимым, пока проходы закрыты: за ними — следующие зоны маршрута.
export const BEHIND_GATES = ['moonstone', 'west_chest', 'forest_guardian_01', 'fire_circle', 'dry_bush', 'ancient_gate', 'node_trial', 'forest_node'];

export function checkWalkability({ colliders, props, interactives, enemies, terrain, start = WORLD.playerStart }) {
  const all = [...interactives, ...enemies];
  const byId = Object.fromEntries(all.map(o => [o.id, o]));
  const near = (grid, seen, id) => { const o = byId[id]; return !o || reachableNear(grid, seen, o.x, o.y, Math.min(o.radius || 100, 120)); };
  const solidsFor = (skip) => collectSolids({ colliders, props, interactives, enemies, waterRects: terrain.waterRects, skip: new Set(skip) });
  const dims = { width: WORLD.width, height: WORLD.height };

  const problems = [];
  const open = buildWalkGrid({ ...dims, solids: solidsFor(GATE_IDS) });
  // v0.20.0: город — отдельный участок, переход по указателю; v0.24.0: участки вылазок — тоже
  const floods = new Map();
  const seenFor = (o) => { const p = regionStart(o, start, CITY_START, EAST_X); if (!floods.has(p)) floods.set(p, floodFrom(open, p.x, p.y)); return floods.get(p); };
  for (const o of all) if (o.id !== 'flame_c' && !near(open, seenFor(o), o.id)) problems.push({ id: o.id, text: `«${o.id}» недостижим даже с открытыми проходами` });

  const closed = buildWalkGrid({ ...dims, solids: solidsFor([]) });
  const seenC = floodFrom(closed, start.x, start.y);
  for (const id of BEHIND_GATES) if (byId[id] && near(closed, seenC, id)) problems.push({ id, text: `«${id}» достижим в обход закрытых проходов` });
  const seenCE = floodFrom(closed, CITY_START.x, CITY_START.y);   // v0.21.0: Замёрзший квартал закрыт ледяной стеной
  for (const id of CITY_BEHIND_GATES) if (byId[id] && near(closed, seenCE, id)) problems.push({ id, text: `«${id}» достижим в обход закрытых проходов` });
  return problems;
}
