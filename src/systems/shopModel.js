// v0.19.0 — модель лавки торговца для окна (без Phaser, проверяется тестами). Цены и решения — на сервере (op shop_buy / shop_sell).
import { SHOP, sellPrice } from '../config/shop.js';
import { ITEMS } from '../config/balance.progression.js';
import { bagView } from '../config/bag.js';

/** Строки лавки: что купить (цена, хватает ли монет) и что продать (сколько есть, цена продажи). */
export function shopView(state) {
  const coins = state.item('coins');
  const open = state.hasEvent(SHOP.requires);
  const rows = Object.entries(SHOP.buy).map(([id, price]) => ({
    id, name: ITEMS[id]?.name || id, icon: ITEMS[id]?.icon || 'icon_shard',
    buy: price, canBuy: coins >= price, sell: sellPrice(id), have: state.item(id), canSell: state.item(id) > 0,
  }));
  return { open, coins, rows, bag: bagView(state) };
}

/** Preview only; the server validates every transaction atomically. */
export function shopQuote(view, kind, item, qty) {
  const row = view.rows.find(r => r.id === item);
  if (!row || !['buy', 'sell'].includes(kind)) return { max: 0, total: 0, allowed: false };
  const price = kind === 'sell' ? row.sell : row.buy;
  const max = Math.max(0, Math.min(SHOP.maxQty, kind === 'sell' ? row.have : Math.min(Math.floor(view.coins / price), view.bag.free)));
  return { max, total: Number.isInteger(qty) && qty > 0 ? qty * price : 0,
    allowed: view.open && Number.isInteger(qty) && qty > 0 && qty <= max };
}

/** Строки списка для вкладки: в «Продать» сверху то, что есть в сумке (порядок внутри групп — как в прайсе); в «Купить» — порядок прайса. */
export function shopRowsFor(view, kind) {
  return kind === 'sell' ? [...view.rows].sort((a, b) => Number(b.canSell) - Number(a.canSell)) : view.rows;
}

/** При открытии: «Продать», если есть что продать, иначе «Купить» — пустую вкладку продажи показывать незачем. */
export const shopDefaultKind = (view) => (view.rows.some(r => r.canSell) ? 'sell' : 'buy');

/** Какой товар выбран в вкладке: прежний, если с ним можно сделать сделку, иначе первый, с которым можно. */
export function shopPick(view, kind, current) {
  const rows = shopRowsFor(view, kind), usable = r => (kind === 'sell' ? r.canSell : r.canBuy), cur = rows.find(r => r.id === current);
  return (cur && usable(cur) ? cur : rows.find(usable) || rows[0])?.id;
}
