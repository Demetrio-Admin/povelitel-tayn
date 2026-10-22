// Раскладка котла (вкладки, порядок «от сильного к слабому»), окно «Амулеты» и вспомогательные функции окна лавки. Без Phaser и браузера.
import assert from 'node:assert/strict';
import { GameState } from '../src/state/GameState.js';
import { Alchemy } from '../src/systems/Alchemy.js';
import { RECIPES, RECIPE_ORDER } from '../src/config/recipes.js';
import { POTIONS } from '../src/config/resources.js';
import { AMULETS } from '../src/config/build.js';
import { alchemyTabsView, amuletGroups, restoreTotal, brewCost, ALCHEMY_TABS } from '../src/systems/alchemyTabs.js';
import { shopView, shopQuote, shopRowsFor, shopDefaultKind, shopPick } from '../src/systems/shopModel.js';
import { SHOP } from '../src/config/shop.js';

const fresh = () => new GameState(null, { load: () => null, save: () => {} });
const ids = (groups) => groups.flatMap(g => g.recipes.map(r => r.id));
const tabIds = (view, id) => ids(view.find(t => t.id === id)?.groups || []);
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// ---- начало игры: только рецепты первой главы, амулетов нет совсем
{
  const state = fresh(), a = new Alchemy(state), view = alchemyTabsView(a);
  assert.deepEqual(view.map(t => t.id), ['restore', 'other', 'special']); checks++;
  assert.deepEqual(tabIds(view, 'restore'), ['potion_life_small', 'potion_mana_small']); checks++;
  assert.deepEqual(tabIds(view, 'other'), ['resin_flask']); checks++;
  assert.deepEqual(tabIds(view, 'special'), ['lunar_wick', 'revealing_compound', 'restoration_bundle']); checks++;
  assert.deepEqual(amuletGroups(a), []); checks++;
}

// ---- вся вторая глава открыта
const state = fresh();
for (const e of ['ch2_city_arrived', 'ch2_lab_open', 'regen_potions_learned', 'ch2_nerys_met', 'unlock_ice_2', 'ch2_quarter_cleared', 'ch2_cargo_found', 'ch2_cargo_reported', 'chapter_2_complete']) state.markEvent(e);
const alchemy = new Alchemy(state), view = alchemyTabsView(alchemy);

// здоровье и мана — две группы в одной вкладке, внутри каждой от большего эффекта к меньшему
const restore = view.find(t => t.id === 'restore');
assert.deepEqual(restore.groups.map(g => g.title), ['Здоровье', 'Мана']); checks++;
assert.deepEqual(restore.groups[0].recipes.map(r => r.id), ['potion_life_large', 'potion_life_regen', 'potion_life_medium', 'potion_life_small']); checks++;
assert.deepEqual(restore.groups[1].recipes.map(r => r.id), ['potion_mana_large', 'potion_mana_regen', 'potion_mana_medium', 'potion_mana_small']); checks++;
for (const g of restore.groups) {
  const totals = g.recipes.map(r => restoreTotal(r.result));
  assert.deepEqual(totals, [...totals].sort((a, b) => b - a), `${g.title}: по убыванию эффекта`); checks++;
}
// регенерация считается целиком: 30 + 15 × 6 и 20 + 10 × 10
assert.equal(restoreTotal('potion_life_regen'), 120); assert.equal(restoreTotal('potion_mana_regen'), 120);
assert.equal(restoreTotal('potion_life_large'), 160); assert.equal(restoreTotal('potion_mana_large'), 150); checks += 4;

// остальные зелья — защита отдельно от атаки; внутри группы по убыванию цены варки
const other = view.find(t => t.id === 'other');
assert.deepEqual(other.groups.map(g => g.title), ['Защита и очищение', 'Для атаки']); checks++;
assert.deepEqual(other.groups[1].recipes.map(r => r.id), ['brittle_flask', 'resin_flask']); checks++;
for (const g of other.groups) {
  const costs = g.recipes.map(brewCost);
  assert.deepEqual(costs, [...costs].sort((a, b) => b - a), `${g.title}: по убыванию цены варки`); checks++;
}
ok(!other.groups.some(g => g.recipes.some(r => ['heal', 'mana'].includes(POTIONS[r.result].effect.type))), 'здоровье и мана не попадают во вкладку «Другие зелья»');

