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
    for (const npc of ['mirra', 'veda', 'goran', 'selena']) {
      ui.openDialogue(npc);
      for (let i = 0; i < 12 && sv.dialogue.active; i++) {
        for (let k = 0; k < 40; k++) ui.update(8200 + k * 30, 30);
        const v = sv.dialogue.view(); if (v?.choices) ui.dialogueChoose(v.choices.length - 1); else ui.dialogueTap();
      }
      if (sv.dialogue.active) ui.closeDialogue(true);
    }
    ui.update(9000, 16);
  } catch (e) { err = e; }
  ok(!err && ui.modal === null, 'v0.8: журнал, алхимия, сумка, диалоги с 4 NPC и HUD цели строятся и закрываются' + (err ? ': ' + err.stack.split('\n').slice(0, 4).join(' | ') : ''));

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
    const { HeroSelectScene } = await import('../src/scenes/HeroSelectScene.js');
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
    ok(m1.accountButton?.text.text === 'Войти' && labels(m1).includes('Новая игра'), 'старт без входа: «Новая игра» и «Войти»');
    const hs = new HeroSelectScene(); hs.create(); hs.onPick();
    const choice = labels(hs);
    ok(['Играть как гость', 'Создать аккаунт', 'У меня уже есть аккаунт'].every(t => choice.includes(t)), 'после выбора героя — «Как продолжить?» с тремя вариантами');
    await ses.playAsGuest('witch');
    const m2 = new MenuScene(); m2.create();
    ok(labels(m2).includes('Продолжить') && labels(m2).some(t => String(t).startsWith('Гость · уровень 1')) && m2.accountButton?.text.text === 'Профиль', 'гость: «Продолжить», «Профиль», строка «Гость · уровень 1»');
    const g = new UIScene(); g.create(); mkHud(g); g.refreshHud();
    ok(g.levelText.text === 'Ур. 1' && g.syncDot.visible, 'HUD гостя: уровень и значок сохранения');
    g.openPause(); ok((g.modal?.buttons || []).some(b => b.label === 'Профиль (гость)'), 'пауза гостя: «Профиль (гость)»'); g.closeModal(null);
    await ses.registerGuest({ nickname: 'Нюта_Лесная', password: 'password-1', password2: 'password-1' });
    const u = new UIScene(); u.create(); mkHud(u); u.refreshHud();
    ok(u.levelText.text.startsWith('Нюта_') && u.syncDot.visible, 'HUD игрока: ник и значок сохранения (' + u.levelText.text + ')');
    u.openPause(); const pl = (u.modal?.buttons || []).map(b => b.label);
    ok(pl.some(l => l.startsWith('Профиль · Нюта')), 'пауза игрока: «Профиль · ник» (' + pl.join(', ') + ')');
    u.closeModal(null);
    const m3 = new MenuScene(); m3.create();
    ok(labels(m3).some(t => String(t).startsWith('Нюта_Лесная · уровень')), 'стартовый экран игрока: ник и уровень');
    services.session = null;
    const m4 = new MenuScene(); m4.create();
    ok(labels(m4).some(t => String(t).startsWith('Режим разработки')), 'без сервера меню честно пишет «Режим разработки»');
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
  } catch (e) { err = e; }
  ok(!err, 'бой: сцена и HUD врага строятся и обновляются' + (err ? ': ' + err.stack.split('\n').slice(0, 3).join(' | ') : ''));

  ok(Reg.missingTextures.size === 0, 'текстуры: все ключи, которые запрашивает интерфейс, существуют' + (Reg.missingTextures.size ? ': ' + [...Reg.missingTextures].join(', ') : ''));
});

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Дымовой тест интерфейса пройден');
process.exit(failures ? 1 : 0);
