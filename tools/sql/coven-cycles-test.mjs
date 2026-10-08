// v0.33.0 — Ковены: цикл 3 дня, лестница цели ±200, пятёрка лучших и пул сапфиров — на настоящем Postgres.
// Схема supabase/schema.sql + tools/sql/auth-stub.sql + миграции чата и ковенов (supabase/migrations/2026100{4,7,8}_*.sql).
// Конец цикла имитируем сдвигом начала цикла назад (week_start − 3 суток): итог фиксируется при первом обращении к ковену.
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/coven-cycles-test.mjs
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { COVENS, covenCycleStartDay, covenGoalAfter, covenMinGiven, covenPool, covenShares, covenRewardFor, covenRules } from '../../src/config/covens.js';

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
const me = (u) => J(q(`select public.get_player();`, u));
const sap = (u) => Number(me(u).wallet.sapphires);
const give = (u, pts) => { let n = Math.floor(pts / 5); const r = pts - n * 5; while (n > 0) { const k = Math.min(n, COVENS.maxGive); act(u, { op: 'coven_give', item: 'ice_crystal', qty: k }); n -= k; } if (r) act(u, { op: 'coven_give', item: 'moon_herb', qty: r }); };   // за один раз — не больше maxGive
// конец цикла (или нескольких): сдвиг начала цикла назад
// (история итогов и выплат тоже отодвигается: в жизни циклы идут один за другим и ключи не совпадают)
const endCycle = (name, n = 1) => q(`update public.coven_cycle_results set cycle_start = cycle_start - ${3 * n} where coven_id = (select id from public.covens where name = '${name}'); update public.coven_payouts set cycle_start = cycle_start - ${3 * n} where coven_id = (select id from public.covens where name = '${name}'); update public.covens set week_start = week_start - ${3 * n} where name = '${name}'; update public.coven_members set week_start = week_start - ${3 * n} where coven_id = (select id from public.covens where name = '${name}');`);
const setGoal = (name, goal) => q(`update public.covens set goal = ${goal} where name = '${name}';`);

for (const f of ['supabase/migrations/20261004_game_chat.sql', 'supabase/migrations/20261004_chat_roles_v2.sql', 'supabase/migrations/20261007_covens.sql', 'supabase/migrations/20261008_coven_cycles.sql']) {
  const r = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', f], { encoding: 'utf8', env: process.env });
  if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
}
const N = ['a', 'b', 'c', 'd', 'e', 'f', 'out'];
const U = Object.fromEntries(N.map((n) => [n, randomUUID()]));
const SUF = U.a.slice(0, 6).replace(/[^0-9a-f]/g, '0');
for (const [n, id] of Object.entries(U)) {
  q(`insert into auth.users (id) values ('${id}');`);
  q(`select public.create_player('witch');`, id);
  q(`select public.claim_nickname('${id}', '${n}_${SUF}', '${n}_${SUF}');`);
  q(`insert into public.player_quests (user_id, quest_id) values ('${id}', 'ch2_coven_ready') on conflict do nothing;`);
  q(`insert into public.player_inventory (user_id, item_id, quantity) values ('${id}', 'ice_crystal', 400), ('${id}', 'moon_herb', 400) on conflict (user_id, item_id) do update set quantity = excluded.quantity;`);
}
const NAME = 'Лестница ' + SUF;
const made = cov(U.a, 'create', { name: NAME });
const cid = made.coven.id;
for (const n of ['b', 'c', 'd', 'e', 'f']) cov(U[n], 'join', { coven: cid });

console.log('\nЦикл: границы и правила совпадают с конфигом');
{
  const day = Number(q(`select (public._coven_week() - date '1970-01-01')::int;`).out);
  ok(day === covenCycleStartDay(Date.now()) && (day - COVENS.cycle.startDay) % COVENS.cycle.days === 0, `начало цикла на сервере (${day}) = расчёт клиента`);
  const v = cov(U.a, 'mine').coven;
  ok(v.goal === 400 && v.minGiven === covenMinGiven(400) && v.pool === covenPool(400) && JSON.stringify(v.shares) === JSON.stringify(covenShares(covenPool(400))), 'цель 400: минимум вклада, пул и доли — как в конфиге');
  ok(v.goalUp === covenGoalAfter(400, true) && v.goalDown === covenGoalAfter(400, false) && v.cycleDays === 3, 'следующая цель: 600 вверх, 400 вниз');
  const ends = new Date(v.cycleEnds).getTime();
  ok(ends > Date.now() && ends - Date.now() <= 3 * 86_400_000 && ends % 86_400_000 === 0, 'конец цикла — полночь UTC, не позже чем через 3 суток');
  const rules = J(q(`select public._game_rules() -> 'covens';`));
  const sortKeys = (o) => (o && typeof o === 'object' ? (Array.isArray(o) ? o.map(sortKeys) : Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]))) : o);
  ok(JSON.stringify(sortKeys(rules)) === JSON.stringify(sortKeys(covenRules())), 'правила ковенов на сервере совпадают с конфигом');
}

