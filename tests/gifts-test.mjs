// v0.11.0 — глубина даров: Огонь II, Астрал II, источник углей, одна очередь изучения, модель экрана «Дары».
import { GameState } from '../src/state/GameState.js';
import { QuestFlags } from '../src/state/QuestFlags.js';
import { EventBus } from '../src/state/EventBus.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { UPGRADES, TIMER_MODE, BRANCH_RESPEC } from '../src/config/balance.progression.js';
import { ENEMIES } from '../src/config/balance.enemies.js';
import { ABILITIES } from '../src/config/balance.abilities.js';
import { toSnapshot, fromSnapshot, diffSnapshots, applyPatch, emptySnapshot } from '../src/cloud/playerModel.js';
import { giftCards, statLines, nextStep, upgradesOf } from '../src/systems/gifts.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const world = () => {
  const clock = { t: 0 };
  const state = new GameState(mem(), () => clock.t);
  const bus = new EventBus();
  const quests = new QuestFlags(state, bus);
  const abilities = new AbilitySystem(state, quests, bus);
  return { clock, state, abilities };
};
const ready = (w, lvl = 7) => { w.abilities.unlock('telekinesis', 2); w.abilities.unlock('fire', 1); w.abilities.unlock('seal', 1); w.state.addHeroXP(1260); w.state.markEvent('lunar_quest_complete'); return w; };

console.log('\n[v0.11] Данные ступеней');
{
  ok(ABILITIES.fire.levels[2].damage > ABILITIES.fire.levels[1].damage, 'Огонь II бьёт сильнее');
  ok(Math.abs(ABILITIES.fire.levels[2].damage / ABILITIES.fire.levels[1].damage - 1.25) < 0.04, 'Огонь II: урон выше примерно на четверть');
  const b1 = ABILITIES.fire.levels[1].burn, b2 = ABILITIES.fire.levels[2].burn;
  ok(b2.dps * b2.durationSec > b1.dps * b1.durationSec && b2.durationSec > b1.durationSec, 'Огонь II: горение сильнее и дольше');
  ok(ABILITIES.seal.levels[2].damage === 35 && ABILITIES.seal.levels[2].ignoresDefense, 'Астрал II: 35 урона, броню по-прежнему пробивает');
  ok(!UPGRADES.fire_2.locked && !UPGRADES.seal_2.locked, 'обе ступени открыты для изучения');
  const t = (id) => UPGRADES[id].timerSec.live;
  ok(t('telekinesis_2') < t('fire_2') && t('fire_2') < t('seal_2'), 'лесенка времени: 5 мин → 15 мин → 30 мин');
  ok(upgradesOf('fire').length === 1 && upgradesOf('seal')[0].id === 'seal_2', 'ступени дара находятся по школе');
}

console.log('\n[v0.11] Источник углей для Огня II');
{
  const first = ENEMIES.rootling.rewards.items.crimson_ember, again = ENEMIES.rootling.repeatRewards.items.crimson_ember;
  ok(first === 1 && again === 1, 'Корневик отдаёт уголь и за первую победу, и за повторную');
  const need = UPGRADES.fire_2.cost.items.crimson_ember;
  ok(5 * first + 1 >= need, `пять Корневиков и сухой куст дают ${5 * first + 1} углей из ${need} нужных`);
}

