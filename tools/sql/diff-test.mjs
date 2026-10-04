// Дифф-тест: SQL-функция sync_player (supabase/schema.sql) против applyPatch (src/cloud/playerModel.js).
// Случайные, в том числе испорченные, patch прогоняются через настоящий Postgres и через JS; снимки должны совпасть шаг за шагом.
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/diff-test.mjs [число серий]
// В базе должна быть схема из supabase/schema.sql и заглушка Supabase Auth (tools/sql/auth-stub.sql).
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { applyPatch, applyAction, advanceVitals, fillDefaults, emptySnapshot } from '../../src/cloud/playerModel.js';
import { HERO_LEVELS } from '../../src/config/balance.hero.js';

import { serverRules } from '../../src/config/storyItems.js';

const SERIES = Number(process.argv[2]) || 60, STEPS = 14;
const RULES = serverRules();
const RECIPE_IDS = Object.keys(RULES.recipes), USE_IDS = Object.keys(RULES.uses);
const CHAPTER_ITEMS = ['moon_herb', 'forest_mushroom', 'tree_resin', 'rune_dust', 'lunar_shard', 'lunar_flame', 'rare_core', 'elixir_life', 'elixir_mana', ...USE_IDS];
const CHAPTER_EVENTS = [...new Set([...Object.values(RULES.recipes).flatMap(r => [...r.requires, ...r.blockedBy]), ...Object.values(RULES.uses).flatMap(u => [...u.requires, ...u.blockedBy]),
  RULES.firstCraft.event, RULES.migration.event])];
let seed = 12345;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NUMS = [0, 1, 2, 3, 5, 10, 40, -1, -3, -100, 2.7, -2.7, 1000, 1e6, 1e9, 1e12, 1e15, 1e20, -1e9, '5', null, true, [], {}];
const IDS = ['coins', 'lunar_shard', 'lunar_flame', 'potion_1', 'ev_a', 'ev_b', 'ev:c', 'gate.1', 'bad id', '', 'x'.repeat(65), 'ok', 'ключ', 7, null];
const num = () => pick(NUMS);
const maybe = (p, f) => (rnd() < p ? f() : undefined);
const arrOf = (f, n = 3) => Array.from({ length: Math.floor(rnd() * n) + 1 }, f);
function randomPatch() {
  const p = {};
  const set = (k, v) => { if (v !== undefined) p[k] = v; };
  set('level', maybe(0.25, num)); set('xp', maybe(0.3, num));
  set('school', maybe(0.25, () => rnd() < 0.1 ? 'x' : Object.fromEntries(['telekinesis', 'fire', 'seal', 'bogus'].filter(() => rnd() < 0.6).map(k => [k, num()]))));
  set('inv', maybe(0.4, () => rnd() < 0.05 ? [1] : Object.fromEntries(arrOf(() => [pick(IDS), num()], 4).filter(([k]) => typeof k === 'string'))));
  set('abilities', maybe(0.25, () => Object.fromEntries(['telekinesis', 'fire', 'seal', 'nope'].filter(() => rnd() < 0.5).map(k => [k, rnd() < 0.1 ? 5 : { level: num(), unlocked: pick([true, false, 'yes', null]) }]))));
  for (const k of ['quests', 'paths', 'enemies', 'tutorial']) set(k, maybe(0.3, () => rnd() < 0.05 ? 'oops' : arrOf(() => pick(IDS))));
  set('objects', maybe(0.3, () => Object.fromEntries(arrOf(() => [String(pick(IDS)), pick([null, { state: 'moved', x: 10, y: 20 }, { state: 'burnt' }, 5, [1], 'str'])], 3))));
  set('research', maybe(0.2, () => pick([{ value: null }, { value: { upgradeId: 'tk2', startedAt: 1700000000000, durationMs: 60000 } }, { value: 5 }, {}, 'x'])));
  set('pos', maybe(0.3, () => pick([{ x: 100, y: 200 }, { x: 700, y: 5000 }, { x: 640, y: 4880 }, { x: 1160, y: 5300 }, { x: 1161, y: 5000 }, { x: 1.5, y: -2 }, { x: 'a', y: 2 }, { x: 1 }, 7])));
  set('safe', maybe(0.15, () => pick([{ x: 900, y: 4820 }, { x: null, y: 1 }])));
  set('hp', maybe(0.2, () => pick([{ value: 55.5 }, { value: null }, { value: 'x' }, {}, 3, { value: 0 }, { value: -4 }, { value: 9999 }, { value: 30.25 }])));
  set('mana', maybe(0.2, () => pick([{ value: 12.5 }, { value: null }, { value: 0 }, { value: -1 }, { value: 500 }, { value: 'x' }, {}, 7])));
  set('mana_spent', maybe(0.25, () => pick([0, 5, 30, 100, 2000, -5, 2.5, 'x', null, true])));   // v0.12.0: единственный способ клиента менять ману
  set('play', maybe(0.4, () => pick([1000, 60000, 86400000, 99999999999, -5, 'x', 2.9])));
  set('combats', maybe(0.25, () => rnd() < 0.05 ? 'x' : arrOf(() => pick([{ enemy: 'forest_scavenger', result: 'victory', timeSec: 26.5 }, { enemy: 'x', result: 'defeat', timeSec: 3 }, 5, null, [1]]), 30)));
  return p;
}

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
const canonR = (v) => JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));   // числа с точностью 1e-6: Postgres считает в numeric, JS — в double
const sorted = (a) => [...a].sort();
const comparable = (s) => ({ ...s, quests: sorted(s.quests), paths: sorted(s.paths), enemies: sorted(s.enemies), tutorial: sorted(s.tutorial) });

