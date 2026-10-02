import Phaser from 'phaser';
import { VIEW, COLORS, DEPTH } from '../config/game.config.js';
import { ENEMY_SPAWNS } from '../config/world.layout.js';
import { COMBAT } from '../config/balance.enemies.js';
import { HERO_RECOVERY } from '../config/balance.hero.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { CombatManager } from '../systems/CombatManager.js';
import { HeroAnimator } from '../systems/HeroAnimator.js';
import { UI } from '../config/ui.config.js';
import { UIBar, drawPlate } from '../ui/widgets.js';
import { applyDisplaySize, itemName } from '../objects/InteractiveObject.js';
import { POTIONS, POTION_ORDER } from '../config/resources.js';

const FONT = UI.font;
const SH = UI.shadow;
const SCHOOL_COLOR = { telekinesis: COLORS.telekinesis, fire: COLORS.fire, seal: COLORS.seal, auto: 0xf1e3c2 };
const ENEMY_POS = { x: VIEW.width / 2, y: 560 };
const HERO_POS = { x: VIEW.width / 2, y: 1040 };
const hex = c => '#' + c.toString(16).padStart(6, '0');

/**
 * CombatScene — отрисовка и ввод боя. Вся логика — в CombatManager (чистый JS, тестируется в node).
 * Враг действует сам; игрок вмешивается магией; героиня сама делает слабую автоатаку.
 */
export class CombatScene extends Phaser.Scene {
  constructor() { super('CombatScene'); }

  init(data) {
    this.spawnId = data.spawnId;
    this.spawn = ENEMY_SPAWNS.find(s => s.id === data.spawnId) || {};
    this.enemyType = data.enemyType;
  }

  create() {
    const { state, abilities, bus } = services;
    this.bus = bus;
    this.cm = new CombatManager({ enemyType: this.enemyType, state, abilities });
    this.def = this.cm.def;
    this.started = false;
    this.ended = false;
    services.mode = 'combat';
    bus.emit(MSG.UI_MODE, 'combat');

    this.buildArena();
    this.buildEnemy();
    this.buildHero();
    this.buildFieldObjects();
    this.buildEnemyHud();
    this.buildHurtVignette();
    this.buildPotions();
    this.hitstop = 0;
    this.timeScale = 1;
    this.enemyShake = 0;
    this.firstCombat = !state.data.stats.combats.length;

    this.registry.set('hudProvider', () => ({ hp: this.cm.hero.hp, maxHp: this.cm.hero.maxHp, mana: this.cm.hero.mana, maxMana: this.cm.hero.maxMana }));
    this.registry.set('abilityProvider', (id) => {
      const st = this.cm.abilityState(id);
      const e = this.cm.enemy;
      st.suggested = st.state === 'ready' && e.isPreparing && id === 'telekinesis';
      return st;
    });

    bus.on(MSG.ABILITY_USE, this.onAbility, this);
    bus.on(MSG.COMBAT_CYCLE, () => { if (this.canAct()) { this.cm.cycleSelection(); this.processEvents(); } }, this);
    bus.on(MSG.CONTEXT_ACTION, () => this.onAbility('telekinesis'), this);
    this.events.once('shutdown', () => bus.offContext(this));

    this.events.once('shutdown', () => { services.audio.lowHp = false; services.tutorial.hide(); });
    this.cameras.main.fadeIn(350);
    this.showBanner(`Бой: ${this.def.name}`, COLORS.danger);
    const first = !state.data.stats.combats.length;
    this.time.delayedCall(COMBAT.introSec * 1000, () => {
      this.started = true;
      if (first) this.toast('Враг атакует сам. Прерывайте сильные атаки Телекинезом!', COLORS.telekinesis);
      else if (this.def.armor) this.toast('Броня Стража держится на кристалле. Выберите его и разбейте Телекинезом.', COLORS.telekinesis);
    });
  }

  canAct() { return this.started && !this.ended && !services.modalOpen && !services.offline; }

