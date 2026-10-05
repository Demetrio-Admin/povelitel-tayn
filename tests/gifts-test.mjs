// v0.11.0 — глубина даров: Огонь II, Астрал II, источник углей, одна очередь изучения, модель экрана «Дары».
import { GameState } from '../src/state/GameState.js';
import { QuestFlags } from '../src/state/QuestFlags.js';
import { EventBus } from '../src/state/EventBus.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { UPGRADES, TIMER_MODE, BRANCH_RESPEC, ITEMS } from '../src/config/balance.progression.js';
import { ENEMIES } from '../src/config/balance.enemies.js';
import { ABILITIES } from '../src/config/balance.abilities.js';
import { toSnapshot, fromSnapshot, diffSnapshots, applyPatch, emptySnapshot } from '../src/cloud/playerModel.js';
import { giftCards, statLines, nextStep, upgradesOf, buildView, toggleSlot, toggleAmulet } from '../src/systems/gifts.js';

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
  ok(upgradesOf('fire')[0].id === 'fire_2' && upgradesOf('seal')[0].id === 'seal_2' && upgradesOf('fire').length === 3 && upgradesOf('seal').length === 3, 'ступени дара находятся по школе (II и две ветки III)');
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
  const fire2 = (() => { const w2 = ready(world()); w2.abilities.unlock('seal', 3); return giftCards(w2.state).find(c => c.id === 'seal'); })();
  ok(fire2.choices.length === 0 && fire2.maxed, 'Астрал III: выше ступеней нет, пишется «высшая из доступных»');
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

