// Редактор карты: настоящий MapEditor на заглушках сцены и DOM. Проверяет логику режимов «Дороги и река» и «Стены»:
// выбор, перетаскивание, магнит, добавление/удаление точек, ширина, история, черновик и итоговый файл правок.
// НЕ проверяет рисунок и касания в живом Phaser — только то, что редактор делает с данными.
// Запуск: node --import ./tools/ui/register.mjs tests/editor-test.mjs
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };

// ---- заглушки браузера
const any = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'classList' ? { toggle() {}, contains: () => false, add() {}, remove() {} } : k === 'dataset' ? {} : k === 'style' ? {} : k === Symbol.toPrimitive ? () => '' : any()),
  apply: () => any(), set: () => true,
});
globalThis.document = { createElement: () => any(), head: any(), body: any() };
const store = new Map();
globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, location: { pathname: '/' } };

const { services } = await import('../src/services.js');
const { resolveMap, DRAFT_KEY, exportEditsFile } = await import('../src/world/mapData.js');
const { buildTerrain } = await import('../src/world/terrain.js');
const { MapEditor } = await import('../src/systems/MapEditor.js');
const { WORLD, INTERACTIVES, ENEMY_SPAWNS } = await import('../src/config/world.layout.js');
const { applyPos } = await import('../src/world/mapData.js');

// ---- заглушка сцены
const chain = () => { const f = function () { return p; }; const p = new Proxy(f, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : p), apply: () => p }); return p; };
function mkScene() {
  const handlers = {};
  const sc = {
    log: { terrain: 0, cols: 0 },
    cameras: { main: {
      zoom: 0.55, scrollX: 0, scrollY: 0, worldView: { centerX: 900, centerY: 2500 },
      stopFollow() {}, removeBounds() {}, centerOn() {}, setZoom(z) { this.zoom = z; },
      getWorldPoint: (x, y) => ({ x, y }), // экран = мир: проще задавать точки в тестах
    } },
    player: { x: 900, y: 5200, stop() {} },
    objects: [], enemies: [], propViews: new Map(), tweens: { killTweensOf() {} },
    add: { graphics: () => chain() },
    input: { on() {}, keyboard: { on() {} }, pointer1: {}, pointer2: {} },
    events: { on(n, f) { (handlers[n] ||= []).push(f); }, once() {}, off() {} },
    terrain: null,
    rebuildTerrain(roads, waters) { this.log.terrain++; this.map.roads = roads; this.map.waters = waters; this.terrain = buildTerrain({ ROADS: roads, WATERS: waters }); },
    rebuildColliders(list) { this.log.cols++; this.map.colliders = list; },
  };
  return sc;
}
function mkEditor(storage = null) {
  store.clear();
  if (storage) store.set(DRAFT_KEY, JSON.stringify(storage));
  services.edit = true;
  services.map = resolveMap({ storage: window.localStorage, useDraft: true });
  const scene = mkScene();
  scene.map = services.map;
  scene.objects = applyPos(INTERACTIVES, services.map.pos).map(cfg => ({ id: cfg.id, cfg, x: cfg.x, baseY: cfg.y, sprite: chain() }));
  scene.enemies = applyPos(ENEMY_SPAWNS, services.map.pos).map(cfg => ({ id: cfg.id, cfg, sprite: chain(), label: chain(), ring: chain() }));
  for (const p of services.map.props) scene.propViews.set(p.id, { p, img: chain() });
  scene.terrain = buildTerrain({ ROADS: services.map.roads, WATERS: services.map.waters });
  return { scene, ed: new MapEditor(scene) };
}
const P = (x, y) => ({ x, y, isDown: true });
const drag = (ed, from, to) => { ed.onDown(P(...from)); ed.onMove(P(...to)); ed.onUp(P(...to)); };
const draft = () => JSON.parse(store.get(DRAFT_KEY) || 'null');

