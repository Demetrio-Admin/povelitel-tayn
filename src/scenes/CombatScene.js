import Phaser from 'phaser';
import { VIEW, COLORS, DEPTH } from '../config/game.config.js';
import { ENEMY_SPAWNS } from '../config/world.layout.js';
import { COMBAT } from '../config/balance.enemies.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { CombatManager } from '../systems/CombatManager.js';
import { HeroAnimator } from '../systems/HeroAnimator.js';
import { UI } from '../config/ui.config.js';
import { UIBar, drawPlate } from '../ui/widgets.js';
import { applyDisplaySize, itemName } from '../objects/InteractiveObject.js';
import { AbilitySystem } from '../systems/AbilitySystem.js';
import { CombatRecorder, STEP } from '../systems/combatReplay.js';
import { startState } from '../cloud/combatVerify.js';
import { GameState } from '../state/GameState.js';
import { POTIONS, POTION_ORDER, POTION_BATTLE_LIMIT } from '../config/resources.js';
import { CombatTutorial } from '../systems/CombatTutorial.js';
import { STORY, COMBAT_HINTS } from '../config/story.js';
import { VITALS } from '../config/balance.hero.js';
import { currentHero, T, fm } from '../state/hero.js';
import * as vitals from '../state/vitals.js';
import { addButton } from '../ui/widgets.js';

