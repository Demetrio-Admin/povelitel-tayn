// Объекты мира эпизода. Действия выполняются на устройстве (изолированное сохранение), без серверных операций.
// Routine magic is one tap; rare story actions retain direct control.
import { COLORS, DEPTH } from '../config/game.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import * as vitals from '../state/vitals.js';
import { InteractiveObject } from '../objects/InteractiveObject.js';
import { checkWorldAction, powerDefinition } from '../config/magic.powers.js';
import { ENCOUNTERS } from './model/progression.js';
import { episode } from './runtime.js';
import { atLeast, notePractice, ritualMissing, RITUAL_NEEDS } from './model/story.js';
import { SCENES } from './dialogues.js';
import { applyMonsterArt, addMonsterShadow } from '../world/monsterArt.js';

const FROST_TINT = 0xbfe2ff;
const CHAR_TINT = 0x3a2a24;

/** Базовый объект эпизода: виден/доступен по шагам, ничего не отправляет на сервер. */
class EpisodeObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    if (cfg.angle) this.sprite.setAngle(cfg.angle);
    if (cfg.scale) { this.sprite.setScale(this.sprite.scaleX * cfg.scale, this.sprite.scaleY * cfg.scale); this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY }; }
    this.saved = { ...(services.state.getObject(this.id) || {}) };
  }
  get ep() { return episode.ep; }
  shownNow() { return (!this.cfg.fromStep || atLeast(this.ep, this.cfg.fromStep)) && (!this.cfg.untilStep || !atLeast(this.ep, this.cfg.untilStep)); }
  requirementsMet() { return this.shownNow(); }
  refresh() {
    if (this.removed) return;
    const vis = this.shownNow();
    this.sprite.setVisible(vis);
    for (const g of this.glows || []) g.setVisible(vis);
    if (this.blocker?.body) this.blocker.body.enable = vis && !this.cfg.passable;
  }
  persist(patch) { Object.assign(this.saved, patch); services.state.setObject(this.id, patch); services.state.save(); }
  magic(id, actionId, spend = true) {
    const st = checkWorldAction(services.state.data, id, actionId, { mana: vitals.mana(services.state), experimental: true });
    if (!st.ok) { this.scene.toast(st.reason); return false; }
    if (spend && st.action.mana) vitals.spendMana(services.state, st.action.mana);
    return true;
  }
  practice(id, amount = 4) { services.state.addSchoolXP(id, amount); services.state.save(); }
  say(text, ms) { this.scene.heroSay(text, ms); }
}

// ------------------------------------------------------------------ огонь: отогреть, вытопить, зажечь, разбудить
const HEAT_PURPOSE = {
  herbs: { label: 'Отогреть', icon: 'icon_fire', band: [0.42, 0.66], over: 0.76, need: 1.6, title: 'Отогреть травы', hint: 'Держите палец — жар растёт. Держите жар в тёплой полосе.' },
  resin: { label: 'Вытопить смолу', icon: 'icon_fire', band: [0.5, 0.74], over: 0.86, need: 1.4, title: 'Вытопить смолу', hint: 'Смола течёт от ровного жара. Перегреете — вспыхнет.' },
  lantern: { label: 'Зажечь', icon: 'icon_fire', band: [0.34, 0.7], over: 0.9, need: 0.6, title: 'Зажечь фонарь', hint: 'Немного тепла — и фитиль займётся.' },
  spark: { label: 'Раздуть искру', icon: 'icon_fire', band: [0.5, 0.82], over: 0.96, need: 2, title: 'Первая искра', hint: 'Держите ладони над углями. Не жадничайте: огонь не любит рывков.' },
};