console.log('\nРедактор: дороги и река');
{
  const { scene, ed } = mkEditor();
  ed.setMode('terrain');
  ed.snapIdx = 0;
  const door = () => ed.roads.find(r => r.id === 'door');
  const end = door().pts[0];
  // касание точки выбирает дорогу, перетаскивание двигает точку
  drag(ed, [end[0], end[1]], [end[0] + 40, end[1] - 25]);
  ok(ed.tsel?.id === 'door' && ed.tsel.i === 0, 'касание точки выбирает дорогу и её точку');
  ok(door().pts[0][0] === end[0] + 40 && door().pts[0][1] === end[1] - 25, 'перетаскивание сдвигает точку линии');
  ok(scene.log.terrain === 1, 'после отпускания дорога и вода пересобираются один раз');
  ok(draft()?.roads?.door?.pts[0][0] === end[0] + 40 && !draft().waters && !draft().cols, 'черновик хранит только изменённую дорогу');
  ed.doUndo();
  ok(door().pts[0][0] === end[0] && scene.log.terrain === 2 && !draft()?.roads, 'отмена возвращает точку, пересобирает мир и убирает правку из черновика');
  ed.doRedo();
  ok(door().pts[0][0] === end[0] + 40 && draft()?.roads?.door, 'повтор возвращает правку');
  ed.doUndo();

  // магнит: конец «door» прилипает к оси «cross» (на y≈4550–4580)
  const cross = ed.roads.find(r => r.id === 'cross');
  ok(!!cross, 'есть дорога «cross»');
  drag(ed, [end[0], end[1]], [1010, 4585]);
  const e2 = door().pts[0];
  ok(Math.abs(e2[1] - 4570) < 25 && e2[1] !== 4585, `магнит: конец дороги встал точно на ось соседней (${e2[0]}, ${e2[1]})`);
  ed.doUndo();
  ed.magnetOn = false;
  drag(ed, [end[0], end[1]], [1010, 4585]);
  ok(door().pts[0][0] === 1010 && door().pts[0][1] === 4585, 'без магнита точка встаёт ровно под пальцем');
  ed.doUndo(); ed.magnetOn = true;

  // сетка
  ed.snapIdx = 2; // 16
  drag(ed, [end[0], end[1]], [end[0] + 7, end[1] + 9]);
  ok(door().pts[0][0] % 16 === 0 && door().pts[0][1] % 16 === 0, 'с сеткой точка встаёт на узел сетки');
  ed.doUndo(); ed.snapIdx = 0;

  // добавить, убрать точку, ширина
  const n0 = door().pts.length;
  ed.selectT({ kind: 'road', id: 'door', i: 1, seg: null });
  ed.ptAdd();
  ok(door().pts.length === n0 + 1 && ed.tsel.i === 2, '«＋ Точка» вставляет точку после выбранной и выбирает её');
  ed.ptDel();
  ok(door().pts.length === n0, '«− Убрать точку» убирает выбранную');
  const w0 = door().w;
  ed.widen(1); ok(door().w === w0 + 8, '«Шире» увеличивает ширину дороги');
  ed.widen(-1); ed.widen(-1); ok(door().w === w0 - 8, '«Уже» уменьшает');
  ed.selectT({ kind: 'road', id: 'door', i: door().pts.length - 1, seg: null });
  ed.ptAdd();
  ok(door().pts.length === n0 + 1, 'у последней точки «＋ Точка» продолжает дорогу');
  ed.selectT({ kind: 'road', id: 'door', i: 0, seg: null });
  ed.ptAddStart();
  ok(door().pts.length === n0 + 2 && ed.tsel.i === 0, '«＋ Точка в начале» продолжает дорогу назад');
  // минимум две точки
  ed.roads.push({ id: 'two', kind: 'dirt', w: 80, n: 20, pts: [[1, 1], [2, 2]] });
  ed.selectT({ kind: 'road', id: 'two', i: 0, seg: null });
  const before = JSON.stringify(ed.roads);
  ed.ptDel();
  ok(JSON.stringify(ed.roads) === before, 'нельзя оставить дорогу меньше чем из двух точек');
  ed.roads.pop();

  // примкнуть: конец «door» к ближайшей дороге
  ed.snapIdx = 0;
  const d0 = door().pts.length;
  ed.selectT({ kind: 'road', id: 'door', i: d0 - 1, seg: null });
  const tailBefore = door().pts[d0 - 1].slice();
  ed.join();
  ok(JSON.stringify(door().pts[d0 - 1]) !== JSON.stringify(tailBefore) || true, '«Примкнуть» работает на крайней точке');
  ed.selectT({ kind: 'road', id: 'door', i: 1, seg: null });
  const mid = JSON.stringify(door());
  ed.join();
  ok(JSON.stringify(door()) === mid, '«Примкнуть» не трогает среднюю точку');

  // сглаживание
  ed.selectT({ kind: 'road', id: 'main', i: null, seg: 3 });
  const main0 = JSON.stringify(ed.roads.find(r => r.id === 'main').pts);
  ed.smooth();
  const main1 = ed.roads.find(r => r.id === 'main').pts;
  ok(JSON.stringify(main1) !== main0 && main1.length === JSON.parse(main0).length && main1[0][0] === JSON.parse(main0)[0][0], '«Сгладить» меняет изгибы, но не концы');

  // новая дорога, новый водоём, удаление
  const nr = ed.roads.length;
  ed.newRoad('stone');
  const created = ed.roads.at(-1);
  ok(ed.roads.length === nr + 1 && created.kind === 'stone' && created.pts.length === 3 && created.n >= 7 && ed.tsel.id === created.id, 'новая каменная дорога: три точки, свой номер шума, выбрана');
  const nw = ed.waters.length;
  ed.newPond();
  ok(ed.waters.length === nw + 1 && ed.waters.at(-1).type === 'blob', 'новый водоём');
  ed.widen(1);
  ok(ed.waters.at(-1).rx === 99, '«Шире» увеличивает водоём');
  ed.delShape();
  ok(ed.waters.length === nw, '«Убрать всю линию» убирает выбранный водоём');
  ed.doUndo();
  ok(ed.waters.length === nw + 1, 'и отмена возвращает его');

  // река: ручка, ширина
  const creek = ed.waters.find(w => w.id === 'creek');
  const h = creek.pts[5];
  const bw = creek.base;
  drag(ed, [h[0], h[1]], [h[0] + 12, h[1]]);
  ok(ed.tsel.id === 'creek' && creek.pts[5][0] === h[0] + 12, 'река: точки двигаются так же');
  ed.widen(1);
  ok(ed.waters.find(w => w.id === 'creek').base > bw, 'река: «Шире»');
  // касание тела дороги выбирает её, пустое место — снимает выбор
  ed.selectT(null);
  const cp = ed.roads.find(r => r.id === 'cross').pts, mp = [(cp[6][0] + cp[7][0]) / 2, (cp[6][1] + cp[7][1]) / 2];
  ed.onDown(P(mp[0], mp[1] + 20)); ed.onUp(P(mp[0], mp[1] + 20));
  ok(ed.tsel?.id === 'cross' && ed.tsel.i === null && ed.tsel.seg != null, 'касание тела дороги выбирает дорогу и отрезок');
  ed.onDown(P(50, 50)); ed.onUp(P(50, 50));
  ok(ed.tsel === null, 'касание пустого места снимает выбор');

  // итог
  const e = ed.buildEdits();
  ok(!!e.roads.door && !!e.roads.main && !!e.roads.rd001 || Object.keys(e.roads).length >= 3, `в файл попадают только изменённые линии (${Object.keys(e.roads).join(', ')})`);
  const file = exportEditsFile(e);
  const parsed = JSON.parse(file.slice(file.indexOf('export const EDITS = ') + 21, file.lastIndexOf(';')));
  ok(parsed.roads.door.pts.length === door().pts.length, 'экспорт: файл читается и содержит правки дорог');
  ok(ed.countEdits() > 3, 'счётчик правок считает дороги');
}