console.log('\n[v0.16.0] Огонь III и Астрал III: ветки, лужа, вспышка');
{
  const mk = (ability, branch, enemy = 'rootling', phase = null) => {
    const w = ready(world());
    w.abilities.unlock('fire', 2); w.abilities.unlock('seal', 2);
    w.abilities.unlock(ability, 3); if (branch) w.state.setBranch(ability, branch);
    const cm = new CombatManager({ enemyType: enemy, state: w.state, abilities: w.abilities });
    cm.hero.mana = cm.hero.maxMana; cm.hero.hp = cm.hero.maxHp;
    return cm;
  };
  const f3 = ABILITIES.fire.levels[3], s3 = ABILITIES.seal.levels[3];
  ok(f3.puddle && f3.damage === 22 && f3.manaCost > ABILITIES.fire.levels[2].manaCost, 'Огонь III: лужа смолы, чуть дороже по мане');
  ok(s3.flash.sec === 2 && s3.ignoresDefense, 'Астрал III: вспышка 2 с, броню по-прежнему пробивает');
  ok(Object.keys(ABILITIES.fire.branches).join() === 'arsonist,blaster' && Object.keys(ABILITIES.seal.branches).join() === 'seer,piercer', 'у Огня и Астрала по две ветки');
  for (const id of ['fire_3_arsonist', 'fire_3_blaster', 'seal_3_seer', 'seal_3_piercer']) {
    const u = UPGRADES[id];
    ok(u.toLevel === 3 && u.branch && ABILITIES[u.ability].branches[u.branch] && u.requires.abilityLevel === 2 && u.timerSec.live > UPGRADES.telekinesis_3_lord.timerSec.live, `${id}: ступень III, ветка есть в дарах, таймер длиннее Телекинеза III`);
  }
  const total = (st) => st.damage + st.burn.dps * st.burn.durationSec + (st.puddle ? st.puddle.dps * st.puddle.durationSec : 0);
  const cmA = mk('fire', 'arsonist'), cmB = mk('fire', 'blaster');
  const sA = cmA.abilities.stats('fire'), sB = cmB.abilities.stats('fire');
  ok(sA.damage < f3.damage && sA.burn.durationSec > f3.burn.durationSec && sA.puddle.durationSec > f3.puddle.durationSec, 'Поджигатель: удар слабее, горение и лужа дольше');
  ok(sB.damage > f3.damage * 1.7 && sB.puddle === null && sB.cooldownSec > f3.cooldownSec && sB.manaCost > f3.manaCost, 'Взрывник: удар сильнее, лужи нет, дороже и дольше перезаряжается');
  ok(total(sA) > total(sB) * 0.9 && total(sB) > total(f3) * 0.9, `итог за цикл сопоставим: Поджигатель ${total(sA).toFixed(0)}, Взрывник ${total(sB).toFixed(0)}, база ${total(f3)}`);
  // лужа: наносит урон по секундам, не складывается и обновляется
  const base = mk('fire', null); base.enemy.def = { ...base.enemy.def, defense: 0, weaknesses: null };
  base.useAbility('fire');
  ok(base.enemy.inPuddle && base.enemy.burning, 'после Огня III враг горит и стоит в луже');
  const hp0 = base.enemy.hp; let ticks = 0;
  for (let i = 0; i < 60 * 3; i++) { base.tick(1 / 60); }
  const dealt = hp0 - base.enemy.hp;
  ok(dealt >= 3 * (f3.burn.dps + f3.puddle.dps) - 12, `за 3 с горение и лужа вместе снимают ${dealt} HP`);
  base.cooldowns.fire = 0; base.hero.mana = base.hero.maxMana; base.useAbility('fire');
  ok(Math.abs(base.enemy.puddle.left - f3.puddle.durationSec) < 1e-9 && base.enemy.puddle.dps === f3.puddle.dps, 'повторный Огонь обновляет лужу, а не складывает её');
  ok(mk('fire', null).enemy.puddle.left === 0 && mk('fire', 'blaster').useAbility('fire').ok && !(() => { const c = mk('fire', 'blaster'); c.useAbility('fire'); return c.enemy.inPuddle; })(), 'у Взрывника лужи нет');
  const ev = (() => { const c = mk('fire', null); c.useAbility('fire'); return c.drainEvents(); })();
  ok(ev.some(e => e.type === 'status' && e.status === 'puddle'), 'в бою приходит событие puddle для сцены');
  // вспышка: броня и кора выключены, остальным дарам и автоатаке проще
  const flashed = (branch) => { const c = mk('seal', branch, 'node_guardian'); c.enemy.hp = 650; c.enemy.checkPhase?.(); return c; };
  const g = mk('seal', null, 'node_guardian');
  ok(g.enemy.armorActive, 'у Хранителя в первой фазе броня включена');
  g.useAbility('seal');
  ok(!g.enemy.armorActive && g.enemy.armorDisabledLeft > 1.9, 'вспышка снимает броню на 2 с');
  const evs = g.drainEvents();
  ok(evs.some(e => e.type === 'flash' && e.sec === 2), 'в бою приходит событие flash для сцены');
  const hpBefore = g.enemy.hp; g.enemy.takeDamage(100, 'telekinesis', 1);
  ok(hpBefore - g.enemy.hp === 100, 'пока вспышка действует, Телекинез бьёт без вычета брони');
  for (let i = 0; i < 60 * 2.1; i++) g.tick(1 / 60);
  ok(g.enemy.armorActive, 'через 2 с броня возвращается');
  const seer = mk('seal', 'seer', 'node_guardian');
  seer.useAbility('seal');
  ok(seer.enemy.armorDisabledLeft > 3.9 && seer.enemy.vulnerable.left > 3.9 && seer.enemy.vulnerable.bonus === 0.15, 'Видящий: вспышка 4 с и уязвимость +15%');
  const e2 = seer.enemy; const h1 = e2.hp; e2.takeDamage(100, 'auto', 1);
  ok(h1 - e2.hp === 115, `Видящий: уязвимость усиливает автоатаку (100 → ${h1 - e2.hp})`);
  const pierce = mk('seal', 'piercer', 'node_guardian'), seal = pierce.abilities.stats('seal');
  ok(seal.damage > s3.damage * 1.3 && seal.cooldownSec > s3.cooldownSec && seal.flash.sec === 1, 'Пробивающий: удар сильнее, перезарядка дольше, вспышка 1 с');
  // враг без брони: вспышка ничего не ломает
  const plain = mk('seal', null, 'rootling');
  plain.enemy.def = { ...plain.enemy.def, defense: 0.2 };   // (старый тест выше обнуляет защиту общего описания Корневика)
  plain.useAbility('seal');
  ok(plain.enemy.armorDisabledLeft === 0 && plain.enemy.defenseDisabledLeft > 1.9, 'у врага без брони вспышка снимает только кору (защиту)');
  plain.tick(1 / 60);
  ok(!plain.drainEvents().some(e => e.type === 'armorBack'), 'у врага без брони нет ложного «броня вернулась»');
}

