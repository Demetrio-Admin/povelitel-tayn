// v0.23.0 — доска поручений: данные, выбор поручений дня, взять/сдать на JS-зеркале сервера, предел трёх, смена дня, окно.
//   node tests/daily-test.mjs
import { DAILY, DAILY_POOL, DAILY_ORDER, dailyOffers, dailyDay } from '../src/config/daily.js';
import { ITEMS } from '../src/config/balance.progression.js';
import { ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { INTERACTIVES } from '../src/config/world.layout.js';
import { applyAction, emptySnapshot, dailyOffersOf, fromSnapshot } from '../src/cloud/playerModel.js';
import { GameState } from '../src/state/GameState.js';
import { dailyView } from '../src/systems/dailyModel.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };

console.log('\nДоска поручений: данные');
{
  const spawns = Object.fromEntries(ENEMY_SPAWNS.map(s => [s.id, s]));
  ok(DAILY_ORDER.length >= 10 && DAILY.offers === 5 && DAILY.picks === 3, `в списке ${DAILY_ORDER.length} поручений, на доске 5, взять 3`);
  let good = true;
  for (const [id, o] of Object.entries(DAILY_POOL)) {
    const g = o.goal;
    if (g.type === 'deliver') { if (!Object.keys(g.items).every(k => ITEMS[k])) { good = false; console.log('   ', id, 'неизвестный предмет'); } }
    else if (g.type === 'wins') { if (!g.spawns.every(s => spawns[s]?.repeatSec) || !(g.count > 0)) { good = false; console.log('   ', id, 'место не возобновляется'); } }
    else { good = false; console.log('   ', id, 'тип цели?'); }
    const r = o.reward;
    if (!(r.heroXP >= 30 && r.heroXP <= 60 && r.coins >= 20 && r.coins <= 40)) { good = false; console.log('   ', id, 'награда вне 30–60 опыта / 20–40 монет'); }
    if (!Object.keys(r.items || {}).every(k => ITEMS[k])) { good = false; console.log('   ', id, 'награда: неизвестный предмет'); }
  }
  ok(good, 'цели — существующие предметы и возобновляемые места; награда 30–60 опыта и 20–40 монет (chapter-2-balance §28)');
  const days = [0, 1, 20000, 20366, 20367, 99999];
  ok(days.every(d => { const a = dailyOffers(d); return a.length === 5 && new Set(a).size === 5; }), 'каждый день — 5 разных поручений');
  ok(days.every(d => dailyOffers(d).join() === dailyOffersOf(d).join()), 'выбор дня одинаковый в конфиге и на сервере (JS-зеркало)');
  ok(dailyOffers(20366).join() !== dailyOffers(20367).join(), 'на следующий день — другая доска');
  const seen = new Set(); for (let d = 20000; d < 20060; d++) dailyOffers(d).forEach(x => seen.add(x));
  ok(seen.size === DAILY_ORDER.length, 'за два месяца встречается каждое поручение');
  ok(INTERACTIVES.some(o => o.kind === 'board' && o.id === 'city_board'), 'доска стоит на площади');
}

console.log('\nДоска поручений: сервер (JS-зеркало)');
{
  const T0 = Date.UTC(2026, 9, 6, 10, 0, 0);
  const day = dailyDay(T0), offers = dailyOffers(day);
  let s = { ...emptySnapshot(), level: 12 };
  s.inventory = { ...s.inventory, frost_herb: 10, ice_crystal: 5, warm_potion: 2, tree_resin: 6, rune_dust: 6, elixir_life: 4, forest_mushroom: 6 };
  let T = T0;
  const act = (a) => { T += 1000; const r = applyAction(s, a, T); s = r.snapshot; return r.result; };
  ok(act({ op: 'daily_take', offer: offers[0] }).reason === 'locked', 'до квеста 10 доска закрыта');
  s.quests = [...s.quests, 'ch2_quarter_cleared', 'ch2_lab_open'];
  const notToday = DAILY_ORDER.find(id => !offers.includes(id));
  ok(act({ op: 'daily_take', offer: notToday }).reason === 'unknown', 'поручение не с сегодняшней доски не взять');
  ok(act({ op: 'daily_done', offer: offers[0] }).reason === 'not_taken', 'сдать можно только взятое');
  const took = offers.slice(0, 3).map(id => act({ op: 'daily_take', offer: id }).ok);
  ok(took.every(Boolean) && act({ op: 'daily_take', offer: offers[3] }).reason === 'limit', 'взять можно три, четвёртое — «limit»');
  ok(act({ op: 'daily_take', offer: offers[0] }).reason === 'already', 'повторно не взять');
  // победы: счётчики возобновляемых мест растут только после того, как поручение взято
  for (const id of offers.slice(0, 3)) {
    const g = DAILY_POOL[id].goal;
    if (g.type === 'wins') {
      ok(act({ op: 'daily_done', offer: id }).reason === 'progress', `«${DAILY_POOL[id].title}»: без новых побед — ещё не готово`);
      s.objects[`rep:${g.spawns[0]}`] = { wins: ((s.objects[`rep:${g.spawns[0]}`] || {}).wins || 0) + g.count, at: T };
    }
    const xp = s.xp;
    ok(act({ op: 'daily_done', offer: id }).ok && s.xp - xp === DAILY_POOL[id].reward.heroXP, `«${DAILY_POOL[id].title}» сдано: награда по таблице`);
  }
  ok(act({ op: 'daily_done', offer: offers[0] }).reason === 'already', 'сданное второй раз не сдать');
  // новый день — новая доска, счётчик взятых сброшен
  T = (day + 1) * DAILY.dayMs + 1000;
  const next = dailyOffers(day + 1);
  ok(act({ op: 'daily_take', offer: next[0] }).ok && Object.keys(s.objects.daily.taken).length === 1 && s.objects.daily.d === day + 1, 'на следующий день — снова три поручения');
  // окно: статусы по тому же состоянию
  const st = new GameState(null, () => T);
  st.setData(fromSnapshot(s));
  const v = dailyView(st, T);
  ok(v.open && v.takenN === 1 && v.rows.length === 5 && v.rows[0].status !== 'free' && v.rows.slice(1).every(r => ['free', 'locked'].includes(r.status)), 'окно: взятое отмечено, остальные свободны');
  ok(v.rows.every(r => r.reward && r.goal && r.progress), 'окно: у каждого поручения цель, прогресс и награда');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Доска поручений: всё в порядке');
process.exit(failures ? 1 : 0);
