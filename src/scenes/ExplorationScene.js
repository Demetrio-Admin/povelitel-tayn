import { BAG } from '../config/bag.js';
import { bindSceneViewport } from '../ui/viewport.js';
import { T } from '../state/hero.js';
import Phaser from 'phaser';
import { VIEW, CAMERA, PLAYER, DEPTH, COLORS, SAVE } from '../config/game.config.js';
import { WORLD, ZONES, INTERACTIVES, ENEMY_SPAWNS } from '../config/world.layout.js';
import { buildTerrain } from '../world/terrain.js';
import { paintTerrainChunk, terrainChunks } from '../world/terrainPaint.js';
import { applyPos } from '../world/mapData.js';
import { propSolid, baseSolid } from '../world/solids.js';
import { buildNav, findPath } from '../world/nav.js';
import { MapEditor } from '../systems/MapEditor.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { Player } from '../objects/Player.js';
import { CityPresentation } from '../world/CityPresentation.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { TelekinesisObject } from '../objects/TelekinesisObject.js';
import { FireObject } from '../objects/FireObject.js';
import { EnemyTrigger, encKey } from '../objects/EnemyTrigger.js';
import * as vitals from '../state/vitals.js';
import { advanceWorld, serverActionBusy } from '../systems/WorldClock.js';
import { VITALS } from '../config/balance.hero.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { STORY } from '../config/story.js';
import { GatherObject } from '../objects/GatherObject.js';
import { NpcObject } from '../objects/NpcObject.js';
import { AlchemyObject } from '../objects/AlchemyObject.js';
import { InspectObject } from '../objects/InspectObject.js';
import { AMBIENT } from '../config/world.content.js';
import { LivingWorld } from '../world/life.js';
import { POTIONS } from '../config/resources.js';
import { HIGHLIGHT, STEP_GUIDE } from '../config/guidance.js';
import { UI } from '../config/ui.config.js';
import { drawPlate } from '../ui/widgets.js';
import {
  applyDisplaySize, BookObject, ChestObject, PickupObject, AltarObject, FireCircleObject, TravelObject, ExitObject,
} from '../objects/InteractiveObject.js';
import { DISPLAY_SIZE } from '../config/assets.manifest.js';
import { ZONE_EVENTS } from '../config/world.city.js';
import { LOCATIONS, locationAt, locationById, locationOpen, inLocation, touchesLocation } from '../config/locations.js';
import { enemyDownNow } from '../state/enemyRep.js';
import { IceObject } from '../objects/IceObject.js';
import { BoardObject } from '../objects/BoardObject.js';
import { GateObject, SealSigilObject, DustStashObject, ForestNodeObject } from '../objects/ChapterObjects.js';

const ALL_TARGETS = new Map([...INTERACTIVES, ...ENEMY_SPAWNS].map(o => [o.id, o]));   // v0.27.0: id → место (для наведения через выход)