export class EpHeat extends EpisodeObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.ability = 'fire';
    this.purpose = HEAT_PURPOSE[cfg.purpose];
    this.state0 = this.saved.state || 'frozen';
    if (this.state0 === 'done') this.showDone(false);
    else if (this.state0 === 'charred') this.showCharred(false);
    else if (cfg.frozen) this.sprite.setTint(FROST_TINT);
  }
  get markerIcon() { return 'icon_fire'; }
  get markerColor() { return services.abilities.isUnlocked('fire') ? COLORS.fire : 0x7a6a62; }
  get label() { return this.purpose.label; }
  isDone() { return this.state0 === 'done' || this.state0 === 'charred'; }
  isAvailable() { return super.isAvailable() && this.shownNow() && (!this.cfg.activeStep || this.ep.step === this.cfg.activeStep || (this.cfg.purpose === 'lantern' && atLeast(this.ep, 'herbs'))); }

  async interact(abilityId) {
    if (abilityId && abilityId !== 'fire') { this.scene.toast('Здесь нужен Огонь.', COLORS.fire); return; }
    if (!services.abilities.isUnlocked('fire')) { this.scene.toast('Здесь нужен Огонь.', COLORS.fire); return; }
    if (this.cfg.purpose === 'herbs' && this.cfg.second && !this.ep.charred) { this.scene.toast('Эта связка подождёт — начните с первой.'); return; }
    if (!this.magic('fire', this.cfg.purpose === 'resin' ? 'resin' : this.cfg.purpose === 'lantern' ? 'lantern' : 'heat', false)) return;
    // Routine uses are one tap; the first story herbs keep the heat lesson.
    if (this.cfg.purpose === 'lantern' || this.cfg.purpose === 'resin') {
      if (!this.magic('fire', this.cfg.purpose === 'resin' ? 'resin' : 'lantern')) return;
      this.scene.player.castAt(this.x, this.baseY, 'fire');
      this.scene.castFx(this.x, this.baseY - 60, COLORS.fire);
      this.succeed(true);
      return;
    }
    const r = await this.scene.runMagic('heat', { obj: this, task: { band: this.purpose.band, need: this.purpose.need, over: this.purpose.over }, title: this.purpose.title, hint: this.purpose.hint });
    if (r === 'done') this.succeed(false);
    else if (r === 'over') this.fail();
  }

  /** Видимое состояние во время жара: оттаивание, пар, языки пламени. */
  setHeat(v) {
    if (this.removed || !this.sprite.active) return;
    const warm = Math.min(1, v / 0.7);
    if (this.cfg.frozen) {
      const lerp = (a, b) => Math.round(a + (b - a) * warm);
      const c = (FROST_TINT >> 16 & 255), g = (FROST_TINT >> 8 & 255), b = FROST_TINT & 255;
      this.sprite.setTint((lerp(c, 255) << 16) | (lerp(g, v > 0.85 ? 150 : 236) << 8) | lerp(b, v > 0.85 ? 90 : 210));
    } else if (v > 0.85) this.sprite.setTint(0xffb080);
    else this.sprite.clearTint();
  }

  succeed(quick) {
    const ep = this.ep, purpose = this.cfg.purpose;
    this.state0 = 'done';
    this.persist({ state: 'done' });
    this.showDone(true);
    services.audio.play('unlock_magic');
    if (purpose === 'spark') {
      services.abilities.unlock('fire', 1);
      ep.fireLevel = Math.max(ep.fireLevel, 1);
      episode.advance('spark');
      this.scene.revealFire();
      return;
    }
    this.practice('fire');
    const confident = notePractice(ep);
    if (purpose === 'herbs') {
      ep.herbsThawed += 1;
      const first = !ep.lesson;
      ep.lesson = true;
      episode.save();
      if (first) this.scene.showScene(SCENES.goodFirst, () => this.scene.showScene(SCENES.lesson));
      this.scene.toast('Травы оттаяли — пахнет летом', 0x8fe39a);
      this.finishHerbs();
    } else if (purpose === 'resin') {
      episode.give({ tree_resin: 1 });
      this.scene.toast('Капля живой смолы', 0xe8b04a);
      episode.save();
    } else if (purpose === 'lantern') {
      this.scene.toast(quick ? 'Фонарь вспыхнул от одного касания' : 'Фонарь горит', COLORS.fire);
      episode.save();
    }
    if (confident) this.scene.toast('Уверенный огонь: жар стал послушнее. Простые действия — одним касанием.', COLORS.fire);
    this.scene.checkGather();
  }

  finishHerbs() {
    if (this.ep.step !== 'herbs') return;
    episode.advance('herbs');
    this.scene.time.delayedCall(400, () => this.scene.showScene({
      title: 'Ритуал Проводника', color: COLORS.fire,
      text: 'Мирра: «Чтобы огонь прошёл сквозь лёд такой толщины, его надо направить. Это ритуал Проводника».\n\n'
        + 'Нужно: смола ×2 — вытопить огнём из смоляных колод; лунная трава ×3 — на поляне у алтаря; осколок льда ×1 — притянуть Телекинезом от подножия стены: огонь должен узнать лёд, который будет плавить.',
    }));
  }

  fail() {
    const purpose = this.cfg.purpose;
    if (purpose === 'spark' || purpose === 'lantern') {
      // перегрев искры или фитиля ничего не ломает: вспышка — и можно сразу снова
      this.scene.burst(this.x, this.baseY - 30, 0xff6a3d, 22);
      this.scene.toast(purpose === 'spark' ? 'Пламя рвануло и опало. Ещё раз — мягче.' : 'Фитиль прогорел. Попробуйте ещё — короче.', COLORS.danger);
      return;
    }
    this.state0 = 'charred';
    this.persist({ state: 'charred' });
    this.showCharred(true);
    if (purpose === 'herbs') {
      const ep = this.ep;
      ep.charred += 1;
      const first = !ep.lesson;
      ep.lesson = true;
      episode.save();
      if (first) this.scene.showScene(SCENES.charred, () => this.scene.showScene(SCENES.lesson));
      else { this.state0 = 'frozen'; this.persist({ state: 'frozen' }); this.scene.toast('Веда принесла свежую связку — можно попробовать снова.', COLORS.danger); }
    } else if (purpose === 'resin') {
      this.state0 = 'frozen'; this.persist({ state: 'frozen' });
      this.ep.resinBurnt += 1;
      episode.save();
      this.scene.toast('Смола вспыхнула и сгорела. В другой колоде ещё есть.', COLORS.danger);
    }
  }

  showDone(animate) {
    this.sprite.clearTint();
    if (this.cfg.purpose === 'lantern' || this.cfg.purpose === 'spark') {
      this.flames = this.scene.add.particles(this.x, this.baseY - (this.cfg.flameY || 40), 'fx_dot', {
        x: { min: -8, max: 8 }, speedY: { min: -90, max: -30 }, scale: { start: 0.7, end: 0 }, alpha: { start: 0.9, end: 0 },
        lifespan: 650, frequency: 70, tint: [COLORS.fire, 0xffc46b], blendMode: 'ADD',
      }).setDepth(DEPTH.fx);
      this.scene.addGlow(this.x, this.baseY - (this.cfg.flameY || 40), COLORS.fire, 0.5, this, 1.4);
    }
    if (animate) this.react(COLORS.fire, 1.12);
  }

  showCharred(animate) {
    this.sprite.setTint(CHAR_TINT);
    if (animate) {
      this.scene.burst(this.x, this.baseY - 30, 0x2a1d18, 26);
      const smoke = this.scene.add.particles(this.x, this.baseY - 40, 'fx_dot', {
        speedY: { min: -60, max: -20 }, speedX: { min: -12, max: 12 }, scale: { start: 1.2, end: 2.4 }, alpha: { start: 0.45, end: 0 },
        lifespan: 1600, frequency: 120, tint: 0x4a403a, duration: 2600,
      }).setDepth(DEPTH.fx);
      this.scene.time.delayedCall(4500, () => smoke.destroy());
    }
  }
}

