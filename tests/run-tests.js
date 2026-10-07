// Логические тесты без браузера: node tests/run-tests.js
// Проверяют прогрессию по маршруту и симулируют бои, чтобы сверить длительность с Combat Math v0.1.
import { GameState } from '../src/state/GameState.js';
import { QuestFlags } from '../src/state/QuestFlags.js';
import { EventBus } from '../src/state/EventBus.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { PlayerActions } from '../src/systems/PlayerActions.js';
import { UPGRADES, TIMER_MODE } from '../src/config/balance.progression.js';
import { ENEMIES } from '../src/config/balance.enemies.js';
import { ABILITIES } from '../src/config/balance.abilities.js';
const ABILITIES_SEAL_COST = () => ABILITIES.seal.levels[1].manaCost;
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
  // зелья из сумки (если есть): здоровье ниже 40 % — настой, мана на исходе — эликсир (лимит боя проверяет CombatManager)
  if (cm.hero.hp < cm.hero.maxHp * 0.4 && cm.state.item('elixir_life') > 0) cm.usePotion('elixir_life');
  if (cm.hero.mana < 20 && cm.state.item('elixir_mana') > 0) cm.usePotion('elixir_mana');
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
  // v0.10.1: Астрал ('seal') — урон сквозь броню и кору; атаки не прерывает. Бьём им, пока хватает маны и под прерывание
  // остаётся запас Телекинеза.
  if (policy !== 'noseal' && ready('seal') && cm.hero.mana >= 20 + 14 && !strongSoon) { cm.useAbility('seal'); return; }
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
  return { result: cm.result, time: +cm.time.toFixed(1), heroHp: Math.round(cm.hero.hp), maxHp: cm.hero.maxHp, enemyHp: cm.enemy.hp, potions: cm.stats.potions || 0, uses: cm.stats.abilityUses, interrupts: cm.stats.interrupts };
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
  ok(quests.currentStep().id === 'wick', '3 огонька → цель «сварите Лунный фитиль» (v0.10.0)');
  state.removeItem('lunar_flame', 3); state.markEvent('lunar_wick_crafted'); state.addItem('lunar_wick', 1);
  ok(quests.currentStep().id === 'return', 'фитиль сварен, огоньков в сумке 0 → цель «вставьте фитиль», шаг сбора не возвращается');
  state.removeItem('lunar_wick', 1);
  quests.complete(EV.LUNAR_QUEST_COMPLETE);
  ok(state.data.heroLevel >= 3, `после лунного задания — уровень ${state.data.heroLevel}`);
  const lacking = state.upgradeStatus('telekinesis_2');
  ok(!lacking.ok, 'v0.8: Телекинез II без лунной травы и рунической пыли недоступен');
  state.addItem('moon_herb', 2); state.addItem('rune_dust', 1);
  state.addItem('coins', UPGRADES.telekinesis_2.cost.coins);
  const st = state.upgradeStatus('telekinesis_2');
  ok(st.ok, `Телекинез II доступен (TK XP ${state.data.schoolXP.telekinesis}, осколки ${state.item('lunar_shard')})`);
  ok(abilities.startResearch('telekinesis_2'), 'исследование запущено');
  ok(state.item('moon_herb') === 0 && state.item('rune_dust') === 0, 'v0.8: трава и пыль списаны по стоимости и не «добираются» обратно');
  ok(state.hasEvent(EV.TELEKINESIS_2_START), 'событие telekinesis_2_start');
  const researchMs = UPGRADES.telekinesis_2.timerSec[TIMER_MODE] * 1000;
  ok(researchMs === 5 * 60 * 1000, 'v0.10.2: первая ступень изучается 5 минут');
  clock.t += researchMs / 2; abilities.update();
  ok(state.abilityLevel('telekinesis') === 1, 'через половину срока ещё идёт изучение');
  clock.t += researchMs / 2 + 1000; abilities.update();
  ok(state.abilityLevel('telekinesis') === 2 && state.hasEvent(EV.TELEKINESIS_2_COMPLETE), 'через 5 минут — Телекинез II');
  ok(abilities.canMoveWeight('heavy'), 'Телекинез II двигает heavy');
  quests.complete(EV.HEAVY_PATH_OPEN);
  abilities.unlock('fire', 1); quests.complete(EV.UNLOCK_FIRE_1);
  quests.complete(EV.FIRE_GATE_OPEN);
  state.applyReward({ heroXP: 15 }); // сундук в новой части леса
  ok(quests.currentStep().id === 'compound', 'после корней — сварить Проявляющий состав (v0.10.0)');
  state.markEvent('revealing_compound_crafted');
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
  w.state.data.hp = null; w.state.data.mana = null;   // v0.9: к Стражу игрок подходит восстановившимся (запасы общие)
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
  // v0.10.0: Телекинез I не поднимает тяжёлый камень в бою (как в мире): выбор отклонён, бросок — обычный удар
  ok(!cm.selectObject('heavy_a') && cm.selectedId === null && cm.drainEvents().some(e => e.refused === 'heavy_a'), 'ТК I: тяжёлый камень не выбирается');
  cm.selectedId = 'heavy_a';
  cm.useAbility('telekinesis');
  const HP0 = ENEMIES.forest_scavenger.hp;
  ok(HP0 === 160 && cm.enemy.hp === HP0 - 20 && cm.fieldObjects.find(o => o.id === 'heavy_a').available, `ТК I без тяжёлого бонуса: 20 урона, камень на месте (факт ${HP0 - cm.enemy.hp})`);
  { // ТК II: тяжёлый бросок 20 × 1,5 × 1,35 = 40,5 → 41 и тег тяжёлого прерывания
    const w2 = makeWorld({ t: 0 }); w2.abilities.unlock('telekinesis', 2);
    const c2 = new CombatManager({ enemyType: 'forest_scavenger', state: w2.state, abilities: w2.abilities });
    ok(c2.selectObject('heavy_a'), 'ТК II: тяжёлый камень выбирается');
    c2.useAbility('telekinesis');
    ok(c2.enemy.hp === HP0 - 41, `ТК II: тяжёлый бросок = 41 урон (40,5) (факт ${HP0 - c2.enemy.hp})`);
  }
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

  w.state.data.mana = null; w.state.data.hp = null;   // v0.9: прошлый бой в этом мире потратил ману — для проверки брони начинаем с полной
  w.abilities.unlock('telekinesis', 2);   // v0.10.0: тяжёлый камень в бою — только с Телекинезом II (к Стражу он уже есть)
  const g = new CombatManager({ enemyType: 'forest_guardian', state: w.state, abilities: w.abilities });
  const before = g.enemy.hp; g.useAbility('telekinesis');
  ok(before - g.enemy.hp === 11, `броня Стража −45% (20 → ${before - g.enemy.hp})`);   // ТК II: удар без броска тот же 20
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