console.log('\n[v0.11] Изучение Огня II и Астрала II');
{
  const w = ready(world());
  let st = w.state.upgradeStatus('fire_2');
  ok(!st.ok && st.reason === 'missing', 'без углей и опыта Огонь II недоступен');
  w.state.addSchoolXP('fire', 180); w.state.addItem('crimson_ember', 5);
  ok(!w.state.upgradeStatus('fire_2').ok, 'пяти углей мало');
  w.state.addItem('crimson_ember', 1);
  ok(w.state.upgradeStatus('fire_2').ok, 'шесть углей и 180 опыта — можно изучать');
  const low = ready(world()); low.state.data.heroLevel = 5; low.state.addSchoolXP('fire', 180); low.state.addItem('crimson_ember', 6);
  ok(!low.state.upgradeStatus('fire_2').ok, 'на уровне 5 Огонь II недоступен (нужен 6)');
  ok(w.abilities.startResearch('fire_2'), 'изучение запущено');
  ok(w.state.item('crimson_ember') === 0 && w.state.data.schoolXP.fire === 0, 'угли и опыт списаны');
  ok(w.state.upgradeStatus('seal_2').reason === 'busy', 'пока идёт Огонь II, Астрал II ждёт: слот изучения один');
  const ms = UPGRADES.fire_2.timerSec[TIMER_MODE] * 1000;
  w.clock.t += ms - 1000; w.abilities.update();
  ok(w.state.abilityLevel('fire') === 1, 'до конца таймера Огонь всё ещё I ступени');
  w.clock.t += 2000; w.abilities.update();
  ok(w.state.abilityLevel('fire') === 2 && !w.state.data.research, 'по таймеру — Огонь II, слот свободен');
  ok(w.abilities.stats('fire').damage === 22 && w.abilities.label('fire') === 'Огонь II', 'AbilitySystem отдаёт числа второй ступени');
  w.state.addSchoolXP('seal', 100); w.state.addItem('lunar_shard', 6);
  ok(w.state.upgradeStatus('seal_2').ok, 'после Огня II слот свободен: Астрал II доступен');
  ok(w.abilities.startResearch('seal_2'), 'Астрал II запущен');
  w.clock.t += UPGRADES.seal_2.timerSec[TIMER_MODE] * 1000 + 1; w.abilities.update();
  ok(w.state.abilityLevel('seal') === 2 && w.abilities.stats('seal').damage === 35, 'Астрал II изучен');
  ok(w.state.upgradeStatus('seal_2').reason === 'done', 'повторно изучить нельзя');
}

console.log('\n[v0.11] Бой: вторая ступень реально сильнее');
{
  const hit = (id, level) => {
    const w = ready(world());
    w.state.addHeroXP(0);
    w.abilities.unlock(id, level);
    const cm = new CombatManager({ enemyType: 'forest_scavenger', state: w.state, abilities: w.abilities });
    const before = cm.enemy.hp;
    cm.useAbility(id);
    for (let i = 0; i < 60; i++) cm.tick(1 / 30);   // 2 с: замах и горение
    return before - cm.enemy.hp;
  };
  const f1 = hit('fire', 1), f2 = hit('fire', 2);
  ok(f2 > f1, `Огонь II наносит больше за 2 с (I: ${f1}, II: ${f2})`);
  const s1 = hit('seal', 1), s2 = hit('seal', 2);
  ok(s2 > s1, `Астрал II наносит больше (I: ${s1}, II: ${s2})`);
}

console.log('\n[v0.11] Модель экрана «Дары»');
{
  const w = world();
  let cards = giftCards(w.state);
  ok(cards.length === 3 && cards.every(c => !c.open), 'в начале все три дара закрыты, показывать нечего');
  ready(w);
  cards = giftCards(w.state);
  const fire = cards.find(c => c.id === 'fire');
  ok(fire.open && fire.level === 1 && fire.next.title === 'Огонь II' && !fire.next.canStart, 'Огонь I: следующая ступень видна, но не готова');
  ok(fire.next.need.some(n => n.item === 'crimson_ember' && n.need === 6 && !n.ok), 'в требованиях — шесть углей с текущим числом');
  ok(fire.next.after.some(l => l.includes('22')), 'показано, каким станет дар');
  const tk = cards.find(c => c.id === 'telekinesis');
  ok(tk.choices.length === 2 && tk.choices.every(c => c.toLevel === 3) && !tk.maxed, 'Телекинез II: впереди ступень III с двумя ветками на выбор');
  const fire2 = (() => { const w2 = ready(world()); w2.abilities.unlock('seal', 2); return giftCards(w2.state).find(c => c.id === 'seal'); })();
  ok(fire2.choices.length === 0 && fire2.maxed, 'Астрал II: выше ступеней нет, пишется «высшая из доступных»');
  w.state.addSchoolXP('fire', 180); w.state.addItem('crimson_ember', 6);
  ok(nextStep(w.state, 'fire').canStart, 'готовность видна в модели');
  w.abilities.startResearch('fire_2');
  ok(nextStep(w.state, 'seal').status === 'busy', 'Астрал показывает «занято», пока идёт Огонь');
  ok(statLines('fire', 2).join(' ').includes('30'), 'в строках числа горения: всего 30');
  ok(statLines('telekinesis', 2).some(l => l.includes('35%')), 'Телекинез II: +35% бросками');
}

