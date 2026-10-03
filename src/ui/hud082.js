// v0.8.2 — компактный мобильный HUD: портрет (профиль героя), уровень и опыт, ресурсы, HP и мана в одном ряду,
// правая колонка «Журнал / Меню», раскрывающееся меню 3×2, заглушки разделов и временное уведомление о цели.
// Методы подмешиваются в UIScene (как windows08), поэтому `this` — UIScene. Размеры — UI.hud / UI.side / UI.menu.
import { VIEW, COLORS } from '../config/game.config.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { UI } from '../config/ui.config.js';
import { MENU_ITEMS, STUB_TEXT } from '../config/menu.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { xpProgress } from '../state/heroProgress.js';
import * as vitals from '../state/vitals.js';
import { ABILITY_ORDER } from '../systems/AbilitySystem.js';
import { ROMAN } from '../objects/InteractiveObject.js';
import { ensureTexture, addOrb, addMedallion, drawPlate, UIBar } from './widgets.js';

const FONT = UI.font;
const SH = UI.shadow;
const W = VIEW.width;
const H = VIEW.height;
const fit = (img, size) => { img.setScale(size / Math.max(img.width, img.height, 1)); return img; };
const STROKE = { stroke: '#120b07', strokeThickness: 5 };

/** Вертикальное затемнение: from — непрозрачность у края, к другому краю — 0. */
function shade(scene, key, h, from, up) {
  ensureTexture(scene, key, W, h, (ctx, w, hh) => {
    const g = ctx.createLinearGradient(0, up ? hh : 0, 0, up ? 0 : hh);
    g.addColorStop(0, `rgba(12,7,4,${from})`);
    g.addColorStop(0.5, `rgba(12,7,4,${from * 0.55})`);
    g.addColorStop(1, 'rgba(12,7,4,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hh);
  }, 0);
  return key;
}

export const hud082 = {
  // ================================================================== верхний HUD
  buildTopHud() {
    const T = UI.hud;
    this.topShade = this.add.image(0, 0, shade(this, 'ui:shade:top', 250, T.shade, false)).setOrigin(0).setDisplaySize(W, 250).setDepth(-4);
    this.bottomShade = this.add.image(0, H - 270, shade(this, 'ui:shade:bottom', 270, T.bottomShade, true)).setOrigin(0).setDisplaySize(W, 270).setDepth(-4);

    // портрет — кнопка профиля героя
    this.portraitGlow = this.add.image(T.portraitX, T.portraitY, 'fx_glow').setTint(COLORS.gold).setBlendMode('ADD').setScale(1.1).setAlpha(0.18);
    this.portrait = addMedallion(this, T.portraitX, T.portraitY, T.portrait, COLORS.gold);
    this.portraitHit = this.add.zone(T.portraitX, T.portraitY, T.portraitHit, T.portraitHit).setInteractive({ useHandCursor: true });
    this.portraitHit.on('pointerdown', () => {
      if (this.modal) return;
      services.audio.play('ui_click');
      this.tweens.add({ targets: this.portrait, scale: '*=0.94', duration: 70, yoyo: true });
      this.openHeroProfile();
    });
    this.syncDot = this.add.circle(T.portraitX + 40, T.portraitY + 40, 8, 0x5fd68a).setStrokeStyle(2, 0x120b07, 0.9).setVisible(false);

    // уровень, полоса опыта, сколько осталось
    const x0 = T.portraitX + T.portrait / 2 + 14;          // 138
    this.levelText = this.add.text(x0, 38, '', { fontFamily: FONT, fontSize: T.level, fontStyle: 'bold', color: '#fbefd2', shadow: SH, ...STROKE }).setOrigin(0, 0.5);
    this.xpBarX = x0 + 92;
    this.xpBar = new UIBar(this, this.xpBarX, 34, T.xp.w, T.xp.h, 'xp');
    this.xpCaption = this.add.text(this.xpBarX - 2, 70, '', { fontFamily: FONT, fontSize: T.caption, color: '#fbefd2', shadow: SH, ...STROKE, strokeThickness: 4 }).setOrigin(0, 0.5);

    // ресурсы: монеты и лунные осколки — столбиком, чтобы длинные числа не наезжали на соседей
    const rx = this.xpBarX + T.xp.w + 36;                  // центр иконок (≈ 446): справа до колонки — место под 7 цифр
    this.resX = rx;
    this.coinIcon = fit(this.add.image(rx, 32, 'icon_coin'), T.resIcon);
    this.coinText = this.add.text(rx + 24, 32, '0', { fontFamily: FONT, fontSize: T.resNumber, fontStyle: 'bold', color: '#fbefd2', shadow: SH, ...STROKE, strokeThickness: 4 }).setOrigin(0, 0.5);
    this.shardIcon = fit(this.add.image(rx, 74, 'icon_shard'), T.resIcon);
    this.shardText = this.add.text(rx + 24, 74, '0', { fontFamily: FONT, fontSize: T.resNumber, fontStyle: 'bold', color: '#fbefd2', shadow: SH, ...STROKE, strokeThickness: 4 }).setOrigin(0, 0.5);

    // HP и мана в одном ряду
    const rowY = 124, gap = 14, right = UI.side.x - UI.side.hitW / 2 - 8;   // правая граница — до колонки Журнал/Меню
    const bw = Math.floor((right - x0 - gap) / 2);
    const stat = (x, kind, icon) => {
      const bar = new UIBar(this, x, rowY, bw, T.statH, kind);
      const ic = fit(this.add.image(x + 24, rowY, icon), T.statIcon);
      const tx = this.add.text(x + bw / 2 + 16, rowY, '', { fontFamily: FONT, fontSize: T.number, fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
      return { bar, ic, tx };
    };
    const hp = stat(x0, 'hp', 'icon_heart'), mana = stat(x0 + bw + gap, 'mana', 'icon_drop');
    this.hpBar = hp.bar; this.hpText = hp.tx; this.hpIcon = hp.ic;
    this.manaBar = mana.bar; this.manaText = mana.tx; this.manaIcon = mana.ic;
    this.statRow = { x0, right, y: rowY, h: T.statH };
  },

  /** Уровень, опыт и ресурсы из состояния игры (после опыта, нового уровня, загрузки и восстановления с сервера). */
  refreshTopHud() {
    const s = services.state;
    const xp = xpProgress(s);
    this.levelText.setText(`Ур. ${xp.level}`);
    this.xpBar.setFraction(xp.progress);
    this.xpCaption.setText(xp.caption);
    // подпись под полосой; если длинная (например, «Максимальный уровень») — начинается под «Ур. N», чтобы не задеть ресурсы
    const roomUnderBar = this.resX - UI.hud.resIcon / 2 - 10 - this.xpBarX;
    this.xpCaption.setX(this.xpCaption.width <= roomUnderBar ? this.xpBarX - 2 : this.levelText.x);
    this.coinText.setText(String(s.item('coins')));
    this.shardText.setText(String(s.item('lunar_shard')));
    const ses = services.session;
    const st = ses?.ready ? ses.saving : null;
    this.syncDot.setVisible(!!st).setFillStyle(st === 'saved' ? 0x5fd68a : st === 'offline' ? 0xff6a5a : 0xe8c56a);
    this.xpInfo = xp;
  },

  // ================================================================== правая колонка: Журнал над Меню
  buildSideColumn() {
    const S = UI.side;
    const make = (y, icon, label, onPress) => {
      const c = this.add.container(S.x, y).setDepth(60);
      const orb = addOrb(this, 0, 0, S.orb, COLORS.gold, { gem: false });
      const ic = fit(this.add.image(0, -2, icon), S.icon);
      const text = this.add.text(0, S.orb / 2 + 4, label, { fontFamily: FONT, fontSize: S.label, color: '#fbefd2', shadow: SH, ...STROKE, strokeThickness: 4 }).setOrigin(0.5, 0);
      const hitH = S.orb / 2 + 4 + 30 + S.orb / 2 + 4;     // кружок + подпись
      const hit = this.add.zone(0, hitH / 2 - S.orb / 2 - 4, S.hitW, hitH).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        services.audio.play('ui_click');
        this.tweens.add({ targets: [orb, ic], scale: '*=0.92', duration: 70, yoyo: true });
        onPress();
      });
      c.add([orb, ic, text, hit]);
      return { c, orb, ic, text, hit, hitH, homeY: y };
    };
    this.journalBtn = make(S.journalY, 'icon_journal', 'Журнал', () => { if (!this.modal && this.mode === 'exploration') this.openJournal(); });
    this.journalBadge = this.add.container(34, -34);
    this.journalBadge.add([
      this.add.circle(0, 0, S.badgeR, 0xc8443a).setStrokeStyle(3, 0xf6e3a1),
      this.journalBadgeText = this.add.text(0, 0, '0', { fontFamily: FONT, fontSize: S.badge, fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5),
    ]);
    this.journalBtn.c.add(this.journalBadge);
    this.menuBtn = make(S.menuY, 'icon_menu', 'Меню', () => this.toggleMenu());
    this.layoutSideColumn();
  },

  /** В бою Журнала нет (как и раньше), Меню поднимается на его место. */
  layoutSideColumn() {
    if (!this.journalBtn) return;
    const combat = this.mode === 'combat';
    this.journalBtn.c.setVisible(!combat);
    if (combat) this.journalBtn.hit.disableInteractive(); else this.journalBtn.hit.setInteractive({ useHandCursor: true });
    this.menuBtn.c.setY(combat ? UI.side.journalY : UI.side.menuY);
    this.refreshSideBadge();
  },

  /** Число на значке Журнала — активные и готовые к сдаче задания (реальное значение). */
  refreshSideBadge() {
    if (!this.journalBadge) return;
    const n = services.log ? services.log.activeCount() : 0;
    this.journalBadge.setVisible(n > 0);
    this.journalBadgeText.setText(String(n));
  },

  /** Где начинается свободное поле под колонкой справа (подсказки, тосты, стрелка). */
  fieldTop() {
    const S = UI.side;
    return S.menuY + S.orb / 2 + 4 + 30 + 20;            // ≈ 314
  },

  // ================================================================== временное уведомление о цели
  showGoalBanner(text, title = 'Новая цель') {
    if (!text || this.mode === 'combat') return;
    this.goalBanner?.destroy();
    const w = UI.side.x - UI.side.hitW / 2 - 8 - 20;      // слева от колонки Журнал/Меню
    const cx = 20 + w / 2;
    const head = this.add.text(0, 0, '✦ ' + title, { fontFamily: FONT, fontSize: UI.type.small, fontStyle: 'bold', color: COLORS.textGold }).setOrigin(0.5, 0);
    const body = this.add.text(0, 0, text, { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.text, align: 'center', wordWrap: { width: w - 40 }, lineSpacing: 2 }).setOrigin(0.5, 0);
    const h = head.height + body.height + 30;
    head.setY(-h / 2 + 12); body.setY(head.y + head.height + 4);
    const bg = drawPlate(this.add.graphics(), w, h, { accent: COLORS.gold, fill: 0x120d0b, alpha: 0.86, radius: 14 });
    const top = UI.hud.top + 14 + (this.researchText?.text ? 26 : 0);
    const c = this.add.container(cx, top + h / 2, [bg, head, body]).setDepth(8200).setAlpha(0);
    c.bannerText = text;
    this.goalBanner = c;
    this.tweens.add({ targets: c, alpha: 1, y: { from: top + h / 2 - 10, to: top + h / 2 }, duration: 220 });
    this.time.delayedCall(UI.banner.ms, () => {
      if (this.goalBanner !== c) return;
      this.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => { if (this.goalBanner === c) this.goalBanner = null; c.destroy(); } });
    });
  },

  // ================================================================== меню
  toggleMenu() {
    if (this.modal?.menu) this.closeMenu();
    else if (!this.modal) this.openMenu();
  },

  openMenu() {
    if (this.modal) return;
    const M = UI.menu;
    services.modalOpen = true;
    this.resetJoystick();
    this.pointer?.setVisible(false);
    if (this.goalBanner) { this.goalBanner.destroy(); this.goalBanner = null; }   // уведомление не просвечивает сквозь меню
    services.audio.play('modal_open');
    const overlay = this.add.rectangle(0, 0, W, H, 0x000000, M.dim).setOrigin(0).setDepth(9400).setInteractive();
    overlay.on('pointerdown', () => { services.audio.play('ui_back'); this.closeMenu(); });   // касание снаружи только закрывает
    const pw = M.cellW * M.cols + 32, rows = Math.ceil(MENU_ITEMS.length / M.cols);
    const ph = 84 + rows * M.rowH + 8;
    const left = M.left, top = M.top;
    const c = this.add.container(0, 0).setDepth(9500);
    const bg = drawPlate(this.add.graphics(), pw, ph, { accent: COLORS.gold, fill: 0x120d0b, alpha: 0.93, radius: 18 }).setPosition(left + pw / 2, top + ph / 2);
    const blocker = this.add.zone(left + pw / 2, top + ph / 2, pw, ph).setInteractive();   // касание по фону панели не закрывает меню
    const title = this.add.text(left + pw / 2, top + 22, 'Меню', { fontFamily: FONT, fontSize: UI.type.title, fontStyle: 'bold', color: COLORS.textGold, shadow: SH }).setOrigin(0.5, 0);
    c.add([bg, blocker, title]);
    const items = MENU_ITEMS.map((item, i) => {
      const col = i % M.cols, row = Math.floor(i / M.cols);
      const cx = left + 16 + M.cellW * (col + 0.5), cy = top + 84 + row * M.rowH + M.orb / 2 + 4;
      const orb = addOrb(this, cx, cy, M.orb, COLORS.gold, { gem: false });
      const icon = fit(this.add.image(cx, cy, item.icon), M.icon);
      const text = this.add.text(cx, cy + M.orb / 2 + 6, item.label, { fontFamily: FONT, fontSize: M.label, color: COLORS.text, shadow: SH }).setOrigin(0.5, 0);
      const hit = this.add.zone(cx, cy + 18, M.cellW - 8, M.hit + 30).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        services.audio.play('ui_click');
        this.onMenuItem(item);
      });
      c.add([orb, icon, text, hit]);
      return { item, orb, icon, text, hit };
    });
    c.setAlpha(0).setX(36);
    this.tweens.add({ targets: c, alpha: 1, x: 0, duration: M.animMs, ease: 'Cubic.easeOut' });
    this.menuBtn.c.setDepth(9600);
    this.menuBtn.ic.setTexture('icon_close'); fit(this.menuBtn.ic, UI.side.icon * 0.8);
    this.modal = { menu: true, container: c, overlay, buttons: [], views: [], items, final: false, top, height: ph, left, width: pw };
    this.bus.emit(MSG.MODAL_OPEN);
  },

  /**
   * Закрыть меню и освободить его состояние. next — следующее окно: открывается только после того,
   * как меню полностью закрыто (иначе openSettings/openModal увидят занятый this.modal).
   */
  closeMenu(next = null) {
    const m = this.modal;
    if (!m?.menu) return false;
    this.tweens.killTweensOf(m.container);
    m.container.destroy();
    m.overlay.destroy();
    this.modal = null;
    services.modalOpen = false;
    this.menuBtn.c.setDepth(60);
    this.menuBtn.ic.setTexture('icon_menu'); fit(this.menuBtn.ic, UI.side.icon);
    this.bus.emit(MSG.MODAL_CLOSED);
    if (next) next();
    else if (!this.modal && this.modalQueue.length) this.openModal(this.modalQueue.shift());
    return true;
  },

  onMenuItem(item) {
    if (!this.modal?.menu) return;
    this.closeMenu(() => (item.stub ? this.openStub(item) : this.openSettings()));
  },

  /** Раздел в разработке: понятный ответ на нажатие, без каких-либо изменений в игре. */
  openStub(item) {
    this.openModal({
      title: item.label, color: COLORS.gold,
      text: STUB_TEXT + (item.note ? '\n\n' + item.note : ''),
      buttons: [{ label: 'Закрыть', primary: true, cancel: true }],
      stub: item.id,
    });
  },

  // ================================================================== профиль героя (по портрету)
  openHeroProfile() {
    if (this.modal) return;
    const s = services.state, d = s.data, hs = s.heroStats();
    const xp = xpProgress(s);
    const hud = vitals.view(s);   // v0.9: те же общие запасы, что в HUD и бою
    const ses = services.session;
    const content = {
      build: (c, x, y, w) => {
        let cy = y;
        const medal = addMedallion(this, x + 60, cy + 60, 120, COLORS.gold);
        c.add(medal);
        const tx = x + 140;
        const lv = this.add.text(tx, cy + 4, `Уровень ${xp.level}`, { fontFamily: FONT, fontSize: UI.type.title, fontStyle: 'bold', color: COLORS.textGold, shadow: SH });
        c.add(lv);
        const barW = w - 140, barY = cy + 62;
        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.55).fillRoundedRect(tx, barY, barW, 20, 10);
        if (xp.progress > 0) g.fillStyle(0xe8c56a, 1).fillRoundedRect(tx + 2, barY + 2, Math.max(16, (barW - 4) * xp.progress), 16, 8);
        g.lineStyle(2, 0xd9b45a, 0.8).strokeRoundedRect(tx, barY, barW, 20, 10);
        c.add(g);
        const cap = this.add.text(tx, barY + 30, `${xp.caption}${xp.max ? '' : ` · всего ${d.heroXP}`}`, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH, wordWrap: { width: barW } });
        c.add(cap);
        cy = Math.max(cy + 132, barY + 30 + cap.height + 14);
        if (ses?.registered && ses.nickname) {
          const nick = this.add.text(x, cy, `Ник: ${ses.nickname}`, { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.text, shadow: SH, wordWrap: { width: w, useAdvancedWrap: true } });
          c.add(nick); cy += nick.height + 12;
        } else if (ses) {
          const g2 = this.add.text(x, cy, 'Гость — прогресс хранится на этом устройстве', { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.textDim, wordWrap: { width: w } });
          c.add(g2); cy += g2.height + 12;
        }
        const row = (icon, label, value, color = COLORS.text) => {
          if (icon) c.add(fit(this.add.image(x + 20, cy + 20, icon), 36));
          const l = this.add.text(x + (icon ? 52 : 0), cy + 20, label, { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.text, shadow: SH }).setOrigin(0, 0.5);
          const v = this.add.text(x + w, cy + 20, value, { fontFamily: FONT, fontSize: UI.type.body, fontStyle: 'bold', color, shadow: SH }).setOrigin(1, 0.5);
          c.add([l, v]); cy += 48;
        };
        row('icon_heart', 'Здоровье', `${Math.ceil(hud.hp)} / ${hud.maxHp}`);
        row('icon_drop', 'Мана', `${Math.floor(hud.mana)} / ${hud.maxMana}`);
        row(null, 'Восстановление маны', `${hs.manaRegen} в секунду`);
        row(null, 'Сила магии', `×${hs.damageMult.toFixed(2)}`);
        row('icon_coin', 'Монеты', String(s.item('coins')), COLORS.textGold);
        row('icon_shard', 'Лунные осколки', String(s.item('lunar_shard')), COLORS.textGold);
        cy += 6;
        const gifts = ABILITY_ORDER.map((id) => {
          const lv2 = services.abilities.level(id);
          return `${ABILITIES[id].name} ${lv2 ? ROMAN[lv2] : '— не открыт'}`;
        }).join(' · ');
        const gt = this.add.text(x, cy, `Дары: ${gifts}`, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.textDim, wordWrap: { width: w }, lineSpacing: 2 });
        c.add(gt); cy += gt.height + 8;
        return cy - y;
      },
    };
    const buttons = [{ label: 'Закрыть', primary: true, cancel: true }];
    if (ses && this.mode === 'exploration') buttons.push({ label: 'Аккаунт', onClick: () => this.openAccount() });   // окно героя уже закрыто
    this.openModal({ title: 'Героиня', color: COLORS.gold, content, buttons, profile: true });
  },
};
