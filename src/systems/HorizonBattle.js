import { CORE, FOX, PACKS, STARTER_GIFTS, levelScale, wandInterval } from '../config/horizon/rules.js';

export const HORIZON_STEP_MS = 50;
const ticks = seconds => Math.ceil(seconds * 1000 / HORIZON_STEP_MS);
const FORMATION_X = { solo: [0], duo: [-1, 1], trio: [0, -1, 1] };
const ARENA = {
  light: { name: 'Лёгкий камень', normal: CORE.light_stone_base, heat: CORE.light_stone_heat, respawn: CORE.light_stone_respawn },
  heavy: { name: 'Тяжёлый камень', normal: CORE.heavy_stone_base, heat: CORE.heavy_stone_heat, respawn: CORE.heavy_stone_respawn },
};

export class HorizonBattle {
  constructor(context) {
    const { encounter, heroLevel, wandRank, fox } = context;
    const pack = PACKS[encounter.pack];
    if (context.balanceVersion !== CORE.balance_version || !pack || encounter.enemies.length !== pack.count) {
      throw new Error('Invalid balance 41 battle context');
    }
    this.tick = 0;
    this.result = null;
    this.focus = 0;
    this.events = [];
    this.actions = [];
    this.shots = 0;
    this.charge = 0;
    this.fox = fox;
    this.foxBonus = false;
    this.combos = 0;
    this.intervals = { wand: Math.round(wandInterval(wandRank) * 1000 / HORIZON_STEP_MS), enemies: ticks(CORE.episode_enemy_attack_interval) };
    this.nextShot = this.intervals.wand;
    const heroScale = levelScale(heroLevel);
    const fraction = (Math.min(heroLevel, CORE.target_year_levels) - 1) / (CORE.target_year_levels - 1);
    this.power = CORE.base_power * heroScale;
    this.wandPower = this.power * CORE.episode_wand_base_mult * CORE.episode_wand_upgrade_power ** (wandRank / CORE.episode_wand_rank_step);
    this.hero = {
      maxHp: Math.round(CORE.hero_base_hp * heroScale),
      maxMana: CORE.mana_start + (CORE.mana_end - CORE.mana_start) * fraction,
      regen: CORE.mana_regen_start + (CORE.mana_regen_end - CORE.mana_regen_start) * fraction,
    };
    this.hero.hp = this.hero.maxHp;
    this.hero.mana = this.hero.maxMana;
    const enemyScale = levelScale(encounter.level);
    this.enemies = encounter.enemies.map((def, index) => {
      const hp = Math.round(CORE.base_power * CORE.mob_hp_mult * enemyScale * pack.hp_shares[index]);
      return {
        ...def, hp, maxHp: hp, slot: FORMATION_X[encounter.pack][index], index,
        hit: CORE.base_power * enemyScale * CORE.episode_enemy_hit_mult * pack.dps_shares[index],
        nextAttack: ticks(pack.first_attack_sec?.[index] ?? 2),
        attacks: 0, castUntil: 0, heat: 0, heatUntil: 0, nextHeat: 0, shield: 0,
      };
    });
    this.objects = Object.fromEntries(encounter.arena.map(id => [id, { ...ARENA[id], id, tag: null, respawnAt: 0 }]));
    this.cooldown = { fire: 0, telekinesis: 0 };
    this.maxConcurrentCasts = pack.max_casts;
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { return this.events.splice(0); }

  changeFocus(index) {
    if (!Number.isInteger(index) || !this.enemies[index]?.hp) return false;
    this.focus = index;
    return true;
  }

  command(action) {
    if (this.result) return false;
    if (action.type === 'focus') {
      if (!this.changeFocus(action.target)) return false;
      this.actions.push({ tick: this.tick, type: 'focus', target: this.focus });
      return true;
    }
    const { type, gift, object } = action;
    const rule = Object.hasOwn(STARTER_GIFTS, gift) ? STARTER_GIFTS[gift] : null;
    if (!rule || !['cast', 'cast_on_object'].includes(type) || this.cooldown[gift] > this.tick || this.hero.mana < rule.mana) return false;
    const target = this.enemies[this.focus];
    const stone = type === 'cast_on_object' && Object.hasOwn(this.objects, object) ? this.objects[object] : null;
    if (type === 'cast_on_object' && (!stone || stone.respawnAt > this.tick || (gift === 'fire' && stone.tag))) return false;

    this.hero.mana -= rule.mana;
    this.cooldown[gift] = this.tick + ticks(rule.cd_sec);
    this.actions.push(type === 'cast_on_object' ? { tick: this.tick, type, gift, object } : { tick: this.tick, type, gift });
    if (stone && gift === 'fire') {
      stone.tag = 'heat';
      this.emit('charge', { object });
    } else if (stone) {
      this.throwStone(stone, target);
    } else {
      this.damage(target, this.power * rule.sp_mult, gift);
      if (gift === 'fire') this.applyHeat(target, 1);
      if (gift === 'telekinesis') this.interrupt(target);
    }
    this.finishIfNeeded();
    return true;
  }

  throwStone(stone, target) {
    const charged = stone.tag === 'heat';
    stone.tag = null;
    stone.respawnAt = this.tick + ticks(stone.respawn);
    this.damage(target, this.power * (charged ? stone.heat : stone.normal), charged ? 'fire-stone' : 'stone');
    this.interrupt(target);
    if (!charged) return;
    this.combos++;
    this.applyHeat(target, 2);
    if (stone.id === 'heavy') {
      for (const other of this.enemies) {
        if (other !== target && other.hp > 0) this.damage(other, this.power * stone.heat * CORE.scope_splash_secondary, 'fire-stone');
      }
    }
    this.addCharge(CORE.companion_arena_combo);
  }

  applyHeat(target, stacks) {
    if (!target.hp) return;
    if (!target.heat) target.nextHeat = this.tick + ticks(1);
    target.heat = Math.min(3, target.heat + stacks);
    target.heatUntil = this.tick + ticks(CORE.episode_heat_duration);
  }

  interrupt(target) {
    if (!target.castUntil) return;
    target.castUntil = 0;
    target.nextAttack = this.tick + this.intervals.enemies;
    this.emit('interrupt', { enemy: target.index });
  }

  damage(target, amount, source) {
    if (!target.hp) return;
    const damage = Math.round(amount);
    const absorbed = Math.min(target.shield, damage);
    target.shield -= absorbed;
    target.hp = Math.max(0, target.hp - (damage - absorbed));
    this.emit('damage', { enemy: target.index, amount: damage - absorbed, source });
    if (!target.hp) {
      target.castUntil = 0;
      if (this.focus === target.index) {
        const living = this.enemies.filter(enemy => enemy.hp > 0);
        living.sort((a, b) => Math.abs(a.slot - target.slot) - Math.abs(b.slot - target.slot) || a.index - b.index);
        this.focus = living[0]?.index ?? target.index;
      }
    }
  }

  addCharge(points) {
    if (!this.fox || !this.enemies.some(enemy => enemy.hp > 0)) return;
    this.charge += points;
    if (this.charge < CORE.companion_max_charge) return;
    this.charge = 0;
    const target = this.enemies.filter(enemy => enemy.hp > 0)
      .sort((a, b) => a.hp * b.maxHp - b.hp * a.maxHp || a.index - b.index)[0];
    this.damage(target, this.power * FOX.sp_mult, 'fox');
    this.interrupt(target);
    if (!target.hp) {
      this.charge = CORE.episode_fox_kill_refund;
      this.foxBonus = true;
    }
  }

  advance() {
    if (this.result) return;
    this.tick++;
    this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + this.hero.regen * HORIZON_STEP_MS / 1000);
    if (this.tick >= this.nextShot) {
      const resonance = ++this.shots % CORE.wand_impulse_every === 0;
      this.damage(this.enemies[this.focus], this.wandPower * (resonance ? CORE.wand_impulse_mult : 1), resonance ? 'impulse' : 'wand');
      this.nextShot += this.intervals.wand;
      if (resonance) this.addCharge(CORE.companion_wand_impulse);
    }
    for (const enemy of this.enemies) {
      if (!enemy.hp) continue;
      if (enemy.heat && this.tick >= enemy.nextHeat && this.tick <= enemy.heatUntil) {
        this.damage(enemy, this.power * enemy.heat * CORE.episode_heat_tick_mult, 'heat');
        enemy.nextHeat += ticks(1);
      }
      if (this.tick >= enemy.heatUntil) enemy.heat = 0;
      if (enemy.hp && this.hero.hp) this.enemyTurn(enemy);
    }
    this.finishIfNeeded();
  }

