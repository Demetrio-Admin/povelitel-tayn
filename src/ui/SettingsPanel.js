import { VIEW, COLORS } from '../config/game.config.js';
import { services } from '../services.js';

const FONT = 'Georgia, serif';
const hex = c => '#' + c.toString(16).padStart(6, '0');

/**
 * Панель настроек (звуки, музыка, вибрация, подсказки). Используется в MenuScene и UIScene.
 * Возвращает container (уже добавлен в сцену). onDone вызывается кнопкой «Готово».
 * Уничтожение контейнера — на стороне вызывающего.
 */
export function buildSettingsPanel(scene, { onDone, depth = 10000 } = {}) {
  const { settings, audio } = services;
  const W = VIEW.width, H = VIEW.height;
  const pw = 600, ph = 640;
  const left = (W - pw) / 2, top = (H - ph) / 2 - 40;
  const c = scene.add.container(0, 0).setDepth(depth);
  const overlay = scene.add.rectangle(0, 0, W, H, 0x000000, 0.66).setOrigin(0).setInteractive();
  const g = scene.add.graphics();
  g.fillStyle(0x1e1510, 0.97).fillRoundedRect(left, top, pw, ph, 18);
  g.lineStyle(4, COLORS.gold, 0.9).strokeRoundedRect(left, top, pw, ph, 18);
  g.lineStyle(1, COLORS.gold, 0.4).strokeRoundedRect(left + 8, top + 8, pw - 16, ph - 16, 12);
  const title = scene.add.text(W / 2, top + 44, 'Настройки', { fontFamily: FONT, fontSize: '32px', color: COLORS.textGold }).setOrigin(0.5);
  c.add([overlay, g, title]);

  const pct = v => `${Math.round(v * 100)}%`;
  const onOff = v => (v ? 'Вкл' : 'Выкл');

  const smallBtn = (x, y, w, label, onPress) => {
    const r = scene.add.rectangle(x, y, w, 64, 0x2a1d14).setStrokeStyle(3, COLORS.gold, 0.8).setInteractive({ useHandCursor: true });
    const t = scene.add.text(x, y, label, { fontFamily: FONT, fontSize: '28px', color: COLORS.text }).setOrigin(0.5);
    r.on('pointerdown', () => { scene.tweens.add({ targets: [r, t], scale: 0.92, duration: 60, yoyo: true }); onPress(); });
    c.add([r, t]);
    return { r, t };
  };

  let y = top + 140;
  const rowLabel = (text) => c.add(scene.add.text(left + 40, y, text, { fontFamily: FONT, fontSize: '24px', color: COLORS.text }).setOrigin(0, 0.5));

  // громкости
  for (const [key, label] of [['sfx', 'Звуки'], ['music', 'Музыка']]) {
    rowLabel(label);
    const value = scene.add.text(left + 430, y, pct(settings.get(key)), { fontFamily: FONT, fontSize: '24px', color: COLORS.textGold }).setOrigin(0.5);
    c.add(value);
    smallBtn(left + 340, y, 64, '−', () => { value.setText(pct(settings.stepVolume(key, -1))); audio.play('ui_click'); });
    smallBtn(left + 520, y, 64, '+', () => { value.setText(pct(settings.stepVolume(key, +1))); audio.play('ui_click'); });
    y += 100;
  }

  // переключатели
  for (const [key, label] of [['vibration', 'Вибрация'], ['hints', 'Подсказки']]) {
    rowLabel(label);
    const b = smallBtn(left + 430, y, 180, onOff(settings.get(key)), () => {
      const v = settings.toggle(key);
      b.t.setText(onOff(v)).setColor(v ? COLORS.textGold : COLORS.textDim);
      audio.play('ui_click');
      if (key === 'vibration' && v) audio.vibrate(40);
    });
    b.t.setColor(settings.get(key) ? COLORS.textGold : COLORS.textDim);
    y += 100;
  }

  const done = scene.add.rectangle(W / 2, top + ph - 70, 280, 72, 0x3a2a1a).setStrokeStyle(3, COLORS.gold).setInteractive({ useHandCursor: true });
  const doneT = scene.add.text(W / 2, top + ph - 70, 'Готово', { fontFamily: FONT, fontSize: '24px', color: COLORS.textGold }).setOrigin(0.5);
  done.on('pointerup', () => { audio.play('ui_back'); onDone?.(); });
  c.add([done, doneT]);
  c.add(scene.add.text(W / 2, top + ph + 24, 'Настройки не сбрасываются вместе с прогрессом', { fontFamily: FONT, fontSize: '16px', color: hex(0x9a8a6a) }).setOrigin(0.5));
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 150 });
  return c;
}
