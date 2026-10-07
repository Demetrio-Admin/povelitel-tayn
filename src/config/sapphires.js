// v0.17.0 — Сапфиры: премиальная валюта (docs/design/stage-2-design-pack-v0.2.md §34–35, chapter-2-balance-v0.1.md §31–33).
// Баланс и журнал — только на сервере (таблицы player_wallet и sapphire_ledger, supabase/schema.sql); клиент лишь показывает.
// Базовый курс: 1 рубль = 1 сапфир. Платёжный провайдер подключается отдельно.
export const SAPPHIRES = {
  rublesPerSapphire: 1,
  // ускорение изучения: за price сапфиров таймер короче на chunkMin минут; совсем до нуля нельзя (остаётся не меньше minLeftSec
  // и не меньше (1 − maxCutPct) полного времени); за сутки (UTC) — не больше dailyChunks таких шагов
  speedup: { chunkMin: 15, price: 1, maxCutPct: 0.75, minLeftSec: 60, dailyChunks: 24 },
  respec: 5,                     // смена ветки вместо монет (BRANCH_RESPEC.coins)
  preset: { price: 30, max: 3 }, // первый пресет бесплатный, следующие — за сапфиры, всего не больше max
  welcome: 3,                    // один раз — за открытие кошелька (в главе II — «Банк»)
};

/** Правила для сервера (_game_rules) и JS-зеркала: всё в миллисекундах. */
export function sapphireRules() {
  const s = SAPPHIRES.speedup;
  return {
    speedup: { chunkMs: s.chunkMin * 60_000, price: s.price, maxCutPct: s.maxCutPct, minLeftMs: s.minLeftSec * 1000, dailyChunks: s.dailyChunks },
    respec: SAPPHIRES.respec, presetPrice: SAPPHIRES.preset.price, presetMax: SAPPHIRES.preset.max, welcome: SAPPHIRES.welcome,
  };
}
