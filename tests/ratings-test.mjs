// v0.29.0 — рейтинги: уровни монстров, лучшая победа, правила для сервера, знак «в игре» (Presence), меню.
//   node tests/ratings-test.mjs
import { MONSTER_LEVELS, RATINGS, TABS, bestKillOf, monsterLevel, ratingsRules } from '../src/config/ratings.js';
import { ENEMIES } from '../src/config/balance.enemies.js';
import { ENEMY_SPAWNS } from '../src/config/world.layout.js';
import { HERO_LEVELS } from '../src/config/balance.hero.js';
import { MENU_ITEMS } from '../src/config/menu.config.js';
import { Presence } from '../src/cloud/Presence.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };

console.log('\nРейтинги: уровни монстров');
{
  const ids = Object.keys(ENEMIES);
  ok(ids.every((id) => MONSTER_LEVELS[id] > 0), 'у каждого монстра игры есть уровень' + (ids.filter((id) => !MONSTER_LEVELS[id]).length ? ': нет у ' + ids.filter((id) => !MONSTER_LEVELS[id]).join(', ') : ''));
  ok(Object.keys(MONSTER_LEVELS).every((id) => ENEMIES[id]), 'в таблице уровней нет несуществующих монстров');
  ok(Object.values(MONSTER_LEVELS).every((l) => Number.isInteger(l) && l >= 1 && l <= HERO_LEVELS.length), `уровни монстров — от 1 до ${HERO_LEVELS.length} (как у героя)`);
  const L = MONSTER_LEVELS;
  ok(L.forest_scavenger < L.rootling && L.rootling < L.forest_guardian && L.forest_guardian < L.node_guardian && L.node_guardian < L.frost_critter, 'глава I: от Падальщика до Хранителя сердца уровень растёт');
  ok(L.frost_critter <= L.frost_collector && L.frost_collector < L.ice_guardian && L.ice_guardian < L.severin_boss, 'глава II: от зверька до Северина уровень растёт, босс — выше всех в сюжете');
  ok(Math.max(...Object.values(L)) === L.severin_boss && L.frost_alpha === L.severin_boss && L.barrow_warden === L.severin_boss, 'вожак вылазки и Страж кургана — на уровне Северина (самые сильные)');
  ok(monsterLevel('nobody') === 0, 'неизвестный монстр — уровень 0, в рейтинг не идёт');
}

console.log('\nРейтинги: лучшая победа');
{
  ok(bestKillOf([]) === null && bestKillOf(['no_such_spawn']) === null, 'без побед (или с неизвестной точкой) — лучшей победы нет');
  const a = bestKillOf(['scavenger_01', 'rootling_01', 'forest_guardian_01']);
  ok(a.enemy === 'forest_guardian' && a.level === 4, 'из нескольких побед берётся самая высокая по уровню');
  const t = bestKillOf(['fw_alpha', 'gy_warden', 'final_severin']);
  ok(t.enemy === 'severin_boss' && t.power === 1500, 'при равном уровне — монстр с большим здоровьем (Северин 1500)');
  ok(bestKillOf(['scavenger_01', 'scavenger_02']).enemy === 'forest_scavenger', 'повторные победы над слабыми остаются слабой лучшей победой');
}

console.log('\nРейтинги: правила для сервера');
{
  const r = ratingsRules();
  ok(JSON.parse(JSON.stringify(r)).top === RATINGS.top && r.onlineSec === RATINGS.onlineSec, 'число мест и окно «в игре» уходят на сервер');
  ok(Object.keys(r.levels).every((e) => r.power[e] > 0) && Object.values(r.spawns).every((e) => r.levels[e]), 'у каждого монстра есть уровень и здоровье, у точки боя — известный монстр');
  const real = ENEMY_SPAWNS.filter((s) => MONSTER_LEVELS[s.enemy]);
  ok(Object.keys(r.spawns).length === real.length && real.every((s) => r.spawns[s.id] === s.enemy), `все ${real.length} точек боя сопоставлены монстрам`);
  ok(TABS.map((t) => t.id).join() === 'level,monster,arena,online', 'вкладки: уровень, монстры, арена, онлайн');
  ok(RATINGS.pingSec * 2 < RATINGS.onlineSec, 'знак подаётся минимум дважды за окно «в игре»');
}

console.log('\nОнлайн: знак присутствия');
{
  const mkDoc = (state) => { const ls = {}; return { visibilityState: state, addEventListener: (n, f) => { ls[n] = f; }, removeEventListener: (n) => { delete ls[n]; }, ls }; };
  const run = async (status, vis) => {
    const calls = [], ivs = [];
    const session = { status, api: { presencePing: async () => { calls.push('ping'); } }, _authed: async (fn) => fn('t'), onChange: () => {} };
    const doc = mkDoc(vis);
    const p = new Presence(session, { doc, setInterval: (fn, ms) => { ivs.push({ fn, ms }); return ivs.length; }, clearInterval: () => {} });
    p.start(); await Promise.resolve(); await Promise.resolve();
    return { p, calls, ivs, doc, session };
  };
  let r = await run('ready', 'visible');
  ok(r.calls.length === 1 && r.ivs[0].ms === RATINGS.pingSec * 1000, 'в игре и вкладка видна: знак сразу и дальше раз в ' + RATINGS.pingSec + ' с');
  await r.ivs[0].fn(); await Promise.resolve();
  ok(r.calls.length === 2, 'по таймеру — следующий знак');
  r.doc.visibilityState = 'hidden'; await r.ivs[0].fn(); await Promise.resolve();
  ok(r.calls.length === 2, 'вкладка скрыта — знака нет (игрок не в игре)');
  r.doc.visibilityState = 'visible'; r.doc.ls.visibilitychange(); await Promise.resolve(); await Promise.resolve();
  ok(r.calls.length === 3, 'вернулся на вкладку — знак сразу');
  r.p.stop(); ok(!r.doc.ls.visibilitychange, 'остановка снимает подписку');
  r = await run('loading', 'visible');
  ok(r.calls.length === 0, 'пока вход не готов (загрузка, нет связи, не вошёл) знак не подаётся');
  const bad = await run('ready', 'visible');
  bad.session.api.presencePing = async () => { throw new Error('offline'); };
  ok((await bad.p.ping()) === false, 'ошибка связи молча пропускается');
}

console.log('\nРейтинги: меню');
{
  const it = MENU_ITEMS.find((m) => m.id === 'rating');
  ok(it && !it.stub && it.label === 'Рейтинг', 'пункт «Рейтинг» больше не заглушка');
}

console.log(failures ? `\n✗ Провалов: ${failures}` : '\n✓ Рейтинги и онлайн: всё в порядке');
process.exit(failures ? 1 : 0);