  // ------------------------------------------------------------------ построение
  buildArena() {
    const { width, height } = VIEW;
    this.add.rectangle(0, 0, width, height, this.cm.arena.ground).setOrigin(0);
    this.add.ellipse(width / 2, 760, width * 1.1, 760, 0x384a2e, 0.55);
    this.add.ellipse(width / 2, 760, width * 0.8, 520, 0x41553a, 0.35);
    const rand = new Phaser.Math.RandomDataGenerator([this.enemyType]);
    for (let i = 0; i < 9; i++) {
      const key = rand.pick(['tree_dark_01', 'tree_dark_02', 'tree_autumn_01']);
      const x = i * 90 + rand.between(-20, 20);
      applyDisplaySize(this.add.image(x, 300 + rand.between(-30, 20), key), key).setOrigin(0.5, 1).setAlpha(0.9).setDepth(1);
    }
    for (const side of [-20, VIEW.width + 20]) {
      for (let y = 420; y < 1200; y += 170) { const k = rand.pick(['tree_dark_01', 'tree_autumn_02']); applyDisplaySize(this.add.image(side, y + rand.between(-20, 20), k), k).setOrigin(0.5, 1).setDepth(y); }
    }
  }

  buildEnemy() {
    const s = this.add.image(ENEMY_POS.x, ENEMY_POS.y, this.def.texture).setOrigin(0.5, 1);
    applyDisplaySize(s, this.def.texture);
    const mul = this.def.tier === 'strong' ? 1.5 : 1.7;
    s.setScale(s.scaleX * mul, s.scaleY * mul).setDepth(ENEMY_POS.y);
    this.enemySprite = s;
    this.enemyBase = { sx: s.scaleX, sy: s.scaleY };
    this.add.image(ENEMY_POS.x, ENEMY_POS.y - 4, 'hero_shadow').setDisplaySize(s.displayWidth * 0.9, 34).setDepth(ENEMY_POS.y - 1);
    this.idle = this.tweens.add({ targets: s, scaleY: s.scaleY * 1.04, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.prepGlow = this.add.image(ENEMY_POS.x, ENEMY_POS.y - s.displayHeight / 2, 'fx_glow').setTint(COLORS.danger).setBlendMode('ADD').setScale(3).setAlpha(0).setDepth(ENEMY_POS.y + 1);
    this.armorGlow = this.add.image(ENEMY_POS.x, ENEMY_POS.y - s.displayHeight / 2, 'fx_ring').setTint(0x9f8bff).setScale(2.2, 2.6).setAlpha(this.cm.enemy.hasArmor ? 0.6 : 0).setDepth(ENEMY_POS.y + 2);
  }

  buildHero() {
    this.heroShadow = this.add.image(HERO_POS.x, HERO_POS.y - 2, 'hero_shadow').setDepth(HERO_POS.y - 1);
    this.heroSprite = this.add.image(HERO_POS.x, HERO_POS.y, 'hero_up').setOrigin(0.5, 1); this.heroSprite.setScale(144 / this.heroSprite.height); this.heroSprite.setDepth(HERO_POS.y);
    this.heroBaseScale = this.heroSprite.scaleX;
    this.heroAnim = new HeroAnimator();
  }

  /** Анимация героини в бою: дыхание, каст, удар, падение. Идёт по реальному времени (не по timeScale). */
  updateHero(delta) {
    const pose = this.heroAnim.update(Math.min(delta, 50) / 1000, { speed: 0, dir: 0, face: 'up' });
    const H = 144, b = this.heroBaseScale, s = this.heroSprite;
    s.setPosition(HERO_POS.x + pose.dx * H, HERO_POS.y + pose.dy * H);
    s.setScale(b * pose.sx, b * pose.sy).setAngle(pose.rot).setAlpha(pose.alpha);
    if (pose.flash) s.setTintFill(COLORS.danger); else s.clearTint();
    this.heroShadow.setScale(pose.shadowScale).setAlpha(pose.shadowAlpha);
  }

  buildFieldObjects() {
    this.fieldViews = new Map();
    for (const o of this.cm.fieldObjects) {
      const img = applyDisplaySize(this.add.image(o.x, o.y, o.def.texture), o.def.texture).setOrigin(0.5, 1).setDepth(o.y);
      const ring = this.add.image(o.x, o.y - 4, 'fx_ring').setDisplaySize(img.displayWidth * 1.5, img.displayWidth * 0.6).setTint(COLORS.telekinesis).setAlpha(0).setDepth(o.y - 1);
      const label = this.add.text(o.x, o.y + 6, o.def.name, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, stroke: '#000', strokeThickness: 4, align: 'center', wordWrap: { width: 200 } }).setOrigin(0.5, 0).setDepth(o.y);
      // большая зона нажатия — без требований к точности
      const hit = this.add.zone(o.x, o.y - img.displayHeight / 2, Math.max(150, img.displayWidth * 1.6), Math.max(150, img.displayHeight * 1.6)).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { if (this.canAct()) { this.cm.selectObject(o.id); this.processEvents(); } });
      this.fieldViews.set(o.id, { img, ring, label, home: { x: o.x, y: o.y } });
    }
    if (this.cm.fieldObjects.length) {
      this.fieldHint = this.add.text(VIEW.width / 2, 868, 'Коснитесь предмета, затем нажмите Телекинез', {
        fontFamily: FONT, fontSize: UI.type.small, color: COLORS.textDim, align: 'center', wordWrap: { width: 600 },
      }).setOrigin(0.5).setDepth(2000);
    }
  }

