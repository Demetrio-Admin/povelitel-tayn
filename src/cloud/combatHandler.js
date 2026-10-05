// v0.14.0 — обработчик Edge Function «combat»: проверяет запись боя и применяет итог. Без Phaser; в Supabase попадает одним файлом
// (node tools/build-combat-function.mjs → supabase/functions/combat/index.ts), в тестах импортируется напрямую.
//
// Порядок: 1) по токену игрока узнаём user_id; 2) RPC combat_load (service_role) — состояние игрока и запомненное в начале боя;
// 3) verifyCombat проигрывает запись тем же движком; 4) RPC combat_apply (service_role) атомарно записывает итог; 5) ответ — снимок игрока
// с action = { ok, outcome, verdict } (формат тот же, что у player_action: клиент принимает его как обычный ответ действия).
import { verifyCombat } from './combatVerify.js';
import { fillDefaults } from './playerModel.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status, code) => json(status, { error_code: code });

/** Размер запроса: запись боя в 15 минут — до ~2000 действий, это десятки КБ. */
const MAX_BODY = 256 * 1024;

/**
 * @param req   Request (POST { log })
 * @param env   { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }
 * @param fetchFn fetch (в тестах подменяется)
 * @param now   () => мс — время сервера
 */
export async function handle(req, env, fetchFn = fetch, now = Date.now) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return fail(500, 'not_configured');
  // ключ service_role: старый формат — JWT (нужен и в Authorization), новый sb_secret_… — только в apikey
  const admin = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) admin.Authorization = `Bearer ${key}`;

  let body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return fail(413, 'too_large');
    body = JSON.parse(text);
  } catch { return fail(400, 'bad_request'); }
  if (!body || typeof body !== 'object') return fail(400, 'bad_request');

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'unauthorized');
  const who = await fetchFn(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!who.ok) return fail(401, 'unauthorized');
  const user = await who.json();
  if (!user?.id) return fail(401, 'unauthorized');

  const rpc = (name, args) => fetchFn(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: admin, body: JSON.stringify(args) });

  const loaded = await rpc('combat_load', { uid: user.id });
  if (!loaded.ok) return fail(loaded.status === 404 ? 404 : 500, loaded.status === 404 ? 'not_deployed' : 'server_error');
  const raw = await loaded.json();
  if (!raw) return fail(409, 'no_player');
  const { snapshot, meta } = fillDefaults(raw);

  const t = now();
  const v = verifyCombat(snapshot, body.log, t);
  if (!v.ok) return json(200, { ...raw, action: { ok: false, reason: v.reason } });

  const applied = await rpc('combat_apply', { uid: user.id, verdict: v.verdict });
  if (!applied.ok) return fail(500, 'server_error');
  const res = await applied.json();
  return json(200, { ...res, action: { ...(res.action || {}), verdict: v.verdict }, meta: res.meta ?? meta });
}

// В Supabase (Deno) — запускаем сервер; при импорте в тестах (Node) этот блок не выполняется.
const D = globalThis.Deno;
if (D?.serve) {
  D.serve((req) => handle(req, {
    SUPABASE_URL: D.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: D.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  }));
}
