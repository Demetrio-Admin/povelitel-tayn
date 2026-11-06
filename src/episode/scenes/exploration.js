// Мир эпизода: тот же лес Мирры и Морозный лес, та же камера (профиль B) и управление, но содержимое главы заменено
// объектами эпизода. Объекты основной игры в этом режиме не создаются и не сохраняются.
import Phaser from 'phaser';
import { COLORS, DEPTH } from '../../config/game.config.js';
import { MSG } from '../../state/EventBus.js';
import { services } from '../../services.js';
import { locationById, inLocation } from '../../config/locations.js';
import { frostwoodPoint, FROSTWOOD_ARRIVAL } from '../../config/frostwood.plan.js';
import { ensureLocationWithScreen, ensurePacks, isPackLoaded } from '../../systems/assetPacks.js';
import { showLoadingScreen, hideLoadingScreen } from '../../ui/loadingScreen.js';
import { NpcObject } from '../../objects/NpcObject.js';
import { InteractiveObject } from '../../objects/InteractiveObject.js';
import * as vitals from '../../state/vitals.js';
import { CameraExplorationScene } from '../../camera-test/scenes.js';
import { EPISODE_CLASSES } from '../objects.js';
import { encounterReward, ENCOUNTERS } from '../model/progression.js';
import { MOVES } from '../model/combat.js';
import { episode } from '../runtime.js';
import { atLeast, ritualMissing, stepDef } from '../model/story.js';
import { EPISODE_CONTENT, EPISODE_DECOR, NPC_PLACES, HERO_START } from '../content.js';

const EXTRA_PACKS = ['chapter2', 'frostwood'];

/** Объект основной игры, который в эпизоде не нужен: ничего не рисует и не участвует во взаимодействии. */
class Absent {
  constructor(cfg) { this.cfg = cfg; this.id = cfg.id; this.removed = true; this.sprite = { active: false, setVisible() {}, displayHeight: 0, displayWidth: 0 }; }
  refresh() {} update() {} isAvailable() { return false; } isDone() { return true; } requirementsMet() { return false; }
}

class EpisodeNpc extends NpcObject {
  requirementsMet() { return true; }
  moveTo(x, y) {
    const dx = x - this.x, dy = y - this.baseY;
    if (!dx && !dy) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setPosition(x, y); this.baseY = y; this.cfg = { ...this.cfg, x, y };
    this.sprite.setDepth(DEPTH.mainBase + y);
    this.relocate(dx, dy);
    if (this.blocker) { this.blocker.setPosition(x, y - (this.cfg.collide?.h || 14) / 2); this.blocker.body?.updateFromGameObject(); }
    this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY };
    this.scene.tweens.add({ targets: this.sprite, scaleY: this.baseScale.y * 1.018, scaleX: this.baseScale.x * 0.992, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
}

/** Неподвижное украшение эпизода (с препятствием или без). */
class EpisodeDecor extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    if (cfg.angle) this.sprite.setAngle(cfg.angle);
    if (cfg.scale) this.sprite.setScale(this.sprite.scaleX * cfg.scale, this.sprite.scaleY * cfg.scale);
    if (cfg.tint) this.sprite.setTint(cfg.tint);
    if (cfg.alpha) this.sprite.setAlpha(cfg.alpha);
  }
  get label() { return 'Осмотреть'; }
  isAvailable() { return !!this.cfg.say && super.isAvailable(); }
  interact() { this.scene.heroSay(this.cfg.say, 3600); }
}

export class EpisodeExplorationScene extends CameraExplorationScene {
  createObject(cfg) {
    if (cfg.episode) {
      if (cfg.kind === 'npc') return new EpisodeNpc(this, cfg);
      if (cfg.kind === 'decor') return new EpisodeDecor(this, cfg);
      const Cls = EPISODE_CLASSES[cfg.kind];
      return new Cls(this, cfg);
    }
    return new Absent(cfg);
  }

