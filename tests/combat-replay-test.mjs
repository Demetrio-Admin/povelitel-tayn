// v0.14.0 — запись и повтор боя: устройство и сервер должны получать один и тот же бой, а подделка записи не должна давать преимущества.
//   node tests/combat-replay-test.mjs
import { playBot, ctxFor } from './helpers/combat-bot.mjs';
import { verifyCombat, startState, SLACK_SEC } from '../src/cloud/combatVerify.js';
import { normalizeLog, replayCombat, STEP, MAX_TICKS } from '../src/systems/combatReplay.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { emptySnapshot } from '../src/cloud/playerModel.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const NOW = 1_800_000_000_000;
const ALL = { telekinesis: { level: 3, unlocked: true }, fire: { level: 2, unlocked: true }, seal: { level: 1, unlocked: true } };
const MATCHUPS = [
  ['forest_scavenger', 'scavenger_01', 1, {}], ['young_scavenger', 'lunar_guard', 2, {}], ['rootling', 'rootling_01', 5, {}],
  ['forest_guardian', 'forest_guardian_01', 5, {}], ['node_guardian', 'node_trial', 6, {}],
];
const snapFor = (ctx, extra = {}) => ({ ...emptySnapshot(), quests: ['lunar_quest_start', 'ancient_gate_open'], combatSince: NOW - 20 * 60_000 + 15 * 60_000, combatCtx: ctx, ...extra });
const ctxOf = (enemy, spawn, level) => ctxFor({ enemy, spawn, level, abilities: ALL, hp: 300, mana: 200, potions: { elixir_life: 2, elixir_mana: 2, resin_flask: 2 } });
const maxOf = (lvl) => ({ 1: [120, 100], 2: [126, 110], 5: [144, 120], 6: [152, 125] }[lvl]);

console.log('\nБой: устройство и сервер получают один и тот же бой');
let combos = 0, wins = 0, losses = 0, same = true;
for (const [enemy, spawn, level] of MATCHUPS) {
  for (const policy of ['smart', 'mixed']) {
    for (const seed of [1, 2, 3]) {
      const [mh, mm] = maxOf(level);
      const ctx = { ...ctxOf(enemy, spawn, level), hp: mh, mana: mm };
      const play = playBot(ctx, { seed, policy, maxTicks: 60 * 200 });
      const snap = snapFor(ctx);
      const r = verifyCombat(snap, JSON.parse(JSON.stringify(play.log)), snap.combatSince + play.log.ticks * STEP * 1000 + 1000);
      combos++;
      if (!r.ok) { same = false; console.log('   ✗ отказ', enemy, policy, seed, r.reason); continue; }
      const want = play.cm.result || 'retreat';
      // то же самое, но подробнее: проигрываем запись второй раз и сверяем всё состояние боя до последнего бита
      const st = startState(ctx, NOW);
      const cm = new CombatManager({ enemyType: enemy, state: st, abilities: new AbilitySystem(st, null, null) });
      replayCombat(cm, play.log);
      const same1 = cm.hero.hp === play.cm.hero.hp && cm.hero.mana === play.cm.hero.mana && cm.enemy.hp === play.cm.enemy.hp && cm.time === play.cm.time && cm.result === play.cm.result
        && JSON.stringify(cm.stats) === JSON.stringify(play.cm.stats) && JSON.stringify(st.data.schoolXP) === JSON.stringify(play.st.data.schoolXP) && JSON.stringify(cm.cooldowns) === JSON.stringify(play.cm.cooldowns);
      if (!same1 || r.verdict.outcome !== want || r.verdict.mana !== play.cm.hero.mana) { same = false; console.log('   ✗ расхождение', enemy, policy, seed, r.verdict.outcome, want, r.verdict.mana, play.cm.hero.mana); }
      if (want === 'victory') wins++; else if (want === 'defeat') losses++;
    }
  }
}
ok(same, `${combos} боёв (5 врагов × 2 стиля × 3 «игрока»): повтор совпал с игрой бит в бит — HP, мана, враг, время, перезарядки, опыт даров`);
ok(wins >= 5 && losses >= 1, `среди них и победы (${wins}), и поражения (${losses}) — проверен весь диапазон`);

