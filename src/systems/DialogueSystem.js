// Диалоги (v0.8): выбор варианта по прогрессу, показ реплик, ответы и эффекты. Без Phaser.
// Данные — config/dialogues.js, персонажи — config/npcs.js. Окно рисует UIScene по view().
import { DIALOGUES } from '../config/dialogues.js';
import { NPCS } from '../config/npcs.js';
import { MSG } from '../state/EventBus.js';

export class DialogueSystem {
  /**
   * @param {object} o
   * @param {import('../state/GameState.js').GameState} o.state
   * @param {import('../state/QuestLog.js').QuestLog} o.log
   * @param {() => string} [o.goalText] текст текущей цели (для {goal})
   */
  constructor({ state, log, bus = null, goalText = () => '' }) {
    this.state = state;
    this.log = log;
    this.bus = bus;
    this.goalText = goalText;
    this.cur = null; // { npcId, variant, nodeId, line }
    this.pendingAfter = []; // эффекты, которые нужно выполнить после закрытия окна (открыть котёл, журнал…)
  }

  // ---------- контекст для условий в конфиге ----------
  context() {
    const s = this.state, log = this.log;
    return {
      has: (k) => s.hasEvent(k),
      item: (id) => s.item(id),
      quest: (id) => log.status(id),
      defeated: (id) => s.isEnemyDefeated(id),
    };
  }

  seenKey(variantId) { return `dlg:${variantId}`; }
  seen(variantId) { return (this.state.data.tutorial || []).includes(this.seenKey(variantId)); }
  markSeen(variantId) {
    if (!Array.isArray(this.state.data.tutorial)) this.state.data.tutorial = [];
    if (!this.seen(variantId)) { this.state.data.tutorial.push(this.seenKey(variantId)); return true; }
    return false;
  }

  /** Вариант диалога, который сейчас положен NPC по прогрессу. */
  pick(npcId) {
    const list = DIALOGUES[npcId];
    if (!list) return null;
    const c = this.context();
    return list.find(v => v.when(c)) || null;
  }

  /** Есть ли у NPC что-то новое (для значка «!»): нерепитабельный вариант, который игрок ещё не слышал, или задание готово к сдаче. */
  hasNew(npcId) {
    const v = this.pick(npcId);
    if (!v || v.repeat) return false;
    return !this.seen(v.id);
  }

  /** Подсказка над NPC: '!' — новое, '?' — задание в процессе, null — ничего. */
  badge(npcId) {
    const v = this.pick(npcId);
    if (!v) return null;
    if (v.id.endsWith('_ready')) return '!';
    if (v.id.endsWith('_active')) return '?';
    if (!v.repeat && !this.seen(v.id)) return '!';
    return null;
  }

  // ---------- ход разговора ----------
  get active() { return !!this.cur; }

  start(npcId) {
    const v = this.pick(npcId);
    if (!v) return false;
    this.cur = { npcId, variant: v, nodeId: 'start', line: 0 };
    this.pendingAfter = [];
    this.markSeen(v.id);
    this.state.save();
    this.enterNode(this.node().do);
    this.bus?.emit(MSG.NPC_TALK, npcId);
    return true;
  }

  node() { return this.cur ? this.cur.variant.nodes[this.cur.nodeId] : null; }

  fmt(text) {
    return String(text)
      .replace(/\{n:([A-Za-z0-9_]+)\}/g, (m, id) => String(this.state.item(id)))
      .replace(/\{goal\}/g, () => this.goalText() || 'идти вперёд.');
  }

  /** То, что рисует окно: { npc, text, line, lines, choices | null, last }. null — диалога нет. */
  view() {
    if (!this.cur) return null;
    const n = this.node();
    const npc = NPCS[this.cur.npcId];
    const lines = n.lines;
    const last = this.cur.line >= lines.length - 1;
    const choices = last && n.choices ? n.choices.filter(ch => !ch.when || ch.when(this.context())).map((ch, i) => ({ index: i, label: ch.label })) : null;
    return { npc, text: this.fmt(lines[this.cur.line]), line: this.cur.line, lines: lines.length, last, choices, hasChoices: !!n.choices };
  }

  /** Тап «дальше». Возвращает true, если разговор продолжается; false — закончился. */
  advance() {
    if (!this.cur) return false;
    const n = this.node();
    if (this.cur.line < n.lines.length - 1) { this.cur.line++; return true; }
    if (n.choices?.length) return true; // ждём выбора
    return this.finish();
  }

  /** Выбор ответа (index из view().choices). */
  choose(index) {
    if (!this.cur) return false;
    const n = this.node();
    const list = (n.choices || []).filter(ch => !ch.when || ch.when(this.context()));
    const ch = list[index];
    if (!ch) return true;
    this.runEffects(ch.do);
    if (ch.next && this.cur.variant.nodes[ch.next]) {
      this.cur.nodeId = ch.next; this.cur.line = 0;
      this.enterNode(this.node().do);
      return true;
    }
    return this.finish();
  }

  enterNode(effects) { this.runEffects(effects); }

  finish() {
    const npcId = this.cur?.npcId;
    this.cur = null;
    this.state.save();
    this.bus?.emit(MSG.NPC_TALK_END, npcId);
    // отложенные открытия окон: UI открывает их сразу после закрытия диалога
    const after = this.pendingAfter; this.pendingAfter = [];
    for (const a of after) a();
    return false;
  }

  /** Досрочно закрыть (кнопка «закрыть», Esc). Эффекты выбранных ответов уже применены. */
  cancel() { if (this.cur) this.finish(); }

  runEffects(list) {
    if (!list) return;
    for (const e of list) {
      if (e.accept) this.log.accept(e.accept);
      else if (e.turnin) this.log.turnIn(e.turnin);
      else if (e.event) { if (this.state.markEvent(e.event)) { this.state.save(); this.bus?.emit(MSG.QUEST_CHANGED); } }
      else if (e.alchemy) this.pendingAfter.push(() => this.bus?.emit(MSG.OPEN_ALCHEMY));
      else if (e.journal) this.pendingAfter.push(() => this.bus?.emit(MSG.OPEN_JOURNAL));
      else if (e.upgrade) this.pendingAfter.push(() => this.bus?.emit(MSG.OPEN_UPGRADE, e.upgrade));
    }
  }
}
