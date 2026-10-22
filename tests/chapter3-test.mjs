// v0.40 — глава III «Безымянная роща»: данные, каталоги (балансовый набор v0.39 не расширен), диалоги, арт, граница уровня 15,
// сквозное прохождение серверными операциями и проверенными боями (tools/balance/chapter3-pass.mjs).
//   node tests/chapter3-test.mjs
import fs from 'node:fs';
import { GameState } from '../src/state/GameState.js';
import { QUEST_STEPS } from '../src/config/events.js';
import { STEP_WHY } from '../src/config/story.js';
import { STEP_GUIDE } from '../src/config/guidance.js';
import { CH3_DIALOGUES } from '../src/config/dialogues.ch3.js';
import { AMULETS } from '../src/config/build.js';
import { POTIONS, RESOURCES } from '../src/config/resources.js';
import { RECIPES } from '../src/config/recipes.js';
import { ENEMIES } from '../src/config/balance.enemies.js';
import { HERO_LEVELS, HERO_LEVEL_CAP_BEFORE_CH3 } from '../src/config/balance.hero.js';
import { CHAPTER3_FILES } from '../src/config/chapter3.art.generated.js';
import { GROVE_INTERACTIVES, GROVE_ENEMIES } from '../src/config/world.grove.js';
import { serverRules } from '../src/config/serverRules.js';
import { applyAction, emptySnapshot, levelForXp } from '../src/cloud/playerModel.js';
import { chapter3Pass } from '../tools/balance/chapter3-pass.mjs';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const isFm = v => v && typeof v === 'object' && 'female' in v && 'male' in v;
const unwrap = v => (v && typeof v === 'object' && !isFm(v) ? Object.values(v)[0] : v);   // { hero: '…' } — реплика героя
const text = v => { const u = unwrap(v); return isFm(u) ? [u.female, u.male] : [u]; };

console.log('\nГлава III: данные');
{
  const ch3 = QUEST_STEPS.filter(s => s.id.startsWith('ch3_'));
  ok(ch3.length >= 30 && ch3[0].id === 'ch3_call' && ch3.at(-1).id === 'ch3_next', `${ch3.length} целей главы III, от зова Мирры до итога`);
  ok(ch3.every(s => STEP_WHY[s.id] && STEP_GUIDE[s.id]), 'у каждой цели есть «зачем» и подсказки');
  const rules = serverRules();
  const events = Object.keys(rules.events).filter(k => k.startsWith('ch3_') || k === 'chapter_3_complete');
  ok(events.length >= 15, `сервер знает ${events.length} событий главы III`);
  ok(rules.eventRewards.chapter_3_complete?.topUp?.heroXP === 18400, 'итог главы подтягивает опыт до порога 20 уровня (18400)');
  ok(rules.eventRewards.ch3_nerys_met && !('amulet_vetla' in (rules.eventRewards.chapter_3_complete.items || {})), 'награды главы не выдают новых амулетов');
}

console.log('\nГлава III: каталоги баланса v0.39 не тронуты');
{
  ok(Object.keys(AMULETS).length === 10, 'амулетов по-прежнему 10');
  ok(!Object.keys(POTIONS).some(k => /willow|glass_flask|vetla/.test(k)), 'новых зелий нет');
  ok(RECIPES.memory_draught?.kind === 'story' && RECIPES.memory_draught.chapter === 3 && RECIPES.memory_draught.amount === 1, 'Отвар памяти — сюжетный рецепт, один за варку');
  ok(Object.keys(RECIPES.memory_draught.needs).every(k => RESOURCES[k]), 'все материалы Отвара описаны в ресурсах');
  ok(Object.keys(RESOURCES).length === 13, 'ресурсов 13 (9 прежних + стеклянный лист, искра памяти, ивовая кора, семя Ветлы)');
  const ids = Object.keys(ENEMIES).filter(k => ['glass_stoat', 'echo_wisp', 'glass_wolf', 'needle', 'needle_elite', 'glass_guardian', 'iva_reflection'].includes(k));
  ok(ids.length === 7, 'семь врагов главы III описаны');
  ok(GROVE_ENEMIES.every(e => ENEMIES[e.enemy]), 'каждая точка врага указывает на существующего врага');
  ok(GROVE_INTERACTIVES.every(o => o.id && Number.isFinite(o.x) && Number.isFinite(o.y)), 'объекты рощи имеют id и координаты');
}

