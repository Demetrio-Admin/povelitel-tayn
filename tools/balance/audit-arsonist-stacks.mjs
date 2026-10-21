// Audit repro: a durable dummy isolates the maximum stack count from enemy deaths.
// No cooldown/mana resets, no RNG, ordinary CombatManager and fixed step.
import { GameState } from '../../src/state/GameState.js';
import { CombatManager } from '../../src/systems/CombatManager.js';
import { AbilitySystem } from '../../src/systems/AbilitySystem.js';
import { statsFor } from '../../src/systems/abilityStats.js';

function run(level, balanceVersion) {
  const state = new GameState(null, () => 1000);
  state.data.heroLevel = 15;
  state.data.combatCtx = { balanceVersion };
  state.unlockAbility('fire', level);
  state.data.worldObjects.player_build = { slots: ['fire'], amulets: [], branches: { fire: 'arsonist' } };
  const cm = new CombatManager({ enemyType: 'audit_dummy', enemyDef: { hp: 1_000_000, arena: 'glade', normalAttack: null, strongAttack: null }, state, abilities: new AbilitySystem(state, null, null) });
  let peak = 0;
  const casts = [];
  for (let tick = 0; tick < 60 * 120; tick++) {
    if (cm.abilityState('fire').state === 'ready') {
      cm.useAbility('fire');
      casts.push({ seconds: +cm.time.toFixed(3), stacks: cm.enemy.burnStacks.length });
    }
    peak = Math.max(peak, cm.enemy.burnStacks.length);
    cm.tick(1 / 60); cm.drainEvents();
  }
  cm.enemy.hp = 1000;
  const stats = statsFor('fire', level, 'arsonist', balanceVersion);
  return { level, balanceVersion, cooldownSec: stats.cooldownSec, durationSec: stats.burn.durationSec,
    advertisedStacks: stats.burnStacks, actualPeak: peak, healingFrom100WhileBurning: cm.enemy.heal(100), casts };
}
const results = [run(4, 39), run(5, 39), run(5, 38)];
console.log(JSON.stringify({ kind: 'mechanic audit, not a balance simulation', results }, null, 2));
if (process.argv.includes('--check') && results.some(r => r.balanceVersion >= 39 && r.actualPeak < r.advertisedStacks)) {
  console.error('FAIL: the advertised Arsonist stack cap is unreachable with ordinary cooldowns.');
  process.exitCode = 1;
}
