// Облегчённая заглушка Phaser для стенда интерфейса (tools/ui/render-scenes.mjs).
// Моделирует ровно то, что нужно сценам HUD/меню/боя: объекты с позицией, размером, глубиной, текстом,
// контейнеры, Graphics с командами. Неизвестные методы объектов безвредно возвращают сам объект.
// Это НЕ Phaser: поведение рендера и ввода здесь не проверяется — только раскладка и отсутствие падений.

export const Reg = { measure: null, missingTextures: new Set(), scenes: new Map(), textures: new Map(), unknownCalls: new Map() };
let order = 0;

const noopChain = () => { const f = function () { return p; }; const p = new Proxy(f, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : p), apply: () => p }); return p; };

class Obj {
  constructor(scene, type, props = {}) {
    Object.assign(this, {
      scene, type, x: 0, y: 0, originX: 0.5, originY: 0.5, scaleX: 1, scaleY: 1, alpha: 1, visible: true, depth: 0, angle: 0,
      parent: null, children: type === 'container' ? [] : null, cmds: [], fillCol: 0xffffff, fillAlpha: 1, lineW: 0, lineCol: 0, lineAlpha: 1,
      tintCol: null, tintFill: false, blend: 'NORMAL', crop: null, interactive: false, handlers: {}, destroyed: false,
      frameW: 0, frameH: 0, texKey: null, str: '', style: {}, isTweening: false, _order: order++,
    }, props);
    return new Proxy(this, {
      get: (t, k, r) => {
        if (k in t || typeof k === 'symbol') return Reflect.get(t, k, r);
        if (typeof k === 'string' && !k.startsWith('_')) { Reg.unknownCalls.set(`${t.type}.${k}`, (Reg.unknownCalls.get(`${t.type}.${k}`) || 0) + 1); return (...a) => r; }
        return undefined;
      },
    });
  }
  get width() { return this.type === 'text' ? this.measureText().w : this.frameW; }
  set width(v) { this.frameW = v; }
  set height(v) { this.frameH = v; }
  get height() { return this.type === 'text' ? this.measureText().h : this.frameH; }
  get texture() { return { key: this.texKey, getSourceImage: () => Reg.textures.get(this.texKey) }; }
  get displayWidth() { return this.width * this.scaleX; }
  get displayHeight() { return this.height * this.scaleY; }
  get text() { return this.str; }
  measureText() { return Reg.measure ? Reg.measure(this) : { w: this.str.length * 10, h: 24, lines: [this.str], lh: 24 }; }
  setPosition(x, y = x) { this.x = x; this.y = y; return this; }
  setX(x) { this.x = x; return this; } setY(y) { this.y = y; return this; }
  setOrigin(x, y = x) { this.originX = x; this.originY = y; return this; }
  setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setDisplaySize(w, h) { this.scaleX = w / (this.width || 1); this.scaleY = h / (this.height || 1); return this; }
  setSize(w, h) { this.frameW = w; this.frameH = h; return this; }
  setAlpha(a) { this.alpha = a; return this; }
  setVisible(v) { this.visible = v; return this; }
  setDepth(d) { this.depth = d; return this; }
  setAngle(a) { this.angle = a; return this; }
  setText(t) { this.str = String(t); return this; }
  setColor(c) { this.style = { ...this.style, color: c }; return this; }
  setTint(c) { this.tintCol = c; this.tintFill = false; return this; }
  setTintFill(c) { this.tintCol = c; this.tintFill = true; return this; }
  clearTint() { this.tintCol = null; return this; }
  setBlendMode(b) { this.blend = b; return this; }
  setCrop(x, y, w, h) { this.crop = { x, y, w, h }; return this; }
  setTexture(k) { this.texKey = k; const img = Reg.textures.get(k); if (img) { this.frameW = img.width; this.frameH = img.height; } else Reg.missingTextures.add(k); return this; }
  setStrokeStyle(w, c, a = 1) { this.lineW = w; this.lineCol = c; this.lineAlpha = a; return this; }
  setFillStyle(c, a = 1) { this.fillCol = c; this.fillAlpha = a; return this; }
  setInteractive() { this.interactive = true; return this; }
  disableInteractive() { this.interactive = false; return this; }
  setScrollFactor() { return this; }
  setFlipX() { return this; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  once(ev, fn) { return this.on(ev, fn); }
  off() { return this; }
  emit(ev, ...a) { (this.handlers[ev] || []).forEach(f => f(...a)); return this; }
  // контейнер
  add(list) {
    for (const o of [].concat(list)) { o.parent?.children && (o.parent.children = o.parent.children.filter(c => c !== o)); this.scene._list = this.scene._list.filter(c => c !== o); o.parent = this; this.children.push(o); }
    return this;
  }
  removeAll() { this.children = []; return this; }
  // Graphics
  _rec(n, a) { this.cmds.push([n, a, this.fillCol, this.fillAlpha, this.lineW, this.lineCol, this.lineAlpha]); return this; }
  clear() { this.cmds = []; return this; }
  fillStyle(c, a = 1) { this.fillCol = c; this.fillAlpha = a; return this; }
  lineStyle(w, c, a = 1) { this.lineW = w; this.lineCol = c; this.lineAlpha = a; return this; }
  fillRect(...a) { return this._rec('fillRect', a); } fillRoundedRect(...a) { return this._rec('fillRoundedRect', a); }
  strokeRoundedRect(...a) { return this._rec('strokeRoundedRect', a); } fillCircle(...a) { return this._rec('fillCircle', a); }
  strokeCircle(...a) { return this._rec('strokeCircle', a); } fillTriangle(...a) { return this._rec('fillTriangle', a); }
  strokeTriangle(...a) { return this._rec('strokeTriangle', a); } lineBetween(...a) { return this._rec('lineBetween', a); }
  fillEllipse(...a) { return this._rec('fillEllipse', a); } strokeRect(...a) { return this._rec('strokeRect', a); }
  slice() { return this; } fillPath() { return this; } beginPath() { return this; } closePath() { return this; }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this);
    this.scene._list = this.scene._list.filter(c => c !== this);
    (this.children || []).slice().forEach(c => c.destroy());
  }
}