// ------------------------------------------------------------------ Телекинез: подхватить и отвести
export class EpDrag extends EpisodeObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.ability = 'telekinesis';
    if (cfg.center) this.sprite.setOrigin(0.5, 0.5).setPosition(cfg.x, cfg.y - 20);
    if (this.saved.state === 'moved') this.placeAt(cfg.target.x, cfg.target.y);
  }
  get markerY() { return this.sprite.y - 110; }
  get markerIcon() { return 'icon_telekinesis'; }
  get markerColor() { return COLORS.telekinesis; }
  get label() { return 'Подхватить'; }
  isDone() { return this.saved.state === 'moved'; }

  placeAt(x, y, collide = true) {
    this.sprite.setPosition(x, y - (this.cfg.center ? 20 : 0));
    this.baseY = y;
    this.sprite.setDepth(DEPTH.mainBase + y);
    if (this.blocker) { this.blocker.destroy(); this.blocker = null; }
    if (collide && this.cfg.restCollide) this.blocker = this.scene.addBlocker(x, y, this.cfg.restCollide.w, this.cfg.restCollide.h);
  }

  /** Подхвачено: пока дерево в воздухе, тропа под ним не заперта. */
  liftOff() { if (this.blocker) { this.blocker.destroy(); this.blocker = null; } }
  /** Уронили не в круг — лежит, где упало, и снова мешает. */
  dropAt(x, y) {
    this.sprite.setPosition(x, y - (this.cfg.center ? 20 : 0));
    this.baseY = y; this.cfg = { ...this.cfg, x, y };
    this.sprite.setDepth(DEPTH.mainBase + y);
    if (!this.blocker && this.cfg.collide) this.blocker = this.scene.addBlocker(x, y, this.cfg.collide.w, this.cfg.collide.h);
  }

  async interact(abilityId) {
    if (abilityId && abilityId !== 'telekinesis') { this.scene.toast('Огнём сухое дерево только подожжёшь. Здесь нужен Телекинез.', COLORS.telekinesis); return; }
    if (!this.magic('telekinesis', 'heavy', false)) return;
    const r = await this.scene.runMagic('drag', {
      obj: this, target: this.cfg.target, radius: this.cfg.targetRadius || 80, weight: 'heavy',
      title: 'Телекинез: сухое дерево', hint: 'Прижмите палец к стволу и ведите его в светлый круг у обочины. Тяжёлое — тянется медленно.',
    });
    if (r !== 'done') return;
    this.practice('telekinesis', 10);
    this.persist({ state: 'moved' });
    this.placeAt(this.cfg.target.x, this.cfg.target.y);
    this.scene.cameras.main.shake(160, 0.008);
    services.audio.play('telekinesis_impact', { heavy: true });
    services.audio.vibrate?.(50);
    this.scene.burst(this.cfg.target.x, this.cfg.target.y - 10, 0xb8a990, 20);
    episode.advance('tree');
    this.scene.toast('Северная тропа свободна', COLORS.telekinesis);
  }
}

