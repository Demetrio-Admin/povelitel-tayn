import assert from 'node:assert/strict';
import { simulate } from '../src/episode/model/combat.js';
import { autoCombatPolicy } from '../src/episode/model/autoCombatPolicy.js';
import { PRACTICE_LESSONS, practiceOptions, suggestedLoadouts, practiceFeedback } from '../src/episode/model/battlePractice.js';
const results = PRACTICE_LESSONS.map((lesson, i) => lesson.presets.map(p => {
  const options = practiceOptions(i), before = JSON.stringify(options);
  assert(p.moves.every(id => lesson.moves.includes(id)));
  const b = simulate(p.moves, autoCombatPolicy, { ...options, limit: 150 });
  assert.equal(JSON.stringify(options), before, 'borrowed training powers and enemy templates are immutable during play');
  assert(b.result, 'every practice battle ends');
  assert(practiceFeedback(i, b).length > 40);
  return b;
}));
assert(results.every(r => r[0].result === 'victory'), 'recommended pairs complete all four lessons');
assert(results[1][0].stats.comboTypes.heldFlame > 0);
assert(results[1][0].stats.damageTaken < results[1][1].stats.damageTaken, 'control reduces incoming damage');
assert.equal(results[2][0].enemy.armor, 0);
assert(results[2][0].time < results[2][1].time, 'Astral gives an observable advantage against armor');
assert.equal(results[3][1].result, 'defeat', 'attack-only wolf lesson demonstrates why protection matters');
assert(results[3][0].stats.damageTaken < results[3][1].stats.damageTaken);
for (const learned of [['throw','push'], ['throw','flame','ward'], ['throw','hold','flame','astral','hex','barrier']]) {
  for (const p of suggestedLoadouts(learned, 'forest_spirit')) {
    assert(p.moves.length > 0 && p.moves.length <= 4);
    assert(p.moves.every(id => learned.includes(id)), 'normal presets cannot unlock moves');
  }
}
console.log('Four practice battles: completion, automatic combos, armor counters, protection, immutable borrowed powers and learned-only presets passed.');
