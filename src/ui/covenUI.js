// v0.25.0 — окно Ковенов (HTML поверх игры, как окна аккаунта: на телефоне так работает клавиатура для названия).
// Без ковена: список ковенов (вступить) и «Основать ковен». В ковене: девиз, неделя (очки / цель), состав с ролями и действиями,
// «Внести материалы», «Забрать награду недели», «Покинуть». Чат ковена — вкладка с его названием в окне чата.
import { domEl as el, domOverlay as overlay } from './accountUI.js';
import { COVENS, COVEN_ROLES } from '../config/covens.js';
import { ITEMS } from '../config/balance.progression.js';
import { covenReason } from '../cloud/CovenService.js';
import { errorText, CloudError } from '../cloud/api.js';

const CSS = `
.cov-list{display:flex;flex-direction:column;gap:8px;margin:8px 0}
.cov-item{background:#120d0a99;border:1px solid #b8923c55;border-radius:10px;padding:8px 10px;display:flex;gap:8px;align-items:center}
.cov-item .grow{flex:1;min-width:0}
.cov-item b{color:#f6e3a1}
.cov-item small{display:block;color:#a8977a;font-size:13px}
.cov-item button{min-height:40px;font-size:15px;padding:4px 10px}
.cov-bar{height:14px;border-radius:8px;background:#120d0a;border:1px solid #b8923c66;overflow:hidden;margin:4px 0 2px}
.cov-bar>div{height:100%;background:linear-gradient(90deg,#7ac0e8,#bff0ff)}
.cov-give{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.cov-give select,.cov-give input{font:inherit;font-size:16px;color:#fff6dc;background:#120d0a;border:1px solid #b8923c88;border-radius:10px;padding:8px;min-height:44px}
.cov-give input{width:80px}
`;
function ensureCss() {
  if (document.getElementById('cov-css')) return;
  const s = document.createElement('style'); s.id = 'cov-css'; s.textContent = CSS; document.head.appendChild(s);
}
const errText = (e) => (e instanceof CloudError ? (e.code === 'chat_unavailable' ? 'Ковены ещё не подключены на сервере. Попробуйте позже.' : errorText(e.code)) : errorText('unknown'));

/**
 * @param service CovenService
 * @param game { item(id) → сколько в сумке, give(item, qty) → ответ сервера, claim() → ответ, onChange() }
 */
