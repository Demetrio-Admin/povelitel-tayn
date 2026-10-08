// Отчёт баланса первой главы (v0.10.0) на РЕАЛЬНЫХ конфигах и боевом движке игры (без браузера).
//   node tools/balance/chapter-report.mjs            — таблица трёх сценариев ТЗ §18 (markdown)
//   node tools/balance/chapter-report.mjs --log      — плюс пошаговый журнал контрольного маршрута
//
// Что моделируется: маршрут главы по шагам (сбор, сундуки, поручения, крафт и применение — через те же
// GameState / QuestFlags / QuestLog / PlayerActions, что в игре; бои — CombatManager с ботом, который
// реагирует мгновенно, пьёт зелья по порогам и держит Печать под третью фазу). Время этапов — плановое из ТЗ,
// живой игрок не измерялся. Мана мира: каждое действие списывает свою цену, между этапами — восстановление
// за плановое время (+0,5/с в лесу, +2/с дома), как в игре.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { toSnapshot } from '../../src/cloud/playerModel.js';
import { GameState } from '../../src/state/GameState.js';
import { QuestFlags } from '../../src/state/QuestFlags.js';
import { QuestLog } from '../../src/state/QuestLog.js';
import { EventBus } from '../../src/state/EventBus.js';
import { AbilitySystem } from '../../src/systems/AbilitySystem.js';
import { CombatManager } from '../../src/systems/CombatManager.js';
import { PlayerActions } from '../../src/systems/PlayerActions.js';
import { ENEMIES } from '../../src/config/balance.enemies.js';
import { INTERACTIVES } from '../../src/config/world.layout.js';
import { WORLD_MANA_COST } from '../../src/config/balance.abilities.js';
import { UPGRADES, TIMER_MODE } from '../../src/config/balance.progression.js';
import { CACHE_RESOURCE_REWARDS } from '../../src/config/world.content.js';
import * as vitals from '../../src/state/vitals.js';

const LOG = process.argv.includes('--log');
const RES = ['moon_herb', 'forest_mushroom', 'tree_resin', 'rune_dust', 'lunar_shard', 'lunar_flame', 'rare_core'];
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };

function bot(cm) {
  const e = cm.enemy, sa = e.def.strongAttack;
  const ready = id => cm.abilityState(id).state === 'ready';
  const heavy = cm.fieldObjects.find(o => o.available && o.def.weight === 'heavy' && o.def.throwable && cm.canLift(o));
  const light = cm.fieldObjects.find(o => o.available && o.def.weight !== 'heavy' && o.def.throwable);
  const crystal = cm.fieldObjects.find(o => o.available && o.def.breaksArmor);
  if (cm.hero.hp < cm.hero.maxHp * 0.4 && cm.state.item('elixir_life') > 0) cm.usePotion('elixir_life');
  if (cm.hero.mana < 20 && cm.state.item('elixir_mana') > 0) cm.usePotion('elixir_mana');
  if (cm.state.item('resin_flask') > 0 && e.hp > 120 && !e.isPreparing && (cm.stats.potions || 0) < 3) cm.usePotion('resin_flask');
  if (e.isPreparing) {
    const needsHeavy = !sa.interruptBy.includes('telekinesis');
    if (ready('telekinesis') && (!needsHeavy || heavy)) { cm.selectedId = needsHeavy ? heavy.id : (light?.id ?? null); cm.useAbility('telekinesis'); return; }
  }
  const strongSoon = sa && e.strongCd < 2.5 && !e.isPreparing;
  if (crystal && e.armorActive && ready('telekinesis') && !strongSoon) { cm.selectedId = crystal.id; cm.useAbility('telekinesis'); return; }
  // v0.10.1: Астрал — урон сквозь броню и кору; атаки не прерывает, под прерывание остаётся запас маны
  if (ready('seal') && cm.hero.mana >= 34 && !strongSoon) { cm.useAbility('seal'); return; }
  if (ready('fire')) { cm.useAbility('fire'); return; }
  if (ready('telekinesis') && !strongSoon) { cm.selectedId = (heavy && !(sa && !sa.interruptBy.includes('telekinesis'))) ? heavy.id : (light?.id ?? null); cm.useAbility('telekinesis'); }
}

