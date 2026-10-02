// Подключение к серверу игры (Supabase): аккаунты, гости и прогресс игрока.
// URL проекта и anon (publishable) ключ НЕ секретны — они рассчитаны на браузер; данные защищают политики и функции
// из supabase/schema.sql. Ключ service_role в игру класть нельзя: он живёт только в Edge Function.
//
// Значения берутся из переменных сборки (GitHub Actions: Settings → Secrets and variables → Actions → Variables):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, необязательно VITE_LOGIN_EMAIL_DOMAIN.
// Пока URL и ключ пусты, игра работает в режиме разработки без сервера (прогресс в этом браузере) и честно это пишет.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const CLOUD = {
  url: env.VITE_SUPABASE_URL || '',
  anonKey: env.VITE_SUPABASE_ANON_KEY || '',
  // домен служебных адресов для входа по нику; должен совпадать с LOGIN_EMAIL_DOMAIN в Edge Function account
  loginDomain: env.VITE_LOGIN_EMAIL_DOMAIN || 'players.witch-rpg.invalid',
  timeoutMs: 10000,      // ожидание ответа сервера
  saveDelayMs: 600,      // важное (награда, предмет, событие) уходит на сервер почти сразу
  minorDelayMs: 15000,   // позиция и время игры — не чаще раза в 15 секунд
};
