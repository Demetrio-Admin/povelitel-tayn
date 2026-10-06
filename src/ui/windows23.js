// v0.23.0 — окно доски поручений: 5 поручений дня, взять можно 3. Решает сервер; окно показывает его ответ.
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { services } from '../services.js';
import { addButton, drawPlate } from './widgets.js';
import { dailyView } from '../systems/dailyModel.js';

const FONT = UI.font;
const SH = UI.shadow;
const STATUS = { free: 'Можно взять', taken: 'Взято', ready: 'Готово — можно сдать', done: 'Выполнено', locked: 'Пока недоступно' };
const STATUS_COLOR = { free: COLORS.textDim, taken: COLORS.text, ready: '#9be8a0', done: COLORS.textGold, locked: COLORS.textDim };

export const windows23 = {
  openDaily() {
    if (this.mode === 'combat') return;
    if (this.modal) this.closeModal(null);
    services.audio.play('journal');
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        const v = dailyView(services.state);
        let cy = y;
        const text = (tx, ty, str, style = {}) => {
          const t = this.add.text(tx, ty, str, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH, wordWrap: { width: w - 220 }, lineSpacing: 2, ...style });
          c.add(t); return t;
        };
        if (!v.open) {
          const t = text(x, cy, 'Доска пока пуста. Поручения появятся, когда город узнает вас получше (после квеста «Выбор»).', { color: COLORS.textDim, wordWrap: { width: w } });
          return t.height;
        }
        const head = text(x, cy, `Взято ${v.takenN} из ${v.picks} · новые поручения через ${v.leftH} ч ${v.leftM} мин`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold, wordWrap: { width: w } });
        cy += head.height + 10;
        for (const r of v.rows) {
          const top = cy;
          const plate = this.add.graphics(); c.add(plate);
          const t1 = text(x + 14, cy + 10, r.title, { fontSize: UI.type.body, fontStyle: 'bold' });
          const t2 = text(x + 14, t1.y + t1.height + 2, r.giver, { color: COLORS.textDim });
          const t3 = text(x + 14, t2.y + t2.height + 4, r.text);
          const t4 = text(x + 14, t3.y + t3.height + 4, `${r.goal} · ${r.progress}`, { color: '#bfe6ff' });
          const t5 = text(x + 14, t4.y + t4.height + 2, `Награда: ${r.reward}`, { color: COLORS.textGold });
          const t6 = text(x + 14, t5.y + t5.height + 2, STATUS[r.status], { color: STATUS_COLOR[r.status] });
          const bw = 180;
          if (r.status === 'free' || r.status === 'ready' || r.status === 'taken') {
            const take = r.status === 'free';
            const b = addButton(this, x + w - bw / 2 - 10, cy + 44, bw, UI.touch.button - 8, take ? 'Взять' : 'Сдать', {
              primary: take ? r.canTake : r.canDone, accent: (take ? r.canTake : r.canDone) ? COLORS.gold : null, fontSize: UI.type.small,
              onPress: () => { if (this.modal?.scroll?.canTap()) this.dailyAct(take ? 'take' : 'done', r.id); },
            });
            if (!(take ? r.canTake : r.canDone)) b.text.setAlpha(0.6);
            c.add(b.parts);
          }
          const h = Math.max(UI.touch.button + 30, t6.y + t6.height + 10 - top);
          drawPlate(plate, w, h, { accent: r.status === 'done' ? 0xc9a24a : 0x8a6a48, fill: 0x20160f, alpha: 0.85, radius: 10 });
          plate.setPosition(x + w / 2, top + h / 2);
          c.sendToBack(plate);
          cy = top + h + 10;
        }
        const note = text(x, cy, 'Победы засчитываются на местах, где враги возвращаются, — после того как поручение взято. Сюжет поручения не требует: это дополнительный опыт, монеты и материалы.', { color: COLORS.textDim, wordWrap: { width: w } });
        cy += note.height + 6;
        return cy - y;
      },
    };
    this.openModal({ title: 'Доска поручений', color: COLORS.gold, text: '', content, buttons: [{ label: 'Закрыть', primary: true }] });
  },

  async dailyAct(kind, offer) {
    const r = kind === 'take' ? await services.actions.dailyTake(offer) : await services.actions.dailyDone(offer);
    if (!r?.ok) {
      services.audio.play('locked');
      this.toast({
        limit: 'Сегодня уже взято три поручения.', already: 'Уже сделано.', locked: 'Пока недоступно.', missing: 'Чего-то не хватает в сумке.',
        progress: 'Поручение ещё не выполнено.', not_taken: 'Сначала возьмите поручение.', unknown: 'Доска обновилась — откройте её заново.',
      }[r?.reason] || 'Не получилось.');
    } else {
      services.audio.play(kind === 'take' ? 'ui_click' : 'quest_update');
      this.toast(kind === 'take' ? 'Поручение взято' : 'Поручение выполнено!', COLORS.gold);
    }
    this.refreshHud?.();
    if (this.modal) this.reopenModal();
  },
};
