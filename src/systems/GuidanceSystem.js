// Мягкое наведение (v0.8): текущая цель и её объект, подсказки «если застряли», реплики героини. Без Phaser.
// Не знает про карту: возвращает id объектов, а координаты и рисунок подсветки берёт сцена.
import { STEP_GUIDE, IDLE, HERO_LINES, RESOURCE_WHERE, NUDGES } from '../config/guidance.js';
import { UPGRADES, ITEMS } from '../config/balance.progression.js';
import { RECIPES } from '../config/recipes.js';
import { MSG } from '../state/EventBus.js';

export class GuidanceSystem {
  constructor({ state, quests, log, bus = null }) {
    this.state = state;
    this.quests = quests;
    this.log = log;
    this.bus = bus;
    this.stepId = null;
    this.idle = 0;          // секунды без прогресса
    this.hintsShown = 0;
    this.sinceHint = 0;
    this.pointerOn = false;
    this.forceT = 0;        // секунды принудительной стрелки (намёк после события)
    this.quiet = 0;         // секунды тишины после другого сообщения (см. hush)
  }

  // ---------- цель ----------
  step() { return this.quests.currentStep(); }

  /** Данные для HUD: { text, progress, stepId }. */
  objective() {
    const s = this.step();
    return { stepId: s.id, text: s.text, progress: s.progress ? s.progress(this.state) : null, full: this.quests.objectiveText() };
  }

  /**
   * id объекта, к которому ведёт цель. done(id) — «этот объект уже выполнен» (его пропускаем).
   * Возвращает null, если шаг без цели.
   */
  targetId(done = () => false) {
    const g = STEP_GUIDE[this.step().id];
    if (!g || !g.targets.length) return null;
    return g.targets.find(id => !done(id)) || g.targets[g.targets.length - 1];
  }

  /** Нужны ли для изучения Телекинеза II ещё ресурсы: «не хватает: …» (или '' ). */
  shortageText() {
    const st = this.state.upgradeStatus('telekinesis_2');
    if (!st.checks) return '';
    const lack = st.checks.filter(c => c.item && c.have < c.need);
    if (!lack.length) return '';
    return 'Для изучения не хватает: ' + lack.map(c => `${ITEMS[c.item]?.name || c.item} ${c.have}/${c.need} (${RESOURCE_WHERE[c.item] || 'в лесу'})`).join('; ') + '.';
  }

  /** v0.10.0: чего не хватает для сюжетного рецепта шага: [{ item, name, have, need, where }]. */
  craftShortage(recipeId) {
    const r = RECIPES[recipeId];
    if (!r) return [];
    return Object.entries(r.needs).map(([item, need]) => ({ item, name: ITEMS[item]?.name || item, have: this.state.item(item), need, where: RESOURCE_WHERE[item] || 'в лесу' }))
      .filter(c => c.have < c.need);
  }

  /** Подсказки текущего шага (с учётом нехватки ресурсов на шаге изучения и на шаге сюжетного рецепта). */
  hints() {
    const s = this.step();
    const base = [...(STEP_GUIDE[s.id]?.hints || [])];
    if (s.id === 'research') { const sh = this.shortageText(); if (sh) base.unshift(sh); }
    if (s.craft) {
      const lack = this.craftShortage(s.craft);
      if (lack.length) base.unshift('Для рецепта не хватает: ' + lack.map(c => `${c.name} ${c.have}/${c.need} (${c.where})`).join('; ') + '.');
    }
    return base;
  }

  // ---------- «застряли» ----------
  /** Любое значимое действие игрока (предмет, событие, разговор) сбрасывает ожидание. */
  noteProgress() { this.idle = 0; this.sinceHint = 0; }

  /** Сколько подсказок шага уже было показано (хранится в сохранении, чтобы они не возвращались после перезапуска). */
  shownFor(stepId) {
    const prefix = `gh:${stepId}:`;
    return (this.state.data.tutorial || []).filter(k => typeof k === 'string' && k.startsWith(prefix)).length;
  }
  markShown(stepId, n) {
    if (!Array.isArray(this.state.data.tutorial)) this.state.data.tutorial = [];
    const key = `gh:${stepId}:${n}`;
    if (!this.state.data.tutorial.includes(key)) this.state.data.tutorial.push(key);
  }

  /** Другое сообщение уже на экране (реплика, плашка цели, подсказка-окно): подсказки «застряли» молчат quietSec секунд. */
  hush(sec = IDLE.quietSec) { this.quiet = Math.max(this.quiet, sec); }

  resetStep() {
    this.idle = 0; this.sinceHint = 0; this.pointerOn = false;
    this.hintsShown = this.shownFor(this.step().id);
    if (this.hintsShown >= IDLE.pointerAfterHints) this.pointerOn = true;
    this.bus?.emit(MSG.GUIDE_POINTER, null);
  }

  /**
   * dt — секунды игры без окон и боя. Возвращает { hint } когда пора показать подсказку, иначе null.
   * Стрелка включается после IDLE.pointerAfterHints подсказок (см. pointer()).
   */
  tick(dt) {
    this.forceT = Math.max(0, this.forceT - dt);
    this.quiet = Math.max(0, this.quiet - dt);
    const s = this.step();
    if (s.id !== this.stepId) { this.stepId = s.id; this.resetStep(); }
    this.idle += dt;
    const hints = this.hints();
    // каждая подсказка шага звучит один раз: дальше по списку, последняя не повторяется
    if (!hints.length || this.hintsShown >= IDLE.maxMsgsPerStep || this.hintsShown >= hints.length) return null;
    this.sinceHint += dt;
    const due = this.hintsShown === 0 ? IDLE.firstHintSec : IDLE.hintEverySec;
    if (this.idle >= IDLE.firstHintSec && this.sinceHint >= due && this.quiet <= 0) {
      const text = hints[this.hintsShown];
      this.hintsShown++;
      this.markShown(s.id, this.hintsShown);
      this.sinceHint = 0;
      if (this.hintsShown >= IDLE.pointerAfterHints) this.pointerOn = true;
      return { hint: text, level: this.hintsShown };
    }
    return null;
  }

  /** Нужно ли сейчас рисовать стрелку на краю экрана. */
  pointerActive() { return this.pointerOn || this.forceT > 0; }

  /** Событие мира: сбрасывает «застряли» и включает намёк-стрелку, если для события он задан (NUDGES). */
  onEvent(key) {
    this.noteProgress();
    const n = NUDGES[key];
    if (n?.pointerSec) this.forceT = n.pointerSec;
  }

  // ---------- реплики героини ----------
  seenKey(id) { return `hero:${id}`; }
  lineSeen(id) { return (this.state.data.tutorial || []).includes(this.seenKey(id)); }
  markLine(id) {
    if (!Array.isArray(this.state.data.tutorial)) this.state.data.tutorial = [];
    if (!this.lineSeen(id)) this.state.data.tutorial.push(this.seenKey(id));
  }

  /** Реплика по событию/зоне/предмету или null (каждая — один раз). */
  lineFor({ event, zone, item }) {
    const l = HERO_LINES.find(h => !this.lineSeen(h.id) && ((event && h.event === event) || (zone && h.zone === zone) || (item && h.item === item)));
    if (!l) return null;
    this.markLine(l.id);
    return l;
  }
}
