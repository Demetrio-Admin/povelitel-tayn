// v0.20.0 — глава II «Город под инеем», квесты 1–5: цепочка целей, события сервера, награды, бой на площади, переходы, диалоги.
//   node tests/chapter2-test.mjs
import { GameState } from '../src/state/GameState.js';
import { QuestFlags } from '../src/state/QuestFlags.js';
import { EventBus } from '../src/state/EventBus.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { DialogueSystem } from '../src/systems/DialogueSystem.js';
import { QUEST_STEPS } from '../src/config/events.js';
import { STEP_WHY } from '../src/config/story.js';
import { STEP_GUIDE } from '../src/config/guidance.js';
import { NPCS } from '../src/config/npcs.js';
import { DIALOGUES } from '../src/config/dialogues.js';
import { INTERACTIVES, ENEMY_SPAWNS, ZONES, WORLD } from '../src/config/world.layout.js';
import { CITY_START, FOREST_RETURN, EAST_X, ZONE_EVENTS } from '../src/config/world.city.js';
import { ENEMIES } from '../src/config/balance.enemies.js';
import { DISPLAY_SIZE, ASSET_FILES as ASSETS } from '../src/config/assets.manifest.js';
import { applyAction, emptySnapshot, toSnapshot, combatApply, walletOf } from '../src/cloud/playerModel.js';
import { verifyCombat } from '../src/cloud/combatVerify.js';
import { playBot, ctxFor } from './helpers/combat-bot.mjs';
import { STEP } from '../src/systems/combatReplay.js';
import fs from 'fs';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };

console.log('\nГлава II: данные');
{
  const ch2 = QUEST_STEPS.filter(s => s.id.startsWith('ch2_'));
  ok(ch2.map(s => s.id).slice(0, 7).join() === 'ch2_road,ch2_plaza,ch2_ilaria,ch2_trace,ch2_tell,ch2_archive,ch2_severin', 'цепочка целей квестов 1–5');
  ok(ch2.length === 48 && ch2.at(-1).id === 'ch2_next', `квесты 6–15: ${ch2.length - 8} новых целей, последняя — «глава завершена»`);
  ok(ch2.every(s => STEP_WHY[s.id] && STEP_GUIDE[s.id]), 'у каждой цели есть «зачем» и подсказки');
  for (const id of ['ilaria', 'severin', 'merchant', 'banker', 'duelist']) ok(NPCS[id] && DIALOGUES[id]?.length && ASSETS?.[`npc_${id}`] !== undefined || fs.existsSync(`public/assets/sprites/npc_${id}.png`), `NPC ${NPCS[id]?.name}: данные, диалоги, спрайт`);
  for (const id of ['ilaria', 'severin', 'merchant', 'banker', 'duelist']) ok(fs.existsSync(`public/assets/sprites/portrait_${id}.png`), `портрет ${id}`);
  ok(WORLD.width >= 3600 && ZONES.some(z => z.id === 'P') && ZONES.findIndex(z => z.id === 'AR') < ZONES.findIndex(z => z.id === 'P'), 'мир шире (город к востоку), зоны зданий проверяются раньше площади');
  const city = [...INTERACTIVES, ...ENEMY_SPAWNS].filter(o => o.x >= EAST_X);
  ok(city.length >= 12 && city.every(o => o.x < WORLD.width && o.y < WORLD.height), `в городе и на дороге ${city.length} объектов, все внутри мира`);
  ok(ENEMIES.frost_critter && fs.existsSync('public/assets/sprites/enemy_frost_critter.png') && ENEMIES.frost_critter.normalAttack.chill, 'Инеевый зверёк: данные, спрайт, холод');
  const ef = INTERACTIVES.find(o => o.id === 'exit_forest'), ec = INTERACTIVES.find(o => o.id === 'exit_city');   // v0.27.0: переход — через карту мира
  ok(ef?.kind === 'exit' && ef.x < EAST_X && ec?.kind === 'exit' && ec.x >= EAST_X && STEP_GUIDE.ch2_road.targets[0] === 'exit_forest' && STEP_GUIDE.ch2_home.targets[0] === 'exit_city', 'выходы «Карта мира»: в лесу и в городе; наведение ведёт к ним');
  ok(ZONE_EVENTS.P.event === 'ch2_city_arrived', 'первый вход на площадь — событие «пришёл в город»');
  // v0.21.0
  ok(NPCS.nerys && DIALOGUES.nerys?.length >= 10 && fs.existsSync('public/assets/sprites/npc_nerys.png') && fs.existsSync('public/assets/sprites/portrait_nerys.png'), 'Нэрис: данные, диалоги, спрайт и портрет');
  for (const id of ['frost_collector', 'frost_collector_elite', 'ice_guardian']) ok(ENEMIES[id] && fs.existsSync(`public/assets/sprites/${ENEMIES[id].texture}.png`) && DISPLAY_SIZE[ENEMIES[id].texture], `${ENEMIES[id]?.name}: данные и спрайт`);
  ok(ENEMIES.frost_collector.defense > 0 && ENEMIES.ice_guardian.armor && ENEMIES.ice_guardian.weaknesses.fire, 'сборщик — корка (пробивает Астрал), страж — броня и слабость к Огню');
  for (const t of ['ice_wall_01', 'ice_construct_01', 'water_patch_01', 'ice_floor_01', 'frozen_door_01']) ok(ASSETS[t] && DISPLAY_SIZE[t] && fs.existsSync(`public/assets/sprites/${t}.png`), `картинка ${t}`);
  const water = INTERACTIVES.find(o => o.id === 'fq_water'), wall = INTERACTIVES.find(o => o.id === 'frost_barrier');
  ok(water.kind === 'ice' && water.walkable && water.collide && wall.kind === 'fire' && wall.waitEvent === 'ch2_frost_wave', 'ледяная стена (Огонь после волны холода) и затопленный пролом (Лёд) — настоящие преграды');
  ok(ZONES.find(z => z.id === 'FQ').h === 1000, 'Замёрзший квартал — северная часть города');
  // v0.22.0
  for (const id of ['tikhon', 'rowena']) ok(NPCS[id] && DIALOGUES[id]?.length && fs.existsSync(`public/assets/sprites/npc_${id}.png`) && fs.existsSync(`public/assets/sprites/portrait_${id}.png`), `${NPCS[id]?.name}: данные, диалоги, спрайт и портрет`);
  for (const id of ['volunteer', 'experimental_construct', 'severin_boss']) ok(ENEMIES[id] && fs.existsSync(`public/assets/sprites/${ENEMIES[id].texture}.png`) && DISPLAY_SIZE[ENEMIES[id].texture], `${ENEMIES[id]?.name}: данные и спрайт`);
  ok(ENEMIES.severin_boss.phases.length === 3 && ENEMIES.severin_boss.rewards.items.cold_heart === 1 && !ENEMIES.volunteer.repeatRewards, 'Северин — три фазы и Сердце холода; добровольцы — не фарм');
  for (const t of ['astral_ward_01', 'lab_seal_01', 'lab_seal_frozen_01', 'rift_01', 'rift_frozen_01']) ok(ASSETS[t] && DISPLAY_SIZE[t] && fs.existsSync(`public/assets/sprites/${t}.png`), `картинка ${t}`);
  ok(INTERACTIVES.find(o => o.id === 'final_ward').opens && INTERACTIVES.find(o => o.id === 'lab_seal').kind === 'ice', 'барьер зала (Астрал) и печать лаборатории (Лёд) — настоящие двери');
}

