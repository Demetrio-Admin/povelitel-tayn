// v0.9 — пошаговое обучение первого боя (scavenger_01) поверх обычного real-time боя. Без Phaser.
// Шаги: intro («Понятно») → select (выбран бросаемый предмет) → throw (бросок Телекинезом) → interrupt (настоящее
// успешное прерывание) → confirm (короткая обратная связь, бой идёт дальше).
// Шаг отмечается ('ct:<step>' в state.data.tutorial, сохраняется на сервере) только после проверенного действия.
// Пока идут intro/select/throw, враг и автоатака стоят (CombatManager.tick({ holdEnemy })); на шаге interrupt удерживается
// только подготовка опасной атаки — перезарядка и мана героини продолжают идти, поэтому нужный дар всегда станет доступен.
// Это НЕ modal-lock: кнопки боя работают (CombatScene.canAct не зависит от обучения).
import { COMBAT_TUTORIAL } from '../config/story.js';

export const ctKey = (step) => `ct:${step}`;
export const CT_SKIPPED = 'ct:skipped';

export class CombatTutorial {
  /**
   * @param {object} o
   * @param o.state    GameState
   * @param o.settings Settings (подсказки выключены → обучение не идёт)
   * @param o.spawnId  враг этого боя
   * @param o.cm       CombatManager
   */
  constructor({ state, settings = null, spawnId, cm }) {
    this.state = state; this.settings = settings; this.spawnId = spawnId; this.cm = cm;
    this.confirmLeft = 0;     // секунды показа «Атака прервана…»
    this.feedback = null;     // { text, left } — подсказка после ошибки (шаг не продвигает)
    this.reminded = false;
  }

  get list() { if (!Array.isArray(this.state.data.tutorial)) this.state.data.tutorial = []; return this.state.data.tutorial; }
  done(step) { return this.list.includes(ctKey(step)); }
  mark(step) { if (!this.done(step)) { this.list.push(ctKey(step)); this.state.save(); } }

  get skipped() { return this.list.includes(CT_SKIPPED); }
  get hintsOn() { return this.settings ? this.settings.get('hints') !== false : true; }
  get applies() {
    // уже победившему этого врага (в том числе до обновления) обучение не навязываем
    return this.spawnId === COMBAT_TUTORIAL.spawnId && !this.state.isEnemyDefeated(this.spawnId);
  }

  /** Текущий шаг или null (обучение не идёт / завершено / пропущено / подсказки выключены). */
  get step() {
    if (!this.applies || this.skipped || !this.hintsOn) return null;
    if (this.confirmLeft > 0) return 'confirm';
    return COMBAT_TUTORIAL.steps.find(s => !this.done(s)) || null;
  }
  get active() { return !!this.step; }

  /** Держать ли врага и автоатаку на месте в этом кадре. */
  holdEnemy() {
    const s = this.step;
    if (s === 'intro' || s === 'select' || s === 'throw') return true;
    if (s === 'interrupt') return this.cm.enemy.isPreparing;   // опасная атака ждёт игрока
    return false;
  }

  /** Повторная попытка после поражения: если выбор предмета уже освоен, но бросок — нет, кратко напомнить. */
  get reminder() {
    if (this.reminded || this.step !== 'throw') return null;
    this.reminded = true;
    return COMBAT_TUTORIAL.text.remindSelect;
  }

  /** Текст для панели и что подсветить: { step, text, target: 'object'|'telekinesis'|null, button: 'ok'|null }. */
  view() {
    const s = this.step;
    if (!s) return null;
    const t = COMBAT_TUTORIAL.text;
    if (s === 'intro') return { step: s, text: t.intro, target: null, button: 'ok' };
    if (s === 'select') return { step: s, text: t.select, target: 'object', button: null };
    if (s === 'throw') return { step: s, text: this.cm.selectedObject() ? t.throw : t.select, target: this.cm.selectedObject() ? 'telekinesis' : 'object', button: null };
    if (s === 'interrupt') return this.cm.enemy.isPreparing ? { step: s, text: t.interrupt, target: 'telekinesis', button: null } : null;
    return { step: s, text: t.confirm, target: null, button: null };
  }

  /** «Понятно» на первом шаге. */
  confirmIntro() { if (this.step === 'intro') { this.mark('intro'); return true; } return false; }

  /** Пропуск: без наград и без «победы»; бой сразу идёт обычным образом. */
  skip() { if (!this.skipped) { this.list.push(CT_SKIPPED); this.state.save(); } this.confirmLeft = 0; }

  tick(dt) {
    if (this.confirmLeft > 0) this.confirmLeft = Math.max(0, this.confirmLeft - dt);
    if (this.feedback) { this.feedback.left -= dt; if (this.feedback.left <= 0) this.feedback = null; }
  }

  say(key) { this.feedback = { text: COMBAT_TUTORIAL.feedback[key], left: 2.6 }; }

  /** Попытка дара (до CombatManager.useAbility): неверные действия дают пояснение и не продвигают шаг. */
  beforeAbility(id, state) {
    const s = this.step;
    if (!s || s === 'intro' || s === 'confirm') return;
    if (id !== 'telekinesis') { this.say('wrongAbility'); return; }
    if (state === 'cooldown') this.say('cooldown');
    else if (state === 'nomana') this.say('nomana');
    else if ((s === 'select' || s === 'throw') && !this.cm.selectedObject()) this.say('noSelection');
  }

  /** Выбор предмета игроком (до CombatManager.selectObject). */
  beforeSelect(id) {
    const o = this.cm.fieldObjects.find(f => f.id === id);
    if (this.step && (this.step === 'select' || this.step === 'throw') && o && !o.def.throwable) this.say('notThrowable');
  }

  /** События боя CombatManager — только они продвигают обучение. */
  onEvents(events) {
    for (const ev of events) {
      const s = this.step;
      if (!s) return;
      if (ev.type === 'select' && ev.id && s === 'select') {
        const o = this.cm.fieldObjects.find(f => f.id === ev.id);
        if (o?.def.throwable) this.mark('select');
      } else if (ev.type === 'objectUsed' && ev.action === 'throw' && (s === 'throw' || s === 'select')) {
        this.mark('select'); this.mark('throw');
      } else if (ev.type === 'interrupt' && ev.ok && s === 'interrupt') {
        this.mark('interrupt');
        this.confirmLeft = 2.8;
      }
    }
  }
}
