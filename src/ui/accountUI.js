// Окна аккаунта поверх игры: создание аккаунта, вход, профиль, смена пароля, загрузка, «Нет соединения».
// Обычный HTML: на телефоне только так работают экранная клавиатура и менеджеры паролей.
// Не зависит от Phaser; данные и действия — через PlayerSession. Технические ошибки сервера игрок не видит.
import { CloudError, errorText } from '../cloud/api.js';
import { NICK_MIN, NICK_MAX, PASSWORD_MIN } from '../cloud/nickname.js';
import { bindGameOverlay } from './gameOverlay.js';

const CSS = `
.acc-ov{position:fixed;top:0;left:0;width:100%;height:100%;z-index:100;display:flex;align-items:center;justify-content:center;padding:12px;
  background:radial-gradient(ellipse at center,#100d09a6,#100d09d9);font:16px/1.4 'Philosopher',Georgia,serif;color:#f1e3c2;
  -webkit-user-select:none;user-select:none;overflow:hidden;box-sizing:border-box;touch-action:manipulation;overscroll-behavior:contain;
  color-scheme:dark;container-type:inline-size;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.acc-ov.top{z-index:120}
.acc-ov *{box-sizing:border-box}
.acc-shell{width:min(440px,100%);max-height:100%;min-height:0;position:relative;display:flex;border-radius:16px;
  background:linear-gradient(#4a3324,#38271b 50%,#271a11);background-size:100% 100%;box-shadow:0 10px 28px #0008;overflow:hidden}
.acc-card{width:100%;max-height:100%;min-width:0;overflow:auto;position:relative;padding:25px 23px 18px;
  scrollbar-width:thin;scrollbar-color:#b59653 #25190f;overscroll-behavior:contain;touch-action:pan-y;outline:none}
.acc-card h2{margin:0 0 8px;text-align:center;font-size:clamp(23px,6.2cqw,29px);line-height:1.2;color:#f6e3a1;text-shadow:0 2px 3px #0009;overflow-wrap:anywhere}
.acc-card>h2:first-child{padding:0 15px 14px;background:linear-gradient(90deg,transparent,#d9b45a99,transparent) center bottom/75% 1px no-repeat}
.acc-sub{text-align:center;color:#d0bfa2;font-size:15px;margin:0 0 18px;line-height:1.45;overflow-wrap:anywhere}
.acc-card button{font:inherit;font-size:17px;color:#f1e3c2;background:linear-gradient(#49321f,#2c1e12);border:1px solid #b8923c99;border-radius:9px;min-height:46px;padding:9px 14px;cursor:pointer;
  box-shadow:inset 0 1px 0 #f6e3a12b,0 2px 3px #0004;white-space:normal;overflow-wrap:anywhere;touch-action:manipulation}
.acc-card button:active{background:#6a4a30;transform:translateY(1px)}
.acc-card button.primary{background:linear-gradient(#795531,#51351d 55%,#38220f);border-color:#d9b45a;box-shadow:inset 0 0 0 2px #26180f,inset 0 0 0 3px #f6e3a138,0 3px 5px #0005;font-weight:700;color:#fff0bc}
.acc-card button.danger{border-color:#c8443a;color:#ffb0a0}
.acc-card button.link{background:none;border:none;box-shadow:none;min-height:40px;color:#e8c56a;font-size:15px}
.acc-card button:disabled{opacity:.55;cursor:default}
.acc-ov :focus-visible{outline:2px solid #f6e3a1;outline-offset:2px}
.acc-field{display:block;margin:0 0 13px}
.acc-field>span{display:block;font-size:14px;color:#e3cba3;margin:0 0 5px}
.acc-field input{width:100%;min-width:0;font:inherit;font-size:17px;color:#fff6dc;background:linear-gradient(#1a110ae6,#24180fe6);border:1px solid #96723b;border-radius:8px;padding:10px 12px;min-height:46px;
  -webkit-user-select:text;user-select:text;outline:none;box-shadow:inset 0 2px 5px #0005}
.acc-field input::placeholder{color:#b9a78d;opacity:1}
.acc-field input:focus{border-color:#e8c56a;box-shadow:0 0 0 2px #e8c56a44}
.acc-field small{display:block;color:#cfbea3;font-size:13px;margin-top:5px;line-height:1.4}
.acc-pw{position:relative}.acc-pw input{padding-right:49px}.acc-pw button{position:absolute;right:2px;top:2px;bottom:2px;min-height:0;width:42px;padding:0;background:transparent;border:0;box-shadow:none;color:#dfc58e}
.acc-icon{display:inline-block;width:21px;height:21px;vertical-align:middle;background:currentColor;mask:center/contain no-repeat; -webkit-mask:center/contain no-repeat}
.acc-eye{mask-image:url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8"%3E%3Cpath d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/%3E%3Ccircle cx="12" cy="12" r="3"/%3E%3C/svg%3E');-webkit-mask-image:url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8"%3E%3Cpath d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/%3E%3Ccircle cx="12" cy="12" r="3"/%3E%3C/svg%3E')}
.acc-err{color:#ffc2b2;font-size:14px;margin:10px 0;text-align:center;line-height:1.4;overflow-wrap:anywhere}
.acc-err:empty{display:none}
.acc-ok{color:#9fe9b0}
.acc-note{font-size:13px;color:#decaad;background:#160f0966;border-left:2px solid #b8923c88;border-radius:2px;padding:9px 11px;margin:0 0 14px;line-height:1.45}
.acc-row{display:flex;flex-direction:column;gap:9px;margin-top:12px}
.acc-center{text-align:center;margin-top:5px}
.acc-big{text-align:center;font-size:30px;font-weight:700;color:#f6e3a1;margin:2px 0 0;word-break:break-all}
.acc-lvl{text-align:center;color:#d9c79a;margin:0 0 10px}
.acc-kv{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #b8923c33;font-size:16px}
.acc-kv b{color:#e8c56a;font-weight:700;text-align:right}
.acc-status{text-align:center;margin:8px 0 6px;font-size:16px}
.acc-status.saved{color:#9fe9b0}.acc-status.saving{color:#e8c56a}.acc-status.offline{color:#ffb07a}
.acc-spin{width:38px;height:38px;margin:12px auto 4px;border-radius:50%;border:4px solid #b8923c44;border-top-color:#e8c56a;animation:accspin 0.9s linear infinite}
.acc-dismiss{position:absolute;right:3px;top:3px;z-index:2;width:44px;height:44px;display:grid;place-items:center;padding:0;cursor:pointer;
  color:#e8c56a;background:none;border:0;border-radius:50%;touch-action:manipulation}
.acc-dismiss::before{content:'';position:absolute;inset:7px;background:#25180fd9;border:1px solid #b8923c66;border-radius:50%;z-index:-1}
.acc-cross{width:16px;height:16px;mask-image:url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"%3E%3Cpath d="m6 6 12 12M6 18 18 6"/%3E%3C/svg%3E');-webkit-mask-image:url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"%3E%3Cpath d="m6 6 12 12M6 18 18 6"/%3E%3C/svg%3E')}
@container (max-width:330px){.acc-card{padding:24px 16px 14px}.acc-card h2{font-size:23px}.acc-sub{font-size:14px}.acc-field small{font-size:12px}}
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
  const top = stack[stack.length - 1];
  if (e.type === 'keydown' && e.key === 'Escape' && top.dismissable) { e.preventDefault(); top.close(); }
  if (e.type === 'keydown' && e.key === 'Tab') {
    const controls = [...(top.ov.querySelectorAll?.('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') || [])].filter(n => n.getClientRects().length);
    const first = controls[0], last = controls.at(-1), active = document.activeElement;
    if (first && ((!e.shiftKey && (active === last || !top.ov.contains(active))) || (e.shiftKey && (active === first || !top.ov.contains(active))))) {
      e.preventDefault(); (e.shiftKey ? last : first).focus();
    }
  }
}
const KEY_EVENTS = ['keydown', 'keyup', 'keypress'];

function overlay(card, { onClose, dismissable = true, top = false, label } = {}) {
  ensureCss();
  card.setAttribute('tabindex', '-1');
  const shell = el('div', { class: 'acc-shell' }, card);
  const ov = el('div', { class: 'acc-ov' + (top ? ' top' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': label || card.querySelector?.('h2')?.textContent || 'Игровое окно' }, shell);
  let closed = false;
  const previousFocus = document.activeElement;
  let unbind = () => {};
  const entry = { dismissable, close, ov };
  function close() {
    if (closed) return;
    closed = true;
    unbind();
    ov.remove();
    stack.splice(stack.indexOf(entry), 1);
    if (!stack.length) KEY_EVENTS.forEach(t => window.removeEventListener(t, onKey, true));
    if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    onClose?.();
  }
  if (dismissable) shell.append(el('button', { type: 'button', class: 'acc-dismiss', 'aria-label': 'Закрыть окно', onclick: close }, el('span', { class: 'acc-icon acc-cross', 'aria-hidden': 'true' })));
  if (!stack.length) KEY_EVENTS.forEach(t => window.addEventListener(t, onKey, true));
  stack.push(entry);
  document.body.appendChild(ov);
  unbind = bindGameOverlay(ov, shell, card);
  return { ov, close, get closed() { return closed; } };
}

/** v0.25.0: те же окна для других HTML-панелей (Ковены). */
export { el as domEl, overlay as domOverlay };

/** Открыто ли сейчас какое-нибудь окно аккаунта (игра в это время не принимает ввод). */
export const anyOpen = () => stack.length > 0;

const errMsg = (e) => (e instanceof CloudError ? (e.code === 'validation' ? e.message : errorText(e.code)) : errorText('unknown'));
const fmtDate = (v) => { if (!v) return '—'; const d = new Date(v); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); };
const fmtPlay = (ms) => { const m = Math.round((ms || 0) / 60000); return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`; };
export const SAVE_STATUS = { saved: '✓ Прогресс сохранён', saving: 'Сохранение…', offline: 'Нет соединения' };

