import { COLORS } from '../config/game.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { InteractiveObject } from './InteractiveObject.js';
import { dailyView } from '../systems/dailyModel.js';

/** v0.23.0 — доска поручений на площади: открывает окно поручений дня (UIScene.openDaily). «!» — есть что сдать. */
export class BoardObject extends InteractiveObject {
  get markerIcon() { return 'icon_journal'; }
  get markerColor() { return COLORS.gold; }
  get label() { return 'Поручения'; }
  get title() { return this.cfg.hint || 'Доска поручений'; }

  interact() {
    this.react(COLORS.gold, 1.06);
    services.audio.play('modal_open');
    services.bus.emit(MSG.OPEN_DAILY);
  }

  /** Есть ли готовое к сдаче поручение (для подсказки над доской). */
  hasReady() {
    try { return dailyView(services.state).rows.some(r => r.status === 'ready'); } catch { return false; }
  }
}
