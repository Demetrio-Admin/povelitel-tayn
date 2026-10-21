// CombatManager — логика real-time tactical боя (Combat Math v0.1). Без рендеринга:
// CombatScene вызывает tick(dt), useAbility(id), selectObject(id) и читает drainEvents() для анимаций.
// Главное правило: враг действует сам, игрок вмешивается магией. Герой сам делает слабую автоатаку.
import { ENEMIES, FIELD_OBJECTS, ARENAS } from '../config/balance.enemies.js';
import { HERO_BASE } from '../config/balance.hero.js';
import { Enemy } from '../objects/Enemy.js';
import { ABILITY_ORDER } from './AbilitySystem.js';
import { POTIONS, POTION_BATTLE_LIMIT, POTION_CATEGORIES, potionLoadout, potionGain } from '../config/resources.js';
import * as vitals from '../state/vitals.js';
import { amuletEffect } from '../config/build.js';
import { DuelBattle } from './DuelBattle.js';

export class CombatManager {
  /**
   * @param {object} o
   * @param {string} o.enemyType ключ в ENEMIES
   * @param {import('../state/GameState.js').GameState} o.state
   * @param {import('./AbilitySystem.js').AbilitySystem} o.abilities
   */
  constructor({ enemyType, enemyDef = null, state, abilities }) {
    this.balanceVersion = state.data.combatCtx?.balanceVersion || 29;
    this.modern = (state.data.combatCtx?.balanceVersion || 0) >= 38;
    this.potionSlots = state.data.combatCtx?.potionLoadout || potionLoadout(state.data.inventory, state.data.worldObjects?.player_build);
    this.potionUses = { restore: 0, tactical: 0 };
    this.potionCooldown = { restore: state.data.combatCtx?.potionCooldown || 0, tactical: 0 };
    this.regeneration = {};
    this.burnWard = null;
    this.shields = {};
    this.state = state;
    this.abilities = abilities;
    this.enemyType = enemyType;
    this.def = enemyDef || ENEMIES[enemyType];   // v0.26.0: соперник Дуэли — профиль из слепка игрока (config/duel.js duelEnemyDef)
    if (!this.def) throw new Error(`Unknown enemy type ${enemyType}`);
    this.enemy = new Enemy(enemyType, this.def, this.modern);

    const hs = state.heroStats();
    const legacy = state.data.combatCtx?.balanceVersion === 29;
    // v0.9: бой начинается с текущих запасов героини (не с полных); всё, что изменилось в бою, пишется обратно (commit)
    this.hero = {
      maxHp: hs.maxHp, hp: vitals.hp(state),
      maxMana: hs.maxMana, mana: vitals.mana(state),
      regen: legacy ? 3 : hs.manaRegen, damageMult: hs.damageMult,
      autoTimer: HERO_BASE.autoAttack.intervalSec,
    };
    // v0.16.0: амулеты. Их множители считаются один раз на начало боя: damageMult героя и входящий урон; лунный амулет — один раз за бой.
    this.amulets = state.equippedAmulets ? state.equippedAmulets() : [];
    // v0.19.0: уровень улучшения амулета (+1…+3) усиливает его главное свойство (config/build.js amuletEffect)
    const lv = state.buildData ? state.buildData().amuletLevels || {} : {};
    const effs = this.amulets.map(a => amuletEffect(a, lv[a] || 0, legacy, this.modern));
    this.schoolMult = { fire: 1, seal: 1, ice: 1, storm: 1 };
    this.heavyMult = 1; this.burnMult = 1; this.flashBonus = 0; this.brittleBonus = 0; this.antiheal = 0; this.interruptShield = 0;
    this.stormCharges = 0; this.stormRefundAt = -Infinity; this.interruptWardAt = -Infinity;
    for (const e of effs) {
      this.schoolMult.fire *= e.fireMult || 1; this.schoolMult.seal *= e.sealMult || 1;
      this.heavyMult *= e.heavyMult || 1; this.burnMult *= e.burnMult || 1;
      this.flashBonus += e.flashBonus || 0; this.brittleBonus += e.brittleBonus || 0;
      this.antiheal = Math.max(this.antiheal, e.antiheal || 0); this.interruptShield = Math.max(this.interruptShield, e.interruptShield || 0);
    }
    let dm = 1, inc = 1, im = 1, sb = 0;
    for (const e of effs) { if (e.damageMult) dm *= e.damageMult; if (e.incomingMult) inc *= e.incomingMult; if (e.iceMult) im *= e.iceMult; if (e.slowBonus) sb += e.slowBonus; }
    this.hero.damageMult = Math.round(this.hero.damageMult * dm * 1000) / 1000;
    this.incomingMult = inc;
    this.iceMult = im;
    this.slowBonus = sb;
    this.manaRescue = effs.map(e => e.manaRescue).find(Boolean) || null;
    this.manaRescueUsed = false;
    this.heroChill = { left: 0, pct: 0 };   // v0.18.0: холод врага — перезарядки и мана героя идут медленнее
    this.cooldowns = Object.fromEntries(ABILITY_ORDER.map(id => [id, 0]));
    const arena = ARENAS[this.def.arena] || ARENAS.glade;
    this.arena = arena;
    this.fieldObjects = arena.objects.map(o => ({ ...o, def: FIELD_OBJECTS[o.type], available: true, respawnLeft: 0 }));
    this.selectedId = null;
    this.time = 0;
    this.result = null; // 'victory' | 'defeat'
    this.queue = [];
    this.stats = { abilityUses: { telekinesis: 0, fire: 0, seal: 0, ice: 0 }, interrupts: 0, damageTaken: 0, autoDamage: 0 };
    if (this.modern && this.def.duel?.version === 2) this.duelBattle = new DuelBattle(this, this.def.duel.opponent);
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
    if (this.state.isEquipped && !this.state.isEquipped(id)) return { id, state: 'benched' };   // v0.16.0: дар не в слоте
    if (this.duelBody?.pending || this.duelBody?.staggerLeft > 0) return { id, state: 'casting' };
    const cd = this.cooldowns[id];
    if (cd > 0) return { id, state: 'cooldown', cdLeft: cd, cdFrac: cd / s.cooldownSec };
    if (this.hero.mana < s.manaCost) return { id, state: 'nomana' };
    return { id, state: 'ready' };
  }

