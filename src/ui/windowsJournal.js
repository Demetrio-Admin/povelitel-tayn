// Журнал: место, куда заходят часто, поэтому — три вкладки в одной строке под заголовком и карточки с понятными разделами.
//   «Цель»    — главная цель, зачем она, что для неё нужно (с иконками и «где взять»), подсказка;
//   «Задания» — поручения жителей: в работе, можно взять, выполнено;
//   «Памятка» — короткие правила здоровья, маны и поражения, где что находится.
// Данные — services.log / guidance / quests; здесь только рисунок. Окно открывается openJournal(tab?).
// Методы подмешиваются в UIScene (Object.assign), поэтому `this` — UIScene.
import { fm, T } from '../state/hero.js';
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { ITEMS } from '../config/balance.progression.js';
import { RECIPES } from '../config/recipes.js';
import { STORY_ITEMS } from '../config/storyItems.js';
import { RESOURCE_WHERE } from '../config/guidance.js';
import { SIDE_QUESTS } from '../config/quests.js';
import { NPCS } from '../config/npcs.js';
import { STEP_WHY } from '../config/story.js';
import { services } from '../services.js';
import { drawPlate } from './widgets.js';

const FONT = UI.font;
const SH = UI.shadow;
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const GREEN = '#9be8a0', RED = '#ff8a7a', CYAN = 0x9fe9ff;
const fit = (img, size) => { img.setScale(size / Math.max(img.width, img.height, 1)); return img; };

export const JOURNAL_TABS = [
  { id: 'goal', label: 'Цель' },
  { id: 'quests', label: 'Задания' },
  { id: 'tips', label: 'Памятка' },
];

/** Подписи вкладок с числами: «Задания · 2» (в работе), «Задания ✓» — если есть что сдавать. Без Phaser. */
export function journalTabLabels(log) {
  const act = log.active();
  const ready = act.filter(id => log.status(id) === 'ready').length;
  return {
    goal: 'Цель',
    quests: ready ? `Задания ✓${ready > 1 ? ' ' + ready : ''}` : act.length ? `Задания · ${act.length}` : 'Задания',
    tips: 'Памятка',
  };
}

/** Имя заказчика и место: «Веда · Стартовая поляна». */
export function questGiverLine(q) {
  const who = NPCS[q.giver]?.name || '';
  return [who, q.place].filter(Boolean).join(' · ');
}

/** Прогресс шага «2/3» → { have, need } или null. */
export function parseProgress(p) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(p ?? '').trim());
  return m ? { have: Number(m[1]), need: Number(m[2]) } : null;
}

/**
 * Карточка: фон-табличка по высоте содержимого. draw(layer, x, y, w) рисует в layer (его объекты лежат над фоном)
 * и возвращает высоту содержимого. Возвращает полную высоту карточки.
 */
function card(scene, c, x, y, w, { accent = 0x6a5a48, fill = 0x20160f, pad = 20 } = {}, draw) {
  const layer = scene.add.container(0, 0);
  const h = draw(layer, x + pad, y + pad, w - pad * 2) + pad * 2;
  const g = scene.add.graphics().setPosition(x + w / 2, y + h / 2);
  drawPlate(g, w, h, { accent, fill, alpha: 0.92, radius: 14 });
  c.add([g, layer]);
  return h;
}

const text = (layer, x, y, str, style = {}) => {
  const t = layer.scene.add.text(x, y, str, { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.text, shadow: SH, lineSpacing: 3, ...style });
  layer.add(t); return t;
};

/** Заголовок раздела: слово и тонкая золотая линия под ним. Возвращает новый y. */
function section(scene, c, x, y, w, title, { color = COLORS.textGold, count = null } = {}) {
  const t = scene.add.text(x, y, count != null ? `${title}  · ${count}` : title, { fontFamily: FONT, fontSize: UI.type.heading, fontStyle: 'bold', color, shadow: SH });
  const line = scene.add.graphics().lineStyle(2, 0xd9b45a, 0.45).lineBetween(x, y + t.height + 6, x + w, y + t.height + 6);
  c.add([t, line]);
  return y + t.height + 18;
}

/** Строка-чек: «☑ Лунная трава 3/3» зелёным или «☐ …» обычным. */
function checkRow(layer, x, y, w, done, str, size = UI.type.small) {
  const mark = text(layer, x, y, done ? '☑' : '☐', { fontSize: size, color: done ? GREEN : COLORS.textGold });
  const t = text(layer, x + 36, y, str, { fontSize: size, color: done ? GREEN : COLORS.text, wordWrap: { width: w - 36 } });
  return Math.max(mark.height, t.height) + 6;
}

