// Renderer-independent episode battle. Production combat rules are not changed.
import { EPISODE_MOVES, powerLevel, featuresAt, powerDefinition } from '../../config/magic.powers.js';

export const LOADOUT_SIZE = 4;
export const MOVES = EPISODE_MOVES;

export const FOCUS = { name: 'Собраться', channel: 1.4, gain: 26, cd: 2.5, desc: 'Восстановить ману. Удар врага сбивает.' };

export const COMBOS = {
  heldFlame: { mult: 1.75, text: 'Держать и жечь!' },
  heldThrow: { mult: 1.5, text: 'Точно в цель!' },
  curseFire: { mult: 1.5, text: 'Порча → Огонь ×1,5' },
  firePush: { dmg: 20, stagger: 1.6, text: 'В огонь!' },
};

export const WOLF = {
  id: 'frost_wolf', name: 'Волк метели', hp: 240,
  idle: [1.3, 2.2], enrageAt: 0.4, enrageSpeed: 0.8, stagger: 1.1,
  actions: {
    bite: { name: 'Укус', windup: 0.9, dmg: 8, weight: 3 },
    leap: { name: 'Прыжок', windup: 1.7, dmg: 20, weight: 2 },
    breath: { name: 'Ледяное дыхание', windup: 1.5, channel: 2.4, tick: 0.4, dmg: 4, weight: 2 },
    howl: { name: 'Вой', windup: 1.3, buff: 1.5, weight: 1 },
  },
};

export const HERO = { hp: 100, mana: 60, regen: 4, chillRegen: 2, chillCast: 1.3, chillLinger: 1.5 };

/** Простой детерминированный ГСЧ, чтобы тесты и повторы были воспроизводимы. */
export function rng(seed = 7) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function validLoadout(ids) {
  const list = [...new Set(ids)].filter(id => MOVES[id]);
  return list.length >= 1 && list.length <= LOADOUT_SIZE && list.length === ids.length;
}

export class EpisodeBattle {
  constructor({ loadout, seed = 7, hero = HERO, enemy = WOLF, powers = null, familiar = false, potion = false, amulet = null } = {}) {
    if (!validLoadout(loadout)) throw new Error('Bad loadout');
    this.loadout = [...loadout];
    this.powers = powers; this.familiar = familiar; this.familiarCd = 0; this.potion = potion; this.amulet = amulet;
    if (powers && loadout.some(id => this.level(MOVES[id].powerId) < MOVES[id].level)) throw new Error('Unlearned move');
    this.random = rng(seed);
    this.hero = { hp: hero.hp, maxHp: hero.hp, mana: hero.mana, maxMana: hero.mana, regen: hero.regen,
      cast: null, queue: null, cds: {}, ward: 0, wardCut: 0, reflect: false, chill: 0, focus: null };
    this.cfg = hero;
    this.def = enemy;
    this.enemy = { hp: enemy.hp, maxHp: enemy.hp, state: 'idle', timer: 0, action: null, held: 0, buff: 1, last: null, channelT: 0, tickT: 0, cursed: 0, burn: 0, burnTick: 0, armor: enemy.armor || 0 };
    this.enemy.timer = this.idleTime(0.6);
    this.patch = 0;          // секунд горящего хвороста
    this.time = 0;
    this.result = null;      // 'victory' | 'defeat'
    this.events = [];
    this.stats = { commands: {}, combos: 0, comboTypes: {}, interrupts: 0, damageTaken: 0, damageBySource: {}, manaWait: 0, familiarHits: 0, heals: 0 };
  }

  level(id) { return this.powers ? powerLevel(this.powers, id) : 2; }
  hasFeature(id, feature) { return featuresAt(powerDefinition(id, { experimental: true }), this.level(id)).includes(feature); }
  move(id) {
    const m = MOVES[id], level = this.level(m.powerId);
    return { ...m, dmg: m.dmg ? Math.round(m.dmg * (1 + (this.powers ? .22 * Math.max(0, level - 1) : 0))) : 0 };
  }

