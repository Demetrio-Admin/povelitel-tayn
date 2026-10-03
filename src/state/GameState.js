// Save / GameState — единственный источник правды о прогрессе и состоянии мира.
// Не зависит от Phaser: тестируется в node (tests/run-tests.js).

import { HERO_LEVELS } from '../config/balance.hero.js';
import { UPGRADES, TIMER_MODE } from '../config/balance.progression.js';
import { WORLD } from '../config/world.layout.js';
import { SAVE } from '../config/game.config.js';
import { materialize } from './vitals.js';

const SAVE_VERSION = 1;

export function createDefaultState() {
  return {
    version: SAVE_VERSION,
    heroLevel: 1,
    heroXP: 0,
    telekinesisLevel: 0,
    fireLevel: 0,
    sealLevel: 0,
    schoolXP: { telekinesis: 0, fire: 0, seal: 0 },
    unlockedAbilities: [],
    completedEvents: [],
    openedPaths: [],
    defeatedEnemies: [],
    inventory: { coins: 0, lunar_shard: 0, lunar_flame: 0 },
    // состояние отдельных объектов мира: { [id]: { state, x, y } }
    worldObjects: {},
    research: null, // { upgradeId, startedAt, durationMs }
    player: { x: WORLD.playerStart.x, y: WORLD.playerStart.y },
    safePoint: { ...WORLD.defaultSafePoint },
    hp: null,   // null = полное (старые сохранения и новый персонаж); дальше — число 0…max (v0.9: общее для мира и боя)
    mana: null, // v0.9: текущая мана, та же семантика
    stats: { playTimeMs: 0, combats: [] },
    tutorial: [], // id показанных подсказок (TutorialSystem)
  };
}

export class GameState {
  /**
   * storage — только для режима без сервера (разработка): тогда прогресс лежит в localStorage этого браузера.
   * В онлайн-режиме storage = null: данные приходят с сервера (PlayerSession → setData), а save() лишь сообщает
   * подписчикам, что прогресс изменился, — дальше его отправляет на сервер PlayerSession.
   */
  constructor(storage = null, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
    this.data = createDefaultState();
    this.listeners = new Set();
    this.saveListeners = new Set();
  }

  // ---------- persistence ----------
  /** Подписка на каждое сохранение (онлайн-режим: PlayerSession отправляет изменения на сервер). */
  onSave(fn) { this.saveListeners.add(fn); return () => this.saveListeners.delete(fn); }