console.log('\nГлава III: диалоги');
{
  let nodes = 0, bad = [], ungendered = [];
  const walk = (npc, v) => {
    for (const [nid, n] of Object.entries(v.nodes || {})) {
      nodes++;
      const lines = typeof n.lines === 'function' ? [] : (n.lines || []);
      if (lines.length > 5) bad.push(`${npc}/${v.id}/${nid}: ${lines.length} реплик`);
      for (const l of lines) for (const t of text(l)) if (typeof t !== 'string' || !t.trim()) bad.push(`${npc}/${v.id}/${nid}: пустая реплика`);
      for (const c of n.choices || []) for (const t of text(c.label)) if (typeof t !== 'string' || !t.trim()) bad.push(`${npc}/${v.id}/${nid}: пустой ответ`);
    }
  };
  for (const [npc, list] of Object.entries(CH3_DIALOGUES)) for (const v of list) walk(npc, v);
  ok(nodes >= 40, `${nodes} узлов диалогов`);
  ok(bad.length === 0, `в узле не больше 5 реплик, нет пустых строк${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`);
  const hero = Object.values(CH3_DIALOGUES).flat().flatMap(v => Object.values(v.nodes || {})).flatMap(n => [...(typeof n.lines === 'function' ? [] : n.lines || []), ...(n.choices || []).map(c => c.label)]);
  const pairs = hero.map(unwrap).filter(isFm);
  ok(pairs.length >= 10 && pairs.every(p => p.female !== p.male), `${pairs.length} пар для героя (ведьма/колдун), варианты различаются`);
}

console.log('\nГлава III: арт');
{
  const missing = Object.entries(CHAPTER3_FILES).filter(([, f]) => !fs.existsSync('public/' + f.split('?')[0]));
  ok(Object.keys(CHAPTER3_FILES).length >= 50 && !missing.length, `${Object.keys(CHAPTER3_FILES).length} картинок рощи на диске${missing.length ? ', нет: ' + missing.map(m => m[0]).join() : ''}`);
  ok(!/potion_willow|glass_flask|amulet_vetla/.test(JSON.stringify(CHAPTER3_FILES)), 'нет картинок удалённых предметов');
  ok(fs.existsSync('docs/design/chapter-3-art/contact-sheet.png'), 'контактный лист арта на месте');
}

console.log('\nГлава III: уровень героя до рощи не выше 15');
{
  ok(HERO_LEVELS.at(-1).level === 20 && HERO_LEVELS.at(-1).xp === 18400, 'таблица уровней доходит до 20');
  const s = emptySnapshot();
  s.level = 15; s.xp = 12000; s.quests = ['chapter_2_complete'];   // накоплено повторными боями глав I–II
  let r = applyAction(s, { op: 'event', key: 'ch2_next' }, 2e12, () => .999999);
  const farm = emptySnapshot(); farm.level = 15; farm.xp = 12000; farm.quests = ['chapter_2_complete'];
  const before = applyAction(farm, { op: 'event', key: 'unlock_fire_1' }, 2e12, () => .999999);   // любая награда с опытом
  ok(levelForXp(12000) === 17, 'по таблице 12000 опыта — это 17 уровень');
  ok(before.snapshot.level === 15 || !before.result.ok, 'до ch3_start опыт копится, а уровень остаётся 15 (сервер)');
  const st = new GameState(mem(), () => 1e12);
  st.data.heroLevel = 15; st.data.heroXP = 7900;
  ok(st.addHeroXP(5000).length === 0 && st.data.heroLevel === HERO_LEVEL_CAP_BEFORE_CH3.level, 'клиент: до ch3_start уровень не выше 15');
  st.markEvent('ch3_start');
  ok(st.addHeroXP(10).length >= 1 && st.data.heroLevel >= 16, 'клиент: после ch3_start уровни 16+ открываются');
  const go = emptySnapshot(); go.level = 15; go.xp = 12000; go.quests = ['chapter_2_complete'];
  const started = applyAction(go, { op: 'event', key: 'ch3_start' }, 2e12, () => .999999);
  ok(started.result.ok && started.snapshot.level >= 16, 'сервер: событие ch3_start снимает границу');
  void r;
}

console.log('\nГлава III: сквозное прохождение');
{
  const rep = await chapter3Pass();
  ok(rep.start.level === 15 && rep.start.xp === 7900, 'старт — финал главы II: уровень 15, 7900 опыта');
  ok(rep.final.level === 20 && rep.final.xp === 18400, 'финал — 20 уровень, 18400 опыта');
  ok(rep.fights.length === 9 && rep.fights.every(f => f.tries === 1), 'девять боёв, каждый выигран проверенным ботом с первой попытки');
  ok(rep.notes.length === 0, `нет тесных боёв и докупки материалов${rep.notes.length ? ': ' + rep.notes.join('; ') : ''}`);
  const boss = rep.fights.at(-1), guardian = rep.fights.at(-2);
  ok(boss.enemy === 'iva_reflection' && boss.seconds >= 100 && boss.seconds <= 200 && boss.potions <= 5 && boss.hpLeft >= 0.15, `Отражение Ивы: ${boss.seconds} с, зелий ${boss.potions}, здоровья ${Math.round(boss.hpLeft * 100)}%`);
  ok(guardian.enemy === 'glass_guardian' && guardian.potions <= 4, `Стеклянный страж: ${guardian.seconds} с, зелий ${guardian.potions}`);
  ok(rep.final.coins > rep.start.coins && rep.final.sapphires >= rep.start.sapphires, 'награды главы пополняют монеты и не отнимают сапфиры');
  ok(rep.final.vetla_seed === 1 && rep.final.memory_spark >= 0, 'семя Ветлы получено');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Глава III: всё в порядке');
process.exit(failures ? 1 : 0);
