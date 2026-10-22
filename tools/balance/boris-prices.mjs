// Сверка цен лавки Бориса с ТЗ и с экономикой игры. Ничего не меняет: читает src/config/* и печатает таблицы.
//   node tools/balance/boris-prices.mjs            — отчёт в Markdown
//   node tools/balance/boris-prices.mjs --check    — только проверки (код выхода 1, если цены разошлись с ТЗ или есть перепродажа)
// Доходы в час взяты из готовых расчётов, а не пересчитываются заново: docs/design/economy-progression-20261021.md (сбор и продажа)
// и docs/design/rebalance-recovery-20261021.md (подготовленный герой с экономным расходом зелий).
import { SHOP, sellPrice } from '../../src/config/shop.js';
import { RECIPES } from '../../src/config/recipes.js';
import { POTIONS } from '../../src/config/resources.js';
import { CITY_GATHERING } from '../../src/config/cityGathering.js';
import { ENEMIES } from '../../src/config/balance.enemies.js';

/** Таблица из ТЗ (docs/recovery/spec-v4-original.md §3.1): покупка / продажа. Менять только по решению автора ТЗ. */
const SPEC = { moon_herb: [18, 5], forest_mushroom: [20, 6], tree_resin: [16, 5], rune_dust: [28, 9], lunar_shard: [45, 14], frost_herb: [22, 7], ice_crystal: [55, 18] };
/** Монет в час: сбор по всем локациям и продажа Борису (лучший из 126 вариантов, без Следопыта, сумка 100) / только город / бой с экономным расходом. */
const INCOME = { gather: 2926, gatherCity: 1281, fight: 555 };
const GOAL_COINS = 10_000;   // «около 10 000 монет за несколько часов сбора и продажи» — ТЗ §3.1

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); return cond ? '✓' : '✗'; };

// ---- 1. цены против ТЗ, продажа, перепродажа
const priceRows = Object.entries(SPEC).map(([id, [buy, sell]]) => {
  const okSpec = check(SHOP.buy[id] === buy && sellPrice(id) === sell, `${id}: в коде ${SHOP.buy[id]}/${sellPrice(id)}, в ТЗ ${buy}/${sell}`);
  const okLoss = check(sellPrice(id) < SHOP.buy[id], `${id}: продажа не ниже покупки — возможна перепродажа`);
  return { id, buy: SHOP.buy[id], sell: sellPrice(id), pct: sellPrice(id) / SHOP.buy[id], okSpec, okLoss };
});
check(Object.keys(SHOP.buy).length === Object.keys(SPEC).length, 'в прайсе есть товары, которых нет в ТЗ');

// ---- 2. зелья: сколько стоит варка и сколько это в часах дохода
const brew = (r, price) => Object.entries(r.needs).reduce((s, [id, n]) => s + (id === 'coins' ? n : (price(id) ?? 0) * n), 0);
const unsold = (r) => Object.keys(r.needs).filter(id => id !== 'coins' && SHOP.buy[id] === undefined);
const total = (e) => (e.flat ?? 0) + (e.regen ? e.regen.rate * e.regen.sec : 0);
const potions = Object.entries(RECIPES).filter(([id, r]) => r.kind === 'potion' && POTIONS[r.result] && id !== 'crystal_guard' && !id.startsWith('elixir_'))
  .map(([id, r]) => { const e = POTIONS[r.result].effect, pts = POTIONS[r.result].category === 'restore' ? total(e) : 0;
    return { id, name: POTIONS[r.result].name, kind: e.type, pts, atBuy: brew(r, i => SHOP.buy[i]), atSell: brew(r, sellPrice), fee: r.needs.coins || 0, unsold: unsold(r) }; });

// ---- 3. предложение в городе: сколько штук в час дают точки сбора
const supply = {};
for (const n of CITY_GATHERING) { supply[n.res] ??= { nodes: 0, perHour: 0 }; supply[n.res].nodes++; supply[n.res].perHour += 3600 / n.respawnSec; }

