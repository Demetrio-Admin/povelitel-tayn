// CombatManager — логика real-time tactical боя (Combat Math v0.1). Без рендеринга:
// CombatScene вызывает tick(dt), useAbility(id), selectObject(id) и читает drainEvents() для анимаций.
// Главное правило: враг действует сам, игрок вмешивается магией. Герой сам делает слабую автоатаку.
import { ENEMIES, FIELD_OBJECTS, ARENAS } from '../config/balance.enemies.js';
import { HERO_BASE } from '../config/balance.hero.js';
import { Enemy } from '../objects/Enemy.js';
import { ABILITY_ORDER } from './AbilitySystem.js';
import { POTIONS, POTION_BATTLE_LIMIT } from '../config/resources.js';
import * as vitals from '../state/vitals.js';

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
    // v0.9: бой начинается с текущих запасов героини (не с полных); всё, что изменилось в бою, пишется обратно (commit)
    this.hero = {
      maxHp: hs.maxHp, hp: vitals.hp(state),
      maxMana: hs.maxMana, mana: vitals.mana(state),
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

  /** v0.9: текущие HP и мана боя → общее состояние героини (HUD, профиль, сохранение видят одно и то же). */
  commit() { vitals.setHp(this.state, this.hero.hp); vitals.setMana(this.state, this.hero.mana); }
  drainEvents() { const q = this.queue; this.queue = []; return q; }

  // ---------- выбор объектов поля ----------
  selectObject(id) {
    const o = this.fieldObjects.find(f => f.id === id);
    if (!o || !o.available) return false;
    // v0.10.0: вес проверяется в бою так же, как в мире — тяжёлый камень только с Телекинезом II
    if (o.def.throwable && !this.canLift(o)) { this.emit({ type: 'select', id: this.selectedId, refused: id, reason: 'heavy' }); return false; }
    this.selectedId = this.selectedId === id ? null : id;
    this.emit({ type: 'select', id: this.selectedId });
    return true;
  }
  cycleSelection() {
    const avail = this.fieldObjects.filter(f => f.available && (!f.def.throwable || this.canLift(f)));
    if (!avail.length) { this.selectedId = null; return; }
    const idx = avail.findIndex(f => f.id === this.selectedId);
    const next = idx + 1 >= avail.length ? null : avail[idx + 1].id;
    this.selectedId = next;
    this.emit({ type: 'select', id: next });
  }
  selectedObject() { return this.fieldObjects.find(f => f.id === this.selectedId && f.available) || null; }
  /** Можно ли поднять объект текущим уровнем Телекинеза (ТК I — лёгкие и средние, ТК II — тяжёлые). */
  canLift(o) { return !o.def.weight || this.abilities.canMoveWeight(o.def.weight); }

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
    this.cooldowns[id] = this.startCooldown(id, s);
    this.stats.abilityUses[id]++;
    this.abilities.grantUseXP(id, 'combat');

    if (id === 'telekinesis') this.castTelekinesis(s);
    else if (id === 'fire') this.castFire(s);
    else if (id === 'seal') this.castSeal(s);
    this.flushPhases();
    this.checkResult();
    this.commit();
    return { ok: true };
  }

  /**
   * Перезарядка после применения. «Два броска подряд» (Телекинез III): первое применение не запускает перезарядку,
   * а открывает окно windowSec — второе в нём запускает обычную; не успели — перезарядка стартует, когда окно закрылось.
   */
  startCooldown(id, s) {
    if (!s.doubleCast) return s.cooldownSec;
    if (this.chain && this.chain.id === id) { this.chain = null; return s.cooldownSec; }
    this.chain = { id, left: s.doubleCast.windowSec, window: s.doubleCast.windowSec, cooldownSec: s.cooldownSec };
    this.emit({ type: 'chain', id, sec: s.doubleCast.windowSec });
    return 0;
  }

  /**
   * v0.10.0: смена фазы врага (Страж узла) → событие для сцены. В фазах без брони кристалл поля больше не нужен —
   * он рассыпается и не возвращается (его роль — только первая фаза).
   */
  flushPhases() {
    for (const ev of this.enemy.drainPhaseEvents()) {
      if (!this.enemy.hasArmor) {
        for (const o of this.fieldObjects) {
          if (!o.def.breaksArmor || o.gone) continue;
          o.gone = true; o.available = false; o.respawnLeft = Infinity;
          if (this.selectedId === o.id) this.selectedId = null;
          this.emit({ type: 'objectUsed', id: o.id, action: 'shatter' });
        }
      }
      this.emit(ev);
    }
  }

  /**
   * v0.8: расходник из сумки (настой жизни / лунный эликсир / смоляная склянка). Мгновенно, без перезарядки и маны.
   * Возвращает { ok, reason? }. Предмет списывается из сумки; сохранение — на стороне сцены (state.save()).
   */
  usePotion(id) {
    if (this.result) return { ok: false, reason: 'over' };
    const p = POTIONS[id];
    if (!p) return { ok: false, reason: 'unknown' };
    if (this.state.item(id) < 1) return { ok: false, reason: 'none' };
    if ((this.stats.potions || 0) >= POTION_BATTLE_LIMIT) return { ok: false, reason: 'limit' };
    const h = this.hero, e = p.effect;
    if (e.type === 'heal') {
      if (h.hp >= h.maxHp) return { ok: false, reason: 'full' };
      const gain = Math.min(h.maxHp - h.hp, Math.round(h.maxHp * e.amount));
      h.hp += gain;
      this.emit({ type: 'potion', id, kind: 'heal', amount: gain });
    } else if (e.type === 'mana') {
      if (h.mana >= h.maxMana) return { ok: false, reason: 'full' };
      const gain = Math.min(h.maxMana - h.mana, Math.round(h.maxMana * e.amount));
      h.mana += gain;
      this.emit({ type: 'potion', id, kind: 'mana', amount: gain });
    } else if (e.type === 'damage') {
      const dmg = this.enemy.takeDamage(e.amount, 'fire', 1);
      this.emit({ type: 'potion', id, kind: 'damage', amount: dmg });
      this.emit({ type: 'damage', target: 'enemy', amount: dmg, school: 'fire' });
      if (e.burn) { this.enemy.applyBurn(e.burn.dps, e.burn.durationSec); this.emit({ type: 'status', status: 'burn', sec: e.burn.durationSec }); }
    } else return { ok: false, reason: 'unknown' };
    this.state.removeItem(id, 1);
    this.stats.potions = (this.stats.potions || 0) + 1;
    this.flushPhases();
    this.checkResult();
    this.commit();
    return { ok: true };
  }

  /** Расходники, которые есть в сумке (для кнопок боя): [{ id, count }]. */
  potionsAvailable() {
    return Object.keys(POTIONS).map(id => ({ id, count: this.state.item(id) })).filter(p => p.count > 0);
  }

  castTelekinesis(s) {
    const obj = this.selectedObject();
    const tags = ['telekinesis'];
    if (obj && obj.def.breaksArmor) {
      obj.available = false;
      this.selectedId = null;
      const armor = this.enemy.def.armor;
      const broke = this.enemy.breakArmor();
      obj.respawnLeft = (armor ? armor.disabledSec : 0) + (obj.def.respawnAfterArmorSec || 0);
      this.emit({ type: 'objectUsed', id: obj.id, action: 'shatter' });
      if (broke) this.emit({ type: 'armorBroken', sec: armor.disabledSec });
      this.handleInterrupt(tags);
      return;
    }

    let base = s.damage;
    if (obj && obj.def.throwable && this.canLift(obj)) {
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

  // v0.10.1: Астрал — чистый урон сквозь броню и кору; атаки врага не прерывает (это только Телекинез)
  castSeal(s) {
    const dmg = this.enemy.takeDamage(s.damage, 'seal', this.hero.damageMult);
    this.emit({ type: 'damage', target: 'enemy', amount: dmg, school: 'seal' });
  }

  handleInterrupt(tags) {
    const r = this.enemy.tryInterrupt(tags);
    if (!r.attempted) return;
    if (r.ok) {
      this.stats.interrupts++;
      this.emit({ type: 'interrupt', ok: true });
      this.refundInterrupt();
    }
    else this.emit({ type: 'interrupt', ok: false, hint: this.enemy.def.strongAttack?.hint });
  }

  /** Ветка «Повелитель»: удачное прерывание возвращает часть маны и сокращает перезарядку Телекинеза. */
  refundInterrupt() {
    const s = this.abilities.stats('telekinesis');
    const r = s?.interruptRefund;
    if (!r) return;
    const gain = Math.round(s.manaCost * r.manaPct);
    this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + gain);
    this.cooldowns.telekinesis = Math.max(0, this.cooldowns.telekinesis - r.cooldownSec);
    if (this.chain?.id === 'telekinesis') this.chain.cooldownSec = Math.max(0, this.chain.cooldownSec - r.cooldownSec);   // перезарядка, которая начнётся после окна, тоже короче
    this.emit({ type: 'refund', mana: gain, cooldownSec: r.cooldownSec });
  }

  // ---------- симуляция ----------
  /**
   * holdEnemy (v0.9, обучение): враг, его подготовка атаки и автоатака героини стоят, а мана героини, перезарядка даров
   * и возврат предметов поля идут — нужное действие никогда не блокируется. Восстановление маны в бою — только здесь.
   */
  tick(dt, { holdEnemy = false } = {}) {
    if (this.result) return;
    const h = this.hero;
    h.mana = Math.min(h.maxMana, h.mana + h.regen * dt);
    for (const id of ABILITY_ORDER) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    if (this.chain) {
      this.chain.left -= dt;
      if (this.chain.left <= 0) { this.cooldowns[this.chain.id] = Math.max(0, this.chain.cooldownSec - (this.chain.window ?? 0)); this.chain = null; }
    }
    if (holdEnemy) {
      for (const o of this.fieldObjects) {
        if (o.available || o.gone) continue;
        o.respawnLeft -= dt;
        if (o.respawnLeft <= 0) { o.available = true; this.emit({ type: 'objectRespawn', id: o.id }); }
      }
      this.commit();
      return;
    }
    this.time += dt;

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
      if (o.available || o.gone) continue;
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
    this.flushPhases();
    this.checkResult();
    this.commit();
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