console.log('\nБой: новые ветки, слоты и амулеты (v0.16.0) — сервер проигрывает то же самое');
{
  const ABIL = { telekinesis: { level: 3, unlocked: true }, fire: { level: 3, unlocked: true }, seal: { level: 3, unlocked: true } };
  const BUILDS = [
    { branches: { fire: 'arsonist', seal: 'seer', telekinesis: 'lord' }, slots: ['fire', 'seal', 'telekinesis'], amulets: ['amulet_forest', 'amulet_lunar'] },
    { branches: { fire: 'blaster', seal: 'piercer', telekinesis: 'breaker' }, slots: ['fire', 'seal'], amulets: ['amulet_focus'] },
    { branches: { fire: 'arsonist' }, slots: ['telekinesis', 'fire'], amulets: [] },
  ];
  let n = 0, all = true, withFlash = 0, withPuddle = 0;
  for (const build of BUILDS) for (const [enemy, spawn, level] of MATCHUPS) for (const policy of ['smart', 'mixed']) {
    const [mh, mm] = maxOf(level);
    const ctx = ctxFor({ enemy, spawn, level: 10, abilities: ABIL, hp: mh, mana: mm, potions: { elixir_life: 2, elixir_mana: 2, resin_flask: 2 }, build });
    const play = playBot(ctx, { seed: 4, policy, maxTicks: 60 * 200 });
    const snap = snapFor(ctx);
    const r = verifyCombat(snap, JSON.parse(JSON.stringify(play.log)), snap.combatSince + play.log.ticks * STEP * 1000 + 1000);
    n++;
    if (!r.ok || r.verdict.outcome !== (play.cm.result || 'retreat') || r.verdict.mana !== play.cm.hero.mana) { all = false; console.log('   ✗ расхождение', enemy, policy, r.reason, r.verdict?.outcome, play.cm.result); }
    if (play.cm.stats.abilityUses.seal && build.branches.seal) withFlash++;
    if (play.cm.stats.abilityUses.fire && build.branches.fire === 'arsonist') withPuddle++;
    if (build.slots.length < 3 && !build.slots.includes('seal') && play.cm.stats.abilityUses.seal) { all = false; console.log('   ✗ дар вне слота сработал'); }
  }
  ok(all, `${n} боёв с ветками Огня и Астрала, слотами и амулетами: сервер проигрывает запись бит в бит`);
  ok(withFlash > 0 && withPuddle > 0, `в этих боях применялись и вспышка (${withFlash}), и лужа (${withPuddle})`);
}

console.log('\nБой: Лёд и «3 из 4» (v0.18.0) — сервер проигрывает то же самое');
{
  const ABIL4 = { telekinesis: { level: 3, unlocked: true }, fire: { level: 3, unlocked: true }, seal: { level: 3, unlocked: true }, ice: { level: 3, unlocked: true } };
  const BUILDS = [
    { branches: { ice: 'frost', telekinesis: 'lord' }, slots: ['ice', 'telekinesis', 'fire'], amulets: [] },
    { branches: { ice: 'shard', seal: 'piercer' }, slots: ['ice', 'seal', 'telekinesis'], amulets: ['amulet_focus'] },
    { branches: { ice: 'shard', fire: 'blaster' }, slots: ['telekinesis', 'fire', 'seal'], amulets: [] },
  ];
  let n = 0, all = true, iceUses = 0, benchedUsed = false;
  for (const build of BUILDS) for (const [enemy, spawn] of MATCHUPS) for (const policy of ['smart', 'mixed']) {
    const ctx = ctxFor({ enemy, spawn, level: 12, abilities: ABIL4, hp: 214, mana: 175, potions: { elixir_life: 2, elixir_mana: 2, resin_flask: 2 }, build });
    const play = playBot(ctx, { seed: 5, policy, maxTicks: 60 * 200 });
    const snap = snapFor(ctx);
    const r = verifyCombat(snap, JSON.parse(JSON.stringify(play.log)), snap.combatSince + play.log.ticks * STEP * 1000 + 1000);
    n++;
    if (!r.ok || r.verdict.outcome !== (play.cm.result || 'retreat') || r.verdict.mana !== play.cm.hero.mana) { all = false; console.log('   ✗ расхождение', enemy, policy, r.reason); }
    iceUses += play.cm.stats.abilityUses.ice;
    for (const id of ['telekinesis', 'fire', 'seal', 'ice']) if (!build.slots.includes(id) && play.cm.stats.abilityUses[id]) benchedUsed = true;
  }
  ok(all, `${n} боёв с Льдом (Мороз / Осколок) и выбором 3 из 4: сервер проигрывает запись бит в бит`);
  ok(iceUses > 0 && !benchedUsed, `Лёд применялся (${iceUses} раз), дар вне слота — ни разу`);
}

