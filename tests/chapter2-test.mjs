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
import { applyAction, emptySnapshot, toSnapshot, combatApply } from '../src/cloud/playerModel.js';
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
  ok(ch2.map(s => s.id).join() === 'ch2_road,ch2_plaza,ch2_ilaria,ch2_trace,ch2_tell,ch2_archive,ch2_severin,ch2_next', 'цепочка целей квестов 1–5');
  ok(ch2.every(s => STEP_WHY[s.id] && STEP_GUIDE[s.id]), 'у каждой цели есть «зачем» и подсказки');
  for (const id of ['ilaria', 'severin', 'merchant', 'banker', 'duelist']) ok(NPCS[id] && DIALOGUES[id]?.length && ASSETS?.[`npc_${id}`] !== undefined || fs.existsSync(`public/assets/sprites/npc_${id}.png`), `NPC ${NPCS[id]?.name}: данные, диалоги, спрайт`);
  for (const id of ['ilaria', 'severin', 'merchant', 'banker', 'duelist']) ok(fs.existsSync(`public/assets/sprites/portrait_${id}.png`), `портрет ${id}`);
  ok(WORLD.width === 3600 && ZONES.some(z => z.id === 'P') && ZONES.findIndex(z => z.id === 'AR') < ZONES.findIndex(z => z.id === 'P'), 'мир шире (город к востоку), зоны зданий проверяются раньше площади');
  const city = [...INTERACTIVES, ...ENEMY_SPAWNS].filter(o => o.x >= EAST_X);
  ok(city.length >= 12 && city.every(o => o.x < WORLD.width && o.y < WORLD.height), `в городе и на дороге ${city.length} объектов, все внутри мира`);
  ok(ENEMIES.frost_critter && fs.existsSync('public/assets/sprites/enemy_frost_critter.png') && ENEMIES.frost_critter.normalAttack.chill, 'Инеевый зверёк: данные, спрайт, холод');
  const t = INTERACTIVES.find(o => o.id === 'travel_to_city');
  ok(t.target === CITY_START && t.x < EAST_X && INTERACTIVES.find(o => o.id === 'travel_to_forest').target === FOREST_RETURN, 'указатели перехода: лес → дорога, дорога → лес');
  ok(ZONE_EVENTS.P.event === 'ch2_city_arrived', 'первый вход на площадь — событие «пришёл в город»');
}

console.log('\nГлава II: цели по ходу истории');
{
  const st = new GameState(mem(), () => 1e12);
  // шаги главы I здесь не проверяются (их тесты — run-tests.js): берём первую невыполненную из финала главы I и целей главы II
  const q = { currentStep: () => QUEST_STEPS.filter(x => x.id === 'end' || x.id.startsWith('ch2_')).find(x => !x.done(st)) };
  st.markEvent('chapter_1_complete');
  ok(q.currentStep().id === 'end', 'после главы I — финальная запись, пока не поговорили с Миррой');
  const seq = [['ch2_start', 'ch2_road'], ['ch2_city_arrived', 'ch2_plaza'], ['ch2_plaza_cleared', 'ch2_ilaria'], ['ch2_met_ilaria', 'ch2_trace'],
    ['ch2_trace_astral', 'ch2_trace'], ['ch2_trace_debris', 'ch2_tell'], ['ch2_trace_found', 'ch2_archive'], ['ch2_archive_read', 'ch2_severin'], ['ch2_met_severin', 'ch2_next']];
  let good = true;
  for (const [ev, want] of seq) { st.markEvent(ev); if (q.currentStep().id !== want) { good = false; console.log('   ', ev, '→', q.currentStep().id, 'ожидали', want); } }
  ok(good, 'цели идут по порядку: дорога → площадь → Илария → след → Архив → Северин');
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
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Глава II (квесты 1–5): всё в порядке');
process.exit(failures ? 1 : 0);
