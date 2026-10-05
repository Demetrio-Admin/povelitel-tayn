// Дифф-тест: SQL-функции sync_player и player_action (supabase/schema.sql) против applyPatch и applyAction (src/cloud/playerModel.js).
// v0.15.0: прогресс клиент в patch не пишет (поля xp, school, inv, abilities, quests, paths, enemies, research игнорируются), поэтому состояние игрока
// для проверки операций задают шаги __set (напрямую в таблицы и в JS-снимок), а случайные patch с прогрессом проверяют, что оба «игнорируют» одинаково.
// Случайные, в том числе испорченные, patch прогоняются через настоящий Postgres и через JS; снимки должны совпасть шаг за шагом.
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/diff-test.mjs [число серий]
// В базе должна быть схема из supabase/schema.sql и заглушка Supabase Auth (tools/sql/auth-stub.sql).
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { applyPatch, applyAction, combatApply, advanceVitals, fillDefaults, emptySnapshot, levelForXp, walletOf } from '../../src/cloud/playerModel.js';
import { HERO_LEVELS } from '../../src/config/balance.hero.js';

import { serverRules } from '../../src/config/serverRules.js';

const SERIES = Number(process.argv[2]) || 60, STEPS = 14;
const RULES = serverRules();
const RECIPE_IDS = Object.keys(RULES.recipes), USE_IDS = Object.keys(RULES.uses);
const CHAPTER_ITEMS = ['moon_herb', 'forest_mushroom', 'tree_resin', 'rune_dust', 'lunar_shard', 'lunar_flame', 'rare_core', 'elixir_life', 'elixir_mana', ...USE_IDS];
const WORLD_IDS = Object.keys(RULES.world);
const WORLD_EVENTS = [...new Set(Object.values(RULES.world).flatMap(r => [...(r.requires || []), ...(r.blockedBy || [])]))];
const WORLD_ENEMIES = [...new Set(Object.values(RULES.world).flatMap(r => [...(r.requiresEnemy || []), ...(r.guard ? [r.guard] : [])]))];
const CHAPTER_EVENTS = [...new Set([...WORLD_EVENTS, ...Object.values(RULES.recipes).flatMap(r => [...r.requires, ...r.blockedBy]), ...Object.values(RULES.uses).flatMap(u => [...u.requires, ...u.blockedBy]),
  RULES.firstCraft.event, RULES.migration.event])];
const QUEST_IDS = Object.keys(RULES.quests), RES_IDS = Object.keys(RULES.research), EVENT_KEYS = Object.keys(RULES.events);
const BRANCHES = Object.entries(RULES.build.branches).flatMap(([a, bs]) => Object.keys(bs).map(b => [a, b]));
const NEW_EVENTS = [...new Set([...EVENT_KEYS, ...Object.values(RULES.events).flatMap(e => e.requires), ...Object.keys(RULES.eventRewards),
  ...Object.values(RULES.quests).flatMap(q => [q.start, q.done, ...(q.requires ? [q.requires] : []), ...q.objectives.filter(o => o.type === 'event').map(o => o.key)]),
  ...Object.values(RULES.research).flatMap(u => [u.event, u.startEvent, u.completeEvent].filter(Boolean)),
  ...Object.values(RULES.spawnStart).flatMap(x => [x.event, ...(x.requires ? [x.requires] : [])]),
  ...Object.values(RULES.world).flatMap(w => w.events || [])])];
const NEW_ITEMS = [...new Set([...Object.values(RULES.quests).flatMap(q => Object.keys(q.consume)), ...Object.values(RULES.quests).flatMap(q => q.objectives.filter(o => o.type === 'item').map(o => o.item)),
  ...Object.values(RULES.research).flatMap(u => Object.keys(u.items)), ...RULES.build.amulets, 'coins'])];
const NEW_ENEMIES = [...new Set(Object.values(RULES.quests).flatMap(q => q.objectives.filter(o => o.type === 'enemy').map(o => o.id)))];
let seed = 12345;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NUMS = [0, 1, 2, 3, 5, 10, 40, -1, -3, -100, 2.7, -2.7, 1000, 1e6, 1e9, 1e12, 1e15, 1e20, -1e9, '5', null, true, [], {}];
const IDS = ['coins', 'lunar_shard', 'lunar_flame', 'potion_1', 'ev_a', 'ev_b', 'ev:c', 'gate.1', 'bad id', '', 'x'.repeat(65), 'ok', 'ключ', 7, null];
const num = () => pick(NUMS);
const maybe = (p, f) => (rnd() < p ? f() : undefined);
const arrOf = (f, n = 3) => Array.from({ length: Math.floor(rnd() * n) + 1 }, f);

