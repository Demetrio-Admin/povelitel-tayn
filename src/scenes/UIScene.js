import { T, fm } from '../state/hero.js';
import Phaser from 'phaser';
import { VIEW, COLORS, CONTROLS } from '../config/game.config.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { ENEMIES } from '../config/balance.enemies.js';
import { UPGRADES, TIMER_MODE, ITEMS } from '../config/balance.progression.js';
import { MSG } from '../state/EventBus.js';
import { CHAPTER_1_FINAL } from '../config/events.js';
import { services, resetProgress, reloadToMenu } from '../services.js';
import { showProfile } from '../ui/accountUI.js';
import { showChat } from '../ui/ChatWindow.js';
import { showCovens } from '../ui/covenUI.js';
import { CovenService } from '../cloud/CovenService.js';
import { ChatService } from '../cloud/ChatService.js';
import { InputController } from '../systems/InputController.js';
import { ABILITY_ORDER } from '../systems/AbilitySystem.js';
import { itemName, ROMAN } from '../objects/InteractiveObject.js';
import { buildSettingsPanel } from '../ui/SettingsPanel.js';
import { UI } from '../config/ui.config.js';
import { addPanel, addDivider, addOrb, setOrb, addScreenVignette, addButton, drawPlate, releaseTexture } from '../ui/widgets.js';
import { addScrollViewport } from '../ui/scrollViewport.js';
import { windows08 } from '../ui/windows08.js';
import { hud082 } from '../ui/hud082.js';
import { windows09 } from '../ui/windows09.js';
import { windowsBag } from '../ui/windowsBag.js';
import { windows11 } from '../ui/windows11.js';
import { windows17 } from '../ui/windows17.js';
import { windows19 } from '../ui/windows19.js';
import { windows23 } from '../ui/windows23.js';
import { windows26 } from '../ui/windows26.js';
import { windows27 } from '../ui/windows27.js';
import * as vitals from '../state/vitals.js';
import { addNoticeClose } from '../ui/noticeClose.js';
import { addCraftMedallion, setCraftMedallion } from '../ui/witchcraftUI.js';
import { bindSceneViewport } from '../ui/viewport.js';

const FONT = UI.font;
const SH = UI.shadow;
const W = VIEW.width;
const H = VIEW.height;
const BAR_Y = 1096;          // верх зоны нижних кнопок (касания ниже — только кнопки)
const BTN_Y = UI.dock.buttonY;
const BTN_R = 58;
const hex = c => '#' + c.toString(16).padStart(6, '0');
const fmtTime = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * UIScene — всегда поверх игровых сцен. Верхний HUD (портрет, уровень, опыт, ресурсы, HP/мана), колонка «Журнал / Меню»,
 * плавающие кнопки даров, кнопка действия, джойстик, тосты и модальные окна (диалоги, изучение, сумка, меню, профиль).
 * Данные берёт из GameState (HP и мана — общие запасы героини, state/vitals.js) и abilityProvider активной сцены.
 */
export class UIScene extends Phaser.Scene {
  constructor() { super('UIScene'); }

