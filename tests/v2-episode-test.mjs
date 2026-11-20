import assert from 'node:assert/strict';
import { CORE, GIFT_RULES, baseBattleCoins, tideAt, encounterHp, coverage, defensiveRatings, incomingDamage, effectiveCooldown } from '../src/config/horizon/rules.js';
import { PREVIEW_CORE } from '../src/config/horizon/previewTuning.js';
import { HorizonBattle, HORIZON_STEP_MS, replayHorizonBattle } from '../src/systems/HorizonBattle.js';
import {
  STORY_ENCOUNTERS, battleContext, finishDialogue, huntOffers, starterState,
  claimMirraLantern, restoreWorkbench, settleVictory, tideStatus, upgradeWand,
} from '../src/v2/episode.js';

const now = Date.UTC(2026, 10, 19, 12);

function play(context, strategy) {
  const battle = new HorizonBattle(context);
  const events = [];
  while (!battle.result && battle.tick < 1600) {
    strategy(battle);
    battle.advance();
    assert.ok(battle.enemies.filter(enemy => enemy.castUntil > battle.tick).length <= 1);
    events.push(...battle.drainEvents());
  }
  assert.equal(battle.result, 'victory');
  const replay = replayHorizonBattle(context, battle.record());
  assert.equal(replay.result, battle.result);
  assert.deepEqual(replay.enemies, battle.enemies);
  assert.deepEqual(replay.hero, battle.hero);
  assert.deepEqual(replay.objects, battle.objects);
  assert.equal(replay.charge, battle.charge);
  assert.equal(replay.foxBonus, battle.foxBonus);
  return { battle, events, seconds: battle.tick * HORIZON_STEP_MS / 1000 };
}

const castAtStone = (battle, gift, object) => battle.command({ type: 'cast_on_object', gift, object });
let state = finishDialogue(starterState());
assert.equal(state.step, 'spark');
assert.deepEqual(huntOffers(state, now), []);
const first = play(battleContext(state, STORY_ENCOUNTERS.spark), battle => {
  if ([35, 203].includes(battle.tick)) assert.equal(castAtStone(battle, 'fire', 'light'), true);
  if ([62, 214].includes(battle.tick)) assert.equal(castAtStone(battle, 'telekinesis', 'light'), true);
});
assert.equal(first.battle.combos, 2);
assert.ok(first.seconds >= 12 && first.seconds <= 15, 'First battle time: ' + first.seconds);
assert.ok(first.events.some(event => event.source === 'fire-stone'));
assert.ok(first.events.some(event => event.source === 'impulse'));

state = settleVictory(state, STORY_ENCOUNTERS.spark, false, now).state;
assert.equal(state.step, 'lantern');
assert.deepEqual([state.coins, state.herbs, state.storyPage], [0, 0, false]);
state = claimMirraLantern(state);
assert.deepEqual([state.step, state.coins, state.herbs, state.storyPage], ['upgrade', 65, 3, true]);
assert.equal(claimMirraLantern(state), state);
assert.deepEqual([state.coins, state.herbs, state.storyPage], [65, 3, true]);
assert.equal(settleVictory(state, STORY_ENCOUNTERS.spark, false, now).state, state);
state = upgradeWand(state);
assert.equal(state.step, 'frost');
assert.deepEqual([state.coins, state.herbs, state.wandRank], [5, 1, PREVIEW_CORE.episode_wand_rank_step]);
assert.equal(upgradeWand(state), state);
const second = play(battleContext(state, STORY_ENCOUNTERS.frost), () => {});
assert.equal(second.battle.intervals.wand, 26);
assert.ok(second.seconds <= 18, 'Second battle time: ' + second.seconds);
assert.ok(second.events.some(event => event.source === 'impulse'));

