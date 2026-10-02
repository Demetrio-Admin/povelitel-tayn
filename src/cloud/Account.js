// Account — вход, профиль и облачное сохранение. Без Phaser и DOM: хранилище, часы, таймеры и сеть подставляются снаружи.
//
// Модель данных:
//  • Гость: прогресс в ячейке SAVE.key (как раньше). Облако не используется.
//  • Вошедший игрок: у него личная ячейка `${SAVE.key}:u:<id>` — локальная копия облачного сохранения.
//    Ячейки разных игроков и гостя не смешиваются, поэтому прогресс не «перетекает» между аккаунтами.
//  • Каждое сохранение (state.save) помечает копию «грязной» и ставит отправку в облако (не чаще pushDelayMs).
//    Сбой сети не теряет прогресс: пометка остаётся, отправка повторится.
//  • При входе сравниваются облако, личная копия и гостевое сохранение; если они расходятся и неясно, какое новее,
//    игрок выбирает сам (pendingConflict → resolveConflict).
import { SAVE } from '../config/game.config.js';
import { CloudError, errorText } from './api.js';
import { validateNickname, validateEmail, validatePassword } from './validators.js';

export const SESSION_KEY = 'witch_rpg_session_v1';
export const META_KEY = 'witch_rpg_sync_v1:';
export const GUEST_ADOPTED_KEY = 'witch_rpg_guest_adopted_v1';

export const hasProgress = (d) => !!(d && Array.isArray(d.completedEvents) && d.completedEvents.length > 0);

export function summarize(d) {
  if (!d) return null;
  return {
    level: d.heroLevel || 1,
    events: (d.completedEvents || []).length,
    playMin: Math.round(((d.stats && d.stats.playTimeMs) || 0) / 60000),
    savedAt: d.savedAt || 0,
  };
}

