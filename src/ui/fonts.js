// Ждёт загрузки шрифта интерфейса (Philosopher, поддерживает кириллицу; <link> лежит в index.html).
// Если сеть недоступна или шрифт не успел — через timeoutMs игра стартует на запасном Georgia.
export async function loadUIFont(timeoutMs = 2000) {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const sample = 'Witch RPG Ведьма Телекинез 0123456789';
  const load = Promise.all([document.fonts.load(`400 20px Philosopher`, sample), document.fonts.load(`700 20px Philosopher`, sample)]).catch(() => {});
  await Promise.race([load, new Promise(r => setTimeout(r, timeoutMs))]);
}
