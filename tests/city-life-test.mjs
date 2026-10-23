// «Живой город»: чистая логика (маршруты по улицам, где появляться, сколько кого) и наличие всех кадров — без Phaser и браузера.
// Поведение в настоящем Phaser проверяет tests/e2e/city-life.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITY_LIFE, CHAT_LINES, populationFor, buildRoutes, pointAt, pickSpawn, routeDistance, personFacing, petPose } from '../src/world/cityLife.js';
import { cityMapData } from '../src/config/city.plan.js';
import { ASSET_FILES, DISPLAY_SIZE, TEMPORARY_ART } from '../src/config/assets.manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const seeded = (seed = 7) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

// ---- маршруты: только мощёные улицы, без площадей и коротких подъездов
const roads = cityMapData().roads;
const routes = buildRoutes(roads);
ok(routes.length >= 10, `маршрутов по улицам достаточно (${routes.length})`);
ok(routes.every(r => r.id.startsWith('city_street_') && r.len >= 260 && r.w <= 200 && r.pts.length > 2), 'маршруты — улицы нужной длины и ширины');
ok(buildRoutes(null).length === 0 && buildRoutes([{ id: 'city_street_x', pts: [[0, 0], [10, 0]], w: 90 }]).length === 0, 'пустой список и короткая улица маршрута не дают');
ok(buildRoutes([{ id: 'city_street_p', kind: 'dirt', pts: [[0, 0], [900, 0]], w: 90 }, { id: 'city_square', pts: [[0, 0], [900, 0]], w: 90 }, { id: 'city_street_w', pts: [[0, 0], [900, 0]], w: 300 }]).length === 0, 'грунтовки, площади и широкие дворы — не маршруты');

// ---- точка на маршруте
const line = buildRoutes([{ id: 'city_street_t', pts: [[0, 0], [400, 0], [800, 0]], w: 90 }])[0];
const a = pointAt(line, 0), b = pointAt(line, line.len), m = pointAt(line, line.len / 2, 20);
ok(Math.abs(a.x) < 1 && Math.abs(b.x - 800) < 1, 'начало и конец маршрута');
ok(Math.abs(pointAt(line, -50).x - a.x) < 1e-6 && Math.abs(pointAt(line, 1e9).x - b.x) < 1e-6, 'за пределами маршрута точка прижимается к концам');
ok(Math.abs(Math.abs(m.y) - 20) < 1e-6 && Math.abs(m.tx - 1) < 1e-6, 'смещение полосы — вбок от направления движения');

// ---- где появиться
{
  const street = buildRoutes([{ id: 'city_street_v', pts: [[500, 0], [500, 2000]], w: 90 }]);
  const view = { x: 300, y: 600, width: 400, height: 800 };     // улица пересекает экран сверху вниз
  const hero = { x: 520, y: 1000 };
  for (let seed = 1; seed <= 30; seed++) {
    const sp = pickSpawn(street, view, seeded(seed), CITY_LIFE.spawnMargin, 24, hero);
    ok(sp && sp.hidden, `улица выходит за экран — ходок появляется за краем (seed ${seed})`);
    const p = pointAt(sp.route, sp.s);
    ok(p.y < view.y - CITY_LIFE.spawnMargin + 1 || p.y > view.y + view.height + CITY_LIFE.spawnMargin - 1, 'место появления за краем экрана с запасом');
    const toward = sp.s + sp.dir * 200, q = pointAt(sp.route, toward);
    ok(Math.abs(q.y - view.y - view.height / 2) < Math.abs(p.y - view.y - view.height / 2), 'идёт внутрь экрана');
  }
  const inside = buildRoutes([{ id: 'city_street_i', pts: [[500, 700], [500, 1100]], w: 90 }]);
  const sp = pickSpawn(inside, view, seeded(3), CITY_LIFE.spawnMargin, 24, { x: 500, y: 700 });
  ok(sp && !sp.hidden, 'улица целиком на экране: ходок проявляется плавно');
  ok(Math.hypot(pointAt(sp.route, sp.s).x - 500, pointAt(sp.route, sp.s).y - 700) >= CITY_LIFE.fadeSpawnHeroPx, '…и не рядом с героиней');
  ok(pickSpawn(street, { x: 5000, y: 0, width: 100, height: 100 }, seeded(2)) === null, 'улиц на экране нет — никто не появляется');
  ok(pickSpawn(inside, view, seeded(3)) === null, 'без героини проявляться на экране не откуда — никто не появляется');
}

// ---- расстояние до маршрута и «обход» героини
{
  const v = buildRoutes([{ id: 'city_street_d', pts: [[500, 0], [500, 1000]], w: 90 }])[0];
  ok(routeDistance(v, 500, 400) < 3 && Math.abs(routeDistance(v, 760, 400) - 260) < 3, 'расстояние от героини до улицы');
  const near = buildRoutes([{ id: 'city_street_n', pts: [[500, 0], [500, 1000]], w: 90 }, { id: 'city_street_f', pts: [[1200, 0], [1200, 1000]], w: 90 }]);
  const free = near.filter(r => routeDistance(r, 520, 500) > CITY_LIFE.spawnAvoidHeroPx);
  ok(free.length === 1 && free[0].id === 'city_street_f', 'улица, на которой стоит героиня, для новых прохожих не годится');
  ok(CITY_LIFE.yieldPx.person < CITY_LIFE.spawnAvoidHeroPx && CITY_LIFE.yieldPx.pet < CITY_LIFE.spawnAvoidHeroPx && CITY_LIFE.crowd.max <= 2, 'рядом с героиней не толпятся');
}