  create() {
    // Лёд, волк и арена лежат в пакетах главы II и Морозного леса — догружаем до постройки мира.
    this.ready = false;
    this.morvenSprite = null; // Phaser destroys the old actor on restart/location travel.
    if (!EXTRA_PACKS.every(isPackLoaded)) {
      showLoadingScreen('Собираем магию…');
      ensurePacks(this, EXTRA_PACKS).then(() => { hideLoadingScreen(); this.scene.restart(); });
      return;
    }
    super.create();
    this.ready = true;
    // Враги главы в эпизоде не ходят: единственный бой — волк у стены (своя сцена боя).
    for (const e of this.enemies) { e.idle?.stop(); e.blocker?.destroy(); e.visuals.forEach(v => v.destroy()); }
    this.enemies = [];
    this.objects = this.objects.filter(o => !(o instanceof Absent));
    const here = (c) => inLocation(c, this.loc);
    for (const cfg of [...EPISODE_DECOR, ...EPISODE_CONTENT].filter(here)) this.addObject(this.createObject({ ...cfg, episode: true }));
    this.npcs = Object.fromEntries(this.objects.filter(o => o instanceof EpisodeNpc).map(o => [o.npc.id, o]));
    this.placeNpcs();
    this.refreshAll();
    const off = episode.on(() => { this.placeNpcs(); this.refreshAll(); });
    this.events.once('shutdown', off);
    this.bus.on(MSG.NPC_TALK_END, () => this.time.delayedCall(60, () => this.afterTalk()), this);
    this.introAt = episode.step === 'intro' ? this.time.now + 900 : null;   // вступление Мирры начинается само
    if (this.loc?.id === 'frostwood' && episode.step === 'sanctuary' && episode.note('frostwood_arrival')) {
      episode.save();
      this.time.delayedCall(900, () => this.heroSay('Холод здесь звенит. А там, наверху, у святилища — тот самый тёплый свет.', 4200));
    }
  }

  update(time, delta) {
    if (!this.ready) return;
    super.update(time, delta);
    if (episode.ep.morven && this.textures.exists('cat_01')) {
      if (!this.morvenSprite) this.morvenSprite = this.add.image(this.player.x, this.player.y, 'cat_01').setOrigin(.5, 1);
      this.morvenSprite.setPosition(this.player.x - 48, this.player.y + 8).setDepth(DEPTH.mainBase + this.player.y + 7);
      this.morvenSprite.setScale(48 / this.morvenSprite.height);
    }
    // вступление: как только мир и HUD готовы и ничего не открыто
    if (this.introAt && time >= this.introAt) {
      const ui = this.scene.get('UIScene');
      if (episode.step !== 'intro' || services.dialogue.active) this.introAt = null;
      else if (this.canAct() && ui?.sys.isActive() && !ui.modal) { this.introAt = time + 1500; this.npcs.mirra?.interact(); }
    }
  }

  setupCompanion() {}
  buildContentDecor() { super.buildContentDecor(); }

  placeNpcs() {
    const step = episode.step;
    for (const [id, npc] of Object.entries(this.npcs || {})) {
      const places = NPC_PLACES[id] || [];
      const p = [...places].reverse().find(pl => atLeast(episode.ep, pl.from)) || places[0];
      if (p) npc.moveTo(p.x, p.y);
      npc.updateBadge();
    }
    if (step === 'ask_fire' && episode.note('mirra_came')) {
      episode.save();
      this.time.delayedCall(4600, () => this.toast('Мирра пришла к старому кругу у алтаря — она почувствовала холод', 0xc9a2ff));
    }
  }

  afterTalk() {
    // в разговоре мог смениться шаг — значки и цели пересчитываются
    for (const n of Object.values(this.npcs || {})) n.updateBadge();
    if (episode.step === 'gather') this.checkGather();
  }

  // ------------------------------------------------------------------ подсказка цели: кольцо и стрелка
  guideTarget() {
    const s = stepDef(episode.step);
    if (s.id === 'gather') {
      const missing = ritualMissing(services.state.data.inventory).map(m => m.id);
      const want = this.objects.filter(o => !o.removed && o.isAvailable() && (
        (missing.includes('tree_resin') && o.cfg.purpose === 'resin') ||
        (missing.includes('moon_herb') && o.cfg.item === 'moon_herb') ||
        (missing.includes('frost_shard') && o.cfg.item === 'frost_shard')));
      if (!want.length) return null;
      const p = this.player;
      want.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      return want[0].id;
    }
    if (s.id === 'herbs') {
      const first = this.objects.find(o => o.id === 'ep_herbs_1');
      return first && !first.isDone() ? 'ep_herbs_1' : 'ep_herbs_2';
    }
    if (s.id === 'enter' && this.loc?.id !== 'forest') return null;
    if (s.id === 'sanctuary' && this.loc?.id !== 'frostwood') return 'ep_frost_path';
    return s.target && this.objects.some(o => o.id === s.target) ? s.target : null;
  }

