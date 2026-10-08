// v0.26.0 — Магическая Дуэль на настоящем Postgres: соперник — другой герой (не сам игрок), попытки дня, бой ботом с проверкой записи,
// combat_apply (рейтинг, арена без потери здоровья) сверяется с JS-зеркалом; таблица сезона.
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/duel-test.mjs
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { combatApply, fillDefaults, duelStateOf } from '../../src/cloud/playerModel.js';
import { verifyCombat } from '../../src/cloud/combatVerify.js';
import { STEP } from '../../src/systems/combatReplay.js';
import { playBot } from '../../tests/helpers/combat-bot.mjs';
import { grantPg } from '../../tests/helpers/fake-supabase.mjs';
import { DUEL, seasonOf } from '../../src/config/duel.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
function q(sql, as = null) {
  const pre = as === null ? '' : as === 'service' ? 'set role service_role;' : `set role authenticated; select set_config('request.jwt.claim.sub', '${as}', false) \\g /dev/null\n`;
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: pre + '\n' + sql, encoding: 'utf8', env: process.env });
  return { out: r.stdout.trim(), err: r.stderr.trim() };
}
const J = (r) => { try { return JSON.parse(r.out); } catch { throw new Error('не JSON: ' + r.out + ' / ' + r.err); } };
const esc = (o) => JSON.stringify(o).replace(/'/g, "''");
const act = (u, a) => J(q(`select public.player_action('${esc({ id: randomUUID(), ...a })}');`, u));

const A = randomUUID(), B = randomUUID(), C = randomUUID();
const SUF = A.slice(0, 6).replace(/[^0-9a-f]/g, '0');
for (const [u, n] of [[A, 'duelA'], [B, 'duelB'], [C, 'duelC']]) {
  q(`insert into auth.users (id) values ('${u}');`);
  q(`select public.create_player('${u === B ? 'warlock' : 'witch'}');`, u);
  q(`select public.claim_nickname('${u}', '${n}_${SUF}', '${(n + '_' + SUF).toLowerCase()}');`);
  grantPg(u, { xp: 8000, abilities: { telekinesis: { level: 3, unlocked: true }, fire: { level: 2, unlocked: true }, seal: { level: 2, unlocked: true }, ice: { level: 3, unlocked: true } },
    inv: { elixir_life: 9, elixir_mana: 9 }, quests: u === C ? [] : ['chapter_2_complete'],
    objects: { player_build: { branches: { telekinesis: 'lord', ice: 'frost' }, slots: ['ice', 'telekinesis', 'seal'] } } });
}
// чтобы соперником оказался именно B, у него рейтинг ровно как у новичка, а у прочих героев базы — далеко
q(`update public.player_world set data = jsonb_set(data, '{rating}', '3000') where key = 'duel' and user_id not in ('${A}', '${B}');`);
// (тестовая база) прочие герои прошлых прогонов не участвуют в подборе
q(`delete from public.player_quests where quest_id = 'chapter_2_complete' and user_id not in ('${A}', '${B}');`);

console.log('\nДуэль: вызов');
ok(act(C, { op: 'duel_start' }).action.reason === 'locked', 'до конца главы II — нельзя');
const s0 = act(A, { op: 'duel_start' });
const opp = s0.action.opponent;
ok(s0.action.ok && opp && !opp.ghost && opp.name !== `duelA_${SUF}` && opp.level === 15 && opp.abilities.ice.level === 3, `соперник — другой герой (${opp?.name}), его слепок с дарами`);
ok(opp.name === `duelB_${SUF}` && opp.hero === 'warlock' && opp.build?.slots?.length === 3, 'ближайший по рейтингу, с обликом и билдом');
ok(s0.action.left === DUEL.attemptsPerDay - 1 && s0.combatSince != null, 'попытка списана, бой начался');
ok(act(A, { op: 'duel_start' }).action.reason === 'combat', 'второй вызов посреди боя — нельзя');

console.log('\nДуэль: итог боя');
const raw = J(q(`select public.combat_load('${A}');`, 'service'));
const { snapshot } = fillDefaults(raw);
let won = null;
for (let seed = 1; seed <= 10 && !won; seed++) { const p = playBot(snapshot.combatCtx, { seed, policy: 'smart', maxTicks: 60 * 300 }); if (p.cm.result === 'victory') won = p; }
ok(!!won, `бот победил (${Math.round(won?.cm.time || 0)} с)`);
// время боя «прошло» на сервере
q(`update public.player_progress set combat_since = combat_since - interval '10 minutes', vitals_at = vitals_at - interval '10 minutes' where user_id = '${A}';`);
const raw2 = J(q(`select public.combat_load('${A}');`, 'service'));
const snap2 = fillDefaults(raw2).snapshot;
const v = verifyCombat(snap2, JSON.parse(JSON.stringify(won.log)), Date.now());
ok(v.ok && v.verdict.outcome === 'victory' && v.verdict.duel.delta === 16, 'проверка записи: победа, +16');
const hp0 = raw2.hp;
q(`update public.player_world set data = data || '{"best": 1100}'::jsonb where user_id = '${A}' and kind = 'object' and key = 'duel';`);   // лучший рейтинг дошёл до Серебра
const res = J(q(`select public.combat_apply('${A}', '${esc(v.verdict)}');`, 'service'));
const js = combatApply(snap2, v.verdict, Date.now());
const duelObj = res.objects.duel;
ok(res.action.ok && duelObj.rating === 1016 && duelObj.wins === 1 && duelObj.used === 1, 'рейтинг 1016, одна победа');
ok(duelObj.rating === js.snapshot.objects.duel.rating && duelObj.wins === js.snapshot.objects.duel.wins && duelObj.season === js.snapshot.objects.duel.season, 'SQL и JS-зеркало записали Дуэль одинаково');
ok(res.hp === hp0 && res.combatSince == null, 'арена: здоровье как до боя');
ok(res.action.promoSapphires === 10, 'бонус за первую лигу (Серебро) выдан сразу: 10 сапфиров');
ok(res.inventory.coins >= DUEL.reward.victory.coins, 'монеты Дуэли');
ok(/permission denied/.test(q(`select public.combat_apply('${A}', '{}');`, A).err), 'игрок не может сам записать итог');

console.log('\nДуэль: таблица сезона');
const board = J(q(`select public.duel_board();`, A));
ok(board.top.some(r => r.nickname === `duelA_${SUF}` && r.rating === 1016 && r.me) && board.me.rating === 1016, 'игрок в таблице сезона, с местом');
ok(!board.top.some(r => r.nickname === `duelC_${SUF}`), 'кто не сражался — не в таблице');
ok(/permission denied|not_authenticated/.test(q(`set role anon; select public.duel_board();`).err), 'без входа — нет');
ok(!J(q(`select public.sync_player('{"objects":{"duel":{"rating":9999,"season":0}}}');`, A)).objects.duel?.rating === 9999 || J(q(`select public.get_player();`, A)).objects.duel.rating === 1016, 'рейтинг клиентом не пишется');

console.log('\nДуэль: сапфиры арены (общее)');
const cur = seasonOf(Date.now());
const sap = (u) => Number(q(`select coalesce((select sapphires from public.player_wallet where user_id = '${u}'), 0);`).out);
const setDuel = (u, patch) => q(`update public.player_world set data = data || '${esc(patch)}'::jsonb where user_id = '${u}' and kind = 'object' and key = 'duel';`);
const refsOf = (u) => q(`select coalesce(string_agg(ref, ',' order by ref), '') from public.sapphire_ledger where user_id = '${u}' and ref like 'arena%';`).out;
const refs = (u) => q(`select coalesce(string_agg(ref, ',' order by ref), '') from public.sapphire_ledger where user_id = '${u}' and (ref like 'arena:%' or ref like 'league:%');`).out;

// ---------------------------------------------------------------- v0.34.1: награда лучшим игрокам сезона (топ-3)
console.log('\nДуэль: лучшие игроки сезона');
const mk = (n) => { const u = randomUUID(); q(`insert into auth.users (id) values ('${u}');`); q(`select public.create_player('witch');`, u);
  q(`select public.claim_nickname('${u}', '${n}_${SUF}', '${(n + '_' + SUF).toLowerCase()}');`); grantPg(u, { xp: 100, quests: ['chapter_2_complete'] }); return u; };
const T = ['t1', 't2', 't3', 't4', 't5', 't6'].map(mk);
const prevS = { season: cur - 1, wins: 6, losses: 0 };
// рейтинги выше всех остальных игроков базы; t5 играл мало (4 боя) — в таблицу не входит; t6 — прошлый сезон не предыдущий (cur - 2)
// (тестовая база) итоги того же сезона от прошлых прогонов в таблицу не попадают
q(`delete from public.player_world where kind = 'object' and key = 'duel' and ((data ->> 'season')::numeric = ${cur - 1} or (data -> 'prev' ->> 'season')::numeric = ${cur - 1});`);
q(`insert into public.player_world (user_id, kind, key, data) values ${T.map((u, i) => `('${u}', 'object', 'duel', '${esc({ ...prevS, rating: [9100, 9000, 8900, 8800, 9500, 9999][i], ...(i === 4 ? { wins: 4 } : {}), ...(i === 5 ? { season: cur - 2 } : {}) , best: 9999, d: 0, used: 0 })}')`).join(',')};`);
const c = (u) => act(u, { op: 'duel_season' }).action.reward;
// t1 сначала «Вызывает» (состояние переходит в новый сезон, итог уходит в prev) — таблицу сезона это не ломает
const t1 = act(T[0], { op: 'duel_start' }).action;
ok(t1.ok && t1.seasonReward.rank === 1 && t1.seasonReward.top === 200 && t1.seasonReward.paid === 350 && sap(T[0]) === 350, '1-е место: Высшая лига 150 + топ 200, выдано при Вызове');
ok(q(`select data -> 'prev' ->> 'rating' from public.player_world where user_id = '${T[0]}' and key = 'duel';`).out === '9100', 'итог прошлого сезона остался в prev');
const t2 = c(T[1]); ok(t2.rank === 2 && t2.top === 100 && t2.paid === 250 && sap(T[1]) === 250, '2-е место (после того как t1 уже в новом сезоне): 150 + 100');
const t3 = c(T[2]); ok(t3.rank === 3 && t3.top === 50 && t3.paid === 200, '3-е место: 150 + 50');
const t4 = c(T[3]); ok(t4.rank === 4 && t4.top === 0 && t4.paid === 150 && sap(T[3]) === 150, '4-е место — только итог по лиге');
const t5 = c(T[4]); ok(t5.rank == null && t5.paid === 0 && sap(T[4]) === 0, 'мало боёв (4) — ни лиги, ни таблицы, и t5 не вытесняет других');
const t6 = c(T[5]); ok(t6.rank == null && t6.top == null && t6.paid === 150, 'позже следующего сезона таблицы нет — остаётся итог по лиге');
ok(c(T[1]).paid === 0 && c(T[0]).paid === 0 && sap(T[1]) === 250, 'повторно ничего не начисляется');
ok(refsOf(T[1]) === `arena:${cur - 1},arenatop:${cur - 1}`, 'журнал: arena:<сезон> и arenatop:<сезон>');

// ---------------------------------------------------------------- v0.34.0: сапфиры арены
console.log('\nДуэль: сапфиры арены');
const w0 = sap(A);
ok(act(C, { op: 'duel_season' }).action.reason === 'locked', 'награда сезона до главы II закрыта');
ok(act(A, { op: 'duel_season' }).action.reward == null, 'без прошлого сезона наград нет');
// прошлый сезон: Золото (1260), 6 боёв
setDuel(A, { season: cur - 1, rating: 1260, wins: 4, losses: 2, best: 1300 });
const r1 = act(A, { op: 'duel_season' }).action.reward;
ok(r1.season === cur - 1 && r1.league === 'gold' && r1.sapphires === 40 && r1.fresh === true && sap(A) === w0 + 40, 'итог сезона: Золото — 40 сапфиров');
const r2 = act(A, { op: 'duel_season' }).action.reward;
ok(r2.fresh === false && r2.sapphires === 40 && sap(A) === w0 + 40, 'повтор ничего не начисляет');
ok(refs(A) === `arena:${cur - 1},league:silver`, 'в журнале по одной записи на сезон и на лигу');
// мало боёв — ничего (2 боя при минимуме 5)
setDuel(A, { season: cur - 2, rating: 1260, wins: 2, losses: 0 });
const r3 = act(A, { op: 'duel_season' }).action.reward;
ok(r3.sapphires === 0 && r3.battles === 2 && sap(A) === w0 + 40, 'меньше 5 боёв — награды нет');
// бонусы за лигу — по лучшему рейтингу, один раз за всё время
const promo = (best) => Number(q(`select public._duel_pay_promo('${A}', '{"best": ${best}}'::jsonb, public._game_rules() -> 'duel');`).out);
const w1 = sap(A);
ok(promo(1050) === 0, 'Бронза — без бонуса');
ok(promo(1260) === 20 && sap(A) === w1 + 20, 'Золото: 20 (Серебро уже выдано после боя)');
ok(promo(1260) === 0 && sap(A) === w1 + 20, 'повторно — ничего');
ok(promo(1900) === 30 + 50 + 70 + 100 && sap(A) === w1 + 20 + 250, 'остальные лиги: платина, алмаз, мастер, высшая лига');
// смена сезона в Вызове: итог прошлого сезона не теряется
setDuel(A, { season: cur - 3, rating: 1500, wins: 5, losses: 3 });
const w2 = sap(A);
const st3 = act(A, { op: 'duel_start' });
ok(st3.action.ok && st3.action.seasonReward?.league === 'platinum' && st3.action.seasonReward.sapphires === 60 && sap(A) === w2 + 60, 'Вызов нового сезона выдаёт награду прошлого: Платина — 60');
ok(st3.objects.duel.season === cur && st3.objects.duel.prev?.season === cur - 3 && st3.objects.duel.prev.rating === 1500, 'итог прошлого сезона записан в состоянии');
ok(act(A, { op: 'duel_season' }).action.reward.fresh === false && sap(A) === w2 + 60, 'после Вызова награда не удваивается');
// доступ
ok(/permission denied/.test(q(`select public._duel_pay_promo('${A}', '{"best": 1900}'::jsonb, public._game_rules() -> 'duel');`, A).err)
  && /permission denied/.test(q(`select public._duel_pay_prev('${A}', '{}'::jsonb, public._game_rules() -> 'duel');`, A).err), 'игрок не может вызвать выдачу напрямую');


console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Дуэль (Postgres): всё в порядке');
process.exit(failures ? 1 : 0);
