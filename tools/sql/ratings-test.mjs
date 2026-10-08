// v0.29.0 — рейтинги и «кто в игре» на настоящем Postgres: уровень, лучшая победа (по побеждённым точкам боя), арена (рейтинг Дуэли
// сезона), место игрока, гости, доступ, знак присутствия и список онлайн.
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/ratings-test.mjs
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { grantPg } from '../../tests/helpers/fake-supabase.mjs';
import { seasonOf } from '../../src/config/duel.js';
import { ratingsRules } from '../../src/config/ratings.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
function q(sql, as = null) {
  const pre = as === null ? '' : `set role ${as === 'anon' ? 'anon' : 'authenticated'}; ${as === 'anon' ? '' : `select set_config('request.jwt.claim.sub', '${as}', false) \\g /dev/null`}\n`;
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: pre + '\n' + sql, encoding: 'utf8', env: process.env });
  return { out: r.stdout.trim(), err: r.stderr.trim() };
}
const J = (r) => { try { return JSON.parse(r.out); } catch { throw new Error('не JSON: ' + r.out + ' / ' + r.err); } };
const board = (as) => J(q('select public.ratings_board();', as));
const online = (as) => J(q('select public.online_players();', as));

const A = randomUUID(), B = randomUUID(), C = randomUUID(), D = randomUUID();
const SUF = A.slice(0, 6).replace(/[^0-9a-f]/g, '0');
const season = seasonOf(Date.now());
for (const [u, n] of [[A, 'ratA'], [B, 'ratB'], [C, null], [D, 'ratD']]) {
  q(`insert into auth.users (id) values ('${u}');`);
  q(`select public.create_player('${u === B ? 'warlock' : 'witch'}');`, u);
  if (n) q(`select public.claim_nickname('${u}', '${n}_${SUF}', '${(n + '_' + SUF).toLowerCase()}');`);
}
grantPg(A, { xp: 7900, enemies: ['scavenger_01', 'fw_alpha', 'rootling_01'], objects: { duel: { season, rating: 1500, wins: 3, losses: 1, best: 1500, used: 0, day: 0 } } });
grantPg(B, { xp: 150, enemies: ['scavenger_01', 'rootling_01'], objects: { duel: { season, rating: 1200, wins: 1, losses: 2, best: 1250, used: 0, day: 0 } } });
grantPg(C, { xp: 150, enemies: ['scavenger_01'] });
grantPg(D, { xp: 150, enemies: ['scavenger_01', 'rootling_01'], objects: { duel: { season: season - 1, rating: 1900, wins: 9, losses: 0, best: 1900, used: 0, day: 0 } } });

console.log('\nРейтинги: доступ и правила');
{
  ok(q('select public.ratings_board();', 'anon').err.includes('permission denied'), 'без входа таблицы недоступны (anon)');
  ok(q('select public.online_players();', 'anon').err.includes('permission denied') && q('select public.presence_ping();', 'anon').err.includes('permission denied'), 'без входа недоступны «онлайн» и знак присутствия');
  const rules = J(q(`select public._game_rules() -> 'ratings';`));
  const sortKeys = (o) => (o && typeof o === 'object' ? (Array.isArray(o) ? o.map(sortKeys) : Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]))) : o);
  ok(JSON.stringify(sortKeys(rules)) === JSON.stringify(sortKeys(ratingsRules())), 'правила рейтингов на сервере совпадают с конфигом');
}

console.log('\nРейтинги: уровень');
{
  const a = board(A), b = board(B);
  ok(a.level.me.rank < b.level.me.rank && a.level.me.level > b.level.me.level, `уровень: у A (${a.level.me.level}) место выше, чем у B (${b.level.me.level})`);
  ok(a.level.top.every((r, i, arr) => i === 0 || arr[i - 1].level > r.level || (arr[i - 1].level === r.level && arr[i - 1].xp >= r.xp)), 'таблица уровня упорядочена: уровень, затем опыт');
  ok(a.level.top.length <= 50 && a.level.top.every((r) => r.nickname && !('user_id' in r) && !('id' in r)), 'не больше 50 мест, у каждого ник и нет id пользователей');
  ok(board(C).level.me === null, 'гость без ника в таблицу не попадает (места нет)');
  ok(a.level.top.filter((r) => r.me).length <= 1 && (a.level.me.rank > 50 || a.level.top.some((r) => r.me && r.rank === a.level.me.rank)), 'отметка «вы» — одна, на своём месте');
}

