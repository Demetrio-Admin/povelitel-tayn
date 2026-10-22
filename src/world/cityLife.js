// «Живой город» (v0.40.0): горожане, собаки и кошки, вороны на крышах, болтающие жители у спасённого дома, дым из труб и снег.
// Как и лесной «Живой мир» (life.js), это дёшево: ничего не считается для того, что не видно, все спрайты — из маленьких наборов
// (≤ 5 людей, ≤ 3 зверей, 3 вороны, ≤ 16 клубов дыма, 24 снежинки), а при низком FPS лишнее выключается само.
// Люди и звери идут по осям мощёных улиц из карты (никакого поиска пути): появляются за краем экрана, уходят за край.
// Графика — прототипы (tools/art/city_life_art.py): людей легко заменить нарисованными кадрами с теми же именами.
import { DEPTH } from '../config/game.config.js';
import { DISPLAY_SIZE } from '../config/assets.manifest.js';
import { services } from '../services.js';
import { catmullRom } from './geometry.js';

export const CITY_LIFE = {
  citizenVariants: ['man_a', 'man_b', 'woman_a', 'woman_b'],
  cats: ['cat_ginger', 'cat_grey', 'cat_tux'],
  dogs: ['dog_tan', 'dog_brown'],
  crows: 3,
  spawnMargin: 70,            // новый человек появляется не ближе этого от края экрана
  fadeSpawnHeroPx: 280,       // если улица целиком на экране — ходок проявляется не ближе этого к героине
  fadeSec: 0.9,
  despawnMargin: 170,         // и исчезает, когда ушёл дальше этого
  spawnEveryMs: [3500, 8000],
  personSpeed: [38, 54],      // px/с — прогулочный шаг
  petWalk: 62, petRun: 150,
  stepSec: 0.17,              // длительность одного кадра ходьбы
  waitHeroPx: 72,             // не лезем на героиню: остановились, пока не отойдёт
  greetPx: 150,
  smokeMax: 16, smokeBuildings: 4,
  snowFlakes: 24,
  chatRange: 640,
  tickMs: 600,
  crowFlapSec: 0.09,
};

/** Сколько кого в городе в зависимости от сюжета: до оттаивания пусто и падает снег, после — людно, из труб идёт дым. */
export function populationFor(hasEvent, lite = false) {
  const thawed = hasEvent('ch2_severin_defeated') || hasEvent('chapter_2_complete');
  if (lite) return { thawed, citizens: thawed ? 1 : 0, pets: 0, crows: 1, smoke: false, snow: false, chat: thawed };
  return thawed
    ? { thawed, citizens: 5, pets: 3, crows: CITY_LIFE.crows, smoke: true, snow: false, chat: true }
    : { thawed, citizens: 2, pets: 1, crows: CITY_LIFE.crows, smoke: false, snow: true, chat: true };
}

// ------------------------------------------------------------------ маршруты по улицам
/** Улицы, по которым можно гулять: мощёные, не площади и не короткие подъезды. Ось сглаживается и размечается длиной. */
export function buildRoutes(roads) {
  const out = [];
  for (const r of roads || []) {
    if (!String(r.id).startsWith('city_street_') || r.kind === 'dirt' || !r.pts || r.pts.length < 2) continue;
    if ((r.w || 0) > 200) continue;                      // площади и дворы: рынок, сквер, двор
    const pts = catmullRom(r.pts, 8);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1];
    if (len < 260) continue;
    out.push({ id: r.id, pts, cum, len, w: r.w || 90 });
  }
  return out;
}

/** Точка маршрута на расстоянии s от начала; lane — смещение вбок от оси (px). tx, ty — направление вдоль маршрута. */
export function pointAt(route, s, lane = 0) {
  const { pts, cum, len } = route;
  s = Math.max(0, Math.min(len, s));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], seg = cum[hi] - cum[lo] || 1, t = (s - cum[lo]) / seg;
  const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t - ty * lane, y: a[1] + (b[1] - a[1]) * t + tx * lane, tx, ty };
}

