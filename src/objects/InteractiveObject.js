import { INTERACTION, DEPTH, COLORS } from '../config/game.config.js';
import { DISPLAY_SIZE } from '../config/assets.manifest.js';
import { ITEMS, LUNAR_QUEST, UPGRADES } from '../config/balance.progression.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { EV } from '../config/events.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import * as vitals from '../state/vitals.js';
import { useFailText } from '../ui/windows09.js';

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

export function applyDisplaySize(img, key) {
  const s = DISPLAY_SIZE[key];
  if (s) img.setDisplaySize(s[0], s[1]);
  return img;
}

export function itemName(id) { return ITEMS[id]?.name || id; }

/**
 * Базовый интерактивный объект мира (Layer 4 — Interactive).
 * Каждый объект — отдельный GameObject со своим id и состоянием в GameState.worldObjects.
 * Контракт для InteractionSystem: x, y, radius, ability, label, markerIcon, markerColor,
 * isAvailable(), interact(abilityId), onFocus().
 */
export class InteractiveObject {
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.id = cfg.id;
    this.radius = cfg.radius || INTERACTION.defaultRadius;
    this.ability = null;
    this.busy = false;
    this.removed = false;
    this.saved = { ...(services.state.getObject(this.id) || {}) };
    this.baseY = cfg.y;
    if (cfg.ghost) {
      // невидимая «зона осмотра» (мебель у стены, которая нарисована отдельно): без картинки, но с размером для маркера
      this.sprite = scene.add.image(cfg.x, cfg.y, 'fx_dot').setOrigin(0.5, 1).setDisplaySize(cfg.ghost.w, cfg.ghost.h).setAlpha(0);
    } else {
      this.sprite = scene.add.image(cfg.x, cfg.y - (cfg.elevated || 0), cfg.texture).setOrigin(0.5, 1);
      applyDisplaySize(this.sprite, cfg.texture);
    }
    this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY };
    this.sprite.setDepth(DEPTH.mainBase + cfg.y);
    this.blocker = cfg.collide ? scene.addBlocker(cfg.x, cfg.y, cfg.collide.w, cfg.collide.h) : null;
  }

  get x() { return this.sprite.x; }
  get y() { return this.baseY; }
  get markerIcon() { return 'icon_hand'; }
  get markerColor() { return COLORS.neutral; }
  get label() { return 'Осмотреть'; }
  get title() { return this.cfg.hint || ''; }
  get markerY() { return this.sprite.y - this.sprite.displayHeight - 22; }
  /** Малозаметные объекты показывают значок только вблизи (null — как у всех). */
  get markerDistance() { return this.cfg.markerDist ?? null; }

  get state() { return services.state; }
  get quests() { return services.quests; }
  get abilities() { return services.abilities; }

  requirementsMet() {
    const s = this.state;
    if (this.cfg.requiresEvent && !s.hasEvent(this.cfg.requiresEvent)) return false;
    if (this.cfg.requiresEnemyDefeated && !s.isEnemyDefeated(this.cfg.requiresEnemyDefeated)) return false;
    if (this.cfg.hideEvent && s.hasEvent(this.cfg.hideEvent)) return false;   // v0.22.0: персонаж ушёл по сюжету
    return true;
  }

  /** v0.21.0: waitEvent — объект виден и мешает с самого начала, но поддаётся только после события (ледяная стена до волны холода). */
  waiting() { return !!this.cfg.waitEvent && !this.state.hasEvent(this.cfg.waitEvent); }

  isDone() { return false; }
  isAvailable() { return !this.removed && !this.busy && this.requirementsMet() && !this.isDone(); }

  /** Пересчёт видимости после событий мира. */
  refresh() {
    if (this.removed) return;
    const vis = this.requirementsMet();
    this.sprite.setVisible(vis);
    for (const g of this.glows || []) g.setVisible(vis);
  }

  onFocus() {}
  interact() {}
  /** Покадровая «жизнь» объекта (близость героини и т. п.). Вызывается сценой, пока объект не удалён. */
  update() {}

  /** Лёгкая реакция, когда объект становится целью: короткая «пружинка». */
  focusPop(k = 1.07) {
    if (this.removed || this.busy || !this.sprite.active || this.cfg.ghost) return;
    const b = this.baseScale;
    this.scene.tweens.add({ targets: this.sprite, scaleX: b.x * k, scaleY: b.y * (2 - k), duration: 110, yoyo: true, ease: 'Sine.easeOut',
      onComplete: () => { if (this.sprite.active) this.sprite.setScale(b.x, b.y); } });
  }

  /** Реакция на действие: сжатие-растяжение и кружок света. */
  react(color = 0xffffff, k = 1.14) {
    if (this.removed || !this.sprite.active) return;
    const b = this.baseScale;
    this.scene.tweens.add({ targets: this.sprite, scaleX: b.x * k, scaleY: b.y * (2 - k), duration: 100, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => { if (this.sprite.active) this.sprite.setScale(b.x, b.y); } });
    const r = this.scene.add.image(this.x, this.baseY - 6, 'fx_ring').setTint(color).setBlendMode('ADD').setDepth(DEPTH.path + 3)
      .setDisplaySize(40, 16).setAlpha(0.8);
    this.scene.tweens.add({ targets: r, displayWidth: 150, displayHeight: 60, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
  }

  /** Если игрок нажал не тот дар — подсказка. */
  /** v0.9: цена действия в мане (0 — бесплатно или действие сейчас невозможно). Показывается в кнопке до нажатия. */
  manaCost() { return 0; }

  /**
   * v0.13.0: действие в мире выполняет сервер (операция world): он проверяет условия и дар, списывает ману, выдаёт награду и
   * записывает состояние объекта. Вызывается один раз, после всех проверок на устройстве (дар, вес, занятость) и до анимации успеха.
   * Возвращает ответ сервера при успехе; null — не вышло: игроку уже объяснили причину (нехватка маны, ещё не выросло, нет связи),
   * ничего не потрачено. Пока идёт запрос, объект занят — повторное нажатие игнорируется.
   * Любой способ ввода (кнопка действия, тап, кнопка дара, клавиатура) приходит сюда через interact().
   */
  async serverAct() {
    const cost = this.manaCost();
    if (cost > 0 && !vitals.canAfford(this.state, cost)) { this.scene.onManaShort?.(cost, this); return null; }
    if (services.actions.busy) return null;
    this.busy = true;
    let r;
    try { r = await services.actions.world(this.id); } finally { this.busy = false; }
    if (this.removed) return r.ok ? r : null;
    this.saved = { ...(services.state.getObject(this.id) || {}) };   // состояние объекта после ответа сервера
    if (!r.ok) { this.explainFail(r); return null; }
    if (r.mana > 0) this.scene.onManaSpent?.(r.mana, this);
    return r;
  }

  /** Что выдал сервер (outcome ответа) — тосты опыта и предметов, окно нового уровня. */
  announce(r, title = null) {
    const o = r?.outcome || {};
    services.bus.emit(MSG.REWARD, { title, granted: { heroXP: o.heroXP || 0, schoolXP: {}, items: o.items || {} }, levelUps: o.levelUps || [] });
    services.bus.emit(MSG.HUD_REFRESH);
  }

  /** Почему сервер отказал: игроку — понятный текст, объекту — актуальный вид. */
  explainFail(r) {
    if (r.reason === 'mana') { this.scene.onManaShort?.(r.mana || this.manaCost(), this); return; }
    if (r.reason === 'busy') return;
    if (r.reason === 'combat') { this.scene.toast('Сейчас не до этого — идёт бой.'); return; }
    if (r.reason === 'wait') { this.scene.toast(`Ещё не выросло. Вернитесь через ${r.left > 60 ? `${Math.ceil(r.left / 60)} мин` : `${r.left} с`}.`); this.refresh(); return; }
    if (r.reason === 'done') { this.refresh(); return; }
    const t = useFailText(r, '');
    if (t) this.scene.toast(t, COLORS.danger);
    services.audio.play('locked');
  }

  rejectWrongAbility(abilityId) {
    if (!abilityId || !this.ability || abilityId === this.ability) return false;
    this.scene.toast(`Здесь нужен дар: ${ABILITIES[this.ability].name}`);
    return true;
  }

  persist(patch) {
    Object.assign(this.saved, patch);
    this.state.setObject(this.id, patch);
    this.state.save();
  }

  remove(animate = true) {
    if (this.removed) return;
    this.removed = true;
    if (this.blocker) { this.blocker.destroy(); this.blocker = null; }
    for (const g of this.glows || []) {
      if (animate) this.scene.tweens.add({ targets: g, alpha: 0, duration: 600, onComplete: () => g.destroy() });
      else g.destroy();
    }
    this.glows = [];
    if (animate) this.scene.tweens.add({ targets: this.sprite, alpha: 0, duration: 400, onComplete: () => this.sprite.destroy() });
    else this.sprite.destroy();
  }

  grantReward(reward, title) {
    const result = this.state.applyReward(reward);
    this.state.save();
    services.bus.emit(MSG.REWARD, { title, ...result });
    services.bus.emit(MSG.HUD_REFRESH);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Магическая книга (зона A) — выдаёт Телекинез I.
export class BookObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    if (!this.isDone()) {
      // книга «дышит»: чуть парит и подсвечивается
      scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 5, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      scene.addGlow(cfg.x, cfg.y - 40, COLORS.telekinesis, 0.4, this, 1.1);
    }
  }
  get markerIcon() { return 'icon_telekinesis'; }
  get markerColor() { return COLORS.telekinesis; }
  get label() { return 'Читать'; }
  isDone() { return this.saved.state === 'read'; }

  interact() {
    this.scene.dialog({
      title: 'Старая книга заклинаний',
      color: COLORS.telekinesis,
      text: 'На страницах проступает бирюзовая спираль. Вы постигаете первый дар — Телекинез I.\n\n'
        + 'Лёгкие и средние предметы теперь подчиняются вашей воле. Подойдите к предмету с бирюзовым знаком и нажмите Телекинез (или E / Пробел).',
      buttons: [{
        label: 'Принять дар', primary: true,
        onClick: () => {
          this.react(COLORS.telekinesis, 1.1);
          this.abilities.unlock('telekinesis', 1);
          this.persist({ state: 'read' });
          this.quests.complete(EV.UNLOCK_TELEKINESIS_1);
          this.scene.burst(this.x, this.sprite.y - 40, COLORS.telekinesis, 24);
          this.scene.toast('Получен дар: Телекинез I', COLORS.telekinesis);
        },
      }],
    });
  }
}

// ---------------------------------------------------------------------------
export class ChestObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    if (this.isDone()) {
      this.sprite.setTexture('chest_01_open');
      applyDisplaySize(this.sprite, 'chest_01_open');
      this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY };
    }
  }
  get label() { return 'Открыть'; }
  isDone() { return this.saved.state === 'opened'; }
  /** Неоткрытый сундук изредка поблёскивает — его замечают и вдалеке. */
  update(dt) {
    if (this.removed || this.isDone() || !this.sprite.visible) return;
    this.twinkle = (this.twinkle ?? 1 + Math.random() * 2) - dt;
    if (this.twinkle <= 0) { this.twinkle = 2.2 + Math.random() * 2; this.scene.twinkle?.(this.x + (Math.random() - 0.5) * 36, this.sprite.y - 20 - Math.random() * 20, COLORS.gold); }
  }
  /** v0.13.0: что внутри, решает и выдаёт сервер (операция world); сундук открывается, когда он ответил. */
  async interact() {
    const r = await this.serverAct();
    if (!r || this.removed || !this.sprite.active) return;
    this.sprite.setTexture('chest_01_open');
    applyDisplaySize(this.sprite, 'chest_01_open');
    this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY };
    services.audio.play('chest');
    this.react(COLORS.gold, 1.22);
    this.scene.burst(this.x, this.sprite.y - 20, COLORS.gold, 24);
    this.scene.sparkleShower?.(this.x, this.sprite.y - 30, COLORS.gold);
    this.scene.addFlash?.(this.x, this.sprite.y - 24, COLORS.gold);
    this.announce(r, 'Сундук');
  }
}

