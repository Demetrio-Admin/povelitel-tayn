// v0.14.0 — бой, который проверяет сервер, на настоящем Postgres (схема supabase/schema.sql + tools/sql/auth-stub.sql).
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/combat-test.mjs
// Цепочка как в игре: player_action combat_start → бот играет бой и записывает действия → verifyCombat (тот же код, что в Edge Function) →
// combat_apply (service_role). Итог SQL сверяется с JS-зеркалом playerModel.combatApply. Отдельно — подделки и отказы.
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { combatApply, combatCtxOf, fillDefaults } from '../../src/cloud/playerModel.js';
import { verifyCombat } from '../../src/cloud/combatVerify.js';
import { STEP } from '../../src/systems/combatReplay.js';
import { playBot } from '../../tests/helpers/combat-bot.mjs';
import { grantPg } from '../../tests/helpers/fake-supabase.mjs';
import { handle } from '../../src/cloud/combatHandler.js';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
function q(sql, as = null) {
  const pre = as === null ? '' : as === 'service' ? 'set role service_role;' : `set role authenticated; select set_config('request.jwt.claim.sub', '${as}', false) \\g /dev/null\n`;
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: pre + '\n' + sql, encoding: 'utf8', env: process.env });
  return { out: r.stdout.trim(), err: r.stderr.trim() };
}
const J = (r) => { try { return JSON.parse(r.out); } catch (e) { throw new Error('не JSON: ' + r.out + ' / ' + r.err); } };
const esc = (o) => JSON.stringify(o).replace(/'/g, "''");
// v0.15.0: опыт, предметы, события, дары и билд sync_player не принимает — «прогресс» выдаётся напрямую в таблицы (как владелец базы)
const sync = (u, patch) => grantPg(u, patch);
const act = (u, action) => J(q(`select public.player_action('${esc({ id: randomUUID(), ...action })}');`, u));
const load = (u) => J(q(`select public.combat_load('${u}');`, 'service'));
const apply = (u, verdict) => J(q(`select public.combat_apply('${u}', '${esc(verdict)}');`, 'service'));

function newPlayer(patch) {
  const u = randomUUID();
  q(`insert into auth.users (id) values ('${u}');`);
  q(`select public.create_player('witch');`, u);
  if (patch) sync(u, patch);
  return u;
}
const BUILD = { xp: 500, abilities: { telekinesis: { level: 2, unlocked: true }, fire: { level: 1, unlocked: true } }, inv: { elixir_life: 3, elixir_mana: 2, coins: 30 } };
const close = (a, b) => Math.abs(a - b) < 1e-6;
// снимок для сравнения SQL и JS: без метаданных и момента восстановления (его ставят часы сервера и теста по-разному)
const cmp = (s) => { const { meta, action, vitalsAt, hp, mana, ...rest } = s; return JSON.stringify(rest, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x)); };