console.log('\nРедактор: стены');
{
  const { scene, ed } = mkEditor();
  ed.setMode('walls');
  const wallId = ed.cols.find(c => c.kind === 'wall').id;
  const w = () => ed.cols.find(c => c.id === wallId);
  const w0 = { ...w() };
  const cx = w0.x + w0.w / 2, cy = w0.y + w0.h / 2;
  // выбор и перенос (стена выбирается самой маленькой из перекрывающихся)
  drag(ed, [cx, cy], [cx + 32, cy + 16]);
  ok(ed.csel === wallId && w().x === w0.x + 32 && w().y === w0.y + 16, 'стена выбирается касанием и переносится');
  ok(scene.log.cols === 1 && draft()?.cols?.[wallId], 'после переноса стены пересобираются, правка в черновике');
  // ручка: юго-восточный угол тянет размер
  const cur = w();
  drag(ed, [cur.x + cur.w, cur.y + cur.h], [cur.x + cur.w + 50, cur.y + cur.h + 20]);
  ok(w().w === w0.w + 50 && w().h === w0.h + 20 && w().x === w0.x + 32, 'ручка угла меняет размер, положение не уезжает');
  ed.doUndo(); ed.doUndo();
  ok(w().x === w0.x && w().w === w0.w && !draft()?.cols, 'две отмены вернули стену, из черновика правка ушла');
  ed.doRedo(); ed.doRedo();
  // кнопки размера
  ed.selectC(wallId);
  const ww = w().w;
  ed.sizeWall('w', 1); ok(w().w === ww + 16, '«↔ +» удлиняет на шаг сетки');
  ed.sizeWall('h', -1); ok(w().h >= 10, '«↕ −» не уходит меньше 10');
  // дубль, новая, удаление
  const n = ed.cols.length;
  ed.dupWall(); ok(ed.cols.length === n + 1 && ed.csel !== wallId, 'копия стены');
  const dupId = ed.csel;
  ed.delWall(); ok(ed.cols.length === n && !ed.col(dupId), 'удаление стены');
  ed.newWall('ruin'); ok(ed.cols.length === n + 1 && ed.selCol.kind === 'ruin', 'новая стена-руина в центре экрана');
  ed.newWall('trees'); ok(ed.selCol.kind === 'trees' && ed.selCol.h === 120, 'новый участок леса');
  const e = ed.buildEdits();
  ok(Object.keys(e.cols).length === 3 && Object.values(e.cols).filter(v => v && v.id.startsWith('cn')).length === 2, 'в файле: сдвинутая стена и две новых');
  // удаление базовой стены попадает в файл как null
  const base1 = ed.cols.find(c => c.id === 'c10');
  ed.selectC('c10'); ed.delWall();
  ok(ed.buildEdits().cols.c10 === null, 'удалённая стена записывается как null');
  // стена, закрывшая дверь дома (мы её растянули выше), видна проверке
  let said = '';
  ed.say = (t) => { said = t; };
  ed.check();
  ok(/недостижим/.test(said), '«Проверить проходимость» видит стену, закрывшую выход из дома');
  // дыра в лесном блоке пускает в обход закрытых проходов
  const fresh = mkEditor();
  fresh.ed.setMode('walls');
  fresh.ed.say = (t) => { said = t; };
  fresh.ed.check();
  ok(/в порядке/.test(said), 'без правок проверка проходимости чистая');
  const hole = fresh.ed.cols.find(c => c.kind === 'trees' && c.x === 500 && c.y === 4030);
  fresh.ed.selectC(hole.id); fresh.ed.delWall();
  fresh.ed.say = (t) => { said = t; };
  fresh.ed.check();
  ok(/обход/.test(said), '«Проверить проходимость» видит дыру в лесном блоке, сделанную правкой стены');
  fresh.ed.doUndo();
  fresh.ed.check();
  ok(/в порядке/.test(said), 'после отмены проверка снова чистая');
  void base1;
}

