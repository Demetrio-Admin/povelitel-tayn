import { UI } from '../config/ui.config.js';
import { ENEMIES } from '../config/balance.enemies.js';
import { COLORS, DEPTH } from '../config/game.config.js';
import { services } from '../services.js';
import { applyDisplaySize } from './InteractiveObject.js';

/**
 * EnemyTrigger — враг на карте exploration. При входе героини в radius сцена запускает CombatScene.
 * Боевая модель — objects/Enemy.js (создаётся CombatManager).
 */
export class EnemyTrigger {
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.id = cfg.id;
    this.def = ENEMIES[cfg.enemy];
    this.grace = 0;
    this.defeated = services.state.isEnemyDefeated(cfg.id);

    this.ring = scene.add.ellipse(cfg.x, cfg.y, cfg.radius * 2, cfg.radius * 1.1)
      .setStrokeStyle(2, COLORS.danger, 0.35).setFillStyle(COLORS.danger, 0.05).setDepth(DEPTH.path + 1);
    this.sprite = scene.add.image(cfg.x, cfg.y, this.def.texture).setOrigin(0.5, 1);
    applyDisplaySize(this.sprite, this.def.texture);
    if (cfg.scale) this.sprite.setScale(this.sprite.scaleX * cfg.scale, this.sprite.scaleY * cfg.scale);
    this.sprite.setDepth(DEPTH.mainBase + cfg.y);
    this.label = scene.add.text(cfg.x, cfg.y - this.sprite.displayHeight - 14, this.def.name, {
      fontFamily: UI.font, fontSize: UI.type.small, color: '#ff8a7a', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(DEPTH.markers);
    this.baseScaleY = this.sprite.scaleY;
    this.idle = scene.tweens.add({ targets: this.sprite, scaleY: this.baseScaleY * 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.blocker = cfg.collide ? scene.addBlocker(cfg.x, cfg.y, cfg.collide.w, cfg.collide.h) : null;

    if (this.defeated) this.clear(false);
    else this.refresh();
  }

  requirementsMet() {
    return !this.cfg.requiresEvent || services.state.hasEvent(this.cfg.requiresEvent);
  }

  isActive() { return !this.defeated && this.requirementsMet(); }

  refresh() {
    if (this.defeated) return;
    const vis = this.requirementsMet();
    [this.sprite, this.label, this.ring].forEach(o => o.setVisible(vis));
  }

  update(dt, player) {
    if (!this.isActive()) return false;
    this.grace = Math.max(0, this.grace - dt);
    if (this.grace > 0) return false;
    const dx = (player.x - this.cfg.x) / this.cfg.radius;
    const dy = (player.y - this.cfg.y) / (this.cfg.radius * 0.55);
    return dx * dx + dy * dy <= 1;
  }

  /** Враг побеждён — убираем с карты. */
  clear(animate = true) {
    this.defeated = true;
    this.idle?.stop();
    if (this.blocker) { this.blocker.destroy(); this.blocker = null; }
    const objs = [this.sprite, this.label, this.ring];
    if (animate) this.scene.tweens.add({ targets: objs, alpha: 0, duration: 700, onComplete: () => objs.forEach(o => o.destroy()) });
    else objs.forEach(o => o.destroy());
  }
}
