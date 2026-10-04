// Телеметрия на настоящем Postgres: миграция supabase/migrations/20261005_telemetry.sql поверх схемы и заглушки auth.
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/telemetry-test.mjs
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
function q(sql, as = null) {
  const pre = as === null ? '' : as === 'anon' ? 'set role anon;' : `set role authenticated; select set_config('request.jwt.claim.sub', '${as}', false) \\g /dev/null\n`;
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: pre + '\n' + sql, encoding: 'utf8', env: process.env });
  return { out: r.stdout.trim(), err: r.stderr.trim() };
}
const file = (p) => spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', p], { encoding: 'utf8', env: process.env });
const denied = (r) => /permission denied|violates row-level security|not_authenticated/.test(r.err);
const log = (uid, session, events) => q(`select public.telemetry_log('${session}', '${JSON.stringify(events).replace(/'/g, "''")}'::jsonb);`, uid);

console.log('\nБаза: телеметрия');
ok(file('tools/sql/auth-stub.sql').status === 0, 'заглушка Supabase Auth');
const m1 = file('supabase/migrations/20261005_telemetry.sql'), m2 = file('supabase/migrations/20261005_telemetry.sql');
ok(m1.status === 0 && m2.status === 0, 'миграция применяется и повторно' + (m1.status ? ': ' + m1.stderr.slice(0, 300) : ''));

const A = randomUUID(), B = randomUUID(), S = 'abcdef0123456789';
q(`insert into auth.users (id) values ('${A}'), ('${B}');`);
const count = (uid) => Number(q(`select count(*) from public.telemetry_events where user_id = '${uid}';`).out);

ok(denied(q(`select public.telemetry_log('${S}', '[]'::jsonb);`, 'anon')), 'без входа телеметрию не принять');

const r1 = log(A, S, [{ n: 'session_start', t: 0, d: { v: '0.10.2', hero: 'witch' } }, { n: 'ev', t: 12345, d: { k: 'intro' } }, { n: 'combat_end', t: 99000, d: { result: 'defeat', sec: 41.5 } }]);
ok(r1.out === '3' && count(A) === 3, 'пачка из трёх событий записана на вход игрока');
ok(q(`select data ->> 'k' from public.telemetry_events where user_id = '${A}' and name = 'ev';`).out === 'intro' && q(`select t_ms from public.telemetry_events where name = 'combat_end';`).out === '99000', 'имя, время и данные сохранены');

console.log('\nБаза: отказы телеметрии');
ok(log(A, S, [{ n: 'Bad Name', t: 1, d: {} }, { n: 'x'.repeat(41), t: 1, d: {} }, { n: 'ok', t: -5, d: {} }, { n: 'ok2', t: 'abc', d: {} }, 'junk', { n: 'ok3', t: 5, d: [1, 2] }]).out === '1', 'плохие имена, отрицательное и нечисловое время, мусор отбрасываются; массив вместо данных становится {}');
ok(q(`select data::text from public.telemetry_events where name = 'ok3';`).out === '{}', 'данные не-объектом заменены на {}');
ok(log(A, S, [{ n: 'big', t: 1, d: { x: 'y'.repeat(700) } }]).out === '1' && q(`select data::text from public.telemetry_events where name = 'big';`).out === '{}', 'слишком большие данные заменяются на {}');
ok(log(A, 'BAD SESSION', [{ n: 'a', t: 1, d: {} }]).out === '0', 'неверный id сессии — ничего не записано');
ok(log(A, S, Array.from({ length: 101 }, () => ({ n: 'a', t: 1, d: {} }))).out === '0', 'больше 100 событий за раз — отказ без ошибки');
ok(q(`select public.telemetry_log('${S}', '{"a":1}'::jsonb);`, A).out === '0', 'не массив — отказ без ошибки');

console.log('\nБаза: права');
ok(denied(q(`select * from public.telemetry_events;`, A)), 'игрок не читает таблицу телеметрии');
ok(denied(q(`insert into public.telemetry_events (user_id, session_id, t_ms, name) values ('${A}', '${S}', 1, 'x');`, A)), 'игрок не пишет в таблицу напрямую');
ok(denied(q(`delete from public.telemetry_events;`, A)), 'игрок не удаляет события');
ok(count(B) === 0, 'чужие события игроку B не видны (ни одного своего)');

console.log('\nБаза: суточный потолок');
q(`insert into public.telemetry_events (user_id, session_id, t_ms, name) select '${B}', '${S}', 1, 'bulk' from generate_series(1, 6000);`);
ok(log(B, S, [{ n: 'late', t: 1, d: {} }]).out === '0' && count(B) === 6000, 'после 6000 событий за сутки новые не принимаются');
q(`update public.telemetry_events set created_at = now() - interval '2 days' where user_id = '${B}';`);
ok(log(B, S, [{ n: 'fresh', t: 1, d: {} }]).out === '1', 'на следующие сутки приём снова работает');

if (failures) { console.log(`\n${failures} проверок не прошли`); process.exit(1); }
console.log('\nБаза телеметрии: всё в порядке');
