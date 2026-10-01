// CombatManager — логика real-time tactical боя (Combat Math v0.1). Без рендеринга:
// CombatScene вызывает tick(dt), useAbility(id), selectObject(id) и читает drainEvents() для анимаций.
// Главное правило: враг действует сам, игрок вмешивается магией. Герой сам делает слабую автоатаку.
import { ENEMIES, FIELD_OBJECTS, ARENAS } from '../config/balance.enemies.js';
import { HERO_BASE } from '../config/balance.hero.js';
import { Enemy } from '../objects/Enemy.js';
import { ABILITY_ORDER } from './AbilitySystem.js';

export class CombatManager {
  /**
   * @param {object} o
   * @param {string} o.enemyType ключ в ENEMIES
   * @param {import('../state/GameState.js').GameState} o.state
   * @param {import('./AbilitySystem.js').AbilitySystem} o.abilities
   */
  constructor({ enemyType, state, abilities }) {
    this.state = state;
    this.abilities = abilities;
    this.def = ENEMIES[enemyType];
    if (!this.def) throw new Error(`Unknown enemy type ${enemyType}`);
    this.enemy = new Enemy(enemyType, this.def);

    const hs = state.heroStats();
    this.hero = {
      maxHp: hs.maxHp, hp: hs.maxHp,
      maxMana: hs.maxMana, mana: hs.maxMana,
      regen: hs.manaRegen, damageMult: hs.damageMult,
      autoTimer: HERO_BASE.autoAttack.intervalSec,
    };
    this.cooldowns = Object.fromEntries(ABILITY_ORDER.map(id => [id, 0]));
    const arena = ARENAS[this.def.arena] || ARENAS.glade;
    this.arena = arena;
    this.fieldObjects = arena.objects.map(o => ({ ...o, def: FIELD_OBJECTS[o.type], available: true, respawnLeft: 0 }));
    this.selectedId = null;
    this.time = 0;
    this.result = null; // 'victory' | 'defeat'
    this.queue = [];
    this.stats = { abilityUses: { telekinesis: 0, fire: 0, seal: 0 }, interrupts: 0, damageTaken: 0, autoDamage: 0 };
  }

  emit(e) { this.queue.push(e); }
  drainEvents() { const q = this.queue; this.queue = []; return q; }

  // ---------- выбор объектов поля ----------
  selectObject(id) {
    const o = this.fieldObjects.find(f => f.id === id);
    if (!o || !o.available) return false;
    this.selectedId = this.selectedId === id ? null : id;
    this.emit({ type: 'select', id: this.selectedId });
    return true;
  }
  cycleSelection() {
    const avail = this.fieldObjects.filter(f => f.available);
    if (!avail.length) { this.selectedId = null; return; }
    const idx = avail.findIndex(f => f.id === this.selectedId);
    const next = idx + 1 >= avail.length ? null : avail[idx + 1].id;
    this.selectedId = next;
    this.emit({ type: 'select', id: next });
  }
  selectedObject() { return this.fieldObjects.find(f => f.id === this.selectedId && f.available) || null; }

  // ---------- состояние кнопок ----------
  abilityState(id) {
    const s = this.abilities.stats(id);
    if (!s || !this.abilities.isUnlocked(id)) return { id, state: 'locked' };
    const cd = this.cooldowns[id];
    if (cd > 0) return { id, state: 'cooldown', cdLeft: cd, cdFrac: cd / s.cooldownSec };
    if (this.hero.mana < s.manaCost) return { id, state: 'nomana' };
    return { id, state: 'ready' };
  }

  // ---------- действия игрока ----------
  useAbility(id) {
    if (this.result) return { ok: false, reason: 'over' };
    const st = this.abilityState(id);
    if (st.state !== 'ready') return { ok: false, reason: st.state };
    const s = this.abilities.stats(id);
    this.hero.mana -= s.manaCost;
    this.cooldowns[id] = s.cooldownSec;
    this.stats.abilityUses[id]++;
    this.abilities.grantUseXP(id, 'combat');

    if (id === 'telekinesis') this.castTelekinesis(s);
    else if (id === 'fire') this.castFire(s);
    else if (id === 'seal') this.castSeal(s);
    this.checkResult();
    return { ok: true };
  }

