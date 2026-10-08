// Both heroes appear on the cover. Selecting one only changes account creation.
import { VIEW, COLORS } from '../config/game.config.js';
import { HEROES, heroById } from '../config/heroes.js';
import { UI } from '../config/ui.config.js';
import { addButton } from './widgets.js';

export const PICKER = { toggleY: 980, toggleW: 280, toggleH: 88, toggleGap: 16, labelY: 908 };

export function buildHeroPicker(scene, { heroId, interactive = true, onChange = null, depth = 5, top = 0 } = {}) {
  const P = PICKER, W = VIEW.width, parts = [], toggles = [];
  let id = heroById(heroId).id;
  const frame = scene.add.graphics().setDepth(depth + 2);
  parts.push(frame);
  if (interactive) {
    parts.push(scene.add.text(W / 2, P.labelY + top, 'Выберите героя', {
      fontFamily: UI.font, fontSize: UI.type.heading, color: COLORS.textGold,
      shadow: UI.shadow, stroke: '#100e16', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(depth));
    const total = HEROES.length * P.toggleW + (HEROES.length - 1) * P.toggleGap;
    HEROES.forEach((h, i) => {
      const x = W / 2 - total / 2 + P.toggleW / 2 + i * (P.toggleW + P.toggleGap);
      const b = addButton(scene, x, P.toggleY + top, P.toggleW, P.toggleH, h.name, {
        primary: h.id === id, accent: COLORS.gold, fontSize: UI.type.bodyLarge, depth: depth + 1,
        onPress: () => { if (!scene.overlay && !scene.choice && !scene.htmlDlg && !scene.busy) select(h.id, true); },
      });
      Object.assign(b, { heroId: h.id, x, selected: h.id === id });
      toggles.push(b); parts.push(...b.parts);
    });
  }
  function render() {
    frame.clear();
    for (const b of toggles) {
      b.selected = b.heroId === id; b.setPrimary(b.selected);
      if (b.selected) frame.lineStyle(3, 0xf6e3a1, 0.95).strokeRoundedRect(
        b.x - P.toggleW / 2 - 5, P.toggleY + top - P.toggleH / 2 - 5,
        P.toggleW + 10, P.toggleH + 10, 16);
    }
  }
  function select(next, byPlayer = false) {
    const resolved = heroById(next).id;
    if (resolved === id) return;
    id = resolved; render();
    if (byPlayer) onChange?.(id);
  }
  render();
  return { get id() { return id; }, select, toggles, parts,
    bottom: () => P.toggleY + top + P.toggleH / 2,
    destroy: () => parts.forEach(p => p.destroy?.()),
  };
}