console.log('\nЦикл 1: цель выполнена — пятёрка и пул');
{
  // вклады: a 200, b 100, c 60, d 30, e 15 (меньше минимума 20), f 0 → всего 405
  for (const [n, p] of [['a', 200], ['b', 100], ['c', 60], ['d', 30], ['e', 15]]) give(U[n], p);
  const v = cov(U.a, 'mine').coven;
  ok(v.points === 405 && v.myGiven === 200 && v.myRank === 1, 'очки 405, у главы первое место');
  ok(v.members.find((m) => m.nickname === `e_${SUF}`).qualified === false && v.members.find((m) => m.nickname === `d_${SUF}`).qualified === true, 'вклад меньше минимума — не в пятёрке');
  const coins0 = me(U.b).inventory.coins || 0;
  const cl = act(U.b, { op: 'coven_claim' });
  ok(cl.ok && (me(U.b).inventory.coins || 0) === coins0 + covenRewardFor(400).coins, 'обычная награда цикла — сразу, 50 монет при цели 400');
  ok(act(U.e, { op: 'coven_claim' }).reason === 'given', 'у кого вклад меньше минимума — обычной награды нет');
  ok(act(U.a, { op: 'coven_payout' }).reason === 'none', 'пока цикл идёт, сапфиров пятёрке нет');
  // цикл закончился → итог
  endCycle(NAME);
  const w = cov(U.f, 'mine').coven;
  ok(w.goal === 600 && w.points === 0 && w.myGiven === 0 && w.last?.success === true && w.last.goal === 400 && w.last.points === 405 && w.last.pool === 40, 'итог: цель выросла до 600, очки с нуля, прошлый цикл — выполнен, пул 40');
  ok(!w.payouts.length && cov(U.a, 'mine').coven.payouts.length === 1, 'у не попавшего в пятёрку выплат нет; у главы — одна');
  const rows = J(q(`select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'rank', rank, 'amount', amount) order by rank), '[]') from public.coven_payouts where coven_id = '${cid}';`));
  ok(rows.map((r) => r.amount).join() === '12,10,8,6' && rows.map((r) => r.rank).join() === '1,2,3,4' && rows[0].u === U.a, 'пятёрка: 12 / 10 / 8 / 6 (четверо набрали минимум; пятого места нет, 4 сапфира не раздаются)');
  const s0 = sap(U.a);
  const p1 = act(U.a, { op: 'coven_payout' });
  ok(p1.ok && p1.amount === 12 && sap(U.a) === s0 + 12, 'глава забрал 12 сапфиров');
  ok(act(U.a, { op: 'coven_payout' }).reason === 'none' && sap(U.a) === s0 + 12, 'второй раз — ничего');
  ok(act(U.e, { op: 'coven_payout' }).reason === 'none' && act(U.out, { op: 'coven_payout' }).reason === 'no_coven', 'без места — «none», без ковена — «no_coven»');
  ok(q(`select count(*) from public.sapphire_ledger where user_id = '${U.a}' and ref like 'coven:%';`).out === '1', 'в журнале сапфиров одна запись с ключом цикла');
}

console.log('\nЦикл 2: цель 600 не выполнена — откат');
{
  give(U.a, 100);
  endCycle(NAME);
  const w = cov(U.a, 'mine').coven;
  ok(w.goal === 400 && w.last?.success === false && w.last.goal === 600 && w.last.points === 100 && w.last.pool === 0, 'провал: цель вернулась к 400, пула нет');
  ok(J(q(`select count(*) from public.coven_payouts where coven_id = '${cid}' and cycle_start = '${w.last.cycleStart}';`)) === 0, 'за проваленный цикл выплат нет');
}

