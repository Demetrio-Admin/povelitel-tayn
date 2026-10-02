// Анимация героини: чистая логика без Phaser (покрыта тестами).
// update() возвращает позу, которую адаптер (Player / CombatScene) применяет к спрайту.
import { HERO_ANIM } from '../config/hero.anim.js';

const smooth = t => t * t * (3 - 2 * t);

/** Значение по ключам [[t, v], …] с плавными переходами. */
export function sampleKeys(keys, p) {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return v0 + (v1 - v0) * smooth((p - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class HeroAnimator {
  constructor(cfg = HERO_ANIM) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.t = 0; this.phase = 0; this.move = 0;
    this.castState = null; this.hurtState = null; this.deathState = null;
  }

  /** Длительность каста — нужна Player, чтобы не менять направление в позе. */
  castDuration(kind) { return this.cfg.cast[this.cfg.castAlias[kind] || kind]?.dur ?? 0; }

  playCast(kind = 'telekinesis') {
    const key = this.cfg.cast[kind] ? kind : (this.cfg.castAlias[kind] || 'telekinesis');
    this.castState = { key, t: 0, dur: this.cfg.cast[key].dur };
  }

  playHurt(strong = false) {
    const h = this.cfg.hurt;
    this.hurtState = { t: 0, dur: strong ? h.strongDur : h.dur, amp: strong ? h.strongMul : 1 };
  }

  playDeath() { if (!this.deathState) this.deathState = { t: 0 }; }

  get isCasting() { return !!this.castState; }
  get isDead() { return !!this.deathState; }

  /**
   * @param dt секунды
   * @param opts speed 0…1, dir −1/0/+1 (вбок: влево/вправо; 0 — вверх/вниз), face 'up'|'down'|'side'
   */
  update(dt, { speed = 0, dir = 0, face = 'down' } = {}) {
    const c = this.cfg;
    dt = Math.max(0, dt);
    this.t += dt;

    // --- локомоция: idle ↔ walk
    const moving = speed > 0.05;
    this.move += ((moving ? 1 : 0) - this.move) * Math.min(1, dt * c.walk.blendRate);
    if (moving) this.phase += dt * c.walk.rate * Math.max(0.5, Math.min(1, speed));
    const b = Math.sin(this.t * c.idle.rate);
    const s = Math.abs(Math.sin(this.phase));
    const land = Math.pow(1 - s, 6);
    const m = this.move;
    let sy = lerp(1 + c.idle.sy * b, 1 + c.walk.stretch * s - c.walk.squash * land, m);
    let sx = lerp(1 - c.idle.sx * b, 1 - c.walk.thin * s + c.walk.squashW * land, m);
    let dy = -c.walk.hop * s * m;
    let dx = 0;
    let rot = (Math.sin(this.phase) * c.walk.sway + c.walk.lean * dir) * m;
    let alpha = 1;
    let flash = null;

    // --- каст
    if (this.castState) {
      const k = this.castState;
      k.t += dt;
      const def = c.cast[k.key];
      const p = clamp(k.t / k.dur, 0, 1);
      const fwd = sampleKeys(def.dx, p);
      if (dir !== 0) { dx += fwd * dir; rot += sampleKeys(def.rot, p) * dir; }
      else dy += fwd * c.forwardVertical * (face === 'down' ? 1 : -1);
      dy += sampleKeys(def.dy, p);
      sx *= sampleKeys(def.sx, p);
      sy *= sampleKeys(def.sy, p);
      if (k.t >= k.dur) this.castState = null;
    }

    // --- удар по героине
    if (this.hurtState) {
      const h = this.hurtState, hc = c.hurt;
      h.t += dt;
      const p = clamp(h.t / h.dur, 0, 1);
      const fade = Math.pow(1 - p, 1.5);
      dx += Math.sin(p * hc.shakeFreq) * fade * hc.shake * h.amp;
      rot += Math.sin(p * hc.rotFreq) * (1 - p) * hc.rotShake * h.amp;
      dy += sampleKeys(hc.dy, p) * h.amp;
      sx *= sampleKeys(hc.sx, p);
      sy *= sampleKeys(hc.sy, p);
      if (p < hc.flashEnd) flash = 'hurt';
      if (h.t >= h.dur) this.hurtState = null;
    }

    // --- поражение: падает и остаётся лежать
    if (this.deathState) {
      const d = this.deathState, dc = c.death;
      d.t += dt;
      const p = smooth(clamp(d.t / dc.dur, 0, 1));
      rot += dc.angle * p;
      alpha = lerp(1, dc.alpha, p);
    }

    const shadowScale = clamp(1 + dy * c.shadow.hop, c.shadow.min, c.shadow.max);
    return { dx, dy, sx, sy, rot, alpha, flash, shadowScale, shadowAlpha: alpha };
  }
}
