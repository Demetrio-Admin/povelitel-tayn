// Рисование элементов интерфейса на Canvas 2D. Чистые функции без Phaser и DOM:
// их можно отрисовать в Node (tools/ui/preview.mjs) и посмотреть глазами.
// Каждая функция рисует в прямоугольнике (0,0,w,h) в логических px; масштаб (texScale) задаёт вызывающий.
import { UI } from '../config/ui.config.js';

export const css = (n, a = 1) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;

function rng(seed) {                       // mulberry32 — воспроизводимое «дерево»
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function rrPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function goldGrad(ctx, x0, y0, x1, y1, dim = false) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const G = UI.gold;
  if (dim) { g.addColorStop(0, '#b19a6a'); g.addColorStop(0.5, G.dim); g.addColorStop(1, '#5a4a30'); }
  else { g.addColorStop(0, G.hi); g.addColorStop(0.45, G.mid); g.addColorStop(1, G.lo); }
  return g;
}

function woodFill(ctx, w, h, stops, seed, strength = 1) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, stops[0]); g.addColorStop(0.5, stops[1]); g.addColorStop(1, stops[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const rnd = rng(seed);                   // волокна: тонкие волнистые линии
  for (let y = 2; y < h; y += 3 + rnd() * 4) {
    const dark = rnd() < 0.62;
    ctx.strokeStyle = dark ? `rgba(0,0,0,${(0.10 + rnd() * 0.12) * strength})` : `rgba(255,214,150,${(0.035 + rnd() * 0.04) * strength})`;
    ctx.lineWidth = 0.6 + rnd() * 0.9;
    ctx.beginPath(); ctx.moveTo(-4, y);
    const wob = 1 + rnd() * 2.2, ph = rnd() * 6;
    for (let x = 0; x <= w + 8; x += 22) ctx.lineTo(x, y + Math.sin(x / 38 + ph) * wob);
    ctx.stroke();
  }
  for (let i = 0; i < Math.max(1, (w * h) / 22000); i++) {   // тёмные «сучки»
    const x = rnd() * w, y = rnd() * h, r = 4 + rnd() * 7;
    const k = ctx.createRadialGradient(x, y, 0, x, y, r);
    k.addColorStop(0, `rgba(0,0,0,${0.22 * strength})`); k.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = k; ctx.save(); ctx.scale(1, 0.55); ctx.beginPath(); ctx.arc(x, y / 0.55, r, 0, 7); ctx.fill(); ctx.restore();
  }
}

function vignette(ctx, w, h, a = 0.38) {
  const k = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
  k.addColorStop(0, 'rgba(0,0,0,0)'); k.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = k; ctx.fillRect(0, 0, w, h);
}

function diamond(ctx, x, y, rx, ry, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(x, y - ry); ctx.lineTo(x + rx, y); ctx.lineTo(x, y + ry); ctx.lineTo(x - rx, y); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke(); }
}

/** Уголок-завиток: ромб в углу и дуга вдоль краёв. sx/sy = ±1 (направление внутрь). */
function corner(ctx, x, y, sx, sy, k, color, accent) {
  ctx.save(); ctx.translate(x, y); ctx.scale(sx * k, sy * k);
  ctx.strokeStyle = color; ctx.lineWidth = 1.4 / k; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 17); ctx.quadraticCurveTo(0, 4, 4, 4); ctx.quadraticCurveTo(4, 0, 17, 0); ctx.stroke();
  diamond(ctx, 5.5, 5.5, 3.2, 3.2, accent || color, 'rgba(0,0,0,0.35)');
  ctx.restore();
}

