// «Живой мир» (v0.28.0): дешёвые анимации леса Мирры — рябь на воде, покачивание крон, птицы, зверёк, падающие листья.
// Ничего не считается каждый кадр: один таймер раз в 0.6 с и пара твинов. Объекты берутся из маленьких пулов,
// качаются только деревья рядом с камерой, а при низком FPS всё лишнее выключается само.
// v0.28.1: качание включается и выключается плавно (без рывков), листья — экранные, плавно появляются и тают,
// зверёк добегает до ближайшего дерева или куста и скрывается за ним; в доме Мирры ни зверька, ни птиц, ни листьев.
import { DEPTH } from '../config/game.config.js';
import { ZONES } from '../config/world.layout.js';
import { DISPLAY_SIZE } from '../config/assets.manifest.js';

export const LIFE = {
  tickMs: 600,
  maxRipples: 8,
  maxSwayers: 22,          // одновременно качающихся деревьев
  swayMargin: 160,         // запас вокруг камеры, где деревья начинают качаться
  swayKeep: 320,           // за этим запасом качание плавно затухает (гистерезис — без дёрганья на границе)
  birdEveryMs: [14000, 32000], birdFirstMs: 5000,
  animalEveryMs: [30000, 60000], animalFirstMs: 14000,
  animalRetryMs: 5000,
  lowFps: 30, lowFpsTicks: 5,   // столько тиков подряд с FPS ниже порога — и включается «лёгкий» режим
  recoverFps: 45, recoverTicks: 10,
  leafCount: 9,
  hopMs: 300,
};

/** Качаются деревья, камыш и кусты. Значение — размах угла в градусах. */
export function swayAmplitude(key) {
  if (/^(tree_|birch_|dead_tree)/.test(key)) return 1.4;
  if (/^reeds_/.test(key)) return 3;
  if (/^bush_/.test(key)) return 1.8;
  return 0;
}

/** Куда зверёк может убежать: дерево, берёза или куст. */
export function isHideout(key) { return /^(tree_|birch_|bush_|dead_tree)/.test(key); }

const within = (it, rect, m) => it.x >= rect.x - m && it.x <= rect.x + rect.width + m && it.y >= rect.y - m && it.y <= rect.y + rect.height + m + 120;

/** Ближайшие к центру камеры качающиеся объекты не дальше margin от экрана, не больше limit. */
export function pickSwayers(items, rect, limit, margin = LIFE.swayMargin) {
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const near = [];
  for (const it of items) if (within(it, rect, margin)) near.push(it);
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

const hitRect = (x, y, r, pad) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/**
 * Чист ли путь зверька от a до b: ни воды, ни камней и деревьев (solids), ни дома, ни героини рядом.
 * Возле самой цели (дерево, куда он бежит) препятствия не считаются — там у дерева свой блок.
 */
export function pathClear(a, b, { water = [], solids = [], avoid = [], hero = null, endFree = 52, step = 16 } = {}) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    if (hero && Math.hypot(hero.x - x, hero.y - y) < 90) return false;
    for (const r of avoid) if (hitRect(x, y, r, 40)) return false;
    for (const r of water) if (hitRect(x, y, r, 14)) return false;
    if (Math.hypot(b.x - x, b.y - y) < endFree) continue;
    for (const r of solids) if (hitRect(x, y, r, 14)) return false;
  }
  return true;
}

export class LivingWorld {
  constructor(scene) {
    this.scene = scene;
    this.rnd = scene.random || Math.random;   // детерминированный генератор сцены, если он есть
    this.running = false;
    this.lite = false;
    this.calm = false;          // героиня в доме: зверьки, птицы и листья не нужны
    this.slow = 0;
    this.fast = 0;
    this.nextAnimal = this.rnd() < 0.5 ? 'life_rabbit_' : 'life_squirrel_';
    this.swaying = new Map();   // propId -> { item, tween }
    this.ripples = [];
    this.leaves = [];
    this.leavesOn = false;
    this.timers = [];
    this.flyers = new Set();
    this.items = null;
    this.solidRects = [];
    this.interiors = ZONES.filter(z => z.interior);
  }