const FONT = UI.font;
const SH = UI.shadow;
const SCHOOL_COLOR = { telekinesis: COLORS.telekinesis, fire: COLORS.fire, seal: COLORS.seal, ice: COLORS.ice, auto: 0xf1e3c2 };
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
    const { state, bus } = services;
    this.bus = bus;
    // v0.14.0: бой идёт на копии героя в том состоянии, которое сервер запомнил при старте боя (combatCtx), — оно же у проверки на сервере.
    // Настоящее состояние игры (сумка, опыт, HP) бой не трогает: итог — HP, мана, зелья, награда — приходит в ответе сервера.
    const ctx = state.data.combatCtx;
    this.sim = ctx ? startState(ctx, state.now()) : Object.assign(new GameState(null, () => state.now()), { data: JSON.parse(JSON.stringify(state.data)) });
    this.cm = new CombatManager({ enemyType: this.enemyType, state: this.sim, abilities: new AbilitySystem(this.sim, null, null) });
    this.rec = new CombatRecorder();   // действия игрока по номеру шага: их сервер проигрывает заново
    this.acc = 0;
    this.def = this.cm.def;
    this.started = false;
    this.ended = false;
    services.mode = 'combat';
    bus.emit(MSG.UI_MODE, 'combat');

    { const v = vitals.view(state); services.telemetry?.track('combat_start', { enemy: this.enemyType, spawn: this.spawnId, lvl: state.data.heroLevel, hp: v.hp, mana: v.mana, tries: state.data.stats.combats.filter(c => c.spawnId === this.spawnId).length + 1 }); }
    this.buildArena();
    this.buildEnemy();
    this.buildHero();
    this.buildFieldObjects();
    this.buildEnemyHud();
    this.buildHurtVignette();
    this.buildPotions();
    // v0.9: пошаговое обучение первого боя и контекстные подсказки (не modal: кнопки боя работают)
    this.tut = new CombatTutorial({ state, settings: services.settings, spawnId: this.spawnId, cm: this.cm });
    this.hintsShown = new Set();
    this.hintQueue = [];
    this.saveT = 0;
    this.buildCoach();
    this.hitstop = 0;
    this.timeScale = 1;
    this.enemyShake = 0;
    this.firstCombat = !state.data.stats.combats.length;

    services.combatSim = this.sim;   // верхняя панель (UIScene) показывает HP/ману боя
    this.registry.set('hudProvider', () => vitals.view(this.sim));   // те же общие запасы, что в мире (CombatManager.commit)
    this.registry.set('abilityProvider', (id) => {
      const st = this.cm.abilityState(id);
      const e = this.cm.enemy;
      const tutTarget = this.tut?.view()?.target;
      st.suggested = id === 'telekinesis' && (tutTarget === 'telekinesis' || (st.state === 'ready' && e.isPreparing));
      return st;
    });

    bus.on(MSG.ABILITY_USE, this.onAbility, this);
    bus.on(MSG.COMBAT_CYCLE, () => { if (this.canAct()) { this.cm.cycleSelection(); this.rec.input('c'); this.processEvents(); } }, this);
    bus.on(MSG.CONTEXT_ACTION, () => this.onAbility('telekinesis'), this);
    this.events.once('shutdown', () => bus.offContext(this));

    this.events.once('shutdown', () => { services.combatSim = null; services.audio.lowHp = false; services.tutorial.hide(); });
    this.cameras.main.fadeIn(350);
    this.showBanner(`Бой: ${this.def.name}`, COLORS.danger);
    const first = !state.data.stats.combats.length;
    this.time.delayedCall(COMBAT.introSec * 1000, () => {
      this.started = true;
      if (this.tut.active) { const r = this.tut.reminder; if (r) this.tut.feedback = { text: r, left: 3 }; }
      else if (first) this.toast('Враг атакует сам. Прерывайте сильные атаки Телекинезом!', COLORS.telekinesis);
      else if (this.def.phases) this.toast('Три фазы: кристалл — Телекинез, кора — Огонь и Астрал, тень — Астрал.', COLORS.seal);
      else if (this.def.armor) this.toast('Броня Стража держится на кристалле. Выберите его и разбейте Телекинезом.', COLORS.telekinesis);
      if (this.sim.item('resin_flask') > 0) this.queueHint(COMBAT_HINTS.flask, 'flask');
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
    this.enemyTint = this.def.tint || null;   // v0.10.0: Страж узла отличается оттенком от Лесного Стража
    if (this.enemyTint) s.setTint(this.enemyTint);
    this.enemyBase = { sx: s.scaleX, sy: s.scaleY };
    this.add.image(ENEMY_POS.x, ENEMY_POS.y - 4, 'hero_shadow').setDisplaySize(s.displayWidth * 0.9, 34).setDepth(ENEMY_POS.y - 1);
    this.idle = this.tweens.add({ targets: s, scaleY: s.scaleY * 1.04, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.prepGlow = this.add.image(ENEMY_POS.x, ENEMY_POS.y - s.displayHeight / 2, 'fx_glow').setTint(COLORS.danger).setBlendMode('ADD').setScale(3).setAlpha(0).setDepth(ENEMY_POS.y + 1);
    this.armorGlow = this.add.image(ENEMY_POS.x, ENEMY_POS.y - s.displayHeight / 2, 'fx_ring').setTint(0x9f8bff).setScale(2.2, 2.6).setAlpha(this.cm.enemy.hasArmor ? 0.6 : 0).setDepth(ENEMY_POS.y + 2);
  }

  buildHero() {
    this.heroShadow = this.add.image(HERO_POS.x, HERO_POS.y - 2, 'hero_shadow').setDepth(HERO_POS.y - 1);
    this.heroSprite = this.add.image(HERO_POS.x, HERO_POS.y, currentHero().textures.up).setOrigin(0.5, 1);   // v0.9.2: выбранный герой this.heroSprite.setScale(144 / this.heroSprite.height); this.heroSprite.setDepth(HERO_POS.y);
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
      hit.on('pointerdown', () => { if (this.canAct()) { this.tut?.beforeSelect(o.id); if (this.cm.selectObject(o.id)) this.rec.input('s', o.id); this.processEvents(); } });
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
    const y = 222;   // под верхним HUD (HP/мана) и левее колонки «Меню»
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
    // v0.19.0: зелий стало семь — видимые раскладываются подряд слева, шаг сжимается, чтобы уместиться в ширину
    const shown = [...this.potionViews.keys()].filter((id) => this.sim.item(id) > 0);
    const step = Math.min(114, (VIEW.width - 120) / Math.max(1, shown.length - 1 || 1));
    for (const [id, v] of this.potionViews) {
      const n = this.sim.item(id);
      for (const o of [v.ring, v.icon, v.badge, v.hit]) o.setVisible(n > 0);
      v.badge.setText(String(n));
      const i = shown.indexOf(id);
      if (i >= 0) { const x = 68 + i * step; v.ring.x = x; v.icon.x = x; v.badge.x = x + 30; v.hit.x = x; }
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
    this.rec.input('p', id);
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
    if (!this.canAct() || this.tut?.step === 'intro') return;   // сначала «Понятно»
    const obj = id === 'telekinesis' ? this.cm.selectedObject() : null;
    this.tut?.beforeAbility(id, this.cm.abilityState(id).state);
    const res = this.cm.useAbility(id);
    if (!res.ok) {
      if (res.reason === 'nomana' && this.sim.item('elixir_mana') > 0 && (this.cm.stats.potions || 0) < POTION_BATTLE_LIMIT) this.queueHint(COMBAT_HINTS.lowMana, 'lowMana');
      const msg = { cooldown: 'Перезарядка…', nomana: 'Не хватает маны', locked: `${ABILITIES[id].name}: дар ещё не изучен`, benched: `${ABILITIES[id].name}: дар не в слоте — выберите слоты в «Дарах» вне боя` }[res.reason];
      if (msg) this.toast(msg);
      services.audio.play('locked');
      return;
    }
    this.rec.input('a', id);
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
      const dt = Math.min(delta, 100) / 1000;
      if (this.hitstop > 0) { this.hitstop -= delta; this.acc = 0; }
      else {
        // v0.14.0: фиксированный шаг STEP (одинаковый на устройстве и на сервере); каждый шаг и пауза врага (обучение) записываются
        this.acc += dt;
        for (let n = 0; this.acc >= STEP && !this.cm.result && n < 12; n++, this.acc -= STEP) {
          const hold = this.tut.holdEnemy();
          this.rec.beforeTick(hold);
          this.cm.tick(STEP, { holdEnemy: hold });
          this.rec.afterTick();
        }
        if (this.acc >= STEP) this.acc = 0;   // кадр сильно запоздал — накопленное не догоняем
      }
      this.tut.tick(dt);
    }
    this.processEvents();
    this.updateHud();
    this.updateCoach();
    this.updateJuice(delta);
  }

  updateHud() {
    const e = this.cm.enemy;
    this.enemyHpBar.setFraction(Math.max(0, e.hp / e.maxHp));
    this.enemyHpText.setText(`${Math.ceil(e.hp)} / ${e.maxHp}`);
    const st = [];
    if (e.hasArmor) st.push(e.armorActive ? `Броня −${Math.round(e.def.armor.value * 100)}%` : `Броня разбита ${e.armorDisabledLeft.toFixed(0)}с`);
    if (e.burning) st.push(`Горение ${e.burn.left.toFixed(0)}с`);
    if (e.inPuddle) st.push(`Лужа смолы ${e.puddle.left.toFixed(0)}с`);
    if (e.slowed) st.push(`Замедлен ${e.slow.left.toFixed(0)}с`);
    if (e.isBrittle) st.push(`Хрупкость ${e.brittle.left.toFixed(0)}с`);
    if (e.vulnerable.left > 0) st.push(`Уязвим +${Math.round(e.vulnerable.bonus * 100)}% ${e.vulnerable.left.toFixed(0)}с`);
    if (e.staggerLeft > 0) st.push('Оглушён');
    if (e.defenseActive) st.push(`Защита −${Math.round(e.def.defense * 100)}%`);
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
    this.fieldHint?.setVisible(!services.tutorial.active && !this.coach?.visible);
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
    const events = this.cm.drainEvents();
    this.tut?.onEvents(events);
    for (const ev of events) {
      switch (ev.type) {
        case 'damage': this.onDamage(ev); break;
        case 'select':   // v0.10.0: тяжёлый камень с Телекинезом I не поднять — коротко объяснить
          if (ev.refused) { services.audio.play('locked'); this.toast('Тяжёлый камень — нужен Телекинез II', COLORS.danger); }
          break;
        case 'warning':
          this.warnTitle.setText(`⚠ ${ev.name}!`);
          this.warnHint.setText(ev.needsHeavy ? 'Выберите тяжёлый камень и нажмите Телекинез' : (ev.hint || ''));
          this.tweens.add({ targets: this.enemySprite, scaleX: this.enemyBase.sx * 1.1, duration: 200, yoyo: true });
          this.tweens.add({ targets: this.warn, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
          services.audio.play('warning');
          services.audio.vibrate(25);
          // v0.9: обучение прерыванию ведёт CombatTutorial (атака удерживается до действия игрока)
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
        case 'chain':   // v0.11.1: Телекинез III — второй бросок без перезарядки
          this.floatText(ENEMY_POS.x - 120, ENEMY_POS.y + 40, 'ЕЩЁ БРОСОК!', COLORS.telekinesis, 28);
          break;
        case 'chill':   // v0.18.0: холод врага — перезарядки и мана идут медленнее
          this.toast(`Холод: перезарядка и мана медленнее на ${Math.round(ev.pct * 100)}% (${ev.sec} с)`, COLORS.ice);
          break;
        case 'manaRescue':   // v0.16.0: Лунный амулет вернул ману
          this.floatText(ENEMY_POS.x + 120, ENEMY_POS.y + 80, `Лунный амулет: +${ev.mana} маны`, COLORS.mana, 26);
          break;
        case 'refund':  // ветка «Повелитель»: удачное прерывание вернуло ману и ускорило перезарядку
          this.floatText(ENEMY_POS.x + 120, ENEMY_POS.y + 40, `+${ev.mana} маны · −${ev.cooldownSec} с`, COLORS.mana, 26);
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
        case 'flash':   // v0.16.0: Астрал III — вспышка снимает броню и кору на время
          this.floatText(ENEMY_POS.x, ENEMY_POS.y - 100, 'ВСПЫШКА!', COLORS.seal, 30);
          this.burst(ENEMY_POS.x, ENEMY_POS.y - 120, COLORS.seal, 24);
          break;
        case 'phase':   // v0.10.0: Страж узла сменил фазу — заметное изменение и короткое сообщение
          // сообщение — между врагом и героиней (не поверх врага и предупреждения сильного удара)
          this.showBanner(`Фаза ${ev.phase}\n${ev.message}`, ev.phase === 3 ? COLORS.seal : COLORS.fire, 2600, UI.type.combat);
          if (ev.tint) { this.enemyTint = ev.tint; this.enemySprite.setTint(ev.tint); }
          this.burst(ENEMY_POS.x, ENEMY_POS.y - this.enemySprite.displayHeight * 0.5, ev.tint || 0xffffff, 40);
          this.cameras.main.shake(260, 0.01);
          services.audio.play('armor_break');
          services.audio.vibrate([40, 30, 60]);
          break;
        case 'status':
          if (ev.status === 'vulnerable') this.floatText(ENEMY_POS.x, ENEMY_POS.y - 60, 'Уязвим!', COLORS.fire, UI.type.combat);
          if (ev.status === 'slow') this.floatText(ENEMY_POS.x + 80, ENEMY_POS.y + 30, 'Замедлен', COLORS.ice, UI.type.combat);
          if (ev.status === 'brittle') this.floatText(ENEMY_POS.x - 80, ENEMY_POS.y - 30, 'Хрупкость', COLORS.ice, UI.type.combat);
          if (ev.status === 'shatter') { this.floatText(ENEMY_POS.x, ENEMY_POS.y - 110, 'РАСКОЛ!', COLORS.ice, 30); this.burst(ENEMY_POS.x, ENEMY_POS.y - 100, COLORS.ice, 26); }
          if (ev.status === 'puddle') this.floatText(ENEMY_POS.x - 80, ENEMY_POS.y + 30, 'Лужа смолы', COLORS.fire, UI.type.combat);
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
        this.time.delayedCall(70, () => { if (this.enemyTint) this.enemySprite.setTint(this.enemyTint); else this.enemySprite.clearTint(); });
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
      this.queueHint(COMBAT_HINTS.firstDamage, 'firstDamage');
      const h = this.cm.hero;
      if (h.hp > 0 && h.hp < h.maxHp * VITALS.combatLowHpHint && this.sim.item('elixir_life') > 0 && (this.cm.stats.potions || 0) < POTION_BATTLE_LIMIT) this.queueHint(COMBAT_HINTS.lowHp, 'lowHp');
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
    } else if (ev.kind === 'warm' || ev.kind === 'guard') {   // v0.19.0: на себя — свечение вокруг героя
      this.burst(HERO_POS.x, HERO_POS.y - 70, p.color, 30);
      this.floatText(HERO_POS.x - 60, HERO_POS.y - 150, ev.kind === 'warm' ? 'Тепло' : `Защита ${ev.sec} с`, p.color, 30);
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

  showBanner(text, color, holdMs = COMBAT.introSec * 800, fontSize = UI.type.title) {
    const t = this.add.text(VIEW.width / 2, 640, text, { fontFamily: FONT, fontSize, align: 'center', wordWrap: { width: 620 }, color: hex(color), stroke: '#000', strokeThickness: 7 }).setOrigin(0.5).setDepth(8000).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 200, yoyo: true, hold: holdMs, onComplete: () => t.destroy() });
  }

  toast(text, color) { this.bus.emit(MSG.TOAST, text, color); }

  // ------------------------------------------------------------------ v0.9: панель обучения и подсказок боя
  /** Подсказка из очереди (по важности). key — один раз за бой; hint.id — один раз на персонажа. */
  queueHint(hint, key) {
    if (!hint || this.hintsShown.has(key) || services.settings?.get('hints') === false) return;
    if (hint.id && (services.state.data.tutorial || []).includes(hint.id)) return;
    this.hintsShown.add(key);
    if (hint.id) { services.state.data.tutorial.push(hint.id); }
    if (key === 'firstDamage') this.bus.emit(MSG.HUD_HIGHLIGHT, 'hp');
    this.hintQueue.push({ text: T(hint.text), key, left: 4.2 });
    this.hintQueue.sort((a, b) => (a.key === 'lowHp' ? -1 : 0) - (b.key === 'lowHp' ? -1 : 0));
  }

  buildCoach() {
    this.coach = this.add.container(VIEW.width / 2, 872).setDepth(7400).setVisible(false);
    this.coachBg = this.add.graphics();
    this.coachText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: UI.type.body, color: '#e9fffb', align: 'center', wordWrap: { width: 600 }, lineSpacing: 3, shadow: SH }).setOrigin(0.5);
    this.coach.add([this.coachBg, this.coachText]);
    this.coachButtons = [];
    this.coachKey = '';
  }

  /** Что показать в панели: шаг обучения → ошибка игрока → контекстная подсказка. */
  coachState() {
    const t = this.tut.view();
    const fb = this.tut.feedback;
    if (t && t.step === 'intro') return { key: 'intro', text: t.text, buttons: ['ok', 'skip'], accent: COLORS.telekinesis };
    if (fb) return { key: 'fb:' + fb.text, text: fb.text, buttons: t ? ['skip'] : [], accent: COLORS.gold };
    if (t) return { key: t.step + ':' + t.text, text: t.text, buttons: t.step === 'confirm' ? [] : ['skip'], accent: t.step === 'confirm' ? 0x7be28a : COLORS.telekinesis };
    const h = this.hintQueue[0];
    if (h) return { key: 'hint:' + h.key, text: h.text, buttons: [], accent: COLORS.gold };
    return null;
  }

  updateCoach() {
    if (!this.coach || this.ended) return;
    const dt = this.game.loop.delta / 1000;
    const st = this.started && !services.modalOpen ? this.coachState() : null;
    if (st?.key.startsWith('hint:')) { this.hintQueue[0].left -= dt; if (this.hintQueue[0].left <= 0) this.hintQueue.shift(); }
    const key = st ? st.key : '';
    if (key !== this.coachKey) {
      this.coachKey = key;
      this.coachButtons.forEach(b => b.destroy()); this.coachButtons = [];
      if (!st) { this.coach.setVisible(false); }
      else {
        this.coachText.setText(st.text);
        const bh = st.buttons.length ? UI.touch.button + 18 : 0;
        const w = 660, h = this.coachText.height + 36 + bh;
        drawPlate(this.coachBg, w, h, { accent: st.accent, fill: 0x0e1a1c, alpha: 0.93 });
        this.coachText.setY(-h / 2 + 18 + this.coachText.height / 2);
        const by = this.coach.y + h / 2 - UI.touch.button / 2 - 14;
        const defs = st.buttons.map(b => (b === 'ok'
          ? { label: 'Понятно', primary: true, w: 220, on: () => { if (this.tut.confirmIntro()) services.audio.play('ui_click'); } }
          : { label: 'Пропустить обучение', primary: false, w: 330, on: () => { this.tut.skip(); services.audio.play('ui_back'); } }));
        const total = defs.reduce((a, d) => a + d.w, 0) + (defs.length - 1) * 20;
        let x = VIEW.width / 2 - total / 2;
        for (const d of defs) {
          const btn = addButton(this, x + d.w / 2, by, d.w, UI.touch.button, d.label, { primary: d.primary, accent: d.primary ? COLORS.telekinesis : null, fontSize: UI.type.small, depth: 7450, onPress: d.on });
          this.coachButtons.push(btn);
          x += d.w + 20;
        }
        this.coach.setVisible(true);
      }
    }
    // подсветка цели обучения: бросаемые предметы поля
    const target = this.tut.view()?.target;
    for (const o of this.cm.fieldObjects) {
      const v = this.fieldViews.get(o.id);
      if (target === 'object' && o.available && o.def.throwable && o.id !== this.cm.selectedId) v.ring.setAlpha(0.45 + Math.sin(this.time.now / 160) * 0.35).setTint(0xffe08a);
      else if (o.id !== this.cm.selectedId) v.ring.setTint(COLORS.telekinesis);
    }
    // подсветка зелья при подсказке
    const hk = this.hintQueue[0]?.key;
    for (const [id, v] of this.potionViews) {
      const on = (hk === 'lowHp' && id === 'elixir_life') || (hk === 'lowMana' && id === 'elixir_mana') || (hk === 'flask' && id === 'resin_flask');
      v.ring.setScale(on ? 1 + Math.sin(this.time.now / 140) * 0.12 : 1);
    }
  }

  // ------------------------------------------------------------------ итог
  /**
   * Бой закончился на экране. v0.14.0: исход решает сервер — запись действий проигрывается там заново тем же движком,
   * а награда, потери, HP и мана приходят в ответе. Экран показывает то, что сказал сервер (он может не согласиться с устройством).
   */
  endCombat(result, time) {
    if (this.ended) return;
    this.ended = true;
    this.warn.setVisible(false);
    const { state } = services;
    const secs = Math.round(time * 10) / 10;
    console.info(`[combat] ${this.enemyType} ${result} in ${secs}s`, this.cm.stats);
    { const h = this.cm.hero; services.telemetry?.track('combat_end', { enemy: this.enemyType, spawn: this.spawnId, result, sec: secs, hp: Math.ceil(h.hp), mana: Math.floor(h.mana), intr: this.cm.stats.interrupts, lvl: state.data.heroLevel }); }
    this.coach?.setVisible(false);
    this.settled = this.settleServer(this.rec.toJSON());

    if (result === 'victory') {
      this.tweens.add({ targets: this.enemySprite, alpha: 0, scaleY: 0.2, duration: 600 });
      services.audio.setMusic(null);
      services.audio.play('victory');
      services.audio.vibrate([40, 40, 80]);
      this.burst(ENEMY_POS.x, ENEMY_POS.y - 80, COLORS.gold, 40);
    } else {
      this.heroAnim.playDeath();
      services.audio.setMusic(null);
      services.audio.play('defeat');
      services.audio.vibrate(200);
    }
    const slow = this.time.delayedCall(2200, () => this.toast('Сверяем итог боя с сервером…'));
    this.time.delayedCall(700, async () => {
      const r = await this.settled;
      slow.remove(false);
      this.showOutcome(r, secs);
    });
  }

  /** Окно итога по ответу сервера r (см. PlayerActions.combatSubmit). */
  showOutcome(r, clientSecs) {
    const { state } = services;
    const out = r?.ok ? r.verdict?.outcome : null;
    const secs = r?.verdict?.entry?.timeSec ?? clientSecs;
    const v = vitals.view(state);   // уже по ответу сервера
    const g = r?.verdict?.reward || {};
    if (out === 'victory') {
      const lines = [STORY.victory, `Мана: ${v.mana} / ${v.maxMana}`, '', `Время боя: ${secs} сек   ·   прерываний: ${this.cm.stats.interrupts}`, ''];
      if (g.heroXP) lines.push(T(fm(`+${g.heroXP} опыта героини`, `+${g.heroXP} опыта героя`)));
      for (const [k, n] of Object.entries(g.schoolXP || {})) lines.push(`+${n} опыта дара «${ABILITIES[k].name}»`);
      for (const [k, n] of Object.entries(g.items || {})) lines.push(`+${n} ${itemName(k)}`);
      for (const lv of r.outcome?.levelUps || []) lines.push('', `★ Новый уровень ${lv.level}! ${lv.note || ''}`);
      this.bus.emit(MSG.DIALOG, {
        title: 'Победа!', color: COLORS.gold, text: lines.join('\n'),
        buttons: [{ label: 'Продолжить', primary: true, onClick: () => this.exit('victory') }],
      });
    } else if (out === 'defeat') {
      const lost = r.verdict.coinsLost || 0;
      this.bus.emit(MSG.DIALOG, {
        title: 'Поражение', color: COLORS.danger,
        text: `${STORY.defeat}\n\nЗдоровье: ${v.hp} / ${v.maxHp}   ·   мана: ${v.mana} / ${v.maxMana}${lost ? `\nПотеряно монет: ${lost}.` : ''}\n\n${STORY.retryHint}\nСовет: следите за красным предупреждением и держите Телекинез готовым для прерывания.${this.def.phases ? ' Кристалл снимает броню, Огонь выжигает кору, а в третьей фазе тень пробивает только Астрал; сильный удар прерывает Телекинез.' : this.def.armor ? ' Сначала разбейте кристалл, чтобы снять броню.' : ''}`,
        buttons: [{ label: 'Вернуться', primary: true, onClick: () => this.exit('defeat') }],
      });
    } else {
      // сервер не засчитал бой (нет связи, запись отклонена, функция не развёрнута): награды нет, герой отступает
      const why = r?.reason === 'network' ? 'Нет связи с сервером, итог боя не удалось подтвердить.'
        : r?.reason === 'server' ? 'Сервер проверки боя сейчас недоступен.'
        : out === 'retreat' ? 'Бой не был доведён до конца.' : 'Сервер не принял запись этого боя.';
      console.error('[combat] бой не засчитан', r);
      services.actions?.combatEnd('retreat')?.catch(() => {});
      this.bus.emit(MSG.DIALOG, {
        title: 'Бой не засчитан', color: COLORS.danger,
        text: `${why}\n\nНаграда не выдана, зелья не потрачены. Попробуйте ещё раз.`,
        buttons: [{ label: 'Вернуться', primary: true, onClick: () => this.exit('defeat') }],
      });
    }
  }

  /**
   * v0.14.0: отправить серверу запись боя (Edge Function combat). Нет связи — повторяем, пока не получится (кнопка итога ждёт);
   * сервер временно недоступен — несколько попыток. Отказ по существу (запись не принята) повтором не лечится.
   */
  async settleServer(log) {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    let hiccups = 0;
    for (let i = 0; i < 60; i++) {
      const r = await services.actions.combatSubmit(log, this.spawnId);
      if (r.reason === 'busy') { await wait(250); continue; }
      if (r.reason === 'network') { await wait(1500); continue; }
      if (r.reason === 'server' && hiccups++ < 4) { await wait(2000); continue; }
      return r;
    }
    return { ok: false, reason: 'network' };
  }

  exit(result) {
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.wake('ExplorationScene', { result, spawnId: this.spawnId });
      this.scene.stop();
    });
  }
}
