// Дизайн-токены интерфейса (Visual Style Guide §10): тёмное дерево, пергамент, тонкое золото, лунные символы.
// Размеры — в логических пикселях игры (720×1280). Текстуры UI рисуются в texScale раз крупнее ради чёткости.
export const UI = {
  texScale: 2,
  // Mobile type scale: 720 logical px → 360 CSS px with Scale.FIT.
  // small is the minimum for player-facing supporting text (12 CSS px at 360).
  type: { small: 24, body: 28, bodyLarge: 30, heading: 30, title: 36, combat: 30, badge: 24 },
  icon: { journal: 56, resource: 64, ingredient: 48, potion: 76, combatPotion: 62 },
  touch: { button: 88, potion: 100, potionRadius: 46 },
  pad: 14,                 // запас под тень вокруг панелей (логических px)
  radius: 16,              // скругление панелей
  radiusButton: 14,
  font: "'Philosopher', Georgia, 'Times New Roman', serif",   // Cyrillic; при недоступности — Georgia
  fontUrl: 'https://fonts.googleapis.com/css2?family=Philosopher:wght@400;700&display=swap',
  wood: {                  // градиент дерева сверху вниз
    dark: ['#33241a', '#26180f', '#1b110b'],
    mid: ['#4a3324', '#38271b', '#271a11'],
  },
  gold: { hi: '#f6e3a1', mid: '#d9b45a', lo: '#8a6a2a', dim: '#8a7a5a' },
  frame: 3,                // толщина золотой рамки
  hairline: 6,             // отступ тонкой внутренней линии
  barGradient: {           // [светлый верх, тёмный низ]
    hp: ['#e8665a', '#9e2c25'],
    mana: ['#8fd8f2', '#3f8fb3'],
    xp: ['#f6e3a1', '#b58a2e'],
    danger: ['#ff6a5a', '#b3241b'],
  },
  shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 4, fill: true },   // тень текста Phaser
  orb: { ability: 128, small: 68, context: 112 },   // диаметры кнопок-«жемчужин»

  // v0.8.2 — компактный HUD без сплошных плашек. Все размеры в логических px (720×1280).
  hud: {
    top: 172,              // нижняя граница постоянной верхней зоны (дальше — мир)
    portrait: 104, portraitHit: 112, portraitX: 72, portraitY: 72,
    level: 34,             // «Ур. N»
    caption: 24,           // «До 5 ур.: 60 опыта»
    number: 26,            // числа HP/маны
    resNumber: 28,         // монеты и осколки
    statIcon: 32, statH: 40, resIcon: 38,
    xp: { w: 180, h: 18 },
    shade: 0.55,           // мягкое затемнение под верхним HUD (сверху вниз до нуля)
    bottomShade: 0.5,      // и под нижними кнопками
  },
  side: {                  // правая колонка: Журнал над Меню
    x: 656, orb: 92, icon: 60, hitW: 104, label: 24,
    journalY: 62, menuY: 214, gap: 16,
    badge: 24, badgeR: 20,
  },
  menu: {                  // раскрывающееся меню 3×2
    cols: 3, orb: 96, icon: 68, hit: 120, label: 24, cellW: 184, rowH: 168,
    left: 16, top: 176, animMs: 210, dim: 0.28,
  },
  banner: { ms: 4200 },    // временное уведомление о новой цели
};
