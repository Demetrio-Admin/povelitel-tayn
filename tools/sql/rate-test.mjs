// v0.32.0 — курс 1 ₽ = 10 сапфиров на настоящем Postgres: накопленный баланс кошелька умножается на 10 ровно один раз при применении
// схемы (отметка rate_ver), в журнале остаётся запись rate10; новые кошельки (rate_ver = 1) не трогаются; повторный запуск схемы безопасен;
// награда за поручение доски — 3 сапфира, один раз за поручение и сутки.
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/rate-test.mjs
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { DAILY, DAILY_POOL } from '../../src/config/daily.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
function psql(input) {
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', env: process.env });
  return { out: r.stdout.trim(), err: r.stderr.trim(), code: r.status };
}
const q = (sql) => psql(sql);
const bal = (u) => Number(q(`select coalesce((select sapphires from public.player_wallet where user_id = '${u}'), 0);`).out);
const applySchema = () => psql(`\\i supabase/schema.sql`);

const OLD = randomUUID(), NEW = randomUUID(), ZERO = randomUUID();
for (const u of [OLD, NEW, ZERO]) q(`insert into auth.users (id) values ('${u}');`);
// старый кошелёк (метки курса нет), новый кошелёк (метка 1) и пустой старый
q(`insert into public.player_wallet (user_id, sapphires, rate_ver) values ('${OLD}', 7, null), ('${NEW}', 5, 1), ('${ZERO}', 0, null);`);

console.log('\nКурс 1:10: миграция кошельков');
{
  const r1 = applySchema();
  ok(r1.code === 0, `схема применилась без ошибок ${r1.err.split('\n').filter((l) => /ERROR/.test(l)).join(' ')}`);
  ok(bal(OLD) === 70, 'старый кошелёк: 7 → 70');
  ok(bal(NEW) === 5, 'кошелёк нового курса не умножается');
  ok(bal(ZERO) === 0 && q(`select rate_ver from public.player_wallet where user_id = '${ZERO}';`).out === '1', 'пустой кошелёк помечен, баланс 0');
  const led = q(`select delta || ':' || balance || ':' || kind || ':' || ref from public.sapphire_ledger where user_id = '${OLD}';`).out;
  ok(led === '63:70:admin:rate10', `в журнале запись о переходе (${led})`);
  ok(q(`select count(*) from public.sapphire_ledger where user_id in ('${NEW}', '${ZERO}');`).out === '0', 'новым и пустым кошелькам журнал не пишется');
  applySchema(); applySchema();
  ok(bal(OLD) === 70 && bal(NEW) === 5, 'повторные запуски схемы баланс не меняют');
  ok(q(`select count(*) from public.sapphire_ledger where user_id = '${OLD}' and ref = 'rate10';`).out === '1', 'запись rate10 одна');
  // кошелёк, созданный после перехода, получает метку нового курса сам
  const FRESH = randomUUID(); q(`insert into auth.users (id) values ('${FRESH}');`); q(`select set_config('request.jwt.claim.sub', '${FRESH}', false); select public.create_player('witch');`);
  q(`select public.admin_grant_sapphires('${FRESH}', 100, 'тест', 'rate-fresh-1');`);
  ok(q(`select rate_ver from public.player_wallet where user_id = '${FRESH}';`).out === '1', 'новый кошелёк сразу помечен курсом 1');
  applySchema(); ok(bal(FRESH) === 100, 'и повторная схема его не умножает');
}

console.log('\nПоручения доски: 3 сапфира');
{
  const rules = JSON.parse(q(`select public._game_rules() -> 'daily' -> 'pool';`).out);
  ok(Object.keys(DAILY_POOL).every((id) => rules[id]?.reward?.sapphires === DAILY.sapphires && DAILY.sapphires === 3), 'у каждого поручения на сервере награда 3 сапфира');
}

if (failures) { console.log(`\n✗ ПРОВАЛЕНО: ${failures}`); process.exit(1); }
console.log('\n✓ Проверка курса пройдена');