// ------------------------------------------------------------------ простой сбор (лунная трава)
export class EpGather extends EpisodeObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.ability = null;
    if (this.saved.state === 'collected') this.remove(false);
    else scene.tweens.add({ targets: this.sprite, scaleY: this.baseScale.y * 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  get markerIcon() { return 'icon_hand'; }
  get markerColor() { return 0x9fe9ff; }
  get label() { return 'Сорвать'; }
  isDone() { return this.saved.state === 'collected'; }
  isAvailable() { return super.isAvailable() && atLeast(this.ep, 'gather'); }
  interact() {
    this.persist({ state: 'collected' });
    episode.give({ [this.cfg.item]: 1 });
    episode.save();
    services.audio.play('pickup');
    this.scene.floatText(this.x, this.baseY - 70, '+1', 0x9fe9ff);
    this.busy = true;
    this.scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 40, alpha: 0, scale: this.sprite.scale * 0.6, duration: 380, onComplete: () => this.remove(false) });
    this.scene.checkGather();
  }
}

// ------------------------------------------------------------------ Телекинез: притянуть (осколок льда у стены)
export class EpPull extends EpisodeObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.ability = 'telekinesis';
    if (this.saved.state === 'collected') this.remove(false);
    else scene.addGlow(cfg.x, cfg.y - 20, 0x9fe9ff, 0.45, this, 0.9);
  }
  get markerIcon() { return 'icon_telekinesis'; }
  get markerColor() { return COLORS.telekinesis; }
  get label() { return 'Притянуть'; }
  isDone() { return this.saved.state === 'collected'; }
  isAvailable() { return super.isAvailable() && atLeast(this.ep, 'gather'); }
  interact(abilityId) {
    if (abilityId && abilityId !== 'telekinesis') { this.scene.toast('Здесь нужен Телекинез.', COLORS.telekinesis); return; }
    if (!this.magic('telekinesis', 'pull')) return;
    this.practice('telekinesis');
    const p = this.scene.player;
    this.busy = true;
    p.castAt(this.x, this.baseY, 'telekinesis');
    this.scene.castFx(this.x, this.baseY - 20, COLORS.telekinesis);
    episode.give({ [this.cfg.item]: 1 });
    this.persist({ state: 'collected' });
    this.scene.tweens.add({
      targets: this.sprite, x: p.x, y: p.y - 40, scale: this.sprite.scale * 0.5, duration: 600, ease: 'Sine.easeIn',
      onComplete: () => {
        services.audio.play('pickup');
        episode.save();
        this.scene.toast(this.cfg.gotText || 'Получено', 0x9fe9ff);
        this.remove(false);
        this.scene.checkGather();
      },
    });
  }
}