/** Панель: тёмное дерево, золотая рамка, уголки. variant: 'wood' | 'dark' | 'inset'. */
export function paintPanel(ctx, w, h, o = {}) {
  const { accent = null, radius = UI.radius, variant = 'wood', seed = 7, alpha = 0.95, ornaments = true } = o;
  if (variant === 'inset') return paintInset(ctx, w, h, o);
  const stops = variant === 'dark' ? UI.wood.dark : UI.wood.mid;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
  rrPath(ctx, 0, 0, w, h, radius); ctx.fillStyle = '#150d08'; ctx.fill();
  ctx.restore();

  ctx.save(); rrPath(ctx, 0, 0, w, h, radius); ctx.clip();
  ctx.globalAlpha = alpha; woodFill(ctx, w, h, stops, seed); ctx.globalAlpha = 1;
  vignette(ctx, w, h, 0.42);
  const hl = ctx.createLinearGradient(0, 0, 0, 22);
  hl.addColorStop(0, 'rgba(255,225,170,0.16)'); hl.addColorStop(1, 'rgba(255,225,170,0)');
  ctx.fillStyle = hl; ctx.fillRect(0, 0, w, 22);
  ctx.restore();

  const F = UI.frame;
  rrPath(ctx, F / 2, F / 2, w - F, h - F, radius - 1);
  ctx.lineWidth = F; ctx.strokeStyle = goldGrad(ctx, 0, 0, w * 0.6, h); ctx.stroke();
  rrPath(ctx, F / 2 + 1, F / 2 + 1, w - F - 2, h - F - 2, radius - 2);
  ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
  const m = UI.hairline;
  rrPath(ctx, m, m, w - 2 * m, h - 2 * m, Math.max(2, radius - 6));
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(217,180,90,0.34)'; ctx.stroke();

  if (ornaments && w > 90 && h > 60) {
    const c = 'rgba(232,197,106,0.9)', a = accent != null ? css(accent, 1) : null;
    corner(ctx, m - 1, m - 1, 1, 1, 1.12, c, a);
    corner(ctx, w - m + 1, h - m + 1, -1, -1, 1.12, c, a);
    corner(ctx, w - m + 1, m - 1, -1, 1, 0.9, c, a);
    corner(ctx, m - 1, h - m + 1, 1, -1, 0.9, c, a);
  }
  if (accent != null) {                    // цветная метка школы магии вдоль верхней кромки
    const g = ctx.createLinearGradient(w * 0.3, 0, w * 0.7, 0);
    g.addColorStop(0, css(accent, 0)); g.addColorStop(0.5, css(accent, 0.95)); g.addColorStop(1, css(accent, 0));
    ctx.fillStyle = g; ctx.fillRect(w * 0.3, F + 1, w * 0.4, 2);
  }
}

function paintInset(ctx, w, h, o = {}) {
  const r = o.radius ?? 10;
  ctx.save(); rrPath(ctx, 0, 0, w, h, r); ctx.clip();
  ctx.fillStyle = 'rgba(8,5,3,0.5)'; ctx.fillRect(0, 0, w, h);
  const sh = ctx.createLinearGradient(0, 0, 0, 14);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, w, 14);
  ctx.restore();
  rrPath(ctx, 0.5, 0.5, w - 1, h - 1, r);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(217,180,90,0.28)'; ctx.stroke();
}

/** Кнопка: деревянная плашка с золотой кромкой. primary — светлее и с ромбиками по бокам. */
export function paintButton(ctx, w, h, o = {}) {
  const { primary = false, accent = null, pressed = false, radius = UI.radiusButton, seed = 11 } = o;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = pressed ? 1 : 3;
  rrPath(ctx, 0, 0, w, h, radius); ctx.fillStyle = '#120a06'; ctx.fill();
  ctx.restore();
  ctx.save(); rrPath(ctx, 0, 0, w, h, radius); ctx.clip();
  const stops = primary ? ['#6a4a2b', '#4b3320', '#33220f'] : ['#3d2c1f', '#2c1f15', '#1f150e'];
  woodFill(ctx, w, h, stops, seed, 0.8);
  if (pressed) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, w, h); }
  const hl = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  hl.addColorStop(0, `rgba(255,225,170,${primary ? 0.26 : 0.14})`); hl.addColorStop(1, 'rgba(255,225,170,0)');
  ctx.fillStyle = hl; ctx.fillRect(0, 0, w, h * 0.5);
  const lo = ctx.createLinearGradient(0, h * 0.7, 0, h);
  lo.addColorStop(0, 'rgba(0,0,0,0)'); lo.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = lo; ctx.fillRect(0, h * 0.7, w, h * 0.3);
  ctx.restore();
  rrPath(ctx, 1.25, 1.25, w - 2.5, h - 2.5, radius - 1);
  ctx.lineWidth = 2.5; ctx.strokeStyle = goldGrad(ctx, 0, 0, w * 0.5, h, !primary); ctx.stroke();
  rrPath(ctx, 4.5, 4.5, w - 9, h - 9, Math.max(2, radius - 4));
  ctx.lineWidth = 0.8; ctx.strokeStyle = primary ? 'rgba(246,227,161,0.38)' : 'rgba(217,180,90,0.2)'; ctx.stroke();
  if (primary && w > 120) {
    const c = accent != null ? css(accent, 1) : '#e8c56a';
    diamond(ctx, 15, h / 2, 4, 5, c, 'rgba(0,0,0,0.4)');
    diamond(ctx, w - 15, h / 2, 4, 5, c, 'rgba(0,0,0,0.4)');
  }
}

