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

  // ---- меню
  err = null;
  try {
    const m = new MenuScene(); m.create(); m.confirmNew(); m.closeOverlay(); m.openSettings(); m.closeOverlay();
    await freshWorld('new'); const m2 = new MenuScene(); m2.create();
  } catch (e) { err = e; }
  ok(!err, 'меню: с сохранением, без сохранения, подтверждение и настройки' + (err ? ': ' + err.stack.split('\n').slice(0, 3).join(' | ') : ''));

  // ---- вошедший игрок: ник и облако в HUD, кнопка профиля в меню и паузе
  err = null;
  try {
    const { Account } = await import('../src/cloud/Account.js');
    const { SupabaseApi } = await import('../src/cloud/api.js');
    const { FakeSupabase } = await import('./helpers/fake-supabase.mjs');
    const { services } = await import('../src/services.js');
    await freshWorld('mid');
    const srv = new FakeSupabase();
    const api = new SupabaseApi({ url: 'https://x.supabase.co', anonKey: 'k', fetchFn: srv.fetch, timeoutMs: 1000 });
    const store = (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
    const acc = new Account({ api, storage: store, state: services.state, setTimer: () => 0, clearTimer: () => {} });
    services.account = acc;
    const guestHud = new UIScene(); guestHud.create(); mkHud(guestHud); guestHud.refreshHud();
    ok(!guestHud.syncDot.visible && guestHud.levelText.text === 'Ур. 3', 'HUD гостя: без ника и без значка облака');
    await acc.signUp({ email: 'a@mail.ru', password: 'password-1', nickname: 'Нюта Лесная' });
    const u = new UIScene(); u.create(); mkHud(u); u.refreshHud();
    ok(u.levelText.text.startsWith('Нюта') && u.syncDot.visible, 'HUD вошедшего: ник и значок облака (' + u.levelText.text + ')');
    u.openPause(); const labels = (u.modal?.buttons || []).map(b => b.label);
    ok(labels.some(l => l.startsWith('Профиль')), 'пауза: есть «Профиль · ник» (' + labels.join(', ') + ')');
    u.closeModal(null);
    const m3 = new MenuScene(); m3.create();
    ok(m3.accountButton && m3.accountButton.text.text === 'Профиль', 'меню вошедшего: кнопка «Профиль»');
    acc.session = null; acc.nickname = '';
    const m4 = new MenuScene(); m4.create();
    ok(m4.accountButton && m4.accountButton.text.text === 'Войти / Регистрация', 'меню гостя: кнопка «Войти / Регистрация»');
    services.account = null;
  } catch (e) { err = e; }
  ok(!err, 'аккаунт: HUD, пауза и меню строятся' + (err ? ': ' + err.stack.split('\n').slice(0, 3).join(' | ') : ''));

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