  create() {
    this.viewport = bindSceneViewport(this, { hud: true });
    const { bus } = services;
    this.bus = bus;
    this.mode = 'exploration';
    this.modal = null;
    this.modalQueue = [];
    this.shuttingDown = false;
    this.toasts = [];
    this.touch = null;
    this.hudTimer = 0;

    this.buildVignette();
    this.buildTopHud();
    this.buildResearchLine();
    this.buildBottomBar();
    this.buildContextButton();
    this.buildJoystick();
    this.buildSideColumn();
    this.buildTutorial();
    this.buildV08Hud();
    this.buildV09();

    // Keep authored coordinates and masks intact; only their camera anchors move on resize.
    if (this.viewport) {
      const bottom = [this.bottomShade, this.ctx, ...Object.values(this.buttons).flatMap(b =>
        [b.glow, b.orb, b.bg, b.icon, b.cd, b.cdText, b.lock, b.text])].filter(Boolean);
      const top = [this.topShade, this.portraitGlow, this.portrait, this.portraitHit, this.syncDot,
        this.levelText, this.xpCaption, this.coinIcon, this.coinText, this.shardIcon, this.shardText,
        this.hpText, this.hpIcon, this.manaText, this.manaIcon, this.researchText,
        this.journalBtn.c, this.menuBtn.c, this.hpGlow, this.manaGlow, this.hintPlate,
        ...[this.xpBar, this.hpBar, this.manaBar].flatMap(b => [b.trough, b.fill, b.frame])].filter(Boolean);
      bottom.forEach(o => this.viewport.assign(o, 'bottom'));
      top.forEach(o => this.viewport.assign(o, 'top'));
    }

    this.controls = new InputController(this, bus, services.input, {
      isModal: () => !!this.modal,
      onModalPrimary: () => this.pressModalButton(true),
      onEscape: () => (this.modal ? this.pressModalButton(false) : this.openMenu()),
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
    bus.on(MSG.OPEN_SHOP, () => this.openShop('Лавка Бориса'), this);   // v0.20.0
    bus.on(MSG.OPEN_WALLET, () => this.openWallet(), this);
    bus.on(MSG.OPEN_DAILY, () => this.openDaily(), this);   // v0.23.0: доска поручений
    bus.on(MSG.OPEN_COVENS, () => this.openCovens(), this);   // v0.25.0: Ковены
    bus.on(MSG.OPEN_DUEL, () => this.openDuel(), this);       // v0.26.0: Магическая Дуэль
    bus.on(MSG.OPEN_MAP, (o) => this.openMap(o || {}), this);  // v0.27.0: карта мира
    bus.on(MSG.OPEN_GIFTS, this.openGifts, this);
    this.input.keyboard?.on('keydown-G', () => { if (!this.modal && this.mode === 'exploration') this.openGifts(); });
    bus.on(MSG.REWARD, this.onReward, this);
    bus.on(MSG.RESEARCH_DONE, this.onResearchDone, this);
    bus.on(MSG.FINAL_SCREEN, this.openFinal, this);
    bus.on(MSG.WORLD_EVENT, this.onWorldEvent, this);
    bus.on(MSG.TUTORIAL, this.onTutorial, this);
    bus.on(MSG.OPEN_PAUSE, this.openMenu, this);
    bus.on(MSG.CONTEXT_ACTION, () => { const t = services.tutorial; t.complete('interact'); if (this.focusInfo?.ability === 'telekinesis') t.complete('telekinesis'); }, this);
    bus.on(MSG.ABILITY_USE, (id) => { if (this.mode === 'exploration' && (id === 'telekinesis' || id === 'fire')) services.tutorial.complete(id); }, this);
    const offAcc = services.session?.onChange((r) => { if (r === 'saving' || r === 'profile' || r === 'registered') this.refreshHud(); });
    const offChat = services.chat?.onChange(() => { if (this.menuBtn?.text) this.menuBtn.text.setText(services.chat.unread ? `Меню · ${services.chat.unread}` : 'Меню'); });
    this.events.once('shutdown', () => { this.shuttingDown = true; this.chatWindow?.close(); bus.offContext(this); offAcc?.(); offChat?.(); });

    this.refreshQuest();
    this.refreshHud();
    // постоянной панели цели нет — текущую цель коротко показываем при входе в игру
    // (ждём, пока закончится вступление и закроются окна; не дольше ~10 с)
    let tries = 0;
    const intro = () => {
      if (this.mode === 'exploration' && !this.modal && services.mode === 'exploration') this.showGoalBanner(services.quests.objectiveText(), 'Цель');
      else if (++tries < 20) this.time.delayedCall(500, intro);
    };
    this.time.delayedCall(1500, intro);
    services.audio.setMusic(services.mode === 'combat' ? 'combat' : 'explore');
    this.moveT = 0;
    if (services.tutorial.canShow('move')) this.time.delayedCall(1200, () => { if (this.mode === 'exploration') services.tutorial.show('move'); });
  }

  onWorldEvent(key) {
    const { audio, tutorial } = services;
    if (key === 'fire_required_01') this.flashButton('fire');
    if (['unlock_telekinesis_1', 'unlock_fire_1', 'lunar_quest_complete', 'telekinesis_2_complete', 'unlock_seal_1', 'chapter_1_complete'].includes(key)) {
      audio.play('unlock_magic');
      audio.vibrate([30, 40, 30]);
    }
    if (key === 'unlock_fire_1') this.time.delayedCall(900, () => tutorial.show('fire'));
  }

  // ================================================================== построение
  buildVignette() {
    const vignette = addScreenVignette(this, W, H, 0.55).setDepth(-5);
    this.viewport?.cover(vignette);
  }

  /** Строка таймера изучения под HP/маной (раньше жила в панели цели). */
  buildResearchLine() {
    this.researchText = this.add.text(this.statRow.x0, this.statRow.y + this.statRow.h / 2 + 8, '', { fontFamily: FONT, fontSize: UI.type.small, color: hex(COLORS.telekinesis), wordWrap: { width: this.statRow.right - this.statRow.x0 }, stroke: '#000', strokeThickness: 4 });
  }

  /** Подсказка «если застряли» — под колонкой Журнал/Меню, на всю ширину. */
  layoutHint() {
    const h = Math.max(72, (this.hintText?.height || 0) + 24);
    if (this.hintPlate?.visible) this.hintPlate.setPosition(W / 2, this.fieldTop() + h / 2);
    this.questBottom = this.fieldTop() + (this.hintPlate?.visible ? h + 12 : 0);   // где начинаются тосты
  }

  /** Крупные Дары и Сумка прямо поверх мира — одинаковый размер в прогулке и бою. */
  buildBottomBar() {
    const xs = UI.dock.centers;
    this.buttons = {};
    // v0.18.0: три кнопки — три слота даров. Даров может быть больше (Лёд — четвёртый), в кнопках — те, что в слотах
    this.dock = [0, 1, 2].map((i) => {
      const slot = { id: null };
      slot.btn = this.makeButton(xs[i], BTN_Y, `icon_${ABILITY_ORDER[i]}`, ABILITIES[ABILITY_ORDER[i]].name, COLORS[ABILITIES[ABILITY_ORDER[i]].color], () => this.pressDock(i));
      return slot;
    });
    this.refreshDock();
    this.buttons.bag = this.makeButton(xs[3], BTN_Y, 'icon_bag', 'Сумка', COLORS.gold, () => this.bus.emit(MSG.OPEN_BAG));
  }

  /**
   * Нажатие на кнопку дара. Слот читаем через this.dock (а не из замыкания на объект { id: null }): боевая сборка (Rollup) считала,
   * что slot.id всегда null, и вырезала нажатие — кнопки молчали. Проверка готовой сборки — tools/check-bundle.mjs.
   */
  pressDock(i) {
    const id = this.dock[i]?.id;
    if (id) this.bus.emit(MSG.ABILITY_USE, id);
  }

  /** Какие дары в кнопках: сначала стоящие в слотах, потом открытые вне слотов (серые), потом ещё закрытые (с замком). */
  dockIds() {
    const st = services.state;
    const eq = st.equippedGifts();
    const benched = ABILITY_ORDER.filter((id) => st.isUnlocked(id) && !eq.includes(id));
    const locked = ABILITY_ORDER.filter((id) => !st.isUnlocked(id));
    return [...eq, ...benched, ...locked].slice(0, this.dock.length);
  }

  /** Перестроить кнопки даров, если набор в слотах поменялся (иконка, подпись, цвет; this.buttons[id] — для подсказок обучения). */
  refreshDock() {
    const ids = this.dockIds();
    const key = ids.join();
    if (key === this.dockKey) return;
    this.dockKey = key;
    for (const id of ABILITY_ORDER) delete this.buttons[id];
    ids.forEach((id, i) => {
      const s = this.dock[i], b = s.btn;
      s.id = id;
      b.icon.setTexture(`icon_${id}`);
      b.baseIconScale = UI.dock.icon / Math.max(b.icon.width, b.icon.height, 1);
      b.icon.setScale(b.baseIconScale);
      b.color = COLORS[ABILITIES[id].color];
      b.glow.setTint(b.color);
      b.text.setText(ABILITIES[id].name);
      this.buttons[id] = b;
    });
  }

  makeButton(x, y, iconKey, label, color, onPress) {
    const glow = this.add.image(x, y, 'fx_glow').setTint(color).setBlendMode('ADD').setScale(1.5).setAlpha(0);
    const orb = addCraftMedallion(this, x, y, UI.orb.ability);
    const bg = this.add.zone(x, y, BTN_R * 2, BTN_R * 2);   // зона нажатия (прозрачная)
    const icon = this.add.image(x, y, iconKey);
    const baseIconScale = UI.dock.icon / Math.max(icon.width, icon.height, 1);
    icon.setScale(baseIconScale);
    const cd = this.add.graphics();
    const cdText = this.add.text(x, y, '', { fontFamily: FONT, fontSize: UI.type.body, color: '#fff', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    const lock = this.add.image(x + 34, y - 34, 'icon_lock').setScale(0.42).setVisible(false);
    const text = this.add.text(x, y + BTN_R + 12, label, { fontFamily: FONT, fontSize: UI.type.small, color: '#fbefd2', shadow: SH, stroke: '#120b07', strokeThickness: 4, wordWrap: { width: 156 }, align: 'center' }).setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      if (this.modal) return;
      services.audio.play('ui_click');
      this.tweens.add({ targets: [orb, icon], scale: '*=0.92', duration: 70, yoyo: true });
      onPress();
    });
    return { x, y, glow, orb, bg, icon, cd, cdText, lock, text, color, baseIconScale };
  }

  buildContextButton() {
    const x = 610, y = 978;
    this.ctx = this.add.container(x, y).setVisible(false);
    this.ctxGlow = this.add.image(0, 0, 'fx_glow').setBlendMode('ADD').setScale(1.4).setAlpha(0.6);
    this.ctxBg = addOrb(this, 0, 0, UI.orb.context, COLORS.gold);
    this.ctxIcon = this.add.image(0, -4, 'icon_hand');
    this.ctxIcon.setScale(60 / Math.max(this.ctxIcon.width, this.ctxIcon.height, 1));
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
      const point = this.viewport?.point(p, 'bottom') || p;
      if (this.modal || over.length || this.mode !== 'exploration' || point.y > BAR_Y) return;
      this.touch = { id: p.id, x: p.x, y: p.y, t: this.time.now, moved: false };
    });
    this.input.on('pointermove', (p) => {
      const t = this.touch;
      if (!t || p.id !== t.id || !p.isDown) return;
      const dx = p.x - t.x, dy = p.y - t.y;
      const d = Math.hypot(dx, dy);
      if (!t.moved && d > CONTROLS.tapMaxMove) {
        t.moved = true;
        const start = this.viewport?.point(t) || t;
        this.joyBase.setPosition(start.x, start.y).setVisible(true);
        this.joyKnob.setVisible(true);
      }
      if (!t.moved) return;
      const r = CONTROLS.joystickRadius;
      const k = d > r ? r / d : 1;
      const knob = this.viewport?.point({ x: t.x + dx * k, y: t.y + dy * k }) || { x: t.x + dx * k, y: t.y + dy * k };
      this.joyKnob.setPosition(knob.x, knob.y);
      if (d < CONTROLS.joystickDeadzone) { joy.x = 0; joy.y = 0; } else {
        const m = Math.min(1, d / r), f = Math.pow(m, CONTROLS.joystickCurve) / m;   // кривая отклика: направление то же, величина мягче у центра
        joy.x = (dx * k) / r * f; joy.y = (dy * k) / r * f;
      }
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
    if (mode === 'combat') this.chatWindow?.close();
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
    if (mode === 'combat') { this.goalBanner?.destroy(); this.goalBanner = null; }
    this.layoutSideColumn();
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
    if (this.zoneBanner) { this.tweens.killTweensOf(this.zoneBanner); this.zoneBanner.destroy(); }
    const t = this.add.text(W / 2, 420, zone.name, { fontFamily: FONT, fontSize: UI.type.title, color: COLORS.textGold, stroke: '#000', strokeThickness: 7 }).setOrigin(0.5).setAlpha(0);
    this.zoneBanner = t;
    this.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 1200, onComplete: () => {
      t.destroy(); if (this.zoneBanner === t) this.zoneBanner = null;
    } });
  }

