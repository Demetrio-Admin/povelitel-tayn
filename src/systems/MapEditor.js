import { DEPTH, VIEW } from '../config/game.config.js';
import { WORLD, INTERACTIVES, ENEMY_SPAWNS } from '../config/world.layout.js';
import { services } from '../services.js';
import { buildEditorPanel, WALL_KINDS } from '../ui/editorPanel.js';
import { History, pickAt, snapValue, nextId, clamp } from '../world/editorCore.js';
import { applyPos, diffEdits, diffPos, diffTerrain, saveDraft, clearDraft, exportEditsFile, parseEditsFile, resolveMap, countEditDiff } from '../world/mapData.js';
import { linkBuildingPortals } from '../world/buildingGeometry.js';
import { buildRoad, buildWater } from '../world/terrain.js';
import * as TE from '../world/terrainEdit.js';
import { collectSolids, propSolid, baseSolid } from '../world/solids.js';
import { checkWalkability } from '../world/check.js';
import { PROP_DEFS } from '../world/propDefs.js';
import { assetName, assetGroup, ASSET_CATALOG, defaultAssetSolid } from '../world/assetCatalog.js';
import { LOCATIONS, locationAt } from '../config/locations.js';
import { ENEMIES } from '../config/balance.enemies.js';
import { CITY_WITCH_SPRITES } from '../config/city.witch.art.js';

const SNAPS = [0, 8, 16, 32, 64];
const clone = (v) => JSON.parse(JSON.stringify(v));
const cap = (s) => s ? s[0].toLocaleUpperCase('ru') + s.slice(1) : s;
const COL_COLORS = { trees: 0x58c46a, wall: 0xd9a066, citywall: 0xd9a066, fence: 0xd9a066, ruin: 0xb0b4c4, furniture: 0xe8d37a };
const SHAPE_COLORS = { dirt: 0xe8a36a, stone: 0xc9d2e0, river: 0x5cc8ff, canal: 0x5cc8ff, blob: 0x5cc8ff };
const KIND_NAMES = { dirt: 'тропа', stone: 'каменная дорога', river: 'ручей', canal: 'городской канал', blob: 'водоём', trees: 'лес', wall: 'стена дома', citywall:'городская стена', fence:'ограда', ruin: 'руины', furniture: 'мебель' };
const ENTITY_KIND = { prop: 'декор', obj: 'сюжетный объект', enemy: 'враг', col: 'дом, мебель или стена', ground: 'пол или покрытие' };
const FILTER_NAMES = { prop: 'декор', col: 'дома и мебель', obj: 'сюжет и NPC', enemy: 'враги', ground: 'полы' };
const HANDLE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const TOP = DEPTH.markers + 50;
const SELECT_COLOR = 0x4fe3c1;   // как Телекинез: выбранное «держит» магия
const HOVER_COLOR = 0xf1e3c2;
const DRAG_START = 4;            // экранных пикселей до начала переноса — простой клик ничего не сдвигает
const DOUBLE_TAP_MS = 380;

/**
 * MapEditor — режим ?edit. Карта остаётся живой, героиня стоит на месте.
 * Касание выбирает объект, перетаскивание двигает, пустое место — двигает камеру, колесо/щипок — масштаб.
 * На ПК: подсветка под курсором, выбор группы (Shift/Ctrl, рамка с Shift), буфер Ctrl+C/V, кисть, перетаскивание из каталога,
 * контекстное меню, средняя/правая кнопка и пробел двигают карту.
 * Три режима: «Объекты» (деревья, камни…), «Дороги и вода» (точки линий, ширина, стыки) и «Стены» (прямоугольники коллизий).
 * Правки идут в черновик (localStorage) и экспортируются файлом world.edits.js.
 */
export class MapEditor {
  constructor(scene) {
    this.scene = scene;
    this.cam = scene.cameras.main;
    this.history = new History();
    this.snapIdx = 0;
    this.showColliders = false;
    this.selectedId = null;        // главный выбранный объект: его свойства видны справа
    this.sel = new Set();          // все выбранные объекты (группа)
    this.drag = null;
    this.pan = null;
    this.pinch = null;
    this.box = null;
    this.moved = false;
    this.pos = { ...(services.map.pos || {}) };
    this.resetArmed = false;
    this.mode = 'props';
    this.entityFilter = 'all';
    this.locationId = locationAt(scene.player.x, scene.player.y).id;
    // рабочие копии дорог, воды и стен: меняются в редакторе, а сцена получает из них новые копии при каждой правке
    this.roads = clone(services.map.roads);
    this.waters = clone(services.map.waters);
    this.cols = clone(services.map.colliders);
    this.grounds = clone(services.map.grounds || []);
    this.applied = { terrain: this.terrainKey(), cols: JSON.stringify(this.cols), grounds: JSON.stringify(this.grounds) };
    this.tsel = null;     // выбранное в режиме дорог: { kind: 'road'|'water', id, i (точка) | null, seg (отрезок) | null }
    this.csel = null;     // id выбранной стены
    this.tdrag = null;
    this.magnetOn = true;
    this.lastZoom = 0;
    this.ents = null;              // кэш списка объектов: пересобирается после правок
    this.hover = null; this.hoverDirty = false; this.mouse = null; this.tipShown = false;
    this.space = false; this.brush = false; this.clip = null; this.dragKey = null;
    this.ghost = null; this.ghostKey = '';
    this.batchDepth = 0; this.batchDirty = false;
    this.lastTap = null; this.viewSig = ''; this.cursor = '';

    services.mode = 'edit';
    scene.player.stop();
    this.cam.stopFollow();
    this.cam.removeBounds();
    this.cam.resetFX?.();          // сцена начала плавное появление — в редакторе карта видна сразу и без затемнения
    this.cam.setZoom(0.55);
    this.cam.centerOn(scene.player.x, scene.player.y - 200);
    this.viewSize = { cx: scene.player.x, cy: scene.player.y - 200 };
    this.freezeWorld();

    this.gridGfx = scene.add.graphics().setDepth(TOP - 3);
    this.tGfx = scene.add.graphics().setDepth(TOP - 2);
    this.colGfx = scene.add.graphics().setDepth(TOP - 1);
    this.gfx = scene.add.graphics().setDepth(TOP);
    this.hoverGfx = scene.add.graphics().setDepth(TOP + 1);
    this.boxGfx = scene.add.graphics().setDepth(TOP + 2);
    this.locLabels = LOCATIONS.map((l) => {
      const t = scene.add.text?.(l.rect.x + 14, l.rect.y - (l.extraTop || 0) + 10, l.name,
        { fontFamily: 'Philosopher, Georgia, serif', fontSize: '26px', color: '#e7c77c', stroke: '#1d1510', strokeThickness: 5 });
      return t ? t.setOrigin(0).setDepth(TOP - 3).setAlpha(0.9) : null;
    }).filter(Boolean);

    this.panel = buildEditorPanel(this.panelActions());

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.input.on('wheel', this.onWheel, this);
    scene.input.on('gameout', this.onOut, this);
    // Клавиши берём прямо из браузера: очередь клавиатуры Phaser при низкой частоте кадров повторяет старые нажатия
    // (Esc или Ctrl+Z срабатывали дважды).
    const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
    if (win) {
      this.keys = { win, down: (e) => this.onKey(e), up: (e) => this.onKeyUp(e), blur: () => { this.space = false; this.setCursor(''); } };
      win.addEventListener('keydown', this.keys.down); win.addEventListener('keyup', this.keys.up); win.addEventListener('blur', this.keys.blur);
    } else {
      scene.input.keyboard.on('keydown', this.onKey, this);
      scene.input.keyboard.on('keyup', this.onKeyUp, this);
    }
    scene.input.mouse?.disableContextMenu?.();
    scene.events.on('update', this.tick, this);
    scene.scale?.on?.('resize', this.onResize, this);
    this.bindCanvasDrop();
    scene.events.once('shutdown', () => this.destroy());

    this.panel.setMode('props');
    this.panel.setLocation?.(this.locationId);
    this.panel.setSnap?.(this.snap);
    this.panel.setZoom?.(this.cam.zoom);
    this.relayout();
    this.refreshPanel();
    this.refreshInfo();
    this.drawGrid();
    this.updateSaved(true);
    this.say(services.map.fromDraft && this.unsaved ? `Открыт черновик из этого браузера: ${this.unsaved} правок ещё не в файле игры. Справка — «?».`
      : 'Всё, что вы измените, сохранится в этом браузере. Справка — «?».');
  }

  panelActions() {
    const scene = this.scene;
    return {
      undo: () => this.doUndo(), redo: () => this.doRedo(),
      dup: () => this.duplicate(), flip: () => this.flip(), bigger: () => this.rescale(1.1), smaller: () => this.rescale(1 / 1.1),
      delete: () => this.remove(),
      snap: () => this.cycleSnap(), snap_set: (n) => this.setSnap(n), colliders: () => this.toggleColliders(),
      fit: () => this.fit(), hero: () => this.cam.centerOn(scene.player.x, scene.player.y),
      zoom_in: () => this.zoomBy(1.25), zoom_out: () => this.zoomBy(0.8), zoom_reset: () => this.zoomTo(1),
      add: (key, placement) => this.addAsset(key, placement), replace: key => this.replaceTexture(key),
      choose: () => { if (this.brush) this.say(`Кисть ставит «${assetName(this.panel.chosen())}». Esc — закончить.`); },
      brush: () => this.toggleBrush(), drag_asset: key => { this.dragKey = key; if (!key) this.hideGhost(); },
      property: (key, value) => this.setProperty(key, value),
      select_entity: (id, opts = {}) => this.focusEntity(id, opts),
      entity_filter: filter => { this.entityFilter = filter; this.ents = null; this.select(null); this.updateSelectionStatus(); },
      select_shape: key => this.focusShape(key), select_wall: id => this.focusWall(id),
      problem: id => this.focusProblem(id),
      t_prop: (key, value) => this.setTerrainProp(key, value), w_prop: (key, value) => this.setWallProp(key, value),
      align_x: () => this.align('x'), align_y: () => this.align('y'), spread_x: () => this.spread('x'), spread_y: () => this.spread('y'),
      location: id => this.goLocation(id),
      check: () => this.check(),
      import: file => this.importFile(file),
      play: () => this.play(), copy: () => this.copy(), download: () => this.download(),
      reset: () => this.reset(), exit: () => this.exit(),
      layout: () => this.relayout(),
      mode_props: () => this.setMode('props'), mode_terrain: () => this.setMode('terrain'), mode_walls: () => this.setMode('walls'),
      pt_add: () => this.ptAdd(), pt_add_start: () => this.ptAddStart(), pt_del: () => this.ptDel(),
      wider: () => this.widen(1), narrower: () => this.widen(-1), smooth: () => this.smooth(), join: () => this.join(),
      magnet: () => { this.magnetOn = !this.magnetOn; this.refreshPanel(); },
      road_new: () => this.newRoad('dirt'), stone_new: () => this.newRoad('stone'), pond_new: () => this.newPond(), shape_del: () => this.delShape(),
      road_joined: () => this.newRoad('dirt', true), stone_joined: () => this.newRoad('stone', true), seamless: () => this.toggleSeamless(),
      road_borderless: () => this.newRoad('dirt', true, true), stone_borderless: () => this.newRoad('stone', true, true), borderless: () => this.toggleBorderless(),
      wall_add: (kind) => this.newWall(kind), wall_dup: () => this.dupWall(), wall_del: () => this.delWall(),
      w_plus: () => this.sizeWall('w', 1), w_minus: () => this.sizeWall('w', -1), h_plus: () => this.sizeWall('h', 1), h_minus: () => this.sizeWall('h', -1),
    };
  }

  destroy() {
    this.panel.destroy();
    this.scene.events.off('update', this.tick, this);
    this.scene.scale?.off?.('resize', this.onResize, this);
    const d = this.dom;
    if (d) { d.canvas.removeEventListener('dragover', d.over); d.canvas.removeEventListener('drop', d.drop); d.canvas.removeEventListener('dragleave', d.leave); }
    const k = this.keys;
    if (k) { k.win.removeEventListener('keydown', k.down); k.win.removeEventListener('keyup', k.up); k.win.removeEventListener('blur', k.blur); }
  }

  // ------------------------------------------------------------------ мир в режиме правки
  /** Убираем всё, что «живёт» само: качание огонька, подсказки, маркеры. И показываем скрытое событиями. */
  freezeWorld() {
    const s = this.scene;
    for (const o of s.objects) {
      if(o._editorDeleted)continue;
      s.tweens.killTweensOf(o.sprite);
      o.sprite.setVisible(true).setAlpha(o.cfg.ghost ? 0 : 1);
      if (o.baseScale) o.sprite.setScale(o.baseScale.x, o.baseScale.y).setAngle(0);
      for (const g of o.glows || []) g.setVisible(true);
      o.onFreeze?.();
      s.styleEntity(o);
      if(o.cfg.ghost)o.sprite.setAlpha(0); // invisible interaction zones are not white patches on the map
    }
    for (const e of s.enemies) {
      if(e._editorDeleted)continue;
      e.idle?.stop();
      [e.sprite, e.nameText, e.ring].forEach(x => x && x.setVisible(true).setAlpha(1));
      s.styleEntity(e);
    }
  }

  /** Карта занимает свободное место между панелями: после смены раскладки размер холста пересчитывается сразу. */
  relayout() {
    const s = this.scene.scale;
    if (!s?.refresh) return;
    s.getParentBounds?.();
    s.refresh();
  }

  /** Размер холста изменился — центр того, что видно, остаётся на месте. */
  onResize() {
    const v = this.viewSize;
    if (v && Number.isFinite(v.cx)) this.cam.centerOn(v.cx, v.cy);
    this.viewSig = '';
  }

  // ------------------------------------------------------------------ сущности
  propViews() { return [...this.scene.propViews.values()]; }

  entities() {
    if (this.ents) return this.ents;
    const s=this.scene,out=[];
    const sprite=spr=>()=>{
      const b=spr.getBounds?.();
      if(b&&Number.isFinite(b.x))return{x0:b.x,y0:b.y,x1:b.right,y1:b.bottom};
      return{x0:spr.x-spr.displayWidth/2,y0:spr.y-spr.displayHeight,x1:spr.x+spr.displayWidth/2,y1:spr.y};
    };
    for(const v of this.propViews())out.push({id:v.p.id,kind:'prop',ref:v,img:v.img,get x(){return v.p.x;},get y(){return v.p.y;},bounds:sprite(v.img)});
    for(const o of s.objects.filter(o=>!o._editorDeleted&&!o.removed))out.push({id:o.id,kind:'obj',ref:o,img:o.sprite,get x(){return o.x;},get y(){return o.baseY;},bounds:sprite(o.sprite)});
    for(const e of s.enemies.filter(e=>!e._editorDeleted))out.push({id:e.id,kind:'enemy',ref:e,img:e.sprite,get x(){return e.cfg.x;},get y(){return e.cfg.y;},bounds:sprite(e.sprite)});
    for(const c of this.cols){const v=s.colliderViews?.get(c.id);if(v)out.push({id:c.id,kind:'col',ref:c,img:v.img,get x(){return c.x+c.w/2;},get y(){return c.y+c.h;},bounds:sprite(v.img)});}
    for(const g of this.grounds){const v=s.groundViews?.get(g.id);if(v)out.push({id:g.id,kind:'ground',ref:g,img:v.img,get x(){return g.x;},get y(){return g.y;},bounds:sprite(v.img)});}
    this.ents = out;
    this.entIndex = new Map(out.map(e => [e.id, e]));
    return out;
  }