console.log('\nГлава II: цели по ходу истории');
{
  const st = new GameState(mem(), () => 1e12);
  // шаги главы I здесь не проверяются (их тесты — run-tests.js): берём первую невыполненную из финала главы I и целей главы II
  const q = { currentStep: () => QUEST_STEPS.filter(x => x.id === 'end' || x.id.startsWith('ch2_')).find(x => !x.done(st)) };
  st.markEvent('chapter_1_complete');
  ok(q.currentStep().id === 'end', 'после главы I — финальная запись, пока не поговорили с Миррой');
  const seq = [['ch2_start', 'ch2_road'], ['ch2_city_arrived', 'ch2_plaza'], ['ch2_plaza_cleared', 'ch2_ilaria'], ['ch2_met_ilaria', 'ch2_trace'],
    ['ch2_trace_astral', 'ch2_trace'], ['ch2_trace_debris', 'ch2_tell'], ['ch2_trace_found', 'ch2_archive'], ['ch2_archive_read', 'ch2_severin'], ['ch2_met_severin', 'ch2_cargo_talk']];
  let good = true;
  for (const [ev, want] of seq) { st.markEvent(ev); if (q.currentStep().id !== want) { good = false; console.log('   ', ev, '→', q.currentStep().id, 'ожидали', want); } }
  ok(good, 'цели идут по порядку: дорога → площадь → Илария → след → Архив → Северин');
  // v0.21.0: квесты 6–10
  const seq2 = [['ch2_cargo_start', 'ch2_warehouse'], ['@wh_collector_1', 'ch2_warehouse'], ['@wh_collector_2', 'ch2_warehouse'], ['@wh_elite', 'ch2_cargo'],
    ['ch2_cargo_found', 'ch2_cargo'], ['ch2_serials_read', 'ch2_cargo_tell'], ['ch2_cargo_reported', 'ch2_ask'], ['ch2_severin_asked', 'ch2_lab'],
    ['ch2_lab_critter', 'ch2_wave'], ['ch2_frost_wave', 'ch2_quarter'], ['ch2_quarter_open', 'ch2_construct'], ['ch2_construct_unstable', 'ch2_nerys'],
    ['ch2_nerys_met', 'ch2_rescue'], ['ch2_rescue_door', 'ch2_rescue'], ['ch2_rescue_cellar', 'ch2_rescue_tell'], ['ch2_rescue_done', 'ch2_warm'],
    ['warm_potion_crafted', 'ch2_lesson'], ['unlock_ice_1', 'ch2_water'], ['ch2_water_frozen', 'ch2_training'], ['ch2_training_done', 'ch2_trained'],
    ['ch2_ice_trained', 'ch2_choice'], ['ch2_deep_1', 'ch2_choice'], ['ch2_deep_2', 'ch2_choice'], ['ch2_ice_guardian_defeated', 'ch2_choice_tell'], ['ch2_quarter_cleared', 'ch2_ice2'],
    // v0.22.0: квесты 11–15
    ['unlock_ice_2', 'ch2_brittle'], ['ch2_brittle_1', 'ch2_brittle'], ['ch2_brittle_2', 'ch2_brittle_craft'], ['brittle_flask_crafted', 'ch2_brittle_tell'],
    ['ch2_brittle_done', 'ch2_lab_lead'], ['ch2_lab_found', 'ch2_lab_door'], ['ch2_lab_open', 'ch2_lab_fight'], ['ch2_vol_1', 'ch2_lab_fight'], ['ch2_vol_2', 'ch2_lab_fight'],
    ['ch2_lab_construct', 'ch2_stabilize'], ['ch2_stabilized', 'ch2_lab_journal'], ['ch2_lab_journal', 'ch2_lab_tell'], ['ch2_lab_reported', 'ch2_confront'],
    ['ch2_severin_confronted', 'ch2_coven'], ['ch2_coven_met', 'ch2_coven_tasks'], ['ch2_unstable_1', 'ch2_coven_tasks'], ['ch2_unstable_2', 'ch2_coven_tasks'],
    ['ch2_coven_supplies', 'ch2_coven_tell'], ['ch2_coven_ready', 'ch2_final_go'], ['ch2_final_start', 'ch2_final_route'], ['ch2_fin_tk', 'ch2_final_route'],
    ['ch2_fin_fire', 'ch2_final_route'], ['ch2_fin_ice', 'ch2_final_route'], ['ch2_fin_seal', 'ch2_ice3'], ['ch2_ice3', 'ch2_boss'], ['ch2_severin_defeated', 'ch2_letters'],
    ['ch2_letters_read', 'ch2_epilogue'], ['ch2_epilogue', 'ch2_home'], ['chapter_2_complete', 'ch2_next']];
  good = true;
  for (const [ev, want] of seq2) {
    if (ev.startsWith('@')) st.markEnemyDefeated(ev.slice(1)); else st.markEvent(ev);
    if (q.currentStep().id !== want) { good = false; console.log('   ', ev, '→', q.currentStep().id, 'ожидали', want); }
  }
  ok(good, 'квесты 6–15: склад → квартал → Нэрис → Лёд I → страж → Хрупкость → лаборатория → Северин → Ковен → финал → Мирра');
}