// ---------------------------------------------------------------------------
// Предмет на земле. Подбирается автоматически или кнопкой действия.
export class PickupObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.autoRadius = cfg.autoRadius ?? 55;
    if (this.isDone()) this.remove(false);
    else scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (!this.removed && (cfg.item === 'lunar_flame' || cfg.item === 'moonstone')) scene.addGlow(cfg.x, cfg.y - 20, 0x9fe9ff, 0.5, this);
  }
  get label() { return 'Подобрать'; }
  get markerY() { return this.baseY - 70; }
  isDone() { return this.saved.state === 'collected'; }
  /** Автоподбор не долбит сервер каждый кадр, если запрос не удался (нет связи): повтор через несколько секунд. */
  canAuto() { return this.isAvailable() && this.state.now() >= (this.retryAt || 0); }
  refresh() { super.refresh(); if (!this.removed && this.isDone()) this.remove(false); }
  async interact() {
    if (!this.isAvailable()) return;
    const r = await this.serverAct();   // v0.13.0: предмет выдаёт сервер (операция world)
    if (!r) { this.retryAt = this.state.now() + 4000; return; }
    if (this.removed) return;
    services.audio.play('pickup');
    let text = `+${this.cfg.amount || 1} ${itemName(this.cfg.item)}`;
    if (this.cfg.item === 'lunar_flame' && !this.state.hasEvent(EV.LUNAR_QUEST_COMPLETE)) {
      text += ` (${Math.min(LUNAR_QUEST.flamesRequired, this.state.flamesCollected())}/${LUNAR_QUEST.flamesRequired})`;
    }
    this.scene.toast(text, COLORS.gold);
    this.scene.burst(this.x, this.baseY - 20, 0x9fe9ff, 12);
    services.bus.emit(MSG.QUEST_CHANGED);
    services.bus.emit(MSG.HUD_REFRESH);
    this.remove();
  }
}

