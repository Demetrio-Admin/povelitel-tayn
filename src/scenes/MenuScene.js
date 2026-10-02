import Phaser from 'phaser';
import { VIEW, COLORS } from '../config/game.config.js';
import { services } from '../services.js';
import { startGame } from './PreloadScene.js';
import { buildSettingsPanel } from '../ui/SettingsPanel.js';
import { UI } from '../config/ui.config.js';
import { addPanel, addDivider, addButton, addScreenVignette } from '../ui/widgets.js';

const FONT = UI.font;
const SH = UI.shadow;
const W = VIEW.width;
const H = VIEW.height;

/**
 * MenuScene — титульный экран: Продолжить (если есть сохранение) / Новая игра / Настройки.
 * Первое нажатие здесь же «разблокирует» звук в браузере.
 */
export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const { state, audio } = services;
    this.overlay = null;
    this.buildBackground();

    const title = this.add.text(W / 2, 336, 'Witch RPG', { fontFamily: FONT, fontSize: '82px', fontStyle: 'bold', color: '#f6e3a1', stroke: '#1a0f08', strokeThickness: 12, shadow: { offsetX: 0, offsetY: 6, color: '#000', blur: 14, fill: true } }).setOrigin(0.5).setDepth(5);
    this.add.text(W / 2, 414, 'Шепчущий лес · прототип', { fontFamily: FONT, fontSize: '26px', color: COLORS.text, stroke: '#000', strokeThickness: 5, shadow: SH }).setOrigin(0.5).setDepth(5);
    addDivider(this, W / 2, 458, 460).setDepth(5);
    this.tweens.add({ targets: title, y: 328, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const hasSave = state.hasSave() && state.data.completedEvents.length > 0;
    let y = 700;
    if (hasSave) { this.button(y, 'Продолжить', true, () => this.begin()); y += 112; }
    this.button(y, 'Новая игра', !hasSave, () => (hasSave ? this.confirmNew() : this.begin()));
    y += 112;
    this.button(y, 'Настройки', false, () => this.openSettings());

    if (hasSave) {
      const d = state.data;
      this.add.text(W / 2, y + 100, `Сохранение: уровень ${d.heroLevel} · побед ${d.stats.combats.filter(c => c.result === 'victory').length}`, { fontFamily: FONT, fontSize: '19px', color: COLORS.textDim, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(5);
    }
    this.add.text(W / 2, H - 40, 'v0.4.0 · interface', { fontFamily: FONT, fontSize: '16px', color: COLORS.textDim, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(5);

    const kb = this.input.keyboard;
    kb.on('keydown-ENTER', () => { if (!this.overlay) this.begin(); });
    kb.on('keydown-SPACE', () => { if (!this.overlay) this.begin(); });
    kb.on('keydown-ESC', () => this.closeOverlay());

    this.cameras.main.fadeIn(400);
    audio.setMusic('explore');
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
    { const h = this.add.image(W / 2, 1230, 'hero_up').setOrigin(0.5, 1); h.setScale(192 / h.height); }
    // светлячки
    this.add.particles(0, 0, 'fx_dot', {
      x: { min: 0, max: W }, y: { min: 300, max: H }, lifespan: 4000, speedY: { min: -20, max: -5 }, speedX: { min: -10, max: 10 },
      scale: { start: 0.35, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: [0x9fe9ff, 0xe8c56a], blendMode: 'ADD', frequency: 220,
    });
    addScreenVignette(this, W, H, 0.7).setDepth(2);
  }

  button(y, label, primary, onPress) {
    const b = addButton(this, W / 2, y, 440, 88, label, {
      primary, accent: COLORS.gold, fontSize: 30, depth: 5,
      onPress: () => { if (this.overlay) return; services.audio.unlock(); services.audio.play('ui_click'); onPress(); },
    });
    return b;
  }

  begin() {
    if (this.starting) return;
    this.starting = true;
    services.audio.unlock();
    services.audio.play('modal_open');
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => startGame(this));
  }

  confirmNew() {
    const c = this.add.container(0, 0).setDepth(10000);
    c.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.66).setOrigin(0).setInteractive());
    c.add(addPanel(this, 60, 460, 600, 340, { accent: COLORS.danger, seed: 4 }));
    c.add(this.add.text(W / 2, 520, 'Начать заново?', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#ff6a5a', shadow: SH }).setOrigin(0.5));
    c.add(addDivider(this, W / 2, 558, 440, COLORS.danger));
    c.add(this.add.text(W / 2, 622, 'Текущее сохранение будет удалено.\nНастройки звука останутся.', { fontFamily: FONT, fontSize: '21px', color: COLORS.text, align: 'center', lineSpacing: 4, shadow: SH }).setOrigin(0.5));
    const mk = (x, label, primary, fn) => {
      const b = addButton(this, x, 730, 250, 72, label, { primary, accent: primary ? COLORS.gold : null, fontSize: 23, onPress: () => { services.audio.play('ui_click'); fn(); } });
      c.add(b.parts);
    };
    mk(W / 2 - 134, 'Отмена', true, () => this.closeOverlay());
    mk(W / 2 + 134, 'Начать', false, () => {
      services.state.reset();
      services.hadSave = false;
      this.closeOverlay();
      this.begin();
    });
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
