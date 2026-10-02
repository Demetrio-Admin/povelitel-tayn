// Ник и пароль: проверка, нормализация и служебный адрес для входа. Без Phaser и DOM.
//
// Ник = логин = имя персонажа. Регистр при входе и проверке уникальности не важен («Dmitry» = «DMITRY»),
// но игрок видит своё написание. Supabase Auth умеет входить только по почте или телефону, поэтому для каждого
// ника есть служебный адрес вида u<хэш ника>@<домен>. Игрок его никогда не видит и не вводит, писем на него не бывает.
// Те же правила продублированы в supabase/functions/account/index.ts и supabase/schema.sql (совпадение проверяют тесты).

export const NICK_MIN = 3;
export const NICK_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72; // предел bcrypt, которым Supabase хэширует пароли

const ALLOWED = /^[A-Za-zА-Яа-яЁё0-9_]+$/;
const LATIN = /[A-Za-z]/;
const CYRILLIC = /[А-Яа-яЁё]/;

export const NICK_ERRORS = {
  short: `Никнейм должен содержать минимум ${NICK_MIN} символа.`,
  long: `Никнейм должен быть не длиннее ${NICK_MAX} символов.`,
  chars: 'В никнейме можно использовать только буквы, цифры и знак _.',
  mixed: 'Никнейм должен быть целиком на латинице или целиком на кириллице.',
  letter: 'В никнейме должна быть хотя бы одна буква.',
};

/** Нормализованный ник: по нему проверяются уникальность и вход. */
export function normalizeNickname(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * Проверка ника. Возвращает { ok, value, norm, error }.
 * Смешивать латиницу и кириллицу нельзя: иначе «Dmitry» с русской «у» выглядел бы как чужой ник.
 */
export function validateNickname(raw) {
  const value = String(raw ?? '').trim();
  const norm = value.toLowerCase();
  const fail = (error) => ({ ok: false, value, norm, error });
  if (value.length < NICK_MIN) return fail(NICK_ERRORS.short);
  if (value.length > NICK_MAX) return fail(NICK_ERRORS.long);
  if (!ALLOWED.test(value)) return fail(NICK_ERRORS.chars);
  if (LATIN.test(value) && CYRILLIC.test(value)) return fail(NICK_ERRORS.mixed);
  if (!LATIN.test(value) && !CYRILLIC.test(value)) return fail(NICK_ERRORS.letter);
  return { ok: true, value, norm, error: null };
}

export function validatePassword(raw) {
  const value = String(raw ?? '');
  if (value.length < PASSWORD_MIN) return { ok: false, value, error: `Пароль должен содержать минимум ${PASSWORD_MIN} символов.` };
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) return { ok: false, value, error: 'Пароль слишком длинный.' };
  return { ok: true, value, error: null };
}

export function checkPasswordPair(pw, pw2) {
  const p = validatePassword(pw);
  if (!p.ok) return p;
  if (pw !== pw2) return { ok: false, value: p.value, error: 'Пароли не совпадают.' };
  return p;
}

async function sha256hex(text) {
  const bytes = new TextEncoder().encode(text);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('crypto.subtle недоступен (нужен https)');
  const buf = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Служебный адрес для входа по нормализованному нику. */
export async function loginEmail(norm, domain) {
  return `u${(await sha256hex(norm)).slice(0, 40)}@${domain}`;
}

/** Короткая форма ника для HUD. */
export function shortNick(nick, max = 9) {
  const s = String(nick || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
