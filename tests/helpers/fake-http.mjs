// Фальшивый Supabase по HTTP (с CORS, как настоящий) — для проверок настоящей игры в браузере.
// backend 'pg' — настоящие SQL-функции и права supabase/schema.sql на Postgres (PGHOST/PGPORT/PGUSER/PGDATABASE).
// Игра для таких проверок собирается с VITE_SUPABASE_URL=http://127.0.0.1:<port> и VITE_SUPABASE_ANON_KEY=anon-key.
import http from 'http';
import { FakeSupabase } from './fake-supabase.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };

export async function startFakeHttp({ backend = 'model', port = 8174, delayMs = 0 } = {}) {
  const srv = new FakeSupabase({ backend, url: `http://127.0.0.1:${port}` });
  srv.delayMs = delayMs;
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks).toString() : undefined;
    srv.clock = Math.max(srv.clock, Date.now());   // v0.12.0: по HTTP время сервера идёт как настоящее (HP и мана восстанавливаются по нему)
    try {
      const r = await srv.fetch(srv.url + req.url, { method: req.method, headers: req.headers, body });
      const text = await r.text();
      res.writeHead(r.status, { ...CORS, 'Content-Type': 'application/json' }); res.end(text);
    } catch (e) { res.destroy(); }
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return { srv, close: () => new Promise(r => server.close(r)) };
}