  /** Запуск. В редакторе и вне леса Мирры не включается. */
  start(settings) {
    const s = this.scene;
    if (this.running || s.loc?.id !== 'forest') return;
    if (settings && settings.get('anim') === false) return;
    this.running = true;
    this.items = [];
    this.solidRects = [];
    for (const v of s.propViews.values()) {
      const a = swayAmplitude(v.p.k);
      if (a) this.items.push({ id: v.p.id, k: v.p.k, x: v.p.x, y: v.p.y, a, img: v.img });
      if (/rock|boulder/.test(v.p.k)) this.solidRects.push({ x: v.p.x - v.img.displayWidth / 2, y: v.p.y - v.img.displayHeight, w: v.img.displayWidth, h: v.img.displayHeight });
    }
    for (const z of s.solids?.getChildren?.() || []) this.solidRects.push({ x: z.x - z.width / 2, y: z.y - z.height / 2, w: z.width, h: z.height });
    this.timers.push(s.time.addEvent({ delay: LIFE.tickMs, loop: true, callback: () => this.tick() }));
    this.timers.push(s.time.delayedCall(LIFE.birdFirstMs, () => this.birdLoop()));
    this.timers.push(s.time.delayedCall(LIFE.animalFirstMs, () => this.animalLoop()));
    this.tick();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    const tw = this.scene.tweens;
    for (const t of this.timers) t.remove(false);
    this.timers = [];
    for (const { item, tween } of this.swaying.values()) { tween?.stop(); tw.killTweensOf(item.img); item.img.setAngle(0); }
    this.swaying.clear();
    for (const r of this.ripples) { tw.killTweensOf(r); r.destroy(); }
    this.ripples = [];
    for (const f of [...this.flyers]) f.kill();
    this.flyers.clear();
    for (const l of this.leaves) { tw.killTweensOf(l); l.destroy(); }
    this.leaves = []; this.leavesOn = false;
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
    if (!this.lite && this.slow >= LIFE.lowFpsTicks) this.lite = true;
    // Краткое падение FPS при загрузке не должно навсегда убирать зверей.
    this.fast = fps >= LIFE.recoverFps ? this.fast + 1 : 0;
    if (this.lite && this.fast >= LIFE.recoverTicks) this.lite = false;
    // в доме Мирры тихо: зверьки, птицы и листья не появляются
    const hero = s.player;
    this.calm = !!hero && this.interiors.some(z => hitRect(hero.x, hero.y, z, 0));
    this.updateSway(view);
    this.spawnRipple(view);
    this.updateLeaves();
  }

  // ------------------------------------------------------------------ крона качается плавно, только рядом с камерой
  updateSway(view) {
    const cap = this.lite ? 6 : LIFE.maxSwayers;
    for (const [id, rec] of this.swaying) {
      if (within(rec.item, view, LIFE.swayKeep)) continue;
      this.calmDown(rec.item, rec.tween);
      this.swaying.delete(id);
    }
    if (this.swaying.size >= cap) return;
    const fresh = this.items.filter(it => !this.swaying.has(it.id));
    for (const it of pickSwayers(fresh, view, cap - this.swaying.size)) this.beginSway(it);
  }

