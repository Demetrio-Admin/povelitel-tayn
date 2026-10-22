// Вкладки котла и окно «Амулеты»: какие рецепты показать и в каком порядке. Без Phaser, проверяется тестами (tests/alchemy-tabs-test.mjs).
// Здесь только раскладка для окна: числа баланса, цены и правила крафта — в config/*, правила изготовления — на сервере.
import { RECIPES, RECIPE_ORDER, RECIPE_SECTIONS } from '../config/recipes.js';
import { POTIONS } from '../config/resources.js';
import { AMULETS, RARITY } from '../config/build.js';
import { SHOP } from '../config/shop.js';

/** Вкладки котла по порядку показа. Амулетов здесь нет: их создают в отдельном окне (openAmulets). */
export const ALCHEMY_TABS = [
  { id: 'restore', label: 'Здоровье и мана', hint: 'От самых сильных к слабым.' },
  { id: 'other', label: 'Другие зелья', hint: 'Для боя. Сильные — сверху.' },
  { id: 'special', label: 'Особое', hint: 'Для заданий, сада и спутников.' },
];

/** Сколько здоровья или маны даёт зелье за одно применение целиком: сразу плюс то, что восстановится потом. */
export function restoreTotal(potionId) {
  const e = POTIONS[potionId]?.effect;
  if (!e) return 0;
  return (e.flat ?? 0) + (e.regen ? e.regen.rate * e.regen.sec : 0);
}

/** Цена варки по ценам Бориса: ингредиенты, которых у него нет (усиленная смола, ядра), считаются нулём, монеты — как есть. */
export function brewCost(recipe) {
  return Object.entries(recipe.needs || {}).reduce((sum, [id, n]) => sum + (id === 'coins' ? n : (SHOP.buy[id] ?? 0) * n), 0);
}

const order = (id) => RECIPE_ORDER.indexOf(id);
/** Рецепты главы II и позже не показываются, пока неизвестны; сюжетные рецепты первой главы показываются всегда (с подсказкой, откуда придёт знание). */
const visible = (alchemy, r) => !(r.chapter >= 2 && alchemy.status(r.id).state === 'locked');
const entries = (alchemy, pick) => RECIPE_ORDER.filter(id => pick(RECIPES[id])).map(id => ({ id, ...RECIPES[id] })).filter(r => visible(alchemy, r));
const byPower = (power) => (a, b) => power(b) - power(a) || order(a.id) - order(b.id);

const ATTACK = new Set(['damage', 'brittle']);

/** [{ id, label, hint, groups: [{ title, recipes }] }] — только непустые вкладки и группы. */
export function alchemyTabsView(alchemy) {
  const potions = entries(alchemy, r => r.kind === 'potion' && POTIONS[r.result]);
  const kindOf = (r) => POTIONS[r.result].effect.type;
  const groups = {
    restore: [
      { title: 'Здоровье', recipes: potions.filter(r => kindOf(r) === 'heal').sort(byPower(r => restoreTotal(r.result))) },
      { title: 'Мана', recipes: potions.filter(r => kindOf(r) === 'mana').sort(byPower(r => restoreTotal(r.result))) },
    ],
    other: [
      { title: 'Защита и очищение', recipes: potions.filter(r => !['heal', 'mana'].includes(kindOf(r)) && !ATTACK.has(kindOf(r))).sort(byPower(brewCost)) },
      { title: 'Для атаки', recipes: potions.filter(r => ATTACK.has(kindOf(r))).sort(byPower(brewCost)) },
    ],
    special: Object.entries(RECIPE_SECTIONS).filter(([kind]) => !['potion', 'amulet'].includes(kind))
      .map(([kind, title]) => ({ title, recipes: entries(alchemy, r => r.kind === kind) })),
  };
  return ALCHEMY_TABS.map(t => ({ ...t, groups: groups[t.id].filter(g => g.recipes.length) })).filter(t => t.groups.length);
}

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'];
const RARITY_TITLES = { legendary: 'Легендарные', epic: 'Эпические', rare: 'Редкие', common: 'Обычные' };

/** Окно «Амулеты»: известные рецепты амулетов, от самых редких к обычным, внутри — от самых дорогих. */
export function amuletGroups(alchemy) {
  const list = entries(alchemy, r => r.kind === 'amulet' && AMULETS[r.result]);
  return RARITY_ORDER.map(rarity => ({ rarity, title: RARITY_TITLES[rarity] || RARITY[rarity]?.name || rarity,
    recipes: list.filter(r => AMULETS[r.result].rarity === rarity).sort(byPower(brewCost)) })).filter(g => g.recipes.length);
}