export function showCovens(service, game, { onClose } = {}) {
  ensureCss();
  const card = el('div', { class: 'acc-card' });
  const h = overlay(card, { onClose });
  const msg = el('div', { class: 'acc-err', role: 'alert' });
  const say = (t, good = false) => { msg.textContent = t || ''; msg.className = 'acc-err' + (good ? ' acc-ok' : ''); };
  const btn = (text, onclick, cls = '') => el('button', { type: 'button', class: cls, text, onclick });

  async function run(fn) {
    try { const r = await fn(); if (r && r.ok === false) { say(covenReason(r.reason)); return null; } return r; } catch (e) { say(errText(e)); return null; }
  }
  async function refresh(note = '') {
    card.replaceChildren(el('h2', { text: 'Ковены' }), el('div', { class: 'acc-spin' }));
    const mine = await run(() => service.request('mine'));
    if (!mine) { card.replaceChildren(el('h2', { text: 'Ковены' }), msg, el('div', { class: 'acc-row' }, btn('Закрыть', () => h.close(), 'primary'))); return; }
    if (mine.coven) renderMine(mine.coven); else await renderList();
    if (note) say(note, true);
  }

  async function renderList() {
    const list = await run(() => service.request('list'));
    const items = el('div', { class: 'cov-list' });
    for (const c of list?.covens || []) {
      items.append(el('div', { class: 'cov-item' },
        el('div', { class: 'grow' }, el('b', { text: c.name }), el('small', { text: `${c.members} из ${list.maxMembers} · неделя: ${c.points} очков${c.motto ? ' · ' + c.motto : ''}` })),
        btn('Вступить', async () => { const r = await run(() => service.request('join', { coven: c.id })); if (r) refresh('Вы вступили в ковен.'); })));
    }
    if (!items.children.length) items.append(el('p', { class: 'acc-sub', text: 'Пока ни одного ковена. Станьте первыми!' }));
    const name = el('input', { type: 'text', maxlength: '24', placeholder: 'Название ковена' });
    const motto = el('input', { type: 'text', maxlength: '80', placeholder: 'Девиз (необязательно)' });
    const create = el('form', { novalidate: true },
      el('label', { class: 'acc-field' }, el('span', { text: 'Основать ковен' }), name),
      el('label', { class: 'acc-field' }, motto),
      el('div', { class: 'acc-row' }, el('button', { class: 'primary', type: 'submit', text: 'Основать' })));
    create.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const r = await run(() => service.request('create', { name: name.value, motto: motto.value }));
      if (r) refresh('Ковен основан! Его чат — во вкладке с названием ковена.');
    });
    card.replaceChildren(el('h2', { text: 'Ковены' }),
      el('p', { class: 'acc-sub', text: 'Маги, которые решили не справляться в одиночку: общая неделя, общие награды и свой чат.' }),
      items, list?.canCreate ? create : el('p', { class: 'acc-note', text: covenReason('locked') }), msg,
      el('div', { class: 'acc-center' }, btn('Закрыть', () => h.close(), 'link')));
  }

  function renderMine(c) {
    const pct = Math.min(100, Math.round((c.points / c.goal) * 100));
    const canManage = c.myRole === 'leader';
    const members = el('div', { class: 'cov-list' });
    for (const m of c.members) {
      const acts = [];
      if (!m.me && canManage && m.role === 'member') acts.push(btn('Советник', () => act('promote', m.ref)));
      if (!m.me && canManage && m.role === 'officer') acts.push(btn('Понизить', () => act('demote', m.ref)));
      if (!m.me && canManage) acts.push(btn('Главой', () => act('transfer', m.ref)));
      if (!m.me && (canManage || (c.myRole === 'officer' && m.role === 'member'))) acts.push(btn('Исключить', () => act('kick', m.ref), 'danger'));
      members.append(el('div', { class: 'cov-item' },
        el('div', { class: 'grow' }, el('b', { text: m.nickname + (m.me ? ' (вы)' : '') }), el('small', { text: `${COVEN_ROLES[m.role]} · вклад недели: ${m.given}` })), ...acts));
    }
    // материалы
    const sel = el('select', {}, ...Object.entries(COVENS.points).map(([id, p]) => el('option', { value: id, text: `${ITEMS[id]?.name || id} (${game.item(id)}) · ${p} оч.` })));
    const qty = el('input', { type: 'number', min: '1', max: String(COVENS.maxGive), value: '1' });
    const give = el('div', { class: 'cov-give' }, sel, qty, btn('Внести', async () => {
      const r = await run(() => game.give(sel.value, Math.floor(Number(qty.value) || 0)));
      if (r) { game.onChange?.(); refresh(`Внесено: +${r.points} очков ковену.`); }
    }, 'primary'));
    const claim = btn(c.claimed ? 'Награда недели получена' : 'Забрать награду недели', async () => {
      const r = await run(() => game.claim());
      if (r) { game.onChange?.(); refresh('Награда недели получена!'); }
    }, c.points >= c.goal && !c.claimed ? 'primary' : '');
    if (c.claimed) claim.disabled = true;
    const motto = el('input', { type: 'text', maxlength: '80', value: c.motto });
    const mottoRow = (c.myRole === 'leader' || c.myRole === 'officer')
      ? el('div', { class: 'cov-give' }, motto, btn('Сохранить девиз', async () => { const r = await run(() => service.request('motto', { motto: motto.value })); if (r) refresh('Девиз обновлён.'); }))
      : null;
    const ends = new Date(c.weekEnds);
    card.replaceChildren(
      el('h2', { text: c.name }),
      el('p', { class: 'acc-sub', text: (c.motto || 'Без девиза') + ` · вы — ${COVEN_ROLES[c.myRole].toLowerCase()}` }),
      el('div', { class: 'acc-kv' }, el('span', { text: 'Цель недели' }), el('b', { text: `${c.points} / ${c.goal}` })),
      el('div', { class: 'cov-bar' }, el('div', { style: `width:${pct}%` })),
      el('p', { class: 'acc-note', text: `Очки ковену: материалы и поручения доски (${COVENS.dailyPoints} за каждое). Когда цель набрана, каждый, кто внёс не меньше ${c.minGiven} очков, `
        + `забирает награду: ${COVENS.reward.coins} монет, ледяные кристаллы и инеевый осколок. Ваш вклад: ${c.myGiven}. Новая неделя — ${ends.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.` }),
      give, claim, mottoRow,
      el('h2', { text: 'Состав', style: 'font-size:20px;margin-top:12px' }), members,
      el('p', { class: 'acc-sub', text: 'Чат ковена — во вкладке с его названием в окне чата.' }),
      msg,
      el('div', { class: 'acc-row' }, btn('Покинуть ковен', async () => { const r = await run(() => service.request('leave')); if (r) refresh('Вы покинули ковен.'); }, 'danger'), btn('Закрыть', () => h.close())),
    );
  }
  async function act(op, ref) { const r = await run(() => service.request(op, { ref })); if (r) refresh('Готово.'); }

  refresh();
  return h;
}
