// Окна аккаунта: вход / регистрация, профиль (ник, облако, выход), выбор сохранения при конфликте.
// Обычный HTML поверх игры: на телефоне только так работает экранная клавиатура и автозаполнение паролей.
// Не зависит от Phaser; все данные и действия — через переданный Account.
import { CloudError, errorText } from '../cloud/api.js';
import { summarize } from '../cloud/Account.js';
import { NICK_MIN, NICK_MAX, PASSWORD_MIN } from '../cloud/validators.js';

const CSS = `
.acc-ov{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:14px;
  background:radial-gradient(ellipse at center,#0e0a08cc,#000d);font:17px/1.4 'Philosopher',Georgia,serif;color:#f1e3c2;
  -webkit-user-select:none;user-select:none;overflow:auto}
.acc-card{width:min(440px,100%);max-height:100%;overflow:auto;position:relative;padding:20px 20px 18px;border-radius:16px;
  background:linear-gradient(#35251a,#1d130d);border:3px solid #b8923c;box-shadow:0 0 0 2px #2b1d15,0 14px 40px #000c,inset 0 0 40px #0006}
.acc-card::before,.acc-card::after{content:'✦';position:absolute;top:6px;color:#e8c56a;font-size:15px;opacity:.85}
.acc-card::before{left:10px}.acc-card::after{right:10px}
.acc-card h2{margin:0 0 4px;text-align:center;font-size:25px;color:#f6e3a1;text-shadow:0 2px 0 #000a}
.acc-sub{text-align:center;color:#a8977a;font-size:15px;margin:0 0 12px}
.acc-tabs{display:flex;gap:8px;margin:6px 0 14px}
.acc-tabs button{flex:1}
.acc-card button{font:inherit;font-size:18px;color:#f1e3c2;background:#4a3324;border:1px solid #b8923c99;border-radius:12px;min-height:48px;padding:8px 14px;cursor:pointer}
.acc-card button:active{background:#6a4a30}
.acc-card button.on{background:#7a5a22;border-color:#e8c56a;color:#fff3cc}
.acc-card button.primary{background:linear-gradient(#a37a2a,#7a5a22);border-color:#e8c56a;font-weight:700;color:#fff3cc}
.acc-card button.danger{border-color:#c8443a;color:#ffb0a0}
.acc-card button.link{background:none;border:none;min-height:36px;color:#e8c56a;text-decoration:underline;font-size:16px}
.acc-card button:disabled{opacity:.5;cursor:default}
.acc-field{display:block;margin:0 0 11px}
.acc-field>span{display:block;font-size:15px;color:#d9c79a;margin:0 0 3px}
.acc-field input{width:100%;font:inherit;font-size:18px;color:#fff6dc;background:#120d0a;border:1px solid #b8923c88;border-radius:10px;padding:11px 12px;min-height:48px;
  -webkit-user-select:text;user-select:text;outline:none}
.acc-field input:focus{border-color:#e8c56a;box-shadow:0 0 0 2px #e8c56a44}
.acc-field small{display:block;color:#a8977a;font-size:13px;margin-top:2px}
.acc-pw{display:flex;gap:6px}.acc-pw input{flex:1;min-width:0}.acc-pw button{min-height:48px;padding:0 12px}
.acc-err{min-height:1.4em;color:#ff9a8a;font-size:15px;margin:0 0 8px;text-align:center}
.acc-ok{color:#9fe9b0}
.acc-row{display:flex;flex-direction:column;gap:9px;margin-top:6px}
.acc-center{text-align:center}
.acc-kv{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #b8923c33;font-size:16px}
.acc-kv b{color:#e8c56a;font-weight:700;text-align:right;word-break:break-all}
.acc-save{border:1px solid #b8923c88;border-radius:12px;padding:10px 12px;margin:8px 0;background:#120d0a99}
.acc-save h3{margin:0 0 2px;font-size:18px;color:#f6e3a1}
.acc-save p{margin:0;color:#d9c79a;font-size:15px}
.acc-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:#a8977a}
.acc-dot.ok{background:#5fd68a}.acc-dot.err{background:#ff6a5a}.acc-dot.busy{background:#e8c56a}
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
// Пока открыто окно, клавиши не должны уходить в игру (пробел, стрелки, Esc → пауза). Ввод в поля при этом работает:
// stopPropagation не отменяет действие по умолчанию. Esc закрывает верхнее окно, если его можно закрыть.
function onKey(e) {
  if (!stack.length) return;
  e.stopPropagation();
  if (e.type === 'keydown' && e.key === 'Escape') { const top = stack[stack.length - 1]; if (top.dismissable) top.close(); }
}
const KEY_EVENTS = ['keydown', 'keyup', 'keypress'];

function overlay(card, { onClose, dismissable = true } = {}) {
  ensureCss();
  const ov = el('div', { class: 'acc-ov', role: 'dialog', 'aria-modal': 'true' }, card);
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
  return { ov, close };
}

const fmtTime = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const fmtDate = (v) => { if (!v) return 'неизвестно'; const d = new Date(v); return `${d.toLocaleDateString('ru-RU')} ${fmtTime(d.getTime())}`; };
const errMsg = (e) => (e instanceof CloudError ? e.message : errorText('unknown'));

function saveCard(title, d, extra) {
  const s = summarize(d);
  return el('div', { class: 'acc-save' },
    el('h3', { text: title }),
    el('p', { text: s ? `Уровень ${s.level} · событий ${s.events} · игра ${s.playMin} мин` : 'Пусто' }),
    extra ? el('p', { text: extra }) : null);
}

/** Окно выбора сохранения. Возвращает Promise<'cloud' | 'local'>. */
export function showConflict(info) {
  return new Promise((resolve) => {
    const guest = info.local.source === 'guest';
    const pick = (v) => () => { h.close(); resolve(v); };
    const card = el('div', { class: 'acc-card' },
      el('h2', { text: 'Какое сохранение оставить?' }),
      el('p', { class: 'acc-sub', text: 'Прогресс в облаке и на этом устройстве отличается. Второй вариант будет заменён.' }),
      saveCard('☁ В облаке', info.cloud.data, `Сохранено: ${fmtDate(info.cloud.updatedAt)}`),
      saveCard(guest ? '📱 Гостевая игра на устройстве' : '📱 На этом устройстве', info.local.data, info.local.data?.savedAt ? `Сохранено: ${fmtDate(info.local.data.savedAt)}` : ''),
      el('div', { class: 'acc-row' },
        el('button', { class: 'primary', onclick: pick('cloud'), text: 'Взять из облака' }),
        el('button', { onclick: pick('local'), text: guest ? 'Оставить гостевой прогресс' : 'Оставить с устройства' })));
    const h = overlay(card, { dismissable: false }); // закрыть без выбора нельзя
  });
}

/** Окно входа / регистрации. onDone(result) — после успешного входа; onClose — при любом закрытии. */
export function showAuth(account, { tab = 'login', onDone, onClose } = {}) {
  let mode = tab;
  const card = el('div', { class: 'acc-card' });
  const h = overlay(card, { onClose });
  if (!account.enabled) {
    card.append(el('h2', { text: 'Вход недоступен' }), el('p', { class: 'acc-sub', text: 'Облако пока не подключено. Игра работает без аккаунта: прогресс хранится на этом устройстве.' }),
      el('div', { class: 'acc-row' }, el('button', { class: 'primary', text: 'Понятно', onclick: () => h.close() })));
    return h;
  }

  const email = el('input', { type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', placeholder: 'name@mail.ru' });
  const nick = el('input', { type: 'text', autocomplete: 'nickname', maxlength: String(NICK_MAX + 8), placeholder: 'Как вас зовут в игре' });
  const pw = el('input', { type: 'password', autocomplete: 'current-password', placeholder: `от ${PASSWORD_MIN} символов` });
  const eye = el('button', { type: 'button', 'aria-label': 'Показать пароль', text: '👁', onclick: () => { pw.type = pw.type === 'password' ? 'text' : 'password'; } });
  const err = el('div', { class: 'acc-err', role: 'alert' });
  const nickField = el('label', { class: 'acc-field' }, el('span', { text: 'Ник' }), nick, el('small', { text: `${NICK_MIN}–${NICK_MAX} символов: буквы, цифры, пробел, _ и -` }));
  const submit = el('button', { class: 'primary', type: 'submit' });
  const forgot = el('button', { class: 'link', type: 'button', text: 'Забыли пароль?' });
  const tabLogin = el('button', { type: 'button', text: 'Вход' }), tabReg = el('button', { type: 'button', text: 'Регистрация' });
  const title = el('h2');
  const sub = el('p', { class: 'acc-sub' });

  const form = el('form', { novalidate: true },
    el('label', { class: 'acc-field' }, el('span', { text: 'Почта' }), email),
    nickField,
    el('label', { class: 'acc-field' }, el('span', { text: 'Пароль' }), el('div', { class: 'acc-pw' }, pw, eye)),
    err,
    el('div', { class: 'acc-row' }, submit, forgot));

  const render = () => {
    const reg = mode === 'register';
    tabLogin.classList.toggle('on', !reg); tabReg.classList.toggle('on', reg);
    title.textContent = reg ? 'Новая ведьма' : 'С возвращением';
    sub.textContent = reg ? 'Аккаунт хранит прогресс в облаке — играйте с любого устройства.' : 'Войдите, чтобы вернуть свой прогресс.';
    nickField.style.display = reg ? '' : 'none';
    pw.autocomplete = reg ? 'new-password' : 'current-password';
    submit.textContent = reg ? 'Создать аккаунт' : 'Войти';
    forgot.style.display = reg ? 'none' : '';
    err.textContent = ''; err.classList.remove('acc-ok');
  };
  tabLogin.onclick = () => { mode = 'login'; render(); };
  tabReg.onclick = () => { mode = 'register'; render(); };

  const busy = (on) => { submit.disabled = on; tabLogin.disabled = tabReg.disabled = on; if (on) submit.textContent = 'Подождите…'; else render(); };
  const say = (text, good = false) => { err.textContent = text; err.classList.toggle('acc-ok', good); };

  forgot.onclick = async () => {
    try { await account.recover(email.value); say('Письмо для восстановления отправлено. Проверьте почту.', true); }
    catch (e) { say(errMsg(e)); }
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    say('');
    busy(true);
    try {
      const r = mode === 'register'
        ? await account.signUp({ email: email.value, password: pw.value, nickname: nick.value })
        : await account.signIn({ email: email.value, password: pw.value });
      if (r.needsConfirm) { busy(false); mode = 'login'; render(); say('Почти готово! Мы отправили письмо — подтвердите почту и войдите.', true); return; }
      h.close();
      if (r.sync?.kind === 'conflict') {
        const choice = await showConflict({ cloud: { data: account.pendingConflict.cloud.data, updatedAt: account.pendingConflict.cloud.updated_at }, local: { data: account.pendingConflict.local, source: r.sync.local.source } });
        await account.resolveConflict(choice);
      }
      onDone?.(r);
    } catch (e) { busy(false); say(errMsg(e)); }
  });

  card.append(title, sub,
    el('div', { class: 'acc-tabs' }, tabLogin, tabReg),
    form,
    el('div', { class: 'acc-center' }, el('button', { class: 'link', type: 'button', text: 'Играть как гость', onclick: () => h.close() })));
  render();
  setTimeout(() => { if (!card.contains(document.activeElement)) email.focus(); }, 50); // не перехватываем фокус, если игрок уже нажал на другое поле
  return h;
}

/** Окно профиля: ник, почта, состояние облака, выход. */
export function showAccount(account, { onSignedOut, onClose, onNickname } = {}) {
  const card = el('div', { class: 'acc-card' });
  const h = overlay(card, { onClose });
  const nick = el('input', { type: 'text', value: account.nickname, maxlength: String(NICK_MAX + 8), autocomplete: 'nickname' });
  const err = el('div', { class: 'acc-err', role: 'alert' });
  const dot = el('span', { class: 'acc-dot' }), statusText = el('span');
  const flushBtn = el('button', { type: 'button', text: 'Отправить в облако сейчас' });
  const saveNick = el('button', { type: 'button', text: 'Сохранить ник' });
  const out = el('button', { class: 'danger', type: 'button', text: 'Выйти из профиля' });

  const status = () => {
    const s = account.sync;
    dot.className = 'acc-dot ' + (s.state === 'ok' ? 'ok' : s.state === 'error' ? 'err' : s.state === 'syncing' ? 'busy' : '');
    statusText.textContent = s.state === 'ok' ? `Сохранено в облаке в ${fmtTime(s.lastSyncAt)}`
      : s.state === 'syncing' ? 'Отправляем прогресс…'
      : s.state === 'error' ? (s.error === 'network' || s.error === 'timeout' ? 'Нет связи — отправим, когда появится' : 'Не удалось сохранить в облако — повторим')
      : (account._meta().dirty ? 'Есть изменения, скоро отправим' : 'Прогресс в облаке');
  };
  const off = account.onChange(status);
  const h2close = h.close;
  h.close = () => { off(); h2close(); };

  flushBtn.onclick = async () => { flushBtn.disabled = true; await account.flush(); flushBtn.disabled = false; status(); };
  saveNick.onclick = async () => {
    err.textContent = ''; err.classList.remove('acc-ok'); saveNick.disabled = true;
    try { const v = await account.changeNickname(nick.value); nick.value = v; err.textContent = 'Ник сохранён.'; err.classList.add('acc-ok'); onNickname?.(v); }
    catch (e) { err.textContent = errMsg(e); }
    saveNick.disabled = false;
  };
  let armed = false;
  out.onclick = async () => {
    if (!armed) { armed = true; out.textContent = 'Точно выйти? Нажмите ещё раз'; setTimeout(() => { armed = false; out.textContent = 'Выйти из профиля'; }, 3500); return; }
    out.disabled = true; out.textContent = 'Выходим…';
    const r = await account.signOut();
    h.close();
    onSignedOut?.(r);
  };

  card.append(
    el('h2', { text: 'Профиль' }),
    el('p', { class: 'acc-sub', text: 'Прогресс хранится в облаке и привязан к вашей почте.' }),
    el('label', { class: 'acc-field' }, el('span', { text: 'Ник' }), nick),
    err,
    el('div', { class: 'acc-kv' }, el('span', { text: 'Почта' }), el('b', { text: account.email })),
    el('div', { class: 'acc-kv' }, el('span', { text: 'Облако' }), el('b', {}, dot, statusText)),
    el('div', { class: 'acc-row' }, saveNick, flushBtn, out, el('button', { class: 'primary', text: 'Закрыть', onclick: () => h.close() })));
  status();
  return h;
}
