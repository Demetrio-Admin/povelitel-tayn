import { DEPTH } from '../config/game.config.js';
import { DISPLAY_SIZE } from '../config/assets.manifest.js';

// v0.40 — спутник героя (Стеклянная малиновка / Лисёнок рощи, docs/design/post-chapter-3-progression-v0.1.md §6). Только косметика:
// не участвует в физике, бою и серверных операциях. Идёт за героем с небольшим отставанием, чуть подпрыгивает при ходьбе,
// разворачивается по направлению. Кто идёт за героем — косметический выбор этого устройства (localStorage): сервер о нём не знает,
// а применяется он, только если предмет-спутник у героя есть.
const PREF_KEY = 'povelitel.companion';
let preferenceStorage;
export function setCompanionStorage(storage) { preferenceStorage = storage; }
const storage = () => preferenceStorage === undefined ? globalThis.localStorage : preferenceStorage;
export function getCompanionPref() { try { return storage()?.getItem(PREF_KEY) || null; } catch { return null; } }
export function setCompanionPref(id) {
  try { if (id && COMPANIONS[id]) storage()?.setItem(PREF_KEY, id); else storage()?.removeItem(PREF_KEY); } catch { /* без хранилища выбор просто не запомнится */ }
}
export const COMPANIONS = {
  robin: { texture: 'companion_robin', item: 'companion_robin', lag: 54, speed: 330, hop: 5 },
  fox: { texture: 'companion_fox', item: 'companion_fox', lag: 70, speed: 300, hop: 3 },
};
const TELEPORT_DIST = 520;   // после перехода между частями мира — сразу рядом, а не через всю карту

/** Какой спутник должен идти за героем: сохранённый выбор, если предмет есть; иначе никто. */
export function activeCompanion(state) {
  const id = getCompanionPref();
  const def = id && COMPANIONS[id];
  return def && state.item(def.item) > 0 ? id : null;
}

export class Companion {
  constructor(scene, player, id) {
    this.scene = scene; this.player = player; this.id = id; this.def = COMPANIONS[id];
    const p = player.sprite;
    this.x = p.x - this.def.lag; this.y = p.y + 4;
    this.shadow = scene.add.image(this.x, this.y, 'hero_shadow').setDepth(DEPTH.path + 1).setAlpha(0.6);
    this.shadow.setDisplaySize(30, 10);
    this.view = scene.add.image(this.x, this.y, this.def.texture).setOrigin(0.5, 1);
    const [w, h] = DISPLAY_SIZE[this.def.texture] || [this.view.width, this.view.height];
    this.view.setDisplaySize(w, h);
    this.baseScale = { x: this.view.scaleX, y: this.view.scaleY };
    this.t = 0; this.faceLeft = false;
  }

  update(dt) {
    const p = this.player.sprite, d = this.def;
    let dx = p.x - this.x, dy = (p.y + 4) - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > TELEPORT_DIST) { this.x = p.x - d.lag; this.y = p.y + 4; dx = p.x - this.x; dy = p.y + 4 - this.y; }
    const want = Math.max(0, Math.hypot(dx, dy) - d.lag);   // держимся на расстоянии lag от героя
    const step = Math.min(want, d.speed * dt);
    const len = Math.hypot(dx, dy) || 1;
    this.x += dx / len * step; this.y += dy / len * step;
    const moving = step > 0.5;
    this.t += dt * (moving ? 14 : 2);
    const hop = moving ? Math.abs(Math.sin(this.t)) * d.hop : Math.sin(this.t) * 0.6;
    if (Math.abs(dx) > 4) this.faceLeft = dx < 0;   // по ходу смотрим вперёд, стоя — на героя
    this.view.setPosition(this.x, this.y - hop);
    this.view.setScale(this.faceLeft ? -this.baseScale.x : this.baseScale.x, this.baseScale.y);
    this.view.setDepth(DEPTH.mainBase + this.y);
    this.shadow.setPosition(this.x, this.y - 1);
  }

  destroy() { this.view?.destroy(); this.shadow?.destroy(); }
}
