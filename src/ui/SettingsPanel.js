import { VIEW, COLORS } from '../config/game.config.js';
import { services } from '../services.js';
import { UI } from '../config/ui.config.js';
import { addPanel, addDivider, addButton } from './widgets.js';

const FONT = UI.font;
const SH = UI.shadow;
const hex = c => '#' + c.toString(16).padStart(6, '0');

/**
 * Панель настроек (звуки, музыка, вибрация, подсказки). Используется в MenuScene и UIScene.
 * Возвращает container (уже добавлен в сцену). onDone вызывается кнопкой «Готово».
 * Уничтожение контейнера — на стороне вызывающего.
 */
export function buildSettingsPanel(scene, { onDone, depth = 10000 } = {}) {
  const { settings, audio } = services;
  const W = VIEW.width, H = VIEW.height;
  const pw = 648, ph = 700;
  const left = (W - pw) / 2, top = (H - ph) / 2 - 40;
  const c = scene.add.container(0, 0).setDepth(depth);
  const overlay = scene.add.rectangle(0, 0, W, H, 0x000000, 0.66).setOrigin(0).setInteractive();
  const panel = addPanel(scene, left, top, pw, ph, { seed: 5 });
  const title = scene.add.text(W / 2, top + 46, 'Настройки', { fontFamily: FONT, fontSize: UI.type.title, fontStyle: 'bold', color: COLORS.textGold, shadow: SH }).setOrigin(0.5);
  const rule = addDivider(scene, W / 2, top + 84, pw - 140);
  c.add([overlay, panel, title, rule]);

  const pct = v => `${Math.round(v * 100)}%`;
  const onOff = v => (v ? 'Вкл' : 'Выкл');

  const smallBtn = (x, y, w, label, onPress) => {
    const b = addButton(scene, x, y, w, UI.touch.button, label, { fontSize: UI.type.body, onPress });
    c.add(b.parts);
    return { r: b.bg, t: b.text };
  };

  let y = top + 140;
  const rowLabel = (text) => c.add(scene.add.text(left + 40, y, text, { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.text, shadow: SH }).setOrigin(0, 0.5));

  for (let i = 0; i < 4; i++) c.add(addPanel(scene, left + 28, top + 140 + i * 100 - 38, pw - 56, 76, { variant: 'inset' }));

  // громкости
  for (const [key, label] of [['sfx', 'Звуки'], ['music', 'Музыка']]) {
    rowLabel(label);
    const value = scene.add.text(left + 460, y, pct(settings.get(key)), { fontFamily: FONT, fontSize: UI.type.small, fontStyle: 'bold', color: COLORS.textGold, shadow: SH }).setOrigin(0.5);
    c.add(value);
    smallBtn(left + 364, y, 88, '−', () => { value.setText(pct(settings.stepVolume(key, -1))); audio.play('ui_click'); });
    smallBtn(left + 552, y, 88, '+', () => { value.setText(pct(settings.stepVolume(key, +1))); audio.play('ui_click'); });
    y += 100;
  }

  // переключатели
  for (const [key, label] of [['vibration', 'Вибрация'], ['hints', 'Подсказки']]) {
    rowLabel(label);
    const b = smallBtn(left + 460, y, 180, onOff(settings.get(key)), () => {
      const v = settings.toggle(key);
      b.t.setText(onOff(v)).setColor(v ? COLORS.textGold : COLORS.textDim);
      audio.play('ui_click');
      if (key === 'vibration' && v) audio.vibrate(40);
    });
    b.t.setColor(settings.get(key) ? COLORS.textGold : COLORS.textDim);
    y += 100;
  }

  const done = addButton(scene, W / 2, top + ph - 62, 280, UI.touch.button, 'Готово', {
    primary: true, accent: COLORS.gold, fontSize: UI.type.body, onPress: () => { audio.play('ui_back'); onDone?.(); },
  });
  c.add(done.parts);
  c.add(scene.add.text(W / 2, top + ph - 140, 'Настройки не сбрасываются вместе с прогрессом', { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.textDim, align: 'center', wordWrap: { width: pw - 70 } }).setOrigin(0.5));
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 150 });
  return c;
}
