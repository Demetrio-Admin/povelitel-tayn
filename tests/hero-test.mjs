// v0.9.2 — ведьма и колдун: определения героев, resolver внешности и текстов, полнота парных реплик, совместимость
// сохранений и одинаковый баланс. Запуск: node --import ./tools/ui/register.mjs tests/hero-test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HEROES, heroById, isKnownHero, DEFAULT_HERO_ID, HERO_SHARED_TEXT, HERO_SAME_NOTE } from '../src/config/heroes.js';
import { ASSET_FILES, DISPLAY_SIZE, TEMPORARY_ART } from '../src/config/assets.manifest.js';
import { heroText, T, fm, isGendered, setHeroSource, currentHero, currentHeroId, genderOf } from '../src/state/hero.js';
import { GameState, createDefaultState } from '../src/state/GameState.js';
import { SAVE } from '../src/config/game.config.js';
import { DIALOGUES } from '../src/config/dialogues.js';
import { STORY, STEP_WHY, POTION_ROLE, COMBAT_TUTORIAL, COMBAT_HINTS } from '../src/config/story.js';
import { HERO_LINES } from '../src/config/guidance.js';
import { CONTENT_INTERACTIVES } from '../src/config/world.content.js';
import { DialogueSystem } from '../src/systems/DialogueSystem.js';
import { QuestLog } from '../src/state/QuestLog.js';
import { EventBus } from '../src/state/EventBus.js';
import { QuestFlags } from '../src/state/QuestFlags.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { CombatManager } from '../src/systems/CombatManager.js';
import { CombatTutorial } from '../src/systems/CombatTutorial.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failures++; console.log('  ✗', msg); } };
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };
const pngSize = (file) => { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }; };

console.log('\nОпределения героев');
{
  const w = heroById('witch'), m = heroById('warlock');
  ok(HEROES.length === 2 && w.id === 'witch' && m.id === 'warlock' && DEFAULT_HERO_ID === 'witch', 'два героя: witch (прежний id) и warlock');
  ok(w.gender === 'female' && w.name === 'Ведьма' && w.title === 'Ученица лесной ведьмы', 'ведьма: female, «Ведьма», «Ученица лесной ведьмы»');
  ok(m.gender === 'male' && m.name === 'Колдун' && m.title === 'Ученик лесной ведьмы', 'колдун: male, «Колдун», «Ученик лесной ведьмы»');
  ok(JSON.stringify(w.textures) === JSON.stringify({ down: 'hero_down', up: 'hero_up', side: 'hero_side' }) && JSON.stringify(m.textures) === JSON.stringify({ down: 'warlock_down', up: 'warlock_up', side: 'warlock_side' }), 'карта внешности — в одном месте (textures down/up/side)');
  ok(HEROES.every(h => Object.keys(h).every(k => ['id', 'gender', 'name', 'title', 'textures'].includes(k))), 'в героях нет способностей и характеристик (они общие, не копируются)');
  ok(HERO_SHARED_TEXT.includes('Телекинезом') && HERO_SAME_NOTE === 'Дары и характеристики одинаковые', 'общий текст о дарах и пояснение «Дары и характеристики одинаковые»');
  ok(heroById('druid').id === 'witch' && heroById(null).id === 'witch' && heroById(undefined).id === 'witch' && !isKnownHero('druid') && isKnownHero('warlock'), 'неизвестный / пустой id показывается ведьмой');
  for (const h of HEROES) {
    const files = Object.values(h.textures).map(k => ASSET_FILES[k]);
    ok(files.every(Boolean) && Object.values(h.textures).every(k => DISPLAY_SIZE[k]?.join() === '64,128'), `${h.name}: все ракурсы в manifest, размер на экране общий`);
    const sizes = files.map(f => pngSize(path.join(ROOT, 'public', f)));
    ok(sizes.every(s => s.w === 166 && s.h === 240 && s.colorType === 6), `${h.name}: PNG 166×240 RGBA (одинаковый холст — общий масштаб, ноги и hitbox)`);
  }
  if (TEMPORARY_ART.length) console.log(`  ⚠ ВРЕМЕННАЯ графика (не для релиза): ${TEMPORARY_ART.join(', ')} — см. config/assets.manifest.js`);
  ok(TEMPORARY_ART.every(k => ASSET_FILES[k]), 'временная графика отмечена в manifest (TEMPORARY_ART) и загружается');
}

