// Логические тесты без браузера: node tests/run-tests.js
// Проверяют прогрессию по маршруту и симулируют бои, чтобы сверить длительность с Combat Math v0.1.
import { GameState } from '../src/state/GameState.js';
import { QuestFlags } from '../src/state/QuestFlags.js';
import { EventBus } from '../src/state/EventBus.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { EV } from '../src/config/events.js';
import { Settings, SETTINGS_KEY } from '../src/state/Settings.js';
import { TutorialSystem } from '../src/systems/TutorialSystem.js';
import { AudioManager, SFX_NAMES } from '../src/systems/AudioManager.js';
import { MSG } from '../src/state/EventBus.js';
import { HeroAnimator, sampleKeys } from '../src/systems/HeroAnimator.js';
import { HERO_ANIM } from '../src/config/hero.anim.js';
import * as UIW from '../src/ui/widgets.js';
import * as Paint from '../src/ui/uiPaint.js';
import { UI } from '../src/config/ui.config.js';

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failures++; console.log('  ✗', msg); } };

function memStorage() { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; }

function makeWorld(clock) {
  const state = new GameState(memStorage(), () => clock.t);
  const bus = new EventBus();
  const quests = new QuestFlags(state, bus);
  const abilities = new AbilitySystem(state, quests, bus);
  return { state, bus, quests, abilities };
}

function bot(cm, policy) {
  const e = cm.enemy;
  const ready = id => cm.abilityState(id).state === 'ready';
  const heavy = cm.fieldObjects.find(o => o.available && o.def.weight === 'heavy' && o.def.throwable);
  const crystal = cm.fieldObjects.find(o => o.available && o.def.breaksArmor);
  if (policy === 'idle') return;
  if (policy === 'spam') { if (ready('fire')) cm.useAbility('fire'); if (ready('telekinesis')) cm.useAbility('telekinesis'); return; }
  // smart
  if (e.isPreparing) {
    const needsHeavy = !e.def.strongAttack.interruptBy.includes('telekinesis');
    if (ready('telekinesis') && (!needsHeavy || heavy)) {
      if (heavy) cm.selectedId = heavy.id;
      cm.useAbility('telekinesis');
      return;
    }
  }
  // держим Телекинез под прерывание, если сильная атака скоро
  const strongSoon = e.def.strongAttack && e.strongCd < 2.5 && !e.isPreparing;
  if (crystal && e.armorActive && ready('telekinesis') && !strongSoon) { cm.selectedId = crystal.id; cm.useAbility('telekinesis'); return; }
  if (ready('fire')) { cm.useAbility('fire'); return; }
  if (ready('telekinesis') && !strongSoon) {
    if (heavy && !(e.def.strongAttack?.interruptBy.includes('telekinesis_heavy') && !e.def.strongAttack.interruptBy.includes('telekinesis'))) cm.selectedId = heavy.id;
    cm.useAbility('telekinesis');
  }
}

function simulate(enemyType, setup, policy = 'smart', maxSec = 300) {
  const clock = { t: 0 };
  const w = makeWorld(clock);
  setup(w);
  const cm = new CombatManager({ enemyType, state: w.state, abilities: w.abilities });
  const dt = 1 / 30;
  let t = 0;
  while (!cm.result && t < maxSec) { bot(cm, policy); cm.tick(dt); t += dt; }
  return { result: cm.result, time: +cm.time.toFixed(1), heroHp: Math.round(cm.hero.hp), maxHp: cm.hero.maxHp, uses: cm.stats.abilityUses, interrupts: cm.stats.interrupts };
}

