// v0.25.0 — Ковены на настоящем Postgres: создание, вступление, роли, чат ковена, недельная цель, материалы и награда (player_action).
// Схема supabase/schema.sql + tools/sql/auth-stub.sql + миграции чата и ковенов (supabase/migrations/2026100{4,7}_*.sql).
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/coven-test.mjs
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
function q(sql, as = null) {
  const pre = as === null ? '' : `set role authenticated; select set_config('request.jwt.claim.sub', '${as}', false) \\g /dev/null\n`;
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: pre + '\n' + sql, encoding: 'utf8', env: process.env });
  return { out: r.stdout.trim(), err: r.stderr.trim() };
}
const J = (r) => { try { return JSON.parse(r.out); } catch { console.log('   ', r.err || r.out); return {}; } };
const cov = (as, op, args = {}) => J(q(`select public.coven_request('${op}', '${JSON.stringify(args).replace(/'/g, "''")}'::jsonb);`, as));
const act = (as, a) => J(q(`select public.player_action('${JSON.stringify({ ...a, id: randomUUID() }).replace(/'/g, "''")}'::jsonb) -> 'action';`, as));
const chat = (as, op, args = {}) => q(`select public.chat_request('${op}', '${JSON.stringify(args)}'::jsonb, '${randomUUID()}'::uuid);`, as);

for (const f of ['supabase/migrations/20261004_game_chat.sql', 'supabase/migrations/20261004_chat_roles_v2.sql', 'supabase/migrations/20261007_covens.sql']) {
  const r = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', f], { encoding: 'utf8', env: process.env });
  if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
}
const U = Object.fromEntries(['lead', 'off', 'mem', 'late', 'guest'].map(n => [n, randomUUID()]));
const SUF = U.lead.slice(0, 6).replace(/[^0-9a-f]/g, '0');
for (const [n, id] of Object.entries(U)) {
  q(`insert into auth.users (id) values ('${id}');`);
  q(`select public.create_player('witch');`, id);
  if (n !== 'guest') q(`select public.claim_nickname('${id}', '${n}_${SUF}', '${n}_${SUF}');`);
  if (n !== 'late') q(`insert into public.player_quests (user_id, quest_id) values ('${id}', 'ch2_coven_ready') on conflict do nothing;`);
  q(`insert into public.player_inventory (user_id, item_id, quantity) values ('${id}', 'ice_crystal', 50), ('${id}', 'frost_herb', 50) on conflict (user_id, item_id) do update set quantity = excluded.quantity;`);
}
const NAME = 'Пепел ' + SUF;

console.log('\nКовены: создание и вступление');
ok(cov(U.late, 'create', { name: 'Рано' }).reason === 'locked', 'до квеста «Не в одиночку» ковен не основать');
ok(cov(U.guest, 'create', { name: 'Гости' }).reason === 'register', 'гостю без ника — сначала аккаунт');
ok(cov(U.lead, 'create', { name: 'x' }).reason === 'bad_name' && cov(U.lead, 'create', { name: '<b>Злой</b>' }).reason === 'bad_name', 'имя: 3–24 буквы, цифры, пробел, _ и -');
const made = cov(U.lead, 'create', { name: NAME, motto: '  Вместе   теплее  ' });
ok(made.ok && made.coven.name === NAME && made.coven.myRole === 'leader' && made.coven.motto === 'Вместе теплее', 'ковен основан: глава, девиз без лишних пробелов');
ok(cov(U.off, 'create', { name: NAME.toUpperCase() }).reason === 'name_taken', 'имя занято (без учёта регистра)');
ok(cov(U.lead, 'create', { name: 'Второй ' + SUF }).reason === 'already', 'в двух ковенах сразу не состоять');
const list = cov(U.off, 'list');
const mine = list.covens?.find(c => c.name === NAME);
ok(list.ok && list.canCreate && mine && mine.members === 1, 'ковен виден в списке');
ok(cov(U.off, 'join', { coven: mine.id }).ok && cov(U.mem, 'join', { coven: mine.id }).ok, 'двое вступили');
ok(cov(U.late, 'join', { coven: mine.id }).reason === 'locked', 'вступить можно после знакомства с Ковенами');
const view = cov(U.lead, 'mine').coven;
ok(view.members.length === 3 && view.members[0].role === 'leader' && view.members.every(m => m.ref && !('user_id' in m)), 'состав: по ссылкам, без id пользователей');

