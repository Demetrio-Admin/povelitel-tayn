// Виджеты интерфейса поверх Phaser: текстуры рисуются painters (uiPaint.js) на Canvas 2D,
// затем используются как обычные картинки. Модуль не импортирует Phaser, поэтому его логику
// можно проверить в Node на фейковой сцене (tests/run-tests.js).
import { UI } from '../config/ui.config.js';
import { currentHero } from '../state/hero.js';
import * as P from './uiPaint.js';

const S = UI.texScale;

/** Фабрика полотен. В браузере — <canvas>; тесты и превью подменяют её (createCanvas из @napi-rs/canvas). */
export const env = {
  createCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
};

const accKey = a => (a == null ? 'n' : a.toString(16));

/**
 * Создаёт текстуру `key` один раз. draw(ctx, w, h) рисует в логических px; вокруг оставлен запас pad под тень.
 * Возвращает key.
 */
export function ensureTexture(scene, key, w, h, draw, pad = UI.pad) {
  const tm = scene.textures;
  if (tm.exists(key)) return key;
  const cv = env.createCanvas(Math.max(1, Math.ceil((w + pad * 2) * S)), Math.max(1, Math.ceil((h + pad * 2) * S)));
  const ctx = cv.getContext('2d');
  ctx.scale(S, S);
  ctx.translate(pad, pad);
  draw(ctx, w, h);
  tm.addCanvas(key, cv);
  return key;
}

/** Удалить временную текстуру (модальные окна разного размера не должны копиться в памяти). */
export function releaseTexture(scene, key) {
  if (key && scene.textures.exists(key)) scene.textures.remove(key);
}

/** Картинка с текстурой, подогнанной так, чтобы прямоугольник (x,y,w,h) совпал с телом панели (запас pad — тень). */
function placeTopLeft(scene, key, x, y, w, h, pad) {
  const img = scene.add.image(x - pad, y - pad, key).setOrigin(0, 0);
  img.setDisplaySize(w + pad * 2, h + pad * 2);
  img.texKey = key;
  return img;
}

/** Панель по прямоугольнику (x, y — левый верх). o: variant, accent, seed, temp (не кэшировать — освободить вручную). */
export function addPanel(scene, x, y, w, h, o = {}) {
  const key = `ui:panel:${o.variant || 'wood'}:${accKey(o.accent)}:${o.seed ?? 7}:${w}x${h}`;
  const pad = o.variant === 'inset' ? 2 : UI.pad;
  ensureTexture(scene, key, w, h, (ctx) => P.paintPanel(ctx, w, h, o), pad);
  return placeTopLeft(scene, key, x, y, w, h, pad);
}

/** Орнаментальный разделитель по центру (cx, y). */
export function addDivider(scene, cx, y, w, accent = 0xd9b45a) {
  const key = `ui:div:${w}:${accKey(accent)}`;
  ensureTexture(scene, key, w, 14, (ctx) => P.paintDivider(ctx, w, accent), 0);
  const img = scene.add.image(cx, y, key).setOrigin(0.5, 0.5);
  img.setDisplaySize(w, 14);
  return img;
}

/** Текстура кнопки-«жемчужины». */
export function orbKey(scene, accent, size, locked = false, gem = true) {
  const key = `ui:orb:${accKey(accent)}:${size}:${locked ? 'L' : 'U'}${gem ? 'g' : ''}`;
  return ensureTexture(scene, key, size, size, (ctx) => P.paintOrb(ctx, size, { accent, locked, gem }), 0);
}

/** Картинка-«жемчужина» с центром в (x, y); диаметр холста size (тело на 12 px меньше). */
export function addOrb(scene, x, y, size, accent, o = {}) {
  const img = scene.add.image(x, y, orbKey(scene, accent, size, !!o.locked, o.gem !== false));
  img.setDisplaySize(size, size);
  return img;
}

/**
 * Меняет вид орба (locked / цвет) без пересоздания картинки. Безопасно вызывать каждый кадр:
 * размер выставляется только при смене текстуры, поэтому анимация «нажатия» (твин scale) не перебивается.
 */