console.log('\n[v0.16.0] Экран «Дары»: новые ветки');
{
  const w = ready(world());
  w.abilities.unlock('fire', 2); w.abilities.unlock('seal', 2); w.state.data.heroLevel = 8;
  const cards = giftCards(w.state);
  const fire = cards.find(c => c.id === 'fire'), seal = cards.find(c => c.id === 'seal');
  ok(fire.choices.length === 2 && fire.choices.map(c => c.branch).join() === 'arsonist,blaster', 'Огонь предлагает двух Поджигателя и Взрывника');
  ok(seal.choices.length === 2 && seal.choices.map(c => c.branch).join() === 'seer,piercer', 'Астрал предлагает Видящего и Пробивающего');
  ok(fire.choices.every(c => c.after.some(l => l.startsWith('Горение'))) && fire.choices[0].after.some(l => l.startsWith('Лужа смолы')) && !fire.choices[1].after.some(l => l.startsWith('Лужа смолы')), 'в числах ветки Огня лужа есть у Поджигателя и нет у Взрывника');
  ok(seal.choices[0].after.some(l => l.startsWith('Вспышка') && l.includes('уязвим')) && seal.choices[1].after.some(l => l.includes('1 с')), 'в числах ветки Астрала видна вспышка');
  w.state.addSchoolXP('fire', 300); w.state.addItem('crimson_ember', 10);
  ok(w.abilities.startResearch('fire_3_blaster'), 'Огонь III · Взрывник запускается');
  ok(w.state.upgradeStatus('fire_3_arsonist').reason === 'busy', 'вторая ветка того же дара ждёт: изучение одно');
  w.abilities.update(true);
  ok(w.state.abilityLevel('fire') === 3 && w.state.branchOf('fire') === 'blaster', 'по таймеру — Огонь III и ветка Взрывника');
  const after = giftCards(w.state).find(c => c.id === 'fire');
  ok(after.respec.length === 1 && after.respec[0].id === 'arsonist' && after.maxed, 'можно сменить ветку на Поджигателя, ступеней выше нет');
}

