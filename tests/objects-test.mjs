// Объекты мира v0.8 (сбор, NPC, котёл, осмотр) на заглушке сцены: создание, взаимодействие, возобновление, награды.
// НЕ проверяет рисунок и анимации в живом Phaser — только логику и отсутствие падений.
// Запуск: node --import ./tools/ui/register.mjs tests/objects-test.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import { setupStage, freshWorld } from '../tools/ui/stage.mjs';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctxStub = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
await setupStage({ createCanvas: (w, h) => ({ width: w, height: h, getContext: () => ctxStub() }), loadImage: async () => ({ width: 64, height: 64 }), root: ROOT });

// «Игровой объект»: хранит базовые поля, любой другой вызов — цепочка (возвращает себя), tweens/time выполняются сразу
function go(x = 0, y = 0) {
  const o = { x, y, scaleX: 1, scaleY: 1, displayWidth: 60, displayHeight: 60, alpha: 1, active: true, visible: true, depth: 0, angle: 0, text: '', body: { updateFromGameObject() {}, setSize() {} } };
  const p = new Proxy(o, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === 'then') return undefined;
      if (k === 'setPosition') return (a, b) => { t.x = a; t.y = b ?? t.y; return p; };
      if (k === 'setAlpha') return (a) => { t.alpha = a; return p; };
      if (k === 'setVisible') return (v) => { t.visible = v; return p; };
      if (k === 'setText') return (v) => { t.text = v; return p; };
      if (k === 'setDisplaySize') return (w, h) => { t.displayWidth = w; t.displayHeight = h; return p; };
      if (k === 'destroy') return () => { t.active = false; };
      return () => p;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return p;
}
const calls = { burst: 0, float: 0, say: [], delayed: [] };
function mkScene() {
  const sc = {
    add: new Proxy({}, { get: () => (x, y) => go(x, y) }),
    tweens: { add: (c) => { c.onComplete?.(); return {}; }, killTweensOf() {} },
    time: { now: 0, delayedCall: (ms, fn) => { calls.delayed.push([ms, fn]); return {}; }, addEvent: () => ({}) },
    player: { x: 0, y: 0, castAt() { calls.cast = (calls.cast || 0) + 1; }, face() {}, },
    addBlocker: () => go(), addGlow: () => go(), burst: () => { calls.burst++; }, twinkle() {}, sparkleShower() {}, floatIcon: () => { calls.float++; }, floatText() {},
    heroSay: (t) => calls.say.push(t), events: { on() {}, once() {} },
  };
  return sc;
}
// v0.13.0: действия в мире идут через сервер (здесь — режим без сервера, то же правило на JS): ждём ответ, потом анимация
const settle = () => new Promise(r => setTimeout(r, 5));
const runDelayed = () => { const l = calls.delayed.splice(0); l.forEach(([, fn]) => fn()); };

console.log('Объекты мира v0.8');
const sv = await freshWorld('mid');
sv.audio = { play() {}, unlock() {}, install() {} };
const { GatherObject } = await import('../src/objects/GatherObject.js');
const { NpcObject } = await import('../src/objects/NpcObject.js');
const { AlchemyObject } = await import('../src/objects/AlchemyObject.js');
const { InspectObject } = await import('../src/objects/InspectObject.js');
const { CONTENT_INTERACTIVES } = await import('../src/config/world.content.js');
const { bus, MSG } = await import('../src/state/EventBus.js');
const CLS = { gather: GatherObject, npc: NpcObject, alchemy: AlchemyObject, inspect: InspectObject };

// --- каждый объект v0.8 создаётся без ошибок и обновляется
{
  const sc = mkScene(); let err = null; const made = [];
  try {
    for (const c of CONTENT_INTERACTIVES.filter(c => CLS[c.kind])) { const o = new CLS[c.kind](sc, c); o.refresh(); o.update?.(0.016, sc.player); made.push(o); }
  } catch (e) { err = e; }
  ok(!err && made.length > 20, `созданы и обновлены ${made.length} объектов v0.8` + (err ? ': ' + err.stack.split('\n').slice(0, 4).join(' | ') : ''));
}

