// Enemy — модель противника в бою (без рендеринга). Враг действует сам:
// обычная атака по таймеру, сильная атака с подготовкой (cast warning), которую можно прервать.
// Все числа — из ENEMIES (config/balance.enemies.js).

export class Enemy {
  constructor(id, def) {
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
  get isPreparing() { return this.prepLeft > 0; }
  get prepProgress() { return this.def.strongAttack ? 1 - this.prepLeft / this.def.strongAttack.prepSec : 0; }
  get hasArmor() { return !!this.def.armor; }
  get armorActive() { return this.hasArmor && this.armorDisabledLeft <= 0; }
  get defenseActive() { return (this.def.defense || 0) > 0 && this.defenseDisabledLeft <= 0; }
  get burning() { return this.burn.left > 0; }
  get inPuddle() { return this.puddle.left > 0; }

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

  takeDamage(base, school, heroMult = 1) {
    if (!this.alive) return 0;
    const dmg = Math.max(1, Math.round(base * heroMult * this.incomingMultiplier(school)));
    this.hp = Math.max(0, this.hp - dmg);
    this.checkPhase();
    return dmg;
  }

  outgoingDamage(base) {
    const m = this.weakened.left > 0 ? 1 - this.weakened.reduction : 1;
    return Math.round(base * m);
  }

  applyBurn(dps, durationSec) {
    // повторный Огонь не складывает горение, а обновляет длительность
    const wasBurning = this.burning;
    this.burn.left = durationSec;
    this.burn.dps = dps;
    if (!wasBurning) this.burn.tick = 1;
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
  weaken(reduction, sec) { this.weakened = { left: sec, reduction }; }

  /**
   * Шаг ИИ. Возвращает массив действий:
   *  { type: 'attack', damage } | { type: 'strongStart' } | { type: 'strongHit', damage } |
   *  { type: 'burnTick', damage } | { type: 'armorBack' } | { type: 'defenseBack' } | { type: 'vulnerableEnd' }
   */
  update(dt, heroMult = 1) {
    const out = [];
    if (!this.alive) return out;

    // статусы
    if (this.burn.left > 0) {
      this.burn.left -= dt;
      this.burn.tick -= dt;
      while (this.burn.tick <= 0 && this.alive) {
        this.burn.tick += 1;
        out.push({ type: 'burnTick', damage: this.takeDamage(this.burn.dps, 'fire', heroMult) });
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
    if (!this.alive) return out;

    if (this.staggerLeft > 0) { this.staggerLeft -= dt; return out; }

    const strong = this.def.strongAttack;
    if (this.isPreparing) {
      this.prepLeft -= dt;
      if (this.prepLeft <= 0) {
        this.prepLeft = 0;
        this.strongCd = strong.cooldownSec;
        this.normalTimer = this.def.normalAttack.intervalSec;
        out.push({ type: 'strongHit', damage: this.outgoingDamage(strong.damage), name: strong.name });
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
      out.push({ type: 'attack', damage: this.outgoingDamage(this.def.normalAttack.damage) });
    }
    return out;
  }
}
