// «Живой мир» (v0.28.0): дешёвые анимации леса Мирры — рябь на воде, покачивание крон, птицы, зверёк, падающие листья.
// Ничего не считается каждый кадр: один таймер раз в 0.6 с и пара твинов. Объекты берутся из маленьких пулов,
// качаются только деревья рядом с камерой, а при низком FPS всё лишнее выключается само.
import { DEPTH } from '../config/game.config.js';

export const LIFE = {
  tickMs: 600,
  maxRipples: 8,
  maxSwayers: 14,          // одновременно качающихся деревьев
  swayMargin: 160,         // запас вокруг камеры, чтобы крона не «застывала» у самого края
  birdEveryMs: [14000, 32000], birdFirstMs: 5000,
  animalEveryMs: [30000, 60000], animalFirstMs: 14000,
  lowFps: 30, lowFpsTicks: 5,   // столько тиков подряд с FPS ниже порога — и включается «лёгкий» режим
  leafEveryMs: 1100,
};

/** Качаются деревья, камыш и кусты. Значение — размах угла в градусах. */
export function swayAmplitude(key) {
  if (/^(tree_|birch_|dead_tree)/.test(key)) return 1.4;
  if (/^reeds_/.test(key)) return 3;
  if (/^bush_/.test(key)) return 1.8;
  return 0;
}

/** Ближайшие к центру камеры качающиеся объекты не дальше margin от экрана, не больше limit. */
export function pickSwayers(items, rect, limit, margin = LIFE.swayMargin) {
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const x0 = rect.x - margin, x1 = rect.x + rect.width + margin, y0 = rect.y - margin, y1 = rect.y + rect.height + margin + 120;
  const near = [];
  for (const it of items) if (it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1) near.push(it);
  near.sort((a, b) => (Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)));
  return near.slice(0, limit);
}

/** Случайная точка воды внутри видимой области: берём прямоугольник воды, пересекающий экран. */
export function pickWaterSpot(waterRects, rect, rnd, margin = 20) {
  const x0 = rect.x + margin, x1 = rect.x + rect.width - margin, y0 = rect.y + margin, y1 = rect.y + rect.height - margin;
  const hits = [];
  for (const r of waterRects) {
    const ax = Math.max(r.x, x0), bx = Math.min(r.x + r.w, x1), ay = Math.max(r.y, y0), by = Math.min(r.y + r.h, y1);
    if (bx - ax > 12 && by - ay > 12) hits.push({ ax, bx, ay, by, area: (bx - ax) * (by - ay) });
  }
  if (!hits.length) return null;
  let t = rnd() * hits.reduce((s, h) => s + h.area, 0), h = hits[hits.length - 1];
  for (const c of hits) { t -= c.area; if (t <= 0) { h = c; break; } }
  return { x: h.ax + rnd() * (h.bx - h.ax), y: h.ay + rnd() * (h.by - h.ay) };
}

export class LivingWorld {
  constructor(scene) {
    this.scene = scene;
    this.rnd = scene.random || Math.random;   // детерминированный генератор сцены, если он есть
    this.running = false;
    this.lite = false;
    this.slow = 0;
    this.swaying = new Map();   // propId -> { tween, img }
    this.ripples = [];
    this.leaves = null;
    this.timers = [];
    this.flyers = new Set();
    this.items = null;
  }

  /** Запуск. В редакторе и вне леса Мирры не включается. */
  start(settings) {
    const s = this.scene;
    if (this.running || s.loc?.id !== 'forest') return;
    if (settings && settings.get('anim') === false) return;
    this.running = true;
    this.items = [];
    for (const v of s.propViews.values()) {
      const a = swayAmplitude(v.p.k);
      if (a) this.items.push({ id: v.p.id, x: v.p.x, y: v.p.y, a, img: v.img });
    }
    this.timers.push(s.time.addEvent({ delay: LIFE.tickMs, loop: true, callback: () => this.tick() }));
    this.timers.push(s.time.delayedCall(LIFE.birdFirstMs, () => this.birdLoop()));
    this.timers.push(s.time.delayedCall(LIFE.animalFirstMs, () => this.animalLoop()));
    this.startLeaves();
    this.tick();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    for (const t of this.timers) t.remove(false);
    this.timers = [];
    for (const { tween, img } of this.swaying.values()) { tween.stop(); img.setAngle(0); }
    this.swaying.clear();
    for (const r of this.ripples) { this.scene.tweens.killTweensOf(r); r.destroy(); }
    this.ripples = [];
    for (const f of this.flyers) f.kill();
    this.flyers.clear();
    this.leaves?.destroy(); this.leaves = null;
  }

