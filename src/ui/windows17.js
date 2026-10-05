// v0.17.0 — окно «Кошелёк»: сапфиры, приветственные сапфиры, на что они тратятся. Баланс меняет только сервер.
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { services } from '../services.js';
import { addButton, drawPlate } from './widgets.js';
import { walletView, sapphires, sapphireFailText } from '../systems/wallet.js';

const FONT = UI.font;
const SH = UI.shadow;
const SAPPHIRE = 0x6fa8ff;
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export const windows17 = {
  openWallet() {
    if (this.mode === 'combat') return;
    if (this.modal) this.closeModal(null);
    services.audio.play('journal');
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        const v = walletView(services.state);
        let cy = y;
        const text = (str, style = {}) => {
          const t = this.add.text(x, cy, str, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH, wordWrap: { width: w - 8 }, lineSpacing: 2, ...style });
          c.add(t); cy += t.height + 6; return t;
        };
        const top = cy;
        const plate = this.add.graphics(); c.add(plate);
        cy += 14;
        const big = this.add.text(x + w / 2, cy, `◆ ${sapphires(v.balance)}`, { fontFamily: FONT, fontSize: UI.type.title, fontStyle: 'bold', color: hex(SAPPHIRE), shadow: SH }).setOrigin(0.5, 0);
        c.add(big); cy += big.height + 14;
        drawPlate(plate, w, cy - top, { accent: SAPPHIRE, fill: 0x121a2a, alpha: 0.9, radius: 12 });
        plate.setPosition(x + w / 2, top + (cy - top) / 2);
        cy += 12;
        if (v.welcome) {
          const b = addButton(this, x + w / 2, cy + UI.touch.button / 2, w - 48, UI.touch.button, `Получить ${sapphires(v.welcome)} в подарок`, {
            primary: true, accent: SAPPHIRE, fontSize: UI.type.body,
            onPress: () => { if (this.modal?.scroll?.canTap()) this.claimWelcome(); },
          });
          c.add(b.parts); cy += UI.touch.button + 14;
        }
        text('Сапфиры — редкая валюта. На что их можно потратить:', { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
        for (const u of v.uses) text(`• ${u}`);
        cy += 6;
        text(`Ускорений сегодня осталось: ${v.stepsLeftToday}`, { color: COLORS.textDim });
        text('Покупка сапфиров появится позже. Немного сапфиров дают за важные сюжетные достижения и события.', { color: COLORS.textDim });
        return cy - y;
      },
    };
    this.openModal({
      title: 'Кошелёк', color: SAPPHIRE, text: '', content,
      buttons: [{ label: 'Закрыть', primary: true }, { label: 'Дары', onClick: () => this.openGifts() }],
    });
  },

  async claimWelcome() {
    const r = await services.actions.bankWelcome();
    if (!r?.ok) { services.audio.play('locked'); this.toast(sapphireFailText(r)); }
    else { services.audio.play('unlock_magic'); this.toast(`+${sapphires(r.amount ?? 3)}`, SAPPHIRE); }
    this.refreshHud?.();
    if (this.modal) this.reopenModal();
  },
};
