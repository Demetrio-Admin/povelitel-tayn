import { RESOURCES, POTIONS, CRAFT_ITEMS } from './resources.js';

// One unit of a resource or consumable takes one place. Story items, equipment
// and currencies have their own storage and never prevent story progress.
export const BAG = { initial: 100, increment: 50, price: 100, max: 1_000_000_000, version: 29 };
export const BAG_ITEMS = [...Object.keys(RESOURCES), ...Object.keys(POTIONS), ...Object.keys(CRAFT_ITEMS), 'crimson_ember', 'moonstone'];
const counted = new Set(BAG_ITEMS);
export const takesBagSpace = id => counted.has(id);
export const bagUsed = inventory => BAG_ITEMS.reduce((n, id) => n + Math.max(0, Number(inventory?.[id]) || 0), 0);
export function bagData(objects) {
  const raw = objects?.player_bag;
  return {
    capacity: Number.isInteger(raw?.capacity) && raw.capacity >= BAG.initial && raw.capacity <= BAG.max ? raw.capacity : BAG.initial,
    pending: Object.fromEntries(Object.entries(raw?.pending || {}).filter(([id, n]) => counted.has(id) && Number.isInteger(n) && n > 0)),
    version: raw?.version === BAG.version ? BAG.version : 0,
  };
}
export const bagView = state => { const b = bagData(state.data.worldObjects), used = bagUsed(state.data.inventory); return { ...b, used, free: Math.max(0, b.capacity - used), price: BAG.price, increment: BAG.increment }; };
export const bagRules = () => ({ ...BAG, items: BAG_ITEMS });

export const GIFT_PRICES = {
  storyTelekinesis: { coins: 150, sapphires: 0 },
  storyIce2: { coins: 500, sapphires: 0 },
  storyIce3: { coins: 3000, sapphires: 0 },
  tier2: { coins: 2000, sapphires: 200 },
  tier3: { coins: 10000, sapphires: 750 },
};
