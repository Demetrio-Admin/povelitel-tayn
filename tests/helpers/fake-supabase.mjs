// Фальшивый сервер Supabase для тестов: те же адреса и формы ответов, что у настоящего (GoTrue + PostgREST).
export class FakeSupabase {
  constructor({ confirmEmail = false } = {}) {
    this.confirmEmail = confirmEmail;
    this.users = new Map();      // email -> { id, password, confirmed, nickname }
    this.access = new Map();     // access token -> user id
    this.refreshT = new Map();   // refresh token -> user id
    this.saves = new Map();      // user id -> { data, version, updated_at }
    this.online = true;
    this.calls = [];
    this.seq = 0;
    this.clock = 1_700_000_000_000;
    this.fetch = this.fetch.bind(this);
  }

  tick() { this.clock += 1000; return new Date(this.clock).toISOString(); }
  res(status, body) { const text = body === undefined ? '' : JSON.stringify(body); return { ok: status >= 200 && status < 300, status, text: async () => text }; }
  newSession(user) {
    const a = `at-${++this.seq}`, r = `rt-${++this.seq}`;
    this.access.set(a, user.id); this.refreshT.set(r, user.id);
    return { access_token: a, refresh_token: r, expires_in: 3600, user: { id: user.id, email: user.email } };
  }
  expireAccessTokens() { this.access.clear(); }
  revokeRefreshTokens() { this.refreshT.clear(); }
  nickTaken(nick, exceptId) { return [...this.users.values()].some(u => u.id !== exceptId && u.nickname.toLowerCase() === nick.toLowerCase()); }
  authUser(opts) {
    const h = opts.headers || {};
    const t = (h.Authorization || '').replace('Bearer ', '');
    return this.access.get(t) || null;
  }

  async fetch(url, opts = {}) {
    if (!this.online) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    this.calls.push(`${method} ${u.pathname}${u.search.includes('grant_type') ? '?' + u.searchParams.get('grant_type') : ''}`);
    const p = u.pathname;

    if (p === '/auth/v1/signup') {
      if (this.users.has(body.email)) return this.res(422, { error_code: 'user_already_exists', msg: 'User already registered' });
      if (String(body.password).length < 6) return this.res(422, { error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
      const nickname = body.data?.nickname || `Ведьма${this.seq}`;
      if (this.nickTaken(nickname)) return this.res(500, { message: 'Database error saving new user' });
      const user = { id: `u-${this.users.size + 1}`, email: body.email, password: body.password, confirmed: !this.confirmEmail, nickname };
      this.users.set(body.email, user);
      if (this.confirmEmail) return this.res(200, { id: user.id, email: user.email });
      return this.res(200, this.newSession(user));
    }
    if (p === '/auth/v1/token') {
      const grant = u.searchParams.get('grant_type');
      if (grant === 'password') {
        const user = this.users.get(body.email);
        if (!user || user.password !== body.password) return this.res(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        if (!user.confirmed) return this.res(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
        return this.res(200, this.newSession(user));
      }
      const uid = this.refreshT.get(body.refresh_token);
      if (!uid) return this.res(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
      this.refreshT.delete(body.refresh_token);
      return this.res(200, this.newSession([...this.users.values()].find(x => x.id === uid)));
    }
    if (p === '/auth/v1/logout') { const uid = this.authUser(opts); if (uid) { for (const [k, v] of this.access) if (v === uid) this.access.delete(k); } return this.res(204); }
    if (p === '/auth/v1/recover') return this.res(200, {});
    if (p === '/rest/v1/rpc/nickname_available') return this.res(200, !this.nickTaken(String(body.nick).trim()));

    const uid = this.authUser(opts);
    if (!uid) return this.res(401, { code: 'PGRST301', message: 'JWT expired' });
    const user = [...this.users.values()].find(x => x.id === uid);
    if (p === '/rest/v1/profiles') {
      if (method === 'GET') return this.res(200, [{ nickname: user.nickname }]);
      if (method === 'PATCH') {
        if (this.nickTaken(body.nickname, uid)) return this.res(409, { code: '23505', message: 'duplicate key value violates unique constraint "profiles_nickname_lower_key"' });
        user.nickname = body.nickname; return this.res(204);
      }
    }
    if (p === '/rest/v1/saves') {
      if (method === 'GET') { const s = this.saves.get(uid); return this.res(200, s ? [{ data: s.data, version: s.version, updated_at: s.updated_at }] : []); }
      if (method === 'POST') {
        if (body.user_id !== uid) return this.res(403, { code: '42501', message: 'new row violates row-level security policy' });
        const rec = { data: body.data, version: body.version, updated_at: this.tick(), hero_level: body.hero_level };
        this.saves.set(uid, rec);
        return this.res(201, [{ updated_at: rec.updated_at }]);
      }
    }
    return this.res(404, { message: 'not found' });
  }
}
