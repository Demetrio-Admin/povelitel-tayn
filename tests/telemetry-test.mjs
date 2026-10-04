// Телеметрия: накопление, пачки, отказ сервера, лимиты, выключатель. Без браузера и сервера.
//   node tests/telemetry-test.mjs
import { Telemetry, TELEMETRY, cleanData } from '../src/telemetry/Telemetry.js';
import { telemetryAllowed, createTelemetry } from '../src/telemetry/hooks.js';
import { EventBus, MSG } from '../src/state/EventBus.js';
import { SupabaseApi } from '../src/cloud/api.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const mk = (over = {}) => {
  let t = 1000; const sent = []; const o = { fail: false };
  const tm = new Telemetry({ send: async (sid, ev, opts) => { if (o.fail) throw new Error('net'); sent.push({ sid, ev, opts }); }, now: () => t, setTimer: () => 1, clearTimer: () => {}, meta: { v: 'x' }, ...over });
  return { tm, sent, o, tick: (ms) => { t += ms; } };
};

console.log('\nТелеметрия: данные событий');
ok(JSON.stringify(cleanData({ a: 1.23456, b: 'x'.repeat(200), c: { x: 1 }, d: true, 'bad key!': 1, e: NaN })) === JSON.stringify({ a: 1.23, b: 'x'.repeat(80), d: true }), 'в данных остаются только числа, булевы и короткие строки');
ok(Object.keys(cleanData(Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['k' + i, i])))).length === 12, 'не больше 12 полей');

console.log('\nТелеметрия: очередь и отправка');
{
  const { tm, sent, tick } = mk();
  ok(tm.track('zone', { z: 'C' }) && tm.buf.length === 1, 'событие попало в очередь');
  ok(!tm.track('Bad Name!') && !tm.track('x'.repeat(41)) && !tm.track(''), 'плохие имена отбрасываются');
  tick(5000); tm.track('ev', { k: 'intro' });
  ok(tm.buf[1].t === 5000, 'время события — миллисекунды от начала сессии');
  const n = await tm.flush();
  ok(n === 2 && sent.length === 1 && sent[0].ev.length === 2 && tm.buf.length === 0, 'flush отправил пачку и очистил очередь');
  ok(/^[0-9a-f]{16}$/.test(sent[0].sid), 'id сессии — 16 hex-символов');
  ok((await tm.flush()) === 0 && sent.length === 1, 'пустая очередь ничего не отправляет');
}
{
  const { tm, sent, o } = mk();
  tm.track('a'); tm.track('b');
  o.fail = true;
  ok((await tm.flush()) === 0 && tm.buf.length === 2, 'сервер недоступен: события остались в очереди');
  o.fail = false; tm.track('c');
  ok((await tm.flush()) === 3 && sent[0].ev.map(e => e.n).join() === 'a,b,c', 'потом отправились все по порядку');
}
{
  const { tm, sent } = mk();
  for (let i = 0; i < TELEMETRY.batchMax; i++) tm.track('e' + (i % 10));
  await Promise.resolve(); await Promise.resolve();
  ok(sent.length === 1 && sent[0].ev.length === TELEMETRY.batchMax, `при ${TELEMETRY.batchMax} событиях отправка идёт сразу`);
}
{
  const { tm, o } = mk(); o.fail = true;
  for (let i = 0; i < TELEMETRY.bufferMax + 50; i++) tm.track('e');
  ok(tm.buf.length <= TELEMETRY.bufferMax && tm.dropped > 0, 'очередь не растёт бесконечно, лишнее отбрасывается');
}
{
  let resolve; const slow = new Promise(r => { resolve = r; }); let calls = 0;
  const tm = new Telemetry({ send: () => { calls++; return slow; }, setTimer: () => 1, clearTimer: () => {} });
  tm.track('a'); const p1 = tm.flush(); const p2 = tm.flush();
  ok((await p2) === 0 && calls === 1, 'вторая отправка не стартует, пока идёт первая');
  resolve(); await p1;
}
{
  // во время отправки пачки пришло событие: оно не теряется
  let release; const gate = new Promise(r => { release = r; });
  const tm = new Telemetry({ send: async () => { await gate; }, setTimer: () => 1, clearTimer: () => {} });
  tm.track('a'); const p = tm.flush(); tm.track('b'); release(); await p;
  ok(tm.buf.length === 1 && tm.buf[0].n === 'b', 'событие, пришедшее во время отправки, осталось в очереди');
}