/** Круглая кнопка-«жемчужина» (способности, действие, пауза). accent — цвет магии. Полотно size×size. */
export function paintOrb(ctx, size, o = {}) {
  const { accent = 0xd9b45a, locked = false, gem = true } = o;
  const pad = 6, R = size / 2 - pad, cx = size / 2, cy = size / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fillStyle = '#100905'; ctx.fill();
  ctx.restore();
  const disc = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R);
  disc.addColorStop(0, locked ? '#34291f' : '#4d3626'); disc.addColorStop(0.7, '#1f150d'); disc.addColorStop(1, '#0d0806');
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fillStyle = disc; ctx.fill();
  const rw = Math.max(3, R * 0.085);
  ctx.beginPath(); ctx.arc(cx, cy, R - rw / 2, 0, 7);
  ctx.lineWidth = rw; ctx.strokeStyle = goldGrad(ctx, cx - R, cy - R, cx + R, cy + R, locked); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R - rw - 0.5, 0, 7); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
  ctx.fillStyle = 'rgba(40,24,8,0.55)';
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (R - rw / 2), cy + Math.sin(a) * (R - rw / 2), Math.max(0.7, rw * 0.16), 0, 7); ctx.fill(); }
  const ar = R - rw - Math.max(5, R * 0.1);
  ctx.beginPath(); ctx.arc(cx, cy, ar, 0, 7);
  ctx.lineWidth = Math.max(1.6, R * 0.04); ctx.strokeStyle = locked ? 'rgba(120,120,120,0.45)' : css(accent, 0.92); ctx.stroke();
  if (!locked) {
    const gl = ctx.createRadialGradient(cx, cy, ar * 0.55, cx, cy, ar);
    gl.addColorStop(0, css(accent, 0)); gl.addColorStop(1, css(accent, 0.2));
    ctx.beginPath(); ctx.arc(cx, cy, ar, 0, 7); ctx.fillStyle = gl; ctx.fill();
  }
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R - rw - 1, 0, 7); ctx.clip();
  const hl = ctx.createLinearGradient(0, cy - R, 0, cy);
  hl.addColorStop(0, 'rgba(255,235,190,0.16)'); hl.addColorStop(1, 'rgba(255,235,190,0)');
  ctx.fillStyle = hl; ctx.fillRect(0, 0, size, cy); ctx.restore();
  if (gem && R > 24) {
    const gy = cy - R + rw / 2;
    diamond(ctx, cx, gy, R * 0.085, R * 0.11, locked ? '#6b6258' : css(accent, 1), 'rgba(0,0,0,0.5)');
    if (!locked) diamond(ctx, cx - R * 0.02, gy - R * 0.03, R * 0.025, R * 0.04, 'rgba(255,255,255,0.7)');
  }
}

/** Жёлоб полосы здоровья/маны. */
export function paintBarTrough(ctx, w, h) {
  const r = h / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
  rrPath(ctx, 0, 0, w, h, r); ctx.fillStyle = '#0a0604'; ctx.fill();
  ctx.restore();
  ctx.save(); rrPath(ctx, 0, 0, w, h, r); ctx.clip();
  const sh = ctx.createLinearGradient(0, 0, 0, h);
  sh.addColorStop(0, 'rgba(0,0,0,0.75)'); sh.addColorStop(0.5, 'rgba(20,12,6,0.55)'); sh.addColorStop(1, 'rgba(60,40,20,0.35)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
  ctx.restore();
  rrPath(ctx, 1, 1, w - 2, h - 2, r - 1); ctx.lineWidth = 2; ctx.strokeStyle = goldGrad(ctx, 0, 0, w, h, false); ctx.stroke();
}

/** Заливка полосы (рисуется целиком, в игре обрезается по доле). kind: hp | mana | xp | danger. */
export function paintBarFill(ctx, w, h, kind = 'hp') {
  const [hi, lo] = UI.barGradient[kind] || UI.barGradient.hp;
  ctx.save(); rrPath(ctx, 0, 0, w, h, h / 2); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, hi); g.addColorStop(1, lo);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const gl = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,0.38)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(0, 0, w, h * 0.55);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, h - 2, w, 2);
  ctx.restore();
}

