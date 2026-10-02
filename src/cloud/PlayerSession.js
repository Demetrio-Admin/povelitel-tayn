// PlayerSession — игрок онлайн-игры: вход, гость, регистрация ника, загрузка и автосохранение на сервере.
// Без Phaser и DOM: сеть (SupabaseApi), хранилище токенов, часы и таймеры подставляются снаружи — так всё проверяется в тестах.
//
// Главное:
//  • Источник правды — сервер. Прогресс живёт в таблицах по user_id; на устройстве лежат только токены входа.
//  • Гость — настоящий пользователь сервера (анонимный вход Supabase) со своим user_id и персонажем.
//  • Регистрация гостя не создаёт нового персонажа: тому же user_id выдаются ник и пароль (Edge Function account).
//  • Сохранение автоматическое: после каждого state.save() клиент считает, что изменилось (playerModel.diffSnapshots),
//    и отправляет только это. Сервер сливает изменения и возвращает актуальное состояние; клиент берёт его за основу.
//  • У каждой отправки есть id: если ответ потерялся в сети, повтор того же id сервер не применит второй раз.
//  • Нет связи — игра блокируется окном «Нет соединения», изменения ждут в памяти, параллельного локального сейва нет.
import { CloudError, errorText, isNetworkError, isAuthError } from './api.js';
import { validateNickname, checkPasswordPair, normalizeNickname, loginEmail } from './nickname.js';
import { toSnapshot, fromSnapshot, diffSnapshots, applyPatch, fillDefaults, isMinorPatch } from './playerModel.js';

export const TOKENS_KEY = 'witch_rpg_auth_v2';
export const DEFAULT_HERO = 'witch';

const isEmpty = (p) => !p || Object.keys(p).length === 0;
const randomId = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
};

