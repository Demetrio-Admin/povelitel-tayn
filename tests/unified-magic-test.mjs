import assert from 'node:assert/strict';
import { ABILITIES } from '../src/config/balance.abilities.js';
import { UPGRADES } from '../src/config/balance.progression.js';
import { SLOT_RULES, GIFT_IDS } from '../src/config/build.js';
import { GameState, createDefaultState } from '../src/state/GameState.js';
import { powerDefinition, checkWorldAction, powerLevel, featuresAt, learnedMoves } from '../src/config/magic.powers.js';
import { EpisodeBattle, simulate, MOVES, HERO } from '../src/episode/model/combat.js';
import { autoCombatPolicy, battleDiagnosis } from '../src/episode/model/autoCombatPolicy.js';
import { battleOptions, ENCOUNTERS, brewEpisode, sellEpisodePotion, beginEpisodeResearch, encounterReward } from '../src/episode/model/progression.js';
import { freshProgress, readProgress } from '../src/episode/model/story.js';

const production = JSON.stringify({ ABILITIES, UPGRADES, SLOT_RULES, GIFT_IDS });
const data = (t = 1, f = 2) => ({ ...createDefaultState(), unlockedAbilities: ['telekinesis', 'fire', 'seal', 'curse', 'barrier'], telekinesisLevel: t, fireLevel: f, sealLevel: 1, curseLevel: 2, barrierLevel: 2 });
assert.equal(powerDefinition('seal').name, 'Астрал');
assert.equal(powerDefinition('curse'), null);
assert.equal(ABILITIES.curse, undefined);
assert.equal(SLOT_RULES.base, 3);
assert(!GIFT_IDS.includes('barrier'));
assert.equal(powerDefinition('ice'), null, 'adapter does not replace untouched production powers');
assert.deepEqual(powerDefinition('fire').branches, ABILITIES.fire.branches);
assert.deepEqual(powerDefinition('telekinesis').upgrades.telekinesis_2, UPGRADES.telekinesis_2);
const d = data();
assert.equal(checkWorldAction(d, 'fire', 'stream', { mana: 10 }).ok, true);
assert.equal(checkWorldAction(d, 'barrier', 'protect').ok, false);
assert.equal(checkWorldAction(d, 'barrier', 'protect', { experimental: true, mana: 5 }).ok, true);
assert.equal(checkWorldAction(d, 'fire', 'resin', { mana: 3 }).ok, false);
assert.equal(checkWorldAction({ ...d, fireLevel: 1 }, 'fire', 'stream').ok, false);
assert(!learnedMoves(d).includes('hold'));
assert.throws(() => new EpisodeBattle({ loadout: ['hold'], powers: d }), /Unlearned/);
// Extension to VIII is entirely data driven: no engine edits, no cap at V.
const def = { ...powerDefinition('fire'), milestones: [...powerDefinition('fire').milestones, { level: 8, features: ['living_flame'] }] };
assert(!featuresAt(def, 7).includes('living_flame'));
assert(featuresAt(def, 8).includes('living_flame'));
assert.equal(powerLevel({ ...d, fireLevel: 8 }, 'fire'), 8);
assert(checkWorldAction({ ...d, fireLevel: 8 }, 'fire', 'stream').ok);
assert(new EpisodeBattle({ loadout: ['flame'], powers: { ...d, fireLevel: 8 } }).move('flame').dmg > 30);

// Policy responds to danger and cannot spend mana or use moves it has not equipped.
const b = new EpisodeBattle({ loadout: ['barrier', 'flame', 'hex', 'astral'], powers: d });
b.enemy.state = 'windup'; b.enemy.action = 'leap'; b.enemy.timer = .4;
assert.equal(autoCombatPolicy(b), 'barrier');
b.command('barrier'); b.tick(.2); assert(b.hero.ward > 0);
const hp = b.enemy.hp; b.hitHero(30, 'leap'); assert(b.enemy.hp < hp, 'Barriers II reflect');
const spirit = new EpisodeBattle({ loadout: ['astral'], powers: d, enemy: ENCOUNTERS.forest_spirit });
assert.equal(autoCombatPolicy(spirit), 'astral'); spirit.command('astral'); spirit.tick(.4); assert.equal(spirit.enemy.armor, 0);
const cursed = new EpisodeBattle({ loadout: ['hex', 'flame'], powers: d, enemy: ENCOUNTERS.forest_spirit, familiar: true });
cursed.enemy.hp = 100; cursed.resolve('hex'); cursed.tick(.1);
assert(cursed.stats.familiarHits === 1); const afterCat = cursed.enemy.hp; cursed.tick(.2); assert.equal(cursed.enemy.hp, afterCat, 'curse II stops regen');
cursed.resolve('flame'); assert(cursed.stats.combos > 0);
const fire = new EpisodeBattle({ loadout: ['flame'], powers: data(1, 3) }); fire.resolve('flame'); assert(fire.enemy.burn > 0);
const pot = new EpisodeBattle({ loadout: ['throw'], potion: true }); pot.hero.hp = 20; pot.tick(.05); pot.tick(.05); assert.equal(pot.stats.heals, 1);
const low = simulate(['flame', 'throw'], autoCombatPolicy, { hero: { ...HERO, mana: 12 }, limit: 150 });
assert(low.stats.commands.focus > 0, 'mana deficit has a recovery path');
assert(low.result, 'no permanent idle when damage and focus are available');