export function run(scenario) {
  const clock = { t: 0 };
  const state = new GameState(mem(), () => clock.t);
  const bus = new EventBus();
  const quests = new QuestFlags(state, bus);
  const log = new QuestLog(state, bus);
  const abilities = new AbilitySystem(state, quests, bus);
  const actions = new PlayerActions({ state, bus });
  const out = [];
  const L = (s) => { if (LOG) out.push(s); };
  const min = Object.fromEntries(RES.map(k => [k, 0]));
  const fights = [];
  let minutes = 0, manaWorld = 0;
  const track = () => { for (const k of RES) min[k] = Math.min(min[k], state.item(k)); };
  const add = (items) => { for (const [k, v] of Object.entries(items || {})) state.addItem(k, v); track(); };
  const ev = (k) => quests.complete(k);
  const pay = (cost, what) => {
    manaWorld += cost;
    if (vitals.mana(state) < cost) { const need = cost - vitals.mana(state); clock.t += need / 0.5 * 1000; state.data.vitalsClock = clock.t; vitals.setMana(state, cost); L(`    ждём ману ${Math.ceil(need / 0.5)} с для «${what}»`); }
    vitals.spendMana(state, cost);
  };
  // восстановление за плановое время этапа (по секунде, как в игре: мана +0,5/с в лесу, +2/с дома; HP +1/с)
  state.data.vitalsClock = clock.t;
  const rest = (sec, house = false) => { for (let i = 0; i < sec; i++) { clock.t += 1000; vitals.regenWall(state, clock.t, { inHouse: house }); } minutes += sec / 60; };
  let waited = 0;
  /** Перед боем игрок ждёт, пока мана восстановится хотя бы до доли frac (время ожидания — в отчёт). */
  const ready = (frac) => { let s = 0; while (vitals.mana(state) < vitals.maxMana(state) * frac && s < 400) { clock.t += 1000; vitals.regenWall(state, clock.t); s++; } waited += s; if (s) L(`    ждём ману перед боем ${s} с`); };
  const gather = (id, n = 1) => { const c = INTERACTIVES.find(o => o.id === id); for (let i = 0; i < n; i++) { pay(WORLD_MANA_COST.gather, id); add({ [c.res]: c.amount || 1 }); } };
  const chest = (id) => { const c = INTERACTIVES.find(o => o.id === id); if (scenario === 'main' && ['glade_cache', 'trail_cache', 'west_chest'].includes(id)) return; state.applyReward(c.reward); track(); };
  const sq = (id) => { log.accept(id); const r = log.turnIn(id); assert.ok(r, `Задание ${id} не сдано`); track(); };
  const craft = async (id) => { const r = await actions.craft(id); track(); assert.ok(r.ok, `Крафт ${id}: ${r.reason} ${JSON.stringify(r.missing || '')}`); return r.ok; };
  const use = async (id) => { const r = await actions.use(id); track(); assert.ok(r.ok, `Применить ${id}: ${r.reason}`); return r.ok; };
  const fight = (spawn, type, { lose = false } = {}) => {
    if (!lose) ready(ENEMIES[type].tier === 'strong' ? 0.9 : 0.5);
    const cm = new CombatManager({ enemyType: type, state, abilities });
    const manaBefore = Math.round(cm.hero.mana);
    let t = 0;
    while (!cm.result && t < 400) { if (!lose) bot(cm); cm.tick(1 / 30); t += 1 / 30; }
    const win = cm.result === 'victory';
    const rec = { spawn, type, result: cm.result, sec: +cm.time.toFixed(1), manaBefore, hpLeft: Math.round(cm.hero.hp), potions: cm.stats.potions || 0 };
    fights.push(rec);
    if (win) {
      const first = !state.isEnemyDefeated(spawn);
      state.markEnemyDefeated(spawn);
      const def = ENEMIES[type];
      state.applyReward(first || !def.repeatRewards ? def.rewards : def.repeatRewards);
      vitals.afterVictory(state, cm.hero.mana);
    } else {
      const lost = Math.min(state.item('coins'), 5); if (lost) state.removeItem('coins', lost);
      vitals.afterDefeat(state, cm.hero.mana);
    }
    track();
    L(`    бой ${spawn}: ${cm.result} за ${rec.sec} с, мана до боя ${manaBefore}, HP после ${rec.hpLeft}, зелий ${rec.potions}`);
    minutes += Math.max(rec.sec, 15) / 60;
    return win;
  };
  const heal = () => { const miss = vitals.maxHp(state) - vitals.hp(state); const price = Math.ceil(miss / 10); if (miss > 0 && state.item('coins') >= price) { state.removeItem('coins', price); vitals.setHp(state, vitals.maxHp(state)); L(`    лечение у Мирры: ${price} монет`); } };
  const stage = (name, mins) => { L(`== ${name}`); minutes += 0; return mins; };
  const snapshot = () => ({ xp: state.data.heroXP, lvl: state.data.heroLevel, coins: state.item('coins'), school: { ...state.data.schoolXP }, ember: state.item('crimson_ember') });
  return (async () => {
    // ---------- A. Дом и поляна (5 мин)
    stage('A. Дом и поляна');
    abilities.unlock('telekinesis', 1); ev('unlock_telekinesis_1');
    await actions.starterKit(); state.markEvent('prologue_seen');
    pay(WORLD_MANA_COST.pull, 'moon_plant'); add({ moon_herb: 1 }); ev('first_world_interaction');
    pay(WORLD_MANA_COST.push.medium, 'glade_rock'); add({ coins: 20 });
    chest('glade_cache'); add({ forest_mushroom: 1, tree_resin: 1 });   // сундук Мирры в доме (первый осмотр)
    gather('herb_g1'); gather('herb_g2'); gather('herb_g3'); gather('herb_t1');
    await craft('elixir_life');                         // первый крафт: +15
    if (scenario !== 'main') sq('sq_herbs');                                     // Веда: −3 травы
    rest(5 * 60 - 0, true);
    // ---------- B. Лес и огоньки (10 мин)
    stage('B. Лес и огоньки');
    fight('scavenger_01', 'forest_scavenger');
    chest('trail_cache');
    gather('mush_t1'); gather('resin_t1');
    if (scenario !== 'main') { log.accept('sq_hunter'); fight('scavenger_02', 'young_scavenger'); sq('sq_hunter'); }
    ev('lunar_quest_start');
    pay(WORLD_MANA_COST.pull, 'flame_a'); add({ lunar_flame: 1 });
    pay(WORLD_MANA_COST.push.medium, 'altar_stone'); add({ lunar_flame: 1 });
    fight('lunar_guard', 'young_scavenger'); add({ lunar_flame: 1 });
    chest('guard_cache');                               // +1 пыль
    pay(WORLD_MANA_COST.push.light, 'rune_slab'); add({ rune_dust: 2 });   // пыль под лёгкой плитой
    gather('rune_sigil'); gather('herb_a1'); gather('herb_g1'); gather('herb_g2'); gather('herb_g3'); gather('resin_a1'); gather('crystal_a1');
    rest(10 * 60 - 3 * 25, false);
    // ---------- C. Алтарь и ТК II (6 мин)
    stage('C. Алтарь и ТК II');
    await craft('lunar_wick'); await use('lunar_wick');
    await craft('elixir_mana'); await craft('resin_flask');
    const beforeTK = state.item('coins');
    const okTK = state.startResearch('telekinesis_2'); assert.ok(okTK, `Телекинез II: ${JSON.stringify(state.upgradeStatus('telekinesis_2'))}`); if (okTK) ev('telekinesis_2_start'); L(`    ТК II запущен: ${okTK}`);
    // изучение идёт параллельно отдыху в доме: общий отдых прежний (6 мин), но не меньше самого таймера изучения
    const researchSec = UPGRADES.telekinesis_2.timerSec[TIMER_MODE];
    rest(researchSec, true); abilities.update();
    rest(Math.max(0, 6 * 60 - researchSec), true);
    // ---------- D. Старый лес (10 мин)
    stage('D. Старый лес');
    pay(WORLD_MANA_COST.push.heavy, 'heavy_boulder'); ev('heavy_path_open');
    abilities.unlock('fire', 1); ev('unlock_fire_1');
    pay(WORLD_MANA_COST.fire, 'corrupted_roots'); ev('fire_gate_open');
    fight('rootling_01', 'rootling'); gather('resin_j1');
    fight('rootling_02', 'rootling'); add({ rune_dust: 2 });   // охраняемый запас (1-й цикл)
    gather('mush_j1'); chest('hollow_cache'); add({ moonstone: 1 });
    fight('rootling_03', 'rootling'); chest('west_chest'); gather('mush_a1');
    gather('herb_t1'); gather('herb_a1'); gather('herb_g1'); gather('herb_g2'); gather('herb_g3');
    pay(WORLD_MANA_COST.fire, 'bramble_t1'); add({ tree_resin: 2 });
    gather('resin_t1'); gather('resin_a1');
    rest(10 * 60 - 3 * 25, false);
    // ---------- E. Подготовка (5 мин)
    stage('E. Подготовка');
    await craft('elixir_life'); await craft('elixir_mana'); await craft('resin_flask'); await craft('revealing_compound');
    rest(5 * 60, true);
    // ---------- F. Страж, знаки и Печать (9 мин)
    stage('F. Страж, знаки и Печать');
    fight('rootling_04', 'rootling'); fight('rootling_05', 'rootling'); chest('approach_cache');
    if (scenario === 'defeats') { fight('forest_guardian_01', 'forest_guardian', { lose: true }); heal(); }
    let g = 0; while (!state.isEnemyDefeated('forest_guardian_01') && g++ < 3) if (!fight('forest_guardian_01', 'forest_guardian')) heal();
    ev('guardian_defeated'); state.openPath('gate_path');
    await use('revealing_compound');
    if (scenario !== 'main') { log.accept('sq_dust'); sq('sq_dust'); }               // Селена: −1 пыль (на F по модели)
    abilities.unlock('seal', 1); ev('unlock_seal_1');
    pay(WORLD_MANA_COST.seal, 'seal_sigil'); abilities.grantUseXP('seal'); ev('seal_training_complete');
    pay(WORLD_MANA_COST.seal, 'ancient_gate'); abilities.grantUseXP('seal'); ev('ancient_gate_open');
    gather('herb_t1'); gather('herb_a1'); gather('herb_g1'); gather('herb_g2'); gather('mush_t1'); gather('resin_j1'); gather('crystal_a1'); gather('rune_sigil');
    rest(9 * 60 - 3 * 25, false);
    // ---------- G. Связка (5 мин)
    stage('G. Связка');
    await craft('restoration_bundle');
    await craft('elixir_life');
    rest(5 * 60, true);
    // ---------- I. Испытание и ремонт (6 мин)
    stage('I. Испытание и ремонт');
    if (scenario === 'defeats') { fight('node_trial', 'node_guardian', { lose: true }); heal(); rest(60, true); }
    let n = 0; while (!state.hasEvent('chapter_trial_defeated') && n++ < 3) { if (fight('node_trial', 'node_guardian')) ev('chapter_trial_defeated'); else heal(); }
    ready(0.2);
    await use('restoration_bundle');
    rest(6 * 60, false);
    if (scenario !== 'main') { sq('sq_mushrooms'); sq('sq_resin'); sq('sq_veda_stock'); }
    const end = snapshot();
    // ---------- дополнительный ресурсный выход (через 600 с)
    if (scenario === 'extra') {
      stage('Дополнительный выход');
      rest(600, true);
      for (const id of ['rootling_01', 'rootling_02', 'rootling_03']) fight(id, 'rootling');
      add({ rune_dust: 2 }); gather('rune_sigil');
      for (const id of ['herb_g1', 'herb_g2', 'herb_g3', 'herb_t1', 'herb_a1', 'mush_t1', 'mush_a1', 'mush_j1', 'resin_t1', 'resin_a1', 'resin_j1', 'crystal_a1']) gather(id);
      rest(10 * 60 - 3 * 25, false);
    }
    return { scenario, beforeTK, snapshot: toSnapshot(state.data), end, final: snapshot(), inv: Object.fromEntries(RES.concat(['elixir_life', 'elixir_mana', 'resin_flask']).map(k => [k, state.item(k)])),
      min, fights, manaWorld, waited, events: state.data.completedEvents, log: out, crafted: state.data.stats };
  })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const PLAN = { normal: 56.0, defeats: 67.2, extra: 66.0 };
const res = { normal: await run('normal'), defeats: await run('defeats'), extra: await run('extra') };
const row = (name, f) => `| ${name} | ${f(res.normal)} | ${f(res.defeats)} | ${f(res.extra)} |`;
const fmtFights = r => `${r.fights.length} (${r.fights.filter(f => f.result === 'victory').length} побед)`;
const potionsLeft = r => `${r.inv.elixir_life} / ${r.inv.elixir_mana} / ${r.inv.resin_flask}`;
const left = r => `${r.inv.moon_herb} / ${r.inv.forest_mushroom} / ${r.inv.tree_resin} / ${r.inv.rune_dust}`;
const neg = r => Object.entries(r.min).filter(([, v]) => v < 0).map(([k, v]) => `${k} ${v}`).join(', ') || 'нет';
const strong = (r, spawn) => r.fights.filter(f => f.spawn === spawn).map(f => `${f.result === 'victory' ? 'победа' : 'поражение'} ${f.sec} с, мана до ${f.manaBefore}, зелий ${f.potions}`).join('; ');
console.log('| Показатель | Обычный проход | Два поражения | Ещё один ресурсный выход |');
console.log('| --- | --- | --- | --- |');
console.log(row('Время по плану ТЗ (не измерено)', r => `${PLAN[r.scenario]} мин`));
console.log(row('Все боевые попытки', fmtFights));
console.log(row('XP героя в конце', r => `${r.final.xp}`));
console.log(row('Уровень в конце', r => `${r.final.lvl}`));
console.log(row('Опыт даров в конце (Телекинез / Огонь / Астрал)', r => `${r.final.school.telekinesis || 0} / ${r.final.school.fire || 0} / ${r.final.school.seal || 0}`));
console.log(row('Багровых углей в конце', r => `${r.final.ember}`));
console.log(row('Монеты в конце', r => `${r.final.coins}`));
console.log(row('Остались Настой / Эликсир / Склянка', potionsLeft));
console.log(row('Остались трава / грибы / смола / пыль', left));
console.log(row('Остались осколки', r => `${r.inv.lunar_shard}`));
console.log(row('Отрицательные промежуточные остатки', neg));
console.log(row('Мана мира (валовой расход)', r => `${r.manaWorld}`));
console.log(row('Ожидание маны перед боями (сверх плана)', r => `${Math.round(r.waited / 60 * 10) / 10} мин`));
console.log(row('Сильный Страж', r => strong(r, 'forest_guardian_01')));
console.log(row('Хранитель сердца', r => strong(r, 'node_trial')));
console.log(row('Сюжетные события', r => ['lunar_quest_complete', 'gate_marks_revealed', 'unlock_seal_1', 'ancient_gate_open', 'chapter_trial_defeated', 'chapter_1_complete'].every(e => r.events.includes(e)) ? 'все 6' : 'НЕ ВСЕ'));
if (LOG) for (const r of Object.values(res)) { console.log(`\n### ${r.scenario}`); console.log(r.log.join('\n')); }

}
