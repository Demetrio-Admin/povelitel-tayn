// Подключение к облаку (Supabase): аккаунты и сохранения в базе данных.
// URL проекта и anon-ключ НЕ секретны — они рассчитаны на публичный клиент, а доступ к данным
// защищают политики Row Level Security из supabase/schema.sql. Секретный service_role ключ сюда класть нельзя.
//
// Значения берутся из переменных сборки VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (GitHub Actions: Settings →
// Secrets and variables → Actions → Variables) либо вписываются ниже. Пока они пусты, игра работает как раньше:
// без входа, прогресс только на этом устройстве.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const CLOUD = {
  url: env.VITE_SUPABASE_URL || '',
  anonKey: env.VITE_SUPABASE_ANON_KEY || '',
  pushDelayMs: 8000,   // как часто отправлять прогресс в облако (не чаще)
  timeoutMs: 9000,     // ожидание ответа сервера
  bootTimeoutMs: 3500, // сколько ждать облако при запуске игры
};