console.log('\n[v0.8] Журнал, алхимия, диалоги, подсказки');
{
  const { QuestLog } = await import('../src/state/QuestLog.js');
  const { Alchemy } = await import('../src/systems/Alchemy.js');
  const { DialogueSystem } = await import('../src/systems/DialogueSystem.js');
  const { GuidanceSystem } = await import('../src/systems/GuidanceSystem.js');
  const { SIDE_QUESTS, SIDE_QUEST_ORDER } = await import('../src/config/quests.js');
  const { RECIPES, RECIPE_ORDER } = await import('../src/config/recipes.js');
  const { RESOURCES, POTIONS, BASE_RESOURCES } = await import('../src/config/resources.js');
  const { NPCS } = await import('../src/config/npcs.js');
  const { DIALOGUES } = await import('../src/config/dialogues.js');
  const { STEP_GUIDE, HERO_LINES } = await import('../src/config/guidance.js');
  const { CONTENT_INTERACTIVES, CONTENT_ENEMIES } = await import('../src/config/world.content.js');
  const { ITEMS } = await import('../src/config/balance.progression.js');
  const { QUEST_STEPS } = await import('../src/config/events.js');

  const mk = () => {
    const clock = { t: 0 }; const w = makeWorld(clock);
    const log = new QuestLog(w.state, w.bus), alch = new Alchemy(w.state, w.bus);
    const dlg = new DialogueSystem({ state: w.state, log, bus: w.bus, goalText: () => w.quests.objectiveText() });
    const guide = new GuidanceSystem({ state: w.state, quests: w.quests, log, bus: w.bus });
    return { ...w, log, alch, dlg, guide };
  };

  // --- данные
  ok(Object.keys(RESOURCES).length === 9 && BASE_RESOURCES.length === 5, '5 видов ресурсов главы I (+4 главы II с v0.19.0)');
  ok(Object.keys(RESOURCES).every(k => ITEMS[k]), 'каждый ресурс есть в ITEMS (имя, иконка)');
  ok(Object.values(RECIPES).every(r => Object.keys(r.needs).every(k => ITEMS[k]) && ITEMS[r.result]), 'рецепты ссылаются на существующие предметы');
  ok(RECIPE_ORDER.filter(id => !RECIPES[id].chapter).length === 6 && RECIPE_ORDER.filter(id => RECIPES[id].kind === 'story').length === 3 && RECIPE_ORDER.length === Object.keys(RECIPES).length, 'алхимия главы I: шесть рецептов, три сюжетных (рецепты главы II — отдельно)');
  ok(Object.keys(NPCS).length >= 4 && Object.keys(NPCS).every(id => DIALOGUES[id]), 'NPC ≥ 4, у каждого есть диалоги');
  ok(SIDE_QUEST_ORDER.length === 6, 'шесть побочных заданий, включая цепочку Веды');
  const dialogOk = Object.values(DIALOGUES).every(vs => vs.every(v => Object.values(v.nodes).every(n => n.lines.length >= 1 && n.lines.length <= 5 && (n.choices || []).every(c => !c.next || v.nodes[c.next]))));
  ok(dialogOk, 'диалоги: 1–5 реплик в узле, ветки ведут в существующие узлы');
  const gatherSrc = new Set(CONTENT_INTERACTIVES.filter(o => o.kind === 'gather').map(o => o.res));
  ok(BASE_RESOURCES.every(k => gatherSrc.has(k) || CONTENT_INTERACTIVES.some(o => JSON.stringify(o).includes(k))), 'каждый ресурс главы I можно получить в мире');
  const ids = new Set(CONTENT_INTERACTIVES.map(o => o.id));
  ok(ids.size === CONTENT_INTERACTIVES.length, 'id объектов v0.8 уникальны');
  ok(QUEST_STEPS.every(s => s.id === 'end' || STEP_GUIDE[s.id]), 'для каждого шага основного маршрута есть подсказки');
  ok(HERO_LINES.every(l => l.id && l.text), 'реплики героини заполнены');

  // --- журнал: побочное задание Веды
  {
    const { state, log } = mk();
    ok(log.status('sq_herbs') === 'available', 'sq_herbs: доступно сразу');
    ok(log.status('sq_dust') === 'locked', 'sq_dust: закрыто, пока алтарь не заговорил');
    ok(log.accept('sq_herbs') && log.status('sq_herbs') === 'active', 'sq_herbs: принято → active');
    ok(!log.accept('sq_herbs'), 'sq_herbs: нельзя принять дважды');
    state.addItem('moon_herb', 2);
    ok(log.status('sq_herbs') === 'active' && /2\/3/.test(log.hudLine()), 'sq_herbs: 2/3 → всё ещё active, HUD «2/3»');
    ok(log.turnIn('sq_herbs') === null, 'sq_herbs: сдать раньше времени нельзя');
    state.addItem('moon_herb', 1);
    ok(log.status('sq_herbs') === 'ready' && log.checkReady().includes('sq_herbs') && log.checkReady().length === 0, 'sq_herbs: 3/3 → ready, объявляется один раз');
    const coins = state.item('coins');
    ok(!!log.turnIn('sq_herbs'), 'sq_herbs: сдано');
    ok(state.item('moon_herb') === 0 && state.item('coins') === coins + 25 && state.item('elixir_life') === 1, 'sq_herbs: травы ушли, награда выдана (25 монет, настой жизни)');
    ok(log.status('sq_herbs') === 'done' && log.done().includes('sq_herbs') && !log.turnIn('sq_herbs'), 'sq_herbs: done и награда не дублируется');
  }
  // --- sq_dust требует событие, sq_hunter — победу над врагом
  {
    const { state, quests, log } = mk();
    quests.complete(EV.LUNAR_QUEST_START);
    ok(log.status('sq_dust') === 'available', 'sq_dust: открыто после lunar_quest_start');
    log.accept('sq_dust'); state.addItem('rune_dust', 1);
    const sh = state.item('lunar_shard');
    log.turnIn('sq_dust');
    ok(state.item('lunar_shard') === sh + 1 && state.item('elixir_mana') === 1 && state.item('rune_dust') === 0, 'sq_dust: осколок и лунный эликсир выданы, пыль отдана');
    log.accept('sq_hunter');
    ok(log.status('sq_hunter') === 'active', 'sq_hunter: активно');
    state.markEnemyDefeated('scavenger_02');
    ok(log.status('sq_hunter') === 'ready', 'sq_hunter: победа над scavenger_02 → ready');
    log.turnIn('sq_hunter');
    ok(state.item('resin_flask') === 1 && state.item('tree_resin') === 2, 'sq_hunter: смоляная склянка и смола выданы');
  }
  ok(CONTENT_ENEMIES.some(e => e.id === 'scavenger_02' && e.requiresEvent === 'sq_hunter_start'), 'scavenger_02 появляется только после согласия помочь Горану');

  // --- алхимия
  {
    const { state, alch, bus } = mk();
    let crafted = 0; bus.on(MSG.CRAFTED, () => crafted++);
    ok(!alch.check('elixir_life').ok && alch.maxCount('elixir_life') === 0, 'алхимия: без ингредиентов нельзя');
    // v0.10.0: изготовление — атомарная операция PlayerActions (локально — то же правило, что на сервере)
    const actions = new PlayerActions({ state, bus });
    const r0 = await actions.craft('elixir_life');
    ok(!r0.ok && r0.reason === 'missing' && r0.missing.length === 2 && state.item('elixir_life') === 0, 'алхимия: без ингредиентов → missing, ничего не меняется');
    state.addItem('moon_herb', 5); state.addItem('forest_mushroom', 2);
    ok(alch.maxCount('elixir_life') === 2 && alch.status('elixir_life').state === 'ready', 'алхимия: maxCount = 2 (по грибам), рецепт готов');
    const r1 = await actions.craft('elixir_life');
    ok(r1.ok && state.item('elixir_life') === 1 && state.item('moon_herb') === 3 && state.item('forest_mushroom') === 1 && r1.firstCraft && state.data.heroXP === 15, 'алхимия: ингредиенты списаны, зелье добавлено, первый крафт +15 опыта');
    const r2 = await actions.craft('elixir_life');
    ok(r2.ok && !r2.firstCraft && state.data.heroXP === 15, 'второй крафт опыта героя не даёт');
    ok(!(await actions.craft('несуществующий')).ok, 'алхимия: неизвестный рецепт не падает');
    ok(crafted === 0, 'событие CRAFTED шлёт окно котла (не операция)');
  }

  // --- зелья в бою
  {
    const clock = { t: 0 }; const w = makeWorld(clock);
    w.abilities.unlock('telekinesis', 1);
    const cm = new CombatManager({ enemyType: 'forest_scavenger', state: w.state, abilities: w.abilities });
    ok(cm.usePotion('elixir_life').reason === 'none', 'зелье: нет в сумке → отказ');
    w.state.addItem('elixir_life', 1); w.state.addItem('elixir_mana', 1); w.state.addItem('resin_flask', 1);
    ok(cm.usePotion('elixir_life').reason === 'full', 'зелье: при полном здоровье не тратится');
    ok(w.state.item('elixir_life') === 1, 'зелье: отказ не списывает предмет');
    cm.hero.hp = 40; const hp0 = cm.hero.hp;
    const u = cm.usePotion('elixir_life');
    ok(u.ok && cm.hero.hp > hp0 && w.state.item('elixir_life') === 0, `зелье жизни лечит (${hp0} → ${cm.hero.hp}) и тратится`);
    cm.hero.mana = 10; ok(cm.usePotion('elixir_mana').ok && cm.hero.mana > 10, 'лунный эликсир восполняет ману');
    const eh = cm.enemy.hp; const f = cm.usePotion('resin_flask');
    ok(f.ok && cm.enemy.hp < eh, 'смоляная склянка ранит врага');
    ok(cm.potionsAvailable().length === 0, 'potionsAvailable пусто после использования');
    w.state.addItem('elixir_mana', 6); cm.hero.mana = 0; let n = 0; while (cm.usePotion('elixir_mana').ok && n < 10) { n++; cm.hero.mana = 0; }
    ok(n + 3 === 4 && cm.usePotion('elixir_mana').reason === 'limit', 'зелья: не больше 4 за бой');
  }

  // --- диалоги
  {
    const { state, quests, log, dlg, bus } = mk();
    ok(dlg.pick('mirra').id === 'mirra_first_steps' || dlg.pick('mirra'), 'Мирра: реплика выбирается по прогрессу');
    const v0 = dlg.pick('veda').id;
    ok(/ask/.test(v0) && dlg.badge('veda') === '!', 'Веда: предлагает задание, над ней «!»');
    let ended = 0; bus.on(MSG.NPC_TALK_END, () => ended++);
    ok(dlg.start('veda') && dlg.active, 'диалог начался');
    let guard = 0; let v = dlg.view();
    while (dlg.active && guard++ < 20) { v = dlg.view(); if (v.choices) break; dlg.advance(); }
    ok(v.choices && v.choices.length >= 2, 'у диалога есть варианты ответа (' + (v.choices ? v.choices.map(c => c.label).join(' / ') : '-') + ')');
    const accept = v.choices.findIndex(c => /возьм|помог|принест|соглас|да/i.test(c.label));
    dlg.choose(accept >= 0 ? accept : 0);
    while (dlg.active && guard++ < 40) { const vv = dlg.view(); if (vv.choices) dlg.choose(vv.choices.length - 1); else dlg.advance(); }
    ok(!dlg.active && ended === 1, 'диалог закрылся, NPC_TALK_END один раз');
    ok(log.status('sq_herbs') === 'active', 'ответ «согласна» принимает задание');
    ok(dlg.pick('veda').id.endsWith('_active') && dlg.badge('veda') === '?', 'Веда: вариант и значок меняются после принятия');
    state.addItem('moon_herb', 3);
    ok(dlg.pick('veda').id.endsWith('_ready') && dlg.badge('veda') === '!', 'Веда: травы собраны → «!» и вариант сдачи');
    dlg.start('veda'); guard = 0;
    while (dlg.active && guard++ < 40) { const vv = dlg.view(); if (vv.choices) dlg.choose(0); else dlg.advance(); }
    ok(log.status('sq_herbs') === 'done', 'диалог сдачи завершает задание');
    ok(dlg.fmt('есть {n:moon_herb} шт.').includes('0'), 'токен {n:item} подставляет количество');
    ok(!dlg.start('несуществующий'), 'диалог с неизвестным NPC не падает');
  }
  // --- Мирра подсказывает вернуться к корням после Огня
  {
    const { state, quests, abilities, dlg } = mk();
    quests.complete(EV.UNLOCK_TELEKINESIS_1); abilities.unlock('fire', 1); quests.complete(EV.UNLOCK_FIRE_1);
    ok(dlg.pick('mirra').id === 'mirra_roots', 'после Огня Мирра направляет к чёрным корням');
    quests.complete(EV.FIRE_GATE_OPEN);
    ok(dlg.pick('mirra').id !== 'mirra_roots', 'после сожжённых корней подсказка про корни исчезает');
  }

  // --- мягкое наведение
  {
    const { state, quests, guide } = mk();
    ok(guide.objective().text.length > 3 && guide.objective().stepId === 'book', 'цель: «' + guide.objective().full + '»');
    ok(guide.targetId(() => false) === 'magic_book', 'цель шага «book» — книга');
    let hint = null; for (let t = 0; t < 100 && !hint; t++) hint = guide.tick(1);
    ok(hint && hint.hint, 'застряли 45 с → подсказка: «' + (hint && hint.hint) + '»');
    guide.noteProgress();
    ok(guide.tick(1) === null, 'прогресс сбрасывает ожидание');
    ok(guide.lineFor({ item: 'moon_herb' }) && guide.lineFor({ item: 'moon_herb' }) === null, 'реплика героини на предмет — один раз');
    ok(guide.lineFor({ zone: 'B' }) && guide.lineFor({ zone: 'B' }) === null, 'реплика героини на зону — один раз');
    quests.complete(EV.UNLOCK_TELEKINESIS_1);
    guide.onEvent('unlock_fire_1');
    ok(guide.pointerActive(), 'после Огня включается стрелка к цели');
  }
}

