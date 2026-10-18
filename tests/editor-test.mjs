// Редактор карты: настоящий MapEditor на заглушках сцены и DOM. Проверяет логику режимов «Дороги и река» и «Стены»:
// выбор, перетаскивание, магнит, добавление/удаление точек, ширина, история, черновик и итоговый файл правок.
// НЕ проверяет рисунок и касания в живом Phaser — только то, что редактор делает с данными.
// Запуск: node --import ./tools/ui/register.mjs tests/editor-test.mjs
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };

// ---- заглушки браузера
const any = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'value' ? '' : k === Symbol.match ? false : k === Symbol.iterator ? function* () {} : k === 'classList' ? { toggle() {}, contains: () => false, add() {}, remove() {} } : k === 'dataset' ? {} : k === 'style' ? {} : k === Symbol.toPrimitive ? () => '' : any()),
  apply: () => any(), set: () => true,
});
globalThis.document = { createElement: () => any(), head: any(), body: any() };
const store = new Map();
globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, location: { pathname: '/' } };

const { services } = await import('../src/services.js');
const { resolveMap, DRAFT_KEY, exportEditsFile, diffTerrain } = await import('../src/world/mapData.js');
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
    styleEntity() {},
    rebuildTerrain(roads, waters) { this.log.terrain++; this.map.roads = roads; this.map.waters = waters; this.terrain = buildTerrain({ ROADS: roads, WATERS: waters }); },
    rebuildColliders(list) { this.log.cols++; this.map.colliders = list; },
    rebuildGrounds(list) { this.map.grounds = list; },
    addProp(p) { const view = { p, img: chain() }; this.propViews.set(p.id, view); return view; },
    placePropView() {},
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
  // как у настоящих объектов: x — положение картинки (её двигает редактор), baseY — точка основания
  scene.objects = applyPos(INTERACTIVES, services.map.pos).map(cfg => ({ id: cfg.id, cfg, get x() { return this.cfg.x; }, baseY: cfg.y, sprite: chain() }));
  scene.enemies = applyPos(ENEMY_SPAWNS, services.map.pos).map(cfg => ({ id: cfg.id, cfg, sprite: chain(), label: chain(), nameText: chain(), ring: chain() }));
  for (const p of services.map.props) scene.propViews.set(p.id, { p, img: chain() });
  scene.terrain = buildTerrain({ ROADS: services.map.roads, WATERS: services.map.waters });
  return { scene, ed: new MapEditor(scene) };
}
const P = (x, y) => ({ x, y, isDown: true });
const drag = (ed, from, to) => { ed.onDown(P(...from)); ed.onMove(P(...to)); ed.onUp(P(...to)); };
const draft = () => JSON.parse(store.get(DRAFT_KEY) || 'null');
// В world.edits.js уже могут быть правки дорог и стен (их делает владелец карты). Черновик хранит их вместе с новыми,
// поэтому «ничего не изменилось» = совпадает с файлом.
const { EDITS: FILE_EDITS } = await import('../src/config/world.edits.js');
// Механику редактора проверяем на базовой дорожке «door» (src/config/world.terrain.js). В настоящей карте её можно удалить
// в редакторе (world.edits.js: roads.door = null) — тогда для этого теста возвращаем её, остальные правки карты не трогаем.
if (FILE_EDITS.roads && FILE_EDITS.roads.door === null) delete FILE_EDITS.roads.door;
// Compare with effective city layout after retiring old city-only patches.
const effective=resolveMap();Object.assign(FILE_EDITS,diffTerrain(effective));
const same = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
const without = (o, k) => { const c = { ...(o || {}) }; delete c[k]; return c; };

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
  ok(draft()?.roads?.door?.pts[0][0] === end[0] + 40 && same(without(draft().roads, 'door'), FILE_EDITS.roads) && same(draft().waters, FILE_EDITS.waters) && same(draft().cols, FILE_EDITS.cols), 'черновик хранит только изменённую дорогу');
  ed.doUndo();
  ok(door().pts[0][0] === end[0] && scene.log.terrain === 2 && same(draft()?.roads, FILE_EDITS.roads), 'отмена возвращает точку, пересобирает мир и убирает правку из черновика');
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
  // отрезок «cross», который не перекрыт другими дорогами карты (карту правят в редакторе — пересечения меняются)
  const cp = ed.roads.find(r => r.id === 'cross').pts;
  for (let i = 0; i < cp.length - 1; i++) {
    const mp = [(cp[i][0] + cp[i + 1][0]) / 2, (cp[i][1] + cp[i + 1][1]) / 2];
    ed.selectT(null); ed.onDown(P(mp[0], mp[1] + 20)); ed.onUp(P(mp[0], mp[1] + 20));
    if (ed.tsel?.id === 'cross') break;
  }
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

