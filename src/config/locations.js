// v0.27.0 — локации и карта мира. Каждая глава — отдельная локация (свой мирок): загружается только она, камера и герой не выходят
// за её края, соседей не видно. Между локациями ходят только через карту мира, и только у выхода — указателя «Карта мира» на краю
// локации. Новая глава = новая локация в этом списке + точка на карте.
//
// Данные локаций лежат на общем «холсте» координат (у каждой — свой прямоугольник rect, они не пересекаются): так id объектов,
// сохранения и сервер остаются прежними. Игрок этого холста не видит — для него это отдельные места.
import { CITY_START, FOREST_RETURN } from './world.city.js';
import { FROSTWOOD_START, GRAVEYARD_START } from './world.expeditions.js';

export const LOCATIONS = [
  {
    id: 'forest', name: 'Лес Мирры', subtitle: 'Глава I', exit: 'exit_forest',
    rect: { x: 0, y: 0, w: 1800, h: 5400 }, extraTop: 340, extraBottom: 500,   // тёмный лес за краями (только картинка)
    arrival: FOREST_RETURN,
    map: { x: 150, y: 525 },
    text: 'Дом Мирры, Лунный алтарь, древний круг Огня и старый лес за Древними воротами.',
  },
  {
    id: 'city', name: 'Город', subtitle: 'Глава II', exit: 'exit_city',
    rect: { x: 1800, y: 1300, w: 1800, h: 4100 },
    arrival: CITY_START,
    requires: 'ch2_start', lockedText: 'Дорогу в город покажет Мирра после главы I.',
    map: { x: 330, y: 346 },
    text: 'Город под инеем: площадь, Архив, Общество Преображения, Замёрзший квартал, Дуэльный зал и Дом Ковенов.',
  },
  {
    id: 'frostwood', name: 'Морозный лес', subtitle: 'Вылазка', exit: 'exit_frostwood', expedition: true,
    rect: { x: 3600, y: 0, w: 1800, h: 2650 },
    arrival: FROSTWOOD_START,
    requires: 'chapter_2_complete', lockedText: 'Вылазки откроются после главы II.',
    map: { x: 470, y: 170 },
    text: 'Волки и Вожак метели. Холод им не страшен — Лёд бьёт слабее, а вот Огонь они не любят.\n'
      + 'Внутри: морозник и ледяные кристаллы, четыре волчицы, Вожак метели и его логово (инеевый осколок). Звери возвращаются через 10 минут, вожак — через час.',
  },
  {
    id: 'graveyard', name: 'Старое кладбище', subtitle: 'Вылазка', exit: 'exit_graveyard', expedition: true,
    rect: { x: 3600, y: 2650, w: 1800, h: 2750 },
    arrival: GRAVEYARD_START,
    requires: 'chapter_2_complete', lockedText: 'Вылазки откроются после главы II.',
    map: { x: 470, y: 600 },
    text: 'Могильные огоньки, псы и Страж кургана. Огонь здесь почти бесполезен; Астрал пробивает и защиту огоньков, и броню стража. Псам нипочём Телекинез.\n'
      + 'Внутри: руническая пыль, грибы и лунный осколок, четверо противников, Страж кургана и его сокровище. Противники возвращаются через 10 минут, страж — через час.',
  },
];

export const locationById = (id) => LOCATIONS.find((l) => l.id === id) || null;

const inside = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Локация точки: та, в чей прямоугольник она попадает; иначе — ближайшая (старые сохранения на границах). */
export function locationAt(x, y) {
  const hit = LOCATIONS.find((l) => inside(x, y, l.rect));
  if (hit) return hit;
  const d = (l) => { const r = l.rect; const dx = Math.max(r.x - x, 0, x - (r.x + r.w)); const dy = Math.max(r.y - y, 0, y - (r.y + r.h)); return dx * dx + dy * dy; };
  return [...LOCATIONS].sort((a, b) => d(a) - d(b))[0];
}

/** Точка (объект, враг, украшение) — в этой локации. */
export const inLocation = (o, loc) => !loc || inside(o.x, o.y, loc.rect);
/** Прямоугольник (стена, пол, водоём) задевает локацию. */
export const touchesLocation = (r, loc) => !loc || (r.x < loc.rect.x + loc.rect.w && r.x + r.w > loc.rect.x && r.y < loc.rect.y + loc.rect.h && r.y + r.h > loc.rect.y);

/** Открыта ли локация для героя (state.hasEvent). */
export const locationOpen = (loc, hasEvent) => !loc.requires || hasEvent(loc.requires);
