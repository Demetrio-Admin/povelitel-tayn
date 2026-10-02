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
  const o = { x, y, scaleX: 1, scaleY: 1, displayWidth: 60, displayHeight: 60, alpha: 1, active: true, visible: true, depth: 0, angle: 0, text: '' };
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
  g.interact(null);
  ok(g.busy && calls.cast === 1, 'сбор: героиня наклоняется (поза gather), объект занят');
  ok(sv.state.item('moon_herb') === before, 'ресурс приходит после анимации, а не мгновенно');
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
  o.interact(); runDelayed();
  ok(sv.state.item('forest_mushroom') === m0 + 1 && sv.state.item('tree_resin') >= 1, 'сундук в доме: первый осмотр даёт гриб и смолу');
  o.interact(); runDelayed();
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

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Тесты объектов пройдены');
process.exit(failures ? 1 : 0);
