import { CORE, FOX, ROBIN, PACKS, GIFT_RULES, defensiveRatings, levelScale, wandInterval, encounterHp, coverage, incomingDamage, effectiveCooldown } from '../config/horizon/rules.js';
import { PREVIEW_CORE, PREVIEW_GIFTS } from '../config/horizon/previewTuning.js';
import { POTIONS_41, AMULETS_41, amuletPower, giftMultiplier } from '../v2/progression.js';

export const HORIZON_STEP_MS = 50;
const ticks = seconds => Math.ceil(seconds * 1000 / HORIZON_STEP_MS);
const FORMATION_X = { solo: [0], duo: [-1, 1], trio: [0, -1, 1] };
const ARENA = {
  light: { name: 'Лёгкий камень', normal: CORE.light_stone_base, heat: CORE.light_stone_heat, respawn: CORE.light_stone_respawn },
  heavy: { name: 'Тяжёлый камень', normal: CORE.heavy_stone_base, heat: CORE.heavy_stone_heat, respawn: CORE.heavy_stone_respawn },
  crystal: { name:'Кристалл', normal:1, heat:CORE.crystal_storm, respawn:CORE.crystal_respawn },
  barrel: { name:'Бочка смолы', normal:CORE.arena_barrel_resin_mult, heat:CORE.arena_barrel_resin_mult, respawn:CORE.arena_barrel_respawn_sec },
};