console.log('\n[v0.16.0] Слоты даров, пресет, амулеты');
{
  const { checkBuild, slotCount, buildSlotRules, AMULETS, AMULET_SLOTS, SLOT_RULES } = await import('../src/config/build.js');
  const { applyAction } = await import('../src/cloud/playerModel.js');
  ok(slotCount(1) === 3 && slotCount(9) === 3 && slotCount(10) === 4 && SLOT_RULES.base === 3, 'слотов даров три, четвёртый — с 10 уровня героя');
  ok(AMULET_SLOTS === 2 && Object.keys(AMULETS).join() === 'amulet_focus,amulet_forest,amulet_lunar', 'два слота амулетов, три амулета');
  for (const [id, a] of Object.entries(AMULETS)) ok(a.text && a.tradeoff && ITEMS[id]?.name === a.name, `${id}: есть описание, цена и предмет в сумке`);
  const rules = buildSlotRules();
  const ctx = (o = {}) => ({ level: 3, unlocked: ['telekinesis', 'fire'], owns: (id) => id === 'amulet_focus', combat: false, ...o });
  const reason = (want, c) => { const r = checkBuild(c || ctx(), want, rules); return r.ok ? 'ok' : r.reason; };
  ok(reason({ slots: ['fire'] }) === 'ok' && reason({ slots: [] }) === 'none' && reason({ slots: ['fire', 'fire'] }) === 'dup' && reason({ slots: ['x'] }) === 'unknown' && reason({ slots: ['seal'] }) === 'locked', 'слоты: порядок проверок none / dup / unknown / locked');
  ok(reason({ slots: ['telekinesis', 'fire'] }, ctx({ unlocked: ['telekinesis', 'fire', 'seal'] })) === 'ok' && reason({}) === 'bad' && reason({ slots: 'fire' }) === 'bad', 'пустой и неверный выбор — bad');
  ok(reason({ amulets: ['amulet_focus'] }) === 'ok' && reason({ amulets: ['amulet_lunar'] }) === 'missing' && reason({ amulets: ['nope'] }) === 'unknown' && reason({ amulets: ['amulet_focus', 'amulet_focus'] }) === 'dup', 'амулеты: ok / missing / unknown / dup');
  ok(reason({ slots: ['fire'] }, ctx({ combat: true })) === 'combat', 'в бою выбор закрыт');
  ok(reason({ amulets: ['amulet_focus', 'amulet_forest', 'amulet_lunar'] }, ctx({ owns: () => true })) === 'too_many', 'больше двух амулетов не надеть');

  // GameState: слоты по умолчанию, выбор, пресет, ветки не затирают билд
  const w = ready(world());
  w.abilities.unlock('fire', 2); w.abilities.unlock('telekinesis', 3);
  ok(w.state.equippedGifts().join() === 'telekinesis,fire,seal', 'по умолчанию в слотах все три открытых дара');
  ok(w.state.setBuild({ slots: ['fire'] }).ok && w.state.equippedGifts().join() === 'fire' && w.state.isEquipped('fire') && !w.state.isEquipped('seal'), 'выбранный слот действует');
  w.state.setBranch('telekinesis', 'lord');
  ok(w.state.buildData().slots.join() === 'fire' && w.state.branchOf('telekinesis') === 'lord', 'смена ветки не стирает слоты');
  ok(w.state.buildPreset('load').reason === 'empty', 'пустой пресет не загрузить');
  w.state.addItem('amulet_focus', 1);
  ok(w.state.buildPreset('save').ok && w.state.setBuild({ slots: ['telekinesis', 'seal'], amulets: ['amulet_focus'] }).ok, 'пресет сохранён, билд изменён');
  ok(w.state.buildPreset('load').ok && w.state.equippedGifts().join() === 'fire' && w.state.equippedAmulets().length === 0, 'пресет вернул прежние слоты и амулеты');
  ok(w.state.buildPreset('load', true).reason === 'combat', 'в бою пресет закрыт');
  ok(w.state.setBuild({ slots: ['fire', 'seal'] }).ok && w.state.equippedGifts().join() === 'fire,seal', 'можно поставить любой набор открытых даров');

  // модель окна: слоты и амулеты
  const w2 = ready(world()); w2.abilities.unlock('fire', 2);
  let bv = buildView(w2.state);
  ok(bv.slotCount === 3 && bv.slots.length === 3 && bv.slots.every(x => x.equipped) && bv.amulets.length === 0 && !bv.hasPreset, 'экран: три дара в слотах, амулетов нет, пресета нет');
  ok(toggleSlot(w2.state, 'fire').slots.join() === 'telekinesis,seal', 'нажатие на дар в слоте убирает его');
  w2.state.setBuild({ slots: ['fire'] });
  ok(toggleSlot(w2.state, 'fire').reason === 'none', 'последний дар из слота не убрать');
  ok(toggleSlot(w2.state, 'seal').slots.join() === 'fire,seal', 'нажатие на дар в запасе ставит его в слот (порядок как у даров)');
  w2.state.addItem('amulet_focus', 1); w2.state.addItem('amulet_forest', 1); w2.state.addItem('amulet_lunar', 1);
  bv = buildView(w2.state);
  ok(bv.amulets.length === 3 && bv.amulets.every(a => !a.equipped), 'в окне видны амулеты из сумки');
  w2.state.setBuild({ amulets: ['amulet_focus', 'amulet_forest'] });
  ok(toggleAmulet(w2.state, 'amulet_lunar').reason === 'full' && toggleAmulet(w2.state, 'amulet_focus').amulets.join() === 'amulet_forest', 'амулетов два: третий не надеть, снять можно');

  // JS-модель сервера выдаёт те же ответы
  const snap = { ...emptySnapshot(), level: 3, abilities: { telekinesis: { level: 3, unlocked: true }, fire: { level: 2, unlocked: true }, seal: { level: 0, unlocked: false } }, inventory: { amulet_focus: 1 } };
  const act = (sn, a) => applyAction(sn, a, null);
  let r = act(snap, { op: 'build_set', slots: ['fire'], amulets: ['amulet_focus'] });
  ok(r.result.ok && r.snapshot.objects.player_build.slots[0] === 'fire' && r.snapshot.objects.player_build.amulets[0] === 'amulet_focus', 'модель сервера: build_set');
  ok(act(snap, { op: 'build_set', slots: ['seal'] }).result.reason === 'locked' && act({ ...snap, combatSince: 5 }, { op: 'build_set', slots: ['fire'] }).result.reason === 'combat', 'модель сервера: locked и combat');
  r = act(r.snapshot, { op: 'build_preset', mode: 'save' });
  ok(r.result.ok && r.snapshot.objects.player_build.preset.slots[0] === 'fire', 'модель сервера: пресет сохранён');
  r = act(r.snapshot, { op: 'respec', ability: 'telekinesis', branch: 'breaker' });
  ok(r.result.reason === 'unavailable' && r.snapshot.objects.player_build.slots[0] === 'fire', 'модель сервера: билд цел после отклонённой смены ветки');
}

