// v0.9 — действия, которые проверяет и применяет сервер одной операцией: лечение у Мирры за монеты и стартовый набор зелий.
// Онлайн — PlayerSession.runAction (RPC player_action). Без сервера (режим разработки) — то же правило на JS (applyAction).
// Повторное нажатие, пока действие выполняется, игнорируется: двойного списания или второго набора не будет.
// v0.9.1: пока busy, мир стоит (systems/WorldClock.js) — снимок перед действием не устаревает за время запроса.
// Причины отказа: 'busy' (уже выполняется), 'network' (нет связи), 'server' (ошибка сервера, error = { rpc, code, status }),
// 'session' (вход завершён), 'error' (непредвиденный сбой клиента — пишется в консоль), либо ответ сервера (coins, full, already).
import { applyAction, toSnapshot, fromSnapshot } from '../cloud/playerModel.js';

export class PlayerActions {
  constructor({ state, getSession = () => null }) {
    this.state = state;
    this.getSession = getSession;
    this.pending = null;
  }

  get busy() { return !!this.pending; }

  async run(action) {
    if (this.pending) return { ok: false, reason: 'busy' };
    this.pending = (async () => {
      try {
        const ses = this.getSession();
        if (ses) return await ses.runAction(action);
        const { snapshot, result } = applyAction(toSnapshot(this.state.data), action);
        if (result.ok) { this.state.setData(fromSnapshot(snapshot, this.state.data)); this.state.save(); }
        return result;
      } catch (e) {
        console.error('[PlayerActions] непредвиденный сбой действия', action?.op, e);
        return { ok: false, reason: 'error', error: { rpc: 'client', code: e?.name || 'Error', status: 0, detail: String(e?.message || e).slice(0, 80) } };
      }
    })();
    try { return await this.pending; } finally { this.pending = null; }
  }

  heal() { return this.run({ op: 'heal' }); }
  starterKit() { return this.run({ op: 'starter_kit' }); }
}
