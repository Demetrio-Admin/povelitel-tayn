import { ENEMY_TACTICS } from '../config/enemyTactics.js';
// Enemy — модель противника в бою (без рендеринга). Враг действует сам:
// обычная атака по таймеру, сильная атака с подготовкой (cast warning), которую можно прервать.
// Все числа — из ENEMIES (config/balance.enemies.js).

export class Enemy {
  constructor(id, def, modern = false) {
    this.modern = modern; this.shield = 0; this.burnStacks = []; this.antiheal = 0;
    this.tactic = modern && ENEMY_TACTICS[id] ? { ...ENEMY_TACTICS[id], left: 8, used: 0, channel: null } : null;
    this.id = id;
    this.baseDef = def;
    this.def = def;           // v0.10.0: действующие параметры (у врага с фазами — параметры текущей фазы)
    this.phase = 0;
    this.phaseEvents = [];
    this.name = def.name;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.normalTimer = def.normalAttack ? def.normalAttack.intervalSec : Infinity;
    this.strongCd = def.strongAttack ? def.strongAttack.firstDelaySec : Infinity;
    this.prepLeft = 0;          // > 0 — идёт подготовка сильной атаки
    this.staggerLeft = 0;       // оглушение после прерывания / связывания
    this.burn = { left: 0, dps: 0, tick: 0 };
    this.puddle = { left: 0, dps: 0, tick: 0 };   // v0.16.0: лужа смолы (Огонь III) жжёт отдельно от горения
    this.slow = { left: 0, pct: 0 };      // v0.18.0: Лёд — атаки и подготовка сильного удара идут медленнее
    this.brittle = { left: 0, bonus: 0 }; // v0.18.0: Хрупкость — следующий удар Телекинеза/Огня/Астрала сильнее
    this.defenseDisabledLeft = 0;
    this.armorDisabledLeft = 0;
    this.vulnerable = { left: 0, bonus: 0 };
    this.weakened = { left: 0, reduction: 0 };
    if (def.phases) this.applyPhase(this.phaseFor(this.hp));
  }

  // ---------- v0.10.0: фазы (Страж узла) ----------
  // def.phases = [{ above: HP, set: {armor, defense, weaknesses, onFireHit}, strongAttack: {...}, message, tint }, …]
  // Фаза i действует, пока HP > above (последняя — до конца). Фаза только растёт; один удар может пересечь
  // несколько порогов — тогда сразу включается последняя, а защита прежних фаз снимается.
  phaseFor(hp) {
    const ph = this.baseDef.phases;
    for (let i = 0; i < ph.length; i++) if (hp > ph[i].above) return i;
    return ph.length - 1;
  }

  applyPhase(i) {
    const b = this.baseDef, p = b.phases[i];
    this.def = { ...b, ...(p.set || {}), strongAttack: b.strongAttack ? { ...b.strongAttack, ...(p.strongAttack || {}) } : null };
    this.phase = i;
    this.armorDisabledLeft = 0;
    this.defenseDisabledLeft = 0;
    this.vulnerable = { left: 0, bonus: 0 };
  }

  checkPhase() {
    if (!this.baseDef.phases || !this.alive) return;
    const i = this.phaseFor(this.hp);
    if (i <= this.phase) return;
    const from = this.phase;
    this.applyPhase(i);
    const p = this.baseDef.phases[i];
    this.phaseEvents.push({ type: 'phase', phase: i + 1, from: from + 1, message: p.message, tint: p.tint ?? null });
  }

  drainPhaseEvents() { const q = this.phaseEvents; this.phaseEvents = []; return q; }

  get alive() { return this.hp > 0; }
  get isPreparing() { return this.prepLeft > 0 || !!this.tactic?.channel; }
  get prepProgress() { if (this.tactic?.channel) return 1-this.tactic.channel.left/this.tactic.prep; return this.def.strongAttack ? 1 - this.prepLeft / this.def.strongAttack.prepSec : 0; }
  get hasArmor() { return !!this.def.armor; }
  get armorActive() { return this.hasArmor && this.armorDisabledLeft <= 0; }
  get defenseActive() { return (this.def.defense || 0) > 0 && this.defenseDisabledLeft <= 0; }
  get burning() { return this.burn.left > 0; }
  get inPuddle() { return this.puddle.left > 0; }
  get slowed() { return this.slow.left > 0; }
  get isBrittle() { return this.brittle.left > 0; }

