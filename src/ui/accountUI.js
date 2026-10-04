// Окна аккаунта поверх игры: создание аккаунта, вход, профиль, смена пароля, загрузка, «Нет соединения».
// Обычный HTML: на телефоне только так работают экранная клавиатура и менеджеры паролей.
// Не зависит от Phaser; данные и действия — через PlayerSession. Технические ошибки сервера игрок не видит.
import { CloudError, errorText } from '../cloud/api.js';
import { NICK_MIN, NICK_MAX, PASSWORD_MIN } from '../cloud/nickname.js';

const CSS = `
.acc-ov{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:14px;
  background:radial-gradient(ellipse at center,#0e0a08cc,#000d);font:17px/1.4 'Philosopher',Georgia,serif;color:#f1e3c2;
  -webkit-user-select:none;user-select:none;overflow:auto}
.acc-ov.top{z-index:120}
.acc-card{width:min(440px,100%);max-height:100%;overflow:auto;position:relative;padding:20px 20px 18px;border-radius:16px;
  background:linear-gradient(#35251a,#1d130d);border:3px solid #b8923c;box-shadow:0 0 0 2px #2b1d15,0 14px 40px #000c,inset 0 0 40px #0006}
.acc-card::before,.acc-card::after{content:'✦';position:absolute;top:6px;color:#e8c56a;font-size:15px;opacity:.85}
.acc-card::before{left:10px}.acc-card::after{right:10px}
.acc-card h2{margin:0 0 4px;text-align:center;font-size:25px;color:#f6e3a1;text-shadow:0 2px 0 #000a}
.acc-sub{text-align:center;color:#a8977a;font-size:15px;margin:0 0 12px}
.acc-card button{font:inherit;font-size:18px;color:#f1e3c2;background:#4a3324;border:1px solid #b8923c99;border-radius:12px;min-height:48px;padding:8px 14px;cursor:pointer}
.acc-card button:active{background:#6a4a30}
.acc-card button.primary{background:linear-gradient(#a37a2a,#7a5a22);border-color:#e8c56a;font-weight:700;color:#fff3cc}
.acc-card button.danger{border-color:#c8443a;color:#ffb0a0}
.acc-card button.link{background:none;border:none;min-height:36px;color:#e8c56a;text-decoration:underline;font-size:16px}
.acc-card button:disabled{opacity:.55;cursor:default}
.acc-field{display:block;margin:0 0 11px}
.acc-field>span{display:block;font-size:15px;color:#d9c79a;margin:0 0 3px}
.acc-field input{width:100%;box-sizing:border-box;font:inherit;font-size:18px;color:#fff6dc;background:#120d0a;border:1px solid #b8923c88;border-radius:10px;padding:11px 12px;min-height:48px;
  -webkit-user-select:text;user-select:text;outline:none}
.acc-field input:focus{border-color:#e8c56a;box-shadow:0 0 0 2px #e8c56a44}
.acc-field small{display:block;color:#a8977a;font-size:13px;margin-top:2px}
.acc-pw{display:flex;gap:6px}.acc-pw input{flex:1;min-width:0}.acc-pw button{min-height:48px;padding:0 12px}
.acc-err{min-height:1.4em;color:#ff9a8a;font-size:15px;margin:0 0 8px;text-align:center}
.acc-ok{color:#9fe9b0}
.acc-note{font-size:14px;color:#d9b98a;background:#120d0a99;border:1px solid #b8923c55;border-radius:10px;padding:8px 10px;margin:0 0 12px}
.acc-row{display:flex;flex-direction:column;gap:9px;margin-top:6px}
.acc-center{text-align:center}
.acc-big{text-align:center;font-size:30px;font-weight:700;color:#f6e3a1;margin:2px 0 0;word-break:break-all}
.acc-lvl{text-align:center;color:#d9c79a;margin:0 0 10px}
.acc-kv{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #b8923c33;font-size:16px}
.acc-kv b{color:#e8c56a;font-weight:700;text-align:right}
.acc-status{text-align:center;margin:8px 0 6px;font-size:16px}
.acc-status.saved{color:#9fe9b0}.acc-status.saving{color:#e8c56a}.acc-status.offline{color:#ffb07a}
.acc-spin{width:38px;height:38px;margin:12px auto 4px;border-radius:50%;border:4px solid #b8923c44;border-top-color:#e8c56a;animation:accspin 0.9s linear infinite}
@keyframes accspin{to{transform:rotate(360deg)}}
`;

function ensureCss() {
  if (document.getElementById('acc-css')) return;
  const s = document.createElement('style');
  s.id = 'acc-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k) e.append(k);
  return e;
}

