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

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Все тесты пройдены');
process.exit(failures ? 1 : 0);