// ---- сторона человека: вверх по экрану — спиной, вниз и вбок — лицом, без мигания на границе
{
  ok(personFacing(-1) === 'back' && personFacing(1) === 'front' && personFacing(0) === 'front', 'вверх — спиной, вниз и вбок — лицом');
  ok(personFacing(-0.35, 'back') === 'back' && personFacing(-0.35, 'front') === 'front', 'на границе остаётся прежняя сторона');
}

// ---- поза зверя: мордой по ходу, а не боком
{
  const close = (x, y) => Math.abs(x - y) < 1e-6;
  let p = petPose(1, 0); ok(!p.flip && close(p.deg, 0), 'вправо: как нарисован');
  p = petPose(-1, 0); ok(p.flip && close(p.deg, 0), 'влево: зеркало');
  p = petPose(0, 1, false); ok(!p.flip && close(p.deg, 90), 'вниз по улице: мордой вниз');
  p = petPose(0, -1, false); ok(!p.flip && close(p.deg, -90), 'вверх по улице: мордой вверх');
  p = petPose(0, 1, true); ok(p.flip && close(p.deg, -90), 'вниз, зеркальный: мордой вниз');
  p = petPose(0, -1, true); ok(p.flip && close(p.deg, 90), 'вверх, зеркальный: мордой вверх');
  p = petPose(1, 1); ok(!p.flip && close(p.deg, 45), 'вправо-вниз: наклон по диагонали');
  p = petPose(-1, 1); ok(p.flip && close(p.deg, -45), 'влево-вниз: наклон по диагонали');
  let all = true; for (let a = 0; a < 360; a += 5) { const q = petPose(Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)); all = all && q.deg >= -90 && q.deg <= 90; }
  ok(all, 'угол всегда в пределах ±90°');
}

// ---- сколько кого
{
  const frozen = populationFor(() => false), thawed = populationFor(k => k === 'chapter_2_complete'), early = populationFor(k => k === 'ch2_severin_defeated');
  ok(!frozen.thawed && frozen.snow && !frozen.smoke && frozen.citizens < thawed.citizens, 'замёрзший город малолюден, идёт снег, дыма нет');
  ok(thawed.thawed && !thawed.snow && thawed.smoke && thawed.citizens === 5 && thawed.pets === 3, 'после оттаивания — людно, дым из труб');
  ok(early.thawed, 'оттаивание считается и по победе над Северином');
  const lite = populationFor(() => true, true);
  ok(lite.citizens <= 1 && lite.pets === 0 && !lite.smoke && !lite.snow && lite.crows === 1, 'лёгкий режим: почти ничего');
  ok(thawed.citizens <= 5 && thawed.pets <= 3 && thawed.crows <= 3 && CITY_LIFE.smokeMax <= 16 && CITY_LIFE.snowFlakes <= 24, 'жёсткие лимиты: людей ≤5, зверей ≤3, ворон ≤3, дым ≤16, снег ≤24');
}

// ---- все кадры есть в манифесте и на диске
{
  const need = [];
  for (const v of CITY_LIFE.citizenVariants) for (let i = 0; i <= 4; i++) need.push(`cl_${v}_${i}`, `cl_${v}_b_${i}`);   // лицом и спиной
  for (const v of [...CITY_LIFE.cats, ...CITY_LIFE.dogs]) for (const f of ['sit', 'walk1', 'walk2', 'run1', 'run2']) need.push(`cl_${v}_${f}`);
  for (let i = 1; i <= 3; i++) need.push(`cl_crow_${i}`);
  for (const k of need) {
    ok(ASSET_FILES[k], `${k}: есть в манифесте`);
    ok(Array.isArray(DISPLAY_SIZE[k]) && DISPLAY_SIZE[k].every(n => n > 0), `${k}: задан размер`);
    ok(fs.existsSync(path.join(root, 'public', ASSET_FILES[k].split('?')[0])), `${k}: файл на диске`);
  }
  ok(need.every(k => !TEMPORARY_ART.includes(k) && ASSET_FILES[k].startsWith('assets/city-life/painted-v1/')), 'все 68 кадров живого города заменены рисованной графикой');
}

// ---- реплики жителей помещаются в «пузырёк» (230 px, 20 px шрифт)
ok(['man', 'woman'].every(w => CHAT_LINES[w].length >= 4 && CHAT_LINES[w].every(t => t.length <= 42)), 'реплики жителей короткие, по четыре и больше у каждого');

console.log(`✓ Живой город: маршруты, места появления, лимиты, кадры (${checks} проверок).`);
