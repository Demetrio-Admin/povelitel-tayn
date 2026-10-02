import Phaser from 'phaser';
import { VIEW, COLORS } from '../config/game.config.js';
import { services } from '../services.js';
import { startGame } from './PreloadScene.js';
import { buildSettingsPanel } from '../ui/SettingsPanel.js';

const FONT = 'Georgia, serif';
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

    const title = this.add.text(W / 2, 330, 'Witch RPG', { fontFamily: FONT, fontSize: '76px', color: COLORS.textGold, stroke: '#1a0f08', strokeThickness: 10 }).setOrigin(0.5);
    this.add.text(W / 2, 410, 'Шепчущий лес · прототип', { fontFamily: FONT, fontSize: '26px', color: COLORS.text, stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    this.tweens.add({ targets: title, y: 322, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const hasSave = state.hasSave() && state.data.completedEvents.length > 0;
    let y = 700;
    if (hasSave) { this.button(y, 'Продолжить', true, () => this.begin()); y += 112; }
    this.button(y, 'Новая игра', !hasSave, () => (hasSave ? this.confirmNew() : this.begin()));
    y += 112;
    this.button(y, 'Настройки', false, () => this.openSettings());

    if (hasSave) {
      const d = state.data;
      this.add.text(W / 2, y + 100, `Сохранение: уровень ${d.heroLevel} · побед ${d.stats.combats.filter(c => c.result === 'victory').length}`, { fontFamily: FONT, fontSize: '19px', color: COLORS.textDim }).setOrigin(0.5);
    }
    this.add.text(W / 2, H - 50, 'v0.3.0 · art preview', { fontFamily: FONT, fontSize: '16px', color: COLORS.textDim }).setOrigin(0.5);

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
  }

  button(y, label, primary, onPress) {
    const r = this.add.rectangle(W / 2, y, 420, 88, primary ? 0x3a2a1a : 0x231912, 0.95).setStrokeStyle(3, primary ? COLORS.gold : 0x8a7a5a).setInteractive({ useHandCursor: true });
    const t = this.add.text(W / 2, y, label, { fontFamily: FONT, fontSize: '30px', color: primary ? COLORS.textGold : COLORS.text }).setOrigin(0.5);
    r.on('pointerdown', () => { this.tweens.add({ targets: [r, t], scale: 0.95, duration: 70, yoyo: true }); });
    r.on('pointerup', () => { if (this.overlay) return; services.audio.unlock(); services.audio.play('ui_click'); onPress(); });
    return r;
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
    const g = this.add.graphics();
    g.fillStyle(0x1e1510, 0.97).fillRoundedRect(60, 460, 600, 340, 18);
    g.lineStyle(4, COLORS.danger, 0.9).strokeRoundedRect(60, 460, 600, 340, 18);
    c.add(g);
    c.add(this.add.text(W / 2, 520, 'Начать заново?', { fontFamily: FONT, fontSize: '30px', color: '#ff6a5a' }).setOrigin(0.5));
    c.add(this.add.text(W / 2, 600, 'Текущее сохранение будет удалено.\nНастройки звука останутся.', { fontFamily: FONT, fontSize: '21px', color: COLORS.text, align: 'center' }).setOrigin(0.5));
    const mk = (x, label, primary, fn) => {
      const r = this.add.rectangle(x, 720, 240, 72, primary ? 0x3a2a1a : 0x231912).setStrokeStyle(3, primary ? COLORS.gold : 0x8a7a5a).setInteractive({ useHandCursor: true });
      const t = this.add.text(x, 720, label, { fontFamily: FONT, fontSize: '22px', color: primary ? COLORS.textGold : COLORS.text }).setOrigin(0.5);
      r.on('pointerup', () => { services.audio.play('ui_click'); fn(); });
      c.add([r, t]);
    };
    mk(W / 2 - 130, 'Отмена', true, () => this.closeOverlay());
    mk(W / 2 + 130, 'Начать', false, () => {
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