// ---------------------------------------------------------------
console.log('\n[1] Прогрессия по маршруту');
{
  const clock = { t: 0 };
  const { state, quests, abilities } = makeWorld(clock);
  ok(quests.currentStep().id === 'book', 'старт: цель — книга');
  abilities.unlock('telekinesis', 1); quests.complete(EV.UNLOCK_TELEKINESIS_1);
  ok(abilities.canMoveWeight('medium') && !abilities.canMoveWeight('heavy'), 'Телекинез I: medium да, heavy нет');
  quests.complete(EV.FIRST_WORLD_INTERACTION);
  quests.complete(EV.FIRST_WORLD_INTERACTION); // повтор не даёт награду
  ok(state.data.heroXP === 10, 'повторное событие не дублирует награду');
  // первый бой
  state.applyReward({ heroXP: 70, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 1 } });
  state.markEnemyDefeated('scavenger_01');
  ok(state.data.heroLevel === 2, `после первого боя — уровень 2 (xp ${state.data.heroXP})`);
  quests.complete(EV.LUNAR_QUEST_START);
  state.applyReward({ heroXP: 40, schoolXP: { telekinesis: 30 }, items: { lunar_shard: 1 } });
  state.addItem('lunar_flame', 3);
  ok(quests.currentStep().id === 'return', '3 огонька → цель «верните к алтарю»');
  quests.complete(EV.LUNAR_QUEST_COMPLETE);
  ok(state.data.heroLevel >= 3, `после лунного задания — уровень ${state.data.heroLevel}`);
  const st = state.upgradeStatus('telekinesis_2');
  ok(st.ok, `Телекинез II доступен (TK XP ${state.data.schoolXP.telekinesis}, осколки ${state.item('lunar_shard')})`);
  ok(abilities.startResearch('telekinesis_2'), 'исследование запущено');
  ok(state.hasEvent(EV.TELEKINESIS_2_START), 'событие telekinesis_2_start');
  clock.t += 30000; abilities.update();
  ok(state.abilityLevel('telekinesis') === 1, 'через 30 с ещё идёт изучение');
  clock.t += 31000; abilities.update();
  ok(state.abilityLevel('telekinesis') === 2 && state.hasEvent(EV.TELEKINESIS_2_COMPLETE), 'через 60 с — Телекинез II');
  ok(abilities.canMoveWeight('heavy'), 'Телекинез II двигает heavy');
  quests.complete(EV.HEAVY_PATH_OPEN);
  abilities.unlock('fire', 1); quests.complete(EV.UNLOCK_FIRE_1);
  quests.complete(EV.FIRE_GATE_OPEN);
  state.applyReward({ heroXP: 15 }); // сундук в новой части леса
  ok(quests.currentStep().id === 'guardian', 'цель — Лесной Страж');
  console.log(`    уровень перед Стражем: ${state.data.heroLevel}, HP ${state.heroStats().maxHp}, мана ${state.heroStats().maxMana}`);
  // сохранение / загрузка
  state.save();
  const copy = new GameState(state.storage);
  ok(copy.load() && copy.data.telekinesisLevel === 2 && copy.hasEvent(EV.FIRE_GATE_OPEN), 'save/load сохраняет прогресс');
}

// ---------------------------------------------------------------
console.log('\n[2] Симуляция боёв (цели Combat Math v0.1)');
const firstFight = w => { w.abilities.unlock('telekinesis', 1); };
const guardianFight = w => {
  w.abilities.unlock('telekinesis', 2); w.abilities.unlock('fire', 1);
  w.state.addHeroXP(275);
};
{
  const r = simulate('forest_scavenger', firstFight);
  console.log('    Падальщик (smart):', r);
  ok(r.result === 'victory' && r.time >= 18 && r.time <= 32, `первый обычный бой ~20–30 с (факт ${r.time} с)`);
  const idle = simulate('forest_scavenger', firstFight, 'idle');
  console.log('    Падальщик (только автоатака):', idle);
  ok(idle.result === 'defeat', 'без магии первый бой не выиграть (автоатака слабая)');
  const young = simulate('young_scavenger', w => { w.abilities.unlock('telekinesis', 1); w.state.addHeroXP(70); });
  console.log('    Молодой Падальщик:', young);
  ok(young.result === 'victory', 'маленький враг побеждается');
  const g = simulate('forest_guardian', guardianFight);
  console.log('    Страж (smart):', g);
  ok(g.result === 'victory' && g.time >= 40 && g.time <= 80, `сильный противник ~45–75 с (факт ${g.time} с)`);
  const gs = simulate('forest_guardian', guardianFight, 'spam');
  console.log('    Страж (спам кнопок без механик):', gs);
  ok(gs.result === 'defeat' || gs.heroHp < g.heroHp, 'игнорирование механики Стража наказывается');
}

