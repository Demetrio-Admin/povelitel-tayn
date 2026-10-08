// Игрок-бот для тестов боя (v0.14.0): играет CombatManager на фиксированном шаге и записывает действия так же, как CombatScene.
// Нужен, чтобы получить настоящие записи боя и сверять их с повтором на «сервере» (cloud/combatVerify.js).
import { CombatManager } from '../../src/systems/CombatManager.js';
import { AbilitySystem, ABILITY_ORDER } from '../../src/systems/AbilitySystem.js';
import { CombatRecorder, STEP } from '../../src/systems/combatReplay.js';
import { startState } from '../../src/cloud/combatVerify.js';
import { duelEnemyDef } from '../../src/config/duel.js';

/**
 * @param ctx   combatCtx (то, что запомнил сервер)
 * @param opts  { seed, hold(tick, cm) → bool, maxTicks, potions: bool, policy }
 * Возвращает { log, cm, st }. Детерминированный «случайный» выбор по seed.
 */
export function playBot(ctx, opts = {}) {
  const st = startState(ctx, opts.nowMs ?? 1_700_000_000_000);
  const cm = new CombatManager({ enemyType: ctx.enemy, enemyDef: ctx.duel ? duelEnemyDef(ctx.duel.opponent) : null, state: st, abilities: new AbilitySystem(st, null, null) });   // v0.26.0: Дуэль
  const rec = new CombatRecorder();
  let x = (opts.seed ?? 1) >>> 0 || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const maxTicks = opts.maxTicks ?? 60 * 240;
  const act = (code, arg) => {
    let r;
    if (code === 'a') r = cm.useAbility(arg);
    else if (code === 'p') r = cm.usePotion(arg);
    else if (code === 's') r = { ok: cm.selectObject(arg) };
    else { cm.cycleSelection(); r = { ok: true }; }
    if (r.ok) rec.input(code, arg);
    return r.ok;
  };
  while (!cm.result && rec.ticks < maxTicks) {
    // игрок реагирует не каждый шаг: ~6 раз в секунду
    if (rec.ticks % 10 === 0) {
      const policy = opts.policy || 'smart';
      const e = cm.enemy;
      if (opts.driver) opts.driver(cm, act);
      else if (policy === 'idle') { /* ничего не делает */ }
      else {
        if (rnd() < 0.15) { const o = cm.fieldObjects.filter(f => f.available && f.def.throwable)[0]; if (o) act('s', o.id); }
        if (cm.hero.hp < cm.hero.maxHp * 0.4 && opts.potions !== false && rnd() < 0.5) act('p', 'elixir_life');
        if (cm.hero.mana < cm.hero.maxMana * 0.2 && opts.potions !== false && rnd() < 0.5) act('p', 'elixir_mana');
        // v0.18.0: Лёд — первым, если враг готовит удар и Телекинез на перезарядке (замедление даёт время), иначе после Огня
        const order = policy === 'smart' && e.isPreparing ? ['telekinesis', 'ice', 'fire', 'seal'] : ['ice', 'fire', 'seal', 'telekinesis'];
        if (policy === 'smart' || rnd() < 0.6) for (const id of order) if (cm.abilityState(id).state === 'ready' && (id !== 'telekinesis' || policy !== 'smart' || e.isPreparing || rnd() < 0.3)) { act('a', id); break; }
        if (rnd() < 0.03) act('c');
      }
    }
    if (cm.result) break;
    const h = opts.hold ? !!opts.hold(rec.ticks, cm) : false;
    rec.beforeTick(h);
    cm.tick(STEP, { holdEnemy: h });
    rec.afterTick();
  }
  return { log: rec.toJSON(), cm, st };
}

export const ctxFor = (over = {}) => ({
  spawn: 'scavenger_01', enemy: 'forest_scavenger', level: 1, balanceVersion: 30,
  abilities: { telekinesis: { level: 1, unlocked: true }, fire: { level: 0, unlocked: false }, seal: { level: 0, unlocked: false }, ice: { level: 0, unlocked: false }, ...(over.abilities || {}) },
  hp: 100, mana: 100, potions: { elixir_life: 0, elixir_mana: 0, resin_flask: 0 }, build: null,
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'abilities')),
});
