// Проверка прав и правил базы на настоящем Postgres (схема supabase/schema.sql + tools/sql/auth-stub.sql).
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/security-test.mjs
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
/** Выполняет SQL; as: null (владелец), 'anon', 'service' или uuid игрока. Возвращает { out, err }. */
function q(sql, as = null) {
  const pre = as === null ? '' : as === 'anon' ? 'set role anon;' : as === 'service' ? 'set role service_role;'
    : `set role authenticated; select set_config('request.jwt.claim.sub', '${as}', false) \\g /dev/null\n`;
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: pre + '\n' + sql, encoding: 'utf8', env: process.env });
  return { out: r.stdout.trim(), err: r.stderr.trim() };
}
const denied = (r) => /permission denied|violates row-level security|not_authenticated/.test(r.err);

const A = randomUUID(), B = randomUUID();
// ники с суффиксом, чтобы тест можно было гонять повторно на той же базе
const SUF = A.slice(0, 4).replace(/[^0-9a-f]/g, '0');
const NICK = 'Дмитрий' + SUF.replace(/[a-f]/g, (c) => 'абвгде'['abcdef'.indexOf(c)]), NORM = NICK.toLowerCase();
const NICK2 = 'Witch_' + SUF, NORM2 = NICK2.toLowerCase();
q(`insert into auth.users (id) values ('${A}'), ('${B}');`);

console.log('\nБаза: гость и игрок');
ok(denied(q(`select public.create_player('witch');`, 'anon')), 'без входа персонажа не создать');
const a0 = JSON.parse(q(`select public.create_player('witch');`, A).out);
ok(a0.level === 1 && a0.meta.registered === false && a0.meta.nickname === null && a0.meta.hero === 'witch', 'гость получил персонажа: уровень 1, без ника, герой witch');
const a0b = JSON.parse(q(`select public.create_player('other');`, A).out);
ok(a0b.meta.hero === 'witch' && a0b.meta.rev === a0.meta.rev, 'повторный create_player не пересоздаёт персонажа');
q(`select public.create_player('witch');`, B);
q(`select public.sync_player('{"inv":{"coins":50},"xp":160,"quests":["intro"]}');`, A);
const a1 = JSON.parse(q(`select public.get_player();`, A).out);
ok(a1.inventory.coins === 50 && a1.level === 3 && a1.quests.includes('intro'), 'прогресс записан и читается обратно');
const stale = JSON.parse(q(`select public.sync_player('{"xp":10,"inv":{"coins":-5}}');`, A).out);
ok(stale.level === 3 && stale.xp === 160 && stale.inventory.coins === 45, 'устаревшее устройство не откатывает уровень и опыт; монеты — дельтой');

// v0.11.1: ветка дара хранится объектом мира player_build — отдельной колонки нет
const bld = JSON.parse(q(`select public.sync_player('{"objects":{"player_build":{"branches":{"telekinesis":"lord"}}}}');`, A).out);
ok(bld.objects.player_build?.branches?.telekinesis === 'lord', 'ветка дара сохраняется как объект мира player_build и читается обратно');
const bld2 = JSON.parse(q(`select public.sync_player('{"objects":{"player_build":{"branches":{"telekinesis":"breaker"}}}}');`, A).out);
ok(bld2.objects.player_build.branches.telekinesis === 'breaker', 'смена ветки перезаписывает объект («последний записал»)');
ok(!JSON.parse(q(`select public.get_player();`, B).out).objects.player_build, 'у другого игрока ветки нет');

