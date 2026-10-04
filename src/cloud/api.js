// Клиент Supabase на чистом fetch (без библиотек). Не зависит от Phaser; fetch подставляется снаружи,
// поэтому всё проверяется на фальшивом сервере (tests/helpers/fake-supabase.mjs).
//
// Что использует игра:
//   Auth  — анонимный вход (гость), вход по служебному адресу ника, обновление токена, выход, смена пароля;
//   RPC   — create_player / get_player / sync_player / reset_player / nickname_available (supabase/schema.sql);
//   Edge Function account — превращение гостя в игрока с ником (supabase/functions/account).

export class CloudError extends Error {
  /** detail — технический код ответа сервера (PostgREST/Postgres, напр. 'P0001', 'PGRST202'): только для отладки. */
  constructor(code, message, status = 0, detail = '') { super(message); this.name = 'CloudError'; this.code = code; this.status = status; this.detail = detail; }
}

// Тексты для игрока. Технические ответы сервера сюда не попадают.
const RU = {
  game_banned: 'Доступ к игре ограничен. Вы можете обратиться в поддержку.',
  chat_forbidden: 'У вас нет прав на это действие.',
  chat_protected: 'Этот сотрудник защищён от изменения вашим набором прав.',
  chat_conflict: 'Данные уже изменились. Обновите экран и повторите действие.',
  chat_request_conflict: 'Эта отправка уже использована. Обновите экран.',
  chat_rate_limited: 'Слишком часто. Подождите немного и попробуйте снова.',
  chat_invalid_text: 'Проверьте длину текста, переносы строк и упоминания.',
  chat_invalid_id: 'Введите числовой ID игрока.',
  chat_invalid_request: 'Проверьте заполненные поля.',
  chat_not_found: 'Запись не найдена. Обновите экран.',
  chat_muted: 'Вам временно ограничили отправку сообщений. Поддержка доступна.',
  chat_register: 'Создайте аккаунт с никнеймом, чтобы писать в чат.',
  chat_ignored: 'Личная переписка с этим игроком недоступна.',
  chat_ticket_exists: 'У вас уже есть открытое обращение этой категории.',
  chat_take_ticket: 'Сначала возьмите обращение в работу. Возможно, оно уже назначено другому сотруднику.',
  chat_appeal_issuer: 'Обжалование вашей санкции должен завершить другой сотрудник.',
  chat_unavailable: 'Чат ещё не подключён на сервере. Попробуйте позже.',
  network: 'Не удалось связаться с сервером. Попробуйте ещё раз.',
  timeout: 'Не удалось связаться с сервером. Попробуйте ещё раз.',
  invalid_credentials: 'Неверный никнейм или пароль.',
  nickname_taken: 'Этот никнейм уже используется.',
  already_registered: 'У этого персонажа уже есть аккаунт.',
  rate_limited: 'Слишком много попыток. Подождите минуту и попробуйте снова.',
  guest_disabled: 'Гостевая игра сейчас недоступна. Создайте аккаунт или попробуйте позже.',
  weak_password: 'Пароль слишком простой. Придумайте другой.',
  unauthorized: 'Сессия завершилась. Войдите снова.',
  not_configured: 'Сервер игры не подключён.',
  unknown: 'Что-то пошло не так. Попробуйте ещё раз.',
};
export const errorText = (code) => RU[code] || RU.unknown;
export const isNetworkError = (e) => e instanceof CloudError && (e.code === 'network' || e.code === 'timeout');
export const isAuthError = (e) => e instanceof CloudError && e.code === 'unauthorized';

/** Ответ Auth / PostgREST / функции → понятный код. */
export function mapError(status, body) {
  const msg = String(body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
  const code = String(body?.error_code || body?.code || '').toLowerCase();
  if (msg === 'game_banned') return 'game_banned';
  if (msg.startsWith('chat_') && Object.hasOwn(RU, msg)) return msg;
  if (code === 'pgrst202' || code === '42883') return 'chat_unavailable';
  if (status === 429 || code.includes('rate_limit') || code === 'over_request_rate_limit') return 'rate_limited';
  if (code === 'invalid_credentials' || code === 'invalid_grant' || msg.includes('invalid login credentials')) return 'invalid_credentials';
  if (code === 'nickname_taken' || code === '23505') return 'nickname_taken';
  if (code === 'already_registered') return 'already_registered';
  if (code === 'anonymous_provider_disabled' || code === 'signup_disabled') return 'guest_disabled';
  if (code === 'weak_password') return 'weak_password';
  if (status === 401 || (status === 403 && code === 'bad_jwt') || code === 'pgrst301' || code === 'pgrst303' || code === 'session_not_found'
    || code === 'refresh_token_not_found' || code === 'refresh_token_already_used' || code === 'not_authenticated' || code === '28000') return 'unauthorized';
  return 'unknown';
}

export function sessionFromResponse(j, now = Date.now()) {
  const expiresIn = Number(j.expires_in) || 3600;
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at ? j.expires_at * 1000 : now + expiresIn * 1000,
    user: { id: j.user?.id },
  };
}

