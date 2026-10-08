// v0.27.0 — локации и карта мира: каждый объект — ровно в одной локации, у каждой локации есть выход «Карта мира»,
// прибытие внутри локации и с него пешком дойти до выхода; старые сохранения попадают в свою локацию.
//   node tests/locations-test.mjs
import { LOCATIONS, locationAt, locationById, inLocation, touchesLocation, locationOpen } from '../src/config/locations.js';
import { WORLD, INTERACTIVES, ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { CITY_START, FOREST_RETURN, EAST_X } from '../src/config/world.city.js';
import { regionStart, FROSTWOOD_START, GRAVEYARD_START } from '../src/config/world.expeditions.js';
import { STEP_GUIDE } from '../src/config/guidance.js';
import { ASSET_FILES, DISPLAY_SIZE } from '../src/config/assets.manifest.js';
import { buildTerrain } from '../src/world/terrain.js';
import { collectSolids } from '../src/world/solids.js';
import { buildWalkGrid, floodFrom, reachableNear } from '../src/world/walk.js';
import { PROPS, resolveMap } from '../src/world/mapData.js';
import fs from 'fs';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const ALL = [...INTERACTIVES, ...ENEMY_SPAWNS];

console.log('\nЛокации: данные');
{
  ok(LOCATIONS.map(l => l.id).join() === 'forest,city,frostwood,graveyard', 'четыре локации: лес Мирры (гл. I), город (гл. II), две вылазки');
  ok(new Set(LOCATIONS.map(l => l.id)).size === LOCATIONS.length && LOCATIONS.every(l => locationById(l.id) === l), 'id локаций уникальны');
  // прямоугольники не пересекаются и лежат внутри холста
  let overlap = false;
  for (const a of LOCATIONS) for (const b of LOCATIONS) if (a !== b && touchesLocation(a.rect, b)) overlap = true;
  ok(!overlap, 'локации не пересекаются');
  ok(LOCATIONS.every(l => l.rect.x >= 0 && l.rect.y >= 0 && l.rect.x + l.rect.w <= WORLD.width && l.rect.y + l.rect.h <= WORLD.height), 'все локации внутри холста координат');
  // каждый объект и враг — ровно в одной локации, и в той, где он был раньше (участок мира)
  const homeless = ALL.filter(o => LOCATIONS.filter(l => inLocation(o, l)).length !== 1);
  ok(!homeless.length, `каждый объект и враг — ровно в одной локации (${ALL.length})` + (homeless.length ? ': ' + homeless.map(o => o.id).join(', ') : ''));
  const startOf = { forest: WORLD.playerStart, city: CITY_START, frostwood: FROSTWOOD_START, graveyard: GRAVEYARD_START };
  const wrong = ALL.filter(o => startOf[locationAt(o.x, o.y).id] !== regionStart(o, WORLD.playerStart, CITY_START, EAST_X));
  ok(!wrong.length, 'объекты остались в своих местах (лес, город, вылазки)' + (wrong.length ? ': ' + wrong.map(o => o.id).join(', ') : ''));
  for (const l of LOCATIONS) {
    const ex = INTERACTIVES.find(o => o.id === l.exit);
    ok(ex?.kind === 'exit' && inLocation(ex, l) && !ex.requiresEvent && INTERACTIVES.filter(o => o.kind === 'exit' && inLocation(o, l)).length === 1,
      `«${l.name}»: один выход «Карта мира» внутри локации, доступен всегда`);
    ok(inLocation(l.arrival, l) && l.map.x > 0 && l.map.x < 584 && l.map.y > 0 && l.map.y < 760 && l.name && l.subtitle && l.text, `«${l.name}»: прибытие внутри, точка на карте, описание`);
  }
  ok(!INTERACTIVES.some(o => o.kind === 'travel'), 'старых указателей-телепортов больше нет: переходы только через карту мира');
  ok(ASSET_FILES.world_map_01 && fs.existsSync('public/' + ASSET_FILES.world_map_01.split('?')[0]) && DISPLAY_SIZE.world_map_01, 'рисованная карта мира: файл из рабочего манифеста и размер');
  const ef = INTERACTIVES.find(o => o.id === 'exit_forest');
  ok(ef.x === 1104 && ef.y === 4416 && !resolveMap().props.some(p => p.id === 'd05'), 'у перекрёстка один интерактивный указатель вместо декоративного двойника');
  ok(Math.hypot(FOREST_RETURN.x - ef.x, FOREST_RETURN.y - ef.y) < ef.radius, 'возврат из города — на тропу рядом с указателем у перекрёстка');
}

console.log('\nЛокации: открытие и старые сохранения');
{
  const has = (set) => (k) => set.includes(k);
  ok(locationOpen(locationById('forest'), has([])) && !locationOpen(locationById('city'), has([])), 'новичку открыт только лес Мирры');
  ok(locationOpen(locationById('city'), has(['ch2_start'])) && !locationOpen(locationById('frostwood'), has(['ch2_start'])), 'город — после проводов Мирры (ch2_start)');
  ok(['frostwood', 'graveyard'].every(id => locationOpen(locationById(id), has(['ch2_start', 'chapter_2_complete']))), 'вылазки — после главы II');
  ok(locationAt(WORLD.playerStart.x, WORLD.playerStart.y).id === 'forest' && locationAt(FOREST_RETURN.x, FOREST_RETURN.y).id === 'forest', 'старт и возврат в лес — в лесу Мирры');
  ok(locationAt(CITY_START.x, CITY_START.y).id === 'city' && locationAt(2600, 3625).id === 'city', 'точки города — в городе');
  ok(locationAt(FROSTWOOD_START.x, FROSTWOOD_START.y).id === 'frostwood' && locationAt(GRAVEYARD_START.x, GRAVEYARD_START.y).id === 'graveyard', 'точки вылазок — в вылазках');
  ok(locationAt(-50, -50).id === 'forest' && locationAt(9000, 100).id === 'frostwood' && ['city', 'forest'].includes(locationAt(2400, 200).id), 'точка вне всех локаций (старое сохранение) — в ближайшей');
  ok(STEP_GUIDE.ch2_road.targets.includes('exit_forest') && STEP_GUIDE.ch2_home.targets.includes('exit_city'), 'наведение главы II ведёт к выходам «Карта мира»');
}

console.log('\nЛокации: проходимость (ворота открыты)');
{
  const LIVE = resolveMap({ storage: null, useDraft: false });
  const terrain = buildTerrain({ ROADS: LIVE.roads, WATERS: LIVE.waters });
  const gates = ['corrupted_roots', 'heavy_boulder', 'forest_guardian_01', 'ancient_gate', 'node_trial', 'frost_barrier', 'fq_water', 'lab_seal', 'final_ward'];
  const solids = collectSolids({ colliders: LIVE.colliders, props: PROPS, interactives: INTERACTIVES, enemies: ENEMY_SPAWNS, waterRects: terrain.waterRects, skip: new Set(gates) });
  const grid = buildWalkGrid({ width: WORLD.width, height: WORLD.height, solids });
  for (const l of LOCATIONS) {
    const seen = floodFrom(grid, l.arrival.x, l.arrival.y);
    const ex = INTERACTIVES.find(o => o.id === l.exit);
    ok(reachableNear(grid, seen, ex.x, ex.y, 110), `«${l.name}»: с места прибытия пешком дойти до выхода`);
  }
  const seenF = floodFrom(grid, WORLD.playerStart.x, WORLD.playerStart.y);
  const ef = INTERACTIVES.find(o => o.id === 'exit_forest');
  ok(reachableNear(grid, seenF, ef.x, ef.y, 110), 'от дома Мирры дойти до выхода из леса');
}

console.log(failures ? `\n✗ Провалов: ${failures}` : '\n✓ Локации и карта мира: всё в порядке');
process.exit(failures ? 1 : 0);