  load() {
    if (!this.storage) return false;
    try {
      const raw = this.storage.getItem(SAVE.key);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed.version !== SAVE_VERSION) return false;
      this.data = { ...createDefaultState(), ...parsed };
      return true;
    } catch (e) {
      console.warn('[GameState] load failed', e);
      return false;
    }
  }

  hasSave() {
    try { return !!(this.storage && this.storage.getItem(SAVE.key)); } catch (e) { return false; }
  }

  save() {
    if (this.storage) {
      try { this.storage.setItem(SAVE.key, JSON.stringify(this.data)); } catch (e) { /* quota / private mode */ }
    }
    this.saveListeners.forEach(fn => fn(this.data));
  }

  /**
   * Подменяет данные состоянием с сервера. Объект data остаётся тем же (меняются поля), поэтому ссылки на него
   * в сценах не устаревают. Подписчиков save() не зовёт — иначе полученное тут же ушло бы обратно.
   */
  setData(next) {
    const d = { ...createDefaultState(), ...next };
    for (const k of Object.keys(this.data)) if (!(k in d)) delete this.data[k];
    Object.assign(this.data, d);
    this.changed('replace');
  }

  reset() {
    this.data = createDefaultState();
    if (this.storage) this.storage.removeItem(SAVE.key);
    this.changed('reset');
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed(reason) { this.listeners.forEach(fn => fn(reason, this)); }

  // ---------- events / flags ----------
  hasEvent(key) { return this.data.completedEvents.includes(key); }
  markEvent(key) {
    if (this.hasEvent(key)) return false;
    this.data.completedEvents.push(key);
    return true;
  }

  isPathOpen(id) { return this.data.openedPaths.includes(id); }
  openPath(id) { if (!this.isPathOpen(id)) this.data.openedPaths.push(id); }

  isEnemyDefeated(id) { return this.data.defeatedEnemies.includes(id); }
  markEnemyDefeated(id) { if (!this.isEnemyDefeated(id)) this.data.defeatedEnemies.push(id); }

  getObject(id) { return this.data.worldObjects[id] || null; }
  setObject(id, patch) { this.data.worldObjects[id] = { ...(this.data.worldObjects[id] || {}), ...patch }; }

  // ---------- inventory ----------
  item(id) { return this.data.inventory[id] || 0; }
  addItem(id, amount = 1) { this.data.inventory[id] = this.item(id) + amount; }
  removeItem(id, amount = 1) {
    if (this.item(id) < amount) return false;
    this.data.inventory[id] -= amount;
    return true;
  }
  flamesCollected() { return this.item('lunar_flame'); }

  // ---------- hero ----------
  levelRow(level = this.data.heroLevel) {
    return HERO_LEVELS.find(r => r.level === level) || HERO_LEVELS[HERO_LEVELS.length - 1];
  }
  heroStats() {
    const r = this.levelRow();
    return { maxHp: r.maxHp, maxMana: r.maxMana, manaRegen: r.manaRegen, damageMult: r.damageMult };
  }
  nextLevelXP() {
    const next = HERO_LEVELS.find(r => r.level === this.data.heroLevel + 1);
    return next ? next.xp : null;
  }

  /** Добавляет опыт героя. Возвращает список новых уровней. */
  addHeroXP(amount) {
    this.data.heroXP += amount;
    const gained = [];
    for (;;) {
      const next = HERO_LEVELS.find(r => r.level === this.data.heroLevel + 1);
      if (!next || this.data.heroXP < next.xp) break;
      if (!gained.length) materialize(this); // новый максимум не даёт скрытого полного восстановления
      this.data.heroLevel = next.level;
      gained.push(next);
    }
    return gained;
  }

  addSchoolXP(school, amount) {
    this.data.schoolXP[school] = (this.data.schoolXP[school] || 0) + amount;
  }

  // ---------- abilities ----------
  abilityLevel(id) { return this.data[`${id}Level`] || 0; }
  isUnlocked(id) { return this.data.unlockedAbilities.includes(id) && this.abilityLevel(id) > 0; }
  unlockAbility(id, level = 1) {
    if (!this.data.unlockedAbilities.includes(id)) this.data.unlockedAbilities.push(id);
    this.data[`${id}Level`] = Math.max(this.abilityLevel(id), level);
  }

  /**
   * Применяет награду { heroXP, schoolXP:{}, items:{}, coins, topUpFor }.
   * Возвращает { levelUps, granted } для UI.
   */
  applyReward(reward = {}) {
    const granted = { heroXP: 0, schoolXP: {}, items: {} };
    if (reward.schoolXP) for (const [k, v] of Object.entries(reward.schoolXP)) { this.addSchoolXP(k, v); granted.schoolXP[k] = v; }
    if (reward.items) for (const [k, v] of Object.entries(reward.items)) { if (v > 0) { this.addItem(k, v); granted.items[k] = v; } }
    if (reward.coins) { this.addItem('coins', reward.coins); granted.items.coins = (granted.items.coins || 0) + reward.coins; }
    if (reward.topUpFor) {
      const up = UPGRADES[reward.topUpFor];
      if (up) {
        const school = up.ability;
        const needXP = up.cost.schoolXP - (this.data.schoolXP[school] || 0);
        if (needXP > 0) { this.addSchoolXP(school, needXP); granted.schoolXP[school] = (granted.schoolXP[school] || 0) + needXP; }
        for (const [k, v] of Object.entries(up.cost.items || {})) {
          if (up.cost.noTopUp?.includes(k)) continue; // ресурсы, которые игрок добывает сам
          const need = v - this.item(k);
          if (need > 0) { this.addItem(k, need); granted.items[k] = (granted.items[k] || 0) + need; }
        }
      }
    }
    let levelUps = [];
    if (reward.heroXP) { levelUps = this.addHeroXP(reward.heroXP); granted.heroXP = reward.heroXP; }
    return { levelUps, granted };
  }

  // ---------- research (таймер изучения дара) ----------
  upgradeStatus(upgradeId) {
    const up = UPGRADES[upgradeId];
    if (!up) return { ok: false, reason: 'unknown' };
    if (up.locked) return { ok: false, reason: 'locked' };
    if (this.abilityLevel(up.ability) >= up.toLevel) return { ok: false, reason: 'done' };
    if (this.data.research) return { ok: false, reason: this.data.research.upgradeId === upgradeId ? 'in_progress' : 'busy' };
    const r = up.requires || {};
    const checks = [];
    if (r.heroLevel) checks.push({ label: `Уровень героя ${r.heroLevel}`, have: this.data.heroLevel, need: r.heroLevel });
    if (r.abilityLevel) checks.push({ label: `${up.ability} ${r.abilityLevel}`, have: this.abilityLevel(up.ability), need: r.abilityLevel, hidden: true });
    checks.push({ label: 'Опыт дара', have: this.data.schoolXP[up.ability] || 0, need: up.cost.schoolXP });
    for (const [k, v] of Object.entries(up.cost.items || {})) checks.push({ label: k, item: k, have: this.item(k), need: v });
    const eventOk = !r.event || this.hasEvent(r.event);
    const ok = eventOk && checks.every(c => c.have >= c.need);
    return { ok, reason: ok ? 'ready' : (eventOk ? 'missing' : 'event'), checks };
  }

  startResearch(upgradeId) {
    const st = this.upgradeStatus(upgradeId);
    if (!st.ok) return false;
    const up = UPGRADES[upgradeId];
    this.data.schoolXP[up.ability] -= up.cost.schoolXP;
    for (const [k, v] of Object.entries(up.cost.items || {})) this.removeItem(k, v);
    this.data.research = { upgradeId, startedAt: this.now(), durationMs: up.timerSec[TIMER_MODE] * 1000 };
    return true;
  }

  researchRemainingMs() {
    const r = this.data.research;
    if (!r) return 0;
    return Math.max(0, r.startedAt + r.durationMs - this.now());
  }

  /** Завершает исследование, если таймер истёк. Возвращает upgradeId или null. */
  completeResearchIfReady(force = false) {
    const r = this.data.research;
    if (!r) return null;
    if (!force && this.researchRemainingMs() > 0) return null;
    const up = UPGRADES[r.upgradeId];
    this.unlockAbility(up.ability, up.toLevel);
    this.data.research = null;
    return r.upgradeId;
  }
}
