// The asset manifest is the catalog: new shipped images appear here automatically.
import { ASSET_FILES, DISPLAY_SIZE } from '../config/assets.manifest.js';
import { PROP_DEFS } from './propDefs.js';

export const ASSET_GROUPS = {
  nature:'Деревья, цветы и природа', furniture:'Мебель и оборудование', town:'Город и здания',
  objects:'Предметы и магия', characters:'Персонажи', enemies:'Монстры', animals:'Животные',
  ground:'Полы, стены и покрытия', portraits:'Портреты', ui:'Иконки и интерфейс', backgrounds:'Фоны',
};
const NAMES = {
  bed_01:'Кровать',table_01:'Стол',bookshelf_01:'Книжный шкаф',cauldron_01:'Котёл',wardrobe_01:'Шкаф',rug_01:'Ковёр',
  herb_bundle_01:'Связка трав',plant_pot_01:'Растение в горшке',trunk_01:'Сундук для вещей',campfire_01:'Костёр',
  crate_01:'Ящик',barrel_01:'Бочка',market_stall_01:'Торговая лавка',notice_board_01:'Доска поручений',city_lamp_01:'Городской фонарь',
  city_crate:'Городской ящик',city_barrel:'Городская бочка',city_house:'Жилой дом',city_frozen_house:'Замёрзший дом',
  city_bank_counter:'Банковская стойка',city_bank_safe:'Сейф',city_archive_shelf:'Архивный стеллаж',city_archive_desk:'Читальный стол',
  city_society_workbench:'Стол с приборами',city_coven_cabinet:'Шкаф с травами',city_coven_table:'Стол ковена',city_duel_rack:'Дуэльная стойка',
  city_equipment:'Ящики с оборудованием',city_lab_machine:'Лабораторный прибор',city_coolant:'Повреждённый резервуар',city_coolant_stable:'Исправный резервуар',
  city_fountain:'Фонтан',fountain_frozen:'Замёрзший фонтан',city_warehouse:'Склад',city_cellar:'Погреб',city_lab_door:'Дверь лаборатории',city_lab_door_open:'Открытая дверь лаборатории',
  city_door_open:'Открытая дверь',city_archive_document:'Архивная рукопись',city_lab_journal:'Журнал опытов',city_letters:'Письма',city_debris:'Завал',city_frost_trace:'Следы инея',
  city_wood_floor:'Деревянный пол',city_stone_floor:'Каменный пол',city_paving:'Мостовая',city_paving_frost:'Мостовая с инеем',city_wall:'Каменная стена',city_timber:'Деревянная стена',
  grass_ground_01:'Трава',dirt_path_01:'Земляная тропа',stone_path_01:'Каменная дорога',swamp_water_01:'Вода',wooden_floor_01:'Пол дома',wall_wood_01:'Деревянная стена дома',wall_ruin_01:'Разрушенная стена',
  snow_ground_01:'Снежная земля',grave_ground_01:'Земля кладбища',gravestone_01:'Надгробие 1',gravestone_02:'Надгробие 2',crypt_01:'Склеп',
  tree_frost_01:'Заснеженное дерево 1',tree_frost_02:'Заснеженное дерево 2',dead_tree_grey_01:'Серое сухое дерево',
  heavy_boulder_01:'Тяжёлый валун',rock_medium_01:'Средний камень',moon_plant_01:'Лунное растение',dry_bush_01:'Сухой куст',
  magic_book_01:'Магическая книга',lunar_altar_01:'Лунный алтарь',lunar_flame_01:'Лунное пламя',fire_circle_01:'Круг Огня',ancient_gate_01:'Древние ворота',
  corrupted_roots_01:'Заросли корней',moon_herb_01:'Лунная трава',mushrooms_brown_01:'Лесные грибы',resin_log_01:'Бревно со смолой',rune_sigil_01:'Рунический знак',rune_slab_01:'Руническая плита',bramble_01:'Колючие заросли',
  cat_01:'Кот Уголёк',world_map_01:'Карта мира',city_patient_miron:'Мирон',city_resident_woman:'Жительница',city_resident_man:'Житель',
};
const PEOPLE={mirra:'Мирра',veda:'Веда',goran:'Морган',selena:'Селена',ilaria:'Илария',severin:'Северин',merchant:'Торговец',banker:'Агата',duelist:'Кассиан',rowena:'Ровена',tikhon:'Тихон',nerys:'Нэрис'};
const WORDS={icon:'Иконка',portrait:'Портрет',enemy:'Монстр',life:'',bird:'Птица',squirrel:'Белка',rabbit:'Заяц',leaf:'Лист',
  hero:'Ведьма',warlock:'Колдун',down:'спереди',up:'со спины',side:'сбоку',tree:'Дерево',autumn:'осеннее',dark:'тёмное',frost:'иней',
  fire:'Огонь',ice:'Лёд',seal:'Астрал',telekinesis:'Телекинез',potion:'Зелье',life:'Жизнь',mana:'Мана',bank:'Банк',menu:'Меню',
  alchemy:'Алхимия',talk:'Разговор',gather:'Сбор',inspect:'Осмотр',journal:'Журнал',bag:'Сумка',coin:'Монета',sapphire:'Сапфир',
  guardian:'Страж',scavenger:'Камнеед',rootling:'Корневик',wolf:'Волк',alpha:'Вожак',collector:'Сборщик',critter:'Тварь',grave:'Кладбище',
  hound:'Пёс',barrow:'Курган',warden:'Страж',wisp:'Огонёк',volunteer:'Доброволец',experimental:'Экспериментальный',construct:'Конструкт',
  arena:'Арена',city:'Город',lab:'Лаборатория',duel:'Дуэль',frostwood:'Морозный лес',graveyard:'Кладбище',forest:'Лес',
  shard:'Осколок',dust:'Пыль',core:'Ядро',heart:'Сердце',ember:'Уголёк',lock:'Замок',hand:'Действие',map:'Карта',rating:'Рейтинг',
  chat:'Чат',forum:'Форум',settings:'Настройки',close:'Закрыть',drop:'Капля',fight:'Бой',moon:'Лунный',herb:'Трава',mushroom:'Гриб',resin:'Смола',
  cold:'Холод',warm:'Согревающее',stable:'Стабилизирующее',brittle:'Хрупкость',guard:'Защита',amulet:'Амулет',focus:'Фокус',lunar:'Лунный',
  reinforced:'Укреплённая',astral:'Астральный',lens:'Линза',wick:'Фитиль',compound:'Состав',bundle:'Сбор',broken:'Повреждённый',restored:'Восстановленный',
  empty:'Пустой',stash:'Тайник',dim:'Тусклый',lit:'Светящийся',sigil:'Знак',node:'Сердце рощи',field:'Поле',rock:'Камень',light:'Лёгкий',heavy:'Тяжёлый',crystal:'Кристалл',
};
export function assetName(key) {
  key=String(key);
  if(NAMES[key]||PROP_DEFS[key])return NAMES[key]||PROP_DEFS[key].name;
  const p=key.match(/^(npc|portrait)_(.+)$/);if(p&&PEOPLE[p[2]])return (p[1]==='portrait'?'Портрет: ':'')+PEOPLE[p[2]];
  return key.replace(/^life_/,'').split('_').map(w=>WORDS[w]??w).join(' ').replace(/\s+/g,' ').trim();
}
export function assetGroup(key) {
  if(/^(icon_|ui_)/.test(key))return 'ui'; if(key.startsWith('portrait_'))return 'portraits';
  if(key.startsWith('arena_')||key==='world_map_01')return 'backgrounds';
  if(/^(npc_|hero_|warlock_|city_(resident|patient))/.test(key))return 'characters';
  if(key.startsWith('enemy_'))return 'enemies'; if(/^(life_|cat_)/.test(key))return 'animals';
  if(/ground|floor|paving|path|wall_|timber|swamp_water/.test(key))return 'ground';
  if(/^(tree_|dead_tree_|birch_|bush_|flower_|mushroom|reeds_|moon_plant|dry_bush|city_frost_herb)/.test(key))return 'nature';
  if(/bed_|table_|bookshelf_|wardrobe_|rug_|herb_bundle|plant_pot|trunk_|city_(bank_|archive_(shelf|desk)|society_|coven_(cabinet|table)|duel_rack|equipment|lab_machine|coolant)/.test(key))return 'furniture';
  if(/city_|lantern|lamp|crate|barrel|market|notice|sign|house|door|fountain|gravestone|crypt/.test(key))return 'town';
  return 'objects';
}
export const ASSET_CATALOG=Object.entries(ASSET_FILES).filter(([,src])=>!!src).map(([key,src])=>({key,src,name:assetName(key),group:assetGroup(key),size:DISPLAY_SIZE[key]||[128,128]}));
export function defaultAssetSolid(key){
  if(PROP_DEFS[key])return PROP_DEFS[key].solid;
  if(!['furniture','town'].includes(assetGroup(key)))return null;
  const [w,h]=DISPLAY_SIZE[key]||[128,128];
  return {w:Math.max(12,Math.round(w*0.8)),h:Math.max(8,Math.min(35,Math.round(h*0.18)))};
}
