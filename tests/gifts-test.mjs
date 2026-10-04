// v0.11.0 — глубина даров: Огонь II, Астрал II, источник углей, одна очередь изучения, модель экрана «Дары».
import { GameState } from '../src/state/GameState.js';
import { QuestFlags } from '../src/state/QuestFlags.js';
import { EventBus } from '../src/state/EventBus.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { UPGRADES, TIMER_MODE } from '../src/config/balance.progression.js';
import { ENEMIES } from '../src/config/balance.enemies.js';
import { ABILITIES } from '../src/config/balance.abilities.js';
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
  ok(tk.next === null && tk.maxed, 'Телекинез II: выше ступеней нет, пишется «высшая из доступных»');
  w.state.addSchoolXP('fire', 180); w.state.addItem('crimson_ember', 6);
  ok(nextStep(w.state, 'fire').canStart, 'готовность видна в модели');
  w.abilities.startResearch('fire_2');
  ok(nextStep(w.state, 'seal').status === 'busy', 'Астрал показывает «занято», пока идёт Огонь');
  ok(statLines('fire', 2).join(' ').includes('30'), 'в строках числа горения: всего 30');
  ok(statLines('telekinesis', 2).some(l => l.includes('35%')), 'Телекинез II: +35% бросками');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Тесты даров пройдены');
process.exit(failures ? 1 : 0);
