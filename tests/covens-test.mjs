// v0.25.0 — Ковены: данные, JS-зеркало (coven_give / coven_claim без ковена), окно ковенов на простом поддельном DOM.
// Сервер и роли — tools/sql/coven-test.mjs (Postgres), чат ковена — tests/chat-roles-test.mjs (PGlite).
//   node tests/covens-test.mjs
import { COVENS, COVEN_ROLES, covenRules, covenCycleStartDay, covenCycleEndMs, covenGoalAfter, covenMinGiven, covenPool, covenShares, covenRewardFor } from '../src/config/covens.js';
import { ITEMS } from '../src/config/balance.progression.js';
import { serverRules } from '../src/config/serverRules.js';
import { applyAction, emptySnapshot } from '../src/cloud/playerModel.js';
import { CovenService, covenReason, COVEN_REASONS } from '../src/cloud/CovenService.js';
import { DIALOGUES } from '../src/config/dialogues.js';
import fs from 'fs';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };

// ---- простой поддельный DOM: столько, сколько нужно окнам аккаунта и ковенов
class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.textContent = ''; this.className = ''; this.style = {}; this.value = ''; this.disabled = false; this.parent = null; }
  append(...k) { for (const c of k) { if (c == null) continue; if (typeof c === 'string') { this.textContent += c; continue; } c.parent = this; this.children.push(c); } }
  appendChild(c) { this.append(c); return c; }
  replaceChildren(...k) { this.children = []; this.append(...k); }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'value') this.value = v; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  contains() { return false; }
  focus() {}
  all() { return [this, ...this.children.flatMap(c => c.all())]; }
  click() { for (const f of this.listeners.click || []) f({ preventDefault() {} }); }
  submit() { for (const f of this.listeners.submit || []) f({ preventDefault() {} }); }
}
const head = new Node('head'), body = new Node('body');
globalThis.document = { head, body, createElement: (t) => new Node(t), getElementById: (id) => [...head.all(), ...body.all()].find(n => n.attrs?.id === id || n.id === id) || null, activeElement: null };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const texts = () => body.all().map(n => n.textContent).join(' | ');
const buttons = () => body.all().filter(n => n.tagName === 'button');
const flush = () => new Promise(r => setTimeout(r, 0));