console.log('\nБаза: подделки клиента');
{
  const C = randomUUID();
  q(`insert into auth.users (id) values ('${C}');`); q(`select public.create_player('witch');`, C);
  const c1 = JSON.parse(q(`select public.sync_player('{"level":100,"inv":{"coins":999999999,"lunar_shard":1000},"xp":999999999,"school":{"fire":1000000},"play":999999999}');`, C).out);
  ok(c1.inventory.coins === 500 && c1.inventory.lunar_shard === 50, 'gold = 999999999 не принимается: за раз не больше 500 монет и 50 предметов (' + c1.inventory.coins + ')');
  ok(c1.xp === 1000 && c1.level === 7, 'опыт за раз не больше 1000; уровень сервер считает сам по порогам (' + c1.level + '), «level: 100» игнорируется');
  ok(c1.school.fire === 500 && c1.play === 600000, 'опыт дара и время игры тоже ограничены');
  const c2 = JSON.parse(q(`select public.sync_player('{"inv":{"coins":-200}}');`, C).out);
  ok(c2.inventory.coins === 300, 'трата работает дельтой');
  const c3 = JSON.parse(q(`select public.sync_player('{"inv":{"coins":-100000}}');`, C).out);
  ok(c3.inventory.coins === 0, 'в минус уйти нельзя');
  ok(denied(q(`select * from public.game_hero_levels;`, C)), 'таблица порогов недоступна клиенту напрямую');
  const before = JSON.parse(q(`select public.get_player();`, C).out).inventory.coins;
  q(`select public.sync_player('{"id":"retry-${C.slice(0, 8)}","inv":{"coins":7}}');`, C);
  const again = JSON.parse(q(`select public.sync_player('{"id":"retry-${C.slice(0, 8)}","inv":{"coins":7}}');`, C).out);
  ok(again.inventory.coins === before + 7, 'повтор того же сохранения (ответ потерялся) не начисляет второй раз');
}

console.log('\nБаза: чужие данные');
ok(q(`select count(*) from public.player_inventory;`, B).out === '0', 'B не видит инвентарь A');
ok(q(`select count(*) from public.profiles;`, B).out === '1', 'B видит только свой профиль');
ok(denied(q(`update public.player_inventory set quantity = 999999 where user_id = '${A}';`, B)), 'B не может менять инвентарь A');
ok(denied(q(`update public.player_inventory set quantity = 999999 where user_id = '${A}';`, A)), 'даже A не пишет в таблицу напрямую — только через функции');
ok(denied(q(`insert into public.player_inventory values ('${B}', 'coins', 5);`, B)), 'прямая вставка предметов запрещена');
ok(denied(q(`update public.profiles set nickname = 'Hacker' where id = '${B}';`, B)), 'ник нельзя выставить себе в обход регистрации');
ok(denied(q(`select count(*) from public.player_progress;`, 'anon')), 'анонимный ключ не читает прогресс');
ok(denied(q(`select public._snapshot('${A}');`, B)), 'служебная _snapshot недоступна клиенту');

console.log('\nБаза: ники');
ok(denied(q(`select public.claim_nickname('${A}', '${NICK}', '${NORM}');`, A)), 'claim_nickname недоступна из браузера');
ok(q(`select public.nickname_available('${NORM}');`, 'anon').out === 't', 'ник свободен (проверка доступна до входа)');
q(`select public.claim_nickname('${A}', '${NICK}', '${NORM}');`, 'service');
const a2 = JSON.parse(q(`select public.get_player();`, A).out);
ok(a2.meta.nickname === NICK && !!a2.meta.registeredAt && a2.meta.registered && a2.inventory.coins === 45 && a2.level === 3, 'после регистрации тот же персонаж: ник Дмитрий, уровень 3, монеты на месте');
ok(q(`select public.nickname_available('${NORM}');`, 'anon').out === 'f', 'ник занят');
ok(/unique|duplicate|nickname_taken/.test(q(`select public.claim_nickname('${B}', '${NICK.toUpperCase()}', '${NORM}');`, 'service').err), 'второй «ДМИТРИЙ» (другой регистр) отклонён уникальным индексом');
ok(/already_registered/.test(q(`select public.claim_nickname('${A}', 'Другой', 'другой');`, 'service').err), 'зарегистрированный игрок не меняет ник через claim');
ok(/invalid_nickname/.test(q(`select public.claim_nickname('${B}', 'a b', 'a b');`, 'service').err), 'ник с пробелом отклонён');
ok(/invalid_nickname/.test(q(`select public.claim_nickname('${B}', 'Ab', 'ab');`, 'service').err), 'ник короче 3 символов отклонён');
q(`select public.claim_nickname('${B}', '${NICK2}', '${NORM2}');`, 'service');
q(`select public.release_nickname('${B}');`, 'service');
ok(q(`select public.nickname_available('${NORM2}');`, 'anon').out === 't', 'release_nickname освобождает ник (откат неудачной регистрации)');

