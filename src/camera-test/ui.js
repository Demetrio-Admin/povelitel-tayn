// UI scenes of the camera experiment.
//  • ClassicCameraUIScene — the unmodified production HUD with the experiment's local-only limits.
//  • CameraUIScene        — the compact mobile adventure HUD (top status zone, «Магия» / «Сумка» bar).
// Nothing here is imported by the production entry point; UIScene itself is not modified.
import { UIScene } from '../scenes/UIScene.js';
import { services } from '../services.js';
import { VIEW, COLORS } from '../config/game.config.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { UI } from '../config/ui.config.js';
import { MSG } from '../state/EventBus.js';
import { currentHero, currentHeroId } from '../state/hero.js';
import { xpProgress } from '../state/heroProgress.js';
import { ensureTexture, drawPlate, UIBar, addScreenVignette } from '../ui/widgets.js';
import { addCraftMedallion } from '../ui/witchcraftUI.js';
import { ABILITY_ORDER } from '../systems/AbilitySystem.js';
import { HUD, DOCK_ROW, barCenters, cssPerUnit, touchSize, shortNumber } from './hud.js';

const W = VIEW.width;
const H = VIEW.height;
const FONT = UI.font;
const SH = UI.shadow;
const STROKE = { stroke: '#120b07', strokeThickness: 5 };
const fit = (img, size) => { img.setScale(size / Math.max(img.width, img.height, 1)); return img; };

/** Cloud actions stay disabled in the experiment; the gesture rules are the shared ones. */
function withExperimentLimits(Base) {
  return class extends Base {
    openWallet() { this.toast('Тестовый режим: покупки отключены'); }
    openAccount() { this.toast('Локальный тест: вход в аккаунт отключён'); }
    openChat() { this.toast('Тестовый режим: чат отключён'); }
    openCovens() { this.toast('Тестовый режим: Ковены отключены'); }
    openDuel() { this.toast('Тестовый режим: сетевые дуэли отключены'); }
    setupPointer() {
      const before = new Set(this.input.listeners('pointerdown'));
      super.setupPointer();
      const start = this.input.listeners('pointerdown').find(fn => !before.has(fn));
      this.input.off('pointerdown', start);
      this.input.on('pointerdown', (p, over) => {
        if (this.touch) return;   // a second finger never replaces the joystick owner
        const limit = this.touchLimitY?.();
        if (limit === undefined) { start(p, over); return; }
        // Same rule as UIScene, but the dead zone follows this HUD's bottom bar rather than the classic dock.
        const point = this.viewport?.point(p, 'bottom') || p;
        if (this.modal || over.length || this.mode !== 'exploration' || point.y > limit) return;
        this.touch = { id: p.id, x: p.x, y: p.y, t: this.time.now, moved: false };
      });
      // A second finger on a HUD control must not replace an active joystick gesture.
      this.input.on('pointermove', () => { if (Math.hypot(services.input.joy.x, services.input.joy.y) > .01) this.scene.get('ExplorationScene').player.moveTarget = null; });
    }
  };
}

export const ClassicCameraUIScene = withExperimentLimits(UIScene);