  /** Множитель входящего урона для школы ('auto' | 'telekinesis' | 'fire' | 'seal'). */
  incomingMultiplier(school) {
    let m = 1;
    // v0.10.1: Астрал ('seal') игнорирует броню и защитную кору
    const pierce = school === 'seal';
    if (!pierce && this.defenseActive) m *= 1 - this.def.defense;
    if (!pierce && this.armorActive) m *= 1 - this.def.armor.value;
    const weak = this.def.weaknesses?.[school];
    if (weak) m *= 1 + weak;
    if (this.vulnerable.left > 0) m *= 1 + this.vulnerable.bonus;
    return m;
  }

  takeDamage(base, school, heroMult = 1, { shieldPierce = 0 } = {}) {
    if (!this.alive) return 0;
    let dmg = Math.max(1, Math.round(base * heroMult * this.incomingMultiplier(school)));
    if (this.modern && this.shield > 0) { const absorbed = Math.min(this.shield, dmg - Math.round(dmg*shieldPierce)); this.shield -= absorbed; dmg -= absorbed; }
    this.hp = Math.max(0, this.hp - dmg);
    this.checkPhase();
    return dmg;
  }

  outgoingDamage(base) {
    const m = this.weakened.left > 0 ? 1 - this.weakened.reduction : 1;
    if (this.modern && this.weakened.once) this.weakened = { left: 0, reduction: 0 };
    return Math.round(base * m);
  }

  detonateBurn() {
    const amount = this.burnStacks.length ? this.burnStacks.reduce((n,b) => n+b.left*b.dps,0) : this.burn.left*this.burn.dps;
    this.burnStacks = []; this.burn = { left: 0, dps: 0, tick: 0 }; return amount;
  }
  heal(amount) { const gain = Math.min(this.maxHp-this.hp, amount*(this.burning ? 1-Math.max(this.antiheal,this.fullBurnAntiheal && this.burnStacks.length>=this.fullBurnAntiheal.count ? this.fullBurnAntiheal.reduction : 0) : 1)); this.hp += gain; return gain; }
  applyBurn(dps, durationSec, maxStacks = 1, antiheal = 0) {
    if (this.modern && maxStacks > 1) {
      if (this.burnStacks.length >= maxStacks) this.burnStacks.shift();
      this.burnStacks.push({ left: durationSec, dps, tick: 1 });
      this.burn = { left: durationSec, dps: 0, tick: Infinity }; this.antiheal = antiheal; return;
    }
    this.antiheal = antiheal;
    // повторный Огонь не складывает горение, а обновляет длительность
    const wasBurning = this.burning;
    this.burn.left = durationSec;
    this.burn.dps = dps;
    if (!wasBurning) this.burn.tick = 1;
  }

  /** v0.18.0: замедление Льдом. Не складывается: берётся сильнейшее, длительность — наибольшая. */
  applySlow(pct, sec) {
    if (this.slow.left > 0 && this.slow.pct > pct) { this.slow.left = Math.max(this.slow.left, sec); return; }
    this.slow = { left: Math.max(sec, this.slow.pct === pct ? this.slow.left : 0), pct };
  }

  /** v0.18.0: Хрупкость. Новая заменяет старую, если сильнее или дольше. */
  applyBrittle(bonus, sec) {
    if (this.brittle.left > 0 && this.brittle.bonus > bonus) { this.brittle.left = Math.max(this.brittle.left, sec); return; }
    this.brittle = { left: sec, bonus };
  }

  /** Снять Хрупкость ударом: возвращает бонус (0 — цель не хрупкая). */
  consumeBrittle() {
    if (this.brittle.left <= 0) return 0;
    const b = this.brittle.bonus;
    this.brittle = { left: 0, bonus: 0 };
    return b;
  }

