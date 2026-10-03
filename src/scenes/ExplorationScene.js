import Phaser from 'phaser';
import { VIEW, CAMERA, PLAYER, DEPTH, COLORS, SAVE } from '../config/game.config.js';
import { WORLD, ZONES, GROUND, INTERACTIVES, ENEMY_SPAWNS } from '../config/world.layout.js';
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
import { EnemyTrigger, encKey } from '../objects/EnemyTrigger.js';
import * as vitals from '../state/vitals.js';
import { VITALS } from '../config/balance.hero.js';
import { STORY } from '../config/story.js';
import { GatherObject } from '../objects/GatherObject.js';
import { NpcObject } from '../objects/NpcObject.js';
import { AlchemyObject } from '../objects/AlchemyObject.js';
import { InspectObject } from '../objects/InspectObject.js';
import { CONTENT_DECOR, AMBIENT } from '../config/world.content.js';
import { POTIONS } from '../config/resources.js';
import { HIGHLIGHT } from '../config/guidance.js';
import { UI } from '../config/ui.config.js';
import { drawPlate } from '../ui/widgets.js';
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
  gather: GatherObject,
  npc: NpcObject,
  alchemy: AlchemyObject,
  inspect: InspectObject,
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
    this.terrain = buildTerrain({ ROADS: this.map.roads, WATERS: this.map.waters });
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
    this.resumeEncounters();
    this.buildContentDecor();
    this.setupGuidance();
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
    bus.on(MSG.WORLD_EVENT, this.onWorldEvent, this);
    bus.on(MSG.ZONE_CHANGED, this.onZoneLine, this);
    bus.on(MSG.NPC_TALK_END, (id) => this.objects.forEach(o => { if (o instanceof NpcObject && o.npc.id === id) o.onTalkEnd(); services.guidance.noteProgress(); }), this);
    bus.on(MSG.NPC_TALK, () => services.guidance.noteProgress(), this);
    bus.on(MSG.QUEST_CHANGED, () => this.objects.forEach(o => { if (o instanceof NpcObject) o.updateBadge(); }), this);
    bus.on(MSG.CRAFTED, ({ result }) => this.objects.find(o => o instanceof AlchemyObject)?.celebrate(POTIONS[result]?.color), this);
    bus.on(MSG.HERO_SAY, (t, ms) => this.heroSay(t, ms), this);
    bus.on(MSG.SIDE_QUEST, (id, what) => { this.refreshAll(); if (what === 'ready') services.audio.play('quest_update'); }, this);
    this.events.on('wake', this.onWake, this);
    this.events.once('shutdown', () => bus.offContext(this));
    window.addEventListener('beforeunload', () => this.savePosition());
    document.addEventListener('visibilitychange', () => this.savePosition());

    this.setProviders();
    this.registry.set('savePosition', () => this.savePosition());
    services.savePosition = () => this.savePosition(); // перед отправкой прогресса при сворачивании вкладки
    this.stepT = 0;
    if (services.edit) { this.editor = new MapEditor(this); return; } // режим ?edit: игра не идёт, карту правят руками
    this.scheduleStory();
  }

  // ------------------------------------------------------------------ v0.9: завязка и стартовый набор
  /** Вступление Мирры — один раз на нового персонажа (старые сохранения с прогрессом его не получают). */
  needsPrologue() {
    const s = services.state;
    return !s.hasEvent(STORY.prologueEvent) && !s.hasEvent('unlock_telekinesis_1') && !s.data.stats.combats.length;
  }

  /** Стартовые зелья — после первого дара, пока героиня ещё в доме (выдаёт Мирра, сервер — одной операцией). */
  needsStarterKit() {
    const s = services.state;
    return s.hasEvent('unlock_telekinesis_1') && !s.hasEvent(STORY.starterKitEvent) && !s.hasEvent('first_world_interaction');
  }

  scheduleStory() {
    let tries = 0;
    const tick = () => {
      if (!this.scene.isActive() || this.editor) return;
      const ready = services.mode === 'exploration' && !services.modalOpen && !services.dialogue.active;
      if (ready && this.needsPrologue()) { services.dialogue.start('mirra'); return; }
      if (++tries < 30 && this.needsPrologue()) this.time.delayedCall(400, tick);
    };
    this.time.delayedCall(900, tick);
    // после чтения книги Мирра сама подзывает героиню (только в доме и только пока набор не выдан)
    this.bus.on(MSG.MODAL_CLOSED, () => this.time.delayedCall(350, () => {
      // один раз за сессию и не пока выдача ещё идёт на сервере (иначе разговор открылся бы повторно)
      if (!this.kitPrompted && !services.actions?.busy && this.needsStarterKit() && this.zone?.id === VITALS.houseZone && services.mode === 'exploration' && !services.modalOpen && !services.dialogue.active) {
        this.kitPrompted = true;
        services.dialogue.start('mirra');
      }
    }), this);
  }

  follow() {
    this.cameras.main.startFollow(this.player.sprite, false, CAMERA.lerp, CAMERA.lerp, 0, this.followOffsetY);
    this.cameras.main.setDeadzone(CAMERA.deadzone.w, CAMERA.deadzone.h);
  }

  /** События мира: объекты пересчитываются, героиня может прокомментировать, «застряли» сбрасывается. */
  onWorldEvent(key) {
    this.refreshAll();
    const g = services.guidance;
    g.onEvent(key);
    const l = g.lineFor({ event: key });
    if (l) this.time.delayedCall(l.delayMs ?? 500, () => this.heroSay(l.text, 4200));
    this.bus.emit(MSG.GUIDE_HINT, null);
  }

  onZoneLine(zone) {
    const l = services.guidance.lineFor({ zone: zone.id });
    if (l) this.time.delayedCall(900, () => this.heroSay(l.text, 3600));
  }

  setProviders() {
    const { abilities, state } = services;
    // v0.9: текущие (не максимальные) HP и мана — из общего состояния героини
    this.registry.set('hudProvider', () => vitals.view(state));
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
    for (const im of this.terrainImages || []) im.destroy(); // перерисовка после правки в редакторе
    this.terrainImages = [];
    for (const c of chunks) {
      const key = `terrain_${c.cx}_${c.cy}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const cv = document.createElement('canvas');
      cv.width = c.w; cv.height = c.h;
      paintTerrainChunk(cv.getContext('2d'), c, this.terrain, imgs);
      this.textures.addCanvas(key, cv);
      this.terrainImages.push(this.add.image(c.x, c.y, key).setOrigin(0).setDepth(DEPTH.path));
    }
    // тексты кусков, которых больше нет (дорогу убрали), чистим
    for (const key of this.textures.getTextureKeys()) {
      if (key.startsWith('terrain_') && !this.terrainImages.some(im => im.texture.key === key)) this.textures.remove(key);
    }
  }

  /** После правки дорог и воды: форма, рисунок и коллизия воды пересобираются целиком. */
  rebuildTerrain(roads, waters) {
    this.map.roads = roads; this.map.waters = waters;
    this.terrain = buildTerrain({ ROADS: roads, WATERS: waters });
    this.paintTerrain();
    this.buildWaterSolids();
  }

  /** После правки стен: старые блоки и их рисунок убираются, новые строятся по текущему списку. */
  rebuildColliders(list) {
    this.map.colliders = list;
    this.buildColliders();
  }

  addBlocker(x, y, w, h) {
    const z = this.add.zone(x, y - h / 2, w, h);
    this.solids.add(z);
    return z;
  }

  buildColliders() {
    for (const o of this.colliderObjects || []) o.destroy();
    this.colliderObjects = [];
    const keep = (o) => { this.colliderObjects.push(o); return o; };
    for (const c of this.map.colliders) {
      const z = this.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h);
      this.solids.add(z);
      keep(z);
      const bottomDepth = DEPTH.mainBase + c.y + c.h;
      switch (c.kind) {
        case 'trees': keep(this.add.rectangle(c.x, c.y, c.w, c.h, 0x172114).setOrigin(0).setDepth(DEPTH.path - 1)); break;
        case 'wall':
          keep(this.add.tileSprite(c.x, c.y - 40, c.w, c.h + 40, 'wall_wood_01').setOrigin(0).setDepth(bottomDepth));
          break;
        case 'furniture':
          if (c.tex) { // v0.8: мебель с картинкой — низ спрайта на нижней кромке коллизии
            const im = this.add.image(c.x + c.w / 2, c.y + c.h, c.tex).setOrigin(0.5, 1).setDepth(bottomDepth);
            applyDisplaySize(im, c.tex);
            keep(im);
            break;
          }
          keep(this.add.rectangle(c.x, c.y - 20, c.w, c.h + 20, COLORS.woodLight).setOrigin(0).setStrokeStyle(3, COLORS.wood).setDepth(bottomDepth));
          if (c.label) keep(this.add.text(c.x + c.w / 2, c.y + c.h / 2 - 10, c.label, { fontSize: UI.type.small, color: COLORS.textDim }).setOrigin(0.5).setDepth(bottomDepth + 1));
          break;
        case 'ruin':
          keep(this.add.tileSprite(c.x, c.y - 30, c.w, c.h + 30, 'wall_ruin_01').setOrigin(0).setTileScale(0.5).setDepth(bottomDepth));
          keep(this.add.rectangle(c.x, c.y - 30, c.w, c.h + 30).setOrigin(0).setStrokeStyle(3, 0x2f2d33).setDepth(bottomDepth + 1));
          break;
        default: break;
      }
    }
    this.buildWaterSolids();
  }

  /** Вода: форма кривая, а Arcade умеет только прямоугольники — вода режется на полосы. */
  buildWaterSolids() {
    for (const z of this.waterZones || []) z.destroy();
    this.waterZones = this.terrain.waterRects.map(r => {
      const z = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.solids.add(z);
      return z;
    });
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
    if (view.glow && /^candle/.test(p.k) && !services.edit) {
      // свечи мерцают: быстрый «живой» огонёк поверх медленного дыхания свечения
      const k = view.glow.scale;
      this.tweens.add({ targets: view.glow, scale: { from: k * 0.88, to: k * 1.12 }, duration: 90 + this.random() * 130, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
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

  // ------------------------------------------------------------------ наполнение (v0.8)
  /** Ковёр, пучки трав, горшок, костёр охотника и «живые мелочи» вроде пылинок в воздухе. */
  buildContentDecor() {
    for (const d of CONTENT_DECOR) {
      const img = this.add.image(d.x, d.y, d.k).setOrigin(0.5, 1);
      applyDisplaySize(img, d.k);
      if (d.flip) img.setFlipX(true);
      img.setDepth(d.floor ? DEPTH.path + 1 : DEPTH.mainBase + d.y);
      if (d.fire && !services.edit) {
        const top = d.y - img.displayHeight * 0.55;
        const g = this.addGlow(d.x, top, 0xff8a3a, 0.55, null, 1.9);
        this.tweens.add({ targets: g, scale: { from: 1.7, to: 2.1 }, duration: 120 + this.random() * 80, yoyo: true, repeat: -1 });
        this.add.particles(d.x, top, 'fx_dot', {
          x: { min: -8, max: 8 }, speedY: { min: -90, max: -40 }, speedX: { min: -12, max: 12 }, scale: { start: 0.75, end: 0 }, alpha: { start: 0.9, end: 0 },
          lifespan: 620, frequency: 55, tint: [COLORS.fire, 0xffc46b, 0xff3b2f], blendMode: 'ADD',
        }).setDepth(DEPTH.fx);
      }
    }
    if (services.edit) return;
    for (const a of AMBIENT) {
      this.add.particles(0, 0, 'fx_dot', {
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(a.rect.x, a.rect.y, a.rect.w, a.rect.h) },
        speedY: { min: -9, max: -2 }, speedX: { min: -7, max: 7 }, scale: { start: 0.38, end: 0 }, alpha: { start: 0.85, end: 0 },
        lifespan: 4200, frequency: a.frequency, quantity: a.quantity, tint: a.color, blendMode: 'ADD',
      }).setDepth(DEPTH.fx);
    }
  }

  /** Мерцающая искорка. */
  twinkle(x, y, color) {
    const d = this.add.image(x, y, 'fx_dot').setTint(color).setBlendMode('ADD').setScale(0.15).setAlpha(0.95).setDepth(DEPTH.fx);
    this.tweens.add({ targets: d, scale: 0.75, alpha: 0, y: y - 18, duration: 820, ease: 'Sine.easeOut', onComplete: () => d.destroy() });
  }

  /** Фонтанчик искр вверх (сундук, сбор, варка). */
  sparkleShower(x, y, color) {
    const e = this.add.particles(x, y, 'fx_dot', {
      speed: { min: 40, max: 130 }, angle: { min: -135, max: -45 }, gravityY: 190, lifespan: 900,
      scale: { start: 0.62, end: 0 }, tint: [color, 0xffffff], blendMode: 'ADD', emitting: false,
    }).setDepth(DEPTH.fx);
    e.explode(14);
    this.time.delayedCall(1100, () => e.destroy());
  }

  /** Короткая вспышка света. */
  addFlash(x, y, color) {
    const g = this.add.image(x, y, 'fx_glow').setTint(color).setBlendMode('ADD').setScale(0.4).setAlpha(0.95).setDepth(DEPTH.fx);
    this.tweens.add({ targets: g, scale: 2.4, alpha: 0, duration: 480, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }

  /** Иконка предмета взлетает над местом сбора, рядом подпись «+1 …». */
  floatIcon(x, y, texture, text, color) {
    const icon = this.add.image(x, y, texture).setDepth(DEPTH.markers).setScale(0.2);
    const maxSide = Math.max(icon.width, icon.height) || 64;
    const k = 44 / maxSide;
    this.tweens.add({ targets: icon, scale: k, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: icon, y: y - 70, alpha: 0, delay: 500, duration: 700, ease: 'Quad.easeIn', onComplete: () => icon.destroy() });
    if (text) this.floatText(x, y - 40, text, color, UI.type.small, 1300);
  }

  floatText(x, y, text, color, size = UI.type.small, ms = 900) {
    const t = this.add.text(x, y, text, { fontFamily: UI.font, fontSize: `${size}px`, color: '#' + color.toString(16).padStart(6, '0'), stroke: '#000', strokeThickness: 5, fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(DEPTH.markers + 1).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 140 });
    this.tweens.add({ targets: t, y: y - 52, alpha: 0, delay: ms * 0.45, duration: ms * 0.55, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------------ v0.9: мана в мире
  /** Действие оплачено: «−8 маны» у объекта и короткая подсветка индикатора маны. */
  onManaSpent(cost, obj) {
    this.floatText(obj.x, obj.baseY - (obj.sprite?.displayHeight || 60) - 10, `−${cost} маны`, COLORS.mana, UI.type.small, 1100);
    this.bus.emit(MSG.MANA_SPENT, cost);
    this.bus.emit(MSG.HUD_REFRESH);
  }

  /** Не хватает маны: ничего не происходит, объясняем, как восстановить. */
  onManaShort(cost, obj) {
    const st = services.state, cur = Math.floor(vitals.mana(st) + 1e-9);
    const elixir = st.item('elixir_mana') > 0;
    this.toast(`Не хватает маны: ${cur} / ${cost}.\n${STORY.manaShortHelp(elixir)}`, COLORS.mana);
    this.bus.emit(MSG.HUD_HIGHLIGHT, 'mana');
    services.audio.play('locked');
    if (obj?.sprite) this.tweens.add({ targets: obj.sprite, x: obj.sprite.x + 3, duration: 50, yoyo: true, repeat: 2 });
  }

  /** Облачко с мыслью героини над головой (контекстные реплики и подсказки). */
  heroSay(text, ms = 3400) {
    if (!text || this.editor || !this.player) return;
    if (this.speech) { this.speech.c.destroy(); this.speech = null; }
    const t = this.add.text(0, 0, text, { fontFamily: UI.font, fontSize: UI.type.body, color: '#fff7e0', align: 'center', wordWrap: { width: 360 }, lineSpacing: 3 }).setOrigin(0.5);
    const w = Math.max(120, t.width + 40), h = t.height + 24;
    const bg = drawPlate(this.add.graphics(), w, h, { accent: 0xe8c56a, fill: 0x1a120d, alpha: 0.93 });
    const tail = this.add.graphics().fillStyle(0x1a120d, 0.93).fillTriangle(-9, h / 2 - 2, 9, h / 2 - 2, 0, h / 2 + 12);
    const c = this.add.container(0, 0, [bg, tail, t]).setDepth(DEPTH.markers + 5).setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });
    this.speech = { c, h, until: this.time.now + ms };
    services.audio.play('hero_say', { minGap: 400 });
    this.placeSpeech();
  }

  placeSpeech() {
    const sp = this.speech;
    if (!sp) return;
    sp.c.setPosition(this.player.x, this.player.y - PLAYER.displayHeight - 30 - sp.h / 2);
    if (this.time.now > sp.until) {
      const c = sp.c; this.speech = null;
      this.tweens.add({ targets: c, alpha: 0, duration: 260, onComplete: () => c.destroy() });
    }
  }

  // ------------------------------------------------------------------ мягкое наведение (v0.8)
  setupGuidance() {
    this.guideRing = this.add.image(0, 0, 'fx_ring').setTint(HIGHLIGHT.color).setBlendMode('ADD').setDepth(DEPTH.path + 3).setVisible(false);
    this.guideT = 0; this.pollT = 0; this.pointerT = 0; this.guideTwinkle = 0;
    this.lastInv = { ...services.state.data.inventory };
    this.hintStep = null;
    this.speech = null;
  }

  /** Цель выполнена или недоступна: пропускаем её и берём следующую из списка шага. */
  targetDone(id) {
    const o = this.objects.find(x => x.id === id);
    if (o) return o.removed || !o.requirementsMet() || o.isDone();
    const e = this.enemies.find(x => x.id === id);
    if (e) return e.defeated || !e.requirementsMet();
    return true; // объекта ещё нет (например, награда под камнем появится после сдвига)
  }

  targetPos(id) {
    const o = this.objects.find(x => x.id === id);
    if (o) return { x: o.x, y: o.baseY, h: o.sprite.displayHeight, w: o.sprite.displayWidth };
    const e = this.enemies.find(x => x.id === id);
    if (e) return { x: e.cfg.x, y: e.cfg.y, h: e.sprite.displayHeight, w: e.sprite.displayWidth };
    return null;
  }

  /** Раз в полсекунды: что нового в сумке, готовы ли задания; мягкая подсказка при «застряли»; подсветка и стрелка цели. */
  updateGuidance(dt) {
    const g = services.guidance, log = services.log, inv = services.state.data.inventory;
    this.pollT += dt;
    if (this.pollT >= 0.5) {
      this.pollT = 0;
      let changed = false;
      for (const k of Object.keys(inv)) {
        if ((inv[k] || 0) > (this.lastInv[k] || 0)) {
          changed = true;
          const l = g.lineFor({ item: k });
          if (l) this.time.delayedCall(700, () => this.heroSay(l.text, 3600));
        } else if ((inv[k] || 0) !== (this.lastInv[k] || 0)) changed = true;
      }
      if (changed) { this.lastInv = { ...inv }; g.noteProgress(); this.bus.emit(MSG.QUEST_CHANGED); this.bus.emit(MSG.HUD_REFRESH); }
      for (const id of log.checkReady()) {
        const q = log.def(id);
        this.toast(`Задание «${q.title}» выполнено — вернитесь к заказчику`, 0xffe08a);
      }
    }
    const h = g.tick(dt);
    const stepNow = g.step().id;
    if (this.hintStep !== stepNow) { this.hintStep = stepNow; this.bus.emit(MSG.GUIDE_HINT, null); }
    if (h) { this.heroSay(h.hint, 6200); this.bus.emit(MSG.GUIDE_HINT, h.hint); }

    // подсветка цели и стрелка
    const id = g.targetId((x) => this.targetDone(x));
    const pos = id ? this.targetPos(id) : null;
    const focused = this.interaction.focus && this.interaction.focus.id === id;
    if (pos && !focused) {
      const d = Math.hypot(pos.x - this.player.x, pos.y - this.player.y);
      const show = d < HIGHLIGHT.showWithin && d > 60;
      this.guideRing.setVisible(show).setPosition(pos.x, pos.y - 2)
        .setDisplaySize(Math.max(110, pos.w * 1.2), Math.max(110, pos.w * 1.2) * 0.4)
        .setAlpha(0.28 + (Math.sin(this.time.now / 380) + 1) * 0.16);
      if (show) {
        this.guideTwinkle -= dt;
        if (this.guideTwinkle <= 0) { this.guideTwinkle = 0.9; this.twinkle(pos.x + (Math.random() - 0.5) * pos.w * 0.6, pos.y - 20 - Math.random() * Math.min(80, pos.h), HIGHLIGHT.color); }
      }
    } else this.guideRing.setVisible(false);

    this.pointerT -= dt;
    if (this.pointerT <= 0) {
      this.pointerT = 0.12;
      this.bus.emit(MSG.GUIDE_POINTER, pos && g.pointerActive() && !focused ? this.screenPointer(pos) : null);
    }
  }

  /** Стрелка у края экрана, указывающая на цель (или null, если цель на экране). */
  screenPointer(pos) {
    const cam = this.cameras.main, v = cam.worldView;
    const sx = (pos.x - v.x) * cam.zoom, sy = (pos.y - pos.h * 0.5 - v.y) * cam.zoom;
    const W = VIEW.width, H = VIEW.height, m = 70;
    if (sx > m && sx < W - m && sy > 170 && sy < H - 190) return null;
    const cx = W / 2, cy = H * 0.5;
    const dx = sx - cx, dy = sy - cy;
    const k = Math.min((W / 2 - m) / Math.max(Math.abs(dx), 1), (H / 2 - 210) / Math.max(Math.abs(dy), 1));
    return { x: cx + dx * k, y: Math.max(190, cy + dy * k), angle: Math.atan2(dy, dx), dist: Math.round(Math.hypot(pos.x - this.player.x, pos.y - this.player.y)) };
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
  canAct() { return services.mode === 'exploration' && !services.modalOpen && !services.offline && this.scene.isActive(); }

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
  startCombat(trigger, { manual = false } = {}) {
    if (this.inTransition) return;
    this.inTransition = true;
    services.mode = 'transition';
    this.player.stop();
    this.interaction.clearFocus();
    // v0.9: точка «перед боем» — сюда героиня вернётся после поражения (не safePoint). Сохраняется до старта боя,
    // поэтому перезагрузка посреди боя тоже вернёт её сюда (см. resumeEncounters).
    const at = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    services.state.setObject(encKey(trigger.id), { state: 'fighting', x: at.x, y: at.y });
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
    this.player.stop();
    services.input.joy.x = 0; services.input.joy.y = 0;
    const trig = this.enemies.find(e => e.id === data.spawnId);
    const enc = state.getObject(encKey(data.spawnId));
    if (data.result === 'victory' && trig) {
      trig.clear(true);
      delete state.data.worldObjects[encKey(data.spawnId)];
      state.save();
    } else if (trig) {
      // v0.9: поражение — героиня остаётся рядом с этим врагом, на точке перед боем; повтор — только «Сразиться снова»
      const at = enc && Number.isFinite(enc.x) ? { x: enc.x, y: enc.y } : { x: this.player.x, y: this.player.y };
      this.player.setPosition(at.x, at.y);
      state.setObject(encKey(trig.id), { state: 'lost', x: at.x, y: at.y });
      state.data.player = { x: Math.round(at.x), y: Math.round(at.y) };
      state.save();
      this.watchRetry(trig);
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

  /** Враг, ждущий «Сразиться снова», становится объектом взаимодействия (кнопка действия, тап, клавиатура). */
  watchRetry(trig) {
    if (trig.awaitingRetry && !trig.defeated && !this.interaction.objects.includes(trig)) this.interaction.add(trig);
  }

  /**
   * При загрузке: проигранные бои ждут ручного повтора; бой, прерванный перезагрузкой ('fighting'), считается
   * отступлением рядом с тем же врагом — без штрафа монет и без награды; HP не меньше, чем после поражения.
   */
  resumeEncounters() {
    const st = services.state;
    for (const e of this.enemies) {
      const enc = st.getObject(encKey(e.id));
      if (!enc || e.defeated) continue;
      if (enc.state === 'fighting') {
        st.setObject(encKey(e.id), { state: 'lost' });
        const floor = Math.max(1, Math.ceil(vitals.maxHp(st) * 0.2));
        if (vitals.hp(st) < floor) vitals.setHp(st, floor);
        if (Number.isFinite(enc.x)) { this.player.setPosition(enc.x, enc.y); st.data.player = { x: enc.x, y: enc.y }; }
        st.save();
      }
      this.watchRetry(e);
    }
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
      this.placeSpeech();
      return;
    }
    this.player.update(dt, services.input.move);
    // v0.9: восстановление HP и маны вне боя (только во время активной игры; в доме Мирры мана быстрее)
    if (vitals.regen(state, dt, { inHouse: this.zone?.id === VITALS.houseZone })) this.vitalsDirty = true;
    // шаги
    if (this.player.sprite.body.speed > 30) {
      this.stepT -= delta;
      if (this.stepT <= 0) { this.stepT = 300; services.audio.play('footstep'); }
    } else this.stepT = 0;
    this.interaction.update(dt, this.player);
    this.updateZone();
    for (const o of this.objects) o.update(dt, this.player);
    this.updateGuidance(dt);
    this.placeSpeech();

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