console.log('\nТексты: resolver');
{
  ok(heroText('Вы победили', 'warlock') === 'Вы победили', 'обычная строка общая');
  const p = fm('Поняла.', 'Понял.');
  ok(heroText(p, 'witch') === 'Поняла.' && heroText(p, 'warlock') === 'Понял.' && heroText(p, heroById('warlock')) === 'Понял.' && heroText(p, 'male') === 'Понял.', 'пара по id, определению героя или полу');
  ok(heroText(p, 'druid') === 'Поняла.', 'неизвестный герой — женский (исходный) текст');
  ok(heroText((n) => fm(`Нашла ${n}`, `Нашёл ${n}`), 'warlock', 3) === 'Нашёл 3' && heroText((n) => `x${n}`, 'witch', 2) === 'x2', 'функция текста с параметрами проходит через тот же механизм');
  ok(heroText({ female: 'а' }, 'warlock') === 'а' && heroText({ female: 'а', male: '' }, 'warlock') === 'а', 'нет мужского варианта — не пустая строка');
  setHeroSource(() => 'warlock');
  ok(currentHeroId() === 'warlock' && currentHero().name === 'Колдун' && T(p) === 'Понял.', 'текущий герой из источника (сессия / сохранение)');
  setHeroSource(() => 'druid');
  ok(currentHeroId() === 'druid' && currentHero().id === 'witch' && genderOf(currentHero()) === 'female', 'неизвестный id: показ ведьмой, сам id не меняется');
  setHeroSource(() => { throw new Error('boom'); });
  ok(currentHeroId() === 'witch', 'сбой источника — ведьма, без исключения');
  setHeroSource(() => 'witch');
}

console.log('\nТексты: полнота пар и обращения');
{
  const pairs = [], plain = [];
  const walk = (v, where) => {
    if (isGendered(v)) { pairs.push({ v, where }); return; }
    if (typeof v === 'string') { plain.push({ s: v, where }); return; }
    if (typeof v === 'function') return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'when') walk(x, `${where}.${k}`);
  };
  walk(DIALOGUES, 'DIALOGUES'); walk({ STORY, STEP_WHY, POTION_ROLE, COMBAT_TUTORIAL, COMBAT_HINTS }, 'story'); walk(HERO_LINES, 'HERO_LINES');
  walk(CONTENT_INTERACTIVES.map(o => ({ id: o.id, lines: o.lines, hint: o.hint, first: o.first })), 'content');
  walk(STORY.manaShortHelp(true), 'manaShortHelp'); walk(STORY.manaShortHelp(false), 'manaShortHelp');
  const bad = pairs.filter(({ v }) => !v.female || !v.male || v.female === v.male || typeof v.female !== 'string' || typeof v.male !== 'string');
  ok(pairs.length >= 15 && !bad.length, `все пары полные и различаются (${pairs.length} пар)` + (bad.length ? ': ' + bad.map(b => b.where).join(', ') : ''));
  // женские обращения к герою / ответы героя не должны остаться общими строками
  const FEM = /(Поняла|принесла|нашла|заслужила|Проснулась|Вернулась|ведьмочка|помощница|Ты не одна|должна искать|героин[яиеую]|Ты цела|отдохни, ведьма|носила другая ведьма|милая)/;
  const leaks = plain.filter(p => FEM.test(p.s));
  ok(!leaks.length, 'нет общих строк с женским обращением к герою' + (leaks.length ? ': ' + leaks.map(l => `${l.where}: «${l.s}»`).join('; ') : ''));
  const MALE = /(Понял\b|принёс|нашёл|заслужил\b|Проснулся|Вернулся|колдун|помощник|не один|должен искать|Герой атакует|здоровье героя|Ты цел,)/;
  ok(pairs.every(({ v }) => !FEM.test(v.male)), 'в мужских вариантах нет женских форм');
  ok(pairs.filter(({ v }) => MALE.test(v.male)).length >= 12, 'мужские варианты действительно в мужском роде');
  // таблица ТЗ
  const all = pairs.map(p => p.v);
  const has = (f, m) => all.some(v => v.female.includes(f) && v.male.includes(m));
  ok(has('Поняла.', 'Понял.') && has('Ты принесла травы!', 'Ты принёс травы!') && has('Золото, а не помощница.', 'Золото, а не помощник.') && has('Сколько уже нашла?', 'Сколько уже нашёл?') && has('Эй, ведьмочка!', 'Эй, колдун!'),
    'таблица обращений ТЗ: «Поняла/Понял», Веда, Горан');
  ok(has('Героиня атакует сама. Вы помогаете ей магией и предметами.', 'Герой атакует сам. Вы помогаете ему магией и предметами.'), 'обучение боя: «Героиня атакует сама…» / «Герой атакует сам…»');
  // женская речь NPC о себе остаётся женской при любом герое
  const flat = plain.map(p => p.s).join('\n');
  ok(['Я бы на твоём месте занялась', 'я и сама подлечу', 'Я не видела его'].every(t => flat.includes(t)), 'Мирра говорит о себе в женском роде при любом герое («занялась», «сама подлечу», «не видела»)');
}