  /** v0.16.0: лужа смолы. Как и горение — не складывается, повторный Огонь обновляет длительность и силу. */
  applyPuddle(dps, durationSec) {
    const was = this.inPuddle;
    this.puddle.left = durationSec;
    this.puddle.dps = dps;
    if (!was) this.puddle.tick = 1;
  }

  /**
   * v0.16.0: вспышка Астрала III. На sec секунд броня и защитная кора не гасят урон (только если они есть у врага);
   * vulnerability — враг получает на столько больше урона от всего. Возвращает события для сцены.
   */
  flash(sec, vulnerability = 0) {
    const out = [{ type: 'flash', sec }];
    if (this.hasArmor && sec > this.armorDisabledLeft) this.armorDisabledLeft = sec;
    if ((this.def.defense || 0) > 0 && sec > this.defenseDisabledLeft) this.defenseDisabledLeft = sec;
    if (vulnerability > 0) {
      this.vulnerable = { left: Math.max(this.vulnerable.left, sec), bonus: Math.max(this.vulnerable.left > 0 ? this.vulnerable.bonus : 0, vulnerability) };
      out.push({ type: 'vulnerable', sec, bonus: vulnerability });
    }
    return out;
  }

  onFireHit() {
    const f = this.def.onFireHit;
    const out = [];
    if (!f) return out;
    if (f.disableDefenseSec) { this.defenseDisabledLeft = f.disableDefenseSec; out.push({ type: 'defenseOff', sec: f.disableDefenseSec }); }
    if (f.vulnerability) { this.vulnerable = { left: f.vulnerability.durationSec, bonus: f.vulnerability.bonus }; out.push({ type: 'vulnerable', sec: f.vulnerability.durationSec, bonus: f.vulnerability.bonus }); }
    return out;
  }

  breakArmor() {
    if (!this.hasArmor) return false;
    this.armorDisabledLeft = this.def.armor.disabledSec;
    return true;
  }

  /** Попытка прервать сильную атаку. tags — набор тегов действия игрока. */
  tryInterrupt(tags) {
    if (this.tactic?.channel) {
      const ok = tags.some(t => this.tactic.interruptBy.includes(t));
      if (ok) { this.tactic.channel = null; this.tactic.left = this.tactic.cooldown; this.staggerLeft = this.def.staggerSec || 1; }
      return { attempted: true, ok };
    }
    if (!this.isPreparing) return { attempted: false };
    const allowed = this.def.strongAttack.interruptBy || [];
    const ok = tags.some(t => allowed.includes(t));
    if (!ok) return { attempted: true, ok: false };
    this.prepLeft = 0;
    this.staggerLeft = this.def.staggerSec || 1;
    this.strongCd = this.def.interruptedCooldownSec ?? this.def.strongAttack.cooldownSec;
    this.normalTimer = Math.max(this.normalTimer, this.staggerLeft + 0.5);
    return { attempted: true, ok: true };
  }

  bind(sec) { this.staggerLeft = Math.max(this.staggerLeft, sec); }
  weaken(reduction, sec, once = false) { this.weakened = { left: sec, reduction, once }; }

