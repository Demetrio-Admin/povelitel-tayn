import { DEPTH, VIEW } from '../config/game.config.js';
import { WORLD, COLLIDERS, INTERACTIVES, ENEMY_SPAWNS } from '../config/world.layout.js';
import { services } from '../services.js';
import { buildEditorPanel } from '../ui/editorPanel.js';
import { History, pickAt, snapValue, nextId, clamp } from '../world/editorCore.js';
import { diffEdits, diffPos, saveDraft, clearDraft, exportEditsFile } from '../world/mapData.js';
import { collectSolids, propSolid, baseSolid } from '../world/solids.js';
import { checkWalkability } from '../world/check.js';
import { propName } from '../world/propDefs.js';
import { applyDisplaySize } from '../objects/InteractiveObject.js';

const SNAPS = [0, 8, 16, 32];
const TOP = DEPTH.markers + 50;

/**
 * MapEditor — режим ?edit. Карта остаётся живой, героиня стоит на месте.
 * Касание выбирает объект, перетаскивание двигает, пустое место — двигает камеру, колесо/щипок — масштаб.
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

    services.mode = 'edit';
    scene.player.stop();
    this.cam.stopFollow();
    this.cam.removeBounds();
    this.cam.setZoom(0.55);
    this.cam.centerOn(scene.player.x, scene.player.y - 200);
    this.freezeWorld();

    this.gfx = scene.add.graphics().setDepth(TOP);
    this.colGfx = scene.add.graphics().setDepth(TOP - 1);
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
    });

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.input.on('wheel', this.onWheel, this);
    scene.input.keyboard.on('keydown', this.onKey, this);
    scene.events.once('shutdown', () => this.panel.destroy());

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
      for (const g of o.glows || []) g.setVisible(true);
    }
    for (const e of s.enemies) {
      e.idle?.stop();
      [e.sprite, e.label, e.ring].forEach(x => x && x.setVisible(true).setAlpha(1));
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
      if (o.blocker) { o.blocker.setPosition(x, y - o.cfg.collide.h / 2); o.blocker.body.updateFromGameObject(); }
      this.pos[o.id] = { x, y };
    } else {
      const t = e.ref;
      t.cfg.x = x; t.cfg.y = y;
      t.sprite.setPosition(x, y).setDepth(DEPTH.mainBase + y);
      t.label.setPosition(x, y - t.sprite.displayHeight - 14);
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
    const hit = pickAt(this.entities(), wp.x, wp.y, 8 / this.cam.zoom);
    this.moved = false;
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
      if (!this.pan.moved) this.select(null); // короткое касание пустого места снимает выбор
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
    const solids = collectSolids({ colliders: COLLIDERS, props, interactives, enemies, waterRects: this.scene.terrain.waterRects });
    const g = this.colGfx;
    g.clear();
    for (const s of solids) {
      const c = s.src.startsWith('prop') ? 0xff3b2f : s.src === 'water' ? 0x3c8cff : 0xffc828;
      g.fillStyle(c, 0.38).fillRect(s.x, s.y, s.w, s.h);
    }
  }

  // ------------------------------------------------------------------ панель
  refreshInfo() {
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
  }

  say(text, warn = false) { this.panel.setStatus(text, warn); }

  // ------------------------------------------------------------------ данные
  buildEdits() {
    const { props } = this.currentLists();
    return diffEdits(services.map.base, props, diffPos([...INTERACTIVES, ...ENEMY_SPAWNS], this.pos));
  }

  countEdits() {
    const e = this.buildEdits();
    return Object.keys(e.props).length + e.add.length + Object.keys(e.pos).length;
  }

  changed(push = true) {
    void push;
    this.refreshPanel();
    this.refreshInfo();
    if (this.showColliders) this.drawColliders();
    const ok = saveDraft(window.localStorage, this.buildEdits());
    this.say(ok ? `Черновик сохранён · правок: ${this.countEdits()}` : 'Не удалось сохранить черновик в браузере — скачайте файл правок', !ok);
  }

  check() {
    const { props, interactives, enemies } = this.currentLists();
    const problems = checkWalkability({ colliders: COLLIDERS, props, interactives, enemies, terrain: this.scene.terrain });
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