/** Нижняя панель: планка с золотой кромкой сверху и ромбиками-маркерами. lift — «дымка» над планкой. */
export function paintBottomBar(ctx, w, h, marks = [], lift = 22) {
  const fog = ctx.createLinearGradient(0, 0, 0, lift);
  fog.addColorStop(0, 'rgba(8,5,3,0)'); fog.addColorStop(1, 'rgba(8,5,3,0.55)');
  ctx.fillStyle = fog; ctx.fillRect(0, 0, w, lift);
  ctx.save(); ctx.translate(0, lift); const bh = h - lift;
  ctx.beginPath(); ctx.rect(0, 0, w, bh); ctx.clip();
  woodFill(ctx, w, bh, UI.wood.mid, 21);
  vignette(ctx, w, bh, 0.4);
  const hl = ctx.createLinearGradient(0, 0, 0, 24);
  hl.addColorStop(0, 'rgba(255,225,170,0.2)'); hl.addColorStop(1, 'rgba(255,225,170,0)');
  ctx.fillStyle = hl; ctx.fillRect(0, 0, w, 24);
  ctx.fillStyle = goldGrad(ctx, 0, 0, w, 0); ctx.fillRect(0, 0, w, 3.5);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 3.5, w, 1.2);
  ctx.fillStyle = 'rgba(217,180,90,0.45)'; ctx.fillRect(0, 9, w, 1);
  for (const x of marks) diamond(ctx, x, 9.5, 5, 6, '#e8c56a', 'rgba(0,0,0,0.45)');
  ctx.restore();
}

/** Орнаментальный разделитель: линии с ромбом (под заголовками). Высота полотна 14. */
export function paintDivider(ctx, w, accent = 0xd9b45a) {
  const cy = 7;
  for (const s of [-1, 1]) {
    const x0 = w / 2 + s * 14, x1 = s < 0 ? 0 : w;
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(217,180,90,0.95)'); g.addColorStop(1, 'rgba(217,180,90,0)');
    ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), cy - 0.75, Math.abs(x1 - x0), 1.5);
    diamond(ctx, w / 2 + s * 22, cy, 2.2, 2.2, 'rgba(232,197,106,0.9)');
  }
  diamond(ctx, w / 2, cy, 6, 7, css(accent, 1), 'rgba(0,0,0,0.5)');
  diamond(ctx, w / 2 - 1, cy - 1.5, 1.8, 2.6, 'rgba(255,255,255,0.65)');
}

/** Лунный серп с мягким свечением. Полотно size×size. */
export function paintCrescent(ctx, size, color = 0xe8c56a) {
  const c = size / 2, R = size * 0.34;
  ctx.save();
  ctx.shadowColor = css(color, 0.8); ctx.shadowBlur = size * 0.16;
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.arc(c + R * 0.42, c - R * 0.18, R * 0.86, 0, Math.PI * 2, true);
  ctx.fillStyle = css(color, 1); ctx.fill('evenodd');
  ctx.restore();
}

/** Медальон героини: портрет в золотом кольце. img — исходное изображение (или null), crop {x,y,w,h}. */
export function paintMedallion(ctx, size, img, crop, accent = 0x4fe3c1) {
  const c = size / 2, R = size / 2 - 5;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  ctx.beginPath(); ctx.arc(c, c, R, 0, 7); ctx.fillStyle = '#100905'; ctx.fill();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(c, c, R - 3, 0, 7); ctx.clip();
  const bg = ctx.createRadialGradient(c, c * 0.8, 2, c, c, R);
  bg.addColorStop(0, '#2c4a46'); bg.addColorStop(1, '#0f1a18');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
  if (img && crop) ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, size, size);
  const vg = ctx.createRadialGradient(c, c, R * 0.55, c, c, R);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, size, size);
  ctx.restore();
  ctx.beginPath(); ctx.arc(c, c, R - 1.5, 0, 7); ctx.lineWidth = 3.5; ctx.strokeStyle = goldGrad(ctx, 0, 0, size, size); ctx.stroke();
  ctx.beginPath(); ctx.arc(c, c, R - 6, 0, 7); ctx.lineWidth = 1; ctx.strokeStyle = css(accent, 0.7); ctx.stroke();
}

/** Мягкое затемнение по краям экрана (виньетка). */
export function paintScreenVignette(ctx, w, h, a = 0.5) {
  const k = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  k.addColorStop(0, 'rgba(6,4,2,0)'); k.addColorStop(1, `rgba(6,4,2,${a})`);
  ctx.fillStyle = k; ctx.fillRect(0, 0, w, h);
}
