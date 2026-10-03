import Phaser from 'phaser';
import { VIEW, COLORS } from '../config/game.config.js';
import { services, resetProgress, reloadToMenu, heroIdNow } from '../services.js';
import { showLogin, showProfile, showRegister, showLoading, showNotice } from '../ui/accountUI.js';
import { errorText, CloudError } from '../cloud/api.js';
import { startGame } from './PreloadScene.js';
import { buildSettingsPanel } from '../ui/SettingsPanel.js';
import { buildHeroPicker } from '../ui/heroPicker.js';
import { DEFAULT_HERO_ID } from '../config/heroes.js';
import { UI } from '../config/ui.config.js';
import { addPanel, addDivider, addButton, addScreenVignette } from '../ui/widgets.js';

const FONT = UI.font;
const SH = UI.shadow;
const W = VIEW.width;
const H = VIEW.height;
const PRIMARY_Y = 1046, PRIMARY_H = 100, SECOND_Y = 1160;

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
    const { audio } = services;
    const session = services.session;
    this.overlay = null;
    this.starting = false;
    this.busy = false;
    this.htmlDlg = null;   // окно регистрации / входа из «Как продолжить?»
    this.buildBackground();

    const title = this.add.text(W / 2, 96, 'Witch RPG', { fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#f6e3a1', stroke: '#1a0f08', strokeThickness: 10, shadow: { offsetX: 0, offsetY: 5, color: '#000', blur: 12, fill: true } }).setOrigin(0.5).setDepth(5);
    this.add.text(W / 2, 156, 'Шепчущий лес · прототип', { fontFamily: FONT, fontSize: `${UI.type.small}px`, color: COLORS.text, stroke: '#000', strokeThickness: 4, shadow: SH }).setOrigin(0.5).setDepth(5);
    addDivider(this, W / 2, 190, 420).setDepth(5);
    this.tweens.add({ targets: title, y: 90, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const { state } = services;
    const localSave = !session && state.hasSave() && state.data.completedEvents.length > 0;
    this.mode = session?.ready ? 'continue-online'
      : session ? 'new-online'
        : (localSave && !this.newGameMode) ? 'continue-local' : 'new-local';
    const isNew = this.mode.startsWith('new');

    // предпросмотр: новый игрок — выбранный вариант (по умолчанию ведьма), игрок с сохранением — его герой
    const heroId = isNew ? (this.previewHero || DEFAULT_HERO_ID) : heroIdNow();
    this.picker = buildHeroPicker(this, {
      heroId, interactive: isNew, depth: 5,
      onChange: () => { services.audio.unlock(); services.audio.play('ui_click'); },
    });

    if (this.mode === 'continue-online') {
      this.line(session.registered ? `${session.nickname} · уровень ${session.level}` : `Гость · уровень ${session.level}`, COLORS.textGold, 250);
      this.line(session.registered ? 'Прогресс хранится на сервере' : 'Прогресс гостя хранится на сервере', COLORS.textDim, 292, UI.type.small);
      this.primary = this.button(PRIMARY_Y, 'Продолжить', true, () => this.begin(), PRIMARY_H);
      this.accountButton = this.pair('Профиль', () => this.openProfile(), 'Настройки', () => this.openSettings());
    } else if (this.mode === 'new-online') {
      this.primary = this.button(PRIMARY_Y, 'Начать игру', true, () => this.startNew(), PRIMARY_H);
      this.accountButton = this.pair('Войти', () => this.openLogin(), 'Настройки', () => this.openSettings());
    } else if (this.mode === 'continue-local') {
      const d = state.data;
      this.line(`Сохранение: уровень ${d.heroLevel} · побед ${d.stats.combats.filter(c => c.result === 'victory').length}`, COLORS.textGold, 262, UI.type.body);
      this.primary = this.button(PRIMARY_Y, 'Продолжить', true, () => this.begin(), PRIMARY_H);
      this.pair('Новая игра', () => this.confirmNew(), 'Настройки', () => this.openSettings());
    } else {
      this.primary = this.button(PRIMARY_Y, 'Начать игру', true, () => this.startNew(), PRIMARY_H);
      if (this.newGameMode) this.pair('Назад', () => this.scene.restart({}), 'Настройки', () => this.openSettings());
      else this.button(SECOND_Y, 'Настройки', false, () => this.openSettings());
    }
    this.add.text(W / 2, H - 34, session ? 'v0.9.2 · ведьма или колдун' : 'Режим разработки: прогресс в этом браузере · v0.9.2', { fontFamily: FONT, fontSize: `${UI.type.small}px`, color: COLORS.textDim, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(5);

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
    this.add.rectangle(0, 0, W, H, 0x0f1a14).setOrigin(0);
    this.add.ellipse(W / 2, 1150, W * 1.4, 700, 0x1d2b1c);
    const moon = this.add.image(560, 170, 'fx_glow').setTint(0xcfe8ff).setBlendMode('ADD').setScale(2.6).setAlpha(0.55);
    this.add.circle(560, 170, 46, 0xe9f2ff, 0.9);
    this.tweens.add({ targets: moon, alpha: 0.35, duration: 2600, yoyo: true, repeat: -1 });
    const rand = new Phaser.Math.RandomDataGenerator(['menu']);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 9; i++) {
        const key = rand.pick(['tree_dark_01', 'tree_dark_02', 'tree_autumn_01', 'tree_autumn_02']);
        const ty = 560 + row * 300 + rand.between(-30, 30);
        const side = i < 4 ? i * 70 - 30 : W - (i - 4) * 70 + 30;
        this.add.image(side + rand.between(-20, 20), ty, key).setOrigin(0.5, 1).setScale(0.5 * (1.3 + row * 0.25)).setAlpha(0.55 + row * 0.2).setTint(row === 2 ? 0x8899aa : 0xffffff);
      }
    }
    // v0.9.2: герой больше не нарисован в фоне — он в предпросмотре (ведьма или колдун)
    this.add.particles(0, 0, 'fx_dot', {
      x: { min: 0, max: W }, y: { min: 300, max: H }, lifespan: 4000, speedY: { min: -20, max: -5 }, speedX: { min: -10, max: 10 },
      scale: { start: 0.35, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: [0x9fe9ff, 0xe8c56a], blendMode: 'ADD', frequency: 220,
    });
    addScreenVignette(this, W, H, 0.7).setDepth(2);
  }

  /** Общий фон меню. */
  static background(scene) { MenuScene.prototype.buildBackground.call(scene); }

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
    if (this.starting) return;
    if (services.session && !services.session.ready) return; // онлайн: без загруженного персонажа игру не начинаем
    this.starting = true;
    services.audio.unlock();
    services.audio.play('modal_open');
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => startGame(this));
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
    c.add(addPanel(this, 36, 320, 648, 694, { accent: COLORS.gold, seed: 21 }));
    c.add(this.add.text(W / 2, 418, 'Как продолжить?', { fontFamily: FONT, fontSize: UI.type.title, fontStyle: 'bold', color: '#f6e3a1', shadow: SH }).setOrigin(0.5));
    c.add(addDivider(this, W / 2, 458, 440));
    const mk = (y, label, primary, fn, hint) => {
      const b = addButton(this, W / 2, y, 480, UI.touch.button, label, { primary, accent: primary ? COLORS.gold : null, fontSize: UI.type.body, onPress: () => { if (this.busy || this.htmlDlg) return; services.audio.play('ui_click'); fn(); } });
      c.add(b.parts);
      if (hint) c.add(this.add.text(W / 2, y + 56, hint, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.textDim, shadow: SH, align: 'center', wordWrap: { width: 570 } }).setOrigin(0.5, 0));
    };
    mk(530, 'Играть как гость', true, () => this.asGuest(), 'Без регистрации. Аккаунт можно создать позже в профиле');
    mk(718, 'Создать аккаунт', false, () => this.register(), 'Никнейм и пароль — почта не нужна');
    mk(868, 'У меня уже есть аккаунт', false, () => this.login());
    const back = addButton(this, W / 2, 970, 300, UI.touch.button, 'Назад', { fontSize: UI.type.small, onPress: () => this.back() });
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