function passwordInput(placeholder, autocomplete) {
  const input = el('input', { type: 'password', autocomplete, placeholder, autocapitalize: 'off', spellcheck: 'false' });
  const eye = el('button', { type: 'button', 'aria-label': 'Показать пароль', 'aria-pressed': 'false', onclick: () => {
    const showing = input.type === 'password'; input.type = showing ? 'text' : 'password';
    eye.setAttribute('aria-label', showing ? 'Скрыть пароль' : 'Показать пароль'); eye.setAttribute('aria-pressed', String(showing));
  } }, el('span', { class: 'acc-icon acc-eye', 'aria-hidden': 'true' }));
  return { input, box: el('div', { class: 'acc-pw' }, input, eye) };
}
const nickInput = (autocomplete) => el('input', { type: 'text', autocomplete, autocapitalize: 'off', spellcheck: 'false', maxlength: String(NICK_MAX + 4), placeholder: 'Например, Дмитрий', 'aria-label': 'Никнейм' });

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
  setTimeout(() => { if (!h.closed && !window.matchMedia?.('(pointer: coarse)').matches && !card.contains(document.activeElement)) nick.focus(); }, 50);
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
  setTimeout(() => { if (!h.closed && !window.matchMedia?.('(pointer: coarse)').matches && !card.contains(document.activeElement)) nick.focus(); }, 50);
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
