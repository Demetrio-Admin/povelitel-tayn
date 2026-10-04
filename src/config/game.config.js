// Технические параметры экрана, камеры и управления.
// Источник: Visual Style Guide v0.1 §2, First Location Blueprint v0.1 §7, Hero & Sprite Spec v0.1 §3.

export const VIEW = {
  width: 720,   // логический viewport 9:16 (референс 1080×1920, масштаб 2/3)
  height: 1280,
  background: '#120d0b',
};

export const CAMERA = {
  // Герой на ~62% высоты экрана (Blueprint §7: 58–65%).
  heroScreenY: 0.62,
  lerp: 0.12,          // мягкое следование
  deadzone: { w: 60, h: 70 },
  panDurationMs: 650,  // короткий pan к важным объектам
};

export const PLAYER = {
  speed: 230,          // px/s
  // Визуальная высота ~120 px при viewport 720×1280 (≈180 px при 1080×1920).
  displayHeight: 120,
  // Hitbox — нижние ~30–40% тела, центр у ступней (Hero Spec §13).
  hitbox: { w: 34, h: 22 },
  arriveDistance: 10,  // tap-to-move
};

export const CONTROLS = {
  joystickRadius: 90,       // v0.10.3: был 70 — полный ход слишком близко к центру, джойстик казался «чувствительным»
  joystickDeadzone: 14,
  joystickCurve: 1.35,      // >1: у центра шаги медленнее, у края — полная скорость (плавнее подходить к цели)
  tapMaxMs: 400,            // v0.10.3: был 260 — неспешный клик мышью не засчитывался
  tapMaxMove: 20,
  tapPickRadius: 80,      // большой радиус попадания по объекту — без требований к точности
};

export const INTERACTION = {
  defaultRadius: 95,
  markerVisibleDistance: 420,
};

export const DEPTH = {
  ground: 0,
  path: 2,
  backDecor: 10,
  mainBase: 100,       // + y для Y-сортировки
  frontDecor: 20000,
  fx: 30000,
  markers: 40000,
};

// Цветовой язык магии (Visual Style Guide §4).
export const COLORS = {
  telekinesis: 0x4fe3c1,
  fire: 0xff6a2b,
  seal: 0x7d8bff,   // v0.10.1: Астрал — холодный бирюзово-фиолетовый
  neutral: 0xe8c56a,
  gold: 0xd9b45a,
  wood: 0x2b1d15,
  woodLight: 0x4a3324,
  parchment: 0xf1e3c2,
  hp: 0xc8443a,
  mana: 0x5fb8d9,
  danger: 0xff3b2f,
  text: '#f1e3c2',
  textGold: '#e8c56a',
  textDim: '#a8977a',
};

export const SAVE = {
  key: 'witch_rpg_proto_save_v1',
  autosaveIntervalMs: 5000,
};