// ---------------------------------------------------------------
console.log('\n[3] Механики боя');
{
  const clock = { t: 0 };
  const w = makeWorld(clock);
  w.abilities.unlock('telekinesis', 1); w.abilities.unlock('fire', 1);
  const cm = new CombatManager({ enemyType: 'forest_scavenger', state: w.state, abilities: w.abilities });
  cm.selectedId = 'heavy_a';
  cm.useAbility('telekinesis');
  ok(cm.enemy.hp === 190 - 30, `бросок тяжёлого объекта = 30 урона (факт ${190 - cm.enemy.hp})`);
  ok(cm.useAbility('telekinesis').ok === false, 'перезарядка блокирует повтор');
  const hp0 = cm.enemy.hp;
  cm.useAbility('fire');
  for (let i = 0; i < 150; i++) cm.enemy.update(1 / 30);
  ok(hp0 - cm.enemy.hp === 18 + 16, `Огонь I = 18 + 4×4 горения (факт ${hp0 - cm.enemy.hp})`);
  cm.enemy.strongCd = 0; cm.enemy.update(0.01);
  ok(cm.enemy.isPreparing, 'враг готовит сильную атаку');
  cm.cooldowns.telekinesis = 0;
  cm.useAbility('telekinesis');
  ok(!cm.enemy.isPreparing && cm.stats.interrupts === 1, 'Телекинез прерывает рывок');

  const g = new CombatManager({ enemyType: 'forest_guardian', state: w.state, abilities: w.abilities });
  const before = g.enemy.hp; g.useAbility('telekinesis');
  ok(before - g.enemy.hp === 11, `броня Стража −45% (20 → ${before - g.enemy.hp})`);
  g.cooldowns.telekinesis = 0; g.selectedId = 'crystal_a'; g.useAbility('telekinesis');
  ok(!g.enemy.armorActive, 'Телекинез разбивает кристалл → броня отключена');
  g.enemy.strongCd = 0; g.enemy.update(0.01); g.cooldowns.telekinesis = 0; g.useAbility('telekinesis');
  ok(g.enemy.isPreparing, 'обычный Телекинез НЕ прерывает тяжёлый удар Стража');
  g.cooldowns.telekinesis = 0; g.selectedId = 'heavy_a'; g.useAbility('telekinesis');
  ok(!g.enemy.isPreparing, 'бросок тяжёлого камня прерывает тяжёлый удар');
}


{
  console.log('\nНастройки, обучение, звук');
  const st = memStorage();
  const s1 = new Settings(st);
  ok(s1.get('sfx') === 0.75 && s1.get('hints') === true, 'настройки по умолчанию');
  s1.stepVolume('sfx', +1); s1.stepVolume('sfx', +1); s1.stepVolume('music', -1); s1.toggle('vibration');
  const s2 = new Settings(st);
  ok(s2.get('sfx') === 1 && s2.get('music') === 0.25 && s2.get('vibration') === false, 'настройки сохраняются и ограничены 0…100%');
  const gs = new GameState(st); gs.save(); gs.reset();
  ok(st.getItem(SETTINGS_KEY) !== null, 'сброс прогресса не трогает настройки');

  const bus = new EventBus(); const shown = [];
  bus.on(MSG.TUTORIAL, h => shown.push(h ? h.id : null));
  const tut = new TutorialSystem(gs, s2, bus);
  ok(tut.show('move') && tut.active === 'move', 'подсказка показывается');
  tut.complete('move');
  ok(!tut.show('move') && tut.active === null, 'подсказка показывается один раз');
  gs.save(); const gs2 = new GameState(st); gs2.load();
  ok(gs2.data.tutorial.includes('move'), 'просмотренные подсказки сохраняются');
  tut.show('interact'); s2.toggle('hints'); tut.onSettingsChanged();
  ok(tut.active === null && !tut.show('fire'), 'отключение подсказок прячет и блокирует их');
  ok(JSON.stringify(shown) === JSON.stringify(['move', null, 'interact', null]), 'события TUTORIAL для UI');
  const old = new GameState(memStorage()); delete old.data.tutorial;
  ok(new TutorialSystem(old, null, null).show('move'), 'старое сохранение без поля tutorial не ломается');

  const audio = new AudioManager(s2);
  let threw = false;
  try { for (const n of SFX_NAMES) audio.play(n); audio.setMusic('combat'); audio.vibrate(10); } catch (e) { threw = true; }
  ok(!threw && SFX_NAMES.length >= 25, `звук без AudioContext не падает (${SFX_NAMES.length} эффектов)`);
}