state = settleVictory(state, STORY_ENCOUNTERS.frost, false, now).state;
assert.equal(state.step, 'thaw');
assert.deepEqual([state.coins, state.herbs, state.fox], [45, 3, false]);
state = finishDialogue(state);
assert.deepEqual([state.step, state.fox, state.foxStars], ['veda', true, 1]);
state = finishDialogue(finishDialogue(state));
assert.equal(state.step, 'hunt');
const warmed = restoreWorkbench(state);
assert.deepEqual([warmed.step, warmed.workbenchRestored, warmed.coins - state.coins, warmed.herbs - state.herbs],
  ['hunt', true, 50, 3]);
assert.equal(restoreWorkbench(warmed), warmed);
assert.equal(tideStatus(state, now).remaining, 20);

const offers = huntOffers(state, now);
assert.deepEqual(offers.map(offer => offer.level), [1, 1, 2, 3]);
assert.deepEqual(offers.map(offer => offer.enemies.length), [1, 2, 2, 3]);
const hardest = offers.at(-1);
const hunt = play(battleContext(state, hardest), battle => {
  if (battle.tick === 1) {
    assert.equal(battle.command({ type: 'focus', target: 1 }), true);
    assert.equal(battle.command({ type: 'focus', target: '0' }), false);
    assert.equal(battle.command({ type: 'cast', gift: '__proto__' }), false);
  }
  for (const stone of Object.values(battle.objects)) {
    if (stone.respawnAt > battle.tick) continue;
    if (stone.tag) castAtStone(battle, 'telekinesis', stone.id);
    else castAtStone(battle, 'fire', stone.id);
  }
});
assert.ok(hunt.events.some(event => event.source === 'fox'));
state = settleVictory(state, hardest, hunt.battle.foxBonus, now).state;
assert.deepEqual([state.huntLevel, state.shards, state.bestiary.thorn], [2, 1, 1]);
assert.equal(tideStatus(state, now).remaining, 19);
assert.equal(tideStatus(state, now + 86400000).remaining, 20);
assert.equal(baseBattleCoins(1) * tideAt(0).value, 20);
assert.deepEqual([19, 20, 49, 50, 149, 150].map(wins => tideAt(wins).value), [5, 2, 2, 1, 1, 0.3]);
assert.equal(settleVictory(state, hardest, false, now).state, state);
assert.equal(huntOffers(state, now).at(-1).ready, false);
assert.equal(huntOffers(state, now + 30000).at(-1).ready, true);
assert.throws(() => replayHorizonBattle(battleContext(state, hardest), {
  ticks: 2, actions: [{ tick: 0, type: 'cast_on_object', gift: 'fire', object: 'missing' }],
}), /Invalid battle action/);
console.log('V2 episode passed. Story battles: ' + first.seconds + ' s / ' + second.seconds + ' s, trio: ' + hunt.seconds + ' s.');

assert.deepEqual(['normal', 'elite', 'boss'].map(tier => encounterHp(1, tier, 1)), [240, 580, 1400]);
assert.equal(coverage('splash', false), 0.45);
assert.equal(coverage('chain', true), 0.60);
assert.equal(coverage('single', false), 0);
assert.equal(effectiveCooldown(10, 0.95), 5);
assert.equal(incomingDamage(100, { armor: 0.65, resistance: 0.6, potion: 0.6, amulet: 0.9 }), 10);
for (let level = 1; level <= 200; level++) {
  const effects = defensiveRatings(level, { armor: 1e9, resistance: 1e9, cooldown: 1e9, crit: 1e9 });
  assert.ok(effects.armor <= CORE.armor_cap);
  assert.ok(effects.resistance <= CORE.status_resist_cap);
  assert.ok(effects.cooldown <= CORE.cdr_cap);
  assert.ok(effects.crit <= CORE.crit_cap);
}
assert.equal(GIFT_RULES.fire.mana, null);
assert.equal(GIFT_RULES.telekinesis.cd_sec, null);
assert.equal(Object.hasOwn(CORE, 'episode_enemy_hit_mult'), false);