const stack = [];
// Пока открыто окно, клавиши не уходят в игру (пробел, стрелки, Esc → пауза). Ввод в поля при этом работает:
// stopPropagation не отменяет действие по умолчанию. Esc закрывает верхнее окно, если его можно закрыть.
function onKey(e) {
  if (!stack.length) return;
  e.stopPropagation();
  if (e.type === 'keydown' && e.key === 'Escape') { const top = stack[stack.length - 1]; if (top.dismissable) top.close(); }
}
const KEY_EVENTS = ['keydown', 'keyup', 'keypress'];

function overlay(card, { onClose, dismissable = true, top = false } = {}) {
  ensureCss();
  const ov = el('div', { class: 'acc-ov' + (top ? ' top' : ''), role: 'dialog', 'aria-modal': 'true' }, card);
  let closed = false;
  const entry = { dismissable, close };
  function close() {
    if (closed) return;
    closed = true;
    ov.remove();
    stack.splice(stack.indexOf(entry), 1);
    if (!stack.length) KEY_EVENTS.forEach(t => window.removeEventListener(t, onKey, true));
    onClose?.();
  }
  if (!stack.length) KEY_EVENTS.forEach(t => window.addEventListener(t, onKey, true));
  stack.push(entry);
  document.body.appendChild(ov);
  return { ov, close, get closed() { return closed; } };
}

/** Открыто ли сейчас какое-нибудь окно аккаунта (игра в это время не принимает ввод). */
export const anyOpen = () => stack.length > 0;

