// v0.9 — действия, которые проверяет и применяет сервер одной операцией: лечение у Мирры за монеты и стартовый набор зелий.
// Онлайн — PlayerSession.runAction (RPC player_action). Без сервера (режим разработки) — то же правило на JS (applyAction).
// Повторное нажатие, пока действие выполняется, игнорируется: двойного списания или второго набора не будет.
// v0.9.1: пока busy, мир стоит (systems/WorldClock.js) — снимок перед действием не устаревает за время запроса.
// Причины отказа: 'busy' (уже выполняется), 'network' (нет связи), 'server' (ошибка сервера, error = { rpc, code, status }),
// 'session' (вход завершён), 'error' (непредвиденный сбой клиента — пишется в консоль), либо ответ сервера (coins, full, already).
// v0.13.0: действия в мире ({ op: 'world', obj }) — сбор, находки, запасы, магия: мана, награда и возрождение считает сервер.
// v0.14.0: бой проверяет сервер. combatStart(spawn, enemy) — сервер запоминает состояние героя; combatSubmit(log) — запись боя
// проигрывается на сервере (Edge Function combat), исход, награда и потери приходят в ответе. Без сервера — тот же путь на JS.
// v0.10.0: крафт ({ op: 'craft', recipe }), сюжетные предметы ({ op: 'use', item }) и миграция ({ op: 'migrate_v10' }).
// v0.15.0: опыт, предметы, события, квесты, дары и изучение закрыты для sync_player — меняются только операциями сервера.
// Игровой код по-прежнему сразу показывает результат у себя (отклик без задержки), а mirror(action) в фоне просит сервер сделать то же;
// ответ сервера заменяет локальное состояние. Операции идут по очереди (одна за другой), при потере связи повторяются с тем же id.
// После успеха к результату добавляется outcome — что реально изменилось (опыт, новые уровни, предметы, новые события),
// а для новых событий шлётся обычный WORLD_EVENT: мир, журнал и наведение обновляются так же, как после QuestFlags.complete.
import { applyAction, combatApply, toSnapshot, fromSnapshot } from '../cloud/playerModel.js';
import { verifyCombat } from '../cloud/combatVerify.js';
import { HERO_LEVELS } from '../config/balance.hero.js';
import { MSG } from '../state/EventBus.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); }));

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

  /** Есть ли сервер, который подтверждает действия (в режиме разработки без сервера — нет, всё считается на устройстве). */
  get online() { return !!this.getSession(); }

  /**
   * v0.15.0: подтвердить на сервере действие, которое игра уже показала локально. Без сервера ничего не делает.
   * Операции выполняются по очереди; сетевой сбой — повторы (до минуты) с тем же id (сервер не применит дважды).
   * Возвращает ответ сервера. Если сервер отказал, его состояние уже заменило локальное — интерфейс обновляется.
   */
  mirror(action) {
    const ses0 = this.getSession();
    if (!ses0) return Promise.resolve(null);
    const uid = ses0.userId;   // действие принадлежит этому игроку: после выхода или смены аккаунта оно не отправляется
    const act = { ...action, id: action.id || newId() };
    const job = async () => {
      let r = null;
      for (let i = 0; i < 20; i++) {
        if (this.getSession()?.userId !== uid) return { ok: false, reason: 'session' };
        while (this.pending) await this.pending.catch(() => {});
        r = await this.run(act);
        if (r.reason === 'busy') { await sleep(30); continue; }
        if (r.reason !== 'network') break;
        await sleep(3000);
      }
      if (!r?.ok) {
        if (r?.reason !== 'session') console.warn('[PlayerActions] сервер не подтвердил', act.op, r?.reason, r?.error || '');
        this.bus?.emit(MSG.QUEST_CHANGED);
        this.bus?.emit(MSG.HUD_REFRESH);
      }
      return r;
    };
    this.chain = (this.chain || Promise.resolve()).then(job, job);
    return this.chain;
  }

  async run(action) {
    return this.exec(action.op, async (ses) => {
      if (ses) return ses.runAction(action);
      const { snapshot, result } = applyAction(toSnapshot(this.state.data), action, this.state.now());
      if (result.ok) { this.state.setData(fromSnapshot(snapshot, this.state.data)); this.state.save(); }
      return result;
    }, action.op);
  }

  /**
   * Общая обвязка действий: одно действие за раз, снимок «до» для сообщения об изменениях, события мира для новых событий.
   * meta — { spawnId } и т. п. попадает в payload WORLD_EVENT.
   */
  async exec(op, body, tag = op, extra = {}) {
    if (this.pending) return { ok: false, reason: 'busy' };
    const before = JSON.parse(JSON.stringify(this.state.data));
    this.pending = (async () => {
      try {
        return await body(this.getSession());
      } catch (e) {
        console.error('[PlayerActions] непредвиденный сбой действия', op, e);
        return { ok: false, reason: 'error', error: { rpc: 'client', code: e?.name || 'Error', status: 0, detail: String(e?.message || e).slice(0, 80) } };
      }
    })();
    let res;
    try { res = await this.pending; } finally { this.pending = null; }
    if (res?.ok) {
      res = { ...res, outcome: PlayerActions.outcome(before, this.state.data) };
      for (const ev of res.outcome.events) this.bus?.emit(MSG.WORLD_EVENT, ev, { action: tag, ...extra }, { levelUps: res.outcome.levelUps, granted: null });
      this.bus?.emit(MSG.QUEST_CHANGED);
      this.bus?.emit(MSG.HUD_REFRESH);
    }
    return res;
  }

  /** v0.14.0: бой начался — сервер запоминает состояние героя; в ответе его HP и мана на старт боя (они же в state.data). */
  combatStart(spawn, enemy) { return this.run({ op: 'combat_start', spawn, enemy }); }

  /**
   * v0.14.0: запись боя на проверку. Успех: { ok, outcome: 'victory'|'defeat'|'retreat', verdict, outcome (изменения: опыт, уровни, предметы, события) }.
   * Отказ сервера: { ok: false, reason: 'bad_log' | 'too_fast' | 'no_combat' | … }. Сеть/занято/сессия — как у run().
   */
  async combatSubmit(log, spawnId = null) {
    const r = await this.exec('combat', async (ses) => {
      if (ses) return ses.submitCombat(log);
      const now = this.state.now();
      const snap = toSnapshot(this.state.data);
      const v = verifyCombat(snap, log, now);
      if (!v.ok) return { ok: false, reason: v.reason };
      const { snapshot, result } = combatApply(snap, v.verdict, now);
      if (result.ok) { this.state.setData(fromSnapshot(snapshot, this.state.data)); this.state.save(); return { ...result, verdict: v.verdict }; }
      return result;
    }, 'combat', { spawnId });
    return r;
  }

  craft(recipe) { return this.run({ op: 'craft', recipe }); }
  use(item) { return this.run({ op: 'use', item }); }
  migrateV10() { return this.run({ op: 'migrate_v10' }); }

  heal() { return this.run({ op: 'heal' }); }
  /** v0.12.0: зелье из сумки вне боя (настой жизни, лунный эликсир). */
  drink(item) { return this.run({ op: 'drink', item }); }
  /** v0.12.0: бой закончился. С v0.14.0 сервер принимает так только отступление (outcome 'retreat'); победа и поражение — combatSubmit. */
  combatEnd(outcome, mana) { return this.run({ op: 'combat_end', outcome, mana }); }
  /** v0.13.0: сбор узла, находка, запас или магия в мире — решает и записывает сервер (правила: config/storyItems.js worldRules). */
  world(obj) { return this.run({ op: 'world', obj }); }
  starterKit() { return this.run({ op: 'starter_kit' }); }

  // v0.15.0: подтверждение локальных действий (см. mirror). Условия и награды определяет сервер (config/serverRules.js).
  event(key) { return this.mirror({ op: 'event', key }); }
  questAccept(quest) { return this.mirror({ op: 'quest_accept', quest }); }
  questTurnIn(quest) { return this.mirror({ op: 'quest_turn_in', quest }); }
  researchStart(upgrade) { return this.mirror({ op: 'research_start', upgrade }); }
  researchFinish() { return this.mirror({ op: 'research_finish' }); }
  respec(ability, branch) { return this.mirror({ op: 'respec', ability, branch }); }
  // v0.16.0: слоты даров, амулеты и единственный пресет — сервер проверяет и записывает (player_build)
  buildSet(want) { return this.mirror({ op: 'build_set', ...want }); }
  buildPreset(mode, slot = 1) { return this.mirror({ op: 'build_preset', mode, slot }); }
  // v0.17.0: сапфиры — только сервер (без локального показа заранее): ответ сервера и есть результат
  researchSpeedup(chunks) { return this.run({ op: 'research_speedup', chunks }); }
  presetUnlock() { return this.run({ op: 'preset_unlock' }); }
  bankWelcome() { return this.run({ op: 'bank_welcome' }); }
  respecSapphires(ability, branch) { return this.run({ op: 'respec', ability, branch, pay: 'sapphires' }); }
  // v0.19.0: торговец и улучшение амулетов — решает сервер
  shopBuy(item, qty = 1) { return this.run({ op: 'shop_buy', item, qty }); }
  shopSell(item, qty = 1) { return this.run({ op: 'shop_sell', item, qty }); }
  amuletUpgrade(amulet) { return this.run({ op: 'amulet_upgrade', amulet }); }
}
