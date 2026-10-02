import Phaser from 'phaser';
import { ASSET_FILES, DISPLAY_SIZE } from '../config/assets.manifest.js';
import { COLORS } from '../config/game.config.js';
import { services } from '../services.js';

// PreloadScene — загружает реальные PNG из манифеста (если указаны) и генерирует
// graybox-заглушки для всех остальных ключей. Логика игры не знает, откуда взялась текстура.
export class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }

  preload() {
    const { width, height } = this.scale;
    const txt = this.add.text(width / 2, height / 2, 'Загрузка…', { fontFamily: 'Georgia, serif', fontSize: '32px', color: COLORS.text }).setOrigin(0.5);
    this.load.on('progress', p => txt.setText(`Загрузка… ${Math.round(p * 100)}%`));
    for (const [key, path] of Object.entries(ASSET_FILES)) if (path) this.load.image(key, path);
  }

  create() {
    for (const [key, draw] of Object.entries(DRAWERS)) {
      if (this.textures.exists(key)) continue;
      const [w, h] = DISPLAY_SIZE[key] || draw.size || [64, 64];
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      draw(g, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    }
    // любые ключи манифеста без отрисовщика — нейтральная заглушка
    for (const key of Object.keys(ASSET_FILES)) {
      if (this.textures.exists(key)) continue;
      const [w, h] = DISPLAY_SIZE[key] || [64, 64];
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x777777).fillRect(0, 0, w, h).lineStyle(2, 0xffffff).strokeRect(1, 1, w - 2, h - 2);
      g.generateTexture(key, w, h);
      g.destroy();
    }
    // ?skipmenu — сразу в игру (автотесты, быстрая проверка); онлайн — только если персонаж уже загружен с сервера
    if (services.skipMenu && (!services.session || services.session.ready)) startGame(this);
    else this.scene.start('MenuScene');
  }
}

/** Запуск игровых сцен (из Preload или из меню). */
export function startGame(scene) {
  scene.scene.start('ExplorationScene');
  if (!services.edit) scene.scene.launch('UIScene');
}

// ---------------------------------------------------------------------------
// Graybox-отрисовщики. (g, w, h) — Graphics и размер текстуры. Pivot объектов — низ по центру.
const sized = (size, fn) => Object.assign(fn, { size });

function tree(canopy, canopy2, trunk = 0x3b2618) {
  return (g, w, h) => {
    g.fillStyle(0x000000, 0.25).fillEllipse(w / 2, h - 8, w * 0.6, 14);
    g.fillStyle(trunk).fillRect(w / 2 - w * 0.07, h * 0.55, w * 0.14, h * 0.45 - 6);
    g.fillStyle(canopy).fillCircle(w * 0.5, h * 0.36, w * 0.36);
    g.fillCircle(w * 0.3, h * 0.48, w * 0.24).fillCircle(w * 0.7, h * 0.48, w * 0.24);
    g.fillStyle(canopy2).fillCircle(w * 0.42, h * 0.28, w * 0.18).fillCircle(w * 0.66, h * 0.38, w * 0.14);
  };
}

function rock(base, light, moss = null) {
  return (g, w, h) => {
    g.fillStyle(0x000000, 0.3).fillEllipse(w / 2, h - 6, w * 0.95, h * 0.25);
    g.fillStyle(base).fillEllipse(w / 2, h * 0.58, w * 0.92, h * 0.8);
    g.fillStyle(light).fillEllipse(w * 0.4, h * 0.42, w * 0.45, h * 0.3);
    if (moss) g.fillStyle(moss).fillEllipse(w * 0.6, h * 0.25, w * 0.4, h * 0.14);
    g.lineStyle(2, 0x222222, 0.6).beginPath().moveTo(w * 0.55, h * 0.3).lineTo(w * 0.62, h * 0.55).lineTo(w * 0.56, h * 0.75).strokePath();
  };
}