export function setOrb(img, scene, accent, size, locked, gem = true) {
  const key = orbKey(scene, accent, size, locked, gem);
  if (img.texture?.key === key) return;
  img.setTexture(key);
  img.setDisplaySize(size, size);
}

/** Нижняя панель на всю ширину. barY — верхняя кромка планки; lift — «дымка» над ней. */
export function addBottomBar(scene, barY, w, h, marks, lift = 22) {
  const key = `ui:bar:${w}x${h}:${marks.join(',')}`;
  ensureTexture(scene, key, w, h + lift, (ctx) => P.paintBottomBar(ctx, w, h + lift, marks, lift), 0);
  return scene.add.image(0, barY - lift, key).setOrigin(0, 0).setDisplaySize(w, h + lift);
}

/** Затемнение по краям экрана (во весь экран). */
export function addScreenVignette(scene, w, h, a = 0.5) {
  const key = `ui:vignette:${a}`;
  ensureTexture(scene, key, w / 2, h / 2, (ctx, tw, th) => P.paintScreenVignette(ctx, tw, th, a), 0);
  return scene.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(w, h);
}

/** Лунный серп. */
export function addCrescent(scene, x, y, size, color = 0xe8c56a) {
  const key = `ui:moon:${size}:${accKey(color)}`;
  ensureTexture(scene, key, size, size, (ctx) => P.paintCrescent(ctx, size, color), 0);
  return scene.add.image(x, y, key).setDisplaySize(size, size);
}

/**
 * Медальон героя: портрет (кадр «голова и плечи» из переднего ракурса) в золотом кольце.
 * v0.9.2: texture — ракурс выбранного героя (по умолчанию текущий герой); он входит в ключ кэша, поэтому после входа
 * в другой аккаунт или выбора другого героя не достаётся уже нарисованный медальон прежнего героя.
 */
export function addMedallion(scene, x, y, size, accent = 0x4fe3c1, texture = currentHero().textures.down) {
  const key = `ui:medal:${texture}:${size}:${accKey(accent)}`;
  ensureTexture(scene, key, size, size, (ctx) => {
    let img = null, crop = null;
    try {
      img = scene.textures.get(texture).getSourceImage();
      const sw = img.width, sh = img.height, side = Math.min(sw, sh * 0.5);
      crop = { x: (sw - side) / 2, y: sh * 0.02, w: side, h: side };   // голова и плечи
    } catch (e) { img = null; }
    P.paintMedallion(ctx, size, img, crop, accent);
  }, 0);
  return scene.add.image(x, y, key).setDisplaySize(size, size);
}

/**
 * Полоса здоровья/маны/опыта. (x, y) — левый край и вертикальный центр. width — полная ширина жёлоба.
 * setFraction(0…1) обрезает заливку; setDepth / setVisible применяются ко всем частям.
 */
export class UIBar {
  constructor(scene, x, y, w, h, kind = 'hp', depth = null) {
    this.scene = scene; this.w = w; this.h = h; this.kind = kind;
    this.inner = { w: w - 4, h: h - 4 };
    this.fullWidth = this.inner.w;
    const tk = `ui:trough:${w}x${h}`;
    ensureTexture(scene, tk, w, h, (ctx) => P.paintBarTrough(ctx, w, h), 4);
    this.trough = scene.add.image(x - 4, y - h / 2 - 4, tk).setOrigin(0, 0).setDisplaySize(w + 8, h + 8);
    const fk = `ui:fill:${kind}:${this.inner.w}x${this.inner.h}`;
    ensureTexture(scene, fk, this.inner.w, this.inner.h, (ctx) => P.paintBarFill(ctx, this.inner.w, this.inner.h, kind), 0);
    this.fill = scene.add.image(x + 2, y - h / 2 + 2, fk).setOrigin(0, 0).setDisplaySize(this.inner.w, this.inner.h);
    this.frac = 1;
    if (depth != null) this.setDepth(depth);
  }

  setFraction(f) {
    f = Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0;
    this.frac = f;
    if (f <= 0.002) { this.fill.setVisible(false); return this; }
    this.fill.setVisible(this.trough.visible !== false);
    // обрезка — в пикселях текстуры, поэтому берём реальную ширину кадра
    this.fill.setCrop(0, 0, this.fill.width * f, this.fill.height);
    return this;
  }

