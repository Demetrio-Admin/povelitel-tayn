// Состояние возобновляемых мест боя (v0.10.0). Без Phaser: им пользуются и сцена, и проверка боя на сервере (v0.14.0).

/**
 * v0.10.0: живое состояние возобновляемого места (cfg.repeatSec): { wins — победных циклов, at — время последней победы }.
 * История первой победы (state.enemies) не очищается; враг снова на месте, когда прошло repeatSec с последней победы.
 * Возврат через несколько часов даёт одного врага (и одну выдачу запаса), а не несколько циклов.
 */
export const repKey = (spawnId) => `rep:${spawnId}`;
export function repState(state, spawnId) { return state.getObject(repKey(spawnId)) || null; }
/** Записать победу на возобновляемом месте (без сервера — сразу; на сервере — проверка боя). */
export function recordRepeatWin(state, spawnId) {
  const r = repState(state, spawnId);
  state.setObject(repKey(spawnId), { wins: (r?.wins || 0) + 1, at: state.now() });
}
/** Побеждён ли враг сейчас (с учётом возрождения возобновляемых мест). */
export function enemyDownNow(state, cfg) {
  if (!state.isEnemyDefeated(cfg.id)) return false;
  if (!cfg.repeatSec) return true;
  const r = repState(state, cfg.id);
  if (!r || !Number.isFinite(r.at)) return false;  // старая победа без отметки времени — место уже восстановилось
  return state.now() - r.at < cfg.repeatSec * 1000;
}