// Repeatable resources and the existing recipe feed the existing inventory and research timer.
const state = new GameState({ storage: null }); state.data = data(); state.data.inventory = { coins: 120, tree_resin: 3, rune_dust: 3, moon_herb: 2, forest_mushroom: 2 }; state.data.schoolXP.telekinesis = 30;
assert(brewEpisode(state.data)); assert(sellEpisodePotion(state.data)); assert.equal(state.data.inventory.coins, 145);
const ep = { ...freshProgress(), step: 'fight' };
assert(beginEpisodeResearch(state, ep, 'telekinesis_2').ok);
assert.equal(beginEpisodeResearch(state, ep, 'telekinesis_2').ok, false, 'no double spend');
assert.equal(state.completeResearchIfReady(), null);
state.data.research.startedAt -= 4000; assert.equal(state.completeResearchIfReady(), 'telekinesis_2'); assert.equal(state.abilityLevel('telekinesis'), 2);
assert.equal(state.data.research, null);
const beforeReward = state.data.inventory.coins;
encounterReward(state.data, ENCOUNTERS.forest_wolf, ['fire', 'fire']);
assert.equal(state.data.inventory.coins, beforeReward + 20);
assert.equal(state.data.schoolXP.fire, ENCOUNTERS.forest_wolf.xp, 'one XP grant per used power');
const old = readProgress({ getObject: () => ({ episode: 'first_flame', step: 'fight', fireLevel: 2 }) });
assert.deepEqual(old.encounters, {}); assert.equal(old.morven, false);
assert.deepEqual(battleOptions(state.data, { amulet: 'amulet_focus' }, 'forest_wolf').amulet, null, 'cannot equip an unowned amulet');
assert.equal(JSON.stringify({ ABILITIES, UPGRADES, SLOT_RULES, GIFT_IDS }), production, 'production configs unchanged');

// Deterministic cohort: multiple viable paths, meaningful growth and short farming.
const report = [];
for (const [name, t, f, loadout, epOptions] of [
  ['unprepared',1,2,['flame','throw','push','ward'],{}],
  ['telekinesis_II',2,2,['flame','hold','push','ignite'],{}],
  ['fire_III',1,3,['flame','throw','push','ward'],{}],
  ['curse_barrier',1,2,['hex','flame','barrier','astral'],{morven:true}],
]) {
  const results = Array.from({ length: 100 }, (_, i) => simulate(loadout, autoCombatPolicy, { ...battleOptions(data(t,f), epOptions, 'frost_wolf'), seed: i + 1, limit: 150 }));
  for (const r of results) { assert(r.result); assert(!r.stats.commands.undefined); }
  report.push({ build: name, wins: results.filter(r => r.result === 'victory').length, meanSeconds: +(results.reduce((s,r)=>s+r.time,0)/100).toFixed(1), combos: results.reduce((s,r)=>s+r.stats.combos,0) });
}
assert(report[0].wins < 50);
assert(report.slice(1).every(r => r.wins >= 80), 'several ways to overcome the boss');
assert(report[1].combos > 0 && report[3].combos > 0);
const farm = simulate(['flame','throw','push','ward'], autoCombatPolicy, { ...battleOptions(data(), {}, 'forest_wolf') }); assert.equal(farm.result, 'victory'); assert(farm.time < 10);
const middleBefore = simulate(['flame','throw','push','ward'], autoCombatPolicy, { ...battleOptions(data(), {}, 'forest_spirit') });
const middleAfter = simulate(['flame','hold','push','ignite'], autoCombatPolicy, { ...battleOptions(data(2,3), {}, 'forest_spirit') });
assert(middleAfter.time < middleBefore.time);
assert.equal(battleDiagnosis(b).length, 4);
console.table(report);
console.log('Unified magic: definitions, world checks, VIII, policy, effects, economy, old saves and 400 seeded battles passed.');
