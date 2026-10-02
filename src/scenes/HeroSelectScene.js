import Phaser from 'phaser';
import { VIEW, COLORS } from '../config/game.config.js';
import { services, resetProgress } from '../services.js';
import { HEROES } from '../config/heroes.js';
import { startGame } from './PreloadScene.js';
import { MenuScene } from './MenuScene.js';
import { showRegister, showLogin, showLoading, showNotice } from '../ui/accountUI.js';
import { errorText, CloudError } from '../cloud/api.js';
import { UI } from '../config/ui.config.js';
import { addPanel, addDivider, addButton, addScreenVignette } from '../ui/widgets.js';

const FONT = UI.font;
const SH = UI.shadow;
const W = VIEW.width;
const H = VIEW.height;

/**
 * Новая игра: выбор стартового героя, затем «Как продолжить?»:
 *   Играть как гость — сервер сам заводит пользователя и персонажа, никаких вопросов;
 *   Создать аккаунт — никнейм и пароль (без почты), затем игра;
 *   У меня уже есть аккаунт — вход по нику и паролю (выбранный герой не нужен: продолжаем своего персонажа).
 * Без сервера (режим разработки) после выбора героя игра просто начинается заново в этом браузере.
 */
export class HeroSelectScene extends Phaser.Scene {
  constructor() { super('HeroSelectScene'); }

  create() {
    this.hero = HEROES[0].id;
    this.busy = false;
    this.html = null;
    MenuScene.background(this);
    addScreenVignette(this, W, H, 0.75).setDepth(2);
    this.add.text(W / 2, 150, 'Выбор героя', { fontFamily: FONT, fontSize: '54px', fontStyle: 'bold', color: '#f6e3a1', stroke: '#1a0f08', strokeThickness: 10, shadow: SH }).setOrigin(0.5).setDepth(5);
    addDivider(this, W / 2, 196, 420).setDepth(5);
    this.cards = this.add.container(0, 0).setDepth(6);
    this.buildCards();
    this.choice = null;
    this.input.keyboard.on('keydown-ESC', () => this.back());
    this.cameras.main.fadeIn(300);
  }

  buildCards() {
    const n = HEROES.length, cw = 520, ch = 700, gap = 30;
    const x0 = W / 2 - ((n - 1) * (cw + gap)) / 2;
    HEROES.forEach((h, i) => {
      const cx = x0 + i * (cw + gap), top = 250;
      const panel = addPanel(this, cx - cw / 2, top, cw, ch, { accent: COLORS.gold, seed: 11 + i });
      const glow = this.add.image(cx, top + 300, 'fx_glow').setTint(0xe8c56a).setBlendMode('ADD').setAlpha(0.35).setScale(3);
      const img = this.add.image(cx, top + 400, h.texture).setOrigin(0.5, 1);
      img.setScale(300 / img.height);
      this.tweens.add({ targets: img, y: top + 392, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const name = this.add.text(cx, top + 440, h.name, { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#f6e3a1', shadow: SH }).setOrigin(0.5);
      const title = this.add.text(cx, top + 486, h.title, { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.textGold, shadow: SH }).setOrigin(0.5);
      const text = this.add.text(cx, top + 530, h.text, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, align: 'center', wordWrap: { width: cw - 70 }, lineSpacing: 3, shadow: SH }).setOrigin(0.5, 0);
      this.cards.add([panel, glow, img, name, title, text]);
    });
    this.pick = addButton(this, W / 2, 1030, 440, 88, 'Выбрать', { primary: true, accent: COLORS.gold, fontSize: UI.type.bodyLarge, depth: 6, onPress: () => this.onPick() });
    this.backBtn = addButton(this, W / 2, 1140, 440, UI.touch.button, 'Назад', { fontSize: UI.type.body, depth: 6, onPress: () => this.back() });
  }

  back() {
    if (this.busy || this.html) return;
    if (this.choice) { this.choice.destroy(); this.choice = null; return; }
    this.scene.start('MenuScene');
  }

  onPick() {
    if (this.busy || this.choice || this.html) return;
    services.audio.unlock(); services.audio.play('ui_click');
    if (!services.session) { this.devStart(); return; }
    this.showChoice();
  }

  async devStart() {
    this.busy = true;
    await resetProgress(this.hero);
    this.go();
  }

  /** «Как продолжить?» */
  showChoice() {
    const c = this.add.container(0, 0).setDepth(10000);
    c.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.66).setOrigin(0).setInteractive());
    c.add(addPanel(this, 36, 320, 648, 694, { accent: COLORS.gold, seed: 21 }));
    c.add(this.add.text(W / 2, 418, 'Как продолжить?', { fontFamily: FONT, fontSize: UI.type.title, fontStyle: 'bold', color: '#f6e3a1', shadow: SH }).setOrigin(0.5));
    c.add(addDivider(this, W / 2, 458, 440));
    const mk = (y, label, primary, fn, hint) => {
      const b = addButton(this, W / 2, y, 480, UI.touch.button, label, { primary, accent: primary ? COLORS.gold : null, fontSize: UI.type.body, onPress: () => { if (this.busy || this.html) return; services.audio.play('ui_click'); fn(); } });
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
    this.html = showRegister(services.session, {
      mode: 'new', hero: this.hero,
      onDone: () => { this.html = null; this.go(); },
      onCancel: () => { this.html = null; if (services.session.ready) this.go(); }, // ник не взяли, но гость уже создан — играет гостем
    });
  }

  login() {
    this.html = showLogin(services.session, {
      onDone: () => { this.html = null; this.go(); },
      onCancel: () => { this.html = null; },
    });
  }

  go() {
    this.busy = true;
    services.hadSave = true;
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => startGame(this));
  }
}
