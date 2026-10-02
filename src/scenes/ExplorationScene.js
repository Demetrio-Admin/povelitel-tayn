import Phaser from 'phaser';
import { VIEW, CAMERA, PLAYER, DEPTH, COLORS, SAVE } from '../config/game.config.js';
import { WORLD, ZONES, GROUND, COLLIDERS, INTERACTIVES, ENEMY_SPAWNS } from '../config/world.layout.js';
import { ROADS, WATERS } from '../config/world.terrain.js';
import { buildTerrain } from '../world/terrain.js';
import { paintTerrainChunk, terrainChunks } from '../world/terrainPaint.js';
import { applyPos } from '../world/mapData.js';
import { propSolid, baseSolid } from '../world/solids.js';
import { MapEditor } from '../systems/MapEditor.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { Player } from '../objects/Player.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { TelekinesisObject } from '../objects/TelekinesisObject.js';
import { FireObject } from '../objects/FireObject.js';
import { EnemyTrigger } from '../objects/EnemyTrigger.js';
import {
  applyDisplaySize, BookObject, ChestObject, PickupObject, AltarObject, FireCircleObject, SealObject,
} from '../objects/InteractiveObject.js';

const OBJECT_CLASSES = {
  book: BookObject,
  telekinesis: TelekinesisObject,
  fire: FireObject,
  seal: SealObject,
  altar: AltarObject,
  fire_circle: FireCircleObject,
  chest: ChestObject,
  pickup: PickupObject,
};

const EXTRA_BOTTOM = 500; // декоративная полоса леса ниже дома, чтобы героиня была на ~62% экрана