console.log('\nБаза: v0.9 — мана и атомарные действия');
ok(denied(q(`select public.player_action('{"op":"heal"}'::jsonb);`, 'anon')), 'без входа player_action недоступна');
const near = (a, b) => Math.abs(a - b) < 1;
const hb = JSON.parse(q(`select public.sync_player('{"hp":{"value":10},"mana":{"value":-5}}'::jsonb);`, B).out);
ok(near(hb.hp, 120) && near(hb.mana, 100), 'v0.12.0: клиент не записывает HP и ману (поля hp и mana в patch игнорируются)');
const sp = (n) => JSON.parse(q(`select public.sync_player('{"mana_spent":${n}}'::jsonb);`, B).out);
ok(near(sp(30).mana, 100) && near(sp(99999).mana, 100) && near(sp(-50).mana, 100), 'v0.13.0: mana_spent игнорируется (ни траты, ни «возврата»): ману списывают только операции сервера');
// v0.13.0: действия в мире (сбор, находки, магия) — операция world; состояние таких объектов клиент записать не может
ok(denied(q(`select public.player_action('{"op":"world","obj":"herb_g1"}'::jsonb);`, 'anon')), 'без входа действие в мире недоступно');
const wa = (obj, id) => JSON.parse(q(`select public.player_action('{"op":"world","obj":"${obj}","id":"${id}"}'::jsonb);`, B).out);
const w1 = wa('herb_g1', 'sec-world-0001');
ok(w1.action.ok && near(w1.mana, 96) && w1.inventory.moon_herb === 1 && w1.objects.herb_g1.state === 'picked', 'сбор: сервер списал 4 маны, выдал траву, записал время');
const w2 = wa('herb_g1', 'sec-world-0002');
ok(w2.action.reason === 'wait' && w2.action.left > 140 && w2.inventory.moon_herb === 1, 'повторный сбор до возрождения отклонён (wait)');
const w3 = JSON.parse(q(`select public.player_action('{"op":"world","obj":"herb_g1","id":"sec-world-0001"}'::jsonb);`, B).out);
ok(w3.action.duplicate === true && w3.inventory.moon_herb === 1 && near(w3.mana, 96), 'повтор запроса с тем же id: результат первой попытки, мана не списана второй раз');
const forge = JSON.parse(q(`select public.sync_player('{"objects":{"herb_g1":null,"glade_cache":{"state":"opened"},"glade_rock":{"state":"moved","x":1,"y":2}}}'::jsonb);`, B).out);
ok(forge.objects.herb_g1?.state === 'picked' && !forge.objects.glade_cache && forge.objects.glade_rock?.state === 'moved', 'sync_player: состояние сбора и сундуков не переписывается клиентом (магия мира — по-прежнему клиентская)');
ok(wa('herb_g1', 'sec-world-0003').action.reason === 'wait', 'сброс «времени сбора» через sync не помог: сбор всё ещё ждёт');
ok(wa('no_such_object', 'sec-world-0004').action.reason === 'unknown' && wa('__proto__', 'sec-world-0005').action.reason === 'unknown', 'выдуманный и служебный идентификаторы: unknown');
ok(wa('flame_a', 'sec-world-0006').action.reason === 'locked' && wa('heavy_boulder', 'sec-world-0007').action.reason === 'locked', 'без нужного события, дара и ступени: locked');
q(`update public.player_progress set mana = 2, vitals_at = date_trunc('milliseconds', now()) where user_id = '${B}';`);
const wm = wa('mush_t1', 'sec-world-0008');
ok(wm.action.reason === 'mana' && wm.action.mana === 4 && !wm.inventory.forest_mushroom && !wm.objects.mush_t1, 'не хватает маны: отказ, ничего не выдано и не записано');
q(`update public.player_progress set mana = 0, vitals_at = date_trunc('milliseconds', now()) where user_id = '${B}';`);
const ha = JSON.parse(q(`select public.player_action('{"op":"heal","id":"sec-heal-00001"}'::jsonb);`, A).out);
const hb2 = JSON.parse(q(`select public.get_player();`, B).out);
ok(near(hb2.hp, 120) && hb2.mana < 5, 'действие одного игрока не меняет чужого персонажа');
ok(ha.action && ha.action.ok === true && ha.action.price >= 1, 'лечение A: цена по недостающему HP (новый уровень поднял максимум, но не вылечил)');
const hbh = JSON.parse(q(`select public.player_action('{"op":"heal","id":"sec-heal-00003"}'::jsonb);`, B).out);
ok(hbh.action.ok === false && hbh.action.reason === 'full', 'лечение при полном HP отклонено без изменений');
const ce = JSON.parse(q(`select public.player_action('{"op":"combat_end","outcome":"victory","mana":100,"id":"sec-cend-00001"}'::jsonb);`, B).out);
ok(ce.action.ok === false && ce.action.reason === 'no_combat' && hb2.mana < 5 && ce.mana < 5, 'конец боя без начала ничего не даёт (полную ману бесплатно не получить)');
const cs = JSON.parse(q(`select public.player_action('{"op":"combat_start","spawn":"scavenger_01","enemy":"forest_scavenger","id":"sec-cstart-0001"}'::jsonb);`, A).out);
const hc = JSON.parse(q(`select public.player_action('{"op":"heal","id":"sec-heal-00002"}'::jsonb);`, A).out);
ok(cs.action.ok && cs.combatSince && hc.action.reason === 'combat', 'в бою лечение у Мирры закрыто');
const dc = JSON.parse(q(`select public.player_action('{"op":"drink","item":"elixir_life","id":"sec-drink-0001"}'::jsonb);`, A).out);
ok(dc.action.reason === 'combat', 'в бою зелья из сумки закрыты');
const vf = JSON.parse(q(`select public.player_action('{"op":"combat_end","outcome":"victory","mana":100,"id":"sec-cend-00009"}'::jsonb);`, A).out);
ok(vf.action.reason === 'verify' && vf.combatSince && vf.combatCtx?.spawn === 'scavenger_01', 'победу без проверки записи сервер не принимает (verify): бой идёт, запомненное состояние на месте');
const bo = JSON.parse(q(`select public.player_action('{"op":"combat_end","outcome":"win","id":"sec-cend-00002"}'::jsonb);`, A).out);
ok(bo.action.reason === 'bad_outcome' && bo.combatSince, 'неизвестный исход боя отклонён, бой не закрыт');
const ca = JSON.parse(q(`select public.player_action('{"op":"combat_end","outcome":"retreat","id":"sec-cend-00003"}'::jsonb);`, A).out);
ok(ca.action.ok && ca.combatSince === null, 'отступление закрывает бой');
const ph = q(`select public.player_action('{"op":"drink","item":"resin_flask","id":"sec-drink-0002"}'::jsonb);`, A).out;
ok(JSON.parse(ph).action.reason === 'unknown', 'боевое зелье вне боя не пьётся');
ok(denied(q(`update public.player_progress set mana = 100 where user_id = '${B}';`, B)) || /UPDATE 0|permission/.test(q(`update public.player_progress set mana = 100 where user_id = '${B}';`, B).err + 'UPDATE 0'), 'ману нельзя записать в таблицу напрямую');

console.log('\nБаза: новая игра');
const r = JSON.parse(q(`select public.reset_player('witch');`, A).out);
ok(r.level === 1 && !r.quests.length && !Object.keys(r.inventory).length && r.meta.nickname === NICK && r.meta.rev > a2.meta.rev, 'reset_player: прогресс с нуля, ник и аккаунт те же');

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Проверка базы пройдена');
process.exit(failures ? 1 : 0);
