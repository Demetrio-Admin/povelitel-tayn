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
import { DUEL } from '../../src/config/duel.js';

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
const res = J(q(`select public.combat_apply('${A}', '${esc(v.verdict)}');`, 'service'));
const js = combatApply(snap2, v.verdict, Date.now());
const duelObj = res.objects.duel;
ok(res.action.ok && duelObj.rating === 1016 && duelObj.wins === 1 && duelObj.used === 1, 'рейтинг 1016, одна победа');
ok(duelObj.rating === js.snapshot.objects.duel.rating && duelObj.wins === js.snapshot.objects.duel.wins && duelObj.season === js.snapshot.objects.duel.season, 'SQL и JS-зеркало записали Дуэль одинаково');
ok(res.hp === hp0 && res.combatSince == null, 'арена: здоровье как до боя');
ok(res.inventory.coins >= DUEL.reward.victory.coins, 'монеты Дуэли');
ok(/permission denied/.test(q(`select public.combat_apply('${A}', '{}');`, A).err), 'игрок не может сам записать итог');

console.log('\nДуэль: таблица сезона');
const board = J(q(`select public.duel_board();`, A));
ok(board.top.some(r => r.nickname === `duelA_${SUF}` && r.rating === 1016 && r.me) && board.me.rating === 1016, 'игрок в таблице сезона, с местом');
ok(!board.top.some(r => r.nickname === `duelC_${SUF}`), 'кто не сражался — не в таблице');
ok(/permission denied|not_authenticated/.test(q(`set role anon; select public.duel_board();`).err), 'без входа — нет');
ok(!J(q(`select public.sync_player('{"objects":{"duel":{"rating":9999,"season":0}}}');`, A)).objects.duel?.rating === 9999 || J(q(`select public.get_player();`, A)).objects.duel.rating === 1016, 'рейтинг клиентом не пишется');

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Дуэль (Postgres): всё в порядке');
process.exit(failures ? 1 : 0);
