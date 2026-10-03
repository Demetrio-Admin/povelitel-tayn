import { INTERACTION, DEPTH, COLORS } from '../config/game.config.js';
import { DISPLAY_SIZE } from '../config/assets.manifest.js';
import { ITEMS, LUNAR_QUEST, UPGRADES } from '../config/balance.progression.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { EV } from '../config/events.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import * as vitals from '../state/vitals.js';

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
    return true;
  }

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
   * v0.9: оплата маной — ровно один раз, после всех проверок (дар, вес, занятость) и до анимации успеха.
   * false — маны не хватает: ничего не списано, сцена объясняет, как восстановить.
   * Любой способ ввода (кнопка действия, тап, кнопка дара, клавиатура) приходит сюда через interact().
   */
  payMana(cost = this.manaCost()) {
    if (!(cost > 0)) return true;
    if (!vitals.spendMana(this.state, cost)) { this.scene.onManaShort?.(cost, this); return false; }
    this.scene.onManaSpent?.(cost, this);
    return true;
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
  interact() {
    this.sprite.setTexture('chest_01_open');
    applyDisplaySize(this.sprite, 'chest_01_open');
    this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY };
    this.persist({ state: 'opened' });
    services.audio.play('chest');
    this.react(COLORS.gold, 1.22);
    this.scene.burst(this.x, this.sprite.y - 20, COLORS.gold, 24);
    this.scene.sparkleShower?.(this.x, this.sprite.y - 30, COLORS.gold);
    this.scene.addFlash?.(this.x, this.sprite.y - 24, COLORS.gold);
    this.grantReward(this.cfg.reward, 'Сундук');
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
  interact() {
    if (!this.isAvailable()) return;
    this.persist({ state: 'collected' });
    services.audio.play('pickup');
    this.state.addItem(this.cfg.item, this.cfg.amount || 1);
    this.state.save();
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
  get markerIcon() { return 'icon_shard'; }
  get markerColor() { return 0x9fe9ff; }
  get label() { return 'Алтарь'; }

  interact() {
    const s = this.state;
    const need = LUNAR_QUEST.flamesRequired;
    if (!s.hasEvent(EV.LUNAR_QUEST_START)) {
      this.scene.dialog({
        title: 'Лунный алтарь', color: 0x9fe9ff,
        text: `Алтарь потускнел. В чашах не хватает ${need} лунных огоньков.\n\nОдин висит на высокой ветке, другой спрятан под камнем, третий стережёт маленький зверь. Верните свет — и алтарь усилит ваш дар.`,
        buttons: [{ label: 'Найти огоньки', primary: true, onClick: () => { this.quests.complete(EV.LUNAR_QUEST_START); this.scene.refreshAll(); } }],
      });
      return;
    }
    if (!s.hasEvent(EV.LUNAR_QUEST_COMPLETE)) {
      const have = s.flamesCollected();
      if (have < need) { this.scene.toast(`Лунные огоньки: ${have}/${need}`, 0x9fe9ff); return; }
      s.removeItem('lunar_flame', need);
      this.scene.burst(this.x, this.sprite.y - 60, 0x9fe9ff, 30);
      const res = this.quests.complete(EV.LUNAR_QUEST_COMPLETE);
      const g = res?.granted;
      this.scene.dialog({
        title: 'Алтарь пробудился', color: 0x9fe9ff,
        text: 'Огоньки заняли свои места. Лунный свет наполняет вас.\n\n'
          + (g ? `Награда: +${g.heroXP} опыта, +${g.schoolXP.telekinesis || 0} опыта Телекинеза, +${g.items.lunar_shard || 0} лунн. осколков.\n\n` : '')
          + 'Теперь у алтаря можно начать изучение Телекинеза II.',
        buttons: [{ label: 'К изучению', primary: true, onClick: () => services.bus.emit(MSG.OPEN_UPGRADE, 'telekinesis_2') }, { label: 'Позже' }],
      });
      return;
    }
    services.bus.emit(MSG.OPEN_UPGRADE, Object.keys(UPGRADES)[0]);
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

// ---------------------------------------------------------------------------
// SealObject — Древние ворота (зона L). Печать в прототипе не реализована → SEAL_REQUIRED.
export class SealObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.ability = 'seal';
    scene.addGlow(cfg.x, cfg.y - 120, COLORS.seal, 0.5, this, 2.4);
  }
  // ворота видны всегда (v0.3: реальный спрайт); до победы над Стражем они просто «молчат»
  refresh() { if (this.removed) return; this.sprite.setVisible(true); for (const g of this.glows || []) g.setVisible(true); }
  get markerIcon() { return 'icon_seal'; }
  get markerColor() { return COLORS.seal; }
  get label() { return 'Печать'; }
  isAvailable() { return !this.removed; }
  onFocus() { if (!this.state.hasEvent(this.cfg.completeEvent)) this.interact(); }
  interact() {
    // ворота открываются для финала только после победы над Лесным Стражем (маршрут прототипа)
    if (this.cfg.requiresEvent && !this.state.hasEvent(this.cfg.requiresEvent)) {
      this.scene.toast('Древние ворота молчат. Путь к ним стережёт Лесной Страж.', COLORS.seal);
      return;
    }
    if (this.abilities.isUnlocked('seal')) { this.scene.toast('Печать настраивается… (следующий этап)'); return; }
    this.scene.burst(this.x, this.baseY - 140, COLORS.seal, 24);
    this.quests.complete(this.cfg.lockedEvent);
    this.quests.complete(this.cfg.completeEvent);
    services.bus.emit(MSG.FINAL_SCREEN);
  }
}