  /** Список меняется (объект добавлен, удалён, стены пересобраны) — кэш и подсветка устарели. */
  invalidate() { this.ents = null; this.entIndex = null; this.hoverDirty = true; }

  pickEntities(){return this.entities().filter(e=>this.entityFilter==='all'?e.kind!=='ground'&&!e.ref.cfg?.ghost:e.kind===this.entityFilter);}
  textureOf(e){return e.kind==='prop'?e.ref.p.k:e.kind==='col'||e.kind==='ground'?e.ref.tex:e.ref.cfg.texture||e.img.texture?.key;}
  styleOf(e){return e.kind==='prop'?e.ref.p:e.kind==='col'?e.ref.editorStyle||{}:e.kind==='ground'?e.ref:e.ref.cfg.editorStyle||{};}
  entityName(e){return `${assetName(this.textureOf(e)||e.id)} · ${e.id}`;}
  plainName(e){return assetName(this.textureOf(e)||e.id);}

  find(id) { if (!this.entIndex) this.entities(); return this.entIndex.get(id) || null; }
  get selected() { return this.selectedId ? this.find(this.selectedId) : null; }
  /** Все выбранные, которые есть на карте; главный — последним, чтобы его правки применялись после остальных. */
  selection() { return [...this.sel].map(id => this.find(id)).filter(Boolean); }

  /** Объект под точкой с учётом фильтра. Дальние объекты отсекаются без расчёта рамки — так подсветка не тормозит. */
  pickNear(x, y, pad = 8 / this.cam.zoom) {
    const near = this.pickEntities().filter((e) => {
      const im = e.img, r = (im?.displayWidth || 0) + (im?.displayHeight || 0) + pad;
      if (!Number.isFinite(r) || !Number.isFinite(im?.x) || !Number.isFinite(im?.y)) return true;
      return Math.abs(im.x - x) <= r && Math.abs(im.y - y) <= r;
    });
    return pickAt(near, x, y, pad);
  }

  moveEntity(e, x, y) {
    if (e.kind === 'prop') {
      const v = e.ref;
      v.p.x = x; v.p.y = y;
      this.scene.placePropView(v);
      this.syncGlow(v);
    } else if(e.kind==='col'||e.kind==='ground'){
      const dx=x-e.x,dy=y-e.y;e.ref.x+=dx;e.ref.y+=dy;e.img.setPosition(e.img.x+dx,e.img.y+dy);
    } else if (e.kind === 'obj') {
      const o = e.ref, dx = x - o.x, dy = y - o.baseY;
      o.cfg.x = x; o.cfg.y = y;
      if (o.cfg.target && o.cfg.kind !== 'room_door') o.cfg.target = { x: o.cfg.target.x + dx, y: o.cfg.target.y + dy };
      if (o.target_position) o.target_position = { ...o.cfg.target };
      o.sprite.setPosition(x, y - (o.cfg.elevated || 0)).setDepth(DEPTH.mainBase + y);
      o.baseY = y;
      for (const g of o.glows || []) g.setPosition(g.x + dx, g.y + dy);
      o.relocate?.(dx, dy);
      this.scene.styleEntity(o);
      if (o.blocker) { o.blocker.setPosition(x, y - o.cfg.collide.h / 2); o.blocker.body.updateFromGameObject(); }
      this.pos[o.id] = { ...(this.pos[o.id] || {}), x, y };
    } else {
      const t = e.ref;
      t.cfg.x = x; t.cfg.y = y;
      t.sprite.setPosition(x, y).setDepth(DEPTH.mainBase + y);
      t.nameText.setPosition(x, y - t.sprite.displayHeight - 14);
      t.ring.setPosition(x, y);
      this.scene.styleEntity(t);
      if (t.blocker) { t.blocker.setPosition(x, y - t.cfg.collide.h / 2); t.blocker.body.updateFromGameObject(); }
      this.pos[t.id] = { ...(this.pos[t.id] || {}), x, y };
    }
  }

  syncGlow(v) {
    if (v.glow) v.glow.setPosition(v.p.x, v.p.y - v.img.displayHeight + 12);
  }

  restyle(v) {this.scene.placePropView(v);this.syncGlow(v);}

  // ------------------------------------------------------------------ ввод
  worldPoint(pointer) { return this.cam.getWorldPoint(pointer.x, pointer.y); }
  mods(pointer) { const ev = pointer?.event || {}; return { shift: !!ev.shiftKey, ctrl: !!(ev.ctrlKey || ev.metaKey), alt: !!ev.altKey }; }
  /** Точка на экране браузера (для подсказки и меню) по указателю Phaser. */
  clientOf(pointer) {
    const ev = pointer?.event, t = ev?.changedTouches?.[0] || ev;
    if (Number.isFinite(t?.clientX)) return { x: t.clientX, y: t.clientY };
    const r = this.scene.game?.canvas?.getBoundingClientRect?.(), s = this.scene.scale;
    return r && s ? { x: r.left + pointer.x * r.width / s.width, y: r.top + pointer.y * r.height / s.height } : { x: 0, y: 0 };
  }
  /** Точка на карте под точкой окна браузера (перетаскивание картинки из каталога). */
  clientToWorld(cx, cy) {
    const canvas = this.scene.game?.canvas, r = canvas?.getBoundingClientRect?.(), s = this.scene.scale;
    if (!r || !s || !r.width) return null;
    return this.cam.getWorldPoint((cx - r.left) * s.width / r.width, (cy - r.top) * s.height / r.height);
  }
  /** Поле в панели держит фокус — снимаем его, чтобы введённое значение применилось, а клавиши снова управляли картой. */
  blurPanel() {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    if (a && a !== document.body && this.panel.root.contains?.(a)) a.blur?.();
  }

  startPan(pointer, onTap = null) {
    this.pan = { sx: pointer.x, sy: pointer.y, camX: this.cam.scrollX, camY: this.cam.scrollY, moved: false, onTap };
    this.drag = null;
  }

  onDown(pointer) {
    const input = this.scene.input;
    if (input.pointer1?.isDown && input.pointer2?.isDown) { this.startPinch(); return; }
    this.blurPanel();
    this.panel.closeFileMenu?.();
    if (this.panel.menuOpen?.()) { this.panel.hideMenu(); this.pan = null; this.drag = null; this.swallow = true; return; }
    this.swallow = false;
    const wp = this.worldPoint(pointer), m = this.mods(pointer), button = pointer.button ?? 0;
    this.moved = false;
    this.hideTip();
    // правая кнопка: тянуть — двигать карту, щёлкнуть — меню; средняя кнопка и пробел — всегда двигать карту
    if (button === 2) { this.startPan(pointer, () => this.openMenu(pointer, wp)); return; }
    if (button === 1 || this.space) { this.startPan(pointer); return; }
    const now = Date.now(), last = this.lastTap;
    const dbl = !!last && now - last.t < DOUBLE_TAP_MS && Math.hypot(pointer.x - last.x, pointer.y - last.y) < 14;
    this.lastTap = dbl ? null : { t: now, x: pointer.x, y: pointer.y };
    if (this.mode === 'terrain') { this.downTerrain(pointer, wp, m, dbl); return; }
    if (this.mode === 'walls') { this.downWalls(pointer, wp, m); return; }
    if (this.brush) { this.stamp(wp); return; }
    const hit = this.pickNear(wp.x, wp.y);
    // Shift: потянуть — рамка (даже поверх деревьев), щёлкнуть — добавить объект к выбору или убрать из него
    if (m.shift) { this.box = { x0: wp.x, y0: wp.y, x1: wp.x, y1: wp.y, base: new Set(this.sel), hit: hit?.id || null, sx: pointer.x, sy: pointer.y, open: false }; return; }
    if (!hit) { this.startPan(pointer, () => { if (!m.ctrl) this.select(null); }); return; }
    if (m.ctrl) { this.toggleSelect(hit.id); return; }   // добавить к выбору или убрать из него, без переноса
    if (!this.sel.has(hit.id)) this.select(hit.id);
    else if (this.selectedId !== hit.id) { this.selectedId = hit.id; this.refreshSelection(); }
    this.startDrag([...this.sel], wp, pointer, m.alt);
    this.pan = null;
  }

  startDrag(ids, wp, pointer, alt = false) {
    const ents = ids.map(id => this.find(id)).filter(Boolean);
    if (!ents.length) return;
    const main = ents.find(e => e.id === this.selectedId) || ents[0];
    this.drag = { ents, from: new Map(ents.map(e => [e.id, { x: e.x, y: e.y }])), sx: wp.x, sy: wp.y, px: main.x, py: main.y,
      dx: 0, dy: 0, alt, copied: false, token: null, screen: { x: pointer.x, y: pointer.y }, started: false };
  }

  onMove(pointer) {
    const input = this.scene.input;
    if (input.pointer1?.isDown && input.pointer2?.isDown) { this.updatePinch(); return; }
    this.pinch = null;
    this.trackMouse(pointer);
    if (!pointer.isDown) {
      if (this.brush || this.dragKey) this.hoverDirty = true;
      return;
    }
    if (this.swallow) return;
    if (this.tdrag) { this.moveT(pointer); return; }
    if (this.box) {
      const b = this.box, wp = this.worldPoint(pointer);
      if (!b.open && Math.hypot(pointer.x - b.sx, pointer.y - b.sy) < DRAG_START) return;
      b.open = true; b.x1 = wp.x; b.y1 = wp.y; this.drawBox(); return;
    }
    if (this.drag) {
      const d = this.drag;
      if (!d.started) {
        if (Math.hypot(pointer.x - d.screen.x, pointer.y - d.screen.y) < DRAG_START && d.screen.x !== undefined && pointer.event) return;
        d.started = true;
        if (d.alt) this.copyForDrag();
      }
      const wp = this.worldPoint(pointer);
      const x = clamp(snapValue(d.px + wp.x - d.sx, this.snap), 0, WORLD.width);
      const y = clamp(snapValue(d.py + wp.y - d.sy, this.snap), -340, WORLD.height + 500);
      const dx = x - d.px, dy = y - d.py;
      if (dx === d.dx && dy === d.dy) return;
      d.dx = dx; d.dy = dy;
      for (const e of d.ents) { const f = d.from.get(e.id); this.moveEntity(e, f.x + dx, f.y + dy); }
      this.moved = true; this.drawSelection(); this.refreshInfo(); if (this.showColliders) this.drawColliders();
      this.setCursor('grabbing');
    } else if (this.pan) {
      const dx = pointer.x - this.pan.sx, dy = pointer.y - this.pan.sy;
      if (Math.hypot(dx, dy) > 5) { this.pan.moved = true; this.setCursor('grabbing'); }
      if (!this.pan.moved) return;
      this.cam.scrollX = this.pan.camX - dx / this.cam.zoom;
      this.cam.scrollY = this.pan.camY - dy / this.cam.zoom;
    }
  }

  /** Alt + перетаскивание: тянем копии, оригиналы остаются на месте. Копия и перенос отменяются одним шагом. */
  copyForDrag() {
    const d = this.drag;
    d.token = this.history.begin();
    this.batchDepth++;
    const copies = d.ents.map(e => this.placeData(this.cloneData(e), e.x, e.y)).filter(Boolean);
    this.batchDepth--;
    this.invalidate();
    const ents = copies.map(id => this.find(id)).filter(Boolean);
    if (!ents.length) return;
    d.ents = ents; d.from = new Map(ents.map(e => [e.id, { x: e.x, y: e.y }]));
    this.selectMany(copies, copies[copies.length - 1]);
    d.copied = true;
  }