// ---------------------------------------------------------------------------
// Лунный алтарь (зоны E/F): старт и сдача лунного задания, затем — место изучения даров.
export class AltarObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    scene.addGlow(cfg.x, cfg.y - 70, 0x9fe9ff, 0.45, this, 1.6);
    this.near = 0;
  }
  /** Чем ближе героиня, тем ярче и «живее» свечение алтаря. */
  update(dt, player) {
    if (this.removed || !this.glows?.length) return;
    const d = Math.hypot(player.x - this.x, player.y - this.y);
    const want = d < 320 ? 1 - d / 320 : 0;
    this.near += (want - this.near) * Math.min(1, dt * 4);
    const g = this.glows[0];
    g.setScale(1.6 + this.near * 0.5);
    this.twinkle = (this.twinkle ?? 1) - dt;
    if (this.twinkle <= 0 && d < 520) { this.twinkle = 0.7 + Math.random(); this.scene.twinkle?.(this.x + (Math.random() - 0.5) * 120, this.baseY - 40 - Math.random() * 60, 0x9fe9ff); }
  }
  get markerIcon() { return this.wickReady ? 'icon_wick' : 'icon_shard'; }
  get markerColor() { return 0x9fe9ff; }
  get label() { return this.wickReady ? 'Вставить фитиль' : 'Алтарь'; }
  /** v0.10.0: фитиль сварен и ждёт в сумке, алтарь ещё не горит. */
  get wickReady() { const s = this.state; return s.hasEvent(EV.LUNAR_QUEST_START) && !s.hasEvent(EV.LUNAR_QUEST_COMPLETE) && s.item('lunar_wick') > 0; }

  interact() {
    if (this.busy) return;
    const s = this.state;
    const need = LUNAR_QUEST.flamesRequired;
    if (!s.hasEvent(EV.LUNAR_QUEST_START)) {
      this.scene.dialog({
        title: 'Лунный алтарь', color: 0x9fe9ff,
        text: `Алтарь потускнел. Свет в нём держится на Лунном фитиле — а фитиль выгорел.\n\n`
          + `Нужны ${need} лунных огонька: один висит на высокой ветке, другой спрятан под камнем, третий стережёт маленький зверь. `
          + 'Из огоньков, травы, смолы и рунической пыли в котле Мирры получится новый фитиль.',
        buttons: [{ label: 'Найти огоньки', primary: true, onClick: () => { this.quests.complete(EV.LUNAR_QUEST_START); this.scene.refreshAll(); } }],
      });
      return;
    }
    if (!s.hasEvent(EV.LUNAR_QUEST_COMPLETE)) {
      if (this.wickReady) { this.insertWick(); return; }
      // v0.10.0: сырые огоньки алтарь не принимает — из них варят Лунный фитиль
      const have = s.flamesCollected();
      if (have < need && !s.hasEvent('lunar_wick_crafted')) this.scene.toast(`Лунные огоньки: ${have}/${need}. Из них в котле Мирры варят фитиль.`, 0x9fe9ff);
      else this.scene.toast('Огоньки собраны. Сварите Лунный фитиль у котла Мирры: огоньки, трава, смола и пыль.', 0x9fe9ff);
      return;
    }
    services.bus.emit(MSG.OPEN_UPGRADE, Object.keys(UPGRADES)[0]);
  }

  /** Применить Лунный фитиль: одна операция — фитиль списан, алтарь горит, разовая награда (как раньше за огоньки). */
  async insertWick() {
    if (services.actions.busy) return;
    this.busy = true;
    const tk0 = this.state.data.schoolXP?.telekinesis || 0;
    let r;
    try { r = await services.actions.use('lunar_wick'); } finally { this.busy = false; }
    if (!r.ok) {
      const t = useFailText(r, 'Лунный фитиль');
      if (t) this.scene.toast(t, COLORS.danger);
      return;
    }
    services.audio.play('quest_update');
    this.scene.burst(this.x, this.sprite.y - 60, 0x9fe9ff, 30);
    this.scene.sparkleShower?.(this.x, this.sprite.y - 70, 0x9fe9ff);
    const o = r.outcome || {};
    const shards = o.items?.lunar_shard || 0;
    const tk = Math.max(0, (this.state.data.schoolXP?.telekinesis || 0) - tk0);
    this.scene.dialog({
      title: 'Алтарь пробудился', color: 0x9fe9ff,
      text: 'Фитиль занялся ровным лунным пламенем. Свет наполняет вас.\n\n'
        + `Награда: +${o.heroXP || 0} опыта, +${tk} опыта Телекинеза${shards ? `, +${shards} лунн. осколков` : ''}.\n\n`
        + 'Теперь у алтаря можно начать изучение Телекинеза II. Но лес всё ещё тревожится — Селена что-то чувствует.',
      buttons: [{ label: 'К изучению', primary: true, onClick: () => services.bus.emit(MSG.OPEN_UPGRADE, 'telekinesis_2') }, { label: 'Позже' }],
    });
  }
}