export class HorizonBattle {
  constructor(context) {
    const { encounter, heroLevel, wandRank, fox } = context;
    const pack = PACKS[encounter.packId || encounter.pack];
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
    this.named = !!encounter.packId;
    this.gifts = context.gifts || {};
    this.rules = Object.fromEntries((context.slots || Object.keys(PREVIEW_GIFTS)).map(id=>[id,this.named?GIFT_RULES[id]:PREVIEW_GIFTS[id]]).filter(([,row])=>row));
    this.pet = context.pet || (fox ? 'fox' : null);
    this.petRank=context.petRank||1;
    this.fox = this.pet === 'fox';
    this.amulet = context.amulet || null;
    this.amuletRank = context.amuletRank;
    const amulet=AMULETS_41[this.amulet];
    const passiveRank=this.amuletRank>=5?5:this.amuletRank>=4?4:this.amuletRank>=2?2:0;
    this.amuletEffect=amulet?.passive_type;
    this.amuletValue=amulet?.['val_'+passiveRank] || 0;
    this.potions = { ...context.potions };
    this.usedPotions = {};
    this.healsUsed = 0;
    this.tacticalsUsed = 0;
    this.nextTactical = 0;
    this.effects = {};
    this.heroShield = 0;
    this.heroShieldUntil = 0;
    this.slowUntil = 0;
    this.encounterLevel = encounter.level;
    this.heroLevel=heroLevel;
    this.foxBonus = false;
    this.combos = 0;
    this.intervals = { wand: Math.round(wandInterval(wandRank) * 1000 / HORIZON_STEP_MS), enemies: ticks(PREVIEW_CORE.episode_enemy_attack_interval) };
    this.nextShot = this.intervals.wand;
    const heroScale = levelScale(heroLevel);
    const fraction = (Math.min(heroLevel, CORE.target_year_levels) - 1) / (CORE.target_year_levels - 1);
    this.power = CORE.base_power * heroScale;
    this.wandPower = this.named
      ? this.power * CORE.wand_base_sp_mult * this.rankFactor(context.wandLevel) * amuletPower(context.amuletRank)
      : this.power * PREVIEW_CORE.episode_wand_base_mult * PREVIEW_CORE.episode_wand_upgrade_power ** (wandRank / PREVIEW_CORE.episode_wand_rank_step);
    this.hero = {
      maxHp: Math.round(CORE.hero_base_hp * heroScale * (this.named ? this.rankFactor(context.vigor) : 1)),
      maxMana: Math.round(CORE.mana_start + (CORE.mana_end - CORE.mana_start) * fraction),
      regen: CORE.mana_regen_start + (CORE.mana_regen_end - CORE.mana_regen_start) * fraction,
    };
    this.hero.hp = this.hero.maxHp;
    this.hero.mana = this.hero.maxMana;
    const enemyScale = levelScale(encounter.level);
    this.enemies = encounter.enemies.map((def, index) => {
      const soloBoss = pack.count===1 && def.role==='boss';
      const hp = soloBoss ? encounterHp(encounter.level,'boss',1)
        : encounterHp(encounter.level,def.difficulty ?? encounter.difficulty ?? 'normal',pack.hp_shares[index]);
      const interval = this.named ? def.attack_interval_sec : PREVIEW_CORE.episode_enemy_attack_interval;
      const rating = defensiveRatings(encounter.level,{armor:def.armor_rating_base || 0,resistance:def.res_rating_base || 0});
      const initialShield = encounter.packId==='t2_duel_shield' ? Math.round(hp*.2) : 0;
      return {
        ...def, hp, maxHp: hp, slot: FORMATION_X[encounter.pack][index], index,
        hit: enemyScale * pack.dps_shares[index] * (this.named ? CORE.mob_base_dps * def.dps_mult * interval : CORE.base_power * PREVIEW_CORE.episode_enemy_hit_mult),
        interval: ticks(interval), rating, tags: {},
        nextAttack: ticks(pack.first_attack_sec?.[index] ?? (this.named ? interval : PREVIEW_CORE.episode_solo_first_attack_sec)),
        nextCast: ticks(def.cast_cd_sec || 1), castCount:0,
        attacks: 0, castStart: 0, castUntil: 0, heat: 0, heatUntil: 0, nextHeat: 0, shield: initialShield,
      };
    });
    this.objects = Object.fromEntries(encounter.arena.map(id => [id, { ...ARENA[id], id, tag: null, respawnAt: 0 }]));
    this.cooldown = Object.fromEntries(Object.keys(this.rules).map(id=>[id,0]));
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
    if (action.type === 'potion') return this.usePotion(action.id);
    if (action.type === 'focus') {
      if (!this.changeFocus(action.target)) return false;
      this.actions.push({ tick: this.tick, type: 'focus', target: this.focus });
      return true;
    }
    const { type, gift, object } = action;
    const rule = Object.hasOwn(this.rules, gift) ? this.rules[gift] : null;
    if (!rule || !['cast', 'cast_on_object'].includes(type) || this.cooldown[gift] > this.tick || this.hero.mana < rule.mana) return false;
    const target = this.enemies[this.focus];
    const stone = type === 'cast_on_object' && Object.hasOwn(this.objects, object) ? this.objects[object] : null;
    if (type === 'cast_on_object' && (!stone || stone.respawnAt > this.tick || (rule.role === 'nagovor' && stone.tag === rule.tag))) return false;

    this.hero.mana -= rule.mana;
    this.cooldown[gift] = this.tick + ticks(effectiveCooldown(rule.cd_sec));
    this.actions.push(type === 'cast_on_object' ? { tick: this.tick, type, gift, object } : { tick: this.tick, type, gift });
    if (this.named) {
      this.castNamed(rule, stone, target);
    } else if (stone && gift === 'fire') {
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

  activeTag(enemy,key) { return !!key && (key==='heat' ? enemy.heat>0 : (enemy.tags[key] || 0)>this.tick); }

  rankFactor(rank=1) {
    const ceiling = levelScale(this.heroLevel);
    const progress = ceiling > 1 ? (levelScale(Math.min(rank, this.heroLevel)) - 1) / (ceiling - 1) : 1;
    return 0.8 + 0.2 * progress;
  }

  mark(enemy,tag,seconds=5) {
    if (!enemy.hp || !tag) return;
    if (tag==='heat') { this.applyHeat(enemy,1); return; }
    const extra=tag==='brittle' && this.amuletEffect==='extend_brittle_slow_sec'?this.amuletValue:0;
    enemy.tags[tag]=this.tick+ticks((seconds+extra)*(1-enemy.rating.resistance));
    if (tag==='breach') enemy.shield=0;
  }

  giftPower(rule) {
    const gift=this.gifts[rule.id];
    return this.power * giftMultiplier(gift) * this.rankFactor(gift?.rank) * amuletPower(this.amuletRank);
  }

  shieldHero(amount,seconds) {
    this.heroShield=Math.max(this.heroShieldUntil>this.tick?this.heroShield:0,amount);
    this.heroShieldUntil=this.tick+ticks(seconds);
  }

  healForestAmulet() {
    if (this.amuletEffect==='heal_pct_on_zhatva_or_throw') {
      this.hero.hp=Math.min(this.hero.maxHp,this.hero.hp+this.hero.maxHp*this.amuletValue);
    }
  }

  castNamed(rule,stone,primary) {
    const power=this.giftPower(rule);
    if (stone) {
      const tag=stone.tag;
      if (rule.role==='nagovor' && stone.id!=='barrel') {
        stone.tag=rule.tag;
        this.emit('charge',{object:stone.id});
        return;
      }
      stone.tag=null; stone.respawnAt=this.tick+ticks(stone.respawn);
      if (rule.role==='obereg') {
        if (stone.id==='crystal') {
          this.hero.mana=Math.min(this.hero.maxMana,this.hero.mana+this.hero.maxMana*CORE.crystal_mana);
        } else {
          this.shieldHero(this.hero.maxHp*(rule.id==='stone_shell'?.35:.24),6);
        }
      } else {
        const effective=tag || rule.tag;
        const force=effective==='brittle'
          ? stone.id==='heavy'?CORE.heavy_stone_brittle:CORE.light_stone_brittle
          : effective==='heat' || (stone.id==='crystal' && effective==='charge') ? stone.heat:stone.normal;
        const scope=stone.id==='crystal'?'all':stone.id==='barrel'||stone.id==='heavy'&&effective?'splash':'single';
        for (const enemy of this.enemies) {
          const share=coverage(scope,enemy===primary);
          if (!enemy.hp || !share) continue;
          this.mark(enemy,effective,effective==='brittle'?6:5);
          this.damage(enemy,power*force*share*(effective==='echo'?1.4:1),effective==='heat'?'fire-stone':'stone');
          this.interrupt(enemy,'arena');
          if (effective==='heat') this.applyHeat(enemy,1);
        }
        this.healForestAmulet();
      }
      if (tag || stone.id==='crystal' || stone.id==='barrel') {
        this.combos++;
        this.addCharge(CORE.companion_arena_combo);
      }
      return;
    }
    if (rule.target_scope==='self') {
      const shield=rule.id==='lunar_veil'?.20:rule.id==='stone_shell'?.35:.12;
      this.shieldHero(Math.max(this.hero.maxHp*shield,power*rule.sp_mult),6);
      return;
    }
    let harvested=false;
    for (const enemy of this.enemies) {
      const share=coverage(rule.target_scope,enemy===primary);
      if (!enemy.hp || !share) continue;
      const harvestedTag=rule.role==='zhatva' && rule.detonate_tag?.split('|').find(tag=>this.activeTag(enemy,tag));
      if (rule.tag) this.mark(enemy,rule.tag);
      if (rule.id==='seal') this.mark(enemy,'breach');
      this.damage(enemy,power*rule.sp_mult*share*(harvestedTag?rule.id==='ice_shatter'?2:1.6:1),rule.id);
      if (harvestedTag) {
        if (harvestedTag==='heat') enemy.heat=0;
        else enemy.tags[harvestedTag]=0;
        if (rule.id==='ice_shatter') this.interrupt(enemy);
        this.addCharge(CORE.companion_zhatva_trigger);
        harvested=true;
      }
      if (rule.role==='volya') this.interrupt(enemy);
    }
    if (harvested) this.healForestAmulet();
  }

  usePotion(id) {
    const p=Object.hasOwn(POTIONS_41,id) ? POTIONS_41[id] : null;
    if (!p || (this.potions[id] || 0)<=(this.usedPotions[id] || 0) || p.category==='pre_combat') return false;
    if (p.category==='heal') {
      if (this.healsUsed>=CORE.max_heal_potions) return false;
      this.healsUsed++;
    } else {
      if (this.tacticalsUsed>=CORE.max_tactical_potions || this.nextTactical>this.tick) return false;
      this.tacticalsUsed++;
      this.nextTactical=this.tick+ticks(CORE.tactical_potion_cooldown);
      this.addCharge(CORE.companion_tactical_potion);
    }
    this.usedPotions[id]=(this.usedPotions[id] || 0)+1;
    this.actions.push({type:'potion',id,tick:this.tick});
    if (p.effect_type.startsWith('heal_') || p.effect_type.includes('_heal_')) {
      this.hero.hp=Math.min(this.hero.maxHp,this.hero.hp+this.hero.maxHp*p.value_pct);
    } else if (p.effect_type.startsWith('mana_')) {
      this.hero.mana=Math.min(this.hero.maxMana,this.hero.mana+this.hero.maxMana*p.value_pct);
    } else if (p.effect_type.startsWith('sp_burst')) {
      const target=this.enemies[this.focus];
      this.damage(target,this.power*p.value_pct,id);
      this.applyHeat(target,2);
    } else if (p.effect_type.startsWith('apply_')) {
      this.mark(this.enemies[this.focus],p.effect_type.includes('viscosity')?'viscosity':'brittle',p.duration_sec);
    } else if (p.effect_type.startsWith('shield_')) {
      this.shieldHero(this.hero.maxHp*p.value_pct,p.duration_sec);
    } else {
      this.effects[p.effect_type]={until:this.tick+ticks(p.duration_sec),value:p.value_pct};
    }
    if (p.effect_type.startsWith('cleanse_')) this.slowUntil=0;
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
        if (other !== target && other.hp > 0) this.damage(other, this.power * stone.heat * coverage('splash', false), 'fire-stone');
      }
    }
    this.addCharge(CORE.companion_arena_combo);
  }