console.log('\nПропущенные циклы');
{
  setGoal(NAME, 1000);
  endCycle(NAME, 3);   // три цикла подряд без единого очка: первый — итог (провал, 800), ещё два пропущены (−400)
  ok(cov(U.a, 'mine').coven.goal === 400, '1000 → 800 за невыполненный и ещё −400 за два пропущенных цикла = 400 (не ниже базовой)');
  setGoal(NAME, 600);
  endCycle(NAME, 10);
  ok(cov(U.a, 'mine').coven.goal === 400, 'долгое молчание ковена не уводит цель ниже 400');
}

console.log('\nПотолок цели и минимум вклада при высокой цели');
{
  setGoal(NAME, 1500);
  for (const [n, p] of [['a', 400], ['b', 400], ['c', 300], ['d', 200], ['e', 120], ['f', 70]]) give(U[n], p);   // 1490 + 10 ниже потолка… добираем до 1500
  give(U.a, 10);
  const v = cov(U.a, 'mine').coven;
  ok(v.points === 1500 && v.minGiven === 75 && v.pool === 150 && v.shares.join() === covenShares(150).join(), 'цель 1500: минимум 75 очков, пул 150, доли 45/37/30/22/15');
  endCycle(NAME);
  const w = cov(U.a, 'mine').coven;
  ok(w.goal === 1500 && w.last.success === true && w.last.pool === 150, 'потолок: после выполненной 1500 цель остаётся 1500');
  const rows = J(q(`select coalesce(jsonb_agg(amount order by rank), '[]') from public.coven_payouts where coven_id = '${cid}' and cycle_start = '${w.last.cycleStart}';`));
  ok(rows.join() === '45,37,30,22,15' || rows.join() === covenShares(150).join(), `пятёрка получила ${rows.join('/')}: f (70 очков < 75) в неё не попал, пятое место — e`);
}

console.log('\nЧестность: состав не меняют до итога');
{
  setGoal(NAME, 400);
  for (const [n, p] of [['a', 150], ['b', 150], ['c', 120]]) give(U[n], p);
  endCycle(NAME);
  // глава исключает лучшего уже после конца цикла, но до чьего-либо обращения к ковену: итог фиксируется раньше
  const refB = cov(U.a, 'mine').coven.members.find((m) => m.nickname === `b_${SUF}`).ref;
  const last = cov(U.a, 'mine').coven.last;
  ok(last.success === true, 'итог зафиксирован с составом на конец цикла');
  // payouts за прошлый цикл остались и у исключённого (его вклад был честным)
  cov(U.a, 'kick', { ref: refB });
  const b = act(U.b, { op: 'coven_payout' });
  ok(b.ok && b.amount > 0, 'исключённый после итога всё равно забирает свою часть');
}

console.log('\nСрок получения сапфиров');
{
  q(`update public.coven_payouts set cycle_start = cycle_start - 30 where user_id = '${U.a}' and claimed_at is null;`);
  ok(act(U.a, { op: 'coven_payout' }).reason === 'none', 'невостребованное старше срока (14 суток после цикла) сгорает');
}

console.log('\nНаграда за цикл растёт вместе с целью');
{
  const lead = cov(U.c, 'mine').coven;
  setGoal(NAME, 600);
  q(`update public.coven_members set claimed_week = null where coven_id = '${cid}';`);
  const need = 600 - cov(U.c, 'mine').coven.points;
  give(U.c, need);
  const coins0 = me(U.c).inventory.coins || 0;
  ok(act(U.c, { op: 'coven_claim' }).ok && (me(U.c).inventory.coins || 0) === coins0 + covenRewardFor(600).coins && covenRewardFor(600).coins === 75, 'цель 600: награда 75 монет вместо 50');
  ok(lead.id === cid, 'тот же ковен');
}

console.log('\nДоступ');
{
  ok(/permission denied/.test(q(`select * from public.coven_payouts;`, U.a).err) && /permission denied/.test(q(`select * from public.coven_cycle_results;`, U.a).err), 'таблицы итогов и выплат клиенту напрямую недоступны');
  ok(/permission denied/.test(q(`select public._coven_payout('${U.a}');`, U.a).err) && /permission denied/.test(q(`select public._coven_fix_week('${cid}');`, U.a).err), 'служебные функции ковенов игроку недоступны');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Циклы ковенов: всё в порядке');
process.exit(failures ? 1 : 0);
