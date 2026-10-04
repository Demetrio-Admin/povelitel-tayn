// AbilitySystem — доступ к дарам, их текущим параметрам и таймеру изучения.
// Баланс читается только из config/balance.abilities.js.
import { ABILITIES, WEIGHT_CLASSES, SCHOOL_XP_PER_USE } from '../config/balance.abilities.js';
import { UPGRADES } from '../config/balance.progression.js';
import { MSG } from '../state/EventBus.js';
import { statsFor } from './abilityStats.js';

export const ABILITY_ORDER = ['telekinesis', 'fire', 'seal'];

export class AbilitySystem {
  constructor(state, quests, bus) {
    this.state = state;
    this.quests = quests;
    this.bus = bus;
  }

  def(id) { return ABILITIES[id]; }
  level(id) { return this.state.abilityLevel(id); }
  isUnlocked(id) { return this.state.isUnlocked(id); }

  /** Параметры дара на текущей ступени с учётом выбранной ветки (или null). */
  stats(id) {
    return statsFor(id, this.level(id), this.state.branchOf(id));
  }

  label(id) {
    const s = this.stats(id);
    return s ? s.label : ABILITIES[id].name;
  }

  /** Может ли текущий Телекинез сдвинуть weight_class. */
  canMoveWeight(weightClass) {
    const s = this.stats('telekinesis');
    if (!s) return false;
    return WEIGHT_CLASSES.indexOf(weightClass) <= WEIGHT_CLASSES.indexOf(s.maxWeight);
  }

  /** Минимальная ступень Телекинеза для weight_class (для подсказок). */
  requiredTelekinesisLevel(weightClass) {
    const levels = ABILITIES.telekinesis.levels;
    for (const [lvl, s] of Object.entries(levels)) {
      if (WEIGHT_CLASSES.indexOf(weightClass) <= WEIGHT_CLASSES.indexOf(s.maxWeight)) return Number(lvl);
    }
    return Infinity;
  }

  unlock(id, level = 1) {
    this.state.unlockAbility(id, level);
    this.state.save();
    this.bus.emit(MSG.HUD_REFRESH);
  }

  grantUseXP(id, context = 'exploration') {
    const xp = SCHOOL_XP_PER_USE[context]?.[id] || 0;
    if (xp) this.state.addSchoolXP(id, xp);
  }

  // ----- исследование -----
  startResearch(upgradeId) {
    if (!this.state.startResearch(upgradeId)) return false;
    const up = UPGRADES[upgradeId];
    if (up.startEvent) this.quests.complete(up.startEvent, { upgradeId });
    this.state.save();
    this.bus.emit(MSG.HUD_REFRESH);
    return true;
  }

  /** Вызывается каждый кадр из UIScene (работает и во время боя). */
  update(force = false) {
    const done = this.state.completeResearchIfReady(force);
    if (!done) return;
    const up = UPGRADES[done];
    this.state.save();
    if (up.completeEvent) this.quests.complete(up.completeEvent, { upgradeId: done });
    this.bus.emit(MSG.RESEARCH_DONE, done, up);
    this.bus.emit(MSG.HUD_REFRESH);
  }
}
