// Layout of the experimental mobile adventure HUD (camera-test only).
// Pure data and helpers without Phaser, so Node tests can verify the geometry the scene draws.
// Units are logical pixels of the 720×1280 reference frame; top items anchor to the top edge,
// bottom items to the bottom edge, exactly as in UIScene.
import { VIEW } from '../config/game.config.js';

export const HUD = {
  minTouch: 44,            // CSS px: smallest comfortable touch target
  topH: 128,               // bottom edge of the permanent top zone
  fieldTop: 236,           // first transient notice sits below the HUD and the comparison pill
  vignette: 0.4,           // lighter edges than the classic HUD so the map stays readable
  shade: { top: 0.5, topH: 176, bottom: 0.32, bottomH: 188 },
  portrait: { x: 66, y: 66, size: 104, hit: 112, ring: 55, ringWidth: 5 },
  left: 138,               // left edge of the level label and the bars' icons
  rowY: 31,                // level and resources row
  gap: 26,                 // space between the level and resource groups
  res: { icon: 38, font: 30, level: 32 },
  bars: { iconX: 156, icon: 36, x: 172, right: 522, hp: { y: 74, h: 30 }, mana: { y: 108, h: 26 }, font: 24 },
  top: { orb: 80, icon: 54, hit: 100, journal: { x: 568, y: 64 }, menu: { x: 668, y: 64 } },
  bar: {                   // «Магия» and «Сумка»
    y: 1208, h: 88, hit: 104, w: 328, margin: 20, gap: 24,
    medallion: 112, icon: 76, font: 36, deadY: 1146,
  },
  tray: { scale: 0.82, label: 30, x: 3, y: 105, plate: { x: 19, y: 1084, w: 680, h: 178 } },   // production dock row, scaled
  ctx: { x: 648, y: 978 },
};

// Extra camera room (screen px) past a painted room without dark bands: keeps the hero clear of the top HUD
// (128 + a hero's height) and of the bottom bar (1280 - 1152).
export const HUD_PAD = { top: 260, bottom: 110 };

// Edge of the ordinary dock row used in combat (UI.dock.centers); the tray is that same row, scaled.
export const DOCK_ROW = { buttonY: 1164, centers: [104, 274, 444, 614] };

export const barCenters = () => [
  HUD.bar.margin + HUD.bar.w / 2,
  VIEW.width - HUD.bar.margin - HUD.bar.w / 2,
];

/** CSS pixels per logical pixel for a canvas of displayWidth CSS px showing gameWidth logical px. */
export const cssPerUnit = (displayWidth, gameWidth) => (gameWidth > 0 ? displayWidth / gameWidth : 1);

/** Interactive size (logical px) that stays at least minTouch CSS px on narrow phones; `cap` avoids overlapping neighbours. */
export function touchSize(scale, base, cap = Infinity) {
  const need = Math.ceil(HUD.minTouch / Math.max(0.1, scale));
  return Math.min(cap, Math.max(base, need));
}

/** Compact number for the resource row: 12 345 → 12345, 123 456 → 123к, 1 234 567 → 1,2М. */
export function shortNumber(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n < 100000) return String(n);
  if (n < 1000000) return `${Math.floor(n / 1000)}к`;
  return `${(n / 1000000).toFixed(1).replace('.', ',')}М`;
}

const rect = (x, y, w, h) => ({ x, y, w, h });
const centered = (cx, cy, w, h) => rect(cx - w / 2, cy - h / 2, w, h);

/** Rectangles of the permanent top HUD (no text widths: those are measured by the scene). */
export function topRects() {
  const P = HUD.portrait, B = HUD.bars, T = HUD.top;
  return {
    portrait: centered(P.x, P.y, P.size, P.size),
    hp: rect(B.x, B.hp.y - B.hp.h / 2, B.right - B.x, B.hp.h),
    mana: rect(B.x, B.mana.y - B.mana.h / 2, B.right - B.x, B.mana.h),
    journal: centered(T.journal.x, T.journal.y, T.orb, T.orb),
    menu: centered(T.menu.x, T.menu.y, T.orb, T.orb),
  };
}

/** Rectangles of the always-visible bottom bar. */
export function bottomRects() {
  const [magicX, bagX] = barCenters(), { y, h, w } = HUD.bar;
  return { magic: centered(magicX, y, w, h), bag: centered(bagX, y, w, h) };
}

export const overlaps = (a, b, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
