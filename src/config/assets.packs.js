// Пакеты графики: что грузить сразу, а что — только при входе в локацию.
//
// «core» — всё, что нужно в любом месте (герой, предметы, интерфейс, лес, карта мира, противники).
// Остальное подгружается пакетами: у каждой локации свой список (LOCATION_PACKS), так что игрок
// в Лесу не качает город и главы 2–3. Правила тут намеренно простые — по папке файла:
//   * неизвестная папка → core (при ошибке в правилах игра грузит больше, а не показывает «дыры»);
//   * иконки, портреты, NPC и спутники → всегда core: они видны в сумке и диалогах в любой локации;
//   * ключи из CORE_KEYS используются сценами сразу нескольких пакетов (нашла проверка tests/asset-packs-test.mjs).
import { ASSET_FILES } from './assets.manifest.js';
import { CITY_WITCH_ATLASES, CITY_WITCH_SPRITES } from './city.witch.art.js';

export const PACK_IDS = ['core', 'city', 'chapter2', 'chapter3', 'frostwood', 'graveyard'];

const FOLDER_PACK = {
  'city-final': 'city', 'city-rooms': 'city', 'city-life': 'city', 'city-archive': 'city', 'city-cozy': 'city',
  'city-interiors': 'city', 'city-neighborhoods': 'city', 'city-laboratory': 'city', 'city-witch': 'city', 'city-walk': 'city',
  chapter2: 'chapter2',
  chapter3: 'chapter3',
  frostwood: 'frostwood',
  graveyard: 'graveyard',
};

/** Ключи, которые нужны сценам нескольких пакетов сразу (брусчатка-подложка и жетон из главы 3 в Архиве). */
export const CORE_KEYS = new Set(['city_final_paving', 'city_walk_paving', 'city_archive_worn_paving', 'glass_leaf_token']);

const ALWAYS_CORE = /^(icon_|portrait_|npc_|companion_|enemy_|ui_)/;

/** Противники живут только в своей локации и в бою из неё — их арт едет вместе с её пакетом. Остальные enemy_* остаются в core. */
const ENEMY_PACK = Object.fromEntries(Object.entries({
  chapter2: ['frost_critter', 'frost_collector', 'frost_collector_elite', 'ice_guardian', 'volunteer', 'volunteer_miron', 'experimental_construct', 'severin'],
  chapter3: ['glass_stoat', 'echo', 'glass_wolf', 'needle', 'needle_elite', 'glass_guardian', 'iva_reflection'],
  frostwood: ['frost_wolf', 'frost_alpha'],
  graveyard: ['grave_wisp', 'grave_hound', 'barrow_warden'],
}).flatMap(([pack, names]) => names.map((n) => [`enemy_${n}`, pack])));

const folderOf = (path) => String(path).split('?')[0].split('/')[1];

/** Пакет ключа манифеста. */
export function packOfKey(key, path) {
  if (!path || CORE_KEYS.has(key)) return 'core';
  if (ENEMY_PACK[key]) return ENEMY_PACK[key];
  if (ALWAYS_CORE.test(key)) return 'core';
  return FOLDER_PACK[folderOf(path)] || 'core';
}

/** { packId: { key: path } } — картинки каждого пакета (атласы города входят в пакет city). */
export const PACK_IMAGES = (() => {
  const out = Object.fromEntries(PACK_IDS.map((id) => [id, {}]));
  // ключи домов-вырезок из атласа города грузятся не файлами, а нарезаются из атласа (world/cityWitchArt.js)
  for (const [key, path] of Object.entries(ASSET_FILES)) if (path && !CITY_WITCH_SPRITES[key]) out[packOfKey(key, path)][key] = path;
  for (const [key, path] of Object.entries(CITY_WITCH_ATLASES)) out.city[key] = path;
  return out;
})();

/** Ключ → пакет, только для не-core. */
export const LAZY_KEYS = (() => {
  const m = new Map();
  for (const id of PACK_IDS) if (id !== 'core') for (const key of Object.keys(PACK_IMAGES[id])) m.set(key, id);
  return m;
})();

const CHAPTER2_TOO = ['core', 'chapter2'];
/** Какие пакеты нужны локации (комнаты города — как город). Неизвестная локация — все пакеты. */
export function packsForLocation(loc) {
  const id = loc?.parent || loc?.id;
  switch (id) {
    case 'forest': return ['core'];
    case 'city': return [...CHAPTER2_TOO, 'city'];
    case 'grove': return [...CHAPTER2_TOO, 'chapter3'];
    case 'frostwood': return [...CHAPTER2_TOO, 'frostwood'];
    case 'graveyard': return [...CHAPTER2_TOO, 'graveyard'];
    default: return [...PACK_IDS];
  }
}

export const packFileCount = (id) => Object.keys(PACK_IMAGES[id] || {}).length;