console.log('\nАнимации героини');
{
  const run = (a, secs, opts) => { let p; for (let i = 0; i < Math.round(secs * 60); i++) p = a.update(1 / 60, opts); return p; };
  const finite = p => Object.entries(p).every(([k, v]) => k === 'flash' || Number.isFinite(v));
  ok(sampleKeys([[0, 0], [1, 10]], 0.5) === 5 && sampleKeys([[0, 1], [1, 3]], 2) === 3, 'sampleKeys: середина и выход за границы');

  const a = new HeroAnimator();
  const idle = run(a, 2, { speed: 0 });
  ok(Math.abs(idle.sy - 1) <= HERO_ANIM.idle.sy + 1e-9 && idle.dy === 0 && idle.rot === 0, 'покой: только лёгкое дыхание');

  let minDy = 0, maxRot = 0, ok2 = true;
  for (let i = 0; i < 120; i++) { const p = a.update(1 / 60, { speed: 1, dir: 1, face: 'side' }); minDy = Math.min(minDy, p.dy); maxRot = Math.max(maxRot, Math.abs(p.rot)); ok2 = ok2 && finite(p) && p.dy <= 0; }
  ok(ok2 && minDy < -HERO_ANIM.walk.hop * 0.5 && minDy >= -HERO_ANIM.walk.hop - 1e-9, 'ходьба: подскок вверх, не больше hop');
  ok(maxRot > 1 && maxRot < 8, `ходьба: покачивание в разумных пределах (${maxRot.toFixed(1)}°)`);

  // средний угол за несколько шагов = наклон вперёд (покачивание усредняется в ноль)
  const meanRot = dir => { const m = new HeroAnimator(); run(m, 0.5, { speed: 1, dir, face: 'side' }); let sum = 0, n = 0; for (let i = 0; i < 6 * 30; i++) { sum += m.update(1 / 60, { speed: 1, dir, face: 'side' }).rot; n++; } return sum / n; };
  const mr = meanRot(1), ml = meanRot(-1);
  ok(mr > 1 && ml < -1 && Math.abs(mr + ml) < 0.5, `наклон вперёд зеркален для влево/вправо (${ml.toFixed(1)}° / ${mr.toFixed(1)}°)`);

  for (const kind of ['telekinesis', 'fire', 'auto', 'seal']) {
    const c = new HeroAnimator(); c.playCast(kind);
    ok(c.isCasting && c.castDuration(kind) > 0, `каст ${kind}: запущен, длительность > 0`);
    let fin = true; for (let i = 0; i < 90; i++) fin = fin && finite(c.update(1 / 60, { dir: 1, face: 'side' }));
    const end = c.update(1 / 60, { dir: 1, face: 'side' });
    ok(fin && !c.isCasting && Math.abs(end.dx) < 1e-9 && Math.abs(end.sx - 1) < 0.02, `каст ${kind}: завершается и возвращается в позу покоя`);
  }
  const fw = new HeroAnimator(); fw.playCast('fire');
  let maxDx = 0; for (let i = 0; i < 30; i++) maxDx = Math.max(maxDx, fw.update(1 / 60, { dir: 1, face: 'side' }).dx);
  const bw = new HeroAnimator(); bw.playCast('fire');
  let minDx = 0; for (let i = 0; i < 30; i++) minDx = Math.min(minDx, bw.update(1 / 60, { dir: -1, face: 'side' }).dx);
  ok(maxDx > 0.03 && minDx < -0.03, 'огонь: рывок вперёд в сторону взгляда');

  const h = new HeroAnimator(); h.playHurt(false);
  const first = h.update(1 / 60, {});
  ok(first.flash === 'hurt', 'удар: вспышка в начале');
  const hp = run(h, 0.5, {});
  ok(hp.flash === null && Math.abs(hp.dx) < 1e-9 && Math.abs(hp.sy - 1) < 0.02, 'удар: заканчивается, поза возвращается');
  const w = new HeroAnimator(), st = new HeroAnimator(); w.playHurt(false); st.playHurt(true);
  let amplW = 0, amplS = 0; for (let i = 0; i < 20; i++) { amplW = Math.max(amplW, Math.abs(w.update(1 / 60, {}).dx)); amplS = Math.max(amplS, Math.abs(st.update(1 / 60, {}).dx)); }
  ok(amplS > amplW, 'сильный удар трясёт сильнее обычного');

  const d = new HeroAnimator(); d.playDeath();
  const dead = run(d, 2, {});
  ok(d.isDead && Math.abs(dead.rot - HERO_ANIM.death.angle) < 1 && Math.abs(dead.alpha - HERO_ANIM.death.alpha) < 1e-6, 'поражение: героиня лежит и полупрозрачна');
  d.reset(); ok(!d.isDead && run(d, 0.1, {}).alpha === 1, 'reset() снимает состояние поражения');

  const z = new HeroAnimator();
  ok(finite(z.update(0, { speed: 1, dir: 1 })) && finite(z.update(-1, {})), 'dt = 0 и отрицательный dt не ломают позу');
}