  castTelekinesis(s) {
    const obj = this.selectedObject();
    const tags = ['telekinesis'];
    if (obj && obj.def.breaksArmor) {
      obj.available = false;
      this.selectedId = null;
      const broke = this.enemy.breakArmor();
      obj.respawnLeft = (this.def.armor ? this.def.armor.disabledSec : 0) + (obj.def.respawnAfterArmorSec || 0);
      this.emit({ type: 'objectUsed', id: obj.id, action: 'shatter' });
      if (broke) this.emit({ type: 'armorBroken', sec: this.def.armor.disabledSec });
      this.handleInterrupt(tags);
      return;
    }

    let base = s.damage;
    if (obj && obj.def.throwable) {
      const heavy = obj.def.weight === 'heavy';
      if (heavy) { base *= 1 + s.heavyObjectBonus; tags.push('telekinesis_heavy'); }
      base *= 1 + (s.throwDamageBonus || 0);
      obj.available = false;
      obj.respawnLeft = obj.def.respawnSec;
      this.selectedId = null;
      this.emit({ type: 'objectUsed', id: obj.id, action: 'throw', heavy });
    }
    if (!s.interruptsNormalCast) tags.shift();
    this.handleInterrupt(tags);
    const dmg = this.enemy.takeDamage(base, 'telekinesis', this.hero.damageMult);
    this.emit({ type: 'damage', target: 'enemy', amount: dmg, school: 'telekinesis', heavy: tags.includes('telekinesis_heavy') });
  }

  castFire(s) {
    const dmg = this.enemy.takeDamage(s.damage, 'fire', this.hero.damageMult);
    this.emit({ type: 'damage', target: 'enemy', amount: dmg, school: 'fire' });
    this.enemy.applyBurn(s.burn.dps, s.burn.durationSec);
    this.emit({ type: 'status', status: 'burn', sec: s.burn.durationSec });
    for (const e of this.enemy.onFireHit()) this.emit({ type: 'status', status: e.type, sec: e.sec, bonus: e.bonus });
    if (s.interruptsNormalCast) this.handleInterrupt(['fire']);
  }

  castSeal(s) {
    this.handleInterrupt(['seal']);
    this.enemy.bind(s.bindSec);
    this.enemy.weaken(s.weaken.damageReduction, s.weaken.durationSec);
    this.emit({ type: 'status', status: 'bound', sec: s.bindSec });
  }

  handleInterrupt(tags) {
    const r = this.enemy.tryInterrupt(tags);
    if (!r.attempted) return;
    if (r.ok) { this.stats.interrupts++; this.emit({ type: 'interrupt', ok: true }); }
    else this.emit({ type: 'interrupt', ok: false, hint: this.def.strongAttack?.hint });
  }

  // ---------- симуляция ----------
  tick(dt) {
    if (this.result) return;
    this.time += dt;
    const h = this.hero;
    h.mana = Math.min(h.maxMana, h.mana + h.regen * dt);
    for (const id of ABILITY_ORDER) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);

    // автоатака героя
    h.autoTimer -= dt;
    if (h.autoTimer <= 0) {
      h.autoTimer += HERO_BASE.autoAttack.intervalSec;
      const dmg = this.enemy.takeDamage(HERO_BASE.autoAttack.damage, 'auto', h.damageMult);
      this.stats.autoDamage += dmg;
      this.emit({ type: 'damage', target: 'enemy', amount: dmg, school: 'auto' });
    }

    // объекты поля
    for (const o of this.fieldObjects) {
      if (o.available) continue;
      o.respawnLeft -= dt;
      if (o.respawnLeft <= 0) { o.available = true; this.emit({ type: 'objectRespawn', id: o.id }); }
    }

    // действия врага
    for (const a of this.enemy.update(dt, h.damageMult)) {
      switch (a.type) {
        case 'attack': this.hitHero(a.damage, false); break;
        case 'strongHit': this.hitHero(a.damage, true, a.name); break;
        case 'strongStart': this.emit({ type: 'warning', name: a.name, prepSec: a.prepSec, hint: a.hint, needsHeavy: a.interruptBy.includes('telekinesis_heavy') && !a.interruptBy.includes('telekinesis') }); break;
        case 'burnTick': this.emit({ type: 'damage', target: 'enemy', amount: a.damage, school: 'fire', tick: true }); break;
        case 'armorBack': this.emit({ type: 'armorBack' }); break;
        default: this.emit({ type: 'status', status: a.type });
      }
    }
    this.checkResult();
  }

  hitHero(damage, strong, name) {
    this.hero.hp = Math.max(0, this.hero.hp - damage);
    this.stats.damageTaken += damage;
    this.emit({ type: 'damage', target: 'hero', amount: damage, strong, name });
  }

  checkResult() {
    if (this.result) return;
    if (this.enemy.hp <= 0) this.result = 'victory';
    else if (this.hero.hp <= 0) this.result = 'defeat';
    if (this.result) this.emit({ type: 'result', result: this.result, time: this.time });
  }
}