const OBJECT_CLASSES = {
  travel: TravelObject,   // v0.20.0
  exit: ExitObject,       // v0.27.0: выход на карту мира
  ice: IceObject,         // v0.21.0
  board: BoardObject,     // v0.23.0: доска поручений
  book: BookObject,
  telekinesis: TelekinesisObject,
  fire: FireObject,
  gate: GateObject,
  seal_sigil: SealSigilObject,
  stash: DustStashObject,
  forest_node: ForestNodeObject,
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
// v0.10.0: полоса леса выше северного края — поляна узла за воротами (y 110–330) не прячется под HUD
const EXTRA_TOP = 340;

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
    this.viewport = bindSceneViewport(this, { world: true });
    const { state, bus } = services;
    this.bus = bus;
    services.mode = 'exploration';
    this.random = rng(1337);
    // v0.27.0: сцена перезапускается при переходе между локациями — временное состояние прошлого запуска сбрасывается
    this.speech = null; this.traveling = false; this.navCache = null; this.terrainImages = []; this.waterZones = []; this.colliderObjects = [];
    // v0.27.0: строится только текущая локация (глава или вылазка) — по положению героя; редактор карты (?edit) видит весь холст
    let p = this.fixStartPosition(state.data.player);
    this.loc = services.edit ? null : locationAt(p.x, p.y);
    if (this.loc && !inLocation(p, this.loc)) { p = { ...this.loc.arrival }; state.data.player = { ...p }; }   // старое сохранение за краем локации
    const R = this.loc ? this.loc.rect : { x: 0, y: 0, w: WORLD.width, h: WORLD.height };
    const top = this.loc ? (this.loc.extraTop || 0) : EXTRA_TOP, bottom = this.loc ? (this.loc.extraBottom || 0) : EXTRA_BOTTOM;
    this.bounds = R;
    this.view = { x: R.x, y: R.y - top, w: R.w, h: R.h + top + bottom, top, bottom };
    this.physics.world.setBounds(R.x, R.y, R.w, R.h);
    this.solids = this.physics.add.staticGroup();

    this.map = services.map;
    this.terrain = buildTerrain({ ROADS: this.map.roads, WATERS: this.map.waters });
    const here = (o) => inLocation(o, this.loc);
    this.interactiveCfgs = applyPos(INTERACTIVES, this.map.pos).filter(here);
    this.enemyCfgs = applyPos(ENEMY_SPAWNS, this.map.pos).filter(here);
    this.propViews = new Map();
    this.groundViews = new Map();
    this.colliderViews = new Map();

    this.buildGround();
    this.buildColliders();
    this.buildProps();

    this.interaction = new InteractionSystem(this, bus);
    this.player = new Player(this, p.x, p.y);
    this.physics.add.collider(this.player.sprite, this.solids);

    this.objects = [];
    for (const cfg of this.interactiveCfgs) this.addObject(this.createObject(cfg));
    this.enemies = this.enemyCfgs.map(cfg => new EnemyTrigger(this, cfg));
    this.resumeEncounters();
    this.buildContentDecor();
    this.cityPresentation = this.loc?.id === 'city' ? new CityPresentation(this) : null;
    this.setupLife();   // v0.28.0
    this.setupGuidance();
    this.refreshAll();
    this.recoverCityPosition();

    // камера: героиня немного ниже центра (Blueprint §7)
    const cam = this.cameras.main;
    cam.setBounds(this.view.x, this.view.y, this.view.w, this.view.h);   // v0.27.0: камера — только своя локация
    const followSize = () => {
      this.followOffsetY = (CAMERA.heroScreenY - 0.5) * cam.height + PLAYER.displayHeight * 0.4;
      this.follow();
    };
    this.scale.on?.('resize', followSize);
    this.events.once('shutdown', () => this.scale.off?.('resize', followSize));
    this.followOffsetY = (CAMERA.heroScreenY - 0.5) * cam.height + PLAYER.displayHeight * 0.4;
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
    bus.on(MSG.UNLOCK_SEAL, this.unlockSeal, this);
    bus.on(MSG.UNLOCK_GIFT, this.unlockGift, this);
    bus.on(MSG.CHAPTER_FINALE, this.chapterFinale, this);
    bus.on(MSG.DUEL_START, this.startDuel, this);   // v0.26.0
    bus.on(MSG.TRAVEL, (t) => this.travelTo(t, t?.text), this);   // v0.20.0
    bus.on(MSG.MAP_TRAVEL, this.travelToLocation, this);           // v0.27.0: отправиться с карты мира
    bus.on(MSG.SIDE_QUEST, (id, what) => { this.refreshAll(); if (what === 'ready') services.audio.play('quest_update'); }, this);
    this.events.on('wake', this.onWake, this);
    // v0.27.0: сцена перезапускается при переходе между локациями — подписки снимаются, чтобы не удваиваться
    this.events.once('shutdown', () => { bus.offContext(this); this.events.off('wake', this.onWake, this); });
    if (!ExplorationScene.pageHooks) {
      ExplorationScene.pageHooks = true;
      window.addEventListener('beforeunload', () => services.savePosition?.());
      document.addEventListener('visibilitychange', () => services.savePosition?.());
    }

    this.setProviders();
    this.registry.set('savePosition', () => this.savePosition());
    services.savePosition = () => this.savePosition(); // перед отправкой прогресса при сворачивании вкладки
    this.stepT = 0;
    if (services.edit) { this.editor = new MapEditor(this); return; } // режим ?edit: игра не идёт, карту правят руками
    this.scheduleStory();
    this.migrateV10();
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

  /**
   * v0.10.0: разовая миграция старого сохранения (атомарно, флаг mig_v10): ядро Стража тем, кто победил его до главы,
   * если ядра нет и связку не делали. Новому персонажу просто ставится флаг. Перезагрузка и повтор ничего не выдают.
   */
  migrateV10() {
    if (this.editor || services.state.hasEvent('mig_v10')) return;
    const tryRun = async () => {
      if (!this.scene.isActive() || services.state.hasEvent('mig_v10')) return;
      if (services.actions.busy || services.mode !== 'exploration') { this.time.delayedCall(1500, tryRun); return; }
      const r = await services.actions.migrateV10();
      if (r.ok && r.core) this.toast('Мирра сохранила ядро Стража — оно в сумке: из него можно сделать Целебный сбор.', COLORS.gold);
    };
    this.time.delayedCall(1200, tryRun);
  }

  /**
   * v0.10.0: стена у Древних ворот появилась в главе. Старое сохранение могло оставить героиню внутри новой стены или
   * за воротами, которые ещё не открыты Печатью, — тогда ставим её рядом, перед воротами (не к дому).
   */
  fixStartPosition(p) {
    const st = services.state;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || services.edit) return p;
    const inWall = p.x < 1800 && p.y >= 330 && p.y <= 440 && ((p.x >= 100 && p.x <= 640) || (p.x >= 1160 && p.x <= 1700) || (p.x > 640 && p.x < 1160 && !st.hasEvent('ancient_gate_open')));
    const behind = p.y < 330 && p.x < 1800 && !st.hasEvent('ancient_gate_open');
    if (!inWall && !behind) return p;
    const fixed = { x: 900, y: 540 };
    st.data.player = fixed;
    console.info('[v0.10] позиция из старого сохранения в новой стене / за закрытыми воротами → перед воротами', p, fixed);
    return fixed;
  }

  /** A saved city position may now intersect a relocated wall or furnishing. Move only blocked feet locally. */
  recoverCityPosition() {
    if (services.edit || this.loc?.id !== 'city') return;
    const p = { x: this.player.x, y: this.player.y }, { w, h } = PLAYER.hitbox;
    const blocked = this.colliderObjects.some(o => {
      const b = o.body;
      return b && p.x + w / 2 > b.x && p.x - w / 2 < b.x + b.width && p.y > b.y && p.y - h < b.y + b.height;
    });
    if (!blocked) return;
    const route = findPath(this.navGrids(), p, p);
    if (!route || Math.hypot(route.end.x - p.x, route.end.y - p.y) > 160) return;
    this.player.setPosition(route.end.x, route.end.y);
    services.state.data.player = { ...route.end };
  }

  /**
   * v0.10.0: Селена открывает Астрал I (внутренний id 'seal') — сюжетно, без уровня, платы и таймера: дар, событие unlock_seal_1 и разовые +60 опыта.
   * Повторный вызов ничего не выдаёт (событие уже есть).
   */
  unlockSeal() {
    const { state, abilities, quests } = services;
    if (state.hasEvent('unlock_seal_1')) return;
    abilities.unlock('seal', 1);
    quests.complete('unlock_seal_1');
    this.burst(this.player.x, this.player.y - 60, COLORS.seal, 34);
    this.toast('Получен дар: Астрал I', COLORS.seal);
    this.dialog({
      title: 'Астрал I', color: COLORS.seal,
      text: 'Новый дар видит скрытое и будит спящее. Астрал стоит 20 маны.\n\n'
        + 'В мире он открывает древние знаки и ворота и оживляет сердце рощи. В бою бьёт силой, которой не помеха ни броня, ни кора, — но атаки врага не останавливает: это умеет только Телекинез.\n\n'
        + 'Опробуйте его спокойно — на учебном камне рядом с алтарём (кнопка Астрала или действие).',
      buttons: [{ label: 'К камню', primary: true }],
    });
  }

  /**
   * v0.21.0: Нэрис открывает Лёд I (событие unlock_ice_1; дар выдаёт сервер, операция event). Даров становится четыре, а слотов — три:
   * окно объясняет «3 из 4» и ведёт в «Дары». v0.22.0: 'ice:2' — Лёд II (unlock_ice_2), 'ice:3:frost' / 'ice:3:shard' — Лёд III
   * с веткой (ch2_ice3_frost / ch2_ice3_shard). Повтор ничего не выдаёт.
   */
  async unlockGift(spec) {
    const [id, lvlS, branch] = String(spec).split(':');
    const level = Number(lvlS) || 1;
    if (id !== 'ice' || (level === 3 && !['frost', 'shard'].includes(branch))) return;
    const GIFT = {
      1: { event: 'unlock_ice_1', title: 'Лёд I', text: 'Лёд замораживает воду и нестабильную магию, а в бою замедляет врага: его удары и подготовка сильного удара идут медленнее.\n\n'
        + 'Теперь даров четыре, а слотов — три. Работают только дары в слотах — и в бою, и в мире. Поставьте Лёд в один из слотов, чтобы его кнопка появилась внизу.' },
      2: { event: 'unlock_ice_2', title: 'Лёд II — Хрупкость', text: 'После удара Льдом враг становится хрупким: следующий удар Телекинеза, Огня или Астрала сильнее, '
        + 'а тяжёлый камень по хрупкой цели ещё и разбивает броню.\n\nСначала Лёд — потом сильный удар.' },
      3: { event: `ch2_ice3_${branch}`, title: `Лёд III — ${branch === 'shard' ? 'Осколок' : 'Мороз'}`, text: branch === 'shard'
        ? 'Ветка Осколка: удар Льда по хрупкой цели раскалывает её (урон ×2,2), а Хрупкость от других даров сильнее. Замедление слабое.'
        : 'Ветка Мороза: враг на 55% медленнее шесть секунд — больше времени, чтобы прервать удар. Сам удар Льда слабее.' },
    }[level];
    const { state, actions } = services;
    if (!GIFT || this.giftPending || state.hasEvent(GIFT.event) || (level === 3 && state.hasEvent('ch2_ice3'))) return;
    if (level > 1 && actions.online && state.getObject('player_bag')?.version !== BAG.version) { this.toast('Уроки временно недоступны. Попробуйте позже.', COLORS.danger); return; }
    // Нельзя показывать дар локально заранее: отказ сервера при следующем сохранении уберёт его из героя.
    this.giftPending = true;
    let r;
    try { r = await actions.confirmEvent(GIFT.event); }
    finally { this.giftPending = false; }
    const granted = state.hasEvent(GIFT.event) && state.isUnlocked('ice') && state.abilityLevel('ice') >= level
      && (level !== 3 || state.branchOf('ice') === branch);
    if ((!r?.ok && r?.reason !== 'already') || !granted) {
      const text = {
        locked: 'Сначала завершите предыдущее задание и сдайте его Нэрис.',
        missing: 'Не хватает монет для урока Нэрис. Цена указана в диалоге.',
        network: 'Нет связи с сервером. Поговорите с Нэрис ещё раз, когда связь вернётся.',
        session: 'Сессия завершилась. Войдите снова, чтобы получить дар.',
      }[r?.reason] || 'Не удалось получить Лёд. Поговорите с Нэрис ещё раз.';
      this.toast(text, COLORS.danger);
      return;
    }
    this.burst(this.player.x, this.player.y - 60, COLORS.ice, 34);
    this.toast(`Получен дар: ${GIFT.title}`, COLORS.ice);
    this.dialog({
      title: GIFT.title, color: COLORS.ice, text: GIFT.text,
      buttons: [{ label: 'Выбрать дары', primary: true, onClick: () => services.bus.emit(MSG.OPEN_GIFTS) }, { label: 'Позже' }],
    });
  }

  /** v0.22.0: итог главы II — награды (их уже выдал сервер вместе с событием chapter_2_complete) и что открыто дальше. */
  chapterFinale(n) {
    if (n !== 2) return;
    this.burst(this.player.x, this.player.y - 60, COLORS.ice, 40);
    services.audio.play('quest_update');
    this.dialog({
      title: 'Глава II «Город под инеем» завершена', color: COLORS.ice,
      text: 'Город оттаял, Северин остановлен — но за ним стоит кто-то ещё, и его знак — тот самый, с Древних ворот.\n\n'
        + 'Награда: опыт, монеты, инеевый осколок, 50 сапфиров и титул «Переживший иней». Сердце холода от Северина — в сумке: '
        + 'из него однажды выйдут сильный амулет, редкий артефакт или следующая ступень Льда. Решать не нужно сейчас.\n\n'
        + 'Дальше: поручения, Ковены, вылазки и Магическая Дуэль.',
      buttons: [{ label: 'Отлично', primary: true }],
    });
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
      if (!state.isEquipped(id)) return { id, state: 'benched' };   // v0.18.0
      const f = this.interaction.focus;
      return { id, state: 'ready', suggested: !!(f && f.ability === id && f.isAvailable()) };
    });
  }

  // ------------------------------------------------------------------ мир
  buildGround() {
    const V = this.view, R = this.bounds;
    this.add.tileSprite(R.x, R.y, R.w, R.h + V.bottom, 'grass_ground_01').setOrigin(0).setDepth(DEPTH.ground);
    this.paintTerrain();
    this.rebuildGrounds(this.map.grounds);
    if (!V.top && !V.bottom) return;
    // тёмная подстилка под лесом ниже границы мира (деревья — в world.props.js)
    if (V.bottom) this.add.rectangle(R.x, R.y + R.h, R.w, V.bottom, 0x172114).setOrigin(0).setDepth(DEPTH.path - 1);
    // v0.10.0: тёмный лес над северной границей (только картинка, за край мира пройти нельзя)
    if (!V.top) return;
    this.add.rectangle(R.x, R.y - V.top, R.w, V.top, 0x172114).setOrigin(0).setDepth(DEPTH.path - 1);
  }

  /** Дороги и вода: кривые формы рисуются кусками 512×512 и кладутся поверх травы. */
  paintTerrain() {
    const chunks = terrainChunks(this.terrain, WORLD.width, WORLD.height + EXTRA_BOTTOM).filter(c => touchesLocation(c, this.loc ? { rect: this.view } : null));
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

  rebuildGrounds(list) {
    this.map.grounds = list;
    for (const {img} of this.groundViews.values()) img.destroy();
    this.groundViews.clear();
    for (const g of list) if (touchesLocation(g,this.loc)) {
      const img = this.add.tileSprite(g.x,g.y,g.w,g.h,g.tex).setOrigin(0)
        .setDepth(g.l==='front'?DEPTH.frontDecor:g.l==='back'?DEPTH.backDecor:DEPTH.path+(g.layerOffset??(g.interior?0.4:0)));
      img.setAngle(g.a||0).setFlipX(!!g.f).setAlpha(g.alpha??1);
      img.setTileScale(g.tileScale??(['city_paving','city_wood_floor','city_stone_floor','snow_ground_01','grave_ground_01'].includes(g.tex)?0.5:1));
      if(g.tint)img.setTint(g.tint);
      this.groundViews.set(g.id,{g,img});
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
    this.colliderViews.clear();
    const keep = (o) => { this.colliderObjects.push(o); return o; };
    for (const c of this.map.colliders) {
      if (!touchesLocation(c, this.loc)) continue;   // v0.27.0: стены других локаций не строятся
      const z = this.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h);
      this.solids.add(z);
      keep(z);
      const bottomDepth = DEPTH.mainBase + c.y + c.h;
      switch (c.kind) {
        case 'trees': keep(this.add.rectangle(c.x, c.y, c.w, c.h, this.loc?.id === 'frostwood' ? 0x76938c : this.loc?.id === 'graveyard' ? 0x343d32 : 0x172114).setOrigin(0).setDepth(DEPTH.path - 1)); break;
        case 'wall': {
          const city = locationAt(c.x+c.w/2,c.y+c.h/2).id === 'city';
          const wall = keep(this.add.tileSprite(c.x, c.y - 40, c.w, c.h + 40, c.tex || (city ? 'city_timber' : 'wall_wood_01')).setOrigin(0).setTileScale(city ? 0.25 : 1).setDepth(bottomDepth));
          this.colliderViews.set(c.id,{c,img:wall});
          if (city) {
            wall.setTint(0xa68a69);
            keep(this.add.rectangle(c.x, c.y - 40, c.w, c.h + 40, 0x000000, 0).setOrigin(0)
              .setStrokeStyle(3, 0x3c2b20, 0.9).setDepth(bottomDepth + 0.1));
          }
          break;
        }
        case 'furniture':
          if (c.tex) { // v0.8: мебель с картинкой — низ спрайта на нижней кромке коллизии
            const im = this.add.image(c.x + c.w / 2, c.y + c.h, c.tex).setOrigin(0.5, 1).setDepth(bottomDepth);
            applyDisplaySize(im, c.tex);
            if(c.editorStyle)this.styleImage(im,c.editorStyle,c.tex);
            this.colliderViews.set(c.id,{c,img:im});
            keep(im);
            break;
          }
          keep(this.add.rectangle(c.x, c.y - 20, c.w, c.h + 20, COLORS.woodLight).setOrigin(0).setStrokeStyle(3, COLORS.wood).setDepth(bottomDepth));
          if (c.label) keep(this.add.text(c.x + c.w / 2, c.y + c.h / 2 - 10, c.label, { fontSize: UI.type.small, color: COLORS.textDim }).setOrigin(0.5).setDepth(bottomDepth + 1));
          break;
        case 'ruin': {
          const wall = keep(this.add.tileSprite(c.x,c.y-30,c.w,c.h+30,c.tex || (locationAt(c.x+c.w/2,c.y+c.h/2).id==='city'?'city_wall':'wall_ruin_01'))
            .setOrigin(0).setTileScale(locationAt(c.x+c.w/2,c.y+c.h/2).id==='city'?0.25:0.5).setDepth(bottomDepth));
          this.colliderViews.set(c.id,{c,img:wall});
          keep(this.add.rectangle(c.x,c.y-30,c.w,c.h+30).setOrigin(0).setStrokeStyle(3,0x2f2d33).setDepth(bottomDepth+1));
          break;
        }
        default: break;
      }
    }
    this.buildWaterSolids();
  }

  /** Вода: форма кривая, а Arcade умеет только прямоугольники — вода режется на полосы. */
  buildWaterSolids() {
    for (const z of this.waterZones || []) z.destroy();
    this.waterZones = this.terrain.waterRects.filter(r => touchesLocation(r, this.loc)).map(r => {
      const z = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.solids.add(z);
      return z;
    });
  }

  /** Деревья, кусты, камни, грибы, цветы, фонари — всё из world.props.js (+ правки редактора). */
  buildProps() {
    for (const p of this.map.props) if (inLocation(p, this.loc ? { rect: this.view } : null)) this.addProp(p);
  }

  /** Один объект расстановки: картинка, свечение, физический блок. Запись в propViews нужна редактору. */
  addProp(p) {
    const img = this.add.image(p.x, p.y, p.k).setOrigin(0.5, 1);
    const view = { p, img, glow: null, blocker: null, effects: [] };
    this.placePropView(view);
    if (p.light) view.glow = this.addGlow(p.x, p.y - img.displayHeight + 12, 0xffb36b, 0.4, null, p.light / 64);
    if (view.glow && /^candle/.test(p.k) && !services.edit) {
      // свечи мерцают: быстрый «живой» огонёк поверх медленного дыхания свечения
      const k = view.glow.scale;
      this.tweens.add({ targets: view.glow, scale: { from: k * 0.88, to: k * 1.12 }, duration: 90 + this.random() * 130, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.propViews.set(p.id, view);
    return view;
  }

  /** Слой и глубина объекта по его данным. */
  styleImage(img,style,key=img.texture.key) {
    applyDisplaySize(img,key);
    if(!DISPLAY_SIZE[key])img.setScale(128/Math.max(img.width,img.height,1));
    if(style.w||style.h)img.setDisplaySize(style.w||img.displayWidth,style.h||img.displayHeight);
    if(style.s)img.setScale(img.scaleX*style.s,img.scaleY*style.s);
    img.setAngle(style.a||0).setFlipX(!!style.f).setAlpha(style.alpha??1);
    if(style.tint!=null)img.setTint(style.tint);else img.clearTint();
    if(style.l)img.setDepth(style.l==='floor'?DEPTH.path+1:style.l==='room-floor'?DEPTH.path+0.7:style.l==='back'?DEPTH.backDecor:style.l==='front'?DEPTH.frontDecor:DEPTH.mainBase+img.y);
  }

  placePropView(view) {
    const {p,img}=view;
    img.setTexture(p.k).setPosition(p.x,p.y);
    this.styleImage(img,p,p.k);
    const depth=p.l==='floor'?DEPTH.path+1:p.l==='room-floor'?DEPTH.path+0.7:p.l==='back'?DEPTH.backDecor:p.l==='front'?DEPTH.frontDecor:DEPTH.mainBase+p.y;
    img.setDepth(depth).setAlpha(p.alpha??(p.l==='front'?0.85:1));
    img.setVisible(services.edit||!p.requires||services.state.hasEvent(p.requires));
    const footprint=propSolid(p);
    if(!footprint){view.blocker?.destroy();view.blocker=null;}
    else {
      const r=footprint;
      if(!view.blocker){view.blocker=this.add.zone(r.x+r.w/2,r.y+r.h/2,r.w,r.h);this.solids.add(view.blocker);}
      else{view.blocker.setPosition(r.x+r.w/2,r.y+r.h/2).setSize(r.w,r.h);view.blocker.body.setSize(r.w,r.h);view.blocker.body.updateFromGameObject();}
    }
    if(view.glow)view.glow.setPosition(p.x,p.y-img.displayHeight+12);
  }

  styleEntity(o,reset=false) {
    if(!o.cfg.editorStyle&&!reset)return;
    const style=o.cfg.editorStyle||{};
    this.tweens.killTweensOf(o.sprite);
    if(style.texture)o.sprite.setTexture(style.texture);
    this.styleImage(o.sprite,{...style,s:(o.cfg.scale||1)*(style.s||1)});
    if(style.tint==null && o.def?.tint)o.sprite.setTint(o.def.tint);
    o.baseScale={x:o.sprite.scaleX,y:o.sprite.scaleY};
    o.nameText?.setPosition(o.cfg.x,o.cfg.y-o.sprite.displayHeight-(o.cfg.elevated||0)-(o.npc?58:14));
    o.badge?.setPosition(o.cfg.x,o.cfg.y-o.sprite.displayHeight-(o.cfg.elevated||0)-8);
    const layer=style.l;
    if(layer==='floor')o.sprite.setDepth(DEPTH.path+1);
    else if(layer==='room-floor')o.sprite.setDepth(DEPTH.path+0.7);
    else if(layer==='back')o.sprite.setDepth(DEPTH.backDecor);
    else if(layer==='front')o.sprite.setDepth(DEPTH.frontDecor);
    else o.sprite.setDepth(DEPTH.mainBase+o.cfg.y);
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
    this.cityLamps = [];
    for (const {p,img, effects} of this.propViews.values()) {
      if(p.k==='city_lamp_01')this.cityLamps.push(img);
      if(p.fire&&!services.edit){
        const top=p.y-img.displayHeight*0.55;
        const glow=this.addGlow(p.x,top,0xff8a3a,0.55,null,1.9);
        effects.push(glow);
        this.tweens.add({targets:glow,scale:{from:1.7,to:2.1},duration:120+this.random()*80,yoyo:true,repeat:-1});
        effects.push(this.add.particles(p.x,top,'fx_dot',{
          x:{min:-8,max:8},speedY:{min:-90,max:-40},speedX:{min:-12,max:12},scale:{start:0.75,end:0},alpha:{start:0.9,end:0},
          lifespan:620,frequency:55,tint:[COLORS.fire,0xffc46b,0xff3b2f],blendMode:'ADD',
        }).setDepth(DEPTH.fx));
      }
    }
    if (services.edit) return;
    for (const a of AMBIENT) {
      if (!touchesLocation(a.rect, this.loc)) continue;
      this.add.particles(0, 0, 'fx_dot', {
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(a.rect.x, a.rect.y, a.rect.w, a.rect.h) },
        speedY: { min: -9, max: -2 }, speedX: { min: -7, max: 7 }, scale: { start: 0.38, end: 0 }, alpha: { start: 0.85, end: 0 },
        lifespan: 4200, frequency: a.frequency, quantity: a.quantity, tint: a.color, blendMode: 'ADD',
      }).setDepth(DEPTH.fx);
    }
  }

  /** v0.28.0: «живой мир» — рябь, качающиеся кроны, птицы, зверёк, листья (только лес Мирры, выключается в настройках). */
  setupLife() {
    this.life = null;
    if (services.edit) return;
    const settings = services.settings;
    this.life = new LivingWorld(this);
    this.life.start(settings);
    if (!settings?.listeners) return;
    const onChange = (key, value) => {
      if (key !== 'anim' || !this.life) return;
      if (value) this.life.start(settings); else this.life.stop();
    };
    settings.listeners.add(onChange);
    this.events.once('shutdown', () => { settings.listeners.delete(onChange); this.life?.destroy(); this.life = null; });
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
    this.toast(`Не хватает маны: ${cur} / ${cost}.\n${T(STORY.manaShortHelp, elixir)}`, COLORS.mana);
    this.bus.emit(MSG.HUD_HIGHLIGHT, 'mana');
    services.audio.play('locked');
    if (obj?.sprite) this.tweens.add({ targets: obj.sprite, x: obj.sprite.x + 3, duration: 50, yoyo: true, repeat: 2 });
  }

  /** Облачко с мыслью героя над головой (контекстные реплики и подсказки). */
  heroSay(text, ms = 3400) {
    text = T(text);   // v0.9.2: варианты для ведьмы / колдуна
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

  /**
   * v0.27.0: цель наведения с учётом локаций. Сначала — цели шага в этой локации; если цель шага в другой локации —
   * ведём к выходу (указателю «Карта мира»).
   */
  guideTarget() {
    const g = services.guidance;
    const present = (x) => this.objects.some(o => o.id === x) || this.enemies.some(e => e.id === x);
    const id = g.targetId((x) => !present(x) || this.targetDone(x));
    if (id && present(id) && !this.targetDone(id)) return id;
    if (this.loc) {
      const ids = STEP_GUIDE[g.step().id]?.targets || [];
      if (ids.some(x => !present(x) && ALL_TARGETS.has(x) && !inLocation(ALL_TARGETS.get(x), this.loc) && !this.targetDoneElsewhere(x))) return this.loc.exit;
    }
    return null;
  }

  /** v0.27.0: цель в другой локации уже выполнена (подобран предмет, побеждён враг) — к выходу не ведём. */
  targetDoneElsewhere(id) {
    const st = services.state, cfg = ALL_TARGETS.get(id);
    if (!cfg) return true;
    if (cfg.requiresEvent && !st.hasEvent(cfg.requiresEvent)) return true;
    if (ENEMY_SPAWNS.includes(cfg)) return enemyDownNow(st, cfg);
    const o = st.getObject(id);
    return ['read', 'opened', 'collected', 'done', 'removed'].includes(o?.state);
  }

  /** v0.27.0: отправиться в другую локацию (с карты мира у выхода). Сцена перезапускается уже в новой локации. */
  travelToLocation(id, at = null) {
    const loc = locationById(id), st = services.state;
    if (!loc || !this.loc || loc.id === this.loc.id || this.inTransition) return;
    if (!locationOpen(loc, (k) => st.hasEvent(k))) { this.toast(loc.lockedText || 'Пока закрыто.', COLORS.danger); return; }
    this.inTransition = true;
    services.mode = 'transition';
    this.player.stop();
    const cam = this.cameras.main;
    cam.fadeOut(420, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const t = at || loc.arrival;
      const a = { x: Math.round(t.x), y: Math.round(t.y) };
      st.data.player = { ...a };
      st.data.safePoint = { ...a };
      st.save();
      services.mode = 'exploration';
      this.scene.restart();
    });
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
    const id = this.guideTarget();
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
    const W = cam.width, H = cam.height, m = 70;
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
    this.objects?.forEach(o => {o.refresh();this.styleEntity(o);});
    this.enemies?.forEach(e => {e.refresh();this.styleEntity(e);});
    for(const {p,img} of this.propViews.values())img.setVisible(services.edit||!p.requires||services.state.hasEvent(p.requires));
    this.cityPresentation?.refresh();
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
  // v0.9.1: пока сервер выполняет действие (лечение, стартовый набор), мир стоит — см. systems/WorldClock.js
  canAct() { return services.mode === 'exploration' && !services.modalOpen && !services.offline && !serverActionBusy(services) && this.scene.isActive(); }

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
      this.toast('Астрал ещё не открыт. Его след ведёт к Древним воротам.', COLORS.seal);
      return;
    }
    if (!abilities.isUnlocked(id)) { this.toast('Этот дар ещё не изучен'); return; }
    if (!services.state.isEquipped(id)) { this.toast(`Дар «${ABILITIES[id].name}» не в слоте — поставьте его в «Дарах» (Сумка → Дары).`); return; }   // v0.18.0
    this.interaction.act(id);
  }

  /** Сетки для поиска пути по живым препятствиям (блокираторы объектов появляются и исчезают). Пересборка — только при изменениях. */
  navGrids() {
    const solids = [];
    let sig = 0;
    for (const z of this.solids.getChildren()) {
      const b = z.body; if (!b) continue;
      solids.push({ x: b.x, y: b.y, w: b.width, h: b.height });
      sig = (sig * 31 + Math.round(b.x * 3 + b.y * 7 + b.width * 11 + b.height * 13)) | 0;
    }
    sig = sig + ':' + solids.length;
    if (this.loc) {   // v0.27.0: за краем локации пути нет — маршрут не уводит к соседям
      const R = this.loc.rect, W = WORLD.width, H = WORLD.height;
      for (const r of [{ x: 0, y: 0, w: R.x, h: H }, { x: R.x + R.w, y: 0, w: W - R.x - R.w, h: H }, { x: R.x, y: 0, w: R.w, h: R.y }, { x: R.x, y: R.y + R.h, w: R.w, h: H - R.y - R.h }]) {
        if (r.w > 0 && r.h > 0) solids.push(r);
      }
    }
    if (this.navCache?.sig !== sig) {
      const dims = { width: WORLD.width, height: WORLD.height, solids };
      this.navCache = { sig, grids: [buildNav(dims), buildNav({ ...dims, pad: 0 })] }; // с запасом; без запаса — для узких проходов
    }
    return this.navCache.grids;
  }

  /** Маршрут героини к точке в обход препятствий; null — маршрут построить не удалось (идём по прямой, как раньше). */
  planPath(x, y) {
    try { return findPath(this.navGrids(), { x: this.player.x, y: this.player.y }, { x, y }); } catch (e) { console.warn('[nav]', e); return null; }
  }

  onTap({ x, y }) {
    if (!this.canAct()) return;
    const wp = this.cameras.main.getWorldPoint(x, y);
    const obj = this.interaction.pick(wp.x, wp.y);
    const goal = obj ? { x: obj.x, y: obj.y } : { x: wp.x, y: wp.y };
    const route = this.planPath(goal.x, goal.y);
    // куда на самом деле дойдём: закрытая цель → ближайшая достижимая точка (метка ставится туда)
    const end = route?.end || goal;
    const blocked = !!route && !route.complete && Math.hypot(end.x - goal.x, end.y - goal.y) > (obj ? obj.radius : 100);
    const markAt = obj || !route ? { x: wp.x, y: wp.y } : end;
    const mark = this.add.image(markAt.x, markAt.y, 'fx_ring').setDisplaySize(50, 22).setTint(blocked ? 0xff7a6b : obj ? obj.markerColor : 0xffffff).setAlpha(0.8).setDepth(DEPTH.path + 2);
    this.tweens.add({ targets: mark, alpha: 0, scale: mark.scale * 1.6, duration: 450, onComplete: () => mark.destroy() });
    if (obj) {
      const go = () => { if (obj.isAvailable() && this.canAct()) { this.interaction.setFocus(obj); this.interaction.act(null); } };
      const dist = () => Math.hypot(obj.x - this.player.x, obj.y - this.player.y);
      if (dist() <= obj.radius) { go(); return; }
      // путь кончился у самого объекта (его стена не пускает ближе) — это тоже «пришли», если в зоне взаимодействия
      const onFail = () => { if (dist() <= obj.radius && this.canAct()) go(); else if (blocked) this.toast('Сюда не пройти'); };
      this.player.walkTo(obj.x, obj.y, go, obj.radius * 0.8, { path: route?.points, onFail });
    } else {
      this.player.walkTo(wp.x, wp.y, null, undefined, { path: route?.points });
      if (blocked) this.toast('Сюда не пройти');
    }
  }

  // ------------------------------------------------------------------ бой
  startCombat(trigger, { manual = false } = {}) {
    if (this.inTransition || this.time.now < (this.combatBlockedUntil || 0)) return;
    this.inTransition = true;
    services.mode = 'transition';
    this.player.stop();
    this.interaction.clearFocus();
    // v0.9: точка «перед боем» — сюда героиня вернётся после поражения (не safePoint). Сохраняется до старта боя,
    // поэтому перезагрузка посреди боя тоже вернёт её сюда (см. resumeEncounters).
    const at = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    const prevEnc = services.state.getObject(encKey(trigger.id));
    services.state.setObject(encKey(trigger.id), { state: 'fighting', x: at.x, y: at.y });
    this.savePosition();
    if (trigger.cfg.startEvent) services.quests.complete(trigger.cfg.startEvent, { spawnId: trigger.id }, { mirror: false });   // v0.15.0: на сервере событие ставит combat_start
    const cam = this.cameras.main;
    this.toast(`${trigger.def.name} преграждает путь!`, COLORS.danger);
    cam.shake(250, 0.006);
    services.audio.play('combat_start');
    services.audio.vibrate(60);
    // v0.12.0: сервер должен узнать о бое до его начала (восстановление HP и маны встаёт); идёт параллельно затемнению
    const started = services.actions ? services.actions.combatStart(trigger.id, trigger.cfg.enemy) : Promise.resolve({ ok: true });
    cam.fadeOut(450, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, async () => {
      const r = await started;
      if (!r.ok) { this.cancelCombat(trigger, prevEnc, r); return; }
      this.scene.sleep();
      this.scene.run('CombatScene', { spawnId: trigger.id, enemyType: trigger.cfg.enemy });
      this.scene.bringToTop('UIScene');
    });
  }

  /** v0.26.0: Магическая Дуэль. Сервер подбирает соперника и запоминает его слепок; бой — обычный CombatScene с этим соперником. */
  async startDuel() {
    if (this.inTransition || services.mode !== 'exploration') return;
    this.inTransition = true;
    services.mode = 'transition';
    this.player.stop();
    this.interaction.clearFocus();
    this.savePosition();
    const r = await services.actions.duelStart();
    if (!r?.ok) {
      this.inTransition = false;
      services.mode = 'exploration';
      this.toast({ attempts: 'На сегодня попытки Дуэли закончились.', locked: 'Дуэль откроется после главы II.', combat: 'Сначала закончите бой.', network: 'Нет связи с сервером.' }[r?.reason] || 'Не удалось начать Дуэль.', COLORS.danger);
      return;
    }
    const opp = r.opponent || {};
    this.toast(`Соперник: ${opp.name}${opp.ghost ? '' : `, ${opp.level} уровень`}`, COLORS.gold);
    services.audio.play('combat_start');
    const cam = this.cameras.main;
    cam.fadeOut(450, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.sleep();
      this.scene.run('CombatScene', { spawnId: 'duel', enemyType: 'duel_mage', duel: true });
      this.scene.bringToTop('UIScene');
    });
  }

  /** Сервер не принял начало боя (нет связи, занят): бой не начинается, враг остаётся как был. */
  cancelCombat(trigger, prevEnc, r) {
    const st = services.state;
    if (prevEnc) st.setObject(encKey(trigger.id), prevEnc); else delete st.data.worldObjects[encKey(trigger.id)];
    st.save();
    this.combatBlockedUntil = this.time.now + 2500;
    this.cameras.main.fadeIn(300);
    this.inTransition = false;
    services.mode = 'exploration';
    if (r.reason !== 'busy') this.toast(r.reason === 'bag_pending' ? 'Заберите или выбросьте незабранные награды в сумке перед новым боем.' : r.reason === 'network' ? 'Нет связи с сервером — бой не начался.' : 'Не удалось начать бой. Попробуйте ещё раз.', COLORS.danger);
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
    if (data.duel) this.time.delayedCall(500, () => this.bus.emit(MSG.OPEN_DUEL));   // v0.26.0: после Дуэли — снова окно Дуэли
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
    let interrupted = false;
    for (const e of this.enemies) {
      const enc = st.getObject(encKey(e.id));
      if (!enc || e.defeated) continue;
      if (enc.state === 'fighting') {
        interrupted = true;
        st.setObject(encKey(e.id), { state: 'lost' });
        const floor = Math.max(1, Math.ceil(vitals.maxHp(st) * 0.2));
        if (vitals.hp(st) < floor) vitals.setHp(st, floor);
        if (Number.isFinite(enc.x)) { this.player.setPosition(enc.x, enc.y); st.data.player = { x: enc.x, y: enc.y }; }
        st.save();
      }
      this.watchRetry(e);
    }
    // v0.12.0: сервер мог остаться в «бою» (вкладку закрыли до итога) — сообщаем об отступлении, восстановление продолжится
    if (interrupted || st.data.combatSince != null) services.actions?.combatEnd('retreat')?.catch(() => {});
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
    // v0.20.0: события «пришёл в место» (например, первый вход в город); условия и награду проверяет сервер
    const ze = ZONE_EVENTS[z.id];
    if (ze && !services.state.hasEvent(ze.event) && (ze.requires || []).every(e => services.state.hasEvent(e))) services.quests.complete(ze.event);
  }

  /** v0.20.0: переход между лесом и городом — затемнение, герой на новом месте, точка возрождения там же. */
  travelTo(target, text) {
    if (!target || this.traveling) return;
    if (this.loc && !inLocation(target, this.loc)) {   // v0.27.0: в другую локацию — только через перезапуск сцены
      const loc = locationAt(target.x, target.y);
      if (loc) this.travelToLocation(loc.id, target);
      return;
    }
    this.traveling = true;
    const cam = this.cameras.main;
    cam.fadeOut(260, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      this.player.setPosition(target.x, target.y);
      const st = services.state;
      st.data.player = { x: Math.round(target.x), y: Math.round(target.y) };
      st.data.safePoint = { x: Math.round(target.x), y: Math.round(target.y) };
      st.save();
      this.zone = null;
      this.updateZone();
      cam.fadeIn(320);
      this.traveling = false;
      if (text) this.toast(text);
    });
  }

  update(time, delta) {
    if (this.editor) return;
    const dt = Math.min(delta, 50) / 1000;
    const { state } = services;
    const active = this.canAct();
    // время игры и восстановление HP/маны по часам (в доме Мирры мана быстрее); во время действия сервера время игры стоит
    if (advanceWorld(state, delta, { frozen: serverActionBusy(services), inHouse: this.zone?.id === VITALS.houseZone })) this.vitalsDirty = true;
    if (!active) {
      if (services.mode !== 'combat') this.player.stop();
      this.placeSpeech();
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
    for (const o of this.objects) o.update(dt, this.player);
    this.updateGuidance(dt);
    this.placeSpeech();

    for (const o of this.objects) {
      if (o instanceof PickupObject && o.canAuto() && Math.hypot(o.x - this.player.x, o.y - this.player.y) < o.autoRadius) o.interact();
    }
    for (const e of this.enemies) {
      if (e.update(dt, this.player)) { this.startCombat(e); break; }
    }

    this.autosaveT += delta;
    if (this.autosaveT >= SAVE.autosaveIntervalMs) { this.autosaveT = 0; this.savePosition(); }
  }
}