export class PlayerSession {
  /**
   * @param api        SupabaseApi
   * @param state      GameState (без хранилища: данные приходят с сервера)
   * @param storage    localStorage-подобное хранилище — только для токенов входа
   */
  constructor({ api, state, storage, now = () => Date.now(), setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t),
    saveDelayMs = 600, minorDelayMs = 15000, retryDelaysMs = [2000, 4000, 8000, 15000] }) {
    this.api = api; this.state = state; this.storage = storage; this.now = now;
    this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.saveDelayMs = saveDelayMs; this.minorDelayMs = minorDelayMs; this.retryDelaysMs = retryDelaysMs;

    this.auth = null;          // { access_token, refresh_token, expires_at, user: { id } }
    this.status = 'signed_out'; // signed_out | loading | ready | offline
    this.saving = 'saved';     // saved | saving | offline
    this.meta = {};            // ник, герой, даты (из ответа сервера)
    this.base = null;          // последний снимок с сервера
    this.inflight = null;      // { id, patch, sent } — отправка, ответ на которую ещё не пришёл (или потерялся)
    this.timer = null; this.timerMinor = false;
    this.retryTimer = null; this.retryN = 0;
    this.busy = null;          // текущий flush()
    this.listeners = new Set();
    this.lastError = null;
    state.onSave(() => this.onStateSaved());
  }

  // ---------------------------------------------------------------- состояние для интерфейса
  get enabled() { return this.api.enabled; }
  get signedIn() { return !!this.auth; }
  get ready() { return this.status === 'ready' || this.status === 'offline'; }
  get userId() { return this.auth?.user?.id || null; }
  get registered() { return !!this.meta.registered; }
  get nickname() { return this.meta.nickname || ''; }
  get hero() { return this.meta.hero || DEFAULT_HERO; }
  get level() { return this.state.data.heroLevel; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(reason) { this.listeners.forEach(fn => { try { fn(reason, this); } catch (e) { console.error(e); } }); }
  _setStatus(s) { if (this.status !== s) { this.status = s; this.emit('status'); } }
  _setSaving(s) { if (this.saving !== s) { this.saving = s; this.emit('saving'); } }

  // ---------------------------------------------------------------- токены
  _loadTokens() { try { const raw = this.storage?.getItem(TOKENS_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  _saveTokens() { try { if (this.auth) this.storage?.setItem(TOKENS_KEY, JSON.stringify(this.auth)); } catch (e) { /* ignore */ } }
  _dropTokens() { this.auth = null; try { this.storage?.removeItem(TOKENS_KEY); } catch (e) { /* ignore */ } }
  _setAuth(a) { this.auth = a; this._saveTokens(); }

  async _fresh(force = false) {
    if (!this.auth) throw new CloudError('unauthorized', errorText('unauthorized'), 401);
    if (!force && this.auth.expires_at - this.now() > 60000) return this.auth;
    try {
      this._setAuth(await this.api.refresh(this.auth.refresh_token));
    } catch (e) {
      if (!isNetworkError(e)) this._lostSession();
      throw e;
    }
    return this.auth;
  }

  /** Вызов с токеном; при 401 — одно обновление токена и повтор. */
  async _authed(fn) {
    let a = await this._fresh();
    try { return await fn(a.access_token); } catch (e) {
      if (!isAuthError(e)) throw e;
      a = await this._fresh(true);
      return fn(a.access_token);
    }
  }

  /** Сервер больше не узнаёт этот вход (токен отозван): возвращаемся на стартовый экран. */
  _lostSession() {
    this._dropTokens();
    this._stopTimers();
    this.inflight = null; this.base = null; this.meta = {};
    this._setStatus('signed_out');
    this.emit('session-lost');
  }

  _stopTimers() {
    if (this.timer) { this.clearTimer(this.timer); this.timer = null; }
    if (this.retryTimer) { this.clearTimer(this.retryTimer); this.retryTimer = null; }
  }

  // ---------------------------------------------------------------- загрузка игрока
  _applyServer(raw) {
    const { snapshot, meta } = fillDefaults(raw);
    this.base = snapshot;
    this.meta = meta;
    this.state.setData(fromSnapshot(snapshot, this.state.data));
    this.emit('profile');
  }

  async _loadPlayer(hero) {
    let raw = await this._authed(t => this.api.getPlayer(t));
    if (!raw) raw = await this._authed(t => this.api.createPlayer(t, hero || DEFAULT_HERO)); // вход есть, персонажа нет
    this._applyServer(raw);
    this.inflight = null;
    this.retryN = 0;
    this._setSaving('saved');
    this._setStatus('ready');
  }

  /**
   * Запуск игры: если на устройстве есть вход (гостя или игрока), продолжаем того же персонажа.
   * Возвращает 'ready' | 'signed_out' | 'offline'. При 'offline' вызовите restore() ещё раз, когда появится связь.
   */
  async restore() {
    if (!this.enabled) return 'signed_out';
    const saved = this._loadTokens();
    if (!saved?.refresh_token) { this._setStatus('signed_out'); return 'signed_out'; }
    this.auth = saved;
    this._setStatus('loading');
    try {
      await this._loadPlayer();
      return 'ready';
    } catch (e) {
      if (isNetworkError(e)) { this._setStatus('offline'); this.lastError = e; return 'offline'; }
      if (this.auth) this._lostSession();
      return 'signed_out';
    }
  }

  // ---------------------------------------------------------------- гость
  /** «Играть как гость»: анонимный пользователь на сервере + персонаж с выбранным героем. */
  async playAsGuest(hero = DEFAULT_HERO) {
    this._setStatus('loading');
    try {
      this._setAuth(await this.api.signInAnonymously());
      await this._loadPlayer(hero);
      this.emit('signin');
    } catch (e) { this._afterFailedStart(); throw e; }
  }

  _afterFailedStart() { if (this.status === 'loading') this._setStatus(this.auth && this.base ? 'ready' : 'signed_out'); }

  // ---------------------------------------------------------------- регистрация
  _checkForm(nickname, password, password2) {
    const n = validateNickname(nickname);
    if (!n.ok) throw new CloudError('validation', n.error);
    const p = checkPasswordPair(password, password2);
    if (!p.ok) throw new CloudError('validation', p.error);
    return n;
  }

  /**
   * «Создать аккаунт» при начале игры: тот же путь, что у гостя (персонаж с героем), и сразу ник с паролем.
   * Если ник окажется занят, персонаж остаётся гостем этого устройства — форма просто попросит другой ник.
   */
  async registerNew({ hero = DEFAULT_HERO, nickname, password, password2 }) {
    const n = this._checkForm(nickname, password, password2);
    if (!this.auth) {
      // ник проверяем заранее, чтобы не заводить гостя впустую (окончательно решает база при регистрации)
      if (!(await this.api.nicknameAvailable(n.norm))) throw new CloudError('nickname_taken', errorText('nickname_taken'));
      await this.playAsGuest(hero);
    }
    return this.registerGuest({ nickname, password, password2 });
  }

  /** Гость получает ник и пароль. user_id, персонаж и весь прогресс остаются прежними. */
  async registerGuest({ nickname, password, password2 }) {
    const n = this._checkForm(nickname, password, password2);
    if (!this.auth) throw new CloudError('unauthorized', errorText('unauthorized'));
    if (this.registered) throw new CloudError('already_registered', errorText('already_registered'));
    await this.flush(); // прогресс гостя — на сервер до регистрации
    await this._authed(t => this.api.claimNickname(t, n.value, password));
    // проверяем, что вход по нику и паролю работает, и берём токен уже постоянного аккаунта
    try {
      this._setAuth(await this.api.signInWithEmail(await loginEmail(n.norm, this.api.loginDomain), password));
    } catch (e) {
      // аккаунт создан и текущий токен действует; но если вход по нику не прошёл — почти наверняка домен служебных
      // адресов в игре (VITE_LOGIN_EMAIL_DOMAIN) не совпадает с LOGIN_EMAIL_DOMAIN в Edge Function account
      console.warn('[PlayerSession] вход по нику сразу после регистрации не прошёл:', e?.code, '— проверьте, что VITE_LOGIN_EMAIL_DOMAIN совпадает с LOGIN_EMAIL_DOMAIN функции account');
    }
    await this._loadPlayer();
    this.emit('registered');
    return this.nickname;
  }

  /** Есть ли что терять, если выйти из гостя (в форме «У меня уже есть аккаунт» на устройстве гостя). */
  get guestHasProgress() { return this.signedIn && !this.registered && (this.state.data.completedEvents.length > 0 || this.state.data.heroLevel > 1); }

  // ---------------------------------------------------------------- вход
  async login({ nickname, password }) {
    const norm = normalizeNickname(nickname);
    if (!norm || !password) throw new CloudError('validation', 'Введите никнейм и пароль.');
    // форма не подсказывает, что именно неверно: ник или пароль
    if (!validateNickname(nickname).ok) throw new CloudError('invalid_credentials', errorText('invalid_credentials'));
    this._setStatus(this.status === 'ready' ? 'ready' : 'loading');
    try {
      const auth = await this.api.signInWithEmail(await loginEmail(norm, this.api.loginDomain), password);
      // вход в другой аккаунт с этого устройства: предыдущий вход закрываем
      if (this.auth && this.auth.user.id !== auth.user.id) { await this._signOutQuietly(); }
      this._stopTimers();
      this._setAuth(auth);
      await this._loadPlayer();
      this.emit('signin');
    } catch (e) { this._afterFailedStart(); throw e; }
  }

  async _signOutQuietly() {
    const t = this.auth?.access_token;
    this._dropTokens();
    if (t) { try { await this.api.signOut(t); } catch (e) { /* токен всё равно забыт */ } }
  }

  /** Выход: прогресс уже на сервере (отправляем остаток), вход на устройстве закрывается. Данные аккаунта не трогаем. */
  async logout() {
    if (this.status === 'ready') { try { await this.flush(); } catch (e) { /* не держим игрока */ } }
    this._stopTimers();
    await this._signOutQuietly();
    this.inflight = null; this.base = null; this.meta = {};
    this._setSaving('saved');
    this._setStatus('signed_out');
    this.emit('signout');
  }

  async changePassword({ password, password2 }) {
    const p = checkPasswordPair(password, password2);
    if (!p.ok) throw new CloudError('validation', p.error);
    await this._authed(t => this.api.updatePassword(t, p.value));
  }

  /** «Новая игра» / «Сбросить прогресс»: тот же аккаунт и ник, прогресс с нуля. */
  async resetProgress(hero = this.hero) {
    this._stopTimers();
    if (this.busy) { try { await this.busy; } catch (e) { /* ignore */ } }
    this.inflight = null;
    const raw = await this._authed(t => this.api.resetPlayer(t, hero));
    this._applyServer(raw);
    this._setSaving('saved');
  }

  // ---------------------------------------------------------------- автосохранение
  onStateSaved() {
    if (this.status !== 'ready' || !this.base) return;
    const patch = diffSnapshots(this.base, toSnapshot(this.state.data));
    if (isEmpty(patch)) return;
    const minor = isMinorPatch(patch);
    // важное (награда, предмет, событие) — почти сразу; позиция и время игры — пореже
    if (this.timer && (!this.timerMinor || minor)) return;
    if (this.timer) this.clearTimer(this.timer);
    this.timerMinor = minor;
    this.timer = this.setTimer(() => { this.timer = null; return this.flush().catch(() => {}); }, minor ? this.minorDelayMs : this.saveDelayMs);
  }

  /** Есть ли изменения, которых ещё нет на сервере. */
  get dirty() { return !!this.inflight || (!!this.base && !isEmpty(diffSnapshots(this.base, toSnapshot(this.state.data)))); }

  /**
   * Отправляет изменения на сервер. true — всё на сервере. Нет связи — false, статус offline, повтор по таймеру.
   * keepalive — при закрытии вкладки (браузер дошлёт запрос сам).
   */
  async flush({ keepalive = false } = {}) {
    if (!this.base || !this.auth) return false;
    if (this.busy) { await this.busy.catch(() => {}); if (!this.dirty) return true; }
    if (this.timer) { this.clearTimer(this.timer); this.timer = null; }
    this.busy = this._flushLoop(keepalive);
    try { return await this.busy; } finally { this.busy = null; }
  }

  async _flushLoop(keepalive) {
    for (let guard = 0; guard < 5; guard++) {
      if (!this.inflight) {
        const sent = toSnapshot(this.state.data);
        const patch = diffSnapshots(this.base, sent);
        if (isEmpty(patch)) { this._setSaving('saved'); return true; }
        this.inflight = { id: randomId(), patch, sent };
      }
      const { id, patch, sent } = this.inflight;
      this._setSaving('saving');
      let raw;
      try {
        raw = await this._authed(t => this.api.syncPlayer(t, { ...patch, id }, { keepalive }));
      } catch (e) {
        this.lastError = e;
        if (isNetworkError(e)) { this._goOffline(); return false; }
        if (this.status === 'signed_out') return false; // вход потерян (_lostSession уже сработал)
        // сервер отверг изменения: не повторяем их бесконечно, берём его состояние
        this.inflight = null;
        try { await this._loadPlayer(); } catch (e2) { if (isNetworkError(e2)) this._goOffline(); }
        return false;
      }
      // пока ждали ответа, игра могла ещё что-то изменить — кладём это поверх ответа сервера
      const later = diffSnapshots(sent, toSnapshot(this.state.data));
      const { snapshot, meta } = fillDefaults(raw);
      this.base = snapshot;
      this.meta = { ...this.meta, ...meta };
      this.inflight = null;
      this.state.setData(fromSnapshot(applyPatch(snapshot, later), this.state.data));
      this._backOnline();
      if (isEmpty(later)) { this._setSaving('saved'); return true; }
    }
    return !this.dirty;
  }

  _goOffline() {
    this._setSaving('offline');
    this._setStatus('offline');
    if (this.retryTimer) return;
    const delay = this.retryDelaysMs[Math.min(this.retryN, this.retryDelaysMs.length - 1)];
    this.retryN++;
    this.retryTimer = this.setTimer(() => { this.retryTimer = null; return this.retryNow(); }, delay);
  }

  _backOnline() {
    this.retryN = 0;
    if (this.retryTimer) { this.clearTimer(this.retryTimer); this.retryTimer = null; }
    if (this.status === 'offline') this._setStatus('ready');
  }

  /** Кнопка «Повторить» в окне «Нет соединения» (и автоповтор). */
  async retryNow() {
    if (this.retryTimer) { this.clearTimer(this.retryTimer); this.retryTimer = null; }
    if (this.status !== 'offline') return this.status === 'ready';
    if (!this.base) { return (await this.restore()) === 'ready'; } // связь пропала ещё при запуске
    const ok = await this.flush();
    if (ok && this.status === 'offline') this._backOnline();
    return this.status === 'ready';
  }
}
