// Фальшивый Supabase для тестов: те же адреса и формы ответов, что у настоящего.
//   Auth (GoTrue): анонимный вход, вход по почте и паролю, обновление и отзыв токенов, смена пароля, admin-обновление.
//   PostgREST: /rest/v1/rpc/<функция>. Два «бэкенда»:
//     backend: 'model' — функции на JS (зеркало supabase/schema.sql через src/cloud/playerModel.js), быстро и без базы;
//     backend: 'pg'    — НАСТОЯЩИЕ SQL-функции и права на Postgres (psql; нужны PGHOST/PGPORT/PGUSER и схема в базе).
//   Edge Function account: вызывается настоящий supabase/functions/account/index.ts.
//   Edge Function combat (v0.14.0): src/cloud/combatHandler.js (тот же код, что собирается в supabase/functions/combat/index.ts).
// Управление для тестов: offline (сеть пропала), loseNextResponse (запрос дошёл, ответ потерялся), expireAccess() и т.д.
// Работает и в Node, и в браузере (DOM-стенд tools/ui/dom): модули Node подгружаются только для backend 'pg'.
const randomUUID = () => globalThis.crypto.randomUUID();
let spawnSync = null;
if (typeof process !== 'undefined' && process.versions?.node) ({ spawnSync } = await import('child_process'));
import { applyPatch, applyAction, combatApply, advanceVitals, emptySnapshot, levelForXp } from '../../src/cloud/playerModel.js';
import { handle as combatFunction } from '../../src/cloud/combatHandler.js';
import { handle as accountFunction } from '../../supabase/functions/account/index.ts';

const ANON = 'anon-key', SERVICE = 'service-key';

export class FakeSupabase {
  constructor({ backend = 'model', allowAnonymous = true, accessTtlMs = 3600_000, url = 'https://fake.supabase.co' } = {}) {
    this.backend = backend; this.allowAnonymous = allowAnonymous; this.accessTtlMs = accessTtlMs; this.url = url;
    this.anonKey = ANON; this.serviceKey = SERVICE;
    this.clock = 1_790_000_000_000;
    this.users = new Map();     // id -> { id, email, password, confirmed, anonymous, meta }
    this.access = new Map();    // access token -> { uid, exp, family }
    this.refreshT = new Map();  // refresh token -> { uid, family, used }
    this.players = new Map();   // backend model: uid -> { snap, hero, nickname, norm, createdAt, registeredAt, rev, recent }
    this.offline = false;
    this.delayMs = 0;           // задержка ответа (проверка «занятых» кнопок)
    this.loseNext = 0;          // столько следующих запросов выполнить, но «потерять» ответ
    this.calls = [];
    this.seq = 0;
    this.fetch = this.fetch.bind(this);
  }

  now() { return this.clock; }
  advance(ms) { this.clock += ms; }
  expireAccess() { for (const a of this.access.values()) a.exp = 0; }

  // ---------------------------------------------------------------- транспорт
  async fetch(url, opts = {}) {
    const u = new URL(url);
    const method = opts.method || 'GET';
    const headers = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    let body = null;
    try { body = opts.body ? JSON.parse(opts.body) : null; } catch (e) { body = null; }
    this.calls.push({ method, path: u.pathname, search: u.search, body, keepalive: !!opts.keepalive });
    if (this.delayMs) await new Promise(r => setTimeout(r, this.delayMs));
    if (this.offline) throw new TypeError('Failed to fetch');
    let res;
    try { res = await this.route(method, u, headers, body); } catch (e) { console.error('[fake-supabase] сбой обработчика', method, u.pathname, e); throw e; }
    if (this.loseNext > 0) { this.loseNext--; throw new TypeError('Failed to fetch'); }
    return res;
  }

  reply(status, body) {
    const text = body === undefined || status === 204 ? null : JSON.stringify(body);
    return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
  }

  bearer(h) { return String(h.authorization || '').replace(/^Bearer\s+/i, ''); }
  userByAccess(h) {
    const a = this.access.get(this.bearer(h));
    if (!a || a.exp < this.clock) return null;
    return this.users.get(a.uid) || null;
  }

