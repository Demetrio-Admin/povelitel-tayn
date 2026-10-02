import Phaser from 'phaser';
import { VIEW, COLORS, CONTROLS } from '../config/game.config.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { ENEMIES } from '../config/balance.enemies.js';
import { UPGRADES, TIMER_MODE, ITEMS } from '../config/balance.progression.js';
import { MSG } from '../state/EventBus.js';
import { services, resetProgress, reloadToMenu } from '../services.js';
import { showProfile } from '../ui/accountUI.js';
import { shortNick } from '../cloud/nickname.js';
import { InputController } from '../systems/InputController.js';
import { ABILITY_ORDER } from '../systems/AbilitySystem.js';
import { itemName, ROMAN } from '../objects/InteractiveObject.js';
import { buildSettingsPanel } from '../ui/SettingsPanel.js';
import { UI } from '../config/ui.config.js';
import { addPanel, addDivider, addOrb, setOrb, addBottomBar, addScreenVignette, addMedallion, addButton, drawPlate, releaseTexture, UIBar } from '../ui/widgets.js';
import { addScrollViewport } from '../ui/scrollViewport.js';
import { windows08 } from '../ui/windows08.js';

const FONT = UI.font;
const SH = UI.shadow;
const W = VIEW.width;
const H = VIEW.height;
const BAR_Y = 1096;          // верх нижней панели
const BTN_Y = 1170;
const BTN_R = 58;
const hex = c => '#' + c.toString(16).padStart(6, '0');
const fmtTime = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * UIScene — всегда поверх игровых сцен. Quest panel, HP/мана/ресурсы, панель даров,
 * кнопка действия, плавающий джойстик, тосты и модальные окна (диалоги, изучение, сумка).
 * Данные берёт из GameState и из provider-функций активной сцены (registry: hudProvider, abilityProvider).
 */
export class UIScene extends Phaser.Scene {
  constructor() { super('UIScene'); }

  create() {
    const { bus } = services;
    this.bus = bus;
    this.mode = 'exploration';
    this.modal = null;
    this.modalQueue = [];
    this.toasts = [];
    this.touch = null;
    this.hudTimer = 0;

    this.buildVignette();
    this.buildQuestPanel();
    this.buildStatsPanel();
    this.buildBottomBar();
    this.buildContextButton();
    this.buildJoystick();
    this.buildPauseButton();
    this.buildTutorial();
    this.buildV08Hud();

    this.controls = new InputController(this, bus, services.input, {
      isModal: () => !!this.modal,
      onModalPrimary: () => this.pressModalButton(true),
      onEscape: () => (this.modal ? this.pressModalButton(false) : this.openPause()),
      onDebug: () => { if (services.debug) { services.abilities.update(true); this.toast('[debug] изучение завершено'); } },
    });
    this.setupPointer();

    bus.on(MSG.TOAST, this.toast, this);
    bus.on(MSG.DIALOG, this.openModal, this);
    bus.on(MSG.QUEST_CHANGED, this.refreshQuest, this);
    bus.on(MSG.HUD_REFRESH, this.refreshHud, this);
    bus.on(MSG.ZONE_CHANGED, this.onZone, this);
    bus.on(MSG.FOCUS_CHANGED, this.onFocus, this);
    bus.on(MSG.UI_MODE, this.setMode, this);
    bus.on(MSG.OPEN_UPGRADE, this.openUpgrade, this);
    bus.on(MSG.OPEN_BAG, this.openBag, this);
    bus.on(MSG.REWARD, this.onReward, this);
    bus.on(MSG.RESEARCH_DONE, this.onResearchDone, this);
    bus.on(MSG.FINAL_SCREEN, this.openFinal, this);
    bus.on(MSG.WORLD_EVENT, this.onWorldEvent, this);
    bus.on(MSG.TUTORIAL, this.onTutorial, this);
    bus.on(MSG.OPEN_PAUSE, this.openPause, this);
    bus.on(MSG.CONTEXT_ACTION, () => { const t = services.tutorial; t.complete('interact'); if (this.focusInfo?.ability === 'telekinesis') t.complete('telekinesis'); }, this);
    bus.on(MSG.ABILITY_USE, (id) => { if (this.mode === 'exploration' && (id === 'telekinesis' || id === 'fire')) services.tutorial.complete(id); }, this);
    const offAcc = services.session?.onChange((r) => { if (r === 'saving' || r === 'profile' || r === 'registered') this.refreshHud(); });
    this.events.once('shutdown', () => { bus.offContext(this); offAcc?.(); });

    this.refreshQuest();
    this.refreshHud();
    services.audio.setMusic(services.mode === 'combat' ? 'combat' : 'explore');
    this.moveT = 0;
    if (services.tutorial.canShow('move')) this.time.delayedCall(1200, () => { if (this.mode === 'exploration') services.tutorial.show('move'); });
  }