  /** Совместимость со старым кодом: width = fullWidth × доля. */
  set width(v) { this.setFraction(v / this.fullWidth); }
  get width() { return this.fullWidth * this.frac; }

  setDepth(d) { this.trough.setDepth(d); this.fill.setDepth(d + 0.01); return this; }
  setVisible(v) { this.trough.setVisible(v); this.fill.setVisible(v && this.frac > 0.002); return this; }
  destroy() { this.trough.destroy(); this.fill.destroy(); }
}

/**
 * Деревянная кнопка с подписью. (x, y) — центр. Возвращает { parts, hit, setLabel, setPrimary, destroy }.
 * onPress вызывается по отпусканию (pointerup), как у прежних кнопок меню и окон.
 */
export function addButton(scene, x, y, w, h, label, o = {}) {
  const { primary = false, accent = null, fontSize = UI.type.body, onPress = null, depth = null, sound = null } = o;
  const keyOf = (pr, pressed) => `ui:btn:${pr ? 'P' : 'S'}${pressed ? 'd' : 'u'}:${accKey(accent)}:${w}x${h}`;
  const make = (pr, pressed) => ensureTexture(scene, keyOf(pr, pressed), w, h, (ctx) => P.paintButton(ctx, w, h, { primary: pr, accent, pressed }), UI.pad - 6);
  const pad = UI.pad - 6;
  const bg = scene.add.image(x, y, make(primary, false)).setDisplaySize(w + pad * 2, h + pad * 2);
  const text = scene.add.text(x, y - 1, label, {
    fontFamily: UI.font, fontSize: `${fontSize}px`, color: primary ? '#f6e3a1' : '#f1e3c2', align: 'center',
    wordWrap: { width: Math.max(40, w - 28) }, shadow: UI.shadow,
  }).setOrigin(0.5);
  const hit = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
  let isPrimary = primary, down = false;
  const set = (pressed) => { bg.setTexture(make(isPrimary, pressed)); text.y = y - 1 + (pressed ? 2 : 0); };
  hit.on('pointerdown', () => { down = true; set(true); });
  hit.on('pointerout', () => { if (down) { down = false; set(false); } });
  hit.on('pointerup', () => { if (!down) return; down = false; set(false); if (onPress) onPress(); });
  if (depth != null) { bg.setDepth(depth); text.setDepth(depth + 1); hit.setDepth(depth + 2); }
  return {
    parts: [bg, text, hit], bg, text, hit,
    setLabel: (t) => text.setText(t),
    setPrimary: (v) => { isPrimary = v; text.setColor(v ? '#f6e3a1' : '#f1e3c2'); set(false); },
    destroy: () => { bg.destroy(); text.destroy(); hit.destroy(); },
  };
}

/**
 * Лёгкая плашка на Graphics для тостов, подсказок и предупреждений (текстуры разного размера не копим).
 * g — Graphics, рисует прямоугольник с центром в (0,0), размер w×h.
 */
export function drawPlate(g, w, h, { accent = 0xd9b45a, fill = 0x1a120d, alpha = 0.92, radius = 12 } = {}) {
  g.clear();
  const x = -w / 2, y = -h / 2;
  g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 1, y + 4, w, h, radius);
  g.fillStyle(fill, alpha).fillRoundedRect(x, y, w, h, radius);
  g.fillStyle(0xffe1aa, 0.07).fillRoundedRect(x + 2, y + 2, w - 4, h * 0.45, { tl: radius - 2, tr: radius - 2, bl: 2, br: 2 });
  g.lineStyle(2.5, accent, 0.9).strokeRoundedRect(x, y, w, h, radius);
  g.lineStyle(1, 0xd9b45a, 0.35).strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, Math.max(2, radius - 4));
  const d = (cx, cy) => g.fillStyle(0xe8c56a, 0.95).fillTriangle(cx, cy - 4, cx + 4, cy, cx, cy + 4).fillTriangle(cx, cy - 4, cx - 4, cy, cx, cy + 4);
  d(x + 2, y + 2); d(x + w - 2, y + 2); d(x + 2, y + h - 2); d(x + w - 2, y + h - 2);
  return g;
}
