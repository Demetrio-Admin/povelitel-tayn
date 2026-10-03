// v0.9.2 — выбор героя на стартовом экране: переключатель «Ведьма | Колдун», один крупный предпросмотр,
// название, роль, общий текст о дарах и пояснение «Дары и характеристики одинаковые».
// Переключение меняет только картинку и подписи: ничего не сохраняет, не создаёт профиль и не трогает прогресс.
// interactive: false — без переключателя (у игрока с сохранением в предпросмотре его герой).
import { VIEW, COLORS } from '../config/game.config.js';
import { HEROES, heroById, HERO_SHARED_TEXT, HERO_SAME_NOTE } from '../config/heroes.js';
import { UI } from '../config/ui.config.js';
import { addButton } from './widgets.js';

const W = VIEW.width;
const FONT = UI.font;
const SH = UI.shadow;

/** Раскладка экрана 720×1280 (логические px). */
export const PICKER = {
  toggleY: 268, toggleW: 300, toggleH: 100, toggleGap: 16,
  previewBottom: 700, previewH: 360,
  nameY: 744, titleY: 790, textY: 826, noteGap: 14,
};

/**
 * @param scene Phaser.Scene
 * @param o.heroId     начальный герой
 * @param o.interactive показывать переключатель
 * @param o.onChange   (id) — выбран другой вариант
 * @param o.depth      базовая глубина
 */
export function buildHeroPicker(scene, { heroId, interactive = true, onChange = null, depth = 5, top = 0 } = {}) {
  const P = PICKER;
  const parts = [];
  const add = (o) => { if (depth != null) o.setDepth?.(depth); parts.push(o); return o; };
  let id = heroById(heroId).id === heroId ? heroId : heroById(heroId).id;   // неизвестный id показываем ведьмой

  // предпросмотр: мягкое свечение, тень, герой с «дыханием» (общая idle-анимация для обоих героев)
  const py = P.previewBottom + top;
  add(scene.add.image(W / 2, py - P.previewH * 0.48, 'fx_glow').setTint(0xe8c56a).setBlendMode('ADD').setAlpha(0.32).setScale(3.4));
  add(scene.add.ellipse(W / 2, py - 4, 170, 30, 0x000000, 0.35));
  const img = add(scene.add.image(W / 2, py, heroById(id).textures.down).setOrigin(0.5, 1));
  let breath = null;
  const fitImg = () => {
    breath?.remove(); img.setScale(P.previewH / img.height);
    const b = img.scaleY;
    breath = scene.tweens.add({ targets: img, scaleY: { from: b, to: b * 1.018 }, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  };
  fitImg();
  const name = add(scene.add.text(W / 2, P.nameY + top, '', { fontFamily: FONT, fontSize: `${UI.type.title}px`, fontStyle: 'bold', color: '#f6e3a1', stroke: '#1a0f08', strokeThickness: 6, shadow: SH }).setOrigin(0.5));
  const title = add(scene.add.text(W / 2, P.titleY + top, '', { fontFamily: FONT, fontSize: `${UI.type.body}px`, color: COLORS.textGold, stroke: '#000', strokeThickness: 4, shadow: SH }).setOrigin(0.5));
  const text = add(scene.add.text(W / 2, P.textY + top, HERO_SHARED_TEXT, { fontFamily: FONT, fontSize: `${UI.type.body}px`, color: COLORS.text, align: 'center', wordWrap: { width: 620 }, lineSpacing: 2, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0));
  const note = add(scene.add.text(W / 2, text.y + text.height + P.noteGap, HERO_SAME_NOTE, { fontFamily: FONT, fontSize: `${UI.type.small}px`, color: COLORS.textDim, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0));

  // переключатель: две одинаковые зоны; выбранная — золотая (primary) с рамкой и галочкой
  const toggles = [];
  let frame = null;
  if (interactive) {
    frame = add(scene.add.graphics());
    const total = HEROES.length * P.toggleW + (HEROES.length - 1) * P.toggleGap;
    HEROES.forEach((h, i) => {
      const x = W / 2 - total / 2 + P.toggleW / 2 + i * (P.toggleW + P.toggleGap);
      const b = addButton(scene, x, P.toggleY + top, P.toggleW, P.toggleH, h.name, {
        primary: h.id === id, accent: COLORS.gold, fontSize: UI.type.bodyLarge, depth: depth + 1,
        onPress: () => { if (scene.overlay || scene.choice || scene.htmlDlg || scene.busy) return; select(h.id, true); },
      });
      b.heroId = h.id; b.x = x;
      toggles.push(b);
      parts.push(...b.parts);
    });
  }

  function render() {
    const h = heroById(id);
    if (img.texture.key !== h.textures.down) { img.setTexture(h.textures.down); fitImg(); }
    name.setText(h.name);
    title.setText(h.title);
    if (frame) {
      frame.clear();
      for (const b of toggles) {
        const on = b.heroId === id;
        b.setPrimary(on);
        b.setLabel(on ? `✓ ${heroById(b.heroId).name}` : heroById(b.heroId).name);
        if (on) frame.lineStyle(4, 0xf6e3a1, 0.95).strokeRoundedRect(b.x - P.toggleW / 2 - 7, P.toggleY + top - P.toggleH / 2 - 7, P.toggleW + 14, P.toggleH + 14, 18);
      }
    }
  }

  function select(next, byPlayer = false) {
    if (!heroById(next) || next === id) return;
    id = heroById(next).id;
    render();
    if (byPlayer) onChange?.(id);
  }

  render();
  return {
    get id() { return id; },
    select,
    toggles,
    parts,
    image: img,
    bottom: () => note.y + note.height,
    destroy: () => { breath?.remove(); parts.forEach(p => p.destroy?.()); },
  };
}