  beginSway(it) {
    const tw = this.scene.tweens;
    tw.killTweensOf(it.img);
    const rec = { item: it, tween: null };
    // сначала плавно наклоняемся из текущего положения, потом покачиваемся туда-обратно
    rec.tween = tw.add({
      targets: it.img, angle: -it.a, duration: 500 + this.rnd() * 500, ease: 'Sine.easeInOut', delay: this.rnd() * 500,
      onComplete: () => {
        rec.tween = tw.add({ targets: it.img, angle: it.a, duration: 2000 + this.rnd() * 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });
    this.swaying.set(it.id, rec);
  }

  /** Дерево вышло из зоны качания — не замирает рывком, а плавно возвращается в прямое положение. */
  calmDown(it, tween) {
    const tw = this.scene.tweens;
    tween?.stop();
    tw.killTweensOf(it.img);
    tw.add({ targets: it.img, angle: 0, duration: 700, ease: 'Sine.easeOut' });
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
    r.setPosition(spot.x, spot.y).setTint(this.rnd() < 0.5 ? 0xd8f1f7 : 0xb9dfe9).setDisplaySize(w, w * 0.42).setAlpha(0).setVisible(true);
    const k = 3.4 + this.rnd() * 1.4, dur = 1700 + this.rnd() * 700;
    s.tweens.add({ targets: r, alpha: 0.6, duration: dur * 0.18, ease: 'Sine.easeOut' });
    s.tweens.add({
      targets: r, scaleX: r.scaleX * k, scaleY: r.scaleY * k, duration: dur, ease: 'Sine.easeOut',
      onComplete: () => r.setVisible(false),
    });
    s.tweens.add({ targets: r, alpha: 0, duration: dur * 0.8, delay: dur * 0.2, ease: 'Sine.easeIn' });
  }

  // ------------------------------------------------------------------ листья: лёгкие экранные спрайты, плавно появляются и тают
  updateLeaves() {
    const want = !this.lite && !this.calm && this.scene.textures.exists('life_leaf');
    if (want === this.leavesOn) return;
    this.leavesOn = want;
    const s = this.scene;
    if (want) {
      if (!this.leaves.length) {
        for (let i = 0; i < LIFE.leafCount; i++) {
          this.leaves.push(s.add.image(0, 0, 'life_leaf').setScrollFactor(0).setDepth(DEPTH.fx - 3).setVisible(false).setAlpha(0));
        }
      }
      this.leaves.forEach((l, i) => s.time.delayedCall(i * 1100 + this.rnd() * 800, () => this.dropLeaf(l)));
    } else {
      for (const l of this.leaves) {
        s.tweens.killTweensOf(l);
        if (!l.visible) continue;
        s.tweens.add({ targets: l, alpha: 0, duration: 700, onComplete: () => l.setVisible(false) });
      }
    }
  }

  dropLeaf(l) {
    const s = this.scene;
    if (!this.running || !this.leavesOn || !l.scene) return;
    s.tweens.killTweensOf(l);
    const cam = s.cameras.main, W = cam.width, H = cam.height;
    const k = 0.8 + this.rnd() * 0.5;
    const x0 = 30 + this.rnd() * (W - 60), dx = (this.rnd() < 0.5 ? -1 : 1) * (40 + this.rnd() * 60);
    const dur = 10000 + this.rnd() * 4000;
    l.setPosition(x0, -24).setDisplaySize(18 * k, 12 * k).setAngle(this.rnd() * 360).setAlpha(0).setVisible(true)
      .setTint([0xd9822b, 0xb85a1e, 0xe0b040, 0x9aa83e][Math.floor(this.rnd() * 4)]);
    s.tweens.add({ targets: l, y: H * (0.55 + this.rnd() * 0.4), duration: dur, ease: 'Sine.easeInOut',
      onComplete: () => { l.setVisible(false); s.time.delayedCall(this.rnd() * 3000, () => this.dropLeaf(l)); } });
    s.tweens.add({ targets: l, x: x0 + dx, duration: 2200 + this.rnd() * 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    s.tweens.add({ targets: l, angle: l.angle + (this.rnd() < 0.5 ? -1 : 1) * (120 + this.rnd() * 160), duration: dur, ease: 'Sine.easeInOut' });
    s.tweens.add({ targets: l, alpha: 0.9, duration: dur / 2, yoyo: true, ease: 'Sine.easeInOut' });   // плавно появился — плавно растаял
  }

  // ------------------------------------------------------------------ птицы: пролетают через экран
  birdLoop() {
    if (!this.running) return;
    if (!this.lite && !this.calm) this.flyBird();
    this.timers.push(this.scene.time.delayedCall(this.range(LIFE.birdEveryMs), () => this.birdLoop()));
  }

  flyBird() {
    const s = this.scene, cam = s.cameras.main;
    const dir = this.rnd() < 0.5 ? 1 : -1;
    // Полёт привязан к экрану: движение героя/камеры не сдвигает край,
    // у которого птица исчезнет. Весь спрайт выходит за противоположный край.
    const x0 = dir > 0 ? -50 : cam.width + 50, x1 = dir > 0 ? cam.width + 50 : -50;
    const y = cam.height * (0.2 + this.rnd() * 0.25);
    const n = this.rnd() < 0.4 ? 2 : 1;   // иногда парой
    const seq = ['life_bird_1', 'life_bird_2', 'life_bird_3', 'life_bird_2'];
    for (let i = 0; i < n; i++) {
      const img = s.add.image(x0 - dir * i * 46, y + i * 22, 'life_bird_1').setOrigin(0.5).setScrollFactor(0)
        .setDisplaySize(...DISPLAY_SIZE.life_bird_1).setFlipX(dir < 0).setDepth(DEPTH.fx - 5);
      const f = new Flyer(this, img);
      const dur = 7000 + this.rnd() * 2500;
      let step = i;
      f.tweens.push(s.tweens.add({ targets: img, x: x1, duration: dur + i * 400, ease: 'Linear', onComplete: () => f.kill() }));
      f.tweens.push(s.tweens.add({ targets: img, y: img.y - 16, duration: 900 + this.rnd() * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      f.timer = s.time.addEvent({ delay: 110, loop: true, callback: () => img.setTexture(seq[++step % 4]).setDisplaySize(...DISPLAY_SIZE.life_bird_1) });
      this.flyers.add(f);
    }
  }

  // ------------------------------------------------------------------ зверёк: выбегает и скрывается за ближайшим деревом или кустом
  animalLoop() {
    if (!this.running) return;
    const ran = !this.lite && !this.calm && this.runAnimal();
    // Нет чистого пути на этом экране — пробуем ещё, а не пропускаем целую минуту.
    const delay = ran ? this.range(LIFE.animalEveryMs) : LIFE.animalRetryMs;
    this.timers.push(this.scene.time.delayedCall(delay, () => this.animalLoop()));
  }

  /** Подбирает дерево/куст на экране и чистый путь к нему; null, если подходящего нет. */
  pickRun(view, hero) {
    const R = this.scene.bounds;
    const hideouts = this.items.filter(it => isHideout(it.k) && it.x > view.x + 40 && it.x < view.right - 40 && it.y > view.y + 120 && it.y < view.bottom - 80 && it.x > R.x + 30 && it.x < R.x + R.w - 30);
    const env = { water: this.scene.terrain.waterRects, solids: this.solidRects, avoid: this.interiors, hero };
    const offset = Math.floor(this.rnd() * hideouts.length);
    for (let tries = 0; tries < Math.min(24, hideouts.length); tries++) {
      const target = hideouts[(offset + tries) % hideouts.length];
      const firstDir = this.rnd() < 0.5 ? 1 : -1;
      for (const len of [280, 210, 150]) for (const dir of [firstDir, -firstDir]) {
        const a = { x: target.x - dir * len, y: target.y + (this.rnd() - 0.5) * 80 };
        const b = { x: target.x - dir * 8, y: target.y + 2 };
        if (a.x < R.x + 20 || a.x > R.x + R.w - 20 || a.x < view.x + 20 || a.x > view.right - 20) continue;
        if (!pathClear(a, b, env)) continue;
        return { a, b, target, dir: Math.sign(b.x - a.x) || 1 };
      }
    }
    return null;
  }

  runAnimal() {
    const s = this.scene, v = s.cameras.main.worldView, p = s.player;
    const run = this.pickRun(v, p ? { x: p.x, y: p.y } : null);
    if (!run) return null;
    const kind = this.nextAnimal;
    this.nextAnimal = kind === 'life_rabbit_' ? 'life_squirrel_' : 'life_rabbit_';
    const { a, b, target } = run;
    const size = DISPLAY_SIZE[kind + '1'];
    const img = s.add.image(a.x, a.y, kind + '1').setOrigin(0.5, 1).setDisplaySize(...size).setFlipX(run.dir < 0).setDepth(DEPTH.mainBase + a.y);
    const shadow = s.add.image(a.x, a.y, 'fx_glow').setTint(0x000000).setAlpha(0.22).setDisplaySize(22, 7).setDepth(DEPTH.mainBase + a.y - 1);
    const f = new Flyer(this, img, [shadow]);
    const dist = Math.hypot(b.x - a.x, b.y - a.y), speed = kind === 'life_rabbit_' ? 250 : 220;
    const dur = dist / speed * 1000;
    let frame = 1;
    f.tweens.push(s.tweens.addCounter({
      from: 0, to: 1, duration: dur, ease: 'Linear',
      onUpdate: (tw) => {
        const t = tw.getValue(), ph = (t * dur / LIFE.hopMs) % 1;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, hop = Math.sin(Math.min(1, ph / 0.8) * Math.PI) * 9 * (ph < 0.8 ? 1 : 0);
        img.setPosition(x, y - hop).setDepth(DEPTH.mainBase + y);
        shadow.setPosition(x, y).setDepth(DEPTH.mainBase + y - 1).setAlpha(0.22 - hop * 0.008);
        const fr = ph < 0.18 ? 1 : ph < 0.7 ? 2 : 3;
        if (fr !== frame) { frame = fr; img.setTexture(kind + fr).setDisplaySize(...size); }
      },
      onComplete: () => {
        // добежал: прячется за деревом (рисуется позади его ствола) и тает
        img.setPosition(b.x, b.y).setDepth(DEPTH.mainBase + target.y - 3).setTexture(kind + 1).setDisplaySize(...size);
        f.tweens.push(s.tweens.add({ targets: [img, shadow], alpha: 0, duration: 260, onComplete: () => f.kill() }));
      },
    }));
    this.flyers.add(f);
    return f;
  }
}

/** Один пролетающий или пробегающий спрайт: его твины, таймер кадров, тень; kill() убирает всё без остатка. */
class Flyer {
  constructor(life, img, extra = []) { this.life = life; this.img = img; this.extra = extra; this.tweens = []; this.timer = null; this.dead = false; }
  kill() {
    if (this.dead) return;
    this.dead = true;
    for (const t of this.tweens) t.stop();
    this.timer?.remove(false);
    this.life.scene.tweens.killTweensOf([this.img, ...this.extra]);
    this.img.destroy();
    for (const e of this.extra) e.destroy();
    this.life.flyers.delete(this);
  }
}