  // ---------- действия игрока ----------
  useAbility(id) {
    if (this.duelBattle) return this.duelBattle.beginCast(this, id);
    const paid = this.payAbility(id);
    if (!paid.ok) return paid;
    this.resolveAbility(id, paid.stats);
    return { ok: true };
  }

  payAbility(id) {
    if (this.result) return { ok: false, reason: 'over' };
    const st = this.abilityState(id);
    if (st.state !== 'ready') return { ok: false, reason: st.state };
    const s = this.abilities.stats(id);
    this.hero.mana -= s.manaCost;
    this.checkManaRescue();
    this.cooldowns[id] = this.startCooldown(id, s);
    this.stats.abilityUses[id] = (this.stats.abilityUses[id] || 0) + 1;
    this.abilities.grantUseXP(id, 'combat');
    return { ok: true, stats: s };
  }

  resolveAbility(id, s) {
    this.lastDirectHit = false;
    if (id === 'telekinesis') this.castTelekinesis(s);
    else if (id === 'fire') this.castFire(s);
    else if (id === 'seal') this.castSeal(s);
    else if (id === 'ice') this.castIce(s);
    else if (id === 'storm') this.castStorm(s);
    if (this.modern && this.lastDirectHit && id !== 'storm' && this.abilities.isUnlocked('storm') && this.state.isEquipped('storm')) this.stormCharges = Math.min(3, this.stormCharges + 1);
    if (this.modern && this.lastDirectHit && id !== 'seal' && this.comboMana) { this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + this.comboMana); this.comboMana = 0; }
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
    if (this.chain && this.chain.id === id) {
      this.chain.used++; this.lastChainHit = this.chain.used;
      if (this.chain.used >= (s.doubleCast.count || 2)) { this.chain = null; return s.cooldownSec; }
      this.chain.left = s.doubleCast.windowSec; return 0;
    }
    this.lastChainHit = 1;
    this.chain = { id, used: 1, left: s.doubleCast.windowSec, window: s.doubleCast.windowSec, cooldownSec: s.cooldownSec };
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
    if (this.modern) {
      if (!this.potionSlots.includes(id)) return { ok: false, reason: 'benched' };
      const category = POTION_CATEGORIES[p.category];
      if (this.potionUses[p.category] >= category.limit) return { ok: false, reason: 'limit' };
      if (this.potionCooldown[p.category] > 0) return { ok: false, reason: 'cooldown' };
    } else if ((this.stats.potions || 0) >= POTION_BATTLE_LIMIT) return { ok: false, reason: 'limit' };
    const h = this.hero, e = p.effect;
    if (e.type === 'antiburn' && this.balanceVersion < 39) return { ok: false, reason: 'unknown' };
    if (e.type === 'heal') {
      if (h.hp >= h.maxHp) return { ok: false, reason: 'full' };
      let gain = Math.min(h.maxHp - h.hp, potionGain(e, h.maxHp));
      if (this.duelBody) gain = this.duelBody.heal(gain); else h.hp += gain;
      this.emit({ type: 'potion', id, kind: 'heal', amount: gain });
    } else if (e.type === 'mana') {
      if (h.mana >= h.maxMana) return { ok: false, reason: 'full' };
      const gain = Math.min(h.maxMana - h.mana, potionGain(e, h.maxMana));
      h.mana += gain;
      this.emit({ type: 'potion', id, kind: 'mana', amount: gain });
    } else if (e.type === 'damage') {
      const dmg = this.enemy.takeDamage(e.amount, 'fire', 1);
      this.emit({ type: 'potion', id, kind: 'damage', amount: dmg });
      this.emit({ type: 'damage', target: 'enemy', amount: dmg, school: 'fire' });
      if (e.burn) { this.enemy.applyBurn(e.burn.dps, e.burn.durationSec); this.emit({ type: 'status', status: 'burn', sec: e.burn.durationSec }); }
    } else if (e.type === 'warm') {   // v0.19.0: Тёплый настой — холод слабее до конца боя, нынешний снимается
      if (this.chillResist >= e.resist) return { ok: false, reason: 'full' };
      this.chillResist = e.resist;
      this.heroChill = { left: 0, pct: 0 };
      if (this.duelBody) this.duelBody.slow = { left: 0, pct: 0 };
      this.emit({ type: 'potion', id, kind: 'warm' });
    } else if (e.type === 'cleanse') {   // Стабилизирующий настой — снять холод и чуть подлечить
      const gain = Math.min(h.maxHp - h.hp, this.modern ? 40 : Math.round(h.maxHp * e.heal));
      if (gain <= 0 && !(this.heroChill.left > 0) && !(this.heroBurn?.left > 0) && !this.duelBody?.burning) return { ok: false, reason: 'full' };
      h.hp += gain;
      this.heroChill = { left: 0, pct: 0 };
      this.emit({ type: 'potion', id, kind: 'heal', amount: gain });
      if (this.modern) this.heroBurn = null;
      if (this.duelBody) this.duelBody.cleanse();
    } else if (e.type === 'antiburn') {
      this.heroBurn = null;
      if (this.duelBody) this.duelBody.clearBurn();
      this.burnWard = { left: e.sec, resist: e.resist };
      this.emit({ type: 'potion', id, kind: 'antiburn', sec: e.sec });
    } else if (e.type === 'brittle') {   // Флакон Хрупкости
      this.enemy.applyBrittle(e.bonus, e.sec);
      this.emit({ type: 'potion', id, kind: 'brittle' });
      this.emit({ type: 'status', status: 'brittle', sec: e.sec, bonus: e.bonus });
    } else if (e.type === 'shield') {
      this.shields.potion = { amount: e.amount, left: e.sec };
      this.emit({ type: 'potion', id, kind: 'guard', sec: e.sec });
    } else if (e.type === 'guard') {   // Кристальная защита
      this.guard = { left: e.sec, mult: e.incoming };
      this.emit({ type: 'potion', id, kind: 'guard', sec: e.sec });
    } else return { ok: false, reason: 'unknown' };
    if (this.modern) {
      this.potionUses[p.category]++;
      this.potionCooldown[p.category] = POTION_CATEGORIES[p.category].cooldown;
      if (e.regen) this.regeneration[e.type] = { left: e.regen.sec, rate: e.regen.rate };
    }
    this.state.removeItem(id, 1);
    this.stats.potions = (this.stats.potions || 0) + 1;
    this.flushPhases();
    this.checkResult();
    this.commit();
    return { ok: true };
  }

  /** Расходники, которые есть в сумке (для кнопок боя): [{ id, count }]. */
  potionsAvailable() {
    return (this.modern ? this.potionSlots : Object.keys(POTIONS)).map(id => ({ id, count: this.state.item(id) })).filter(p => p.count > 0);
  }

  dealAbilityDamage(base,school,mult,options) {
    if (this.enemy.alive && base > 0) this.lastDirectHit = true;
    if (this.duelBody) base = this.duelBody.outgoingDamage(base);
    return this.enemy.takeDamage(base,school,mult,options);
  }

  castTelekinesis(s) {
    const priorThrowBonus = this.nextThrowBonus || 0;
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

    if (this.modern) this.nextThrowBonus = 0;
    let base = s.damage;
    if (obj && obj.def.throwable && this.canLift(obj)) {
      const heavy = obj.def.weight === 'heavy';
      if (heavy) { base *= (1 + s.heavyObjectBonus) * this.heavyMult; tags.push('telekinesis_heavy'); }
      base *= 1 + (s.throwDamageBonus || 0);
      obj.available = false;
      obj.respawnLeft = obj.def.respawnSec;
      this.selectedId = null;
      this.emit({ type: 'objectUsed', id: obj.id, action: 'throw', heavy });
    }
    if (!s.interruptsNormalCast) tags.shift();
    this.handleInterrupt(tags);
    // v0.18.0: Хрупкость — удар сильнее; тяжёлый бросок по хрупкой цели ещё и разбивает броню
    const br = this.enemy.consumeBrittle();
    if (br) {
      base *= 1 + br;
      this.emit({ type: 'status', status: 'shatter', bonus: br });
      if (tags.includes('telekinesis_heavy') && this.enemy.armorActive && this.enemy.breakArmor()) this.emit({ type: 'armorBroken', sec: this.enemy.def.armor.disabledSec });
    }
    if (this.modern && priorThrowBonus) { base *= 1 + priorThrowBonus;  }
    if (this.modern && this.lastChainHit === 3) base *= 1 + (s.thirdThrowBonus || 0);
    const dmg = this.dealAbilityDamage(base, 'telekinesis', this.hero.damageMult);
    this.emit({ type: 'damage', target: 'enemy', amount: dmg, school: 'telekinesis', heavy: tags.includes('telekinesis_heavy') });
  }

  castFire(s) {
    const br = this.enemy.consumeBrittle();   // v0.18.0
    if (br) this.emit({ type: 'status', status: 'shatter', bonus: br });
    if (this.modern && s.detonate) { const remaining = this.enemy.detonateBurn(); if (remaining > 0) { const amount = this.dealAbilityDamage(remaining * s.detonate, 'fire', this.hero.damageMult); this.emit({ type: 'damage', target: 'enemy', amount, school: 'fire' }); } }
    const dmg = this.dealAbilityDamage(s.damage * (1 + br), 'fire', this.hero.damageMult * this.schoolMult.fire);
    this.emit({ type: 'damage', target: 'enemy', amount: dmg, school: 'fire' });
    this.enemy.applyBurn(s.burn.dps * this.burnMult, s.burn.durationSec, this.modern ? s.burnStacks || 1 : 1, this.modern ? this.antiheal : 0);
    if (this.modern) this.enemy.fullBurnAntiheal = s.fullBurnAntiheal ? { count: s.burnStacks, reduction: s.fullBurnAntiheal } : null;
    this.emit({ type: 'status', status: 'burn', sec: s.burn.durationSec });
    if (s.puddle) { this.enemy.applyPuddle(s.puddle.dps * this.burnMult, s.puddle.durationSec); this.emit({ type: 'status', status: 'puddle', sec: s.puddle.durationSec }); }
    for (const e of this.enemy.onFireHit()) this.emit({ type: 'status', status: e.type, sec: e.sec, bonus: e.bonus });
    if (s.interruptsNormalCast) this.handleInterrupt(['fire']);
  }

  // v0.10.1: Астрал — чистый урон сквозь броню и кору; атаки врага не прерывает (это только Телекинез)
  castSeal(s) {
    const br = this.enemy.consumeBrittle();   // v0.18.0
    if (br) this.emit({ type: 'status', status: 'shatter', bonus: br });
    const dmg = this.dealAbilityDamage(s.damage * (1 + br) * (this.modern && this.enemy.shield > 0 ? 1 + (s.shieldDamage || 0) : 1), 'seal', this.hero.damageMult * this.schoolMult.seal, { shieldPierce: this.modern ? s.shieldPierce || 0 : 0 });
    this.emit({ type: 'damage', target: 'enemy', amount: dmg, school: 'seal' });
    // v0.16.0: Астрал III — вспышка. Урон выше уже нанесён сквозь защиту, вспышка помогает остальным дарам и автоатаке.
    if (s.flash && this.enemy.alive) {
      for (const e of this.enemy.flash(s.flash.sec + this.flashBonus, s.flash.vulnerability || 0)) {
        if (e.type === 'vulnerable') this.emit({ type: 'status', status: 'vulnerable', sec: e.sec, bonus: e.bonus });
        else this.emit(e);
      }
    }
    if (this.modern && s.comboMana) this.comboMana = s.comboMana;
  }

  /** v0.16.0: Лунный амулет — один раз за бой, когда маны меньше below от максимума, возвращает gainPct максимума. */
  checkManaRescue() {
    const r = this.manaRescue;
    if (!r || this.manaRescueUsed || this.hero.mana >= this.hero.maxMana * r.below) return;
    this.manaRescueUsed = true;
    const gain = Math.min(this.hero.maxMana - this.hero.mana, Math.round(this.hero.maxMana * r.gainPct));
    this.hero.mana += gain;
    this.emit({ type: 'manaRescue', mana: gain });
  }

  /**
   * v0.18.0: Лёд — урон, замедление врага, со ступени II — Хрупкость. Ветка «Осколок»: удар по хрупкой цели раскалывает её
   * (урон ×shatter.mult, Хрупкость снимается и в этот раз заново не накладывается — иначе каждый удар был бы усиленным).
   */
  castIce(s) {
    let base = s.damage, shattered = false;
    if (s.shatter && this.enemy.isBrittle) {
      this.enemy.consumeBrittle();
      base *= s.shatter.mult;
      shattered = true;
      this.emit({ type: 'status', status: 'shatter', bonus: s.shatter.mult - 1, ice: true });
    }
    const dmg = this.dealAbilityDamage(base * this.iceMult, 'ice', this.hero.damageMult);   // v0.19.0: Амулет инея
    this.emit({ type: 'damage', target: 'enemy', amount: dmg, school: 'ice' });
    if (!this.enemy.alive) return;
    if (s.slow) {
      const pct = Math.min(0.8, Math.round((s.slow.pct + this.slowBonus) * 1000) / 1000);
      this.enemy.applySlow(pct, s.slow.sec);
      this.emit({ type: 'status', status: 'slow', sec: s.slow.sec, pct });
    }
    if (s.brittle && !shattered) { this.enemy.applyBrittle(s.brittle.bonus + this.brittleBonus, s.brittle.sec); this.emit({ type: 'status', status: 'brittle', sec: s.brittle.sec, bonus: s.brittle.bonus }); }
    if (this.modern && s.frostWeaken) this.enemy.weaken(s.frostWeaken, s.slow.sec, true);
    if (s.interruptsNormalCast) this.handleInterrupt(['ice']);
  }

  castStorm(s) {
    const charges = this.stormCharges, full = charges === 3; this.stormCharges = 0;
    const br = this.enemy.consumeBrittle();
    const base = s.damage * (1 + charges * s.chargeBonus) * (1 + br);
    const hit = value => { const amount = this.dealAbilityDamage(value, 'storm', this.hero.damageMult); this.emit({ type: 'damage', target: 'enemy', amount, school: 'storm' }); };
    hit(base); if (full && s.fullDischarge) hit(base * s.fullDischarge);
    if (full && s.stormField) {
      this.enemy.weaken(s.stormField.reduction, s.stormField.sec);
      if (s.stormField.mana && this.time >= this.stormRefundAt + 12) { this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + s.stormField.mana); this.stormRefundAt = this.time; }
    }
    this.emit({ type: 'stormCharges', charges: 0, full });
  }

  handleInterrupt(tags) {
    const r = this.enemy.tryInterrupt(tags);
    if (!r.attempted) return;
    if (r.ok) {
      this.stats.interrupts++;
      this.emit({ type: 'interrupt', ok: true });
      this.refundInterrupt();
      if (this.modern) {
        const s = this.abilities.stats('telekinesis');
        if (this.time >= this.interruptWardAt + 12 && (s?.interruptWard || this.interruptShield)) {
          if (s?.interruptWard) this.shields.lord = { amount: s.interruptWard.amount, left: s.interruptWard.sec };
          if (this.interruptShield) this.shields.breaker = { amount: this.interruptShield, left: 6 };
          this.interruptWardAt = this.time;
        }
        if (s?.nextThrowBonus) this.nextThrowBonus = s.nextThrowBonus;
      }
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
  // Shared hero clocks for PvE and both actors in the versioned Duel.
  tickResources(dt) {
    const h = this.hero;
    if (this.modern) {
      for (const id of Object.keys(this.potionCooldown)) this.potionCooldown[id] = Math.max(0, this.potionCooldown[id] - dt);
      for (const [kind, r] of Object.entries(this.regeneration)) {
        const key = kind === 'heal' ? 'hp' : 'mana', max = kind === 'heal' ? h.maxHp : h.maxMana;
        const gain = r.rate * Math.min(dt, r.left);
        if (kind === 'heal' && this.duelBody) this.duelBody.heal(gain);
        else h[key] = Math.min(max, h[key] + gain);
        r.left = Math.max(0, r.left - dt); if (!r.left) delete this.regeneration[kind];
      }
      if (this.heroBurn?.left > 0) {
        const span = Math.min(dt, this.heroBurn.left);
        const protectedSpan = Math.min(span, Math.max(0, this.burnWard?.left || 0));
        this.hitHero(this.heroBurn.rate * (span - protectedSpan * (this.burnWard?.resist || 0)), false, 'Горение', true);
        this.heroBurn.left = Math.max(0, this.heroBurn.left - dt);
      }
      if (this.burnWard) { this.burnWard.left = Math.max(0, this.burnWard.left - dt); if (this.burnWard.left < 1e-9) this.burnWard = null; }
      for (const shield of Object.values(this.shields)) { shield.left -= dt; if (shield.left <= 0) shield.amount = 0; }
    }
    // v0.18.0: под холодом врага мана и перезарядки героя идут медленнее
    let hdt = dt;
    if (this.heroChill.left > 0) { hdt = dt * (1 - this.heroChill.pct); this.heroChill.left -= dt; if (this.heroChill.left <= 0) { this.heroChill = { left: 0, pct: 0 }; this.emit({ type: 'chillEnd' }); } }
    h.mana = Math.min(h.maxMana, h.mana + h.regen * hdt);
    if (this.guard?.left > 0) { this.guard.left -= dt; if (this.guard.left <= 0) { this.guard = null; this.emit({ type: 'guardEnd' }); } }
    for (const id of ABILITY_ORDER) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - hdt);
    if (this.chain) {
      this.chain.left -= hdt;
      if (this.chain.left <= 0) { this.cooldowns[this.chain.id] = Math.max(0, this.chain.cooldownSec - (this.chain.window ?? 0)); this.chain = null; }
    }
  }

  tick(dt, { holdEnemy = false } = {}) {
    if (this.result) return;
    if (this.duelBattle) return this.duelBattle.tick(dt, { holdEnemy });
    this.tickResources(dt);
    const h = this.hero;
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
        case 'attack': this.hitHero(a.damage, false); this.chillHero(a.chill); break;
        case 'strongHit': this.hitHero(a.damage, true, a.name); this.chillHero(a.chill); if (this.modern && this.enemyType === 'grave_wisp') this.heroBurn = { left: 6, rate: 3 }; break;
        case 'strongStart': this.emit({ type: 'warning', name: a.name, prepSec: a.prepSec, hint: a.hint, needsHeavy: a.interruptBy.includes('telekinesis_heavy') && !a.interruptBy.includes('telekinesis') }); break;
        case 'burnTick': this.emit({ type: 'damage', target: 'enemy', amount: a.damage, school: 'fire', tick: true, puddle: !!a.puddle }); break;
        case 'armorBack': this.emit({ type: 'armorBack' }); break;
        default: this.emit({ type: 'status', status: a.type });
      }
    }
    this.flushPhases();
    this.checkResult();
    this.commit();
  }

  /** v0.18.0: холод врага ({ pct, sec }) — сильнейший действует, длительность обновляется. */
  chillHero(c) {
    if (!c || this.hero.hp <= 0) return;
    const pct = c.pct * (this.chillResist ? 1 - this.chillResist : 1);
    if (pct <= 0) return;
    this.heroChill = { left: Math.max(this.heroChill.left, c.sec), pct: Math.max(this.heroChill.left > 0 ? this.heroChill.pct : 0, pct) };
    this.emit({ type: 'chill', sec: c.sec, pct });
  }

  hitHero(damage, strong, name, periodic = false, { shieldPierce = 0, silent = false } = {}) {
    damage = periodic ? damage * this.incomingMult : Math.max(1, Math.round(damage * this.incomingMult * (this.guard?.left > 0 ? this.guard.mult : 1)));   // v0.16.0: Лесной амулет; v0.19.0: Кристальная защита
    const bypass = Math.round(damage * shieldPierce);
    if (this.modern) for (const shield of Object.values(this.shields)) {
      if (!(shield.left > 0 && shield.amount > 0)) continue;
      const absorbed = Math.min(shield.amount, damage - bypass); shield.amount -= absorbed; damage -= absorbed;
    }
    this.hero.hp = Math.max(0, this.hero.hp - damage);
    this.stats.damageTaken += damage;
    if (!silent) this.emit({ type: 'damage', target: 'hero', amount: damage, strong, name });
    return damage;
  }

  checkResult() {
    if (this.result) return;
    if (this.enemy.hp <= 0) this.result = 'victory';
    else if (this.hero.hp <= 0) this.result = 'defeat';
    if (this.result) this.emit({ type: 'result', result: this.result, time: this.time });
  }
}