/** Vertical fade under the top / above the bottom HUD. `from` is the opacity at the screen edge. */
function shadeKey(scene, key, h, from, up) {
  ensureTexture(scene, key, W, h, (ctx, w, hh) => {
    const g = ctx.createLinearGradient(0, up ? hh : 0, 0, up ? 0 : hh);
    g.addColorStop(0, `rgba(12,7,4,${from})`);
    g.addColorStop(0.55, `rgba(12,7,4,${from * 0.5})`);
    g.addColorStop(1, 'rgba(12,7,4,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hh);
  }, 0);
  return key;
}

export class CameraUIScene extends withExperimentLimits(UIScene) {
  create() {
    super.create();
    this.trayOpen = false;
    this.applyHitSizes();
    this.syncDomAnchors();
    const onResize = () => { this.applyHitSizes(); this.syncDomAnchors(); };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
    // The «Магия» tray gives way to any window and to any gesture in the world.
    this.bus.on(MSG.MODAL_OPEN, this.closeTrayNow, this);
    this.bus.on(MSG.WORLD_TAP, () => this.closeTray(), this);
    // The HTML comparison pill would sit on top of a window's corner: it steps aside while a window is open.
    this.events.once('shutdown', () => { this.windowFlag = false; document.body.classList.remove('camera-window'); });
  }

  /** Touches below this line belong to the bottom bar (UIScene's classic limit is 1096). */
  touchLimitY() { return HUD.bar.deadY; }

  // ================================================================== top zone
  buildVignette() {
    const vignette = addScreenVignette(this, W, H, HUD.vignette).setDepth(-5);
    this.viewport?.cover(vignette);
  }

  buildTopHud() {
    const P = HUD.portrait, B = HUD.bars, R = HUD.res;
    this.topShade = this.add.image(0, 0, shadeKey(this, 'cam:shade:top', HUD.shade.topH, HUD.shade.top, false))
      .setOrigin(0).setDisplaySize(W, HUD.shade.topH).setDepth(-4);
    this.bottomShade = this.add.image(0, H - HUD.shade.bottomH, shadeKey(this, 'cam:shade:bottom', HUD.shade.bottomH, HUD.shade.bottom, true))
      .setOrigin(0).setDisplaySize(W, HUD.shade.bottomH).setDepth(-4);

    // Round portrait of the active hero in the approved medallion; the gold arc is the XP progress.
    this.portraitGlow = this.add.image(P.x, P.y, 'fx_glow').setTint(COLORS.gold).setBlendMode('ADD').setScale(1).setAlpha(0.16);
    this.xpArc = this.add.graphics();
    this.xpBar = { trough: this.xpArc, setFraction: (f) => this.drawXpArc(f) };
    this.buildPortrait();
    this.portraitHit = this.add.zone(P.x, P.y, P.hit, P.hit).setInteractive({ useHandCursor: true });
    this.portraitHit.on('pointerdown', () => {
      if (this.modal) return;
      services.audio.play('ui_click');
      this.tweens.add({ targets: this.portrait, scale: '*=0.94', duration: 70, yoyo: true });
      this.openHeroProfile();
    });
    this.syncDot = this.add.circle(P.x + 38, P.y + 38, 8, 0x5fd68a).setStrokeStyle(2, 0x120b07, 0.9).setVisible(false);

    // Level and resources share one row; HP and mana are two stacked bars underneath.
    const label = { fontFamily: FONT, fontStyle: 'bold', color: '#fbefd2', shadow: SH, ...STROKE, strokeThickness: 4 };
    this.levelText = this.add.text(HUD.left, HUD.rowY, '', { ...label, fontSize: R.level }).setOrigin(0, 0.5);
    this.coinIcon = fit(this.add.image(0, HUD.rowY, 'icon_coin'), R.icon);
    this.coinText = this.add.text(0, HUD.rowY, '0', { ...label, fontSize: R.font }).setOrigin(0, 0.5);
    this.sapphireIcon = fit(this.add.image(0, HUD.rowY, 'icon_sapphire'), R.icon);
    this.sapphireText = this.add.text(0, HUD.rowY, '0', { ...label, fontSize: R.font }).setOrigin(0, 0.5);

    const width = B.right - B.x;
    const stat = (cfg, kind, icon) => {
      const bar = new UIBar(this, B.x, cfg.y, width, cfg.h, kind);
      const ic = fit(this.add.image(B.iconX, cfg.y, icon), B.icon);
      const tx = this.add.text(B.x + width / 2 + 8, cfg.y, '', { fontFamily: FONT, fontSize: B.font, fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
      return { bar, ic, tx };
    };
    const hp = stat(B.hp, 'hp', 'icon_heart'), mana = stat(B.mana, 'mana', 'icon_drop');
    this.hpBar = hp.bar; this.hpText = hp.tx; this.hpIcon = hp.ic;
    this.manaBar = mana.bar; this.manaText = mana.tx; this.manaIcon = mana.ic;
    this.statRow = { x0: HUD.left, right: B.right, y: B.mana.y, h: B.mana.h };
  }

  /** Round hero portrait: the approved gold medallion with the head-and-shoulders crop of the current hero inside. */
  buildPortrait() {
    const P = HUD.portrait, texture = currentHero().textures.down;
    this.portraitHero = currentHeroId();
    const key = `cam:portrait:${texture}:${P.size}`;
    ensureTexture(this, key, P.size, P.size, (ctx) => {
      ctx.drawImage(this.textures.get('ui_craft_medallion').getSourceImage(), 0, 0, P.size, P.size);
      const hero = this.textures.get(texture).getSourceImage();
      const side = Math.min(hero.width, hero.height * 0.6), r = P.size * 0.405;
      ctx.save();
      ctx.beginPath();
      ctx.arc(P.size / 2, P.size / 2, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(hero, (hero.width - side) / 2, hero.height * 0.02, side, side, P.size / 2 - r, P.size / 2 - r, r * 2, r * 2);
      ctx.restore();
    }, 0);
    if (this.portrait) this.portrait.setTexture(key).setDisplaySize(P.size, P.size);
    else this.portrait = this.add.image(P.x, P.y, key).setDisplaySize(P.size, P.size);
  }

  drawXpArc(fraction) {
    const P = HUD.portrait, g = this.xpArc, f = Math.min(1, Math.max(0, Number(fraction) || 0));
    g.clear();
    g.lineStyle(P.ringWidth, 0x120b07, 0.55).beginPath().arc(P.x, P.y, P.ring, 0, Math.PI * 2).strokePath();
    if (f > 0.004) g.lineStyle(P.ringWidth, 0xf0cc78, 1).beginPath().arc(P.x, P.y, P.ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f).strokePath();
  }

  /** Level, resources and XP come from GameState; the portrait follows the active hero. */
  refreshTopHud() {
    const s = services.state, xp = xpProgress(s);
    this.levelText.setText(`Ур. ${xp.level}`);
    this.xpBar.setFraction(xp.progress);
    this.coinText.setText(shortNumber(s.item('coins')));
    this.sapphireText.setText(shortNumber(s.sapphires()));
    this.layoutResources();
    const ses = services.session, st = ses?.ready ? ses.saving : null;
    this.syncDot.setVisible(!!st).setFillStyle(st === 'saved' ? 0x5fd68a : st === 'offline' ? 0xff6a5a : 0xe8c56a);
    if (this.portraitHero !== currentHeroId()) this.buildPortrait();
    this.xpInfo = xp;
  }

  layoutResources() {
    let x = this.levelText.x + this.levelText.width + HUD.gap;
    for (const [icon, text] of [[this.coinIcon, this.coinText], [this.sapphireIcon, this.sapphireText]]) {
      icon.setX(x + HUD.res.icon / 2);
      text.setX(x + HUD.res.icon + 6);
      x = text.x + text.width + HUD.gap;
    }
  }

  /** The study timer sits under the bars and only exists while a gift is being researched. */
  buildResearchLine() {
    this.researchText = this.add.text(HUD.left, HUD.topH + 6, '', {
      fontFamily: FONT, fontSize: UI.type.small, color: '#' + COLORS.telekinesis.toString(16).padStart(6, '0'),
      wordWrap: { width: HUD.bars.right - HUD.left }, stroke: '#000', strokeThickness: 4,
    });
  }

  levelFx() {
    const P = HUD.portrait;
    const ring = this.add.image(P.x, P.y, 'fx_ring').setTint(COLORS.gold).setBlendMode('ADD').setScale(0.4).setDepth(8000);
    this.viewport?.assign(ring, 'top');
    this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    this.tweens.add({ targets: this.levelText, scale: { from: 1.6, to: 1 }, duration: 500, ease: 'Back.easeOut' });
  }

  /** Where transient notices (hints, toasts, goal banner) begin: under the HUD and the comparison pill. */
  fieldTop() { return HUD.fieldTop; }

  showGoalBanner(text, title) {
    const old = UI.hud.top;
    UI.hud.top = HUD.fieldTop - 14;
    try { super.showGoalBanner(text, title); } finally { UI.hud.top = old; }
  }

  // ================================================================== journal and menu
  buildSideColumn() {
    const T = HUD.top;
    const make = (cfg, icon, size, onPress) => {
      const c = this.add.container(cfg.x, cfg.y).setDepth(60);
      const orb = addCraftMedallion(this, 0, 0, T.orb);
      const ic = fit(this.add.image(0, -1, icon), size);
      const hit = this.add.zone(0, 0, T.hit, T.hit).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        services.audio.play('ui_click');
        this.tweens.add({ targets: [orb, ic], scale: '*=0.92', duration: 70, yoyo: true });
        onPress();
      });
      c.add([orb, ic, hit]);
      return { c, orb, ic, hit, hitH: T.hit, homeY: cfg.y, size };
    };
    this.journalBtn = make(T.journal, 'icon_journal', T.icon, () => { if (!this.modal && this.mode === 'exploration') this.openJournal(); });
    this.journalBadge = this.add.container(30, -30);
    this.journalBadge.add([
      this.add.circle(0, 0, 18, 0xc8443a).setStrokeStyle(3, 0xf6e3a1),
      this.journalBadgeText = this.add.text(0, 0, '0', { fontFamily: FONT, fontSize: 24, fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5),
    ]);
    this.journalBtn.c.add(this.journalBadge);
    this.menuBtn = make(T.menu, 'icon_menu', 50, () => this.toggleMenu());
    this.layoutSideColumn();
  }

  /** The journal has no place in a fight; the menu stays where it is. */
  layoutSideColumn() {
    if (!this.journalBtn) return;
    const combat = this.mode === 'combat';
    this.journalBtn.c.setVisible(!combat);
    if (combat) this.journalBtn.hit.disableInteractive(); else this.journalBtn.hit.setInteractive({ useHandCursor: true });
    this.refreshSideBadge();
  }

  closeMenu(next = null) {
    const closed = super.closeMenu(next);
    // UIScene re-fits the menu icon to the classic size; restore this HUD's size.
    if (closed) fit(this.menuBtn.ic, this.menuBtn.size);
    return closed;
  }

  // ================================================================== bottom zone
  /** The four glowing parts every classic dock button consists of. */
  partsOf(b) { return [b.glow, b.orb, b.bg, b.icon, b.cd, b.cdText, b.lock, b.text].filter(Boolean); }

  /** The visible artwork of a dock cell (no zone, no cooldown overlay, no lock). */
  faceOf(b) { return [b.orb, b.icon, b.text]; }

  buildBottomBar() {
    this.buttons = {};
    const xs = DOCK_ROW.centers, y = DOCK_ROW.buttonY, P = HUD.tray.plate;
    // One container holds the production dock row. In a fight it stays exactly where it always was; in the
    // world it is a scaled-down tray that «Магия» opens, so the three working gifts remain one tap away.
    this.dockC = this.add.container(0, 0).setDepth(30);
    this.trayPlate = drawPlate(this.add.graphics(), P.w, P.h, { accent: COLORS.gold, fill: 0x140d09, alpha: 0.88, radius: 22 })
      .setPosition(P.x + P.w / 2, P.y + P.h / 2);
    this.trayBlocker = this.add.zone(P.x + P.w / 2, P.y + P.h / 2, P.w, P.h).setInteractive();
    this.dockC.add([this.trayPlate, this.trayBlocker]);
    this.dock = [0, 1, 2].map((i) => {
      const slot = { id: null };
      const def = ABILITIES[ABILITY_ORDER[i]];
      slot.btn = this.makeButton(xs[i], y, `icon_${ABILITY_ORDER[i]}`, def.name, COLORS[def.color], () => this.pressDock(i));
      this.dockC.add(this.partsOf(slot.btn));
      return slot;
    });
    this.refreshDock();
    // Fourth cell: every gift (opens the existing gifts window) in the tray, the dimmed bag in a fight.
    this.giftCell = this.makeButton(xs[3], y, 'icon_settings', 'Все дары', COLORS.gold, () => { this.closeTray(); this.bus.emit(MSG.OPEN_GIFTS); });
    this.combatBag = this.makeButton(xs[3], y, 'icon_bag', 'Сумка', COLORS.gold, () => {});
    this.combatBag.bg.disableInteractive();
    this.combatBag.orb.setAlpha(0.4);
    this.combatBag.icon.setAlpha(0.4);
    this.dockC.add([...this.partsOf(this.giftCell), ...this.partsOf(this.combatBag)]);

    const [magicX, bagX] = barCenters();
    this.magicBtn = this.makePlate(magicX, HUD.bar.y, 'icon_seal', 'Магия', COLORS.telekinesis, () => this.toggleTray());
    this.bagBtn = this.makePlate(bagX, HUD.bar.y, 'icon_bag', 'Сумка', COLORS.gold, () => this.bus.emit(MSG.OPEN_BAG));
    this.buttons.bag = this.bagBtn;

    this.layoutDock(this.mode);
    for (const part of [this.dockC, this.magicBtn.c, this.bagBtn.c]) this.viewport?.assign(part, 'bottom');
  }

  /** Wide wooden plate with the approved medallion on its left end. */
  makePlate(cx, cy, iconKey, label, color, onPress) {
    const B = HUD.bar, ox = -B.w / 2 + 56;
    const c = this.add.container(cx, cy).setDepth(30);
    const glow = this.add.image(ox, 0, 'fx_glow').setTint(color).setBlendMode('ADD').setScale(1.5).setAlpha(0);
    const plate = drawPlate(this.add.graphics(), B.w, B.h, { accent: COLORS.gold, fill: 0x1a120d, alpha: 0.9, radius: 26 });
    const orb = addCraftMedallion(this, ox, 0, B.medallion);
    const icon = fit(this.add.image(ox, -1, iconKey), B.icon);
    const text = this.add.text(ox + 56 + (B.w - 56 - 56) / 2 - 4, 0, label, { fontFamily: FONT, fontSize: B.font, fontStyle: 'bold', color: '#fbefd2', shadow: SH, ...STROKE, strokeThickness: 4 }).setOrigin(0.5);
    const hit = this.add.zone(0, 0, B.w, B.hit).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      if (this.modal) return;
      services.audio.play('ui_click');
      this.tweens.add({ targets: c, scale: 0.96, duration: 70, yoyo: true });
      onPress();
    });
    c.add([glow, plate, orb, icon, text, hit]);
    return { x: cx, y: cy, w: B.w, c, glow, plate, orb, icon, text, hit, bg: hit, color };
  }

  /** Combat keeps the production dock row; in the world the row is a closed tray until «Магия» is pressed. */
  layoutDock(mode) {
    const combat = mode === 'combat', T = HUD.tray;
    this.tweens.killTweensOf(this.dockC);
    this.trayOpen = false;
    if (combat) this.dockC.setPosition(0, 0).setScale(1).setAlpha(1).setVisible(true);
    else this.dockC.setPosition(T.x, T.y).setScale(T.scale).setAlpha(0).setVisible(false);
    this.trayPlate.setVisible(!combat);
    // The tray is scaled down, so its captions are set larger to stay readable on small phones.
    for (const b of [...this.dock.map(d => d.btn), this.giftCell]) b.text.setFontSize(combat ? UI.type.small : HUD.tray.label);
    // These two cells are never locked: only their artwork is toggled, never the (always hidden) lock icon.
    for (const part of this.faceOf(this.giftCell)) part.setVisible(!combat);
    for (const part of this.faceOf(this.combatBag)) part.setVisible(combat);
    // Zones cannot be hidden: switch their input instead so no invisible control catches a touch.
    if (combat) { this.trayBlocker.disableInteractive(); this.giftCell.bg.disableInteractive(); }
    else { this.trayBlocker.setInteractive(); this.giftCell.bg.setInteractive({ useHandCursor: true }); }
    this.magicBtn?.c.setVisible(!combat);
    this.bagBtn?.c.setVisible(!combat);
  }

  setMode(mode) {
    super.setMode(mode);
    this.layoutDock(mode);
    this.layoutSideColumn();
  }

  buildContextButton() {
    super.buildContextButton();
    this.ctx.setPosition(HUD.ctx.x, HUD.ctx.y);
  }

  toggleTray() { if (this.trayOpen) this.closeTray(); else this.openTray(); }

  openTray() {
    if (this.mode !== 'exploration' || this.modal || this.trayOpen || services.dialogue?.active) return;
    this.trayOpen = true;
    const T = HUD.tray;
    this.tweens.killTweensOf(this.dockC);
    this.dockC.setPosition(T.x, T.y + 28).setAlpha(0).setVisible(true);
    this.tweens.add({ targets: this.dockC, alpha: 1, y: T.y, duration: 170, ease: 'Cubic.easeOut' });
  }

  closeTray() {
    if (!this.trayOpen) return;
    this.trayOpen = false;
    this.tweens.killTweensOf(this.dockC);
    this.tweens.add({ targets: this.dockC, alpha: 0, duration: 120, onComplete: () => { if (!this.trayOpen && this.mode === 'exploration') this.dockC.setVisible(false); } });
  }

  closeTrayNow() {
    if (this.mode !== 'exploration' || !this.dockC) return;
    this.trayOpen = false;
    this.tweens.killTweensOf(this.dockC);
    this.dockC.setAlpha(0).setVisible(false);
  }

  /** A gift cast from the tray closes it again, so the world is not covered longer than needed. */
  pressDock(i) {
    super.pressDock(i);
    if (this.mode === 'exploration') this.time.delayedCall(140, () => this.closeTray());
  }

  // ================================================================== frame update
  update(time, delta) {
    super.update(time, delta);
    if (this.portraitHero !== currentHeroId()) this.buildPortrait();
    const windowOpen = !!(services.modalOpen || this.modal);
    if (windowOpen !== this.windowFlag) { this.windowFlag = windowOpen; document.body.classList.toggle('camera-window', windowOpen); }
    if (this.mode !== 'exploration') return;
    if (this.trayOpen && this.touch?.moved) this.closeTray();   // walking away puts the tray away
    // The main «Магия» button hints that a gift is ready for the focused object, and glows while its tray is open.
    const provider = this.registry.get('abilityProvider');
    const suggested = !this.trayOpen && !!provider && this.dock.some(({ id }) => id && provider(id)?.suggested);
    const glow = this.magicBtn.glow;
    if (this.trayOpen) glow.setAlpha(0.35);
    else if (suggested) glow.setAlpha(0.4 + Math.sin(time / 140) * 0.25);
    else glow.setAlpha(Math.max(0, glow.alpha - 0.05));
  }

  // ================================================================== touch targets and page anchors
  /** Keep every control at least 44 CSS px: logical sizes grow on narrow phones, never beyond the neighbour's edge. */
  applyHitSizes() {
    const k = cssPerUnit(this.scale.displaySize.width, this.scale.gameSize.width);
    const T = HUD.top, B = HUD.bar;
    const portrait = touchSize(k, HUD.portrait.hit);
    this.portraitHit.setSize(portrait, portrait);
    const top = touchSize(k, T.hit, Math.abs(T.menu.x - T.journal.x));
    for (const b of [this.journalBtn, this.menuBtn]) b.hit.setSize(top, top);
    const bar = touchSize(k, B.hit);
    for (const b of [this.magicBtn, this.bagBtn]) b.hit.setSize(B.w, bar);
  }

  /** The HTML comparison pill sits under the in-game HUD, wherever the canvas is on the page. */
  syncDomAnchors() {
    const canvas = this.game.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect(), k = cssPerUnit(rect.width, this.scale.gameSize.width);
    const style = document.documentElement.style;
    style.setProperty('--camera-panel-top', `${Math.round(rect.top + (HUD.topH + 10) * k)}px`);
    style.setProperty('--camera-panel-left', `${Math.round(rect.left + 10)}px`);
  }
}