  /**
   * Шаг ИИ. Возвращает массив действий:
   *  { type: 'attack', damage } | { type: 'strongStart' } | { type: 'strongHit', damage } |
   *  { type: 'burnTick', damage } | { type: 'armorBack' } | { type: 'defenseBack' } | { type: 'vulnerableEnd' }
   */
  update(dt, heroMult = 1) {
    const out = [];
    if (!this.alive) return out;

    if (this.modern) for (const b of this.burnStacks) {
      const span = Math.min(dt, b.left); b.left -= span; b.tick -= span;
      while (b.tick <= 1e-9 && this.alive) { b.tick += 1; out.push({ type: 'burnTick', damage: this.takeDamage(b.dps, 'fire', heroMult, { burnTick: true }) }); }
    }
    this.burnStacks = this.burnStacks.filter(b => b.left > 1e-9);
    // статусы
    if (this.burn.left > 0) {
      this.burn.left -= dt;
      this.burn.tick -= dt;
      while (this.burn.tick <= 0 && this.alive) {
        this.burn.tick += 1;
        out.push({ type: 'burnTick', damage: this.takeDamage(this.burn.dps, 'fire', heroMult, { burnTick: true }) });
      }
      if (this.burn.left <= 0) this.burn.left = 0;
    }
    if (this.puddle.left > 0) {
      this.puddle.left -= dt;
      this.puddle.tick -= dt;
      while (this.puddle.tick <= 0 && this.alive) {
        this.puddle.tick += 1;
        out.push({ type: 'burnTick', damage: this.takeDamage(this.puddle.dps, 'fire', heroMult), puddle: true });
      }
      if (this.puddle.left <= 0) this.puddle.left = 0;
    }
    if (this.armorDisabledLeft > 0) { this.armorDisabledLeft -= dt; if (this.armorDisabledLeft <= 0) out.push({ type: 'armorBack' }); }
    if (this.defenseDisabledLeft > 0) { this.defenseDisabledLeft -= dt; if (this.defenseDisabledLeft <= 0) out.push({ type: 'defenseBack' }); }
    if (this.vulnerable.left > 0) { this.vulnerable.left -= dt; if (this.vulnerable.left <= 0) out.push({ type: 'vulnerableEnd' }); }
    if (this.weakened.left > 0) this.weakened.left -= dt;
    if (this.brittle.left > 0) { this.brittle.left -= dt; if (this.brittle.left <= 0) { this.brittle = { left: 0, bonus: 0 }; out.push({ type: 'brittleEnd' }); } }
    // v0.18.0: под замедлением ход врага (атаки, подготовка сильного удара) идёт медленнее; горение и статусы — в обычном времени
    let tdt = dt;
    if (this.slow.left > 0) {
      tdt = dt * (1 - this.slow.pct);
      this.slow.left -= dt;
      if (this.slow.left <= 0) { this.slow = { left: 0, pct: 0 }; out.push({ type: 'slowEnd' }); }
    }
    if (!this.alive) return out;

    if (this.staggerLeft > 0) { this.staggerLeft -= dt; return out; }
    dt = tdt;

    const t = this.tactic;
    if (t && !this.prepLeft) {
      if (t.channel) {
        t.channel.left -= dt;
        if (t.channel.left <= 0) { if (t.kind === 'heal') this.heal(t.amount); else this.shield = Math.max(this.shield,t.amount); t.channel = null; t.left = t.cooldown; out.push({ type: 'recovery', kind: t.kind, amount: t.amount }); }
        return out;
      }
      t.left -= dt;
      if (t.used < t.uses && t.left <= 0 && (t.minPhase == null || this.phase >= t.minPhase) && this.hp < this.maxHp*t.below) {
        t.used++; t.channel = { left: t.prep };
        out.push({ type: 'strongStart', name: t.kind === 'heal' ? 'Восстановление' : 'Магический щит', prepSec: t.prep, hint: t.interruptBy.includes('telekinesis_heavy') ? 'Прервите тяжёлым броском!' : 'Прервите Телекинезом!', interruptBy: t.interruptBy }); return out;
      }
    }
    const strong = this.def.strongAttack;
    if (this.isPreparing) {
      this.prepLeft -= dt;
      if (this.prepLeft <= 0) {
        this.prepLeft = 0;
        this.strongCd = strong.cooldownSec;
        this.normalTimer = this.def.normalAttack.intervalSec;
        out.push({ type: 'strongHit', damage: this.outgoingDamage(strong.damage), name: strong.name, chill: strong.chill || null });
      }
      return out; // во время подготовки обычные атаки не идут
    }

    if (strong) {
      this.strongCd -= dt;
      if (this.strongCd <= 0) {
        this.prepLeft = strong.prepSec;
        out.push({ type: 'strongStart', name: strong.name, prepSec: strong.prepSec, hint: strong.hint, interruptBy: strong.interruptBy });
        return out;
      }
    }

    this.normalTimer -= dt;
    if (this.normalTimer <= 0) {
      this.normalTimer += this.def.normalAttack.intervalSec;
      out.push({ type: 'attack', damage: this.outgoingDamage(this.def.normalAttack.damage), chill: this.def.normalAttack.chill || null });
    }
    return out;
  }
}