  applyHeat(target, stacks) {
    if (!target.hp) return;
    if (!target.heat) target.nextHeat = this.tick + ticks(1);
    target.heat = Math.min(3, target.heat + stacks);
    target.heatUntil = this.tick + ticks(PREVIEW_CORE.episode_heat_duration);
  }

  interrupt(target, source) {
    if (!target.castUntil) return;
    if (target.id==='boss_august_grad' &&
      (target.castCount%2===1 || (source!=='arena' && source!=='fox'))) return;
    target.castUntil = 0;
    target.nextAttack = this.tick + target.interval;
    this.emit('interrupt', { enemy: target.index });
  }

  damage(target, amount, source) {
    if (!target.hp) return;
    const mod = this.named
      ? (this.activeTag(target,'brittle') ? 1.25 : 1)
        * (this.activeTag(target,'viscosity') && (source==='heat' || source==='impulse') ? 2 : 1)
        * (1-target.rating.armor*(this.activeTag(target,'breach')?0.35:1))
      : 1;
    const damage = Math.round(amount*mod);
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
    if (!this.pet || !this.enemies.some(enemy => enemy.hp > 0)) return;
    this.charge += points;
    if (this.charge < CORE.companion_max_charge) return;
    this.charge = 0;
    if (this.pet==='robin') {
      for (const enemy of this.enemies) {
        if (!enemy.hp) continue;
        for (const key of Object.keys(enemy.tags)) if (this.activeTag(enemy,key)) enemy.tags[key]+=ticks(2.5);
        if (enemy.heat) enemy.heatUntil+=ticks(2.5);
        this.damage(enemy,this.power*ROBIN.sp_mult*this.rankFactor(this.petRank)*coverage('all',enemy.index===this.focus),'robin');
      }
      this.hero.hp=Math.min(this.hero.maxHp,this.hero.hp+this.hero.maxHp*ROBIN.heal_pct);
      this.emit('companion',{id:'robin'});
      return;
    }
    const target = this.enemies.filter(enemy => enemy.hp > 0)
      .sort((a, b) => a.hp * b.maxHp - b.hp * a.maxHp || a.index - b.index)[0];
    this.damage(target, this.power * FOX.sp_mult * (this.named?this.rankFactor(this.petRank):1), 'fox');
    this.interrupt(target,'fox');
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
      const target=this.enemies[this.focus];
      const shock=resonance && this.activeTag(target,'charge');
      this.damage(target,this.wandPower*(resonance?CORE.wand_impulse_mult:1)+(shock?this.power*.6:0),resonance?'impulse':'wand');
      if (shock) { target.tags.charge=0; this.interrupt(target); }
      this.nextShot += Math.round(this.intervals.wand*(this.slowUntil>this.tick?1.2:1));
      if (resonance) this.addCharge(CORE.companion_wand_impulse);
    }
    for (const enemy of this.enemies) {
      if (!enemy.hp) continue;
      if (enemy.heat && this.tick >= enemy.nextHeat && this.tick <= enemy.heatUntil) {
        this.damage(enemy, this.power * enemy.heat * PREVIEW_CORE.episode_heat_tick_mult, 'heat');
        enemy.nextHeat += ticks(1);
      }
      if (this.tick >= enemy.heatUntil) enemy.heat = 0;
      if (enemy.hp && this.hero.hp) this.enemyTurn(enemy);
    }
    this.finishIfNeeded();
  }

  enemyTurn(enemy) {
    if (this.named) {
      this.namedEnemyTurn(enemy);
      return;
    }
    if (enemy.castUntil) {
      if (enemy.castUntil > this.tick) return;
      enemy.castUntil = 0;
      // A lone guardian uses its cast as an attack. In a pack it protects a wounded ally.
      const ally = enemy.role === 'warder' && this.enemies.find(other => other !== enemy && other.hp > 0);
      if (ally) {
        ally.shield = Math.round(ally.maxHp * PREVIEW_CORE.episode_ward_shield);
        this.emit('ward', { enemy: ally.index });
      } else {
        this.hitHero(enemy, PREVIEW_CORE.episode_enemy_cast_mult);
      }
      return;
    }
    if (enemy.nextAttack > this.tick) return;
    enemy.nextAttack = this.tick + this.intervals.enemies;
    const wantsCast = ++enemy.attacks % PREVIEW_CORE.episode_enemy_cast_every === 0;
    const casts = this.enemies.filter(other => other.castUntil > this.tick).length;
    if (wantsCast && casts < this.maxConcurrentCasts) {
      enemy.castUntil = this.tick + ticks(PREVIEW_CORE.episode_enemy_cast_duration);
      enemy.castStart = this.tick;
      return;
    }
    this.hitHero(enemy, 1);
  }

  namedEnemyTurn(enemy) {
    const effect=enemy.cast_effect;
    if (enemy.castUntil) {
      if (enemy.castUntil>this.tick) return;
      enemy.castUntil=0;
      const alternating=effect.startsWith('alternating_');
      const ally=effect.startsWith('shield_ally') ? this.enemies.find(a=>a!==enemy && a.hp) : null;
      if (effect.startsWith('shield_') || alternating && enemy.castCount%2===1) {
        const target=ally || enemy;
        let percent=enemy.cast_value;
        if (alternating) percent=effect.includes('15')?.15:.12;
        if (!this.activeTag(target,'breach')) {
          target.shield=Math.max(target.shield,Math.round(target.maxHp*percent));
          this.emit('ward',{enemy:target.index});
        }
      } else {
        const cold=effect.includes('chill') || effect.includes('frost') || effect.includes('slow');
        if (cold) this.slowUntil=this.tick+ticks(4);
        this.hitHero(enemy,enemy.cast_value,cold);
      }
      return;
    }
    if (enemy.nextAttack>this.tick) return;
    const slow=this.activeTag(enemy,'brittle') || this.activeTag(enemy,'viscosity');
    enemy.nextAttack=this.tick+Math.round(enemy.interval*(slow?1.25:1));
    const casts=this.enemies.filter(other=>other.castUntil>this.tick).length;
    if (enemy.nextCast<=this.tick && casts<this.maxConcurrentCasts) {
      enemy.castCount++;
      enemy.castUntil=this.tick+ticks(enemy.cast_time_sec);
      enemy.castStart=this.tick;
      enemy.nextCast=this.tick+ticks(enemy.cast_cd_sec);
      return;
    }
    this.hitHero(enemy,1);
  }

  hitHero(enemy, multiplier, cold = false) {
    const direct=this.effects.direct_dmg_mit;
    const warm=this.effects.cleanse_slow_frost_mit;
    const potion=Math.max(direct?.until>this.tick?direct.value:0,cold && warm?.until>this.tick?warm.value:0);
    const amulet=cold && this.amuletEffect==='status_dmg_mitigation'?this.amuletValue:0;
    const damage=Math.round(incomingDamage(enemy.hit*multiplier,{potion,amulet}));
    if (this.heroShieldUntil<=this.tick) this.heroShield=0;
    const absorbed=Math.min(this.heroShield,damage);
    this.heroShield-=absorbed;
    this.hero.hp=Math.max(0,this.hero.hp-damage+absorbed);
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