// ---------------------------------------------------------------------------
// Древний круг Огня (зона H) — выдаёт Огонь I.
export class FireCircleObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.sprite.setDepth(DEPTH.path + 1);
    scene.addGlow(cfg.x, cfg.y - 60, COLORS.fire, 0.4, this, 1.8);
  }
  get markerIcon() { return 'icon_fire'; }
  get markerColor() { return COLORS.fire; }
  get label() { return 'Круг Огня'; }
  get markerY() { return this.baseY - 120; }
  isDone() { return this.state.hasEvent(EV.UNLOCK_FIRE_1); }
  interact() {
    this.scene.dialog({
      title: 'Древний круг Огня', color: COLORS.fire,
      text: 'Камни тёплые, как угли очага. В центре круга просыпается огонь и тянется к вашей ладони.\n\n'
        + 'Получен дар — Огонь I. Он сжигает преграды, зажигает факелы и наносит урон с горением. Попробуйте зажечь факел рядом, а затем вернитесь к чёрным корням у дома.',
      buttons: [{
        label: 'Принять огонь', primary: true,
        onClick: () => {
          this.abilities.unlock('fire', 1);
          this.quests.complete(EV.UNLOCK_FIRE_1);
          this.scene.burst(this.x, this.baseY - 40, COLORS.fire, 30);
          this.scene.toast('Получен дар: Огонь I', COLORS.fire);
        },
      }],
    });
  }
}

// v0.10.0: Древние ворота — GateObject в objects/ChapterObjects.js (вместо SealObject прототипа).

/**
 * v0.20.0: переход между частями мира (лес ↔ дорога в город). Указатель виден всегда; если путь ещё закрыт (requiresEvent),
 * герой слышит lockedText. Перемещение — на стороне клиента (позицию сохраняет обычная синхронизация), наград нет.
 */
export class TravelObject extends InteractiveObject {
  get label() { return this.cfg.hint || 'Идти'; }
  requirementsMet() { return true; }
  isDone() { return false; }
  interact() {
    const need = this.cfg.requiresEvent;
    if (need && !this.state.hasEvent(need)) { this.scene.toast(this.cfg.lockedText || 'Путь пока закрыт.'); return; }
    this.scene.travelTo?.(this.cfg.target, this.cfg.text);
  }
}