// ------------------------------------------------------------------ волк метели у растаявшей стены
export class EpWolf extends EpisodeObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    if (applyMonsterArt(this.sprite, cfg.texture)) {
      this.sprite.setScale(this.sprite.scaleX * 1.3, this.sprite.scaleY * 1.3);
      this.shadow = addMonsterShadow(scene, this.sprite, DEPTH.mainBase + cfg.y - 0.1);
      this.shadow?.setScale(this.shadow.scaleX * 1.3, this.shadow.scaleY * 1.3);
    }
    this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY };
  }
  refresh() { super.refresh(); this.shadow?.setVisible(this.sprite.visible); }
  remove(animate) { this.shadow?.destroy(); super.remove(animate); }
  get markerIcon() { return 'icon_fire'; }
  get markerColor() { return COLORS.danger; }
  get label() { return 'Сразиться'; }
  isAvailable() { return !this.removed && this.ep.step === 'fight' && !this.scene.scene.isActive('EpisodeCombatScene'); }
  interact() { this.scene.startEpisodeFight(); }
}

// ------------------------------------------------------------------ круг огня: первая искра и ритуал
export class EpCircle extends EpHeat {
  constructor(scene, cfg) {
    super(scene, { ...cfg, purpose: 'spark' });
    this.state0 = 'idle';
    if (atLeast(this.ep, 'herbs') && !this.flames) this.showDone(false);
    this.runes = [];
  }
  isDone() { return atLeast(this.ep, 'melt'); }
  isAvailable() { return !this.removed && !this.busy && ['spark', 'ritual', 'gather'].includes(this.ep.step); }
  get label() { return this.ep.step === 'spark' ? 'Раздуть искру' : 'Ритуал Проводника'; }
  get markerColor() { return COLORS.fire; }

  async interact() {
    const step = this.ep.step;
    if (step === 'spark') {
      const r = await this.scene.runMagic('heat', { obj: this, task: { band: [0.5, 0.82], need: 2, over: 0.96 }, level: 0, title: 'Первая искра', hint: HEAT_PURPOSE.spark.hint, spark: true });
      if (r === 'done') this.succeed(false); else if (r === 'over') this.fail();
      return;
    }
    const missing = ritualMissing(services.state.data.inventory);
    if (step === 'gather' || missing.length) {
      const names = { tree_resin: 'смола', moon_herb: 'лунная трава', frost_shard: 'осколок льда' };
      this.scene.toast(`Для ритуала не хватает: ${missing.map(m => `${names[m.id]} ${m.have}/${m.need}`).join(', ')}`, COLORS.fire);
      return;
    }
    const r = await this.scene.runMagic('ritual', { obj: this, bands: [[0.3, 0.5], [0.5, 0.7], [0.68, 0.88]], title: 'Ритуал Проводника', hint: 'Три руны — три жара. Держите пламя в полосе, пока руна не засветится. Сорвётся — руна подождёт.' });
    if (r !== 'done') return;
    episode.take(RITUAL_NEEDS);
    services.abilities.unlock('fire', 2);
    this.ep.fireLevel = 2;
    episode.advance('ritual');
    this.scene.burst(this.x, this.baseY - 40, COLORS.fire, 40);
    this.scene.cameras.main.flash(400, 255, 170, 90);
    services.audio.play('unlock_magic');
    this.scene.showScene({
      title: 'Огонь II: Направленное пламя', color: COLORS.fire,
      text: 'Пламя больше не просто вспыхивает — оно идёт туда, куда ведёт ваш палец.\n\n'
        + 'Удерживайте палец и ведите поток: так растапливают толстый лёд. И в бою — пламя бьёт врага на расстоянии и растапливает ледяное дыхание.',
      buttons: [{ label: 'Испытать на стене', primary: true }],
    });
  }
}

