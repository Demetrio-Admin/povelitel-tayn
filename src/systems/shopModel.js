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