console.log('\n[v0.11.1] Телекинез III: две ветки, выбор одной');
{
  const w = ready(world());
  w.state.addSchoolXP('telekinesis', 250); w.state.addItem('lunar_shard', 8); w.state.addItem('rune_dust', 3);
  ok(w.state.upgradeStatus('telekinesis_3_lord').ok && w.state.upgradeStatus('telekinesis_3_breaker').ok, 'обе ветки доступны при уровне 7 и полной цене');
  ok(w.abilities.stats('telekinesis').doubleCast === undefined, 'до ступени III двойного броска нет');
  ok(w.abilities.startResearch('telekinesis_3_breaker'), 'выбрана ветка «Разрушитель»');
  ok(w.state.upgradeStatus('telekinesis_3_lord').reason === 'busy', 'пока идёт изучение, вторая ветка недоступна');
  w.clock.t += UPGRADES.telekinesis_3_breaker.timerSec[TIMER_MODE] * 1000 + 1; w.abilities.update();
  ok(w.state.abilityLevel('telekinesis') === 3 && w.state.branchOf('telekinesis') === 'breaker', 'по таймеру — ступень III и ветка записана');
  ok(w.state.upgradeStatus('telekinesis_3_lord').reason === 'done', 'вторая ветка закрылась (ступень уже есть)');
  const s = w.abilities.stats('telekinesis');
  ok(Math.abs(s.throwDamageBonus - 0.65) < 1e-9 && s.manaCost === 18 && s.damage === 20 && s.doubleCast.windowSec === 2.5, 'Разрушитель: бонус бросков +65%, мана 18, два броска подряд');
  const card = giftCards(w.state).find(c => c.id === 'telekinesis');
  ok(card.branch.id === 'breaker' && card.respec.length === 1 && card.respec[0].id === 'lord', 'карточка показывает ветку и возможность сменить на «Повелителя»');
  ok(!card.respec[0].canPay && w.state.respecBranch('telekinesis', 'lord').reason === 'coins', 'без монет сменить ветку нельзя');
  w.state.addItem('coins', BRANCH_RESPEC.coins + 10);
  const r = w.state.respecBranch('telekinesis', 'lord');
  ok(r.ok && w.state.item('coins') === 10 && w.state.branchOf('telekinesis') === 'lord', `смена ветки списывает ${BRANCH_RESPEC.coins} монет`);
  ok(w.abilities.stats('telekinesis').damage === 18 && w.abilities.stats('telekinesis').interruptRefund.manaPct === 0.5, 'Повелитель: урон −10%, возврат маны при прерывании');
  ok(w.state.respecBranch('telekinesis', 'lord').reason === 'same', 'выбрать ту же ветку нельзя');
  ok(w.state.respecBranch('fire', 'lord').reason === 'unavailable', 'чужой дар или несуществующая ветка — отказ');
  // сохранение: ветка живёт в состоянии мира и переживает «перезагрузку»
  const saved = JSON.parse(JSON.stringify(w.state.data));
  const w2 = world(); w2.state.data = saved;
  ok(w2.state.branchOf('telekinesis') === 'lord', 'ветка читается из сохранённого состояния');
  const lowLevel = world(); lowLevel.state.setBranch('telekinesis', 'lord'); lowLevel.abilities.unlock('telekinesis', 2);
  ok(lowLevel.state.branchOf('telekinesis') === null, 'ветка не действует, пока ступень III не достигнута');
}