  destroy() { this.stop(); }

  range([a, b]) { return a + this.rnd() * (b - a); }

  // ------------------------------------------------------------------ тик раз в 0.6 с
  tick() {
    if (!this.running) return;
    const s = this.scene, view = s.cameras.main.worldView;
    // слабое устройство: несколько тиков подряд FPS ниже порога — выключаем птиц, зверька, листья
    const fps = s.game.loop.actualFps;
    this.slow = fps && fps < LIFE.lowFps ? this.slow + 1 : 0;
    if (!this.lite && this.slow >= LIFE.lowFpsTicks) {
      this.lite = true;
      this.leaves?.destroy(); this.leaves = null;
    }
    this.updateSway(view);
    this.spawnRipple(view);
    if (this.leaves) this.leaves.setPosition(view.centerX, view.centerY);
  }

  // ------------------------------------------------------------------ крона качается только рядом с камерой
  updateSway(view) {
    const limit = this.lite ? 5 : LIFE.maxSwayers;
    const want = pickSwayers(this.items, view, limit);
    const keep = new Set(want.map(w => w.id));
    for (const [id, rec] of this.swaying) {
      if (keep.has(id)) continue;
      rec.tween.stop(); rec.img.setAngle(0); this.swaying.delete(id);
    }
    for (const it of want) {
      if (this.swaying.has(it.id)) continue;
      it.img.setAngle(-it.a);
      const tween = this.scene.tweens.add({
        targets: it.img, angle: it.a, duration: 2000 + this.rnd() * 1800, delay: this.rnd() * 900,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.swaying.set(it.id, { tween, img: it.img });
    }
  }

  // ------------------------------------------------------------------ рябь: кольцо расходится и гаснет
  spawnRipple(view) {
    const s = this.scene;
    if (this.rnd() > 0.75) return;
    const spot = pickWaterSpot(s.terrain.waterRects, view, this.rnd);
    if (!spot) return;
    let r = this.ripples.find(i => !i.visible);
    if (!r) {
      if (this.ripples.length >= LIFE.maxRipples) return;
      r = s.add.image(0, 0, 'fx_ring').setDepth(DEPTH.path + 1).setVisible(false);
      this.ripples.push(r);
    }
    const w = 14 + this.rnd() * 10;
    r.setPosition(spot.x, spot.y).setTint(this.rnd() < 0.5 ? 0xd8f1f7 : 0xb9dfe9).setDisplaySize(w, w * 0.42).setAlpha(0.6).setVisible(true);
    const k = 3.4 + this.rnd() * 1.4;
    s.tweens.add({
      targets: r, scaleX: r.scaleX * k, scaleY: r.scaleY * k, alpha: 0, duration: 1700 + this.rnd() * 700, ease: 'Sine.easeOut',
      onComplete: () => r.setVisible(false),
    });
  }

  // ------------------------------------------------------------------ листья
  startLeaves() {
    const s = this.scene;
    if (this.lite || !s.textures.exists('life_leaf')) return;
    this.leaves = s.add.particles(0, 0, 'life_leaf', {
      x: { min: -380, max: 380 }, y: { min: -620, max: 120 },
      speedX: { min: -14, max: 34 }, speedY: { min: 26, max: 48 },
      rotate: { start: 0, end: 340 }, scale: { min: 0.7, max: 1.1 }, alpha: { start: 0.9, end: 0 },
      lifespan: 9000, frequency: LIFE.leafEveryMs, quantity: 1, maxAliveParticles: 12,
      tint: [0xd9822b, 0xb85a1e, 0xe0b040, 0x8a9a3a],
    }).setDepth(DEPTH.fx - 3);
  }

  // ------------------------------------------------------------------ птицы: пролетают через экран
  birdLoop() {
    if (!this.running) return;
    if (!this.lite) this.flyBird();
    this.timers.push(this.scene.time.delayedCall(this.range(LIFE.birdEveryMs), () => this.birdLoop()));
  }

  flyBird() {
    const s = this.scene, v = s.cameras.main.worldView;
    const dir = this.rnd() < 0.5 ? 1 : -1;
    const x0 = dir > 0 ? v.x - 50 : v.right + 50, x1 = dir > 0 ? v.right + 50 : v.x - 50;
    const y = v.y + v.height * (0.08 + this.rnd() * 0.3);
    const n = this.rnd() < 0.4 ? 2 : 1;   // иногда парой
    for (let i = 0; i < n; i++) {
      const img = s.add.image(x0 - dir * i * 46, y + i * 22, 'life_bird_1').setOrigin(0.5).setFlipX(dir < 0).setDepth(DEPTH.fx - 5);
      const f = new Flyer(this, img);
      const dur = 7000 + this.rnd() * 2500;
      f.tweens.push(s.tweens.add({ targets: img, x: x1 - dir * i * 46, duration: dur, ease: 'Linear', onComplete: () => f.kill() }));
      f.tweens.push(s.tweens.add({ targets: img, y: img.y - 16, duration: 900 + this.rnd() * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      f.timer = s.time.addEvent({ delay: 130, loop: true, callback: () => img.setTexture(img.texture.key === 'life_bird_1' ? 'life_bird_2' : 'life_bird_1') });
      this.flyers.add(f);
    }
  }

  // ------------------------------------------------------------------ зверёк: пробегает по экрану и исчезает
  animalLoop() {
    if (!this.running) return;
    if (!this.lite) this.runAnimal();
    this.timers.push(this.scene.time.delayedCall(this.range(LIFE.animalEveryMs), () => this.animalLoop()));
  }

  runAnimal() {
    const s = this.scene, v = s.cameras.main.worldView, p = s.player;
    for (let tries = 0; tries < 8; tries++) {
      const dir = this.rnd() < 0.5 ? 1 : -1;
      const len = 300 + this.rnd() * 140;
      const x0 = v.x + v.width * (dir > 0 ? 0.04 : 0.96), y = v.y + v.height * (0.36 + this.rnd() * 0.4);
      const x1 = x0 + dir * len;
      const bad = [0, 0.5, 1].some(t => this.onWater(x0 + (x1 - x0) * t, y)) || (p && Math.hypot(p.x - (x0 + x1) / 2, p.y - y) < 130);
      if (bad) continue;
      const kind = this.rnd() < 0.5 ? 'life_squirrel_' : 'life_rabbit_';
      const img = s.add.image(x0, y, kind + '1').setOrigin(0.5, 1).setFlipX(dir < 0).setDepth(DEPTH.mainBase + y);
      const f = new Flyer(this, img);
      const dur = 2200 + this.rnd() * 600;
      f.tweens.push(s.tweens.add({ targets: img, x: x1, duration: dur, ease: 'Linear',
        onComplete: () => { f.tweens.push(s.tweens.add({ targets: img, alpha: 0, duration: 260, onComplete: () => f.kill() })); } }));
      f.tweens.push(s.tweens.add({ targets: img, y: y - 14, duration: 150, yoyo: true, repeat: -1, ease: 'Sine.easeOut' }));
      f.timer = s.time.addEvent({ delay: 150, loop: true, callback: () => img.setTexture(img.texture.key.endsWith('1') ? kind + '2' : kind + '1') });
      this.flyers.add(f);
      return;
    }
  }

  onWater(x, y) {
    for (const r of this.scene.terrain.waterRects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    return false;
  }
}

/** Один пролетающий спрайт: его твины, таймер кадров; kill() убирает всё без остатка. */
class Flyer {
  constructor(life, img) { this.life = life; this.img = img; this.tweens = []; this.timer = null; this.dead = false; }
  kill() {
    if (this.dead) return;
    this.dead = true;
    for (const t of this.tweens) t.stop();
    this.timer?.remove(false);
    this.img.destroy();
    this.life.flyers.delete(this);
  }
}
