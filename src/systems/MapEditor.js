import { DEPTH, VIEW } from '../config/game.config.js';
import { WORLD, INTERACTIVES, ENEMY_SPAWNS } from '../config/world.layout.js';
import { services } from '../services.js';
import { buildEditorPanel } from '../ui/editorPanel.js';
import { History, pickAt, snapValue, nextId, clamp } from '../world/editorCore.js';
import { diffEdits, diffPos, diffTerrain, saveDraft, clearDraft, exportEditsFile } from '../world/mapData.js';
import { buildRoad, buildWater } from '../world/terrain.js';
import * as TE from '../world/terrainEdit.js';
import { collectSolids, propSolid, baseSolid } from '../world/solids.js';
import { checkWalkability } from '../world/check.js';
import { propName } from '../world/propDefs.js';
import { applyDisplaySize } from '../objects/InteractiveObject.js';

const SNAPS = [0, 8, 16, 32];
const clone = (v) => JSON.parse(JSON.stringify(v));
const COL_COLORS = { trees: 0x58c46a, wall: 0xd9a066, ruin: 0xb0b4c4, furniture: 0xe8d37a };
const SHAPE_COLORS = { dirt: 0xe8a36a, stone: 0xc9d2e0, river: 0x5cc8ff, blob: 0x5cc8ff };
const KIND_NAMES = { dirt: 'тропа', stone: 'каменная дорога', river: 'ручей', blob: 'водоём', trees: 'лес', wall: 'стена дома', ruin: 'руины', furniture: 'мебель' };
const TOP = DEPTH.markers + 50;

/**
 * MapEditor — режим ?edit. Карта остаётся живой, героиня стоит на месте.
 * Касание выбирает объект, перетаскивание двигает, пустое место — двигает камеру, колесо/щипок — масштаб.
 * Три режима: «Объекты» (деревья, камни…), «Дороги и река» (точки линий, ширина, стыки) и «Стены» (прямоугольники коллизий).
 * Правки идут в черновик (localStorage) и экспортируются файлом world.edits.js.
 */
export class MapEditor {
  constructor(scene) {
    this.scene = scene;
    this.cam = scene.cameras.main;
    this.history = new History();
    this.snapIdx = 0;
    this.showColliders = false;
    this.selectedId = null;
    this.drag = null;
    this.pan = null;
    this.pinch = null;
    this.moved = false;
    this.pos = { ...(services.map.pos || {}) };
    this.resetArmed = false;
    this.mode = 'props';
    // рабочие копии дорог, воды и стен: меняются в редакторе, а сцена получает из них новые копии при каждой правке
    this.roads = clone(services.map.roads);
    this.waters = clone(services.map.waters);
    this.cols = clone(services.map.colliders);
    this.applied = { terrain: this.terrainKey(), cols: JSON.stringify(this.cols) };
    this.tsel = null;     // выбранное в режиме дорог: { kind: 'road'|'water', id, i (точка) | null, seg (отрезок) | null }
    this.csel = null;     // id выбранной стены
    this.tdrag = null;
    this.magnetOn = true;
    this.lastZoom = 0;

    services.mode = 'edit';
    scene.player.stop();
    this.cam.stopFollow();
    this.cam.removeBounds();
    this.cam.setZoom(0.55);
    this.cam.centerOn(scene.player.x, scene.player.y - 200);
    this.freezeWorld();

    this.gfx = scene.add.graphics().setDepth(TOP);
    this.colGfx = scene.add.graphics().setDepth(TOP - 1);
    this.tGfx = scene.add.graphics().setDepth(TOP - 2);
    this.panel = buildEditorPanel({
      undo: () => this.doUndo(), redo: () => this.doRedo(),
      dup: () => this.duplicate(), flip: () => this.flip(), bigger: () => this.rescale(1.1), smaller: () => this.rescale(1 / 1.1),
      delete: () => this.remove(),
      snap: () => this.cycleSnap(), colliders: () => this.toggleColliders(),
      fit: () => this.fit(), hero: () => this.cam.centerOn(scene.player.x, scene.player.y),
      add: (key) => this.addProp(key),
      check: () => this.check(),
      play: () => this.play(), copy: () => this.copy(), download: () => this.download(),
      reset: () => this.reset(), exit: () => this.exit(),
      mode_props: () => this.setMode('props'), mode_terrain: () => this.setMode('terrain'), mode_walls: () => this.setMode('walls'),
      pt_add: () => this.ptAdd(), pt_add_start: () => this.ptAddStart(), pt_del: () => this.ptDel(),
      wider: () => this.widen(1), narrower: () => this.widen(-1), smooth: () => this.smooth(), join: () => this.join(),
      magnet: () => { this.magnetOn = !this.magnetOn; this.refreshPanel(); },
      road_new: () => this.newRoad('dirt'), stone_new: () => this.newRoad('stone'), pond_new: () => this.newPond(), shape_del: () => this.delShape(),
      road_joined: () => this.newRoad('dirt', true), stone_joined: () => this.newRoad('stone', true), seamless: () => this.toggleSeamless(),
      wall_add: (kind) => this.newWall(kind), wall_dup: () => this.dupWall(), wall_del: () => this.delWall(),
      w_plus: () => this.sizeWall('w', 1), w_minus: () => this.sizeWall('w', -1), h_plus: () => this.sizeWall('h', 1), h_minus: () => this.sizeWall('h', -1),
    });

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.input.on('wheel', this.onWheel, this);
    scene.input.keyboard.on('keydown', this.onKey, this);
    scene.events.on('update', this.tick, this);
    scene.events.once('shutdown', () => { this.panel.destroy(); scene.events.off('update', this.tick, this); });

    this.panel.setMode('props');
    this.refreshPanel();
    this.panel.setStatus(services.map.fromDraft ? `Загружен черновик · правок: ${this.countEdits()}` : 'Правок пока нет. Всё, что вы сдвинете, сохранится в этом браузере.');
  }