  targetDone(id) {
    const o = this.objects.find(x => x.id === id);
    return !o || o.removed;
  }

  updateGuidance(dt) {
    const id = this.guideTarget();
    const o = id ? this.objects.find(x => x.id === id) : null;
    const pos = o && !o.removed ? { x: o.x, y: o.baseY, h: o.sprite.displayHeight, w: o.sprite.displayWidth } : null;
    const focused = this.interaction.focus && this.interaction.focus.id === id;
    if (pos && !focused) {
      const d = Math.hypot(pos.x - this.player.x, pos.y - this.player.y);
      const show = d < 900 && d > 60;
      this.guideRing.setVisible(show).setPosition(pos.x, pos.y - 2)
        .setDisplaySize(Math.max(110, pos.w * 1.2), Math.max(110, pos.w * 1.2) * 0.4)
        .setAlpha(0.28 + (Math.sin(this.time.now / 380) + 1) * 0.16);
    } else this.guideRing.setVisible(false);
    this.pointerT -= dt;
    if (this.pointerT <= 0) {
      this.pointerT = 0.12;
      this.bus.emit(MSG.GUIDE_POINTER, pos && !focused ? this.screenPointer(pos) : null);
    }
  }

  /** Стрелка к цели не заходит на строку цели под HUD. */
  screenPointer(pos) {
    const p = super.screenPointer(pos);
    if (p) p.y = Math.max(p.y, 270);
    return p;
  }

  // ------------------------------------------------------------------ магия, сцены и переходы эпизода
  runMagic(kind, opts) {
    if (this.scene.isActive('EpisodeMagicScene')) return Promise.resolve('cancel');
    this.interaction.clearFocus?.();
    return new Promise((resolve) => {
      this.scene.launch('EpisodeMagicScene', { kind, opts, resolve });
      this.scene.bringToTop('EpisodeMagicScene');
    });
  }

  /** Короткая сцена-окно (последствие, урок, открытие). after — после закрытия. */
  showScene(opts, after = null) {
    const buttons = (opts.buttons || [{ label: 'Дальше', primary: true }]).map(b => ({ ...b, onClick: () => { b.onClick?.(); after?.(); } }));
    this.bus.emit(MSG.DIALOG, { ...opts, buttons });
  }

  revealFire() {
    this.cameras.main.flash(500, 255, 170, 90);
    this.burst(this.player.x, this.player.y - 60, COLORS.fire, 34);
    this.showScene({
      title: 'Огонь проснулся', color: COLORS.fire,
      text: 'Искра взялась — и вы почувствовали её в ладонях: тёплую, живую, нетерпеливую.\n\n'
        + 'Огонь в мире работает удержанием: прижмите палец — жар растёт, отпустите — спадает. Нужен ровный жар, а не самый сильный.',
      buttons: [{ label: 'Попробовать', primary: true }],
    }, () => this.time.delayedCall(300, () => this.heroSay('Веда машет рукой — её травы во льду.', 3400)));
  }

  checkGather() {
    if (episode.step !== 'gather') return;
    if (!ritualMissing(services.state.data.inventory).length) {
      episode.advance('gather');
      this.toast('Всё для ритуала собрано — к кругу огня', COLORS.fire);
    } else episode.changed();
  }

  wolfAppears() {
    const wolf = this.objects.find(o => o.id === 'ep_wolf');
    if (!wolf) return;
    wolf.refresh();
    wolf.sprite.setAlpha(0);
    this.tweens.add({ targets: wolf.sprite, alpha: 1, duration: 500 });
    this.cameras.main.shake(260, 0.006);
    services.audio.play('locked');
    this.heroSay('Из-за тающего льда — волк. Белый, как метель.', 2600);
    this.time.delayedCall(1700, () => this.startEpisodeFight());
  }