// ---- v0.15.0: «прогресс» задаётся мимо sync_player — напрямую в таблицы игрока и в JS-снимок
const CLOSED = ['xp', 'school', 'inv', 'abilities', 'quests', 'paths', 'enemies', 'research', 'sapphires'];
const splitSet = (st) => {
  if (!st || st.__action || st.__apply || st.__shift || st.__age || st.__mana !== undefined || st.__set || st.__rshift) return [st];
  const set = {}, rest = {};
  for (const [k, v] of Object.entries(st)) (CLOSED.includes(k) ? set : rest)[k] = v;
  return [...(Object.keys(set).length ? [{ __set: set }] : []), ...(Object.keys(rest).length ? [rest] : [])];
};
const q1 = (x) => String(x).replace(/'/g, "''");
function setSql(uid, st) {
  const U = `'${uid}'`, q = [];
  for (const [k, n] of Object.entries(st.inv || {})) q.push(`insert into public.player_inventory (user_id, item_id, quantity) values (${U}, '${q1(k)}', ${n}) on conflict (user_id, item_id) do update set quantity = least(public.player_inventory.quantity + ${n}, 1000000000);`);
  for (const k of st.quests || []) q.push(`insert into public.player_quests (user_id, quest_id) values (${U}, '${q1(k)}') on conflict (user_id, quest_id) do update set status = 'done';`);
  for (const [kind, list] of [['enemy', st.enemies || []], ['path', st.paths || []]]) for (const k of list) q.push(`insert into public.player_world (user_id, kind, key) values (${U}, '${kind}', '${q1(k)}') on conflict do nothing;`);
  for (const [k, v] of Object.entries(st.abilities || {})) q.push(`insert into public.player_abilities (user_id, ability_id, level, unlocked) values (${U}, '${k}', ${v.level}, ${!!v.unlocked}) on conflict (user_id, ability_id) do update set level = greatest(public.player_abilities.level, excluded.level), unlocked = public.player_abilities.unlocked or excluded.unlocked;`);
  if (st.xp) q.push(`update public.player_progress set hero_xp = greatest(hero_xp, ${st.xp}), hero_level = greatest(hero_level, coalesce((select max(level) from public.game_hero_levels where xp <= greatest(hero_xp, ${st.xp})), 1)) where user_id = ${U};`);
  for (const [k, n] of Object.entries(st.school || {})) q.push(`update public.player_progress set school_xp = jsonb_set(school_xp, '{${k}}', to_jsonb(coalesce((school_xp ->> '${k}')::numeric, 0) + ${n})) where user_id = ${U};`);
  if (st.sapphires) q.push(`insert into public.player_wallet (user_id, sapphires) values (${U}, ${st.sapphires}) on conflict (user_id) do update set sapphires = public.player_wallet.sapphires + ${st.sapphires};`);
  if ('research' in st) q.push(`update public.player_progress set research = ${st.research ? `'${q1(JSON.stringify(st.research))}'::jsonb` : 'null'} where user_id = ${U};`);
  for (const [k, v] of Object.entries(st.objects || {})) q.push(v === null ? `delete from public.player_world where user_id = ${U} and kind = 'object' and key = '${q1(k)}';`
    : `insert into public.player_world (user_id, kind, key, data) values (${U}, 'object', '${q1(k)}', '${q1(JSON.stringify(v))}'::jsonb) on conflict (user_id, kind, key) do update set data = excluded.data;`);
  return `reset role; ${q.join(' ')} set role authenticated;`;
}
function applySet(m, st) {
  for (const [k, n] of Object.entries(st.inv || {})) m.inventory[k] = Math.min((m.inventory[k] || 0) + n, 1e9);
  for (const k of st.quests || []) if (!m.quests.includes(k)) m.quests.push(k);
  for (const k of st.enemies || []) if (!m.enemies.includes(k)) m.enemies.push(k);
  for (const k of st.paths || []) if (!m.paths.includes(k)) m.paths.push(k);
  for (const [k, v] of Object.entries(st.abilities || {})) { const a = m.abilities[k] || { level: 0, unlocked: false }; m.abilities[k] = { level: Math.max(a.level, v.level), unlocked: a.unlocked || !!v.unlocked }; }
  if (st.xp) { m.xp = Math.max(m.xp, st.xp); m.level = Math.max(m.level, levelForXp(m.xp)); }
  for (const [k, n] of Object.entries(st.school || {})) m.school[k] = (m.school[k] || 0) + n;
  if ('research' in st) m.research = st.research;
  for (const [k, v] of Object.entries(st.objects || {})) { if (v === null) delete m.objects[k]; else m.objects[k] = v; }
  if (st.sapphires) m.wallet = { ...walletOf(m.wallet), sapphires: walletOf(m.wallet).sapphires + st.sapphires };
}
const SET = (st) => ({ __set: st });
const RS = (sec) => ({ __rshift: sec });   // «прошло sec секунд» с начала изучения (отметка начала сдвигается в прошлое)
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
const W = (obj, id = randomUUID()) => ({ __action: { op: 'world', obj, id } });   // v0.13.0: действие в мире
const CS = { spawn: 'scavenger_01', enemy: 'forest_scavenger' };   // v0.14.0: бой называет место и врага
// v0.14.0: итог проверенного боя (verdict) — как его строит cloud/combatVerify.js; since и spawn подставляются из состояния игрока на каждой стороне
const VERDICT = (v = {}) => ({ __apply: { outcome: 'victory', mana: 33.5, potions: {}, reward: { heroXP: 70, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 1, coins: 15 } }, coinsLost: 0, entry: { enemy: 'forest_scavenger', spawnId: 'scavenger_01', result: 'victory', timeSec: 22.8, interrupts: 1, uses: { telekinesis: 4, fire: 0, seal: 0 } }, ...v } });
const randomVerdict = () => VERDICT({
  outcome: pick(['victory', 'victory', 'defeat', 'retreat', 'win', null]), mana: pick([0, 12.25, 33.5, 500, -4]),
  potions: pick([{}, { elixir_life: 1 }, { elixir_life: 2, elixir_mana: 1 }, { resin_flask: 3 }, { elixir_life: 0 }]),
  reward: pick([{}, { heroXP: 70, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 1, coins: 15 } }, { heroXP: 600, items: { rare_core: 1 } }, { schoolXP: { fire: 5, seal: 2 } }]),
  coinsLost: pick([0, 5, 3, 500]), path: pick([undefined, 'gate_path', 'bad id']), events: pick([undefined, [], ['guardian_defeated'], ['ok_event', 'bad id']]),
  rep: pick([undefined, { key: 'rep:rootling_01', wins: 1, at: 1790000000000 }, { key: 'rep:rootling_01', wins: 3, at: 5 }, { key: 'bad key', wins: 1, at: 1 }]),
  entry: pick([undefined, { enemy: 'rootling', spawnId: 'rootling_01', result: 'defeat', timeSec: 9, interrupts: 0, uses: {} }]),
});
const AGE = (obj, sec) => ({ __age: [obj, sec] });   // «прошло sec секунд» с момента сбора (отметка времени объекта сдвигается в прошлое)
const MANA = (v) => ({ __mana: v });                 // сервер хранит ровно v маны (без пересчёта по времени)
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
  { mana_spent: 50 }, A('combat_start', CS), A('combat_start', CS), VERDICT({ outcome: 'defeat', coinsLost: 5, reward: {} }), A('combat_start', CS), S(300), { mana_spent: 20 }, A('drink', { item: 'elixir_life' }), A('heal'),
  { hp: { value: 3 }, mana: { value: 3 } }, A('combat_end', { outcome: 'cheat', mana: 50 }), A('combat_end', { outcome: 'defeat', mana: 33.5 }), A('combat_end', { outcome: 'victory', mana: 50 }),
  S(40), A('combat_start', CS), S(500), { xp: 200 }, A('combat_end', { outcome: 'retreat', mana: 99 }), A('combat_start', CS), VERDICT(), VERDICT(),
  A('combat_start', CS), S(901), { play: 1000 }, A('combat_end', { outcome: 'victory', mana: 500 }),
  { pos: { x: 100, y: 200 } }, S(50), { mana_spent: 1 }, A('combat_start', CS), S(5000), A('combat_end', { outcome: 'defeat', mana: -4 }), A('combat_end', { outcome: 'defeat', mana: 'x' }),
  // v0.13.0: сбор и возрождение по времени сервера, мана, находки, дар и ступень, камень и награда под ним, запас под охраной, бой
  S(5000), MANA(100), W('herb_g1'), W('herb_g1'), AGE('herb_g1', 100), W('herb_g1'), AGE('herb_g1', 60), W('herb_g1'),
  MANA(3), W('mush_t1'), MANA(100), W('mush_t1'), W('crystal_a1'),
  W('west_chest'), W('west_chest'), W('guard_cache'), { enemies: ['lunar_guard'] }, W('guard_cache'), W('flame_a'), { quests: ['lunar_quest_start'] }, W('flame_a'),
  W('moon_plant'), { abilities: { telekinesis: { level: 1, unlocked: true } } }, W('moon_plant'), MANA(2), W('glade_rock'), MANA(100), W('glade_rock'), W('heavy_boulder'),
  W('glade_rock_reward'), { objects: { glade_rock: { state: 'moved', x: 1, y: 2 } } }, W('glade_rock_reward'), W('glade_rock_reward'),
  { objects: { glade_cache: { state: 'opened' }, herb_g2: { state: 'picked', t: 1 }, ritual_torch: { state: 'burning' } } }, W('glade_cache'), W('herb_g2'), W('corrupted_roots'),
  { abilities: { fire: { level: 1, unlocked: true } } }, W('corrupted_roots'), W('dry_bush_reward'),
  W('dust_stash'), { enemies: ['rootling_02'] }, W('dust_stash'), W('dust_stash'), { objects: { 'rep:rootling_02': { wins: 2, at: 5 } } }, W('dust_stash'), W('dust_stash'),
  W('ancient_gate'), { quests: ['guardian_defeated', 'gate_marks_revealed', 'unlock_seal_1', 'seal_training_complete'], abilities: { seal: { level: 1, unlocked: true } } }, W('ancient_gate'),
  { quests: ['ancient_gate_open'] }, W('ancient_gate'), W('seal_sigil'), W('house_trunk'), W('house_trunk'), W('moonstone'),
  A('combat_start', CS), W('herb_g3'), A('combat_end', { outcome: 'victory', mana: 50 }), W('herb_g3'), W('nope'), W('__proto__'),
  // v0.15.0: сюжетные события, задания, изучение и смена ветки — прогресс только от сервера
  A('event', { key: 'prologue_seen' }), A('event', { key: 'prologue_seen' }), A('event', { key: 'nope' }), A('event', { key: 'unlock_fire_1' }), A('event', { key: 'lunar_quest_start' }),
  A('event', { key: 'unlock_telekinesis_1' }), A('event', { key: 'lunar_quest_start' }), A('event', { key: 'unlock_fire_1' }),
  SET({ quests: ['heavy_path_open'] }), A('event', { key: 'unlock_fire_1' }), A('event', { key: 'unlock_seal_1' }), SET({ quests: ['gate_marks_revealed'] }), A('event', { key: 'unlock_seal_1' }),
  A('quest_accept', { quest: 'sq_herbs' }), A('quest_accept', { quest: 'sq_herbs' }), A('quest_turn_in', { quest: 'sq_herbs' }), SET({ inv: { moon_herb: 3 } }), A('quest_turn_in', { quest: 'sq_herbs' }), A('quest_turn_in', { quest: 'sq_herbs' }),
  A('quest_accept', { quest: 'sq_dust' }), A('quest_accept', { quest: 'sq_hunter' }), A('quest_turn_in', { quest: 'sq_hunter' }), A('combat_start', { spawn: 'scavenger_02', enemy: 'forest_scavenger' }),
  A('combat_end', { outcome: 'retreat', mana: 1 }), SET({ enemies: ['scavenger_02'] }), A('quest_turn_in', { quest: 'sq_hunter' }), A('quest_accept', { quest: 'nope' }),
  A('research_start', { upgrade: 'telekinesis_2' }), SET({ quests: ['lunar_quest_complete'], xp: 400, school: { telekinesis: 200 }, inv: { lunar_shard: 6, moon_herb: 3, rune_dust: 2 } }),
  A('research_start', { upgrade: 'telekinesis_2' }), A('research_start', { upgrade: 'telekinesis_2' }), A('research_start', { upgrade: 'fire_2' }), A('research_finish'), RS(100), A('research_finish'), RS(300), A('research_finish'), A('research_finish'),
  A('research_start', { upgrade: 'telekinesis_2' }), A('research_start', { upgrade: 'nope' }),
  SET({ abilities: { fire: { level: 1, unlocked: true } }, xp: 3000, school: { fire: 200, telekinesis: 300 }, inv: { crimson_ember: 6, lunar_shard: 8, rune_dust: 3, coins: 400 } }),
  A('research_start', { upgrade: 'fire_2' }), RS(1000), A('research_finish'), A('research_start', { upgrade: 'telekinesis_3_lord' }), RS(4000), A('research_finish'),
  A('respec', { ability: 'telekinesis', branch: 'breaker' }), A('respec', { ability: 'telekinesis', branch: 'breaker' }), A('respec', { ability: 'telekinesis', branch: 'lord' }), A('respec', { ability: 'fire', branch: 'x' }),
  SET({ inv: { coins: 200 } }), A('respec', { ability: 'telekinesis', branch: 'breaker' }),
  // v0.16.0: слоты даров, амулеты, пресет; ветки и билд живут в одном объекте и не затирают друг друга
  SET({ abilities: { telekinesis: { level: 3, unlocked: true }, fire: { level: 2, unlocked: true } }, inv: { amulet_focus: 1, amulet_forest: 1, coins: 500 } }),
  A('build_set', { slots: ['fire', 'telekinesis'] }), A('build_set', { slots: [] }), A('build_set', { slots: ['fire', 'fire'] }), A('build_set', { slots: ['nope'] }), A('build_set', { slots: ['seal'] }),
  A('build_set', { slots: 'fire' }), A('build_set', { slots: [1] }), A('build_set', {}), A('build_set', { slots: null, amulets: null }),
  A('build_set', { amulets: ['amulet_focus', 'amulet_forest'] }), A('build_set', { amulets: ['amulet_lunar'] }), A('build_set', { amulets: ['amulet_focus', 'amulet_focus'] }), A('build_set', { amulets: ['x'] }),
  A('build_set', { amulets: ['amulet_focus', 'amulet_forest', 'amulet_lunar'] }), A('build_set', { amulets: [] }), A('build_set', { slots: ['telekinesis'], amulets: ['amulet_forest'] }),
  A('build_preset', { mode: 'load' }), A('build_preset', { mode: 'save' }), A('build_set', { slots: ['fire'], amulets: [] }), A('build_preset', { mode: 'load' }), A('build_preset', { mode: 'nope' }), A('build_preset', {}),
  A('respec', { ability: 'telekinesis', branch: 'breaker' }), A('build_preset', { mode: 'save' }),
  A('combat_start', { spawn: 'scavenger_01', enemy: 'forest_scavenger' }), A('build_set', { slots: ['fire'] }), A('build_preset', { mode: 'load' }), A('build_preset', { mode: 'save' }), A('combat_end', { outcome: 'retreat', mana: 1 }),
  // v0.17.0: сапфиры — приветствие, ускорение изучения (шаги, предел, суточный лимит), смена ветки и пресеты за сапфиры
  A('bank_welcome'), A('bank_welcome'), A('research_speedup', { chunks: 1 }), A('preset_unlock'), A('respec', { ability: 'telekinesis', branch: 'lord', pay: 'sapphires' }),
  SET({ sapphires: 100 }), A('respec', { ability: 'telekinesis', branch: 'lord', pay: 'sapphires' }), A('respec', { ability: 'telekinesis', branch: 'breaker', pay: 'gold' }),
  A('build_preset', { mode: 'save', slot: 2 }), A('preset_unlock'), A('build_preset', { mode: 'save', slot: 2 }), A('build_preset', { mode: 'load', slot: 2 }), A('build_preset', { mode: 'load', slot: 3 }),
  A('build_preset', { mode: 'save', slot: 9 }), A('build_preset', { mode: 'save', slot: 1.5 }), A('build_preset', { mode: 'save', slot: '2' }), A('build_preset', { mode: 'save', slot: 1e20 }),
  A('preset_unlock'), A('preset_unlock'),
  SET({ school: { seal: 300 }, inv: { lunar_shard: 10 }, xp: 1400 }), A('research_start', { upgrade: 'seal_2' }),
  A('research_speedup', { chunks: 0 }), A('research_speedup', { chunks: 'x' }), A('research_speedup', { chunks: 2.5 }), A('research_speedup', { chunks: 1e9 }), A('research_speedup', {}),
  A('research_speedup', { chunks: 1 }), A('research_speedup', { chunks: 2 }), A('research_speedup', { chunks: 96 }), A('research_speedup', { chunks: 1 }), RS(600), A('research_finish'), A('research_speedup', { chunks: 1 }),
  // магия в мире: опыт дара, события и пути выдаёт сам успех (камень, корни, ворота), повтор — «уже сделано»
  SET({ abilities: { telekinesis: { level: 3, unlocked: true }, fire: { level: 2, unlocked: true } }, objects: { glade_rock: null, heavy_boulder: null, corrupted_roots: null } }), MANA(100),
  W('glade_rock'), W('glade_rock'), MANA(100), W('heavy_boulder'), MANA(100), W('corrupted_roots'), W('corrupted_roots'), MANA(100), W('moon_plant'), MANA(100), W('ritual_torch'), W('ritual_torch'),
  A('combat_start', { spawn: 'scavenger_01', enemy: 'forest_scavenger' }), A('combat_end', { outcome: 'retreat', mana: 1 }),
  A('combat_start', { spawn: 'lunar_guard', enemy: 'x' }), A('combat_end', { outcome: 'retreat', mana: 1 }), A('combat_start', { spawn: 'forest_guardian_01', enemy: 'x' }),
];
const SCRIPT = SCRIPTED.flatMap(splitSet);
for (let s = 0; s < SERIES + 1; s++) {
  const uid = randomUUID();
  // шаг — либо обычный patch, либо атомарное действие (иногда повтор того же id); серия 0 — сценарий главы
  const actionIds = [];
  const patches = s === 0 ? SCRIPT : Array.from({ length: STEPS }, () => {
    if (rnd() < 0.3) {
      const id = actionIds.length && rnd() < 0.3 ? pick(actionIds) : randomUUID();
      actionIds.push(id);
      // v0.10: крафт, сюжетные предметы, миграция (вместе с неверными id)
      const op = pick(['heal', 'heal', 'starter_kit', 'bogus', 'craft', 'craft', 'craft', 'use', 'use', 'migrate_v10', 'drink', 'drink', 'combat_start', 'combat_end', 'combat_end', 'world', 'world', 'world', 'world', 'world', 'world',
        'event', 'event', 'event', 'quest_accept', 'quest_turn_in', 'quest_turn_in', 'research_start', 'research_start', 'research_finish', 'research_finish', 'respec', 'respec', 'build_set', 'build_set', 'build_preset', 'research_speedup', 'research_speedup', 'preset_unlock', 'bank_welcome']);
      const act = { op, id };
      if (op === 'craft') act.recipe = pick([...RECIPE_IDS, 'nope', 5, null]);
      if (op === 'event') act.key = pick([...EVENT_KEYS, ...EVENT_KEYS, ...EVENT_KEYS, 'nope', null, 5, 'lunar_quest_complete']);
      if (op === 'quest_accept' || op === 'quest_turn_in') act.quest = pick([...QUEST_IDS, ...QUEST_IDS, 'nope', null, 5]);
      if (op === 'research_start') act.upgrade = pick([...RES_IDS, ...RES_IDS, 'nope', null, 5]);
      if (op === 'respec') { const [a, b] = pick(BRANCHES); Object.assign(act, pick([{ ability: a, branch: b }, { ability: a, branch: b }, { ability: 'fire', branch: 'x' }, { ability: null, branch: 5 }, { ability: 'nope' }])); }
      if (op === 'build_set') { const G = ['telekinesis', 'fire', 'seal'], AM = ['amulet_focus', 'amulet_forest', 'amulet_lunar'];
        if (rnd() < 0.7) act.slots = pick([[pick(G)], [pick(G), pick(G)], G, [], ['nope'], 'fire', null, [1], [...G, 'x'], [...G, ...G]]);
        if (rnd() < 0.6) act.amulets = pick([[pick(AM)], [pick(AM), pick(AM)], AM, [], ['nope'], 7, null]); }
      if (op === 'build_preset') { act.mode = pick(['save', 'load', 'load', 'save', 'x', null, 5]); if (rnd() < 0.5) act.slot = pick([1, 2, 3, 4, 0, 1.5, '2', null]); }
      if (op === 'research_speedup') act.chunks = pick([1, 1, 2, 4, 30, 96, 0, -1, 2.5, 'x', null, 1e12]);
      if (op === 'respec' && rnd() < 0.4) act.pay = pick(['sapphires', 'sapphires', 'coins', 'x']);
      if (op === 'use') act.item = pick([...USE_IDS, 'elixir_life', 'nope', null]);
      if (op === 'world') act.obj = pick([...WORLD_IDS, ...WORLD_IDS, 'nope', null, 5, '__proto__', 'constructor']);
      if (op === 'drink') act.item = pick(['elixir_life', 'elixir_mana', 'elixir_life', 'resin_flask', 'nope', null, 5]);
      if (op === 'combat_start') { Object.assign(act, pick([CS, CS, { spawn: 'rootling_01', enemy: 'rootling' }, { spawn: 'bad id', enemy: 'x' }, { spawn: 7, enemy: null }, {}])); }
      if (op === 'combat_end') { act.outcome = pick(['victory', 'defeat', 'retreat', 'victory', 'cheat', null, 5]); act.mana = pick([0, 33.5, 500, -4, 'x', null, 12.25]); }
      return { __action: act };
    }
    if (rnd() < 0.08) return randomVerdict();
    if (rnd() < 0.2) return S(pick([5, 30, 60, 300, 1000, 5000, 100000]));
    if (rnd() < 0.08) return MANA(pick([0, 3, 4, 8, 12, 15.5, 100]));
    if (rnd() < 0.08) return AGE(pick(WORLD_IDS), pick([10, 100, 150, 200, 500]));
    const p = randomPatch();   // в нём бывает и «прогресс» (xp, inv, quests…): сервер и модель обязаны одинаково его игнорировать
    if (rnd() < 0.2) p.inv = { ...(typeof p.inv === 'object' && !Array.isArray(p.inv) ? p.inv : {}), coins: pick([5, 20, 100]) };
    if (rnd() < 0.3) p.objects = { ...(typeof p.objects === 'object' && !Array.isArray(p.objects) ? p.objects : {}), ...Object.fromEntries(arrOf(() => [pick([...WORLD_IDS, 'rep:rootling_02', 'rep:rootling_05', 'player_build']),
      pick([null, { state: 'picked', t: 1 }, { state: 'opened' }, { state: 'moved' }, { state: 'destroyed' }, { claimed: 1 }, { wins: 1, at: 1 }, { wins: 3, at: 1 }, { branches: { fire: 'x' } }])], 2)) };
    // настоящее состояние игрока задаёт __set (ингредиенты, события, побеждённые враги, дары, опыт, ветки, изучение) — чтобы операции реально срабатывали
    const st = {};
    if (rnd() < 0.5) st.inv = Object.fromEntries(arrOf(() => [pick(rnd() < 0.5 ? CHAPTER_ITEMS : NEW_ITEMS), pick([1, 2, 3, 5, 6])], 5));
    if (rnd() < 0.6) st.quests = arrOf(() => pick(rnd() < 0.5 ? CHAPTER_EVENTS : NEW_EVENTS), 4);
    if (rnd() < 0.3) st.enemies = arrOf(() => pick([...WORLD_ENEMIES, ...NEW_ENEMIES, 'forest_guardian_01']), 2);
    if (rnd() < 0.2) st.paths = ['gate_path'];
    if (rnd() < 0.3) st.abilities = Object.fromEntries(['telekinesis', 'fire', 'seal'].filter(() => rnd() < 0.6).map(k => [k, { level: pick([1, 1, 2, 3]), unlocked: true }]));
    if (rnd() < 0.3) st.xp = pick([100, 600, 900, 1290, 2400, 4000]);
    if (rnd() < 0.15) st.sapphires = pick([1, 3, 10, 40]);   // v0.17.0
    if (rnd() < 0.3) st.school = Object.fromEntries(['telekinesis', 'fire', 'seal'].filter(() => rnd() < 0.6).map(k => [k, pick([40, 100, 200, 400])]));
    if (rnd() < 0.15) st.research = pick([null, { upgradeId: pick(RES_IDS), startedAt: Date.now() - pick([0, 1000, 100000, 400000, 4000000]), durationMs: pick([60000, 300000, 1800000]) }, { upgradeId: 'bogus', startedAt: 1, durationMs: 1 }]);
    if (rnd() < 0.25) st.objects = Object.fromEntries(arrOf(() => [pick([...WORLD_IDS, 'rep:rootling_02', 'rep:rootling_05']),
      pick([null, { state: 'picked', t: Date.now() - 100000 }, { state: 'opened' }, { state: 'moved' }, { state: 'destroyed' }, { state: 'burning' }, { claimed: 1 }, { wins: 1, at: 1 }, { wins: 3, at: 1 }])], 2));
    if (rnd() < 0.2 && BRANCHES.length) { const [a, b] = pick(BRANCHES); st.objects = { ...(st.objects || {}), player_build: { branches: { [a]: b } } }; }
    return Object.keys(st).length ? [SET(st), p] : [p];
  }).flat();
  // v0.15.0: после начала изучения время часто «проходит» — чтобы завершение срабатывало
  for (let i = patches.length - 1; i >= 0; i--) if (patches[i].__action?.op === 'research_start' && rnd() < 0.6) patches.splice(i + 1, 0, RS(pick([10, 400, 1000, 4000])));
  // v0.14.0: после начала боя чаще идёт итог (иначе combat_apply почти всегда упирался бы в «боя нет»)
  for (let i = patches.length - 1; i >= 0; i--) if (patches[i].__action?.op === 'combat_start' && rnd() < 0.7) patches.splice(i + 1, 0, randomVerdict());
  // сдвиги времени и «ровно столько маны» имеют смысл, когда у игрока уже записаны запасы: первый шаг серии — обычное сохранение
  if (patches[0].__shift || patches[0].__age || patches[0].__mana !== undefined || patches[0].__set || patches[0].__rshift) patches.unshift({ play: 1 });
  const script = [
    `insert into auth.users (id, email) values ('${uid}', null);`,
    `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`,
    `select public.create_player('witch');`,
    ...patches.map(p => (p.__set ? setSql(uid, p.__set)
      : p.__rshift ? `reset role; update public.player_progress set research = jsonb_set(research, '{startedAt}', to_jsonb((research ->> 'startedAt')::numeric - ${p.__rshift} * 1000)) where user_id = '${uid}' and research is not null; set role authenticated;`
      : p.__age ? `reset role; update public.player_world set data = jsonb_set(data, '{t}', to_jsonb((data->>'t')::numeric - ${p.__age[1]} * 1000)) where user_id = '${uid}' and kind = 'object' and key = '${p.__age[0]}' and data ? 't'; set role authenticated;`
      : p.__mana !== undefined ? `reset role; update public.player_progress set mana = ${p.__mana} where user_id = '${uid}'; set role authenticated;`
      : p.__shift ? `reset role; update public.player_progress set vitals_at = vitals_at - ${p.__shift} * interval '1 second', combat_since = combat_since - ${p.__shift} * interval '1 second' where user_id = '${uid}'; set role authenticated;`
      : p.__apply ? `reset role; select jsonb_build_object('since', (extract(epoch from combat_since) * 1000)::bigint, 'spawn', combat_ctx ->> 'spawn')::text as extra from public.player_progress where user_id = '${uid}' \\gset\nset role service_role; select public.combat_apply('${uid}', $j$${JSON.stringify(p.__apply)}$j$::jsonb || :'extra'::jsonb); reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false) \\g /dev/null`
      : p.__action ? `select public.player_action($j$${JSON.stringify(p.__action)}$j$::jsonb);` : `select public.sync_player($j$${JSON.stringify(p)}$j$::jsonb);`)),
  ].join('\n');
  const out = psql(script);
  const calls = patches.filter(p => !p.__shift && !p.__age && p.__mana === undefined && !p.__set && !p.__rshift);
  if (out.length !== calls.length + 1) { console.log(`✗ серия ${s}: ожидали ${calls.length + 1} ответов, пришло ${out.length}`); bad++; continue; }
  let model = fillDefaults(JSON.parse(out[0])).snapshot;
  const seen = new Map();   // id действия → результат первой попытки (повтор возвращает его же)
  let n = 0;
  for (let i = 0; i < patches.length; i++) {
    if (patches[i].__set) { applySet(model, patches[i].__set); continue; }
    if (patches[i].__rshift) { if (model.research) model.research = { ...model.research, startedAt: model.research.startedAt - patches[i].__rshift * 1000 }; continue; }
    if (patches[i].__age) { const o = model.objects[patches[i].__age[0]]; if (o && typeof o.t === 'number') o.t -= patches[i].__age[1] * 1000; continue; }
    if (patches[i].__mana !== undefined) { model.mana = patches[i].__mana; continue; }
    if (patches[i].__shift) { model.vitalsAt -= patches[i].__shift * 1000; if (model.combatSince != null) model.combatSince -= patches[i].__shift * 1000; continue; }
    n++;
    const reply = JSON.parse(out[n]);
    const a = patches[i].__action || (patches[i].__apply ? { op: 'combat_apply', id: 'apply-' + i } : null);
    let want = null;
    if (patches[i].__apply) {
      const r = combatApply(model, { ...patches[i].__apply, since: model.combatSince, spawn: model.combatCtx?.spawn }, reply.vitalsAt);
      model = r.snapshot; want = r.result; const key = `apply:${r.result.ok ? 'ok:' + r.result.outcome : r.result.reason}`; COVER[key] = (COVER[key] || 0) + 1;
    } else if (a) {
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
      if (process.env.TRACE) console.log('  ход серии:', patches.map((x, j) => `${j}:${x.__action ? x.__action.op + '#' + String(x.__action.id).slice(0, 4) : Object.keys(x)[0]}`).join(' '));
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
