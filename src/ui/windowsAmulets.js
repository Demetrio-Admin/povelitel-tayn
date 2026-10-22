// Окно «Амулеты»: здесь покупают материалы под амулет и создают его (раньше амулеты варили в котле вместе с зельями).
// Открывается у торговца Бориса (диалог, эффект { amulets: true }). Изготовление — та же серверная операция craft, что и у зелий;
// карточка рецепта общая с котлом (windows08.alchemyCard). Надевать и улучшать амулеты — в Сумке, вкладка «Амулеты».
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { RARITY } from '../config/build.js';
import { RECIPES, RECIPE_ORDER } from '../config/recipes.js';
import { services } from '../services.js';
import { amuletGroups } from '../systems/alchemyTabs.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const fit = (img, size) => img.setScale(size / Math.max(img.width, img.height, 1));
const label = (scene, c, x, y, str, style = {}) => {
  const t = scene.add.text(x, y, str, { fontFamily: UI.font, fontSize: UI.type.body, color: COLORS.text, shadow: UI.shadow, ...style });
  c.add(t); return t;
};

export const windowsAmulets = {
  openAmulets() {
    if (this.mode === 'combat') return;
    if (this.modal) this.closeModal(null);
    const { alchemy, state } = services;
    services.audio.play('journal');
    const groups = amuletGroups(alchemy);
    const hidden = RECIPE_ORDER.filter(id => RECIPES[id].kind === 'amulet' && alchemy.status(id).state === 'locked').length;
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        let cy = y;
        c.add(fit(this.add.image(x + 22, cy + 22, 'icon_coin'), 44));
        label(this, c, x + 58, cy + 6, `Монеты: ${state.item('coins').toLocaleString('ru-RU')}`, { fontStyle: 'bold', color: COLORS.textGold });
        cy += 64;
        if (!groups.length) {
          const t = label(this, c, x, cy, 'Рецепты амулетов откроются в городе.', { color: COLORS.textDim, wordWrap: { width: w } });
          return cy + t.height - y;
        }
        for (const g of groups) {
          const t = label(this, c, x, cy + 4, g.title, { fontSize: UI.type.heading, fontStyle: 'bold', color: hex(RARITY[g.rarity]?.color ?? 0xd9cbb0) });
          cy = t.y + t.height + 14;
          for (const r of g.recipes) cy = this.alchemyCard(c, x, cy, w, r);
        }
        if (hidden) {
          const t = label(this, c, x, cy, 'Остальные амулеты откроются по ходу истории.', { fontSize: UI.type.small, color: COLORS.textDim, wordWrap: { width: w } });
          cy += t.height + 10;
        }
        return cy - y - 10;
      },
    };
    this.openModal({
      title: 'Амулеты', color: COLORS.gold,
      text: 'Надеть и улучшить — в Сумке.', content,
      buttons: [{ label: 'Закрыть', primary: true }, { label: 'В сумку', onClick: () => this.openBag('amulets') }],
    });
  },
};
