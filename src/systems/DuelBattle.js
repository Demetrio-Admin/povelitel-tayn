// Version 2 Duel: two ordinary CombatManager actors share an arena. Only one is driven by AI.
// Damage, branches, amulets, resource clocks and charges remain in the shared combat engine.
import { Enemy } from '../objects/Enemy.js';
import { GameState } from '../state/GameState.js';
import { AbilitySystem } from './AbilitySystem.js';
import { HERO_BASE } from '../config/balance.hero.js';

class DuelBody extends Enemy {
  constructor(actor, name) {
    super('duel_fighter', { name, hp: actor.hero.maxHp, normalAttack: null, strongAttack: null, arena: 'duel' }, true);
    this.actor = actor;
    this.pending = null;
    Object.defineProperty(this, 'hp', { get: () => actor.hero.hp, set: n => { actor.hero.hp = n; } });
    Object.defineProperty(this, 'shield', { get: () => Object.values(actor.shields).reduce((n, s) => n + (s.left > 0 ? Math.max(0, s.amount) : 0), 0) });
  }
  get isPreparing() { return !this.updatingStatuses && !!this.pending; }
  get prepProgress() { return this.pending ? 1 - this.pending.left / this.pending.duration : 0; }
  takeDamage(base, school, mult = 1, options = {}) {
    if (!this.alive) return 0;
    return this.actor.hitHero(base * mult * this.incomingMultiplier(school), false, undefined, false, { ...options, silent: true });
  }
  applySlow(pct, sec) { super.applySlow(pct, sec); this.actor.chillHero({ pct, sec }); }
  cleanse() {
    this.burnStacks = []; this.burn = { left: 0, dps: 0, tick: 0 }; this.antiheal = 0;
    this.slow = { left: 0, pct: 0 };
  }
  tryInterrupt(tags) {
    if (!this.pending) return { attempted: false };
    const ok = tags.includes('telekinesis');
    if (ok) { this.pending = null; this.staggerLeft = 1; }
    return { attempted: true, ok };
  }
  update(dt, mult) {
    // Enemy's status timers/periodic damage, without its monster attack controller.
    this.updatingStatuses = true;
    try { return super.update(dt, mult); } finally { this.updatingStatuses = false; }
  }
}

export class DuelBattle {
  constructor(hero, opponent) {
    this.hero = hero;
    const state = new GameState(null, () => 0);
    state.data.heroLevel = opponent.level;
    for (const [id, a] of Object.entries(opponent.abilities)) if (a.unlocked && a.level > 0) state.unlockAbility(id, a.level);
    state.data.worldObjects = { player_build: structuredClone(opponent.build) };
    state.data.combatCtx = { balanceVersion: 38, potionLoadout: [] };
    const stats = state.heroStats();
    state.data.hp = stats.maxHp;
    state.data.mana = stats.maxMana;
    const defender = new hero.constructor({ enemyType: 'duel_target', enemyDef: { hp: hero.hero.maxHp, arena: 'duel' }, state, abilities: new AbilitySystem(state, null, null) });
    defender.hero.maxHp = hero.def.hp;
    defender.hero.hp = hero.def.hp;
    this.defender = defender;
    hero.duelBody = new DuelBody(hero, 'Герой');
    defender.duelBody = new DuelBody(defender, hero.def.name);
    hero.enemy = defender.duelBody;
    defender.enemy = hero.duelBody;
    // Shared, finite objects: neither side can throw a stone the other just used.
    hero.fieldObjects = hero.fieldObjects.filter(o => !o.def.breaksArmor);
    defender.fieldObjects = hero.fieldObjects;
    this.thinkLeft = .35;
    this.cursor = 0;
  }

  beginCast(actor, id) {
    const paid = actor.payAbility(id);
    if (!paid.ok) return paid;
    const duration = actor === this.hero ? paid.stats.castSec : Math.max(.65, paid.stats.castSec);
    actor.duelBody.pending = { id, stats: paid.stats, left: duration, duration, selected: actor.selectedId };
    actor.duelBody.def.strongAttack = { name: paid.stats.label, hint: 'Прервите Телекинезом!', interruptBy: ['telekinesis'] };
    if (actor === this.defender) this.hero.emit({ type: 'warning', name: paid.stats.label, prepSec: duration, hint: 'Прервите Телекинезом!', needsHeavy: false });
    actor.commit();
    return { ok: true };
  }