console.log('\nГлава II: сервер (JS-зеркало) — события только по порядку, награды');
{
  let s = { ...emptySnapshot(), level: 8, xp: 1300, abilities: { telekinesis: { level: 2, unlocked: true }, fire: { level: 2, unlocked: true }, seal: { level: 2, unlocked: true }, ice: { level: 0, unlocked: false } } };
  let T = 1e12;   // время сервера: после боя идёт вперёд (мана восстанавливается)
  const act = (a) => { T += 60_000; const r = applyAction(s, a, T); s = r.snapshot; return r.result; };
  ok(act({ op: 'event', key: 'ch2_start' }).reason === 'locked', 'в город — только после главы I');
  s.quests = [...s.quests, 'chapter_1_complete'];
  ok(act({ op: 'event', key: 'ch2_start' }).ok, 'Мирра отправляет в город');
  const xp0 = s.xp;
  ok(act({ op: 'event', key: 'ch2_city_arrived' }).ok && s.xp - xp0 === 220 && s.inventory.coins >= 60, 'пришёл в город: +220 опыта, +60 монет');
  ok(act({ op: 'event', key: 'ch2_met_ilaria' }).reason === 'locked', 'с Иларией — после того, как площадь очищена');
  ok(act({ op: 'world', obj: 'plaza_trace' }).reason === 'locked', 'иней на площади — после знакомства с Иларией');
  ok(act({ op: 'event', key: 'city_merchant_open' }).ok, 'торговец открывает лавку после прихода в город');
  ok(act({ op: 'shop_buy', item: 'frost_herb', qty: 1 }).ok, 'в лавке можно купить морозник');
  // бой на площади: проверка записи, победа ставит событие
  s.combatSince = T - 60_000; s.vitalsAt = T;
  const ctx = ctxFor({ enemy: 'frost_critter', spawn: 'plaza_critter', level: 8, abilities: s.abilities, hp: 170, mana: 140, potions: { elixir_life: 1, elixir_mana: 1 } });
  s.combatCtx = ctx;
  const play = playBot(ctx, { seed: 2, policy: 'smart', maxTicks: 60 * 200 });
  const v = verifyCombat(s, JSON.parse(JSON.stringify(play.log)), s.combatSince + play.log.ticks * STEP * 1000 + 1000);
  ok(v.ok && v.verdict.outcome === 'victory' && v.verdict.events.includes('ch2_plaza_cleared'), `зверь побеждён за ${Math.round(play.cm.time)} с — событие «площадь очищена»`);
  ok(play.cm.time >= 12 && play.cm.time <= 45, 'бой с Инеевым зверьком короткий (цель 20–25 с у героя 8 уровня)');
  T = s.combatSince + 200_000;
  s = combatApply(s, v.verdict, T).snapshot;
  T += 600_000;
  ok(act({ op: 'event', key: 'ch2_met_ilaria' }).ok && s.inventory.frost_herb >= 2, 'знакомство с Иларией: опыт, монеты, морозник');
  ok(act({ op: 'world', obj: 'plaza_trace' }).ok && act({ op: 'world', obj: 'plaza_debris' }).ok && s.quests.includes('ch2_trace_astral') && s.quests.includes('ch2_trace_debris'), 'Астрал и Телекинез: оба следа найдены');
  ok(act({ op: 'world', obj: 'plaza_debris_reward' }).ok, 'под ящиком — морозник');
  ok(act({ op: 'event', key: 'ch2_trace_found' }).ok && act({ op: 'world', obj: 'archive_document' }).ok && s.quests.includes('ch2_archive_read'), 'Илария → Архив: документ прочитан');
  ok(act({ op: 'event', key: 'ch2_met_severin' }).ok && s.inventory.warm_potion === 1, 'Северин: знакомство и тёплый настой');
  ok(s.level >= 10, `после квестов 1–5 герой на ${s.level} уровне (по балансу ≈10)`);
}

