// Дизайн-токены интерфейса (Visual Style Guide §10): тёмное дерево, пергамент, тонкое золото, лунные символы.
// Размеры — в логических пикселях игры (720×1280). Текстуры UI рисуются в texScale раз крупнее ради чёткости.
export const UI = {
  texScale: 2,
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
};