const errMsg = (e) => (e instanceof CloudError ? (e.code === 'validation' ? e.message : errorText(e.code)) : errorText('unknown'));
const fmtDate = (v) => { if (!v) return '—'; const d = new Date(v); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); };
const fmtPlay = (ms) => { const m = Math.round((ms || 0) / 60000); return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`; };
export const SAVE_STATUS = { saved: '✓ Прогресс сохранён', saving: 'Сохранение…', offline: 'Нет соединения' };

function passwordInput(placeholder, autocomplete) {
  const input = el('input', { type: 'password', autocomplete, placeholder, autocapitalize: 'off', spellcheck: 'false' });
  const eye = el('button', { type: 'button', 'aria-label': 'Показать пароль', text: '👁', onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; } });
  return { input, box: el('div', { class: 'acc-pw' }, input, eye) };
}
const nickInput = (autocomplete) => el('input', { type: 'text', autocomplete, autocapitalize: 'off', spellcheck: 'false', maxlength: String(NICK_MAX + 4), placeholder: 'Например, Дмитрий' });

/** Кнопка с «занятым» состоянием: нельзя нажать десять раз подряд. */
function busyButton(btn, idleText, busyText) {
  return (on) => { btn.disabled = on; btn.textContent = on ? busyText : idleText; };
}

/** Простое окно ожидания (вход, создание персонажа, загрузка прогресса). */
export function showLoading(text = 'Загрузка персонажа…') {
  const label = el('p', { class: 'acc-sub', text });
  const card = el('div', { class: 'acc-card' }, el('div', { class: 'acc-spin' }), label);
  const h = overlay(card, { dismissable: false, top: true });
  return { close: h.close, setText: (t) => { label.textContent = t; } };
}

/** «Нет соединения»: игра стоит, пока связь не вернётся. onRetry() → Promise<boolean>. */
export function showOffline({ onRetry } = {}) {
  const btn = el('button', { class: 'primary', type: 'button', text: 'Повторить' });
  const sub = el('p', { class: 'acc-sub', text: 'Пытаемся восстановить соединение с сервером…' });
  const card = el('div', { class: 'acc-card' }, el('h2', { text: 'Нет соединения' }), sub, el('div', { class: 'acc-spin' }), el('div', { class: 'acc-row' }, btn));
  const h = overlay(card, { dismissable: false, top: true });
  const busy = busyButton(btn, 'Повторить', 'Подключаемся…');
  btn.onclick = async () => { busy(true); try { await onRetry?.(); } finally { if (!h.closed) busy(false); } };
  return { close: h.close };
}

/** Сообщение с одной кнопкой. */
export function showNotice({ title, text, button = 'Понятно', onClose } = {}) {
  const card = el('div', { class: 'acc-card' }, el('h2', { text: title }), el('p', { class: 'acc-sub', text }));
  const h = overlay(card, { onClose, top: true });
  card.append(el('div', { class: 'acc-row' }, el('button', { class: 'primary', type: 'button', text: button, onclick: () => h.close() })));
  return h;
}

/**
 * «Создание аккаунта»: никнейм, пароль, повтор пароля. Почту игра не спрашивает.
 * mode 'new' — при начале игры (создаётся персонаж с героем hero), 'guest' — гость получает ник, персонаж прежний.
 */
export function showRegister(session, { mode = 'new', hero, onDone, onCancel } = {}) {
  const nick = nickInput('username');
  const pw = passwordInput(`от ${PASSWORD_MIN} символов`, 'new-password');
  const pw2 = passwordInput('ещё раз', 'new-password');
  const err = el('div', { class: 'acc-err', role: 'alert' });
  const submit = el('button', { class: 'primary', type: 'submit', text: 'Создать аккаунт' });
  const busy = busyButton(submit, 'Создать аккаунт', 'Создаём аккаунт…');
  let done = false;
  const form = el('form', { novalidate: true },
    el('label', { class: 'acc-field' }, el('span', { text: 'Никнейм' }), nick, el('small', { text: `${NICK_MIN}–${NICK_MAX} символов: буквы (латиница или кириллица), цифры и _. Это и имя в игре, и логин.` })),
    el('label', { class: 'acc-field' }, el('span', { text: 'Пароль' }), pw.box),
    el('label', { class: 'acc-field' }, el('span', { text: 'Повторите пароль' }), pw2.box),
    el('p', { class: 'acc-note', text: 'Если вы забудете пароль, восстановить доступ к аккаунту может быть невозможно: почту игра не спрашивает.' }),
    err,
    el('div', { class: 'acc-row' }, submit));
  const card = el('div', { class: 'acc-card' },
    el('h2', { text: 'Создание аккаунта' }),
    el('p', { class: 'acc-sub', text: mode === 'guest' ? 'Ваш персонаж и весь прогресс останутся с вами.' : 'Под этим ником вы будете входить с любого устройства.' }),
    form,
    el('div', { class: 'acc-center' }, el('button', { class: 'link', type: 'button', text: 'Назад', onclick: () => h.close() })));
  const h = overlay(card, { onClose: () => { if (!done) onCancel?.(); } });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    err.textContent = '';
    busy(true);
    try {
      const args = { nickname: nick.value, password: pw.input.value, password2: pw2.input.value };
      if (mode === 'guest') await session.registerGuest(args); else await session.registerNew({ ...args, hero });
      done = true;
      h.close();
      onDone?.();
    } catch (e) { busy(false); err.textContent = errMsg(e); }
  });
  setTimeout(() => { if (!card.contains(document.activeElement)) nick.focus(); }, 50);
  return h;
}

/** «Вход»: никнейм и пароль. guestWarning — сейчас на устройстве гость с прогрессом. */
export function showLogin(session, { onDone, onCancel, guestWarning = false } = {}) {
  const nick = nickInput('username');
  const pw = passwordInput('', 'current-password');
  const err = el('div', { class: 'acc-err', role: 'alert' });
  const submit = el('button', { class: 'primary', type: 'submit', text: 'Войти' });
  const busy = busyButton(submit, 'Войти', 'Входим…');
  let done = false;
  const form = el('form', { novalidate: true },
    el('label', { class: 'acc-field' }, el('span', { text: 'Никнейм' }), nick),
    el('label', { class: 'acc-field' }, el('span', { text: 'Пароль' }), pw.box),
    guestWarning ? el('p', { class: 'acc-note', text: 'Сейчас вы играете гостем. После входа в аккаунт гостевой персонаж станет недоступен. Чтобы сохранить его, закройте окно и создайте аккаунт в профиле.' }) : null,
    err,
    el('div', { class: 'acc-row' }, submit));
  const card = el('div', { class: 'acc-card' }, el('h2', { text: 'Вход' }), form,
    el('div', { class: 'acc-center' }, el('button', { class: 'link', type: 'button', text: 'Назад', onclick: () => h.close() })));
  const h = overlay(card, { onClose: () => { if (!done) onCancel?.(); } });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    err.textContent = '';
    busy(true);
    try {
      await session.login({ nickname: nick.value, password: pw.input.value });
      done = true;
      h.close();
      onDone?.();
    } catch (e) { busy(false); err.textContent = errMsg(e); }
  });
  setTimeout(() => { if (!card.contains(document.activeElement)) nick.focus(); }, 50);
  return h;
}

/** Смена пароля зарегистрированного игрока. */
export function showChangePassword(session, { onClose } = {}) {
  const pw = passwordInput(`от ${PASSWORD_MIN} символов`, 'new-password');
  const pw2 = passwordInput('ещё раз', 'new-password');
  const err = el('div', { class: 'acc-err', role: 'alert' });
  const submit = el('button', { class: 'primary', type: 'submit', text: 'Сохранить пароль' });
  const busy = busyButton(submit, 'Сохранить пароль', 'Сохраняем…');
  const form = el('form', { novalidate: true },
    el('label', { class: 'acc-field' }, el('span', { text: 'Новый пароль' }), pw.box),
    el('label', { class: 'acc-field' }, el('span', { text: 'Повторите пароль' }), pw2.box),
    err, el('div', { class: 'acc-row' }, submit));
  const card = el('div', { class: 'acc-card' }, el('h2', { text: 'Смена пароля' }), form,
    el('div', { class: 'acc-center' }, el('button', { class: 'link', type: 'button', text: 'Назад', onclick: () => h.close() })));
  const h = overlay(card, { onClose });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    err.textContent = ''; err.classList.remove('acc-ok');
    busy(true);
    try {
      await session.changePassword({ password: pw.input.value, password2: pw2.input.value });
      busy(false); pw.input.value = pw2.input.value = '';
      err.textContent = 'Пароль изменён.'; err.classList.add('acc-ok');
    } catch (e) { busy(false); err.textContent = errMsg(e); }
  });
  return h;
}

/**
 * Профиль. Зарегистрированный игрок: ник, уровень, «✓ Прогресс сохранён», смена пароля, выход.
 * Гость: уровень, пояснение и «Создать аккаунт»; войти в другой аккаунт можно, но гостевой персонаж станет недоступен.
 */
export function showProfile(session, { onLogout, onSwitched, onClose, onRegistered } = {}) {
  const card = el('div', { class: 'acc-card' });
  const h = overlay(card, { onClose: () => { off(); onClose?.(); } });
  const status = el('div', { class: 'acc-status', 'aria-live': 'polite' });
  const paintStatus = () => { status.className = 'acc-status ' + session.saving; status.textContent = SAVE_STATUS[session.saving] || ''; };
  const off = session.onChange((r) => { if (r === 'saving' || r === 'status') paintStatus(); });

  const render = () => {
    card.replaceChildren();
    const lvl = el('p', { class: 'acc-lvl', text: `Уровень ${session.level}` });
    if (session.registered) {
      const out = el('button', { class: 'danger', type: 'button', text: 'Выйти' });
      let armed = false;
      out.onclick = async () => {
        if (!armed) { armed = true; out.textContent = 'Точно выйти? Нажмите ещё раз'; setTimeout(() => { if (!out.disabled) { armed = false; out.textContent = 'Выйти'; } }, 3500); return; }
        out.disabled = true; out.textContent = 'Выходим…';
        await session.logout();
        h.close();
        onLogout?.();
      };
      card.append(
        el('h2', { text: 'Профиль' }),
        el('div', { class: 'acc-big', text: session.nickname }), lvl, status,
        ...(session.meta.playerId ? [el('div', { class: 'acc-kv' }, el('span', { text: 'ID игрока' }), el('b', { text: session.meta.playerId }))] : []),
        el('div', { class: 'acc-kv' }, el('span', { text: 'В игре с' }), el('b', { text: fmtDate(session.meta.registeredAt || session.meta.createdAt) })),
        el('div', { class: 'acc-kv' }, el('span', { text: 'Время в игре' }), el('b', { text: fmtPlay(session.state.data.stats?.playTimeMs) })),
        el('div', { class: 'acc-row' },
          el('button', { type: 'button', text: 'Сменить пароль', onclick: () => showChangePassword(session) }),
          out,
          el('button', { class: 'primary', type: 'button', text: 'Закрыть', onclick: () => h.close() })));
    } else {
      const sw = el('button', { type: 'button', text: 'Войти в другой аккаунт' });
      sw.onclick = () => showLogin(session, { guestWarning: session.guestHasProgress, onDone: () => { h.close(); onSwitched?.(); } });
      card.append(
        el('h2', { text: 'Гостевой профиль' }), lvl, status,
        el('p', { class: 'acc-sub', text: 'Прогресс сохраняется автоматически. Создайте аккаунт, чтобы входить в этого персонажа с другого устройства.' }),
        el('div', { class: 'acc-row' },
          el('button', { class: 'primary', type: 'button', text: 'Создать аккаунт', onclick: () => showRegister(session, { mode: 'guest', onDone: () => { render(); onRegistered?.(); } }) }),
          sw,
          el('button', { type: 'button', text: 'Закрыть', onclick: () => h.close() })));
    }
    paintStatus();
  };
  render();
  return h;
}
