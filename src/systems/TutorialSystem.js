// TutorialSystem — одноразовые неблокирующие подсказки. Хранит только факт «показано» в сохранении
// (state.data.tutorial), саму картинку (стрелки, подсветки) рисует UIScene. Не зависит от Phaser.

import { MSG } from '../state/EventBus.js';

// тексты подсказок; target — что подсветить в UI
export const HINTS = {
  move:        { text: 'Проведите пальцем по экрану, чтобы идти\n(на ПК — WASD или стрелки)', target: 'swipe', ttl: 0 },
  interact:    { text: 'Нажмите кнопку действия (E / Пробел)', target: 'context', ttl: 9000 },
  telekinesis: { text: 'Бирюзовый знак — цель для Телекинеза.\nНажмите кнопку дара (1)', target: 'telekinesis', ttl: 9000 },
  combat_warning: { text: 'Сейчас! Прервите атаку Телекинезом', target: 'telekinesis', ttl: 0 },
  fire:        { text: 'Новый дар! Огонь сжигает корни и зажигает факелы (2)', target: 'fire', ttl: 9000 },
  bag:         { text: 'В сумке — ресурсы, расходники, дары и амулеты (B)', target: 'bag', ttl: 6000 },
};

export class TutorialSystem {
  constructor(state, settings, bus) {
    this.state = state;
    this.settings = settings;
    this.bus = bus;
    this.active = null; // id текущей подсказки
  }

  get seenList() {
    if (!Array.isArray(this.state.data.tutorial)) this.state.data.tutorial = [];
    return this.state.data.tutorial;
  }

  enabled() { return this.settings ? this.settings.get('hints') !== false : true; }
  seen(id) { return this.seenList.includes(id); }
  canShow(id) { return this.enabled() && !this.seen(id) && !!HINTS[id]; }

  /** Показать подсказку (если ещё не была). Возвращает true, если показана. */
  show(id) {
    if (!this.canShow(id) || this.active === id) return false;
    if (this.active) this.complete(this.active);
    this.active = id;
    this.bus?.emit(MSG.TUTORIAL, { id, ...HINTS[id] });
    return true;
  }

  /** Отметить подсказку выполненной (и скрыть, если активна). */
  complete(id) {
    if (!this.seen(id)) this.seenList.push(id);
    if (this.active === id) {
      this.active = null;
      this.bus?.emit(MSG.TUTORIAL, null);
    }
  }

  /** Спрятать текущую подсказку, не отмечая её. */
  hide() {
    if (!this.active) return;
    this.active = null;
    this.bus?.emit(MSG.TUTORIAL, null);
  }

  /** Отключение подсказок в настройках сразу прячет активную. */
  onSettingsChanged() { if (!this.enabled()) this.hide(); }
}