console.log('\nДиалоги: одинаковый маршрут, разные обращения');
{
  const run = (heroId) => {
    setHeroSource(() => heroId);
    const state = new GameState(null); const bus = new EventBus();
    const log = new QuestLog(state, bus);
    const d = new DialogueSystem({ state, log, bus, goalText: () => 'цель' });
    const texts = [], events = [];
    bus.on('quest:changed', () => events.push([...state.data.completedEvents].join(',')));
    d.start('mirra');
    for (let i = 0; i < 20 && d.active; i++) {
      const v = d.view(); texts.push(v.text);
      if (v.choices) { texts.push(...v.choices.map(c => c.label)); d.choose(v.choices.length - 1); } else d.advance();
    }
    state.data.completedEvents.push('unlock_telekinesis_1', 'first_world_interaction');
    d.start('veda');
    const v2 = d.view(); texts.push(v2.text);
    return { texts, events: [...state.data.completedEvents], tutorial: [...state.data.tutorial] };
  };
  const w = run('witch'), m = run('warlock');
  ok(JSON.stringify(w.events) === JSON.stringify(m.events) && JSON.stringify(w.tutorial) === JSON.stringify(m.tutorial), 'те же события и одноразовые отметки для обоих героев');
  ok(w.texts.some(t => t.startsWith('Проснулась?')) && m.texts.some(t => t.startsWith('Проснулся?')) && w.texts.includes('Что я должна искать?') && m.texts.includes('Что я должен искать?'), 'вступление Мирры: «Проснулась?/Проснулся?», «должна/должен»');
  ok(w.texts.length === m.texts.length && w.texts.every(t => !t.includes('[object')) && m.texts.every(t => !t.includes('[object')), 'одинаковое число реплик, без «[object Object]»');
  setHeroSource(() => 'warlock');
  const st = new GameState(null); st.data.completedEvents.push('prologue_seen', 'unlock_telekinesis_1', 'first_world_interaction'); st.addItem('moon_herb', 2);
  const d2 = new DialogueSystem({ state: st, log: new QuestLog(st, new EventBus()), bus: new EventBus(), goalText: () => 'к алтарю' });
  ok(d2.fmt(fm('Сейчас {n:moon_herb} из 3. {goal}', 'Сейчас у тебя {n:moon_herb} из 3. {goal}')) === 'Сейчас у тебя 2 из 3. к алтарю', 'вариант разрешается до подстановок {n:…} и {goal}');
  ok(d2.fmt({ hero: fm('Я готова.', 'Я готов.') }) === 'Вы: «Я готов.»', 'реплика героя тоже может иметь варианты');
  setHeroSource(() => 'witch');
}

console.log('\nОбучение первого боя: текст по герою, шаги общие');
{
  const mk = (heroId) => {
    setHeroSource(() => heroId);
    const state = new GameState(null); const bus = new EventBus(); const quests = new QuestFlags(state, bus); const abilities = new AbilitySystem(state, quests, bus);
    abilities.unlock('telekinesis', 1);
    const cm = new CombatManager({ enemyType: 'forest_scavenger', state, abilities });
    return new CombatTutorial({ state, settings: { get: () => true }, spawnId: 'scavenger_01', cm }).view();
  };
  const w = mk('witch'), m = mk('warlock');
  ok(w.step === 'intro' && m.step === 'intro' && w.text.startsWith('Героиня атакует сама') && m.text.startsWith('Герой атакует сам'), 'шаг intro: «Героиня атакует сама…» / «Герой атакует сам…»');
  setHeroSource(() => 'witch');
}