export class SupabaseApi {
  constructor({ url = '', anonKey = '', loginDomain = '', fetchFn = null, timeoutMs = 10000, now = () => Date.now() } = {}) {
    this.url = String(url).replace(/\/+$/, '');
    this.anonKey = anonKey;
    this.loginDomain = loginDomain;
    this.fetchFn = fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.timeoutMs = timeoutMs;
    this.now = now;
  }

  get enabled() { return !!(this.url && this.anonKey && this.fetchFn); }

  async _req(path, { method = 'GET', body, token, headers = {}, keepalive = false } = {}) {
    if (!this.enabled) throw new CloudError('not_configured', RU.not_configured);
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.timeoutMs) : null;
    let res;
    try {
      res = await this.fetchFn(this.url + path, {
        method,
        headers: { apikey: this.anonKey, Authorization: `Bearer ${token || this.anonKey}`, 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        keepalive,
        signal: ctrl?.signal,
      });
    } catch (e) {
      const timeout = e?.name === 'AbortError';
      throw new CloudError(timeout ? 'timeout' : 'network', RU.network);
    } finally { if (timer) clearTimeout(timer); }
    let json = null;
    try { const text = await res.text(); json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    if (!res.ok) {
      let code = mapError(res.status, json);
      if (code === 'unknown' && res.status >= 500) code = 'server'; // сервер сломался — это не «нет связи», повтор не поможет сразу
      throw new CloudError(code, errorText(code), res.status, String(json?.code || json?.error_code || json?.message || '').slice(0, 80));
    }
    return json;
  }

  // ---------------------------------------------------------------- Auth
  /** Гость: анонимный пользователь Supabase (настоящий user_id на сервере). */
  async signInAnonymously() {
    const j = await this._req('/auth/v1/signup', { method: 'POST', body: { data: {} } });
    if (!j?.access_token) throw new CloudError('guest_disabled', errorText('guest_disabled'));
    return sessionFromResponse(j, this.now());
  }

  async signInWithEmail(email, password) {
    const j = await this._req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    return sessionFromResponse(j, this.now());
  }

  async refresh(refreshToken) {
    const j = await this._req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } });
    return sessionFromResponse(j, this.now());
  }

  // scope=local: закрывается только этот вход; другие устройства игрока остаются в игре
  async signOut(accessToken) { await this._req('/auth/v1/logout?scope=local', { method: 'POST', token: accessToken }); }

  async updatePassword(accessToken, password) { await this._req('/auth/v1/user', { method: 'PUT', token: accessToken, body: { password } }); }

  // ---------------------------------------------------------------- игрок (RPC)
  rpc(name, args, token, opts = {}) { return this._req(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args || {}, ...opts }); }

  async nicknameLogin(norm) {
    try { return await this.rpc('nickname_login', { norm }); }
    catch (e) { if (e.code === 'chat_unavailable') return norm; throw e; }
  }
  nicknameAvailable(norm) { return this.rpc('nickname_available', { norm }); }
  createPlayer(token, hero) { return this.rpc('create_player', { hero }, token); }
  getPlayer(token) { return this.rpc('get_player', {}, token); }
  resetPlayer(token, hero) { return this.rpc('reset_player', { hero }, token); }
  syncPlayer(token, patch, { keepalive = false } = {}) { return this.rpc('sync_player', { patch }, token, { keepalive }); }
  /** v0.9: атомарное действие сервера (лечение за монеты, стартовый набор). */
  playerAction(token, action) { return this.rpc('player_action', { action }, token); }

  /** v0.10.2: пачка событий телеметрии (supabase/migrations/20261005_telemetry.sql). Без миграции вернёт ошибку — игре всё равно. */
  telemetryLog(token, session, events, { keepalive = false } = {}) { return this.rpc('telemetry_log', { session, events }, token, { keepalive }); }

  // ---------------------------------------------------------------- регистрация ника (Edge Function)
  claimNickname(token, nickname, password) {
    return this._req('/functions/v1/account', { method: 'POST', token, body: { action: 'register', nickname, password } });
  }
}