const inRect = (x, y, r, m = 0) => x >= r.x - m && x <= r.x + r.width + m && y >= r.y - m && y <= r.y + r.height + m;

/**
 * Где и куда пустить нового ходока: маршрут, который заходит в видимую область; начало — за краем экрана (с запасом margin),
 * движение — внутрь (hidden: true). Экран в городе высокий, и часть улиц целиком внутри него: тогда, если задана героиня hero,
 * ходок возникает на улице не ближе minHero от неё и проявляется плавно (hidden: false). Иначе — null.
 * rnd() → [0,1). Возвращает { route, s, dir, hidden } или null.
 */
export function pickSpawn(routes, view, rnd, margin = CITY_LIFE.spawnMargin, step = 24, hero = null, minHero = CITY_LIFE.fadeSpawnHeroPx) {
  const tries = [];
  for (const route of routes) {
    for (let s = 0; s <= route.len; s += step) {
      const p = pointAt(route, s);
      if (inRect(p.x, p.y, view)) { tries.push({ route, s }); break; }
    }
  }
  if (!tries.length) return null;
  const order = tries.map((t, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => tries[i]);
  for (const { route } of order) {
    const inside = [];
    for (let s = 0; s <= route.len; s += step) { const p = pointAt(route, s); if (inRect(p.x, p.y, view)) inside.push(s); }
    const mid = inside[Math.floor(rnd() * inside.length)];
    for (const dir of rnd() < 0.5 ? [1, -1] : [-1, 1]) {
      // идём от видимого места назад (против dir), пока не выйдем за край экрана с запасом
      let s = mid, ok = false;
      while (s >= 0 && s <= route.len) {
        const p = pointAt(route, s);
        if (!inRect(p.x, p.y, view, margin)) { ok = true; break; }
        s -= dir * step;
      }
      if (ok) return { route, s: Math.max(0, Math.min(route.len, s)), dir, hidden: true };
    }
  }
  if (!hero) return null;
  const spots = [];
  for (const { route } of order) for (let s = 0; s <= route.len; s += step * 2) {
    const p = pointAt(route, s);
    if (inRect(p.x, p.y, view, -30) && Math.hypot(p.x - hero.x, p.y - hero.y) >= minHero) spots.push({ route, s });
  }
  if (!spots.length) return null;
  const pick = spots[Math.floor(rnd() * spots.length)];
  return { ...pick, dir: rnd() < 0.5 ? 1 : -1, hidden: false };
}

/** Реплики жителей у спасённого дома: короткие, по очереди. */
export const CHAT_LINES = {
  man: ['Живы, старая. Живы.', 'Говорил же: мороз не навсегда.', 'Руки отогреваются. Это главное.', 'Надо будет поблагодарить этих девочек.', 'Хлеб бы сейчас. Тёплый.'],
  woman: ['Руки-то ещё как ледышки…', 'Ты то же самое говорил вчера.', 'А девочка с котёнком где?', 'Слышишь? Лёд больше не звенит.', 'Печь затопим — и всё будет хорошо.'],
};

// ------------------------------------------------------------------ сама система
export class CityLife {
  constructor(scene, life) {
    this.scene = scene; this.life = life;
    this.rnd = () => life.rnd();
    this.walkers = []; this.crows = []; this.puffs = []; this.flakes = [];
    this.routes = []; this.roofs = []; this.running = false;
    this.spawnIn = 2500; this.petSpawnIn = 6000;
    this.chat = null; this.pop = null; this.snowOn = false;
    this.sfxAt = 0;
    this.onUpdate = (t, dt) => this.update(Math.min(dt, 50) / 1000);
  }

  get lite() { return !!this.life.lite; }

  start() {
    const s = this.scene;
    if (this.running) return;
    this.running = true;
    this.routes = buildRoutes(s.map?.roads);
    this.solids = this.life.solidRects || [];
    this.roofs = this.findRoofs();
    this.chatTargets();
    s.events.on('update', this.onUpdate);
    this.tick(s.cameras.main.worldView);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    const s = this.scene;
    s.events.off('update', this.onUpdate);
    for (const w of this.walkers) this.killWalker(w, true);
    this.walkers = [];
    for (const c of this.crows) { s.tweens.killTweensOf(c.img); c.img.destroy(); }
    this.crows = [];
    for (const p of this.puffs) p.img.destroy();
    this.puffs = [];
    for (const f of this.flakes) f.img.destroy();
    this.flakes = []; this.snowOn = false;
    this.stopChat();
  }

  // ------------------------------------------------------------------ тик раз в 0.6 с
  tick(view) {
    if (!this.running) return;
    const s = this.scene, hero = s.player;
    this.pop = populationFor(k => services.state.hasEvent(k), this.lite);
    const dtMs = CITY_LIFE.tickMs;
    // люди и звери: пополнение и уборка тех, кто ушёл далеко
    for (const w of [...this.walkers]) {
      const far = !inRect(w.img.x, w.img.y, view, CITY_LIFE.despawnMargin);
      const excess = this.walkers.filter(x => x.kind === w.kind).length > (w.kind === 'person' ? this.pop.citizens : this.pop.pets);
      if (far && (w.age > w.ttl || excess)) this.killWalker(w);
      else if (far && w.age > 8 && this.rnd() < 0.15) this.killWalker(w);   // ушёл — не копим
      else if (!far && !w.leaving && (w.age > w.ttl || excess)) w.leaving = true;   // ещё на экране — растворяется
    }
    this.spawnIn -= dtMs; this.petSpawnIn -= dtMs;
    if (this.spawnIn <= 0 && this.walkers.filter(w => w.kind === 'person').length < this.pop.citizens) {
      if (this.spawnPerson(view)) this.spawnIn = this.life.range(CITY_LIFE.spawnEveryMs); else this.spawnIn = 2000;
    }
    if (this.petSpawnIn <= 0 && this.walkers.filter(w => w.kind !== 'person').length < this.pop.pets) {
      if (this.spawnPet(view)) this.petSpawnIn = this.life.range([6000, 14000]); else this.petSpawnIn = 3000;
    }
    this.tickCrows(view, hero);
    this.tickSmoke(view);
    this.tickSnow();
    this.tickChat(view, hero);
  }

  // ------------------------------------------------------------------ люди
  spawnPerson(view) {
    const spot = pickSpawn(this.routes, view, this.rnd, CITY_LIFE.spawnMargin, 24, this.scene.player);
    if (!spot) return false;
    const used = new Set(this.walkers.filter(w => w.kind === 'person').map(w => w.variant));
    const free = CITY_LIFE.citizenVariants.filter(v => !used.has(v));
    const variant = (free.length ? free : CITY_LIFE.citizenVariants)[Math.floor(this.rnd() * (free.length || CITY_LIFE.citizenVariants.length))];
    const key = n => `cl_${variant}_${n}`;
    if (!this.scene.textures.exists(key(0))) return false;
    const [lo, hi] = CITY_LIFE.personSpeed;
    const w = this.makeWalker('person', spot, { variant, speed: lo + this.rnd() * (hi - lo), lane: (this.rnd() < 0.5 ? -1 : 1) * (8 + this.rnd() * 14), key });
    w.ttl = 45 + this.rnd() * 60;
    return true;
  }

  spawnPet(view) {
    const spot = pickSpawn(this.routes, view, this.rnd, CITY_LIFE.spawnMargin, 24, this.scene.player);
    if (!spot) return false;
    const dog = this.rnd() < 0.45;
    const list = dog ? CITY_LIFE.dogs : CITY_LIFE.cats;
    const variant = list[Math.floor(this.rnd() * list.length)];
    const key = n => `cl_${variant}_${n}`;
    if (!this.scene.textures.exists(key('walk1'))) return false;
    const w = this.makeWalker(dog ? 'dog' : 'cat', spot, { variant, speed: CITY_LIFE.petWalk, lane: (this.rnd() < 0.5 ? -1 : 1) * (dog ? 26 : 38), key });
    w.ttl = 30 + this.rnd() * 40; w.mode = 'walk'; w.modeT = 2 + this.rnd() * 3;
    return true;
  }

  makeWalker(kind, spot, o) {
    const s = this.scene;
    const first = kind === 'person' ? o.key(1) : o.key('walk1');
    const [dw, dh] = DISPLAY_SIZE[first] || [60, 60];
    const p = pointAt(spot.route, spot.s, o.lane);
    const img = s.add.image(p.x, p.y, first).setOrigin(0.5, 1).setDisplaySize(dw, dh).setDepth(DEPTH.mainBase + p.y);
    const shadow = s.add.image(p.x, p.y - 2, 'hero_shadow').setAlpha(0.45).setDisplaySize(kind === 'person' ? 52 : dw * 0.8, kind === 'person' ? 16 : 12).setDepth(DEPTH.mainBase + p.y - 1);
    const w = { kind, ...o, route: spot.route, s: spot.s, dir: spot.dir, img, shadow, dw, dh, age: 0, ttl: 60, animT: this.rnd(), frame: -1, wait: 0, blocked: 0, greeted: false, hop: 0, mode: 'walk', modeT: 0,
      fade: spot.hidden ? 1 : 0, leaving: false };
    if (!spot.hidden) { img.setAlpha(0); shadow.setAlpha(0); }
    this.walkers.push(w);
    return w;
  }

  killWalker(w, quiet = false) {
    this.scene.tweens.killTweensOf(w.img);
    w.img.destroy(); w.shadow.destroy();
    if (!quiet) this.walkers = this.walkers.filter(x => x !== w);
  }

  solidAt(x, y) {
    for (const r of this.solids) if (x >= r.x - 14 && x <= r.x + r.w + 14 && y >= r.y - 10 && y <= r.y + r.h + 10) return true;
    return false;
  }

  update(dt) {
    if (!this.running || !dt) return;
    const s = this.scene, hero = s.player;
    for (const w of this.walkers) this.moveWalker(w, dt, hero);
    if (this.walkers.some(w => w.dead)) for (const w of this.walkers.filter(x => x.dead)) this.killWalker(w);
    this.moveCrows(dt, hero);
    this.moveSmoke(dt);
    this.moveSnow(dt);
  }

  moveWalker(w, dt, hero) {
    w.age += dt;
    const person = w.kind === 'person';
    // режимы зверя: идёт → сидит → пробегает; кошка удирает от героини
    if (!person) {
      w.modeT -= dt;
      const near = hero && Math.hypot(hero.x - w.img.x, hero.y - w.img.y) < 120;
      if (w.kind === 'cat' && near && w.mode !== 'run') { w.mode = 'run'; w.modeT = 1.8 + this.rnd(); const q = pointAt(w.route, w.s); w.dir = ((hero.x - w.img.x) * q.tx + (hero.y - w.img.y) * q.ty) > 0 ? -1 : 1; }
      else if (w.modeT <= 0) {
        const next = w.mode === 'sit' ? (this.rnd() < 0.5 ? 'run' : 'walk') : (this.rnd() < 0.45 ? 'sit' : (w.mode === 'walk' ? 'run' : 'walk'));
        w.mode = next; w.modeT = next === 'sit' ? 3 + this.rnd() * 5 : next === 'run' ? 1 + this.rnd() * 1.6 : 2 + this.rnd() * 3;
        if (this.rnd() < 0.25) w.dir *= -1;
      }
    }
    let speed = w.speed;
    if (!person) speed = w.mode === 'sit' ? 0 : w.mode === 'run' ? CITY_LIFE.petRun : CITY_LIFE.petWalk;
    // остановка: впереди героиня или что-то твёрдое
    if (w.wait > 0) { w.wait -= dt; speed = 0; }
    else if (speed > 0) {
      const a = pointAt(w.route, w.s + w.dir * 30, w.lane);
      const heroAhead = person && hero && Math.hypot(hero.x - a.x, hero.y - a.y) < CITY_LIFE.waitHeroPx;
      if (heroAhead || this.solidAt(a.x, a.y)) {
        speed = 0; w.wait = 0.5 + this.rnd() * 0.8;
        if (!heroAhead && ++w.blocked > 3) { w.dir *= -1; w.blocked = 0; }
      } else w.blocked = 0;
    }
    if (speed > 0) {
      w.s += w.dir * speed * dt;
      if (w.s <= 0 || w.s >= w.route.len) { w.s = Math.max(0, Math.min(w.route.len, w.s)); w.dir *= -1; }
    }
    const p = pointAt(w.route, w.s, w.lane);
    // шаг: кадр сменяется по таймеру, пока идёт
    let frame, key;
    if (person) {
      if (speed > 0) { w.animT += dt; frame = 1 + (Math.floor(w.animT / CITY_LIFE.stepSec) % 4); } else frame = 0;
      key = w.key(frame);
    } else {
      if (w.mode === 'sit' && speed === 0) { frame = 'sit'; key = w.key('sit'); }
      else { w.animT += dt; const t = w.mode === 'run' ? CITY_LIFE.crowFlapSec + 0.03 : 0.22; frame = (w.mode === 'run' ? 'run' : 'walk') + (1 + (Math.floor(w.animT / t) % 2)); key = w.key(frame); }
    }
    if (frame !== w.frame) { w.frame = frame; w.img.setTexture(key).setDisplaySize(...(DISPLAY_SIZE[key] || [w.dw, w.dh])); }
    // приветствие: один подскок, когда героиня рядом
    const hd = hero ? Math.hypot(hero.x - p.x, hero.y - p.y) : 1e9;
    if (person && hd < CITY_LIFE.greetPx && !w.greeted) { w.greeted = true; w.hop = 0.35; }
    if (hd > CITY_LIFE.greetPx * 2) w.greeted = false;
    let lift = 0;
    if (w.hop > 0) { w.hop -= dt; lift = Math.sin((1 - w.hop / 0.35) * Math.PI) * 9; }
    const moving = speed > 0 ? w.dir * p.tx : (w.flip ?? 0);
    if (moving) { w.flip = moving; w.img.setFlipX(moving < 0); }
    w.fade = w.leaving ? Math.max(0, w.fade - dt / CITY_LIFE.fadeSec) : Math.min(1, w.fade + dt / CITY_LIFE.fadeSec);
    w.img.setPosition(p.x, p.y - lift).setDepth(DEPTH.mainBase + p.y).setAlpha(w.fade);
    w.shadow.setPosition(p.x, p.y - 2).setDepth(DEPTH.mainBase + p.y - 1).setAlpha((0.45 - lift * 0.02) * w.fade);
    if (w.leaving && w.fade <= 0) w.dead = true;
  }

  // ------------------------------------------------------------------ вороны
  /** Крыши: верхняя часть каждого здания с картинкой (по границам спрайта) — места, где вороны сидят. */
  findRoofs() {
    const roofs = [];
    for (const { c, img } of this.scene.colliderViews?.values() || []) {
      if (!c.building || !img?.getBounds || !img.texture) continue;
      const b = img.getBounds();
      if (b.width < 140 || b.height < 100) continue;
      roofs.push({ id: c.id, x0: b.x + b.width * 0.24, x1: b.right - b.width * 0.24, y: b.y + b.height * 0.2, depth: (img.depth || 0) + 1, cx: b.centerX });
    }
    return roofs;
  }

  roofSpot(roof) { return { x: roof.x0 + this.rnd() * (roof.x1 - roof.x0), y: roof.y + (this.rnd() - 0.5) * 8 }; }

  tickCrows(view, hero) {
    const want = this.pop.crows;
    if (!this.roofs.length) return;
    while (this.crows.length < want) {
      const roof = this.roofNear(hero, view, false) || this.roofs[0];
      const sp = this.roofSpot(roof);
      const img = this.scene.add.image(sp.x, sp.y, 'cl_crow_3').setOrigin(0.5, 1).setDisplaySize(...DISPLAY_SIZE.cl_crow_3).setDepth(roof.depth).setFlipX(this.rnd() < 0.5);
      this.crows.push({ img, roof, state: 'perch', at: 4 + this.rnd() * 10, peckAt: 2 + this.rnd() * 4, t: 0, flap: 0, spot: sp });
    }
    while (this.crows.length > want) { const c = this.crows.pop(); this.scene.tweens.killTweensOf(c.img); c.img.destroy(); }
    // ворона осталась далеко позади — пересаживаем на крышу у экрана (вне кадра: не появляется на глазах)
    for (const c of this.crows) {
      if (c.state !== 'perch' || !hero) continue;
      if (Math.hypot(c.img.x - hero.x, c.img.y - hero.y) > 1500 || (this.rnd() < 0.02 && !inRect(c.img.x, c.img.y, view, 40))) {
        const roof = this.roofNear(hero, view, false);
        if (roof) { c.roof = roof; c.spot = this.roofSpot(roof); c.img.setPosition(c.spot.x, c.spot.y).setDepth(roof.depth); }
      }
    }
  }

  /** Случайная крыша рядом с героиней; outside — только вне кадра. */
  roofNear(hero, view, inside, except = null, minD = 0, maxD = 1100) {
    const list = this.roofs.filter(r => r !== except && hero && (() => {
      const d = Math.hypot(r.cx - hero.x, r.y - hero.y);
      const vis = inRect(r.cx, r.y, view, 40);
      return d >= minD && d <= maxD && (inside ? true : !vis);
    })());
    return list.length ? list[Math.floor(this.rnd() * list.length)] : null;
  }

  takeOff(c, hero, scare = false) {
    const view = this.scene.cameras.main.worldView;
    // летим на другую крышу: поближе (150–650 px), а если рядом других нет — подальше (до 1100); от испугавшей героини — прочь
    const cand = this.roofs.filter(r => r !== c.roof).map(r => ({ r, d: Math.hypot(r.cx - c.img.x, r.y - c.img.y) }))
      .filter(({ r, d }) => d >= 150 && d <= 1100 && !(scare && hero && Math.hypot(r.cx - hero.x, r.y - hero.y) < Math.hypot(c.img.x - hero.x, c.img.y - hero.y)));
    const near = cand.filter(x => x.d <= 650), pool = near.length ? near : cand;
    const roof = pool.length ? pool[Math.floor(this.rnd() * pool.length)].r : null;
    if (!roof) { c.at = 4 + this.rnd() * 6; return; }
    const to = this.roofSpot(roof), from = { x: c.img.x, y: c.img.y };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    c.state = 'fly'; c.t = 0; c.dur = Math.max(1.3, Math.min(6.5, dist / 170)); c.from = from; c.to = to; c.next = roof;
    c.arc = 70 + this.rnd() * 60; c.flap = 0;
    c.img.setFlipX(to.x < from.x).setDepth(DEPTH.fx - 8);
    if (hero && inRect(from.x, from.y, view, 60) && Math.hypot(from.x - hero.x, from.y - hero.y) < 700) this.caw();
  }

  caw() {
    const now = this.scene.time.now;
    if (now - this.sfxAt < 5000) return;
    this.sfxAt = now;
    if (this.rnd() < 0.6) services.audio?.play('crow_caw', { minGap: 4000 });
  }

  moveCrows(dt, hero) {
    for (const c of this.crows) {
      if (c.state === 'perch') {
        c.at -= dt; c.peckAt -= dt;
        if (hero && Math.hypot(hero.x - c.img.x, hero.y - c.img.y) < 130) { this.takeOff(c, hero, true); continue; }
        if (c.at <= 0) { this.takeOff(c, hero); continue; }
        if (c.peckAt <= 0) {
          c.peckAt = 2.5 + this.rnd() * 5;
          if (this.rnd() < 0.3) c.img.setFlipX(!c.img.flipX);
          else this.scene.tweens.add({ targets: c.img, angle: c.img.flipX ? 14 : -14, duration: 160, yoyo: true, repeat: this.rnd() < 0.5 ? 1 : 0, ease: 'Sine.easeInOut' });
        }
      } else {
        c.t += dt / c.dur;
        const t = Math.min(1, c.t), u = 1 - t;
        const mx = (c.from.x + c.to.x) / 2, my = Math.min(c.from.y, c.to.y) - c.arc;
        c.img.setPosition(u * u * c.from.x + 2 * u * t * mx + t * t * c.to.x, u * u * c.from.y + 2 * u * t * my + t * t * c.to.y);
        c.flap += dt;
        const seq = ['cl_crow_1', 'cl_crow_2', 'cl_crow_3', 'cl_crow_2'];
        const key = t > 0.92 ? 'cl_crow_2' : seq[Math.floor(c.flap / CITY_LIFE.crowFlapSec) % 4];
        if (c.img.texture.key !== key) c.img.setTexture(key).setDisplaySize(...DISPLAY_SIZE[key]);
        if (t >= 1) {
          c.state = 'perch'; c.roof = c.next; c.spot = c.to; c.at = 8 + this.rnd() * 16; c.peckAt = 1.5;
          c.img.setTexture('cl_crow_3').setDisplaySize(...DISPLAY_SIZE.cl_crow_3).setDepth(c.roof.depth).setAngle(0);
        }
      }
    }
  }

  // ------------------------------------------------------------------ дым из труб
  tickSmoke(view) {
    const want = this.pop.smoke && !this.lite;
    if (!want) { for (const p of this.puffs) p.img.setVisible(false); this.smokeSrc = []; return; }
    // источники — ближайшие к камере крыши
    const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
    this.smokeSrc = this.roofs.filter(r => inRect(r.cx, r.y, view, 220))
      .sort((a, b) => Math.hypot(a.cx - cx, a.y - cy) - Math.hypot(b.cx - cx, b.y - cy)).slice(0, CITY_LIFE.smokeBuildings)
      .map(r => ({ x: r.x1 - 4, y: r.y - 6, depth: r.depth + 2, id: r.id, at: 0 }));
  }

  moveSmoke(dt) {
    for (const p of this.puffs) {
      if (!p.img.visible) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { p.img.setVisible(false); continue; }
      p.img.setPosition(p.x + k * p.drift, p.y - k * 74).setDisplaySize(14 + k * 34, 14 + k * 34).setAlpha(0.34 * Math.sin(Math.min(1, k * 1.1) * Math.PI) ** 0.7);
    }
    if (!this.smokeSrc?.length) return;
    for (const src of this.smokeSrc) {
      src.at -= dt;
      if (src.at > 0) continue;
      src.at = 0.9 + this.rnd() * 0.7;
      let p = this.puffs.find(q => !q.img.visible);
      if (!p) {
        if (this.puffs.length >= CITY_LIFE.smokeMax) continue;
        p = { img: this.scene.add.image(0, 0, 'fx_glow').setTint(0xdfe3e6) };
        this.puffs.push(p);
      }
      Object.assign(p, { x: src.x + (this.rnd() - 0.5) * 6, y: src.y, age: 0, life: 2.6 + this.rnd() * 1.2, drift: 14 + this.rnd() * 20 });
      p.img.setPosition(p.x, p.y).setDepth(src.depth).setVisible(true).setAlpha(0);
    }
  }

  // ------------------------------------------------------------------ снег, пока город замёрз
  tickSnow() {
    const want = this.pop.snow && !this.lite;
    if (want === this.snowOn) return;
    this.snowOn = want;
    const s = this.scene, cam = s.cameras.main;
    if (want && !this.flakes.length) {
      for (let i = 0; i < CITY_LIFE.snowFlakes; i++) {
        const k = 0.05 + this.rnd() * 0.05;
        this.flakes.push({ img: s.add.image(0, 0, 'fx_glow').setScrollFactor(0).setDepth(DEPTH.fx - 4).setScale(k).setAlpha(0.55 + this.rnd() * 0.3).setTint(0xf4fbff),
          x: this.rnd() * cam.width, y: this.rnd() * cam.height, vy: 26 + this.rnd() * 30, ph: this.rnd() * 6, sw: 10 + this.rnd() * 14 });
      }
    }
    for (const f of this.flakes) f.img.setVisible(want);
  }

  moveSnow(dt) {
    if (!this.snowOn) return;
    const cam = this.scene.cameras.main;
    for (const f of this.flakes) {
      f.y += f.vy * dt; f.ph += dt * 1.3;
      if (f.y > cam.height + 8) { f.y = -8; f.x = this.rnd() * cam.width; }
      f.img.setPosition(f.x + Math.sin(f.ph) * f.sw, f.y);
    }
  }

  // ------------------------------------------------------------------ разговор жителей у спасённого дома
  chatTargets() {
    const v = id => this.scene.propViews?.get(id);
    this.man = v('city_plan_resident_man'); this.woman = v('city_plan_resident_woman');
  }

  tickChat(view, hero) {
    const m = this.man?.img, w = this.woman?.img;
    if (!m || !w) return;
    const visible = m.visible && w.visible && m.alpha > 0 && w.alpha > 0;
    const near = hero && Math.hypot(hero.x - m.x, hero.y - m.y) < CITY_LIFE.chatRange && inRect(m.x, m.y, view, 120);
    if (this.pop.chat && visible && near) { if (!this.chat) this.startChat(); }
    else if (this.chat) this.stopChat();
  }

  startChat() {
    const s = this.scene, m = this.man.img, w = this.woman.img;
    this.chat = { speaker: this.rnd() < 0.5 ? 'man' : 'woman', n: { man: 0, woman: 0 }, timer: null,
      base: { m: { sx: m.scaleX, sy: m.scaleY, a: m.angle }, w: { sx: w.scaleX, sy: w.scaleY, a: w.angle } }, bubble: null };
    this.chat.bubble = s.add.text(0, 0, '', { fontFamily: 'Philosopher, Georgia, serif', fontSize: '20px', color: '#4a3426', backgroundColor: '#f6ecd2',
      padding: { x: 10, y: 5 }, align: 'center', wordWrap: { width: 230 } }).setOrigin(0.5, 1).setDepth(DEPTH.markers - 3).setAlpha(0);
    this.say();
  }

  say() {
    const c = this.chat, s = this.scene;
    if (!c) return;
    const who = c.speaker, img = (who === 'man' ? this.man : this.woman).img, other = (who === 'man' ? this.woman : this.man).img;
    const lines = CHAT_LINES[who], text = lines[c.n[who]++ % lines.length];
    const base = who === 'man' ? c.base.m : c.base.w, obase = who === 'man' ? c.base.w : c.base.m;
    // говорящий покачивается в такт, слушающий кивает
    s.tweens.killTweensOf([img, other]);
    s.tweens.add({ targets: img, scaleY: base.sy * 1.03, scaleX: base.sx * 0.99, duration: 150, yoyo: true, repeat: 5, ease: 'Sine.easeInOut' });
    s.tweens.add({ targets: img, angle: base.a + (who === 'man' ? 2.2 : -2.2), duration: 260, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
    s.tweens.add({ targets: other, angle: obase.a + (who === 'man' ? -1.6 : 1.6), duration: 420, yoyo: true, repeat: 1, delay: 500, ease: 'Sine.easeInOut' });
    const near = s.player && Math.hypot(s.player.x - img.x, s.player.y - img.y) < 330;
    c.bubble.setText(near ? text : '…').setPosition(img.x, img.y - img.displayHeight - 10).setFlipX(false);
    s.tweens.add({ targets: c.bubble, alpha: 1, duration: 180 });
    c.timer = s.time.delayedCall(2300, () => {
      if (!this.chat) return;
      s.tweens.add({ targets: this.chat.bubble, alpha: 0, duration: 220 });
      this.chat.speaker = this.chat.speaker === 'man' ? 'woman' : 'man';
      this.chat.timer = s.time.delayedCall(900 + this.rnd() * 1400, () => this.say());
    });
  }

  stopChat() {
    const c = this.chat, s = this.scene;
    if (!c) return;
    c.timer?.remove(false);
    const m = this.man?.img, w = this.woman?.img;
    for (const [img, b] of [[m, c.base.m], [w, c.base.w]]) { if (!img?.scene) continue; s.tweens.killTweensOf(img); img.setScale(b.sx, b.sy).setAngle(b.a); }
    s.tweens.killTweensOf(c.bubble); c.bubble.destroy();
    this.chat = null;
  }
}
