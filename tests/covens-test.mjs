// v0.25.0 — Ковены: данные, JS-зеркало (coven_give / coven_claim без ковена), окно ковенов на простом поддельном DOM.
// Сервер и роли — tools/sql/coven-test.mjs (Postgres), чат ковена — tests/chat-roles-test.mjs (PGlite).
//   node tests/covens-test.mjs
import { COVENS, COVEN_ROLES, covenRules } from '../src/config/covens.js';
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
  ok(COVENS.goal > COVENS.minGiven * 3 && COVENS.maxMembers === 20, 'цель недели — общая (не набрать одному за минимальный вклад)');
  ok(JSON.stringify(serverRules().covens) === JSON.stringify(covenRules()), 'правила ковенов — в _game_rules');
  ok(Object.keys(COVEN_ROLES).join() === 'leader,officer,member', 'три роли: глава, советник, участник');
  const sql = fs.readFileSync('supabase/migrations/20261007_covens.sql', 'utf8');
  ok(/kind not in \('dm','coven'\)/.test(sql) && /grant execute on function public\.coven_request/.test(sql), 'миграция: чат ковена только для участников, RPC для игроков');
  ok(DIALOGUES.rowena.find(v => v.id === 'rowena_after').nodes.start.choices.some(c => c.do?.some(e => e.covens)), 'Ровена открывает окно Ковенов');
}

console.log('\nКовены: JS-зеркало');
{
  const s = { ...emptySnapshot(), level: 14 };
  ok(applyAction(s, { op: 'coven_give', item: 'ice_crystal', qty: 1 }).result.reason === 'no_coven' && applyAction(s, { op: 'coven_claim' }).result.reason === 'no_coven', 'без ковена (и без миграции) — «no_coven», как на сервере');
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
    if (op === 'join') { inCoven = { name: 'Пепел', motto: 'Вместе', myRole: 'leader', myGiven: 0, claimed: false, points: 120, goal: 400, minGiven: 20, weekEnds: '2026-10-12T00:00:00Z',
      members: [{ ref: 'r1', nickname: 'Я', role: 'leader', given: 0, me: true }, { ref: 'r2', nickname: 'Друг', role: 'member', given: 30, me: false }] }; return { ok: true, coven: inCoven }; }
    if (op === 'promote') return { ok: false, reason: 'forbidden' };
    return { ok: true };
  } };
  const gives = [];
  const game = { item: () => 5, give: async (i, q) => { gives.push([i, q]); return { ok: true, points: q * 5 }; }, claim: async () => ({ ok: false, reason: 'progress' }) };
  let closed = false;
  const h = showCovens(svc, game, { onClose: () => { closed = true; } });
  await flush(); await flush();
  ok(texts().includes('Пепел') && buttons().some(b => b.textContent === 'Вступить') && buttons().some(b => b.textContent === 'Основать'), 'без ковена: список с «Вступить» и форма «Основать»');
  buttons().find(b => b.textContent === 'Вступить').click();
  await flush(); await flush(); await flush();
  ok(calls.some(([op, a]) => op === 'join' && a.coven === 'c1') && texts().includes('120 / 400') && texts().includes('Друг'), 'вступили: цель недели и состав');
  ok(buttons().some(b => b.textContent === 'Советник') && buttons().some(b => b.textContent === 'Исключить'), 'глава видит действия с участниками');
  buttons().find(b => b.textContent === 'Внести').click();
  await flush(); await flush();
  ok(gives.length === 1 && gives[0][1] === 1, 'материалы вносятся через сервер (player_action)');
  buttons().find(b => b.textContent === 'Забрать награду недели').click();
  await flush();
  ok(texts().includes(COVEN_REASONS.progress), 'отказ сервера объяснён словами');
  h.close();
  ok(closed && !body.children.length, 'окно закрывается');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Ковены: всё в порядке');
process.exit(failures ? 1 : 0);