console.log('\nИнтерфейс: рисование и виджеты');
{
  // фейковый Canvas 2D: принимает любые вызовы, градиенты умеют addColorStop
  const ctxStub = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  let created = 0;
  UIW.env.createCanvas = (w, h) => { created++; return { width: w, height: h, getContext: () => ctxStub() }; };
  const fakeObj = (type) => {
    const o = { type, w: 1000, h: 200, visible: true, tex: null, crop: null, handlers: {} };
    const p = new Proxy(o, {
      get: (t, k) => {
        if (k === 'width') return t.w; if (k === 'height') return t.h;
        if (k === 'texture') return { key: t.tex };
        if (k in t) return t[k];
        return (...a) => {
          if (k === 'setVisible') t.visible = a[0];
          if (k === 'setCrop') t.crop = a;
          if (k === 'setTexture') t.tex = a[0];
          if (k === 'on') t.handlers[a[0]] = a[1];
          return p;
        };
      },
      set: (t, k, v) => { t[k] = v; return true; },
    });
    return p;
  };
  const tex = new Map();
  const scene = {
    textures: { exists: k => tex.has(k), addCanvas: (k, c) => tex.set(k, c), remove: k => tex.delete(k), get: () => ({ getSourceImage: () => ({ width: 64, height: 128 }) }) },
    add: { image: (x, y, k) => { const o = fakeObj('image'); o.tex = k; return o; }, text: () => fakeObj('text'), zone: () => fakeObj('zone'), graphics: () => fakeObj('g') },
  };

  // --- текстуры: создаются один раз, освобождаются, размер холста = (размер + 2·запас) × texScale
  let drawn = 0;
  UIW.ensureTexture(scene, 't1', 100, 50, () => { drawn++; });
  UIW.ensureTexture(scene, 't1', 100, 50, () => { drawn++; });
  ok(drawn === 1 && tex.size === 1, 'ensureTexture: рисует один раз, повторный вызов берёт кэш');
  ok(tex.get('t1').width === Math.ceil((100 + UI.pad * 2) * UI.texScale), 'ensureTexture: размер холста = (w + 2·pad) × texScale');
  UIW.releaseTexture(scene, 't1'); UIW.releaseTexture(scene, 'нет-такой');
  ok(tex.size === 0, 'releaseTexture: удаляет текстуру, неизвестный ключ не ломает');

  // --- полоса
  const bar = new UIW.UIBar(scene, 10, 20, 150, 20, 'hp', 5000);
  ok(bar.fullWidth === 146, 'UIBar: рабочая ширина = ширина жёлоба − 4');
  bar.setFraction(0.5);
  ok(bar.fill.crop[2] === 500 && bar.fill.visible, 'UIBar: заливка обрезается по доле (в пикселях текстуры)');
  bar.setFraction(0); ok(!bar.fill.visible, 'UIBar: при 0 заливка скрыта');
  bar.setFraction(NaN); ok(bar.frac === 0 && !bar.fill.visible, 'UIBar: NaN → 0, без падения');
  bar.width = bar.fullWidth * 0.25; ok(Math.abs(bar.frac - 0.25) < 1e-9 && bar.fill.visible, 'UIBar: совместимость width = fullWidth × доля');
  bar.setFraction(7); ok(bar.frac === 1, 'UIBar: доля больше 1 обрезается до 1');
  bar.setVisible(false); ok(!bar.trough.visible && !bar.fill.visible, 'UIBar: setVisible(false) прячет обе части');
  bar.setVisible(true); bar.setFraction(0.3); bar.setVisible(true); ok(bar.fill.visible, 'UIBar: setVisible(true) возвращает заливку');

  // --- кнопка
  let presses = 0;
  const btn = UIW.addButton(scene, 0, 0, 200, 72, 'Ок', { primary: true, onPress: () => presses++ });
  const h = btn.hit.handlers;
  ok(btn.bg.tex.includes(':Pu:'), 'кнопка: в покое обычная текстура');
  h.pointerup?.(); ok(presses === 0, 'кнопка: отпускание без нажатия не срабатывает');
  h.pointerdown(); ok(btn.bg.tex.includes(':Pd:'), 'кнопка: при нажатии — текстура «вдавлена»');
  h.pointerup(); ok(presses === 1 && btn.bg.tex.includes(':Pu:'), 'кнопка: срабатывает по отпусканию и возвращает вид');
  h.pointerdown(); h.pointerout(); h.pointerup(); ok(presses === 1, 'кнопка: увод пальца с кнопки отменяет нажатие');
  btn.setPrimary(false); ok(btn.bg.tex.includes(':Su:'), 'кнопка: setPrimary(false) меняет вид');

  // --- орб
  ok(UIW.orbKey(scene, 0x4fe3c1, 128, false) === UIW.orbKey(scene, 0x4fe3c1, 128, false) && UIW.orbKey(scene, 0x4fe3c1, 128, true) !== UIW.orbKey(scene, 0x4fe3c1, 128, false), 'орб: ключ стабилен; locked — отдельная текстура');
  const orb = UIW.addOrb(scene, 0, 0, 128, 0x4fe3c1);
  const before = orb.tex; UIW.setOrb(orb, scene, 0x4fe3c1, 128, true);
  ok(orb.tex !== before && orb.tex.includes(':L'), 'орб: setOrb переключает вид на закрытый');
  const sizeCalls = []; const origSize = orb.setDisplaySize; orb.setDisplaySize = (...a) => { sizeCalls.push(a); return orb; };
  UIW.setOrb(orb, scene, 0x4fe3c1, 128, true); UIW.setOrb(orb, scene, 0x4fe3c1, 128, true);
  ok(sizeCalls.length === 0, 'орб: setOrb с тем же видом не трогает размер (не перебивает анимацию нажатия)');

  // --- painters на фейковом контексте: ни один не падает
  let threw = null;
  try {
    const c = ctxStub();
    for (const variant of ['wood', 'dark', 'inset']) { Paint.paintPanel(c, 420, 124, { variant, accent: 0x4fe3c1 }); Paint.paintPanel(c, 20, 20, { variant }); }
    Paint.paintButton(c, 280, 72, { primary: true, accent: 0xffffff }); Paint.paintButton(c, 64, 64, { pressed: true });
    Paint.paintOrb(c, 128, { accent: 0xff6a2b }); Paint.paintOrb(c, 128, { locked: true }); Paint.paintOrb(c, 68, { gem: false });
    for (const k of ['hp', 'mana', 'xp', 'danger', 'неизвестно']) Paint.paintBarFill(c, 146, 20, k);
    Paint.paintBarTrough(c, 146, 10); Paint.paintBottomBar(c, 720, 156, [180, 340], 22); Paint.paintDivider(c, 380);
    Paint.paintCrescent(c, 96); Paint.paintMedallion(c, 84, null, null); Paint.paintScreenVignette(c, 360, 640);
  } catch (e) { threw = e; }
  ok(!threw, 'painters: все рисуются без ошибок' + (threw ? ': ' + threw.message : ''));

  // --- плашка на Graphics
  let calls = 0;
  const g = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : (...a) => { calls++; return g; }) });
  threw = null; try { UIW.drawPlate(g, 300, 60, { accent: 0xff0000 }); } catch (e) { threw = e; }
  ok(!threw && calls > 8, 'drawPlate: рисует плашку и уголки');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Все тесты пройдены');
process.exit(failures ? 1 : 0);