  onUp(pointer) {
    const input = this.scene.input;
    if (this.pinch && !(input.pointer1?.isDown && input.pointer2?.isDown)) this.pinch = null;
    if (this.swallow) { this.swallow = false; return; }
    if (this.tdrag) { this.finishT(); return; }
    if (this.box) { this.finishBox(); return; }
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      this.setCursor('');
      if (d.dx || d.dy) {
        const from = d.from, to = new Map([...from].map(([id, f]) => [id, { x: f.x + d.dx, y: f.y + d.dy }]));
        const n = from.size;
        this.history.push({ label: n > 1 ? `перенос ${n} объектов` : `перенос «${this.plainName(d.ents[0])}»`, undo: () => this.applyMoves(from), redo: () => this.applyMoves(to) });
      }
      if (d.token) this.history.end(d.token, `копия ${d.ents.length > 1 ? d.ents.length + ' объектов' : '«' + this.plainName(d.ents[0]) + '»'}`, { undo: () => this.select(null), redo: () => this.selectMany(d.ents.map(e => e.id)) });
      if (d.dx || d.dy || d.copied) { this.applyLive(); this.changed(); }
    } else if (this.pan) {
      const p = this.pan;
      this.pan = null;
      this.setCursor('');
      if (!p.moved) { if (p.onTap) p.onTap(); else if (pointer?.button !== 2 && pointer?.button !== 1 && !this.space) this.select(null); } // короткое касание: выбор того, что под пальцем, или снятие выбора
    }
    this.hoverDirty = true;
  }

  onOut() { this.mouse = null; this.hideTip(); this.hoverGfx.clear(); this.hover = null; this.hideGhost(); this.panel.setCursor?.(''); }

  trackMouse(pointer) {
    if (pointer.wasTouch) { this.mouse = null; return; }
    const wp = this.worldPoint(pointer), c = this.clientOf(pointer);
    this.mouse = { sx: pointer.x, sy: pointer.y, wx: wp.x, wy: wp.y, cx: c.x, cy: c.y };
    this.hoverDirty = true;
  }

  onWheel(pointer, objs, dx, dy) {
    const ev = pointer?.event || {};
    const unit = ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 400 : 1;
    const ddx = (dx || 0) * unit, ddy = (dy || 0) * unit;
    this.panel.hideMenu?.();
    // горизонтальная прокрутка (тачпад, Shift + колесо) двигает карту; обычное колесо и щипок тачпада меняют масштаб
    if (!ev.ctrlKey && Math.abs(ddx) > Math.abs(ddy)) { this.cam.scrollX += ddx / this.cam.zoom; return; }
    const step = ev.ctrlKey ? clamp(ddy, -60, 60) * 0.01 : clamp(ddy, -240, 240) * 0.0016;
    this.zoomAt(pointer.x, pointer.y, ddy ? Math.exp(-step) : 1);
  }

  zoomAt(px, py, factor) {
    const cam = this.cam;
    const before = cam.getWorldPoint(px, py);
    cam.setZoom(clamp(cam.zoom * factor, 0.04, 2.6));
    const after = cam.getWorldPoint(px, py);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  /** Масштаб относительно центра видимой карты (кнопки и клавиши). */
  zoomBy(factor) { this.zoomAt((this.cam.width || VIEW.width) / 2, (this.cam.height || VIEW.height) / 2, factor); }
  zoomTo(z) { this.zoomBy(z / this.cam.zoom); }

  startPinch() {
    const { pointer1: a, pointer2: b } = this.scene.input;
    this.drag = null; this.pan = null; this.box = null; this.boxGfx.clear();
    this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  updatePinch() {
    const { pointer1: a, pointer2: b } = this.scene.input;
    if (!this.pinch) { this.startPinch(); return; }
    const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (this.pinch.dist > 8) this.zoomAt(mx, my, dist / this.pinch.dist);
    this.cam.scrollX -= (mx - this.pinch.mx) / this.cam.zoom;
    this.cam.scrollY -= (my - this.pinch.my) / this.cam.zoom;
    this.pinch = { dist, mx, my };
  }

  onKeyUp(e) {
    if (e.code === 'Space' || e.key === ' ') { this.space = false; if (!this.pan) this.setCursor(''); this.hoverDirty = true; }
  }

  onKey(e) {
    if(/^(INPUT|SELECT|TEXTAREA)$/.test((typeof document !== 'undefined' && document.activeElement?.tagName)||''))return;
    const k = e.key || '', code = e.code || '';
    const ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey;
    const stop = () => e.preventDefault?.();
    // буквы по физической клавише: горячие клавиши работают и в русской раскладке
    const letter = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : k.length === 1 ? k.toLowerCase() : '';
    const digit = /^Digit\d$/.test(code) ? code.slice(5) : /^\d$/.test(k) ? k : '';
    if (this.panel.helpOpen?.()) { if (k === 'Escape' || k === '?' || code === 'F1') { stop(); this.panel.toggleHelp(false); } return; }
    if (k === '?' || code === 'F1') { stop(); this.panel.toggleHelp(true); return; }
    if (code === 'Space' || k === ' ') { stop(); if (!this.space) { this.space = true; this.setCursor('grab'); } return; }
    if (ctrl) {
      if (letter === 'z') { stop(); (shift ? this.doRedo() : this.doUndo()); return; }
      if (letter === 'y') { stop(); this.doRedo(); return; }
      if (letter === 's') { stop(); if (shift) this.download(); else this.say(`Черновик сохраняется сам после каждой правки. Чтобы правки попали в игру — Ctrl+Shift+S (скачать world.edits.js).`); return; }
      if (digit === '0') { stop(); this.fit(); return; }
      if (digit === '1') { stop(); this.zoomTo(1); return; }
      if (code === 'Equal' || code === 'NumpadAdd' || k === '+' || k === '=') { stop(); this.zoomBy(1.25); return; }
      if (code === 'Minus' || code === 'NumpadSubtract' || k === '-') { stop(); this.zoomBy(0.8); return; }
      if (this.mode === 'props') {
        if (letter === 'c') { stop(); this.copySel(); return; }
        if (letter === 'x') { stop(); this.cutSel(); return; }
        if (letter === 'v') { stop(); this.paste(); return; }
        if (letter === 'd') { stop(); this.duplicate(); return; }
        if (letter === 'a') { stop(); this.selectAll(); return; }
      }
      if (this.mode === 'walls' && letter === 'd') { stop(); this.dupWall(); return; }
      return;
    }
    if (k === 'Escape') {
      if (this.brush) { this.toggleBrush(false); return; }
      if (this.panel.menuOpen?.()) { this.panel.hideMenu(); return; }
      if (this.panel.closeFileMenu?.()) return;
      if (this.box) { this.box = null; this.boxGfx.clear(); return; }
    }
    if (code === 'Tab' || k === 'Tab') { if (this.panel.isDesktop?.()) { stop(); this.panel.root.querySelector('[data-a=min]')?.click?.(); } return; }
    if (digit && !shift) { const m = { 1: 'props', 2: 'terrain', 3: 'walls' }[digit]; if (m) { this.setMode(m); return; } }
    if (letter === 'g') { this.cycleSnap(); return; }
    if (letter === 'c') { this.toggleColliders(); return; }
    if (this.mode !== 'props') { if (this.onKeyMode(e)) return; }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const hasSel = this.mode === 'props' ? this.sel.size > 0 : this.mode === 'terrain' ? this.tsel?.i != null || this.selShape?.cx != null : !!this.selCol;
    if (dirs[k]) {
      stop();
      if (this.mode === 'props' && hasSel) { const step = shift ? 10 : 1; this.nudge(dirs[k][0] * step, dirs[k][1] * step); }
      else if (!hasSel) this.panBy(dirs[k][0], dirs[k][1], shift);
      return;
    }
    // W A S D двигают карту; D с выбранным объектом — копия
    const pan = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] }[letter];
    if (pan && !(letter === 'd' && this.mode === 'props' && this.sel.size)) { this.panBy(pan[0], pan[1], shift); return; }
    if (this.mode !== 'props') return;
    if (k === 'Delete' || k === 'Backspace') { stop(); this.remove(); return; }
    if (k === 'Escape') { this.select(null); return; }
    if (letter === 'd') { this.duplicate(); return; }
    if (letter === 'f') { this.flip(); return; }
    if (letter === 'b') { this.toggleBrush(); return; }
    if (letter === 'r') { this.rotate(shift ? -15 : 15); return; }
    if (code === 'Equal' || code === 'NumpadAdd' || k === '+' || k === '=') { if (this.sel.size) this.rescale(1.1); else this.zoomBy(1.25); return; }
    if (code === 'Minus' || code === 'NumpadSubtract' || k === '-' || k === '_') { if (this.sel.size) this.rescale(1 / 1.1); else this.zoomBy(0.8); return; }
  }

  panBy(dx, dy, fast = false) {
    const step = (fast ? 320 : 80) / this.cam.zoom;
    this.cam.scrollX += dx * step; this.cam.scrollY += dy * step;
  }

  /** Сдвиг всех выбранных (стрелки и поля X/Y). */
  nudge(dx, dy) {
    const ents = this.selection();
    if (!ents.length || (!dx && !dy)) return;
    const from = new Map(ents.map(e => [e.id, { x: e.x, y: e.y }]));
    const to = new Map(ents.map(e => [e.id, { x: e.x + dx, y: e.y + dy }]));
    for (const e of ents) this.moveEntity(e, e.x + dx, e.y + dy);
    this.history.push({ label: ents.length > 1 ? `сдвиг ${ents.length} объектов` : `сдвиг «${this.plainName(ents[0])}»`, undo: () => this.applyMoves(from), redo: () => this.applyMoves(to) });
    this.applyLive(); this.drawSelection(); this.refreshInfo(); this.changed();
  }

  applyMove(id, x, y) { this.applyMoves(new Map([[id, { x, y }]])); }

  /** Ставит объекты на места (отмена и повтор переноса) и выбирает их. */
  applyMoves(map) {
    for (const [id, p] of map) { const e = this.find(id); if (e) this.moveEntity(e, p.x, p.y); }
    this.applyLive();
    this.selectMany([...map.keys()].filter(id => this.find(id)));
    if (this.showColliders) this.drawColliders();
    this.changed(false);
  }

  // ------------------------------------------------------------------ выбор
  get snap() { return SNAPS[this.snapIdx]; }

  select(id) {
    this.selectedId = id || null;
    this.sel = new Set(id ? [id] : []);
    this.refreshSelection();
  }

  /** Выбрать несколько; primary — тот, чьи свойства показывать (по умолчанию последний). */
  selectMany(ids, primary = ids[ids.length - 1]) {
    this.sel = new Set(ids);
    this.selectedId = ids.length ? (this.sel.has(primary) ? primary : ids[ids.length - 1]) : null;
    this.refreshSelection();
  }

  toggleSelect(id) {
    const next = new Set(this.sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    const ids = [...next];
    this.selectMany(ids, next.has(id) ? id : ids[ids.length - 1]);
  }

  refreshSelection() {
    this.drawSelection();
    this.refreshInfo();
    this.refreshPanel();
    if (this.panel.isDesktop?.()) this.panel.reveal?.();   // на телефоне шторка не прыгает к списку
    this.hoverDirty = true;
  }

  /** Выбрать в списке: объект показывается на карте; Shift/Ctrl — добавить к выбору. */
  focusEntity(id, { add = false } = {}) {
    const e = this.find(id);
    if (!e) { this.say(`Объекта «${id}» на карте нет: возможно, он удалён.`, true); return; }
    if (add) this.toggleSelect(id); else this.select(id);
    this.locationId = locationAt(e.x, e.y).id; this.panel.setLocation?.(this.locationId);
    this.cam.centerOn(e.x, e.y - Math.min(160, (Number(e.img?.displayHeight) || 0) / 2));
  }

  selectAll() {
    const loc = LOCATIONS.find(l => l.id === this.locationId);
    const list = this.pickEntities().filter(e => !loc || locationAt(e.x, e.y).id === loc.id);
    if (!list.length) { this.say('Здесь нечего выбирать с этим фильтром.', true); return; }
    this.selectMany(list.map(e => e.id), this.selectedId);
    this.say(`Выбрано ${list.length} в локации «${loc?.name || 'все локации'}». Тяните любой из них, чтобы двигать всех.`);
  }

  /** Все объекты с той же картинкой в этой локации. */
  selectSame() {
    const e = this.selected; if (!e) return;
    const key = this.textureOf(e), loc = locationAt(e.x, e.y).id;
    const list = this.pickEntities().filter(x => this.textureOf(x) === key && locationAt(x.x, x.y).id === loc);
    this.selectMany(list.map(x => x.id), e.id);
    this.say(`Выбрано ${list.length}: «${assetName(key)}» в этой локации.`);
  }

  finishBox() {
    const b = this.box; this.box = null; this.boxGfx.clear();
    if (!b.open) { if (b.hit) this.toggleSelect(b.hit); return; }   // Shift + щелчок без рамки
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const hit = this.pickEntities().filter(e => e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1).map(e => e.id);
    this.selectMany([...new Set([...b.base, ...hit])]);
    if (hit.length) this.say(`В рамке ${hit.length}. Тяните любой из выбранных, чтобы двигать всех; Delete — удалить.`);
  }

  // ------------------------------------------------------------------ действия
  /** Несколько правок одним шагом отмены; черновик сохраняется один раз в конце. */
  batch(label, fn, after = {}) {
    const token = this.history.begin();
    this.batchDepth++;
    let out;
    try { out = fn(); }
    finally {
      this.batchDepth--;
      this.history.end(token, label, after);
    }
    if (!this.batchDepth && this.batchDirty) { this.batchDirty = false; this.changed(); }
    return out;
  }

  takenIds() { return new Set([...services.map.base.map(p=>p.id),...this.propViews().map(x=>x.p.id)]); }

  addProp(key) {
    const v = this.cam.worldView;
    const p = { id: nextId(this.takenIds()), k: key, x: Math.round(snapValue(v.centerX, this.snap)), y: Math.round(snapValue(v.centerY + 40, this.snap)) };
    this.createProp(p, true);
  }

  /** Новый объект на карте; запись в историю — добавление. */
  spawnProp(p) { this.scene.addProp(clone(p)); this.invalidate(); }

  createProp(p, select = false) {
    this.spawnProp(p);
    if(select&&this.entityFilter!=='all'&&this.entityFilter!=='prop'){this.entityFilter='prop';this.ents=null;}
    const id = p.id;
    this.history.push({
      label: `добавление «${assetName(p.k)}»`,
      undo: () => { this.destroyProp(id); this.select(null); },
      redo: () => { this.spawnProp(p); this.select(id); },
    });
    if (select) this.select(id);
    this.changed();
  }

  destroyProp(id) {
    const v = this.scene.propViews.get(id);
    if (!v) return;
    v.img.destroy(); v.glow?.destroy(); v.blocker?.destroy();for(const effect of v.effects||[])effect.destroy();
    this.scene.propViews.delete(id);
    this.invalidate();
  }

  /** Поставить картинку из каталога: в центр карты или в точку at (кисть, перетаскивание). */
  addAsset(key,placement='prop',at=null) {
    if(!ASSET_CATALOG.some(a=>a.key===key)){this.say('Рисунок отсутствует в каталоге',true);return null;}
    const v=this.cam.worldView,cx=at?at.x:v.centerX,cy=at?at.y:v.centerY+40;
    this.panel.notePlaced?.(key);
    if(placement==='ground'){
      const id=nextId(new Set(this.grounds.map(g=>g.id)),'gr');
      const gx=Math.round(snapValue(cx-128,this.snap)),gy=Math.round(snapValue((at?cy:v.centerY)-128,this.snap));
      this.mutate(()=>{this.grounds.push({id,tex:key,x:gx,y:gy,w:256,h:256,interior:true});},`пол «${assetName(key)}»`);
      if(this.entityFilter!=='ground'){this.entityFilter='ground';this.ents=null;}
      this.select(id);return id;
    }
    const p={id:nextId(this.takenIds()),k:key,x:Math.round(snapValue(cx,this.snap)),y:Math.round(snapValue(cy,this.snap))};
    if(!PROP_DEFS[key]&&['furniture','town'].includes(assetGroup(key))){
      const size=ASSET_CATALOG.find(a=>a.key===key).size;
      p.solid={w:Math.max(12,Math.round(size[0]*0.8)),h:Math.max(8,Math.min(35,Math.round(size[1]*0.18)))};
    }
    if(at?.vary){if(Math.random()<0.5)p.f=1;const s=Math.round((0.9+Math.random()*0.2)*100)/100;if(Math.abs(s-1)>0.005)p.s=s;}
    this.createProp(p,true);
    return p.id;
  }

  /** Данные выбранного объекта для копирования. Сюжетный объект или враг копируется как декор с той же картинкой. */
  cloneData(e) {
    if (e.kind === 'prop') return { kind: 'prop', data: clone(e.ref.p), x: e.x, y: e.y };
    if (e.kind === 'col' || e.kind === 'ground') { const d = clone(e.ref); delete d.building; return { kind: e.kind, data: d, x: e.x, y: e.y }; }
    const data = { k: this.textureOf(e), ...clone(this.styleOf(e)), solid: clone(e.ref.cfg.collide || null) };
    delete data.texture;
    return { kind: 'prop', data, x: e.x, y: e.y };
  }

  /** Ставит скопированное в точку (x, y) — опорную точку объекта. Возвращает id нового. */
  placeData(it, x, y) {
    if (it.kind === 'prop') {
      const p = { ...clone(it.data), id: nextId(this.takenIds()), x: Math.round(x), y: Math.round(y) };
      // копия картинки персонажа или монстра — только декор, без повторных наград и событий
      delete p.requires; delete p.fire;
      this.createProp(p, false);
      return p.id;
    }
    const list = it.kind === 'col' ? this.cols : this.grounds;
    const id = nextId(new Set(list.map(v => v.id)), it.kind === 'col' ? 'cw' : 'gr');
    const d = { ...clone(it.data), id };
    if (it.kind === 'col') { d.x = Math.round(x - d.w / 2); d.y = Math.round(y - d.h); } else { d.x = Math.round(x); d.y = Math.round(y); }
    this.mutate(() => { list.push(d); }, 'копия');
    return id;
  }

  duplicate() {
    const ents = this.selection();
    if (!ents.length) return;
    const g = this.snap || 8, from = ents.map(e => e.id);
    let ids = [];
    this.batch(ents.length > 1 ? `копия ${ents.length} объектов` : `копия «${this.plainName(ents[0])}»`,
      () => { ids = ents.map(e => this.placeData(this.cloneData(e), e.x + g * 3, e.y + g * 2)).filter(Boolean); },
      { undo: () => this.selectMany(from.filter(id => this.find(id))), redo: () => this.selectMany(ids) });
    this.invalidate();
    this.selectMany(ids);
  }

  copySel() {
    const ents = this.selection();
    if (!ents.length) { this.say('Сначала выберите, что копировать.', true); return false; }
    const main = this.selected || ents[0];
    this.clip = { items: ents.map(e => this.cloneData(e)), ax: main.x, ay: main.y };
    this.say(`Скопировано: ${ents.length}. Ctrl+V — вставить под курсор.`);
    return true;
  }

  cutSel() { if (this.copySel()) { const n = this.clip.items.length; this.remove(); this.say(`Вырезано: ${n}. Ctrl+V — вставить под курсор.`); } }

  /** Вставка: опорная точка главного скопированного встаёт под курсор (или в центр карты), остальные — рядом, как были. */
  paste(at = null) {
    const c = this.clip;
    if (!c) { this.say('Буфер пуст: сначала выберите объекты и нажмите Ctrl+C.', true); return; }
    const v = this.cam.worldView, target = at || (this.mouse ? { x: this.mouse.wx, y: this.mouse.wy } : { x: v.centerX, y: v.centerY });
    const dx = snapValue(target.x, this.snap) - c.ax, dy = snapValue(target.y, this.snap) - c.ay;
    let ids = [];
    this.batch(`вставка ${c.items.length > 1 ? c.items.length + ' объектов' : ''}`.trim(),
      () => { ids = c.items.map(it => this.placeData(it, it.x + dx, it.y + dy)).filter(Boolean); },
      { undo: () => this.select(null), redo: () => this.selectMany(ids) });
    this.invalidate();
    this.selectMany(ids);
    this.say(`Вставлено: ${ids.length}.`);
  }

  hideEntity(e,hidden) {
    const o=e.ref;o._editorDeleted=hidden;
    for(const key of ['sprite','nameText','badge','shadow','ring'])o[key]?.setVisible(!hidden);
    for(const g of o.glows||[])g.setVisible(!hidden);
    if(o.blocker?.body)o.blocker.body.enable=!hidden;
    const mk=this.scene.interaction?.markers.get(o);mk?.m.setVisible(false);mk?.glow.setVisible(false);
    this.invalidate();
  }

  /** Удаление одного объекта со своей записью в истории. */
  removeEntity(e) {
    if(e.kind==='col'||e.kind==='ground'){
      this.mutate(()=>{const list=e.kind==='col'?this.cols:this.grounds;const i=list.findIndex(v=>v.id===e.id);if(i<0)return false;list.splice(i,1);},`удаление «${this.plainName(e)}»`);return;
    }
    if(e.kind==='prop'){
      const p=clone(e.ref.p);this.destroyProp(p.id);
      this.history.push({label:`удаление «${assetName(p.k)}»`,undo:()=>{this.spawnProp(p);this.select(p.id);},redo:()=>{this.destroyProp(p.id);this.select(null);}});
    }else{
      const before=this.pos[e.id]===undefined?undefined:clone(this.pos[e.id]);
      const ent=e;
      const set=hidden=>{this.hideEntity(ent,hidden);if(hidden)this.pos[ent.id]=null;else if(before===undefined)delete this.pos[ent.id];else this.pos[ent.id]=clone(before);this.select(hidden?null:ent.id);};
      set(true);this.history.push({label:`удаление «${this.plainName(e)}»`,undo:()=>set(false),redo:()=>set(true)});
    }
    this.changed();
  }

  remove() {
    const ents=this.selection();if(!ents.length)return;
    const ids=ents.map(e=>e.id);
    if(ents.length===1){this.removeEntity(ents[0]);this.select(null);return;}
    this.batch(`удаление ${ents.length} объектов`,()=>{for(const e of ents)this.removeEntity(e);},
      {undo:()=>this.selectMany(ids.filter(id=>this.find(id))),redo:()=>this.select(null)});
    this.select(null);
    this.say(`Удалено: ${ents.length}. Ctrl+Z вернёт.`);
  }

  /** Правка данных одного объекта (свойства, картинка) с записью в историю. */
  editEntity(e, change, reselect = true) {
    const before=clone(e.kind==='prop'?e.ref.p:e.kind==='col'||e.kind==='ground'?e.ref:e.ref.cfg);
    const after=clone(before);change(after,e);
    if(JSON.stringify(before)===JSON.stringify(after))return false;
    const id=e.id,kind=e.kind;
    const set=data=>{
      const cur=this.find(id);
      if(kind==='prop'){const v=this.scene.propViews.get(id);if(v){v.p=clone(data);this.restyle(v);}}
      else if(kind==='col'||kind==='ground'){
        const list=kind==='col'?this.cols:this.grounds;const i=list.findIndex(v=>v.id===id);if(i>=0)list[i]=clone(data);this.applyLive();
      }else if(cur){
        const o=cur.ref;
        this.moveEntity(cur,data.x,data.y);o.cfg=clone(data);o.sprite.setTexture(data.texture||ENEMIES[data.enemy]?.texture||'fx_dot');
        o.relocate?.(0,0);this.scene.styleEntity(o,true);
        this.pos[id]={x:data.x,y:data.y,...(data.texture?{texture:data.texture}:{}),editorStyle:clone(data.editorStyle||{})};
      }
      this.invalidate();
      if(reselect&&!this.batchDepth)this.select(id);
    };
    set(after);this.history.push({label:`свойства «${this.plainName(e)}»`,undo:()=>set(before),redo:()=>set(after)});this.changed();
    return true;
  }

  /** То же для всех выбранных — одним шагом отмены; выбор группы сохраняется. */
  editSelected(change, label = 'свойства') {
    const ents=this.selection();if(!ents.length)return;
    if(ents.length===1){this.editEntity(ents[0],change);return;}
    const ids=ents.map(e=>e.id),main=this.selectedId;
    this.batch(`${label}: ${ents.length} объектов`,()=>{for(const e of ents)this.editEntity(e,change,false);},
      {undo:()=>this.selectMany(ids,main),redo:()=>this.selectMany(ids,main)});
    this.selectMany(ids,main);
  }

  replaceTexture(key) {
    if(!ASSET_CATALOG.some(a=>a.key===key))return;
    this.editSelected((data,e)=>{
      if(e.kind==='prop'){data.k=key;delete data.w;delete data.h;}
      else if(e.kind==='col'||e.kind==='ground')data.tex=key;
      else{data.texture=key;(data.editorStyle||={}).texture=key;}
    },'замена рисунка');
    this.panel.notePlaced?.(key);
  }

  setProperty(key,value) {
    if(['x','y'].includes(key)){
      // X и Y — у главного выбранного; остальные выбранные едут вместе с ним
      const e=this.selected;if(!e||!Number.isFinite(Number(value)))return;
      this.nudge(key==='x'?Number(value)-e.x:0,key==='y'?Number(value)-e.y:0);return;
    }
    this.editSelected((data,e)=>{
      const st=e.kind==='prop'||e.kind==='ground'?data:(data.editorStyle||={});
      const n=Number(value);
      if(['s','w','h','a','alpha','tileScale'].includes(key)){
        if(!Number.isFinite(n))return;
        if(key==='tileScale'&&e.kind!=='ground')return;
        if(e.kind==='col'&&e.ref.kind!=='furniture')return;
        if(key==='s'&&e.kind==='ground')return;
        const nativeScale=e.kind==='obj'||e.kind==='enemy'?data.scale||1:1;
        st[key]=key==='s'?clamp(n,0.05,10):key==='alpha'?clamp(n,0,1):key==='a'?n%360:key==='tileScale'?clamp(n,0.05,8):clamp(n,1,8000)/((st.s||1)*nativeScale);
        if(e.kind==='ground'&&(key==='w'||key==='h'))st[key]=Math.round(clamp(n,1,8000));
      }else if(key==='f')st.f=!!value?1:0;
      else if(key==='l'){if(e.kind==='col'&&e.ref.kind!=='furniture')return;st.l=value;}
      else if(key==='collision'){
        if(e.kind!=='prop')return;
        if(value==='none')data.solid=null;
        else if(value==='auto'){data.solid='auto';data.fill=0;}
        else{data.solid=clone(defaultAssetSolid(data.k)||{w:40,h:20});data.fill=0;}
      }else if(key==='solid_w'||key==='solid_h'){
        if(!Number.isFinite(n))return;
        if(e.kind==='prop'){data.fill=0;data.solid=clone(typeof data.solid==='object'&&data.solid?data.solid:defaultAssetSolid(data.k)||{w:40,h:20});data.solid[key==='solid_w'?'w':'h']=clamp(n,1,8000);}
        else if(e.kind==='col')data[key==='solid_w'?'w':'h']=clamp(n,1,8000);
      }
    },{f:'зеркало',l:'слой',collision:'проход',s:'масштаб',a:'поворот',alpha:'прозрачность'}[key]||'свойства');
  }
  flip(){
    const ents=this.selection();if(!ents.length)return;
    this.editSelected((data,e)=>{const st=e.kind==='prop'||e.kind==='ground'?data:(data.editorStyle||={});st.f=st.f?0:1;},'зеркало');
  }
  rescale(factor){
    const ents=this.selection();if(!ents.length)return;
    this.editSelected((data,e)=>{
      if(e.kind==='ground'){data.w=Math.round(data.w*factor);data.h=Math.round(data.h*factor);return;}
      if(e.kind==='col'&&e.ref.kind!=='furniture')return;
      const st=e.kind==='prop'?data:(data.editorStyle||={});
      st.s=clamp(Math.round((st.s||1)*factor*100)/100,0.05,10);
    },factor>1?'больше':'меньше');
  }
  rotate(deg){
    if(!this.sel.size)return;
    this.editSelected((data,e)=>{
      if(e.kind==='ground'||(e.kind==='col'&&e.ref.kind!=='furniture'))return;
      const st=e.kind==='prop'?data:(data.editorStyle||={});
      st.a=((Number(st.a)||0)+deg)%360;
    },'поворот');
  }

  /** Выровнять опорные точки выбранных: на одну линию по главному объекту. */
  align(axis) {
    const ents = this.selection(); if (ents.length < 2) return;
    const main = this.selected || ents[0], v = axis === 'x' ? main.x : main.y;
    this.moveGroup(ents, e => axis === 'x' ? { x: v, y: e.y } : { x: e.x, y: v }, axis === 'x' ? 'в столбец' : 'в ряд');
  }

  /** Равные промежутки между крайними выбранными. */
  spread(axis) {
    const ents = this.selection().sort((a, b) => a[axis] - b[axis]); if (ents.length < 3) { this.say('Для равных промежутков выберите три объекта и больше.', true); return; }
    const a = ents[0][axis], b = ents[ents.length - 1][axis], step = (b - a) / (ents.length - 1);
    const at = new Map(ents.map((e, i) => [e.id, Math.round(a + step * i)]));
    this.moveGroup(ents, e => axis === 'x' ? { x: at.get(e.id), y: e.y } : { x: e.x, y: at.get(e.id) }, 'поровну');
  }

  moveGroup(ents, place, label) {
    const from = new Map(ents.map(e => [e.id, { x: e.x, y: e.y }]));
    const to = new Map(ents.map(e => [e.id, place(e)]));
    for (const e of ents) { const p = to.get(e.id); this.moveEntity(e, p.x, p.y); }
    this.history.push({ label, undo: () => this.applyMoves(from), redo: () => this.applyMoves(to) });
    this.applyLive(); this.drawSelection(); this.refreshInfo(); this.changed();
  }

  cycleSnap() {
    this.snapIdx = (this.snapIdx + 1) % SNAPS.length;
    this.afterSnap();
  }

  setSnap(n) { const i = SNAPS.indexOf(Number(n)); this.snapIdx = i < 0 ? 0 : i; this.afterSnap(); }

  afterSnap() {
    this.panel.setSnap?.(this.snap);
    this.refreshPanel(); this.drawGrid();
    this.say(this.snap ? `Сетка ${this.snap}: объекты и точки встают на её узлы.` : 'Сетка выключена: объекты ставятся точно под курсор.');
  }

  toggleColliders() {
    this.showColliders = !this.showColliders;
    if (this.showColliders) this.drawColliders(); else this.colGfx.clear();
    this.refreshPanel();
    this.say(this.showColliders ? 'Показаны непроходимые места: красные — объекты, жёлтые — стены, синие — вода.' : 'Непроходимые места скрыты.');
  }

  fit() {
    const loc=LOCATIONS.find(l=>l.id===this.locationId),r=loc?.rect||{x:0,y:0,w:WORLD.width,h:WORLD.height};
    this.cam.setZoom(clamp(Math.min((this.cam.width||VIEW.width)/(r.w+80),(this.cam.height||VIEW.height)/(r.h+160)),0.04,1));
    this.cam.centerOn(r.x+r.w/2,r.y+r.h/2);
  }

  goLocation(id) {
    if(id==='all'){this.locationId=id;this.select(null);this.fit();this.panel.setLocation?.(id);this.refreshPanel();return;}
    const l=LOCATIONS.find(l=>l.id===id);if(!l)return;
    this.locationId=id;this.select(null);this.cam.setZoom(0.65);this.cam.centerOn(l.rect.x+l.rect.w/2,l.arrival.y);
    this.panel.setLocation?.(id);this.refreshPanel();
  }

  doUndo() { const op = this.history.undo(); if (op) { this.invalidate(); this.changed(false); this.drawSelection(); this.say(`Отменено: ${op.label}.`); } this.refreshPanel(); }
  doRedo() { const op = this.history.redo(); if (op) { this.invalidate(); this.changed(false); this.drawSelection(); this.say(`Повторено: ${op.label}.`); } this.refreshPanel(); }

  // ------------------------------------------------------------------ кисть и перетаскивание из каталога
  toggleBrush(on = !this.brush) {
    if (on && this.mode !== 'props') this.setMode('props');
    this.brush = !!on;
    this.panel.setBrush?.(this.brush);
    if (this.brush) { this.select(null); this.say(`Кисть: каждый клик по карте ставит «${assetName(this.panel.chosen?.() || '')}». Карту двигайте правой кнопкой или с пробелом. Esc — закончить.`); }
    else { this.hideGhost(); this.say('Кисть выключена.'); }
    this.hoverDirty = true;
  }

  stamp(wp) {
    const key = this.panel.chosen?.();
    if (!key) return;
    this.addAsset(key, this.panel.placement?.() || 'prop', { x: wp.x, y: wp.y, vary: !!this.panel.vary?.() });
  }

  bindCanvasDrop() {
    const canvas = this.scene.game?.canvas;
    if (!canvas?.addEventListener) return;
    const over = (e) => {
      if (!this.dragKey && !e.dataTransfer?.types?.includes?.('text/plain')) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      const wp = this.clientToWorld(e.clientX, e.clientY);
      if (wp && this.dragKey) this.showGhost(this.dragKey, this.panel.placement?.() || 'prop', wp.x, wp.y);
    };
    const drop = (e) => {
      e.preventDefault();
      const key = this.dragKey || e.dataTransfer?.getData('text/plain');
      const wp = this.clientToWorld(e.clientX, e.clientY);
      this.hideGhost(); this.dragKey = null;
      if (!key || !wp || !ASSET_CATALOG.some(a => a.key === key)) return;
      if (this.mode !== 'props') this.setMode('props');
      this.addAsset(key, this.panel.placement?.() || 'prop', { x: wp.x, y: wp.y });
    };
    const leave = () => this.hideGhost();
    canvas.addEventListener('dragover', over); canvas.addEventListener('drop', drop); canvas.addEventListener('dragleave', leave);
    this.dom = { canvas, over, drop, leave };
  }

  /** Полупрозрачная картинка там, куда встанет объект. */
  showGhost(key, placement, x, y) {
    const sx = snapValue(x, this.snap), sy = snapValue(y, this.snap), z = this.cam.zoom;
    this.boxGfx.clear();
    if (placement === 'ground') {
      this.ghost?.setVisible(false);
      this.boxGfx.lineStyle(2 / z, SELECT_COLOR, 0.9).strokeRect(sx - 128, sy - 128, 256, 256);
      return;
    }
    if (!this.scene.add.image || !this.scene.textures?.exists?.(key)) return;
    if (!this.ghost) this.ghost = this.scene.add.image(sx, sy, key);
    if (this.ghostKey !== key) {
      this.ghost.setTexture(key);
      const facade = CITY_WITCH_SPRITES[key];
      this.ghost.setOrigin(facade?.anchor.x ?? 0.5, facade?.anchor.y ?? 1);
      this.scene.styleImage(this.ghost, {}, key);
      this.ghostKey = key;
    }
    this.ghost.setPosition(sx, sy).setVisible(true).setAlpha(0.6).setDepth(TOP + 3);
    this.boxGfx.lineStyle(2 / z, SELECT_COLOR, 1).strokeCircle(sx, sy, 5 / z);
  }

  hideGhost() { this.ghost?.setVisible(false); if (!this.box) this.boxGfx?.clear(); }

  // ------------------------------------------------------------------ подсветка под курсором
  setCursor(c) {
    const canvas = this.scene.game?.canvas;
    const v = c || (this.space ? 'grab' : '');
    if (canvas?.style && this.cursor !== v) { canvas.style.cursor = v; this.cursor = v; }
  }

  hideTip() { if (this.tipShown) { this.panel.hideTip?.(); this.tipShown = false; } }

  updateHover() {
    this.hoverDirty = false;
    const m = this.mouse, g = this.hoverGfx;
    const busy = this.drag || this.pan?.moved || this.box || this.tdrag || this.pinch;
    if (m) this.panel.setCursor?.(`x ${Math.round(m.wx)}, y ${Math.round(m.wy)} — ${locationAt(m.wx, m.wy).name}`);
    if (!m || busy) { g.clear(); this.hover = null; this.hideTip(); if (!busy) this.setCursor(''); return; }
    const z = this.cam.zoom;
    g.clear();
    if (this.mode === 'props') {
      if (this.brush) { this.hideTip(); this.showGhost(this.panel.chosen?.(), this.panel.placement?.() || 'prop', m.wx, m.wy); this.setCursor('copy'); return; }
      if (this.dragKey) return;
      const hit = this.pickNear(m.wx, m.wy);
      this.hover = hit;
      if (!hit) { this.hideTip(); this.setCursor(this.space ? 'grab' : ''); return; }
      if (!this.sel.has(hit.id)) { const b = hit.bounds(); g.lineStyle(1.5 / z, HOVER_COLOR, 0.95).strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); }
      this.panel.showTip?.(m.cx, m.cy, this.plainName(hit), `${ENTITY_KIND[hit.kind]} · ${hit.id}`); this.tipShown = true;
      this.setCursor(this.space ? 'grab' : 'move');
      return;
    }
    if (this.mode === 'terrain') {
      const h = this.handleAt(m.wx, m.wy);
      if (h) {
        g.lineStyle(2 / z, HOVER_COLOR, 1).strokeCircle(h.x, h.y, (h.end ? 18 : 15) / z);
        this.panel.showTip?.(m.cx, m.cy, `Точка ${h.i + 1} — ${this.shapeTitle(h)}`, 'тяните; Alt+клик — убрать'); this.tipShown = true;
        this.setCursor('move'); return;
      }
      const seg = this.segmentHit(m.wx, m.wy);
      if (seg) {
        const sh = this.shapeOf(seg);
        if (sh?.pts) { const pts = TE.centerline(sh.pts); g.lineStyle(3 / z, HOVER_COLOR, 0.7).beginPath().moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.strokePath(); }
        const selected = this.tsel && this.tsel.kind === seg.kind && this.tsel.id === seg.id;
        this.panel.showTip?.(m.cx, m.cy, this.shapeTitle(seg), selected ? 'тяните — сдвинуть целиком; двойной клик — новая точка' : 'клик — выбрать'); this.tipShown = true;
        this.setCursor(selected ? 'move' : 'pointer'); return;
      }
      this.hideTip(); this.setCursor(this.space ? 'grab' : ''); return;
    }
    // стены
    const cur = this.selCol;
    const h = cur && TE.hitRectHandle(cur, m.wx, m.wy, 26 / z);
    if (h) { this.hideTip(); this.setCursor(HANDLE_CURSOR[h]); return; }
    const hit = TE.pickRect(this.cols, m.wx, m.wy, 6 / z);
    if (hit) {
      if (hit.id !== this.csel) g.lineStyle(2 / z, HOVER_COLOR, 0.95).strokeRect(hit.x, hit.y, hit.w, hit.h);
      this.panel.showTip?.(m.cx, m.cy, this.wallTitle(hit), `${hit.w}×${hit.h} · ${hit.id}`); this.tipShown = true;
      this.setCursor('move'); return;
    }
    this.hideTip(); this.setCursor(this.space ? 'grab' : '');
  }

  // ------------------------------------------------------------------ контекстное меню (правая кнопка)
  openMenu(pointer, wp) {
    const c = this.clientOf(pointer);
    this.hideTip();
    const items = this.mode === 'terrain' ? this.terrainMenu(wp) : this.mode === 'walls' ? this.wallMenu(wp) : this.propMenu(wp);
    if (items.length) this.panel.showMenu?.(c.x, c.y, items);
  }

  propMenu(wp) {
    const hit = this.pickNear(wp.x, wp.y);
    if (hit && !this.sel.has(hit.id)) this.select(hit.id);
    const ents = this.selection(), chosen = this.panel.chosen?.() || '';
    if (!ents.length) {
      return [
        { title: locationAt(wp.x, wp.y).name },
        { label: `Поставить «${assetName(chosen)}» сюда`, run: () => this.addAsset(chosen, this.panel.placement?.() || 'prop', { x: wp.x, y: wp.y }) },
        { label: 'Вставить сюда', keys: 'Ctrl+V', disabled: !this.clip, run: () => this.paste({ x: wp.x, y: wp.y }) },
        { label: this.brush ? 'Выключить кисть' : 'Кисть: ставить кликом', keys: 'B', run: () => this.toggleBrush() },
        '-',
        { label: 'Выбрать всё в локации', keys: 'Ctrl+A', run: () => this.selectAll() },
        { label: 'Показать локацию целиком', keys: 'Ctrl+0', run: () => this.fit() },
      ];
    }
    const one = ents.length === 1, e = this.selected || ents[0], layer = this.styleOf(e).l || 'main';
    const layerItem = (l, label) => ({ label: `${layer === l && one ? '● ' : ''}${label}`, run: () => this.setProperty('l', l) });
    return [
      { title: one ? `${this.plainName(e)} · ${e.id}` : `Выбрано: ${ents.length}` },
      { label: 'Копия рядом', keys: 'D', run: () => this.duplicate() },
      { label: 'Зеркало', keys: 'F', run: () => this.flip() },
      { label: 'Повернуть на 15°', keys: 'R', run: () => this.rotate(15) },
      { label: 'Больше', keys: '+', run: () => this.rescale(1.1) }, { label: 'Меньше', keys: '−', run: () => this.rescale(1 / 1.1) },
      '-',
      { label: 'Копировать', keys: 'Ctrl+C', run: () => this.copySel() },
      { label: 'Вырезать', keys: 'Ctrl+X', run: () => this.cutSel() },
      { label: 'Вставить сюда', keys: 'Ctrl+V', disabled: !this.clip, run: () => this.paste({ x: wp.x, y: wp.y }) },
      '-',
      layerItem('back', 'Слой: позади всех'), layerItem('main', 'Слой: по высоте объекта'), layerItem('front', 'Слой: поверх всех'),
      '-',
      { label: 'Выбрать все такие же здесь', disabled: !one, run: () => this.selectSame() },
      { label: `Заменить на «${assetName(chosen)}»`, disabled: !chosen, run: () => this.replaceTexture(chosen) },
      { label: 'Удалить', keys: 'Del', danger: true, run: () => this.remove() },
    ];
  }

  terrainMenu(wp) {
    const h = this.handleAt(wp.x, wp.y);
    const at = { x: wp.x, y: wp.y };
    if (h) {
      this.selectT({ kind: h.kind, id: h.id, i: h.i, seg: null });
      const sh = this.selShape;
      return [
        { title: `Точка ${h.i + 1} — ${this.shapeTitle(h)}` },
        { label: 'Добавить точку после', run: () => this.ptAdd(), disabled: !sh?.pts },
        { label: 'Примкнуть к ближайшей дороге', run: () => this.join(), disabled: h.kind !== 'road' || !h.end },
        { label: 'Убрать точку', keys: 'Alt+клик', danger: true, disabled: !sh?.pts, run: () => this.ptDel() },
        '-',
        { label: 'Сгладить линию', run: () => this.smooth(), disabled: !sh?.pts },
        { label: 'Убрать всю линию', danger: true, run: () => this.delShape() },
      ];
    }
    const seg = this.segmentHit(wp.x, wp.y);
    if (seg) {
      this.selectT(seg);
      const sh = this.selShape;
      return [
        { title: this.shapeTitle(seg) },
        { label: 'Добавить точку здесь', keys: 'двойной клик', disabled: !sh?.pts, run: () => this.insertPointAt(seg, wp) },
        { label: 'Шире', run: () => this.widen(1) }, { label: 'Уже', run: () => this.widen(-1) },
        { label: 'Сгладить', run: () => this.smooth(), disabled: !sh?.pts },
        '-',
        { label: 'Убрать всю линию', danger: true, run: () => this.delShape() },
      ];
    }
    return [
      { title: locationAt(wp.x, wp.y).name },
      { label: 'Новая тропа здесь', run: () => this.newRoad('dirt', false, false, at) },
      { label: 'Новая каменная дорога здесь', run: () => this.newRoad('stone', false, false, at) },
      { label: 'Новый водоём здесь', run: () => this.newPond(at) },
    ];
  }

  wallMenu(wp) {
    const hit = TE.pickRect(this.cols, wp.x, wp.y, 6 / this.cam.zoom);
    if (!hit) return [
      { title: locationAt(wp.x, wp.y).name },
      ...WALL_KINDS.map(([k, label]) => ({ label: `Добавить здесь: ${label.toLocaleLowerCase('ru')}`, run: () => this.newWall(k, { x: wp.x, y: wp.y }) })),
    ];
    this.selectC(hit.id);
    const editable = this.wallKindEditable(hit);
    return [
      { title: `${this.wallTitle(hit)} · ${hit.id}` },
      { label: 'Копия', keys: 'D', run: () => this.dupWall() },
      ...(editable ? ['-', ...WALL_KINDS.filter(([k]) => k !== hit.kind).map(([k, label]) => ({ label: `Сделать: ${label.toLocaleLowerCase('ru')}`, run: () => this.setWallProp('kind', k) }))] : []),
      '-',
      { label: 'Удалить', keys: 'Del', danger: true, run: () => this.delWall() },
    ];
  }

  // ------------------------------------------------------------------ отрисовка
  drawSelection() {
    const g = this.gfx;
    g.clear();
    if (this.mode !== 'props') return;
    const z = this.cam.zoom, main = this.selected;
    for (const e of this.selection()) {
      const b = e.bounds();
      const col = e === main ? (e.kind === 'prop' ? SELECT_COLOR : e.kind === 'obj' ? 0xe8c56a : e.kind === 'enemy' ? 0xff6a5a : SELECT_COLOR) : SELECT_COLOR;
      g.lineStyle((e === main ? 2 : 1.5) / z, col, e === main ? 1 : 0.75).strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      g.fillStyle(col, 1).fillCircle(e.x, e.y, (e === main ? 4 : 3) / z);
    }
    const e = main;
    if (!e) return;
    // точка основания и «след» коллизии главного выбранного
    g.lineStyle(2 / z, 0xffffff, 0.9).strokeCircle(e.x, e.y, 6 / z);
    const s = e.kind === 'prop' ? propSolid(e.ref.p) : e.kind==='col'?e.ref:e.kind==='ground'?null:baseSolid(e.ref.cfg);
    if (s) { g.fillStyle(0xff3b2f, 0.3).fillRect(s.x, s.y, s.w, s.h); g.lineStyle(1.5 / z, 0xff3b2f, 1).strokeRect(s.x, s.y, s.w, s.h); }
  }

  drawBox() {
    const b = this.box, z = this.cam.zoom, g = this.boxGfx;
    g.clear();
    const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
    g.fillStyle(SELECT_COLOR, 0.1).fillRect(x, y, w, h);
    g.lineStyle(1.5 / z, SELECT_COLOR, 1).strokeRect(x, y, w, h);
  }

  /** Сетка (когда включена) и границы локаций с их названиями. */
  drawGrid() {
    const g = this.gridGfx, cam = this.cam, z = cam.zoom, v = cam.worldView;
    g.clear();
    const z1 = 1 / z;
    for (const l of LOCATIONS) {
      const r = l.rect, top = l.extraTop || 0, bottom = l.extraBottom || 0;
      g.lineStyle(2 * z1, 0xc9a24f, 0.45).strokeRect(r.x, r.y - top, r.w, r.h + top + bottom);
    }
    if (!this.snap || !v || !Number.isFinite(v.x) || !Number.isFinite(v.width)) return;
    let step = this.snap;
    while (step * z < 7) step *= 2;   // слишком густая сетка — показываем каждую вторую линию
    const x0 = Math.floor(v.x / step) * step, y0 = Math.floor(v.y / step) * step;
    g.lineStyle(z1, 0xf1e3c2, 0.1);
    for (let x = x0; x <= v.right; x += step) g.lineBetween(x, v.y, x, v.bottom);
    for (let y = y0; y <= v.bottom; y += step) g.lineBetween(v.x, y, v.right, y);
    const major = step * 4;
    g.lineStyle(z1, 0xf1e3c2, 0.2);
    for (let x = Math.floor(v.x / major) * major; x <= v.right; x += major) g.lineBetween(x, v.y, x, v.bottom);
    for (let y = Math.floor(v.y / major) * major; y <= v.bottom; y += major) g.lineBetween(v.x, y, v.right, y);
  }

  scaleLabels() {
    const s = clamp(0.75 / this.cam.zoom, 1, 14);
    for (const t of this.locLabels) t.setScale(s);
  }

  currentLists() {
    const props = this.propViews().map(v => v.p);
    const interactives = this.scene.objects.filter(o=>!o._editorDeleted).map(o => o.cfg);
    const enemies = this.scene.enemies.filter(o=>!o._editorDeleted).map(e => e.cfg);
    return { props, interactives, enemies };
  }

  drawColliders() {
    const { props, interactives, enemies } = this.currentLists();
    const solids = collectSolids({ colliders: this.cols, props, interactives, enemies, waterRects: this.scene.terrain.waterRects });
    const g = this.colGfx;
    g.clear();
    for (const s of solids) {
      const c = s.src.startsWith('prop') ? 0xff3b2f : s.src === 'water' ? 0x3c8cff : 0xffc828;
      g.fillStyle(c, 0.38).fillRect(s.x, s.y, s.w, s.h);
    }
  }

  // ------------------------------------------------------------------ панель
  shapeTitle(sel) {
    const sh = this.shapeOf(sel);
    if (!sh) return '';
    const kind = cap(KIND_NAMES[sh.type || sh.kind] || sh.kind || sh.type);
    return `${kind} «${sh.id}»`;
  }

  wallTitle(c) { return `${cap(KIND_NAMES[c.kind] || c.kind)}${c.label ? ' «' + c.label + '»' : ''}${c.tex ? ' — ' + assetName(c.tex) : ''}`; }

  infoTerrain() {
    const sh = this.selShape;
    if (!sh) return 'Дороги и вода. Белые кружки — точки линий: тяните их. Щёлкните линию, чтобы выбрать её. Двойной клик по линии добавляет точку.';
    const kind = KIND_NAMES[sh.type || sh.kind] + (sh.kind ? (sh.borderless ? ' · вставка без краёв' : sh.seamless ? ' · без швов' : ' · со швом') : '');
    if (!sh.pts) return `Водоём «${sh.id}» (${kind})\nцентр ${sh.cx}, ${sh.cy}  размер ${sh.rx}×${sh.ry}`;
    const size = sh.type === 'canal' ? `ширина ${sh.half * 2}` : sh.type === 'river' ? `ширина ${sh.base * 2}–${(sh.base + sh.extra) * 2}` : `ширина ${sh.w}`;
    const pt = this.tsel.i != null ? `\nточка ${this.tsel.i + 1} из ${sh.pts.length}: ${sh.pts[this.tsel.i][0]}, ${sh.pts[this.tsel.i][1]}` : `\nточек ${sh.pts.length}; выбран отрезок ${(this.tsel.seg ?? 0) + 1}`;
    return `${sh.type === 'river' ? 'Ручей' : sh.type === 'canal' ? 'Канал' : 'Дорога'} «${sh.id}» (${kind}), ${size}${pt}`;
  }

  infoWall() {
    const c = this.selCol;
    if (!c) return 'Стены — прямоугольники, через которые нельзя пройти. Щёлкните, чтобы выбрать; тяните — двигать; квадратики по краям — размер.';
    const note = c.kind === 'trees' ? '\nЛес закрывает проход; сами деревья ставятся в режиме «Объекты».' : c.building ? '\nЭто здание: его фасад, вход и точка возврата едут вместе со стеной.' : '';
    return `${this.wallTitle(c)} · ${c.id}\nx ${c.x}  y ${c.y}  ${c.w}×${c.h}${note}`;
  }

  /** Поля справа для выбранной линии. */
  terrainView() {
    const sh = this.selShape;
    if (!sh) return null;
    const fields = [];
    if (sh.type === 'blob') fields.push({ key: 'rw', label: 'Ширина', value: sh.rx * 2, min: 48, step: 2 }, { key: 'rh', label: 'Высота', value: sh.ry * 2, min: 48, step: 2 },
      { key: 'cx', label: 'Центр X', value: sh.cx }, { key: 'cy', label: 'Центр Y', value: sh.cy });
    else if (sh.type === 'river') fields.push({ key: 'bmin', label: 'Ширина, узко', value: sh.base * 2, min: 40, step: 2 }, { key: 'bmax', label: 'Ширина, широко', value: (sh.base + sh.extra) * 2, min: 40, step: 2 });
    else if (sh.type === 'canal') fields.push({ key: 'cw', label: 'Ширина', value: sh.half * 2, min: 24, step: 2, wide: true });
    else fields.push({ key: 'w', label: 'Ширина', value: sh.w, min: 40, step: 2, wide: true });
    if (sh.pts && this.tsel.i != null) {
      const p = sh.pts[this.tsel.i];
      fields.push({ key: 'px', label: `Точка ${this.tsel.i + 1} из ${sh.pts.length}: X`, value: p[0] }, { key: 'py', label: 'Y', value: p[1] });
    }
    return { fields };
  }

  wallKindEditable(c) { return !!c && !c.tex && !c.building; }

  refreshInfo() {
    if (this.mode === 'terrain') { this.panel.setInfo(this.infoTerrain()); this.panel.setTerrain?.(this.terrainView()); this.panel.setSelected?.(null); this.updateSelectionStatus(); return; }
    if (this.mode === 'walls') {
      const c = this.selCol;
      this.panel.setInfo(this.infoWall());
      this.panel.setWall?.(c ? { kind: c.kind, x: c.x, y: c.y, w: c.w, h: c.h, kindEditable: this.wallKindEditable(c) } : null);
      this.panel.setSelected?.(null); this.updateSelectionStatus(); return;
    }
    const e = this.selected, n = this.sel.size;
    this.updateSelectionStatus();
    if (!e) {
      this.panel.setInspector?.(null); this.panel.setSelected?.(null);
      const desk = this.panel.isDesktop?.();
      this.panel.setInfo(this.brush ? (desk ? 'Кисть: щёлкайте по карте, чтобы ставить выбранную картинку. Esc — закончить.' : 'Кисть: касайтесь карты, чтобы ставить выбранную картинку. Нажмите «Кисть» ещё раз, чтобы закончить.')
        : desk ? 'Щёлкните объект на карте или в списке, чтобы выбрать. Тяните пустое место, чтобы двигать карту. Shift + рамка — выбрать несколько.'
          : 'Коснитесь объекта, чтобы выбрать, и тяните, чтобы переместить. Пустое место — двигать карту, двумя пальцами — масштаб.');
      return;
    }
    this.panel.setSelected?.({ key: this.textureOf(e), name: this.plainName(e), sub: `${cap(ENTITY_KIND[e.kind])} · ${e.id}` });
    this.panel.setInfo(n > 1 ? `Выбрано: ${n}. Правки справа и кнопки применяются ко всем; X и Y двигают всю группу.`
      : `x ${Math.round(e.x)}  y ${Math.round(e.y)}${e.kind==='obj'||e.kind==='enemy'?'\nСюжетный объект: его поведение и награды сохраняются.':''}`);
    this.panel.setInspector?.(e,{...this.styleOf(e),x:e.x,y:e.y,w:e.img.displayWidth,h:e.img.displayHeight,
      solid:e.kind==='prop'?e.ref.p.solid===undefined||e.ref.p.solid==='auto'?defaultAssetSolid(e.ref.p.k):e.ref.p.solid:e.kind==='col'?{w:e.ref.w,h:e.ref.h}:null},{multi:n});
  }

  updateSelectionStatus() {
    let text = '';
    if (this.mode === 'props') {
      const e = this.selected, n = this.sel.size;
      text = n > 1 ? `Выбрано: ${n}` : e ? `Выбрано: ${this.plainName(e)}` : '';
      if (this.entityFilter !== 'all') text = `${text ? text + ' · ' : ''}выбирать можно только: ${FILTER_NAMES[this.entityFilter]}`;
      if (this.brush) text = `Кисть: ${assetName(this.panel.chosen?.() || '')}`;
    } else if (this.mode === 'terrain') text = this.selShape ? `Выбрано: ${this.shapeTitle(this.tsel)}` : '';
    else text = this.selCol ? `Выбрано: ${this.wallTitle(this.selCol)}` : '';
    this.panel.setSelection?.(text);
  }

  entityItems() {
    if (this.listCache?.ents === this.ents && this.listCache.filter === this.entityFilter) return this.listCache.items;
    const items = this.pickEntities().map(e => ({ id: e.id, name: this.plainName(e), sub: e.id, loc: locationAt(e.x, e.y).id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id));
    this.listCache = { ents: this.ents, filter: this.entityFilter, items };
    return items;
  }

  refreshPanel() {
    const p = this.panel, has = this.sel.size > 0;
    p.setEnabled('undo', this.history.canUndo); p.setEnabled('redo', this.history.canRedo);
    p.setHistory?.(this.history.undoLabel, this.history.redoLabel);
    for (const n of ['replace', 'dup', 'flip', 'bigger', 'smaller', 'delete']) p.setEnabled(n, has);
    p.setEntities?.(this.entityItems(), this.sel, this.entityFilter);
    p.setToggle('snap', this.snap > 0, `Сетка: ${this.snap || 'нет'}`);
    p.setToggle('colliders', this.showColliders);
    p.setToggle('magnet', this.magnetOn);
    const sh = this.selShape, hasPt = !!sh && this.tsel.i != null && !!sh.pts, c = this.selCol;
    for (const n of ['pt_add', 'wider', 'narrower', 'smooth', 'shape_del']) p.setEnabled(n, !!sh);
    p.setEnabled('pt_add_start', !!sh?.pts); p.setEnabled('pt_del', hasPt);
    p.setEnabled('join', hasPt && this.tsel.kind === 'road');
    p.setEnabled('seamless', !!sh && this.tsel?.kind === 'road');
    p.setToggle('seamless', !!sh?.seamless, sh?.seamless ? 'Стыки: без швов' : 'Стыки: со швом');
    p.setEnabled('borderless', !!sh && this.tsel?.kind === 'road');
    p.setToggle('borderless', !!sh?.borderless, sh?.borderless ? 'Края: без каймы' : 'Края: с каймой');
    for (const n of ['wall_dup', 'wall_del', 'w_plus', 'w_minus', 'h_plus', 'h_minus']) p.setEnabled(n, !!c);
    if (this.mode === 'terrain') p.setShapes?.(this.shapeItems(), this.tsel ? `${this.tsel.kind}:${this.tsel.id}` : '');
    if (this.mode === 'walls') p.setWalls?.(this.wallItems(), this.csel || '');
  }

  shapeItems() {
    const item = (kind, s) => {
      const p = s.pts ? s.pts[0] : [s.cx, s.cy];
      const flags = s.kind ? (s.borderless ? ', без краёв' : s.seamless ? ', без швов' : '') : '';
      return { id: `${kind}:${s.id}`, name: `${cap(KIND_NAMES[s.type || s.kind] || 'линия')}${flags}`, sub: s.id, loc: locationAt(p[0], p[1]).id };
    };
    return [...this.roads.map(s => item('road', s)), ...this.waters.map(s => item('water', s))];
  }

  wallItems() { return this.cols.map(c => ({ id: c.id, name: this.wallTitle(c), sub: c.id, loc: locationAt(c.x + c.w / 2, c.y + c.h / 2).id })); }

  say(text, warn = false) { this.panel.setStatus(text, warn); }

  // ------------------------------------------------------------------ режимы: дороги, река, стены
  terrainKey() { return JSON.stringify([this.roads, this.waters]); }
  snapshot() { return JSON.stringify({ roads: this.roads, waters: this.waters, cols: this.cols,grounds:this.grounds }); }

  tick() {
    const cam = this.cam;
    if (cam.zoom !== this.lastZoom) {
      this.lastZoom = cam.zoom; this.drawOverlay(); this.drawSelection(); this.panel.setZoom?.(cam.zoom); this.scaleLabels(); this.hoverDirty = true;
      if (this.box) this.drawBox();
    }
    const sig = `${Math.round(cam.scrollX)},${Math.round(cam.scrollY)},${cam.zoom},${cam.width},${cam.height},${this.snap}`;
    if (sig !== this.viewSig) {
      this.viewSig = sig; this.drawGrid();
      if (this.mouse) { const wp = cam.getWorldPoint(this.mouse.sx, this.mouse.sy); this.mouse.wx = wp.x; this.mouse.wy = wp.y; this.hoverDirty = true; }
    }
    if (this.hoverDirty) this.updateHover();
    if (Number.isFinite(cam.width)) this.viewSize = { cx: cam.scrollX + cam.width / 2, cy: cam.scrollY + cam.height / 2 };
  }

  setMode(m) {
    if (m === this.mode) return;
    if (m !== 'props' && this.brush) this.toggleBrush(false);
    this.mode = m;
    this.drag = null; this.tdrag = null; this.pan = null; this.box = null;
    this.tsel = null; this.csel = null;
    this.selectedId = null; this.sel = new Set();
    this.hoverGfx.clear(); this.boxGfx.clear(); this.hideTip();
    this.panel.setMode(m);
    this.drawSelection();
    this.drawOverlay();
    this.refreshInfo();
    this.refreshPanel();
    this.say(m === 'terrain' ? 'Дороги и вода: тяните белые кружки — точки линий. Двойной клик по линии — новая точка, Alt + клик по точке — убрать её.'
      : m === 'walls' ? 'Стены: щёлкните прямоугольник, чтобы выбрать; тяните — двигать; квадратики по краям — размер. Точные числа — справа.'
      : 'Объекты: щёлкните, чтобы выбрать; Shift + рамка — несколько. Картинки из каталога можно перетаскивать на карту.');
  }

  /** Применяет рабочие списки к живому миру: пересобирает то, что изменилось. */
  applyLive() {
    const t = this.terrainKey();
    if (t !== this.applied.terrain) { this.applied.terrain = t; this.scene.rebuildTerrain(clone(this.roads), clone(this.waters)); }
    const g=JSON.stringify(this.grounds);
    if(g!==this.applied.grounds){this.applied.grounds=g;this.scene.rebuildGrounds(clone(this.grounds));this.invalidate();}
    const c = JSON.stringify(this.cols);
    if (c !== this.applied.cols) {
      this.applied.cols = c; this.scene.rebuildColliders(clone(this.cols));
      this.invalidate();
      const portals=applyPos(linkBuildingPortals(INTERACTIVES,this.cols),this.pos);
      for(const cfg of portals.filter(o=>o.kind==='room_door')){
        const o=this.scene.objects.find(o=>o.id===cfg.id);if(!o)continue;
        o.cfg=clone(cfg);o.baseY=cfg.y;o.sprite.setPosition(cfg.x,cfg.y).setDepth(DEPTH.mainBase+cfg.y);
      }
    }
  }

  /** Записывает в историю правку дорог/воды/стен: before — снимок до, текущее состояние — после. */
  commitLists(before, label = 'правка дорог и стен') {
    const after = this.snapshot();
    if (after === before) return false;
    this.history.push({ label, undo: () => this.restoreSnapshot(before), redo: () => this.restoreSnapshot(after) });
    this.applyLive();
    this.changed();
    return true;
  }

  restoreSnapshot(str) {
    const d = JSON.parse(str);
    this.roads = d.roads; this.waters = d.waters; this.cols = d.cols;this.grounds=d.grounds||[];
    this.applyLive();
    this.invalidate();
    if (this.tsel && !this.shapeOf(this.tsel)) this.tsel = null;
    if (this.csel && !this.cols.find(c => c.id === this.csel)) this.csel = null;
    if (this.tsel?.i != null) { const sh = this.shapeOf(this.tsel); if (sh?.pts && this.tsel.i >= sh.pts.length) this.tsel.i = sh.pts.length - 1; }
    for (const id of [...this.sel]) if (!this.find(id)) this.sel.delete(id);
    if (this.selectedId && !this.find(this.selectedId)) this.selectedId = [...this.sel].pop() || null;
  }

  /** Правка списка одной функцией; она может вернуть false — «ничего не сделано». */
  mutate(fn, label) {
    const before = this.snapshot();
    if (fn() === false) return false;
    return this.commitLists(before, label);
  }

  shapeOf(sel) { return sel ? (sel.kind === 'road' ? this.roads : this.waters).find(s => s.id === sel.id) || null : null; }
  col(id) { return this.cols.find(c => c.id === id) || null; }
  get selShape() { return this.shapeOf(this.tsel); }
  get selCol() { return this.csel ? this.col(this.csel) : null; }

  /** Все точки-ручки дорог и воды (у водоёма-пятна — одна, в центре). */
  handles() {
    const out = [];
    const add = (kind, s) => {
      if (s.pts) s.pts.forEach((p, i) => out.push({ kind, id: s.id, i, x: p[0], y: p[1], end: i === 0 || i === s.pts.length - 1 }));
      else out.push({ kind, id: s.id, i: 0, x: s.cx, y: s.cy, end: false });
    };
    this.roads.forEach(s => add('road', s));
    this.waters.forEach(s => add('water', s));
    return out;
  }

  /** Ближайшая ручка под точкой (в пределах касания пальцем). */
  handleAt(x, y) {
    const tol = 26 / this.cam.zoom;
    let hit = null, bd = tol;
    for (const h of this.handles()) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; hit = h; } }
    return hit;
  }

  /** Линия, на которую коснулись (не точка): выбирается линия и отрезок; широкая дорога выбирается касанием тела. */
  segmentHit(x, y) {
    const z = this.cam.zoom;
    let best = null, bs = Infinity;
    const test = (kind, s, tol) => {
      if (!s.pts) { const r = Math.hypot((x - s.cx) / s.rx, (y - s.cy) / s.ry); if (r < 0.85 && r < bs) { bs = r; best = { kind, id: s.id, i: null, seg: null }; } return; }
      const line = TE.centerline(s.pts), n = TE.nearestOnPolyline(line, x, y);
      const t = Math.max(16 / z, tol), score = n.d / t;
      if (n.d <= t && score < bs) { bs = score; best = { kind, id: s.id, i: null, seg: TE.segmentOfSample(n.idx, s.pts.length) }; }
    };
    this.roads.forEach(r => test('road', r, r.w / 2));
    this.waters.forEach(w => test('water', w, w.base || w.half || 0));
    return best;
  }

  selectT(sel) {
    this.tsel = sel;
    this.drawOverlay(); this.refreshInfo(); this.refreshPanel(); if (this.panel.isDesktop?.()) this.panel.reveal?.();
  }

  /** Выбор линии из списка: показать её на карте. */
  focusShape(key) {
    const [kind, id] = String(key).split(':');
    const sh = this.shapeOf({ kind, id });
    if (!sh) return;
    this.selectT({ kind, id, i: null, seg: sh.pts ? 0 : null });
    const pts = sh.pts || [[sh.cx, sh.cy]];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    this.cam.centerOn((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
    this.locationId = locationAt(pts[0][0], pts[0][1]).id; this.panel.setLocation?.(this.locationId);
  }

  focusWall(id) {
    const c = this.col(id); if (!c) return;
    this.selectC(id);
    this.cam.centerOn(c.x + c.w / 2, c.y + c.h / 2);
    this.locationId = locationAt(c.x + c.w / 2, c.y + c.h / 2).id; this.panel.setLocation?.(this.locationId);
  }

  downTerrain(pointer, wp, m = {}, dbl = false) {
    const hit = this.handleAt(wp.x, wp.y);
    if (hit) {
      if (m.alt) { this.selectT({ kind: hit.kind, id: hit.id, i: hit.i, seg: null }); this.ptDel(); return; }
      this.selectT({ kind: hit.kind, id: hit.id, i: hit.i, seg: null });
      this.tdrag = { type: 'pt', sel: { kind: hit.kind, id: hit.id }, i: hit.i, before: this.snapshot(), moved: false, dx: hit.x - wp.x, dy: hit.y - wp.y, magnet: null };
      this.pan = null;
      return;
    }
    const seg = this.segmentHit(wp.x, wp.y);
    if (dbl && seg && this.shapeOf(seg)?.pts) { this.insertPointAt(seg, wp); return; }
    const sh = seg && this.tsel && seg.kind === this.tsel.kind && seg.id === this.tsel.id ? this.shapeOf(seg) : null;
    if (sh) {   // выбранную линию можно тянуть целиком
      this.tdrag = { type: 'shape', sel: { kind: seg.kind, id: seg.id }, tap: seg, before: this.snapshot(), moved: false, sx: wp.x, sy: wp.y,
        screen: { x: pointer.x, y: pointer.y }, orig: sh.pts ? sh.pts.map(p => [p[0], p[1]]) : [sh.cx, sh.cy] };
      this.pan = null;
      return;
    }
    this.startPan(pointer, () => this.selectT(seg));
  }

  /** Новая точка на линии ровно там, где щёлкнули (на ближайшем месте самой линии). */
  insertPointAt(sel, wp) {
    const sh = this.shapeOf(sel);
    if (!sh?.pts) return;
    const n = TE.nearestOnPolyline(TE.centerline(sh.pts), wp.x, wp.y), i = TE.segmentOfSample(n.idx, sh.pts.length);
    const x = Math.round(snapValue(n.x, this.snap)), y = Math.round(snapValue(n.y, this.snap));
    this.mutate(() => { sh.pts.splice(i + 1, 0, [x, y]); this.tsel = { kind: sel.kind, id: sel.id, i: i + 1, seg: null }; }, 'новая точка');
    this.say('Точка добавлена. Потяните её, чтобы выгнуть линию.');
  }

  downWalls(pointer, wp) {
    const z = this.cam.zoom;
    const cur = this.selCol;
    if (cur) {
      const h = TE.hitRectHandle(cur, wp.x, wp.y, 26 / z);
      if (h) { this.tdrag = { type: 'resize', id: cur.id, h, before: this.snapshot(), moved: false }; this.pan = null; return; }
    }
    const hit = TE.pickRect(this.cols, wp.x, wp.y, 6 / z);
    if (hit) {
      this.selectC(hit.id);
      this.tdrag = { type: 'move', id: hit.id, before: this.snapshot(), moved: false, ox: wp.x - hit.x, oy: wp.y - hit.y };
      this.pan = null;
      return;
    }
    this.startPan(pointer, () => this.selectC(null));
  }

  selectC(id) { this.csel = id; this.drawOverlay(); this.refreshInfo(); this.refreshPanel(); if (this.panel.isDesktop?.()) this.panel.reveal?.(); }

  moveT(pointer) {
    const d = this.tdrag, wp = this.worldPoint(pointer), z = this.cam.zoom;
    if (d.type === 'pt') {
      const sh = this.shapeOf(d.sel);
      if (!sh) return;
      let x = clamp(snapValue(wp.x + d.dx, this.snap), 0, WORLD.width), y = clamp(snapValue(wp.y + d.dy, this.snap), 0, WORLD.height + 500);
      d.magnet = null;
      const isEnd = sh.pts && (d.i === 0 || d.i === sh.pts.length - 1);
      if (this.magnetOn && d.sel.kind === 'road' && isEnd) {
        const m = TE.magnet(x, y, this.roads, sh.id, 32 / z, 26 / z);
        if (m) { x = m.x; y = m.y; d.magnet = m; }
      }
      if (sh.pts) { if (sh.pts[d.i][0] === x && sh.pts[d.i][1] === y) return; sh.pts[d.i] = [x, y]; } else { if (sh.cx === x && sh.cy === y) return; sh.cx = x; sh.cy = y; }
    } else if (d.type === 'shape') {
      const sh = this.shapeOf(d.sel);
      if (!sh) return;
      if (!d.moved && pointer.event && Math.hypot(pointer.x - d.screen.x, pointer.y - d.screen.y) < DRAG_START) return;
      const dx = Math.round(snapValue(wp.x - d.sx, this.snap)), dy = Math.round(snapValue(wp.y - d.sy, this.snap));
      if (sh.pts) sh.pts = d.orig.map(p => [p[0] + dx, p[1] + dy]); else { sh.cx = d.orig[0] + dx; sh.cy = d.orig[1] + dy; }
      this.setCursor('grabbing');
    } else if (d.type === 'move') {
      const c = this.col(d.id);
      if (!c) return;
      const x = Math.round(snapValue(wp.x - d.ox, this.snap)), y = Math.round(snapValue(wp.y - d.oy, this.snap));
      if (c.x === x && c.y === y) return;
      c.x = x; c.y = y;
    } else {
      const c = this.col(d.id);
      if (!c) return;
      const r = TE.resizeRect(c, d.h, snapValue(wp.x, this.snap), snapValue(wp.y, this.snap));
      if (r.x === c.x && r.y === c.y && r.w === c.w && r.h === c.h) return;
      c.x = r.x; c.y = r.y; c.w = r.w; c.h = r.h;
    }
    d.moved = true;
    this.drawOverlay(); this.refreshInfo();
  }

  finishT() {
    const d = this.tdrag;
    this.tdrag = null;
    this.setCursor('');
    if (!d.moved) { if (d.type === 'shape') this.selectT(d.tap); else this.drawOverlay(); return; }
    d.magnet = null;
    this.commitLists(d.before, d.type === 'pt' ? 'точка линии' : d.type === 'shape' ? 'перенос линии' : d.type === 'move' ? 'перенос стены' : 'размер стены');
    this.drawOverlay();
  }

  onKeyMode(e) {
    const k = e.key, code = e.code || '';
    const letter = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : (k || '').length === 1 ? k.toLowerCase() : '';
    const step = e.shiftKey ? 10 : 1;
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (this.mode === 'terrain') {
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault?.(); if (this.tsel?.i != null) this.ptDel(); else if (this.selShape) this.say('Чтобы убрать всю линию — «Убрать линию» справа или в меню правой кнопки.', true); return true; }
      if (k === 'Escape') { this.selectT(null); return true; }
      if (dirs[k] && (this.tsel?.i != null || this.selShape?.cx != null)) { e.preventDefault?.(); this.nudgeT(dirs[k][0] * step, dirs[k][1] * step); return true; }
    } else {
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault?.(); this.delWall(); return true; }
      if (k === 'Escape') { this.selectC(null); return true; }
      if (letter === 'd') { this.dupWall(); return true; }
      if (dirs[k] && this.selCol) { e.preventDefault?.(); this.nudgeW(dirs[k][0] * step, dirs[k][1] * step); return true; }
    }
    return false;
  }

  nudgeT(dx, dy) {
    this.mutate(() => {
      const sh = this.selShape;
      if (!sh) return false;
      if (sh.pts) { if (this.tsel.i == null) return false; sh.pts[this.tsel.i] = [sh.pts[this.tsel.i][0] + dx, sh.pts[this.tsel.i][1] + dy]; } else { sh.cx += dx; sh.cy += dy; }
    }, 'сдвиг точки');
  }

  nudgeW(dx, dy) { this.mutate(() => { const c = this.selCol; if (!c) return false; c.x += dx; c.y += dy; }, 'сдвиг стены'); }

  /** Числа из полей справа: ширина линии, координаты выбранной точки, размер и центр водоёма. */
  setTerrainProp(key, value) {
    const sh = this.selShape, n = Math.round(Number(value));
    if (!sh || !Number.isFinite(n)) return;
    this.mutate(() => {
      if (key === 'w') sh.w = clamp(n, 40, 260);
      else if (key === 'cw') sh.half = clamp(Math.round(n / 2), 12, 160);
      else if (key === 'bmin') { const max = sh.base + sh.extra; sh.base = clamp(Math.round(n / 2), 20, 160); sh.extra = clamp(max - sh.base, 8, 90); }
      else if (key === 'bmax') sh.extra = clamp(Math.round(n / 2) - sh.base, 8, 90);
      else if (key === 'rw') sh.rx = clamp(Math.round(n / 2), 24, 500);
      else if (key === 'rh') sh.ry = clamp(Math.round(n / 2), 24, 500);
      else if (key === 'cx') sh.cx = n;
      else if (key === 'cy') sh.cy = n;
      else if ((key === 'px' || key === 'py') && sh.pts && this.tsel.i != null) { const p = sh.pts[this.tsel.i]; sh.pts[this.tsel.i] = key === 'px' ? [n, p[1]] : [p[0], n]; }
      else return false;
    }, key === 'px' || key === 'py' ? 'точка линии' : 'ширина линии');
  }

  /** Числа и тип выбранной стены из полей справа. */
  setWallProp(key, value) {
    const c = this.selCol;
    if (!c) return;
    if (key === 'kind') {
      if (!this.wallKindEditable(c) || !WALL_KINDS.some(([k]) => k === value) || c.kind === value) return;
      this.mutate(() => { c.kind = value; delete c.style; }, 'тип стены');
      this.say(`Теперь это: ${KIND_NAMES[value]}.`);
      return;
    }
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return;
    this.mutate(() => {
      if (key === 'x') c.x = n; else if (key === 'y') c.y = n;
      else if (key === 'w') c.w = Math.max(10, n); else if (key === 'h') c.h = Math.max(10, n);
      else return false;
    }, key === 'w' || key === 'h' ? 'размер стены' : 'перенос стены');
  }

  // ---- дороги и ручей
  needShape(text = 'Сначала выберите дорогу или ручей') {
    const sh = this.selShape;
    if (!sh) this.say(text, true);
    return sh;
  }

  ptAdd() {
    const sh = this.needShape();
    if (!sh) return;
    if (!sh.pts) { this.say('У водоёма-пятна одна точка — центр. Размер меняют «Шире» и «Уже».', true); return; }
    this.mutate(() => {
      const i = this.tsel.i ?? this.tsel.seg ?? sh.pts.length - 1;
      const r = TE.addPointAfter(sh.pts, i);
      sh.pts = r.pts; this.tsel = { ...this.tsel, i: r.index, seg: null };
    }, 'новая точка');
    this.say('Точка добавлена. Потяните её, чтобы выгнуть линию.');
  }

  ptAddStart() {
    const sh = this.needShape();
    if (!sh) return;
    if (!sh.pts) { this.say('У водоёма-пятна одна точка — центр.', true); return; }
    this.mutate(() => { const r = TE.addPointBefore(sh.pts); sh.pts = r.pts; this.tsel = { ...this.tsel, i: 0, seg: null }; }, 'новая точка');
    this.say('Линия продолжена в начале. Потяните новую точку на место.');
  }

  ptDel() {
    const sh = this.needShape('Выберите точку, которую нужно убрать');
    if (!sh) return;
    if (!sh.pts || this.tsel.i == null) { this.say('Выберите точку (белый кружок) на линии', true); return; }
    const r = TE.removePoint(sh.pts, this.tsel.i);
    if (!r) { this.say('В линии должно остаться минимум две точки. Чтобы убрать всю линию — «Убрать линию».', true); return; }
    this.mutate(() => { sh.pts = r; this.tsel = { ...this.tsel, i: Math.min(this.tsel.i, r.length - 1) }; }, 'удаление точки');
  }

  widen(dir) {
    const sh = this.needShape();
    if (!sh) return;
    const f = dir > 0 ? 1.1 : 1 / 1.1;
    this.mutate(() => {
      if (sh.type === 'canal') sh.half=clamp(sh.half+dir*4,12,160);
      else if (sh.type === 'river') { sh.base = Math.round(clamp(sh.base * f, 20, 160)); sh.extra = Math.round(clamp(sh.extra * f, 8, 90)); }
      else if (sh.type === 'blob') { sh.rx = Math.round(clamp(sh.rx * f, 24, 500)); sh.ry = Math.round(clamp(sh.ry * f, 24, 500)); }
      else sh.w = Math.round(clamp(sh.w + dir * 8, 40, 260));
    }, dir > 0 ? 'шире' : 'уже');
  }

  smooth() {
    const sh = this.needShape();
    if (!sh) return;
    if (!sh.pts) { this.say('Сглаживать нечего: у водоёма-пятна нет изгибов.', true); return; }
    if (sh.pts.length < 3) { this.say('Для сглаживания нужны три точки и больше.', true); return; }
    this.mutate(() => { sh.pts = TE.smoothPoints(sh.pts); }, 'сглаживание');
    this.say('Изгибы выровнены. Нажмите ещё раз, чтобы выровнять сильнее.');
  }

  /** Конец выбранной дороги — к ближайшей точке другой дороги: так закрываются пустые клочки и кривые стыки. */
  join() {
    const sh = this.needShape();
    if (!sh) return;
    if (this.tsel.kind !== 'road' || !sh.pts) { this.say('Примыкать умеют только дороги.', true); return; }
    const i = this.tsel.i;
    if (i == null || (i !== 0 && i !== sh.pts.length - 1)) { this.say('Выберите крайнюю точку дороги — начало или конец.', true); return; }
    const m = TE.nearestOtherRoad(sh.pts[i][0], sh.pts[i][1], this.roads, sh.id);
    if (!m) { this.say('Рядом нет другой дороги (дальше 500 пикселей).', true); return; }
    this.mutate(() => { sh.pts[i] = [m.x, m.y]; }, 'стык дорог');
    this.say(`Конец прижат к дороге «${m.id}»${m.kind === 'point' ? ' (к её точке)' : ''}. Если стык всё ещё кривой — подвиньте соседнюю точку.`);
  }

  toggleSeamless() {
    const sh = this.selShape;
    if (!sh || this.tsel?.kind !== 'road') return;
    this.mutate(() => { sh.seamless = !sh.seamless; if (!sh.seamless) sh.borderless = false; }, 'стыки дороги');
    this.say(sh.seamless ? 'Дорога объединяется без швов с дорогами того же материала, включая обычные.' : 'Вернули дорогу со швом.');
  }

  toggleBorderless() {
    const sh = this.selShape;
    if (!sh || this.tsel?.kind !== 'road') return;
    this.mutate(() => { sh.borderless = !sh.borderless; if (sh.borderless) sh.seamless = true; }, 'кайма дороги');
    this.say(sh.borderless ? 'Вставка без каймы с обеих сторон. Примкните её концами к дорогам того же материала.' : 'Вернули внешнюю кайму дороги.');
  }

  /** Новая линия в центре карты или в точке at (меню правой кнопки). */
  newRoad(kind, seamless = false, borderless = false, at = null) {
    const v = this.cam.worldView, cx = Math.round(snapValue(at ? at.x : v.centerX, this.snap)), cy = Math.round(snapValue(at ? at.y : v.centerY, this.snap));
    this.mutate(() => {
      const id = nextId(new Set(this.roads.map(r => r.id)), 'rd');
      const r = { id, kind, ...(seamless || borderless ? { seamless: true } : {}), ...(borderless ? { borderless: true } : {}), w: kind === 'stone' ? 120 : 100, n: TE.nextNoise(this.roads, this.waters), pts: [[cx - 140, cy], [cx, cy - 24], [cx + 140, cy]] };
      if(kind==='stone' && locationAt(cx,cy).id==='city')Object.assign(r,{texture:'city_walk_paving',tileScale:0.24,urban:true});
      this.roads.push(r);
      this.tsel = { kind: 'road', id, i: 1, seg: null };
    }, kind === 'stone' ? 'новая каменная дорога' : 'новая тропа');
    this.refreshInfo(); this.refreshPanel();
    this.say(borderless ? 'Новая вставка без каймы с обеих сторон. Растяните её между другими дорогами.' : `Новая дорога ${at ? 'в указанном месте' : 'в центре карты'}. Растяните её точками и примкните концами к другим дорогам.`);
  }

  newPond(at = null) {
    const v = this.cam.worldView, cx = Math.round(snapValue(at ? at.x : v.centerX, this.snap)), cy = Math.round(snapValue(at ? at.y : v.centerY, this.snap));
    this.mutate(() => {
      const id = nextId(new Set(this.waters.map(r => r.id)), 'wt');
      const n = TE.nextNoise(this.roads, this.waters);
      this.waters.push({ id, type: 'blob', cx, cy, rx: 90, ry: 70, seed: 3 + n * 7, amp: 0.14, n });
      this.tsel = { kind: 'water', id, i: 0, seg: null };
    }, 'новый водоём');
    this.refreshInfo(); this.refreshPanel();
    this.say('Новый водоём. Тяните центр; размер — поля справа или «Шире» и «Уже». Вода непроходима.');
  }

  delShape() {
    const sh = this.needShape();
    if (!sh) return;
    this.mutate(() => {
      const list = this.tsel.kind === 'road' ? this.roads : this.waters;
      list.splice(list.indexOf(sh), 1);
      this.tsel = null;
    }, 'удаление линии');
    this.refreshInfo(); this.refreshPanel();
    this.say('Линия убрана (отмена вернёт её). Проверьте проходимость.');
  }

  // ---- стены
  newWall(kind, at = null) {
    const v = this.cam.worldView;
    this.mutate(() => {
      const id = nextId(new Set(this.cols.map(c => c.id)), 'cn');
      const w = kind === 'trees' ? 200 : 200, h = kind === 'trees' ? 120 : kind === 'furniture' ? 60 : 40;
      const cx = at ? at.x : v.centerX, cy = at ? at.y - h / 2 : v.centerY;
      const c = { id, kind, x: Math.round(snapValue(cx - w / 2, this.snap)), y: Math.round(snapValue(cy, this.snap)), w, h };
      this.cols.push(c);
      this.csel = id;
    }, 'новая стена');
    this.refreshInfo(); this.refreshPanel();
    this.say('Новая стена. Тяните её и растягивайте квадратиками по краям; точные числа — справа.');
  }

  dupWall() {
    const c = this.selCol;
    if (!c) { this.say('Сначала выберите стену', true); return; }
    this.mutate(() => {
      const id = nextId(new Set(this.cols.map(x => x.id)), 'cn');
      const g = this.snap || 16;
      const copy={ ...clone(c), id, x: c.x + g * 2, y: c.y + g * 2 };delete copy.building;
      this.cols.push(copy);
      this.csel = id;
    }, 'копия стены');
    this.refreshInfo(); this.refreshPanel();
  }

  delWall() {
    const c = this.selCol;
    if (!c) { this.say('Сначала выберите стену', true); return; }
    this.mutate(() => { this.cols.splice(this.cols.indexOf(c), 1); this.csel = null; }, 'удаление стены');
    this.refreshInfo(); this.refreshPanel();
    this.say('Стена удалена (отмена вернёт её). Проверьте проходимость.');
  }

  sizeWall(dim, dir) {
    const c = this.selCol;
    if (!c) { this.say('Сначала выберите стену', true); return; }
    const step = this.snap || 16;
    this.mutate(() => { c[dim] = Math.max(10, c[dim] + dir * step); }, 'размер стены');
  }

  // ---- отрисовка режимов
  drawOverlay() {
    const g = this.tGfx;
    g.clear();
    if (this.mode === 'props') return;
    const z = this.cam.zoom;
    if (this.mode === 'walls') {
      for (const c of this.cols) {
        const col = COL_COLORS[c.kind] ?? 0xffffff, sel = c.id === this.csel;
        g.fillStyle(col, sel ? 0.34 : 0.16).fillRect(c.x, c.y, c.w, c.h);
        g.lineStyle((sel ? 3 : 1.5) / z, sel ? 0xffffff : col, sel ? 1 : 0.85).strokeRect(c.x, c.y, c.w, c.h);
      }
      const c = this.selCol;
      if (c) for (const h of TE.RECT_HANDLES) {
        const [px, py] = TE.handlePos(c, h), r = 9 / z;
        g.fillStyle(0xffffff, 1).fillRect(px - r, py - r, r * 2, r * 2);
        g.lineStyle(2 / z, 0x2b1d15, 1).strokeRect(px - r, py - r, r * 2, r * 2);
      }
      return;
    }
    // дороги и вода: ось линии, контур выбранной, ручки
    const line = (s, color, width, alpha) => {
      const pts = TE.centerline(s.pts);
      g.lineStyle(width / z, color, alpha).beginPath().moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.strokePath();
    };
    const all = [...this.roads.map(s => ({ s, kind: 'road' })), ...this.waters.map(s => ({ s, kind: 'water' }))];
    for (const { s, kind } of all) {
      const color = SHAPE_COLORS[s.type || s.kind];
      const sel = this.tsel && this.tsel.kind === kind && this.tsel.id === s.id;
      if (s.pts) {
        line(s, color, sel ? 4 : 2, sel ? 1 : 0.8);
        if (sel) { // как будет выглядеть форма: контур считается тем же кодом, что и в игре
          const poly = kind === 'road' ? buildRoad(s).poly : buildWater(s, 0, { rects: false }).poly;
          g.lineStyle(2 / z, 0xffe9a0, 0.9).beginPath().moveTo(poly[0][0], poly[0][1]);
          for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]);
          g.closePath().strokePath();
        }
      } else {
        const poly = buildWater(s, 0, { rects: false }).poly;
        g.lineStyle((sel ? 3 : 2) / z, sel ? 0xffe9a0 : color, 0.9).beginPath().moveTo(poly[0][0], poly[0][1]);
        for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]);
        g.closePath().strokePath();
      }
    }
    for (const h of this.handles()) {
      const sel = this.tsel && this.tsel.kind === h.kind && this.tsel.id === h.id;
      const r = (h.end ? 12 : 9) / z;
      g.fillStyle(sel ? 0xffffff : 0xd8d0bc, sel ? 1 : 0.9).fillCircle(h.x, h.y, r);
      g.lineStyle(2 / z, 0x2b1d15, 1).strokeCircle(h.x, h.y, r);
      if (sel && this.tsel.i === h.i) g.lineStyle(3 / z, 0xff6a5a, 1).strokeCircle(h.x, h.y, r + 6 / z);
    }
    const m = this.tdrag?.magnet;
    if (m) g.lineStyle(3 / z, 0xffe14a, 1).strokeCircle(m.x, m.y, 20 / z);
  }

  // ------------------------------------------------------------------ данные
  buildEdits() {
    const { props } = this.currentLists();
    return { ...diffEdits(services.map.base, props, diffPos([...INTERACTIVES, ...ENEMY_SPAWNS], this.pos)), ...diffTerrain({ roads: this.roads, waters: this.waters, colliders: this.cols,grounds:this.grounds }) };
  }

  /** Правки из файла игры (world.edits.js) в том же виде, что и buildEdits: с ними сравнивается черновик. */
  committedEdits() {
    if (!this.committed) {
      const m = resolveMap();
      this.committed = { ...diffEdits(m.base, m.props, diffPos([...INTERACTIVES, ...ENEMY_SPAWNS], m.pos)), ...diffTerrain({ roads: m.roads, waters: m.waters, colliders: m.colliders, grounds: m.grounds }) };
    }
    return this.committed;
  }

  countEdits(e = this.buildEdits()) {
    return Object.keys(e.props).length + e.add.length + Object.keys(e.pos).length + Object.keys(e.roads || {}).length + Object.keys(e.waters || {}).length + Object.keys(e.cols || {}).length+Object.keys(e.grounds||{}).length;
  }

  /** Строка внизу: сохранён ли черновик и сколько правок ещё не попало в файл игры. */
  updateSaved(ok, edits = null) {
    const n = countEditDiff(edits || this.buildEdits(), this.committedEdits());
    this.unsaved = n;
    this.panel.setSaved?.(!ok ? 'Черновик не сохранён — скачайте файл' : n ? `Черновик сохранён · не в игре: ${n}` : 'Всё как в игре', ok, n);
  }

  changed(push = true) {
    void push;
    if (this.batchDepth) { this.batchDirty = true; return; }
    this.batchDirty = false;
    this.invalidate();
    this.refreshPanel();
    this.refreshInfo();
    this.drawOverlay();
    this.drawSelection();
    if (this.showColliders) this.drawColliders();
    const edits = this.buildEdits();
    const ok = saveDraft(window.localStorage, edits);
    this.updateSaved(ok, edits);
    if (!ok) this.say('Не удалось сохранить черновик в браузере — скачайте файл правок (Файл → Скачать).', true);
  }

  check() {
    const { props, interactives, enemies } = this.currentLists();
    const removed=[...INTERACTIVES,...ENEMY_SPAWNS].filter(o=>this.pos[o.id]===null).map(o=>({id:o.id,text:`Сюжетный объект «${o.id}» удалён: связанные задания могут стать недоступны`}));
    const problems = [...removed,...checkWalkability({ colliders: this.cols, props, interactives, enemies, terrain: this.scene.terrain })];
    this.problems = problems;
    if (!problems.length) { this.panel.hideProblems?.(); this.say('✓ Проходимость в порядке: до всех мест можно дойти, закрытые проходы остаются закрытыми.'); return; }
    this.say('Проблемы:\n' + problems.slice(0, 5).map(p => '• ' + p.text).join('\n') + (problems.length > 5 ? `\n…и ещё ${problems.length - 5}` : ''), true);
    this.panel.showProblems?.(problems, `Проверка: ${problems.length} ${problems.length === 1 ? 'проблема' : problems.length < 5 ? 'проблемы' : 'проблем'}`);
    const first = this.find(problems[0].id);
    if (first) { this.cam.centerOn(first.x, first.y); if (this.mode === 'props') this.select(first.id); }
  }

  focusProblem(id) {
    if (this.mode !== 'props') this.setMode('props');
    if (this.find(id)) { this.focusEntity(id); return; }
    const cfg = [...INTERACTIVES, ...ENEMY_SPAWNS].find(o => o.id === id);
    if (cfg) { this.cam.centerOn(cfg.x, cfg.y); this.say(`«${id}» удалён. Ctrl+Z или «Отмена» вернут его, если удаление было недавно.`, true); }
  }

  fileText() { return exportEditsFile(this.buildEdits()); }

  async copy() {
    const text = this.fileText();
    try { await navigator.clipboard.writeText(text); this.say('Правки скопированы. Вставьте в src/config/world.edits.js или отправьте мне.'); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      let done = false; try { done = document.execCommand('copy'); } catch (err) { /* нет доступа к буферу */ }
      ta.remove();
      this.say(done ? 'Правки скопированы.' : 'Не удалось скопировать — воспользуйтесь «Скачать».', !done);
    }
  }

  async importFile(file) {
    if(!file)return;
    try{
      const edits=parseEditsFile(await file.text());
      if(!saveDraft(window.localStorage,edits))throw new Error('Не удалось сохранить черновик.');
      window.location.href=`${window.location.pathname}?edit`;
    }catch(e){this.say(`Не удалось загрузить правки: ${e.message}`,true);}
  }

  download() {
    const blob = new Blob([this.fileText()], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'world.edits.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.say('Файл world.edits.js скачан. Положите его в src/config/ (заменить) или отправьте мне.');
  }

  play() {
    this.changed(false);
    window.location.href = `${window.location.pathname}?draft&skipmenu`;
  }

  exit() { window.location.href = window.location.pathname; }

  reset() {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.say('Нажмите «Сбросить черновик» ещё раз, чтобы стереть все правки в этом браузере.', true);
      setTimeout(() => { this.resetArmed = false; }, 4000);
      return;
    }
    clearDraft(window.localStorage);
    window.location.href = `${window.location.pathname}?edit&nodraft`;
  }
}
