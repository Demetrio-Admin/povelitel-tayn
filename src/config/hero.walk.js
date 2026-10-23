// Покадровая ходьба героев. Листы — ряд из WALK_FRAMES кадров 166×240 (два шага = один цикл), лицом вправо для «вбок».
// Сейчас их запекает tools/art/hero_walk_frames.py из готовых рисунков; можно заменить нарисованными кадрами
// с теми же именами и размером листа, код менять не нужно. Нет листа — Player ходит по-старому (один рисунок + подскок).
export const WALK_FRAMES = 8;
export const WALK_FRAME = { w: 166, h: 240 };

export const WALK_SHEETS = {
  witch: { down: 'hero_walk_down', up: 'hero_walk_up', side: 'hero_walk_side' },
  warlock: { down: 'warlock_walk_down', up: 'warlock_walk_up', side: 'warlock_walk_side' },
};

/** key → путь файла, для PreloadScene. */
export const WALK_SHEET_FILES = Object.fromEntries(
  Object.values(WALK_SHEETS).flatMap(s => Object.values(s)).map(key => [key, `assets/heroes/lunar-v1/${key}.png`]),
);

/** Листы героя по id; неизвестный id — как у ведьмы (так же, как в heroes.js). */
export const walkSheetsFor = (heroId) => WALK_SHEETS[heroId] || WALK_SHEETS.witch;

/** Номер кадра по доле цикла 0…1 (цикл — два шага). */
export const walkFrameIndex = (cycle) => Math.floor((((cycle % 1) + 1) % 1) * WALK_FRAMES) % WALK_FRAMES;