  onWorldEvent(key) {
    const { audio, tutorial } = services;
    if (key === 'fire_required_01') this.flashButton('fire');
    if (['unlock_telekinesis_1', 'unlock_fire_1', 'lunar_quest_complete', 'telekinesis_2_complete'].includes(key)) {
      audio.play('unlock_magic');
      audio.vibrate([30, 40, 30]);
    }
    if (key === 'unlock_fire_1') this.time.delayedCall(900, () => tutorial.show('fire'));
  }

  // ================================================================== построение
  buildVignette() {
    addScreenVignette(this, W, H, 0.55).setDepth(-5);
  }

  buildQuestPanel() {
    this.questPanel = this.add.container(0, 0);
    this.questBg = this.add.graphics();
    this.zoneText = this.add.text(32, 132, '', { fontFamily: FONT, fontSize: UI.type.heading, fontStyle: 'bold', color: COLORS.textGold, shadow: SH, wordWrap: { width: 540 } });
    this.questRule = addDivider(this, 330, 174, 590);
    this.objText = this.add.text(32, 188, '', { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.text, wordWrap: { width: 580 }, lineSpacing: 2, shadow: SH });
    this.researchText = this.add.text(32, 300, '', { fontFamily: FONT, fontSize: UI.type.small, color: hex(COLORS.telekinesis), wordWrap: { width: 610 }, stroke: '#000', strokeThickness: 4 });
    this.questPanel.add([this.questBg, this.zoneText, this.questRule, this.objText]);
  }

  layoutQuestPanel() {
    if (!this.sideLine) return;
    // Full-width objective lets larger type wrap naturally without a tall narrow column.
    const sideY = this.objText.y + this.objText.height + 8;
    this.sideLine.setY(sideY);
    this.questBottom = sideY + (this.sideLine.text ? this.sideLine.height + 8 : 0) + 10;
    drawPlate(this.questBg, 692, this.questBottom - 122, { accent: 0xe8c56a });
    this.questBg.setPosition(W / 2, (122 + this.questBottom) / 2);
    this.questHit.setSize(692, this.questBottom - 122);
    this.layoutHint();
  }

  layoutHint() {
    const h = this.hintText?.height + 24 || 0;
    if (this.hintPlate?.visible) this.hintPlate.setPosition(W / 2, this.questBottom + 10 + h / 2);
    this.researchText.setY(this.questBottom + (this.hintPlate?.visible ? h + 20 : 12));
  }

  buildStatsPanel() {
    addPanel(this, 14, 14, 692, 96, { seed: 9 });
    addMedallion(this, 54, 54, 62);
    this.levelText = this.add.text(96, 24, '', { fontFamily: FONT, fontSize: UI.type.small, fontStyle: 'bold', color: COLORS.textGold, shadow: SH });
    this.syncDot = this.add.circle(286, 30, 6, 0x5fd68a).setStrokeStyle(1, 0x000000, 0.8).setVisible(false);
    this.xpBar = new UIBar(this, 96, 62, 190, 10, 'xp');
    this.hpBar = new UIBar(this, 318, 64, 172, 34, 'hp');
    this.manaBar = new UIBar(this, 514, 64, 172, 34, 'mana');
    for (const [x, text] of [[404, 'Здоровье'], [600, 'Мана']]) this.add.text(x, 22, text, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH }).setOrigin(0.5, 0);
    const barText = x => this.add.text(x, 64, '', { fontFamily: FONT, fontSize: UI.type.small, color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    this.hpText = barText(404);
    this.manaText = barText(600);
    this.add.image(104, 89, 'icon_coin').setDisplaySize(28, 28);
    this.coinText = this.add.text(124, 89, '0', { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH }).setOrigin(0, 0.5);
    this.add.image(224, 89, 'icon_shard').setDisplaySize(28, 28);
    this.shardText = this.add.text(244, 89, '0', { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH }).setOrigin(0, 0.5);
  }

  buildBottomBar() {
    const xs = [100, 260, 420, 610];
    addBottomBar(this, BAR_Y, W, H - BAR_Y, [(xs[0] + xs[1]) / 2, (xs[1] + xs[2]) / 2, (xs[2] + xs[3]) / 2 - 8]);
    this.buttons = {};
    ABILITY_ORDER.forEach((id, i) => { this.buttons[id] = this.makeButton(xs[i], BTN_Y, `icon_${id}`, ABILITIES[id].name, COLORS[ABILITIES[id].color], () => this.bus.emit(MSG.ABILITY_USE, id)); });
    this.buttons.bag = this.makeButton(xs[3], BTN_Y, 'icon_bag', 'Сумка', COLORS.gold, () => this.bus.emit(MSG.OPEN_BAG));
  }

  makeButton(x, y, iconKey, label, color, onPress) {
    const glow = this.add.image(x, y, 'fx_glow').setTint(color).setBlendMode('ADD').setScale(1.5).setAlpha(0);
    const orb = addOrb(this, x, y, UI.orb.ability, color);
    const bg = this.add.zone(x, y, BTN_R * 2, BTN_R * 2);   // зона нажатия (прозрачная)
    const icon = this.add.image(x, y, iconKey).setScale(1.25);
    const cd = this.add.graphics();
    const cdText = this.add.text(x, y, '', { fontFamily: FONT, fontSize: UI.type.body, color: '#fff', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    const lock = this.add.image(x + 34, y - 34, 'icon_lock').setScale(0.42).setVisible(false);
    const text = this.add.text(x, y + BTN_R + 10, label, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH, wordWrap: { width: 156 }, align: 'center' }).setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      if (this.modal) return;
      services.audio.play('ui_click');
      this.tweens.add({ targets: [orb, icon], scale: '*=0.92', duration: 70, yoyo: true });
      onPress();
    });
    return { x, y, glow, orb, bg, icon, cd, cdText, lock, text, color, baseIconScale: 1.25 };
  }

