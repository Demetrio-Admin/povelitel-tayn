import Phaser from 'phaser';
import { VIEW, COLORS } from '../config/game.config.js';
import { GAME_NAME, GAME_SUBTITLE } from '../config/branding.js';
import { services, resetProgress, reloadToMenu, heroIdNow } from '../services.js';
import { showLogin, showProfile, showRegister, showLoading, showNotice } from '../ui/accountUI.js';
import { showChat } from '../ui/ChatWindow.js';
import { errorText, CloudError } from '../cloud/api.js';
import { startGame } from './PreloadScene.js';
import { buildSettingsPanel } from '../ui/SettingsPanel.js';
import { buildHeroPicker } from '../ui/heroPicker.js';
import { DEFAULT_HERO_ID } from '../config/heroes.js';
import { UI } from '../config/ui.config.js';
import { addPanel, addDivider, addButton } from '../ui/widgets.js';
import { bindSceneViewport } from '../ui/viewport.js';

const FONT = UI.font;
const SH = UI.shadow;
const W = VIEW.width;
const H = VIEW.height;
const PRIMARY_Y = 1096, PRIMARY_H = 104, SECOND_Y = 1192;

/**
 * MenuScene — стартовый экран (v0.9.2: выбор героя прямо здесь, без отдельного экрана).
 *
 * Новый игрок (онлайн без входа или без сервера и без сохранения): переключатель «Ведьма | Колдун», один крупный
 *   предпросмотр, «Начать игру». Онлайн дальше — «Как продолжить?»: гость / создать аккаунт / войти. Выбранный герой
 *   передаётся только при создании персонажа (create_player) или явной новой игре (reset_player / локальное сохранение).
 *   Вход в существующий аккаунт загружает героя аккаунта, какой бы предпросмотр ни был выбран.
 * Игрок с сохранением: предпросмотр — его герой (без переключателя), главное действие — «Продолжить».
 *   Без сервера есть «Новая игра»: сначала подтверждение, затем выбор героя; сохранение заменяется только при «Начать игру».
 * Переключение предпросмотра ничего не сохраняет, не создаёт профиль и не сбрасывает игру.
 * Первое нажатие здесь же «разблокирует» звук в браузере.
 */