// --- сбор: ресурс в сумке, FX, событие, возобновление
{
  const sc = mkScene(); calls.burst = 0; calls.float = 0;
  const cfg = CONTENT_INTERACTIVES.find(c => c.id === 'herb_g1');
  let t = 0; sv.state.now = () => t;
  const g = new GatherObject(sc, cfg);
  let gathered = null; bus.on(MSG.GATHERED, (e) => { gathered = e; });
  const before = sv.state.item('moon_herb');
  ok(g.isAvailable(), 'трава доступна для сбора');
  await g.interact(null);
  ok(g.busy && calls.cast === 1, 'сбор: героиня наклоняется (поза gather), объект занят');
  ok(sv.state.item('moon_herb') === before + 1 && sv.state.getObject('herb_g1')?.state === 'picked' && !gathered, 'v0.13.0: ресурс выдан и состояние записано сервером до анимации, показ — позже');
  runDelayed();
  ok(sv.state.item('moon_herb') === before + 1 && gathered?.item === 'moon_herb', 'сбор: +1 лунная трава, событие GATHERED');
  ok(calls.burst >= 2 && calls.float === 1, 'сбор: искры и всплывающая иконка');
  ok(!g.isAvailable(), 'собранная трава недоступна');
  t += (cfg.respawnSec - 5) * 1000; g.refresh();
  ok(!g.isAvailable(), 'до срока возобновления трава не растёт');
  t += 10 * 1000; g.update(0.5, sc.player); g.refresh();
  ok(g.isAvailable(), 'через respawnSec трава снова доступна');
}

// --- осмотр с наградой «первый раз»
{
  const sc = mkScene(); calls.say = [];
  const cfg = CONTENT_INTERACTIVES.find(c => c.id === 'house_trunk');
  const o = new InspectObject(sc, cfg);
  const m0 = sv.state.item('forest_mushroom');
  o.interact(); await settle(); runDelayed();
  ok(sv.state.item('forest_mushroom') === m0 + 1 && sv.state.item('tree_resin') >= 1, 'сундук в доме: первый осмотр даёт гриб и смолу');
  o.interact(); await settle(); runDelayed();
  ok(sv.state.item('forest_mushroom') === m0 + 1, 'сундук в доме: награда только один раз');
  const bed = new InspectObject(sc, CONTENT_INTERACTIVES.find(c => c.id === 'house_bed'));
  calls.say = []; bed.interact(); bed.interact(); bed.interact();
  ok(calls.say.length === 3 && calls.say[0] !== calls.say[1], 'описания интерьера идут по кругу');
}

// --- NPC: диалог, значок, разворот
{
  const sc = mkScene();
  const v = new NpcObject(sc, CONTENT_INTERACTIVES.find(c => c.id === 'npc_veda'));
  v.refresh(); v.interact();
  ok(sv.dialogue.active && v.talking, 'NPC: нажатие открывает диалог');
  sv.dialogue.cancel(); v.onTalkEnd();
  ok(!sv.dialogue.active && !v.talking && !v.busy, 'NPC: после диалога снова доступен');
}

// --- котёл
{
  const sc = mkScene(); let opened = 0; bus.on(MSG.OPEN_ALCHEMY, () => opened++);
  const c = new AlchemyObject(sc, CONTENT_INTERACTIVES.find(c => c.id === 'house_cauldron'));
  c.interact(); runDelayed();
  ok(opened === 1, 'котёл: открывает окно алхимии');
  c.celebrate(0x8fe39a);
}