console.log('\nСохранения без сервера');
{
  ok(createDefaultState().heroId === 'witch' && createDefaultState('warlock').heroId === 'warlock', 'новое состояние: ведьма по умолчанию, выбранный герой — по аргументу');
  // старое сохранение v0.9.0 без heroId → ведьма, ресурсы, квесты и прогресс на месте
  const store = memStorage();
  const old = createDefaultState(); delete old.heroId;
  Object.assign(old, { heroLevel: 3, heroXP: 240, completedEvents: ['prologue_seen', 'unlock_telekinesis_1', 'combat_intro_01'], inventory: { coins: 42, lunar_shard: 2, lunar_flame: 0, moon_herb: 3 }, hp: 77, mana: 31 });
  store.setItem(SAVE.key, JSON.stringify(old));
  store.setItem('witch_rpg_settings_v1', JSON.stringify({ hints: false, music: 0.3 }));
  const s1 = new GameState(store); ok(s1.load(), 'старое сохранение загружается');
  ok(s1.data.heroId === 'witch' && s1.data.heroLevel === 3 && s1.item('coins') === 42 && s1.item('moon_herb') === 3 && s1.hasEvent('combat_intro_01') && s1.data.hp === 77 && s1.data.mana === 31,
    'старое сохранение без heroId — ведьма; уровень, ресурсы, события, HP и мана сохранены');
  ok(store.getItem('witch_rpg_settings_v1') === JSON.stringify({ hints: false, music: 0.3 }), 'настройки не тронуты');
  // новая игра колдуном: выбор переживает перезагрузку
  s1.reset('warlock'); s1.save();
  const s2 = new GameState(store); s2.load();
  ok(s2.data.heroId === 'warlock' && s2.data.heroLevel === 1 && s2.item('coins') === 0, 'новая игра колдуном — после перезагрузки колдун с нуля');
  s2.addItem('coins', 5); s2.save();
  const s3 = new GameState(store); s3.load();
  ok(s3.data.heroId === 'warlock' && s3.item('coins') === 5, 'round-trip: колдун и прогресс сохраняются вместе');
  // неизвестный id в локальном сохранении — не переписывается
  const raw = JSON.parse(store.getItem(SAVE.key)); raw.heroId = 'druid'; store.setItem(SAVE.key, JSON.stringify(raw));
  const s4 = new GameState(store); s4.load(); s4.addItem('coins', 1); s4.save();
  ok(JSON.parse(store.getItem(SAVE.key)).heroId === 'druid' && heroById(s4.data.heroId).id === 'witch', 'неизвестный id: показ ведьмой, значение в сохранении не переписано');
  s4.reset();
  ok(s4.data.heroId === 'witch', 'reset без героя — ведьма');
}

console.log('\nResetProgress без сервера (services)');
{
  const { services, resetProgress, heroIdNow } = await import('../src/services.js');
  const prev = { state: services.state, session: services.session };
  services.state = new GameState(memStorage()); services.session = null;
  services.state.reset('witch'); services.state.addItem('coins', 9); services.state.save();
  await resetProgress('warlock');
  const again = new GameState(services.state.storage); again.load();
  ok(services.state.data.heroId === 'warlock' && again.data.heroId === 'warlock' && heroIdNow() === 'warlock' && T(fm('a', 'b')) === 'b', 'локальная новая игра колдуном: героя не теряем (раньше аргумент игнорировался), выбор сохранён');
  services.state.addItem('coins', 3); services.state.save();
  await resetProgress();
  ok(services.state.data.heroId === 'warlock' && services.state.item('coins') === 0, '«Сбросить прогресс» без выбора — прежний герой');
  Object.assign(services, prev);
}

console.log('\nБаланс одинаковый');
{
  const sim = (heroId) => {
    const state = new GameState(null); state.data.heroId = heroId;
    const bus = new EventBus(); const quests = new QuestFlags(state, bus); const abilities = new AbilitySystem(state, quests, bus);
    abilities.unlock('telekinesis', 2); abilities.unlock('fire', 1);
    let seed = 7; const orig = Math.random; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    try {
      const cm = new CombatManager({ enemyType: 'forest_guardian', state, abilities });
      let t = 0;
      while (!cm.result && t < 300) {
        if (cm.enemy.isPreparing && cm.abilityState('telekinesis').state === 'ready') cm.useAbility('telekinesis');
        else if (cm.abilityState('fire').state === 'ready') cm.useAbility('fire');
        cm.tick(0.1); cm.drainEvents(); t += 0.1;
      }
      return { stats: JSON.stringify(state.heroStats()), result: cm.result, t: Math.round(t * 10), hp: Math.round(cm.hero.hp), mana: Math.round(cm.hero.mana), enemy: Math.round(cm.enemy.hp) };
    } finally { Math.random = orig; }
  };
  const w = sim('witch'), m = sim('warlock');
  ok(w.stats === m.stats, 'характеристики героя одинаковые (heroStats)');
  ok(JSON.stringify(w) === JSON.stringify(m), `одинаковый бой при одинаковом состоянии: ${w.result}, ${w.t / 10} с, HP ${w.hp}, мана ${w.mana}`);
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Тесты героев пройдены');
process.exit(failures ? 1 : 0);