function hero(view) {
  return (g, w, h) => {
    const cx = w / 2;
    // мантия
    g.fillStyle(0x3a2347).fillTriangle(cx, h * 0.38, cx - 26, h - 4, cx + 26, h - 4);
    g.fillStyle(0x24152d).fillRect(cx - 26, h - 12, 52, 8);
    // волосы / лицо
    g.fillStyle(0x7a3b1f).fillCircle(cx, h * 0.4, 15);
    if (view === 'down') g.fillStyle(0xf0d2b0).fillCircle(cx, h * 0.41, 11).fillStyle(0x222222).fillCircle(cx - 4, h * 0.41, 1.8).fillCircle(cx + 4, h * 0.41, 1.8);
    if (view === 'side') g.fillStyle(0xf0d2b0).fillCircle(cx + 5, h * 0.41, 9).fillStyle(0x222222).fillCircle(cx + 9, h * 0.41, 1.8);
    // шляпа: поля + конус
    g.fillStyle(0x1f1426).fillEllipse(cx, h * 0.33, 58, 14);
    const tip = view === 'side' ? cx - 14 : cx + 8;
    g.fillTriangle(cx - 17, h * 0.33, cx + 17, h * 0.33, tip, 4);
    g.fillStyle(COLORS.gold).fillRect(cx - 16, h * 0.3, 32, 4);
    // рука с искрой
    g.fillStyle(0xf0d2b0).fillCircle(cx + 20, h * 0.62, 4);
  };
}

function icon(drawFn) { return sized([64, 64], drawFn); }

