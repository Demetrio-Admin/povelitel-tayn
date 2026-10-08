// QuestLog — побочные задания (v0.8). Без Phaser: тестируется в node (tests/run-tests.js).
// Состояние не хранится отдельно: событие sq_<id>_start (принято) + sq_<id>_done (сдано), а прогресс — по сумке, победам и событиям.
// Поэтому сервер ничего нового не знает: всё это уже есть в completedEvents / inventory / defeatedEnemies.
import { SIDE_QUESTS, SIDE_QUEST_ORDER, questEvent } from '../config/quests.js';
import { ITEMS } from '../config/balance.progression.js';
import { MSG } from './EventBus.js';

export class QuestLog {
  constructor(state, bus = null) {
    this.state = state;
    this.bus = bus;
    this.announced = new Set(); // 'ready' сообщаем один раз за сессию
    this.mirror = null;         // v0.15.0: (action) => Promise — подтверждение на сервере (services.js); без сервера null
  }

  def(id) { return SIDE_QUESTS[id] || null; }

  // ---------- цели ----------
  objectiveDone(o) {
    const s = this.state;
    if (o.type === 'item') return s.item(o.item) >= o.count;
    if (o.type === 'enemy') return s.isEnemyDefeated(o.id);
    if (o.type === 'event') return s.hasEvent(o.key);
    return false;
  }

  objectiveText(o) {
    const s = this.state;
    if (o.type === 'item') return `${o.text}: ${Math.min(o.count, s.item(o.item))}/${o.count}`;
    return o.text;
  }

  /** Список целей для окна журнала: [{ text, done }]. */
  objectives(id) {
    const q = this.def(id);
    return q ? q.objectives.map(o => ({ text: this.objectiveText(o), done: this.objectiveDone(o) })) : [];
  }

  // ---------- статус ----------
  isStarted(id) { return this.state.hasEvent(questEvent(id, 'start')); }
  isDone(id) { return this.state.hasEvent(questEvent(id, 'done')); }

  /** locked | available | active | ready | done */
  status(id) {
    const q = this.def(id);
    if (!q) return 'locked';
    if (this.isDone(id)) return 'done';
    if (this.isStarted(id)) return q.objectives.every(o => this.objectiveDone(o)) ? 'ready' : 'active';
    const r = q.requires || {};
    if ((r.event && !this.state.hasEvent(r.event)) || (r.events || []).some(e => !this.state.hasEvent(e))) return 'locked';
    return 'available';
  }

  active() { return SIDE_QUEST_ORDER.filter(id => ['active', 'ready'].includes(this.status(id))); }
  done() { return SIDE_QUEST_ORDER.filter(id => this.status(id) === 'done'); }
  available() { return SIDE_QUEST_ORDER.filter(id => this.status(id) === 'available'); }

  /** Сколько заданий ждут действия игрока (для значка в HUD): активные + готовые к сдаче. */
  activeCount() { return this.active().length; }

  // ---------- действия ----------
  accept(id) {
    if (this.status(id) !== 'available') return false;
    this.state.markEvent(questEvent(id, 'start'));
    this.mirror?.({ op: 'quest_accept', quest: id });
    this.state.save();
    this.bus?.emit(MSG.SIDE_QUEST, id, 'start');
    this.bus?.emit(MSG.QUEST_CHANGED);
    this.bus?.emit(MSG.WORLD_EVENT, questEvent(id, 'start'), {}, { levelUps: [], granted: null });
    return true;
  }

  /** Сдача: забирает предметы и выдаёт награду. Возвращает результат applyReward или null. */
  turnIn(id) {
    if (this.status(id) !== 'ready') return null;
    const q = this.def(id);
    for (const [k, v] of Object.entries(q.turnIn?.consume || {})) {
      if (this.state.item(k) < v) return null;
    }
    for (const [k, v] of Object.entries(q.turnIn?.consume || {})) this.state.removeItem(k, v);
    this.state.markEvent(questEvent(id, 'done'));
    const result = this.state.applyReward(q.reward);
    this.mirror?.({ op: 'quest_turn_in', quest: id });
    this.state.save();
    this.bus?.emit(MSG.REWARD, { title: q.title, ...result });
    this.bus?.emit(MSG.SIDE_QUEST, id, 'done');
    this.bus?.emit(MSG.QUEST_CHANGED);
    this.bus?.emit(MSG.HUD_REFRESH);
    return result;
  }

  /** Проверка «стало готово»: возвращает id заданий, которые только что перешли в ready (один раз). */
  checkReady() {
    const out = [];
    for (const id of this.active()) {
      if (this.status(id) === 'ready' && !this.announced.has(id)) {
        this.announced.add(id);
        out.push(id);
        this.bus?.emit(MSG.SIDE_QUEST, id, 'ready');
      }
    }
    return out;
  }

  /** Короткая строка для HUD: «Лунные травы 2/3» или «сдайте Веде» (первое активное задание). */
  hudLine() {
    const id = this.active()[0];
    if (!id) return '';
    const q = this.def(id);
    if (this.status(id) === 'ready') return `${q.title}: вернитесь к заказчику`;
    const o = q.objectives.find(x => !this.objectiveDone(x)) || q.objectives[0];
    return `${q.title}: ${this.objectiveText(o)}`;
  }

  rewardLines(id) {
    const q = this.def(id);
    const r = q?.reward || {};
    const out = [];
    if (r.coins) out.push(`${r.coins} монет`);
    if (r.sapphires) out.push(`${r.sapphires} сапфир`);
    for (const [k, v] of Object.entries(r.items || {})) out.push(`${ITEMS[k]?.name || k}${v > 1 ? ` ×${v}` : ''}`);
    if (r.heroXP) out.push(`${r.heroXP} опыта`);
    return out;
  }
}