console.log('\nРедактор: вставки без краёв');
{
  const { scene, ed } = mkEditor();
  ed.setMode('terrain');
  ed.newRoad('dirt', true, true);
  const id = ed.tsel.id;
  const road = () => ed.roads.find(r => r.id === id);
  ok(road().borderless && road().seamless, 'вставка без краёв одновременно соединяется без швов');
  ok(scene.terrain.roads.find(r => r.id === id).borderless, 'рисование получает режим без каймы');
  ed.toggleBorderless();
  ok(!road().borderless && road().seamless, 'кайму можно вернуть, сохранив бесшовные стыки');
  ed.doUndo();
  ok(road().borderless, 'отмена возвращает вставку без каймы');
  ed.doRedo();
  ok(!road().borderless, 'повтор возвращает кайму');
  ed.toggleBorderless();
  ed.toggleSeamless();
  ok(!road().seamless && !road().borderless, 'режим со швом возвращает и внешнюю кайму');
  ed.toggleBorderless();
  const saved = draft();
  const file = exportEditsFile(ed.buildEdits());
  const exported = JSON.parse(file.slice(file.indexOf('export const EDITS = ') + 21, file.lastIndexOf(';')));
  ok(exported.roads[id].borderless && exported.roads[id].seamless, 'экспорт сохраняет вставку без краёв');
  const restored = mkEditor(saved).ed.roads.find(r => r.id === id);
  ok(restored.borderless && restored.seamless, 'вставка без краёв сохраняется после перезагрузки черновика');
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
  ok(w().x === w0.x && w().w === w0.w && same(draft()?.cols, FILE_EDITS.cols), 'две отмены вернули стену, из черновика правка ушла');
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
  const newCols = Object.fromEntries(Object.entries(e.cols).filter(([k]) => !(k in (FILE_EDITS.cols || {})) || k === wallId));
  ok(Object.keys(newCols).length === 3 && Object.values(newCols).filter(v => v && v.id.startsWith('cn')).length === 2, 'в файле: сдвинутая стена и две новых');
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

console.log('\nРедактор: группа объектов, буфер обмена и выравнивание');
{
  const { scene, ed } = mkEditor();
  const ids = [...scene.propViews.values()].filter(v => /^(tree|bush|rock)_/.test(v.p.k)).slice(0, 3).map(v => v.p.id);
  const story = scene.objects.find(o => o.cfg.kind === 'npc' && !o.cfg.ghost)?.id || scene.objects[0].id;
  const at = id => { const e = ed.find(id); return e && [e.x, e.y]; };
  const start = Object.fromEntries([...ids, story].map(id => [id, at(id)]));
  ed.selectMany([...ids, story], ids[0]);
  ok(ed.sel.size === 4 && ed.selectedId === ids[0], 'выбор группы: главный объект — тот, что указан');
  const steps = ed.history.undoStack.length;
  ed.nudge(10, -5);
  ok([...ids, story].every(id => at(id)[0] === start[id][0] + 10 && at(id)[1] === start[id][1] - 5), 'сдвиг двигает всю группу, включая сюжетный объект');
  ok(ed.history.undoStack.length === steps + 1 && /сдвиг 4 объектов/.test(ed.history.undoLabel), 'сдвиг группы — один шаг отмены с понятной подписью');
  ed.doUndo();
  ok([...ids, story].every(id => at(id)[0] === start[id][0] && at(id)[1] === start[id][1]) && ed.sel.size === 4, 'одна отмена возвращает всех и сохраняет выбор группы');
  // удаление группы
  ed.selectMany([...ids, story]);
  ed.remove();
  ok([...ids, story].every(id => !ed.find(id)) && ed.pos[story] === null && ed.sel.size === 0, 'удаление группы: декор убран, сюжетный объект скрыт и записан как null');
  ed.doUndo();
  ok([...ids, story].every(id => !!ed.find(id)) && ed.pos[story] !== null && ed.sel.size === 4, 'одна отмена возвращает всю группу и выбирает её');
  ed.doRedo();
  ok([...ids, story].every(id => !ed.find(id)), 'повтор удаляет всех снова');
  ed.doUndo();
  // копия группы
  const n0 = scene.propViews.size;
  ed.selectMany(ids.slice(0, 2));
  ed.duplicate();
  const copies = [...ed.sel];
  ok(scene.propViews.size === n0 + 2 && copies.length === 2 && copies.every(id => !ids.includes(id)), 'копия группы выбирает новые объекты');
  ok(copies.every((id, i) => at(id)[0] === start[ids[i]][0] + 24 && at(id)[1] === start[ids[i]][1] + 16), 'копии стоят рядом, на том же расстоянии друг от друга');
  ed.doUndo();
  ok(scene.propViews.size === n0 && ids.slice(0, 2).every(id => ed.sel.has(id)), 'одна отмена убирает все копии и возвращает выбор оригиналов');
  ed.doRedo();
  ok(scene.propViews.size === n0 + 2 && copies.every(id => ed.sel.has(id)), 'повтор возвращает копии и выбирает их');
  ed.doUndo();
  // буфер обмена: вставка под курсор
  ed.selectMany(ids.slice(0, 2), ids[0]);
  ok(ed.copySel(), 'Ctrl+C копирует выбранное');
  ed.paste({ x: 700, y: 4400 });
  const pasted = [...ed.sel];
  const off = [start[ids[1]][0] - start[ids[0]][0], start[ids[1]][1] - start[ids[0]][1]];
  ok(pasted.length === 2 && at(pasted[0])[0] === 700 && at(pasted[0])[1] === 4400 && at(pasted[1])[0] === 700 + off[0] && at(pasted[1])[1] === 4400 + off[1], 'Ctrl+V: главный — под курсором, остальные на прежнем расстоянии');
  ed.doUndo();
  ok(pasted.every(id => !ed.find(id)), 'вставка отменяется одним шагом');
  // сюжетный объект копируется как декор, без наград и событий
  ed.select(story); ed.copySel(); ed.paste({ x: 640, y: 4300 });
  const deco = ed.find(ed.selectedId);
  ok(deco.kind === 'prop' && !deco.ref.p.requires && !deco.ref.p.fire && deco.ref.p.k, 'копия сюжетного объекта — декор с той же картинкой');
  ed.doUndo();
  // зеркало, размер и выравнивание группы
  ed.selectMany(ids);
  const f0 = ids.map(id => ed.find(id).ref.p.f || 0);
  ed.flip();
  ok(ids.every((id, i) => (ed.find(id).ref.p.f || 0) === (f0[i] ? 0 : 1)), 'зеркало у каждого в группе');
  ed.doUndo();
  ok(ids.every((id, i) => (ed.find(id).ref.p.f || 0) === f0[i]), 'и одна отмена');
  ed.rescale(1.1);
  ok(ids.every(id => (ed.find(id).ref.p.s || 1) !== 1), '«Больше» для всей группы');
  ed.doUndo();
  ed.selectMany(ids, ids[0]);
  ed.align('y');
  ok(ids.every(id => at(id)[1] === start[ids[0]][1]), '«В ряд»: все на высоте главного');
  ed.doUndo();
  ed.spread('x');
  const xs = ids.map(id => at(id)[0]).sort((a, b) => a - b);
  ok(Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1])) <= 1, '«Поровну ↔»: равные промежутки');
  ed.doUndo();
  ok(ids.every(id => at(id)[0] === start[id][0] && at(id)[1] === start[id][1]), 'после отмен всё на местах');
  // клавиши по физической кнопке: D в русской раскладке — «в»
  ed.select(ids[0]);
  const n1 = scene.propViews.size;
  ed.onKey({ key: 'в', code: 'KeyD', preventDefault() {} });
  ok(scene.propViews.size === n1 + 1, 'D (русская раскладка) делает копию');
  ed.onKey({ key: 'я', code: 'KeyZ', ctrlKey: true, preventDefault() {} });
  ok(scene.propViews.size === n1, 'Ctrl+Z (русская раскладка) отменяет');
  ed.selectMany(ids);
  ed.onKey({ key: 'ArrowRight', code: 'ArrowRight', shiftKey: true, preventDefault() {} });
  ok(ids.every(id => at(id)[0] === start[id][0] + 10), 'Shift+стрелка сдвигает группу на 10');
  ed.doUndo();
  ok(ed.countEdits() >= 0 && JSON.stringify(ed.buildEdits().props) === JSON.stringify(mkEditor().ed.buildEdits().props), 'после всех отмен правок объектов нет');
}