export class Account {
  constructor({ api, storage, state, now = () => Date.now(), setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t), pushDelayMs = 8000, retryMs = 30000 }) {
    this.api = api; this.storage = storage; this.state = state; this.now = now;
    this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.pushDelayMs = pushDelayMs; this.retryMs = retryMs;
    this.session = null;
    this.nickname = '';
    this.sync = { state: 'idle', lastSyncAt: 0, error: null }; // idle | syncing | ok | error
    this.pendingConflict = null;
    this.listeners = new Set();
    this.timer = null;
    this.inFlight = null;
    this.again = false;
    this.paused = false;
    state.onSave(() => this.markDirty());
  }

  // ---------------------------------------------------------------- состояние
  get enabled() { return this.api.enabled; }
  get signedIn() { return !!this.session; }
  get email() { return this.session?.user?.email || ''; }
  get userId() { return this.session?.user?.id || null; }
  get guestKey() { return SAVE.key; }
  userKey(id = this.userId) { return `${SAVE.key}:u:${id}`; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(reason) { this.listeners.forEach(fn => fn(reason, this)); }

  // ---------------------------------------------------------------- хранилище
  _read(key) { try { const raw = this.storage?.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  _write(key, v) { try { this.storage?.setItem(key, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  _remove(key) { try { this.storage?.removeItem(key); } catch (e) { /* ignore */ } }
  _meta(id = this.userId) { return this._read(META_KEY + id) || { syncedAt: '', dirty: false }; }
  _setMeta(patch, id = this.userId) { this._write(META_KEY + id, { ...this._meta(id), ...patch }); }
  _saveSession() { if (this.session) this._write(SESSION_KEY, { ...this.session, nickname: this.nickname }); }

  // ---------------------------------------------------------------- запуск
  /** Восстанавливает вход после перезапуска. Нет сети — остаёмся «вошедшими» с локальной копией. */
  async restore() {
    if (!this.enabled) return { kind: 'disabled' };
    const saved = this._read(SESSION_KEY);
    if (!saved?.access_token || !saved.user?.id) return { kind: 'guest' };
    this.session = { access_token: saved.access_token, refresh_token: saved.refresh_token, expires_at: saved.expires_at, user: saved.user };
    this.nickname = saved.nickname || '';
    try {
      await this._fresh();
    } catch (e) {
      if (e.code === 'unauthorized' || e.code === 'invalid_credentials' || e.status === 400 || e.status === 401) { this._dropSession(); return { kind: 'guest', error: e.code }; }
      // нет связи: играем с личной копией, отправим позже
    }
    this.state.useKey(this.userKey());
    this.state.loadOrDefault();
    this.emit('restore');
    const r = await this.syncNow('boot');
    return r;
  }

  _dropSession() {
    this.session = null; this.nickname = '';
    this._remove(SESSION_KEY);
  }

  // ---------------------------------------------------------------- токен
  async _fresh(force = false) {
    const s = this.session;
    if (!s) throw new CloudError('unauthorized', errorText('unauthorized'), 401);
    if (!force && s.expires_at - this.now() > 60000) return s;
    const next = await this.api.refresh(s.refresh_token);
    this.session = next;
    this._saveSession();
    return next;
  }

  /** Вызов к серверу с одной повторной попыткой после обновления токена. */
  async _authed(fn) {
    let s = await this._fresh();
    try { return await fn(s); } catch (e) {
      if (e instanceof CloudError && e.code === 'unauthorized') { s = await this._fresh(true); return fn(s); }
      throw e;
    }
  }

  // ---------------------------------------------------------------- вход / регистрация
  checkNickname(nick) {
    const v = validateNickname(nick);
    return v;
  }

  async signUp({ email, password, nickname }) {
    const e = validateEmail(email), p = validatePassword(password), n = validateNickname(nickname);
    if (!e.ok) throw new CloudError('validation', e.error);
    if (!p.ok) throw new CloudError('validation', p.error);
    if (!n.ok) throw new CloudError('validation', n.error);
    if (!(await this.api.nicknameAvailable(n.value))) throw new CloudError('nickname_taken', errorText('nickname_taken'));
    const r = await this.api.signUp(e.value, p.value, n.value);
    if (r.needsConfirm) return { needsConfirm: true };
    return this._afterAuth(r.session, n.value);
  }

  async signIn({ email, password }) {
    const e = validateEmail(email);
    if (!e.ok) throw new CloudError('validation', e.error);
    if (!password) throw new CloudError('validation', 'Введите пароль');
    const session = await this.api.signIn(e.value, password);
    return this._afterAuth(session, null);
  }

  async recover(email) {
    const e = validateEmail(email);
    if (!e.ok) throw new CloudError('validation', e.error);
    await this.api.recover(e.value);
  }

  async _afterAuth(session, nickHint) {
    this.session = session;
    let nick = nickHint;
    try { const prof = await this._authed(s => this.api.getProfile(s)); if (prof) nick = prof.nickname; } catch (e) { /* ник подтянется позже */ }
    this.nickname = nick || this.nickname || '';
    this._saveSession();
    const result = await this._signInSync();
    this.emit('signin');
    return { ok: true, sync: result };
  }

  /** Сравнивает облако, личную копию и гостевое сохранение и решает, что считать актуальным. */
  async _signInSync() {
    const id = this.userId;
    const guestRaw = this._read(this.guestKey);
    // гостевой прогресс, который уже вошёл в какой-то аккаунт, повторно не предлагаем
    const adopted = this._read(GUEST_ADOPTED_KEY);
    const guest = guestRaw && !(adopted && (guestRaw.savedAt || 0) <= (adopted.savedAt || 0)) ? guestRaw : null;
    const userLocal = this._read(this.userKey(id));
    const meta = this._meta(id);
    let cloud;
    this._setSync('syncing');
    try { cloud = await this._authed(s => this.api.getSave(s)); } catch (e) { return this._syncFailed(e, userLocal, guest); }

    const guestProgress = hasProgress(guest);
    const localProgress = hasProgress(userLocal);
    // 1. в облаке пусто
    if (!cloud) {
      const src = localProgress ? userLocal : guestProgress ? guest : null;
      this._activate(src);
      if (src === guest && src) this._adoptGuest(guest);
      if (src) await this._upload(src);
      else this._setSync('ok');
      return { kind: src ? 'uploaded' : 'new', source: src === guest ? 'guest' : 'user' };
    }
    // 2. в облаке есть
    if (!localProgress && !guestProgress) { this._activate(cloud.data); this._setMeta({ syncedAt: cloud.updated_at, dirty: false }, id); this._setSync('ok'); return { kind: 'loaded' }; }
    if (!userLocal) {
      // первый вход на этом устройстве, а гость уже играл: решает игрок
      return this._conflict(cloud, guest, 'guest');
    }
    if (meta.dirty && cloud.updated_at > (meta.syncedAt || '')) return this._conflict(cloud, userLocal, 'user');
    if (meta.dirty) { this._activate(userLocal); await this._upload(userLocal); return { kind: 'uploaded', source: 'user' }; }
    this._activate(cloud.data); this._setMeta({ syncedAt: cloud.updated_at, dirty: false }, id); this._setSync('ok');
    return { kind: 'loaded' };
  }

  _conflict(cloud, local, source) {
    // пока игрок не выбрал, держим личную копию как есть и ничего не отправляем
    this.state.useKey(this.userKey());
    this.state.loadOrDefault();
    this.pendingConflict = { cloud, local, source };
    this._setSync('idle');
    return { kind: 'conflict', cloud: { summary: summarize(cloud.data), updatedAt: cloud.updated_at }, local: { summary: summarize(local), source } };
  }

  /** choice: 'cloud' | 'local'. */
  async resolveConflict(choice) {
    const c = this.pendingConflict;
    if (!c) return { kind: 'none' };
    this.pendingConflict = null;
    if (c.source === 'guest') this._adoptGuest(c.local);
    if (choice === 'cloud') {
      this._activate(c.cloud.data);
      this._setMeta({ syncedAt: c.cloud.updated_at, dirty: false });
      this._setSync('ok');
    } else {
      this._activate(c.local);
      await this._upload(c.local);
    }
    this.emit('conflict-resolved');
    return { kind: choice === 'cloud' ? 'loaded' : 'uploaded' };
  }

  _adoptGuest(guest) { this._write(GUEST_ADOPTED_KEY, { savedAt: guest?.savedAt || 0, by: this.userId }); }

  _activate(data) {
    this.paused = true;
    this.state.useKey(this.userKey());
    if (data) this.state.replaceData(data); else this.state.replaceData(null || {});
    this.paused = false;
  }

  _syncFailed(e, userLocal, guest) {
    // облако недоступно: играем с личной копией (если нет — со своим гостевым прогрессом), отправим позже
    const src = hasProgress(userLocal) ? userLocal : hasProgress(guest) ? guest : null;
    this._activate(src);
    if (src && src === guest) { this._adoptGuest(guest); this._setMeta({ dirty: true }); }
    this._setSync('error', e);
    return { kind: 'offline', error: e.code };
  }

  _setSync(state, err = null) {
    this.sync = { state, lastSyncAt: state === 'ok' ? this.now() : this.sync.lastSyncAt, error: err ? (err.code || 'unknown') : null };
    this.emit('sync');
  }

  // ---------------------------------------------------------------- отправка
  markDirty() {
    if (!this.signedIn || this.paused || this.pendingConflict) return;
    this._setMeta({ dirty: true });
    if (!this.timer && !this.inFlight) this.timer = this.setTimer(() => { this.timer = null; return this.flush(); }, this.pushDelayMs);
  }

  async syncNow(reason = 'manual') {
    if (!this.signedIn) return { kind: 'guest' };
    const r = await this._signInSync();
    this.emit('sync-' + reason);
    return r;
  }

  async _upload(data, opts = {}) {
    try {
      const r = await this._authed(s => this.api.putSave(s, data, opts));
      this._setMeta({ syncedAt: r.updated_at, dirty: false });
      this._setSync('ok');
      return true;
    } catch (e) {
      this._setMeta({ dirty: true });
      this._setSync('error', e);
      if (!this.timer) this.timer = this.setTimer(() => { this.timer = null; return this.flush(); }, this.retryMs);
      return false;
    }
  }

  /** Отправляет текущее сохранение в облако, если оно «грязное». Возвращает true, если всё в облаке. */
  async flush({ keepalive = false } = {}) {
    if (!this.signedIn || this.pendingConflict) return false;
    if (this.timer) { this.clearTimer(this.timer); this.timer = null; }
    if (this.inFlight) { this.again = true; return this.inFlight; }
    if (!this._meta().dirty) return true;
    this._setSync('syncing');
    this.inFlight = this._upload(JSON.parse(JSON.stringify(this.state.data)), { keepalive }).finally(() => { this.inFlight = null; });
    const ok = await this.inFlight;
    if (this.again) { this.again = false; return this.flush({ keepalive }); }
    return ok;
  }

  // ---------------------------------------------------------------- профиль и выход
  async changeNickname(raw) {
    const n = validateNickname(raw);
    if (!n.ok) throw new CloudError('validation', n.error);
    if (n.value.toLowerCase() !== this.nickname.toLowerCase() && !(await this.api.nicknameAvailable(n.value))) throw new CloudError('nickname_taken', errorText('nickname_taken'));
    await this._authed(s => this.api.setNickname(s, n.value));
    this.nickname = n.value;
    this._saveSession();
    this.emit('nickname');
    return n.value;
  }

  /** Выход: сначала пытаемся отправить прогресс, потом возвращаемся к гостевой ячейке. */
  async signOut() {
    if (!this.signedIn) return { ok: true, pushed: true };
    let pushed = true;
    if (!this.pendingConflict) pushed = await this.flush();
    const id = this.userId, token = this.session.access_token;
    try { await this.api.signOut(token); } catch (e) { /* токен всё равно удаляем */ }
    if (pushed) { this._remove(this.userKey(id)); this._remove(META_KEY + id); } // на общем устройстве личной копии не оставляем
    this._dropSession();
    this.pendingConflict = null;
    if (this.timer) { this.clearTimer(this.timer); this.timer = null; }
    this.sync = { state: 'idle', lastSyncAt: 0, error: null };
    this.state.useKey(this.guestKey);
    this.state.loadOrDefault();
    this.emit('signout');
    return { ok: true, pushed };
  }
}
