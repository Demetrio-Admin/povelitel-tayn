// v0.11.0 — экран «Дары»: три школы, текущая ступень с числами, следующая ступень с требованиями и кнопкой «Изучить».
// Что показывать, решает systems/gifts.js; здесь только рисунок и ввод. Методы подмешиваются в UIScene.
import { VIEW, COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { giftCards, buildView, toggleSlot, toggleAmulet } from '../systems/gifts.js';
import { speedupOptions, sapphires, sapphireFailText } from '../systems/wallet.js';
import { SAPPHIRES } from '../config/sapphires.js';
import { ROMAN } from '../objects/InteractiveObject.js';
import { UPGRADES } from '../config/balance.progression.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { addButton, drawPlate } from './widgets.js';

const FONT = UI.font;
const SH = UI.shadow;
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const fmtSec = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} ч ${Math.round((sec % 3600) / 60)} мин` : `${Math.round(sec / 60)} мин`);
const fmtMs = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const STATUS_NOTE = {
  in_progress: 'Изучение идёт — можно играть, таймер не останавливается и во время боя.',
  busy: 'Сейчас идёт другое изучение. Дождитесь его конца.',
};

export const windows11 = {
  openGifts() {
    if (this.mode === 'combat' || this.modal) return;
    services.audio.play('journal');
    const { state } = services;
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        // данные читаются при каждой отрисовке: окно перерисовывается (reopenModal) после смены билда и начала изучения
        const cards = giftCards(state);
        const research = state.data.research;
        let cy = y;
        const text = (tx, ty, str, style = {}) => {
          const t = this.add.text(tx, ty, str, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH, wordWrap: { width: w - 28 }, lineSpacing: 2, ...style });
          c.add(t);
          return t;
        };
        if (research) {
          const up = UPGRADES[research.upgradeId];
          const t = text(x, cy, `✦ Идёт изучение «${up.title}»: осталось ${fmtMs(state.researchRemainingMs())}`, { fontSize: UI.type.body, color: hex(COLORS[ABILITIES[up.ability].color]) });
          cy += t.height + 8;
          // v0.17.0: ускорение за сапфиры (решает и списывает сервер)
          const opts = speedupOptions(state);
          if (opts.length && state.researchRemainingMs() > 0) {
            const half = (w - 60) / 2;
            opts.forEach((o, i) => {
              const b = addButton(this, x + 24 + half / 2 + i * (half + 12), cy + UI.touch.button / 2 + 2, half, UI.touch.button, o.label, {
                primary: false, accent: o.can ? 0x6fa8ff : null, fontSize: UI.type.small,
                onPress: () => { if (this.modal?.scroll?.canTap()) this.speedupResearch(o.chunks); },
              });
              if (!o.can) b.text.setAlpha(0.6);
              c.add(b.parts);
            });
            cy += UI.touch.button + 6;
            const n = text(x, cy, `У вас ◆ ${sapphires(state.sapphires())}. Ускорений сегодня осталось: ${state.speedupStepsLeftToday()}.`, { color: COLORS.textDim });
            cy += n.height + 12;
          }
        }
        // v0.16.0: билд — слоты даров, амулеты, пресет (над карточками даров)
        {
          const bv = buildView(state);
          const top = cy, px = x + 14;
          const plate = this.add.graphics();
          c.add(plate); c.sendToBack(plate);
          let iy = top + 12;
          const th = text(px, iy, 'Билд', { fontSize: UI.type.heading, fontStyle: 'bold', color: COLORS.textGold });
          iy += th.height + 4;
          const sh = text(px, iy, `Слоты даров в бою: ${bv.slotsUsed} из ${bv.slotCount}`, { color: COLORS.text });
          iy += sh.height + 6;
          for (const sl of bv.slots) {
            const b = addButton(this, x + w / 2, iy + UI.touch.button / 2 + 2, w - 48, UI.touch.button, `${sl.equipped ? '✓' : '○'} ${sl.name} — ${sl.equipped ? 'в слоте' : 'в запасе'}`, {
              primary: false, accent: sl.equipped ? COLORS[ABILITIES[sl.id].color] : null, fontSize: UI.type.small,
              onPress: () => { if (this.modal?.scroll?.canTap()) this.changeSlot(sl.id); },
            });
            if (!sl.equipped) b.text.setAlpha(0.65);
            c.add(b.parts);
            iy += UI.touch.button + 8;
          }
          iy += 4;
          const ah = text(px, iy, `Амулеты: надето ${bv.amulets.filter((a) => a.equipped).length} из ${bv.amuletSlots}`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.text });
          iy += ah.height + 4;
          if (!bv.amulets.length) {
            const t = text(px, iy, 'Амулетов пока нет. Их дают за задания и сильных противников.', { color: COLORS.textDim });
            iy += t.height + 6;
          }
          for (const am of bv.amulets) {
            const b = addButton(this, x + w / 2, iy + UI.touch.button / 2 + 2, w - 48, UI.touch.button, `${am.equipped ? '✓' : '○'} ${am.name}`, {
              primary: false, accent: am.equipped ? COLORS.gold : null, fontSize: UI.type.small,
              onPress: () => { if (this.modal?.scroll?.canTap()) this.changeAmulet(am.id); },
            });
            if (!am.equipped) b.text.setAlpha(0.65);
            c.add(b.parts);
            iy += UI.touch.button + 4;
            const d = text(px, iy, am.text, { color: COLORS.text }); iy += d.height + 1;
            const t2 = text(px, iy, `Цена: ${am.tradeoff}`, { color: hex(0xe0a07a) }); iy += t2.height + 8;
          }
          const half = (w - 60) / 2;
          // v0.17.0: пресеты по номерам; первый бесплатный, следующий открывается за сапфиры
          for (const p of bv.presets) {
            if (bv.presets.length > 1) { const pt = text(px, iy, `Пресет ${p.n}${p.n === 1 ? ' (бесплатный)' : ''}`, { color: COLORS.textGold }); iy += pt.height + 4; }
            for (const [i, [label, mode, can]] of [['Запомнить билд', 'save', true], ['Вернуть билд', 'load', p.saved]].entries()) {
              const b = addButton(this, x + 24 + half / 2 + i * (half + 12), iy + UI.touch.button / 2 + 2, half, UI.touch.button, label, {
                primary: false, accent: can ? COLORS.gold : null, fontSize: UI.type.small,
                onPress: () => { if (this.modal?.scroll?.canTap()) this.changePreset(mode, p.n); },
              });
              if (!can) b.text.setAlpha(0.6);
              c.add(b.parts);
            }
            iy += UI.touch.button + 8;
          }
          if (bv.nextPreset) {
            const b = addButton(this, x + w / 2, iy + UI.touch.button / 2 + 2, w - 48, UI.touch.button, `Открыть пресет ${bv.nextPreset.n} — ◆ ${sapphires(bv.nextPreset.price)}`, {
              primary: false, accent: 0x6fa8ff, fontSize: UI.type.small,
              onPress: () => { if (this.modal?.scroll?.canTap()) this.unlockPreset(); },
            });
            if (!bv.nextPreset.canPay) b.text.setAlpha(0.6);
            c.add(b.parts);
            iy += UI.touch.button + 8;
          }
          const note = text(px, iy, 'Пресет запоминает слоты и амулеты (ветки меняются отдельно). Менять билд можно только вне боя.', { color: COLORS.textDim });
          iy += note.height + 4;
          const h = iy - top + 12;
          drawPlate(plate, w, h, { accent: COLORS.gold, fill: 0x18121a, alpha: 0.85, radius: 12 });
          plate.setPosition(x + w / 2, top + h / 2);
          cy = top + h + 14;
        }
        for (const g of cards) {
          const color = COLORS[ABILITIES[g.id].color];
          const top = cy;
          const plate = this.add.graphics();
          c.add(plate); c.sendToBack(plate);
          const px = x + 14;
          let iy = top + 12;
          const title = text(px, iy, `${g.name} ${g.open ? ROMAN[g.level] : '— не открыт'}${g.branch ? ` · ${g.branch.name}` : ''}`, { fontSize: UI.type.heading, fontStyle: 'bold', color: g.open ? hex(color) : COLORS.textDim });
          if (g.open) text(x + w - 14, iy + 4, `опыт дара ${g.xp}`, { color: COLORS.textDim, wordWrap: { width: 220 } }).setOrigin(1, 0);
          iy += title.height + 6;
          if (!g.open) {
            const t = text(px, iy, 'Дар откроется по ходу истории.', { color: COLORS.textDim });
            iy += t.height + 4;
          } else {
            for (const line of g.now) { const t = text(px, iy, line); iy += t.height + 2; }
            if (g.branch) {
              iy += 4;
              const bt = text(px, iy, `Ветка: ${g.branch.name}`, { fontSize: UI.type.body, fontStyle: 'bold', color: hex(0x9fe9ff) });
              iy += bt.height + 2;
              const bd = text(px, iy, g.branch.text, { color: COLORS.text }); iy += bd.height + 2;
              const bc = text(px, iy, `Цена ветки: ${g.branch.tradeoff}`, { color: hex(0xe0a07a) }); iy += bc.height + 4;
              for (const o of g.respec) {
                const b = addButton(this, x + w / 2, iy + UI.touch.button / 2 + 2, w - 48, UI.touch.button, `Сменить на «${o.name}» — ${o.price} монет`, {
                  primary: false, accent: o.canPay ? color : null, fontSize: UI.type.small,
                  onPress: () => { if (this.modal?.scroll?.canTap()) this.confirmRespec(g.id, o); },
                });
                if (!o.canPay) b.text.setAlpha(0.6);
                c.add(b.parts);
                iy += UI.touch.button + 6;
                // v0.17.0: то же за сапфиры
                const bs = addButton(this, x + w / 2, iy + UI.touch.button / 2 + 2, w - 48, UI.touch.button, `…или за ◆ ${sapphires(o.sapphires)}`, {
                  primary: false, accent: o.canPaySapphires ? 0x6fa8ff : null, fontSize: UI.type.small,
                  onPress: () => { if (this.modal?.scroll?.canTap()) this.confirmRespec(g.id, o, 'sapphires'); },
                });
                if (!o.canPaySapphires) bs.text.setAlpha(0.6);
                c.add(bs.parts);
                iy += UI.touch.button + 10;
              }
            }
            iy += 8;
            const many = g.choices.length > 1;
            if (many) {
              const h = text(px, iy, `Дальше: ${g.name} ${ROMAN[g.choices[0].toLevel]} — выберите одну ветку`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
              iy += h.height + 4;
              const note = text(px, iy, 'Вторая ветка закроется. Позже её можно сменить за монеты.', { color: COLORS.textDim });
              iy += note.height + 8;
            }
            for (const n of g.choices) {
              if (many) {
                const bn = text(px, iy, n.branchName, { fontSize: UI.type.body, fontStyle: 'bold', color: hex(0x9fe9ff) });
                iy += bn.height + 2;
                const bd = text(px, iy, n.branchText, { color: COLORS.text }); iy += bd.height + 2;
                const bc = text(px, iy, `Цена ветки: ${n.branchTradeoff}`, { color: hex(0xe0a07a) }); iy += bc.height + 4;
              } else {
                const h = text(px, iy, `Дальше: ${n.title}`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
                iy += h.height + 2;
                const d = text(px, iy, n.description, { color: COLORS.textDim });
                iy += d.height + 6;
              }
              for (const line of n.after) { const t = text(px, iy, `→ ${line}`, { color: hex(0x9be8a0) }); iy += t.height + 2; }
              iy += 6;
              for (const r of (n.status === 'in_progress' ? [] : n.need)) {   // плата уже списана — «✗ 0/6» только сбивает
                const t = text(px + 6, iy, `${r.ok ? '✓' : '✗'} ${r.label}: ${Math.min(r.have, r.need)}/${r.need}`, { color: r.ok ? '#9be8a0' : COLORS.text });
                iy += t.height + 1;
              }
              const tt = text(px + 6, iy + 2, `Время изучения: ${fmtSec(n.seconds)}`, { color: COLORS.textDim });
              iy += tt.height + 10;
              const note = STATUS_NOTE[n.status];
              if (note) { const t = text(px, iy, note, { color: hex(0x9fe9ff) }); iy += t.height + 8; }
              else {
                const can = n.canStart;
                const label = can ? (many ? `Выбрать «${n.branchName}»` : 'Изучить') : n.status === 'event' ? 'Сначала пробудите алтарь' : 'Не хватает';
                const b = addButton(this, x + w / 2, iy + UI.touch.button / 2 + 2, w - 48, UI.touch.button, label, {
                  primary: can, accent: can ? color : null, fontSize: UI.type.body,
                  onPress: () => { if (this.modal?.scroll?.canTap()) this.startGiftResearch(n.id); },
                });
                if (!can) b.text.setAlpha(0.6);
                c.add(b.parts);
                iy += UI.touch.button + 12;
              }
            }
            if (!g.choices.length && g.maxed) {
              const t = text(px, iy, 'Высшая ступень из доступных. Новые ступени и ветки — в следующих обновлениях.', { color: COLORS.textDim });
              iy += t.height + 4;
            }
          }
          const h = iy - top + 12;
          drawPlate(plate, w, h, { accent: g.open ? color : 0x6a5a48, fill: 0x18121a, alpha: 0.85, radius: 12 });
          plate.setPosition(x + w / 2, top + h / 2);
          cy = top + h + 14;
        }
        return cy - y;
      },
    };
    this.openModal({
      title: 'Дары', color: COLORS.gold, text: '', content,
      buttons: [{ label: 'Закрыть', primary: true }, { label: 'Сумка', onClick: () => this.openBag() }],
    });
  },

  /** Подтверждение смены ветки: монеты тратятся сразу, поэтому спрашиваем. */
  confirmRespec(abilityId, opt, pay = 'coins') {
    if (this.mode === 'combat') return;
    const price = pay === 'sapphires' ? sapphires(opt.sapphires) : `${opt.price} монет`;
    const closeAndAsk = () => {
      this.closeModal(null);
      this.openModal({
        title: 'Сменить ветку?', color: COLORS.gold,
        text: `Ветка «${opt.name}» заменит нынешнюю. Это стоит ${price}, изучение заново не нужно.`,
        buttons: [
          { label: 'Сменить', primary: true, onClick: () => (pay === 'sapphires' ? this.doRespecSapphires(abilityId, opt) : this.doRespec(abilityId, opt)) },
          { label: 'Отмена', onClick: () => this.openGifts() },
        ],
      });
    };
    closeAndAsk();
  },

  doRespec(abilityId, opt) {
    const r = services.state.respecBranch(abilityId, opt.id);
    if (!r.ok) {
      services.audio.play('locked');
      this.toast(r.reason === 'coins' ? `Не хватает монет: нужно ${r.need}` : 'Ветку сменить нельзя.');
    } else {
      services.actions.respec(abilityId, opt.id);   // v0.15.0: цену и смену ветки подтверждает сервер
      services.state.save();
      services.audio.play('unlock_magic');
      this.toast(`Ветка «${opt.name}» выбрана`, COLORS[ABILITIES[abilityId].color]);
      this.refreshHud();
    }
    this.openGifts();
  },

  // ---------- v0.16.0: билд (слоты, амулеты, пресет). Локально сразу, сервер подтверждает (откат — снимком сервера) ----------
  applyBuild(want, okText) {
    const { state, actions } = services;
    const r = state.setBuild(want, this.mode === 'combat');
    if (!r.ok) {
      services.audio.play('locked');
      this.toast({ combat: 'Билд меняется только вне боя.', missing: 'Такого амулета нет в сумке.', locked: 'Этот дар ещё не открыт.', too_many: 'Все места заняты.' }[r.reason] || 'Так выбрать нельзя.');
    } else {
      actions.buildSet(want);
      state.save();
      services.audio.play('unlock_magic');
      if (okText) this.toast(okText, COLORS.gold);
    }
    this.reopenModal();
  },
  changeSlot(id) {
    const r = toggleSlot(services.state, id);
    if (!r.ok) {
      services.audio.play('locked');
      this.toast(r.reason === 'none' ? 'Хотя бы один дар должен остаться в слоте.' : 'Все слоты заняты — сначала уберите другой дар.');
      return;
    }
    this.applyBuild({ slots: r.slots });
  },
  changeAmulet(id) {
    const r = toggleAmulet(services.state, id);
    if (!r.ok) {
      services.audio.play('locked');
      this.toast('Оба слота амулетов заняты — сначала снимите один.');
      return;
    }
    this.applyBuild({ amulets: r.amulets });
  },
  changePreset(mode, slot = 1) {
    const { state, actions } = services;
    const r = state.buildPreset(mode, this.mode === 'combat', slot);
    if (!r.ok) {
      services.audio.play('locked');
      this.toast(r.reason === 'empty' ? 'Билд ещё не сохранён.' : r.reason === 'combat' ? 'Билд меняется только вне боя.' : 'Не получилось.');
      return;
    }
    actions.buildPreset(mode, slot);
    state.save();
    services.audio.play('unlock_magic');
    this.toast(mode === 'save' ? 'Билд запомнен' : 'Билд возвращён', COLORS.gold);
    this.reopenModal();
  },

  // ---------- v0.17.0: траты сапфиров — решает сервер, окно показывает его ответ ----------
  async doRespecSapphires(abilityId, opt) {
    const r = await services.actions.respecSapphires(abilityId, opt.id);
    if (!r?.ok) { services.audio.play('locked'); this.toast(r?.reason === 'unavailable' || r?.reason === 'same' ? 'Ветку сменить нельзя.' : sapphireFailText(r)); }
    else { services.audio.play('unlock_magic'); this.toast(`Ветка «${opt.name}» выбрана`, COLORS[ABILITIES[abilityId].color]); this.refreshHud(); }
    this.openGifts();
  },
  async speedupResearch(chunks) {
    const r = await services.actions.researchSpeedup(chunks);
    if (!r?.ok) { services.audio.play('locked'); this.toast(sapphireFailText(r)); }
    else { services.audio.play('unlock_magic'); this.toast(`Изучение ускорено на ${Math.round(r.cutMs / 60000)} мин (◆ −${r.price})`, 0x6fa8ff); }
    this.refreshHud();
    if (this.modal) this.reopenModal();
  },
  async unlockPreset() {
    const r = await services.actions.presetUnlock();
    if (!r?.ok) { services.audio.play('locked'); this.toast(sapphireFailText(r)); }
    else { services.audio.play('unlock_magic'); this.toast(`Открыт пресет ${r.slots}`, 0x6fa8ff); }
    if (this.modal) this.reopenModal();
  },

  startGiftResearch(upgradeId) {
    const { abilities } = services;
    const up = UPGRADES[upgradeId];
    if (!abilities.startResearch(upgradeId)) {
      services.audio.play('locked');
      this.toast('Пока не хватает требований для изучения.');
      return;
    }
    services.audio.play('unlock_magic');
    this.toast(`Изучение «${up.title}» началось`, COLORS[ABILITIES[up.ability].color]);
    this.refreshHud();
    this.reopenModal();   // карточки перерисовываются: кнопка пропадает, сверху — таймер
  },
};