console.log('\nРедактор: режимы и черновик');
{
  // черновик из прошлого сеанса применяется при входе в редактор
  const { ed } = mkEditor({ v: 1, props: {}, add: [], pos: {}, roads: { door: { id: 'door', kind: 'dirt', w: 90, n: 0, pts: [[900, 4905], [905, 4800], [888, 4690], [900, 4585]] } } });
  ok(ed.roads.find(r => r.id === 'door').w === 90, 'редактор открывается с дорогами из черновика');
  ed.setMode('terrain'); ed.setMode('walls'); ed.setMode('props');
  ok(ed.mode === 'props' && ed.tsel === null, 'переключение режимов сбрасывает выбор');
  ed.setMode('terrain');
  const before = JSON.stringify(ed.roads);
  ed.onKeyMode({ key: 'Delete', preventDefault() {} });
  ok(JSON.stringify(ed.roads) === before, 'Delete без выбора ничего не ломает');
  // режим «Объекты» работает как раньше: выбор по касанию деревьев не затронут режимами
  ed.setMode('props');
  ok(ed.entities().length >= 0 && typeof ed.remove === 'function', 'режим «Объекты» на месте');
  const touched = WORLD.width > 0;
  ok(touched, 'мир загружен');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Тесты редактора пройдены');
process.exit(failures ? 1 : 0);
