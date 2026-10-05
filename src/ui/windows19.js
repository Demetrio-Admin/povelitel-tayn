// v0.19.0 — окно торговца: купить и продать по одной штуке (или пачкой по 5). Решает сервер; окно показывает его ответ.
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { services } from '../services.js';
import { addButton, drawPlate } from './widgets.js';
import { shopView } from '../systems/shopModel.js';

const FONT = UI.font;
const SH = UI.shadow;

export const windows19 = {
  openShop(title = 'Лавка') {
    if (this.mode === 'combat') return;
    if (this.modal) this.closeModal(null);
    services.audio.play('journal');
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        const v = shopView(services.state);
        let cy = y;
        const text = (tx, ty, str, style = {}) => {
          const t = this.add.text(tx, ty, str, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH, wordWrap: { width: w - 200 }, lineSpacing: 2, ...style });
          c.add(t); return t;
        };
        const head = text(x, cy, `Монеты: ${v.coins}`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
        cy += head.height + 10;
        if (!v.open) { const t = text(x, cy, 'Лавка откроется в городе.', { color: COLORS.textDim }); return cy + t.height - y; }
        for (const r of v.rows) {
          const top = cy;
          const plate = this.add.graphics(); c.add(plate);
          const icon = this.add.image(x + 40, cy + 44, r.icon); icon.setScale(56 / Math.max(icon.width, icon.height, 1)); c.add(icon);
          const nm = text(x + 84, cy + 8, `${r.name} · у вас ${r.have}`, { fontSize: UI.type.body, fontStyle: 'bold' });
          text(x + 84, nm.y + nm.height + 4, `Купить ${r.buy} · продать ${r.sell}`, { color: COLORS.textDim });
          const bw = 170;
          const bb = addButton(this, x + w - bw / 2 - 8, cy + 30, bw, UI.touch.button - 8, `Купить`, {
            primary: r.canBuy, accent: r.canBuy ? COLORS.gold : null, fontSize: UI.type.small,
            onPress: () => { if (this.modal?.scroll?.canTap()) this.shopTrade('buy', r.id, title); },
          });
          if (!r.canBuy) bb.text.setAlpha(0.6);
          const sb = addButton(this, x + w - bw / 2 - 8, cy + 30 + UI.touch.button, bw, UI.touch.button - 8, `Продать`, {
            primary: false, accent: r.canSell ? 0x9be8a0 : null, fontSize: UI.type.small,
            onPress: () => { if (this.modal?.scroll?.canTap()) this.shopTrade('sell', r.id, title); },
          });
          if (!r.canSell) sb.text.setAlpha(0.6);
          c.add([...bb.parts, ...sb.parts]);
          const h = Math.max(96, UI.touch.button * 2 + 16);
          drawPlate(plate, w, h, { accent: 0x8a6a48, fill: 0x20160f, alpha: 0.85, radius: 10 });
          plate.setPosition(x + w / 2, top + h / 2);
          c.sendToBack(plate);
          cy = top + h + 10;
        }
        const note = text(x, cy, 'Торговец покупает примерно за треть цены. Инеевые осколки и Сердце холода здесь не продаются.', { color: COLORS.textDim, wordWrap: { width: w } });
        cy += note.height + 6;
        return cy - y;
      },
    };
    this.openModal({ title, color: COLORS.gold, text: '', content, buttons: [{ label: 'Закрыть', primary: true }] });
  },

  async shopTrade(kind, item, title) {
    const r = kind === 'buy' ? await services.actions.shopBuy(item, 1) : await services.actions.shopSell(item, 1);
    if (!r?.ok) {
      services.audio.play('locked');
      this.toast({ coins: `Не хватает монет: нужно ${r?.need}.`, missing: 'Этого нет в сумке.', locked: 'Лавка ещё закрыта.', combat: 'Не во время боя.' }[r?.reason] || 'Не получилось.');
    } else {
      services.audio.play('ui_click');
      this.toast(kind === 'buy' ? `Куплено за ${r.cost}` : `Продано за ${r.gain}`, COLORS.gold);
    }
    this.refreshHud?.();
    if (this.modal) this.reopenModal();
  },
};