  buildContextButton() {
    const x = 610, y = 978;
    this.ctx = this.add.container(x, y).setVisible(false);
    this.ctxGlow = this.add.image(0, 0, 'fx_glow').setBlendMode('ADD').setScale(1.4).setAlpha(0.6);
    this.ctxBg = addOrb(this, 0, 0, UI.orb.context, COLORS.gold);
    this.ctxIcon = this.add.image(0, -4, 'icon_hand').setScale(0.95);
    this.ctxLabel = this.add.text(0, 70, '', { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    this.ctx.add([this.ctxGlow, this.ctxBg, this.ctxIcon, this.ctxLabel]);
    this.ctxBg.setInteractive({ useHandCursor: true });
    this.ctxBg.on('pointerdown', () => { if (!this.modal) this.bus.emit(MSG.CONTEXT_ACTION); });
  }

  buildJoystick() {
    this.joyBase = this.add.circle(0, 0, CONTROLS.joystickRadius, 0xffffff, 0.08).setStrokeStyle(3, COLORS.gold, 0.5).setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 30, COLORS.gold, 0.45).setVisible(false);
  }

  // ================================================================== ввод (джойстик и тапы)
  setupPointer() {
    const joy = services.input.joy;
    this.input.on('pointerdown', (p, over) => {
      if (this.modal || over.length || this.mode !== 'exploration' || p.y > BAR_Y) return;
      this.touch = { id: p.id, x: p.x, y: p.y, t: this.time.now, moved: false };
    });
    this.input.on('pointermove', (p) => {
      const t = this.touch;
      if (!t || p.id !== t.id || !p.isDown) return;
      const dx = p.x - t.x, dy = p.y - t.y;
      const d = Math.hypot(dx, dy);
      if (!t.moved && d > CONTROLS.tapMaxMove) {
        t.moved = true;
        this.joyBase.setPosition(t.x, t.y).setVisible(true);
        this.joyKnob.setVisible(true);
      }
      if (!t.moved) return;
      const r = CONTROLS.joystickRadius;
      const k = d > r ? r / d : 1;
      this.joyKnob.setPosition(t.x + dx * k, t.y + dy * k);
      if (d < CONTROLS.joystickDeadzone) { joy.x = 0; joy.y = 0; } else { joy.x = (dx * k) / r; joy.y = (dy * k) / r; }
    });
    const end = (p) => {
      const t = this.touch;
      if (!t || p.id !== t.id) return;
      if (!t.moved && this.time.now - t.t <= CONTROLS.tapMaxMs) this.bus.emit(MSG.WORLD_TAP, { x: p.x, y: p.y });
      this.touch = null;
      joy.x = 0; joy.y = 0;
      this.joyBase.setVisible(false); this.joyKnob.setVisible(false);
    };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);
  }

  resetJoystick() {
    this.touch = null;
    services.input.joy.x = 0; services.input.joy.y = 0;
    this.joyBase.setVisible(false); this.joyKnob.setVisible(false);
  }

  // ================================================================== обновление
  setMode(mode) {
    this.mode = mode;
    if (mode === 'combat') {
      this.toasts.forEach(t => t.destroy());
      this.toasts = []; // exploration notifications must not follow the player into battle
    }
    this.resetJoystick();
    this.ctx.setVisible(false);
    this.buttons.bag.bg.disableInteractive();
    if (mode === 'exploration') this.buttons.bag.bg.setInteractive({ useHandCursor: true });
    this.buttons.bag.orb.setAlpha(mode === 'exploration' ? 1 : 0.4);
    this.buttons.bag.icon.setAlpha(mode === 'exploration' ? 1 : 0.4);
    this.pauseBtn?.setVisible(true);
    const { audio, tutorial } = services;
    audio.setMusic(mode === 'combat' ? 'combat' : 'explore');
    if (mode !== 'combat') audio.lowHp = false;
    if (tutorial.active && (mode === 'combat') !== (tutorial.active === 'combat_warning')) tutorial.hide();
    if (mode === 'exploration' && services.state.data.stats.combats.length && tutorial.canShow('bag')) {
      this.time.delayedCall(2500, () => { if (this.mode === 'exploration' && !tutorial.active) tutorial.show('bag'); });
    }
    this.refreshQuest();
  }