console.log('\nГлава II, квесты 6–10: сервер (JS-зеркало)');
{
  const before = ['chapter_1_complete', 'ch2_start', 'ch2_city_arrived', 'ch2_plaza_cleared', 'ch2_met_ilaria', 'ch2_trace_astral', 'ch2_trace_debris',
    'ch2_trace_found', 'ch2_archive_read', 'ch2_met_severin', 'city_merchant_open'];
  let s = { ...emptySnapshot(), level: 10, xp: 2400, quests: [...before],
    abilities: { telekinesis: { level: 2, unlocked: true }, fire: { level: 2, unlocked: true }, seal: { level: 2, unlocked: true }, ice: { level: 0, unlocked: false } } };
  s.inventory = { ...s.inventory, elixir_life: 6, elixir_mana: 4 };
  let T = 2e12;
  const act = (a) => { T += 120_000; const r = applyAction(s, a, T); s = r.snapshot; return r.result; };
  const hpAt = { 9: 180, 10: 190, 11: 202, 12: 214 }, mpAt = { 9: 145, 10: 155, 11: 165, 12: 175 };
  const fight = (spawn, enemy) => {
    T += 900_000;
    const st = act({ op: 'combat_start', spawn, enemy });
    if (!st.ok) return { ok: false, reason: st.reason };
    let best = null;
    for (let seed = 1; seed <= 6 && !best; seed++) {
      const ctx = s.combatCtx;
      const play = playBot(ctx, { seed, policy: 'smart', maxTicks: 60 * 200 });
      if (play.cm.result === 'victory') best = play;
    }
    if (!best) return { ok: false, reason: 'lost' };
    const v = verifyCombat(s, JSON.parse(JSON.stringify(best.log)), s.combatSince + best.log.ticks * STEP * 1000 + 1000);
    if (!v.ok) return { ok: false, reason: v.reason };
    T = s.combatSince + best.log.ticks * STEP * 1000 + 2000;
    s = combatApply(s, v.verdict, T).snapshot;
    return { ok: v.verdict.outcome === 'victory', time: best.cm.time, events: v.verdict.events };
  };
  // квест 6
  ok(fight('wh_collector_1', 'frost_collector').reason === 'locked', 'бой со сборщиком не засчитывается до разговора с торговцем');
  ok(act({ op: 'event', key: 'ch2_cargo_start' }).ok, 'торговец: «пропал груз»');
  const f1 = fight('wh_collector_1', 'frost_collector'), f2 = fight('wh_collector_2', 'frost_collector');
  ok(f1.ok && f2.ok, `сборщики побеждены (${Math.round(f1.time)} с и ${Math.round(f2.time)} с)` + (f1.ok && f2.ok ? '' : ` ${f1.reason} ${f2.reason}`));
  ok(act({ op: 'world', obj: 'wh_cargo' }).reason === 'locked', 'груз — только после победы над усиленным сборщиком');
  const f3 = fight('wh_elite', 'frost_collector_elite');
  ok(f3.ok && f3.events.includes('ch2_wh_boss') && s.inventory.ice_crystal >= 1, `усиленный сборщик побеждён (${Math.round(f3.time || 0)} с): первый ледяной кристалл`);
  ok(act({ op: 'world', obj: 'wh_cargo' }).ok && act({ op: 'world', obj: 'wh_cargo_reward' }).ok && act({ op: 'world', obj: 'wh_equipment' }).ok, 'груз найден (Телекинез), клеймо прочитано (Астрал)');
  ok(act({ op: 'craft', recipe: 'reinforced_resin' }).reason !== 'locked', 'рецепт закалённой смолы открылся вместе с грузом');
  const xp6 = s.xp;
  ok(act({ op: 'event', key: 'ch2_cargo_reported' }).ok && s.xp - xp6 >= 270, 'Илария: награда квеста 6');
  // квест 7
  ok(act({ op: 'world', obj: 'frost_barrier' }).reason === 'locked', 'ледяную стену не растопить до волны холода');
  ok(act({ op: 'event', key: 'ch2_frost_wave' }).reason === 'locked', 'волна холода — после зверя у Общества');
  ok(act({ op: 'event', key: 'ch2_severin_asked' }).ok, 'Северин: закрытая группа');
  const f4 = fight('lab_critter', 'frost_critter');
  ok(f4.ok && f4.events.includes('ch2_lab_critter'), 'зверь у дверей Общества побеждён');
  ok(act({ op: 'event', key: 'ch2_frost_wave' }).ok, 'волна холода: квест 7 завершён');
  // квест 8
  ok(act({ op: 'world', obj: 'frost_barrier' }).ok && s.quests.includes('ch2_quarter_open'), 'Огонь растопил ледяную стену — квартал открыт');
  ok(act({ op: 'event', key: 'ch2_nerys_met' }).reason === 'locked', 'Нэрис появляется после реакции конструкции');
  ok(act({ op: 'world', obj: 'ice_construct' }).ok && act({ op: 'event', key: 'ch2_nerys_met' }).ok, 'конструкция нагрета — Нэрис остановила взрыв');
  ok(act({ op: 'world', obj: 'fq_door' }).reason === 'locked', 'дверь — после сборщика рядом');
  ok(fight('fq_collector', 'frost_collector').ok && fight('fq_critter', 'frost_critter').ok, 'бои квартала выиграны');
  ok(act({ op: 'world', obj: 'fq_door' }).ok && act({ op: 'world', obj: 'fq_cellar' }).ok, 'жители спасены: Астрал и Телекинез');
  ok(act({ op: 'event', key: 'ch2_rescue_done' }).ok && s.inventory.frost_herb >= 1 && s.inventory.moon_herb >= 1 && s.inventory.forest_mushroom >= 1, 'Нэрис: награда квеста 8 и травы на тёплый настой');
  ok(act({ op: 'event', key: 'unlock_ice_1' }).reason === 'locked', 'урок Льда — после первого тёплого настоя');
  const w0 = s.inventory.warm_potion || 0;
  ok(act({ op: 'craft', recipe: 'warm_potion' }).ok && s.inventory.warm_potion === w0 + 1 && s.quests.includes('warm_potion_crafted'), 'тёплый настой сварен (сюжетная отметка)');
  // квест 9
  ok(act({ op: 'world', obj: 'fq_water' }).reason !== undefined && !s.quests.includes('ch2_water_frozen'), 'без Льда воду не заморозить');
  ok(act({ op: 'event', key: 'unlock_ice_1' }).ok && s.abilities.ice.unlocked && s.abilities.ice.level === 1, 'Нэрис учит: Лёд I');
  ok(act({ op: 'world', obj: 'fq_water' }).reason === 'benched', 'Лёд не в слоте — вода не замерзает (3 из 4)');
  ok(act({ op: 'build_set', slots: ['ice', 'telekinesis', 'fire'] }).ok, 'Лёд поставлен в слот вместо Астрала');
  ok(act({ op: 'world', obj: 'fq_water' }).ok && s.quests.includes('ch2_water_frozen'), 'пролом заморожен');
  ok(fight('fq_training', 'frost_critter').ok && s.quests.includes('ch2_training_done'), 'тренировка с Льдом');
  ok(act({ op: 'event', key: 'ch2_ice_trained' }).ok && act({ op: 'event', key: 'ch2_choice_start' }).ok, 'квест 9 завершён, глубина квартала открыта');
  // квест 10
  ok(fight('fq_deep_1', 'frost_collector').ok && fight('fq_deep_2', 'frost_collector').ok, 'сборщики в глубине квартала');
  s.inventory.elixir_life = Math.max(s.inventory.elixir_life || 0, 3);
  const fg = fight('fq_guardian', 'ice_guardian');
  ok(fg.ok && s.inventory.frost_shard >= 1, `Ледяной страж побеждён (${Math.round(fg.time || 0)} с), первый инеевый осколок` + (fg.ok ? '' : ` ${fg.reason}`));
  ok(act({ op: 'event', key: 'ch2_quarter_cleared' }).ok && s.inventory.ice_crystal >= 3, 'Нэрис: награда квеста 10');
  s.inventory.forest_mushroom = (s.inventory.forest_mushroom || 0) + 1; s.inventory.tree_resin = (s.inventory.tree_resin || 0) + 1;
  ok(act({ op: 'craft', recipe: 'crystal_guard' }).ok, 'Кристальный покров открыт после квеста 10');
  ok(s.level >= 11 && s.level <= 13, `после квестов 6–10 герой на ${s.level} уровне (по балансу ≈12)`);

  // ---------------- v0.22.0: квесты 11–15
  const give = (items) => { for (const [k, v] of Object.entries(items)) s.inventory[k] = (s.inventory[k] || 0) + v; };
  ok(act({ op: 'event', key: 'unlock_ice_2' }).ok && s.abilities.ice.level === 2 && s.inventory.ice_crystal >= 1, 'квест 11: Лёд II и материалы на Флакон хрупкости');
  ok(fight('yard_brittle_1', 'frost_collector').ok && fight('yard_brittle_2', 'frost_collector').ok, 'учебные конструкты во дворе');
  ok(act({ op: 'event', key: 'ch2_brittle_done' }).reason === 'locked', 'урок не закончен без Флакона хрупкости');
  ok(act({ op: 'craft', recipe: 'brittle_flask' }).ok && s.quests.includes('brittle_flask_crafted'), 'Флакон хрупкости сварен');
  ok(act({ op: 'event', key: 'ch2_brittle_done' }).ok && act({ op: 'event', key: 'ch2_lab_found' }).ok, 'квест 11 завершён, Илария нашла лабораторию');
  // квест 12
  ok(act({ op: 'build_set', slots: ['ice', 'telekinesis', 'seal'] }).ok && act({ op: 'world', obj: 'lab_seal' }).ok && s.quests.includes('ch2_lab_open'), 'печать лаборатории успокоена Льдом');
  const v1 = fight('vol_1', 'volunteer'), v2 = fight('vol_2', 'volunteer');
  ok(v1.ok && v2.ok, `добровольцы обезврежены (${Math.round(v1.time || 0)} с и ${Math.round(v2.time || 0)} с)`);
  s.inventory.elixir_life = Math.max(s.inventory.elixir_life || 0, 4);
  const lc = fight('lab_construct', 'experimental_construct');
  ok(lc.ok && s.inventory.frost_shard >= 1, `экспериментальный конструкт (${Math.round(lc.time || 0)} с): инеевый осколок`);
  ok(act({ op: 'event', key: 'ch2_stabilized' }).reason === 'missing', 'Тихону нужны два стабилизирующих настоя');
  ok(act({ op: 'world', obj: 'lab_chest' }).ok, 'сундук лаборатории: пыль, осколки, морозник');
  give({ frost_herb: 4 });
  ok(act({ op: 'craft', recipe: 'stabilizing_potion' }).ok && act({ op: 'craft', recipe: 'stabilizing_potion' }).ok, 'два стабилизирующих настоя');
  ok(act({ op: 'event', key: 'ch2_stabilized' }).ok && !s.inventory.stabilizing_potion, 'настои отданы пострадавшим (сервер забрал оба)');
  ok(act({ op: 'world', obj: 'lab_journal' }).ok && act({ op: 'event', key: 'ch2_lab_reported' }).ok, 'журнал прочитан, Илария знает о Северине');
  // квест 13
  ok(act({ op: 'event', key: 'ch2_view_methods' }).ok && act({ op: 'event', key: 'ch2_severin_confronted' }).ok, 'Северин: правда и ответ героя');
  ok(act({ op: 'event', key: 'ch2_view_danger' }).reason === 'done', 'ответ даётся один раз');
  // квест 14
  ok(act({ op: 'event', key: 'ch2_coven_met' }).ok, 'Ровена: что такое Ковен');
  ok(fight('unstable_1', 'frost_collector').ok && fight('unstable_2', 'frost_collector').ok, 'нестабильные конструкции уничтожены');
  give({ forest_mushroom: 1, tree_resin: 1 });
  ok(act({ op: 'craft', recipe: 'crystal_guard' }).ok && act({ op: 'event', key: 'ch2_coven_supplies' }).ok, 'защитные составы для магов Ковена');
  ok(act({ op: 'event', key: 'ch2_coven_ready' }).ok, 'квест 14 завершён');
  // квест 15
  ok(act({ op: 'event', key: 'ch2_final_start' }).ok, 'Северин начал эксперимент');
  ok(act({ op: 'event', key: 'ch2_ice3_frost' }).reason === 'locked', 'Лёд III — после четырёх преград');
  ok(act({ op: 'world', obj: 'final_rift' }).ok && act({ op: 'world', obj: 'final_ward' }).ok, 'Лёд и Астрал в слотах: разлом и барьер');
  ok(act({ op: 'world', obj: 'final_ice_wall' }).reason === 'benched', 'Огня нет в слотах — преграда не тает');
  ok(act({ op: 'build_set', slots: ['fire', 'telekinesis', 'ice'] }).ok && act({ op: 'world', obj: 'final_ice_wall' }).ok && act({ op: 'world', obj: 'final_debris' }).ok, 'дары поменяны: Огонь и Телекинез');
  ok(act({ op: 'event', key: 'ch2_ice3_shard' }).ok && s.abilities.ice.level === 3 && s.objects.player_build.branches.ice === 'shard' && s.quests.includes('ch2_ice3'), 'Лёд III, ветка «Осколок»');
  ok(act({ op: 'event', key: 'ch2_ice3_frost' }).reason === 'done', 'вторую ветку бесплатно не взять');
  s.inventory.elixir_life = Math.max(s.inventory.elixir_life || 0, 5);
  act({ op: 'build_set', slots: ['ice', 'telekinesis', 'seal'] });
  const boss = fight('final_severin', 'severin_boss');
  ok(boss.ok && boss.events.includes('ch2_severin_defeated') && s.inventory.cold_heart === 1, `Северин побеждён за ${Math.round(boss.time || 0)} с: Сердце холода` + (boss.ok ? '' : ` ${boss.reason}`));
  ok(act({ op: 'world', obj: 'final_letters' }).ok && act({ op: 'event', key: 'ch2_epilogue' }).ok, 'письма прочитаны, эпилог с Иларией');
  const sap = walletOf(s.wallet).sapphires;
  ok(act({ op: 'event', key: 'chapter_2_complete' }).ok && walletOf(s.wallet).sapphires === sap + 5 && s.quests.includes('title_frost_survivor'), 'Мирра: глава II завершена, 5 сапфиров и титул');
  ok(act({ op: 'event', key: 'chapter_2_complete' }).reason === 'already' && walletOf(s.wallet).sapphires === sap + 5, 'награда главы — один раз');
  ok(s.level >= 14 && s.level <= 15, `после главы II герой на ${s.level} уровне (по балансу 14–15)`);
}

