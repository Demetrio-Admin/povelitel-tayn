// Quest / Event flags: фиксирует event keys, выдаёт награды и считает текущую цель.
import { QUEST_STEPS } from '../config/events.js';
import { EVENT_REWARDS } from '../config/balance.progression.js';
import { EVENT_ACTIONS } from '../config/serverRules.js';
import { MSG } from './EventBus.js';

export class QuestFlags {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
    this.mirror = null;   // v0.15.0: (action) => Promise — подтверждение на сервере (services.js); без сервера null
  }

  /**
   * Фиксирует событие. Повторный вызов безопасен: награда выдаётся один раз.
   * Возвращает результат applyReward или null, если событие уже было.
   * mirror: false — событие ставит сервер сам (изучение, старт боя): локально только показываем его.
   */
  complete(key, payload = {}, { mirror = true } = {}) {
    if (!this.state.markEvent(key)) return null;
    // v0.15.0: события игрока пишет только сервер. Эти — просьба игрока (EVENT_ACTIONS); остальные сервер ставит сам (мир, изучение, бой).
    if (mirror && EVENT_ACTIONS[key]) this.mirror?.({ op: 'event', key });
    const reward = EVENT_REWARDS[key];
    const result = reward ? this.state.applyReward(reward) : { levelUps: [], granted: null };
    console.info(`[event] ${key}`, payload);
    this.state.save();
    this.bus.emit(MSG.WORLD_EVENT, key, payload, result);
    if (result.levelUps.length || (result.granted && Object.keys(result.granted.items).length)) {
      this.bus.emit(MSG.REWARD, { title: null, ...result, silent: true });
    }
    this.bus.emit(MSG.QUEST_CHANGED);
    this.bus.emit(MSG.HUD_REFRESH);
    return result;
  }

  has(key) { return this.state.hasEvent(key); }

  currentStep() {
    return QUEST_STEPS.find(s => !s.done(this.state)) || QUEST_STEPS[QUEST_STEPS.length - 1];
  }

  objectiveText() {
    const s = this.currentStep();
    return s.progress ? `${s.text} (${s.progress(this.state)})` : s.text;
  }
}
