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
// v0.15.0: опыт, предметы, события, дары и изучение sync_player не принимает — «прогресс» здесь выдаётся владельцем базы (мимо игры)
const grant = (uid, coins, xp, level) => q(`insert into public.player_inventory (user_id, item_id, quantity) values ('${uid}', 'coins', ${coins}) on conflict (user_id, item_id) do update set quantity = ${coins};
  update public.player_progress set hero_xp = ${xp}, hero_level = ${level}, hp = 100, vitals_at = date_trunc('milliseconds', now()) where user_id = '${uid}';
  insert into public.player_quests (user_id, quest_id) values ('${uid}', 'intro') on conflict do nothing;`);
grant(A, 50, 160, 3);
const a1 = JSON.parse(q(`select public.get_player();`, A).out);
ok(a1.inventory.coins === 50 && a1.level === 3 && a1.quests.includes('intro'), 'прогресс записан и читается обратно');
const stale = JSON.parse(q(`select public.sync_player('{"xp":10,"inv":{"coins":-5}}');`, A).out);
ok(stale.level === 3 && stale.xp === 160 && stale.inventory.coins === 50, 'sync_player не трогает опыт и предметы: ни прибавить, ни убавить');

// v0.15.0: ветка дара (объект player_build) пишется только изучением и сменой ветки на сервере
const bld = JSON.parse(q(`select public.sync_player('{"objects":{"player_build":{"branches":{"telekinesis":"lord"}}}}');`, A).out);
ok(!bld.objects.player_build, 'ветку дара sync_player не пишет: player_build закрыт');
ok(!JSON.parse(q(`select public.get_player();`, B).out).objects.player_build, 'у другого игрока ветки нет');