console.log('\n[v0.15.0] Сервер: ветка пишется только его операциями (изучение, смена), а не сохранением');
{
  const w = ready(world()); w.abilities.unlock('telekinesis', 3); w.state.setBranch('telekinesis', 'lord');
  const base = emptySnapshot();
  const patch = diffSnapshots(base, toSnapshot(w.state.data));
  ok(!patch.objects?.player_build, 'ветка не уходит на сервер сохранением: player_build закрыт для sync_player');
  const server = toSnapshot(w.state.data);   // так состояние приходит с сервера
  const back = new GameState(mem(), () => 0); back.data = fromSnapshot(server);
  ok(back.branchOf('telekinesis') === 'lord', 'после загрузки с сервера ветка на месте');
}

console.log('\n[v0.11.1] Бой: два броска подряд и ветки');
{
  const mk = (branch, enemy = 'forest_scavenger') => {
    const w = ready(world());
    w.abilities.unlock('telekinesis', 3); if (branch) w.state.setBranch('telekinesis', branch);
    const cm = new CombatManager({ enemyType: enemy, state: w.state, abilities: w.abilities });
    cm.hero.mana = cm.hero.maxMana;
    return cm;
  };
  const cm = mk(null);
  ok(cm.useAbility('telekinesis').ok, 'первый бросок');
  ok(cm.abilityState('telekinesis').state === 'ready', 'сразу после первого броска Телекинез снова готов (окно второго)');
  ok(cm.useAbility('telekinesis').ok, 'второй бросок без перезарядки');
  ok(cm.abilityState('telekinesis').state === 'cooldown', 'после второго — обычная перезарядка');
  const cm2 = mk(null);
  cm2.useAbility('telekinesis');
  for (let i = 0; i < 80; i++) cm2.tick(1 / 30);   // ~2,7 с — окно закрылось, второго броска не было
  ok(cm2.abilityState('telekinesis').state === 'cooldown' && cm2.cooldowns.telekinesis <= 5 - 2.4, `окно прошло: перезарядка идёт с учётом ожидания (осталось ${cm2.cooldowns.telekinesis.toFixed(1)} с)`);
  for (let i = 0; i < 90; i++) cm2.tick(1 / 30);
  ok(cm2.abilityState('telekinesis').state === 'ready', 'без второго броска полный цикл всё равно 5 секунд, а не дольше');
  // Повелитель: удачное прерывание возвращает ману
  const lord = mk('lord', 'forest_scavenger');
  const e = lord.enemy;
  let guard = 0;
  while (!e.isPreparing && guard++ < 600) lord.tick(1 / 30);
  ok(e.isPreparing, 'враг готовит сильную атаку');
  const manaBefore = lord.hero.mana;
  lord.useAbility('telekinesis');
  const gained = lord.hero.mana - (manaBefore - lord.abilities.stats('telekinesis').manaCost);
  ok(lord.stats.interrupts === 1 && gained >= 6, `Повелитель: прерывание вернуло ману (+${Math.round(gained)})`);
  ok(lord.drainEvents().some(ev => ev.type === 'refund'), 'в бою приходит событие refund для сцены');
  // Разрушитель: бросок камня бьёт сильнее, чем у Повелителя
  const dmgOf = (branch) => { const c = mk(branch, 'rootling'); c.enemy.def.defense = 0; const obj = c.fieldObjects.find(o => o.def.throwable && c.canLift(o)); c.selectObject(obj.id); const hp = c.enemy.hp; c.useAbility('telekinesis'); return hp - c.enemy.hp; };
  const dB = dmgOf('breaker'), dL = dmgOf('lord');
  ok(dB > dL * 1.3, `бросок Разрушителя сильнее (Разрушитель ${dB}, Повелитель ${dL})`);
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Тесты даров пройдены');
process.exit(failures ? 1 : 0);