  startEpisodeFight(enemyId = 'frost_wolf', source = null) {
    if (this.scene.isActive('EpisodeCombatScene') || this.inTransition) return;
    this.player.stop();
    services.mode = 'combat';
    const ui = this.scene.get('UIScene');
    this.scene.launch('EpisodeCombatScene', {
      enemyId,
      onEnd: (result, battle) => {
        services.mode = 'exploration';
        this.scene.resume();
        if (ui) { this.scene.wake('UIScene'); }
        this.cameras.main.fadeIn(300);
        if (result === 'cancel') return;
        if (battle?.stats.heals) services.state.removeItem('potion_life_small', 1);
        if (result === 'victory') {
          encounterReward(services.state.data, ENCOUNTERS[enemyId], Object.keys(battle.stats.commands).filter(id => MOVES[id]).map(id => MOVES[id].powerId));
          episode.ep.encounters[enemyId] = (episode.ep.encounters[enemyId] || 0) + 1;
          episode.save();
          if (enemyId !== 'frost_wolf') {
            source?.persist({ readyAt: Date.now() + 12000 });
            this.toast(`${ENCOUNTERS[enemyId].name}: добыча и опыт получены. Улучшения — в «Магии».`, 0xffd08a);
            this.bus.emit(MSG.HUD_REFRESH); return;
          }
          episode.ep.fights += 1;
          episode.advance('fight');
          vitals.setHp(services.state, vitals.maxHp(services.state));
          services.state.save();
          this.objects.find(o => o.id === 'ep_wolf')?.remove(true);
          this.time.delayedCall(500, () => this.showScene({
            title: 'Путь открыт', color: 0x9fe9ff,
            text: 'Волк метели уходит в снег, прихрамывая. За растаявшей стеной — тропа, присыпанная инеем. Холод тянет оттуда, а тёплый свет — ещё дальше, в Морозном лесу.',
            buttons: [{ label: 'Вперёд', primary: true }],
          }));
        } else {
          episode.ep.defeats += 1;
          episode.save();
          vitals.setHp(services.state, Math.round(vitals.maxHp(services.state) * 0.6));
          services.state.save();
          this.showScene({ title: 'Нужно больше силы', color: COLORS.danger,
            text: 'Вы отступили. Противник ждёт в лесу.\n\nОткройте «Магию»: можно улучшить дар, сварить настой или найти более лёгкого врага для добычи. Набор приёмов выбирается перед боем.' });
        }
        this.bus.emit(MSG.HUD_REFRESH);
      },
    });
    this.scene.bringToTop('EpisodeCombatScene');
    this.scene.pause();
    if (ui) this.scene.sleep('UIScene');
  }

  walkToEpisodeObject(id) {
    const obj = this.objects.find(o => o.id === id && !o.removed);
    if (!obj) { this.toast('Этот объект остался в Лесу Мирры.'); return; }
    const route = this.planPath(obj.x, obj.y);
    if (!route || (!route.complete && Math.hypot(route.end.x - obj.x, route.end.y - obj.y) > obj.radius)) { this.toast('Путь пока перекрыт. Следуйте цели эпизода.'); return; }
    this.player.walkTo(obj.x, obj.y, () => {
      if (obj.isAvailable() && this.canAct()) { this.interaction.setFocus(obj); this.interaction.act(); }
      else this.toast('Объект ещё восстанавливается или ждёт следующего шага истории.');
    }, obj.radius * .8, { path: route.points });
  }

  enterFrostwood() {
    const loc = locationById('frostwood');
    if (!loc || this.inTransition) return;
    this.inTransition = true;
    services.mode = 'transition';
    this.player.stop();
    this.interaction.clearFocus();   // кнопка действия не должна остаться от тропы
    const cam = this.cameras.main;
    cam.fadeOut(420, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      ensureLocationWithScreen(this, loc).then(() => {
        const a = { x: Math.round(FROSTWOOD_ARRIVAL.x), y: Math.round(FROSTWOOD_ARRIVAL.y) };
        services.state.data.player = { ...a };
        services.state.data.safePoint = { ...a };
        episode.advance('enter');
        services.state.save();
        services.mode = 'exploration';
        this.scene.restart();
      });
    });
  }

  finale() {
    this.time.delayedCall(700, () => this.showScene({
      title: 'Пламя в кристалле', color: 0xffc46b,
      text: 'Лёд лопается, и из кристалла поднимается живое пламя — маленькое, как птица, и горячее, как полдень.\n\n'
        + '«Меня заперли здесь холодом, — шелестит огонь. — Тот, кто это сделал, унёс сердце зимы на старое кладбище. Ты умеешь держать жар. Научишься соединять силы — найдёшь его».',
      buttons: [{ label: 'Дальше', primary: true }],
    }, () => this.bus.emit('episode:end')));
  }

  travelToLocation() { /* карта мира в эпизоде не открывается: переходы — по тропам эпизода */ }
}

export const EPISODE_POINTS = { frostwoodPoint, HERO_START };
