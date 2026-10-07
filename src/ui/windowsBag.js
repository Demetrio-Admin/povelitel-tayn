import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { BAG, bagView, takesBagSpace, GIFT_PRICES } from '../config/bag.js';
import { ITEMS } from '../config/balance.progression.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { RESOURCES, POTIONS, CRAFT_ITEMS, RESOURCE_ORDER, POTION_ORDER } from '../config/resources.js';
import { STORY_ITEMS } from '../config/storyItems.js';
import { AMULETS } from '../config/build.js';
import { services } from '../services.js';
import { giftCards, buildView, amuletLine } from '../systems/gifts.js';
import { ROMAN } from '../objects/InteractiveObject.js';
import { addButton, drawPlate } from './widgets.js';
import { sapphireFailText } from '../systems/wallet.js';

const TABS = [['resources', 'Ресурсы'], ['consumables', 'Расходники'], ['gifts', 'Дары'], ['amulets', 'Амулеты']];
const hex = n => '#' + n.toString(16).padStart(6, '0');
const fit = (img, size) => img.setScale(size / Math.max(img.width, img.height, 1));
const text = (s, c, x, y, str, w, style = {}) => {
  const t = s.add.text(x, y, str, { fontFamily: UI.font, fontSize: UI.type.small, color: COLORS.text, shadow: UI.shadow, wordWrap: { width: w }, lineSpacing: 2, ...style }); c.add(t); return t;
};
const button = (s, c, x, y, w, label, action, primary = false, enabled = true) => {
  const b = addButton(s, x, y + UI.touch.button / 2, w, UI.touch.button, label, { primary, accent: primary ? COLORS.gold : null, fontSize: UI.type.small, onPress: () => { if (enabled && s.modal?.scroll?.canTap()) action(); } });
  if (!enabled) b.text.setAlpha(0.5); c.add(b.parts); return UI.touch.button;
};
const wallet = (s, c, x, y, w) => {
  const plate = s.add.graphics().setPosition(x + w / 2, y + 36); drawPlate(plate, w, 72, { accent: COLORS.gold, fill: 0x21160f, alpha: 0.85 }); c.add(plate);
  for (const [i, [icon, n]] of [['icon_coin', services.state.item('coins')], ['icon_sapphire', services.state.sapphires()]].entries()) {
    const bx = x + 28 + i * w / 2; c.add(fit(s.add.image(bx + 20, y + 36, icon), 40));
    text(s, c, bx + 48, y + 20, n.toLocaleString('ru-RU'), w / 2 - 88, { fontSize: UI.type.body, fontStyle: 'bold' });
  }
  return y + 88;
};
const info = id => ({ ...ITEMS[id], ...(RESOURCES[id] || POTIONS[id] || CRAFT_ITEMS[id] || STORY_ITEMS[id] || {}) });
const failure = r => r?.reason === 'sapphires' ? sapphireFailText(r)
  : ({ bag_full: 'В сумке не хватает места. Освободите его или расширьте сумку.', combat: 'Сумкой можно управлять после боя.', missing: 'Такого количества предметов уже нет.', unknown: 'Покупки временно недоступны. Попробуйте позже.', network: 'Нет связи с сервером. Попробуйте ещё раз.' }[r?.reason] || 'Действие не выполнено. Попробуйте ещё раз.');

