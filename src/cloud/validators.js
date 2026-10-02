// Проверка полей форм входа и регистрации. Те же правила продублированы в supabase/schema.sql.
export const NICK_MIN = 3;
export const NICK_MAX = 16;
export const PASSWORD_MIN = 8;

/** Ник: буквы любого алфавита, цифры, пробел, _ и -. Возвращает { ok, value, error }. */
export function validateNickname(raw) {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (value.length < NICK_MIN) return { ok: false, value, error: `Ник — от ${NICK_MIN} символов` };
  if (value.length > NICK_MAX) return { ok: false, value, error: `Ник — не длиннее ${NICK_MAX} символов` };
  if (!/^[\p{L}\p{N}_\- ]+$/u.test(value)) return { ok: false, value, error: 'В нике можно только буквы, цифры, пробел, _ и -' };
  return { ok: true, value, error: null };
}

export function validateEmail(raw) {
  const value = String(raw ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return { ok: false, value, error: 'Введите почту, например name@mail.ru' };
  return { ok: true, value, error: null };
}

export function validatePassword(raw) {
  const value = String(raw ?? '');
  if (value.length < PASSWORD_MIN) return { ok: false, value, error: `Пароль — от ${PASSWORD_MIN} символов` };
  return { ok: true, value, error: null };
}

/** Короткая форма ника для HUD. */
export function shortNick(nick, max = 9) {
  const s = String(nick || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