  advanceCast(actor, dt) {
    const p = actor.duelBody.pending;
    if (!p || actor.duelBody.staggerLeft > 0) return;
    p.left -= dt * (actor.heroChill.left > 0 ? 1 - actor.heroChill.pct : 1);
    if (p.left > 1e-9) return;
    actor.duelBody.pending = null;
    const selected = actor.selectedId;
    actor.selectedId = p.selected;
    actor.resolveAbility(p.id, p.stats);
    // A selection made during the windup is kept unless that object has been consumed.
    actor.selectedId = actor.fieldObjects.some(o => o.id === selected && o.available) ? selected : null;
  }

  think() {
    const a = this.defender, target = a.enemy;
    if (a.duelBody.pending || a.duelBody.staggerLeft > 0) return;
    const slots = a.state.equippedGifts();
    let ready = slots.filter(id => a.abilityState(id).state === 'ready');
    if (!ready.length) return;
    let id;
    if (target.isPreparing && ready.includes('telekinesis')) id = 'telekinesis';
    else if (ready.includes('storm') && a.stormCharges === 3) id = 'storm';
    else {
      if (slots.some(g => g !== 'storm')) ready = ready.filter(g => g !== 'storm');
      for (let n = 0; n < slots.length; n++) {
        const i = (this.cursor + n) % slots.length;
        if (ready.includes(slots[i])) { id = slots[i]; this.cursor = (i + 1) % slots.length; break; }
      }
    }
    if (!id) return;
    if (id === 'telekinesis') {
      const objects = a.fieldObjects.filter(o => o.available && o.def.throwable && a.canLift(o));
      a.selectedId = (objects.find(o => o.def.weight === 'heavy') || objects[0])?.id || null;
    }
    this.beginCast(a, id);
  }

  forwardEvents() {
    for (const ev of this.defender.drainEvents()) {
      if (ev.type === 'damage' && ev.target === 'enemy') this.hero.emit({ ...ev, target: 'hero' });
      else if (ev.type === 'objectUsed') this.hero.emit({ ...ev, actor: 'enemy' });
      else if (ev.type === 'status' || ev.type === 'interrupt') this.hero.emit({ ...ev, target: 'hero' });
      // Defender XP, refunds and mana rescue stay private to its simulation.
    }
  }

  tick(dt, { holdEnemy = false } = {}) {
    const h = this.hero, d = this.defender;
    // No tutorial pause in Duel. The verifier rejects recordings containing hold ticks.
    if (holdEnemy) return;
    for (const a of [h, d]) a.tickResources(dt);
    h.time += dt; d.time = h.time;
    for (const [body, source, target] of [[h.duelBody, d, 'hero'], [d.duelBody, h, 'enemy']]) {
      for (const ev of body.update(dt, source.hero.damageMult)) {
        if (ev.type === 'burnTick') h.emit({ type: 'damage', target, amount: ev.damage, school: 'fire', tick: true, puddle: !!ev.puddle });
      }
    }
    for (const o of h.fieldObjects) {
      if (o.available || o.gone) continue;
      o.respawnLeft -= dt;
      if (o.respawnLeft <= 0) { o.available = true; h.emit({ type: 'objectRespawn', id: o.id }); }
    }
    for (const a of [h, d]) {
      if (h.hero.hp <= 0 || d.hero.hp <= 0) break;
      this.advanceCast(a, dt);
      if (h.hero.hp <= 0 || d.hero.hp <= 0) break;
      if (a.duelBody.staggerLeft > 0) continue;
      a.hero.autoTimer -= dt * (a.heroChill.left > 0 ? 1 - a.heroChill.pct : 1);
      if (a.hero.autoTimer <= 0) {
        a.hero.autoTimer += HERO_BASE.autoAttack.intervalSec;
        const amount = a.enemy.takeDamage(a.duelBody.outgoingDamage(HERO_BASE.autoAttack.damage), 'auto', a.hero.damageMult);
        a.stats.autoDamage += amount;
        a.emit({ type: 'damage', target: 'enemy', amount, school: 'auto' });
      }
    }
    h.checkResult(); d.checkResult();
    if (!h.result) {
      this.thinkLeft -= dt;
      if (this.thinkLeft <= 0) { this.thinkLeft += .35; this.think(); }
    }
    this.forwardEvents();
    h.commit(); d.commit();
  }
}
