// Edge Function «account»: гость получает ник и пароль, не теряя персонажа.
//
// Зачем нужна: Supabase Auth разрешает пароль только пользователю с подтверждённой почтой или телефоном,
// а по ТЗ игра почту не спрашивает. Функция работает на сервере с ключом service_role (в браузер он не попадает):
//   1) по токену игрока узнаёт его user_id (это гость, у которого уже есть персонаж);
//   2) записывает ник в профиль — уникальность гарантирует индекс базы (claim_nickname);
//   3) выдаёт этому же пользователю служебный адрес u<sha256(ник)>@<LOGIN_EMAIL_DOMAIN> и пароль, сразу подтверждённые.
// Пароль хранит Supabase Auth (bcrypt). Ник не меняет user_id, поэтому весь прогресс остаётся на месте.
//
// Развёртывание: Supabase → Edge Functions → Deploy a new function → имя «account» → вставить этот файл → Deploy.
// Переменные SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам. LOGIN_EMAIL_DOMAIN — необязательно,
// но если меняете, поменяйте и VITE_LOGIN_EMAIL_DOMAIN в сборке игры: вход по нику считает тот же адрес.
//
// Правила ника те же, что в src/cloud/nickname.js (совпадение проверяет tests/session-test.js).

export const DEFAULT_LOGIN_DOMAIN = 'players.witch-rpg.invalid';
const NICK_MIN = 3, NICK_MAX = 20, PASSWORD_MIN = 8, PASSWORD_MAX_BYTES = 72;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function checkNickname(raw: unknown): { ok: boolean; value: string; norm: string; code?: string } {
  const value = String(raw ?? '').trim();
  const norm = value.toLowerCase();
  const bad = (code: string) => ({ ok: false, value, norm, code });
  if (value.length < NICK_MIN || value.length > NICK_MAX) return bad('invalid_nickname');
  if (!/^[A-Za-zА-Яа-яЁё0-9_]+$/.test(value)) return bad('invalid_nickname');
  const latin = /[A-Za-z]/.test(value), cyr = /[А-Яа-яЁё]/.test(value);
  if ((latin && cyr) || (!latin && !cyr)) return bad('invalid_nickname');
  return { ok: true, value, norm };
}

export function checkPassword(raw: unknown): boolean {
  const s = String(raw ?? '');
  return s.length >= PASSWORD_MIN && new TextEncoder().encode(s).length <= PASSWORD_MAX_BYTES;
}

export async function loginEmail(norm: string, domain: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `u${hex.slice(0, 40)}@${domain}`;
}

type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; LOGIN_EMAIL_DOMAIN?: string };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string) => json(status, { error_code: code });

/** Обработчик запроса. env и fetch передаются явно — так функцию можно проверить вне Deno. */
export async function handle(req: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return fail(500, 'not_configured');
  const domain = env.LOGIN_EMAIL_DOMAIN || DEFAULT_LOGIN_DOMAIN;
  // ключ service_role: старый формат — JWT (нужен и в Authorization), новый sb_secret_… — только в apikey
  const admin: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) admin.Authorization = `Bearer ${key}`;

  let body: any;
  try { body = await req.json(); } catch { return fail(400, 'bad_request'); }
  if (body?.action !== 'register') return fail(400, 'bad_request');

  // 1. кто спрашивает
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'unauthorized');
  const who = await fetchFn(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!who.ok) return fail(401, 'unauthorized');
  const user = await who.json();
  if (!user?.id) return fail(401, 'unauthorized');
  if (user.email) return fail(409, 'already_registered');

  // 2. проверка полей (клиент проверяет то же самое, но верить ему нельзя)
  const nick = checkNickname(body.nickname);
  if (!nick.ok) return fail(400, 'invalid_nickname');
  if (!checkPassword(body.password)) return fail(400, 'weak_password');

  // 3. ник в профиль: уникальность гарантирует индекс по нормализованному нику
  const claim = await fetchFn(`${base}/rest/v1/rpc/claim_nickname`, {
    method: 'POST', headers: admin, body: JSON.stringify({ uid: user.id, nick: nick.value, norm: nick.norm }),
  });
  if (!claim.ok) {
    const e = await claim.json().catch(() => ({}));
    const msg = String(e?.message || '');
    if (e?.code === '23505') return fail(409, 'nickname_taken');
    if (msg.includes('already_registered')) return fail(409, 'already_registered');
    if (msg.includes('invalid_nickname')) return fail(400, 'invalid_nickname');
    if (msg.includes('no_player')) return fail(409, 'no_player');
    return fail(500, 'server_error');
  }

  // 4. тому же пользователю — служебный адрес и пароль, сразу подтверждённые (писем нет)
  const email = await loginEmail(nick.norm, domain);
  const upd = await fetchFn(`${base}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT', headers: admin,
    body: JSON.stringify({ email, password: String(body.password), email_confirm: true, user_metadata: { nickname: nick.value } }),
  });
  if (!upd.ok) {
    // откат: ник снова свободен, игрок остаётся гостем
    await fetchFn(`${base}/rest/v1/rpc/release_nickname`, { method: 'POST', headers: admin, body: JSON.stringify({ uid: user.id }) }).catch(() => {});
    const e = await upd.json().catch(() => ({}));
    const code = String(e?.error_code || e?.code || '');
    if (code === 'email_exists' || code === 'user_already_exists') return fail(409, 'nickname_taken');
    if (code === 'weak_password') return fail(400, 'weak_password');
    return fail(500, 'server_error');
  }
  return json(200, { ok: true, nickname: nick.value });
}

// В Supabase (Deno) — запускаем сервер; при импорте в тестах (Node) этот блок не выполняется.
const D = (globalThis as any).Deno;
if (D?.serve) {
  D.serve((req: Request) => handle(req, {
    SUPABASE_URL: D.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: D.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    LOGIN_EMAIL_DOMAIN: D.env.get('LOGIN_EMAIL_DOMAIN'),
  }));
}