// детерминированный ГПСЧ — карта выглядит одинаково при каждом запуске
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const inRect = (x, y, r, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/**
 * ExplorationScene — одна карта, разбитая на зоны. Мир собирается из отдельных объектов
 * по слоям Ground / BackDecor / Main (Y-sort) / Interactive / FrontDecor / FX (Blueprint §4).
 */
export class ExplorationScene extends Phaser.Scene {
  constructor() { super('ExplorationScene'); }

  create() {
    const { state, bus } = services;
    this.bus = bus;
    services.mode = 'exploration';
    this.random = rng(1337);
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.solids = this.physics.add.staticGroup();

    this.map = services.map;
    this.terrain = buildTerrain({ ROADS, WATERS });
    this.interactiveCfgs = applyPos(INTERACTIVES, this.map.pos);
    this.enemyCfgs = applyPos(ENEMY_SPAWNS, this.map.pos);
    this.propViews = new Map();

    this.buildGround();
    this.buildColliders();
    this.buildProps();

    this.interaction = new InteractionSystem(this, bus);
    const p = state.data.player;
    this.player = new Player(this, p.x, p.y);
    this.physics.add.collider(this.player.sprite, this.solids);

    this.objects = [];
    for (const cfg of this.interactiveCfgs) this.addObject(this.createObject(cfg));
    this.enemies = this.enemyCfgs.map(cfg => new EnemyTrigger(this, cfg));
    this.refreshAll();

    // камера: героиня немного ниже центра (Blueprint §7)
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.width, WORLD.height + EXTRA_BOTTOM);
    this.followOffsetY = (CAMERA.heroScreenY - 0.5) * VIEW.height + PLAYER.displayHeight * 0.4;
    this.follow();
    cam.fadeIn(500);

    this.zone = null;
    this.autosaveT = 0;
    this.inTransition = false;

    bus.on(MSG.CONTEXT_ACTION, this.onContext, this);
    bus.on(MSG.ABILITY_USE, this.onAbility, this);
    bus.on(MSG.WORLD_TAP, this.onTap, this);
    bus.on(MSG.WORLD_EVENT, () => this.refreshAll(), this);
    this.events.on('wake', this.onWake, this);
    this.events.once('shutdown', () => bus.offContext(this));
    window.addEventListener('beforeunload', () => this.savePosition());
    document.addEventListener('visibilitychange', () => this.savePosition());

    this.setProviders();
    this.registry.set('savePosition', () => this.savePosition());
    this.stepT = 0;
    if (services.edit) { this.editor = new MapEditor(this); return; } // режим ?edit: игра не идёт, карту правят руками
    if (!state.hasEvent('unlock_telekinesis_1')) {
      this.time.delayedCall(700, () => this.toast('Дом ведьмы. На столе светится старая книга…'));
    }
  }

  follow() {
    this.cameras.main.startFollow(this.player.sprite, false, CAMERA.lerp, CAMERA.lerp, 0, this.followOffsetY);
    this.cameras.main.setDeadzone(CAMERA.deadzone.w, CAMERA.deadzone.h);
  }

  setProviders() {
    const { abilities, state } = services;
    this.registry.set('hudProvider', () => {
      const hs = state.heroStats();
      return { hp: hs.maxHp, maxHp: hs.maxHp, mana: hs.maxMana, maxMana: hs.maxMana };
    });
    this.registry.set('abilityProvider', (id) => {
      if (!abilities.isUnlocked(id)) return { id, state: 'locked' };
      const f = this.interaction.focus;
      return { id, state: 'ready', suggested: !!(f && f.ability === id && f.isAvailable()) };
    });
  }

  // ------------------------------------------------------------------ мир
  buildGround() {
    this.add.tileSprite(0, 0, WORLD.width, WORLD.height + EXTRA_BOTTOM, 'grass_ground_01').setOrigin(0).setDepth(DEPTH.ground);
    this.paintTerrain();
    for (const g of GROUND) this.add.tileSprite(g.x, g.y, g.w, g.h, g.tex).setOrigin(0).setDepth(DEPTH.path);
    // тёмная подстилка под лесом ниже границы мира (деревья — в world.props.js)
    this.add.rectangle(0, WORLD.height, WORLD.width, EXTRA_BOTTOM, 0x172114).setOrigin(0).setDepth(DEPTH.path - 1);
  }

  /** Дороги и вода: кривые формы рисуются кусками 512×512 и кладутся поверх травы. */
  paintTerrain() {
    const chunks = terrainChunks(this.terrain, WORLD.width, WORLD.height + EXTRA_BOTTOM);
    const src = (k) => { try { return this.textures.get(k).getSourceImage(); } catch (e) { return null; } };
    const imgs = { dirt: src('dirt_path_01'), stone: src('stone_path_01'), water: src('swamp_water_01') };
    for (const c of chunks) {
      const key = `terrain_${c.cx}_${c.cy}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const cv = document.createElement('canvas');
      cv.width = c.w; cv.height = c.h;
      paintTerrainChunk(cv.getContext('2d'), c, this.terrain, imgs);
      this.textures.addCanvas(key, cv);
      this.add.image(c.x, c.y, key).setOrigin(0).setDepth(DEPTH.path);
    }
  }

  addBlocker(x, y, w, h) {
    const z = this.add.zone(x, y - h / 2, w, h);
    this.solids.add(z);
    return z;
  }

  buildColliders() {
    for (const c of COLLIDERS) {
      const z = this.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h);
      this.solids.add(z);
      const bottomDepth = DEPTH.mainBase + c.y + c.h;
      switch (c.kind) {
        case 'trees': this.add.rectangle(c.x, c.y, c.w, c.h, 0x172114).setOrigin(0).setDepth(DEPTH.path - 1); break;
        case 'wall':
          this.add.tileSprite(c.x, c.y - 40, c.w, c.h + 40, 'wall_wood_01').setOrigin(0).setDepth(bottomDepth);
          break;
        case 'furniture':
          this.add.rectangle(c.x, c.y - 20, c.w, c.h + 20, COLORS.woodLight).setOrigin(0).setStrokeStyle(3, COLORS.wood).setDepth(bottomDepth);
          if (c.label) this.add.text(c.x + c.w / 2, c.y + c.h / 2 - 10, c.label, { fontSize: '14px', color: COLORS.textDim }).setOrigin(0.5).setDepth(bottomDepth + 1);
          break;
        case 'ruin':
          this.add.tileSprite(c.x, c.y - 30, c.w, c.h + 30, 'wall_ruin_01').setOrigin(0).setTileScale(0.5).setDepth(bottomDepth);
          this.add.rectangle(c.x, c.y - 30, c.w, c.h + 30).setOrigin(0).setStrokeStyle(3, 0x2f2d33).setDepth(bottomDepth + 1);
          break;
        default: break;
      }
    }
    // вода: форма кривая, а Arcade умеет только прямоугольники — вода режется на полосы
    for (const r of this.terrain.waterRects) this.solids.add(this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h));
  }

  /** Деревья, кусты, камни, грибы, цветы, фонари — всё из world.props.js (+ правки редактора). */
  buildProps() {
    for (const p of this.map.props) this.addProp(p);
  }

  /** Один объект расстановки: картинка, свечение, физический блок. Запись в propViews нужна редактору. */
  addProp(p) {
    const img = this.add.image(p.x, p.y, p.k).setOrigin(0.5, 1);
    applyDisplaySize(img, p.k);
    if (p.s) img.setScale(img.scaleX * p.s, img.scaleY * p.s);
    if (p.f) img.setFlipX(true);
    const view = { p, img, glow: null, blocker: null };
    this.placePropView(view);
    if (p.light) view.glow = this.addGlow(p.x, p.y - img.displayHeight + 12, 0xffb36b, 0.4, null, p.light / 64);
    const s = propSolid(p);
    if (s) { view.blocker = this.add.zone(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h); this.solids.add(view.blocker); }
    this.propViews.set(p.id, view);
    return view;
  }

  /** Слой и глубина объекта по его данным. */
  placePropView(view) {
    const { p, img } = view;
    img.setPosition(p.x, p.y);
    const depth = p.l === 'back' ? DEPTH.backDecor : p.l === 'front' ? DEPTH.frontDecor : DEPTH.mainBase + p.y;
    img.setDepth(depth).setAlpha(p.l === 'front' ? 0.85 : 1);
  }

  addGlow(x, y, color, alpha = 0.4, owner = null, scale = 1) {
    const g = this.add.image(x, y, 'fx_glow').setTint(color).setAlpha(alpha).setScale(scale).setBlendMode('ADD').setDepth(DEPTH.fx - 1);
    this.tweens.add({ targets: g, alpha: alpha * 0.7, duration: 900 + this.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (owner) (owner.glows ||= []).push(g);
    return g;
  }

  // ------------------------------------------------------------------ объекты
  createObject(cfg) {
    const Cls = OBJECT_CLASSES[cfg.kind];
    if (!Cls) throw new Error(`Unknown interactive kind: ${cfg.kind}`);
    return new Cls(this, cfg);
  }

  addObject(obj) {
    this.objects.push(obj);
    if (!obj.removed) this.interaction.add(obj);
    return obj;
  }

  spawnPickup(cfg) {
    if (this.objects?.some(o => o.id === cfg.id)) return null;
    const obj = new PickupObject(this, { kind: 'pickup', ...cfg });
    if (!this.objects) return obj; // вызов из конструктора до создания списка не происходит
    if (!obj.removed) { obj.sprite.setScale(obj.sprite.scale * 0.2); this.tweens.add({ targets: obj.sprite, scale: obj.sprite.scale * 5, duration: 300, ease: 'Back.easeOut' }); }
    return this.addObject(obj);
  }

  refreshAll() {
    this.objects?.forEach(o => o.refresh());
    this.enemies?.forEach(e => e.refresh());
  }

  // ------------------------------------------------------------------ FX и UI-хелперы
  toast(text, color) { this.bus.emit(MSG.TOAST, text, color); }
  dialog(opts) { this.bus.emit(MSG.DIALOG, opts); }

  burst(x, y, color, n = 16) {
    const e = this.add.particles(x, y, 'fx_dot', {
      speed: { min: 40, max: 170 }, scale: { start: 0.7, end: 0 }, lifespan: 650, tint: color, blendMode: 'ADD', emitting: false,
    }).setDepth(DEPTH.fx);
    e.explode(n);
    this.time.delayedCall(900, () => e.destroy());
  }

  /** Луч магии от руки героини к цели. */
  castFx(tx, ty, color) {
    services.audio.play(color === COLORS.fire ? 'fire_cast' : 'telekinesis_cast');
    const sx = this.player.x + (this.player.sprite.flipX ? -14 : 14);
    const sy = this.player.y - PLAYER.displayHeight * 0.45;
    for (let i = 0; i < 8; i++) {
      const d = this.add.image(sx, sy, 'fx_dot').setTint(color).setBlendMode('ADD').setScale(0.9 - i * 0.08).setDepth(DEPTH.fx);
      this.tweens.add({ targets: d, x: tx, y: ty, alpha: 0.2, delay: i * 35, duration: 260, onComplete: () => d.destroy() });
    }
    this.time.delayedCall(260, () => this.burst(tx, ty, color, 12));
  }

  /** Короткий pan камеры к важному месту и обратно. */
  panTo(x, y) {
    const cam = this.cameras.main;
    services.mode = 'cutscene';
    this.player.stop();
    cam.stopFollow();
    cam.pan(x, y, CAMERA.panDurationMs, 'Sine.easeInOut', true, (c, progress) => {
      if (progress < 1) return;
      this.time.delayedCall(700, () => {
        cam.pan(this.player.x, this.player.y - this.followOffsetY, CAMERA.panDurationMs, 'Sine.easeInOut', true, (c2, p2) => {
          if (p2 < 1) return;
          this.follow();
          if (services.mode === 'cutscene') services.mode = 'exploration';
        });
      });
    });
  }

  // ------------------------------------------------------------------ ввод
  canAct() { return services.mode === 'exploration' && !services.modalOpen && this.scene.isActive(); }

  onContext() {
    if (!this.canAct()) return;
    this.interaction.act(null);
  }

  onAbility(id) {
    if (!this.canAct()) return;
    const { abilities } = services;
    const f = this.interaction.focus;
    if (id === 'seal' && !abilities.isUnlocked('seal')) {
      if (f && f.ability === 'seal') { f.interact('seal'); return; }
      this.toast('Печать ещё не открыта. Её след ведёт к Древним воротам.', COLORS.seal);
      return;
    }
    if (!abilities.isUnlocked(id)) { this.toast('Этот дар ещё не изучен'); return; }
    this.interaction.act(id);
  }

  onTap({ x, y }) {
    if (!this.canAct()) return;
    const wp = this.cameras.main.getWorldPoint(x, y);
    const obj = this.interaction.pick(wp.x, wp.y);
    const mark = this.add.image(wp.x, wp.y, 'fx_ring').setDisplaySize(50, 22).setTint(obj ? obj.markerColor : 0xffffff).setAlpha(0.8).setDepth(DEPTH.path + 2);
    this.tweens.add({ targets: mark, alpha: 0, scale: mark.scale * 1.6, duration: 450, onComplete: () => mark.destroy() });
    if (obj) {
      const near = Math.hypot(obj.x - this.player.x, obj.y - this.player.y) <= obj.radius;
      const go = () => { if (obj.isAvailable() && this.canAct()) { this.interaction.setFocus(obj); this.interaction.act(null); } };
      if (near) go(); else this.player.walkTo(obj.x, obj.y, go, obj.radius * 0.8);
    } else {
      this.player.walkTo(wp.x, wp.y);
    }
  }

  // ------------------------------------------------------------------ бой
  startCombat(trigger) {
    if (this.inTransition) return;
    this.inTransition = true;
    services.mode = 'transition';
    this.player.stop();
    this.savePosition();
    if (trigger.cfg.startEvent) services.quests.complete(trigger.cfg.startEvent, { spawnId: trigger.id });
    const cam = this.cameras.main;
    this.toast(`${trigger.def.name} преграждает путь!`, COLORS.danger);
    cam.shake(250, 0.006);
    services.audio.play('combat_start');
    services.audio.vibrate(60);
    cam.fadeOut(450, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.sleep();
      this.scene.run('CombatScene', { spawnId: trigger.id, enemyType: trigger.cfg.enemy });
      this.scene.bringToTop('UIScene');
    });
  }

  onWake(sys, data = {}) {
    const { state } = services;
    this.setProviders();
    const trig = this.enemies.find(e => e.id === data.spawnId);
    if (data.result === 'victory' && trig) {
      trig.clear(true);
    } else if (trig) {
      const sp = this.zone?.safePoint || state.data.safePoint;
      this.player.setPosition(sp.x, sp.y);
      trig.grace = 2.5;
    }
    this.refreshAll();
    this.cameras.main.fadeIn(400);
    this.inTransition = false;
    services.mode = 'exploration';
    this.bus.emit(MSG.UI_MODE, 'exploration');
    this.bus.emit(MSG.HUD_REFRESH);
    this.bus.emit(MSG.QUEST_CHANGED);
    if (data.result === 'victory' && trig?.cfg.opensPath) this.time.delayedCall(450, () => this.panTo(trig.cfg.x, trig.cfg.y - 500));
  }

  // ------------------------------------------------------------------ цикл
  savePosition() {
    if (!this.player || services.resetting || this.editor) return;
    services.state.data.player = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    services.state.save();
  }

  updateZone() {
    const z = ZONES.find(r => inRect(this.player.x, this.player.y, r));
    if (!z || z === this.zone) return;
    this.zone = z;
    services.state.data.safePoint = { ...z.safePoint };
    this.bus.emit(MSG.ZONE_CHANGED, z);
  }

  update(time, delta) {
    if (this.editor) return;
    const dt = Math.min(delta, 50) / 1000;
    const { state } = services;
    state.data.stats.playTimeMs += delta;
    if (!this.canAct()) {
      if (services.mode !== 'combat') this.player.stop();
      return;
    }
    this.player.update(dt, services.input.move);
    // шаги
    if (this.player.sprite.body.speed > 30) {
      this.stepT -= delta;
      if (this.stepT <= 0) { this.stepT = 300; services.audio.play('footstep'); }
    } else this.stepT = 0;
    this.interaction.update(dt, this.player);
    this.updateZone();

    for (const o of this.objects) {
      if (o instanceof PickupObject && o.isAvailable() && Math.hypot(o.x - this.player.x, o.y - this.player.y) < o.autoRadius) o.interact();
    }
    for (const e of this.enemies) {
      if (e.update(dt, this.player)) { this.startCombat(e); break; }
    }

    this.autosaveT += delta;
    if (this.autosaveT >= SAVE.autosaveIntervalMs) { this.autosaveT = 0; this.savePosition(); }
  }
}