console.log('\nКовены: данные');
{
  ok(Object.keys(COVENS.points).every(k => ITEMS[k]) && Object.keys(COVENS.reward.items).every(k => ITEMS[k]), 'материалы и награда — существующие предметы');
  ok(COVENS.goal > COVENS.minGiven * 3 && COVENS.maxMembers === 20, 'цель цикла — общая (не набрать одному за минимальный вклад)');
  ok(COVENS.cycle.days === 3 && COVENS.goal === 400 && COVENS.goalStep === 200 && COVENS.goalMax === 1500, 'цикл 3 дня, цель от 400 с шагом 200, потолок 1500');
  ok(COVENS.top.size === 5 && COVENS.top.shares.length === 5 && COVENS.top.shares.reduce((a, b) => a + b, 0) === 100, 'пятёрка: доли по местам в сумме 100%');
  ok(JSON.stringify(serverRules().covens) === JSON.stringify(covenRules()), 'правила ковенов — в _game_rules');
  ok(Object.keys(COVEN_ROLES).join() === 'leader,officer,member', 'три роли: глава, советник, участник');
  // лестница цели: выполнили — +200 до потолка, нет — −200 не ниже 400
  ok(covenGoalAfter(400, true) === 600 && covenGoalAfter(600, true) === 800 && covenGoalAfter(1400, true) === 1500 && covenGoalAfter(1500, true) === 1500, 'лестница вверх: 400 → 600 → … → потолок 1500');
  ok(covenGoalAfter(1000, false) === 800 && covenGoalAfter(600, false) === 400 && covenGoalAfter(400, false) === 400, 'лестница вниз: −200, но не ниже 400');
  // пул: 10% от цели с потолком, доли по местам; пример владельца — 400 → 40, 1000 → 100
  ok(covenPool(400) === 40 && covenPool(1000) === 100 && covenPool(1500) === 150 && covenPool(5000) === 150, 'пул пятёрке: 400 → 40, 1000 → 100, не больше 150');
  ok(covenShares(40).join() === '12,10,8,6,4' && covenShares(100).join() === '30,25,20,15,10' && covenShares(40).reduce((a, b) => a + b, 0) <= 40, 'доли пула 30/25/20/15/10 %, целыми, не больше пула');
  ok(covenMinGiven(400) === 20 && covenMinGiven(1000) === 50 && covenMinGiven(1500) === 75, 'минимум вклада растёт с целью: 20 / 50 / 75');
  ok(covenRewardFor(400).coins === 50 && covenRewardFor(600).coins === 75 && covenRewardFor(1500).coins === 190, 'монеты за цикл растут вместе с целью (50 за каждые 400 очков)');
  // границы цикла: 5 октября 2026 (понедельник) — начало первого; сутки 6 и 7 — внутри него, 8-е — следующий цикл
  const d = (iso) => Date.parse(iso);
  ok(covenCycleStartDay(d('2026-10-05T00:00:00Z')) === COVENS.cycle.startDay && covenCycleStartDay(d('2026-10-07T23:59:59Z')) === COVENS.cycle.startDay && covenCycleStartDay(d('2026-10-08T00:00:00Z')) === COVENS.cycle.startDay + 3, 'цикл меняется каждые 3 суток в полночь UTC');
  ok(covenCycleEndMs(d('2026-10-08T10:00:00Z')) === d('2026-10-11T00:00:00Z') && covenCycleStartDay(d('2026-10-04T12:00:00Z')) === COVENS.cycle.startDay - 3, 'конец цикла; до первого цикла счёт идёт назад по тем же границам');
  const sql = fs.readFileSync('supabase/migrations/20261007_covens.sql', 'utf8');
  ok(/kind not in \('dm','coven'\)/.test(sql) && /grant execute on function public\.coven_request/.test(sql), 'миграция: чат ковена только для участников, RPC для игроков');
  ok(DIALOGUES.rowena.find(v => v.id === 'rowena_after').nodes.start.choices.some(c => c.do?.some(e => e.covens)), 'Ровена открывает окно Ковенов');
}

console.log('\nКовены: JS-зеркало');
{
  const s = { ...emptySnapshot(), level: 14 };
  ok(applyAction(s, { op: 'coven_give', item: 'ice_crystal', qty: 1 }).result.reason === 'no_coven' && applyAction(s, { op: 'coven_claim' }).result.reason === 'no_coven' && applyAction(s, { op: 'coven_payout' }).result.reason === 'no_coven', 'без ковена (и без миграции) — «no_coven», как на сервере');
  ok(!new CovenService(null).available && !new CovenService({ signedIn: false }).available, 'без входа в аккаунт окно ковенов недоступно');
  ok(Object.keys(COVEN_REASONS).length >= 14 && covenReason('nope') === COVEN_REASONS.unknown, 'у каждой причины отказа — понятный текст');
}