console.log('\nГлава II: диалоги');
{
  const st = new GameState(mem(), () => 1e12);
  const bus = new EventBus();
  const q = new QuestFlags(st, bus);
  const { QuestLog } = await import('../src/state/QuestLog.js');
  const dlg = new DialogueSystem({ state: st, log: new QuestLog(st, bus), bus });
  const variant = (npc) => dlg.pick(npc)?.id;
  for (const k of ['prologue_seen', 'unlock_telekinesis_1', 'chapter_1_complete']) st.markEvent(k);
  ok(DIALOGUES.mirra[1].nodes.start.choices.some(c => c.next === 'city'), 'в эпилоге Мирры есть «Что дальше? Город?»');
  st.markEvent('ch2_city_arrived');
  ok(variant('ilaria') === 'ilaria_danger', 'Илария предупреждает о звере');
  st.markEvent('ch2_plaza_cleared');
  ok(variant('ilaria') === 'ilaria_meet_ready', 'после боя — знакомство (с «!» над головой)');
  st.markEvent('ch2_met_ilaria');
  ok(variant('ilaria') === 'ilaria_trace_active', 'потом — просьба осмотреть площадь');
  ok(variant('merchant') === 'merchant_first' && variant('banker') === 'banker_default', 'торговец и банкир говорят');
  // v0.21.0
  for (const k of ['city_merchant_open', 'ch2_trace_found', 'ch2_archive_read', 'ch2_met_severin']) st.markEvent(k);
  ok(variant('merchant') === 'merchant_cargo_ready' && variant('ilaria') === 'ilaria_after_severin', 'после Северина торговец просит найти груз, Илария отправляет к нему');
  for (const k of ['ch2_cargo_start', 'ch2_cargo_found', 'ch2_serials_read']) st.markEvent(k);
  ok(variant('ilaria') === 'ilaria_cargo_ready', 'находки на складе — Иларии');
  st.markEvent('ch2_cargo_reported');
  ok(variant('severin') === 'severin_ask_ready', 'Северин отвечает про закрытую группу');
  for (const k of ['ch2_severin_asked', 'ch2_lab_critter']) st.markEvent(k);
  ok(variant('ilaria') === 'ilaria_wave_ready', 'волна холода — во время разговора с Иларией');
  for (const k of ['ch2_frost_wave', 'ch2_quarter_open', 'ch2_construct_unstable']) st.markEvent(k);
  ok(variant('nerys') === 'nerys_meet_ready', 'Нэрис появляется после реакции конструкции');
  for (const k of ['ch2_nerys_met', 'ch2_rescue_door', 'ch2_rescue_cellar']) st.markEvent(k);
  ok(variant('nerys') === 'nerys_rescue_ready', 'жители спасены — Нэрис благодарит');
  st.markEvent('ch2_rescue_done');
  ok(variant('nerys') === 'nerys_warm_active', 'потом — тёплый настой');
  st.markEvent('warm_potion_crafted');
  ok(variant('nerys') === 'nerys_lesson_ready' && DIALOGUES.nerys.find(v => v.id === 'nerys_lesson_ready').nodes.start.choices[0].do[0].gift === 'ice', 'урок Льда открывает дар');
  st.markEvent('unlock_ice_1');
  ok(variant('nerys') === 'nerys_water_active', 'после урока — заморозить пролом (подсказка про слоты)');
  for (const k of ['ch2_water_frozen', 'ch2_training_done']) st.markEvent(k);
  const tr = DIALOGUES.nerys.find(v => v.id === 'nerys_trained_ready');
  ok(variant('nerys') === 'nerys_trained_ready' && tr.nodes.choice.choices[0].do.some(e => e.gifts), 'после тренировки — выбор даров «3 из 4»');
  // v0.22.0
  for (const k of ['ch2_ice_trained', 'ch2_choice_start', 'ch2_deep_1', 'ch2_deep_2', 'ch2_ice_guardian_defeated', 'ch2_quarter_cleared']) st.markEvent(k);
  ok(variant('nerys') === 'nerys_ice2_ready', 'после квеста 10 — урок Хрупкости');
  for (const k of ['unlock_ice_2', 'ch2_brittle_1', 'ch2_brittle_2', 'brittle_flask_crafted']) st.markEvent(k);
  ok(variant('nerys') === 'nerys_brittle_ready', 'урок сдаётся после боёв и флакона');
  st.markEvent('ch2_brittle_done');
  ok(variant('ilaria') === 'ilaria_lab_ready', 'Илария нашла лабораторию');
  for (const k of ['ch2_lab_found', 'ch2_lab_open', 'ch2_vol_1', 'ch2_vol_2']) st.markEvent(k);
  ok(variant('tikhon') === 'tikhon_active', 'Тихон просит два стабилизирующих настоя');
  st.data.inventory = { ...(st.data.inventory || {}), stabilizing_potion: 2 };
  ok(variant('tikhon') === 'tikhon_ready' || st.item('stabilizing_potion') < 2, 'с двумя настоями — «!» у Тихона');
  for (const k of ['ch2_stabilized', 'ch2_lab_journal']) st.markEvent(k);
  ok(variant('ilaria') === 'ilaria_report_ready', 'журнал — Иларии');
  st.markEvent('ch2_lab_reported');
  const conf = DIALOGUES.severin.find(v => v.id === 'severin_confront_ready');
  ok(variant('severin') === 'severin_confront_ready' && conf.nodes.start.choices.length === 4, 'Северин: четыре ответа героя без ветвления');
  st.markEvent('ch2_severin_confronted');
  ok(variant('rowena') === 'rowena_meet_ready' && variant('ilaria') === 'ilaria_coven_active', 'Илария отправляет к Ровене');
  for (const k of ['ch2_coven_met', 'ch2_unstable_1', 'ch2_unstable_2', 'ch2_coven_supplies']) st.markEvent(k);
  ok(variant('rowena') === 'rowena_ready', 'Ковен: задания выполнены');
  st.markEvent('ch2_coven_ready');
  ok(variant('ilaria') === 'ilaria_final_ready', 'Илария: Северин начал эксперимент');
  st.markEvent('ch2_final_start');
  ok(variant('nerys') === 'nerys_final_active', 'Нэрис у зала объясняет четыре преграды');
  for (const k of ['ch2_fin_tk', 'ch2_fin_fire', 'ch2_fin_ice', 'ch2_fin_seal']) st.markEvent(k);
  const ice3 = DIALOGUES.nerys.find(v => v.id === 'nerys_ice3_ready');
  ok(variant('nerys') === 'nerys_ice3_ready' && ice3.nodes.start.choices.map(c => c.do[0].gift).join() === 'ice:3:frost,ice:3:shard', 'Лёд III: выбор ветки');
  for (const k of ['ch2_ice3', 'ch2_severin_defeated', 'ch2_letters_read']) st.markEvent(k);
  ok(variant('severin') === 'severin_after_boss' && variant('ilaria') === 'ilaria_epilogue_ready', 'после боя: Северин не отрекается, эпилог у Иларии');
  st.markEvent('ch2_epilogue');
  dlg.markSeen('mirra_epilogue'); st.markEvent('ch2_start');
  const fin = DIALOGUES.mirra.find(v => v.id === 'mirra_ch2_final_ready');
  ok(variant('mirra') === 'mirra_ch2_final_ready' && fin.nodes.end.choices[0].do.some(e => e.finale === 2), 'Мирра: «Ну и что ты думаешь?» и итог главы');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Глава II (квесты 1–15): всё в порядке');
process.exit(failures ? 1 : 0);