  /** Цель больше не висит на экране: при её смене — короткое уведомление (3–5 с), полный текст — в Журнале. */
  refreshQuest() {
    const text = services.quests.objectiveText();
    const prev = this.lastObjective;
    this.lastObjective = text;
    this.hintPlate?.setVisible(this.mode !== 'combat' && !!this.hintText?.text);
    this.refreshV08Hud();
    this.layoutHint();
    if (prev && prev !== text && this.mode !== 'combat') {
      services.audio.play('quest_update', { minGap: 600 });
      this.showGoalBanner(text);
    }
  }

  refreshHud() {
    this.refreshTopHud();
    this.refreshSideBadge();
    this.lastHs = services.state.heroStats();
  }

  onFocus(info) {
    this.focusInfo = info;
    if (!info || this.mode !== 'exploration') { this.ctx.setVisible(false); return; }
    this.ctx.setVisible(true);
    this.ctxIcon.setTexture(info.icon);
    this.ctxIcon.setScale(60 / Math.max(this.ctxIcon.width, this.ctxIcon.height, 1));
    setOrb(this.ctxBg, this, info.color, UI.orb.context, false);
    this.ctxGlow.setTint(info.color);
    this.ctxLabel.setText(info.label);
    // v0.9: подпись с ценой («Сдвинуть · 12 маны») не выходит за правый край экрана
    const half = this.ctxLabel.width / 2, room = W - 10 - this.ctx.x;
    this.ctxLabel.setX(Math.min(0, room - half));
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

    // v0.9: HP / мана — общие запасы героини (мир и бой пишут в одно состояние), не зависят от последней сцены
    // v0.14.0: в бою HP и мана — на копии героя (services.combatSim), настоящее состояние обновит сервер по итогу боя
    const hud = vitals.view(services.combatSim || services.state);
    this.updateV09(delta / 1000);
    {
      this.hpBar.setFraction(hud.hp / hud.maxHp);
      this.manaBar.setFraction(hud.mana / hud.maxMana);
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
    this.refreshDock();
    for (const { id, btn: b } of this.dock) {
      const st = prov ? prov(id) : { state: 'locked' };
      const locked = st.state === 'locked';
      b.lock.setVisible(locked);
      b.icon.setAlpha(locked || st.state === 'benched' ? 0.3 : st.state === 'nomana' ? 0.45 : 1);   // дар вне боевого слота остаётся приглушённым
      setCraftMedallion(b.orb, locked);
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
    let toastTop = this.questBottom || this.fieldTop();
    this.toasts.forEach(t => {
      const targetY = (this.mode === 'combat' ? 440 : toastTop) + t.toastHeight / 2;
      t.y += (targetY - t.y) * 0.25; toastTop += t.toastHeight + 12;
    });
  }

  // ================================================================== тосты и награды
  toast(text, color = 0xf1e3c2) {
    text = T(text);   // v0.9.2: варианты для ведьмы / колдуна
    // одинаковый тост подряд (фокус + нажатие) не дублируем
    const now = this.time.now;
    if (this.lastToast && this.lastToast.text === text && now - this.lastToast.t < 1500) return;
    this.lastToast = { text, t: now };
    const label = this.add.text(-30, 0, text, { fontFamily: FONT, fontSize: UI.type.body, color: hex(color), align: 'center', wordWrap: { width: 536 }, shadow: SH }).setOrigin(0.5);
    if (this.mode === 'combat') {
      this.toasts.forEach(t => t.destroy());
      this.toasts = []; // one readable notification below the warning, never over the potion lane
    }
    const height = Math.max(72, label.height + 24), width = Math.min(660, label.width + 112);
    const y = this.mode === 'combat' ? 440 + height / 2 : (this.questBottom || this.fieldTop()) + height / 2 + this.toasts.reduce((sum, t) => sum + t.toastHeight + 12, 0);
    const bg = drawPlate(this.add.graphics(), width, height, { accent: color, fill: 0x120d0b, alpha: 0.9 });
    const c = this.add.container(W / 2, y, [bg, label]).setDepth(9000).setAlpha(0);
    c.toastHeight = height;
    addNoticeClose(this, c, () => this.dropToast(c), { x: width / 2 - 36 });
    this.toasts.push(c);
    if (this.toasts.length > 4) this.dropToast(this.toasts[0]);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });
    this.time.delayedCall(2600 + text.length * 25, () => this.dropToast(c));
  }

