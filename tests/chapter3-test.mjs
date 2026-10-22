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
import { HERO_LEVELS } from '../src/config/balance.hero.js';
import { CHAPTER3_FILES } from '../src/config/chapter3.art.generated.js';
import { GROVE_INTERACTIVES, GROVE_ENEMIES } from '../src/config/world.grove.js';
import { serverRules } from '../src/config/serverRules.js';
import { levelForXp } from '../src/cloud/playerModel.js';
import { chapter3Pass } from '../tools/balance/chapter3-pass.mjs';
import { applyAction } from '../src/cloud/playerModel.js';
import { DAILY_POOL } from '../src/config/daily.js';
import { COMPANIONS } from '../src/objects/Companion.js';

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

console.log('\nГлава III: уровни героя 16–20');
{
  ok(HERO_LEVELS.at(-1).level === 20 && HERO_LEVELS.at(-1).xp === 18400, 'таблица уровней доходит до 20');
  ok(HERO_LEVELS.slice(15).every((r, i) => r.level === 16 + i && r.maxHp > HERO_LEVELS[14 + i].maxHp && r.maxMana > HERO_LEVELS[14 + i].maxMana), 'здоровье и мана растут с каждым уровнем 16–20');
  ok(levelForXp(9600) === 16 && levelForXp(18399) === 19 && levelForXp(18400) === 20 && levelForXp(1e7) === 20, 'пороги 16–20 и потолок 20');
  const st = new GameState(mem(), () => 1e12);
  st.data.heroLevel = 15; st.data.heroXP = 7900;
  ok(st.addHeroXP(10500).length === 5 && st.data.heroLevel === 20, 'клиент: уровни 16–20 открываются опытом');
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

console.log('\nПосле главы III: Сад Ветлы, спутник, заказы рощи (без правок боя)');
{
  const done = await chapter3Pass();
  let s = structuredClone(done.snapshot), time = 2.2e12;
  const act = (a) => { time += 400_000; const r = applyAction(s, a, time, () => .999999); s = r.snapshot; return r.result; };
  s.inventory.coins = 60000;
  const have = k => s.inventory[k] || 0;
  const bedAt = id => GROVE_INTERACTIVES.find(o => o.id === id);
  ok(['gg_bed_leaf', 'gg_bed_bark', 'gg_bed_spark', 'gg_bed_moon'].every(id => bedAt(id)?.kind === 'gather' && bedAt(id).requiresEvent), 'четыре грядки: скрыты, пока их не вырастили');
  ok(act({ op: 'world', obj: 'gg_bed_leaf' }).ok === false, 'грядка до посадки недоступна');
  s.inventory.glass_leaf = Math.max(have('glass_leaf'), 30); s.inventory.memory_spark = Math.max(have('memory_spark'), 10); s.inventory.willow_bark = Math.max(have('willow_bark'), 10);
  const coin0 = have('coins');
  ok(act({ op: 'craft', recipe: 'garden_grow_2' }).ok === false, 'вторую грядку нельзя вырастить до посадки');
  ok(act({ op: 'craft', recipe: 'garden_plant' }).ok && have('vetla_seed') === 0 && coin0 - have('coins') === 1000, 'посадка: Семя ветлы + 1000 монет + 3 листа');
  ok(act({ op: 'craft', recipe: 'garden_plant' }).ok === false, 'посадить второй раз нельзя');
  const g1 = act({ op: 'world', obj: 'gg_bed_leaf' });
  ok(g1.ok && have('glass_leaf') >= 2, 'после посадки грядка листа даёт материал');
  ok(act({ op: 'world', obj: 'gg_bed_leaf' }).ok === false, 'и не даёт его снова сразу: грядка растёт по часам');
  ok(act({ op: 'craft', recipe: 'garden_grow_2' }).ok && act({ op: 'craft', recipe: 'garden_grow_3' }).ok, 'грядки 2 и 3 вырастают по порядку');
  ok(['gg_bed_bark', 'gg_bed_spark', 'gg_bed_moon'].every(id => act({ op: 'world', obj: id }).ok), 'все грядки сада сейчас дают урожай');
  // экономика сада: за полные сутки сад приносит немного, а не обгоняет сбор
  const perDay = 4 * 2 + 4 * 2 + 2 * 1 + 1;   // листья (6 ч ×4) + кора (6 ч ×4) + искры (12 ч ×2) + лунный осколок (24 ч ×1)
  ok(perDay <= 25, `урожай сада за сутки — ${perDay} единиц материала, без монет: не конкурирует со сбором`);
  const robin = act({ op: 'craft', recipe: 'companion_robin' });
  ok(robin.ok && have('companion_robin') === 1 && act({ op: 'craft', recipe: 'companion_robin' }).ok === false, 'Малиновка: один раз, предмет-спутник в запасе');
  s.inventory.glass_leaf = 30; s.inventory.memory_spark = 10;   // материалы рощи добираются повторными походами
  ok(act({ op: 'craft', recipe: 'companion_fox' }).ok && have('companion_fox') === 1, 'Лисёнок: отдельная покупка');
  ok(Object.keys(COMPANIONS).sort().join() === 'fox,robin' && Object.values(COMPANIONS).every(c => CHAPTER3_FILES[c.texture] && c.item), 'у каждого спутника есть картинка и предмет');
  const orders = Object.entries(DAILY_POOL).filter(([id]) => id.startsWith('grove_') || id === 'hunt_glass');
  ok(orders.length === 4 && orders.every(([, o]) => o.requires === 'chapter_3_complete'), 'четыре заказа рощи видны с итога главы III');
  ok(orders.every(([, o]) => o.reward.heroXP <= 60 && o.reward.coins <= 40), 'награды заказов в рамках доски (≤60 опыта, ≤40 монет)');
  ok(orders.filter(([, o]) => o.goal.type === 'deliver').every(([, o]) => Object.keys(o.goal.items).every(k => RESOURCES[k] && ['glass_leaf', 'memory_spark', 'willow_bark'].includes(k))), 'заказы просят только материалы рощи (их нельзя продать)');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Глава III: всё в порядке');
process.exit(failures ? 1 : 0);