console.log('\n[v0.16.0] Бой: слоты и амулеты');
{
  const mk = (setup, enemy = 'rootling') => {
    const w = ready(world()); w.abilities.unlock('fire', 2); w.abilities.unlock('seal', 2);
    setup?.(w);
    const cm = new CombatManager({ enemyType: enemy, state: w.state, abilities: w.abilities });
    cm.hero.mana = cm.hero.maxMana; cm.hero.hp = cm.hero.maxHp;
    return cm;
  };
  const noAmulet = mk(), bench = mk((w) => w.state.setBuild({ slots: ['telekinesis'] }));
  ok(noAmulet.abilityState('fire').state === 'ready', 'без настройки дары доступны');
  ok(bench.abilityState('fire').state === 'benched' && bench.abilityState('telekinesis').state === 'ready', 'дар вне слота — benched, в слоте — готов');
  ok(!bench.useAbility('fire').ok && bench.useAbility('fire').reason === 'benched' && bench.hero.mana === bench.hero.maxMana, 'дар вне слота не применить, мана не тратится');
  const withAmulet = (id) => mk((w) => { w.state.addItem(id, 1); w.state.setBuild({ amulets: [id] }); });
  const fm = withAmulet('amulet_focus'), fo = withAmulet('amulet_forest'), pl = mk();
  ok(Math.abs(fm.hero.damageMult / pl.hero.damageMult - 1.12) < 0.003, `Сосредоточение: урон ×1,12 (${fm.hero.damageMult} против ${pl.hero.damageMult})`);
  ok(fo.hero.damageMult < pl.hero.damageMult && fo.incomingMult === 0.8, 'Лесной: урон героя ниже, входящий ×0,8');
  const hit = (cm) => { const h = cm.hero.hp; cm.hitHero(20, false); return h - cm.hero.hp; };
  ok(hit(fo) === 16 && hit(pl) === 20, 'Лесной амулет: удар 20 → 16');
  const dmg = (cm) => { cm.enemy.def = { ...cm.enemy.def, defense: 0, weaknesses: null }; const h = cm.enemy.hp; cm.useAbility('seal'); return h - cm.enemy.hp; };
  ok(dmg(withAmulet('amulet_focus')) > dmg(mk()), 'Сосредоточение: Астрал бьёт сильнее');
  // Лунный: один раз за бой возвращает ману
  const lu = withAmulet('amulet_lunar');
  lu.hero.mana = 30;   // 30 из 135: после траты станет ниже 20%
  lu.useAbility('fire');
  const ev = lu.drainEvents().find(e => e.type === 'manaRescue');
  ok(ev && lu.hero.mana > 60 && lu.manaRescueUsed, `Лунный амулет вернул ману (+${ev?.mana})`);
  lu.hero.mana = 10; lu.cooldowns.fire = 0; lu.useAbility('fire');
  ok(!lu.drainEvents().some(e => e.type === 'manaRescue'), 'второй раз за бой не срабатывает');
  ok(!mk().drainEvents().some(e => e.type === 'manaRescue') && mk().manaRescue === null, 'без амулета ничего не происходит');
  // экран «Дары» читает те же слоты
  const w = ready(world()); w.abilities.unlock('fire', 2);
  w.state.setBuild({ slots: ['fire'] });
  ok(giftCards(w.state).find(c => c.id === 'telekinesis').equipped === false && giftCards(w.state).find(c => c.id === 'fire').equipped === true, 'карточки даров знают, какой дар в слоте');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Тесты даров пройдены');
process.exit(failures ? 1 : 0);