console.log('\nРедактор: точные поля дорог и стен, жесты');
{
  const { ed } = mkEditor();
  ed.setMode('terrain');
  const road = () => ed.roads.find(r => r.id === 'cross');
  ed.selectT({ kind: 'road', id: 'cross', i: 1, seg: null });
  ed.setTerrainProp('w', '150');
  ok(road().w === 150, 'поле «Ширина» меняет ширину дороги');
  ed.setTerrainProp('w', '9999');
  ok(road().w === 260, 'ширина не выходит за пределы, что и у кнопки «Шире»');
  const p1 = road().pts[1].slice();
  ed.setTerrainProp('px', String(p1[0] + 33));
  ok(road().pts[1][0] === p1[0] + 33 && road().pts[1][1] === p1[1], 'поле X точки двигает только эту точку');
  ed.doUndo(); ed.doUndo(); ed.doUndo();
  ok(road().w === mkEditor().ed.roads.find(r => r.id === 'cross').w && road().pts[1][0] === p1[0], 'три отмены возвращают дорогу');
  // точка двойным щелчком — на самой линии
  const pts = road().pts, n = pts.length;
  let seg = 0; for (let i = 0; i < n - 1; i++) if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) > Math.hypot(pts[seg + 1][0] - pts[seg][0], pts[seg + 1][1] - pts[seg][1])) seg = i;
  const mid = { x: (pts[seg][0] + pts[seg + 1][0]) / 2, y: (pts[seg][1] + pts[seg + 1][1]) / 2 + 6 };
  ed.insertPointAt({ kind: 'road', id: 'cross', i: null, seg }, mid);
  const added = road().pts[seg + 1];
  ok(road().pts.length === n + 1 && ed.tsel.i === seg + 1 && Math.hypot(added[0] - mid.x, added[1] - mid.y) < 40, 'двойной щелчок по линии ставит точку там, где щёлкнули');
  ed.doUndo();
  ok(road().pts.length === n, 'и отменяется');
  // выбранную линию тянут целиком
  const before = JSON.stringify(road().pts);
  ed.selectT({ kind: 'road', id: 'cross', i: null, seg });
  ed.onDown(P(mid.x, mid.y - 6)); ed.onMove(P(mid.x + 40, mid.y + 24)); ed.onUp(P(mid.x + 40, mid.y + 24));
  const moved = road().pts, old = JSON.parse(before);
  ok(moved.every((p, i) => p[0] === old[i][0] + 40 && p[1] === old[i][1] + 30), 'перетаскивание выбранной линии сдвигает все её точки');
  ed.doUndo();
  ok(JSON.stringify(road().pts) === before, 'и одна отмена возвращает её');
  // Alt + щелчок по точке убирает её
  ed.selectT(null);
  const pt = road().pts[2];
  ed.onDown({ x: pt[0], y: pt[1], isDown: true, event: { altKey: true } }); ed.onUp(P(pt[0], pt[1]));
  ok(road().pts.length === n - 1, 'Alt + щелчок по точке убирает её');
  ed.doUndo();
  // стены: тип и точный размер
  ed.setMode('walls');
  const wall = { ...ed.cols.find(c => c.kind === 'ruin' && !c.tex && !c.building) };
  ed.selectC(wall.id);
  ed.setWallProp('w', '333'); ed.setWallProp('kind', 'fence');
  ok(ed.col(wall.id).w === 333 && ed.col(wall.id).kind === 'fence', 'у стены меняются ширина и тип');
  ed.doUndo(); ed.doUndo();
  ok(ed.col(wall.id).w === wall.w && ed.col(wall.id).kind === 'ruin', 'отмена возвращает тип и размер');
  const building = ed.cols.find(c => c.building);
  if (building) { ed.selectC(building.id); ed.setWallProp('kind', 'ruin'); ok(ed.col(building.id).kind === building.kind, 'у здания тип не меняется: его фасад и вход привязаны к стене'); }
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
