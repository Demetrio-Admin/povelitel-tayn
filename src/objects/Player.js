import Phaser from 'phaser';
import { PLAYER, DEPTH } from '../config/game.config.js';

// Player — геройня в exploration. Pivot — низ по центру, hitbox — у ступней (Hero Spec §13).
// 4 направления: down / up / side (лево = зеркало side).
export class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.shadow = scene.add.image(x, y, 'hero_shadow').setDepth(DEPTH.path + 1).setAlpha(0.8);
    this.sprite = scene.physics.add.sprite(x, y, 'hero_down').setOrigin(0.5, 1);
    const tex = this.sprite.texture.getSourceImage();
    this.baseScale = PLAYER.displayHeight / tex.height;
    this.sprite.setScale(this.baseScale);
    // размеры body задаются в пикселях исходника (до масштаба)
    const bw = PLAYER.hitbox.w / this.baseScale;
    const bh = PLAYER.hitbox.h / this.baseScale;
    this.sprite.body.setSize(bw, bh);
    this.sprite.body.setOffset((tex.width - bw) / 2, tex.height - bh);
    this.sprite.setCollideWorldBounds(true);
    this.shadow.setDisplaySize(PLAYER.hitbox.w * 1.6, PLAYER.hitbox.h * 0.9);

    this.facing = 'down';
    this.walkT = 0;
    this.moveTarget = null;   // tap-to-move { x, y, onArrive, radius }
    this.stuckTime = 0;
    this.casting = 0;
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  setPosition(x, y) {
    this.sprite.setPosition(x, y);
    this.sprite.body.reset(x, y);
    this.moveTarget = null;
  }

  /** Идти к точке. onArrive вызывается, когда до точки меньше radius. */
  walkTo(x, y, onArrive = null, radius = PLAYER.arriveDistance) {
    this.moveTarget = { x, y, onArrive, radius };
    this.stuckTime = 0;
  }

  stop() {
    this.sprite.setVelocity(0, 0);
    this.moveTarget = null;
    this.updateVisual(0, 0, 0);
  }

  /** Каст: короткая поза + поворот к цели. */
  castAt(tx, ty) {
    this.face(tx - this.x, ty - this.y);
    this.casting = 0.35;
    this.scene.tweens.add({ targets: this.sprite, scaleY: this.baseScale * 1.08, duration: 120, yoyo: true });
  }

  face(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) { this.facing = 'side'; this.sprite.setFlipX(dx < 0); }
    else { this.facing = dy < 0 ? 'up' : 'down'; this.sprite.setFlipX(false); }
    this.sprite.setTexture(`hero_${this.facing}`);
  }

  /** input: { x, y } — нормализованный вектор (клавиатура или джойстик). */
  update(dt, input) {
    let vx = 0, vy = 0;
    const mag = Math.hypot(input.x, input.y);
    if (mag > 0.01) {
      this.moveTarget = null; // ручное управление отменяет tap-to-move
      const k = Math.min(1, mag) / mag;
      vx = input.x * k; vy = input.y * k;
    } else if (this.moveTarget) {
      const t = this.moveTarget;
      const dx = t.x - this.x, dy = t.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d <= t.radius) {
        this.moveTarget = null;
        if (t.onArrive) t.onArrive();
      } else {
        vx = dx / d; vy = dy / d;
        // если упёрлись в препятствие — прекращаем идти
        const moved = this.sprite.body.speed;
        this.stuckTime = moved < PLAYER.speed * 0.2 ? this.stuckTime + dt : 0;
        if (this.stuckTime > 0.6) this.moveTarget = null;
      }
    }
    this.sprite.setVelocity(vx * PLAYER.speed, vy * PLAYER.speed);
    this.casting = Math.max(0, this.casting - dt);
    this.updateVisual(vx, vy, dt);
  }

  updateVisual(vx, vy, dt) {
    const moving = Math.hypot(vx, vy) > 0.05;
    if (moving && this.casting <= 0) this.face(vx, vy);
    if (moving) {
      this.walkT += dt * 12;
      this.sprite.setScale(this.baseScale * (1 - Math.abs(Math.sin(this.walkT)) * 0.03), this.baseScale * (1 + Math.abs(Math.sin(this.walkT)) * 0.04));
    } else if (this.casting <= 0) {
      this.walkT = 0;
      this.sprite.setScale(this.baseScale);
    }
    this.sprite.setDepth(DEPTH.mainBase + this.sprite.y);
    this.shadow.setPosition(this.sprite.x, this.sprite.y - 2);
  }
}