console.log('\nРейтинги: лучшая победа над монстром');
{
  const a = board(A), b = board(B);
  ok(a.monster.me.enemy === 'frost_alpha' && a.monster.me.level === 12, 'A: лучшая победа — Вожак метели (уровень 12)');
  ok(b.monster.me.enemy === 'rootling' && b.monster.me.level === 2, 'B: лучшая победа — Корневик (уровень 2), Падальщик ниже');
  ok(a.monster.me.rank < b.monster.me.rank, 'у кого монстр сильнее, тот выше');
  ok(board(C).monster.me === null, 'гость без ника — без места');
  ok(a.monster.top.every((r, i, arr) => i === 0 || arr[i - 1].level >= r.level), 'таблица монстров упорядочена по уровню');
  // тот же уровень — выше тот, кто победил более сильного (по здоровью): Вожак (1300) выше Стража кургана? нет, Страж кургана 1400
  grantPg(B, { enemies: ['gy_warden'] });
  const b2 = board(B), a2 = board(A);
  ok(b2.monster.me.enemy === 'barrow_warden' && b2.monster.me.level === 12 && b2.monster.me.rank < a2.monster.me.rank, 'при равном уровне выше тот, чей монстр сильнее (Страж кургана 1400 > Вожак 1300)');
}

console.log('\nРейтинги: арена');
{
  const a = board(A), b = board(B), d = board(D);
  ok(a.arena.me.rating === 1500 && b.arena.me.rating === 1200 && a.arena.me.rank < b.arena.me.rank, 'арена: рейтинг и места по рейтингу сезона');
  ok(d.arena.me === null, 'рейтинг прошлого сезона в таблицу не входит');
  ok(a.arena.season === season && !!a.arena.endsAt, 'указан сезон и когда он кончается');
  ok(board(C).arena.me === null && a.arena.top.every((r, i, arr) => i === 0 || arr[i - 1].rating >= r.rating), 'гость без места; таблица упорядочена по рейтингу');
}

console.log('\nОнлайн: кто сейчас в игре');
{
  q(`update public.profiles set online_at = null where id in ('${A}', '${B}', '${C}', '${D}');`);
  let o = online(A);
  ok(!o.players.some((p) => p.nickname === `ratA_${SUF}`), 'пока знака нет — игрока в списке нет');
  q('select public.presence_ping();', A); q('select public.presence_ping();', C);
  q(`update public.profiles set online_at = now() - interval '5 minutes' where id = '${B}';`);
  const withGuest = online(A);
  const me = withGuest.players.find((p) => p.nickname === `ratA_${SUF}`);
  ok(!!me && me.me === true && me.level > 1 && me.fighting === false && me.hero === 'witch', 'подал знак — в списке: ник, герой, уровень, не в бою, пометка «вы»');
  ok(!withGuest.players.some((p) => p.nickname === `ratB_${SUF}`), 'давно не подавал знака — не в игре');
  ok(withGuest.guests >= 1 && withGuest.count >= withGuest.guests + 1 && withGuest.players.every((p) => p.nickname), 'гость без ника — только числом, в список не попадает');
  q(`update public.player_progress set combat_since = now() where user_id = '${A}';`);
  ok(online(A).players.find((p) => p.nickname === `ratA_${SUF}`).fighting === true, 'игрок в бою — помечен');
  q(`update public.player_progress set combat_since = null where user_id = '${A}';`);
  const t0 = J(q(`select to_jsonb(online_at) from public.profiles where id = '${A}';`));
  q('select public.presence_ping();', A);
  ok(J(q(`select to_jsonb(online_at) from public.profiles where id = '${A}';`)) === t0, 'частые знаки не пишутся в базу (не чаще раза в 15 секунд)');
  ok(online(A).players.length <= 100 && online(A).players.every((p, i, arr) => i === 0 || arr[i - 1].level >= p.level), 'не больше 100 строк, от высокого уровня к низкому');
}

console.log(failures ? `\n✗ Провалов: ${failures}` : '\n✓ Рейтинги и онлайн: всё в порядке');
process.exit(failures ? 1 : 0);