  // ------------------------------------------------------------------ мир в режиме правки
  /** Убираем всё, что «живёт» само: качание огонька, подсказки, маркеры. И показываем скрытое событиями. */
  freezeWorld() {
    const s = this.scene;
    for (const o of s.objects) {
      s.tweens.killTweensOf(o.sprite);
      o.sprite.setVisible(true).setAlpha(1);
      if (o.baseScale) o.sprite.setScale(o.baseScale.x, o.baseScale.y).setAngle(0);
      for (const g of o.glows || []) g.setVisible(true);
      o.onFreeze?.();
    }
    for (const e of s.enemies) {
      e.idle?.stop();
      [e.sprite, e.nameText, e.ring].forEach(x => x && x.setVisible(true).setAlpha(1));
    }
  }

  // ------------------------------------------------------------------ сущности
  propViews() { return [...this.scene.propViews.values()]; }

  entities() {
    const s = this.scene, out = [];
    const sprite = (spr) => () => ({ x0: spr.x - spr.displayWidth / 2, y0: spr.y - spr.displayHeight, x1: spr.x + spr.displayWidth / 2, y1: spr.y });
    for (const v of this.propViews()) {
      out.push({ id: v.p.id, kind: 'prop', ref: v, get x() { return v.p.x; }, get y() { return v.p.y; }, bounds: sprite(v.img) });
    }
    for (const o of s.objects) out.push({ id: o.id, kind: 'obj', ref: o, get x() { return o.x; }, get y() { return o.baseY; }, bounds: sprite(o.sprite) });
    for (const e of s.enemies) out.push({ id: e.id, kind: 'enemy', ref: e, get x() { return e.cfg.x; }, get y() { return e.cfg.y; }, bounds: sprite(e.sprite) });
    return out;
  }

  find(id) { return this.entities().find(e => e.id === id) || null; }
  get selected() { return this.selectedId ? this.find(this.selectedId) : null; }

  moveEntity(e, x, y) {
    if (e.kind === 'prop') {
      const v = e.ref;
      v.p.x = x; v.p.y = y;
      this.scene.placePropView(v);
      this.syncGlow(v);
    } else if (e.kind === 'obj') {
      const o = e.ref, dx = x - o.x, dy = y - o.baseY;
      o.cfg.x = x; o.cfg.y = y;
      if (o.cfg.target) o.cfg.target = { x: o.cfg.target.x + dx, y: o.cfg.target.y + dy };
      if (o.target_position) o.target_position = { ...o.cfg.target };
      o.sprite.setPosition(x, y - (o.cfg.elevated || 0)).setDepth(DEPTH.mainBase + y);
      o.baseY = y;
      for (const g of o.glows || []) g.setPosition(g.x + dx, g.y + dy);
      o.relocate?.(dx, dy);
      if (o.blocker) { o.blocker.setPosition(x, y - o.cfg.collide.h / 2); o.blocker.body.updateFromGameObject(); }
      this.pos[o.id] = { x, y };
    } else {
      const t = e.ref;
      t.cfg.x = x; t.cfg.y = y;
      t.sprite.setPosition(x, y).setDepth(DEPTH.mainBase + y);
      t.nameText.setPosition(x, y - t.sprite.displayHeight - 14);
      t.ring.setPosition(x, y);
      if (t.blocker) { t.blocker.setPosition(x, y - t.cfg.collide.h / 2); t.blocker.body.updateFromGameObject(); }
      this.pos[t.id] = { x, y };
    }
  }

  syncGlow(v) {
    if (v.glow) v.glow.setPosition(v.p.x, v.p.y - v.img.displayHeight + 12);
  }