  buildEnemyHud() {
    const W = VIEW.width;
    const y = 184;
    this.add.text(W / 2, y - 14, this.def.name + (this.def.tier === 'strong' ? '  ★' : ''), { fontFamily: FONT, fontSize: UI.type.heading, color: '#ffb3a8', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5, 1).setDepth(5000);
    this.enemyHpBar = new UIBar(this, W / 2 - 260, y, 520, 34, 'hp', 5000);
    this.enemyHpText = this.add.text(W / 2, y, '', { fontFamily: FONT, fontSize: UI.type.small, color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(5002);
    this.statusText = this.add.text(W / 2, y + 26, '', { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.textGold, stroke: '#000', strokeThickness: 4, align: 'center', wordWrap: { width: 620 } }).setOrigin(0.5, 0).setDepth(5000);

    // предупреждение о сильной атаке (cast warning)
    this.warn = this.add.container(W / 2, 352).setDepth(5100).setVisible(false);
    const bg = drawPlate(this.add.graphics(), 644, 144, { accent: COLORS.danger, fill: 0x2a0806, alpha: 0.94 });
    this.warnTitle = this.add.text(0, -50, '', { fontFamily: FONT, fontSize: UI.type.combat, color: '#ff6a5a', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    this.warnHint = this.add.text(0, -22, '', { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.text, align: 'center', wordWrap: { width: 600 }, lineSpacing: 2 }).setOrigin(0.5, 0);
    this.warnBarBg = this.add.rectangle(-260, 56, 520, 10, 0x000000, 0.8).setOrigin(0, 0.5);
    this.warnBar = this.add.rectangle(-260, 56, 520, 10, COLORS.danger).setOrigin(0, 0.5);
    this.warn.add([bg, this.warnTitle, this.warnHint, this.warnBarBg, this.warnBar]);
  }

  // ------------------------------------------------------------------ расходники (v0.8)
  /** Круглые кнопки зелий слева над панелью даров: показываются только те, что есть в сумке. */
  buildPotions() {
    this.potionViews = new Map();
    POTION_ORDER.forEach((id, i) => {
      const p = POTIONS[id], x = 68 + i * 114, y = 1028;
      const ring = this.add.circle(x, y, UI.touch.potionRadius, 0x1a120d, 0.92).setStrokeStyle(3, p.color).setDepth(5200);
      const icon = this.add.image(x, y - 2, p.icon).setDepth(5201);
      icon.setScale(UI.icon.combatPotion / Math.max(icon.width, icon.height, 1));
      const badge = this.add.text(x + 30, y + 30, '', { fontFamily: FONT, fontSize: UI.type.small, fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(5202);
      const hit = this.add.zone(x, y, UI.touch.potion, UI.touch.potion).setInteractive({ useHandCursor: true }).setDepth(5203);
      hit.on('pointerdown', () => this.onPotion(id));
      this.potionViews.set(id, { ring, icon, badge, hit });
    });
    this.refreshPotions();
    this.input.keyboard?.on('keydown-FOUR', () => this.onPotion('elixir_life'));
    this.input.keyboard?.on('keydown-FIVE', () => this.onPotion('elixir_mana'));
    this.input.keyboard?.on('keydown-SIX', () => this.onPotion('resin_flask'));
  }

  refreshPotions() {
    for (const [id, v] of this.potionViews) {
      const n = services.state.item(id);
      for (const o of [v.ring, v.icon, v.badge, v.hit]) o.setVisible(n > 0);
      v.badge.setText(String(n));
    }
  }

  onPotion(id) {
    if (!this.canAct()) return;
    const res = this.cm.usePotion(id);
    if (!res.ok) {
      const msg = { full: id === 'elixir_life' ? 'Здоровье уже полное' : 'Мана уже полная', none: 'Таких зелий нет', limit: 'Больше зелий за бой не выпить' }[res.reason];
      if (msg) this.toast(msg);
      services.audio.play('locked');
      return;
    }
    services.state.save();
    this.refreshPotions();
    services.audio.play('potion');
    this.heroAnim.playCast('auto');
    this.processEvents();
  }

  // красная рамка по краям экрана (урон по героине / мало HP)
  buildHurtVignette() {
    const { width: W, height: H } = VIEW;
    const g = this.add.graphics().setDepth(7600).setScrollFactor(0);
    for (let i = 0; i < 10; i++) {
      const t = 6 + i * 9;
      g.fillStyle(COLORS.danger, 0.09 * (1 - i / 10));
      g.fillRect(0, 0, W, t).fillRect(0, H - t, W, t).fillRect(0, 0, t, H).fillRect(W - t, 0, t, H);
    }
    g.setAlpha(0);
    this.hurtVig = g;
    this.hurtFlash = 0;
  }

  /** Короткая «заморозка» логики боя для веса удара. */
  freeze(ms) { this.hitstop = Math.max(this.hitstop, ms); }

  // ------------------------------------------------------------------ действия
  onAbility(id) {
    if (!this.canAct()) return;
    const obj = id === 'telekinesis' ? this.cm.selectedObject() : null;
    const res = this.cm.useAbility(id);
    if (!res.ok) {
      const msg = { cooldown: 'Перезарядка…', nomana: 'Не хватает маны', locked: `${ABILITIES[id].name}: дар ещё не изучен` }[res.reason];
      if (msg) this.toast(msg);
      services.audio.play('locked');
      return;
    }
    services.audio.play(id === 'fire' ? 'fire_cast' : 'telekinesis_cast');
    this.heroCast(SCHOOL_COLOR[id], obj, id);
    this.processEvents();
  }

  heroCast(color, obj, id = 'telekinesis') {
    this.heroAnim.playCast(id);
    const from = obj ? this.fieldViews.get(obj.id).img : this.heroSprite;
    const sx = from.x, sy = from.y - from.displayHeight / 2;
    const tx = ENEMY_POS.x, ty = ENEMY_POS.y - this.enemySprite.displayHeight / 2;
    if (!obj) {
      for (let i = 0; i < 8; i++) {
        const d = this.add.image(sx, sy, 'fx_dot').setTint(color).setBlendMode('ADD').setScale(1.4 - i * 0.12).setDepth(6000);
        this.tweens.add({ targets: d, x: tx, y: ty, delay: i * 25, duration: 230, onComplete: () => d.destroy() });
      }
    }
    this.time.delayedCall(240, () => this.burst(tx, ty, color, 18));
  }

  // ------------------------------------------------------------------ цикл
  update(time, delta) {
    if (!this.started) return;
    this.updateHero(delta);
    if (this.ended) return;
    if (!services.modalOpen && !services.offline) { // без связи бой стоит: враг не бьёт, пока висит «Нет соединения»
      if (this.hitstop > 0) this.hitstop -= delta;
      else this.cm.tick(Math.min(delta, 50) / 1000 * this.timeScale);
    }
    this.processEvents();
    this.updateHud();
    this.updateJuice(delta);
  }

  updateHud() {
    this.fieldHint?.setVisible(!services.tutorial.active);
    const e = this.cm.enemy;
    this.enemyHpBar.setFraction(Math.max(0, e.hp / e.maxHp));
    this.enemyHpText.setText(`${Math.ceil(e.hp)} / ${e.maxHp}`);
    const st = [];
    if (e.hasArmor) st.push(e.armorActive ? `Броня −${Math.round(this.def.armor.value * 100)}%` : `Броня разбита ${e.armorDisabledLeft.toFixed(0)}с`);
    if (e.burning) st.push(`Горение ${e.burn.left.toFixed(0)}с`);
    if (e.staggerLeft > 0) st.push('Оглушён');
    if (e.defenseActive) st.push(`Защита −${Math.round(this.def.defense * 100)}%`);
    this.statusText.setText(st.join('   ·   '));
    this.armorGlow.setAlpha(e.armorActive ? 0.45 + Math.sin(this.time.now / 300) * 0.15 : 0);
    this.enemySprite.setTint(e.burning ? 0xffb38a : e.staggerLeft > 0 ? 0xb0b0ff : 0xffffff);

    if (e.isPreparing) {
      this.warn.setVisible(true);
      this.warnBar.width = 520 * (1 - e.prepProgress);
      this.prepGlow.setAlpha(0.35 + Math.sin(this.time.now / 80) * 0.15);
    } else {
      this.warn.setVisible(false);
      this.prepGlow.setAlpha(0);
    }
    for (const o of this.cm.fieldObjects) {
      const v = this.fieldViews.get(o.id);
      v.ring.setAlpha(o.id === this.cm.selectedId ? 0.7 + Math.sin(this.time.now / 150) * 0.3 : 0);
      v.img.setTint(o.id === this.cm.selectedId ? COLORS.telekinesis : 0xffffff);
    }
  }

  updateJuice(delta) {
    const h = this.cm.hero;
    const low = h.hp > 0 && h.hp / h.maxHp < 0.3;
    services.audio.lowHp = low && !this.ended;
    this.hurtFlash = Math.max(0, this.hurtFlash - delta / 450);
    const pulse = low ? 0.45 + Math.sin(this.time.now / 160) * 0.25 : 0;
    this.hurtVig.setAlpha(Math.max(this.hurtFlash, pulse));
    // дрожь врага при попадании (только x — y и scale заняты другими анимациями)
    this.enemyShake = Math.max(0, this.enemyShake - delta / 220);
    this.enemySprite.x = ENEMY_POS.x + Math.sin(this.time.now / 18) * 10 * this.enemyShake;
    // обучение: замедление во время первого предупреждения
    if (this.timeScale < 1 && !this.cm.enemy.isPreparing) this.endSlowMo();
  }

  endSlowMo() {
    this.timeScale = 1;
    services.tutorial.complete('combat_warning');
  }

  processEvents() {
    for (const ev of this.cm.drainEvents()) {
      switch (ev.type) {
        case 'damage': this.onDamage(ev); break;
        case 'warning':
          this.warnTitle.setText(`⚠ ${ev.name}!`);
          this.warnHint.setText(ev.needsHeavy ? 'Выберите тяжёлый камень и нажмите Телекинез' : (ev.hint || ''));
          this.tweens.add({ targets: this.enemySprite, scaleX: this.enemyBase.sx * 1.1, duration: 200, yoyo: true });
          this.tweens.add({ targets: this.warn, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
          services.audio.play('warning');
          services.audio.vibrate(25);
          if (this.firstCombat && !ev.needsHeavy && services.tutorial.show('combat_warning')) this.timeScale = 0.35;
          break;
        case 'interrupt':
          if (ev.ok) {
            this.floatText(ENEMY_POS.x, ENEMY_POS.y - this.enemySprite.displayHeight - 30, 'ПРЕРВАНО!', COLORS.telekinesis, 34);
            this.tweens.add({ targets: this.enemySprite, y: ENEMY_POS.y - 24, duration: 120, yoyo: true });
            this.cameras.main.shake(120, 0.006);
            this.burst(ENEMY_POS.x, ENEMY_POS.y - this.enemySprite.displayHeight * 0.6, COLORS.telekinesis, 30);
            services.audio.play('interrupt');
            services.audio.vibrate(50);
            this.freeze(110);
            this.enemyShake = 1.2;
            if (this.timeScale < 1) this.endSlowMo();
          } else {
            services.audio.play('fail');
            this.toast(ev.hint || 'Эту атаку так не прервать', COLORS.danger);
          }
          break;
        case 'potion': this.onPotionEvent(ev); break;
        case 'objectUsed': this.animateObject(ev); break;
        case 'objectRespawn': {
          const v = this.fieldViews.get(ev.id);
          v.img.setPosition(v.home.x, v.home.y).setAlpha(0).setScale(1).setVisible(true);
          v.label.setVisible(true);
          this.tweens.add({ targets: v.img, alpha: 1, duration: 400 });
          break;
        }
        case 'armorBroken':
          this.floatText(ENEMY_POS.x, ENEMY_POS.y - 80, 'БРОНЯ РАЗБИТА!', 0xc9b5ff, 30);
          services.audio.play('armor_break');
          services.audio.vibrate(40);
          this.freeze(90);
          this.burst(ENEMY_POS.x, ENEMY_POS.y - 120, 0xc9b5ff, 30);
          break;
        case 'armorBack': this.toast('Броня Стража восстановилась'); break;
        case 'status':
          if (ev.status === 'vulnerable') this.floatText(ENEMY_POS.x, ENEMY_POS.y - 60, 'Уязвим!', COLORS.fire, UI.type.combat);
          if (ev.status === 'defenseOff') this.floatText(ENEMY_POS.x, ENEMY_POS.y - 60, 'Защита снята', COLORS.fire, UI.type.combat);
          break;
        case 'result': services.audio.lowHp = false; services.tutorial.hide(); this.timeScale = 1; this.endCombat(ev.result, ev.time); break;
        default: break;
      }
    }
  }

  onDamage(ev) {
    if (ev.target === 'enemy') {
      const color = SCHOOL_COLOR[ev.school] || 0xffffff;
      const size = ev.tick ? UI.type.small : ev.school === 'auto' ? UI.type.body : UI.type.title;
      const jx = Phaser.Math.Between(-60, 60);
      this.floatText(ENEMY_POS.x + jx, ENEMY_POS.y - this.enemySprite.displayHeight * 0.7, `${ev.amount}`, color, size);
      const a = services.audio;
      if (ev.tick) a.play('burn_tick', { minGap: 300 });
      else if (ev.school === 'auto') a.play('auto_hit');
      else if (ev.school === 'fire') a.play('fire_hit');
      else a.play('enemy_hit');
      if (!ev.tick) {
        this.enemySprite.setTintFill(0xffffff);
        this.time.delayedCall(70, () => this.enemySprite.clearTint());
        this.enemyShake = Math.max(this.enemyShake, ev.school === 'auto' ? 0.35 : 0.9);
        if (ev.school !== 'auto') this.freeze(ev.heavy ? 120 : 60);
      }
      if (ev.school === 'auto') {
        this.heroAnim.playCast('auto');
        const d = this.add.image(HERO_POS.x, HERO_POS.y - 80, 'fx_dot').setTint(0xf1e3c2).setBlendMode('ADD').setDepth(6000);
        this.tweens.add({ targets: d, x: ENEMY_POS.x, y: ENEMY_POS.y - 80, duration: 220, onComplete: () => d.destroy() });
      }
    } else {
      // атака врага: рывок вперёд и удар по героине
      this.tweens.add({ targets: this.enemySprite, y: ENEMY_POS.y + (ev.strong ? 90 : 40), duration: 120, yoyo: true, ease: 'Quad.easeIn' });
      this.floatText(HERO_POS.x + 70, HERO_POS.y - 140, `−${ev.amount}`, COLORS.danger, ev.strong ? 40 : 28);
      this.heroAnim.playHurt(ev.strong);
      this.cameras.main.shake(ev.strong ? 300 : 120, ev.strong ? 0.014 : 0.004);
      if (ev.strong) this.cameras.main.flash(150, 120, 0, 0);
      this.hurtFlash = ev.strong ? 1 : 0.6;
      services.audio.play(ev.strong ? 'strong_hurt' : 'hero_hurt');
      services.audio.vibrate(ev.strong ? [80, 40, 120] : 30);
      if (ev.strong) this.freeze(140);
    }
  }

  onPotionEvent(ev) {
    const p = POTIONS[ev.id];
    if (ev.kind === 'heal') {
      this.floatText(HERO_POS.x - 60, HERO_POS.y - 150, `+${ev.amount}`, 0x7be28a, 36);
      this.burst(HERO_POS.x, HERO_POS.y - 70, 0x7be28a, 26);
    } else if (ev.kind === 'mana') {
      this.floatText(HERO_POS.x - 60, HERO_POS.y - 150, `+${ev.amount}`, COLORS.mana, 36);
      this.burst(HERO_POS.x, HERO_POS.y - 70, COLORS.mana, 26);
    } else {
      // бросок склянки: пламенный росчерк от героини к врагу
      for (let i = 0; i < 8; i++) {
        const d = this.add.image(HERO_POS.x, HERO_POS.y - 80, 'fx_dot').setTint(p.color).setBlendMode('ADD').setScale(1.3 - i * 0.12).setDepth(6000);
        this.tweens.add({ targets: d, x: ENEMY_POS.x, y: ENEMY_POS.y - 80, delay: i * 25, duration: 260, onComplete: () => d.destroy() });
      }
      this.time.delayedCall(280, () => this.burst(ENEMY_POS.x, ENEMY_POS.y - 80, p.color, 30));
    }
    this.toast(p.name, p.color);
  }

  animateObject(ev) {
    const v = this.fieldViews.get(ev.id);
    v.label.setVisible(false);
    if (ev.action === 'shatter') {
      this.burst(v.img.x, v.img.y - 50, 0xc9b5ff, 26);
      this.tweens.add({ targets: v.img, alpha: 0, scaleX: v.img.scaleX * 1.4, scaleY: v.img.scaleY * 1.4, duration: 250, onComplete: () => v.img.setVisible(false) });
      return;
    }
    // бросок Телекинезом: подъём → полёт во врага
    this.tweens.chain({
      targets: v.img,
      tweens: [
        { y: v.img.y - 40, duration: 100 },
        { x: ENEMY_POS.x, y: ENEMY_POS.y - 60, scaleX: v.img.scaleX * 0.8, scaleY: v.img.scaleY * 0.8, duration: 160, ease: 'Quad.easeIn' },
        { alpha: 0, duration: 120 },
      ],
      onComplete: () => v.img.setVisible(false),
    });
    this.time.delayedCall(260, () => services.audio.play('telekinesis_impact', { heavy: ev.heavy }));
    if (ev.heavy) this.time.delayedCall(260, () => this.cameras.main.shake(200, 0.01));
  }

  // ------------------------------------------------------------------ FX
  floatText(x, y, text, color, size = UI.type.combat) {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color: hex(color), stroke: '#000', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(0.5).setDepth(7000);
    t.setScale(1.7);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, delay: 120, duration: 850, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  burst(x, y, color, n = 16) {
    const e = this.add.particles(x, y, 'fx_dot', { speed: { min: 60, max: 220 }, scale: { start: 0.8, end: 0 }, lifespan: 550, tint: color, blendMode: 'ADD', emitting: false }).setDepth(6500);
    e.explode(n);
    this.time.delayedCall(800, () => e.destroy());
  }

  showBanner(text, color) {
    const t = this.add.text(VIEW.width / 2, 640, text, { fontFamily: FONT, fontSize: UI.type.title, align: 'center', wordWrap: { width: 620 }, color: hex(color), stroke: '#000', strokeThickness: 7 }).setOrigin(0.5).setDepth(8000).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 200, yoyo: true, hold: COMBAT.introSec * 800, onComplete: () => t.destroy() });
  }

  toast(text, color) { this.bus.emit(MSG.TOAST, text, color); }

  // ------------------------------------------------------------------ итог
  endCombat(result, time) {
    if (this.ended) return;
    this.ended = true;
    this.warn.setVisible(false);
    const { state, quests } = services;
    const secs = Math.round(time * 10) / 10;
    state.data.stats.combats.push({ enemy: this.enemyType, spawnId: this.spawnId, result, timeSec: secs, interrupts: this.cm.stats.interrupts, uses: this.cm.stats.abilityUses });
    console.info(`[combat] ${this.enemyType} ${result} in ${secs}s`, this.cm.stats);
    state.data.hp = null;

    if (result === 'victory') {
      this.tweens.add({ targets: this.enemySprite, alpha: 0, scaleY: 0.2, duration: 600 });
      services.audio.setMusic(null);
      services.audio.play('victory');
      services.audio.vibrate([40, 40, 80]);
      this.burst(ENEMY_POS.x, ENEMY_POS.y - 80, COLORS.gold, 40);
      state.markEnemyDefeated(this.spawnId);
      const r = state.applyReward(this.def.rewards);
      if (this.spawn.opensPath) state.openPath(this.spawn.opensPath);
      state.save();
      if (this.spawn.defeatEvent) quests.complete(this.spawn.defeatEvent, { spawnId: this.spawnId });
      this.bus.emit(MSG.QUEST_CHANGED);
      this.bus.emit(MSG.HUD_REFRESH);
      const g = r.granted;
      const lines = [`Время боя: ${secs} сек   ·   прерываний: ${this.cm.stats.interrupts}`, '', `+${g.heroXP} опыта героини`];
      for (const [k, v] of Object.entries(g.schoolXP)) lines.push(`+${v} опыта дара «${ABILITIES[k].name}»`);
      for (const [k, v] of Object.entries(g.items)) lines.push(`+${v} ${itemName(k)}`);
      for (const lv of r.levelUps) lines.push('', `★ Новый уровень ${lv.level}! ${lv.note || ''}`);
      this.time.delayedCall(700, () => this.bus.emit(MSG.DIALOG, {
        title: 'Победа!', color: COLORS.gold, text: lines.join('\n'),
        buttons: [{ label: 'Продолжить', primary: true, onClick: () => this.exit('victory') }],
      }));
    } else {
      const lost = Math.min(state.item('coins'), HERO_RECOVERY.coinsLostOnDefeat);
      if (lost) state.removeItem('coins', lost);
      state.save();
      this.heroAnim.playDeath();
      services.audio.setMusic(null);
      services.audio.play('defeat');
      services.audio.vibrate(200);
      this.time.delayedCall(700, () => this.bus.emit(MSG.DIALOG, {
        title: 'Поражение', color: COLORS.danger,
        text: `Ведьма отступает к безопасной тропе.${lost ? `\nПотеряно ${lost} монет.` : ''}\n\nСовет: следите за красным предупреждением и держите Телекинез готовым для прерывания.${this.def.armor ? ' Сначала разбейте кристалл, чтобы снять броню.' : ''}`,
        buttons: [{ label: 'Вернуться', primary: true, onClick: () => this.exit('defeat') }],
      }));
    }
  }

  exit(result) {
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.wake('ExplorationScene', { result, spawnId: this.spawnId });
      this.scene.stop();
    });
  }
}