// --- v0.9: мана за действия в мире — ровно один раз, неуспешное бесплатно, ввод любым способом
{
  const vitals = await import('../src/state/vitals.js');
  const { TelekinesisObject } = await import('../src/objects/TelekinesisObject.js');
  const { FireObject } = await import('../src/objects/FireObject.js');
  const { INTERACTIVES } = await import('../src/config/world.layout.js');
  const { InteractionSystem } = await import('../src/systems/InteractionSystem.js');
  const st = sv.state;
  const shorts = [], spent = [];
  const mkSc = () => { const sc = mkScene(); sc.onManaShort = (c) => shorts.push(c); sc.onManaSpent = (c) => spent.push(c); sc.castFx = () => {}; sc.toast = () => {}; sc.panTo = () => {}; sc.spawnPickup = () => null;
    sc.tweens.chain = (c) => { c.onComplete?.(); return {}; }; sc.cameras = { main: { shake() {} } }; sc.time.delayedCall = (ms, fn) => { calls.delayed.push([ms, fn]); return {}; }; return sc; };
  let t = 1e9; st.now = () => t;
  const setM = (v) => { vitals.setMana(st, v); st.data.vitalsClock = t; };   // без восстановления по времени между шагами
  // сбор: 4 маны один раз; второй тап по занятому узлу — бесплатно
  const herb = new GatherObject(mkSc(), CONTENT_INTERACTIVES.find(c => c.id === 'herb_g2'));
  setM(50);
  herb.interact(null); herb.interact(null); await settle(); runDelayed();
  ok(Math.abs(vitals.mana(st) - 46) < 1e-9 && spent.length === 1, 'сбор: −4 маны ровно один раз, повторный тап по занятому узлу бесплатен');
  herb.interact(null); await settle();
  ok(Math.abs(vitals.mana(st) - 46) < 1e-9, 'собранный узел: ничего не списано');
  // нехватка маны: ничего не выдаётся и не списывается
  const herb2 = new GatherObject(mkSc(), CONTENT_INTERACTIVES.find(c => c.id === 'herb_g3'));
  setM(3); const m0 = st.item('moon_herb');
  herb2.interact(null); await settle(); runDelayed();
  ok(vitals.mana(st) === 3 && st.item('moon_herb') === m0 && shorts.at(-1) === 4 && !herb2.busy, 'не хватает маны: предмет не выдан, мана не списана, есть объяснение');
  // Телекинез: средний камень 12, неверный дар бесплатно, слишком тяжёлое бесплатно
  sv.abilities.unlock('telekinesis', 1);
  const rock = new TelekinesisObject(mkSc(), INTERACTIVES.find(c => c.id === 'glade_rock'));
  setM(50);
  rock.interact('fire'); await settle();
  ok(vitals.mana(st) === 50, 'неверный дар (Огонь на камень): мана не списана');
  ok(rock.manaCost() === 12, 'цена видна заранее: «Сдвинуть · 12 маны»');
  await rock.interact('telekinesis');
  ok(vitals.mana(st) === 38 && rock.isDone(), 'сдвиг среднего камня: −12 маны (списал сервер)');
  const boulder = new TelekinesisObject(mkSc(), INTERACTIVES.find(c => c.id === 'heavy_boulder'));
  boulder.interact('telekinesis'); await settle();
  ok(vitals.mana(st) === 38 && boulder.manaCost() === 0, 'слишком тяжёлая глыба (Телекинез I): бесплатно, цена не показывается');
  const flame = new TelekinesisObject(mkSc(), INTERACTIVES.find(c => c.id === 'moon_plant'));
  ok(flame.manaCost() === 4, 'притянуть растение — 4 маны');
  // Огонь: 16, пока дар не открыт — бесплатно
  const bramble = new FireObject(mkSc(), CONTENT_INTERACTIVES.find(c => c.id === 'bramble_t1'));
  bramble.interact('fire'); await settle();
  ok(vitals.mana(st) === 38, 'Огонь не открыт: бесплатно');
  sv.abilities.unlock('fire', 1);
  bramble.interact('fire'); bramble.interact('fire'); await settle(); runDelayed();
  ok(vitals.mana(st) === 22, 'Огонь по зарослям: −16 маны один раз (повторное нажатие не платит)');
  // разные способы ввода — одна цена: контекстная кнопка (act(null)) и кнопка дара (act('telekinesis'))
  const sc2 = mkSc();
  const isys = new InteractionSystem(sc2, bus);
  const stoneCfg = INTERACTIVES.find(c => c.id === 'altar_stone');
  const r1 = new TelekinesisObject(sc2, stoneCfg);
  setM(100);
  isys.focus = r1; isys.act(null); await settle(); const a1 = 100 - vitals.mana(st);
  delete st.data.worldObjects.altar_stone;   // тот же камень «заново» (его сдвиг — состояние устройства)
  const r2 = new TelekinesisObject(sc2, stoneCfg);
  isys.focus = r2; isys.act('telekinesis'); await settle(); const a2 = 100 - a1 - vitals.mana(st);
  ok(a1 === 12 && a2 === 12, `кнопка действия и кнопка дара платят одинаково (${a1} / ${a2})`);
}