  restyle(v) {
    const { p, img } = v;
    applyDisplaySize(img, p.k);
    if (p.s) img.setScale(img.scaleX * p.s, img.scaleY * p.s);
    img.setFlipX(!!p.f);
    this.scene.placePropView(v);
    this.syncGlow(v);
  }

  // ------------------------------------------------------------------ ввод
  worldPoint(pointer) { return this.cam.getWorldPoint(pointer.x, pointer.y); }

  onDown(pointer) {
    const input = this.scene.input;
    if (input.pointer1?.isDown && input.pointer2?.isDown) { this.startPinch(); return; }
    const wp = this.worldPoint(pointer);
    this.moved = false;
    if (this.mode === 'terrain') { this.downTerrain(pointer, wp); return; }
    if (this.mode === 'walls') { this.downWalls(pointer, wp); return; }
    const hit = pickAt(this.entities(), wp.x, wp.y, 8 / this.cam.zoom);
    if (hit) {
      this.select(hit.id);
      this.drag = { id: hit.id, dx: hit.x - wp.x, dy: hit.y - wp.y, fromX: hit.x, fromY: hit.y };
      this.pan = null;
    } else {
      this.pan = { sx: pointer.x, sy: pointer.y, camX: this.cam.scrollX, camY: this.cam.scrollY, moved: false };
      this.drag = null;
    }
  }

  onMove(pointer) {
    const input = this.scene.input;
    if (input.pointer1?.isDown && input.pointer2?.isDown) { this.updatePinch(); return; }
    this.pinch = null;
    if (!pointer.isDown) return;
    if (this.tdrag) { this.moveT(pointer); return; }
    if (this.drag) {
      const e = this.find(this.drag.id);
      if (!e) return;
      const wp = this.worldPoint(pointer);
      const x = clamp(snapValue(wp.x + this.drag.dx, this.snap), 0, WORLD.width);
      const y = clamp(snapValue(wp.y + this.drag.dy, this.snap), 0, WORLD.height + 500);
      if (x !== e.x || y !== e.y) { this.moveEntity(e, x, y); this.moved = true; this.drawSelection(); this.refreshInfo(); if (this.showColliders) this.drawColliders(); }
    } else if (this.pan) {
      const dx = pointer.x - this.pan.sx, dy = pointer.y - this.pan.sy;
      if (Math.hypot(dx, dy) > 5) this.pan.moved = true;
      this.cam.scrollX = this.pan.camX - dx / this.cam.zoom;
      this.cam.scrollY = this.pan.camY - dy / this.cam.zoom;
    }
  }