// ------------------------------------------------------------------ ледяная стена: желание, препятствие, первое испытание новой силы
export class EpWall extends EpisodeObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.ability = null;
    this.melted = atLeast(this.ep, 'fight');
    // тёплый свет «подо льдом»
    this.inner = scene.add.image(cfg.x, cfg.y - this.sprite.displayHeight * 0.45, 'fx_glow').setTint(0xff9a4a).setBlendMode('ADD').setDepth(DEPTH.mainBase + cfg.y + 1).setAlpha(0.5).setScale(2.2);
    scene.tweens.add({ targets: this.inner, alpha: { from: 0.28, to: 0.62 }, scale: { from: 2, to: 2.5 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.frost = scene.add.particles(cfg.x, cfg.y - 60, 'fx_dot', {
      x: { min: -140, max: 140 }, y: { min: -60, max: 40 }, speedY: { min: 6, max: 22 }, scale: { start: 0.4, end: 0 }, alpha: { start: 0.7, end: 0 },
      lifespan: 1800, frequency: 140, tint: 0xd8f4ff,
    }).setDepth(DEPTH.fx);
    this.glows = [this.inner];
    if (this.melted) this.meltNow(false);
  }
  get markerIcon() { return atLeast(this.ep, 'melt') ? 'icon_fire' : 'icon_hand'; }
  get markerColor() { return atLeast(this.ep, 'melt') ? COLORS.fire : 0x9fe9ff; }
  get label() { return this.ep.step === 'melt' ? 'Растопить' : 'Осмотреть'; }
  isDone() { return this.melted; }

  /** Слабые места стены (для направленного пламени). */
  spots() {
    const { x, y } = this.cfg, h = this.sprite.displayHeight, w = this.sprite.displayWidth;
    return [{ x: x - w * 0.3, y: y - h * 0.35, r: 26 }, { x: x + w * 0.04, y: y - h * 0.62, r: 26 }, { x: x + w * 0.32, y: y - h * 0.3, r: 26 }];
  }

  async interact(abilityId) {
    const step = this.ep.step;
    if (step === 'melt') {
      if (!this.magic('fire', 'stream', false)) return;
      const r = await this.scene.runMagic('stream', { obj: this, spots: this.spots(), title: 'Направленное пламя', hint: 'Держите палец и ведите поток по светящимся трещинам. Лёд сдаётся с самых слабых мест.' });
      if (r === 'done') this.melt();
      return;
    }
    if (abilityId === 'telekinesis' || episode.note('wall_push')) {
      this.scene.player.castAt(this.x, this.baseY, 'telekinesis');
      this.scene.castFx(this.x, this.baseY - 80, COLORS.telekinesis);
      this.scene.tweens.add({ targets: this.sprite, x: this.sprite.x + 3, duration: 50, yoyo: true, repeat: 3 });
      this.say(step === 'wall' ? 'Не шелохнётся. Телекинез соскальзывает, как ладонь по стеклу. А свет внутри… тёплый.' : 'Лёд держит. Тут нужен огонь — направленный.', 4200);
    }
    if (step === 'wall') {
      episode.advance('wall');
      this.scene.time.delayedCall(4400, () => this.say('Мирра знает, чем его взять. Вернусь домой.', 3200));
    } else if (step !== 'wall' && !atLeast(this.ep, 'melt')) this.scene.toast('Лёд не тает. Нужен направленный огонь — ритуал Проводника.', 0x9fe9ff);
  }

  refresh() { super.refresh(); if (this.melted) { this.sprite.setVisible(false); this.inner?.setVisible(false); if (this.blocker?.body) this.blocker.body.enable = false; } }

  melt() {
    this.practice('fire', 12);
    this.meltNow(true);
    episode.advance('melt');
    this.scene.time.delayedCall(1400, () => this.scene.wolfAppears());
  }

  meltNow(animate) {
    this.melted = true;
    if (this.blocker) { this.blocker.destroy(); this.blocker = null; }
    this.frost?.stop();
    const targets = [this.sprite, this.inner].filter(o => o?.active);
    if (animate) {
      services.audio.play('roots_burn');
      const steam = this.scene.add.particles(this.cfg.x, this.cfg.y - 60, 'fx_dot', {
        x: { min: -150, max: 150 }, speedY: { min: -120, max: -40 }, scale: { start: 1.4, end: 3 }, alpha: { start: 0.5, end: 0 },
        lifespan: 1700, frequency: 30, tint: 0xeaf6ff, duration: 1600,
      }).setDepth(DEPTH.fx);
      this.scene.time.delayedCall(3600, () => steam.destroy());
      this.scene.tweens.add({ targets, alpha: 0, scaleY: 0.2, duration: 1400, ease: 'Quad.easeIn', onComplete: () => targets.forEach(o => o.setVisible(false)) });
    } else targets.forEach(o => o.setVisible(false));
    this.scene.interaction.remove?.(this);
  }
}

// ------------------------------------------------------------------ тропа в Морозный лес (после боя)
export class EpTravel extends EpisodeObject {
  get markerIcon() { return 'icon_map'; }
  get markerColor() { return 0x9fe9ff; }
  get label() { return 'В Морозный лес'; }
  isAvailable() { return !this.removed && this.ep.step === 'enter'; }
  interact() { this.scene.enterFrostwood(); }
}

// ------------------------------------------------------------------ святилище: открытие
export class EpCrystal extends EpisodeObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.inner = scene.add.image(cfg.x, cfg.y - 75, 'fx_glow').setTint(0xff8a3d).setBlendMode('ADD').setDepth(DEPTH.mainBase + cfg.y + 1).setScale(1.6).setAlpha(0.55);
    scene.tweens.add({ targets: this.inner, alpha: { from: 0.35, to: 0.75 }, scale: { from: 1.4, to: 1.9 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.glows = [this.inner];
    if (atLeast(this.ep, 'done')) this.freed(false);
  }
  get markerIcon() { return 'icon_fire'; }
  get markerColor() { return COLORS.fire; }
  get label() { return 'Отогреть кристалл'; }
  isDone() { return atLeast(this.ep, 'done'); }
  async interact() {
    const r = await this.scene.runMagic('stream', { obj: this, spots: [{ x: this.cfg.x, y: this.cfg.y - 75, r: 40 }], need: 2.4, title: 'Кристалл святилища', hint: 'Подо льдом бьётся пламя. Ведите поток на кристалл и держите.' });
    if (r !== 'done') return;
    this.freed(true);
    episode.advance('sanctuary');
    this.scene.finale();
  }
  get markerY() { return this.baseY - 190; }
  freed(animate) {
    this.inner?.setTint(0xffc46b);
    if (animate) {
      this.scene.burst(this.x, this.baseY - 75, 0xffc46b, 50);
      this.scene.cameras.main.flash(600, 255, 200, 140);
    }
    this.spirit = this.scene.add.particles(this.x, this.baseY - 110, 'fx_dot', {
      x: { min: -14, max: 14 }, speedY: { min: -110, max: -40 }, speedX: { min: -20, max: 20 }, scale: { start: 1.1, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: 900, frequency: 28, tint: [COLORS.fire, 0xffc46b, 0xffe9b0], blendMode: 'ADD',
    }).setDepth(DEPTH.fx);
  }
}

/** Мана в мире: тратится, пока сила работает (телекинез держит, поток идёт). */
export function spendWorldMana(cost) {
  const s = services.state;
  const left = vitals.mana(s);
  if (left <= 0) return 0;
  vitals.setMana(s, left - cost);
  services.bus.emit(MSG.HUD_REFRESH);
  return vitals.mana(s);
}

export class EpEncounter extends EpWolf {
  get label() { return `${ENCOUNTERS[this.cfg.enemyId].name} · сразиться`; }
  isAvailable() { return !this.removed && atLeast(this.ep, 'herbs') && Date.now() >= (this.saved.readyAt || 0) && !this.scene.scene.isActive('EpisodeCombatScene'); }
  interact() { this.scene.startEpisodeFight(this.cfg.enemyId, this); }
}

export class EpRenewable extends EpisodeObject {
  get markerIcon() { return this.cfg.powerId === 'fire' ? 'icon_fire' : 'icon_telekinesis'; }
  get markerColor() { return this.cfg.powerId === 'fire' ? COLORS.fire : COLORS.telekinesis; }
  get label() { return this.cfg.powerId === 'fire' ? 'Вытопить смолу' : 'Притянуть сбор'; }
  isDone() { return false; }
  isAvailable() { return !this.removed && atLeast(this.ep, 'gather') && Date.now() >= (this.saved.readyAt || 0); }
  interact() {
    const id = this.cfg.powerId, act = id === 'fire' ? 'resin' : 'pull';
    if (!this.magic(id, act)) return;
    this.persist({ readyAt: Date.now() + 12000 });
    episode.give(this.cfg.reward); this.practice(id, 5); episode.save();
    this.scene.player.castAt(this.x, this.baseY, id); this.scene.castFx(this.x, this.baseY - 30, this.markerColor);
    this.scene.toast('Сбор получен. Здесь снова можно собирать через 12 секунд.', this.markerColor);
  }
}

export class EpTrial extends EpisodeObject {
  // Experimental powers never go through the production slot/ability renderer.
  refresh() { super.refresh(); if (this.saved.done) { this.sprite.setTint(0xa5e6bf); if (this.blocker) { this.blocker.destroy(); this.blocker = null; } } }
  get markerIcon() { return 'icon_seal'; }
  get markerColor() { return 0xc5a3ee; }
  get label() { return this.cfg.label; }
  isDone() { return !!this.saved.done; }
  isAvailable() { return super.isAvailable() && atLeast(this.ep, 'melt'); }
  interact() {
    const id = this.cfg.powerId, state = services.state;
    if (!state.isUnlocked(id)) {
      state.unlockAbility(id, 1); episode.save();
      this.scene.showScene({ title: `${powerDefinition(id, { experimental: true }).name} пробуждается`, color: this.markerColor,
        text: `${this.cfg.lesson}\n\nСила появилась в «Магии» и среди боевых приёмов. Нажмите на объект ещё раз, чтобы применить её.` });
      return;
    }
    if (!this.magic(id, this.cfg.actionId)) return;
    this.persist({ done: true }); this.practice(id, 10); episode.give(this.cfg.reward || {});
    if (id === 'curse' || id === 'barrier') state.unlockAbility(id, 2);
    if (id === 'curse') { episode.ep.morven = true; this.scene.toast('Морвен рядом: он откликнется на Порчу в бою.', this.markerColor); }
    this.sprite.setTint(0xa5e6bf); if (this.blocker) { this.blocker.destroy(); this.blocker = null; }
    this.scene.castFx(this.x, this.baseY - 30, this.markerColor); episode.save();
    this.scene.showScene({ title: this.cfg.success, color: this.markerColor,
      text: `${this.cfg.lesson}\n\n${id === 'curse' ? 'Порча II запрещает восстановление здоровья; Морвен усиливает проклятую цель.' : id === 'barrier' ? 'Барьер II отражает часть удара в бою.' : 'Астрал пробивает защиту лесного духа. В тайнике — амулет Сосредоточения.'}` });
  }
}

export const EPISODE_CLASSES = { ep_encounter: EpEncounter, ep_renewable: EpRenewable, ep_trial: EpTrial, ep_heat: EpHeat, ep_drag: EpDrag, ep_gather: EpGather, ep_pull: EpPull, ep_wolf: EpWolf, ep_circle: EpCircle, ep_wall: EpWall, ep_travel: EpTravel, ep_crystal: EpCrystal };
