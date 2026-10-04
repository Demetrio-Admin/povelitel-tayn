// Обновление схемы v0.8.2 → v0.9 на базе с живыми персонажами (настоящий Postgres).
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/migration-test.mjs
// Создаёт отдельную базу witch_migration_test, ставит схему из backup-ветки (до v0.9), заводит персонажа с прогрессом,
// затем запускает текущий supabase/schema.sql (дважды) и проверяет, что прогресс цел, а мана появилась как «полная».
import { execFileSync, spawnSync } from 'child_process';
import { randomUUID } from 'crypto';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const DB = 'witch_migration_test';
const env = { ...process.env, PGDATABASE: DB };
const OLD_REF = process.env.OLD_SCHEMA_REF || 'origin/backup/v0.8.2-before-v0.9.0';

const admin = (sql) => spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', sql], { encoding: 'utf8', env: process.env });
function run(sql, as = null) {
  const pre = as ? `set role authenticated; select set_config('request.jwt.claim.sub', '${as}', false) \\g /dev/null\n` : '';
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: pre + sql, encoding: 'utf8', env });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
const file = (path) => spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', path], { encoding: 'utf8', env });

admin(`drop database if exists ${DB}`);
admin(`create database ${DB}`);
console.log('\nМиграция схемы v0.8.2 → v0.9');
const oldSchema = execFileSync('git', ['show', `${OLD_REF}:supabase/schema.sql`], { encoding: 'utf8' });
ok(file('tools/sql/auth-stub.sql').status === 0, 'заглушка Supabase Auth');
const r0 = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: oldSchema, encoding: 'utf8', env });
ok(r0.status === 0 && !/mana/.test(run(`select string_agg(column_name, ',') from information_schema.columns where table_name = 'player_progress'`)), `старая схема (${OLD_REF}) без маны`);

const uid = randomUUID();
run(`insert into auth.users (id) values ('${uid}');`);
run(`select public.create_player('witch');`, uid);
run(`select public.sync_player('{"xp":160,"inv":{"coins":30,"elixir_life":2},"quests":["unlock_telekinesis_1","first_world_interaction"],"hp":{"value":55.5},"tutorial":["move"],"objects":{"glade_rock":{"state":"moved","x":1,"y":2}}}'::jsonb);`, uid);
const before = JSON.parse(run(`select public.get_player();`, uid));

const r1 = file('supabase/schema.sql'), r2 = file('supabase/schema.sql');
ok(r1.status === 0 && r2.status === 0, 'новая схема применяется поверх старой и повторно (скрипт идемпотентен)' + (r1.status ? ': ' + r1.stderr.slice(0, 300) : ''));
const after = JSON.parse(run(`select public.get_player();`, uid));
ok(after.level === before.level && after.xp === 160 && after.inventory.coins === 30 && after.inventory.elixir_life === 2, 'уровень, опыт, монеты и предметы сохранены');
ok(after.quests.includes('unlock_telekinesis_1') && after.tutorial.includes('move') && after.objects.glade_rock?.state === 'moved', 'события, подсказки и мир сохранены');
ok(Math.abs(after.hp - 55.5) < 1 && after.mana === 110 && after.combatSince === null, 'v0.12.0: HP сохранено (55,5), мана отсутствовала → полный запас уровня (110); восстановление считается с момента миграции');
const s3 = JSON.parse(run(`select public.sync_player('{"mana_spent":110}'::jsonb);`, uid));
ok(s3.mana < 1, 'после миграции мана тратится через mana_spent (до 0)');
file('supabase/schema.sql');
const s4 = JSON.parse(run(`select public.get_player();`, uid));
ok(s4.mana < 10 && s4.hp > 55 && s4.hp < 80, 'повторный запуск схемы не сбрасывает запасы');
const heal = JSON.parse(run(`select public.player_action('{"op":"heal","id":"migration-heal-1"}'::jsonb);`, uid));
ok(heal.action.ok && heal.hp === 132 && heal.inventory.coins === 22, 'player_action после миграции: лечение 77 HP за 8 монет (уровень 3)');
admin(`drop database if exists ${DB}`);
console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Миграция проверена');
process.exit(failures ? 1 : 0);
