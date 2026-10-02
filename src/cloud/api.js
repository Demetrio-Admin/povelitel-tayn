// Клиент Supabase на чистом fetch (без библиотек): вход, регистрация, профиль, облачное сохранение.
// Не зависит от Phaser; fetch подставляется снаружи, поэтому тестируется с фальшивым сервером.

export class CloudError extends Error {
  constructor(code, message, status = 0) { super(message); this.name = 'CloudError'; this.code = code; this.status = status; }
}

const RU = {
  network: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
  timeout: 'Сервер долго не отвечает. Попробуйте ещё раз.',
  invalid_credentials: 'Неверная почта или пароль.',
  email_taken: 'Эта почта уже зарегистрирована. Войдите или восстановите пароль.',
  weak_password: 'Пароль слишком простой. Используйте не меньше 8 символов.',
  email_not_confirmed: 'Почта не подтверждена. Откройте письмо от игры и перейдите по ссылке.',
  nickname_taken: 'Этот ник уже занят. Выберите другой.',
  rate_limited: 'Слишком много попыток. Подождите минуту.',
  bad_email: 'Не удалось отправить письмо на этот адрес.',
  unauthorized: 'Сессия истекла. Войдите снова.',
  not_configured: 'Облако не подключено.',
  unknown: 'Что-то пошло не так. Попробуйте ещё раз.',
};
export const errorText = (code) => RU[code] || RU.unknown;

/** Приводит ответ GoTrue / PostgREST к понятному коду. */
export function mapError(status, body) {
  const msg = String(body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
  const code = String(body?.error_code || body?.code || '').toLowerCase();
  if (status === 429 || code.includes('rate_limit')) return 'rate_limited';
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'invalid_credentials';
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered')) return 'email_taken';
  if (code === 'weak_password' || msg.includes('password should be')) return 'weak_password';
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return 'email_not_confirmed';
  if (code === '23505' || msg.includes('duplicate key') || msg.includes('nickname')) return 'nickname_taken';
  if (code === 'validation_failed' && msg.includes('email')) return 'bad_email';
  if (status === 401 || code === 'pgrst301' || msg.includes('jwt')) return 'unauthorized';
  return 'unknown';
}

export function sessionFromResponse(j, now = Date.now()) {
  const expiresIn = Number(j.expires_in) || 3600;
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at ? j.expires_at * 1000 : now + expiresIn * 1000,
    user: { id: j.user?.id, email: j.user?.email },
  };
}

export class SupabaseApi {
  constructor({ url = '', anonKey = '', fetchFn = null, timeoutMs = 9000, now = () => Date.now() } = {}) {
    this.url = String(url).replace(/\/+$/, '');
    this.anonKey = anonKey;
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
      throw new CloudError(e?.name === 'AbortError' ? 'timeout' : 'network', e?.name === 'AbortError' ? RU.timeout : RU.network);
    } finally { if (timer) clearTimeout(timer); }
    let json = null;
    try { const text = await res.text(); json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    if (!res.ok) { const code = mapError(res.status, json); throw new CloudError(code, errorText(code), res.status); }
    return json;
  }

  // ---------------------------------------------------------------- аккаунт
  /** Возвращает { session } или { needsConfirm: true } (если в проекте включено подтверждение почты). */
  async signUp(email, password, nickname) {
    const j = await this._req('/auth/v1/signup', { method: 'POST', body: { email, password, data: { nickname } } });
    if (j?.access_token) return { session: sessionFromResponse(j, this.now()) };
    return { needsConfirm: true };
  }

  async signIn(email, password) {
    const j = await this._req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    return sessionFromResponse(j, this.now());
  }

  async refresh(refreshToken) {
    const j = await this._req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } });
    return sessionFromResponse(j, this.now());
  }

  async signOut(accessToken) { await this._req('/auth/v1/logout', { method: 'POST', token: accessToken }); }

  async recover(email) { await this._req('/auth/v1/recover', { method: 'POST', body: { email } }); }

  // ---------------------------------------------------------------- профиль
  async nicknameAvailable(nick) {
    const j = await this._req('/rest/v1/rpc/nickname_available', { method: 'POST', body: { nick } });
    return j === true;
  }

  async getProfile(session) {
    const j = await this._req(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=nickname`, { token: session.access_token });
    return Array.isArray(j) && j[0] ? { nickname: j[0].nickname } : null;
  }

  async setNickname(session, nickname) {
    await this._req(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}`, { method: 'PATCH', token: session.access_token, headers: { Prefer: 'return=minimal' }, body: { nickname } });
  }

  // ---------------------------------------------------------------- сохранение
  async getSave(session) {
    const j = await this._req(`/rest/v1/saves?user_id=eq.${encodeURIComponent(session.user.id)}&select=data,version,updated_at`, { token: session.access_token });
    return Array.isArray(j) && j[0] ? j[0] : null;
  }

  /** Записывает сохранение (upsert). Возвращает { updated_at }. */
  async putSave(session, data, { keepalive = false } = {}) {
    const row = { user_id: session.user.id, data, version: data?.version || 1, hero_level: data?.heroLevel ?? null, play_time_ms: Math.round(data?.stats?.playTimeMs || 0) };
    const j = await this._req('/rest/v1/saves?on_conflict=user_id&select=updated_at', {
      method: 'POST', token: session.access_token, keepalive,
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: row,
    });
    return Array.isArray(j) && j[0] ? { updated_at: j[0].updated_at } : { updated_at: new Date(this.now()).toISOString() };
  }
}
