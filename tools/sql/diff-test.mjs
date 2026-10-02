// Дифф-тест: SQL-функция sync_player (supabase/schema.sql) против applyPatch (src/cloud/playerModel.js).
// Случайные, в том числе испорченные, patch прогоняются через настоящий Postgres и через JS; снимки должны совпасть шаг за шагом.
//   PGHOST=... PGPORT=... PGUSER=postgres node tools/sql/diff-test.mjs [число серий]
// В базе должна быть схема из supabase/schema.sql и заглушка Supabase Auth (tools/sql/auth-stub.sql).
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { applyPatch, fillDefaults, emptySnapshot } from '../../src/cloud/playerModel.js';
import { HERO_LEVELS } from '../../src/config/balance.hero.js';

const SERIES = Number(process.argv[2]) || 60, STEPS = 14;
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
  set('pos', maybe(0.3, () => pick([{ x: 100, y: 200 }, { x: 1.5, y: -2 }, { x: 'a', y: 2 }, { x: 1 }, 7])));
  set('safe', maybe(0.15, () => pick([{ x: 900, y: 4820 }, { x: null, y: 1 }])));
  set('hp', maybe(0.2, () => pick([{ value: 55.5 }, { value: null }, { value: 'x' }, {}, 3])));
  set('play', maybe(0.4, () => pick([1000, 60000, 86400000, 99999999999, -5, 'x', 2.9])));
  set('combats', maybe(0.25, () => rnd() < 0.05 ? 'x' : arrOf(() => pick([{ enemy: 'forest_scavenger', result: 'victory', timeSec: 26.5 }, { enemy: 'x', result: 'defeat', timeSec: 3 }, 5, null, [1]]), 30)));
  return p;
}

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
const sorted = (a) => [...a].sort();
const comparable = (s) => ({ ...s, quests: sorted(s.quests), paths: sorted(s.paths), enemies: sorted(s.enemies), tutorial: sorted(s.tutorial) });

function psql(script) {
  return execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: script, encoding: 'utf8', maxBuffer: 1 << 26, env: process.env }).split('\n').filter(l => l.startsWith('{'));
}

let bad = 0, steps = 0;
{ // пороги уровней на сервере = HERO_LEVELS
  const rows = execFileSync('psql', ['-X', '-q', '-At', '-c', 'select level, xp from public.game_hero_levels order by level'], { encoding: 'utf8', env: process.env }).trim().split('\n').map(l => l.split('|').map(Number));
  const want = HERO_LEVELS.map(r => [r.level, r.xp]);
  if (JSON.stringify(rows) !== JSON.stringify(want)) { bad++; console.log('✗ game_hero_levels не совпадает с HERO_LEVELS:', JSON.stringify(rows), JSON.stringify(want)); }
  else console.log('  ✓ пороги уровней на сервере совпадают с HERO_LEVELS');
}
for (let s = 0; s < SERIES; s++) {
  const uid = randomUUID();
  const patches = Array.from({ length: STEPS }, randomPatch);
  const script = [
    `insert into auth.users (id, email) values ('${uid}', null);`,
    `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`,
    `select public.create_player('witch');`,
    ...patches.map(p => `select public.sync_player($j$${JSON.stringify(p)}$j$::jsonb);`),
  ].join('\n');
  const out = psql(script);
  if (out.length !== STEPS + 1) { console.log(`✗ серия ${s}: ожидали ${STEPS + 1} ответов, пришло ${out.length}`); bad++; continue; }
  let model = fillDefaults(JSON.parse(out[0])).snapshot;
  for (let i = 0; i < STEPS; i++) {
    model = applyPatch(model, patches[i]);
    const server = fillDefaults(JSON.parse(out[i + 1])).snapshot;
    steps++;
    if (canon(comparable(model)) !== canon(comparable(server))) {
      bad++;
      console.log(`✗ серия ${s}, шаг ${i}: снимки разошлись\n  patch:  ${JSON.stringify(patches[i]).slice(0, 400)}`);
      const a = comparable(model), b = comparable(server);
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (canon(a[k]) !== canon(b[k])) console.log(`  поле ${k}:\n    JS : ${canon(a[k]).slice(0, 300)}\n    SQL: ${canon(b[k]).slice(0, 300)}`);
      break;
    }
  }
}
console.log(bad ? `\n✗ расхождений: ${bad}` : `\n✓ SQL и JS совпали: ${SERIES} серий, ${steps} шагов`);
process.exit(bad ? 1 : 0);
