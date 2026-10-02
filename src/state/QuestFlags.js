// Quest / Event flags: фиксирует event keys, выдаёт награды и считает текущую цель.
import { QUEST_STEPS } from '../config/events.js';
import { EVENT_REWARDS } from '../config/balance.progression.js';
import { MSG } from './EventBus.js';

export class QuestFlags {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
  }

  /**
   * Фиксирует событие. Повторный вызов безопасен: награда выдаётся один раз.
   * Возвращает результат applyReward или null, если событие уже было.
   */
  complete(key, payload = {}) {
    if (!this.state.markEvent(key)) return null;
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
