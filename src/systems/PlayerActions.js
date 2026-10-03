// v0.9 — действия, которые проверяет и применяет сервер одной операцией: лечение у Мирры за монеты и стартовый набор зелий.
// Онлайн — PlayerSession.runAction (RPC player_action). Без сервера (режим разработки) — то же правило на JS (applyAction).
// Повторное нажатие, пока действие выполняется, игнорируется: двойного списания или второго набора не будет.
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
      const ses = this.getSession();
      if (ses) return ses.runAction(action);
      const { snapshot, result } = applyAction(toSnapshot(this.state.data), action);
      if (result.ok) { this.state.setData(fromSnapshot(snapshot, this.state.data)); this.state.save(); }
      return result;
    })();
    try { return await this.pending; } finally { this.pending = null; }
  }

  heal() { return this.run({ op: 'heal' }); }
  starterKit() { return this.run({ op: 'starter_kit' }); }
}