export const windowsJournal = {
  /** tab — 'goal' | 'quests' | 'tips' (шина сообщений может прислать что угодно, берём только строку). */
  openJournal(tab) {
    if (this.mode === 'combat' || this.modal) return;
    const { log } = services;
    const id = JOURNAL_TABS.some(t => t.id === tab) ? tab : (JOURNAL_TABS.some(t => t.id === this.journalTab) ? this.journalTab : 'goal');
    this.journalTab = id;
    if (!this.swapping) services.audio.play('journal');
    const names = journalTabLabels(log);
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        if (id === 'quests') return this.journalQuests(c, x, y, w);
        if (id === 'tips') return this.journalTips(c, x, y, w);
        return this.journalGoal(c, x, y, w);
      },
    };
    this.openModal({
      title: 'Журнал', color: COLORS.gold, text: '', content, fullHeight: true,
      topTabs: JOURNAL_TABS.map(t => ({ label: names[t.id], selected: t.id === id, onClick: () => this.openJournal(t.id) })),
      buttons: [{ label: 'Закрыть', primary: true }],
    });
  },

  // ------------------------------------------------------------------ «Цель»
  journalGoal(c, x, y, w) {
    const { guidance, quests, state } = services;
    const objective = guidance.objective();
    const step = quests.currentStep();
    const hints = guidance.hints();
    let cy = y;

    cy += card(this, c, x, cy, w, { accent: COLORS.gold, fill: 0x2a1d12 }, (layer, ix, iy, iw) => {
      let yy = iy;
      yy += text(layer, ix, yy, '✦  ГЛАВНАЯ ЦЕЛЬ', { fontSize: UI.type.small, fontStyle: 'bold', color: COLORS.textGold }).height + 8;
      const prog = parseProgress(objective.progress);
      yy += text(layer, ix, yy, prog || !objective.progress ? objective.text : `${objective.text} (${objective.progress})`,
        { fontSize: UI.type.heading, fontStyle: 'bold', color: '#fff3d6', wordWrap: { width: iw } }).height + 14;
      if (prog && prog.need > 0) {
        const barW = iw - 96, frac = Math.min(1, prog.have / prog.need);
        const bar = this.add.graphics();
        bar.fillStyle(0x000000, 0.45).fillRoundedRect(ix, yy, barW, 18, 9);
        if (frac > 0) bar.fillStyle(prog.have >= prog.need ? 0x7fd88a : COLORS.gold, 1).fillRoundedRect(ix, yy, Math.max(18, barW * frac), 18, 9);
        bar.lineStyle(1.5, 0xd9b45a, 0.6).strokeRoundedRect(ix, yy, barW, 18, 9);
        layer.add(bar);
        text(layer, ix + barW + 16, yy - 8, `${prog.have} / ${prog.need}`, { fontStyle: 'bold', color: COLORS.textGold });
        yy += 38;
      }
      const why = STEP_WHY[objective.stepId];
      if (why) {
        const line = this.add.graphics().lineStyle(1, 0xd9b45a, 0.3).lineBetween(ix, yy, ix + iw, yy);
        layer.add(line); yy += 14;
        yy += text(layer, ix, yy, 'ЗАЧЕМ', { fontSize: UI.type.small, fontStyle: 'bold', color: hex(CYAN) }).height + 4;
        yy += text(layer, ix, yy, why, { fontSize: UI.type.small, color: '#dff6ff', wordWrap: { width: iw } }).height;
      }
      return yy - iy;
    }) + 20;

    // что нужно для шага: состав рецепта (с иконками и «где взять») или предмет для применения
    if (step.craft || step.use) {
      const rows = [];
      let title = 'ЧТО НУЖНО', where = '';
      if (step.craft) {
        const r = RECIPES[step.craft];
        title = `ЧТО НУЖНО для «${STORY_ITEMS[r.result]?.name || r.result}»`;
        where = r.where || 'котёл Мирры';
        for (const [item, need] of Object.entries(r.needs)) rows.push({ item, name: ITEMS[item]?.name || item, have: state.item(item), need, where: RESOURCE_WHERE[item] || 'в лесу' });
      } else {
        const have = state.item(step.use) > 0 ? 1 : 0;
        title = 'ЧТО НУЖНО';
        rows.push({ item: step.use, name: STORY_ITEMS[step.use]?.name || step.use, have, need: 1, where: 'сварите в котле Мирры', story: true });
      }
      cy += card(this, c, x, cy, w, { accent: 0x8fe39a, fill: 0x16231a }, (layer, ix, iy, iw) => {
        let yy = iy;
        yy += text(layer, ix, yy, title, { fontSize: UI.type.small, fontStyle: 'bold', color: '#9be8a0', wordWrap: { width: iw } }).height + 4;
        if (where) yy += text(layer, ix, yy, `Варят: ${where}`, { fontSize: UI.type.small, color: COLORS.textDim }).height + 10;
        else yy += 6;
        for (const r of rows) {
          const okk = r.have >= r.need;
          const key = (r.story ? STORY_ITEMS[r.item]?.icon : ITEMS[r.item]?.icon) || 'icon_shard';
          const icon = fit(this.add.image(ix + 26, yy + 30, key), 52);
          layer.add(icon);
          const name = text(layer, ix + 66, yy + 2, r.name, { fontStyle: 'bold', color: okk ? GREEN : COLORS.text, wordWrap: { width: iw - 170 } });
          text(layer, ix + iw, yy + 2, `${Math.min(r.have, r.need)}/${r.need}`, { fontStyle: 'bold', color: okk ? GREEN : RED }).setOrigin(1, 0);
          let rowH = Math.max(60, name.height + 6);
          if (!okk) { const wh = text(layer, ix + 66, yy + 2 + name.height, 'Где взять: ' + r.where, { fontSize: UI.type.small, color: COLORS.textDim, wordWrap: { width: iw - 66 } }); rowH = Math.max(rowH, name.height + wh.height + 10); }
          yy += rowH + 6;
        }
        return yy - iy - 6;
      }) + 20;
    }

    const tip = hints[0] && !(step.craft && hints[0].startsWith('Для рецепта')) ? hints[0] : '';
    if (tip) {
      cy += card(this, c, x, cy, w, { accent: 0x6a5a48, fill: 0x1a120d }, (layer, ix, iy, iw) => {
        let yy = iy;
        yy += text(layer, ix, yy, 'ПОДСКАЗКА', { fontSize: UI.type.small, fontStyle: 'bold', color: COLORS.textGold }).height + 4;
        yy += text(layer, ix, yy, tip, { fontSize: UI.type.small, color: COLORS.text, wordWrap: { width: iw } }).height;
        return yy - iy;
      }) + 20;
    }

    // быстрый переход, если есть чем заняться в «Заданиях»
    const readyN = services.log.active().filter(id => services.log.status(id) === 'ready').length;
    if (readyN) {
      cy += card(this, c, x, cy, w, { accent: 0x7fd88a, fill: 0x16231a, pad: 16 }, (layer, ix, iy, iw) =>
        text(layer, ix, iy, `✓ Выполнено заданий: ${readyN}. Загляните во вкладку «Задания» — там написано, к кому вернуться.`, { fontSize: UI.type.small, color: GREEN, wordWrap: { width: iw } }).height) + 20;
    }
    return cy - y - 8;
  },

  // ------------------------------------------------------------------ «Задания»
  journalQuests(c, x, y, w) {
    const { log } = services;
    let cy = y;
    const act = log.active();
    cy = section(this, c, x, cy, w, 'В работе', { color: hex(CYAN), count: act.length });
    if (!act.length) {
      cy += card(this, c, x, cy, w, { accent: 0x4a3a2c, fill: 0x1a120d }, (layer, ix, iy, iw) =>
        text(layer, ix, iy, log.available().length ? 'Сейчас ничего не в работе. Выберите поручение из списка ниже и подойдите к заказчику.' : 'Сейчас ничего не в работе. Новые поручения появятся по мере вашего пути.',
          { fontSize: UI.type.small, color: COLORS.textDim, wordWrap: { width: iw } }).height) + 18;
    }
    for (const id of act) {
      const q = SIDE_QUESTS[id], ready = log.status(id) === 'ready';
      const npc = NPCS[q.giver];
      cy += card(this, c, x, cy, w, { accent: ready ? 0x7fd88a : (npc?.color ?? 0xd9b45a), fill: ready ? 0x16231a : 0x20160f }, (layer, ix, iy, iw) => {
        let yy = iy;
        yy += text(layer, ix, yy, `${ready ? '✓' : '◆'}  ${q.title}`, { fontStyle: 'bold', fontSize: UI.type.heading, color: ready ? GREEN : '#fff3d6', wordWrap: { width: iw } }).height + 4;
        yy += text(layer, ix, yy, questGiverLine(q), { fontSize: UI.type.small, color: npc ? hex(npc.color) : COLORS.textDim }).height + 10;
        if (ready) {
          yy += text(layer, ix, yy, `Готово! Вернитесь к заказчику: ${npc?.name || ''} (${q.place}).`, { fontSize: UI.type.small, fontStyle: 'bold', color: GREEN, wordWrap: { width: iw } }).height + 8;
        } else {
          yy += text(layer, ix, yy, q.summary, { fontSize: UI.type.small, color: COLORS.textDim, wordWrap: { width: iw } }).height + 10;
        }
        for (const o of log.objectives(id)) yy += checkRow(layer, ix, yy, iw, o.done, o.text);
        yy += 6;
        const coin = fit(this.add.image(ix + 14, yy + 15, 'icon_coin'), 28);
        layer.add(coin);
        yy += text(layer, ix + 36, yy, `Награда: ${log.rewardLines(id).join(', ')}`, { fontSize: UI.type.small, color: hex(COLORS.gold), wordWrap: { width: iw - 36 } }).height;
        return yy - iy;
      }) + 18;
    }

    const avail = log.available();
    if (avail.length) {
      cy += 6;
      cy = section(this, c, x, cy, w, 'Можно взять', { count: avail.length });
      for (const id of avail) {
        const q = SIDE_QUESTS[id];
        cy += card(this, c, x, cy, w, { accent: 0x6a5a48, fill: 0x1a120d, pad: 16 }, (layer, ix, iy, iw) => {
          let yy = iy;
          yy += text(layer, ix, yy, `•  ${q.title}`, { fontStyle: 'bold', wordWrap: { width: iw } }).height + 2;
          yy += text(layer, ix + 28, yy, `Взять: ${questGiverLine(q)}`, { fontSize: UI.type.small, color: COLORS.textDim, wordWrap: { width: iw - 28 } }).height;
          return yy - iy;
        }) + 12;
      }
    }

    const done = log.done();
    if (done.length) {
      cy += 12;
      cy = section(this, c, x, cy, w, 'Выполнено', { color: COLORS.textDim, count: done.length });
      cy += card(this, c, x, cy, w, { accent: 0x4a3a2c, fill: 0x15100c, pad: 16 }, (layer, ix, iy, iw) => {
        let yy = iy;
        for (const id of done) yy += text(layer, ix, yy, `✓  ${SIDE_QUESTS[id].title}`, { fontSize: UI.type.small, color: COLORS.textDim, wordWrap: { width: iw } }).height + 6;
        return yy - iy - 6;
      }) + 10;
    }
    return cy - y;
  },

  // ------------------------------------------------------------------ «Памятка»
  journalTips(c, x, y, w) {
    let cy = y;
    const tips = [
      { icon: 'icon_drop', title: 'Мана', color: 0x5fb8d9, body: 'Сбор и магия в лесу тратят ману. Она восстанавливается сама, а в доме Мирры — быстрее. Лунный эликсир возвращает её сразу.' },
      { icon: 'icon_heart', title: 'Здоровье', color: 0xc8443a, body: 'Здоровье одно на мир и бой. Вне боя оно медленно возвращается; Мирра подлечит за монеты, а настой жизни — прямо в бою.' },
      { icon: 'icon_fight', title: 'После поражения', color: 0xd9b45a, body: fm('Героиня остаётся у врага с 20% здоровья. Отдышитесь или подлечитесь, а новый бой — кнопкой «Сразиться снова».', 'Герой остаётся у врага с 20% здоровья. Отдышитесь или подлечитесь, а новый бой — кнопкой «Сразиться снова».') },
      { icon: 'icon_bag', title: 'Где что', color: 0xe8c56a, body: 'Сумка — кнопка внизу справа (B): травы, зелья, дары, амулеты. Журнал — справа вверху (J). Карта, Банк и Настройки — в Меню.' },
    ];
    for (const t of tips) {
      cy += card(this, c, x, cy, w, { accent: t.color, fill: 0x1a120d }, (layer, ix, iy, iw) => {
        layer.add(fit(this.add.image(ix + 30, iy + 34, t.icon), 56));
        const title = text(layer, ix + 76, iy, t.title, { fontStyle: 'bold', fontSize: UI.type.heading, color: hex(t.color) });
        const body = text(layer, ix + 76, iy + title.height + 4, T(t.body), { fontSize: UI.type.small, color: COLORS.text, wordWrap: { width: iw - 76 } });
        return Math.max(72, title.height + 4 + body.height);
      }) + 16;
    }
    return cy - y - 4;
  },
};