  enemyTurn(enemy) {
    if (enemy.castUntil) {
      if (enemy.castUntil > this.tick) return;
      enemy.castUntil = 0;
      // A lone guardian uses its cast as an attack. In a pack it protects a wounded ally.
      const ally = enemy.role === 'warder' && this.enemies.find(other => other !== enemy && other.hp > 0);
      if (ally) {
        ally.shield = Math.round(ally.maxHp * 0.15);
        this.emit('ward', { enemy: ally.index });
      } else {
        this.hitHero(enemy, CORE.episode_enemy_cast_mult);
      }
      return;
    }
    if (enemy.nextAttack > this.tick) return;
    enemy.nextAttack = this.tick + this.intervals.enemies;
    const wantsCast = ++enemy.attacks % CORE.episode_enemy_cast_every === 0;
    const casts = this.enemies.filter(other => other.castUntil > this.tick).length;
    if (wantsCast && casts < this.maxConcurrentCasts) {
      enemy.castUntil = this.tick + ticks(CORE.episode_enemy_cast_duration);
      return;
    }
    this.hitHero(enemy, 1);
  }

  hitHero(enemy, multiplier) {
    this.hero.hp = Math.max(0, this.hero.hp - Math.round(enemy.hit * multiplier));
    this.emit('hit', { enemy: enemy.index });
  }

  finishIfNeeded() {
    if (!this.hero.hp) this.result = 'defeat';
    else if (this.enemies.every(enemy => !enemy.hp)) this.result = 'victory';
  }

  record() {
    return { ticks: this.tick, actions: this.actions.map(action => ({ ...action })) };
  }
}

export function replayHorizonBattle(context, { ticks: duration, actions }) {
  if (!Number.isSafeInteger(duration) || duration < 0 || duration > 12000 || !Array.isArray(actions)) throw new Error('Invalid battle log');
  const battle = new HorizonBattle(context);
  let index = 0;
  while (battle.tick <= duration) {
    while (actions[index]?.tick === battle.tick) {
      if (!battle.command(actions[index++])) throw new Error('Invalid battle action');
    }
    if (battle.tick === duration || battle.result) break;
    battle.advance();
  }
  if (index !== actions.length || battle.tick !== duration) throw new Error('Invalid battle duration');
  return battle;
}