export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  init(data = {}) {
    this.newGameMode = !!data.newGame;   // без сервера: «Новая игра» после подтверждения
    this.previewHero = data.hero || null;
  }

  create() {
    this.viewport = bindSceneViewport(this);
    const { audio } = services;
    const session = services.session;
    this.overlay = null;
    this.starting = false;
    this.busy = false;
    this.htmlDlg = null;   // окно регистрации / входа из «Как продолжить?»
    this.buildBackground();

    this.add.text(W / 2, 132, GAME_NAME, { fontFamily: FONT, fontSize: '82px', fontStyle: 'bold', color: '#f6e3a1', stroke: '#170e1d', strokeThickness: 5, shadow: { offsetX: 0, offsetY: 4, color: '#000', blur: 12, fill: true } }).setOrigin(0.5).setDepth(5);
    this.add.text(W / 2, 216, GAME_SUBTITLE, { fontFamily: FONT, fontSize: '34px', color: COLORS.textGold, stroke: '#170e1d', strokeThickness: 2, shadow: SH }).setOrigin(0.5).setDepth(5);
    addDivider(this, W / 2, 266, 420).setDepth(5);
    this.settingsButton = this.add.image(656, 58, 'welcome_settings').setDisplaySize(44, 44).setDepth(6);
    this.add.rectangle(656, 58, 88, 88, 0, 0).setDepth(7).setInteractive().on('pointerup', () => {
      if (this.overlay || this.choice || this.htmlDlg || this.busy) return;
      services.audio.unlock(); services.audio.play('ui_click'); this.openSettings();
    });

    const { state } = services;
    const localSave = !session && state.hasSave() && state.data.completedEvents.length > 0;
    this.mode = session?.status === 'banned' ? 'restricted' : session?.ready ? 'continue-online'
      : session ? 'new-online'
        : (localSave && !this.newGameMode) ? 'continue-local' : 'new-local';
    const isNew = this.mode.startsWith('new');

    // предпросмотр: новый игрок — выбранный вариант (по умолчанию ведьма), игрок с сохранением — его герой
    const heroId = isNew ? (this.previewHero || DEFAULT_HERO_ID) : heroIdNow();
    this.picker = buildHeroPicker(this, {
      heroId, interactive: isNew, depth: 5,
      onChange: () => { services.audio.unlock(); services.audio.play('ui_click'); },
    });

    if (this.mode === 'restricted') {
      this.line('Доступ к игре ограничен', COLORS.textGold, 914);
      this.line('Поддержка и обжалование доступны', COLORS.textDim, 966, UI.type.small);
      this.primary = this.button(PRIMARY_Y, 'Открыть поддержку', true, () => this.openRestrictedChat(), PRIMARY_H);
      this.accountButton = this.pair('Профиль', () => this.openRestrictedChat(), 'Выйти', async () => { await session.logout(); reloadToMenu(); });
    } else if (this.mode === 'continue-online') {
      this.line(session.registered ? `${session.nickname} · уровень ${session.level}` : `Гость · уровень ${session.level}`, COLORS.textGold, 950);
      this.primary = this.button(PRIMARY_Y, 'Продолжить', true, () => this.begin(), PRIMARY_H);
      this.accountButton = this.link(SECOND_Y, 'Профиль', () => this.openProfile());
    } else if (this.mode === 'new-online') {
      this.primary = this.button(PRIMARY_Y, 'Начать приключение', true, () => this.startNew(), PRIMARY_H, 536);
      this.accountButton = this.link(SECOND_Y, 'Уже играли? Войти', () => this.openLogin());
    } else if (this.mode === 'continue-local') {
      const d = state.data;
      this.line(`Уровень ${d.heroLevel}`, COLORS.textGold, 950, UI.type.body);
      this.primary = this.button(PRIMARY_Y, 'Продолжить', true, () => this.begin(), PRIMARY_H);
      this.link(SECOND_Y, 'Новая игра', () => this.confirmNew());
    } else {
      this.primary = this.button(PRIMARY_Y, 'Начать приключение', true, () => this.startNew(), PRIMARY_H, 536);
      if (this.newGameMode) this.link(SECOND_Y, 'Назад', () => this.scene.restart({}));
    }

    const kb = this.input.keyboard;
    const enter = () => { if (this.overlay || this.choice || this.htmlDlg) return; if (isNew) this.startNew(); else this.begin(); };
    kb.on('keydown-ENTER', enter);
    kb.on('keydown-SPACE', enter);
    kb.on('keydown-ESC', () => this.back());
    if (isNew) {
      kb.on('keydown-LEFT', () => { if (!this.overlay && !this.choice) this.picker.select('witch', true); });
      kb.on('keydown-RIGHT', () => { if (!this.overlay && !this.choice) this.picker.select('warlock', true); });
    }

    this.cameras.main.fadeIn(400);
    audio.setMusic('explore');
  }

  /** Выбранный в предпросмотре герой. */
  get hero() { return this.picker.id; }

  line(text, color, y, size = UI.type.body) {
    return this.add.text(W / 2, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 4, align: 'center', wordWrap: { width: 640 } }).setOrigin(0.5).setDepth(5);
  }

  /** HTML-окно поверх меню: пока оно открыто, кнопки меню не реагируют. */
  openHtml(open) {
    this.overlay = { destroy: () => { const h = this.htmlWindow; this.htmlWindow = null; h?.close?.(); } };
    this.htmlWindow = open(() => { this.overlay = null; this.htmlWindow = null; });
  }

  openLogin() {
    this.openHtml((closed) => showLogin(services.session, { onCancel: closed, onDone: () => { closed(); this.begin(); } }));
  }

  openProfile() {
    this.openHtml((closed) => showProfile(services.session, {
      onClose: () => { closed(); if (!this.starting) this.scene.restart(); },
      onLogout: () => reloadToMenu(),
      onSwitched: () => reloadToMenu(),
    }));
  }

  buildBackground() {
    const cover = this.add.image(W / 2, H / 2, 'welcome_cover').setDisplaySize(W, H);
    this.viewport?.cover(cover);
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.add.particles(0, 0, 'fx_dot', {
      x: { min: 70, max: W - 70 }, y: { min: 350, max: 860 }, lifespan: 5000,
      speedY: { min: -12, max: -3 }, speedX: { min: -5, max: 5 },
      scale: { start: 0.2, end: 0 }, alpha: { start: 0.65, end: 0 },
      tint: [0xf7d270, 0xe8c56a], blendMode: 'ADD', frequency: 650,
    });
  }

  /** Общий фон меню. */
  static background(scene) { MenuScene.prototype.buildBackground.call(scene); }

  link(y, label, onPress) {
    const text = this.add.text(W / 2, y, label, { fontFamily: FONT, fontSize: UI.type.body,
      color: COLORS.textGold, shadow: SH, stroke: '#100e16', strokeThickness: 2 }).setOrigin(0.5).setDepth(5);
    const hit = this.add.rectangle(W / 2, y, Math.max(280, text.width + 40), 88, 0, 0).setDepth(6).setInteractive();
    hit.on('pointerup', () => { if (this.overlay || this.choice || this.htmlDlg || this.busy) return;
      services.audio.unlock(); services.audio.play('ui_click'); onPress(); });
    return { text, hit };
  }

  button(y, label, primary, onPress, h = UI.touch.button, w = 480) {
    return addButton(this, W / 2, y, w, h, label, {
      primary, accent: COLORS.gold, fontSize: primary ? UI.type.title : UI.type.bodyLarge, depth: 5,
      onPress: () => { if (this.overlay || this.choice || this.htmlDlg || this.busy) return; services.audio.unlock(); services.audio.play('ui_click'); onPress(); },
    });
  }

  /** Две дополнительные кнопки в ряд (вход/профиль и настройки). Возвращает левую. */
  pair(l1, f1, l2, f2) {
    const bw = 290, gap = 20;
    const mk = (x, label, fn) => addButton(this, x, SECOND_Y, bw, UI.touch.button, label, {
      accent: COLORS.gold, fontSize: UI.type.body, depth: 5,
      onPress: () => { if (this.overlay || this.choice || this.htmlDlg || this.busy) return; services.audio.unlock(); services.audio.play('ui_click'); fn(); },
    });
    const left = mk(W / 2 - bw / 2 - gap / 2, l1, f1);
    mk(W / 2 + bw / 2 + gap / 2, l2, f2);
    return left;
  }

  back() {
    if (this.busy || this.htmlDlg) return;
    if (this.choice) { this.choice.destroy(); this.choice = null; return; }
    if (this.overlay) { this.closeOverlay(); return; }
    if (this.newGameMode) this.scene.restart({});
  }

  begin() {
    if (services.session?.status === 'banned') { this.openRestrictedChat(); return; }
    if (this.starting) return;
    if (services.session && !services.session.ready) return; // онлайн: без загруженного персонажа игру не начинаем
    this.starting = true;
    services.audio.unlock();
    services.audio.play('modal_open');
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => startGame(this));
  }

  openRestrictedChat() {
    if (this.overlay) return;
    const keyboard = this.input.keyboard, enabled = keyboard.enabled;
    keyboard.resetKeys(); keyboard.enabled = false;
    this.overlay = { destroy: () => this.restrictedChat?.close() };
    this.restrictedChat = showChat(services.chat, {
      onClose: () => { this.restrictedChat = null; this.overlay = null; keyboard.resetKeys(); keyboard.enabled = enabled; },
      onLogout: () => reloadToMenu(),
    });
    this.events.once('shutdown', () => this.restrictedChat?.close());
  }

  /** «Начать игру» нового игрока: онлайн — «Как продолжить?», без сервера — новое сохранение с выбранным героем. */
  startNew() {
    if (this.starting || this.busy || this.choice) return;
    services.audio.unlock();
    if (!services.session) { this.devStart(); return; }
    this.showChoice();
  }

  async devStart() {
    this.busy = true;
    await resetProgress(this.hero);   // локально: state.reset(hero) + сохранение — выбор переживает перезагрузку
    this.go();
  }

  /** «Как продолжить?» (онлайн). */
  showChoice() {
    const c = this.add.container(0, 0).setDepth(10000);
    c.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.66).setOrigin(0).setInteractive());
    c.add(addPanel(this, 60, 346, 600, 600, { accent: COLORS.gold, variant: 'dark', seed: 21 }));
    c.add(this.add.text(W / 2, 418, 'Начать приключение', { fontFamily: FONT, fontSize: UI.type.title, fontStyle: 'bold', color: '#f6e3a1', shadow: SH }).setOrigin(0.5));
    c.add(addDivider(this, W / 2, 458, 440));
    const mk = (y, label, primary, fn, hint) => {
      const b = addButton(this, W / 2, y, 480, UI.touch.button, label, { primary, accent: primary ? COLORS.gold : null, fontSize: UI.type.body, onPress: () => { if (this.busy || this.htmlDlg) return; services.audio.play('ui_click'); fn(); } });
      c.add(b.parts);
      if (hint) c.add(this.add.text(W / 2, y + 56, hint, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.textDim, shadow: SH, align: 'center', wordWrap: { width: 570 } }).setOrigin(0.5, 0));
    };
    mk(530, 'Играть как гость', true, () => this.asGuest());
    mk(654, 'Создать аккаунт', false, () => this.register());
    mk(778, 'Уже играли? Войти', false, () => this.login());
    const back = addButton(this, W / 2, 898, 300, UI.touch.button, 'Назад', { fontSize: UI.type.small, onPress: () => this.back() });
    c.add(back.parts);
    this.choice = c;
  }

  async asGuest() {
    this.busy = true;
    const wait = showLoading('Создаём персонажа…');
    try {
      await services.session.playAsGuest(this.hero);
      wait.close();
      this.go();
    } catch (e) {
      wait.close();
      this.busy = false;
      showNotice({ title: 'Не получилось', text: e instanceof CloudError ? errorText(e.code) : errorText('unknown') });
    }
  }

  register() {
    this.htmlDlg = showRegister(services.session, {
      mode: 'new', hero: this.hero,
      onDone: () => { this.htmlDlg = null; this.go(); },
      onCancel: () => { this.htmlDlg = null; if (services.session.ready) this.go(); }, // ник не взяли, но гость уже создан — играет гостем
    });
  }

  /** Вход в существующий аккаунт: герой — из профиля аккаунта, выбранный предпросмотр не используется. */
  login() {
    this.htmlDlg = showLogin(services.session, {
      onDone: () => { this.htmlDlg = null; this.go(); },
      onCancel: () => { this.htmlDlg = null; },
    });
  }

  go() {
    this.busy = true;
    this.starting = true;
    services.hadSave = true;
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => startGame(this));
  }

  /** Без сервера, есть сохранение: «Начать заново?» → выбор героя (сохранение заменится только при «Начать игру»). */
  confirmNew() {
    const c = this.add.container(0, 0).setDepth(10000);
    c.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.66).setOrigin(0).setInteractive());
    c.add(addPanel(this, 60, 460, 600, 340, { accent: COLORS.danger, seed: 4 }));
    c.add(this.add.text(W / 2, 520, 'Начать заново?', { fontFamily: FONT, fontSize: UI.type.title, fontStyle: 'bold', color: '#ff6a5a', shadow: SH }).setOrigin(0.5));
    c.add(addDivider(this, W / 2, 558, 440, COLORS.danger));
    c.add(this.add.text(W / 2, 622, 'Текущее сохранение будет удалено.\nНастройки звука останутся.', { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.text, align: 'center', lineSpacing: 4, shadow: SH }).setOrigin(0.5));
    const mk = (x, label, primary, fn) => {
      const b = addButton(this, x, 730, 250, 72, label, { primary, accent: primary ? COLORS.gold : null, fontSize: UI.type.small, onPress: () => { services.audio.play('ui_click'); fn(); } });
      c.add(b.parts);
    };
    mk(W / 2 - 134, 'Отмена', true, () => this.closeOverlay());
    mk(W / 2 + 134, 'Начать', false, () => { this.closeOverlay(); this.scene.restart({ newGame: true, hero: services.state.data.heroId }); });
    this.overlay = c;
  }

  openSettings() {
    this.overlay = buildSettingsPanel(this, { onDone: () => this.closeOverlay() });
  }

  closeOverlay() {
    if (!this.overlay) return;
    this.overlay.destroy();
    this.overlay = null;
  }
}