// --- v0.9: враг после поражения не нападает сам, «Сразиться снова» запускает ровно один бой
{
  const { EnemyTrigger, encKey } = await import('../src/objects/EnemyTrigger.js');
  const { ENEMY_SPAWNS } = await import('../src/config/world.layout.js');
  const st = sv.state;
  const cfg = ENEMY_SPAWNS.find(e => e.id === 'scavenger_01');
  let started = 0, dialogs = [];
  const sc = mkScene();
  Object.assign(sc, { inTransition: false, canAct: () => true, startCombat: () => { started++; sc.inTransition = true; }, dialog: (o) => dialogs.push(o) });
  const e = new EnemyTrigger(sc, cfg);
  const near = { x: cfg.x, y: cfg.y };
  ok(e.update(0.1, near), 'новый враг: близость запускает бой (как раньше)');
  st.setObject(encKey(cfg.id), { state: 'lost', x: cfg.x, y: cfg.y + 40 });
  let auto = false; for (let i = 0; i < 600; i++) auto = auto || e.update(0.1, near);
  ok(!auto, 'после поражения: стоя рядом 60 с, бой сам не начинается');
  const e2 = new EnemyTrigger(sc, cfg);   // «перезагрузка»: состояние из сохранения
  ok(e2.awaitingRetry && !e2.update(0.1, near) && e2.label === 'Сразиться снова', 'после перезагрузки правило сохраняется, кнопка «Сразиться снова»');
  const vitals = await import('../src/state/vitals.js');
  vitals.setHp(st, vitals.maxHp(st));
  e2.interact(); e2.interact();
  ok(started === 1, 'нажатие запускает ровно один бой (повторное — нет)');
  sc.inTransition = false; started = 0;
  vitals.setHp(st, 10);
  e2.interact();
  ok(started === 0 && dialogs.length === 1 && /10 \//.test(dialogs[0].text), 'HP ниже 40%: сначала предупреждение с текущим HP');
  dialogs[0].buttons.find(b => b.label === 'Всё равно сразиться').onClick();
  ok(started === 1, '«Всё равно сразиться» начинает бой');
  delete st.data.worldObjects[encKey(cfg.id)];
}


console.log('\nПервая глава v0.10.0: алтарь, ворота, Астрал, запас пыли, сердце рощи, возобновляемые враги');
{
  const st = sv.state;
  const vitals = await import('../src/state/vitals.js');
  const { AltarObject } = await import('../src/objects/InteractiveObject.js');
  const { GateObject, SealSigilObject, DustStashObject, ForestNodeObject } = await import('../src/objects/ChapterObjects.js');
  const { EnemyTrigger, enemyDownNow, recordRepeatWin, repKey } = await import('../src/objects/EnemyTrigger.js');
  const { INTERACTIVES, ENEMY_SPAWNS } = await import('../src/config/world.layout.js');
  const cfgOf = (id) => INTERACTIVES.find(c => c.id === id);
  const toasts = [], dialogs = [];
  const mk = () => Object.assign(mkScene(), { toast: (t) => toasts.push(t), dialog: (o) => dialogs.push(o), castFx() {}, panTo() {}, refreshAll() {}, onManaShort: (c) => toasts.push(`мана ${c}`), enemies: [] });
  sv.actions.bus = bus;
  let t = 1_000_000; st.now = () => t;
  const setM = (v) => { vitals.setMana(st, v); st.data.vitalsClock = t; };

  // --- алтарь: фитиль, а не сырые огоньки
  st.markEvent('lunar_quest_start');
  Object.assign(st.data.inventory, { lunar_flame: 3, moon_herb: 1, tree_resin: 1, rune_dust: 1 });
  const altar = new AltarObject(mk(), cfgOf('lunar_altar'));
  altar.interact();
  ok(!st.hasEvent('lunar_quest_complete') && st.item('lunar_flame') === 3 && /фитиль/i.test(toasts.at(-1)), 'алтарь: сырые огоньки не принимает — подсказка сварить фитиль');
  const c1 = await sv.actions.craft('lunar_wick');
  ok(c1.ok && st.item('lunar_wick') === 1 && st.item('lunar_flame') === 0 && altar.label === 'Вставить фитиль', 'фитиль сварен: огоньки ушли в него, у алтаря кнопка «Вставить фитиль»');
  const xp0 = st.data.heroXP;
  await altar.insertWick();
  ok(st.hasEvent('lunar_quest_complete') && st.item('lunar_wick') === 0 && st.data.heroXP === xp0 + 50 && dialogs.at(-1)?.title === 'Алтарь пробудился', 'фитиль вставлен: алтарь горит, +50 опыта, фитиль списан');

  // --- ворота: состав проявляет знаки, Печать (20 маны) открывает
  st.markEvent('guardian_defeated');
  const gate = new GateObject(mk(), cfgOf('ancient_gate'));
  ok(gate.stage === 'marks' && gate.blocker, 'ворота после Стража: этап «знаки», проход закрыт');
  gate.interact(null);
  ok(!st.hasEvent('gate_marks_revealed') && /Состав ясного взгляда/.test(toasts.at(-1)), 'без состава — подсказка, ничего не меняется');
  st.addItem('revealing_compound', 1);
  ok(gate.label === 'Проявить знаки', 'состав в сумке → кнопка «Проявить знаки»');
  await gate.reveal();
  ok(st.hasEvent('gate_marks_revealed') && st.item('revealing_compound') === 0 && gate.stage === 'tell' && !gate.opened, 'знаки проявлены: состав списан, ворота всё ещё закрыты');
  st.markEvent('unlock_seal_1'); sv.abilities.unlock('seal', 1);
  ok(gate.stage === 'train', 'Астрал без обучения ворота не открывает');
  st.markEvent('seal_training_complete');
  ok(gate.stage === 'seal' && gate.ability === 'seal' && gate.manaCost() === 20, 'после обучения: ворота ждут Астрал (20 маны)');
  setM(100);
  gate.interact('fire'); await settle();
  ok(!gate.opened && vitals.mana(st) === 100 && /Астрал/.test(toasts.at(-1)), 'Огонь по воротам: отказ, мана не списана');
  setM(10);
  gate.interact('seal'); await settle();
  ok(!gate.opened && vitals.mana(st) === 10, 'не хватает маны: ворота закрыты, ничего не списано');
  setM(100);
  gate.interact('seal'); await settle(); runDelayed();
  ok(gate.opened && st.hasEvent('ancient_gate_open') && vitals.mana(st) === 80 && !gate.blocker && st.isPathOpen('node_glade'), 'Астрал открыл ворота: 20 маны, проход свободен');

  // --- учебный знак
  st.data.completedEvents = st.data.completedEvents.filter(e => e !== 'seal_training_complete');
  const sig = new SealSigilObject(mk(), cfgOf('seal_sigil'));
  setM(5); sig.interact('seal'); await settle();
  ok(!st.hasEvent('seal_training_complete') && vitals.mana(st) === 5, 'учебный знак: без маны ничего не происходит');
  setM(100); const sx = st.data.schoolXP.seal || 0;
  sig.interact('seal'); await settle(); runDelayed();
  ok(st.hasEvent('seal_training_complete') && vitals.mana(st) === 80 && st.data.schoolXP.seal === sx + 6 && dialogs.at(-1)?.title === 'Камень ожил', 'учебный знак: 20 маны, +6 опыта Печати, видимое изменение');

  // --- возобновляемый Корневик и запас пыли
  const rcfg = ENEMY_SPAWNS.find(e => e.id === 'rootling_02');
  ok(rcfg.repeatSec === 600 && ENEMY_SPAWNS.filter(e => e.enemy === 'rootling').length === 5 && ENEMY_SPAWNS.filter(e => e.enemy === 'rootling' && e.repeatSec).length === 3, 'пять Корневиков, три возобновляемых (600 с)');
  const sc = mk();
  const guard = new EnemyTrigger(sc, rcfg); sc.enemies = [guard];
  const stash = new DustStashObject(sc, cfgOf('dust_stash'));
  ok(!stash.ready(), 'запас недоступен, пока Корневик стоит');
  st.markEnemyDefeated('rootling_02'); recordRepeatWin(st, 'rootling_02'); guard.clear(false);
  ok(guard.defeated && enemyDownNow(st, rcfg) && stash.ready(), 'победа: Корневик ушёл, запас открыт');
  const d0 = st.item('rune_dust');
  stash.interact(); stash.interact(); await settle();
  ok(st.item('rune_dust') === d0 + 2 && !stash.ready(), 'запас: +2 пыли один раз за цикл (повтор ничего не даёт)');
  const stash2 = new DustStashObject(sc, cfgOf('dust_stash'));
  ok(!stash2.ready(), 'после «перезагрузки» запас того же цикла не выдаётся снова');
  t += 599_000; guard.update(0.1, { x: 0, y: 0 });
  ok(guard.defeated, 'через 599 с Корневика ещё нет');
  t += 2_000; guard.update(0.1, { x: rcfg.x, y: rcfg.y });
  ok(!guard.defeated && guard.mustLeave && !guard.update(0.1, { x: rcfg.x, y: rcfg.y }), 'через 600 с Корневик вернулся, но рядом стоящую героиню в бой сразу не втягивает');
  ok(!guard.update(0.1, { x: rcfg.x + 2000, y: rcfg.y }) && guard.update(0.1, { x: rcfg.x, y: rcfg.y }), 'отошла и вернулась — бой начинается');
  t += 5 * 3600_000;
  ok(!stash.ready(), 'часы оффлайн: запас без новой победы не копится');
  recordRepeatWin(st, 'rootling_02'); guard.clear(false);
  ok(st.getObject(repKey('rootling_02')).wins === 2 && stash.ready(), 'второй победный цикл — ещё одна выдача');

  // --- узел: связка + Печать одной операцией
  const node = new ForestNodeObject(mk(), cfgOf('forest_node'));
  ok(node.stage === 'guarded', 'узел стережёт испытание');
  st.markEvent('chapter_trial_defeated');
  ok(node.stage === 'bundle', 'после испытания без связки — объяснение рецепта');
  st.addItem('restoration_bundle', 1); setM(10);
  const coins0 = st.item('coins');
  await node.repair();
  ok(!st.hasEvent('chapter_1_complete') && st.item('restoration_bundle') === 1 && vitals.mana(st) === 10 && st.item('coins') === coins0, 'мало маны: ремонт не прошёл, связка и мана на месте');
  setM(100);
  let fin = null; const offF = bus.on(MSG.FINAL_SCREEN, (x) => { fin = x; });
  await node.repair();
  ok(st.hasEvent('chapter_1_complete') && st.item('restoration_bundle') === 0 && Math.abs(vitals.mana(st) - 80) < 0.5 && st.item('coins') === coins0 + 30 && fin, 'ремонт: связка и 20 маны списаны, +30 монет, финал главы');
  ok(!node.isAvailable(), 'восстановленный узел повторно не ремонтируется');
  offF?.();
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Тесты объектов пройдены');
process.exit(failures ? 1 : 0);