console.log('\nКовены: окно');
{
  const { showCovens } = await import('../src/ui/covenUI.js');
  const calls = [];
  let inCoven = null;
  const svc = { request: async (op, args) => {
    calls.push([op, args]);
    if (op === 'mine') return { ok: true, coven: inCoven };
    if (op === 'list') return { ok: true, canCreate: true, maxMembers: 20, covens: [{ id: 'c1', name: 'Пепел', motto: 'Вместе', members: 3, points: 40 }] };
    if (op === 'join') { inCoven = { name: 'Пепел', motto: 'Вместе', myRole: 'leader', myGiven: 0, myRank: 2, claimed: false, points: 120, goal: 400, minGiven: 20, cycleDays: 3,
      cycleEnds: new Date(Date.now() + 30 * 3_600_000 + 60_000).toISOString(), goalUp: 600, goalDown: 400, pool: 40, topSize: 5, shares: [12, 10, 8, 6, 4],
      last: { cycleStart: '2026-10-05', goal: 400, points: 405, success: true, pool: 40 }, payouts: [{ cycleStart: '2026-10-05', rank: 1, amount: 12 }, { cycleStart: '2026-10-02', rank: 3, amount: 8 }],
      members: [{ ref: 'r1', nickname: 'Я', role: 'leader', given: 0, rank: 2, qualified: false, me: true }, { ref: 'r2', nickname: 'Друг', role: 'member', given: 30, rank: 1, qualified: true, me: false }] }; return { ok: true, coven: inCoven }; }
    if (op === 'promote') return { ok: false, reason: 'forbidden' };
    return { ok: true };
  } };
  const gives = [];
  const game = { item: () => 5, give: async (i, q) => { gives.push([i, q]); return { ok: true, points: q * 5 }; }, claim: async () => ({ ok: false, reason: 'progress' }), payout: async () => { payouts++; inCoven = { ...inCoven, payouts: [] }; return { ok: true, amount: 20 }; } };
  let payouts = 0;
  let closed = false;
  const h = showCovens(svc, game, { onClose: () => { closed = true; } });
  await flush(); await flush();
  ok(texts().includes('Пепел') && buttons().some(b => b.textContent === 'Вступить') && buttons().some(b => b.textContent === 'Основать'), 'без ковена: список с «Вступить» и форма «Основать»');
  buttons().find(b => b.textContent === 'Вступить').click();
  await flush(); await flush(); await flush();
  ok(calls.some(([op, a]) => op === 'join' && a.coven === 'c1') && texts().includes('120 / 400') && texts().includes('Друг'), 'вступили: цель цикла и состав');
  ok(texts().includes('Цикл 3 дня') && texts().includes('осталось 1 д 6 ч'), 'цикл: сколько осталось');
  ok(texts().includes('Цель следующего цикла: 600') && texts().includes('400, если нет'), 'лестница: цель дальше вверх и вниз');
  ok(texts().includes('Пул сапфиров пятёрке лучших: 40') && texts().includes('1 место — 12') && texts().includes('5 место — 4'), 'пул и доли по местам');
  ok(texts().includes('место 1 (пятёрка, 12 сапфиров)') && texts().includes('до пятёрки не хватает') === false, 'в составе у лучшего — место и сумма; у главы без вклада — без «не хватает»');
  ok(texts().includes('Прошлый цикл: цель 400 выполнена (405), пул 40 сапфиров.'), 'итог прошлого цикла');
  ok(texts().includes('Вы вошли в пятёрку лучших: 1 место — 12 сапфиров, 3 место — 8 сапфиров'), 'выплаты пятёрке показаны');
  ok(buttons().some(b => b.textContent === 'Советник') && buttons().some(b => b.textContent === 'Исключить'), 'глава видит действия с участниками');
  buttons().find(b => b.textContent === 'Внести').click();
  await flush(); await flush();
  ok(gives.length === 1 && gives[0][1] === 1, 'материалы вносятся через сервер (player_action)');
  buttons().find(b => b.textContent === 'Забрать награду цикла').click();
  await flush();
  ok(texts().includes(COVEN_REASONS.progress), 'отказ сервера объяснён словами');
  buttons().find(b => b.textContent === 'Забрать 20 сапфиров').click();
  await flush(); await flush(); await flush();
  ok(payouts === 1 && texts().includes('Получено: 20 сапфиров.') && !buttons().some(b => b.textContent.startsWith('Забрать 20')), 'сапфиры забраны через сервер, кнопка исчезла');
  h.close();
  ok(closed && !body.children.length, 'окно закрывается');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Ковены: всё в порядке');
process.exit(failures ? 1 : 0);
