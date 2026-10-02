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
import { addScrollViewport } from './scrollViewport.js';
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
  const t = scene.add.text(x, y, text, { fontFamily: FONT, fontSize: UI.type.body, color: COLORS.text, shadow: SH, ...style });
  c.add(t);
  return t;
}

export const windows08 = {
  // ================================================================== HUD: журнал-иконка, подсказка, стрелка
  buildV08Hud() {
    const { bus } = services;
    // иконка журнала с числом заданий в правом верхнем углу панели цели; вся панель открывает журнал
    this.journalIcon = fit(this.add.image(652, 158, 'icon_journal'), UI.icon.journal).setAlpha(0.95);
    this.journalBadge = this.add.container(682, 134);
    this.journalBadge.add([this.add.circle(0, 0, 19, 0xc8443a).setStrokeStyle(2, 0xf6e3a1), this.journalBadgeText = this.add.text(0, 0, '0', { fontFamily: FONT, fontSize: UI.type.small, fontStyle: 'bold', color: '#fff' }).setOrigin(0.5)]);
    this.questHit = this.add.zone(14, 122, 692, 150).setOrigin(0).setInteractive({ useHandCursor: true });
    this.questHit.on('pointerup', () => { if (!this.modal && this.mode === 'exploration') { services.audio.play('ui_click'); this.openJournal(); } });
    this.sideLine = this.add.text(32, 248, '', { fontFamily: FONT, fontSize: UI.type.small, color: hex(0x9fe9ff), shadow: SH, wordWrap: { width: 640 } });
    this.questPanel.add([this.journalIcon, this.journalBadge, this.sideLine]);

    this.hintPlate = this.add.container(W / 2, 300).setDepth(40).setVisible(false);
    this.hintBg = this.add.graphics();
    this.hintText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: UI.type.small, color: '#f6e3a1', align: 'left', wordWrap: { width: 628 }, lineSpacing: 2 }).setOrigin(0.5);
    this.hintPlate.add([this.hintBg, this.hintText]);

    // стрелка к цели у края экрана
    this.pointer = this.add.container(0, 0).setDepth(8400).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(0xffe08a, 0.95).fillTriangle(26, 0, -14, -20, -14, 20).lineStyle(3, 0x000000, 0.7).strokeTriangle(26, 0, -14, -20, -14, 20);
    this.pointerArrow = this.add.container(0, 0, [this.add.image(0, 0, 'fx_glow').setTint(0xffe08a).setBlendMode('ADD').setScale(0.9).setAlpha(0.6), g]);
    this.pointerText = this.add.text(0, 34, '', { fontFamily: FONT, fontSize: UI.type.small, color: '#ffe08a', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
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
      this.hintPlate.setVisible(false);
      this.layoutHint();
      return;
    }
    this.hintText.setText('✦ ' + text);
    const w = 692, h = this.hintText.height + 24;
    drawPlate(this.hintBg, w, h, { accent: 0xe8c56a, fill: 0x1a120d, alpha: 0.88, radius: 10 });
    this.hintPlate.setVisible(true).setAlpha(0);
    this.layoutHint();
    this.tweens.add({ targets: this.hintPlate, alpha: 1, duration: 240 });

    services.audio.play('hint', { minGap: 1500 });
  },

  onGuidePointer(p) {
    if (!p || this.modal || this.mode !== 'exploration') { this.pointer.setVisible(false); return; }
    const top = this.researchText.y + (this.researchText.text ? this.researchText.height : 0) + 46;
    this.pointer.setVisible(true).setPosition(p.x, Math.max(top, p.y));
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
        const sec = (text, color = COLORS.textGold) => { const t = label(this, c, x, cy, text, { fontSize: UI.type.heading, fontStyle: 'bold', color }); cy += t.height + 6; };
        const row = (text, o = {}) => { const t = label(this, c, x + (o.indent || 0), cy, text, { wordWrap: { width: w - (o.indent || 0) }, lineSpacing: 2, ...o.style }); cy += t.height + (o.gap ?? 6); return t; };
        sec('Главная цель');
        row(objective.full, { style: { fontSize: UI.type.body } });
        if (hints[0]) row('Подсказка: ' + hints[0], { style: { color: COLORS.textDim, fontSize: UI.type.small }, gap: 8 });
        cy += 6;
        const act = log.active();
        sec('Побочные задания', hex(0x9fe9ff));
        if (!act.length) row('Нет активных заданий.', { style: { color: COLORS.textDim } });
        for (const id of act) {
          const q = SIDE_QUESTS[id];
          const ready = log.status(id) === 'ready';
          row(`${ready ? '✓' : '◆'} ${q.title}`, { style: { fontSize: UI.type.body, fontStyle: 'bold', color: ready ? '#9be8a0' : COLORS.text }, gap: 2 });
          row(q.summary, { indent: 14, style: { fontSize: UI.type.small, color: COLORS.textDim }, gap: 2 });
          for (const o of log.objectives(id)) row(`${o.done ? '☑' : '☐'} ${o.text}`, { indent: 14, style: { fontSize: UI.type.small, color: o.done ? '#9be8a0' : COLORS.text }, gap: 1 });
          if (ready) row(`Вернитесь к заказчику: ${q.giver === 'veda' ? 'Веда' : q.giver === 'goran' ? 'Горан' : 'Селена'} (${q.place})`, { indent: 14, style: { fontSize: UI.type.small, color: '#9be8a0' }, gap: 1 });
          row(`Награда: ${log.rewardLines(id).join(', ')}`, { indent: 14, style: { fontSize: UI.type.small, color: hex(COLORS.gold) }, gap: 8 });
        }
        const avail = log.available();
        if (avail.length) {
          cy += 2;
          sec('Можно взять', COLORS.textGold);
          for (const id of avail) row(`• ${SIDE_QUESTS[id].title} — ${SIDE_QUESTS[id].place}`, { style: { fontSize: UI.type.small, color: COLORS.textDim }, gap: 3 });
        }
        const done = log.done();
        if (done.length) {
          cy += 6;
          sec('Выполнено', COLORS.textDim);
          for (const id of done) row(`✓ ${SIDE_QUESTS[id].title}`, { style: { fontSize: UI.type.small, color: COLORS.textDim }, gap: 2 });
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
        label(this, c, x, cy, 'Ресурсы в сумке', { fontSize: UI.type.heading, fontStyle: 'bold', color: COLORS.textGold });
        cy += 48;
        const step = w / RESOURCE_ORDER.length;
        RESOURCE_ORDER.forEach((id, i) => {
          const cx = x + step * (i + 0.5);
          c.add(fit(this.add.image(cx, cy + 30, RESOURCES[id].icon), UI.icon.resource));
          label(this, c, cx, cy + 68, `${state.item(id)}`, { fontSize: UI.type.body, fontStyle: 'bold' }).setOrigin(0.5, 0);
        });
        cy += 118;
        for (const r of alchemy.recipes()) {
          const p = POTIONS[r.result], chk = alchemy.check(r.id);
          const name = label(this, c, x + 104, cy + 18, p.name, { fontSize: UI.type.heading, fontStyle: 'bold', color: hex(p.color), wordWrap: { width: w - 128 } });
          const desc = label(this, c, x + 104, name.y + name.height + 8, p.text, { fontSize: UI.type.small, color: COLORS.textDim, wordWrap: { width: w - 128 }, lineSpacing: 3 });
          const ingY = Math.max(cy + 126, desc.y + desc.height + 34);
          const ch = ingY - cy + 142;
          const g = this.add.graphics().setPosition(x + w / 2, cy + ch / 2);
          drawPlate(g, w, ch, { accent: chk.ok ? p.color : 0x6a5a48, fill: 0x20160f, alpha: 0.9, radius: 12 });
          // Insert the background behind the labels already measured.
          c.add(g); c.sendToBack(g);
          c.add(fit(this.add.image(x + 50, cy + 62, p.icon), UI.icon.potion));
          const ingredientStep = w / chk.needs.length;
          chk.needs.forEach((n, i) => {
            const ix = x + 30 + i * ingredientStep;
            c.add(fit(this.add.image(ix + 24, ingY, ITEMS[n.id].icon), UI.icon.ingredient));
            label(this, c, ix + 58, ingY, `${n.have}/${n.need}`, { fontSize: UI.type.small, fontStyle: 'bold', color: n.ok ? '#9be8a0' : '#ff8a7a' }).setOrigin(0, 0.5);
          });
          label(this, c, x + 20, cy + ch - 66, `В сумке: ${state.item(r.result)}`, { fontSize: UI.type.small, color: COLORS.textDim }).setOrigin(0, 0.5);
          const b = addButton(this, x + w - 132, cy + ch - 62, 224, UI.touch.button, 'Сварить', {
            primary: chk.ok, accent: chk.ok ? p.color : null, fontSize: UI.type.body,
            onPress: () => { if (this.modal?.scroll?.canTap()) this.craftRecipe(r.id); },
          });
          if (!chk.ok) b.text.setAlpha(0.65);
          c.add(b.parts); cy += ch + 18;
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
    dlg.scroll?.destroy();
    if (dlg.container) { dlg.container.destroy(); for (const k of dlg.tempKeys) releaseTexture(this, k); dlg.tempKeys = []; }
    const npc = view.npc, pw = 684, cw = pw - 88, left = (W - pw) / 2;
    const node = d.node();
    const style = { fontFamily: FONT, fontSize: UI.type.bodyLarge, color: COLORS.text, wordWrap: { width: cw }, lineSpacing: 5 };
    let bodyH = 0;
    for (const ln of node.lines) { const t = this.add.text(0, 0, d.fmt(ln), style); bodyH = Math.max(bodyH, t.height); t.destroy(); }
    const choices = (node.choices || []).filter(ch => !ch.when || ch.when(d.context()));
    const content = this.add.container(0, 0);
    dlg.body = this.add.text(0, 0, '', style); content.add(dlg.body);
    let contentH = bodyH + 24;
    dlg.choiceViews = choices.map((ch, index) => {
      const measure = this.add.text(0, 0, ch.label, { fontFamily: FONT, fontSize: UI.type.body, wordWrap: { width: cw - 28 } });
      const bh = Math.max(UI.touch.button, measure.height + 28); measure.destroy();
      const by = contentH + bh / 2;
      const button = addButton(this, cw / 2, by, cw, bh, ch.label, {
        primary: index === 0, accent: index === 0 ? npc.color : null, fontSize: UI.type.body,
        onPress: () => { if (dlg.scroll.canTap()) { services.audio.play('ui_click'); this.dialogueChoose(index); } },
      });
      content.add(button.parts); button.parts.forEach(p => p.setVisible(false));
      contentH += bh + 12;
      return button;
    });
    const headerH = 118, footerH = 132, maxH = 1016;
    const viewH = Math.min(contentH, maxH - headerH - footerH);
    const ph = headerH + viewH + footerH, top = 1096 - ph;
    const c = this.add.container(0, 0).setDepth(9500);
    const catcher = this.add.rectangle(0, 0, W, H, 0x000000, 0.3).setOrigin(0).setInteractive();
    const panel = addPanel(this, left, top, pw, ph, { accent: npc.color, seed: 5 });
    dlg.tempKeys.push(panel.texKey); c.add([catcher, panel]);
    const px = left + 78, py = top + 22;
    c.add([this.add.circle(px, py, 62, 0x1a120d).setStrokeStyle(4, npc.color), fit(this.add.image(px, py, `portrait_${npc.id}`), 116)]);
    c.add(this.add.text(left + 156, top + 18, npc.name, { fontFamily: FONT, fontSize: UI.type.title, fontStyle: 'bold', color: hex(npc.color), shadow: SH }));
    c.add(this.add.text(left + 156, top + 62, npc.title, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.textDim, wordWrap: { width: pw - 184 }, shadow: SH }));
    c.add(addDivider(this, W / 2, top + 104, pw - 80, npc.color));
    dlg.scroll = addScrollViewport(this, c, content, { x: left + 36, y: top + headerH, width: cw, height: viewH, contentHeight: contentH });
    const close = addButton(this, 174, 1040, 232, UI.touch.button, 'Закрыть', { fontSize: UI.type.body, onPress: () => this.closeDialogue(true) });
    const more = addButton(this, 492, 1040, 324, UI.touch.button, 'Далее', { fontSize: UI.type.body, primary: true, accent: npc.color, onPress: () => this.dialogueTap() });
    c.add([...close.parts, ...more.parts]);
    dlg.more = more; dlg.full = view.text; dlg.typed = 0; dlg.shown = -1; dlg.view = view;
    dlg.top = top; dlg.ph = ph; dlg.bodyH = bodyH; dlg.container = c;
    if (dlg.scroll.max) c.add(this.add.text(W / 2, 974, '↕ Реплика и ответы прокручиваются', { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.textDim }).setOrigin(0.5));
    this.modal.container = c;
    dlg.choicesShown = false; dlg.typing = true;
    c.setAlpha(0); this.tweens.add({ targets: c, alpha: 1, duration: 140 });
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
    dlg.typing = false; dlg.shown = dlg.full.length; dlg.body.setText(dlg.full);
    if (dlg.view.last && dlg.view.choices?.length && !dlg.choicesShown) {
      dlg.choicesShown = true;
      dlg.more.parts.forEach(p => p.setVisible(false));
      dlg.choiceViews.forEach(b => b.parts.forEach(p => p.setVisible(true)));
      dlg.scroll.refreshInput();
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
    dlg.scroll?.destroy();
    dlg.container?.destroy();
    for (const k of dlg.tempKeys) releaseTexture(this, k);
    this.modal = null;
    services.modalOpen = false;
    services.audio.play('ui_back');
    this.bus.emit(MSG.MODAL_CLOSED);
    if (cancelled) services.dialogue.cancel();
    // The dialogue view and modal lock are gone; opening another window is now safe.
    services.dialogue.flushAfterClose();
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
        const sec = (text, color = COLORS.textGold) => { const t = label(this, c, x, cy, text, { fontSize: UI.type.body, fontStyle: 'bold', color }); cy += t.height + 6; };
        const row = (text, style = {}) => { const t = label(this, c, x, cy, text, { fontSize: UI.type.small, wordWrap: { width: w }, ...style }); cy += t.height + 3; };
        row(`Уровень героини: ${d.heroLevel}   ·   опыт ${d.heroXP}${next ? ` / ${next}` : ''}`, { fontSize: UI.type.body });
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
          const columns = 3, cell = w / columns;
          for (let start = 0; start < ids.length; start += columns) {
            const entries = ids.slice(start, start + columns).map((id, i) => {
              const have = state.item(id), cx = x + cell * (i + 0.5);
              const text = label(this, c, cx, cy + 104, itemOf(id).name, { fontSize: UI.type.small, color: have ? COLORS.text : COLORS.textDim, align: 'center', wordWrap: { width: cell - 22 }, lineSpacing: 2 }).setOrigin(0.5, 0);
              return { id, have, cx, text };
            });
            const rowH = 116 + Math.max(...entries.map(e => e.text.height));
            for (const { id, have, cx, text } of entries) {
              const slot = this.add.graphics().setPosition(cx, cy + rowH / 2);
              drawPlate(slot, cell - 12, rowH, { accent: have ? itemOf(id).color : 0x6a5a48, fill: 0x20160f, alpha: 0.85, radius: 10 });
              c.add(slot); c.sendToBack(slot);
              const icon = fit(this.add.image(cx, cy + 54, itemOf(id).icon), UI.icon.resource);
              if (!have) icon.setAlpha(0.45);
              c.add(icon);
              label(this, c, cx + cell / 2 - 26, cy + 10, `${have}`, { fontSize: UI.type.body, fontStyle: 'bold', color: have ? '#fff' : COLORS.textDim }).setOrigin(1, 0);
            }
            cy += rowH + 12;
          }
          cy += 12;
        };
        grid('Ресурсы', RESOURCE_ORDER, (id) => RESOURCES[id]);
        grid('Расходники (в бою)', POTION_ORDER, (id) => POTIONS[id]);
        const other = Object.entries(d.inventory).filter(([k, v]) => v > 0 && !RESOURCES[k] && !POTIONS[k]);
        if (other.length) { cy += 4; row(other.map(([k, v]) => `${ITEMS[k]?.name || k}: ${v}`).join('   ·   '), { fontSize: UI.type.small }); }
        if (d.stats.combats.length) {
          cy += 4;
          const last = d.stats.combats.slice(-2).map(cb => `${ENEMIES[cb.enemy]?.name || cb.enemy}: ${cb.result === 'victory' ? 'победа' : 'поражение'}, ${cb.timeSec} с`);
          row('Бои: ' + last.join(' · '), { fontSize: UI.type.small, color: COLORS.textDim });
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
