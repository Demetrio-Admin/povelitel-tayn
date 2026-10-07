// Дымовой тест интерфейса: настоящие UIScene / MenuScene / CombatScene на заглушке Phaser (tools/ui/fake-phaser.mjs).
// Ловит ошибки в нашем коде (опечатки, неверные ключи текстур, утечки, падения на крайних значениях).
// НЕ проверяет сам Phaser: рендер, ввод и физику это не заменяет.
// Запуск: node --import ./tools/ui/register.mjs tests/ui-smoke.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import { setupStage, freshWorld, mkHud } from '../tools/ui/stage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const ctxStub = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
const createCanvas = (w, h) => ({ width: w, height: h, getContext: () => ctxStub() });
const loadImage = async () => ({ width: 64, height: 64 });
const { Reg } = await setupStage({ createCanvas, loadImage, root: ROOT });
const { COLORS } = await import('../src/config/game.config.js');
const mute = async (fn) => { const orig = console.info; console.info = () => {}; try { return await fn(); } finally { console.info = orig; } };   // [event] из QuestFlags

console.log('Интерфейс: дымовой тест сцен');
await mute(async () => {
  await freshWorld('mid');
  const { UIScene } = await import('../src/scenes/UIScene.js');
  const { MenuScene } = await import('../src/scenes/MenuScene.js');
  const { CombatScene } = await import('../src/scenes/CombatScene.js');

  // ---- HUD исследования
  let ui, err = null;
  try {
    ui = new UIScene(); ui.create(); mkHud(ui);
    ui.zoneName = 'Стартовая поляна'; ui.refreshQuest(); ui.refreshHud();
    ui.onFocus({ icon: 'icon_hand', color: COLORS.telekinesis, label: 'Сдвинуть камень', ability: 'telekinesis' });
    ui.onFocus(null);
    ui.toast('+1 Лунный осколок', COLORS.gold); ui.toast('Не хватает маны', COLORS.fire);
    ui.onTutorial({ id: 'telekinesis', text: 'Нажмите Телекинез', target: 'telekinesis' });
    ui.onTutorial({ id: 'move', text: 'Потяните', target: 'swipe' });
    ui.onTutorial(null);
    for (let i = 0; i < 5; i++) ui.update(5000 + i * 16, 16);
    ui.setMode('combat'); ui.update(6000, 16); ui.setMode('exploration');
  } catch (e) { err = e; }
  ok(!err, 'HUD: создаётся, обновляется, переключает режимы' + (err ? ': ' + err.stack.split('\n').slice(0, 3).join(' | ') : ''));

  // Action button switches between exported icons with different source resolutions.
  const journalTexture = Reg.textures.get('icon_journal');
  Reg.textures.set('icon_journal', { width: 2048, height: 1024 });
  ui.onFocus({ icon: 'icon_journal', color: COLORS.gold, label: 'Поручения' });
  ok(ui.ctxIcon.displayWidth === 60 && ui.ctxIcon.displayHeight === 30, 'контекстная книга из 2048px умещается в кнопку 60px');
  ui.onFocus({ icon: 'icon_talk', color: COLORS.gold, label: 'Говорить' });
  ok(Math.max(ui.ctxIcon.displayWidth, ui.ctxIcon.displayHeight) === 60, 'смена книги на разговор сохраняет размер кнопки');
  Reg.textures.set('icon_journal', journalTexture); ui.onFocus(null);

  // ---- полосы на крайних значениях
  err = null;
  try {
    for (const [hp, mana] of [[0, 0], [138, 100], [-5, 999], [NaN, 50]]) { mkHud(ui, { hp, mana }); ui.update(7000, 16); }
    mkHud(ui, { hp: 0, mana: 0 }); ui.update(7100, 16);
  } catch (e) { err = e; }
  ok(!err && !ui.hpBar.fill.visible && !ui.manaBar.fill.visible, 'HUD: полосы при 0, отрицательных и NaN не падают, пустая заливка скрыта');

  // ---- окна: открыть/закрыть, очередь, утечки текстур
  const cycle = () => {
    ui.openPause(); ui.closeModal(null);
    ui.openBag(); ui.closeModal(null);
    ui.openUpgrade('telekinesis_2'); ui.closeModal(null);
    ui.openSettings(); ui.closeModal(null);
    ui.confirmReset(); ui.closeModal(null);
    ui.openFinal(); ui.closeModal(null);
    ui.openModal({ title: 'A', text: 'x', buttons: [{ label: 'Ок', primary: true }] }); ui.openModal({ title: 'B', text: 'y' });
    ui.closeModal(null); ui.closeModal(null);
  };
  err = null; try { cycle(); } catch (e) { err = e; }
  ok(!err && ui.modal === null && !ui.modalQueue.length, 'окна: пауза, сумка, изучение, настройки, сброс, финал и очередь открываются и закрываются' + (err ? ': ' + err.stack.split('\n').slice(0, 3).join(' | ') : ''));
  const keys1 = [...Reg.textures.keys()].filter(k => k.startsWith('ui:')).sort();
  err = null; try { cycle(); cycle(); } catch (e) { err = e; }
  const keys2 = [...Reg.textures.keys()].filter(k => k.startsWith('ui:')).sort();
  ok(!err && keys1.length === keys2.length, `окна: повторные открытия не копят текстуры (${keys2.length} ui-текстур)`);
  ui.openBag();
  const tmp = ui.modal.tempKeys[0];
  ok(tmp && Reg.textures.has(tmp), 'окна: панель окна существует, пока оно открыто');
  ui.closeModal(null);
  ok(!Reg.textures.has(tmp), 'окна: временная панель освобождается при закрытии');

  // ---- v0.8: журнал, алхимия, диалог, сумка с ресурсами, HUD цели
  err = null;
  const brokenTexts = [];
  try {
    const { services: sv } = await import('../src/services.js');
    const st = sv.state;
    for (const k of ['moon_herb', 'forest_mushroom', 'tree_resin', 'rune_dust']) st.addItem(k, 3);
    st.addItem('elixir_life', 1);
    sv.log.accept('sq_herbs');
    ui.refreshQuest(); ui.refreshV08Hud();
    ui.onSideQuest('sq_herbs', 'ready'); ui.onGuideHint('Книга лежит в центре дома.'); ui.onGuidePointer({ x: 300, y: 200, angle: 1 }); ui.onGuidePointer(null);
    ui.openJournal(); ui.update(8000, 16); ui.closeModal(null);
    ui.openAlchemy(); ui.craftRecipe('elixir_life'); ui.craftRecipe('resin_flask'); ui.update(8100, 16); ui.closeModal(null);
    ui.openBag(); ui.closeModal(null);
    // v0.23.0: доска поручений — закрытая и открытая (взять поручение, сдать)
    ui.openDaily(); ui.closeModal(null);
    st.markEvent('ch2_quarter_cleared'); st.addItem('frost_herb', 10); st.addItem('ice_crystal', 3); st.addItem('elixir_life', 3);
    ui.openDaily(); ui.update(8200, 16);
    { const { dailyView } = await import('../src/systems/dailyModel.js'); const id = dailyView(st).rows[0].id; await ui.dailyAct('take', id); await ui.dailyAct('done', id); }
    ui.closeModal(null);
    // v0.26.0: окно Магической Дуэли (закрыто до главы II, потом — рейтинг, лига и попытки)
    ui.openDuel();
    st.markEvent('chapter_2_complete');
    ui.openDuel(); ui.update(8300, 16); ui.closeModal(null);
    // v0.9.2: окно диалога обоими героями — ни одна надпись (реплика или кнопка ответа) не «[object Object]»
    const { setHeroSource } = await import('../src/state/hero.js');
    const { heroIdNow } = await import('../src/services.js');
    const texts = () => { const out = []; const walk = (o) => { if (typeof o.text === 'string') out.push(o.text); (o.list || o.children || []).forEach?.(walk); }; (ui._list || ui.children?.list || []).forEach(walk); return out; };
    for (const hero of ['witch', 'warlock']) {
      setHeroSource(() => hero);
      for (const npc of ['mirra', 'veda', 'goran', 'selena']) {
        sv.dialogue.start(npc); ui.openDialogue(npc);   // окно открывается для уже начатого разговора
        for (let i = 0; i < 12 && sv.dialogue.active; i++) {
          for (let k = 0; k < 40; k++) ui.update(8200 + k * 30, 30);
          brokenTexts.push(...[...texts(), ...(ui.dlg?.choiceViews || []).map(b => b.text.text)].filter(t => /\[object|undefined/.test(t)).map(t => `${hero}/${npc}: ${t}`));
          const v = sv.dialogue.view(); if (v?.choices) ui.dialogueChoose(v.choices.length - 1); else ui.dialogueTap();
        }
        if (sv.dialogue.active) ui.closeDialogue(true);
        for (let k = 0; k < 20; k++) ui.update(8800 + k * 30, 30);
        for (let k = 0; k < 5 && (ui.modal || ui.modalQueue.length); k++) ui.closeModal(null);   // окна, открытые ответами (котёл, журнал, алтарь)
      }
    }
    // вступление Мирры (ответы героя с вариантами: «Что я должна/должен искать?», «Поняла./Понял.»): новый персонаж
    const savedEvents = [...sv.state.data.completedEvents];
    for (const hero of ['witch', 'warlock']) {
      setHeroSource(() => hero);
      sv.state.data.completedEvents = [];
      sv.dialogue.start('mirra'); ui.openDialogue('mirra');
      for (let k = 0; k < 60; k++) ui.update(9000 + k * 30, 30);
      for (let i = 0; i < 8 && sv.dialogue.active && !sv.dialogue.view()?.choices; i++) { ui.dialogueTap(); for (let k = 0; k < 60; k++) ui.update(9000 + k * 30, 30); }
      const shown = [...texts(), ...(ui.dlg?.choiceViews || []).map(b => b.text.text), ui.dlg?.body?.text || ''];   // кнопки ответов лежат в прокручиваемом контейнере
      brokenTexts.push(...shown.filter(t => /\[object|undefined/.test(t)).map(t => `${hero}/mirra_intro: ${t}`));
      if (!shown.includes(hero === 'witch' ? 'Что я должна искать?' : 'Что я должен искать?')) brokenTexts.push(`${hero}: нет кнопки «Что я ${hero === 'witch' ? 'должна' : 'должен'} искать?»`);
      ui.closeDialogue(true);
    }
    sv.state.data.completedEvents = savedEvents;
    setHeroSource(() => heroIdNow());
    ui.update(9000, 16);
  } catch (e) { err = e; }
  ok(!brokenTexts.length, 'диалоги обоими героями: нет «[object Object]» в репликах и кнопках ответов' + (brokenTexts.length ? ': ' + [...new Set(brokenTexts)].join('; ') : ''));
  ok(!err && ui.modal === null, 'v0.8: журнал, алхимия, сумка, диалоги с 4 NPC и HUD цели строятся и закрываются' + (err ? ': ' + err.stack.split('\n').slice(0, 4).join(' | ') : ''));

  // v0.8.1 regression: real choices must dispatch only after the dialogue modal is destroyed.
  {
    const { services: sv } = await import('../src/services.js');
    const { MSG } = await import('../src/state/EventBus.js');
    const cases = [
      ['mirra', ['prologue_seen', 'unlock_telekinesis_1', 'chapter_1_complete'], 'Сварить зелье', MSG.OPEN_ALCHEMY, 'Котёл Мирры'],
      ['mirra', ['prologue_seen', 'unlock_telekinesis_1', 'chapter_1_complete'], 'Открыть журнал', MSG.OPEN_JOURNAL, 'Журнал'],
      ['mirra', ['prologue_seen', 'unlock_telekinesis_1', 'mirra_starter_kit', 'first_world_interaction'], 'Покажи котёл', MSG.OPEN_ALCHEMY, 'Котёл Мирры'],
      ['mirra', ['prologue_seen', 'unlock_telekinesis_1', 'chapter_1_complete'], 'Восстановить здоровье', MSG.OPEN_HEAL, 'Лечение у Мирры'],
      // v0.10.0: новые переходы диалог → котёл (фитиль у Мирры, связка после Печати)
      ['mirra', ['prologue_seen', 'unlock_telekinesis_1', 'mirra_starter_kit', 'first_world_interaction', 'mirra_taught_alchemy', 'lunar_quest_start', 'lunar_quest_complete', 'unlock_seal_1'], 'Сварить сбор', MSG.OPEN_ALCHEMY, 'Котёл Мирры'],
      ['selena', ['lunar_quest_start', 'sq_dust_done', 'dlg:selena_wick'], 'Открыть алтарь', MSG.OPEN_UPGRADE, 'Изучение: Телекинез II'],
    ];
    sv.bus.offContext(ui);
    for (const [npc, events, answer, event, title] of cases) {
      await freshWorld('new');
      events.forEach(k => (k.startsWith('dlg:') ? sv.dialogue.markSeen(k.slice(4)) : sv.state.markEvent(k)));   // dlg: — разговор уже слышали
      sv.state.data.hp = 40; sv.state.addItem('coins', 20);   // v0.9: есть что лечить и чем платить
      const dialogUI = new UIScene(); dialogUI.create(); mkHud(dialogUI);
      let emissions = 0, closedFirst = false;
      const off = sv.bus.on(event, () => { emissions++; });
      // Observer runs before the registered UI listener, so it sees the unlocked state.
      const original = event === MSG.OPEN_ALCHEMY ? 'openAlchemy' : event === MSG.OPEN_JOURNAL ? 'openJournal' : event === MSG.OPEN_HEAL ? 'openHeal' : 'openUpgrade';
      sv.bus.off(event, dialogUI[original], dialogUI);
      const inspect = (...args) => {
        closedFirst = dialogUI.dlg === null && dialogUI.modal === null && !sv.modalOpen;
        dialogUI[original](...args);
      };
      sv.bus.on(event, inspect, dialogUI);
      sv.dialogue.start(npc);
      let guard = 0;
      while (sv.dialogue.active && !sv.dialogue.view().choices && guard++ < 10) { dialogUI.finishTyping(); dialogUI.dialogueTap(); }
      dialogUI.finishTyping();
      const choice = sv.dialogue.view().choices.find(c => c.label === answer);
      const oldContainer = dialogUI.dlg.container;
      dialogUI.dialogueChoose(choice.index);
      ok(closedFirst && oldContainer.destroyed && emissions === 1 && dialogUI.modal?.opts.title === title && !dialogUI.modalQueue.length,
        `диалог → ${title}: ${answer}, старое окно закрыто до открытия нового`);
      sv.dialogue.flushAfterClose(); dialogUI.closeDialogue(false);
      ok(emissions === 1, `${answer}: повторный flush/close не дублирует действие`);
      dialogUI.closeModal(null); sv.bus.offContext(dialogUI); off();
    }
    await freshWorld('new');
    const cancelled = new UIScene(); cancelled.create(); mkHud(cancelled);
    ['prologue_seen', 'unlock_telekinesis_1', 'chapter_1_complete'].forEach(k => sv.state.markEvent(k)); sv.dialogue.start('mirra');
    cancelled.closeDialogue(true);
    ok(!sv.dialogue.active && !cancelled.modal && !sv.modalOpen, 'диалог: отмена без ответа не открывает другое окно');
    sv.bus.offContext(cancelled);
  }


  // ---- v0.8.2: компактный HUD, меню 3×2, заглушки, настройки, профиль героя
  {
    const { services: sv } = await import('../src/services.js');
    const { MSG } = await import('../src/state/EventBus.js');
    await freshWorld('mid');
    const h = new UIScene(); h.create(); mkHud(h, { hp: 41, mana: 17 });
    const texts = (o) => { const out = []; const walk = (x) => { if (typeof x.text === 'string') out.push(x.text); (x.children || []).forEach(walk); }; walk(o); return out; };
    // опыт: обычный уровень, новый уровень, максимум
    sv.state.data.heroLevel = 4; sv.state.data.heroXP = 370; h.refreshHud();
    ok(h.levelText.text === 'Ур. 4' && h.xpCaption.text === 'До 5 ур.: 60 опыта' && Math.abs(h.xpBar.frac - 0.625) < 1e-6, 'HUD: ур. 4, 370 опыта → полоса 62,5%, «До 5 ур.: 60 опыта»');
    const ups = sv.state.addHeroXP(80); h.onReward({ granted: { heroXP: 80 }, levelUps: ups });
    ok(h.levelText.text === 'Ур. 5' && h.xpCaption.text === 'До 6 ур.: 200 опыта', 'HUD: после нового уровня 5 — дальше «До 6 ур.» (v0.10.0: уровни до 10)');
    ok(!/NaN|null|undefined|-/.test(h.xpCaption.text), 'HUD: подпись опыта без NaN/null/отрицательных');
    // HP и мана — из активной сцены (бой/исследование), не из максимума героя
    h.update(20000, 200);
    ok(h.hpText.text === '41 / 144' && h.manaText.text === '17 / 120', 'HUD: HP и мана — текущие общие запасы героини, новый уровень не восстанавливает их скрыто (' + h.hpText.text + ', ' + h.manaText.text + ')');
    // старой панели цели и её зоны нажатия нет
    ok(!h.questHit && !h.questPanel && !h.sideLine, 'панель цели и её невидимая зона нажатия (questHit) удалены');
    // журнал: отдельная кнопка, badge — реальное число заданий
    sv.state.markEvent('lunar_quest_start'); ['sq_herbs', 'sq_hunter'].forEach(id => sv.log.accept(id)); h.refreshQuest();
    ok(h.journalBadge.visible && h.journalBadgeText.text === String(sv.log.activeCount()), 'Журнал: значок с реальным числом заданий (' + h.journalBadgeText.text + ')');
    h.journalBtn.hit.emit('pointerdown');
    ok(h.modal?.opts?.title === 'Журнал', 'кнопка «Журнал» открывает полный журнал');
    h.closeModal(null);
    // смена цели — временное уведомление, без повтора на каждом обновлении
    h.goalBanner?.destroy(); h.goalBanner = null;
    h.refreshQuest(); ok(!h.goalBanner, 'обычное обновление HUD не показывает уведомление');
    h.lastObjective = 'Прежняя цель'; h.refreshQuest();   // цель сменилась (как после события мира)
    const banner = h.goalBanner;
    ok(banner && banner.bannerText === sv.quests.objectiveText(), 'смена цели → короткое уведомление «Новая цель»');
    h.refreshQuest(); ok(h.goalBanner === banner, 'повторное обновление не создаёт второе уведомление');

    // меню: шесть пунктов в порядке, без общей надписи «В разработке»
    h.menuBtn.hit.emit('pointerdown');
    ok(h.modal?.menu && sv.modalOpen, 'Меню открывается кнопкой, игра на паузе (modalOpen)');
    ok(h.modal.items.map(i => i.item.label).join(',') === 'Карта,Банк,Рейтинг,Чат,Форум,Настройки', 'меню: шесть пунктов 3×2 в порядке ' + h.modal.items.map(i => i.item.label).join(', '));
    ok(!texts(h.modal.container).some(t => /разработ/i.test(t)), 'меню: нет общей надписи «В разработке»');
    h.modal.overlay.emit('pointerdown');
    ok(!h.modal && !sv.modalOpen, 'касание вне панели закрывает меню и снимает паузу');
    // быстрые повторные нажатия
    for (let i = 0; i < 7; i++) h.menuBtn.hit.emit('pointerdown');
    ok(h.modal?.menu && sv.modalOpen, 'нечётное число быстрых нажатий — меню открыто');
    h.menuBtn.hit.emit('pointerdown');
    ok(!h.modal && !sv.modalOpen && !h.modalQueue.length, 'быстрые открытия/закрытия не оставляют блокировку и очередь окон');
    // Esc закрывает
    h.openMenu(); h.pressModalButton(false); ok(!h.modal && !sv.modalOpen, 'Esc закрывает меню');
    h.openMenu(); h.modal.closeHit.emit('pointerdown');
    ok(!h.modal && !sv.modalOpen, 'крестик внутри меню закрывает окно и возвращает управление в мир');

    // Четыре заглушки; чат открывает отдельный DOM-интерфейс (проверяется в e2e/chat.mjs).
    const snap = () => JSON.stringify({ inv: sv.state.data.inventory, ev: sv.state.data.completedEvents, lvl: sv.state.data.heroLevel, mode: sv.mode });
    const originalChat = h.openChat;
    let chatOpened = false;
    h.openChat = () => { chatOpened = true; };
    h.openMenu(); h.modal.items.find(x => x.item.id === 'chat').hit.emit('pointerdown');
    ok(chatOpened && !h.modal && !sv.modalOpen, 'пункт Чат закрывает меню и вызывает настоящий интерфейс');
    h.openChat = originalChat;
    // v0.27.0: «Карта» — карта мира; из меню только посмотреть (отправиться — у выхода «Карта мира»)
    {
      const before = snap();
      let travel = null; const onT = (id) => { travel = id; }; sv.bus.on(MSG.MAP_TRAVEL, onT);
      h.openMenu(); h.modal.items.find(x => x.item.id === 'map').hit.emit('pointerdown');
      let t = h.modal ? texts(h.modal.container).join(' | ') : '';
      ok(h.modal?.opts?.title === 'Карта мира' && !h.modal?.menu && t.includes('Лес Мирры') && t.includes('вы здесь') && t.includes('Город') && t.includes('Морозный лес') && t.includes('Старое кладбище'),
        'меню → «Карта»: карта мира, «вы здесь», закрытые локации под замком');
      ok(h.modal.buttons.length === 1 && t.includes('Закрыть') && !t.includes('Отправиться'), 'из меню карта только для просмотра');
      const flat = (o, out = []) => { out.push(o); (o.children || []).forEach(x => flat(x, out)); return out; };
      const lockCount = () => flat(h.modal.container).filter(o => o.texKey === 'icon_lock').length;
      ok(lockCount() === 3, 'закрытые локации: три настоящие иконки замка, независимо от emoji-шрифта');
      const pick = (name) => { const all = flat(h.modal.container); const b = all.find(o => typeof o.text === 'string' && o.text.startsWith(name)); const hit = all.find(o => o !== b && o.handlers?.pointerup && Math.abs(o.x - b.x) < 24 && Math.abs(o.y - (b.y + 1)) < 3); const sc = h.modal.scroll; h.input.activePointer = { x: sc.x + 5, y: sc.y + 5 }; hit.emit('pointerdown'); hit.emit('pointerup'); };
      pick('Город');
      t = texts(h.modal.container).join(' | ');
      ok(h.modal?.opts?.title === 'Карта мира' && t.includes('Город · Глава II') && t.includes('покажет Мирра'), 'точка на карте: описание локации и почему закрыта');
      h.closeModal(h.modal.buttons[0]);
      ok(!h.modal && !sv.modalOpen && travel === null && snap() === before, 'карта из меню закрывается без изменений в игре');
      // у выхода «Карта мира»: открытая локация — можно отправиться
      sv.state.markEvent('ch2_start');
      sv.bus.emit(MSG.OPEN_MAP, { exit: 'exit_forest' });
      pick('Город');
      t = texts(h.modal.container).join(' | ');
      ok(t.includes('Отправиться: Город') && lockCount() === 2, 'у выхода: открытая локация — «Отправиться», замок города убран');
      h.closeModal(h.modal.buttons[0]);
      ok(travel === 'city' && !h.modal && !sv.modalOpen, '«Отправиться» — событие перехода в выбранную локацию');
      sv.bus.emit(MSG.OPEN_MAP, { exit: 'exit_forest' });
      pick('Морозный лес');
      t = texts(h.modal.container).join(' | ');
      ok(!t.includes('Отправиться') && t.includes('после главы II'), 'у выхода: закрытая вылазка — отправиться нельзя');
      h.closeModal(h.modal.buttons[0]);
      sv.state.data.completedEvents = sv.state.data.completedEvents.filter(e => e !== 'ch2_start');
      sv.bus.off(MSG.MAP_TRAVEL, onT);
    }
    for (const id of ['rating', 'forum']) {   // v0.20.0: «Банк» — уже не заглушка (кошелёк)
      const before = snap();
      h.openMenu();
      const it = h.modal.items.find(x => x.item.id === id);
      it.hit.emit('pointerdown');
      const t = h.modal ? texts(h.modal.container).join(' ') : '';
      ok(h.modal?.opts?.stub === id && !h.modal?.menu && t.includes('Раздел в разработке'), `заглушка «${it.item.label}»: меню закрыто, окно «Раздел в разработке»`);
      h.closeModal(h.modal.buttons[0]);
      ok(!h.modal && !sv.modalOpen && snap() === before, `заглушка «${it.item.label}»: закрытие без изменений в игре`);
    }

    // настройки работают: меню → настройки → изменение → «Готово» → значение сохранено
    h.openMenu();
    h.modal.items.find(x => x.item.id === 'settings').hit.emit('pointerdown');
    ok(h.modal?.settings && sv.modalOpen, 'Меню → настоящие Настройки (меню закрыто до открытия)');
    const sfx0 = sv.settings.get('sfx');
    const settingTexts = texts(h.modal.container);
    ok(['Звуки', 'Музыка', 'Вибрация', 'Подсказки', 'Готово', 'Сбросить прогресс'].every(x => settingTexts.includes(x)) && !settingTexts.includes('Главное меню'), 'настройки: звуки, музыка, вибрация, подсказки, «Готово» и сброс без перехода на стартовый экран');
    const hits = h.modal.container.children.filter(o => o.type === 'Zone' || o.interactive);
    const btnBy = (label) => { const tx = h.modal.container.children.find(o => o.text === label); return h.modal.container.children.find(o => o !== tx && o.handlers?.pointerup && Math.abs(o.x - tx.x) < 2 && Math.abs(o.y - (tx.y + 1)) < 3); };
    const minus = h.modal.container.children.filter(o => o.handlers?.pointerup && h.modal.container.children.some(t => t.text === '−' && Math.abs(t.x - o.x) < 2 && Math.abs(t.y + 1 - o.y) < 3))[0];
    minus.emit('pointerdown'); minus.emit('pointerup');
    ok(sv.settings.get('sfx') < sfx0, 'настройки: «−» уменьшает громкость звуков');
    const done = btnBy('Готово'); done.emit('pointerdown'); done.emit('pointerup');
    ok(!h.modal && !sv.modalOpen, '«Готово» возвращает в игру с закрытым меню');
    ok(sv.settings.get('sfx') < sfx0 && hits.length > 0, 'настройки: значение сохранилось после закрытия (' + Math.round(sv.settings.get('sfx') * 100) + '%)');

    // профиль героя по портрету: реальные данные, ничего не меняет
    const before = snap();
    h.portraitHit.emit('pointerdown');
    const pt = texts(h.modal.container).join(' | ');
    ok(h.modal?.opts?.profile && pt.includes('Уровень 5') && pt.includes('41 / 144') && pt.includes('Лунные осколки') && pt.includes('До 6 ур.'), 'портрет → профиль героя с реальными данными');
    h.closeModal(null);
    ok(!h.modal && !sv.modalOpen && snap() === before, 'профиль героя закрывается и не меняет сохранение');

    // в бою: меню доступно, журнала нет, служебных выходов в настройках нет
    h.setMode('combat');
    ok(!h.journalBtn.c.visible && h.menuBtn.c.visible, 'бой: Журнал скрыт, Меню доступно');
    h.openMenu(); h.modal.items.find(x => x.item.id === 'settings').hit.emit('pointerdown');
    const ct = texts(h.modal.container);
    ok(h.modal?.settings && !ct.includes('Главное меню') && !ct.includes('Сбросить прогресс'), 'бой: настройки без выхода в меню и сброса');
    h.closeModal(null);
    const modeBefore = sv.mode;
    h.openMenu(); h.modal.items.find(x => x.item.id === 'map').hit.emit('pointerdown'); h.closeModal(null);
    ok(sv.mode === modeBefore && h.mode === 'combat' && !h.modal, 'бой: «Карта» не открывается и не выводит из боя');
    h.setMode('exploration');
    sv.bus.offContext(h);
  }

  // ---- меню
  err = null;
  try {
    const m = new MenuScene(); m.create(); m.confirmNew(); m.closeOverlay(); m.openSettings(); m.closeOverlay();
    await freshWorld('new'); const m2 = new MenuScene(); m2.create();
  } catch (e) { err = e; }
  ok(!err, 'меню: с сохранением, без сохранения, подтверждение и настройки' + (err ? ': ' + err.stack.split('\n').slice(0, 3).join(' | ') : ''));

  // ---- онлайн-игрок: стартовый экран, выбор героя, HUD и пауза
  err = null;
  try {
    const { PlayerSession } = await import('../src/cloud/PlayerSession.js');
    const { SupabaseApi } = await import('../src/cloud/api.js');
    const { FakeSupabase } = await import('./helpers/fake-supabase.mjs');
    const { services } = await import('../src/services.js');
    await freshWorld('new');
    const srv = new FakeSupabase();
    const api = new SupabaseApi({ url: srv.url, anonKey: srv.anonKey, loginDomain: 'players.witch-rpg.invalid', fetchFn: srv.fetch });
    const store = (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
    services.state.storage = null;
    const ses = new PlayerSession({ api, state: services.state, storage: store, setTimer: () => 0, clearTimer: () => {} });
    services.session = ses;
    // все тексты сцены, включая вложенные в контейнеры (заглушка Phaser хранит объекты в scene._list)
    const labels = (scene) => { const out = []; const walk = (o) => { if (typeof o.text === 'string') out.push(o.text); (o.children || []).forEach(walk); }; scene._list.forEach(walk); return out; };
    const m1 = new MenuScene(); m1.create();
    ok(m1.accountButton?.text.text === 'Уже играли? Войти' && labels(m1).includes('Начать приключение') && labels(m1).includes('Ведьма') && labels(m1).includes('Колдун') && !labels(m1).includes('Дары и характеристики одинаковые'),
      'старт: выбор героя, одно главное действие и вход; описания механики убраны');
    ok(m1.hero === 'witch' && m1.picker.toggles.find(t => t.selected)?.heroId === 'witch', 'по умолчанию выбрана ведьма');
    m1.picker.toggles.find(t => t.heroId === 'warlock').hit.emit('pointerdown'); m1.picker.toggles.find(t => t.heroId === 'warlock').hit.emit('pointerup');
    ok(m1.hero === 'warlock' && m1.picker.toggles.filter(t => t.selected).length === 1 && m1.picker.toggles.find(t => t.selected)?.heroId === 'warlock',
      'нажатие Колдун меняет выбранного героя; активный вариант один');
    ok(!ses.signedIn && !srv.calls.length, 'переключение предпросмотра не создаёт профиль и не обращается к серверу');
    m1.startNew();
    const choice = labels(m1);
    ok(['Играть как гость', 'Создать аккаунт', 'Уже играли? Войти'].every(t => choice.includes(t)), '«Начать игру» → «Как продолжить?» с тремя вариантами');
    m1.back();
    ok(!m1.choice && m1.hero === 'warlock', '«Назад» из «Как продолжить?» — выбор героя сохранён');
    await ses.playAsGuest(m1.hero);
    ok(ses.hero === 'warlock', 'гость создан колдуном (hero передан в create_player)');
    const m2 = new MenuScene(); m2.create();
    ok(labels(m2).includes('Продолжить') && labels(m2).some(t => String(t).startsWith('Гость · уровень 1')) && m2.accountButton?.text.text === 'Профиль', 'гость: «Продолжить», «Профиль», строка «Гость · уровень 1»');
    const g = new UIScene(); g.create(); mkHud(g); g.refreshHud();
    ok(g.levelText.text === 'Ур. 1' && g.syncDot.visible, 'HUD гостя: уровень и значок сохранения');
    // v0.9.2: портрет HUD — выбранный герой; ключ кэша медальона включает текстуру героя (нет «чужого» медальона)
    const { setHeroSource } = await import('../src/state/hero.js');
    const { heroIdNow } = await import('../src/services.js');
    const kW = g.portrait.texture.key;
    setHeroSource(() => 'witch');
    const gw = new UIScene(); gw.create(); mkHud(gw);
    const kH = gw.portrait.texture.key;
    setHeroSource(() => heroIdNow());
    ok(kW.includes('warlock_down') && kH.includes('hero_down') && kW !== kH, `медальон: колдун и ведьма — разные ключи кэша (${kW} / ${kH})`);
    // v0.8.2: аккаунт — из профиля героя (портрет), а не из паузы; профиль героя закрывается до открытия окна аккаунта
    let accOrder = null;
    g.openAccount = () => { accOrder = g.modal === null && !services.modalOpen; };
    g.portraitHit.emit('pointerdown');
    ok(g.modal?.opts?.profile && (g.modal?.buttons || []).some(b => b.label === 'Аккаунт'), 'гость: портрет → профиль героя с кнопкой «Аккаунт»');
    g.closeModal(g.modal.buttons.find(b => b.label === 'Аккаунт'));
    ok(accOrder === true, 'профиль героя → аккаунт: окно героя закрыто до открытия аккаунта');
    await ses.registerGuest({ nickname: 'Нюта_Лесная', password: 'password-1', password2: 'password-1' });
    const u = new UIScene(); u.create(); mkHud(u); u.refreshHud();
    ok(u.levelText.text === 'Ур. 1' && u.syncDot.visible && !labels(u).some(t => String(t).includes('Нюта')), 'HUD игрока: ника в HUD нет, уровень и значок сохранения');
    u.openHeroProfile();
    ok(labels(u).some(t => String(t) === 'Ник: Нюта_Лесная'), 'профиль героя: полный ник игрока');
    ok(u.modal?.opts?.title === 'Колдун' && labels(u).includes('Ученик лесной ведьмы'), 'профиль: «Колдун», «Ученик лесной ведьмы» (герой профиля)');
    u.closeModal(null);
    ok(!u.modal && !services.modalOpen, 'профиль героя закрывается без блокировки');
    const m3 = new MenuScene(); m3.create();
    ok(labels(m3).some(t => String(t).startsWith('Нюта_Лесная · уровень')), 'стартовый экран игрока: ник и уровень');
    services.session = null;
    const m4 = new MenuScene(); m4.create();
    ok(!labels(m4).some(t => /Режим разработки|Глава I|v0\./.test(t)), 'на стартовом экране нет технического текста');
  } catch (e) { err = e; }
  ok(!err, 'аккаунт: меню, выбор героя, HUD и пауза строятся' + (err ? ': ' + err.stack.split('\n').slice(0, 3).join(' | ') : ''));

  // ---- бой
  err = null;
  try {
    await freshWorld('mid');
    for (const [spawnId, enemyType] of [['forest_guardian_01', 'forest_guardian'], ['combat_intro_01', 'forest_scavenger']]) {
      const cs = new CombatScene(); cs.init({ spawnId, enemyType }); cs.create(); cs.started = true; cs.updateHud();
      cs.warn.setVisible(true); cs.warnTitle.setText('⚠ Удар'); cs.warnBar.width = 200;
      for (let i = 0; i < 20; i++) cs.update(i * 16, 16);
      ok(cs.enemyHpBar.frac > 0.99, `бой (${enemyType}): полоса врага полная в начале боя`);
    }
    // v0.26.0: Дуэль — соперник из слепка героя (combatCtx.duel), облик — его герой
    {
      const { services: sv } = await import('../src/services.js');
      const { combatCtxOf, toSnapshot, duelGhostOf } = await import('../src/cloud/playerModel.js');
      const snap = toSnapshot(sv.state.data);
      sv.state.data.combatCtx = { ...combatCtxOf(snap, 'duel', 'duel_mage'), duel: { opponent: { ...duelGhostOf(snap, 1000), name: 'Мирон', hero: 'warlock' }, rating: 1000, season: 0 } };
      const cs = new CombatScene(); cs.init({ spawnId: 'duel', enemyType: 'duel_mage', duel: true }); cs.create(); cs.started = true; cs.updateHud();
      for (let i = 0; i < 20; i++) cs.update(i * 16, 16);
      ok(cs.def.name === 'Мирон' && cs.def.texture === 'warlock_down' && cs.enemyHpBar.frac > 0.99, 'Дуэль: соперник из слепка, его облик и полоса здоровья');
      cs.showDuelOutcome({ ok: true, verdict: { outcome: 'victory', duel: { delta: 16, opponent: 'Мирон' }, reward: { items: { coins: 30 } }, entry: { timeSec: 50 } } }, 50);
      sv.state.data.combatCtx = null;
    }
  } catch (e) { err = e; }
  ok(!err, 'бой: сцена и HUD врага строятся и обновляются' + (err ? ': ' + err.stack.split('\n').slice(0, 3).join(' | ') : ''));

  ok(Reg.missingTextures.size === 0, 'текстуры: все ключи, которые запрашивает интерфейс, существуют' + (Reg.missingTextures.size ? ': ' + [...Reg.missingTextures].join(', ') : ''));
});

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Дымовой тест интерфейса пройден');
process.exit(failures ? 1 : 0);