console.log('\n[v0.8.2] Опыт до следующего уровня');
{
  const { xpProgress } = await import('../src/state/heroProgress.js');
  const { state } = makeWorld({ t: 0 });
  let x = xpProgress(state);
  ok(x.level === 1 && x.progress === 0 && x.caption === 'До 2 ур.: 60 опыта', 'начало: ' + x.caption);
  state.addHeroXP(30); x = xpProgress(state);
  ok(Math.abs(x.progress - 0.5) < 1e-9 && x.remaining === 30, 'внутри уровня: 50%, осталось 30');
  state.data.heroLevel = 4; state.data.heroXP = 370; x = xpProgress(state);
  ok(Math.abs(x.progress - 0.625) < 1e-9 && x.caption === 'До 5 ур.: 60 опыта', 'пример из ТЗ: ур. 4, 370 → 62,5%, «До 5 ур.: 60 опыта»');
  const ups = state.addHeroXP(60); x = xpProgress(state);
  ok(ups.length === 1 && x.level === 5 && !x.max && x.caption === 'До 6 ур.: 220 опыта', 'повышение до 5 → дальше уровень 6 (v0.10.0): ' + x.caption);
  // v0.10.0: границы новых уровней 650 / 940 / 1300 и максимальный 10-й
  state.data.heroLevel = 1; state.data.heroXP = 0;
  ok(state.addHeroXP(649).length === 4 && state.data.heroLevel === 5, '649 опыта — уровень 5');
  ok(state.addHeroXP(1).length === 1 && state.data.heroLevel === 6 && state.heroStats().maxHp === 152 && state.heroStats().maxMana === 125, '650 — уровень 6: 152 HP, 125 маны');
  state.addHeroXP(290); ok(state.data.heroLevel === 7 && state.heroStats().maxHp === 160, '940 — уровень 7: 160 HP');
  state.addHeroXP(359); ok(state.data.heroLevel === 7, '1299 — ещё 7');
  state.addHeroXP(1); ok(state.data.heroLevel === 8 && state.heroStats().maxMana === 140, '1300 — уровень 8: 140 маны');
  state.addHeroXP(1800); ok(state.data.heroLevel === 11 && state.heroStats().maxHp === 202, '3100 — уровень 11 (глава II): 202 HP');
  state.addHeroXP(50000); x = xpProgress(state);
  ok(x.level === 15 && x.max && x.progress === 1 && x.caption === 'Максимальный уровень' && state.heroStats().maxHp === 255, 'уровень 15 — максимальный (глава II): 255 HP');
  ok(x.remaining === 0 && !/NaN|null|16/.test(x.caption), 'после максимума нет 16-го уровня, NaN и отрицательных чисел');
  state.data.heroLevel = 2; state.data.heroXP = 10; x = xpProgress(state);   // повреждённое сохранение: опыт меньше порога
  ok(x.progress === 0 && x.remaining === 140, 'опыт ниже порога уровня не даёт отрицательную полосу');
}

