// v0.9.1 — покадровые изменения состояния мира (время игры, восстановление HP и маны). Без Phaser.
// Вынесено из ExplorationScene.update, чтобы одно и то же правило работало в игре и в тестах.
//
// v0.12.0: HP и мана восстанавливаются по часам (и на сервере по его времени, даже офлайн), а не по кадрам:
// окна, диалоги и скрытая вкладка восстановлению не мешают; в бою время не засчитывается (state.data.combatSince).
// Пока выполняется атомарное действие сервера (лечение у Мирры, крафт — services.actions.busy), мир стоит: время игры не идёт,
// героиня не двигается. Запрос длится доли секунды — заметить остановку почти невозможно.
import * as vitals from '../state/vitals.js';

/** Идёт ли сейчас действие сервера, на время которого мир замирает. */
export const serverActionBusy = (services) => !!services?.actions?.busy;

/**
 * Один кадр мира. deltaMs — длительность кадра; nowMs — настенные часы (Date.now()).
 *  frozen — действие сервера: время игры не идёт;
 *  inHouse — дом Мирры (мана быстрее).
 * Время игры идёт и при открытых окнах/диалогах (как раньше), но не во время действия сервера.
 * Возвращает true, если изменились HP или мана.
 */
export function advanceWorld(state, deltaMs, { frozen = false, inHouse = false, nowMs = Date.now() } = {}) {
  const changed = vitals.regenWall(state, nowMs, { inHouse });
  if (!frozen && deltaMs > 0) state.data.stats.playTimeMs += deltaMs;
  return changed;
}
