// v0.9.2 — текущий герой (ведьма / колдун) и тексты с обращениями. Без Phaser: одно место для сцен, систем и тестов.
//
// Откуда берётся герой (источник задаётся один раз в services.js через setHeroSource):
//   онлайн — профиль сессии (profiles.hero_id → meta.hero → PlayerSession.hero);
//   без сервера — сохранение (GameState.data.heroId; старое сохранение без поля — ведьма).
// Неизвестный id показывается как ведьма (config/heroes.js heroById), но сам id не переписывается.
//
// Тексты: обычная строка — общая для обоих героев; объект { female, male } — полные варианты фраз (не окончания!);
// функция — вызывается с аргументами, её результат разрешается так же. Разрешённая строка дальше идёт в обычное
// форматирование ({goal}, {n:item}, переносы), поэтому порядок подстановок не меняется.
import { heroById, DEFAULT_HERO_ID } from '../config/heroes.js';

let source = () => DEFAULT_HERO_ID;

/** Источник id текущего героя (services.js; тесты подставляют свой). */
export function setHeroSource(fn) { source = typeof fn === 'function' ? fn : () => DEFAULT_HERO_ID; }

/** id текущего героя как есть (в том числе неизвестный — для показа используйте currentHero()). */
export function currentHeroId() {
  try { return source() || DEFAULT_HERO_ID; } catch (e) { return DEFAULT_HERO_ID; }
}

/** Определение текущего героя (внешность, название, пол). */
export const currentHero = () => heroById(currentHeroId());

/** Пол по определению героя, id героя или прямо 'female' / 'male'. */
export function genderOf(hero) {
  if (hero === 'female' || hero === 'male') return hero;
  if (typeof hero === 'string') return heroById(hero).gender;
  return hero?.gender === 'male' ? 'male' : 'female';
}

/** Пара полных вариантов текста: fm('Поняла.', 'Понял.'). */
export const fm = (female, male) => ({ female, male });

/** Текст с вариантами по полу? */
export const isGendered = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && ('female' in v || 'male' in v);

/**
 * Разрешить текст для героя. value: строка | { female, male } | функция (args) → одно из этого.
 * Нет нужного варианта — берётся женский (исходный) текст, чтобы игра никогда не показала пустую строку.
 */
export function heroText(value, hero = currentHero(), ...args) {
  if (typeof value === 'function') return heroText(value(...args), hero);
  if (isGendered(value)) {
    const v = value[genderOf(hero)];
    return v === undefined || v === null || v === '' ? value.female : v;
  }
  return value;
}

/** Текст для текущего героя (короткая форма heroText). */
export const T = (value, ...args) => heroText(value, currentHero(), ...args);