console.log('\n[v0.9] Общие HP и мана, зелья, обучение боя, облачная модель');
{
  const vitals = await import('../src/state/vitals.js');
  const { CombatTutorial, CT_SKIPPED } = await import('../src/systems/CombatTutorial.js');
  const PM = await import('../src/cloud/playerModel.js');
  const { PlayerActions } = await import('../src/systems/PlayerActions.js');
  const { VITALS, HERO_RECOVERY } = await import('../src/config/balance.hero.js');
  const { WORLD_MANA_COST } = await import('../src/config/balance.abilities.js');

  // --- запасы: null = полный, пределы, без NaN
  {
    const { state } = makeWorld({ t: 0 });
    ok(vitals.hp(state) === 120 && vitals.mana(state) === 100, 'новый персонаж: полные HP и мана (null = полный)');
    ok(vitals.spendMana(state, 8) && vitals.mana(state) === 92, 'списание маны');
    ok(!vitals.spendMana(state, 1000) && vitals.mana(state) === 92, 'нехватка маны: ничего не списано');
    vitals.setHp(state, -5); ok(vitals.hp(state) === 0, 'HP не уходит ниже 0');
    vitals.setHp(state, 9999); ok(vitals.hp(state) === 120, 'HP не больше максимума');
    vitals.setMana(state, NaN); ok(vitals.mana(state) === 0 && !Number.isNaN(state.data.mana), 'NaN → 0, не NaN');
    state.data.mana = 0; ok(vitals.mana(state) === 0, 'числовой 0 не путается с «нет значения»');
  }
  // --- восстановление по настенным часам: время, предел, дом быстрее, скрытая вкладка, бой стоит
  {
    const { state } = makeWorld({ t: 0 });
    vitals.setHp(state, 50); vitals.setMana(state, 10);
    let t = 1_000_000; vitals.regenWall(state, t);                       // часы запущены
    t += 10_000; vitals.regenWall(state, t);                             // 10 с в лесу
    ok(Math.abs(vitals.hp(state) - 60) < 1e-6 && Math.abs(vitals.mana(state) - 15) < 1e-6, `10 с в лесу: +${VITALS.hpRegenPerSec * 10} HP, +${VITALS.manaRegenWorld * 10} маны`);
    t += 10_000; vitals.regenWall(state, t, { inHouse: true });
    ok(Math.abs(vitals.mana(state) - 35) < 1e-6, 'в доме Мирры мана восстанавливается быстрее (2/с)');
    state.data.combatSince = t; const hBefore = vitals.hp(state);
    t += 60_000; ok(!vitals.regenWall(state, t) && vitals.hp(state) === hBefore, 'пока идёт бой, время не засчитывается');
    state.data.combatSince = null;
    t += 3_600_000; vitals.regenWall(state, t);
    ok(vitals.hp(state) === 120 && vitals.mana(state) === 100, 'час в скрытой вкладке = полное восстановление (как у сервера), без превышения максимума');
    state.data.mana = 0.37; ok(vitals.view(state).mana === 0 && state.data.mana === 0.37, 'дробная мана хранится точно, округляется только отображение');
    // v0.13.0: локальное списание (бой, инструменты баланса) счётчика для сервера больше не ведёт
    const w = makeWorld({ t: 0 }).state;
    vitals.spendMana(w, 8); vitals.spendMana(w, 4.5);
    ok(vitals.mana(w) === 87.5 && !('manaSpent' in w.data), 'spendMana списывает локально, счётчика mana_spent больше нет');
  }
  // --- новый уровень не восстанавливает скрыто; победа — полный HP после наград, мана — остаток; поражение — 20%
  {
    const { state } = makeWorld({ t: 0 });
    vitals.setMana(state, 30); vitals.setHp(state, 70);
    state.addHeroXP(60);
    ok(state.data.heroLevel === 2 && vitals.mana(state) === 30 && vitals.hp(state) === 70, 'новый уровень не даёт скрытого восстановления');
    const fresh = makeWorld({ t: 0 }).state;
    fresh.addHeroXP(60);
    ok(vitals.hp(fresh) === 120 && vitals.maxHp(fresh) === 126, 'полный (null) запас при повышении фиксируется числом — без бесплатного прироста');
    state.applyReward({ heroXP: 100 });
    vitals.afterVictory(state, 12.5);
    ok(vitals.hp(state) === vitals.maxHp(state) && vitals.maxHp(state) === 132 && vitals.mana(state) === 12.5, 'победа: HP = новый максимум после наград, мана — фактический остаток');
    vitals.afterDefeat(state, 3);
    ok(vitals.hp(state) === Math.ceil(132 * HERO_RECOVERY.defeatHpFraction) && vitals.mana(state) === 3, 'поражение: 20% HP, мана сохраняет остаток');
  }
  // --- бой берёт текущие запасы и пишет их обратно; HP в бою не восстанавливается
  {
    const w = makeWorld({ t: 0 }); w.abilities.unlock('telekinesis', 1);
    vitals.setHp(w.state, 60); vitals.setMana(w.state, 20);
    const cm = new CombatManager({ enemyType: 'forest_scavenger', state: w.state, abilities: w.abilities });
    ok(cm.hero.hp === 60 && cm.hero.mana === 20, 'вход в бой — с текущими HP и маной из мира');
    cm.useAbility('telekinesis');
    ok(Math.abs(vitals.mana(w.state) - 6) < 1e-9, 'мана, потраченная в бою, сразу в общем состоянии');
    cm.enemy.strongCd = 999; cm.enemy.normalCd = 999;
    const hp0 = cm.hero.hp; for (let i = 0; i < 300; i++) cm.tick(1 / 30, { holdEnemy: true });
    ok(cm.hero.hp === hp0 && vitals.hp(w.state) === hp0, 'в бою HP сам не восстанавливается');
    ok(Math.abs(cm.hero.mana - 36) < 0.01, 'мана в бою восстанавливается одним механизмом (3/с, v0.10.0)');
    ok(cm.cooldowns.telekinesis === 0 && cm.time === 0, 'holdEnemy: враг и время боя стоят, перезарядка дара идёт');
  }
  // --- зелья вне боя (v0.12.0: действие drink; здесь локальный режим того же правила)
  {
    const { state } = makeWorld({ t: 0 });
    const acts = new PlayerActions({ state });
    ok((await acts.drink('elixir_life')).reason === 'none', 'нет зелья — ничего не происходит');
    state.addItem('elixir_life', 2); state.addItem('elixir_mana', 1); state.addItem('resin_flask', 1);
    ok((await acts.drink('elixir_life')).reason === 'full' && state.item('elixir_life') === 2, 'полное HP: настой не тратится');
    vitals.setHp(state, 100);
    const r = await acts.drink('elixir_life');
    ok(r.ok && r.amount === 20 && vitals.hp(state) === 120 && state.item('elixir_life') === 1, 'частично полный запас: восстановлено только недостающее (+20), списан 1 настой');
    vitals.setMana(state, 10);
    const m = await acts.drink('elixir_mana');
    ok(m.ok && Math.abs(vitals.mana(state) - 70) < 0.5 && state.item('elixir_mana') === 0, 'лунный эликсир из сумки: +60% маны');
    ok((await acts.drink('resin_flask')).reason === 'unknown' && state.item('resin_flask') === 1, 'смоляная склянка вне боя не применяется');
    const w = makeWorld({ t: 0 }); w.abilities.unlock('telekinesis', 1);
    w.state.addItem('elixir_life', 6); vitals.setHp(w.state, 10);
    await new PlayerActions({ state: w.state }).drink('elixir_life'); vitals.setHp(w.state, 10);
    const cm = new CombatManager({ enemyType: 'forest_scavenger', state: w.state, abilities: w.abilities });
    let n = 0; while (cm.usePotion('elixir_life').ok && n < 10) { n++; cm.hero.hp = 10; }
    ok(n === 4, 'лимит 4 расходника за бой; зелье, выпитое вне боя, его не уменьшает');
  }
  // --- лечение у Мирры и стартовый набор (JS-зеркало player_action)
  {
    const s0 = { ...PM.emptySnapshot(), hp: 40, inventory: { coins: 7 } };
    ok(PM.healPriceOf(s0) === 8, 'цена лечения: не хватает 80 HP → 8 монет');
    const poor = PM.applyAction(s0, { op: 'heal' });
    ok(!poor.result.ok && poor.result.reason === 'coins' && poor.snapshot.hp === 40 && poor.snapshot.inventory.coins === 7, 'монет не хватает: ничего не списано, HP прежнее');
    const rich = PM.applyAction({ ...s0, inventory: { coins: 20 } }, { op: 'heal' });
    ok(rich.result.ok && rich.snapshot.hp === 120 && rich.snapshot.inventory.coins === 12, 'лечение: −8 монет, HP полное');
    ok(PM.applyAction({ ...s0, hp: null }, { op: 'heal' }).result.reason === 'full', 'полное HP: лечить нечего, цена 0');
    ok(PM.healPriceOf({ ...s0, hp: 119.5 }) === 1, 'дробное недостающее HP округляется вверх');
    const k1 = PM.applyAction(PM.emptySnapshot(), { op: 'starter_kit' });
    const k2 = PM.applyAction(k1.snapshot, { op: 'starter_kit' });
    ok(k1.result.ok && k1.snapshot.inventory.elixir_life === 1 && k1.snapshot.inventory.elixir_mana === 1 && k1.snapshot.quests.includes('mirra_starter_kit'), 'стартовый набор: событие + настой + эликсир одной операцией');
    ok(!k2.result.ok && k2.snapshot.inventory.elixir_life === 1, 'повторный набор не выдаётся');
    // локальный режим (без сервера): двойное нажатие не лечит дважды
    const { state } = makeWorld({ t: 0 });
    vitals.setHp(state, 40); state.addItem('coins', 20);
    const acts = new PlayerActions({ state });
    const [a, b] = await Promise.all([acts.heal(), acts.heal()]);
    ok(a.ok && b.reason === 'busy' && state.item('coins') === 12 && vitals.hp(state) === 120, 'двойное нажатие «Восстановить»: одно списание');
    const again = await acts.heal();
    ok(!again.ok && again.reason === 'full' && state.item('coins') === 12, 'повтор при полном HP ничего не списывает');
  }
  // --- облачная модель: мана в снимке, diff, пределы по уровню
  {
    const { state } = makeWorld({ t: 0 });
    vitals.setMana(state, 33.5); vitals.setHp(state, 0);
    const snap = PM.toSnapshot(state.data);
    ok(snap.mana === 33.5 && snap.hp === 0, 'снимок хранит ману и числовой 0');
    const back = PM.fromSnapshot(snap);
    ok(back.mana === 33.5 && back.hp === 0, 'снимок → состояние: мана и 0 HP сохраняются');
    const base = PM.emptySnapshot();
    const p = PM.diffSnapshots(base, snap);
    ok(!('mana' in p) && !('hp' in p), 'v0.12.0: diff не содержит HP и ману — их записывает только сервер');
    ok(PM.isMinorPatch({ pos: { x: 1, y: 1 }, play: 5 }) && !PM.isMinorPatch({ inv: { coins: 1 }, pos: { x: 1, y: 1 } }), 'позиция и время игры — «мелкое» изменение');
    const s1 = PM.applyPatch(base, { hp: { value: 5 }, mana: { value: 5 } });
    ok(s1.hp === base.hp && s1.mana === base.mana, 'клиент не может записать HP и ману');
    const s2 = PM.applyPatch(base, { mana_spent: 30 });
    ok(s2.mana === base.mana, 'v0.13.0: mana_spent игнорируется — ману тратит только сервер (операции world, use)');
    const old = PM.fillDefaults({ ...PM.emptySnapshot(), mana: undefined, meta: {} }).snapshot;
    ok(old.mana === null && vitals.mana({ data: PM.fromSnapshot(old), heroStats: () => ({ maxHp: 120, maxMana: 100 }) }) === 100, 'старое сохранение без маны → полный запас');
  }
  // --- обучение первого боя
  {
    const mk = () => {
      const w = makeWorld({ t: 0 }); w.abilities.unlock('telekinesis', 1);
      const cm = new CombatManager({ enemyType: 'forest_scavenger', state: w.state, abilities: w.abilities });
      const settings = { hints: true, get(k) { return this[k]; } };
      return { ...w, cm, settings, tut: new CombatTutorial({ state: w.state, settings, spawnId: 'scavenger_01', cm }) };
    };
    const run = (x, sec, hold = true) => { for (let i = 0; i < sec * 30; i++) { x.cm.tick(1 / 30, { holdEnemy: hold ? x.tut.holdEnemy() : false }); x.tut.tick(1 / 30); x.tut.onEvents(x.cm.drainEvents()); } };
    const x = mk();
    ok(x.tut.step === 'intro' && x.tut.holdEnemy(), 'шаг 1: вступление, враг стоит');
    const hp0 = x.cm.hero.hp; run(x, 20);
    ok(x.cm.hero.hp === hp0 && x.cm.enemy.hp === x.cm.enemy.maxHp, 'пока игрок читает, урона нет ни героине, ни врагу');
    x.tut.confirmIntro();
    ok(x.tut.step === 'select', 'шаг 2: выбрать предмет');
    x.tut.beforeAbility('telekinesis', 'ready'); x.cm.useAbility('telekinesis'); x.tut.onEvents(x.cm.drainEvents());
    ok(x.tut.step === 'select' && x.tut.feedback, 'Телекинез без выбранного камня не продвигает шаг, есть пояснение');
    x.cm.cooldowns.telekinesis = 0;
    x.cm.selectObject('rock_a'); x.tut.onEvents(x.cm.drainEvents());
    ok(x.tut.step === 'throw', 'выбран камень → шаг 3: бросок');
    x.cm.useAbility('telekinesis'); x.tut.onEvents(x.cm.drainEvents());
    ok(x.tut.step === 'interrupt' && !x.tut.holdEnemy(), 'бросок → шаг 4: бой идёт до опасной атаки');
    x.cm.cooldowns.telekinesis = 5; x.cm.hero.mana = 0;   // дар недоступен в момент предупреждения
    let guard = 0; while (!x.cm.enemy.isPreparing && guard++ < 900) run(x, 1 / 30 * 1, true);
    ok(x.cm.enemy.isPreparing && x.tut.holdEnemy(), 'опасная атака удерживается, пока игрок не прервёт');
    const prep = x.cm.enemy.prepLeft; run(x, 10);
    ok(x.cm.enemy.prepLeft === prep && x.cm.abilityState('telekinesis').state === 'ready', 'перезарядка и мана идут во время остановки — Телекинез снова готов (нет зависания)');
    x.tut.beforeAbility('fire', 'locked');
    ok(x.tut.step === 'interrupt', 'неверный дар не завершает шаг');
    x.cm.useAbility('telekinesis'); x.tut.onEvents(x.cm.drainEvents());
    ok(x.tut.step === 'confirm' && x.tut.done('interrupt'), 'настоящее прерывание → «Атака прервана»');
    run(x, 3, true);
    ok(!x.tut.active && !x.tut.holdEnemy(), 'после подтверждения бой идёт обычным образом');

    // поражение сохраняет пройденные шаги, повторная попытка продолжает
    const y = mk(); y.tut.confirmIntro(); y.cm.selectObject('rock_a'); y.tut.onEvents(y.cm.drainEvents());
    const cm2 = new CombatManager({ enemyType: 'forest_scavenger', state: y.state, abilities: y.abilities });
    const t2 = new CombatTutorial({ state: y.state, settings: y.settings, spawnId: 'scavenger_01', cm: cm2 });
    ok(t2.step === 'throw' && t2.reminder, 'повторная попытка: пройденные шаги сохранены, есть напоминание о выборе камня');
    y.state.data.stats.combats.push({ enemy: 'forest_scavenger', result: 'defeat' });
    ok(t2.active, 'проигранный бой в истории не считается освоенным обучением');
    t2.skip();
    ok(!t2.active && !t2.holdEnemy() && y.state.data.tutorial.includes(CT_SKIPPED) && !y.state.isEnemyDefeated('scavenger_01'), 'пропуск: бой не стоит, победа не засчитана');
    const z = mk(); z.settings.hints = false;
    ok(!z.tut.active && !z.tut.holdEnemy(), 'подсказки выключены — обучение не останавливает бой');
    const v = mk(); v.state.markEnemyDefeated('scavenger_01');
    ok(!v.tut.active, 'победившему раньше обучение не навязывается');
    const u = mk(); const t3 = new CombatTutorial({ state: u.state, settings: u.settings, spawnId: 'lunar_guard', cm: u.cm });
    ok(!t3.active, 'другие бои без обучения');
  }
  ok(WORLD_MANA_COST.gather === 4 && WORLD_MANA_COST.push.heavy === 20 && WORLD_MANA_COST.fire === 16, 'цены магии в мире — из конфига');
}