  dropToast(c) {
    if (!this.toasts.includes(c)) return;
    this.toasts = this.toasts.filter(t => t !== c);
    this.tweens.killTweensOf(c);
    this.tweens.add({ targets: c, alpha: 0, duration: 250, onComplete: () => c.destroy() });
  }

  onReward({ granted, levelUps = [] }) {
    if (granted) {
      if (granted.sapphires) this.toast(`+${granted.sapphires} сапфир`, 0x6fa8ff);
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
      title: `${up.title} изучен!`, color: COLORS[ABILITIES[up.ability].color] ?? COLORS.telekinesis,
      text: `${up.description}${up.doneText ? `\n\n${up.doneText}` : ''}`,
      buttons: [{ label: 'Отлично', primary: true }, { label: 'Дары', onClick: () => this.bus.emit(MSG.OPEN_GIFTS) }],
    });
  }

  // ================================================================== модальные окна
  /** opts: { title, text, color, buttons: [{ label, primary, onClick }] } */
  openModal(opts) {
    if (this.modal) { this.modalQueue.push(opts); return; }
    // v0.9.2: заголовок, текст и кнопки могут иметь варианты для ведьмы / колдуна
    opts = { ...opts, title: T(opts.title), text: T(opts.text), buttons: opts.buttons?.map(b => ({ ...b, label: T(b.label) })) };
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
    const tabBlock = opts.tabs?.length ? Math.ceil(opts.tabs.length / 2) * (btnH + 12) + 12 : 0;
    const headerH = 32 + title.height + 30, footerH = btnBlock + 70 + tabBlock;
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
    if (opts.tabs?.length) {
      const tw = (pw - 80) / 2, tabTop = top + ph - 24 - btnBlock - tabBlock;
      opts.tabs.forEach((tab, i) => {
        const bt = addButton(this, left + 36 + tw / 2 + (i % 2) * (tw + 8), tabTop + Math.floor(i / 2) * (btnH + 12) + btnH / 2, tw, btnH, tab.label, {
          primary: !!tab.selected, accent: tab.selected ? color : null, fontSize: UI.type.body,
          onPress: () => { this.closeModal({ onClick: tab.onClick }); },
        }); c.add(bt.parts);
      });
    }
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
    if (this.modal.chat) { if (!primary) this.chatWindow?.back(); return; }
    if (this.modal.menu) { this.closeMenu(); return; }
    if (this.modal.dialogue) { if (primary) this.modal.onPrimary(); else this.modal.onCancel(); return; }
    const bs = this.modal.buttons;
    const b = primary ? (bs.find(x => x.primary) || bs[0]) : (bs.find(x => x.cancel) || bs.find(x => !x.primary) || bs[0]);
    this.closeModal(b);
  }

  closeModal(button) {
    if (!this.modal) return;
    if (this.modal.chat) { this.chatWindow?.close(); return; }
    if (this.modal.menu) { this.closeMenu(); return; }
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
          { label: 'Начать изучение', primary: true, onClick: () => this.startGiftResearch(upgradeId) },
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

  /** v0.25.0: окно Ковенов (HTML). Нужен онлайн-аккаунт; материалы и награда недели — через сервер (player_action). */
  openCovens() {
    if (this.modal || this.mode === 'combat') return;
    const ses = services.session;
    if (!ses?.signedIn) { this.toast('Ковены доступны в онлайн-аккаунте.'); return; }
    const svc = services.covens || (services.covens = new CovenService(ses));
    this.modal = { covens: true };
    services.modalOpen = true; this.resetJoystick();
    const keyboard = this.input.keyboard, enabled = keyboard.enabled;
    keyboard.enabled = false;
    this.bus.emit(MSG.MODAL_OPEN);
    showCovens(svc, {
      item: (id) => services.state.item(id),
      give: (item, qty) => services.actions.covenGive(item, qty),
      claim: () => services.actions.covenClaim(),
      onChange: () => this.refreshHud?.(),
    }, {
      onClose: () => {
        this.modal = null; services.modalOpen = false;
        keyboard.resetKeys(); keyboard.enabled = enabled;
        this.bus.emit(MSG.MODAL_CLOSED);
        if (!this.shuttingDown && this.mode === 'exploration' && this.modalQueue.length) this.openModal(this.modalQueue.shift());
      },
    });
  }

  openChat() {
    if (this.modal || this.mode === 'combat') return;
    const chat = services.chat || (services.chat = new ChatService(services.session));
    this.modal = { chat: true };
    services.modalOpen = true; this.resetJoystick(); this.controls?.scene.input.keyboard.resetKeys();
    const keyboard = this.input.keyboard, enabled = keyboard.enabled;
    keyboard.enabled = false;
    this.bus.emit(MSG.MODAL_OPEN);
    this.chatWindow = showChat(chat, {
      onClose: () => {
        this.chatWindow = null; this.modal = null; services.modalOpen = false;
        keyboard.resetKeys(); keyboard.enabled = enabled;
        this.bus.emit(MSG.MODAL_CLOSED);
        if (!this.shuttingDown && this.mode === 'exploration' && this.modalQueue.length) this.openModal(this.modalQueue.shift());
      },
      onLogout: () => reloadToMenu(),
    });
  }

  // ================================================================== меню и настройки
  /** Прежняя «Пауза» теперь — раскрывающееся меню (кнопка «Меню», Esc, MSG.OPEN_PAUSE). */
  openPause() { this.openMenu(); }

  /**
   * Рабочие настройки (ui/SettingsPanel.js). В исследовании доступен «Сбросить прогресс» (в бою его нет).
   * Действие сначала закрывает окно настроек, потом выполняется.
   */
  openSettings() {
    if (this.modal) return;
    services.modalOpen = true;
    this.resetJoystick();
    const done = { label: 'Готово', primary: true };
    const extra = this.mode === 'combat' ? [] : [
      { label: 'Сбросить прогресс', onClick: () => this.confirmReset() },
    ];
    const container = buildSettingsPanel(this, {
      onDone: () => this.closeModal(done), depth: 10000,
      extra: extra.map(b => ({ label: b.label, onPress: () => this.closeModal(b) })),
    });
    this.modal = { container, buttons: [done], views: [], final: false, settings: true };
    this.bus.emit(MSG.MODAL_OPEN);
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
    this.tutClose = addNoticeClose(this, this.tut, () => {
      if (this.tutHint) services.tutorial.complete(this.tutHint.id);
    });
    this.tutHint = null;
  }

  onTutorial(h) {
    this.tweens.killTweensOf(this.tutHand);
    this.tweens.killTweensOf(this.tut);
    if (!h) {
      this.tutHint = null;
      this.tut.setVisible(false);
      return;
    }
    this.tutHint = h;
    this.viewport?.assign(this.tut, h.target === 'context' || this.buttons[h.target] ? 'bottom' : 'center');
    this.tutText.setText(h.text);
    const width = Math.min(640, this.tutText.width + 120);
    drawPlate(this.tutBg, width, Math.max(72, this.tutText.height + 30), { accent: COLORS.telekinesis, fill: 0x0e1a1c, alpha: 0.94 });
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
    this.tutBg.setPosition(300, bubbleY); this.tutText.setPosition(268, bubbleY);
    this.tutClose.setPosition(300 + width / 2 - 36, bubbleY);
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
    const r = this.add.image(UI.hud.portraitX, UI.hud.portraitY, 'fx_ring').setTint(COLORS.gold).setBlendMode('ADD').setScale(0.4).setDepth(8000);
    this.viewport?.assign(r, 'top');
    this.tweens.add({ targets: r, scale: 3, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
    this.tweens.add({ targets: this.levelText, scale: { from: 1.6, to: 1 }, duration: 500, ease: 'Back.easeOut' });
  }

  // ================================================================== финал прототипа
  /** v0.10.0: финал первой главы — сердце рощи исцелено (Целебный сбор + Астрал). Награда уже выдана операцией сервера. */
  openFinal(info = {}) {
    // не открываем второй финальный экран, если он уже показан или стоит в очереди
    if (this.modal?.final || this.modalQueue.some(m => m.final)) return;
    const d = services.state.data;
    const wins = d.stats.combats.filter(c => c.result === 'victory');
    const lines = [
      'Кристалл засиял ровным бирюзовым светом. Корни отпускают тропы, звери затихают, и лес снова узнаёт вас.',
      'Но тот, кто выпил силу сердца, знал секреты рощи. След ведёт в город.', '',
      `★ ${CHAPTER_1_FINAL}`, '',
      ...(info.reward ? [`Награда: ${info.reward}.`, ''] : []),
      `Время игры: ${fmtTime(d.stats.playTimeMs)}`,
      T(fm(`Уровень героини: ${d.heroLevel}`, `Уровень героя: ${d.heroLevel}`)),
      `Побед: ${wins.length}`, '',
      'Мирра ждёт рассказа — поговорите с ней, и начнётся глава II «Город под инеем».',
    ];
    this.openModal({
      final: true, title: 'Глава I завершена\nЛес, который забыл нас', color: 0x7be2c8, text: lines.join('\n'),
      buttons: [{ label: 'Продолжить', primary: true }, { label: 'Открыть журнал', onClick: () => this.bus.emit(MSG.OPEN_JOURNAL) }],
    });
  }
}

Object.assign(UIScene.prototype, windows08, hud082, windows09, windows11, windows17, windows19, windows23, windows26, windows27, windowsBag);
