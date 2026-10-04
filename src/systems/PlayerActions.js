// v0.9 — действия, которые проверяет и применяет сервер одной операцией: лечение у Мирры за монеты и стартовый набор зелий.
// Онлайн — PlayerSession.runAction (RPC player_action). Без сервера (режим разработки) — то же правило на JS (applyAction).
// Повторное нажатие, пока действие выполняется, игнорируется: двойного списания или второго набора не будет.
// v0.9.1: пока busy, мир стоит (systems/WorldClock.js) — снимок перед действием не устаревает за время запроса.
// Причины отказа: 'busy' (уже выполняется), 'network' (нет связи), 'server' (ошибка сервера, error = { rpc, code, status }),
// 'session' (вход завершён), 'error' (непредвиденный сбой клиента — пишется в консоль), либо ответ сервера (coins, full, already).
// v0.10.0: крафт ({ op: 'craft', recipe }), сюжетные предметы ({ op: 'use', item }) и миграция ({ op: 'migrate_v10' }).
// После успеха к результату добавляется outcome — что реально изменилось (опыт, новые уровни, предметы, новые события),
// а для новых событий шлётся обычный WORLD_EVENT: мир, журнал и наведение обновляются так же, как после QuestFlags.complete.
import { applyAction, toSnapshot, fromSnapshot } from '../cloud/playerModel.js';
import { HERO_LEVELS } from '../config/balance.hero.js';
import { MSG } from '../state/EventBus.js';

export class PlayerActions {
  constructor({ state, getSession = () => null, bus = null }) {
    this.state = state;
    this.getSession = getSession;
    this.bus = bus;
    this.pending = null;
  }

  /** Что изменилось между двумя состояниями (для сообщений игроку и событий мира). */
  static outcome(before, after) {
    const items = {};
    for (const k of new Set([...Object.keys(before.inventory), ...Object.keys(after.inventory)])) {
      const d = (after.inventory[k] || 0) - (before.inventory[k] || 0);
      if (d) items[k] = d;
    }
    return {
      heroXP: after.heroXP - before.heroXP,
      levelUps: HERO_LEVELS.filter(r => r.level > before.heroLevel && r.level <= after.heroLevel),
      items,
      events: after.completedEvents.filter(e => !before.completedEvents.includes(e)),
    };
  }

  get busy() { return !!this.pending; }

  async run(action) {
    if (this.pending) return { ok: false, reason: 'busy' };
    const before = JSON.parse(JSON.stringify(this.state.data));
    this.pending = (async () => {
      try {
        const ses = this.getSession();
        if (ses) return await ses.runAction(action);
        const { snapshot, result } = applyAction(toSnapshot(this.state.data), action, Date.now());
        if (result.ok) { this.state.setData(fromSnapshot(snapshot, this.state.data)); this.state.save(); }
        return result;
      } catch (e) {
        console.error('[PlayerActions] непредвиденный сбой действия', action?.op, e);
        return { ok: false, reason: 'error', error: { rpc: 'client', code: e?.name || 'Error', status: 0, detail: String(e?.message || e).slice(0, 80) } };
      }
    })();
    let res;
    try { res = await this.pending; } finally { this.pending = null; }
    if (res?.ok) {
      res = { ...res, outcome: PlayerActions.outcome(before, this.state.data) };
      for (const ev of res.outcome.events) this.bus?.emit(MSG.WORLD_EVENT, ev, { action: action.op }, { levelUps: res.outcome.levelUps, granted: null });
      this.bus?.emit(MSG.QUEST_CHANGED);
      this.bus?.emit(MSG.HUD_REFRESH);
    }
    return res;
  }

  craft(recipe) { return this.run({ op: 'craft', recipe }); }
  use(item) { return this.run({ op: 'use', item }); }
  migrateV10() { return this.run({ op: 'migrate_v10' }); }

  heal() { return this.run({ op: 'heal' }); }
  /** v0.12.0: зелье из сумки вне боя (настой жизни, лунный эликсир). */
  drink(item) { return this.run({ op: 'drink', item }); }
  /** v0.12.0: бой начался / закончился (outcome: victory | defeat | retreat; mana — остаток маны). Сервер замораживает и возобновляет восстановление. */
  combatStart() { return this.run({ op: 'combat_start' }); }
  combatEnd(outcome, mana) { return this.run({ op: 'combat_end', outcome, mana }); }
  starterKit() { return this.run({ op: 'starter_kit' }); }
}