console.log('\nТелеметрия: сессия и выключатель');
{
  const { tm } = mk();
  tm.start();
  ok(tm.buf[0].n === 'session_start' && tm.buf[0].d.v === 'x', 'session_start несёт описание сессии');
  tm.setActive(false);
  ok(tm.buf.some(e => e.n === 'hidden'), 'сворачивание вкладки записывается');
}
{
  const { tm, sent } = mk({ enabled: false });
  tm.start(); tm.track('a');
  ok(!tm.enabled && tm.buf.length === 0 && (await tm.flush()) === 0 && sent.length === 0, 'выключенная телеметрия ничего не пишет и не шлёт');
}
ok(telemetryAllowed('?x=1', { getItem: () => null }), 'по умолчанию включена');
ok(!telemetryAllowed('?notrack', { getItem: () => null }), 'адрес ?notrack выключает');
ok(!telemetryAllowed('', { getItem: (k) => (k === 'witch_notrack' ? '1' : null) }), 'настройка в браузере выключает');
ok(telemetryAllowed('', { getItem: () => { throw new Error('blocked'); } }), 'недоступное хранилище не ломает включение');

console.log('\nТелеметрия: подключение к игре');
{
  const bus = new EventBus(); const listeners = []; const sentBatches = []; let status = 'loading';
  const session = { get status() { return status; }, onChange: (fn) => listeners.push(fn), sendTelemetry: async (sid, ev) => { sentBatches.push(ev); } };
  const wl = {}; const dl = {};
  const win = { location: { search: '' }, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, navigator: { maxTouchPoints: 5 },
    addEventListener: (n, f) => { (wl[n] = wl[n] || []).push(f); }, matchMedia: () => ({ matches: false }) };
  const doc = { visibilityState: 'visible', addEventListener: (n, f) => { (dl[n] = dl[n] || []).push(f); } };
  const state = { data: { heroLevel: 4 } };
  const tm = createTelemetry({ session, bus, state, heroId: () => 'witch', win, doc, storage: { getItem: () => null } });
  tm.setTimer = () => 1;
  ok(tm.buf.length === 0, 'пока игрок не загружен, сессия не стартует');
  status = 'ready'; listeners.forEach(f => f('signin'));
  ok(tm.buf[0]?.n === 'session_start' && tm.buf[0].d.v === '0.10.2' && tm.buf[0].d.hero === 'witch' && tm.buf[0].d.w === 390 && tm.buf[0].d.touch === true, 'после входа записан session_start с версией, героем и экраном');
  bus.emit(MSG.WORLD_EVENT, 'lunar_quest_complete', {}, {});
  bus.emit(MSG.ZONE_CHANGED, { id: 'C', name: 'Лесная тропа' });
  bus.emit(MSG.CRAFTED, { recipeId: 'lunar_wick', result: 'lunar_wick', amount: 1 });
  bus.emit(MSG.REWARD, { levelUps: [{ level: 5 }], granted: {} });
  bus.emit(MSG.REWARD, { levelUps: [], granted: {} });
  const names = tm.buf.map(e => e.n).join();
  ok(names === 'session_start,ev,zone,craft,levelup', `события игры записаны: ${names}`);
  ok(tm.buf[1].d.k === 'lunar_quest_complete' && tm.buf[1].d.lvl === 4 && tm.buf[2].d.z === 'C' && tm.buf[3].d.r === 'lunar_wick', 'в событиях ключ шага, уровень, зона и рецепт');
  wl.error[0]({ message: 'boom', lineno: 7 });
  for (let i = 0; i < 10; i++) wl.error[0]({ message: 'again', lineno: 1 });
  ok(tm.buf.filter(e => e.n === 'js_error').length === 5, 'ошибок за сессию не больше пяти');
  doc.visibilityState = 'hidden'; dl.visibilitychange[0]();
  await new Promise(r => setTimeout(r, 5));
  ok(sentBatches.length === 1 && sentBatches[0].some(e => e.n === 'hidden'), 'сворачивание вкладки отправляет накопленное');
  const off = createTelemetry({ session, bus, state, heroId: () => 'x', win: { ...win, location: { search: '?notrack' } }, doc, storage: null });
  off.track('a'); ok(off.buf.length === 0, '?notrack в адресе: игра ничего не пишет');
}

console.log('\nТелеметрия: запрос к серверу');
{
  const calls = [];
  const api = new SupabaseApi({ url: 'https://x.test', anonKey: 'k', fetchFn: async (url, init) => { calls.push({ url, init }); return { ok: true, text: async () => '2' }; } });
  const r = await api.telemetryLog('tok', 'abcdef0123456789', [{ n: 'a', t: 1, d: {} }], { keepalive: true });
  const body = JSON.parse(calls[0].init.body);
  ok(calls[0].url.endsWith('/rest/v1/rpc/telemetry_log') && body.session === 'abcdef0123456789' && body.events.length === 1 && calls[0].init.keepalive === true && r === 2, 'RPC telemetry_log с id сессии и событиями');
}

if (failures) { console.log(`\n${failures} проверок не прошли`); process.exit(1); }
console.log('\nТелеметрия: всё в порядке');