const DRAWERS = {
  // ---- герой ----
  hero_down: sized([64, 128], hero('down')),
  hero_up: sized([64, 128], hero('up')),
  hero_side: sized([64, 128], hero('side')),
  hero_shadow: sized([64, 20], (g, w, h) => g.fillStyle(0x000000, 0.4).fillEllipse(w / 2, h / 2, w, h)),

  // ---- деревья ----
  tree_autumn_01: tree(0xb5562a, 0xd98a36),
  tree_autumn_02: tree(0xc7782c, 0xe2a548),
  tree_dark_01: tree(0x2c3a26, 0x3d5233),
  tree_dark_02: tree(0x26311f, 0x34452b),
  dead_tree_01: (g, w, h) => {
    g.fillStyle(0x000000, 0.25).fillEllipse(w / 2, h - 6, w * 0.6, 12);
    g.lineStyle(10, 0x4a3a30).beginPath().moveTo(w / 2, h - 6).lineTo(w / 2, h * 0.25).strokePath();
    g.lineStyle(5, 0x4a3a30).beginPath().moveTo(w / 2, h * 0.5).lineTo(w * 0.15, h * 0.2).moveTo(w / 2, h * 0.4).lineTo(w * 0.85, h * 0.12).moveTo(w / 2, h * 0.3).lineTo(w * 0.35, h * 0.05).strokePath();
  },
  birch_01: (g, w, h) => {
    g.fillStyle(0x000000, 0.25).fillEllipse(w / 2, h - 6, w * 0.6, 12);
    g.fillStyle(0xe8e2d0).fillRect(w / 2 - 7, h * 0.35, 14, h * 0.65 - 6);
    g.fillStyle(0x222222); for (let i = 0; i < 6; i++) g.fillRect(w / 2 - 7 + (i % 2) * 6, h * 0.42 + i * 20, 8, 3);
    g.fillStyle(0xd9a93a).fillCircle(w / 2, h * 0.26, w * 0.4).fillStyle(0xeec35a).fillCircle(w * 0.4, h * 0.2, w * 0.2);
  },

  // ---- камни ----
  rock_small_01: sized([56, 40], rock(0x6f6a63, 0x8c867d)),
  rock_medium_01: rock(0x6c675f, 0x8d877d, 0x4f6b3a),
  heavy_boulder_01: (g, w, h) => {
    rock(0x5b5650, 0x777169, 0x4a6636)(g, w, h);
    g.lineStyle(3, COLORS.telekinesis, 0.55).strokeCircle(w / 2, h * 0.55, h * 0.18);
  },

  // ---- растения ----
  bush_01: sized([70, 50], (g, w, h) => { g.fillStyle(0x2f4a28).fillCircle(w * 0.35, h * 0.6, 20).fillCircle(w * 0.65, h * 0.6, 20).fillStyle(0x3f6034).fillCircle(w * 0.5, h * 0.45, 20); }),
  bush_02: sized([70, 50], (g, w, h) => { g.fillStyle(0x6a3a22).fillCircle(w * 0.35, h * 0.6, 20).fillCircle(w * 0.65, h * 0.6, 20).fillStyle(0x8f4f2a).fillCircle(w * 0.5, h * 0.45, 20); }),
  flower_white_01: sized([30, 24], (g) => { g.fillStyle(0x3f6034).fillRect(14, 10, 2, 14); g.fillStyle(0xf3efe2).fillCircle(9, 10, 4).fillCircle(21, 9, 4).fillCircle(15, 5, 4).fillStyle(0xe8c56a).fillCircle(15, 9, 2); }),
  flower_purple_01: sized([30, 24], (g) => { g.fillStyle(0x3f6034).fillRect(14, 10, 2, 14); g.fillStyle(0x9a62c9).fillCircle(9, 10, 4).fillCircle(21, 9, 4).fillCircle(15, 5, 4); }),
  mushroom_red_01: sized([34, 30], (g) => { g.fillStyle(0xeee2c8).fillRect(13, 14, 8, 15); g.fillStyle(0xb8342a).fillEllipse(17, 13, 32, 18).fillStyle(0xffffff).fillCircle(11, 10, 2).fillCircle(21, 9, 2); }),
  mushroom_blue_01: sized([34, 30], (g) => { g.fillStyle(0xd8e8f0).fillRect(13, 14, 8, 15); g.fillStyle(0x3a8fb8).fillEllipse(17, 13, 32, 18).fillStyle(0xa8f0ff).fillCircle(12, 10, 2); }),
  reeds_01: sized([50, 70], (g, w, h) => { g.lineStyle(3, 0x5a6b34); for (let i = 0; i < 6; i++) g.beginPath().moveTo(8 + i * 7, h).lineTo(4 + i * 8, 10 + (i % 3) * 8).strokePath(); g.fillStyle(0x5b3a22).fillEllipse(12, 14, 6, 14).fillEllipse(36, 18, 6, 14); }),
  moon_plant_01: sized([50, 60], (g, w, h) => { g.fillStyle(COLORS.telekinesis, 0.25).fillCircle(w / 2, h * 0.45, 24); g.fillStyle(0x6fc8d0).fillEllipse(w * 0.35, h * 0.55, 12, 30).fillEllipse(w * 0.65, h * 0.55, 12, 30); g.fillStyle(0xd8fbff).fillCircle(w / 2, h * 0.3, 8); }),
  dry_bush_01: sized([80, 60], (g, w, h) => { g.fillStyle(0x000000, 0.25).fillEllipse(w / 2, h - 5, w * 0.8, 10); g.lineStyle(3, 0x8a6a3a); for (let i = 0; i < 9; i++) g.beginPath().moveTo(w / 2, h - 4).lineTo(8 + i * 8, 8 + (i % 3) * 8).strokePath(); g.fillStyle(0xa8854a).fillCircle(w / 2, h * 0.55, 14); }),

  // ---- props ----
  lantern_01: sized([30, 90], (g, w, h) => { g.fillStyle(0x2b1d15).fillRect(13, 20, 4, h - 20); g.fillStyle(0x1d1410).fillRect(5, 4, 20, 22); g.fillStyle(0xffc46b).fillRect(8, 8, 14, 14); }),
  lantern_02: sized([50, 100], (g, w, h) => { g.fillStyle(0x2b1d15).fillRect(8, 0, 4, h).fillRect(8, 0, 30, 4); g.fillStyle(0x1d1410).fillRect(26, 6, 18, 22); g.fillStyle(0xffc46b).fillRect(29, 10, 12, 14); }),
  signpost_01: sized([70, 90], (g, w, h) => { g.fillStyle(0x4a3324).fillRect(31, 10, 8, h - 10).fillRect(4, 14, 62, 18).fillRect(8, 40, 56, 16); g.fillStyle(0x2b1d15).fillTriangle(66, 14, 70, 23, 66, 32); }),
  wooden_bridge_01: sized([180, 120], (g, w, h) => { g.fillStyle(0x5a3d26); for (let i = 0; i < 8; i++) g.fillRect(4 + i * 22, 10, 18, h - 20); g.fillStyle(0x3a2718).fillRect(0, 8, w, 6).fillRect(0, h - 14, w, 6); }),
  chest_01: sized([60, 48], (g, w, h) => { g.fillStyle(0x000000, 0.3).fillEllipse(w / 2, h - 4, w, 10); g.fillStyle(0x6a4428).fillRect(4, 14, w - 8, h - 18); g.fillStyle(0x7d5230).fillRoundedRect(4, 4, w - 8, 16, 6); g.fillStyle(COLORS.gold).fillRect(4, 18, w - 8, 3).fillRect(w / 2 - 4, 16, 8, 10); }),
  chest_01_open: sized([60, 48], (g, w, h) => { g.fillStyle(0x000000, 0.3).fillEllipse(w / 2, h - 4, w, 10); g.fillStyle(0x6a4428).fillRect(4, 14, w - 8, h - 18); g.fillStyle(0x2a1a10).fillRect(8, 14, w - 16, 6); g.fillStyle(0x7d5230).fillRect(4, 0, w - 8, 10); g.fillStyle(COLORS.gold).fillCircle(w / 2, 16, 5); }),
  candle_group_01: sized([40, 34], (g) => { g.fillStyle(0xeee2c8).fillRect(6, 14, 6, 18).fillRect(17, 8, 7, 24).fillRect(29, 16, 5, 16); g.fillStyle(0xffb347).fillCircle(9, 11, 3).fillCircle(20, 5, 3).fillCircle(31, 13, 3); }),
  torch_01: sized([36, 90], (g, w, h) => { g.fillStyle(0x3b2618).fillRect(15, 24, 6, h - 24); g.fillStyle(0x55504a).fillRect(8, 18, 20, 10); g.fillStyle(0x333333).fillCircle(18, 18, 6); }),
  claw_marks_01: sized([70, 40], (g) => { g.lineStyle(4, 0x1a1210, 0.7); for (let i = 0; i < 3; i++) g.beginPath().moveTo(10 + i * 18, 4).lineTo(24 + i * 18, 36).strokePath(); }),

  // ---- ключевые объекты ----
  magic_book_01: sized([70, 70], (g, w, h) => { g.fillStyle(COLORS.seal, 0.25).fillCircle(w / 2, h * 0.35, 28); g.fillStyle(0x3b2618).fillRect(w / 2 - 6, h * 0.45, 12, h * 0.55); g.fillStyle(0x4b2a5c).fillRect(10, 16, w - 20, 24); g.fillStyle(0xf1e3c2).fillRect(14, 12, w / 2 - 16, 22).fillRect(w / 2 + 2, 12, w / 2 - 16, 22); g.fillStyle(COLORS.telekinesis).fillCircle(w / 2, 8, 4); }),
  lunar_altar_01: (g, w, h) => { g.fillStyle(0x000000, 0.3).fillEllipse(w / 2, h - 8, w, 20); g.fillStyle(0x6e6a70).fillRect(10, h * 0.45, w - 20, h * 0.5); g.fillStyle(0x8a8690).fillRect(4, h * 0.38, w - 8, 14); g.fillStyle(0x9fe9ff).fillCircle(w / 2, h * 0.2, 18).fillStyle(0x6e6a70).fillCircle(w / 2 + 8, h * 0.17, 16); },
  lunar_flame_01: sized([36, 48], (g, w, h) => { g.fillStyle(0x9fe9ff, 0.3).fillCircle(w / 2, h * 0.55, 17); g.fillStyle(0x9fe9ff).fillTriangle(w / 2, 2, w / 2 - 10, h * 0.6, w / 2 + 10, h * 0.6).fillCircle(w / 2, h * 0.62, 10); g.fillStyle(0xffffff).fillCircle(w / 2, h * 0.64, 5); }),
  fire_circle_01: sized([240, 130], (g, w, h) => { g.lineStyle(6, 0x5a3420, 0.9).strokeEllipse(w / 2, h / 2, w - 20, h - 20); g.lineStyle(2, COLORS.fire, 0.7).strokeEllipse(w / 2, h / 2, w - 50, h - 44); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.fillStyle(0x6f6a63).fillCircle(w / 2 + Math.cos(a) * (w / 2 - 12), h / 2 + Math.sin(a) * (h / 2 - 12), 9); } g.fillStyle(COLORS.fire, 0.5).fillCircle(w / 2, h / 2, 14); }),
  corrupted_roots_01: sized([220, 120], (g, w, h) => { g.fillStyle(0x000000, 0.35).fillEllipse(w / 2, h - 10, w, 24); g.lineStyle(14, 0x14100f); for (let i = 0; i < 7; i++) g.beginPath().moveTo(10 + i * 32, h - 6).lineTo(30 + ((i * 47) % 160), 14 + (i % 3) * 18).lineTo(w - 10 - i * 25, h * 0.5).strokePath(); g.fillStyle(COLORS.seal).fillCircle(60, 40, 4).fillCircle(150, 30, 4).fillCircle(110, 70, 3); }),
  ancient_gate_01: (g, w, h) => { g.fillStyle(0x4f4b52).fillRect(10, 40, 50, h - 40).fillRect(w - 60, 40, 50, h - 40).fillRect(10, 20, w - 20, 50); g.fillStyle(0x221d26).fillRect(60, 70, w - 120, h - 70); g.lineStyle(5, COLORS.seal, 0.9).strokeCircle(w / 2, h * 0.58, 60); g.lineStyle(2, COLORS.seal, 0.7).strokeCircle(w / 2, h * 0.58, 42); g.fillStyle(COLORS.seal, 0.35).fillCircle(w / 2, h * 0.58, 40); g.lineStyle(3, COLORS.seal).beginPath().moveTo(w / 2, h * 0.58 - 40).lineTo(w / 2 + 34, h * 0.58 + 22).lineTo(w / 2 - 34, h * 0.58 + 22).closePath().strokePath(); },

  // ---- поверхности (тайлы 64×64) ----
  grass_ground_01: sized([64, 64], (g) => { g.fillStyle(0x24331f).fillRect(0, 0, 64, 64); g.fillStyle(0x2c3f25); for (let i = 0; i < 10; i++) g.fillRect((i * 23) % 60, (i * 37) % 60, 3, 6); }),
  dirt_path_01: sized([64, 64], (g) => { g.fillStyle(0x6b4f34).fillRect(0, 0, 64, 64); g.fillStyle(0x7d5f40); for (let i = 0; i < 8; i++) g.fillCircle((i * 29) % 60 + 2, (i * 17) % 60 + 2, 3); }),
  stone_path_01: sized([64, 64], (g) => { g.fillStyle(0x4d4a46).fillRect(0, 0, 64, 64); g.fillStyle(0x6a665f).fillRoundedRect(2, 2, 28, 28, 6).fillRoundedRect(34, 2, 28, 28, 6).fillRoundedRect(18, 34, 28, 28, 6); }),
  swamp_water_01: sized([64, 64], (g) => { g.fillStyle(0x1b3332).fillRect(0, 0, 64, 64); g.lineStyle(2, 0x2d5552, 0.8).strokeEllipse(20, 20, 20, 6).strokeEllipse(46, 46, 22, 6); }),
  wooden_floor_01: sized([64, 64], (g) => { g.fillStyle(0x5a3d26).fillRect(0, 0, 64, 64); g.fillStyle(0x4a3220).fillRect(0, 15, 64, 2).fillRect(0, 31, 64, 2).fillRect(0, 47, 64, 2).fillRect(30, 0, 2, 15).fillRect(12, 33, 2, 14); }),
  wall_wood_01: sized([64, 64], (g) => { g.fillStyle(0x3a2718).fillRect(0, 0, 64, 64); g.fillStyle(0x2a1c11).fillRect(0, 20, 64, 3).fillRect(0, 42, 64, 3); }),

  // ---- враги ----
  enemy_scavenger: (g, w, h) => { g.fillStyle(0x000000, 0.35).fillEllipse(w / 2, h - 6, w * 0.8, 16); g.fillStyle(0x3a3128).fillEllipse(w / 2, h * 0.6, w * 0.8, h * 0.6); g.fillStyle(0x4a3f33).fillCircle(w * 0.5, h * 0.32, w * 0.2); g.fillStyle(0xff3b2f).fillCircle(w * 0.43, h * 0.3, 4).fillCircle(w * 0.57, h * 0.3, 4); g.lineStyle(4, 0x2a231c); g.beginPath().moveTo(w * 0.2, h * 0.7).lineTo(w * 0.08, h - 6).moveTo(w * 0.8, h * 0.7).lineTo(w * 0.92, h - 6).strokePath(); },
  enemy_scavenger_small: sized([90, 80], (g, w, h) => { g.fillStyle(0x000000, 0.35).fillEllipse(w / 2, h - 5, w * 0.8, 12); g.fillStyle(0x4a3f33).fillEllipse(w / 2, h * 0.6, w * 0.75, h * 0.6); g.fillStyle(0x5a4d3e).fillCircle(w * 0.5, h * 0.32, w * 0.2); g.fillStyle(0xff7a2f).fillCircle(w * 0.43, h * 0.3, 3).fillCircle(w * 0.57, h * 0.3, 3); }),
  enemy_guardian: (g, w, h) => { g.fillStyle(0x000000, 0.35).fillEllipse(w / 2, h - 8, w * 0.8, 22); g.fillStyle(0x4a4640).fillRoundedRect(w * 0.22, h * 0.3, w * 0.56, h * 0.62, 18); g.fillStyle(0x5a4630).fillRect(w * 0.08, h * 0.35, w * 0.16, h * 0.4).fillRect(w * 0.76, h * 0.35, w * 0.16, h * 0.4); g.fillStyle(0x5d5a52).fillCircle(w / 2, h * 0.22, w * 0.17); g.fillStyle(0x7cff9a).fillCircle(w * 0.44, h * 0.21, 5).fillCircle(w * 0.56, h * 0.21, 5); g.fillStyle(0x3d5a2c).fillEllipse(w / 2, h * 0.32, w * 0.6, 16); },
  enemy_rootling: (g, w, h) => { g.fillStyle(0x000000, 0.35).fillEllipse(w / 2, h - 6, w * 0.8, 16); g.fillStyle(0x2a1d14).fillEllipse(w / 2, h * 0.55, w * 0.6, h * 0.8); g.fillStyle(COLORS.seal).fillCircle(w * 0.44, h * 0.35, 4).fillCircle(w * 0.56, h * 0.35, 4); },

  // ---- объекты боевого поля ----
  field_rock_light: sized([70, 56], rock(0x7a756d, 0x9a948a)),
  field_rock_heavy: sized([116, 90], rock(0x5b5650, 0x777169, 0x4a6636)),
  field_crystal: sized([70, 110], (g, w, h) => { g.fillStyle(0x000000, 0.3).fillEllipse(w / 2, h - 6, w * 0.8, 12); g.fillStyle(0x7f5bd0).fillTriangle(w / 2, 4, 6, h * 0.55, w - 6, h * 0.55).fillTriangle(6, h * 0.55, w - 6, h * 0.55, w / 2, h - 8); g.fillStyle(0xc9b5ff).fillTriangle(w / 2, 10, w * 0.3, h * 0.5, w / 2, h * 0.5); }),

  // ---- иконки ----
  icon_telekinesis: icon((g) => { g.lineStyle(5, COLORS.telekinesis); g.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 4; const r = 4 + i * 0.62; const x = 32 + Math.cos(a) * r; const y = 32 + Math.sin(a) * r; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.strokePath(); }),
  icon_fire: icon((g) => { g.fillStyle(COLORS.fire).fillTriangle(32, 4, 14, 40, 50, 40).fillCircle(32, 42, 18); g.fillStyle(0xffd27a).fillTriangle(32, 22, 24, 46, 40, 46).fillCircle(32, 48, 8); }),
  icon_seal: icon((g) => { g.lineStyle(4, COLORS.seal).strokeCircle(32, 32, 26); g.beginPath().moveTo(32, 10).lineTo(50, 44).lineTo(14, 44).closePath().strokePath(); g.fillStyle(COLORS.seal).fillCircle(32, 33, 5); }),
  icon_bag: icon((g) => { g.fillStyle(0x7d5230).fillRoundedRect(10, 20, 44, 38, 12); g.fillStyle(0x5a3a22).fillRect(22, 10, 20, 12); g.fillStyle(COLORS.gold).fillRect(14, 30, 36, 4); }),
  icon_hand: icon((g) => { g.fillStyle(COLORS.parchment).fillRoundedRect(16, 26, 32, 30, 10); for (let i = 0; i < 4; i++) g.fillRoundedRect(16 + i * 8, 8 + (i === 0 || i === 3 ? 8 : 0), 7, 26, 3); g.fillRoundedRect(4, 30, 16, 8, 4); }),
  icon_coin: icon((g) => { g.fillStyle(0xa67c2e).fillCircle(32, 34, 22); g.fillStyle(COLORS.gold).fillCircle(32, 32, 22); g.fillStyle(0xf3d98a).fillCircle(32, 32, 12); }),
  icon_shard: icon((g) => { g.fillStyle(0x5fb8d9).fillTriangle(32, 4, 14, 32, 50, 32).fillTriangle(14, 32, 50, 32, 32, 60); g.fillStyle(0xbdeeff).fillTriangle(32, 10, 22, 32, 32, 32); }),
  icon_ember: icon((g) => { g.fillStyle(0x8a1f1a).fillCircle(32, 34, 20); g.fillStyle(0xff4a2b).fillCircle(30, 32, 12); g.fillStyle(0xffb36b).fillCircle(28, 30, 5); }),
  icon_core: icon((g) => { g.fillStyle(COLORS.seal, 0.4).fillCircle(32, 32, 28); g.fillStyle(0xff8a3a).fillCircle(32, 32, 16); g.fillStyle(0xffffff).fillCircle(28, 28, 5); }),
  icon_lock: icon((g) => { g.lineStyle(6, 0xbbbbbb).strokeCircle(32, 26, 12); g.fillStyle(0x999999).fillRoundedRect(14, 28, 36, 28, 6); g.fillStyle(0x333333).fillCircle(32, 40, 4); }),

  // ---- FX ----
  fx_dot: sized([16, 16], (g) => g.fillStyle(0xffffff).fillCircle(8, 8, 8)),
  fx_glow: sized([128, 128], (g) => { for (let r = 64; r > 0; r -= 2) g.fillStyle(0xffffff, 0.025).fillCircle(64, 64, r); }),
  fx_ring: sized([128, 128], (g) => g.lineStyle(6, 0xffffff).strokeCircle(64, 64, 58)),
};