// «Особое»: сюжет, компоненты, инструменты — ни зелий, ни амулетов
const special = ids(view.find(t => t.id === 'special').groups);
ok(special.every(id => !['potion', 'amulet'].includes(RECIPES[id].kind)), 'в «Особом» нет зелий и амулетов');

// амулетов в котле нет, они — в отдельном окне: от самых редких к обычным, внутри — от самых дорогих
const inCauldron = view.flatMap(t => ids(t.groups));
ok(inCauldron.every(id => RECIPES[id].kind !== 'amulet'), 'котёл не показывает амулеты');
const amulets = amuletGroups(alchemy);
assert.deepEqual(amulets.map(g => g.rarity), ['epic', 'rare', 'common']); checks++;
for (const g of amulets) {
  const costs = g.recipes.map(brewCost);
  assert.deepEqual(costs, [...costs].sort((a, b) => b - a), `${g.title}: по убыванию цены`); checks++;
  ok(g.recipes.every(r => AMULETS[r.result].rarity === g.rarity), `${g.title}: редкость совпадает`);
}
ok(!ids(amulets).includes('amulet_storm_heart'), 'Грозовое сердце скрыто, пока не изучена Гроза');
state.unlockAbility('storm', 1);
ok(ids(amuletGroups(new Alchemy(state))).includes('amulet_storm_heart'), 'Грозовое сердце появилось после Грозы');

// ничего не потеряно: каждый известный рецепт показан ровно в одном месте
const shown = [...inCauldron, ...ids(amuletGroups(new Alchemy(state)))];
assert.equal(new Set(shown).size, shown.length, 'рецепт показан дважды'); checks++;
const known = RECIPE_ORDER.filter(id => !(RECIPES[id].chapter >= 2 && new Alchemy(state).status(id).state === 'locked'));
assert.deepEqual([...shown].sort(), [...known].sort()); checks++;
ok(ALCHEMY_TABS.every(t => t.hint.length <= 32), 'подсказки вкладок умещаются в одну строку окна');

// ---- окно лавки: порядок строк, вкладка по умолчанию, выбор товара
{
  const s = fresh(); s.markEvent(SHOP.requires);
  s.data.inventory = { coins: 500, rune_dust: 3, moon_herb: 5 };
  const v = shopView(s);
  assert.equal(shopDefaultKind(v), 'sell'); checks++;
  assert.deepEqual(shopRowsFor(v, 'sell').slice(0, 2).map(r => r.id), ['moon_herb', 'rune_dust']); checks++;   // то, что есть, — сверху, порядок прайса сохранён
  assert.deepEqual(shopRowsFor(v, 'buy').map(r => r.id), Object.keys(SHOP.buy)); checks++;
  assert.equal(shopPick(v, 'sell'), 'moon_herb'); checks++;
  assert.equal(shopPick(v, 'sell', 'lunar_shard'), 'moon_herb', 'нельзя продать то, чего нет — выбран первый, что можно'); checks++;
  assert.equal(shopPick(v, 'buy', 'lunar_shard'), 'lunar_shard'); checks++;
  s.data.inventory = { coins: 20 };
  const poor = shopView(s);
  assert.equal(shopDefaultKind(poor), 'buy', 'пустую вкладку продажи не открываем'); checks++;
  assert.equal(shopPick(poor, 'buy', 'ice_crystal'), 'moon_herb', 'на кристалл не хватает монет — выбран тот, что по карману'); checks++;
  assert.equal(shopQuote(poor, 'buy', 'ice_crystal', 1).allowed, false); checks++;
}

console.log(`✓ Котёл: вкладки и порядок, окно «Амулеты», вспомогательные функции лавки (${checks} проверок).`);