// ---------------------------------------------------------------
console.log('\n[v0.10] Страж узла: фазы, прерывания, бой');
{
  const NG = ENEMIES.node_guardian;
  ok(NG.hp === 900 && NG.normalAttack.damage === 12 && NG.normalAttack.intervalSec === 4.5 && NG.strongAttack.damage === 30
    && NG.strongAttack.prepSec === 2.5 && NG.strongAttack.cooldownSec === 10 && NG.strongAttack.firstDelaySec === 6 && NG.interruptedCooldownSec === 7,
    'Страж узла: 900 HP, удар 12 / 4,5 с, сильный 30 (подготовка 2,5, КД 10, первый через 6, после прерывания 7)');
  ok(ENEMIES.forest_guardian.hp === 420, 'Страж ворот остаётся 420 HP');
  const mk = (lvl = 2) => { const w = makeWorld({ t: 0 }); w.abilities.unlock('telekinesis', lvl); w.abilities.unlock('fire', 1); w.abilities.unlock('seal', 1); w.state.addHeroXP(650); w.state.data.hp = null; w.state.data.mana = null; return { w, cm: new CombatManager({ enemyType: 'node_guardian', state: w.state, abilities: w.abilities }) }; };
  { // фаза 1: броня 45 %, кристалл; переход ровно на 600
    const { cm } = mk(); const e = cm.enemy;
    ok(e.phase === 0 && e.armorActive && e.def.armor.value === 0.45 && !e.defenseActive, 'фаза 1 (> 600): кристаллическая броня 45 %');
    e.hp = 601; e.takeDamage(1, 'telekinesis'); cm.flushPhases();
    const ev = cm.drainEvents();
    ok(e.hp === 600 && e.phase === 1 && !e.hasArmor && e.defenseActive && e.def.defense === 0.2 && e.def.weaknesses.fire === 0.5, 'ровно 600 HP → фаза 2: брони нет, защита 20 %, Огонь +50 %');
    ok(ev.some(x => x.type === 'phase' && x.phase === 2) && ev.some(x => x.type === 'objectUsed' && x.action === 'shatter') && cm.fieldObjects.find(o => o.def.breaksArmor).gone, 'смена фазы: событие для сцены, кристалл больше не нужен и не возвращается');
    e.onFireHit();
    ok(!e.defenseActive && e.defenseDisabledLeft === 6, 'фаза 2: Огонь снимает защиту на 6 с');
    e.hp = 301; e.burn = { left: 4, dps: 4, tick: 0.01 }; e.update(0.02); cm.flushPhases();
    ok(e.phase === 2 && e.hp <= 300 && e.def.defense === 0.4 && e.defenseActive && e.def.weaknesses.seal === 0.5 && !e.def.weaknesses.fire && e.defenseDisabledLeft === 0, 'фаза 3 включается и от горения; слабость Огня снята, тень: защита 40 %, Астрал +50 %');
    ok(e.def.strongAttack.damage === 36 && e.def.strongAttack.interruptBy.join() === 'telekinesis', 'фаза 3: сильный удар 36, прерывает Телекинез (Астрал не прерывает никогда)');
  }
  { // один удар через два порога
    const { cm } = mk(); const e = cm.enemy;
    e.hp = 610; e.armorDisabledLeft = 5; e.takeDamage(400, 'telekinesis'); cm.flushPhases();
    const ph = cm.drainEvents().filter(x => x.type === 'phase');
    ok(e.phase === 2 && !e.hasArmor && e.def.defense === 0.4 && e.armorDisabledLeft === 0 && ph.length === 1 && ph[0].phase === 3, 'удар через 600 и 300 сразу → фаза 3 без остатков брони (только тень)');
  }
  { // прерывания по фазам
    const { cm } = mk(); const e = cm.enemy;
    e.strongCd = 0; e.update(0.01);
    cm.selectObject('heavy_a'); cm.useAbility('telekinesis');
    ok(!e.isPreparing && e.strongCd === 7, 'фаза 1: тяжёлый ТК прерывает, следующий сильный удар — через 7 с');
    e.hp = 250; e.checkPhase(); cm.flushPhases(); cm.drainEvents();
    e.staggerLeft = 0; e.strongCd = 0; e.update(0.01);
    cm.cooldowns.telekinesis = 0; cm.hero.mana = 100;
    cm.fieldObjects.forEach(o => { if (!o.gone) { o.available = true; } });
    cm.useAbility('fire');
    ok(e.isPreparing, 'фаза 3: Огонь не отменяет подготовку');
    cm.cooldowns.seal = 0; cm.hero.mana = 100;
    cm.useAbility('seal');
    ok(e.isPreparing && cm.stats.interrupts === 1, 'фаза 3: Астрал подготовку НЕ прерывает');
    cm.cooldowns.telekinesis = 0; cm.hero.mana = 100;
    cm.useAbility('telekinesis');
    ok(!e.isPreparing && cm.stats.interrupts === 2, 'фаза 3: Телекинез прерывает');
    ok(ABILITIES_SEAL_COST() === 20, 'Астрал в бою стоит 20 маны');
  }
  { // Астрал: урон сквозь броню и кору, прерывать не умеет нигде
    const { cm } = mk(); const e = cm.enemy;
    ok(e.armorActive && e.incomingMultiplier('seal') === 1 && e.incomingMultiplier('telekinesis') === 0.55, 'фаза 1: броня 45 % режет Телекинез, Астрал её игнорирует');
    e.hp = 500; e.checkPhase(); cm.flushPhases(); cm.drainEvents();
    ok(e.defenseActive && e.incomingMultiplier('seal') === 1 && e.incomingMultiplier('auto') === 0.8, 'фаза 2: кора 20 % режет обычный удар, Астрал её игнорирует');
    e.hp = 250; e.checkPhase(); cm.flushPhases(); cm.drainEvents();
    ok(e.incomingMultiplier('seal') === 1.5 && e.incomingMultiplier('fire') === 0.6, 'фаза 3 (тень): Астрал ×1,5, прочие удары вязнут (×0,6)');
    cm.hero.mana = 100; const before = e.hp;
    cm.useAbility('seal');
    ok(before - e.hp === Math.round(25 * cm.hero.damageMult * 1.5), 'Астрал в тени: 25 × множитель героя × 1,5');
    for (const type of ['forest_scavenger', 'young_scavenger', 'forest_guardian', 'node_guardian'])
      ok(!JSON.stringify(ENEMIES[type].strongAttack.interruptBy).includes('seal') && !JSON.stringify(ENEMIES[type].phases || []).includes("'seal'") || type === 'node_guardian' && ENEMIES[type].phases.every(p => !(p.strongAttack?.interruptBy || []).includes('seal')),
        `${type}: Астрал не входит в список прерываний`);
  }
  { // ТК I не прерывает тяжёлым в фазе 1
    const { cm } = mk(1); const e = cm.enemy;
    e.strongCd = 0; e.update(0.01);
    ok(!cm.selectObject('heavy_a'), 'ТК I: тяжёлый камень в испытании не выбирается');
  }
  const bare = w => { w.abilities.unlock('telekinesis', 2); w.abilities.unlock('fire', 1); w.abilities.unlock('seal', 1); w.state.addHeroXP(650); w.state.data.hp = null; w.state.data.mana = null; };
  // подготовка по плану главы: 2 настоя и 2 эликсира в сумке (лимит боя — 4 расходника)
  const prepared = w => { bare(w); w.state.addItem('elixir_life', 2); w.state.addItem('elixir_mana', 2); };
  const nb = simulate('node_guardian', bare);
  console.log('    Страж узла без зелий:', nb);
  const r = simulate('node_guardian', prepared);
  console.log('    Страж узла (подготовленный, мгновенная реакция бота):', r);
  ok(r.result === 'victory' && r.time >= 55 && r.time <= 130, `испытание проходимо за 55–130 с (факт ${r.time} с)`);
  const ns = simulate('node_guardian', prepared, 'noseal');
  console.log('    Страж узла без Астрала:', ns);
  ok(ns.result === 'defeat' || ns.time > r.time, 'без Астрала тень (фаза 3) заметно дольше');
}