console.log('\nБой: запись');
{
  const ctx = ctxOf('rootling', 'rootling_01', 5);
  const play = playBot(ctx, { seed: 9 });
  const a = normalizeLog(JSON.parse(JSON.stringify(play.log)));
  ok(a && JSON.stringify(a) === JSON.stringify(play.log), 'нормальная запись проходит проверку формы без изменений');
  const again = playBot(ctx, { seed: 9 });
  ok(JSON.stringify(again.log) === JSON.stringify(play.log), 'один и тот же игрок в том же бою даёт ту же запись (бой без случайных чисел)');
  // нарочно «лишние» действия не помогают: дар на перезарядке, зелье без остатка, выбор несуществующего предмета
  const spam = { ...play.log, ev: [[0, 'a', 'fire'], ...Array.from({ length: 300 }, () => [0, 'a', 'fire']), ...Array.from({ length: 50 }, () => [0, 'p', 'resin_flask']), [0, 's', 'no_such_thing'], ...play.log.ev] };
  const snap = snapFor(ctx);
  const rs = verifyCombat(snap, spam, snap.combatSince + 900_000);
  ok(rs.ok && rs.verdict.entry.uses.fire <= 3 + play.cm.stats.abilityUses.fire && (rs.verdict.potions.resin_flask || 0) <= 2, `300 нажатий «Огонь» подряд — сработает не больше, чем позволяют мана и перезарядка (огонь: ${rs.verdict?.entry.uses.fire})`);
  // убрать все действия — враг побеждает
  const none = { ...play.log, ev: [] };
  const rn = verifyCombat(snap, none, snap.combatSince + 900_000);
  ok(rn.ok && rn.verdict.outcome !== 'victory', 'без действий игрока победы нет (' + rn.verdict.outcome + ')');
  // сдвиг действий по времени меняет исход боя так, как его изменил бы игрок — сервер просто проигрывает то, что получил
  const shifted = { ...play.log, ev: play.log.ev.map(([t, c, x]) => (x === undefined ? [t + 5, c] : [t + 5, c, x])), ticks: play.log.ticks + 5 };
  const rsh = verifyCombat(snap, shifted, snap.combatSince + 900_000);
  ok(rsh.ok && ['victory', 'defeat', 'retreat'].includes(rsh.verdict.outcome), 'сдвинутая запись проигрывается без ошибок (исход решает движок)');
  // время: больше шагов, чем реальных секунд, — отказ; ровно по времени — принято
  const t0 = snapFor(ctx).combatSince;
  ok(verifyCombat(snap, play.log, t0 + (play.log.ticks * STEP - SLACK_SEC - 1) * 1000).reason === 'too_fast', 'быстрее реального времени — too_fast');
  ok(verifyCombat(snap, play.log, t0 + (play.log.ticks * STEP) * 1000).ok, 'в реальное время — принято');
}

console.log('\nБой: проверка формы записи (мусор не роняет сервер)');
{
  let rnd = 99; const R = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
  const pick = (a) => a[Math.floor(R() * a.length)];
  const junk = () => pick([null, undefined, 0, -1, 1.5, 1e9, 'x', '', [], {}, [[]], [[1]], [[0, 'a']], [[0, 'a', 'fire']], [[0, 'z', 'x']], true, { __proto__: null }, NaN, Infinity, 'a'.repeat(100)]);
  let thrown = 0, accepted = 0;
  for (let i = 0; i < 3000; i++) {
    const raw = { v: pick([1, 1, 1, 2, '1', null]), ticks: pick([0, 10, 100, 60 * 60 * 15, 60 * 60 * 15 + 1, -1, 1.5, junk()]), ev: pick([[], [[0, 'a', 'fire']], [[5, 'c']], [[5, 'a', 'fire'], [2, 'c']], junk(), [junk()], [[0, 'p', 'x'.repeat(65)]]]), hold: pick([[], [0], [0, 5], [5, 0], junk()]) };
    try { const n = normalizeLog(raw); if (n) { accepted++; JSON.stringify(n); } } catch (e) { thrown++; }
  }
  ok(thrown === 0 && accepted > 0, `3000 испорченных записей: ни одной ошибки (приняты только корректные: ${accepted})`);
  ok(normalizeLog({ v: 1, ticks: MAX_TICKS + 1, ev: [], hold: [] }) === null && normalizeLog({ v: 1, ticks: 10, ev: Array.from({ length: 2001 }, () => [0, 'c']), hold: [] }) === null, 'слишком длинные записи отвергаются');
}

console.log('\nБой: пауза врага (обучение)');
{
  const ctx = ctxFor();
  const hold = (t) => t < 120 || (t >= 400 && t < 480);
  const play = playBot(ctx, { seed: 4, hold });
  const snap = snapFor(ctx);
  const r = verifyCombat(snap, play.log, snap.combatSince + 900_000);
  ok(r.ok && r.verdict.outcome === play.cm.result && r.verdict.mana === play.cm.hero.mana, 'пауза врага в первом бою проигрывается так же, как играется');
  ok(play.log.hold.join() === '0,120,400,480', 'в записи — только границы пауз (0,120,400,480)');
  const after = snapFor(ctx, { enemies: ['scavenger_01'] });
  ok(verifyCombat(after, play.log, snap.combatSince + 900_000).reason === 'down', 'после победы над врагом он не возрождается: бой не засчитывается');
}

console.log(failures ? `\nПровалено проверок: ${failures}` : '\nЗапись и повтор боя: всё в порядке');
process.exit(failures ? 1 : 0);
