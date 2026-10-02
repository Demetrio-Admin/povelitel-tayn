// v0.8 — окна и HUD-элементы нового слоя: журнал, диалог, алхимия, сумка, стрелка к цели, мягкая подсказка.
// Методы подмешиваются в UIScene (Object.assign(UIScene.prototype, windows08)), поэтому `this` — UIScene.
// Все данные берутся из сервисов (services.log / alchemy / dialogue / guidance) и конфигов, здесь — только рисунок и ввод.
import { VIEW, COLORS } from '../config/game.config.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { ENEMIES } from '../config/balance.enemies.js';
import { ITEMS } from '../config/balance.progression.js';
import { RESOURCES, POTIONS, RESOURCE_ORDER, POTION_ORDER } from '../config/resources.js';
import { RECIPES } from '../config/recipes.js';
import { SIDE_QUESTS } from '../config/quests.js';
import { UI } from '../config/ui.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { ABILITY_ORDER } from '../systems/AbilitySystem.js';
import { ROMAN } from '../objects/InteractiveObject.js';
import { addPanel, addDivider, addButton, drawPlate, releaseTexture } from './widgets.js';

const FONT = UI.font;
const SH = UI.shadow;
const W = VIEW.width;
const H = VIEW.height;
const hex = c => '#' + c.toString(16).padStart(6, '0');
const fit = (img, size) => { img.setScale(size / Math.max(img.width, img.height, 1)); return img; };

/** Размер текста: добавляет в контейнер и возвращает объект. */
function label(scene, c, x, y, text, style = {}) {
  const t = scene.add.text(x, y, text, { fontFamily: FONT, fontSize: '19px', color: COLORS.text, shadow: SH, ...style });
  c.add(t);
  return t;
}

