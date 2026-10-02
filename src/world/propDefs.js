// Таблица типов объектов мира: название для редактора и «след» коллизии у основания.
// solid { w, h } — прямоугольник у ног объекта (центр по x, вверх от точки основания).
// Герой ходит за кроной дерева, но не проходит сквозь ствол, камень, куст или гриб.
// null — проходимый декор (цветы, камыш, свечи, следы когтей, мостик).

export const PROP_DEFS = {
  tree_dark_01:   { name: 'Тёмное дерево 1',   solid: { w: 34, h: 18 } },
  tree_dark_02:   { name: 'Тёмное дерево 2',   solid: { w: 34, h: 18 } },
  tree_autumn_01: { name: 'Осеннее дерево 1',  solid: { w: 34, h: 18 } },
  tree_autumn_02: { name: 'Осеннее дерево 2',  solid: { w: 34, h: 18 } },
  birch_01:       { name: 'Берёза',            solid: { w: 24, h: 16 } },
  dead_tree_01:   { name: 'Сухое дерево',      solid: { w: 34, h: 18 } },
  bush_01:        { name: 'Куст 1',            solid: { w: 48, h: 22 } },
  bush_02:        { name: 'Куст 2',            solid: { w: 48, h: 22 } },
  rock_small_01:  { name: 'Камень',            solid: { w: 42, h: 20 } },
  mushroom_red_01:  { name: 'Гриб красный',    solid: { w: 26, h: 14 } },
  mushroom_blue_01: { name: 'Гриб синий',      solid: { w: 24, h: 14 } },
  lantern_01:     { name: 'Фонарь (столб)',    solid: { w: 14, h: 10 } },
  lantern_02:     { name: 'Фонарь (большой)',  solid: { w: 30, h: 12 } },
  signpost_01:    { name: 'Указатель',         solid: { w: 24, h: 10 } },
  flower_white_01:  { name: 'Цветы белые',     solid: null },
  flower_purple_01: { name: 'Цветы фиолетовые', solid: null },
  reeds_01:       { name: 'Камыш',             solid: null },
  candle_group_01: { name: 'Свечи',            solid: null },
  claw_marks_01:  { name: 'Следы когтей',      solid: null },
  wooden_bridge_01: { name: 'Мостик',          solid: null },
};

// Группы для палитры редактора.
export const PALETTE = [
  { title: 'Деревья', keys: ['tree_dark_01', 'tree_dark_02', 'tree_autumn_01', 'tree_autumn_02', 'birch_01', 'dead_tree_01'] },
  { title: 'Кусты и камни', keys: ['bush_01', 'bush_02', 'rock_small_01'] },
  { title: 'Грибы и цветы', keys: ['mushroom_red_01', 'mushroom_blue_01', 'flower_white_01', 'flower_purple_01', 'reeds_01'] },
  { title: 'Свет и знаки', keys: ['lantern_01', 'lantern_02', 'signpost_01', 'candle_group_01', 'claw_marks_01', 'wooden_bridge_01'] },
];

export const propName = (key) => PROP_DEFS[key]?.name || key;