function mkFactory(scene) {
  const mk = (type, props) => { const o = new Obj(scene, type, props); scene._list.push(o); return o; };
  return {
    image: (x, y, key) => { const o = mk('image', { x, y }); o.setTexture(key); return o; },
    text: (x, y, str, style = {}) => mk('text', { x, y, str: String(str), style, originX: 0, originY: 0 }),
    rectangle: (x, y, w = 1, h = 1, c = 0xffffff, a = 1) => mk('rect', { x, y, frameW: w, frameH: h, fillCol: c, fillAlpha: a }),
    circle: (x, y, r = 1, c = 0xffffff, a = 1) => mk('circle', { x, y, frameW: r * 2, frameH: r * 2, fillCol: c, fillAlpha: a }),
    ellipse: (x, y, w = 1, h = 1, c = 0xffffff, a = 1) => mk('ellipse', { x, y, frameW: w, frameH: h, fillCol: c, fillAlpha: a }),
    container: (x = 0, y = 0, kids = []) => { const o = mk('container', { x, y, originX: 0, originY: 0 }); if (kids.length) o.add(kids); return o; },
    graphics: () => mk('graphics', { originX: 0, originY: 0 }),
    zone: (x, y, w, h) => mk('zone', { x, y, frameW: w, frameH: h }),
    particles: (x, y) => mk('particles', { x, y, visible: false }),
    existing: (o) => o,
  };
}

function applyTween(cfg) {
  const targets = [].concat(cfg.targets || []);
  const skip = new Set(['targets', 'duration', 'yoyo', 'repeat', 'delay', 'hold', 'ease', 'onComplete', 'onUpdate', 'repeatDelay', 'callbackScope']);
  if (!cfg.yoyo && !cfg.repeat) {
    for (const t of targets) for (const [k, v] of Object.entries(cfg)) {
      if (skip.has(k) || !(k in t)) continue;
      const to = v && typeof v === 'object' ? v.to : v;
      if (typeof to === 'number') t[k] = to;
    }
  }
  if (cfg.onComplete && !cfg.repeat && !cfg.yoyo) cfg.onComplete();
}

class FakeScene {
  constructor(key) {
    this.key = key; this._list = []; this._timers = []; this._reg = new Map();
    this.add = mkFactory(this); this.make = { graphics: () => this.add.graphics() };
    this.textures = {
      exists: k => Reg.textures.has(k), get: k => ({ key: k, getSourceImage: () => Reg.textures.get(k) }),
      addCanvas: (k, cv) => { Reg.textures.set(k, cv); }, remove: k => { Reg.textures.delete(k); },
    };
    this.tweens = { add: (cfg) => { applyTween(cfg); return noopChain(); }, killTweensOf: () => {}, addCounter: () => noopChain() };
    this.time = { now: 5000, delayedCall: (ms, fn) => { this._timers.push({ ms, fn }); return noopChain(); }, addEvent: () => noopChain() };
    this.input = { on() {}, off() {}, once() {}, keyboard: { on() {}, off() {}, addKeys: (d) => Object.fromEntries(Object.keys(d).map(k => [k, { isDown: false }])), addCapture() {}, addKey: () => ({ isDown: false }) }, activePointer: { x: 0, y: 0 }, setDefaultCursor() {} };
    this.registry = { get: k => this._reg.get(k), set: (k, v) => { this._reg.set(k, v); }, remove: k => this._reg.delete(k) };
    this.events = { on() {}, once() {}, off() {}, emit() {} };
    this.cameras = { main: noopChain() };
    this.scale = { width: 720, height: 1280 };
    this.game = { loop: { delta: 16 }, canvas: { width: 720, height: 1280 } };
    this.physics = noopChain();
    this.sound = noopChain();
    this.sys = noopChain();
    this.scene = { get: (k) => Reg.scenes.get(k), start() {}, launch() {}, stop() {}, isActive: () => true, pause() {}, resume() {}, sleep() {}, wake() {} };
    Reg.scenes.set(key, this);
  }
}

class RandomDataGenerator {
  constructor() { this.s = 12345; }
  frac() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; }
  between(a, b) { return Math.floor(a + this.frac() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.frac() * arr.length)]; }
  realInRange(a, b) { return a + this.frac() * (b - a); }
}

const Phaser = {
  AUTO: 0, Scene: FakeScene,
  Scale: { FIT: 3, CENTER_BOTH: 1 },
  Math: {
    DegToRad: d => (d * Math.PI) / 180, RadToDeg: r => (r * 180) / Math.PI,
    Between: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), FloatBetween: (a, b) => a + Math.random() * (b - a),
    Clamp: (v, a, b) => Math.min(b, Math.max(a, v)), Linear: (a, b, t) => a + (b - a) * t, RandomDataGenerator,
    Distance: { Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) },
  },
  Input: { Keyboard: { KeyCodes: new Proxy({}, { get: (t, k) => String(k) }) } },
  Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: 'camerafadeoutcomplete' } } },
  Geom: { Rectangle: class {}, Circle: class {} },
  Display: { Color: { HexStringToColor: () => ({ color: 0 }) } },
  Utils: { Array: { GetRandom: a => a[0] } },
};
export default Phaser;