  onZone(zone) {
    if (this.zoneName && this.zoneName !== zone.name) services.audio.play('zone');
    this.zoneName = zone.name;
    this.refreshQuest();
    const t = this.add.text(W / 2, 420, zone.name, { fontFamily: FONT, fontSize: UI.type.title, color: COLORS.textGold, stroke: '#000', strokeThickness: 7 }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 1200, onComplete: () => t.destroy() });
  }

  refreshQuest() {
    const q = services.quests;
    const prev = this.objText.text;
    this.questPanel.setVisible(this.mode !== 'combat');
    this.questHit?.setVisible(this.mode !== 'combat');
    this.hintPlate?.setVisible(this.mode !== 'combat' && !!this.hintText?.text);
    this.zoneText.setText(this.mode === 'combat' ? 'Бой' : (this.zoneName || 'Шепчущий лес'));
    const text = this.mode === 'combat' ? 'Прерывайте сильные атаки и победите врага' : q.objectiveText();
    this.objText.setText(text);
    this.refreshV08Hud();
    this.layoutQuestPanel();
    if (prev && prev !== text && this.mode !== 'combat') {
      this.objText.setColor(COLORS.textGold);
      services.audio.play('quest_update', { minGap: 600 });
      this.tweens.add({ targets: this.questPanel, x: { from: -8, to: 0 }, duration: 260, ease: 'Back.easeOut' });
      this.time.delayedCall(900, () => this.objText.setColor(COLORS.text));
    }
  }

  refreshHud() {
    const s = services.state;
    const hs = s.heroStats();
    const next = s.nextLevelXP();
    const cur = s.levelRow().xp;
    const ses = services.session;
    const nick = ses?.registered ? shortNick(ses.nickname, 6) + ' · ' : '';
    this.levelText.setText(`${nick}Ур. ${s.data.heroLevel}`);
    if (this.syncDot) {
      const st = ses?.ready ? ses.saving : null;
      this.syncDot.setVisible(!!st).setFillStyle(st === 'saved' ? 0x5fd68a : st === 'offline' ? 0xff6a5a : 0xe8c56a);
    }
    this.xpBar.width = this.xpBar.fullWidth * (next ? Math.min(1, (s.data.heroXP - cur) / (next - cur)) : 1);
    this.coinText.setText(String(s.item('coins')));
    this.shardText.setText(String(s.item('lunar_shard')));
    this.lastHs = hs;
  }

  onFocus(info) {
    this.focusInfo = info;
    if (!info || this.mode !== 'exploration') { this.ctx.setVisible(false); return; }
    this.ctx.setVisible(true);
    this.ctxIcon.setTexture(info.icon);
    setOrb(this.ctxBg, this, info.color, UI.orb.context, false);
    this.ctxGlow.setTint(info.color);
    this.ctxLabel.setText(info.label);
    this.ctx.setScale(0.6);
    this.tweens.add({ targets: this.ctx, scale: 1, duration: 160, ease: 'Back.easeOut' });
    const t = services.tutorial;
    if (info.ability === 'telekinesis' && services.abilities.isUnlocked('telekinesis')) t.show('telekinesis');
    else if (!info.ability) t.show('interact');
  }

  flashButton(id) {
    const b = this.buttons[id];
    if (!b) return;
    this.tweens.add({ targets: b.glow, alpha: { from: 0.9, to: 0 }, duration: 500, repeat: 2 });
  }

  update(time, delta) {
    services.abilities.update();
    this.controls.update();
    if (this.modal) { services.input.move.x = 0; services.input.move.y = 0; }

    // HP / мана из активной сцены
    const hud = this.registry.get('hudProvider')?.();
    if (hud) {
      this.hpBar.width = this.hpBar.fullWidth * Math.max(0, hud.hp / hud.maxHp);
      this.manaBar.width = this.manaBar.fullWidth * Math.max(0, hud.mana / hud.maxMana);
      this.hudTimer -= delta;
      if (this.hudTimer <= 0) {
        this.hudTimer = 100;
        this.hpText.setText(`${Math.ceil(hud.hp)} / ${hud.maxHp}`);
        this.manaText.setText(`${Math.floor(hud.mana)} / ${hud.maxMana}`);
        const r = services.state.data.research;
        this.researchText.setText(r ? `✦ Изучение «${UPGRADES[r.upgradeId].title}»: ${fmtTime(services.state.researchRemainingMs())}` : '');
      }
    }

    // кнопки даров
    const prov = this.registry.get('abilityProvider');
    for (const id of ABILITY_ORDER) {
      const b = this.buttons[id];
      const st = prov ? prov(id) : { state: 'locked' };
      const locked = st.state === 'locked';
      b.lock.setVisible(locked);
      b.icon.setAlpha(locked ? 0.3 : st.state === 'nomana' ? 0.45 : 1);
      setOrb(b.orb, this, b.color, UI.orb.ability, locked);
      b.text.setText(locked ? ABILITIES[id].name : services.abilities.label(id));
      b.cd.clear();
      if (st.state === 'cooldown') {
        b.cd.fillStyle(0x000000, 0.6).slice(b.x, b.y, BTN_R - 3, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * st.cdFrac), false).fillPath();
        b.cdText.setText(st.cdLeft.toFixed(st.cdLeft < 1 ? 1 : 0));
      } else b.cdText.setText('');
      if (st.suggested) b.glow.setAlpha(0.45 + Math.sin(time / 140) * 0.25);
      else if (!b.glow.isTweening) b.glow.setAlpha(Math.max(0, b.glow.alpha - 0.05));
    }
    if (this.ctx.visible) this.ctxGlow.setAlpha(0.45 + Math.sin(time / 200) * 0.2);
    this.updateTutorial(time, delta);
    this.updateDialogue(delta);

    // тосты
    const baseY = Math.max(360, (this.questBottom || 260) + 60);
    let toastY = baseY;
    this.toasts.forEach(t => {
      const targetY = this.mode === 'combat' ? 440 + t.toastHeight / 2 : toastY;
      t.y += (targetY - t.y) * 0.25; toastY += t.toastHeight + 12;
    });
  }

  // ================================================================== тосты и награды
  toast(text, color = 0xf1e3c2) {
    // одинаковый тост подряд (фокус + нажатие) не дублируем
    const now = this.time.now;
    if (this.lastToast && this.lastToast.text === text && now - this.lastToast.t < 1500) return;
    this.lastToast = { text, t: now };
    const label = this.add.text(0, 0, text, { fontFamily: FONT, fontSize: UI.type.body, color: hex(color), align: 'center', wordWrap: { width: 600 }, shadow: SH }).setOrigin(0.5);
    if (this.mode === 'combat') {
      this.toasts.forEach(t => t.destroy());
      this.toasts = []; // one readable notification below the warning, never over the potion lane
    }
    const y = this.mode === 'combat' ? 440 + (label.height + 24) / 2 : Math.max(360, (this.questBottom || 260) + 60) + this.toasts.reduce((sum, t) => sum + t.toastHeight + 12, 0);
    const bg = drawPlate(this.add.graphics(), Math.min(660, label.width + 48), label.height + 24, { accent: color, fill: 0x120d0b, alpha: 0.9 });
    const c = this.add.container(W / 2, y, [bg, label]).setDepth(9000).setAlpha(0);
    c.toastHeight = label.height + 24;
    this.toasts.push(c);
    if (this.toasts.length > 4) this.dropToast(this.toasts[0]);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });
    this.time.delayedCall(2600 + text.length * 25, () => this.dropToast(c));
  }

  dropToast(c) {
    if (!this.toasts.includes(c)) return;
    this.toasts = this.toasts.filter(t => t !== c);
    this.tweens.add({ targets: c, alpha: 0, duration: 250, onComplete: () => c.destroy() });
  }

  onReward({ granted, levelUps = [] }) {
    if (granted) {
      if (granted.heroXP) this.toast(`+${granted.heroXP} опыта`, COLORS.gold);
      for (const [k, v] of Object.entries(granted.items || {})) this.toast(`+${v} ${itemName(k)}`, COLORS.gold);
    }
    for (const lv of levelUps) this.toast(`★ Новый уровень ${lv.level}! ${lv.note || ''}`, COLORS.gold);
    if (levelUps.length) { services.audio.play('level_up'); services.audio.vibrate([40, 30, 80]); this.levelFx(); }
    else if (granted && Object.keys(granted.items || {}).length) services.audio.play('coin');
    this.refreshHud();
  }

  onResearchDone(id, up) {
    this.openModal({
      title: `${up.title} изучен!`, color: COLORS.telekinesis,
      text: `${up.description}\n\nТеперь можно сдвинуть тяжёлую глыбу за алтарём.`,
      buttons: [{ label: 'Отлично', primary: true }],
    });
  }

  // ================================================================== модальные окна
  /** opts: { title, text, color, buttons: [{ label, primary, onClick }] } */
  openModal(opts) {
    if (this.modal) { this.modalQueue.push(opts); return; }
    services.modalOpen = true;
    this.resetJoystick();
    if (!opts.silent) services.audio.play(opts.final ? 'victory' : 'modal_open');
    const color = opts.color ?? COLORS.gold, pw = 664, cw = pw - 80;
    const left = (W - pw) / 2;
    const c = this.add.container(0, 0).setDepth(10000);
    const overlay = this.add.rectangle(0, 0, W, H, 0x000000, 0.66).setOrigin(0).setInteractive();
    const title = this.add.text(W / 2, 0, opts.title || '', { fontFamily: FONT, fontSize: UI.type.title, fontStyle: 'bold', color: hex(color), align: 'center', wordWrap: { width: pw - 64 }, shadow: SH }).setOrigin(0.5, 0);
    const content = this.add.container(0, 0);
    let contentH = 0;
    if (opts.text) {
      const body = this.add.text(0, 0, opts.text, { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.text, wordWrap: { width: cw }, lineSpacing: 5, shadow: SH });
      content.add(body); contentH = body.height + 24;
    }
    if (opts.content) contentH += opts.content.build(content, 0, contentH, cw);
    const buttons = opts.buttons?.length ? opts.buttons : [{ label: 'Закрыть', primary: true }];
    const btnH = UI.touch.button;
    const vertical = !!opts.vertical;
    const btnBlock = vertical ? buttons.length * (btnH + 16) - 16 : btnH;
    const headerH = 32 + title.height + 30, footerH = btnBlock + 70;
    const viewH = Math.min(contentH, H - 112 - headerH - footerH);
    const ph = headerH + viewH + footerH;
    const top = Math.max(56, (H - ph) / 2 - 24);
    const panel = addPanel(this, left, top, pw, ph, { accent: color, seed: 3 });
    title.setY(top + 32);
    c.add([overlay, panel, title, addDivider(this, W / 2, top + headerH - 16, pw - 100, color)]);
    const scroll = addScrollViewport(this, c, content, { x: left + 32, y: top + headerH, width: cw, height: viewH, contentHeight: contentH });
    if (scroll.max) c.add(this.add.text(W / 2, top + headerH + viewH + 18, '↕ Проведите по содержимому', { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.textDim }).setOrigin(0.5));
    const by0 = top + ph - 24 - btnBlock + btnH / 2;
    const bw = vertical ? pw - 80 : (pw - 64 - (buttons.length - 1) * 16) / buttons.length;
    const views = buttons.map((b, i) => {
      const bx = vertical ? W / 2 : W / 2 + (i - (buttons.length - 1) / 2) * (bw + 16);
      const by = vertical ? by0 + i * (btnH + 16) : by0;
      const btn = addButton(this, bx, by, bw, btnH, b.label, {
        primary: !!b.primary, accent: b.primary ? color : null, fontSize: UI.type.body,
        onPress: () => { services.audio.play(b.primary ? 'ui_click' : 'ui_back'); this.closeModal(b); },
      });
      c.add(btn.parts); return { b, ...btn };
    });
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 150 });
    this.modal = { container: c, buttons, views, scroll, top, height: ph, final: !!opts.final, tempKeys: [panel.texKey], opts };
    this.bus.emit(MSG.MODAL_OPEN);
  }

  /** Перерисовать то же окно (например, алхимия после варки) без звука открытия и без очереди. */
  reopenModal() {
    if (!this.modal?.opts) return;
    const opts = this.modal.opts;
    const offset = this.modal.scroll?.offset || 0;
    this.modal.scroll?.destroy();
    this.modal.container.destroy();
    for (const k of this.modal.tempKeys || []) releaseTexture(this, k);
    this.modal = null;
    services.modalOpen = false;
    this.openModal({ ...opts, silent: true });
    this.modal.scroll?.scrollTo(offset);
  }

  pressModalButton(primary) {
    if (!this.modal) return;
    if (this.modal.dialogue) { if (primary) this.modal.onPrimary(); else this.modal.onCancel(); return; }
    const bs = this.modal.buttons;
    const b = primary ? (bs.find(x => x.primary) || bs[0]) : (bs.find(x => x.cancel) || bs.find(x => !x.primary) || bs[0]);
    this.closeModal(b);
  }

  closeModal(button) {
    if (!this.modal) return;
    if (this.modal.dialogue) { this.closeDialogue(true); return; }
    const { container, tempKeys, scroll } = this.modal;
    scroll?.destroy();
    container.destroy();
    for (const k of tempKeys || []) releaseTexture(this, k);   // панели окон разного размера не копим
    this.modal = null;
    services.modalOpen = false;
    this.bus.emit(MSG.MODAL_CLOSED);
    if (button?.onClick) button.onClick();
    if (!this.modal && this.modalQueue.length) this.openModal(this.modalQueue.shift());
  }

  // ================================================================== изучение даров (алтарь)
  openUpgrade(upgradeId) {
    const { state, abilities } = services;
    const up = UPGRADES[upgradeId];
    const st = state.upgradeStatus(upgradeId);
    const lines = [up.description, ''];
    let buttons = [{ label: 'Закрыть', primary: true }];
    if (st.reason === 'done') lines.push('✓ Дар уже изучен.');
    else if (st.reason === 'in_progress') lines.push(`Изучение идёт… осталось ${fmtTime(state.researchRemainingMs())}`, '', 'Можно исследовать лес — таймер идёт и во время боя.');
    else if (st.reason === 'busy') lines.push('Алтарь занят другим изучением.');
    else {
      lines.push('Требования:');
      if (up.requires?.event && !state.hasEvent(up.requires.event)) lines.push('✗ Пробудите Лунный алтарь');
      for (const c of st.checks || []) {
        if (c.hidden) continue;
        const label = c.item ? itemName(c.item) : c.label === 'Опыт дара' ? `Опыт дара «${ABILITIES[up.ability].name}»` : c.label;
        lines.push(`${c.have >= c.need ? '✓' : '✗'} ${label}: ${Math.min(c.have, c.need)}/${c.need}`);
      }
      lines.push('', `Время изучения: ${fmtTime(up.timerSec[TIMER_MODE] * 1000)}${TIMER_MODE === 'prototype' ? ` (в live-версии ${fmtTime(up.timerSec.live * 1000)})` : ''}`);
      if (st.ok) {
        buttons = [
          { label: 'Начать изучение', primary: true, onClick: () => { if (abilities.startResearch(upgradeId)) this.toast(`Изучение «${up.title}» началось`, COLORS.telekinesis); } },
          { label: 'Позже' },
        ];
      }
    }
    this.openModal({ title: `Изучение: ${up.title}`, color: COLORS.telekinesis, text: lines.join('\n'), buttons });
  }

  confirmReset() {
    this.openModal({
      title: 'Сбросить прогресс?', color: COLORS.danger,
      text: 'Все события, дары и предметы будут удалены. Игра начнётся с дома ведьмы.' + (services.session?.registered ? ' Аккаунт и никнейм останутся.' : ''),
      buttons: [{ label: 'Отмена', primary: true }, { label: 'Сбросить', onClick: () => this.hardReset() }],
    });
  }

  async hardReset() {
    services.resetting = true;
    try { await resetProgress(); } catch (e) { services.resetting = false; this.toast('Не удалось связаться с сервером', COLORS.fire); return; }
    window.location.reload();
  }

  /** Профиль — HTML-окно поверх игры; пока оно открыто, игра на паузе. */
  openAccount() {
    const ses = services.session;
    if (!ses || this.modal) return;
    services.modalOpen = true;
    this.resetJoystick();
    this.bus.emit(MSG.MODAL_OPEN);
    const close = () => { services.modalOpen = false; this.bus.emit(MSG.MODAL_CLOSED); this.refreshHud(); };
    showProfile(ses, {
      onClose: close,
      onLogout: () => reloadToMenu(),     // выход — на стартовый экран
      onSwitched: () => reloadToMenu(),   // вошли в другой аккаунт — мир перезагружается с его прогрессом
      onRegistered: () => this.refreshHud(),
    });
  }

  // ================================================================== пауза и настройки
  buildPauseButton() {
    const x = 660, y = 860;
    const bg = addOrb(this, x, y, 96, COLORS.gold, { gem: false });
    const g = this.add.graphics();
    g.fillStyle(0xf1e3c2).fillRoundedRect(x - 11, y - 12, 7, 24, 2).fillRoundedRect(x + 4, y - 12, 7, 24, 2);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => { if (!this.modal) { services.audio.play('ui_click'); this.openPause(); } });
    this.pauseBtn = this.add.container(0, 0, [bg, g]);
  }

  openPause() {
    if (this.modal) return;
    const inCombat = this.mode === 'combat';
    const buttons = [
      { label: 'Продолжить', primary: true, cancel: true },
      { label: 'Настройки', onClick: () => this.openSettings(true) },
    ];
    if (!inCombat) {
      const ses = services.session;
      if (ses) buttons.push({ label: ses.registered ? `Профиль · ${shortNick(ses.nickname, 10)}` : 'Профиль (гость)', onClick: () => this.openAccount() });
      buttons.push({ label: 'Главное меню', onClick: () => this.goToMenu() });
      buttons.push({ label: 'Сбросить прогресс', onClick: () => this.confirmReset() });
    }
    this.openModal({
      title: 'Пауза', color: COLORS.gold, vertical: true,
      text: inCombat ? 'Бой остановлен. Выход в меню — после боя.' : '',
      buttons,
    });
  }

  openSettings(backToPause = false) {
    if (this.modal) return;
    services.modalOpen = true;
    this.resetJoystick();
    const done = { label: 'Готово', primary: true, onClick: backToPause ? () => this.openPause() : null };
    const container = buildSettingsPanel(this, { onDone: () => this.closeModal(done), depth: 10000 });
    this.modal = { container, buttons: [done], views: [], final: false };
    this.bus.emit(MSG.MODAL_OPEN);
  }

  goToMenu() {
    this.registry.get('savePosition')?.();
    const go = () => reloadToMenu();
    const ses = services.session;
    if (ses?.ready) Promise.race([ses.flush(), new Promise(r => setTimeout(r, 2500))]).then(go, go); // успеваем отправить прогресс
    else go();
  }

  // ================================================================== обучение
  buildTutorial() {
    this.tut = this.add.container(0, 0).setDepth(8500).setVisible(false);
    this.tutBg = this.add.graphics();
    this.tutText = this.add.text(300, 0, '', { fontFamily: FONT, fontSize: UI.type.body, color: '#e9fffb', align: 'center', wordWrap: { width: 450 }, lineSpacing: 3 }).setOrigin(0.5);
    this.tutArrow = this.add.graphics();
    this.tutArrow.fillStyle(COLORS.telekinesis).fillTriangle(-22, -26, 22, -26, 0, 8).lineStyle(3, 0x000000, 0.6).strokeTriangle(-22, -26, 22, -26, 0, 8);
    this.tutHand = this.add.image(0, 0, 'icon_hand').setScale(1.4).setAlpha(0.9);
    this.tut.add([this.tutBg, this.tutText, this.tutArrow, this.tutHand]);
    this.tutHint = null;
  }

  onTutorial(h) {
    this.tweens.killTweensOf(this.tutHand);
    if (!h) {
      this.tutHint = null;
      this.tweens.add({ targets: this.tut, alpha: 0, duration: 200, onComplete: () => { if (!this.tutHint) this.tut.setVisible(false); } });
      return;
    }
    this.tutHint = h;
    this.tutText.setText(h.text);
    drawPlate(this.tutBg, Math.min(640, this.tutText.width + 56), this.tutText.height + 30, { accent: COLORS.telekinesis, fill: 0x0e1a1c, alpha: 0.94 });
    const combat = this.mode === 'combat';
    let bubbleY = 880, ax = null, ay = 0;
    this.tutHand.setVisible(false);
    if (h.target === 'swipe') {
      bubbleY = 700;
      this.tutHand.setVisible(true).setPosition(280, 820);
      this.tweens.add({ targets: this.tutHand, x: 440, y: 780, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (h.target === 'context') {
      bubbleY = 820; ax = 610; ay = 916;
    } else if (this.buttons[h.target]) {
      const b = this.buttons[h.target];
      bubbleY = combat ? 890 : 880; ax = b.x; ay = BTN_Y - BTN_R - 22;
    }
    this.tutBg.setPosition(300, bubbleY); this.tutText.setY(bubbleY);
    this.tutArrow.setVisible(ax !== null);
    if (ax !== null) { this.tutArrow.setPosition(ax, ay); this.tutArrowBase = ay; }
    this.tut.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.tut, alpha: 1, duration: 200 });
    services.audio.play('hint');
    if (h.ttl) {
      const id = h.id;
      this.time.delayedCall(h.ttl, () => services.tutorial.complete(id));
    }
  }

  updateTutorial(time, delta) {
    const h = this.tutHint;
    if (!h) return;
    if (this.tutArrow.visible) this.tutArrow.y = this.tutArrowBase + Math.sin(time / 140) * 8;
    const b = this.buttons[h.target];
    if (b) b.glow.setAlpha(0.55 + Math.sin(time / 120) * 0.35);
    if (h.id === 'move') {
      const body = this.scene.get('ExplorationScene')?.player?.sprite?.body;
      if (body && body.speed > 20) this.moveT += delta;
      if (this.moveT > 700) services.tutorial.complete('move');
    }
  }

  levelFx() {
    const r = this.add.image(577, 76, 'fx_ring').setTint(COLORS.gold).setBlendMode('ADD').setScale(0.4).setDepth(8000);
    this.tweens.add({ targets: r, scale: 3, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
    this.tweens.add({ targets: this.levelText, scale: { from: 1.6, to: 1 }, duration: 500, ease: 'Back.easeOut' });
  }

  // ================================================================== финал прототипа
  openFinal() {
    // не открываем второй финальный экран, если он уже показан или стоит в очереди
    if (this.modal?.final || this.modalQueue.some(m => m.final)) return;
    const d = services.state.data;
    const wins = d.stats.combats.filter(c => c.result === 'victory');
    const lines = [
      'Древние ворота запечатаны фиолетовым кругом. Ни Телекинез, ни Огонь не действуют на них.',
      'Чтобы пройти дальше, нужен дар Печати.', '',
      '★ Прототип пройден!', '',
      `Время игры: ${fmtTime(d.stats.playTimeMs)}`,
      `Уровень героини: ${d.heroLevel}`,
      `Побед: ${wins.length}${wins.length ? ' (' + wins.map(c => `${c.timeSec} с`).join(', ') + ')' : ''}`,
    ];
    this.openModal({
      final: true, title: 'SEAL_REQUIRED\nТребуется Печать', color: COLORS.seal, text: lines.join('\n'),
      buttons: [{ label: 'Продолжить', primary: true }, { label: 'Начать заново', onClick: () => this.confirmReset() }],
    });
  }
}

Object.assign(UIScene.prototype, windows08);