  emit(e) { this.events.push({ t: this.time, ...e }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  idleTime(k = 1) {
    const [a, b] = this.def.idle;
    return (a + (b - a) * this.random()) * k * (this.enraged() ? this.def.enrageSpeed : 1);
  }
  enraged() { return this.enemy.hp <= this.enemy.maxHp * this.def.enrageAt; }

  cooldown(id) { return Math.max(0, this.hero.cds[id] || 0); }
  /** Почему приём нельзя отдать прямо сейчас ('' — можно). */
  blocked(id) {
    if (this.result) return 'end';
    if (id === 'focus') return this.cooldown('focus') > 0 ? 'cd' : this.hero.focus ? 'busy' : '';
    const m = MOVES[id];
    if (m && this.level(m.powerId) < m.level) return 'nope';
    if (!m || !this.loadout.includes(id)) return 'nope';
    if (this.cooldown(id) > 0) return 'cd';
    if (this.hero.mana < m.cost) return 'mana';
    return '';
  }

  /** Команда игрока. Если герой занят — становится в очередь (одна). Возвращает 'cast' | 'queued' | причину отказа. */
  command(id) {
    const why = this.blocked(id);
    if (why === 'cd' || why === 'mana' || why === 'nope' || why === 'end') { this.emit({ type: 'refuse', move: id, why }); return why; }
    this.stats.commands[id] = (this.stats.commands[id] || 0) + 1;
    if (this.hero.cast || this.hero.focus) {
      if (id === 'focus') return 'busy';
      this.hero.queue = id; this.emit({ type: 'queued', move: id }); return 'queued';
    }
    this.begin(id);
    return 'cast';
  }

  begin(id) {
    const h = this.hero;
    if (id === 'focus') {
      h.focus = { t: FOCUS.channel };
      this.emit({ type: 'focus', on: true });
      return;
    }
    const m = MOVES[id];
    h.mana -= m.cost;
    h.cds[id] = m.cd;
    h.cast = { id, t: m.cast * (h.chill > 0 ? this.cfg.chillCast : 1) };
    this.emit({ type: 'cast', move: id });
  }

  resolve(id) {
    const m = this.move(id), e = this.enemy;
    const held = e.held > 0;
    if (id === 'throw') this.hitEnemy(Math.round(m.dmg * (held ? COMBOS.heldThrow.mult : 1)), id, held ? 'heldThrow' : null);
    if (id === 'flame') {
      const melt = this.level('fire') >= 2 && this.interruptIf(m.interrupts);
      const combo = held ? 'heldFlame' : e.cursed > 0 ? 'curseFire' : null;
      this.hitEnemy(Math.round(m.dmg * (combo ? COMBOS[combo].mult : 1)), id, combo);
      if (this.hasFeature('fire', 'burn')) { e.burn = 4; this.emit({ type: 'status', text: 'Горение' }); }
      if (melt) this.emit({ type: 'melt' });
    }
    if (id === 'push') {
      this.interruptIf(m.interrupts);
      if (this.patch > 0) {
        this.patch = 0;
        this.hitEnemy(COMBOS.firePush.dmg, id, 'firePush');
        this.stagger(COMBOS.firePush.stagger);
        this.emit({ type: 'patch', on: false });
      } else this.hitEnemy(m.dmg, id, null);
    }
    if (id === 'hold') {
      this.interruptIf('all');
      e.held = m.holdSec;
      if (e.state !== 'staggered') { e.state = 'held'; e.action = null; }
      this.emit({ type: 'held', sec: m.holdSec });
    }
    if (id === 'ignite') { this.patch = m.patchSec; this.emit({ type: 'patch', on: true }); }
    if (id === 'ward' || id === 'barrier') { this.hero.ward = m.wardSec; this.hero.wardCut = m.wardCut; this.hero.reflect = id === 'barrier' && this.hasFeature('barrier', 'reflect'); this.hero.chill = 0; this.emit({ type: 'ward', sec: m.wardSec }); }
    if (id === 'hex') { e.cursed = m.curseSec; this.emit({ type: 'status', text: 'Порча: удары слабее' }); }
    if (id === 'astral') { if (e.armor) this.emit({ type: 'status', text: 'Пробита защита' }); e.armor = 0; this.hitEnemy(m.dmg, id, null); }
  }

  /** Прервать намерение врага, если приём умеет. true — прервали. */
  interruptIf(list) {
    const e = this.enemy;
    if (!(e.state === 'windup' || e.state === 'channel') || !e.action) return false;
    if (list !== 'all' && !list?.includes(e.action)) return false;
    const was = e.action;
    e.action = null;
    this.stats.interrupts += 1;
    this.emit({ type: 'interrupt', action: was });
    this.stagger(this.def.stagger);
    return true;
  }

  stagger(sec) {
    const e = this.enemy;
    if (e.held > 0) { e.timer = Math.max(e.timer, sec); return; }
    e.state = 'staggered'; e.timer = sec; e.action = null;
  }

  hitEnemy(dmg, source, combo) {
    if (this.result) return;
    const e = this.enemy;
    dmg = Math.max(1, Math.round(dmg * (1 - e.armor) * (this.amulet === 'amulet_focus' ? 1.12 : 1)));
    e.hp = Math.max(0, e.hp - dmg);
    if (combo) { this.stats.combos += 1; this.stats.comboTypes[combo] = (this.stats.comboTypes[combo] || 0) + 1; this.emit({ type: 'combo', combo, text: COMBOS[combo].text }); }
    this.emit({ type: 'hit', target: 'enemy', dmg, source, combo });
    if (e.hp <= 0) { this.result = 'victory'; this.emit({ type: 'result', result: 'victory' }); }
  }

  hitHero(dmg, source, { chill = false } = {}) {
    if (this.result) return;
    const h = this.hero;
    const warded = h.ward > 0;
    const real = Math.max(1, Math.round(dmg * (this.enemy.cursed > 0 ? .7 : 1) * (this.amulet === 'amulet_forest' ? .8 : 1) * (warded ? 1 - h.wardCut : 1)));
    h.hp = Math.max(0, h.hp - real);
    this.stats.damageTaken += real;
    this.stats.damageBySource[source] = (this.stats.damageBySource[source] || 0) + real;
    if (chill && !warded) h.chill = this.cfg.chillLinger;
    if (h.focus) { h.focus = null; this.emit({ type: 'focus', on: false, broken: true }); }
    this.emit({ type: 'hit', target: 'hero', dmg: real, source, warded });
    if (h.hp <= 0) { this.result = 'defeat'; this.emit({ type: 'result', result: 'defeat' }); }
    else if (warded && h.reflect) this.hitEnemy(Math.round(dmg * .35), 'reflect', null);
  }

  chooseAction() {
    const acts = this.def.actions, e = this.enemy;
    let pool = Object.entries(acts).filter(([id]) => id !== e.last && !(id === 'howl' && e.buff > 1));
    if (!pool.length) pool = Object.entries(acts);
    const total = pool.reduce((s, [, a]) => s + a.weight, 0);
    let r = this.random() * total;
    for (const [id, a] of pool) { r -= a.weight; if (r <= 0) return id; }
    return pool[pool.length - 1][0];
  }

  tickEnemy(dt) {
    const e = this.enemy, acts = this.def.actions;
    if (e.held > 0) {
      e.held -= dt;
      if (e.held <= 0) { e.held = 0; e.state = 'idle'; e.timer = this.idleTime(0.5); this.emit({ type: 'released' }); }
      return;
    }
    e.timer -= dt;
    if (e.state === 'idle' || e.state === 'staggered') {
      if (e.timer > 0) return;
      const id = this.chooseAction(), a = acts[id];
      e.state = 'windup'; e.action = id; e.last = id;
      e.timer = a.windup * (this.enraged() ? this.def.enrageSpeed : 1);
      this.emit({ type: 'intent', action: id, windup: e.timer });
      return;
    }
    if (e.state === 'windup' && e.timer <= 0) {
      const id = e.action, a = acts[id];
      if (id === 'breath') { e.state = 'channel'; e.channelT = a.channel; e.tickT = 0; this.emit({ type: 'breath', on: true }); return; }
      if (id === 'howl') { e.buff = a.buff; this.emit({ type: 'howl' }); }
      else { this.hitHero(Math.round(a.dmg * e.buff), id); e.buff = 1; }
      e.state = 'idle'; e.action = null; e.timer = this.idleTime();
      return;
    }
    if (e.state === 'channel') {
      const a = acts.breath;
      e.channelT -= dt; e.tickT -= dt;
      if (e.tickT <= 0) { e.tickT += a.tick; this.hitHero(Math.round(a.dmg * e.buff), 'breath', { chill: true }); }
      if (e.channelT <= 0) { e.buff = 1; e.state = 'idle'; e.action = null; e.timer = this.idleTime(); this.emit({ type: 'breath', on: false }); }
    }
  }

  tickHero(dt) {
    const h = this.hero;
    for (const k of Object.keys(h.cds)) h.cds[k] = Math.max(0, h.cds[k] - dt);
    h.ward = Math.max(0, h.ward - dt);
    h.chill = Math.max(0, h.chill - dt);
    const breathing = this.enemy.state === 'channel';
    h.mana = Math.min(h.maxMana, h.mana + (h.chill > 0 || breathing ? this.cfg.chillRegen : h.regen) * dt);
    if (h.focus) {
      h.focus.t -= dt;
      if (h.focus.t <= 0) {
        h.focus = null; h.cds.focus = FOCUS.cd;
        h.mana = Math.min(h.maxMana, h.mana + FOCUS.gain);
        this.emit({ type: 'focus', on: false, gained: FOCUS.gain });
      }
    }
    if (h.cast) {
      h.cast.t -= dt;
      if (h.cast.t <= 0) {
        const id = h.cast.id; h.cast = null;
        this.resolve(id);
        if (h.queue && !this.result) {
          const q = h.queue; h.queue = null;
          if (!this.blocked(q)) this.begin(q); else this.emit({ type: 'refuse', move: q, why: this.blocked(q) });
        }
      }
    }
  }

  tick(dt) {
    if (this.result) return;
    this.time += dt;
    this.patch = Math.max(0, this.patch - dt);
    this.enemy.cursed = Math.max(0, this.enemy.cursed - dt);
    this.familiarCd = Math.max(0, this.familiarCd - dt);
    if (this.enemy.burn > 0) { this.enemy.burn -= dt; this.enemy.burnTick -= dt; if (this.enemy.burnTick <= 0) { this.enemy.burnTick += 1; this.hitEnemy(4, 'burn', null); } }
    if (!this.result && this.def.regen && !(this.enemy.cursed > 0 && this.hasFeature('curse', 'deny_regen'))) this.enemy.hp = Math.min(this.enemy.maxHp, this.enemy.hp + this.def.regen * dt);
    if (!this.result && this.familiar && this.enemy.cursed > 0 && this.familiarCd <= 0) { this.familiarCd = 5; this.stats.familiarHits++; this.emit({ type: 'status', text: 'Морвен: метка тени' }); this.hitEnemy(9, 'morven', null); }
    if (!this.result && this.potion && this.hero.hp > 0 && this.hero.hp < this.hero.maxHp * .4) { this.potion = false; this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 40); this.stats.heals++; this.emit({ type: 'status', text: 'Настой: +40 здоровья' }); }
    if (this.hero.mana < 6) this.stats.manaWait += dt;
    if (!this.result) this.tickHero(dt);
    if (!this.result) this.tickEnemy(dt);
  }

  /** То, что рисует сцена: намерение врага и прогресс подготовки. */
  intent() {
    const e = this.enemy;
    if (e.held > 0) return { state: 'held', left: e.held };
    if (e.state === 'windup') { const a = this.def.actions[e.action]; const total = a.windup * (this.enraged() ? this.def.enrageSpeed : 1); return { state: 'windup', action: e.action, name: a.name, progress: 1 - Math.max(0, e.timer) / total }; }
    if (e.state === 'channel') return { state: 'channel', action: 'breath', name: this.def.actions.breath.name, progress: 1 - e.channelT / this.def.actions.breath.channel };
    if (e.state === 'staggered') return { state: 'staggered' };
    return { state: 'idle' };
  }
}

/** Простой «игрок» для проверок баланса: отвечает на намерения, использует сочетания, собирается при нехватке маны. */
export function smartPolicy(b) {
  const e = b.enemy, it = b.intent(), can = (id) => !b.blocked(id) && !b.hero.cast;
  if (b.hero.cast || b.hero.focus) return null;
  if (it.state === 'windup' && it.action === 'breath' && can('flame')) return 'flame';
  if (it.state === 'windup' && (it.action === 'leap' || it.action === 'howl') && can('push')) return 'push';
  if (it.state === 'windup' && it.action === 'leap' && can('hold')) return 'hold';
  if (it.state === 'windup' && it.action === 'leap' && can('ward')) return 'ward';
  if (it.state === 'channel' && can('flame')) return 'flame';
  if (e.held > 0 && can('flame')) return 'flame';
  if (b.patch > 0 && can('push') && it.state !== 'windup') return 'push';
  if (b.hero.mana < 12 && can('focus') && it.state !== 'windup') return 'focus';
  if (it.state === 'idle' && can('hold') && b.hero.mana >= 26) return 'hold';
  if (it.state === 'idle' && can('ignite') && b.hero.mana >= 18) return 'ignite';
  if (can('flame') && b.hero.mana >= 24) return 'flame';
  if (can('throw')) return 'throw';
  return null;
}

/** Нажимать одну и ту же кнопку, пока хватает маны. */
export const spamPolicy = (id) => (b) => (!b.hero.cast && !b.blocked(id) ? id : null);

export function simulate(loadout, policy, { seed = 7, dt = 0.05, limit = 240, ...options } = {}) {
  const b = new EpisodeBattle({ loadout, seed, ...options });
  while (!b.result && b.time < limit) {
    const id = policy(b);
    if (id) b.command(id);
    b.tick(dt);
    b.drainEvents();
  }
  return b;
}
