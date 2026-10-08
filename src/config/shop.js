// v0.19.0 — городской торговец (docs/design/chapter-2-balance-v0.1.md §25). Покупка — по цене buy, продажа — sellPct цены
// (округление вниз), чтобы не было перепродажи. Инеевый осколок и Сердце холода не продаются и не покупаются.
// Лавка открывается в городе (событие requires); операции shop_buy / shop_sell проверяет и выполняет сервер.
export const SHOP = {
  requires: 'city_merchant_open',
  buy: {
    moon_herb: 18, forest_mushroom: 20, tree_resin: 16, rune_dust: 28, lunar_shard: 45,
    frost_herb: 22, ice_crystal: 55,
  },
  sellPct: 0.33,
  maxQty: 1_000_000,
};

/** Цена, по которой торговец покупает у игрока одну штуку. */
export const sellPrice = (id) => (SHOP.buy[id] ? Math.floor(SHOP.buy[id] * SHOP.sellPct) : 0);

export function shopRules() {
  return { requires: SHOP.requires, buy: { ...SHOP.buy }, sell: Object.fromEntries(Object.keys(SHOP.buy).map((k) => [k, sellPrice(k)])), maxQty: SHOP.maxQty };
}