console.log('\nКовены: роли');
const ref = (n) => cov(U.lead, 'mine').coven.members.find(m => m.nickname === `${n}_${SUF}`).ref;
ok(cov(U.off, 'promote', { ref: ref('mem') }).reason === 'forbidden', 'повышать может только глава');
ok(cov(U.lead, 'promote', { ref: ref('off') }).ok && cov(U.lead, 'mine').coven.members.find(m => m.nickname === `off_${SUF}`).role === 'officer', 'глава назначил советника');
ok(cov(U.off, 'kick', { ref: ref('lead') }).reason === 'forbidden', 'советник не исключает главу');
ok(cov(U.lead, 'leave').reason === 'leader', 'глава не уходит, пока в ковене есть другие (сначала передать главенство)');
ok(cov(U.off, 'motto', { motto: 'Иней не пройдёт' }).ok && cov(U.mem, 'mine').coven.motto === 'Иней не пройдёт', 'советник меняет девиз');

console.log('\nКовены: чат ковена');
const roomsOf = (u) => JSON.parse(chat(u, 'bootstrap').out || '{}').rooms || [];
const room = roomsOf(U.mem).find(r => r.kind === 'coven');
ok(room && room.title === NAME, 'у участника — вкладка чата ковена');
ok(!roomsOf(U.late).some(r => r.kind === 'coven'), 'чужим чат ковена не виден');
ok(!chat(U.mem, 'send', { room: room.id, body: 'Привет, ковен!' }).err, 'участник пишет в чат ковена');
ok(/chat_forbidden/.test(chat(U.late, 'send', { room: room.id, body: 'Я тоже' }).err), 'посторонний — нет');

console.log('\nКовены: недельная цель (player_action)');
ok(act(U.late, { op: 'coven_give', item: 'ice_crystal', qty: 1 }).reason === 'no_coven', 'без ковена материалы не сдать');
ok(act(U.mem, { op: 'coven_give', item: 'coins', qty: 1 }).reason === 'unknown' && act(U.mem, { op: 'coven_give', item: 'ice_crystal', qty: 0 }).reason === 'bad', 'монеты не принимаются; количество — от 1');
ok(act(U.mem, { op: 'coven_claim' }).reason === 'progress', 'награда — когда цель недели набрана');
const g1 = act(U.mem, { op: 'coven_give', item: 'ice_crystal', qty: 40 });
ok(g1.ok && g1.points === 200, 'участник внёс 40 кристаллов — 200 очков');
ok(J(q(`select public.get_player();`, U.mem)).inventory.ice_crystal === 10, 'кристаллы ушли из сумки');
ok(act(U.lead, { op: 'coven_give', item: 'frost_herb', qty: 50 }).ok && act(U.off, { op: 'coven_give', item: 'frost_herb', qty: 50 }).ok, 'глава и советник — по 100 очков');
ok(cov(U.mem, 'mine').coven.points === 400, 'цель недели набрана: 400 очков');
const coins0 = J(q(`select public.get_player();`, U.mem)).inventory.coins || 0;
ok(act(U.mem, { op: 'coven_claim' }).ok && (J(q(`select public.get_player();`, U.mem)).inventory.coins || 0) === coins0 + 120, 'награда недели: монеты и материалы');
ok(act(U.mem, { op: 'coven_claim' }).reason === 'already', 'один раз за неделю');
cov(U.lead, 'kick', { ref: ref('off') });
q(`update public.coven_members set week_given = 5 where user_id = '${U.mem}';`);
ok(cov(U.mem, 'mine').coven.members.length === 2 && !roomsOf(U.off).some(r => r.kind === 'coven'), 'исключённый уходит и из чата ковена');
// новая неделя: очки и вклады обнуляются
q(`update public.covens set week_start = week_start - 7 where name = '${NAME}'; update public.coven_members set week_start = week_start - 7;`);
ok(cov(U.lead, 'mine').coven.points === 0 && cov(U.lead, 'mine').coven.myGiven === 0, 'новая неделя — очки и вклады с нуля');

console.log('\nКовены: передача главенства и распад');
ok(cov(U.lead, 'transfer', { ref: ref('mem') }).ok && cov(U.mem, 'mine').coven.myRole === 'leader' && cov(U.lead, 'mine').coven.myRole === 'officer', 'главенство передано, прежний глава — советник');
ok(cov(U.lead, 'leave').ok && cov(U.mem, 'leave').ok, 'все вышли');
ok(!cov(U.mem, 'list').covens.some(c => c.name === NAME) && !J(q(`select count(*) from game_chat.rooms where title = '${NAME}';`)) , 'пустой ковен распущен вместе с чатом');
ok(/permission denied/.test(q(`select * from public.covens;`, U.mem).err), 'таблицы ковенов напрямую клиенту недоступны');

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Ковены: всё в порядке');
process.exit(failures ? 1 : 0);
