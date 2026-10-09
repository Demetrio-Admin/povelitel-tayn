import { ITEMS } from '../config/balance.progression.js';
import { BAG_ITEMS } from '../config/bag.js';
import { AMULETS } from '../config/build.js';
import { CITY_POSITIONS } from '../config/city.plan.js';
import { CITY_START, FOREST_RETURN } from '../config/world.city.js';

const counted = new Set(BAG_ITEMS);
export const ADMIN_CATALOG = {
  ...Object.fromEntries(Object.entries(ITEMS).map(([id, v]) => [id, {
    name: v.name, icon: v.icon,
    type: id === 'coins' ? 'money' : Object.hasOwn(AMULETS, id) ? 'amulet' : counted.has(id) ? 'item' : 'story',
    storage: id === 'coins' ? 'wallet' : Object.hasOwn(AMULETS, id) ? 'collection' : counted.has(id) ? 'bag' : 'story',
  }])),
  sapphires: { name: 'Сапфиры', icon: 'icon_sapphire', type: 'sapphire', storage: 'wallet' },
};
export const ADMIN_CHECKPOINTS = {
  forest: { name: 'Лес Мирры', ...FOREST_RETURN },
  city: { name: 'Вход в город', ...CITY_START, requires: 'ch2_start' },
  nerys: { name: 'У Нэрис', ...CITY_POSITIONS.npc_nerys, y:CITY_POSITIONS.npc_nerys.y+130, requires: 'ch2_nerys_met', blockedBy: 'ch2_final_start' },
  nerys_final: { name: 'У Нэрис перед экзаменом', ...CITY_POSITIONS.npc_nerys_final, y:CITY_POSITIONS.npc_nerys_final.y+130, requires: 'ch2_final_start' },
};
export const ADMIN_GIFT_PROOFS = {
  telekinesis: { 1: 'unlock_telekinesis_1', 2: 'telekinesis_2_complete' },
  fire: { 1: 'unlock_fire_1' },
  seal: { 1: 'unlock_seal_1' },
  ice: { 1: 'unlock_ice_1', 2: 'unlock_ice_2', 3: 'ch2_ice3' },
};
export const ADMIN_KITS = {
  supplies: { name: 'Припасы для теста', items: { moon_herb: 10, forest_mushroom: 5, tree_resin: 5, rune_dust: 5, elixir_life: 3, elixir_mana: 3 } },
};
export const ADMIN_RULES = { catalog: ADMIN_CATALOG, checkpoints: ADMIN_CHECKPOINTS, gifts: ADMIN_GIFT_PROOFS, kits: ADMIN_KITS };
export const ADMIN_TIMEZONE = 'Asia/Yekaterinburg';
export const ADMIN_SOURCES = {
  gather: 'Сбор', world: 'Мир и тайники', combat: 'Бой', trade: 'Торговля', craft: 'Крафт', quest: 'Задание',
  gift: 'Дары', bag: 'Сумка', coven: 'Ковен', bank: 'Банк', admin: 'Команда', reset: 'Новая игра',
  starter: 'Стартовый набор', sync: 'Сохранение', server: 'Сервер', opening: 'Начальные остатки', reward: 'Награда',
  purchase: 'Покупка сапфиров', welcome: 'Подарок', research: 'Изучение', speedup: 'Ускорение', respec: 'Смена ветки', preset: 'Набор даров', duel: 'Арена',
};
export const ADMIN_STORAGES = { wallet: 'Кошелёк', bag: 'Сумка', pending: 'Ожидающая добыча', collection: 'Амулеты', story: 'Сюжетные предметы', gift: 'Дары', capacity: 'Вместимость сумки' };
export const ADMIN_GIFTS = { telekinesis: 'Телекинез', fire: 'Огонь', seal: 'Астрал', ice: 'Лёд' };