const f = (n, d = 0) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d });
const out = [];
out.push('# Цены Бориса: сверка с ТЗ и экономикой', '');
out.push('## Прайс', '', '| Товар | Купить | Продать | Продажа / покупка | ТЗ | Нет перепродажи |', '|---|---:|---:|---:|:-:|:-:|');
for (const r of priceRows) out.push(`| ${r.id} | ${r.buy} | ${r.sell} | ${f(r.pct * 100, 1)}% | ${r.okSpec} | ${r.okLoss} |`);
out.push('', `Продажа = floor(покупка × ${f(SHOP.sellPct * 100)}%); ТЗ называет «примерно 30–35%», у лунной травы из-за округления вниз выходит ${f(priceRows[0].pct * 100, 1)}%.`);

out.push('', '## Время до цели «около 10 000 монет»', '', '| Маршрут | Монет в час | Часов до 10 000 |', '|---|---:|---:|');
for (const [name, v] of [['Сбор по всем локациям + продажа', INCOME.gather], ['Только город + продажа', INCOME.gatherCity], ['Бой с экономным расходом зелий', INCOME.fight]]) out.push(`| ${name} | ${f(v)} | ${f(GOAL_COINS / v, 1)} |`);

out.push('', '## Зелья: себестоимость и цена за единицу эффекта', '',
  '«По ценам Бориса» — если все ингредиенты купить; «по цене продажи» — сколько выручки упущено, если ингредиенты собраны самим; «минут дохода» — сколько это минут лучшего маршрута сбора и продажи. Монеты-плата включены в обе колонки; плюс — ингредиенты, которых у Бориса нет, в сумму не входят.', '',
  '| Зелье | Эффект | По ценам Бориса | Монет за 1 HP/MP | По цене продажи | Минут дохода от сбора |', '|---|---:|---:|---:|---:|---:|');
for (const p of potions.sort((a, b) => a.kind.localeCompare(b.kind) || b.pts - a.pts || b.atBuy - a.atBuy)) {
  const buy = p.unsold.length ? `${f(p.atBuy)}+ (нет в лавке: ${p.unsold.join(', ')})` : f(p.atBuy);
  out.push(`| ${p.name} | ${p.pts ? f(p.pts) + (p.kind === 'heal' ? ' HP' : ' MP') : '—'} | ${buy} | ${p.pts && !p.unsold.length ? f(p.atBuy / p.pts, 2) : '—'} | ${f(p.atSell)}${p.unsold.length ? '+' : ''} | ${f(p.atSell / INCOME.gather * 60, 1)}${p.unsold.length ? '+' : ''} |`);
}

out.push('', '## Предложение в городе (точки сбора)', '', '| Ресурс | Точек | Штук в час | Секунд на штуку | Цена, монет | Монет за секунду предложения |', '|---|---:|---:|---:|---:|---:|');
for (const [id, v] of Object.entries(supply)) out.push(`| ${id} | ${v.nodes} | ${f(v.perHour, 1)} | ${f(3600 / v.perHour)} | ${SHOP.buy[id]} | ${f(SHOP.buy[id] / (3600 / v.perHour), 3)} |`);

const repeat = Object.values(ENEMIES).map(e => e.repeatRewards?.coins).filter(Boolean);
out.push('', '## Монеты за бой', '', `Повторное убийство даёт от ${Math.min(...repeat)} до ${Math.max(...repeat)} монет (врагов с повторной наградой: ${repeat.length}).`);

if (process.argv.includes('--check')) {
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
  console.log(`✓ Цены Бориса совпадают с ТЗ, перепродажи нет (${priceRows.length} товаров).`);
} else {
  console.log(out.join('\n'));
  if (failures.length) { console.error('\nРасхождения:\n' + failures.join('\n')); process.exitCode = 1; }
}
