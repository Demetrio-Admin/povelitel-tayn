// TutorialSystem — одноразовые неблокирующие подсказки. Хранит только факт «показано» в сохранении
// (state.data.tutorial), саму картинку (стрелки, подсветки) рисует UIScene. Не зависит от Phaser.

import { MSG } from '../state/EventBus.js';

// тексты подсказок; target — что подсветить в UI
export const HINTS = {
  move:        { text: 'Чтобы идти, ведите пальцем по экрану.\nНа компьютере — клавиши WASD или стрелки.', target: 'swipe', ttl: 0 },
  interact:    { text: 'Рядом можно действовать. Нажмите круглую кнопку справа внизу\n(на компьютере — E или Пробел).', target: 'context', ttl: 8000 },
  telekinesis: { text: 'Бирюзовый знак значит: этот предмет можно сдвинуть или бросить.\nНажмите кнопку Телекинеза (на компьютере — 1).', target: 'telekinesis', ttl: 8000 },
  combat_warning: { text: 'Враг замахивается! Нажмите Телекинез, чтобы сбить удар.', target: 'telekinesis', ttl: 0 },
  fire:        { text: 'Новый дар — Огонь: он сжигает чёрные корни и зажигает факелы.\nКнопка Огня рядом с Телекинезом (на компьютере — 2).', target: 'fire', ttl: 8000 },
  bag:         { text: 'В сумке лежат травы, зелья, дары и амулеты.\nОткройте её кнопкой внизу (на компьютере — B).', target: 'bag', ttl: 6000 },
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
