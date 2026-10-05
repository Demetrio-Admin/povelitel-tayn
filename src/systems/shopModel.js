// v0.19.0 — модель лавки торговца для окна (без Phaser, проверяется тестами). Цены и решения — на сервере (op shop_buy / shop_sell).
import { SHOP, sellPrice } from '../config/shop.js';
import { ITEMS } from '../config/balance.progression.js';

/** Строки лавки: что купить (цена, хватает ли монет) и что продать (сколько есть, цена продажи). */
export function shopView(state) {
  const coins = state.item('coins');
  const open = state.hasEvent(SHOP.requires);
  const rows = Object.entries(SHOP.buy).map(([id, price]) => ({
    id, name: ITEMS[id]?.name || id, icon: ITEMS[id]?.icon || 'icon_shard',
    buy: price, canBuy: coins >= price, sell: sellPrice(id), have: state.item(id), canSell: state.item(id) > 0,
  }));
  return { open, coins, rows };
}