export const windowsBag = {
  openGifts() { this.openBag('gifts'); },
  openBag(tab = 'resources') {
    if (this.mode !== 'exploration' || this.modal) return;
    services.tutorial.complete('bag');
    this.bagTab = TABS.some(([id]) => id === tab) ? tab : 'resources';
    const content = { build: (c, x, y, w) => {
      const { state } = services, b = bagView(state);
      let cy = wallet(this, c, x, y, w);
      if (this.bagTab === 'resources' || this.bagTab === 'consumables') {
        const cap = text(this, c, x, cy, `Место в сумке: ${b.used} / ${b.capacity}`, w, { fontSize: UI.type.body, color: b.used > b.capacity ? '#eeab8d' : COLORS.textGold }); cy += cap.height + 10;
        const bar = this.add.graphics(); bar.fillStyle(0x120d09, 1).fillRoundedRect(x, cy, w, 14, 7); bar.fillStyle(b.used > b.capacity ? 0xc5764a : COLORS.gold, 1).fillRoundedRect(x, cy, Math.max(1, w * Math.min(1, b.used / b.capacity)), 14, 7); c.add(bar); cy += 28;
        button(this, c, x + w / 2, cy, w, `+${BAG.increment} мест — ${BAG.price} сапфиров`, () => this.confirmBagExpand(), false); cy += UI.touch.button + 18;
        if (b.used > b.capacity) { const note = text(this, c, x, cy, 'Все предметы сохранены. Освободите место, чтобы собирать новые.', w, { color: '#eeab8d' }); cy += note.height + 14; }
        const ids = this.bagTab === 'resources'
          ? [...RESOURCE_ORDER, 'reinforced_resin', 'crimson_ember', 'moonstone'].filter(id => state.item(id) > 0)
          : [...POTION_ORDER, 'astral_lens'].filter(id => state.item(id) > 0);
        if (!ids.length) { const empty = text(this, c, x, cy + 16, this.bagTab === 'resources' ? 'Ресурсов пока нет. Собирайте растения и находите материалы в мире.' : 'Расходников пока нет. Их можно сварить в котле или купить в лавке.', w, { color: COLORS.textDim }); cy += empty.height + 42; }
        else cy = this.bagItemGrid(c, x, cy, w, ids);
        if (this.bagTab === 'resources') {
          const story = Object.entries(state.data.inventory).filter(([id, n]) => n > 0 && id !== 'coins' && !takesBagSpace(id) && !AMULETS[id]).map(([id]) => id);
          if (story.length) { button(this, c, x + w / 2, cy, w, `Сюжетные предметы · ${story.length}`, () => this.openStoryBag(story)); cy += UI.touch.button + 16; }
        }
        if (Object.keys(b.pending).length) {
          const h = text(this, c, x, cy, 'Незабранные награды', w, { fontSize: UI.type.heading, color: COLORS.textGold }); cy += h.height + 6;
          const n = text(this, c, x, cy, 'Освободите место и заберите награды. До этого новый бой не начнётся.', w, { color: COLORS.textDim }); cy += n.height + 10;
          for (const [id, qty] of Object.entries(b.pending)) { button(this, c, x + w / 2, cy, w, `${info(id).name} · ${qty}`, () => this.openBagItem(id, true)); cy += UI.touch.button + 10; }
        }
      } else if (this.bagTab === 'gifts') cy = this.bagGiftRows(c, x, cy, w);
      else cy = this.bagAmuletRows(c, x, cy, w);
      return cy - y;
    } };
    this.openModal({ title: 'Сумка', color: COLORS.gold, text: '', content,
      tabs: TABS.map(([id, label]) => ({ label, selected: id === this.bagTab, onClick: () => this.openBag(id) })),
      buttons: [{ label: 'Закрыть', primary: true }],
    });
  },
  bagItemGrid(c, x, y, w, ids, story = false) {
    const cell = w / 3;
    for (let start = 0; start < ids.length; start += 3) {
      const entries = ids.slice(start, start + 3).map((id, i) => {
        const cx = x + cell * (i + 0.5), it = info(id);
        const name = text(this, c, cx, y + 112, it.name || 'Предмет', cell - 24, { align: 'center' }).setOrigin(0.5, 0);
        return { id, cx, it, name };
      });
      const h = Math.max(...entries.map(e => e.name.height)) + 130;
      for (const { id, cx, it } of entries) {
        const plate = this.add.graphics().setPosition(cx, y + h / 2); drawPlate(plate, cell - 12, h, { accent: it.color || COLORS.gold, fill: 0x251b13, alpha: 0.9, radius: 10 }); c.add(plate); c.sendToBack(plate);
        c.add(fit(this.add.image(cx, y + 65, it.icon || 'icon_shard'), 76));
        text(this, c, cx + cell / 2 - 22, y + 8, `${services.state.item(id)}`, cell - 28, { fontSize: UI.type.body, fontStyle: 'bold', color: '#fff', align: 'right' }).setOrigin(1, 0);
        const hit = this.add.rectangle(cx, y + h / 2, cell - 12, h, 0, 0).setInteractive(); c.add(hit);
        hit.on('pointerup', () => { if (this.modal?.scroll?.canTap()) this.openBagItem(id, false, story); });
      }
      y += h + 12;
    }
    return y + 8;
  },
  bagGiftRows(c, x, y, w) {
    const bv = buildView(services.state);
    text(this, c, x, y + 22, `Дары в бою: ${bv.slotsUsed} из ${bv.slotCount}`, w / 2 - 6, { fontSize: UI.type.body });
    button(this, c, x + w * 0.75 + 2, y, w / 2 - 8, 'Боевой набор', () => this.openBattleSets()); y += UI.touch.button + 14;
    const summaries = { telekinesis: 'Поднимает и бросает предметы.', fire: 'Урон огнём и горение.', seal: 'Пробивает защиту противника.', ice: 'Замедление и Хрупкость.' };
    for (const g of giftCards(services.state)) {
      const h = 168, color = COLORS[ABILITIES[g.id].color];
      const plate = this.add.graphics().setPosition(x + w / 2, y + h / 2); drawPlate(plate, w, h, { accent: g.open ? color : 0x6a5a48, fill: 0x21161a, alpha: 0.85 }); c.add(plate);
      c.add(fit(this.add.image(x + 46, y + 72, `icon_${g.id}`), 80).setAlpha(g.open ? 1 : 0.4));
      text(this, c, x + 104, y + 10, `${g.name}${g.open ? ` ${ROMAN[g.level]}` : ' · закрыт'}`, w - 120, { fontSize: UI.type.heading, fontStyle: 'bold', color: g.open ? hex(color) : COLORS.textDim });
      text(this, c, x + 104, y + 48, g.open ? summaries[g.id] : 'Откроется по сюжету.', w - 120);
      const bw = (w - 126) / 2;
      button(this, c, x + 104 + bw / 2, y + 78, bw, g.equipped ? 'Убрать' : 'В бой', () => this.changeSlot(g.id), !g.equipped, g.open);
      button(this, c, x + 116 + bw * 1.5, y + 78, bw, 'Подробнее', () => { this.closeModal(null); this.openGiftDetails(g.id); });
      y += h + 12;
    }
    const note = text(this, c, x, y + 4, 'Улучшения — в описании дара.', w, { color: COLORS.textDim }); return y + note.height + 16;
  },
  bagAmuletRows(c, x, y, w) {
    const bv = buildView(services.state), worn = bv.amulets.filter(a => a.equipped).length;
    const heading = text(this, c, x, y, `Надето амулетов: ${worn} из ${bv.amuletSlots}`, w, { fontSize: UI.type.body, color: COLORS.textGold }); y += heading.height + 18;
    if (!bv.amulets.length) { const t = text(this, c, x, y + 12, 'Амулетов пока нет. Выполняйте задания, побеждайте сильных противников и создавайте их в котле.', w, { color: COLORS.textDim }); return y + t.height + 36; }
    for (const am of bv.amulets) {
      const top = y, plate = this.add.graphics(); c.add(plate); c.sendToBack(plate);
      c.add(fit(this.add.image(x + 44, y + 54, AMULETS[am.id].icon), 76));
      const nm = text(this, c, x + 96, y + 10, `${am.name}${am.level ? ` +${am.level}` : ''}`, w - 116, { fontSize: UI.type.heading, fontStyle: 'bold', color: hex(am.rarityColor) }); y += nm.height + 18;
      const eff = text(this, c, x + 96, y, amuletLine(am.effect), w - 116); y += eff.height + 8;
      const trade = text(this, c, x + 14, y, `Особенность: ${am.tradeoff}`, w - 28, { color: '#e0a07a' }); y += trade.height + 12;
      const bw = (w - 40) / 2;
      button(this, c, x + 14 + bw / 2, y, bw, am.equipped ? 'Снять' : 'Надеть', () => this.changeAmulet(am.id), !am.equipped);
      button(this, c, x + 26 + bw * 1.5, y, bw, am.next ? `Улучшить до +${am.next.level}` : 'Максимум', () => this.confirmAmuletUpgrade(am), false, !!am.next); y += UI.touch.button + 12;
      drawPlate(plate, w, y - top, { accent: am.rarityColor, fill: 0x21161a, alpha: 0.85 }); plate.setPosition(x + w / 2, (top + y) / 2); y += 14;
    }
    return y;
  },
  openStoryBag(ids) {
    this.closeModal(null);
    this.openModal({ title: 'Сюжетные предметы', color: COLORS.gold, text: 'Не занимают место в сумке.', content: { build: (c, x, y, w) => this.bagItemGrid(c, x, y, w, ids, true) - y }, buttons: [{ label: 'К ресурсам', primary: true, onClick: () => this.openBag('resources') }] });
  },
  openBagItem(id, pending = false, story = false) {
    const it = info(id), state = services.state, have = pending ? bagView(state).pending[id] || 0 : state.item(id), tab = this.bagTab || 'resources';
    this.closeModal(null);
    this.openModal({ title: it.name || 'Предмет', color: it.color || COLORS.gold, text: `Количество: ${have}${pending ? ' · награда' : ''}\n\n${it.hint || it.text || it.purpose || ''}${story ? '\n\nНе занимает место в сумке.' : '\n\n1 штука занимает 1 место.'}`,
      buttons: [
        ...(pending ? [{ label: 'Забрать', primary: true, onClick: () => this.chooseBagQuantity(id, 'claim', true) }] : POTIONS[id]?.outside ? [{ label: 'Выпить', primary: true, onClick: async () => { await this.drinkFromBag(id); if (!this.modal) this.openBag(tab); } }] : []),
        ...(!story ? [{ label: 'Выбросить', onClick: () => this.chooseBagQuantity(id, 'discard', pending) }] : []),
        { label: 'Назад', onClick: () => this.openBag(tab) },
      ],
    });
  },
  chooseBagQuantity(id, op, pending = false) {
    this.closeModal(null);
    const b = bagView(services.state), have = pending ? b.pending[id] || 0 : services.state.item(id), max = op === 'claim' ? Math.min(have, b.free) : have;
    if (max < 1) { this.toast('В сумке нет свободного места.'); this.openBag(this.bagTab); return; }
    let qty = 1;
    this.openModal({ title: op === 'claim' ? 'Забрать награду' : 'Выбросить предметы?', color: COLORS.gold, text: `${info(id).name}\n${op === 'claim' ? 'Выберите количество.' : 'Выброшенные предметы нельзя вернуть.'}`, content: { build: (c, x, y, w) => {
      text(this, c, x, y, `Количество: ${qty} из ${max}`, w, { fontSize: UI.type.heading, align: 'center' });
      const bw = (w - 24) / 3;
      for (const [i, [label, next]] of [['−1', Math.max(1, qty - 1)], ['+1', Math.min(max, qty + 1)], ['Все', max]].entries()) button(this, c, x + bw / 2 + i * (bw + 12), y + 56, bw, label, () => { qty = next; this.reopenModal(); });
      return 56 + UI.touch.button + 12;
    } }, buttons: [{ label: op === 'claim' ? 'Забрать' : 'Выбросить', primary: true, onClick: () => this.doBagAction(op, id, qty, pending) }, { label: 'Отмена', onClick: () => this.openBag(this.bagTab) }] });
  },
  confirmBagExpand() {
    this.closeModal(null);
    const b = bagView(services.state);
    this.openModal({ title: 'Расширить сумку?', color: COLORS.gold, text: `Вместимость: ${b.capacity} → ${b.capacity + BAG.increment}.\n\nЦена: ${BAG.price} сапфиров. У вас: ${services.state.sapphires()}.\nРасширение остаётся навсегда.`, buttons: [{ label: 'Купить', primary: true, onClick: () => this.doBagAction('expand') }, { label: 'Отмена', onClick: () => this.openBag(this.bagTab) }] });
  },
  async doBagAction(op, id, qty, pending) {
    const r = await (op === 'expand' ? services.actions.bagExpand() : op === 'claim' ? services.actions.bagClaim(id, qty) : services.actions.bagDiscard(id, qty, pending));
    if (!r?.ok) { services.audio.play('locked'); this.toast(failure(r)); }
    else { services.audio.play('coin'); this.toast(op === 'expand' ? `Вместимость сумки: ${r.capacity}` : op === 'claim' ? `Награда получена: ${qty}` : `Выброшено: ${qty}`, COLORS.gold); }
    this.refreshHud(); if (!this.modal) this.openBag(this.bagTab);
  },
  confirmAmuletUpgrade(am) {
    this.closeModal(null);
    this.openModal({ title: `Улучшить ${am.name}?`, color: COLORS.gold, text: `До +${am.next.level}:\n${am.next.need.map(n => `${n.name}: ${n.have} / ${n.need}`).join('\n')}`, buttons: [{ label: 'Улучшить', primary: true, onClick: async () => { await this.upgradeAmulet(am.id, am.next.level); if (!this.modal) this.openBag('amulets'); } }, { label: 'Отмена', onClick: () => this.openBag('amulets') }] });
  },
  openBattleSets() {
    this.closeModal(null);
    this.openModal({ title: 'Боевые наборы', color: COLORS.gold, text: 'Набор сохраняет выбранные дары и надетые амулеты. Можно менять вне боя.', content: { build: (c, x, y, w) => {
      const bv = buildView(services.state); let cy = y;
      for (const p of bv.presets) {
        const t = text(this, c, x, cy, `Набор ${p.n}${p.n === 1 ? ' · бесплатный' : ''}`, w, { fontSize: UI.type.body, color: COLORS.textGold }); cy += t.height + 10;
        const bw = (w - 12) / 2;
        button(this, c, x + bw / 2, cy, bw, 'Сохранить', () => this.changePreset('save', p.n));
        button(this, c, x + 12 + bw * 1.5, cy, bw, 'Выбрать', () => this.changePreset('load', p.n), false, p.saved); cy += UI.touch.button + 18;
      }
      if (bv.nextPreset) { button(this, c, x + w / 2, cy, w, `Набор ${bv.nextPreset.n} — ${bv.nextPreset.price} сапфиров`, () => this.confirmSetUnlock(bv.nextPreset)); cy += UI.touch.button + 12; }
      return cy - y;
    } }, buttons: [{ label: 'К дарам', primary: true, onClick: () => this.openBag('gifts') }] });
  },
  confirmSetUnlock(next) {
    this.closeModal(null);
    this.openModal({ title: 'Открыть боевой набор?', color: COLORS.gold, text: `Набор ${next.n}: ${next.price} сапфиров.`, buttons: [{ label: 'Открыть', primary: true, onClick: async () => { await this.unlockPreset(); if (!this.modal) this.openBattleSets(); } }, { label: 'Отмена', onClick: () => this.openBattleSets() }] });
  },
};