export const windows08 = {
  // ================================================================== HUD: журнал-иконка, подсказка, стрелка
  buildV08Hud() {
    const { bus } = services;
    // иконка журнала с числом заданий в правом верхнем углу панели цели; вся панель открывает журнал
    this.journalIcon = this.add.image(404, 38, 'icon_journal').setScale(0.5).setAlpha(0.95);
    this.journalBadge = this.add.container(420, 24);
    this.journalBadge.add([this.add.circle(0, 0, 11, 0xc8443a).setStrokeStyle(2, 0xf6e3a1), this.journalBadgeText = this.add.text(0, 0, '0', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5)]);
    this.questHit = this.add.zone(14, 14, 420, 124).setOrigin(0).setInteractive({ useHandCursor: true });
    this.questHit.on('pointerup', () => { if (!this.modal && this.mode === 'exploration') { services.audio.play('ui_click'); this.openJournal(); } });
    this.sideLine = this.add.text(32, 108, '', { fontFamily: FONT, fontSize: '16px', color: hex(0x9fe9ff), shadow: SH, wordWrap: { width: 370 } });
    this.questPanel.add([this.journalIcon, this.journalBadge, this.sideLine]);

    // мягкая подсказка под панелью цели
    this.hintPlate = this.add.container(224, 150).setDepth(40).setVisible(false);
    this.hintBg = this.add.graphics();
    this.hintText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '17px', color: '#f6e3a1', align: 'left', wordWrap: { width: 386 }, lineSpacing: 2 }).setOrigin(0.5);
    this.hintPlate.add([this.hintBg, this.hintText]);

    // стрелка к цели у края экрана
    this.pointer = this.add.container(0, 0).setDepth(8400).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(0xffe08a, 0.95).fillTriangle(26, 0, -14, -20, -14, 20).lineStyle(3, 0x000000, 0.7).strokeTriangle(26, 0, -14, -20, -14, 20);
    this.pointerArrow = this.add.container(0, 0, [this.add.image(0, 0, 'fx_glow').setTint(0xffe08a).setBlendMode('ADD').setScale(0.9).setAlpha(0.6), g]);
    this.pointerText = this.add.text(0, 34, '', { fontFamily: FONT, fontSize: '17px', color: '#ffe08a', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    this.pointer.add([this.pointerArrow, this.pointerText]);

    bus.on(MSG.OPEN_JOURNAL, this.openJournal, this);
    bus.on(MSG.OPEN_ALCHEMY, this.openAlchemy, this);
    bus.on(MSG.NPC_TALK, this.openDialogue, this);
    bus.on(MSG.SIDE_QUEST, this.onSideQuest, this);
    bus.on(MSG.GUIDE_POINTER, this.onGuidePointer, this);
    bus.on(MSG.GUIDE_HINT, this.onGuideHint, this);
    this.input.keyboard?.on('keydown-J', () => { if (!this.modal && this.mode === 'exploration') this.openJournal(); });
  },

  refreshV08Hud() {
    const log = services.log;
    if (!log || !this.sideLine) return;
    const n = log.activeCount();
    this.journalBadge.setVisible(n > 0 && this.mode !== 'combat');
    this.journalBadgeText.setText(String(n));
    this.journalIcon.setVisible(this.mode !== 'combat');
    this.sideLine.setText(this.mode === 'combat' ? '' : (log.hudLine() ? '◆ ' + log.hudLine() : ''));
  },

  onSideQuest(id, what) {
    const q = SIDE_QUESTS[id];
    if (!q) return;
    if (what === 'start') { this.toast(`Новое задание: «${q.title}»`, 0x9fe9ff); services.audio.play('quest_update'); }
    if (what === 'done') { this.toast(`Задание выполнено: «${q.title}»`, COLORS.gold); services.audio.play('level_up'); }
    this.refreshV08Hud();
  },

  onGuideHint(text) {
    this.tweens.killTweensOf(this.hintPlate);
    if (!text) {
      if (this.hintPlate.visible) this.tweens.add({ targets: this.hintPlate, alpha: 0, duration: 200, onComplete: () => this.hintPlate.setVisible(false) });
      this.researchText.setY(150);
      return;
    }
    this.hintText.setText('✦ ' + text);
    const w = 420, h = this.hintText.height + 20;
    drawPlate(this.hintBg, w, h, { accent: 0xe8c56a, fill: 0x1a120d, alpha: 0.88, radius: 10 });
    this.hintPlate.setPosition(224, 146 + h / 2).setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.hintPlate, alpha: 1, duration: 240 });
    this.researchText.setY(146 + h + 10);
    services.audio.play('hint', { minGap: 1500 });
  },

  onGuidePointer(p) {
    if (!p || this.modal || this.mode !== 'exploration') { this.pointer.setVisible(false); return; }
    this.pointer.setVisible(true).setPosition(p.x, p.y);
    this.pointerArrow.setRotation(p.angle);
    this.pointerArrow.setScale(1 + Math.sin(this.time.now / 220) * 0.08);
    this.pointerText.setText(`${Math.max(1, Math.round(p.dist / 10) * 10)}`);
  },

  // ================================================================== журнал
  openJournal() {
    if (this.mode === 'combat' || this.modal) return;
    services.audio.play('journal');
    const { log, guidance, quests } = services;
    const objective = guidance.objective();
    const hints = guidance.hints();
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        let cy = y;
        const sec = (text, color = COLORS.textGold) => { const t = label(this, c, x, cy, text, { fontSize: '22px', fontStyle: 'bold', color }); cy += t.height + 6; };
        const row = (text, o = {}) => { const t = label(this, c, x + (o.indent || 0), cy, text, { wordWrap: { width: w - (o.indent || 0) }, lineSpacing: 2, ...o.style }); cy += t.height + (o.gap ?? 6); return t; };
        sec('Главная цель');
        row(objective.full, { style: { fontSize: '21px' } });
        if (hints[0]) row('Подсказка: ' + hints[0], { style: { color: COLORS.textDim, fontSize: '17px' }, gap: 8 });
        cy += 6;
        const act = log.active();
        sec('Побочные задания', hex(0x9fe9ff));
        if (!act.length) row('Нет активных заданий.', { style: { color: COLORS.textDim } });
        for (const id of act) {
          const q = SIDE_QUESTS[id];
          const ready = log.status(id) === 'ready';
          row(`${ready ? '✓' : '◆'} ${q.title}`, { style: { fontSize: '20px', fontStyle: 'bold', color: ready ? '#9be8a0' : COLORS.text }, gap: 2 });
          row(q.summary, { indent: 14, style: { fontSize: '16px', color: COLORS.textDim }, gap: 2 });
          for (const o of log.objectives(id)) row(`${o.done ? '☑' : '☐'} ${o.text}`, { indent: 14, style: { fontSize: '17px', color: o.done ? '#9be8a0' : COLORS.text }, gap: 1 });
          if (ready) row(`Вернитесь к заказчику: ${q.giver === 'veda' ? 'Веда' : q.giver === 'goran' ? 'Горан' : 'Селена'} (${q.place})`, { indent: 14, style: { fontSize: '16px', color: '#9be8a0' }, gap: 1 });
          row(`Награда: ${log.rewardLines(id).join(', ')}`, { indent: 14, style: { fontSize: '16px', color: hex(COLORS.gold) }, gap: 8 });
        }
        const avail = log.available();
        if (avail.length) {
          cy += 2;
          sec('Можно взять', COLORS.textGold);
          for (const id of avail) row(`• ${SIDE_QUESTS[id].title} — ${SIDE_QUESTS[id].place}`, { style: { fontSize: '17px', color: COLORS.textDim }, gap: 3 });
        }
        const done = log.done();
        if (done.length) {
          cy += 6;
          sec('Выполнено', COLORS.textDim);
          for (const id of done) row(`✓ ${SIDE_QUESTS[id].title}`, { style: { fontSize: '16px', color: COLORS.textDim }, gap: 2 });
        }
        return cy - y;
      },
    };
    this.openModal({
      title: 'Журнал', color: COLORS.gold, text: '', content,
      buttons: [{ label: 'Закрыть', primary: true }, { label: 'Сумка', onClick: () => this.openBag() }],
    });
  },

  // ================================================================== алхимия
  openAlchemy() {
    if (this.mode !== 'exploration' || this.modal) return;
    const { alchemy, state } = services;
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        let cy = y;
        // запас ресурсов
        const step = w / RESOURCE_ORDER.length;
        RESOURCE_ORDER.forEach((id, i) => {
          const cx = x + step * (i + 0.5);
          c.add(fit(this.add.image(cx, cy + 22, RESOURCES[id].icon), 44));
          label(this, c, cx, cy + 56, `${state.item(id)}`, { fontSize: '19px', fontStyle: 'bold' }).setOrigin(0.5, 0);
        });
        cy += 90;
        c.add(addDivider(this, x + w / 2, cy, w - 40));
        cy += 16;
        for (const r of alchemy.recipes()) {
          const p = POTIONS[r.result];
          const chk = alchemy.check(r.id);
          const ch = 124;
          const g = this.add.graphics().setPosition(x + w / 2, cy + ch / 2);
          drawPlate(g, w, ch, { accent: chk.ok ? p.color : 0x6a5a48, fill: 0x20160f, alpha: 0.9, radius: 12 });
          c.add(g);
          c.add(fit(this.add.image(x + 46, cy + 46, p.icon), 62));
          label(this, c, x + 92, cy + 12, p.name, { fontSize: '22px', fontStyle: 'bold', color: hex(p.color) });
          label(this, c, x + 92, cy + 40, p.text, { fontSize: '15px', color: COLORS.textDim, wordWrap: { width: w - 250 } });
          // ингредиенты
          let ix = x + 92;
          for (const n of chk.needs) {
            const ic = fit(this.add.image(ix + 14, cy + 90, ITEMS[n.id].icon), 28);
            c.add(ic);
            const t = label(this, c, ix + 32, cy + 90, `${n.have}/${n.need}`, { fontSize: '17px', fontStyle: 'bold', color: n.ok ? '#9be8a0' : '#ff8a7a' }).setOrigin(0, 0.5);
            ix += 32 + t.width + 18;
          }
          label(this, c, x + w - 24, cy + 16, `в сумке: ${state.item(r.result)}`, { fontSize: '15px', color: COLORS.textDim }).setOrigin(1, 0);
          const b = addButton(this, x + w - 74, cy + 78, 124, 46, 'Сварить', {
            primary: chk.ok, accent: chk.ok ? p.color : null, fontSize: 19,
            onPress: () => this.craftRecipe(r.id),
          });
          if (!chk.ok) b.text.setAlpha(0.5);
          c.add(b.parts);
          cy += ch + 10;
        }
        return cy - y - 10;
      },
    };
    this.openModal({
      title: 'Котёл Мирры', color: 0x8fe39a, text: 'Сварите расходники из собранных трав, грибов, смолы и пыли. Они пригодятся в бою.', content,
      buttons: [{ label: 'Закрыть', primary: true }],
    });
  },

  craftRecipe(id) {
    const res = services.alchemy.craft(id);
    const p = POTIONS[RECIPES[id].result];
    if (!res.ok) {
      services.audio.play('locked');
      this.toast('Не хватает: ' + res.missing.map(m => `${m.name} ${m.have}/${m.need}`).join(', '), COLORS.danger);
      return;
    }
    services.audio.play('brew');
    this.toast(`Сварено: ${p.name}`, p.color);
    this.reopenModal();
  },

  // ================================================================== диалог
  openDialogue(npcId) {
    const d = services.dialogue;
    if (!d.active || this.dlg) return;
    if (this.modal) { // другое окно уже открыто — диалог не начинаем
      d.cancel();
      return;
    }
    services.modalOpen = true;
    this.resetJoystick();
    services.audio.play('talk_open');
    this.bus.emit(MSG.MODAL_OPEN);
    this.dlg = { npcId, container: null, tempKeys: [], typed: 0, full: '', timer: null, busy: false };
    this.modal = { container: null, buttons: [], views: [], final: false, dialogue: true,
      onPrimary: () => this.dialogueTap(), onCancel: () => this.closeDialogue(true) };
    this.renderDialogue();
  },

  /** Рисует текущий узел диалога. Высота окна считается по самой длинной реплике узла, чтобы окно не прыгало. */
  renderDialogue() {
    const d = services.dialogue, dlg = this.dlg;
    if (!dlg) return;
    const view = d.view();
    if (!view) { this.closeDialogue(false); return; }
    if (dlg.container) { dlg.container.destroy(); for (const k of dlg.tempKeys) releaseTexture(this, k); dlg.tempKeys = []; }
    const npc = view.npc;
    const pw = 684, left = (W - pw) / 2;
    const node = d.node();
    const style = { fontFamily: FONT, fontSize: '23px', color: COLORS.text, wordWrap: { width: pw - 70 }, lineSpacing: 5 };
    let bodyH = 0;
    for (const ln of node.lines) { const t = this.add.text(0, 0, d.fmt(ln), style); bodyH = Math.max(bodyH, t.height); t.destroy(); }
    const nChoices = node.choices ? node.choices.filter(ch => !ch.when || ch.when(d.context())).length : 0;
    const choiceH = 60, gap = 10;
    const ph = 88 + bodyH + 24 + (nChoices ? nChoices * (choiceH + gap) + 6 : 40);
    const bottom = 1096, top = bottom - ph;
    const c = this.add.container(0, 0).setDepth(9500);
    // прозрачный слой: тап в любом месте продвигает диалог
    const catcher = this.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
    catcher.on('pointerup', () => this.dialogueTap());
    c.add(catcher);
    const panel = addPanel(this, left, top, pw, ph, { accent: npc.color, seed: 5 });
    dlg.tempKeys.push(panel.texKey);
    c.add(panel);
    // портрет: круглая рамка поверх верхнего края окна (картинка portrait_<npc> нарисована уже по плечи)
    const px = left + 70, py = top - 4;
    const ring = this.add.circle(px, py, 54, 0x1a120d, 1).setStrokeStyle(4, npc.color);
    const glow = this.add.image(px, py, 'fx_glow').setTint(npc.color).setBlendMode('ADD').setScale(1.1).setAlpha(0.5);
    const portrait = fit(this.add.image(px, py, `portrait_${npc.id}`), 100);
    c.add([glow, ring, portrait]);
    c.add(this.add.text(left + 140, top + 14, npc.name, { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: hex(npc.color), shadow: SH }));
    c.add(this.add.text(left + 140, top + 48, npc.title, { fontFamily: FONT, fontSize: '17px', color: COLORS.textDim, shadow: SH }));
    c.add(addDivider(this, W / 2, top + 82, pw - 80, npc.color));
    dlg.body = this.add.text(left + 34, top + 96, '', style);
    c.add(dlg.body);
    dlg.full = view.text;
    dlg.typed = 0;
    dlg.view = view;
    dlg.choiceViews = [];
    dlg.more = this.add.text(left + pw - 34, top + ph - 26, '▼', { fontFamily: FONT, fontSize: '24px', color: hex(npc.color) }).setOrigin(1, 0.5);
    c.add(dlg.more);
    this.tweens.add({ targets: dlg.more, alpha: { from: 0.3, to: 1 }, duration: 480, yoyo: true, repeat: -1 });
    dlg.top = top; dlg.ph = ph; dlg.left = left; dlg.pw = pw; dlg.bodyH = bodyH; dlg.choiceH = choiceH; dlg.gap = gap;
    dlg.container = c;
    this.modal.container = c;
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 140 });
    dlg.more.setVisible(!(view.last && view.choices));
    dlg.choicesShown = false;
    dlg.typing = true;
  },

  /** Появление букв и ответов — вызывается из update(). */
  updateDialogue(delta) {
    const dlg = this.dlg;
    if (!dlg || !dlg.container || !dlg.typing) return;
    dlg.typed = Math.min(dlg.full.length, dlg.typed + delta * 0.058);
    const n = Math.floor(dlg.typed);
    if (n !== dlg.shown) {
      if (n % 3 === 0) services.audio.play('talk_blip', { minGap: 70 });
      dlg.shown = n;
      dlg.body.setText(dlg.full.slice(0, n));
    }
    if (dlg.typed >= dlg.full.length) this.finishTyping();
  },

  finishTyping() {
    const dlg = this.dlg;
    if (!dlg || !dlg.typing) return;
    dlg.typing = false;
    dlg.shown = dlg.full.length;
    dlg.body.setText(dlg.full);
    const view = dlg.view;
    if (view.last && view.choices?.length && !dlg.choicesShown) {
      dlg.choicesShown = true;
      dlg.more.setVisible(false);
      const { left, pw, top, ph, choiceH, gap } = dlg;
      const n = view.choices.length;
      view.choices.forEach((ch, i) => {
        const by = top + ph - 14 - (n - i) * (choiceH + gap) + gap + choiceH / 2;
        const b = addButton(this, left + pw / 2, by, pw - 70, choiceH, ch.label, {
          primary: i === 0, accent: i === 0 ? dlg.view.npc.color : null, fontSize: 21,
          onPress: () => { services.audio.play('ui_click'); this.dialogueChoose(ch.index); },
        });
        dlg.container.add(b.parts);
        dlg.choiceViews.push(b);
        for (const p of b.parts) p.setAlpha(0);
        this.tweens.add({ targets: b.parts, alpha: 1, duration: 160, delay: i * 50 });
      });
    }
  },

  /** Тап/пробел: допечатать реплику, затем — следующая реплика. Когда показаны ответы — тап по пустому месту ничего не делает. */
  dialogueTap() {
    const dlg = this.dlg;
    if (!dlg || !dlg.container) return;
    if (dlg.typing) { this.finishTyping(); return; }
    const view = dlg.view;
    if (view.last && view.choices?.length) {
      // пробел/Enter выбирает первый ответ
      this.dialogueChoose(view.choices[0].index);
      return;
    }
    const alive = services.dialogue.advance();
    services.audio.play('ui_click', { minGap: 100 });
    if (!alive) this.closeDialogue(false); else this.renderDialogue();
  },

  dialogueChoose(index) {
    const alive = services.dialogue.choose(index);
    if (!alive) this.closeDialogue(false); else this.renderDialogue();
  },

  /** cancelled — закрыли досрочно (Esc): разговор нужно завершить в движке. */
  closeDialogue(cancelled) {
    const dlg = this.dlg;
    if (!dlg) return;
    this.dlg = null;
    dlg.container?.destroy();
    for (const k of dlg.tempKeys) releaseTexture(this, k);
    this.modal = null;
    services.modalOpen = false;
    services.audio.play('ui_back');
    this.bus.emit(MSG.MODAL_CLOSED);
    if (cancelled) services.dialogue.cancel();
    this.refreshQuest();
    this.refreshHud();
    if (!this.modal && this.modalQueue.length) this.openModal(this.modalQueue.shift());
  },

  // ================================================================== сумка (ресурсы, расходники, дары)
  openBag() {
    if (this.mode !== 'exploration' || this.modal) return;
    services.tutorial.complete('bag');
    const { state, abilities } = services;
    const d = state.data;
    const next = state.nextLevelXP();
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        let cy = y;
        const sec = (text, color = COLORS.textGold) => { const t = label(this, c, x, cy, text, { fontSize: '21px', fontStyle: 'bold', color }); cy += t.height + 6; };
        const row = (text, style = {}) => { const t = label(this, c, x, cy, text, { fontSize: '18px', wordWrap: { width: w }, ...style }); cy += t.height + 3; };
        row(`Уровень героини: ${d.heroLevel}   ·   опыт ${d.heroXP}${next ? ` / ${next}` : ''}`, { fontSize: '20px' });
        cy += 4;
        sec('Дары');
        for (const id of ABILITY_ORDER) {
          const lv = abilities.level(id);
          row(`${ABILITIES[id].name}: ${lv ? ROMAN[lv] : '— не открыт'}   ·   опыт дара ${d.schoolXP[id] || 0}`, { color: lv ? COLORS.text : COLORS.textDim });
        }
        cy += 8;
        // сетка предметов: иконка, число, название
        const grid = (title, ids, itemOf) => {
          sec(title);
          const cell = w / ids.length;
          ids.forEach((id, i) => {
            const have = state.item(id);
            const cx = x + cell * (i + 0.5);
            const slot = this.add.graphics().setPosition(cx, cy + 46);
            drawPlate(slot, cell - 10, 92, { accent: have ? itemOf(id).color : 0x4a3a2c, fill: 0x20160f, alpha: 0.85, radius: 10 });
            c.add(slot);
            const icon = fit(this.add.image(cx, cy + 30, itemOf(id).icon), 38);
            if (!have) icon.setAlpha(0.35);
            c.add(icon);
            label(this, c, cx + 22, cy + 8, `${have}`, { fontSize: '17px', fontStyle: 'bold', color: have ? '#fff' : COLORS.textDim }).setOrigin(0.5, 0);
            label(this, c, cx, cy + 62, itemOf(id).name.replace('Лунный ', 'Лун. '), { fontSize: '13px', color: COLORS.textDim, align: 'center', wordWrap: { width: cell - 14 } }).setOrigin(0.5, 0);
          });
          cy += 100;
        };
        grid('Ресурсы', RESOURCE_ORDER, (id) => RESOURCES[id]);
        grid('Расходники (в бою)', POTION_ORDER, (id) => POTIONS[id]);
        const other = Object.entries(d.inventory).filter(([k, v]) => v > 0 && !RESOURCES[k] && !POTIONS[k]);
        if (other.length) { cy += 4; row(other.map(([k, v]) => `${ITEMS[k]?.name || k}: ${v}`).join('   ·   '), { fontSize: '17px' }); }
        if (d.stats.combats.length) {
          cy += 4;
          const last = d.stats.combats.slice(-2).map(cb => `${ENEMIES[cb.enemy]?.name || cb.enemy}: ${cb.result === 'victory' ? 'победа' : 'поражение'}, ${cb.timeSec} с`);
          row('Бои: ' + last.join(' · '), { fontSize: '15px', color: COLORS.textDim });
        }
        return cy - y;
      },
    };
    this.openModal({
      title: 'Сумка ведьмы', color: COLORS.gold, text: '', content,
      buttons: [{ label: 'Закрыть', primary: true }, { label: 'Журнал', onClick: () => this.openJournal() }, { label: 'Меню', onClick: () => this.openPause() }],
    });
  },
};
