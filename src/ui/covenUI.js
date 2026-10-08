// v0.25.0 — окно Ковенов (HTML поверх игры, как окна аккаунта: на телефоне так работает клавиатура для названия).
// Без ковена: список ковенов (вступить) и «Основать ковен». В ковене: девиз, неделя (очки / цель), состав с ролями и действиями,
// «Внести материалы», «Забрать награду недели», «Покинуть». Чат ковена — вкладка с его названием в окне чата.
import { domEl as el, domOverlay as overlay } from './accountUI.js';
import { COVENS, COVEN_ROLES } from '../config/covens.js';
import { ITEMS } from '../config/balance.progression.js';
import { covenReason } from '../cloud/CovenService.js';
import { errorText, CloudError } from '../cloud/api.js';
import { ASSET_FILES } from '../config/assets.manifest.js';

const CSS = `
.cov-list{display:flex;flex-direction:column;gap:0;margin:8px 0 16px}
.cov-item{border-bottom:1px solid #b8923c44;padding:12px 0;display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.cov-item .grow{flex:1;min-width:0}
.cov-item b{color:#f6e3a1;overflow-wrap:anywhere}
.cov-item small{display:block;color:#cfbea3;font-size:13px;line-height:1.45;overflow-wrap:anywhere;margin-top:3px}
.cov-item button{min-height:42px;font-size:14px;padding:6px 10px}
.cov-card h3{font-size:18px;color:#f6e3a1;margin:18px 0 8px;line-height:1.25}
.cov-empty{text-align:center;padding:16px 6px 20px;margin-bottom:8px;border-bottom:1px solid #b8923c44}
.cov-empty p{margin:8px 0 0;color:#cfbea3;font-size:14px;line-height:1.45}
.cov-empty-mark{display:block;width:38px;height:38px;margin:0 auto 12px;color:#e8c56a}
.cov-empty-mark .acc-icon{width:100%;height:100%;mask-image:url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.5"%3E%3Cpath d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/%3E%3C/svg%3E');-webkit-mask-image:url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.5"%3E%3Cpath d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/%3E%3C/svg%3E')}
.cov-week{margin:8px 0 16px}
.cov-week .acc-kv{border:0;align-items:baseline}
.cov-week .acc-kv b{font-size:23px}
.cov-bar{height:13px;border-radius:8px;background:#160f09;border:1px solid #ad8b4f;overflow:hidden;margin:3px 0 8px;box-shadow:inset 0 2px 4px #0008}
.cov-bar>div{height:100%;background:linear-gradient(#ccecf3,#79b5c5 50%,#47778e);box-shadow:inset 0 1px 0 #eefaffb3}
.cov-deadline{text-align:right;font-size:13px;color:#cfbea3;margin:0 0 14px}
.cov-rewards{display:flex;justify-content:space-around;gap:8px;flex-wrap:wrap;padding:12px 0;border-block:1px solid #b8923c44;margin:10px 0}
.cov-reward{display:flex;align-items:center;gap:6px;color:#f6e3a1;font-size:17px}
.cov-reward img{width:29px;height:29px;object-fit:contain}
.cov-give{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.cov-give select,.cov-give input{font:inherit;font-size:16px;color:#fff6dc;background:#1a110ae6;border:1px solid #96723b;border-radius:8px;padding:10px;min-height:46px;min-width:0;box-shadow:inset 0 2px 5px #0005}
.cov-give select{width:100%}
.cov-give input{width:76px}
.cov-give button{flex:1}
.cov-motto input{flex:1;width:100%}
.cov-claim{width:100%}
.cov-footer{flex-direction:row;flex-wrap:wrap;border-top:1px solid #b8923c44;padding-top:14px}
.cov-footer button{flex:1;min-width:110px}
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
  const card = el('div', { class: 'acc-card cov-card' });
  const h = overlay(card, { onClose, label: 'Ковены' });
  const msg = el('div', { class: 'acc-err', role: 'alert' });
  const say = (t, good = false) => { msg.textContent = t || ''; msg.className = 'acc-err' + (good ? ' acc-ok' : ''); };
  const btn = (text, onclick, cls = '') => el('button', { type: 'button', class: cls, text, onclick });

  async function run(fn) {
    try { const r = await fn(); if (r && r.ok === false) { say(covenReason(r.reason)); return null; } return r; } catch (e) { say(errText(e)); return null; }
  }
  async function refresh(note = '') {
    card.replaceChildren(el('h2', { text: 'Ковены' }), el('div', { class: 'acc-spin' }));
    const mine = await run(() => service.request('mine'));
    if (h.closed) return;
    if (!mine) { card.replaceChildren(el('h2', { text: 'Ковены' }), msg, el('div', { class: 'acc-row' }, btn('Закрыть', () => h.close(), 'primary'))); return; }
    if (mine.coven) renderMine(mine.coven); else await renderList();
    if (note) say(note, true);
  }

  async function renderList() {
    const list = await run(() => service.request('list'));
    if (h.closed) return;
    if (!list) {
      card.replaceChildren(el('h2', { text: 'Ковены' }), msg,
        el('div', { class: 'acc-row' }, btn('Повторить', () => refresh(), 'primary'), btn('Закрыть', () => h.close())));
      return;
    }
    const items = el('div', { class: 'cov-list' });
    for (const c of list?.covens || []) {
      items.append(el('div', { class: 'cov-item' },
        el('div', { class: 'grow' }, el('b', { text: c.name }), el('small', { text: `${c.members} из ${list.maxMembers} · неделя: ${c.points} очков${c.motto ? ' · ' + c.motto : ''}` })),
        btn('Вступить', async () => { const r = await run(() => service.request('join', { coven: c.id })); if (r) refresh('Вы вступили в ковен.'); })));
    }
    if (!items.children.length) items.append(el('div', { class: 'cov-empty' },
      el('span', { class: 'cov-empty-mark', 'aria-hidden': 'true' }, el('span', { class: 'acc-icon' })),
      el('b', { text: 'Пока ни одного ковена' }),
      el('p', { text: 'Основайте свой и соберите магов под одним именем.' })));
    const name = el('input', { type: 'text', maxlength: '24', placeholder: 'Название ковена' });
    const motto = el('input', { type: 'text', maxlength: '80', placeholder: 'Девиз (необязательно)' });
    const create = el('form', { novalidate: true },
      el('h3', { text: 'Основать ковен' }),
      el('label', { class: 'acc-field' }, el('span', { text: 'Название' }), name),
      el('label', { class: 'acc-field' }, el('span', { text: 'Девиз' }), motto),
      el('div', { class: 'acc-row' }, el('button', { class: 'primary', type: 'submit', text: 'Основать' })));
    create.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const r = await run(() => service.request('create', { name: name.value, motto: motto.value }));
      if (r) refresh('Ковен основан! Его чат — во вкладке с названием ковена.');
    });
    card.replaceChildren(el('h2', { text: 'Ковены' }),
      el('p', { class: 'acc-sub', text: 'Свои люди, общий путь и награда за помощь друг другу.' }),
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
    const sel = el('select', { 'aria-label': 'Материал для ковена' }, ...Object.entries(COVENS.points).map(([id, p]) => el('option', { value: id, text: `${ITEMS[id]?.name || id} (${game.item(id)}) · ${p} оч.` })));
    const qty = el('input', { type: 'number', min: '1', max: String(COVENS.maxGive), value: '1', 'aria-label': 'Количество', inputmode: 'numeric' });
    const give = el('div', { class: 'cov-give' }, sel, qty, btn('Внести', async () => {
      const r = await run(() => game.give(sel.value, Math.floor(Number(qty.value) || 0)));
      if (r) { game.onChange?.(); refresh(`Внесено: +${r.points} очков ковену.`); }
    }, 'primary'));
    const claim = btn(c.claimed ? 'Награда недели получена' : 'Забрать награду недели', async () => {
      const r = await run(() => game.claim());
      if (r) { game.onChange?.(); refresh('Награда недели получена!'); }
    }, 'cov-claim' + (c.points >= c.goal && c.myGiven >= c.minGiven && !c.claimed ? ' primary' : ''));
    if (c.claimed) claim.disabled = true;
    const motto = el('input', { type: 'text', maxlength: '80', value: c.motto, 'aria-label': 'Девиз ковена' });
    const mottoRow = (c.myRole === 'leader' || c.myRole === 'officer')
      ? el('div', { class: 'cov-give cov-motto' }, motto, btn('Сохранить девиз', async () => { const r = await run(() => service.request('motto', { motto: motto.value })); if (r) refresh('Девиз обновлён.'); }))
      : null;
    const ends = new Date(c.weekEnds);
    const rewards = el('div', { class: 'cov-rewards', 'aria-label': 'Награда недели' },
      ...Object.entries({ coins: COVENS.reward.coins, ...COVENS.reward.items }).map(([id, amount]) =>
        el('span', { class: 'cov-reward', title: `${ITEMS[id].name}: ${amount}`, 'aria-label': `${ITEMS[id].name}: ${amount}` },
          el('img', { src: `${import.meta.env?.BASE_URL || './'}${ASSET_FILES[ITEMS[id].icon]}`, alt: '' }), el('b', { text: String(amount) }))));
    card.replaceChildren(
      el('h2', { text: c.name }),
      el('p', { class: 'acc-sub', text: (c.motto || 'Без девиза') + ` · вы — ${COVEN_ROLES[c.myRole].toLowerCase()}` }),
      el('div', { class: 'cov-week' },
        el('div', { class: 'acc-kv' }, el('span', { text: 'Цель недели' }), el('b', { text: `${c.points} / ${c.goal}` })),
        el('div', { class: 'cov-bar', role: 'progressbar', 'aria-label': 'Цель недели', 'aria-valuemin': '0', 'aria-valuemax': String(c.goal), 'aria-valuenow': String(c.points) }, el('div', { style: `width:${pct}%` })),
        el('p', { class: 'cov-deadline', text: `До ${ends.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` }),
        rewards,
        el('p', { class: 'acc-note', text: `Ваш вклад: ${c.myGiven} оч. Для награды нужно не меньше ${c.minGiven} оч. и выполненная цель ковена.` })),
      el('h3', { text: 'Внести материалы' }),
      el('p', { class: 'acc-note', text: `Материалы списываются из сумки. Завершённое поручение доски даёт ещё ${COVENS.dailyPoints} очков ковену.` }),
      give, claim,
      ...(mottoRow ? [el('h3', { text: 'Девиз' }), mottoRow] : []),
      el('h3', { text: `Состав · ${c.members.length} / ${COVENS.maxMembers}` }), members,
      el('p', { class: 'acc-sub', text: 'Чат ковена — во вкладке с его названием в окне чата.' }),
      msg,
      el('div', { class: 'acc-row cov-footer' }, btn('Покинуть ковен', async () => { const r = await run(() => service.request('leave')); if (r) refresh('Вы покинули ковен.'); }, 'danger'), btn('Закрыть', () => h.close())),
    );
  }
  async function act(op, ref) { const r = await run(() => service.request(op, { ref })); if (r) refresh('Готово.'); }

  refresh();
  return h;
}
