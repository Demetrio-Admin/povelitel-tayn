import { domEl as el, domOverlay } from './accountUI.js';
import { ASSET_FILES } from '../config/assets.manifest.js';
import { shopView, shopQuote } from '../systems/shopModel.js';

const num = n => Number(n || 0).toLocaleString('ru-RU');
const image = key => el('img', { src: `${import.meta.env.BASE_URL}${ASSET_FILES[key]}`, alt: '', draggable: 'false' });
const text = (value, cls = '') => el('span', { class: cls, text: value });
function quantityIcon(add) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  for (const [k, v] of Object.entries({ d: add ? 'M5 12h14M12 5v14' : 'M5 12h14', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' })) path.setAttribute(k, v);
  svg.append(path); return svg;
}

export function showShop({ title = 'Лавка', state, actions, audio, onRefresh, onClose } = {}) {
  let view = shopView(state), kind = 'sell', item = view.rows.find(r => r.have > 0)?.id || view.rows[0]?.id;
  let qty = 1, step = 1, busy = false, h;
  const card = el('div', { class: 'acc-card shop-card' });
  const wallet = el('div', { class: 'shop-wallet' });
  const tabs = el('div', { class: 'shop-tabs', role: 'tablist', 'aria-label': 'Действие в лавке' });
  const list = el('div', { class: 'shop-list', role: 'tabpanel', 'aria-label': 'Товары', id: 'shop-products' });
  const selected = el('div', { class: 'shop-selected' });
  const status = el('div', { class: 'shop-status', role: 'status', 'aria-live': 'polite' });
  const input = el('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '7', 'aria-label': 'Количество', value: '1', autocomplete: 'off' });
  const button = (label, onClick, attrs = {}) => el('button', { type: 'button', text: label, onclick: onClick, ...attrs });
  function clearStatus() { status.textContent = ''; status.classList.remove('shop-error', 'shop-success'); }
  function change(delta) {
    qty = Math.max(1, Math.min(shopQuote(view, kind, item, qty).max || 1, (qty || 0) + delta));
    input.value = String(qty); clearStatus(); update();
  }
  const minus = button('', () => change(-step), { 'aria-label': 'Уменьшить количество' }); minus.append(quantityIcon(false));
  const plus = button('', () => change(step), { 'aria-label': 'Увеличить количество' }); plus.append(quantityIcon(true));
  const all = button('Всё', () => { qty = shopQuote(view, kind, item, qty).max || 1; input.value = String(qty); clearStatus(); update(); });
  const steps = el('div', { class: 'shop-steps' }, text('Шаг:'));
  for (const n of [1, 10, 100]) steps.append(button(String(n), () => { step = n; update(); }, { 'aria-label': `Шаг ${n}`, 'aria-pressed': String(step === n), 'data-step': String(n) }));
  const total = el('div', { class: 'shop-total' });
  const submit = button('', trade, { class: 'primary shop-submit' });
  const footer = el('div', { class: 'shop-footer' }, selected,
    el('div', { class: 'shop-quantity' }, text('Количество'), el('div', { class: 'shop-counter' }, minus, input, plus, all)), steps, total, submit, status);
  for (const [id, label] of [['sell', 'Продать'], ['buy', 'Купить']]) tabs.append(button(label, () => {
    kind = id; qty = 1; input.value = '1'; clearStatus(); render();
  }, { role: 'tab', id: `shop-tab-${id}`, 'aria-selected': String(kind === id), 'aria-controls': 'shop-products', 'data-kind': id }));
  card.append(el('h2', { text: title }), wallet, tabs, list, footer);
  input.oninput = () => { qty = /^\d+$/.test(input.value) ? Number(input.value) : 0; clearStatus(); update(); };
  input.onblur = () => { qty = Math.max(1, Math.min(shopQuote(view, kind, item, qty).max || 1, qty || 1)); input.value = String(qty); update(); };
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (!submit.disabled) trade(); } };

  function render() {
    if (h.closed) return;
    view = shopView(state);
    wallet.replaceChildren(el('div', {}, image('icon_coin'), text(num(view.coins), 'shop-gold')), text(`Сумка: ${num(view.bag.used)} / ${num(view.bag.capacity)}`, 'shop-muted'));
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.kind === kind));
    list.setAttribute('aria-labelledby', `shop-tab-${kind}`);
    const scroll = list.scrollTop;
    list.replaceChildren();
    for (const r of view.rows) {
      const row = button('', () => { item = r.id; qty = 1; input.value = '1'; clearStatus(); render(); }, {
        class: 'shop-product', 'data-item': r.id, 'aria-label': `${r.name}, в сумке ${num(r.have)}`, 'aria-pressed': String(item === r.id),
      });
      row.append(image(r.icon), el('span', { class: 'shop-product-name' }, text(r.name), text(`В сумке: ${num(r.have)}`, 'shop-muted')),
        el('span', { class: 'shop-price' }, el('span', {}, image('icon_coin'), text(num(kind === 'sell' ? r.sell : r.buy))), text('за 1 шт.', 'shop-muted')));
      list.append(row);
    }
    list.scrollTop = scroll;
    const q = shopQuote(view, kind, item, qty); qty = Math.max(1, Math.min(q.max || 1, qty)); input.value = String(qty);
    const r = view.rows.find(r => r.id === item);
    selected.replaceChildren(image(r.icon), text(r.name));
    update();
  }
  function update() {
    const q = shopQuote(view, kind, item, qty);
    for (const b of steps.querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.step) === step));
    input.setAttribute('aria-invalid', String(!q.allowed));
    minus.disabled = busy || qty <= 1; plus.disabled = busy || qty >= q.max; all.disabled = busy || q.max === 0; input.disabled = busy || q.max === 0;
    all.textContent = kind === 'sell' ? 'Всё' : 'Макс.';
    total.replaceChildren(text(kind === 'sell' ? 'Вы получите' : 'Стоимость', 'shop-muted'), el('span', {}, image('icon_coin'), text(num(q.total), 'shop-gold')));
    submit.textContent = busy ? 'Обмен…' : `${kind === 'sell' ? 'Продать' : 'Купить'} ${num(qty)} шт.`;
    submit.disabled = busy || !q.allowed;
    for (const b of [...tabs.children, ...list.children, ...steps.querySelectorAll('button')]) b.disabled = busy;
    if (!status.textContent && !q.allowed) status.textContent = !view.open ? 'Лавка откроется в городе.' : q.max > 0 ? `Выберите от 1 до ${num(q.max)} шт.` : kind === 'sell' ? 'Этого предмета нет в сумке.' : view.bag.free === 0 ? 'В сумке нет места. Продайте лишние предметы.' : 'Не хватает монет.';
  }
  async function trade() {
    if (busy || !shopQuote(view, kind, item, qty).allowed) return;
    busy = true; clearStatus(); update();
    try {
      const r = kind === 'sell' ? await actions.shopSell(item, qty) : await actions.shopBuy(item, qty);
      onRefresh?.();
      if (h.closed) return;
      status.classList.toggle('shop-error', !r?.ok);
      status.classList.toggle('shop-success', !!r?.ok);
      if (r?.ok) {
        audio?.play('coin');
        status.textContent = kind === 'sell' ? `Продано: ${num(r.qty)} шт. Получено: ${num(r.gain)} монет.` : `Куплено: ${num(r.qty)} шт. Потрачено: ${num(r.cost)} монет.`;
      } else {
        audio?.play('locked');
        status.textContent = ({ missing: 'Предметов уже меньше. Проверьте количество.', coins: 'Не хватает монет.', bag_full: 'В сумке не хватает места.', locked: 'Лавка ещё закрыта.', combat: 'Дождитесь окончания боя.', network: 'Нет связи. Попробуйте ещё раз.', bad: 'Проверьте количество.' })[r?.reason] || 'Обмен не выполнен. Попробуйте ещё раз.';
      }
    } catch { if (!h.closed) { status.classList.add('shop-error'); status.textContent = 'Нет связи. Попробуйте ещё раз.'; } }
    finally { busy = false; if (!h.closed) render(); }
  }
  h = domOverlay(card, { onClose, label: title });
  h.ov.classList.add('shop-window');
  for (const event of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel', 'click']) h.ov.addEventListener(event, e => e.stopPropagation());
  render();
  return h;
}
