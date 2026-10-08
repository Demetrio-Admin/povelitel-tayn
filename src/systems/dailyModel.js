// v0.23.0 — модель доски поручений для окна (без Phaser, проверяется тестами). Решает сервер (op daily_take / daily_done);
// здесь — что показать: поручения дня, их цель и прогресс, награда, можно ли взять или сдать.
import { DAILY, DAILY_POOL, dailyOffers, dailyDay } from '../config/daily.js';
import { ITEMS } from '../config/balance.progression.js';
import { sapphires as sapphireText } from './wallet.js';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const name = (id) => ITEMS[id]?.name || id;

/** Победы на возобновляемых местах (как dailyWins на сервере). */
export function winsOn(state, spawns) {
  let n = 0;
  for (const id of spawns) { const r = state.getObject(`rep:${id}`); if (isObj(r) && Number.isFinite(r.wins)) n += r.wins; }
  return n;
}

/** Состояние доски сегодня (вчерашнее не считается). */
export function dailyToday(state, nowMs = state.now()) {
  const d = dailyDay(nowMs);
  const o = state.getObject('daily');
  if (!isObj(o) || o.d !== d) return { d, taken: {}, done: [] };
  return { d, taken: isObj(o.taken) ? o.taken : {}, done: Array.isArray(o.done) ? o.done : [] };
}

export function rewardText(r = {}) {
  const parts = [];
  if (r.heroXP) parts.push(`${r.heroXP} опыта`);
  if (r.coins) parts.push(`${r.coins} монет`);
  if (r.sapphires) parts.push(sapphireText(r.sapphires));
  for (const [k, v] of Object.entries(r.items || {})) parts.push(`${name(k)} ×${v}`);
  return parts.join(', ');
}

/** Всё для окна: открыта ли доска, сколько взято, когда обновится, строки поручений. */
export function dailyView(state, nowMs = state.now()) {
  const open = state.hasEvent(DAILY.requires);
  const today = dailyToday(state, nowMs);
  const takenN = Object.keys(today.taken).length;
  const leftMs = (today.d + 1) * DAILY.dayMs - nowMs;
  const rows = dailyOffers(today.d).map((id) => {
    const o = DAILY_POOL[id], g = o.goal;
    const taken = Object.hasOwn(today.taken, id), done = today.done.includes(id);
    let goal, progress, ready;
    if (g.type === 'deliver') {
      goal = 'Принести: ' + Object.entries(g.items).map(([k, v]) => `${name(k)} ×${v}`).join(', ');
      progress = Object.entries(g.items).map(([k, v]) => `${Math.min(state.item(k), v)}/${v}`).join(', ');
      ready = Object.entries(g.items).every(([k, v]) => state.item(k) >= v);
    } else {
      const got = taken ? Math.max(0, winsOn(state, g.spawns) - (Number(today.taken[id]) || 0)) : 0;
      goal = `Победить: ${g.count}`;
      progress = `${Math.min(got, g.count)}/${g.count}`;
      ready = taken && got >= g.count;
    }
    const locked = !!o.requires && !state.hasEvent(o.requires);
    const status = done ? 'done' : taken ? (ready ? 'ready' : 'taken') : locked ? 'locked' : 'free';
    return {
      id, title: o.title, giver: o.giver, text: o.text, goal, progress, reward: rewardText(o.reward), status,
      canTake: open && status === 'free' && takenN < DAILY.picks, canDone: status === 'ready',
    };
  });
  return { open, takenN, picks: DAILY.picks, leftH: Math.floor(leftMs / 3_600_000), leftM: Math.floor((leftMs % 3_600_000) / 60_000), rows };
}