function psql(script) {
  return execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: script, encoding: 'utf8', maxBuffer: 1 << 26, env: process.env }).split('\n').filter(l => l.startsWith('{'));
}

let bad = 0, steps = 0;
const COVER = {};   // какие исходы операций встретились (успех и каждая причина отказа)
{ // пороги уровней на сервере = HERO_LEVELS
  const rows = execFileSync('psql', ['-X', '-q', '-At', '-c', 'select level, xp, max_hp, max_mana from public.game_hero_levels order by level'], { encoding: 'utf8', env: process.env }).trim().split('\n').map(l => l.split('|').map(Number));
  const want = HERO_LEVELS.map(r => [r.level, r.xp, r.maxHp, r.maxMana]);
  if (JSON.stringify(rows) !== JSON.stringify(want)) { bad++; console.log('✗ game_hero_levels не совпадает с HERO_LEVELS:', JSON.stringify(rows), JSON.stringify(want)); }
  else console.log('  ✓ пороги уровней на сервере совпадают с HERO_LEVELS');
}
// v0.10: сценарий главы целиком — каждая операция и каждая причина отказа (повтор того же id, новый id после успеха,
// нехватка маны при ремонте, повышение уровня наградой) — до случайных серий
const A = (op, extra = {}, id = randomUUID()) => ({ __action: { op, id, ...extra } });
const S = (sec) => ({ __shift: sec });   // v0.12.0: «прошло sec секунд» — записи игрока на сервере сдвигаются в прошлое
const wickId = randomUUID();
const SCRIPTED = [
  { inv: { lunar_flame: 3, moon_herb: 5, tree_resin: 4, rune_dust: 6, forest_mushroom: 3, lunar_shard: 2, rare_core: 1 } },
  A('craft', { recipe: 'lunar_wick' }), { quests: ['lunar_quest_start'] },
  A('craft', { recipe: 'lunar_wick' }, wickId), A('craft', { recipe: 'lunar_wick' }, wickId), A('craft', { recipe: 'lunar_wick' }),
  A('use', { item: 'lunar_wick' }), A('use', { item: 'lunar_wick' }),
  A('craft', { recipe: 'revealing_compound' }), A('use', { item: 'revealing_compound' }),
  { quests: ['guardian_defeated'], enemies: ['forest_guardian_01'], xp: 600 }, A('use', { item: 'revealing_compound' }),
  A('craft', { recipe: 'restoration_bundle' }), A('use', { item: 'restoration_bundle' }),
  { quests: ['chapter_trial_defeated', 'unlock_seal_1'], mana: { value: 10 } }, A('use', { item: 'restoration_bundle' }),
  { mana: { value: 60 } }, A('use', { item: 'restoration_bundle' }), A('use', { item: 'restoration_bundle' }),
  A('craft', { recipe: 'restoration_bundle' }), A('migrate_v10'), A('migrate_v10'),
  A('craft', { recipe: 'elixir_life' }), A('craft', { recipe: 'resin_flask' }), A('craft', { recipe: 'elixir_mana' }),
  // v0.12.0: восстановление по времени сервера, дом Мирры, зелья, бой, бой без вестей, повышение уровня
  { inv: { elixir_life: 3, elixir_mana: 3, coins: 40 } }, { mana_spent: 40 }, S(10), { pos: { x: 700, y: 5000 } }, S(20), { mana_spent: 15 },
  A('drink', { item: 'elixir_mana' }), A('drink', { item: 'elixir_life' }), A('drink', { item: 'resin_flask' }), A('drink', { item: 'nope' }), A('heal'),
  S(100000), A('drink', { item: 'elixir_life' }), A('drink', { item: 'elixir_mana' }),
  { mana_spent: 50 }, A('combat_start'), A('combat_start'), S(300), { mana_spent: 20 }, A('drink', { item: 'elixir_life' }), A('heal'),
  { hp: { value: 3 }, mana: { value: 3 } }, A('combat_end', { outcome: 'cheat', mana: 50 }), A('combat_end', { outcome: 'defeat', mana: 33.5 }), A('combat_end', { outcome: 'victory', mana: 50 }),
  S(40), A('combat_start'), S(500), { xp: 200 }, A('combat_end', { outcome: 'retreat', mana: 99 }),
  A('combat_start'), S(901), { play: 1000 }, A('combat_end', { outcome: 'victory', mana: 500 }),
  { pos: { x: 100, y: 200 } }, S(50), { mana_spent: 1 }, A('combat_start'), S(5000), A('combat_end', { outcome: 'defeat', mana: -4 }), A('combat_end', { outcome: 'defeat', mana: 'x' }),
];
for (let s = 0; s < SERIES + 1; s++) {
  const uid = randomUUID();
  // шаг — либо обычный patch, либо атомарное действие (иногда повтор того же id); серия 0 — сценарий главы
  const actionIds = [];
  const patches = s === 0 ? SCRIPTED : Array.from({ length: STEPS }, () => {
    if (rnd() < 0.3) {
      const id = actionIds.length && rnd() < 0.3 ? pick(actionIds) : randomUUID();
      actionIds.push(id);
      // v0.10: крафт, сюжетные предметы, миграция (вместе с неверными id)
      const op = pick(['heal', 'heal', 'starter_kit', 'bogus', 'craft', 'craft', 'craft', 'use', 'use', 'migrate_v10', 'drink', 'drink', 'combat_start', 'combat_end', 'combat_end']);
      const act = { op, id };
      if (op === 'craft') act.recipe = pick([...RECIPE_IDS, 'nope', 5, null]);
      if (op === 'use') act.item = pick([...USE_IDS, 'elixir_life', 'nope', null]);
      if (op === 'drink') act.item = pick(['elixir_life', 'elixir_mana', 'elixir_life', 'resin_flask', 'nope', null, 5]);
      if (op === 'combat_end') { act.outcome = pick(['victory', 'defeat', 'retreat', 'victory', 'cheat', null, 5]); act.mana = pick([0, 33.5, 500, -4, 'x', null, 12.25]); }
      return { __action: act };
    }
    if (rnd() < 0.2) return S(pick([5, 30, 60, 300, 1000, 5000, 100000]));
    const p = randomPatch();
    if (rnd() < 0.2) p.inv = { ...(typeof p.inv === 'object' && !Array.isArray(p.inv) ? p.inv : {}), coins: pick([5, 20, 100]) };
    // v0.10: ингредиенты, сюжетные события и побеждённый Страж — чтобы операции главы реально срабатывали
    if (rnd() < 0.6) p.inv = { ...(typeof p.inv === 'object' && !Array.isArray(p.inv) ? p.inv : {}), ...Object.fromEntries(arrOf(() => [pick(CHAPTER_ITEMS), pick([1, 2, 3, 5])], 5)) };
    if (rnd() < 0.5) p.quests = [...(Array.isArray(p.quests) ? p.quests : []), ...arrOf(() => pick(CHAPTER_EVENTS), 4)];
    if (rnd() < 0.1) p.enemies = [...(Array.isArray(p.enemies) ? p.enemies : []), 'forest_guardian_01'];
    if (rnd() < 0.15) p.xp = pick([600, 900, 1290, 2400]);
    return p;
  });
  const script = [
    `insert into auth.users (id, email) values ('${uid}', null);`,
    `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`,
    `select public.create_player('witch');`,
    ...patches.map(p => (p.__shift ? `reset role; update public.player_progress set vitals_at = vitals_at - ${p.__shift} * interval '1 second', combat_since = combat_since - ${p.__shift} * interval '1 second' where user_id = '${uid}'; set role authenticated;`
      : p.__action ? `select public.player_action($j$${JSON.stringify(p.__action)}$j$::jsonb);` : `select public.sync_player($j$${JSON.stringify(p)}$j$::jsonb);`)),
  ].join('\n');
  const out = psql(script);
  const calls = patches.filter(p => !p.__shift);
  if (out.length !== calls.length + 1) { console.log(`✗ серия ${s}: ожидали ${calls.length + 1} ответов, пришло ${out.length}`); bad++; continue; }
  let model = fillDefaults(JSON.parse(out[0])).snapshot;
  const seen = new Map();   // id действия → результат первой попытки (повтор возвращает его же)
  let n = 0;
  for (let i = 0; i < patches.length; i++) {
    if (patches[i].__shift) { model.vitalsAt -= patches[i].__shift * 1000; if (model.combatSince != null) model.combatSince -= patches[i].__shift * 1000; continue; }
    n++;
    const reply = JSON.parse(out[n]);
    const a = patches[i].__action;
    let want = null;
    if (a) {
      if (!seen.has(a.id)) { const r = applyAction(model, a, reply.vitalsAt); model = r.snapshot; seen.set(a.id, r.result); want = r.result; const key = `${a.op}:${r.result.ok ? 'ok' : r.result.reason}`; COVER[key] = (COVER[key] || 0) + 1; }
      else { want = { ...seen.get(a.id), duplicate: true }; model = { ...model, hp: model.hp, mana: model.mana }; }
    } else model = applyPatch(model, patches[i], reply.vitalsAt);
    const server = fillDefaults(reply).snapshot;
    for (const k of ['hp', 'mana']) if (typeof model[k] === 'number' && typeof server[k] === 'number' && Math.abs(model[k] - server[k]) < 1e-6) model[k] = server[k];   // double против numeric
    // повтор действия и любое чтение показывают запасы «на сейчас», но ничего не записывают: сравниваем с продвинутой копией
    const view = a && seen.has(a.id) && want?.duplicate ? advanceVitals(JSON.parse(JSON.stringify(model)), reply.vitalsAt) : model;
    steps++;
    if (a && canonR(want) !== canonR(reply.action)) {
      bad++;
      console.log(`✗ серия ${s}, шаг ${i}: результаты действия разошлись\n  action: ${JSON.stringify(a)}\n  JS : ${canonR(want)}\n  SQL: ${canonR(reply.action)}`);
      break;
    }
    if (canonR(comparable(view)) !== canonR(comparable(server))) {
      bad++;
      console.log(`✗ серия ${s}, шаг ${i}: снимки разошлись\n  patch:  ${JSON.stringify(patches[i]).slice(0, 400)}`);
      const a = comparable(view), b = comparable(server);
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (canonR(a[k]) !== canonR(b[k])) console.log(`  поле ${k}:\n    JS : ${canon(a[k]).slice(0, 300)}\n    SQL: ${canon(b[k]).slice(0, 300)}`);
      break;
    }
  }
}
{ // правила крафта и сюжетных предметов на сервере = конфиг игры
  const sql = JSON.parse(execFileSync('psql', ['-X', '-q', '-At', '-c', 'select public._game_rules()'], { encoding: 'utf8', env: process.env }).trim());
  if (canon(sql) !== canon(RULES)) { bad++; console.log('✗ _game_rules() не совпадает с конфигом — запустите node tools/sql/gen-rules.mjs'); }
  else console.log('  ✓ правила крафта и сюжетных предметов на сервере совпадают с конфигом');
}
console.log('  исходы действий:', Object.entries(COVER).sort().map(([k, v]) => `${k}=${v}`).join(' '));
console.log(bad ? `\n✗ расхождений: ${bad}` : `\n✓ SQL и JS совпали: ${SERIES} серий, ${steps} шагов`);
process.exit(bad ? 1 : 0);