  newSession(user, family = randomUUID()) {
    const at = `at-${++this.seq}`, rt = `rt-${++this.seq}`;
    this.access.set(at, { uid: user.id, exp: this.clock + this.accessTtlMs, family });
    this.refreshT.set(rt, { uid: user.id, family, used: false });
    return { access_token: at, refresh_token: rt, expires_in: Math.round(this.accessTtlMs / 1000), token_type: 'bearer',
      user: { id: user.id, email: user.email, is_anonymous: user.anonymous } };
  }

  async route(method, u, h, body) {
    const p = u.pathname;
    // ------------------------------------------------ Auth
    if (p === '/auth/v1/signup' && method === 'POST') {
      if (body?.email || body?.password) return this.reply(400, { error_code: 'validation_failed', msg: 'email signup is not used by the game' });
      if (!this.allowAnonymous) return this.reply(422, { error_code: 'anonymous_provider_disabled', msg: 'Anonymous sign-ins are disabled' });
      const user = { id: randomUUID(), email: null, password: null, confirmed: false, anonymous: true, meta: body?.data || {} };
      this.users.set(user.id, user);
      if (this.backend === 'pg') pg(`insert into auth.users (id) values ('${user.id}');`);
      return this.reply(200, this.newSession(user));
    }
    if (p === '/auth/v1/token' && method === 'POST') {
      const grant = u.searchParams.get('grant_type');
      if (grant === 'password') {
        const user = [...this.users.values()].find(x => x.email && x.email === String(body?.email || '').toLowerCase());
        if (!user || !user.confirmed || user.password !== body?.password) return this.reply(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return this.reply(200, this.newSession(user));
      }
      if (grant === 'refresh_token') {
        const r = this.refreshT.get(body?.refresh_token);
        if (!r || r.used) return this.reply(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
        r.used = true;
        return this.reply(200, this.newSession(this.users.get(r.uid), r.family));
      }
      return this.reply(400, { error_code: 'unsupported_grant_type' });
    }
    if (p === '/auth/v1/logout' && method === 'POST') {
      const a = this.access.get(this.bearer(h));
      if (!a) return this.reply(401, { error_code: 'bad_jwt' });
      const scope = u.searchParams.get('scope') || 'global';
      for (const [k, r] of this.refreshT) if (scope === 'global' ? r.uid === a.uid : r.family === a.family) this.refreshT.delete(k);
      for (const [k, x] of this.access) if (scope === 'global' ? x.uid === a.uid : x.family === a.family) this.access.delete(k);
      return this.reply(204);
    }
    if (p === '/auth/v1/user' && method === 'GET') {
      const user = this.userByAccess(h);
      if (!user) return this.reply(401, { error_code: 'bad_jwt', msg: 'invalid JWT' });
      return this.reply(200, { id: user.id, email: user.email, is_anonymous: user.anonymous });
    }
    if (p === '/auth/v1/user' && method === 'PUT') {
      const user = this.userByAccess(h);
      if (!user) return this.reply(401, { error_code: 'bad_jwt' });
      if (body?.email) return this.reply(400, { error_code: 'validation_failed', msg: 'игра не меняет почту' });
      if (body?.password) {
        if (!user.email) return this.reply(422, { error_code: 'validation_failed', msg: 'Updating password of an anonymous user without an email or phone is not allowed' });
        if (String(body.password).length < 6) return this.reply(422, { error_code: 'weak_password' });
        user.password = body.password;
      }
      return this.reply(200, { id: user.id, email: user.email });
    }
    const adminUser = p.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
    if (adminUser && method === 'PUT') {
      if (h.apikey !== SERVICE) return this.reply(403, { error_code: 'not_admin' });
      const user = this.users.get(adminUser[1]);
      if (!user) return this.reply(404, { error_code: 'user_not_found' });
      if (body?.email) {
        const email = String(body.email).toLowerCase();
        if ([...this.users.values()].some(x => x.id !== user.id && x.email === email)) return this.reply(422, { error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
        user.email = email;
        if (body.email_confirm) user.confirmed = true;
        user.anonymous = false;
        if (this.backend === 'pg') pg(`update auth.users set email = '${email}' where id = '${user.id}';`);
      }
      if (body?.password) user.password = body.password;
      if (body?.user_metadata) user.meta = { ...user.meta, ...body.user_metadata };
      return this.reply(200, { id: user.id, email: user.email });
    }
    // ------------------------------------------------ PostgREST RPC
    const rpc = p.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (rpc && method === 'POST') {
      const fn = rpc[1];
      let role = 'anon', uid = null;
      if (h.apikey === SERVICE) role = 'service';
      else {
        const t = this.bearer(h);
        if (t && t !== ANON) {
          const a = this.access.get(t);
          if (!a) return this.reply(401, { code: 'PGRST301', message: 'JWT invalid' });
          if (a.exp < this.clock) return this.reply(401, { code: 'PGRST303', message: 'JWT expired' });
          role = 'authenticated'; uid = a.uid;
        }
      }
      return this.backend === 'pg' ? this.rpcPg(fn, body || {}, role, uid) : this.rpcModel(fn, body || {}, role, uid);
    }
    // ------------------------------------------------ Edge Function
    if (p === '/functions/v1/account') {
      const t = this.bearer(h);
      if (!this.access.has(t)) return this.reply(401, { msg: 'Invalid JWT' }); // verify_jwt
      const req = new Request(this.url + p, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      // функция ходит к Auth и PostgREST этого же фальшивого сервера (минуя «сеть»: offline её не касается)
      const inner = (url, o) => this.route(o?.method || 'GET', new URL(url), Object.fromEntries(Object.entries(o?.headers || {}).map(([k, v]) => [k.toLowerCase(), v])), o?.body ? JSON.parse(o.body) : null);
      return accountFunction(req, { SUPABASE_URL: this.url, SUPABASE_SERVICE_ROLE_KEY: SERVICE }, inner);
    }
    if (p === '/functions/v1/combat') {
      const t = this.bearer(h);
      if (this.combatFunctionMissing) return this.reply(404, { msg: 'Function not found' });   // тесты: функция не развёрнута
      if (!this.access.has(t)) return this.reply(401, { msg: 'Invalid JWT' });
      const req = new Request(this.url + p, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const inner = (url, o) => this.route(o?.method || 'GET', new URL(url), Object.fromEntries(Object.entries(o?.headers || {}).map(([k, v]) => [k.toLowerCase(), v])), o?.body ? JSON.parse(o.body) : null);
      return combatFunction(req, { SUPABASE_URL: this.url, SUPABASE_SERVICE_ROLE_KEY: SERVICE }, inner, () => (this.backend === 'pg' ? Math.max(this.clock, Date.now()) : this.clock));   // в pg время базы настоящее
    }
    return this.reply(404, { msg: 'not found: ' + p });
  }

  // ---------------------------------------------------------------- RPC на JS (зеркало supabase/schema.sql)
  snapshot(uid) {
    const pl = this.players.get(uid);
    if (!pl) return null;
    const snap = advanceVitals(JSON.parse(JSON.stringify(pl.snap)), this.clock);   // v0.12.0: читающий запрос видит запасы «на сейчас»
    return { ...snap, meta: { hero: pl.hero, nickname: pl.nickname, registered: pl.nickname !== null, rev: pl.rev,
      createdAt: new Date(pl.createdAt).toISOString(), registeredAt: pl.registeredAt ? new Date(pl.registeredAt).toISOString() : null, lastSeenAt: new Date(this.clock).toISOString() } };
  }

  /** Тесты: выставить настоящие HP и ману игрока на сервере «прямо сейчас» (оба бэкенда). */
  setVitals(uid, { hp = null, mana = null } = {}) {
    if (this.backend === 'pg') {
      pg(`update public.player_progress set hp = ${hp === null ? 'null' : hp}, mana = ${mana === null ? 'null' : mana}, vitals_at = date_trunc('milliseconds', now()) where user_id = '${uid}';`);
    } else {
      const pl = this.players.get(uid); pl.snap.hp = hp; pl.snap.mana = mana; pl.snap.vitalsAt = this.clock;
    }
  }

  /**
   * v0.15.0. Тесты: «выдать прогресс» мимо игры — напрямую в таблицы игрока (sync_player опыт, предметы, события и дары больше не принимает).
   * st: { inv: {item: n}, quests: [событие], enemies: [id], paths: [id], abilities: {id: {level, unlocked}}, xp: n, school: {id: n}, research: {…}|null, objects: {id: {…}|null} }.
   * Сумма предметов и опыта добавляется, остальное объединяется. Работает на обоих бэкендах.
   */
  grant(uid, st) {
    if (this.backend === 'pg') { grantPg(uid, st); return; }
    const m = this.players.get(uid).snap;
    for (const [k, n] of Object.entries(st.inv || {})) m.inventory[k] = Math.min((m.inventory[k] || 0) + n, 1e9);
    for (const k of st.quests || []) if (!m.quests.includes(k)) m.quests.push(k);
    for (const k of st.enemies || []) if (!m.enemies.includes(k)) m.enemies.push(k);
    for (const k of st.paths || []) if (!m.paths.includes(k)) m.paths.push(k);
    for (const [k, v] of Object.entries(st.abilities || {})) { const a = m.abilities[k] || { level: 0, unlocked: false }; m.abilities[k] = { level: Math.max(a.level, v.level), unlocked: a.unlocked || !!v.unlocked }; }
    if (st.xp) { m.xp = Math.max(m.xp, st.xp); m.level = Math.max(m.level, levelForXp(m.xp)); }
    for (const [k, n] of Object.entries(st.school || {})) m.school[k] = (m.school[k] || 0) + n;
    if ('research' in st) m.research = st.research;
    for (const [k, v] of Object.entries(st.objects || {})) { if (v === null) delete m.objects[k]; else m.objects[k] = v; }
    if (st.sapphires) m.wallet = { ...m.wallet, sapphires: (m.wallet?.sapphires || 0) + st.sapphires };
  }

  /** Тесты: «прошло sec секунд» для восстановления на сервере — записи сдвигаются в прошлое (в pg настоящее время не перематывается). */
  timeTravel(uid, sec) {
    if (this.backend === 'pg') {
      pg(`update public.player_progress set vitals_at = vitals_at - ${sec} * interval '1 second', combat_since = combat_since - ${sec} * interval '1 second' where user_id = '${uid}';`);
    } else {
      const pl = this.players.get(uid);
      pl.snap.vitalsAt -= sec * 1000; if (pl.snap.combatSince != null) pl.snap.combatSince -= sec * 1000;
    }
  }

  /** v0.13.0. Тесты: «прошло sec секунд» с момента сбора — отметка времени объекта сдвигается в прошлое. */
  ageObject(uid, id, sec) {
    if (this.backend === 'pg') {
      pg(`update public.player_world set data = jsonb_set(data, '{t}', to_jsonb((data->>'t')::numeric - ${sec} * 1000)) where user_id = '${uid}' and kind = 'object' and key = '${id}';`);
    } else {
      const pl = this.players.get(uid); pl.snap.objects[id].t -= sec * 1000;
    }
  }

  /** Тесты: что сервер хранит про HP и бой (без пересчёта по времени). */
  rawVitals(uid) {
    if (this.backend === 'pg') {
      const [hp, mana, cs] = pg(`select coalesce(hp::text,''), coalesce(mana::text,''), coalesce(combat_since::text,'') from public.player_progress where user_id = '${uid}';`).trim().split('|');
      return { hp: hp === '' ? null : Number(hp), mana: mana === '' ? null : Number(mana), combat: cs !== '' };
    }
    const pl = this.players.get(uid); return { hp: pl.snap.hp, mana: pl.snap.mana, combat: pl.snap.combatSince != null };
  }

  rpcModel(fn, a, role, uid) {
    const err = (status, code, message) => this.reply(status, { code, message });
    const authed = () => role === 'authenticated' && uid;
    switch (fn) {
      case 'nickname_login':
        return this.reply(200, [...this.players.values()].find(x => x.norm === a.norm)?.norm ?? null);
      case 'nickname_available':
        return this.reply(200, /^[a-zа-яё0-9_]{3,20}$/.test(String(a.norm)) && ![...this.players.values()].some(x => x.norm === a.norm));
      case 'create_player': {
        if (!authed()) return err(403, '28000', 'not_authenticated');
        if (!/^[a-z0-9_]{1,32}$/.test(String(a.hero || ''))) return err(400, '22023', 'invalid_hero');
        if (!this.players.has(uid)) {
          const snap = { ...emptySnapshot(), vitalsAt: this.clock };
          this.players.set(uid, { snap: { ...snap, pos: null, safe: null }, hero: a.hero, nickname: null, norm: null, createdAt: this.clock, registeredAt: null, rev: 0, recent: [] });
        }
        return this.reply(200, this.snapshot(uid));
      }
      case 'get_player':
        if (!authed()) return err(403, '28000', 'not_authenticated');
        return this.reply(200, this.snapshot(uid));
      case 'reset_player': {
        if (!authed()) return err(403, '28000', 'not_authenticated');
        const pl = this.players.get(uid);
        const snap = { ...emptySnapshot(), vitalsAt: this.clock };
        // v0.17.0: кошелёк сапфиров «Новая игра» не трогает
        this.players.set(uid, { ...(pl || { nickname: null, norm: null, createdAt: this.clock, registeredAt: null, recent: [] }), snap: { ...snap, pos: null, safe: null, wallet: pl?.snap?.wallet ?? snap.wallet }, hero: a.hero, rev: (pl?.rev || 0) + 1 });
        return this.reply(200, this.snapshot(uid));
      }
      case 'sync_player': {
        if (!authed()) return err(403, '28000', 'not_authenticated');
        const pl = this.players.get(uid);
        if (!pl) return err(404, 'P0002', 'no_player');
        const patch = a.patch;
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return err(400, '22023', 'bad_patch');
        if (typeof patch.id === 'string' && pl.recent.includes(patch.id)) return this.reply(200, this.snapshot(uid));
        if (typeof patch.id === 'string' && patch.id.length >= 8 && patch.id.length <= 64) pl.recent = [...pl.recent, patch.id].slice(-20);
        const base = { ...pl.snap, pos: pl.snap.pos || { x: 0, y: 0 }, safe: pl.snap.safe || { x: 0, y: 0 } };
        const next = applyPatch(base, patch, this.clock);
        pl.snap = { ...next, pos: patch.pos && Number.isFinite(patch.pos.x) && Number.isFinite(patch.pos.y) ? next.pos : pl.snap.pos,
          safe: patch.safe && Number.isFinite(patch.safe.x) && Number.isFinite(patch.safe.y) ? next.safe : pl.snap.safe };
        pl.snap.level = Math.max(pl.snap.level, levelForXp(pl.snap.xp));
        pl.rev++;
        return this.reply(200, this.snapshot(uid));
      }
      case 'player_action': {   // v0.9: лечение / стартовый набор (зеркало player_action)
        if (!authed()) return err(403, '28000', 'not_authenticated');
        const pl = this.players.get(uid);
        if (!pl) return err(404, 'P0002', 'no_player');
        const act = a.action;
        if (!act || typeof act !== 'object' || Array.isArray(act)) return err(400, '22023', 'bad_action');
        if (typeof act.id === 'string' && pl.recent.includes(act.id)) {   // повтор: сохранённый результат первой попытки (v0.10)
          const prev = (pl.recentActions || []).find(e => e.id === act.id);
          return this.reply(200, { ...this.snapshot(uid), action: prev ? { ...prev.result, duplicate: true } : { ok: null, reason: 'duplicate' } });
        }
        if (typeof act.id === 'string' && act.id.length >= 8 && act.id.length <= 64) pl.recent = [...pl.recent, act.id].slice(-20);
        const base = { ...pl.snap, pos: pl.snap.pos || { x: 0, y: 0 }, safe: pl.snap.safe || { x: 0, y: 0 } };
        const { snapshot: next, result } = applyAction(base, act, this.clock);
        pl.snap = { ...next, pos: pl.snap.pos, safe: pl.snap.safe };
        pl.rev++;
        if (typeof act.id === 'string' && act.id.length >= 8 && act.id.length <= 64) pl.recentActions = [...(pl.recentActions || []), { id: act.id, result }].slice(-20);
        this.actionCalls = (this.actionCalls || 0) + 1;
        return this.reply(200, { ...this.snapshot(uid), action: result });
      }
      case 'combat_load': {   // v0.14.0: только Edge Function combat (service_role)
        if (role !== 'service') return err(403, '42501', 'permission denied for function combat_load');
        return this.reply(200, this.snapshot(a.uid));
      }
      case 'combat_apply': {
        if (role !== 'service') return err(403, '42501', 'permission denied for function combat_apply');
        const pl = this.players.get(a.uid);
        if (!pl) return err(404, 'P0002', 'no_player');
        const base = { ...pl.snap, pos: pl.snap.pos || { x: 0, y: 0 }, safe: pl.snap.safe || { x: 0, y: 0 } };
        const { snapshot: next, result } = combatApply(base, a.verdict, this.clock);
        pl.snap = { ...next, pos: pl.snap.pos, safe: pl.snap.safe };
        pl.rev++;
        return this.reply(200, { ...this.snapshot(a.uid), action: result });
      }
      case 'claim_nickname': {
        if (role !== 'service') return err(403, '42501', 'permission denied for function claim_nickname');
        const pl = this.players.get(a.uid);
        if (!/^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/.test(String(a.nick)) || !/^[a-zа-яё0-9_]{3,20}$/.test(String(a.norm))) return err(400, '22023', 'invalid_nickname');
        if (!pl) return err(404, 'P0002', 'no_player');
        if (pl.nickname !== null) return err(400, 'P0001', 'already_registered');
        if ([...this.players.values()].some(x => x.norm === a.norm)) return err(409, '23505', 'duplicate key value violates unique constraint "profiles_nickname_normalized_key"');
        Object.assign(pl, { nickname: a.nick, norm: a.norm, registeredAt: this.clock });
        return this.reply(204);
      }
      case 'release_nickname': {
        if (role !== 'service') return err(403, '42501', 'permission denied');
        const pl = this.players.get(a.uid);
        if (pl) Object.assign(pl, { nickname: null, norm: null, registeredAt: null });
        return this.reply(204);
      }
      default: return err(404, 'PGRST202', 'function not found');
    }
  }

  // ---------------------------------------------------------------- RPC на настоящем Postgres
  rpcPg(fn, a, role, uid) {
    const SIG = {
      nickname_login: ['norm'], nickname_available: ['norm'], create_player: ['hero'], get_player: [], reset_player: ['hero'], sync_player: ['patch'], player_action: ['action'],
      claim_nickname: ['uid', 'nick', 'norm'], release_nickname: ['uid'], combat_load: ['uid'], combat_apply: ['uid', 'verdict'],
    };
    if (!SIG[fn]) return this.reply(404, { code: 'PGRST202', message: 'function not found' });
    const lit = (v) => (v === null || v === undefined ? 'null' : typeof v === 'object' ? `$j$${JSON.stringify(v)}$j$::jsonb` : `$q$${String(v)}$q$`);
    const args = SIG[fn].map(k => `${k} => ${lit(a[k])}`).join(', ');
    const pre = role === 'anon' ? 'set role anon;' : role === 'service' ? 'set role service_role;'
      : `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false) \\g /dev/null`;
    const r = pg(`\\set VERBOSITY verbose\n${pre}\nselect to_jsonb(public.${fn}(${args}));`, true);
    if (r.status !== 0 || /ERROR:/.test(r.stderr)) {
      const m = r.stderr.match(/ERROR:\s+([0-9A-Z]{5}):\s*(.*)/);
      const code = m?.[1] || 'XX000', message = m?.[2] || r.stderr;
      const status = code === '42501' ? 403 : code === '28000' ? 403 : code === '23505' ? 409 : code === 'P0002' ? 404 : 400;
      return this.reply(status, { code, message });
    }
    const out = r.stdout.trim();
    return out ? this.reply(200, JSON.parse(out)) : this.reply(204);
  }
}

/** psql: SQL из stdin; возвращает { status, stdout, stderr } (raw) или бросает при ошибке. */
/** v0.15.0. Выдать прогресс игроку на Postgres напрямую в таблицы (мимо sync_player); форма st — как у FakeSupabase.grant. */
export function grantPg(uid, st) {
  const U = `'${uid}'`, q1 = (x) => String(x).replace(/'/g, "''"), q = [];
  for (const [k, n] of Object.entries(st.inv || {})) q.push(`insert into public.player_inventory (user_id, item_id, quantity) values (${U}, '${q1(k)}', ${n}) on conflict (user_id, item_id) do update set quantity = least(public.player_inventory.quantity + ${n}, 1000000000);`);
  for (const k of st.quests || []) q.push(`insert into public.player_quests (user_id, quest_id) values (${U}, '${q1(k)}') on conflict (user_id, quest_id) do update set status = 'done';`);
  for (const [kind, list] of [['enemy', st.enemies || []], ['path', st.paths || []]]) for (const k of list) q.push(`insert into public.player_world (user_id, kind, key) values (${U}, '${kind}', '${q1(k)}') on conflict do nothing;`);
  for (const [k, v] of Object.entries(st.abilities || {})) q.push(`insert into public.player_abilities (user_id, ability_id, level, unlocked) values (${U}, '${k}', ${v.level}, ${!!v.unlocked}) on conflict (user_id, ability_id) do update set level = greatest(public.player_abilities.level, excluded.level), unlocked = public.player_abilities.unlocked or excluded.unlocked;`);
  if (st.xp) q.push(`update public.player_progress set hero_xp = greatest(hero_xp, ${st.xp}), hero_level = greatest(hero_level, coalesce((select max(level) from public.game_hero_levels where xp <= greatest(hero_xp, ${st.xp})), 1)) where user_id = ${U};`);
  for (const [k, n] of Object.entries(st.school || {})) q.push(`update public.player_progress set school_xp = jsonb_set(school_xp, '{${k}}', to_jsonb(coalesce((school_xp ->> '${k}')::numeric, 0) + ${n})) where user_id = ${U};`);
  if ('research' in st) q.push(`update public.player_progress set research = ${st.research ? `'${q1(JSON.stringify(st.research))}'::jsonb` : 'null'} where user_id = ${U};`);
  if (st.sapphires) q.push(`insert into public.player_wallet (user_id, sapphires) values (${U}, ${st.sapphires}) on conflict (user_id) do update set sapphires = public.player_wallet.sapphires + ${st.sapphires};`);
  for (const [k, v] of Object.entries(st.objects || {})) q.push(v === null ? `delete from public.player_world where user_id = ${U} and kind = 'object' and key = '${q1(k)}';`
    : `insert into public.player_world (user_id, kind, key, data) values (${U}, 'object', '${q1(k)}', '${q1(JSON.stringify(v))}'::jsonb) on conflict (user_id, kind, key) do update set data = excluded.data;`);
  pg(q.join(' '));
}

export function pg(sql, raw = false) {
  const r = spawnSync('psql', ['-X', '-q', '-At'], { input: sql, encoding: 'utf8', env: process.env });
  if (raw) return r;
  if (r.status !== 0 || /ERROR:/.test(r.stderr)) throw new Error('psql: ' + r.stderr);
  return r.stdout;
}

export const KEYS = { ANON, SERVICE };
