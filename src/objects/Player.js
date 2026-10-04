import Phaser from 'phaser';
import { PLAYER, DEPTH } from '../config/game.config.js';
import { HeroAnimator } from '../systems/HeroAnimator.js';
import { currentHero } from '../state/hero.js';

// Player — герой (ведьма или колдун) в exploration. Pivot — низ по центру, hitbox — у ступней (Hero Spec §13).
// 4 направления: down / up / side (лево = зеркало side). v0.9.2: текстуры — из определения выбранного героя
// (config/heroes.js); размер на экране, hitbox, тень и скорость общие (PLAYER), поэтому силуэт рисунка на игру не влияет.
// Движение: разгон/остановка, достижение точек маршрута, застревание (v0.10.3)
const ACCEL = 14, DECEL = 18;     // 1/с: чем больше, тем резче
const WAYPOINT_REACH = 10;        // px: точка маршрута «пройдена»
const STUCK_STOP = 0.5;           // с: столько стоим без движения у стены — отменяем путь

export class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.tex = currentHero().textures;
    this.shadow = scene.add.image(x, y, 'hero_shadow').setDepth(DEPTH.path + 1).setAlpha(0.8);
    // sprite — физическое тело (невидимое), view — то, что рисуется и анимируется:
    // смещения анимации не должны попадать в физику.
    this.sprite = scene.physics.add.sprite(x, y, this.tex.down).setOrigin(0.5, 1).setVisible(false);
    this.view = scene.add.image(x, y, this.tex.down).setOrigin(0.5, 1);
    const tex = this.sprite.texture.getSourceImage();
    this.baseScale = PLAYER.displayHeight / tex.height;
    this.sprite.setScale(this.baseScale);
    this.view.setScale(this.baseScale);
    this.anim = new HeroAnimator();
    // размеры body задаются в пикселях исходника (до масштаба)
    const bw = PLAYER.hitbox.w / this.baseScale;
    const bh = PLAYER.hitbox.h / this.baseScale;
    this.sprite.body.setSize(bw, bh);
    this.sprite.body.setOffset((tex.width - bw) / 2, tex.height - bh);
    this.sprite.setCollideWorldBounds(true);
    this.shadow.setDisplaySize(PLAYER.hitbox.w * 1.6, PLAYER.hitbox.h * 0.9);
    this.shadowBase = { x: this.shadow.scaleX, y: this.shadow.scaleY };

    this.facing = 'down';
    this.walkT = 0;
    this.moveTarget = null;   // tap-to-move { x, y, onArrive, onFail, radius, path: [{x, y}], idx }
    this.stuckTime = 0;
    this.casting = 0;
    this.vel = { x: 0, y: 0 };   // v0.10.3: скорость плавно набирается и гасится, а не прыгает
    this.actual = 0;             // фактическая скорость (доля от PLAYER.speed): упёрлись в стену — шаги не идут
    this.prev = { x, y };
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  setPosition(x, y) {
    this.sprite.setPosition(x, y);
    this.sprite.body.reset(x, y);
    this.moveTarget = null;
  }

  /**
   * Идти к точке (x, y). path — точки маршрута в обход препятствий (world/nav.js); без него — по прямой.
   * onArrive вызывается, когда до цели меньше radius; onFail — путь кончился, а до цели не дошли (закрыто стеной).
   */
  walkTo(x, y, onArrive = null, radius = PLAYER.arriveDistance, { path = null, onFail = null } = {}) {
    this.moveTarget = { x, y, onArrive, onFail, radius, path: path && path.length ? path : [{ x, y }], idx: 0 };
    this.stuckTime = 0;
  }

  stop() {
    this.sprite.setVelocity(0, 0);
    this.vel.x = this.vel.y = 0;
    this.moveTarget = null;
    this.updateVisual(0, 0, Math.min(this.scene.game.loop.delta, 50) / 1000);
  }

  /** Каст: поворот к цели + поза по виду магии ('telekinesis' | 'fire' | 'seal'). */
  castAt(tx, ty, kind = 'telekinesis') {
    this.face(tx - this.x, ty - this.y);
    this.casting = this.anim.castDuration(kind);
    this.anim.playCast(kind);
  }

  face(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) { this.facing = 'side'; this.sprite.setFlipX(dx < 0); }
    else { this.facing = dy < 0 ? 'up' : 'down'; this.sprite.setFlipX(false); }
    this.view.setTexture(this.tex[this.facing]).setFlipX(this.sprite.flipX);
  }

  get dir() { return this.facing === 'side' ? (this.sprite.flipX ? -1 : 1) : 0; }

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
      const gd = Math.hypot(t.x - this.x, t.y - this.y);
      if (t.onArrive && gd <= t.radius) {
        this.moveTarget = null;
        t.onArrive();
      } else {
        // промежуточные точки маршрута проходим, не останавливаясь
        while (t.idx < t.path.length - 1 && Math.hypot(t.path[t.idx].x - this.x, t.path[t.idx].y - this.y) <= WAYPOINT_REACH) t.idx++;
        const wp = t.path[t.idx], last = t.idx === t.path.length - 1;
        const dx = wp.x - this.x, dy = wp.y - this.y, d = Math.hypot(dx, dy);
        if (last && d <= (t.onArrive ? WAYPOINT_REACH : t.radius)) {
          // дошли до конца маршрута; до цели далеко (она за стеной) — не тычемся, а останавливаемся
          this.moveTarget = null;
          if (t.onArrive) t.onFail?.();
        } else {
          vx = dx / d; vy = dy / d;
          // упёрлись в препятствие и не двигаемся — прекращаем идти
          this.stuckTime = this.actual < 0.2 ? this.stuckTime + dt : 0;
          if (this.stuckTime > STUCK_STOP) { this.moveTarget = null; t.onFail?.(); vx = vy = 0; }
        }
      }
    }
    // плавный разгон и остановка (около 0,08 с): движение не дёргается от каждого касания
    const tx = vx * PLAYER.speed, ty = vy * PLAYER.speed;
    const rate = Math.min(1, dt * ((tx || ty) ? ACCEL : DECEL));
    this.vel.x += (tx - this.vel.x) * rate;
    this.vel.y += (ty - this.vel.y) * rate;
    if (!tx && !ty && Math.hypot(this.vel.x, this.vel.y) < 8) this.vel.x = this.vel.y = 0;
    this.sprite.setVelocity(this.vel.x, this.vel.y);
    // фактическая скорость по смещению: стена гасит шаги и анимацию ходьбы
    const moved = dt > 0 ? Math.hypot(this.x - this.prev.x, this.y - this.prev.y) / dt / PLAYER.speed : 0;
    this.prev.x = this.x; this.prev.y = this.y;
    this.actual += (Math.min(1.2, moved) - this.actual) * Math.min(1, dt * 14);
    this.casting = Math.max(0, this.casting - dt);
    const cmd = Math.hypot(this.vel.x, this.vel.y) / PLAYER.speed;
    const vis = Math.min(cmd, this.actual * 1.15);
    const k = cmd > 0.001 ? vis / cmd : 0;
    this.updateVisual(this.vel.x / PLAYER.speed * k, this.vel.y / PLAYER.speed * k, dt, { x: vx, y: vy });
  }

  /** (vx, vy) — доля скорости для анимации ходьбы; intent — куда игрок хочет идти (поворот к стене, пока она держит). */
  updateVisual(vx, vy, dt, intent = null) {
    const speed = Math.hypot(vx, vy);
    const want = intent && Math.hypot(intent.x, intent.y) > 0.05 ? intent : (speed > 0.05 ? { x: vx, y: vy } : null);
    if (want && this.casting <= 0) this.face(want.x, want.y);
    const pose = this.anim.update(dt, { speed: Math.min(1, speed), dir: this.dir, face: this.facing });
    const H = PLAYER.displayHeight, v = this.view;
    v.setPosition(this.sprite.x + pose.dx * H, this.sprite.y + pose.dy * H);
    v.setScale(this.baseScale * pose.sx, this.baseScale * pose.sy).setAngle(pose.rot).setAlpha(pose.alpha);
    if (pose.flash) v.setTintFill(0xffffff); else v.clearTint();
    v.setDepth(DEPTH.mainBase + this.sprite.y);
    this.shadow.setPosition(this.sprite.x, this.sprite.y - 2);
    this.shadow.setScale(this.shadowBase.x * pose.shadowScale, this.shadowBase.y * pose.shadowScale).setAlpha(0.8 * pose.shadowAlpha);
  }
}