  onUp() {
    const input = this.scene.input;
    if (this.pinch && !(input.pointer1?.isDown && input.pointer2?.isDown)) this.pinch = null;
    if (this.tdrag) { this.finishT(); return; }
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      const e = this.find(d.id);
      if (e && (e.x !== d.fromX || e.y !== d.fromY)) {
        const to = { x: e.x, y: e.y };
        this.history.push({
          label: 'move',
          undo: () => this.applyMove(d.id, d.fromX, d.fromY),
          redo: () => this.applyMove(d.id, to.x, to.y),
        });
        this.changed();
      }
    } else if (this.pan) {
      if (!this.pan.moved) { if (this.pan.onTap) this.pan.onTap(); else this.select(null); } // короткое касание: выбор того, что под пальцем, или снятие выбора
      this.pan = null;
    }
  }

  onWheel(pointer, objs, dx, dy) {
    this.zoomAt(pointer.x, pointer.y, dy > 0 ? 0.88 : 1.14);
  }

  zoomAt(px, py, factor) {
    const cam = this.cam;
    const before = cam.getWorldPoint(px, py);
    cam.setZoom(clamp(cam.zoom * factor, 0.18, 2.6));
    const after = cam.getWorldPoint(px, py);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  startPinch() {
    const { pointer1: a, pointer2: b } = this.scene.input;
    this.drag = null; this.pan = null;
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

  onKey(e) {
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const sel = this.selected;
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault?.(); (e.shiftKey ? this.doRedo() : this.doUndo()); return; }
    if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault?.(); this.doRedo(); return; }
    if (this.mode !== 'props') { if (this.onKeyMode(e)) return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault?.(); this.remove(); return; }
    if (k === 'Escape') { this.select(null); return; }
    if (k === 'd' || k === 'D') { this.duplicate(); return; }
    if (k === 'f' || k === 'F') { this.flip(); return; }
    if (k === 'g' || k === 'G') { this.cycleSnap(); return; }
    if (k === 'c' || k === 'C') { this.toggleColliders(); return; }
    if (k === '+' || k === '=') { this.rescale(1.1); return; }
    if (k === '-' || k === '_') { this.rescale(1 / 1.1); return; }
    const step = e.shiftKey ? 10 : 1;
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[k] && sel) { e.preventDefault?.(); this.nudge(sel, dirs[k][0] * step, dirs[k][1] * step); return; }
    const pan = { a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[k];
    if (pan) { this.cam.scrollX += pan[0] * 80 / this.cam.zoom; this.cam.scrollY += pan[1] * 80 / this.cam.zoom; }
  }

  nudge(e, dx, dy) {
    const fx = e.x, fy = e.y, id = e.id;
    this.moveEntity(e, fx + dx, fy + dy);
    const to = { x: fx + dx, y: fy + dy };
    this.history.push({ label: 'nudge', undo: () => this.applyMove(id, fx, fy), redo: () => this.applyMove(id, to.x, to.y) });
    this.drawSelection(); this.refreshInfo(); this.changed();
  }

  applyMove(id, x, y) {
    const e = this.find(id);
    if (e) { this.moveEntity(e, x, y); this.select(id); }
    if (this.showColliders) this.drawColliders();
    this.changed(false);
  }

  // ------------------------------------------------------------------ действия
  get snap() { return SNAPS[this.snapIdx]; }

  select(id) {
    this.selectedId = id;
    this.drawSelection();
    this.refreshInfo();
    this.refreshPanel();
  }

  addProp(key) {
    const v = this.cam.worldView;
    const taken = new Set(this.propViews().map(x => x.p.id));
    const p = { id: nextId(taken), k: key, x: Math.round(snapValue(v.centerX, this.snap)), y: Math.round(snapValue(v.centerY + 40, this.snap)) };
    this.createProp(p, true);
  }

  createProp(p, select = false) {
    this.scene.addProp(p);
    const id = p.id;
    this.history.push({
      label: 'add',
      undo: () => { this.destroyProp(id); this.select(null); },
      redo: () => { this.scene.addProp(p); this.select(id); },
    });
    if (select) this.select(id);
    this.changed();
  }

  destroyProp(id) {
    const v = this.scene.propViews.get(id);
    if (!v) return;
    v.img.destroy(); v.glow?.destroy(); v.blocker?.destroy();
    this.scene.propViews.delete(id);
  }

  duplicate() {
    const e = this.selected;
    if (!e || e.kind !== 'prop') { this.say('Копировать можно только декор (деревья, кусты, камни…)'); return; }
    const taken = new Set(this.propViews().map(x => x.p.id));
    const g = this.snap || 8;
    this.createProp({ ...e.ref.p, id: nextId(taken), x: e.x + g * 3, y: e.y + g * 2 }, true);
  }

  remove() {
    const e = this.selected;
    if (!e) return;
    if (e.kind !== 'prop') { this.say('Интерактивные объекты и врагов удалять нельзя — только двигать'); return; }
    const p = { ...e.ref.p };
    this.destroyProp(p.id);
    this.select(null);
    this.history.push({
      label: 'delete',
      undo: () => { this.scene.addProp(p); this.select(p.id); },
      redo: () => { this.destroyProp(p.id); this.select(null); },
    });
    this.changed();
  }

  flip() {
    const e = this.selected;
    if (!e || e.kind !== 'prop') return;
    const v = e.ref, id = e.id;
    const set = (f) => { const vv = this.scene.propViews.get(id); if (vv) { if (f) vv.p.f = 1; else delete vv.p.f; this.restyle(vv); } };
    const before = v.p.f ? 1 : 0;
    set(!before);
    this.history.push({ label: 'flip', undo: () => set(before), redo: () => set(!before) });
    this.refreshInfo(); this.changed();
  }

  rescale(factor) {
    const e = this.selected;
    if (!e || e.kind !== 'prop') return;
    const id = e.id, before = e.ref.p.s || 1, after = Math.round(clamp(before * factor, 0.4, 2.6) * 100) / 100;
    if (after === before) return;
    const set = (s) => { const vv = this.scene.propViews.get(id); if (vv) { if (Math.abs(s - 1) < 0.005) delete vv.p.s; else vv.p.s = s; this.restyle(vv); this.drawSelection(); this.refreshInfo(); } };
    set(after);
    this.history.push({ label: 'scale', undo: () => set(before), redo: () => set(after) });
    this.changed();
  }

  cycleSnap() {
    this.snapIdx = (this.snapIdx + 1) % SNAPS.length;
    this.refreshPanel();
  }

  toggleColliders() {
    this.showColliders = !this.showColliders;
    if (this.showColliders) this.drawColliders(); else this.colGfx.clear();
    this.refreshPanel();
  }

  fit() {
    this.cam.setZoom(clamp(VIEW.width / (WORLD.width + 80), 0.18, 1));
    this.cam.centerOn(WORLD.width / 2, this.cam.worldView.centerY);
  }

  doUndo() { const op = this.history.undo(); if (op) { this.changed(false); this.drawSelection(); } this.refreshPanel(); }
  doRedo() { const op = this.history.redo(); if (op) { this.changed(false); this.drawSelection(); } this.refreshPanel(); }

  // ------------------------------------------------------------------ отрисовка
  drawSelection() {
    const g = this.gfx;
    g.clear();
    const e = this.selected;
    if (!e) return;
    const z = this.cam.zoom, b = e.bounds();
    const col = e.kind === 'prop' ? 0x4fe3c1 : e.kind === 'obj' ? 0xe8c56a : 0xff6a5a;
    g.lineStyle(2 / z, col, 1).strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    // точка основания и «след» коллизии
    g.lineStyle(2 / z, 0xffffff, 0.9).strokeCircle(e.x, e.y, 5 / z);
    const s = e.kind === 'prop' ? propSolid(e.ref.p) : baseSolid(e.ref.cfg);
    if (s) { g.fillStyle(0xff3b2f, 0.3).fillRect(s.x, s.y, s.w, s.h); g.lineStyle(1.5 / z, 0xff3b2f, 1).strokeRect(s.x, s.y, s.w, s.h); }
  }

  currentLists() {
    const props = this.propViews().map(v => v.p);
    const interactives = this.scene.objects.map(o => o.cfg);
    const enemies = this.scene.enemies.map(e => e.cfg);
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
  infoTerrain() {
    const sh = this.selShape;
    if (!sh) return 'Дороги и река. Тяните белые кружки — точки линий. Коснитесь линии — выбрать её. Пустое место — двигать карту.';
    const kind = KIND_NAMES[sh.type === 'river' ? 'river' : sh.type === 'blob' ? 'blob' : sh.kind] + (sh.kind ? (sh.seamless ? ' · без швов' : ' · со швом') : '');
    if (!sh.pts) return `Водоём «${sh.id}» (${kind})\nцентр ${sh.cx}, ${sh.cy}  размер ${sh.rx}×${sh.ry}`;
    const size = sh.type === 'river' ? `ширина ${sh.base * 2}–${(sh.base + sh.extra) * 2}` : `ширина ${sh.w}`;
    const pt = this.tsel.i != null ? `\nточка ${this.tsel.i + 1} из ${sh.pts.length}: ${sh.pts[this.tsel.i][0]}, ${sh.pts[this.tsel.i][1]}` : `\nточек ${sh.pts.length}; выбран отрезок ${(this.tsel.seg ?? 0) + 1}`;
    return `${sh.type === 'river' ? 'Ручей' : 'Дорога'} «${sh.id}» (${kind}), ${size}${pt}`;
  }

  infoWall() {
    const c = this.selCol;
    if (!c) return 'Стены — прямоугольники, через которые нельзя пройти. Коснитесь, чтобы выбрать; тяните — двигать.';
    const note = c.kind === 'trees' ? '\nЛес закрывает проход; сами деревья ставятся в режиме «Объекты».' : '';
    return `${KIND_NAMES[c.kind] || c.kind}${c.label ? ' «' + c.label + '»' : ''} · ${c.id}\nx ${c.x}  y ${c.y}  ${c.w}×${c.h}${note}`;
  }

  refreshInfo() {
    if (this.mode === 'terrain') { this.panel.setInfo(this.infoTerrain()); return; }
    if (this.mode === 'walls') { this.panel.setInfo(this.infoWall()); return; }
    const e = this.selected;
    if (!e) { this.panel.setInfo('Коснитесь объекта, чтобы выбрать. Тяните — переместить. Пустое место — двигать карту.'); return; }
    if (e.kind === 'prop') {
      const p = e.ref.p;
      this.panel.setInfo(`${propName(p.k)} · ${p.id}${p.fill ? ' · лес (заполнитель)' : ''}\nx ${p.x}  y ${p.y}  масштаб ${p.s || 1}${p.f ? '  зеркало' : ''}`);
    } else {
      this.panel.setInfo(`${e.kind === 'obj' ? 'Объект' : 'Враг'} «${e.id}»\nx ${e.x}  y ${e.y}`);
    }
  }

  refreshPanel() {
    const p = this.panel, e = this.selected, isProp = !!e && e.kind === 'prop';
    p.setEnabled('undo', this.history.canUndo); p.setEnabled('redo', this.history.canRedo);
    p.setEnabled('dup', isProp); p.setEnabled('flip', isProp); p.setEnabled('bigger', isProp); p.setEnabled('smaller', isProp); p.setEnabled('delete', isProp);
    p.setToggle('snap', this.snap > 0, `Сетка: ${this.snap || 'нет'}`);
    p.setToggle('colliders', this.showColliders);
    p.setToggle('magnet', this.magnetOn);
    const sh = this.selShape, hasPt = !!sh && this.tsel.i != null && !!sh.pts, c = this.selCol;
    for (const n of ['pt_add', 'wider', 'narrower', 'smooth', 'shape_del']) p.setEnabled(n, !!sh);
    p.setEnabled('pt_add_start', !!sh?.pts); p.setEnabled('pt_del', hasPt);
    p.setEnabled('join', hasPt && this.tsel.kind === 'road');
    p.setEnabled('seamless', !!sh && this.tsel?.kind === 'road');
    p.setToggle('seamless', !!sh?.seamless, sh?.seamless ? 'Стыки: без швов' : 'Стыки: со швом');
    for (const n of ['wall_dup', 'wall_del', 'w_plus', 'w_minus', 'h_plus', 'h_minus']) p.setEnabled(n, !!c);
  }

  say(text, warn = false) { this.panel.setStatus(text, warn); }

  // ------------------------------------------------------------------ режимы: дороги, река, стены
  terrainKey() { return JSON.stringify([this.roads, this.waters]); }
  snapshot() { return JSON.stringify({ roads: this.roads, waters: this.waters, cols: this.cols }); }

  tick() {
    if (this.cam.zoom !== this.lastZoom) { this.lastZoom = this.cam.zoom; this.drawOverlay(); if (this.mode === 'props') this.drawSelection(); }
  }

  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    this.drag = null; this.tdrag = null; this.pan = null;
    this.tsel = null; this.csel = null;
    this.selectedId = null;
    this.panel.setMode(m);
    this.drawSelection();
    this.drawOverlay();
    this.refreshInfo();
    this.refreshPanel();
    this.say(m === 'terrain' ? 'Дороги и река: тяните белые кружки — это точки линий. Коснитесь линии — выбрать её, «＋ Точка» — добавить изгиб.'
      : m === 'walls' ? 'Стены: коснитесь прямоугольника, чтобы выбрать; тяните — двигать; квадратики по краям — менять размер.'
      : 'Объекты: коснитесь, чтобы выбрать.');
  }

  /** Применяет рабочие списки к живому миру: пересобирает то, что изменилось. */
  applyLive() {
    const t = this.terrainKey();
    if (t !== this.applied.terrain) { this.applied.terrain = t; this.scene.rebuildTerrain(clone(this.roads), clone(this.waters)); }
    const c = JSON.stringify(this.cols);
    if (c !== this.applied.cols) { this.applied.cols = c; this.scene.rebuildColliders(clone(this.cols)); }
  }

  /** Записывает в историю правку дорог/воды/стен: before — снимок до, текущее состояние — после. */
  commitLists(before) {
    const after = this.snapshot();
    if (after === before) return false;
    this.history.push({ label: 'lists', undo: () => this.restoreSnapshot(before), redo: () => this.restoreSnapshot(after) });
    this.applyLive();
    this.changed();
    return true;
  }

  restoreSnapshot(str) {
    const d = JSON.parse(str);
    this.roads = d.roads; this.waters = d.waters; this.cols = d.cols;
    this.applyLive();
    if (this.tsel && !this.shapeOf(this.tsel)) this.tsel = null;
    if (this.csel && !this.cols.find(c => c.id === this.csel)) this.csel = null;
    if (this.tsel?.i != null) { const sh = this.shapeOf(this.tsel); if (sh?.pts && this.tsel.i >= sh.pts.length) this.tsel.i = sh.pts.length - 1; }
  }

  /** Правка списка одной функцией; она может вернуть false — «ничего не сделано». */
  mutate(fn) {
    const before = this.snapshot();
    if (fn() === false) return false;
    return this.commitLists(before);
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
    this.waters.forEach(w => test('water', w, w.base || 0));
    return best;
  }

  selectT(sel) {
    this.tsel = sel;
    this.drawOverlay(); this.refreshInfo(); this.refreshPanel();
  }

  downTerrain(pointer, wp) {
    const tol = 26 / this.cam.zoom;
    let hit = null, bd = tol;
    for (const h of this.handles()) { const d = Math.hypot(h.x - wp.x, h.y - wp.y); if (d < bd) { bd = d; hit = h; } }
    if (hit) {
      this.selectT({ kind: hit.kind, id: hit.id, i: hit.i, seg: null });
      this.tdrag = { type: 'pt', sel: { kind: hit.kind, id: hit.id }, i: hit.i, before: this.snapshot(), moved: false, dx: hit.x - wp.x, dy: hit.y - wp.y, magnet: null };
      this.pan = null;
      return;
    }
    const seg = this.segmentHit(wp.x, wp.y);
    this.pan = { sx: pointer.x, sy: pointer.y, camX: this.cam.scrollX, camY: this.cam.scrollY, moved: false, onTap: () => this.selectT(seg) };
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
    this.pan = { sx: pointer.x, sy: pointer.y, camX: this.cam.scrollX, camY: this.cam.scrollY, moved: false, onTap: () => this.selectC(null) };
  }

  selectC(id) { this.csel = id; this.drawOverlay(); this.refreshInfo(); this.refreshPanel(); }

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
    if (!d.moved) { this.drawOverlay(); return; }
    d.magnet = null;
    this.commitLists(d.before);
    this.drawOverlay();
  }

  onKeyMode(e) {
    const k = e.key;
    const step = e.shiftKey ? 10 : 1;
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (this.mode === 'terrain') {
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault?.(); this.ptDel(); return true; }
      if (k === 'Escape') { this.selectT(null); return true; }
      if (dirs[k] && this.tsel?.i != null) { e.preventDefault?.(); this.nudgeT(dirs[k][0] * step, dirs[k][1] * step); return true; }
    } else {
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault?.(); this.delWall(); return true; }
      if (k === 'Escape') { this.selectC(null); return true; }
      if (k === 'd' || k === 'D') { this.dupWall(); return true; }
      if (dirs[k] && this.selCol) { e.preventDefault?.(); this.nudgeW(dirs[k][0] * step, dirs[k][1] * step); return true; }
    }
    return false;
  }

  nudgeT(dx, dy) {
    this.mutate(() => {
      const sh = this.selShape;
      if (!sh) return false;
      if (sh.pts) sh.pts[this.tsel.i] = [sh.pts[this.tsel.i][0] + dx, sh.pts[this.tsel.i][1] + dy]; else { sh.cx += dx; sh.cy += dy; }
    });
  }

  nudgeW(dx, dy) { this.mutate(() => { const c = this.selCol; if (!c) return false; c.x += dx; c.y += dy; }); }

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
    });
    this.say('Точка добавлена. Потяните её, чтобы выгнуть линию.');
  }

  ptAddStart() {
    const sh = this.needShape();
    if (!sh) return;
    if (!sh.pts) { this.say('У водоёма-пятна одна точка — центр.', true); return; }
    this.mutate(() => { const r = TE.addPointBefore(sh.pts); sh.pts = r.pts; this.tsel = { ...this.tsel, i: 0, seg: null }; });
    this.say('Линия продолжена в начале. Потяните новую точку на место.');
  }

  ptDel() {
    const sh = this.needShape('Выберите точку, которую нужно убрать');
    if (!sh) return;
    if (!sh.pts || this.tsel.i == null) { this.say('Выберите точку (белый кружок) на линии', true); return; }
    const r = TE.removePoint(sh.pts, this.tsel.i);
    if (!r) { this.say('В линии должно остаться минимум две точки. Чтобы убрать всю линию — «Убрать всю линию».', true); return; }
    this.mutate(() => { sh.pts = r; this.tsel = { ...this.tsel, i: Math.min(this.tsel.i, r.length - 1) }; });
  }

  widen(dir) {
    const sh = this.needShape();
    if (!sh) return;
    const f = dir > 0 ? 1.1 : 1 / 1.1;
    this.mutate(() => {
      if (sh.type === 'river') { sh.base = Math.round(clamp(sh.base * f, 20, 160)); sh.extra = Math.round(clamp(sh.extra * f, 8, 90)); }
      else if (sh.type === 'blob') { sh.rx = Math.round(clamp(sh.rx * f, 24, 500)); sh.ry = Math.round(clamp(sh.ry * f, 24, 500)); }
      else sh.w = Math.round(clamp(sh.w + dir * 8, 40, 260));
    });
  }

  smooth() {
    const sh = this.needShape();
    if (!sh) return;
    if (!sh.pts) { this.say('Сглаживать нечего: у водоёма-пятна нет изгибов.', true); return; }
    if (sh.pts.length < 3) { this.say('Для сглаживания нужны три точки и больше.', true); return; }
    this.mutate(() => { sh.pts = TE.smoothPoints(sh.pts); });
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
    this.mutate(() => { sh.pts[i] = [m.x, m.y]; });
    this.say(`Конец прижат к дороге «${m.id}»${m.kind === 'point' ? ' (к её точке)' : ''}. Если стык всё ещё кривой — подвиньте соседнюю точку.`);
  }

  toggleSeamless() {
    const sh = this.selShape;
    if (!sh || this.tsel?.kind !== 'road') return;
    this.mutate(() => { sh.seamless = !sh.seamless; });
    this.say(sh.seamless ? 'Дорога объединяется без швов с бесшовными дорогами того же материала.' : 'Вернули дорогу со швом.');
  }

  newRoad(kind, seamless = false) {
    const v = this.cam.worldView, cx = Math.round(snapValue(v.centerX, this.snap)), cy = Math.round(snapValue(v.centerY, this.snap));
    this.mutate(() => {
      const id = nextId(new Set(this.roads.map(r => r.id)), 'rd');
      const r = { id, kind, ...(seamless ? { seamless: true } : {}), w: kind === 'stone' ? 120 : 100, n: TE.nextNoise(this.roads, this.waters), pts: [[cx - 140, cy], [cx, cy - 24], [cx + 140, cy]] };
      this.roads.push(r);
      this.tsel = { kind: 'road', id, i: 1, seg: null };
    });
    this.say('Новая дорога в центре экрана. Растяните её точками и примкните концами к другим дорогам.');
  }

  newPond() {
    const v = this.cam.worldView, cx = Math.round(snapValue(v.centerX, this.snap)), cy = Math.round(snapValue(v.centerY, this.snap));
    this.mutate(() => {
      const id = nextId(new Set(this.waters.map(r => r.id)), 'wt');
      const n = TE.nextNoise(this.roads, this.waters);
      this.waters.push({ id, type: 'blob', cx, cy, rx: 90, ry: 70, seed: 3 + n * 7, amp: 0.14, n });
      this.tsel = { kind: 'water', id, i: 0, seg: null };
    });
    this.say('Новый водоём в центре экрана. Тяните центр, размер — «Шире» и «Уже». Вода непроходима.');
  }

  delShape() {
    const sh = this.needShape();
    if (!sh) return;
    this.mutate(() => {
      const list = this.tsel.kind === 'road' ? this.roads : this.waters;
      list.splice(list.indexOf(sh), 1);
      this.tsel = null;
    });
    this.say('Линия убрана (отмена вернёт её). Проверьте проходимость.');
  }

  // ---- стены
  newWall(kind) {
    const v = this.cam.worldView;
    this.mutate(() => {
      const id = nextId(new Set(this.cols.map(c => c.id)), 'cn');
      const w = kind === 'trees' ? 200 : 200, h = kind === 'trees' ? 120 : kind === 'furniture' ? 60 : 40;
      const c = { id, kind, x: Math.round(snapValue(v.centerX - w / 2, this.snap)), y: Math.round(snapValue(v.centerY, this.snap)), w, h };
      this.cols.push(c);
      this.csel = id;
    });
    this.say('Новая стена в центре экрана. Тяните её и растягивайте квадратиками по краям.');
  }

  dupWall() {
    const c = this.selCol;
    if (!c) { this.say('Сначала выберите стену', true); return; }
    this.mutate(() => {
      const id = nextId(new Set(this.cols.map(x => x.id)), 'cn');
      const g = this.snap || 16;
      this.cols.push({ ...clone(c), id, x: c.x + g * 2, y: c.y + g * 2 });
      this.csel = id;
    });
  }

  delWall() {
    const c = this.selCol;
    if (!c) { this.say('Сначала выберите стену', true); return; }
    this.mutate(() => { this.cols.splice(this.cols.indexOf(c), 1); this.csel = null; });
    this.say('Стена удалена (отмена вернёт её). Проверьте проходимость.');
  }

  sizeWall(dim, dir) {
    const c = this.selCol;
    if (!c) { this.say('Сначала выберите стену', true); return; }
    const step = this.snap || 16;
    this.mutate(() => { c[dim] = Math.max(10, c[dim] + dir * step); });
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
      const color = SHAPE_COLORS[s.type === 'river' ? 'river' : s.type === 'blob' ? 'blob' : s.kind];
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
    return { ...diffEdits(services.map.base, props, diffPos([...INTERACTIVES, ...ENEMY_SPAWNS], this.pos)), ...diffTerrain({ roads: this.roads, waters: this.waters, colliders: this.cols }) };
  }

  countEdits() {
    const e = this.buildEdits();
    return Object.keys(e.props).length + e.add.length + Object.keys(e.pos).length + Object.keys(e.roads || {}).length + Object.keys(e.waters || {}).length + Object.keys(e.cols || {}).length;
  }

  changed(push = true) {
    void push;
    this.refreshPanel();
    this.refreshInfo();
    this.drawOverlay();
    if (this.showColliders) this.drawColliders();
    const ok = saveDraft(window.localStorage, this.buildEdits());
    this.say(ok ? `Черновик сохранён · правок: ${this.countEdits()}` : 'Не удалось сохранить черновик в браузере — скачайте файл правок', !ok);
  }

  check() {
    const { props, interactives, enemies } = this.currentLists();
    const problems = checkWalkability({ colliders: this.cols, props, interactives, enemies, terrain: this.scene.terrain });
    if (!problems.length) { this.say('✓ Проходимость в порядке: до всех мест можно дойти, закрытые проходы остаются закрытыми.'); return; }
    this.say('Проблемы:\n' + problems.slice(0, 5).map(p => '• ' + p.text).join('\n') + (problems.length > 5 ? `\n…и ещё ${problems.length - 5}` : ''), true);
    const first = this.find(problems[0].id);
    if (first) { this.cam.centerOn(first.x, first.y); this.select(first.id); }
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
