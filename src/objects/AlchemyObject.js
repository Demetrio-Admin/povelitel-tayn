import { COLORS, DEPTH } from '../config/game.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { InteractiveObject } from './InteractiveObject.js';

/** Котёл Мирры (v0.8): окно рецептов открывает UIScene (MSG.OPEN_ALCHEMY), а сам котёл булькает и реагирует на варку. */
export class AlchemyObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    const top = cfg.y - this.sprite.displayHeight * 0.72;
    // тёплое свечение очага под котлом (мерцает) и зеленоватое — от варева
    this.fireGlow = scene.addGlow(cfg.x, cfg.y - 14, 0xff9a4a, 0.5, this, 1.5);
    this.brewGlow = scene.addGlow(cfg.x, top, 0x8fe39a, 0.35, this, 0.9);
    this.bubbles = scene.add.particles(cfg.x, top, 'fx_dot', {
      x: { min: -16, max: 16 }, speedY: { min: -38, max: -16 }, speedX: { min: -6, max: 6 },
      scale: { start: 0.5, end: 0 }, alpha: { start: 0.8, end: 0 }, lifespan: 1100, frequency: 320,
      tint: [0x8fe39a, 0xc9ffb0, 0xb6f5ff], blendMode: 'ADD',
    }).setDepth(DEPTH.fx);
    this.steam = scene.add.particles(cfg.x, top - 8, 'fx_dot', {
      x: { min: -10, max: 10 }, speedY: { min: -26, max: -10 }, speedX: { min: -8, max: 8 },
      scale: { start: 0.9, end: 1.8 }, alpha: { start: 0.14, end: 0 }, lifespan: 1800, frequency: 600, tint: 0xe9f3ee,
    }).setDepth(DEPTH.fx);
    this.flick = 0;
  }
  get markerIcon() { return 'icon_alchemy'; }
  get markerColor() { return 0x8fe39a; }
  get label() { return 'Варить'; }

  /** Пламя под котлом мерцает. */
  update(dt) {
    if (this.removed) return;
    this.flick += dt * 9;
    const f = 0.5 + Math.sin(this.flick) * 0.07 + Math.sin(this.flick * 2.7) * 0.05;
    this.fireGlow.setAlpha(f);
  }

  interact() {
    this.react(0x8fe39a, 1.06);
    services.audio.play('modal_open');
    services.bus.emit(MSG.OPEN_ALCHEMY);
  }

  /** Сварили зелье: булькание, вспышка цвета зелья, подпрыгивание котла. */
  celebrate(color = 0x8fe39a) {
    const sc = this.scene;
    this.react(color, 1.16);
    sc.burst(this.x, this.baseY - this.sprite.displayHeight * 0.75, color, 26);
    sc.sparkleShower?.(this.x, this.baseY - this.sprite.displayHeight * 0.8, color);
    sc.addFlash?.(this.x, this.baseY - this.sprite.displayHeight * 0.7, color);
    this.brewGlow.setTint(color);
    sc.tweens.add({ targets: this.brewGlow, alpha: 1, scale: 1.6, duration: 260, yoyo: true });
  }

  relocate(dx, dy) {
    this.bubbles.setPosition(this.bubbles.x + dx, this.bubbles.y + dy);
    this.steam.setPosition(this.steam.x + dx, this.steam.y + dy);
  }

  remove(animate) {
    this.bubbles?.destroy(); this.steam?.destroy();
    super.remove(animate);
  }
}