console.log('\n[v0.10] Старые сохранения: цель главы с достигнутого места');
{
  const at = (events, inv = {}, enemies = []) => { const w = makeWorld({ t: 0 }); for (const e of events) w.state.markEvent(e); Object.assign(w.state.data.inventory, inv); for (const id of enemies) w.state.markEnemyDefeated(id); return w.quests.currentStep().id; };
  const base = ['unlock_telekinesis_1', 'first_world_interaction'];
  ok(at([...base, 'lunar_quest_start'], { lunar_flame: 3 }, ['scavenger_01']) === 'wick', 'до алтаря с тремя огоньками → «сварите фитиль» (огоньки сохранены)');
  ok(at([...base, 'lunar_quest_start'], { lunar_flame: 1 }, ['scavenger_01']) === 'flames', 'до алтаря с одним огоньком → сбор огоньков продолжается');
  ok(at([...base, 'lunar_quest_start', 'lunar_quest_complete'], {}, ['scavenger_01']) === 'research', 'алтарь уже восстановлен → фитиль не нужен, дальше изучение');
  ok(at([...base, 'lunar_quest_start', 'lunar_quest_complete', 'telekinesis_2_start'], {}, ['scavenger_01']) === 'wait', 'ТК II уже запущен → ждём, повторной цены нет');
  const late = [...base, 'lunar_quest_start', 'lunar_quest_complete', 'telekinesis_2_start', 'telekinesis_2_complete', 'heavy_path_open', 'unlock_fire_1', 'fire_gate_open', 'guardian_defeated', 'seal_required_01', 'prototype_complete'];
  ok(at(late, { rare_core: 1 }, ['scavenger_01', 'forest_guardian_01']) === 'compound', 'финал прототипа (seal_required_01, prototype_complete) → продолжение главы, а не её конец');
  ok(at(late, { revealing_compound: 1 }, ['scavenger_01', 'forest_guardian_01']) !== 'end', 'prototype_complete не равен chapter_1_complete');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Все тесты пройдены');
process.exit(failures ? 1 : 0);