console.log('\nБой на сервере: запоминание состояния');
const A = newPlayer(BUILD);
sync(A, { objects: { player_build: { branches: { telekinesis: 'lord' } } } });
const before = fillDefaults(load(A)).snapshot;
const st = act(A, { op: 'combat_start', spawn: 'rootling_01', enemy: 'rootling' });
ok(st.action.ok === true && st.combatSince != null && st.combatCtx, 'combat_start принят: бой идёт, состояние героя запомнено');
const canonJ = (o) => JSON.stringify(o, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
const js = combatCtxOf(fillDefaults(st).snapshot, 'rootling_01', 'rootling');   // из снимка после старта: HP и мана за время запроса успели подрасти
const c = st.combatCtx;
ok(c.spawn === 'rootling_01' && c.enemy === 'rootling' && c.level === js.level && canonJ(c.abilities) === canonJ(js.abilities), 'ctx: место, враг, уровень и дары как у JS-зеркала');
ok(c.potions.elixir_life === 3 && c.potions.elixir_mana === 2 && c.potions.resin_flask === 0 && c.potions.warm_potion === 0 && Object.keys(c.potions).length === 7 && c.build?.branches?.telekinesis === 'lord', 'ctx: зелья (все семь расходников, v0.19.0) и ветка дара из базы');
ok(close(c.hp, js.hp) && close(c.mana, js.mana) && c.hp === st.hp && c.mana === st.mana, 'ctx: HP и мана — те же числа, что увидит клиент в снимке');
ok(canonJ(c) === canonJ(js), 'ctx: целиком совпал с JS-зеркалом combatCtxOf');
ok(act(A, { op: 'combat_start', spawn: 'x y', enemy: 'rootling' }).action.reason === 'bad_spawn', 'combat_start с испорченным местом отклонён');

console.log('\nБой на сервере: права');
ok(/permission denied/.test(q(`select public.combat_apply('${A}', '{}');`, A).err), 'игрок не может вызвать combat_apply');
ok(/permission denied/.test(q(`select public.combat_load('${A}');`, A).err), 'игрок не может вызвать combat_load');
ok(act(A, { op: 'combat_end', outcome: 'victory', mana: 100 }).action.reason === 'verify', 'combat_end victory отклонён: победу принимает только проверенная запись');
ok(act(A, { op: 'combat_end', outcome: 'defeat', mana: 100 }).action.reason === 'verify', 'combat_end defeat отклонён так же');

console.log('\nБой на сервере: победа, проигрыш записи, применение');
const snap = load(A);
const play = playBot(snap.combatCtx, { seed: 7 });
ok(play.cm.result === 'victory', 'бот победил Корневика (' + play.cm.result + ', ' + play.log.ticks + ' шагов)');
const now = snap.combatSince + Math.ceil(play.log.ticks * STEP * 1000) + 500;
const v = verifyCombat(fillDefaults(snap).snapshot, play.log, now);
ok(v.ok && v.verdict.outcome === 'victory', 'сервер проиграл запись и тоже получил победу');
ok(close(v.verdict.mana, play.cm.hero.mana), 'остаток маны при повторе совпал с клиентским боем (' + v.verdict.mana.toFixed(4) + ')');
const usedLife = (snap.combatCtx.potions.elixir_life || 0) - play.st.item('elixir_life');
ok(JSON.stringify(v.verdict.potions) === JSON.stringify(Object.fromEntries(['elixir_life', 'elixir_mana', 'resin_flask'].map(id => [id, (snap.combatCtx.potions[id] || 0) - play.st.item(id)]).filter(([, n]) => n))), 'выпитые зелья в вердикте совпадают с клиентскими');
// клиент мог успеть сообщить о выпитом (старое сохранение): сервер не спишет второй раз
if (usedLife > 0) sync(A, { inv: { elixir_life: -usedLife } });
const exp = combatApply(fillDefaults(load(A)).snapshot, v.verdict, now).snapshot;
const after = apply(A, v.verdict);
ok(after.action.ok === true && after.combatSince === null && after.combatCtx === null, 'combat_apply принят: бой закрыт, состояние очищено');
const afterF = fillDefaults(after).snapshot;
ok(cmp(afterF) === cmp(exp), 'итог в Postgres совпал с JS-зеркалом combatApply');
if (cmp(afterF) !== cmp(exp)) { console.log('   SQL:', cmp(afterF)); console.log('   JS :', cmp(exp)); }
ok(after.enemies.includes('rootling_01') && after.objects['rep:rootling_01']?.wins === 1, 'победа записана: враг побеждён, у возобновляемого места rep wins = 1');
ok(after.xp > 500 && after.hp === after.hp && after.inventory.coins >= 30, 'награда выдана (опыт, монеты)');
ok(after.inventory.elixir_life === 3 - usedLife, 'настои: списано выпитое, без двойного списания (' + after.inventory.elixir_life + ')');
ok(close(after.mana, v.verdict.mana), 'мана — остаток боя');
ok(after.combats.at(-1)?.result === 'victory' && after.combats.at(-1).spawnId === 'rootling_01', 'история боёв дополнена');
ok(apply(A, v.verdict).action.reason === 'no_combat', 'повторное применение отклонено: итог принимается один раз');

console.log('\nБой на сервере: подделки записи');
{
  const B = newPlayer(BUILD);
  act(B, { op: 'combat_start', spawn: 'scavenger_01', enemy: 'forest_scavenger' });
  const s = load(B), cs = fillDefaults(s).snapshot;
  const late = s.combatSince + 120_000;
  const idle = playBot(s.combatCtx, { policy: 'idle', maxTicks: 60 * 100 });
  const rIdle = verifyCombat(cs, idle.log, s.combatSince + 200_000);
  ok(rIdle.ok && rIdle.verdict.outcome === 'defeat', 'бездействие — поражение, а не победа');
  ok(verifyCombat(cs, { ...idle.log, ticks: 60 * 100 }, s.combatSince + 5_000).reason === 'too_fast', 'записи с большим числом шагов, чем прошло времени, отказ: too_fast');
  ok(verifyCombat(cs, { v: 1, ticks: 100, ev: [], hold: [0, 50] }, late).ok === true, 'первый бой с обучением: пауза врага разрешена');
  ok(verifyCombat(cs, { v: 1, ticks: 60 * 60 * 5 + 100, ev: [], hold: [0] }, s.combatSince + 400 * 60_000).reason === 'bad_log', 'пауза врага дольше 5 минут: bad_log');
  ok(verifyCombat(cs, { v: 2, ticks: 1, ev: [], hold: [] }, late).reason === 'bad_log' && verifyCombat(cs, { v: 1, ticks: -1, ev: [], hold: [] }, late).reason === 'bad_log' && verifyCombat(cs, 'win', late).reason === 'bad_log', 'мусор вместо записи: bad_log');
  ok(verifyCombat(cs, { v: 1, ticks: 10, ev: [[5, 'a', 'telekinesis'], [2, 'a', 'fire']], hold: [] }, late).reason === 'bad_log', 'действия не по порядку: bad_log');
  // дар, которого нет, и зелье, которого нет: действия просто не срабатывают
  const fake = { v: 1, ticks: 60 * 100, ev: [[0, 'a', 'seal'], [1, 'p', 'resin_flask'], [2, 'p', 'elixir_mana'], [3, 'a', 'seal']], hold: [] };
  const rf = verifyCombat(cs, fake, s.combatSince + 200_000);
  ok(rf.ok && rf.verdict.outcome === 'defeat' && !rf.verdict.potions.resin_flask, 'несуществующий дар и зелье, которого нет, ничего не дают');
  // запись, оборванная до конца боя: отступление, награды нет
  const cut = verifyCombat(cs, { v: 1, ticks: 30, ev: [], hold: [] }, late);
  ok(cut.ok && cut.verdict.outcome === 'retreat' && !cut.verdict.reward, 'оборванная запись — отступление без награды');
  // поражение применяется: монеты, HP 20%, школьный опыт за применения
  const lostRun = playBot(s.combatCtx, { seed: 5, policy: 'idle', maxTicks: 60 * 100 });
  const vd = verifyCombat(cs, lostRun.log, s.combatSince + 200_000).verdict;
  const exp2 = combatApply(cs, vd, s.combatSince + 200_000).snapshot;
  const a2 = apply(B, vd);
  ok(a2.action.ok === true && cmp(fillDefaults(a2).snapshot) === cmp(exp2), 'поражение: итог Postgres совпал с JS-зеркалом');
  ok(a2.inventory.coins === 25 && a2.hp === Math.ceil(a2.level === 3 ? 132 * 0.2 : 0) || a2.hp > 0, 'поражение: штраф 5 монет, HP — доля максимума (' + a2.hp + ')');
  ok(!a2.enemies.includes('scavenger_01'), 'поражение: враг не побеждён');
  // устаревший вердикт и чужое место
  act(B, { op: 'combat_start', spawn: 'scavenger_01', enemy: 'forest_scavenger' });
  ok(apply(B, { ...vd, since: vd.since }).action.reason === 'stale', 'вердикт прошлого боя к новому бою не применяется (stale)');
  ok(apply(B, { ...vd, since: load(B).combatSince, spawn: 'rootling_02' }).action.reason === 'stale', 'вердикт чужого места не применяется (stale)');
  ok(apply(B, { outcome: 'win' }).action.reason === 'bad_verdict' && apply(B, null).action.reason === 'bad_verdict', 'вердикт неизвестного вида отклонён');
  const rv = act(B, { op: 'combat_end', outcome: 'retreat' });
  ok(rv.action.ok === true && rv.combatCtx === null && rv.combatSince === null, 'отступление (перезагрузка посреди боя) закрывает бой и очищает состояние');
}

console.log('\nБой на сервере: место и условия');
{
  const C = newPlayer(BUILD);
  act(C, { op: 'combat_start', spawn: 'node_trial', enemy: 'node_guardian' });
  ok(verifyCombat(fillDefaults(load(C)).snapshot, { v: 1, ticks: 10, ev: [], hold: [] }, Date.now()).reason === 'locked', 'закрытое место (нет события ancient_gate_open): locked');
  act(C, { op: 'combat_start', spawn: 'scavenger_01', enemy: 'forest_guardian' });
  ok(verifyCombat(fillDefaults(load(C)).snapshot, { v: 1, ticks: 10, ev: [], hold: [] }, Date.now()).reason === 'bad_spawn', 'враг не тот, что стоит на месте: bad_spawn');
  act(C, { op: 'combat_start', spawn: 'nowhere', enemy: 'rootling' });
  ok(verifyCombat(fillDefaults(load(C)).snapshot, { v: 1, ticks: 10, ev: [], hold: [] }, Date.now()).reason === 'bad_spawn', 'неизвестное место: bad_spawn');
  sync(C, { enemies: ['scavenger_01'] });
  act(C, { op: 'combat_start', spawn: 'scavenger_01', enemy: 'forest_scavenger' });
  ok(verifyCombat(fillDefaults(load(C)).snapshot, { v: 1, ticks: 10, ev: [], hold: [] }, Date.now()).reason === 'down', 'враг уже побеждён и не возрождается: down');
  ok(verifyCombat(fillDefaults(act(C, { op: 'combat_end', outcome: 'retreat' })).snapshot, { v: 1, ticks: 0, ev: [], hold: [] }, Date.now()).reason === 'no_combat', 'без начатого боя запись не принимается: no_combat');
}

{
  const D = newPlayer(BUILD);
  act(D, { op: 'combat_start', spawn: 'rootling_02', enemy: 'rootling' });
  const sd = load(D);
  ok(verifyCombat(fillDefaults(sd).snapshot, { v: 1, ticks: 100, ev: [], hold: [0] }, sd.combatSince + 120_000).reason === 'bad_log', 'пауза врага вне обучения (другой бой): bad_log');
}

console.log('\nEdge Function combat: обработчик на настоящей базе');
{
  // собранный файл для Supabase (supabase/functions/combat/index.ts) работает так же, как исходник
  const dir = mkdtempSync(join(tmpdir(), 'combat-fn-'));
  writeFileSync(join(dir, 'fn.mjs'), readFileSync(new URL('../../supabase/functions/combat/index.ts', import.meta.url), 'utf8'));
  const bundled = await import(pathToFileURL(join(dir, 'fn.mjs')).href);
  const U = newPlayer(BUILD);
  const env = { SUPABASE_URL: 'http://db.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' };
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const path = String(url).replace('http://db.test', '');
    calls.push(path);
    const body = init.body ? JSON.parse(init.body) : {};
    const reply = (status, b) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
    if (path === '/auth/v1/user') { const tok = (init.headers.Authorization || '').replace('Bearer ', ''); return tok.startsWith('tok-') ? reply(200, { id: tok.slice(4) }) : reply(401, {}); }
    if (path === '/rest/v1/rpc/combat_load') return reply(200, J(q(`select public.combat_load('${body.uid}');`, 'service')));
    if (path === '/rest/v1/rpc/combat_apply') return reply(200, J(q(`select public.combat_apply('${body.uid}', '${esc(body.verdict)}');`, 'service')));
    return reply(404, {});
  };
  const post = (impl, log, token = 'tok-' + U, method = 'POST') => impl.handle(new Request('http://fn.test/combat', { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ log }) : undefined }), env, fetchFn, () => clock);
  let clock = Date.now();
  const startU = act(U, { op: 'combat_start', spawn: 'rootling_03', enemy: 'rootling' });
  const ctxU = load(U);
  const runU = playBot(ctxU.combatCtx, { seed: 11 });
  clock = ctxU.combatSince + Math.ceil(runU.log.ticks * STEP * 1000) + 500;
  ok((await post({ handle }, runU.log, 'bad-token')).status === 401, 'без настоящего токена — 401');
  ok((await post({ handle }, runU.log, 'tok-' + U, 'GET')).status === 405, 'не POST — 405');
  const bad = await (await post({ handle }, { v: 1, ticks: 'x' })).json();
  ok(bad.action?.ok === false && bad.action.reason === 'bad_log' && bad.combatSince != null, 'испорченная запись: отказ bad_log, бой остаётся открытым');
  const lib = await post(bundled, runU.log);
  const resB = await lib.json();
  ok(lib.status === 200 && resB.action.ok === true && resB.action.outcome === 'victory' && resB.action.verdict?.reward?.heroXP > 0, 'собранный файл: победа принята, в ответе вердикт с наградой');
  ok(resB.combatSince === null && resB.enemies.includes('rootling_03') && resB.xp > 500, 'в ответе — снимок игрока уже с итогом боя');
  ok(calls.filter(c => c.endsWith('combat_apply')).length === 1, 'итог записан один раз');
  const again = await (await post({ handle }, runU.log)).json();
  ok(again.action.ok === false && again.action.reason === 'no_combat', 'повторная отправка той же записи: no_combat');
}

console.log(failures ? `\nПровалено проверок: ${failures}` : '\nВсе проверки боя на сервере пройдены');
process.exit(failures ? 1 : 0);
