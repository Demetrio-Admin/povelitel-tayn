import { DEPTH } from '../config/game.config.js';
import { RESOURCES } from '../config/resources.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { WORLD_MANA_COST } from '../config/balance.abilities.js';
import * as vitals from '../state/vitals.js';
import { InteractiveObject, itemName } from './InteractiveObject.js';

/**
 * GatherObject (v0.8) — ресурс, который можно просто собрать руками: лунная трава, грибы, смола, пыль, осколки.
 * После сбора «вырастает заново» через respawnSec (состояние: worldObjects[id] = { state: 'picked', t: время сбора }).
 * Из-за возобновления игрок не может застрять без ресурса, нужного для прогрессии.
 */
export class GatherObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.res = RESOURCES[cfg.res];
    if (!this.res) throw new Error(`GatherObject ${cfg.id}: неизвестный ресурс ${cfg.res}`);
    this.respawnMs = (cfg.respawnSec ?? 180) * 1000;
    this.amount = cfg.amount || 1;
    this.glow = scene.addGlow(cfg.x, cfg.y - this.sprite.displayHeight * 0.45, this.res.color, 0.32, this, 0.8);
    // лёгкое покачивание: растения «дышат» (у камней и кристаллов покачивание мельче)
    const sway = cfg.res === 'moon_herb' || cfg.res === 'forest_mushroom' ? 2.2 : 0.8;
    scene.tweens.add({ targets: this.sprite, angle: { from: -sway, to: sway }, duration: 1500 + Math.random() * 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.sprite.setOrigin(0.5, 1);
    this.applyVisual();
  }

  get markerIcon() { return 'icon_gather'; }
  get markerColor() { return this.res.color; }
  get label() { return 'Собрать'; }
  // v0.9: магическое извлечение сохраняет силу ингредиента — стоит маны
  manaCost() { return WORLD_MANA_COST.gather; }
  get title() { return this.res.name; }
  get markerDistance() { return 360; }

  picked() {
    const s = this.saved;
    return s.state === 'picked' && this.state.now() - (s.t || 0) < this.respawnMs;
  }
  isDone() { return this.picked(); }

  applyVisual() {
    if (this.removed) return;
    const gone = this.picked();
    this.sprite.setVisible(this.requirementsMet() && !gone);
    for (const g of this.glows || []) g.setVisible(this.requirementsMet() && !gone);
    this.grown = !gone;
  }
  refresh() { super.refresh(); this.applyVisual(); }

  /** Покадрово: следим за таймером возрождения. */
  update() {
    if (this.removed || this.grown || this.busy) return;
    if (!this.picked()) this.regrow();
  }

  regrow() {
    this.grown = true;
    if (!this.requirementsMet()) return;
    const b = this.baseScale;
    this.sprite.setVisible(true).setScale(b.x * 0.2, b.y * 0.2).setAlpha(1);
    this.scene.tweens.add({ targets: this.sprite, scaleX: b.x, scaleY: b.y, duration: 500, ease: 'Back.easeOut' });
    for (const g of this.glows || []) g.setVisible(true);
    this.scene.twinkle?.(this.x, this.baseY - 20, this.res.color);
  }

  interact(abilityId) {
    if (!this.isAvailable()) return;
    if (this.rejectWrongAbility(abilityId)) return;
    if (!this.payMana()) return;
    this.paid = this.manaCost();
    this.busy = true;
    const sc = this.scene;
    sc.player.castAt(this.x, this.baseY, 'gather');   // героиня наклоняется к ресурсу
    services.audio.play('gather');
    // листья/пыль летят из точки сбора, ресурс чуть вздрагивает
    sc.burst(this.x, this.baseY - 14, this.res.color, 8);
    const b = this.baseScale;
    sc.tweens.add({ targets: this.sprite, scaleX: b.x * 1.12, scaleY: b.y * 0.88, duration: 140, yoyo: true, repeat: 1 });
    sc.time.delayedCall(540, () => this.collect());
  }

  collect() {
    if (this.removed) { if (this.paid) vitals.restoreMana(this.state, this.paid); this.paid = 0; return; }   // сбор отменён — мана возвращается
    this.paid = 0;
    const sc = this.scene;
    this.state.addItem(this.cfg.res, this.amount);
    this.persist({ state: 'picked', t: this.state.now() });
    this.busy = false;
    this.grown = false;
    services.audio.play('gather_done');
    // эффект: искры цвета ресурса, иконка взлетает к сумке, ресурс исчезает
    sc.burst(this.x, this.baseY - 24, this.res.color, 16);
    sc.sparkleShower?.(this.x, this.baseY - 30, this.res.color);
    sc.floatIcon?.(this.x, this.baseY - this.sprite.displayHeight, this.res.icon, `+${this.amount} ${itemName(this.cfg.res)}`, this.res.color);
    sc.tweens.add({ targets: this.sprite, alpha: 0, scaleX: this.baseScale.x * 0.3, scaleY: this.baseScale.y * 0.3, duration: 260,
      onComplete: () => { if (this.sprite.active && this.picked()) { this.sprite.setVisible(false).setAlpha(1); } } });
    for (const g of this.glows || []) g.setVisible(false);
    if (this.cfg.gatherText) sc.heroSay?.(this.cfg.gatherText);
    services.bus.emit(MSG.GATHERED, { item: this.cfg.res, amount: this.amount, id: this.id });
    services.bus.emit(MSG.HUD_REFRESH);
    services.bus.emit(MSG.QUEST_CHANGED);
  }
}