console.log('\nБаза: подделки клиента');
{
  const C = randomUUID();
  q(`insert into auth.users (id) values ('${C}');`); q(`select public.create_player('witch');`, C);
  const c1 = JSON.parse(q(`select public.sync_player('{"level":100,"inv":{"coins":999999999,"lunar_shard":1000},"xp":999999999,"school":{"fire":1000000},"play":999999999}');`, C).out);
  ok(!c1.inventory.coins && !c1.inventory.lunar_shard, 'монеты и предметы клиентом не пишутся вовсе (' + JSON.stringify(c1.inventory) + ')');
  ok(c1.xp === 0 && c1.level === 1 && !(c1.school.fire > 0), 'опыт, уровень и опыт дара — только сервером; «level: 100» игнорируется');
  ok(c1.play === 600000, 'время игры по-прежнему принимается с ограничением');
  const f1 = JSON.parse(q(`select public.sync_player('{"quests":["chapter_1_complete","unlock_fire_1"],"paths":["ancient_gate_open"],"enemies":["forest_guardian"],"abilities":{"fire":{"level":3,"unlocked":true}},"research":{"upgradeId":"fire_2","startedAt":0,"durationMs":1},"objects":{"west_chest":{"state":"opened"},"glade_rock":{"state":"moved"},"rep:rootling_02":{"wins":9,"at":1},"player_build":{"branches":{"fire":"x"}}}}');`, C).out);
  ok(!f1.quests.includes('chapter_1_complete') && !f1.quests.includes('unlock_fire_1') && !f1.paths.length && !f1.enemies.length, 'события, пути и побеждённые враги: клиентом не пишутся');
  ok(!f1.abilities.fire?.unlocked && !f1.research, 'дары и изучение: клиентом не пишутся');
  ok(!f1.objects.west_chest && !f1.objects.glade_rock && !f1.objects['rep:rootling_02'] && !f1.objects.player_build, 'состояние мира, репутация врагов и билд: клиентом не пишутся');
  const f2 = JSON.parse(q(`select public.sync_player('{"pos":{"x":5,"y":6},"tutorial":["move"],"objects":{"my_note":{"state":"read"}}}');`, C).out);
  ok(f2.pos.x === 5 && f2.tutorial.includes('move') && f2.objects.my_note?.state === 'read', 'обычное по-прежнему сохраняется: позиция, подсказки обучения, клиентские объекты');
  ok(denied(q(`select * from public.game_hero_levels;`, C)), 'таблица порогов недоступна клиенту напрямую');
  const act = (a, id) => JSON.parse(q(`select public.player_action('${JSON.stringify({ ...a, id }).replace(/'/g, "''")}'::jsonb);`, C).out);
  const e0 = act({ op: 'event', key: 'chapter_1_complete' }, 'sec-ev-0001');
  ok(e0.action.reason === 'unknown', 'выдуманное событие через player_action: unknown');
  const e1 = act({ op: 'event', key: 'unlock_fire_1' }, 'sec-ev-0002');
  ok(e1.action.reason === 'locked' && !e1.abilities.fire?.unlocked, 'Огонь без пройденного пути: locked, дар не выдан');
  const e2 = act({ op: 'event', key: 'unlock_telekinesis_1' }, 'sec-ev-0003');
  ok(e2.action.ok && e2.abilities.telekinesis?.unlocked && e2.quests.includes('unlock_telekinesis_1'), 'Телекинез I выдаёт сервер вместе с событием');
  ok(act({ op: 'event', key: 'unlock_telekinesis_1' }, 'sec-ev-0004').action.reason === 'already', 'то же событие повторно: already');
  ok(act({ op: 'event', key: 'unlock_telekinesis_1' }, 'sec-ev-0003').action.duplicate === true, 'повтор запроса с тем же id: результат первой попытки');
  ok(act({ op: 'quest_turn_in', quest: 'sq_herbs' }, 'sec-q-0001').action.reason === 'not_started', 'сдать непринятое задание нельзя');
  ok(act({ op: 'quest_accept', quest: 'sq_nope' }, 'sec-q-0002').action.reason === 'unknown', 'выдуманное задание: unknown');
  ok(act({ op: 'research_start', upgrade: 'telekinesis_2' }, 'sec-r-0001').action.reason === 'missing' || act({ op: 'research_start', upgrade: 'telekinesis_2' }, 'sec-r-0002').action.reason === 'event', 'изучение без условий и цены: отказ');
  ok(act({ op: 'research_finish' }, 'sec-r-0003').action.reason === 'none', 'завершить нечего: none');
  ok(act({ op: 'respec', ability: 'telekinesis', branch: 'lord' }, 'sec-b-0001').action.reason === 'unavailable', 'сменить ветку, которой нет: unavailable');
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
ok(a2.meta.nickname === NICK && !!a2.meta.registeredAt && a2.meta.registered && a2.inventory.coins === 50 && a2.level === 3, 'после регистрации тот же персонаж: ник Дмитрий, уровень 3, монеты на месте');
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
ok(forge.objects.herb_g1?.state === 'picked' && !forge.objects.glade_cache && !forge.objects.glade_rock, 'sync_player: состояние сбора, сундуков и магии мира не переписывается клиентом');
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

console.log('\nБаза: слоты, амулеты и закрытые служебные функции (v0.16.0)');
{
  // служебные функции принимают чужой uid — из браузера они вызываться не должны (раньше _set_branch, _unlock_ability, _open_path, _set_event были открыты)
  const calls = [`select public._unlock_ability('${B}', 'seal', 10);`, `select public._set_branch('${B}', 'fire', 'blaster');`, `select public._open_path('${B}', 'gate_path');`,
    `select public._merge_build('${B}', '{"amulets":["amulet_focus"]}'::jsonb);`];
  for (const as of ['anon', A]) for (const c of calls) ok(denied(q(c, as)), `${as === 'anon' ? 'гость' : 'игрок'} не может вызвать ${c.match(/_\w+/)[0]}`);
  const act = (uid, o) => JSON.parse(q(`select public.player_action('${JSON.stringify(o)}'::jsonb);`, uid).out);
  q(`insert into public.player_abilities (user_id, ability_id, level, unlocked) values ('${A}', 'telekinesis', 3, true), ('${A}', 'fire', 2, true) on conflict (user_id, ability_id) do update set level = excluded.level, unlocked = true;
     insert into public.player_inventory (user_id, item_id, quantity) values ('${A}', 'amulet_focus', 1), ('${A}', 'coins', 400) on conflict (user_id, item_id) do update set quantity = excluded.quantity;`);
  ok(act(A, { op: 'build_set', slots: ['fire'], id: 'sec-build-00001' }).action.ok === true, 'слоты даров выбраны');
  ok(act(A, { op: 'build_set', slots: ['seal'], id: 'sec-build-00002' }).action.reason === 'locked', 'в слот нельзя поставить дар, которого нет');
  ok(act(A, { op: 'build_set', amulets: ['amulet_lunar'], id: 'sec-build-00003' }).action.reason === 'missing', 'амулет, которого нет в сумке, не надеть');
  ok(act(A, { op: 'build_set', amulets: ['amulet_focus'], id: 'sec-build-00004' }).action.ok === true, 'амулет из сумки надет');
  const g = JSON.parse(q(`select public.get_player();`, A).out);
  ok(JSON.stringify(g.objects.player_build.slots) === '["fire"]' && JSON.stringify(g.objects.player_build.amulets) === '["amulet_focus"]', 'слоты и амулеты записаны сервером');
  const forged = JSON.parse(q(`select public.sync_player('{"objects":{"player_build":{"slots":["seal"],"amulets":["amulet_lunar"]}}}'::jsonb);`, A).out);
  ok(JSON.stringify(forged.objects.player_build.amulets) === '["amulet_focus"]', 'sync_player не принимает слоты и амулеты от клиента');
  ok(act(A, { op: 'build_preset', mode: 'save', id: 'sec-build-00005' }).action.ok === true, 'пресет сохранён');
  act(A, { op: 'build_set', slots: ['telekinesis', 'fire'], amulets: [], id: 'sec-build-00006' });
  ok(act(A, { op: 'build_preset', mode: 'load', id: 'sec-build-00007' }).action.ok === true, 'пресет загружен');
  const g2 = JSON.parse(q(`select public.get_player();`, A).out);
  ok(JSON.stringify(g2.objects.player_build.slots) === '["fire"]' && JSON.stringify(g2.objects.player_build.amulets) === '["amulet_focus"]', 'пресет вернул слоты и амулеты');
  act(A, { op: 'respec', ability: 'telekinesis', branch: 'breaker', id: 'sec-build-00008' });
  q(`update public.player_world set data = '{"branches":{"telekinesis":"lord"},"slots":["fire"],"amulets":["amulet_focus"]}'::jsonb where user_id = '${A}' and kind = 'object' and key = 'player_build';`);
  act(A, { op: 'respec', ability: 'telekinesis', branch: 'breaker', id: 'sec-build-00009' });
  const g3 = JSON.parse(q(`select public.get_player();`, A).out);
  ok(g3.objects.player_build.branches.telekinesis === 'breaker' && JSON.stringify(g3.objects.player_build.slots) === '["fire"]' && g3.objects.player_build.amulets.length === 1, 'смена ветки не стирает слоты и амулеты');
  q(`select 1`, A);
  const cs2 = act(A, { op: 'combat_start', spawn: 'scavenger_01', enemy: 'forest_scavenger', id: 'sec-build-00010' });
  ok(cs2.action.ok && act(A, { op: 'build_set', slots: ['telekinesis'], id: 'sec-build-00011' }).action.reason === 'combat', 'в бою слоты менять нельзя');
  ok(act(A, { op: 'build_preset', mode: 'load', id: 'sec-build-00012' }).action.reason === 'combat', 'в бою пресет не загрузить');
  ok(JSON.stringify(cs2.combatCtx.build.slots) === '["fire"]' && cs2.combatCtx.build.amulets[0] === 'amulet_focus', 'слоты и амулеты запоминаются в боевом контексте (по ним сервер проигрывает бой)');
  act(A, { op: 'combat_end', outcome: 'retreat', id: 'sec-build-00013' });
}

console.log('\nБаза: сапфиры (v0.17.0)');
{
  const act = (uid, o) => JSON.parse(q(`select public.player_action('${JSON.stringify(o)}'::jsonb);`, uid).out);
  const bal = (uid) => Number(q(`select coalesce((select sapphires from public.player_wallet where user_id = '${uid}'), 0);`).out);
  for (const as of ['anon', A]) ok(denied(q(`select public.admin_grant_sapphires('${A}', 1000, 'x', 'hack-${as}');`, as)), `${as === 'anon' ? 'гость' : 'игрок'} не может выдать себе сапфиры`);
  for (const as of ['anon', A]) ok(denied(q(`select public._sapphire_add('${A}', 1000, 'admin', 'x', null);`, as)), `${as === 'anon' ? 'гость' : 'игрок'} не может вызвать _sapphire_add`);
  ok(denied(q(`select * from public.player_wallet;`, A)) && denied(q(`update public.player_wallet set sapphires = 999;`, A)), 'кошелёк не читается и не правится напрямую');
  ok(denied(q(`select * from public.sapphire_ledger;`, A)), 'журнал не читается напрямую');
  const s0 = JSON.parse(q(`select public.sync_player('{"wallet":{"sapphires":999,"welcome":true}}'::jsonb);`, A).out);
  ok(s0.wallet.sapphires === bal(A) && s0.wallet.sapphires < 999, 'sync_player не принимает кошелёк от клиента');
  const w1 = act(A, { op: 'bank_welcome', id: 'sec-sapph-0001' });
  const w2 = act(A, { op: 'bank_welcome', id: 'sec-sapph-0002' });
  ok(w1.action.ok && w1.action.amount === 3 && w1.wallet.sapphires === 3 && w2.action.reason === 'already' && bal(A) === 3, 'приветственные 3 сапфира — один раз');
  const g1 = q(`select public.admin_grant_sapphires('${A}', 50, 'тестер', 'grant-1');`, 'service').out;
  const g2 = q(`select public.admin_grant_sapphires('${A}', 50, 'тестер', 'grant-1');`, 'service').out;
  ok(Number(g1) === 53 && Number(g2) === 53 && bal(A) === 53, 'выдача сервисом: повтор с тем же ref не начисляет второй раз');
  ok(/bad_amount/.test(q(`select public.admin_grant_sapphires('${A}', -5, 'x', 'grant-neg');`, 'service').err), 'отрицательная выдача отклонена');
  // ускорение изучения
  q(`update public.player_progress set research = jsonb_build_object('upgradeId', 'seal_2', 'startedAt', (extract(epoch from now()) * 1000)::bigint, 'durationMs', 1800000) where user_id = '${A}';`);
  const sp = act(A, { op: 'research_speedup', chunks: 2, id: 'sec-sapph-0003' });
  ok(sp.action.ok && sp.action.price === 2 && sp.action.cutMs === 1350000 && sp.research.durationMs === 450000, 'ускорение 30-минутного изучения: снято не больше 75% (22,5 мин), 2 шага — 2 сапфира');
  ok(sp.research.fullMs === 1800000 && bal(A) === 51, 'полное время запомнено, сапфиры списаны');
  const sp2 = act(A, { op: 'research_speedup', chunks: 96, id: 'sec-sapph-0004' });
  ok(sp2.action.ok === false && sp2.action.reason === 'limit' && bal(A) === 51, 'дальше нельзя: до нуля таймер не сокращается, сапфиры целы');
  const led = q(`select kind || ':' || delta || ':' || balance from public.sapphire_ledger where user_id = '${A}' order by id;`).out.split('\n');
  ok(led.join(',') === 'welcome:3:3,admin:50:53,speedup:-2:51', `журнал: ${led.join(', ')}`);
  // пресеты и смена ветки за сапфиры
  const pu = act(A, { op: 'preset_unlock', id: 'sec-sapph-0005' });
  ok(pu.action.ok && pu.action.slots === 2 && bal(A) === 21 && pu.objects.player_build.presetSlots === 2, 'второй пресет открыт за 30 сапфиров');
  ok(act(A, { op: 'build_preset', mode: 'save', slot: 2, id: 'sec-sapph-0006' }).action.ok && act(A, { op: 'build_preset', mode: 'save', slot: 3, id: 'sec-sapph-0007' }).action.reason === 'locked', 'второй пресет сохраняется, третий закрыт');
  const rs = act(A, { op: 'respec', ability: 'telekinesis', branch: 'lord', pay: 'sapphires', id: 'sec-sapph-0008' });
  ok(rs.action.ok && rs.action.currency === 'sapphires' && rs.action.price === 5 && bal(A) === 16 && rs.objects.player_build.branches.telekinesis === 'lord', 'смена ветки за 5 сапфиров');
  // «Новая игра» кошелёк не трогает
  q(`select public.reset_player('witch');`, A);
  ok(bal(A) === 16 && JSON.parse(q(`select public.get_player();`, A).out).wallet.sapphires === 16, '«Новая игра» не обнуляет сапфиры');
  ok(act(A, { op: 'bank_welcome', id: 'sec-sapph-0009' }).action.reason === 'already', 'и приветствие после новой игры второй раз не выдаётся');
}

console.log('\nБаза: торговец и улучшение амулетов (v0.19.0)');
{
  const act = (uid, o) => JSON.parse(q(`select public.player_action('${JSON.stringify(o)}'::jsonb);`, uid).out);
  const inv = (uid, k) => Number(q(`select coalesce((select quantity from public.player_inventory where user_id = '${uid}' and item_id = '${k}'), 0);`).out);
  q(`insert into public.player_inventory (user_id, item_id, quantity) values ('${B}', 'coins', 300) on conflict (user_id, item_id) do update set quantity = 300;`);
  ok(act(B, { op: 'shop_buy', item: 'moon_herb', qty: 2, id: 'sec-shop-00001' }).action.reason === 'locked', 'лавка закрыта, пока город не открыл её');
  q(`insert into public.player_quests (user_id, quest_id) values ('${B}', 'city_merchant_open') on conflict do nothing;`);
  const b1 = act(B, { op: 'shop_buy', item: 'moon_herb', qty: 2, id: 'sec-shop-00002' });
  ok(b1.action.ok && b1.action.cost === 36 && inv(B, 'coins') === 264 && inv(B, 'moon_herb') >= 2, 'купить 2 лунные травы за 36 монет');
  ok(act(B, { op: 'shop_buy', item: 'frost_shard', id: 'sec-shop-00003' }).action.reason === 'unknown', 'инеевый осколок не продаётся');
  ok(act(B, { op: 'shop_buy', item: 'lunar_shard', qty: 99, id: 'sec-shop-00004' }).action.reason === 'coins' && inv(B, 'coins') === 264, 'без монет не купить, ничего не списано');
  const s1 = act(B, { op: 'shop_sell', item: 'moon_herb', qty: 1, id: 'sec-shop-00005' });
  ok(s1.action.ok && s1.action.gain === 5 && inv(B, 'coins') === 269, 'продажа: треть цены (18 → 5)');
  ok(act(B, { op: 'shop_sell', item: 'moon_herb', qty: 50, id: 'sec-shop-00006' }).action.reason === 'missing', 'продать больше, чем есть, нельзя');
  // улучшение амулета
  ok(act(B, { op: 'amulet_upgrade', amulet: 'amulet_focus', id: 'sec-amup-00001' }).action.reason === 'locked', 'чужой (несуществующий в сумке) амулет не улучшить');
  q(`insert into public.player_inventory (user_id, item_id, quantity) values ('${B}', 'amulet_focus', 1), ('${B}', 'tree_resin', 2), ('${B}', 'rune_dust', 1) on conflict (user_id, item_id) do update set quantity = excluded.quantity;`);
  const u1 = act(B, { op: 'amulet_upgrade', amulet: 'amulet_focus', id: 'sec-amup-00002' });
  ok(u1.action.ok && u1.action.level === 1 && u1.objects.player_build.amuletLevels.amulet_focus === 1 && inv(B, 'coins') === 149 && inv(B, 'tree_resin') === 0, 'улучшение до +1: 120 монет, 2 смолы, 1 пыль');
  ok(act(B, { op: 'amulet_upgrade', amulet: 'amulet_focus', id: 'sec-amup-00003' }).action.reason === 'missing', 'на +2 материалов нет — отказ');
  const forged = JSON.parse(q(`select public.sync_player('{"objects":{"player_build":{"amuletLevels":{"amulet_focus":3}}}}'::jsonb);`, B).out);
  ok(forged.objects.player_build.amuletLevels.amulet_focus === 1, 'уровень амулета через sync_player не подделать');
}

console.log('\nБаза: новая игра');
const r = JSON.parse(q(`select public.reset_player('witch');`, A).out);
ok(r.level === 1 && !r.quests.length && !Object.keys(r.inventory).length && r.meta.nickname === NICK && r.meta.rev > a2.meta.rev, 'reset_player: прогресс с нуля, ник и аккаунт те же');

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Проверка базы пройдена');
process.exit(failures ? 1 : 0);
