// Регрессия: ранний настой -> сдача спасения -> подтверждённый Лёд; отказ не показывает успех.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupStage, freshWorld } from '../tools/ui/stage.mjs';
import { FakeSupabase } from './helpers/fake-supabase.mjs';
import { SupabaseApi } from '../src/cloud/api.js';
import { GameState } from '../src/state/GameState.js';
import { PlayerSession } from '../src/cloud/PlayerSession.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = new Proxy({}, { get: (t, k) => k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
await setupStage({ root, createCanvas: (width, height) => ({ width, height, getContext: () => ctx }), loadImage: async () => ({ width: 64, height: 64 }) });
const { ExplorationScene } = await import('../src/scenes/ExplorationScene.js');
const { UIScene } = await import('../src/scenes/UIScene.js');
const { MSG } = await import('../src/state/EventBus.js');
const beforeLesson = ['ch2_construct_unstable', 'ch2_nerys_met', 'ch2_rescue_door', 'ch2_rescue_cellar', 'warm_potion_crafted'];
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k,v) => m.set(k,v), removeItem: k => m.delete(k) }; };
const sv = await freshWorld('new');
const ex = new ExplorationScene(); ex.player = { x: 0, y: 0 };
const toasts = [], popups = [];
ex.burst = () => {}; ex.toast = text => toasts.push(text); ex.dialog = opts => popups.push(opts);
beforeLesson.forEach(k => sv.state.markEvent(k));
assert.equal(sv.dialogue.pick('nerys').id, 'nerys_rescue_ready');
await ex.unlockGift('ice');
assert.equal(sv.state.isUnlocked('ice'), false);
assert.equal(popups.length, 0);
assert.match(toasts.at(-1), /предыдущее задание/);
assert.equal((await sv.actions.confirmEvent('ch2_rescue_done')).ok, true);
assert.equal(sv.dialogue.pick('nerys').id, 'nerys_lesson_ready');
await Promise.all([ex.unlockGift('ice'), ex.unlockGift('ice')]);
assert.equal(sv.state.abilityLevel('ice'), 1);
assert.equal(popups.length, 1);
assert.equal(popups[0].title, 'Лёд I');
console.log('✓ Ранний настой не обходит спасение; офлайн-урок выдаёт Лёд по тем же правилам, один раз.');

// Онлайн: настоящий PlayerSession, задержка ответа, уже стоящее в очереди предыдущее событие.
await freshWorld('new');
const srv = new FakeSupabase();
const api = new SupabaseApi({ url: srv.url, anonKey: srv.anonKey, fetchFn: srv.fetch });
const session = new PlayerSession({ api, state: sv.state, storage: mem(), setTimer: () => 0, clearTimer: () => {} });
sv.session = session;
await session.playAsGuest('witch');
srv.grant(session.userId, { quests: beforeLesson });
await session.flush({ force: true });
srv.delayMs = 40;
const rescue = sv.actions.event('ch2_rescue_done');
// Локальный оптимистичный флаг предыдущего шага, как при выборе ответа Нэрис.
sv.state.markEvent('ch2_rescue_done');
const ui = new UIScene(); ui.create();
let closedBeforeGrant = false, granting;
const off = sv.bus.on(MSG.UNLOCK_GIFT, spec => {
  closedBeforeGrant = !ui.modal && !ui.dlg && !sv.modalOpen;
  granting = ex.unlockGift(spec);
});
sv.dialogue.start('nerys');
while (!sv.dialogue.view().choices) { ui.finishTyping(); ui.dialogueTap(); }
ui.finishTyping();
ui.dialogueChoose(sv.dialogue.view().choices[0].index);
assert.equal(closedBeforeGrant, true);
assert.equal(sv.state.isUnlocked('ice'), false, 'до ответа нет локального дара');
assert.equal(popups.length, 1, 'до ответа нет нового окна успеха');
await rescue; await granting;
assert.equal(popups.length, 2);
assert.equal(sv.state.hasEvent('unlock_ice_1'), true);
assert.equal(sv.state.isUnlocked('ice'), true);
const events = srv.calls.filter(c => c.path.endsWith('/player_action')).map(c => c.body.action).filter(a => a.op === 'event').map(a => a.key);
assert.deepEqual(events, ['ch2_rescue_done', 'unlock_ice_1']);
assert.equal(srv.players.get(session.userId).snap.abilities.ice.unlocked, true);
await ex.unlockGift('ice');
assert.equal(popups.length, 2, 'повторный урок не дублирует окно/награду');
const restoredState = new GameState(null);
const restored = new PlayerSession({ api, state: restoredState, storage: session.storage, setTimer: () => 0, clearTimer: () => {} });
assert.equal(await restored.restore(), 'ready');
assert.equal(restoredState.isUnlocked('ice'), true, 'новое устройство получило дар с сервера');
assert.equal(restoredState.hasEvent('unlock_ice_1'), true);
console.log('✓ Диалог закрывается до выдачи; Лёд ждёт предыдущего события и ответа сервера, сохраняется после входа.');

// II и III тоже получают уровень/ветку из ответа сервера.
srv.grant(session.userId, { quests: ['ch2_quarter_cleared'] }); await session.flush({ force: true });
await ex.unlockGift('ice:2');
assert.equal(sv.state.abilityLevel('ice'), 2);
srv.grant(session.userId, { quests: ['ch2_fin_tk', 'ch2_fin_fire', 'ch2_fin_ice', 'ch2_fin_seal'] }); await session.flush({ force: true });
await ex.unlockGift('ice:3:shard');
assert.equal(sv.state.abilityLevel('ice'), 3);
assert.equal(sv.state.branchOf('ice'), 'shard');
assert.equal(sv.state.hasEvent('ch2_ice3'), true);
console.log('✓ Лёд II/III и выбранная ветка подтверждаются сервером.');
// Даже при доступном локальном диалоге отказ сервера не должен выдавать дар/окно успеха.
await freshWorld('new');
[...beforeLesson, 'ch2_rescue_done'].forEach(k => sv.state.markEvent(k));
sv.session = { userId: 'rejected', runAction: async () => ({ ok: false, reason: 'locked' }) };
const countBeforeRefusal = popups.length;
await ex.unlockGift('ice');
assert.equal(popups.length, countBeforeRefusal);
assert.equal(sv.state.isUnlocked('ice'), false);
assert.match(toasts.at(-1), /предыдущее задание/);
assert.equal(ex.giftPending, false);
console.log('✓ Отказ сервера не показывает получение дара и оставляет возможность повторить урок.');

// Действие, ожидающее другого запроса, не должно уйти в новый аккаунт.
let release, calls = 0;
const first = { userId: 'first', runAction: async () => { await new Promise(r => { release = r; }); return { ok: true }; } };
sv.session = first;
const running = sv.actions.run({ op: 'heal' });
const waiting = sv.actions.confirmEvent('unlock_ice_1');
await Promise.resolve();
sv.session = { userId: 'second', runAction: async () => { calls++; return { ok: true }; } };
release(); await running;
assert.equal((await waiting).reason, 'session');
assert.equal(calls, 0);
console.log('✓ Ожидающее действие не отправляется после смены аккаунта.');
off(); sv.bus.offContext(ui); sv.session = null;
