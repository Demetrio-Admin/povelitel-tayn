// Сценарии онлайн-аккаунта (ТЗ, п. 42) на фальшивом Supabase с настоящими модулями игры.
//   node tests/session-test.js            — серверные функции на JS-зеркале (быстро, без базы)
//   BACKEND=pg node tests/session-test.js — серверные функции и права на настоящем Postgres (нужна схема в базе)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameState } from '../src/state/GameState.js';
import { SupabaseApi, CloudError } from '../src/cloud/api.js';
import { PlayerSession, TOKENS_KEY } from '../src/cloud/PlayerSession.js';
import { validateNickname, normalizeNickname, loginEmail, NICK_ERRORS } from '../src/cloud/nickname.js';
import { checkNickname, loginEmail as fnLoginEmail, DEFAULT_LOGIN_DOMAIN } from '../supabase/functions/account/index.ts';
import { CLOUD } from '../src/config/cloud.config.js';
import { FakeSupabase, pg } from './helpers/fake-supabase.mjs';
import { heroById } from '../src/config/heroes.js';
import { PlayerActions } from '../src/systems/PlayerActions.js';
import { advanceWorld, serverActionBusy } from '../src/systems/WorldClock.js';
import * as vitalsMod from '../src/state/vitals.js';
import { playBot } from './helpers/combat-bot.mjs';
import { STEP } from '../src/systems/combatReplay.js';
import { EventBus } from '../src/state/EventBus.js';
import { QuestFlags } from '../src/state/QuestFlags.js';
import { QuestLog } from '../src/state/QuestLog.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { DialogueSystem } from '../src/systems/DialogueSystem.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = process.env.BACKEND || 'model';
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failures++; console.log('  ✗', msg); } };
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };
const SUF = Math.random().toString(36).slice(2, 6).replace(/[0-9]/g, (d) => 'abcdefghij'[d]);
const nickLat = (base) => `${base}_${SUF}`;                                   // уникальные ники: базу можно не чистить
const nickCyr = (base) => `${base}_${[...SUF].map(c => 'абвгдежзийклмнопрстуфхцчш'[c.charCodeAt(0) - 97] || 'я').join('')}`;
const PASS = 'Лунный-пароль-1';

/** «Устройство»: своё хранилище токенов, своё состояние игры и сессия; сервер общий. */
function device(srv, storage = memStorage()) {
  const timers = [];
  const state = new GameState(null);
  const api = new SupabaseApi({ url: srv.url, anonKey: srv.anonKey, loginDomain: CLOUD.loginDomain, fetchFn: srv.fetch, timeoutMs: 2000, now: () => srv.now() });
  const session = new PlayerSession({
    api, state, storage, now: () => srv.now(), saveDelayMs: 600, minorDelayMs: 15000, retryDelaysMs: [2000],
    setTimer: (f, ms) => { const t = { f, ms, live: true }; timers.push(t); return t; }, clearTimer: (t) => { if (t) t.live = false; },
  });
  const fire = async () => { const live = timers.filter(t => t.live); live.forEach(t => { t.live = false; }); for (const t of live) await t.f(); };
  return { state, api, session, storage, timers, fire };
}
/** v0.12.0: HP и ману задаёт сервер. Выставляем их там «прямо сейчас» и подтягиваем на устройство (пустое сохранение с force). */
async function setVitals(dev, v) { srv.setVitals(dev.session.userId, v); await dev.session.flush({ force: true }); }
const near = (a, b, eps = 1.5) => Math.abs(a - b) <= eps;   // настоящий Postgres считает по реальному времени: за тест набегают доли секунды

/**
 * Немного игры: награда, событие, предмет, дар. С v0.15.0 опыт, предметы, события и дары закрыты для sync_player —
 * их выдаёт сервер своими действиями, поэтому тест «выдаёт» их мимо игры (srv.grant) и подтягивает на устройство.
 * Позиция — обычное сохранение клиента.
 */
async function play(d, { xp = 70, coins = 15, event = 'combat_intro_01' } = {}) {
  srv.grant(d.session.userId, { xp: d.state.data.heroXP + xp, school: { telekinesis: 40 }, inv: { lunar_shard: 1, coins }, quests: [event], abilities: { telekinesis: { level: 1, unlocked: true } } });
  d.state.data.player = { x: 1234, y: 4321 };
  d.state.save();
  await d.session.flush({ force: true });
}
/** Выдать серверу прогресс и подтянуть его на устройство. */
async function give(d, st) { srv.grant(d.session.userId, st); await d.session.flush({ force: true }); }

const srv = new FakeSupabase({ backend: BACKEND });
console.log(`\nСервер: ${BACKEND === 'pg' ? 'настоящий Postgres (supabase/schema.sql)' : 'JS-зеркало схемы'}`);

console.log('\nНик и пароль: правила');
{
  ok(validateNickname('  Дмитрий ').ok && validateNickname('Dmitry_7').ok && validateNickname('ведьма_2000').ok, 'кириллица, латиница, цифры и _ допустимы; пробелы по краям убираются');
  ok(validateNickname('Дм').error === NICK_ERRORS.short && validateNickname('x'.repeat(21)).error === NICK_ERRORS.long, 'от 3 до 20 символов, понятные ошибки');
  ok(validateNickname('Дмит рий').error === NICK_ERRORS.chars && validateNickname('Dmitry!').error === NICK_ERRORS.chars, 'пробел внутри и спецсимволы запрещены');
  ok(validateNickname('Dmitrу').error === NICK_ERRORS.mixed, 'латиница с русской «у» отклонена (защита от подделки чужого ника)');
  ok(validateNickname('____').error === NICK_ERRORS.letter && validateNickname('12345').error === NICK_ERRORS.letter, 'нужна хотя бы одна буква');
  ok(normalizeNickname('DMITRY') === normalizeNickname('dmitry') && normalizeNickname('Дмитрий') === normalizeNickname('ДМИТРИЙ'), 'регистр не важен: Dmitry = DMITRY');
  const samples = ['Дмитрий', 'dmitry', 'Dmitrу', 'ab', 'x'.repeat(21), 'Ёжик_1', 'a b', '___', 'Witch_Lady', 'ведьма-1', ' Ann ', 'ЁЁЁ'];
  ok(samples.every(s => validateNickname(s).ok === checkNickname(s).ok && validateNickname(s).norm === checkNickname(s).norm), 'правила ника в игре и в Edge Function совпадают');
  ok(await loginEmail('дмитрий', 'd.test') === await fnLoginEmail('дмитрий', 'd.test') && CLOUD.loginDomain === DEFAULT_LOGIN_DOMAIN, 'служебный адрес для входа считается одинаково в игре и в функции');
  ok(/^u[0-9a-f]{40}@/.test(await loginEmail('дмитрий', 'x.test')), 'служебный адрес не раскрывает ник и не содержит кириллицы');
}

console.log('\n1. Новый гость');
const NICK = nickCyr('Дмитрий');
const phoneStorage = memStorage();
let guestId;
{
  const d = device(srv, phoneStorage);
  ok(await d.session.restore() === 'signed_out', 'первый запуск: входа нет — стартовый экран');
  await d.session.playAsGuest('witch');
  guestId = d.session.userId;
  ok(d.session.status === 'ready' && guestId && srv.users.get(guestId)?.anonymous, 'гость — настоящий пользователь сервера со своим user_id');
  ok(!d.session.registered && d.session.nickname === '' && d.session.hero === 'witch', 'персонаж создан на сервере: без ника, выбранный герой');
  const keys = [...phoneStorage._m.keys()];
  ok(keys.length === 1 && keys[0] === TOKENS_KEY && !phoneStorage._m.get(TOKENS_KEY).includes('heroLevel'), 'на устройстве хранится только токен входа, прогресса там нет');

  console.log('\n3. Прогресс сохраняется на сервере автоматически');
  await play(d);
  d.state.data.tutorial.push('bag'); d.state.save();
  ok(d.timers.some(t => t.live && t.ms === 600), 'после важного изменения (подсказка обучения) сохранение запланировано почти сразу (не вручную)');
  await d.fire();
  const srvSnap = await d.api.getPlayer(d.session.auth.access_token);
  ok(srvSnap.level === 2 && srvSnap.inventory.coins === 15 && srvSnap.quests.includes('combat_intro_01') && srvSnap.abilities.telekinesis.unlocked, 'на сервере: уровень 2, монеты, событие, дар');
  d.state.data.player = { x: 777, y: 888 }; d.state.save();
  ok(d.timers.some(t => t.live && t.ms === 15000), 'позиция уходит реже (раз в 15 секунд)');
  await d.fire();
  ok((await d.api.getPlayer(d.session.auth.access_token)).pos.x === 777, 'позиция тоже на сервере');
}

console.log('\n2. Гость вернулся (перезагрузка, закрытый браузер)');
{
  const d = device(srv, phoneStorage);   // то же хранилище — тот же браузер
  srv.advance(5 * 3600_000);             // прошло 5 часов: токен доступа истёк, обновится сам
  ok(await d.session.restore() === 'ready', 'вход восстановлен без вопросов');
  ok(d.session.userId === guestId && d.state.data.heroLevel === 2 && d.state.item('coins') === 15 && d.state.data.player.x === 777, 'тот же персонаж и прогресс, новый гость не создан');
  ok([...srv.users.values()].filter(u => u.anonymous).length >= 1 && srv.users.size === new Set([...srv.users.keys()]).size, 'пользователей на сервере не прибавилось при перезапуске');
}

console.log('\n4–5. Гость создаёт аккаунт — персонаж тот же');
{
  const d = device(srv, phoneStorage);
  await d.session.restore();
  await play(d, { xp: 100, coins: 20, event: 'lunar_quest_complete' }); // уровень 3
  const e1 = await rejects(() => d.session.registerGuest({ nickname: NICK, password: PASS, password2: PASS + 'x' }));
  ok(e1?.message === 'Пароли не совпадают.', 'пароли различаются — «Пароли не совпадают.»');
  const e2 = await rejects(() => d.session.registerGuest({ nickname: NICK, password: '1234', password2: '1234' }));
  ok(e2?.message === 'Пароль должен содержать минимум 8 символов.', 'короткий пароль — понятная ошибка');
  const e3 = await rejects(() => d.session.registerGuest({ nickname: 'Дм', password: PASS, password2: PASS }));
  ok(e3?.message === 'Никнейм должен содержать минимум 3 символа.', 'короткий ник — «Никнейм должен содержать минимум 3 символа.»');
  await d.session.registerGuest({ nickname: NICK, password: PASS, password2: PASS });
  ok(d.session.registered && d.session.nickname === NICK && d.session.userId === guestId, `аккаунт «${NICK}»: тот же user_id`);
  ok(d.state.data.heroLevel === 3 && d.state.item('coins') === 35 && d.state.hasEvent('lunar_quest_complete') && d.state.isUnlocked('telekinesis'), 'уровень, монеты, события и дары на месте');
  const u = srv.users.get(guestId);
  ok(u.email && u.email.startsWith('u') && !u.email.includes(normalizeNickname(NICK)) && u.password === PASS && u.confirmed, 'пароль хранит Auth; служебный адрес подтверждён без писем');
  ok(!JSON.stringify([...phoneStorage._m.values()]).includes(PASS), 'пароль не сохраняется на устройстве');
}

console.log('\n7. Вход по нику и паролю на другом устройстве');
const pcStorage = memStorage();
{
  const d = device(srv, pcStorage);
  ok(await d.session.restore() === 'signed_out', 'на новом устройстве входа нет');
  await d.session.login({ nickname: NICK.toUpperCase(), password: PASS });
  ok(d.session.userId === guestId && d.session.nickname === NICK, 'вход по нику в другом регистре: тот же игрок, ник в своём написании');
  ok(d.state.data.heroLevel === 3 && d.state.item('coins') === 35 && d.state.data.player.x === 1234, 'тот же герой, уровень, монеты и место в мире');
}

console.log('\n10. Неверные данные входа');
{
  const d = device(srv);
  const e1 = await rejects(() => d.session.login({ nickname: NICK, password: 'не-тот-пароль' }));
  const e2 = await rejects(() => d.session.login({ nickname: nickLat('NobodyHere'), password: PASS }));
  ok(e1?.message === 'Неверный никнейм или пароль.' && e2?.message === e1?.message, 'неверный пароль и несуществующий ник — одно и то же сообщение');
  ok(d.session.status === 'signed_out' && !d.storage.getItem(TOKENS_KEY), 'после ошибки входа ничего не сохранено');
}

console.log('\n9. Второй аккаунт с тем же ником невозможен');
{
  const d = device(srv);
  const e = await rejects(() => d.session.registerNew({ hero: 'witch', nickname: NICK.toUpperCase(), password: PASS, password2: PASS }));
  ok(e?.message === 'Этот никнейм уже используется.', 'тот же ник в другом регистре — «Этот никнейм уже используется.»');
  ok(!d.session.signedIn, 'при занятом нике гость впустую не создаётся');
  // гонка: два гостя одновременно берут один и тот же свободный ник — проходит ровно один
  const a = device(srv), b = device(srv);
  await a.session.playAsGuest('witch'); await b.session.playAsGuest('witch');
  const RACE = nickLat('Race');
  const res = await Promise.allSettled([
    a.session.registerGuest({ nickname: RACE, password: PASS, password2: PASS }),
    b.session.registerGuest({ nickname: RACE.toLowerCase(), password: PASS, password2: PASS }),
  ]);
  const won = res.filter(r => r.status === 'fulfilled').length, lost = res.find(r => r.status === 'rejected');
  ok(won === 1 && lost?.reason?.message === 'Этот никнейм уже используется.', 'одновременная регистрация одного ника: успешна ровно одна');
  const loser = res[0].status === 'rejected' ? a : b;
  ok(!loser.session.registered && loser.session.status === 'ready', 'проигравший остаётся гостем со своим персонажем и может выбрать другой ник');
}

console.log('\n6. Регистрация сразу при начале игры — без почты');
const NEW = nickLat('Witch');
{
  const d = device(srv);
  const e = await rejects(() => d.session.registerNew({ hero: 'witch', nickname: NEW, password: PASS, password2: PASS }));
  ok(e === null && d.session.registered && d.session.nickname === NEW && d.session.status === 'ready', `аккаунт «${NEW}» создан: ник + пароль, без почты`);
  ok(d.state.data.heroLevel === 1 && d.session.hero === 'witch', 'новый персонаж с выбранным героем, игра может начинаться');
  const sent = srv.calls.filter(c => c.path === '/functions/v1/account').map(c => Object.keys(c.body || {}).sort().join(','));
  ok(sent.every(k => k === 'action,nickname,password'), 'форма отправляет только ник и пароль — e-mail игра не спрашивает и не передаёт');
}

console.log('\n8. Выход и повторный вход');
{
  const d = device(srv, phoneStorage);
  await d.session.restore();
  const other = device(srv, pcStorage);
  await other.session.restore();
  await d.session.logout();
  ok(d.session.status === 'signed_out' && !phoneStorage.getItem(TOKENS_KEY), 'выход: вход на устройстве закрыт');
  ok(await device(srv, pcStorage).session.restore() === 'ready', 'другое устройство игрока при этом остаётся в игре');
  const again = device(srv, phoneStorage);
  await again.session.login({ nickname: NICK, password: PASS });
  ok(again.state.data.heroLevel === 3 && again.state.item('coins') === 35, 'после выхода и входа — прогресс на месте (сервер ничего не стёр)');
}

console.log('\n12. После перезагрузки прогресс не откатывается; два устройства не затирают друг друга');
{
  const phone = device(srv, phoneStorage), pc = device(srv, pcStorage);
  await phone.session.restore(); await pc.session.restore();
  // телефон получает монеты и событие; компьютер (со старыми данными) — свою награду
  await give(phone, { inv: { coins: 40 }, quests: ['heavy_path_open'] });
  await give(pc, { inv: { lunar_shard: 2 }, quests: ['unlock_fire_1'] });
  ok(pc.state.item('coins') === 75 && pc.state.hasEvent('heavy_path_open') && pc.state.item('lunar_shard') === 4, 'компьютер получил изменения телефона и не затёр их своими');
  const fresh = device(srv, phoneStorage); await fresh.session.restore();
  ok(fresh.state.item('coins') === 75 && fresh.state.hasEvent('unlock_fire_1') && fresh.state.hasEvent('heavy_path_open'), 'после перезагрузки — всё вместе, ничего не откатилось');
}

console.log('\nОбрыв связи');
{
  const d = device(srv, phoneStorage);
  await d.session.restore();
  const coins = d.state.item('coins');
  srv.offline = true;
  d.state.data.player = { x: 55, y: 66 }; d.state.save();
  ok(await d.session.flush() === false && d.session.status === 'offline' && d.session.saving === 'offline', 'нет сети — статус «Нет соединения», изменения ждут');
  ok(![...phoneStorage._m.keys()].some(k => k !== TOKENS_KEY), 'никакого параллельного локального сохранения не появилось');
  srv.offline = false;
  ok(await d.session.retryNow() && d.session.status === 'ready', '«Повторить»: связь вернулась, игра продолжается');
  ok((await d.api.getPlayer(d.session.auth.access_token)).pos.x === 55, 'изменения, сделанные без связи, дошли до сервера');
  // запрос дошёл, ответ потерялся — повтор не должен применить его второй раз
  d.state.data.player = { x: 77, y: 88 }; d.state.save();
  srv.loseNext = 1;
  await d.session.flush();
  ok(d.session.status === 'offline', 'ответ потерялся — снова «Нет соединения»');
  await d.session.retryNow();
  ok((await d.api.getPlayer(d.session.auth.access_token)).pos.x === 77 && d.state.data.player.x === 77 && d.state.item('coins') === coins, 'повтор после потерянного ответа: позиция на месте, прогресс не изменился');
  // при запуске сети нет
  srv.offline = true;
  const boot = device(srv, phoneStorage);
  ok(await boot.session.restore() === 'offline', 'запуск без сети — «Нет соединения», игра не стартует на устаревших данных');
  srv.offline = false;
  ok(await boot.session.retryNow() && boot.state.item('coins') === coins && boot.state.data.player.x === 77, 'связь появилась — персонаж загружен с сервера');
}

console.log('\nДоверие клиенту');
{
  const d = device(srv, phoneStorage);
  await d.session.restore();
  const coins = d.state.item('coins');
  const xp0 = d.state.data.heroXP, lvl0 = d.state.data.heroLevel;
  // v0.15.0: всё, что даёт силу, закрыто — подделка в браузере не доходит до сервера (sync_player её не принимает)
  const D = d.state.data;
  D.inventory.coins = 999999999; D.inventory.elixir_life = 50; D.heroLevel = 99; D.heroXP = 999999;
  D.completedEvents.push('chapter_1_complete', 'fire_gate_open'); D.openedPaths.push('ancient_gate_open'); D.defeatedEnemies.push('forest_guardian');
  D.unlockedAbilities.push('fire'); D.fireLevel = 3; D.schoolXP.fire = 5000; D.research = { upgradeId: 'telekinesis_2', startedAt: 0, durationMs: 1 };
  D.worldObjects.west_chest = { state: 'opened' }; D.worldObjects['rep:forest_scavenger'] = { n: 99 }; D.worldObjects.player_build = { branches: { telekinesis: 'lord' } };
  D.player = { x: 31, y: 41 };
  d.state.save();
  await d.session.flush();
  const real = await d.api.getPlayer(d.session.auth.access_token);
  ok(real.inventory.coins === coins && !real.inventory.elixir_life && real.level === lvl0 && real.xp === xp0, `подделка монет, предметов, уровня и опыта: сервер оставил ${real.inventory.coins} монет, ур. ${real.level}`);
  ok(!real.quests.includes('chapter_1_complete') && !real.quests.includes('fire_gate_open') && !real.paths.includes('ancient_gate_open') && !real.enemies.includes('forest_guardian'), 'подделка событий, открытых путей и побеждённых врагов отклонена');
  ok(!real.abilities.fire?.unlocked && !(real.school?.fire > 0) && !real.research, 'подделка дара, опыта школы и изучения отклонена');
  ok(!real.objects.west_chest && !real.objects['rep:forest_scavenger'] && !real.objects.player_build, 'подделка состояния мира, репутации врагов и билда отклонена');
  ok(real.pos.x === 31, 'обычное (позиция) при этом сохранилось');
  ok(d.state.item('coins') === coins && d.state.data.heroLevel === lvl0 && !d.state.hasEvent('chapter_1_complete'), 'клиент взял состояние сервера — подделка исчезла и у него');
  const e = await rejects(() => d.api.rpc('claim_nickname', { uid: d.session.userId, nick: nickLat('Hack'), norm: nickLat('hack') }, d.session.auth.access_token));
  ok(e instanceof CloudError && e.status === 403, 'служебная функция ника недоступна из браузера');
}

console.log('\nТокены, пароль, новая игра');
{
  const d = device(srv, phoneStorage);
  await d.session.restore();
  srv.expireAccess();
  d.state.data.player = { x: 12, y: 13 }; d.state.save();
  ok(await d.session.flush() && d.session.status === 'ready', 'истёкший токен обновляется сам, сохранение проходит');
  await d.session.changePassword({ password: 'Новый-пароль-2', password2: 'Новый-пароль-2' });
  const x = device(srv);
  ok((await rejects(() => x.session.login({ nickname: NICK, password: PASS })))?.code === 'invalid_credentials', 'смена пароля: старый пароль больше не подходит');
  await x.session.login({ nickname: NICK, password: 'Новый-пароль-2' });
  ok(x.session.userId === guestId, 'новый пароль работает');
  await x.session.resetProgress('witch');
  ok(x.state.data.heroLevel === 1 && x.state.item('coins') === 0 && x.session.nickname === NICK && x.session.userId === guestId, 'новая игра: прогресс с нуля, ник и аккаунт те же');
  // токен отозван на сервере (например, после смены пароля на другом устройстве)
  const y = device(srv);
  await y.session.login({ nickname: NICK, password: 'Новый-пароль-2' });
  srv.refreshT.clear(); srv.expireAccess();
  let lost = false; y.session.onChange(r => { if (r === 'session-lost') lost = true; });
  y.state.data.player = { x: 14, y: 15 }; y.state.save(); await y.session.flush();
  ok(lost && y.session.status === 'signed_out' && !y.storage.getItem(TOKENS_KEY), 'вход отозван — возврат на стартовый экран, без зависаний');
}

console.log('\nv0.9. Общие HP/мана на сервере, лечение и стартовый набор');
{
  const d = device(srv);
  await d.session.playAsGuest('witch');
  const st = d.state;
  ok(st.data.mana === 100 && st.data.hp === 120, 'новый персонаж: HP и мана полные (сервер хранит числа)');
  await setVitals(d, { hp: 0, mana: 12.5 });
  const other = device(srv, d.storage); await other.session.restore();
  ok(near(other.state.data.mana, 12.5) && near(other.state.data.hp, 0), 'мана и числовой 0 HP на сервере видны на другом устройстве');
  st.data.mana = 999; st.data.hp = 999; st.save(); await d.session.flush({ force: true });
  ok(near(st.data.mana, 12.5) && near(st.data.hp, 0), 'клиент не может записать ни ману, ни HP: сервер вернул свои числа');
  // v0.13.0: ману в мире тратит сам сервер (сбор — операция world); устаревшее mana_spent он не принимает
  await setVitals(d, { hp: 40, mana: 50 });
  st.data.manaSpent = 30; await d.session.flush({ force: true });
  ok(near(srv.rawVitals(d.session.userId).mana, 50), 'устаревшее mana_spent сервер игнорирует: мана прежняя');
  const g1 = await d.session.runAction({ op: 'world', obj: 'herb_g1' });
  ok(g1.ok && near(srv.rawVitals(d.session.userId).mana, 46) && near(st.data.mana, 46) && st.item('moon_herb') === 1, 'сбор: сервер списал 4 маны и выдал траву (на устройстве и на сервере одно и то же)');
  const g2 = await d.session.runAction({ op: 'world', obj: 'herb_g1' });
  ok(!g2.ok && g2.reason === 'wait' && g2.left > 140 && near(srv.rawVitals(d.session.userId).mana, 46) && st.item('moon_herb') === 1, 'повторный сбор до возрождения: отказ, мана и трава прежние');
  // лечение: монет нет — ничего не меняется
  const poor = await d.session.runAction({ op: 'heal' });
  ok(!poor.ok && poor.reason === 'coins' && near(st.data.hp, 40) && st.item('coins') === 0, 'лечение без монет: отказ, HP и монеты прежние');
  await give(d, { inv: { coins: 20 } });
  const healed = await d.session.runAction({ op: 'heal' });
  ok(healed.ok && healed.price === 8 && st.data.hp === 120 && st.item('coins') === 12, 'лечение: −8 монет и полное HP одной операцией сервера');
  // ответ потерялся: повтор того же id не лечит и не списывает второй раз
  await setVitals(d, { hp: 100, mana: 50 });
  srv.loseNextResponse = true;
  const lostReply = await d.session.runAction({ op: 'heal', id: 'heal-retry-0001' });
  const again = device(srv, d.storage); await again.session.restore();
  ok(lostReply.ok && again.state.item('coins') === 10 && again.state.data.hp === 120, 'потерянный ответ: повтор с тем же id — одно списание (2 монеты)');
  // стартовый набор: один раз, даже с двух устройств
  const a = await d.session.runAction({ op: 'starter_kit' });
  const b = await again.session.runAction({ op: 'starter_kit' });
  const fresh = device(srv, d.storage); await fresh.session.restore();
  ok(a.ok && !b.ok && b.reason === 'already' && fresh.state.item('elixir_life') === 1 && fresh.state.item('elixir_mana') === 1 && fresh.state.hasEvent('mirra_starter_kit'), 'стартовый набор выдан ровно один раз (два устройства)');
  // нет связи: ничего не меняется
  srv.offline = true;
  const off = await fresh.session.runAction({ op: 'heal' });
  srv.offline = false;
  ok(!off.ok && off.reason === 'network', 'без связи лечение не выполняется и ничего не списывает');
}

console.log('\nv0.9.1. Действие сервера, пока мир «живёт» (регрессия: ложное «Нет связи», player_action не вызывался)');
{
  const rpcCalls = (from, name) => srv.calls.slice(from).filter(c => c.path === `/rest/v1/rpc/${name}`).length;
  /** Мир крутится как ExplorationScene.update: каждые ~4 мс кадр 16 мс (общая функция advanceWorld). */
  const runWorld = (st, actions, { freeze = true } = {}) => {
    const w = { changedWhileBusy: 0, frames: 0 };
    let last = null;
    const id = setInterval(() => {
      const busy = actions ? serverActionBusy({ actions }) : false;
      const before = st.data.stats.playTimeMs;
      srv.advance(16);   // часы идут: клиент и (модельный) сервер восстанавливают HP и ману по одному времени
      advanceWorld(st, 16, { frozen: freeze && busy, inHouse: true, nowMs: srv.now() });
      w.frames++;
      const after = st.data.stats.playTimeMs;
      if (busy && before !== after) w.changedWhileBusy++;
      last = after;
    }, 4);
    w.stop = () => clearInterval(id);
    return w;
  };

  const d = device(srv);
  await d.session.playAsGuest('witch');
  const st = d.state;
  const actions = new PlayerActions({ state: st, getSession: () => d.session });
  await give(d, { quests: ['unlock_telekinesis_1'], inv: { coins: 40 } });
  await setVitals(d, { hp: 50, mana: 10 });

  // 1) медленный сервер (500 мс) + мир идёт: стартовый набор
  srv.delayMs = 500;
  const world = runWorld(st, actions);
  await new Promise(r => setTimeout(r, 60));          // мир успел «пожить»: время игры, HP и мана изменились (dirty)
  ok(d.session.dirty, 'перед действием есть несохранённые изменения (время игры, восстановление)');
  let from = srv.calls.length;
  const kit = await actions.starterKit();
  ok(kit.ok, `стартовый набор выдан при медленном сервере и живом мире (ответ: ${JSON.stringify(kit)})`);
  ok(rpcCalls(from, 'sync_player') <= 1 && rpcCalls(from, 'player_action') === 1, `перед действием не больше одного sync_player, затем ровно один player_action (sync: ${rpcCalls(from, 'sync_player')}, action: ${rpcCalls(from, 'player_action')})`);
  ok(world.changedWhileBusy === 0, 'пока действие выполняется, время игры не идёт (мир стоит)');
  ok(st.item('elixir_life') === 1 && st.item('elixir_mana') === 1 && st.hasEvent('mirra_starter_kit'), 'в сумке 1 Настой жизни и 1 Лунный эликсир, событие отмечено');
  await new Promise(r => setTimeout(r, 40));
  ok(st.data.stats.playTimeMs > 0 && world.frames > 10, 'после действия мир снова идёт');

  // 2) повторный разговор: второго набора нет, и это не «нет связи»
  from = srv.calls.length;
  const kit2 = await actions.starterKit();
  ok(!kit2.ok && kit2.reason === 'already' && st.item('elixir_life') === 1, 'повторно набор не выдаётся (reason: already, не network)');

  // 3) лечение при медленном сервере: player_action один раз, полное HP, списаны монеты по цене сервера
  await setVitals(d, { hp: 37, mana: 10 });
  const coins0 = st.item('coins');
  from = srv.calls.length;
  const heal = await actions.heal();
  ok(heal.ok && heal.price > 0 && st.data.hp === 120 && st.item('coins') === coins0 - heal.price, `лечение: HP 120/120, −${heal.price} монет (ответ: ${JSON.stringify(heal)})`);
  ok(rpcCalls(from, 'player_action') === 1 && rpcCalls(from, 'sync_player') <= 1, 'лечение: один sync_player перед действием и один player_action');

  // 4) двойное нажатие: второе — «занято», сервер получает одно действие, одно списание
  await setVitals(d, { hp: 60, mana: 10 });
  const coins1 = st.item('coins');
  from = srv.calls.length;
  const [h1, h2] = await Promise.all([actions.heal(), actions.heal()]);
  ok(h1.ok && !h2.ok && h2.reason === 'busy' && rpcCalls(from, 'player_action') === 1 && st.item('coins') === coins1 - h1.price, 'двойное нажатие: одно действие на сервере, одно списание');

  // 5) несколько действий подряд — ни одного ложного 'network'
  const seq = [];
  for (const op of ['heal', 'starter_kit', 'heal']) seq.push(await actions.run({ op }));
  ok(seq.every(r => r.reason !== 'network'), `несколько действий подряд без ложного «Нет связи» (${seq.map(r => r.ok ? 'ok' : r.reason).join(', ')})`);
  world.stop();

  // 6) даже если что-то меняет состояние во время запроса (мир не заморожен), flush — барьер, а не «догонялки»:
  //    до v0.9.1 это давало 5 sync_player подряд и ложное reason:'network' без вызова player_action
  await setVitals(d, { hp: 80, mana: 10 });
  const live = runWorld(st, null, { freeze: false });
  await new Promise(r => setTimeout(r, 30));
  from = srv.calls.length;
  const r6 = await d.session.runAction({ op: 'heal' });
  live.stop();
  ok(r6.ok && rpcCalls(from, 'player_action') === 1 && rpcCalls(from, 'sync_player') <= 2, `состояние меняется каждый кадр — действие всё равно доходит до сервера (sync: ${rpcCalls(from, 'sync_player')}, ответ: ${JSON.stringify(r6)})`);
  from = srv.calls.length;
  const live2 = runWorld(st, null, { freeze: false });
  await new Promise(r => setTimeout(r, 30));
  const fl = await d.session.flush();
  live2.stop();
  ok(fl === true && rpcCalls(from, 'sync_player') === 1, `обычное автосохранение при живом мире — один sync_player, не пять (было ${rpcCalls(from, 'sync_player')})`);
  srv.delayMs = 0;

  // 7) после перезагрузки набор и лечение на месте
  await d.session.flush();
  const re = device(srv, d.storage); await re.session.restore();
  ok(re.state.item('elixir_life') === 1 && re.state.item('elixir_mana') === 1 && re.state.hasEvent('mirra_starter_kit'), 'после перезагрузки набор в сумке, событие сохранено');

  // 8) ошибки различаются: сервер 5xx/4xx — 'server', без связи — 'network'
  const origRoute = srv.route;
  srv.route = async function (m, u, h, b) { return u.pathname.endsWith('/player_action') ? this.reply(500, { code: 'XX000', message: 'boom' }) : origRoute.call(this, m, u, h, b); };
  re.state.data.player = { x: 101, y: 1 }; re.state.save();
  const e500 = await re.session.runAction({ op: 'heal' });
  srv.route = async function (m, u, h, b) { return u.pathname.endsWith('/sync_player') ? this.reply(400, { code: '22023', message: 'bad_patch' }) : origRoute.call(this, m, u, h, b); };
  re.state.data.player = { x: 102, y: 1 }; re.state.save();
  const e400 = await re.session.runAction({ op: 'heal' });
  srv.route = origRoute;
  ok(e500.reason === 'server' && e500.error?.rpc === 'player_action' && e500.error?.status === 500 && re.session.status === 'ready', `ошибка сервера в player_action — reason 'server' с деталями, не «Нет связи» (${JSON.stringify(e500)})`);
  ok(e400.reason === 'server' && e400.error?.rpc === 'sync_player' && e400.error?.status === 400, `сервер отверг sync_player — reason 'server', не network (${JSON.stringify(e400)})`);
  srv.offline = true;
  re.state.data.player = { x: 103, y: 1 }; re.state.save();
  const eNet = await re.session.runAction({ op: 'heal' });
  srv.offline = false;
  ok(!eNet.ok && eNet.reason === 'network', 'настоящая потеря связи — reason network');
  await re.session.retryNow();
}

console.log('\nv0.9.2. Герой (ведьма / колдун) — метаданные профиля: создание, регистрация, вход, новая игра');
{
  const rpcBodies = (from, name) => srv.calls.slice(from).filter(c => c.path === `/rest/v1/rpc/${name}`).map(c => c.body);
  // новый гость-колдун: hero уходит только в create_player, профиль хранит warlock
  const d = device(srv);
  let from = srv.calls.length;
  await d.session.playAsGuest('warlock');
  ok(rpcBodies(from, 'create_player').some(b => b?.hero === 'warlock') && d.session.hero === 'warlock', 'гость-колдун: create_player { hero: "warlock" }, профиль — warlock');
  await play(d);
  ok(srv.calls.filter(c => c.path === '/rest/v1/rpc/sync_player').every(c => !('hero' in (c.body?.patch || {})) && !('heroId' in (c.body?.patch || {}))), 'герой не входит в обычные patch прогресса (sync_player)');
  const back = device(srv, d.storage); await back.session.restore();
  ok(back.session.hero === 'warlock' && back.state.item('lunar_shard') === 1, 'перезапуск: тот же колдун и его прогресс');

  // новая регистрация колдуна → вход с другого устройства восстанавливает колдуна
  const r = device(srv);
  const nickW = nickLat('Kolya');
  await r.session.registerNew({ hero: 'warlock', nickname: nickW, password: PASS, password2: PASS });
  const other = device(srv); await other.session.login({ nickname: nickW, password: PASS });
  ok(r.session.hero === 'warlock' && other.session.hero === 'warlock', 'регистрация колдуна: вход с другого устройства — колдун');

  // аккаунт ведьмы: вход с устройства, где выбран предпросмотр колдуна, загружает ведьму (выбор не передаётся при входе)
  const wv = device(srv); const nickV = nickLat('Vedma');
  await wv.session.registerNew({ hero: 'witch', nickname: nickV, password: PASS, password2: PASS });
  await play(wv, { coins: 7 });
  const pick = device(srv);   // на этом устройстве в меню выбран колдун — это только предпросмотр, на сервер не уходит
  from = srv.calls.length;
  await pick.session.login({ nickname: nickV, password: PASS });
  ok(pick.session.hero === 'witch' && !rpcBodies(from, 'create_player').length && !rpcBodies(from, 'reset_player').length && pick.state.item('coins') === 7,
    'предпросмотр колдуна → вход в аккаунт ведьмы: ведьма, прогресс на месте, профиль не переписан');
  const pick2 = device(srv);   // обратный случай: предпросмотр ведьмы → аккаунт колдуна
  await pick2.session.login({ nickname: nickW, password: PASS });
  ok(pick2.session.hero === 'warlock', 'предпросмотр ведьмы → вход в аккаунт колдуна: колдун');

  // подтверждённая новая игра: reset_player с выбранным героем; без аргумента — прежний герой
  await pick.session.resetProgress('warlock');
  ok(pick.session.hero === 'warlock' && pick.state.item('coins') === 0, 'новая игра колдуном: reset_player меняет героя и обнуляет прогресс');
  await pick.session.resetProgress();
  ok(pick.session.hero === 'warlock', 'новая игра без выбора — герой прежний');

  // неизвестный id в профиле: показываем ведьмой, но сам id не переписываем
  const u = device(srv); await u.session.playAsGuest('witch');
  if (BACKEND === 'pg') pg(`update public.profiles set hero_id = 'druid' where id = '${u.session.userId}'`);
  else srv.players.get(u.session.userId).hero = 'druid';
  const u2 = device(srv, u.storage); await u2.session.restore();
  await play(u2);
  const u3 = device(srv, u.storage); await u3.session.restore();
  ok(u2.session.hero === 'druid' && heroById(u2.session.hero).id === 'witch' && u3.session.hero === 'druid', 'неизвестный герой профиля: показ — ведьма, значение в профиле не переписано после сохранения');

  // старый профиль без hero_id — ведьма
  const o = device(srv); await o.session.playAsGuest('witch');
  if (BACKEND === 'pg') pg(`update public.profiles set hero_id = null where id = '${o.session.userId}'`);
  else srv.players.get(o.session.userId).hero = null;
  const o2 = device(srv, o.storage); await o2.session.restore();
  ok(o2.session.hero === 'witch', 'старый профиль без героя — ведьма');
}

console.log('\nv0.10.0. Крафт и сюжетные предметы — одной операцией сервера');
{
  const d = device(srv);
  await d.session.playAsGuest('witch');
  const st = d.state;
  const actions = new PlayerActions({ state: st, getSession: () => d.session });
  await give(d, { inv: { moon_herb: 4, tree_resin: 2, rune_dust: 3, lunar_flame: 2 } });
  let r = await actions.craft('lunar_wick');
  ok(!r.ok && r.reason === 'locked' && st.item('moon_herb') === 4, 'фитиль до знакомства с алтарём: рецепт неизвестен, ничего не потрачено');
  await give(d, { quests: ['lunar_quest_start'] });
  r = await actions.craft('lunar_wick');
  ok(!r.ok && r.reason === 'missing' && r.missing.join() === 'lunar_flame' && st.item('moon_herb') === 4 && st.item('lunar_flame') === 2, 'не хватает огонька: остальные ингредиенты не тратятся');
  await give(d, { inv: { lunar_flame: 1 } });
  // ответ на первую попытку потерялся: повтор того же id возвращает сохранённый результат, второго фитиля нет
  srv.loseNext = 1;
  r = await d.session.runAction({ op: 'craft', recipe: 'lunar_wick', id: 'wick-0000-retry' });
  const re = device(srv, d.storage); await re.session.restore();
  ok(r.ok && r.duplicate && r.result === 'lunar_wick' && re.state.item('lunar_wick') === 1 && re.state.item('lunar_flame') === 0 && re.state.hasEvent('lunar_wick_crafted') && re.state.data.heroXP === 15,
    'потерянный ответ: повтор того же id — сохранённый результат, один фитиль, огоньки списаны один раз, +15 опыта один раз');
  // новый id не обходит уже выполненное: второй фитиль не варится (с двух устройств тоже)
  const r2 = await re.session.runAction({ op: 'craft', recipe: 'lunar_wick' });
  ok(!r2.ok && r2.reason === 'done', 'второй фитиль с новым id — отказ «уже изготовлен»');
  // применение: событие, награда и списание вместе; повтор не даёт второй награды
  const before = re.state.data.heroXP;
  const u1 = await re.session.runAction({ op: 'use', item: 'lunar_wick' });
  const u2 = await re.session.runAction({ op: 'use', item: 'lunar_wick' });
  ok(u1.ok && !u2.ok && u2.reason === 'done' && re.state.hasEvent('lunar_quest_complete') && re.state.item('lunar_wick') === 0 && re.state.data.heroXP === before + 50
    && re.state.data.schoolXP.telekinesis >= 150 && re.state.item('lunar_shard') >= 5, 'фитиль у алтаря: свет, +50 опыта и гарантия цены ТК II — один раз');
  // ремонт: без маны ничего не меняется
  await give(re, { quests: ['chapter_trial_defeated', 'unlock_seal_1'], inv: { restoration_bundle: 1 } });
  await setVitals(re, { hp: null, mana: 5 });
  const m1 = await re.session.runAction({ op: 'use', item: 'restoration_bundle' });
  ok(!m1.ok && m1.reason === 'mana' && re.state.item('restoration_bundle') === 1 && !re.state.hasEvent('chapter_1_complete'), 'ремонт без 20 маны: связка и узел не тронуты');
  await setVitals(re, { hp: null, mana: 50 });
  const m2 = await re.session.runAction({ op: 'use', item: 'restoration_bundle' });
  ok(m2.ok && re.state.hasEvent('chapter_1_complete') && re.state.item('restoration_bundle') === 0 && near(re.state.data.mana, 30), 'ремонт: связка и ровно 20 маны одной операцией, узел восстановлен');
  // миграция: ядро Стража — только если его нет и связку не делали; повтор ничего не даёт
  const g = device(srv); await g.session.playAsGuest('witch');
  await give(g, { enemies: ['forest_guardian_01'] });
  const g1 = await g.session.runAction({ op: 'migrate_v10' }), g2 = await g.session.runAction({ op: 'migrate_v10' });
  ok(g1.ok && g1.core === 1 && !g2.ok && g2.reason === 'already' && g.state.item('rare_core') === 1, 'миграция старого сейва: одно ядро Стража, повтор не выдаёт второе');
}

console.log('\nv0.12.0. HP и мана на сервере: восстановление по времени сервера (в том числе офлайн), бой, зелья');
{
  const d = device(srv);
  await d.session.playAsGuest('witch');
  const st = d.state, uid = d.session.userId;
  const acts = new PlayerActions({ state: st, getSession: () => d.session });
  const reload = async () => { const x = device(srv, d.storage); await x.session.restore(); return x; };
  const HOUSE = { x: 700, y: 5000 }, FOREST = { x: 2000, y: 2000 };

  // 1) офлайн: игрок ушёл, прошла минута — HP 1/с, мана 0,5/с в мире
  st.data.player = { ...FOREST }; st.save(); await d.session.flush();
  await setVitals(d, { hp: 10, mana: 0 });
  srv.timeTravel(uid, 60);
  let x = await reload();
  ok(near(x.state.data.hp, 70) && near(x.state.data.mana, 30), `минута офлайн в лесу: +60 HP, +30 маны (HP ${x.state.data.hp.toFixed(1)}, мана ${x.state.data.mana.toFixed(1)})`);
  // 2) дом Мирры: мана 2/с, HP 1/с
  st.data.player = { ...HOUSE }; st.save(); await d.session.flush();
  await setVitals(d, { hp: 10, mana: 0 });
  srv.timeTravel(uid, 30);
  x = await reload();
  ok(near(x.state.data.mana, 60) && near(x.state.data.hp, 40), 'полминуты офлайн в доме Мирры: мана +60 (2/с), HP +30');
  // 3) предел: сутки офлайн = полный запас, не больше максимума
  srv.timeTravel(uid, 86400);
  x = await reload();
  ok(x.state.data.hp === 120 && x.state.data.mana === 100, 'сутки офлайн: ровно максимум, без превышения');

  // 4) бой: восстановление стоит, лечение и зелья закрыты, потраченная мана не считается
  st.data.player = { ...FOREST }; st.save(); await give(d, { inv: { coins: 50, elixir_life: 2 } });
  await setVitals(d, { hp: 50, mana: 40 });
  await give(d, { abilities: { telekinesis: { level: 1, unlocked: true } } });
  const cs = await acts.combatStart('scavenger_01', 'forest_scavenger');
  ok(cs.ok && st.data.combatSince != null && st.data.combatCtx?.spawn === 'scavenger_01' && srv.rawVitals(uid).combat, 'combat_start: сервер знает о бое и запомнил состояние героя');
  ok(near(cs.hp, 50) && near(cs.mana, 40) && near(st.data.combatCtx.hp, 50) && near(st.data.combatCtx.mana, 40), 'запомнены HP и мана на старт боя (они же — в ответе)');
  srv.timeTravel(uid, 120);
  await d.session.flush({ force: true });
  ok(near(st.data.hp, 50) && near(st.data.mana, 40), 'во время боя время не засчитывается (две минуты — ни HP, ни маны)');
  const h = await acts.heal(), dr = await acts.drink('elixir_life');
  ok(!h.ok && h.reason === 'combat' && !dr.ok && dr.reason === 'combat' && st.item('elixir_life') === 2 && st.item('coins') >= 50, 'в бою лечение у Мирры и зелья из сумки отказывают, ничего не списано');
  vitalsMod.spendMana(st, 5); await d.session.flush();
  ok(near(srv.rawVitals(uid).mana, 40), 'мана, потраченная в бою на устройстве, сервер не меняет');
  // 5) конец боя. С v0.14.0 победу и поражение не принимают «на слово»: сервер проигрывает запись действий
  const bad = await acts.run({ op: 'combat_end', outcome: 'cheat', mana: 100 });
  ok(!bad.ok && bad.reason === 'bad_outcome' && srv.rawVitals(uid).combat, 'неизвестный исход боя отклонён');
  for (const o of ['victory', 'defeat']) { const x = await acts.combatEnd(o, 100); ok(!x.ok && x.reason === 'verify' && srv.rawVitals(uid).combat, `combat_end ${o} без проверки записи отклонён (verify)`); }
  const ret = await acts.combatEnd('retreat');
  ok(ret.ok && near(st.data.hp, 50) && st.data.combatSince == null && st.data.combatCtx == null && !srv.rawVitals(uid).combat, 'отступление: HP не падает (50 остаётся 50; ниже 24 не опустится), бой закрыт, запомненное состояние очищено');
  ok((await acts.combatEnd('retreat')).reason === 'no_combat', 'повторный конец боя ничего не даёт (боя нет)');
  // 6) бой, о конце которого сервер не узнал: через 15 минут — отступление, дальше время идёт
  await setVitals(d, { hp: 5, mana: 10 });
  await acts.combatStart('rootling_05', 'rootling');
  srv.timeTravel(uid, 14 * 60);
  await d.session.flush({ force: true });
  ok(near(st.data.hp, 5, 2) && st.data.combatSince != null, '14 минут боя без вестей: сервер ещё ждёт итога');
  srv.timeTravel(uid, 3 * 60);
  await d.session.flush({ force: true });
  ok(st.data.combatSince == null && st.data.hp >= 24 && st.data.hp < 24 + 125, 'через 15 минут бой считается отступлением: HP не ниже 24, затем обычное восстановление (+2 минуты)');

  // 7) зелья вне боя: расход и результат решает сервер
  await give(d, { inv: { elixir_mana: 1 } });
  await setVitals(d, { hp: 100, mana: 100 });
  const full = await acts.drink('elixir_mana');
  ok(!full.ok && full.reason === 'full' && st.item('elixir_life') === 2, 'полный запас: зелье не тратится');
  const dh = await acts.drink('elixir_life');
  ok(dh.ok && dh.kind === 'heal' && near(dh.amount, 20, 1) && st.item('elixir_life') === 1 && near(st.data.hp, 120), 'настой жизни: добавлено только недостающее, списан один');
  ok((await acts.drink('resin_flask')).reason === 'unknown' && (await acts.drink('nonsense')).reason === 'unknown', 'боевая склянка и выдуманный предмет вне боя не работают');
  await setVitals(d, { hp: 120, mana: 10 });
  const dm = await acts.drink('elixir_mana');
  ok(dm.ok && near(dm.amount, 60, 1) && near(st.data.mana, 70), 'лунный эликсир: +60% маны');

  // 8) действие в мире: мана списывается на сервере, а не отчётом клиента
  await setVitals(d, { hp: 120, mana: 80 });
  const gw = await d.session.runAction({ op: 'world', obj: 'mush_t1' });
  ok(gw.ok && near(st.data.mana, 76) && near(srv.rawVitals(uid).mana, 76), 'сбор в мире: на устройстве и на сервере 76 маны');
  // 9) новый уровень не лечит
  await setVitals(d, { hp: 50, mana: 50 });
  await give(d, { xp: st.data.heroXP + 100 });
  ok(st.data.heroLevel >= 2 && near(st.data.hp, 50) && near(st.data.mana, 50), 'повышение уровня не восстанавливает HP и ману втихую');
  // 10) нет связи: бой не начинается
  srv.offline = true;
  const off = await acts.combatStart('rootling_05', 'rootling');
  srv.offline = false; await d.session.retryNow();
  ok(!off.ok && off.reason === 'network' && st.data.combatSince == null, 'без связи бой не начинается (сервер не узнал о нём)');

  // 11) v0.14.0: бой проверяет сервер
  // 5б) настоящий бой: бот играет, действия записываются, сервер проигрывает запись
  await setVitals(d, { hp: 120, mana: 100 });
  await acts.combatStart('scavenger_01', 'forest_scavenger');
  const ctx1 = st.data.combatCtx;
  const play = playBot(ctx1, { seed: 3, potions: false });
  ok(play.cm.result === 'victory', `бот победил Падальщика (${play.log.ticks} шагов)`);
  const forged = await acts.combatSubmit({ v: 1, ticks: 99999999, ev: [], hold: [] });
  ok(!forged.ok && forged.reason === 'bad_log' && st.data.combatSince != null, 'испорченная запись: отказ bad_log, бой остаётся открытым');
  const fast = await acts.combatSubmit(play.log);
  ok(!fast.ok && fast.reason === 'too_fast' && st.data.combatSince != null, 'запись длиннее, чем прошло времени с начала боя: отказ too_fast');
  srv.timeTravel(uid, Math.ceil(play.log.ticks * STEP) + 2);
  const coins0 = st.item('coins'), lifes0 = st.item('elixir_life');
  const win = await acts.combatSubmit(play.log);
  ok(win.ok && win.verdict.outcome === 'victory' && st.data.combatSince == null && st.data.combatCtx == null && !srv.rawVitals(uid).combat, 'победа: сервер проиграл запись и засчитал; бой закрыт');
  ok(st.data.hp === vitalsMod.maxHp(st) && near(st.data.mana, play.cm.hero.mana, 1e-6), 'победа: HP полное (по новому уровню), мана — остаток боя, как у устройства');
  ok(st.isEnemyDefeated('scavenger_01') && st.item('coins') === coins0 + 15 && st.data.heroXP >= 70 && win.outcome.items.coins === 15 && win.outcome.heroXP === 70, 'победа: враг побеждён, награда выдана сервером (+70 опыта, +15 монет)');
  ok(st.item('elixir_life') === lifes0 && st.item('elixir_mana') === 0 + st.item('elixir_mana'), 'зелья не тронуты, если не пили');
  ok(st.data.stats.combats.at(-1)?.spawnId === 'scavenger_01' && st.data.stats.combats.at(-1).result === 'victory', 'история боёв дополнена сервером');
  ok((await acts.combatSubmit(play.log)).reason === 'no_combat', 'та же запись второй раз: боя нет — ничего не выдано');
  // 5в) поражение: бездействие. Монеты −5, HP — доля максимума
  await setVitals(d, { hp: 120, mana: 100 });
  await acts.combatStart('rootling_04', 'rootling');
  const idle = playBot(st.data.combatCtx, { policy: 'idle', maxTicks: 60 * 100, potions: false });
  srv.timeTravel(uid, Math.ceil(idle.log.ticks * STEP) + 2);
  const coins1 = st.item('coins');
  const lose = await acts.combatSubmit(idle.log);
  ok(lose.ok && lose.verdict.outcome === 'defeat' && st.data.hp === Math.ceil(vitalsMod.maxHp(st) * 0.2) && st.item('coins') === coins1 - 5 && !st.isEnemyDefeated('rootling_04'), 'поражение: 20% максимума HP, −5 монет, враг не побеждён');
  // 5г) побеждённый враг, который не возрождается, повторно не засчитывается
  await acts.combatStart('scavenger_01', 'forest_scavenger');
  const again = await acts.combatSubmit({ v: 1, ticks: 10, ev: [], hold: [] });
  ok(!again.ok && again.reason === 'down', 'враг уже побеждён: бой на этом месте не засчитывается (down)');
  await acts.combatEnd('retreat');
}

console.log('\nv0.13.0. Действия в мире — на сервере: сбор, находки, запасы, магия');
{
  const d = device(srv);
  await d.session.playAsGuest('witch');
  const st = d.state, uid = d.session.userId;
  const W = (id, extra = {}) => d.session.runAction({ op: 'world', obj: id, ...extra });
  const mana = () => srv.rawVitals(uid).mana;
  await setVitals(d, { hp: null, mana: 50 });

  // 1) сбор: ману списывает и ресурс выдаёт сервер; возрождение — по времени сервера
  const a = await W('herb_g1');
  ok(a.ok && a.kind === 'gather' && st.item('moon_herb') === 1 && near(mana(), 46) && st.getObject('herb_g1').state === 'picked', 'сбор: +1 трава, −4 маны, состояние записал сервер');
  const b = await W('herb_g1');
  ok(!b.ok && b.reason === 'wait' && b.left > 140 && st.item('moon_herb') === 1 && near(mana(), 46), 'повторный сбор: «ещё не выросло» (осталось ~150 с), ничего не списано');
  srv.ageObject(uid, 'herb_g1', 140); await d.session.flush({ force: true });
  ok((await W('herb_g1')).reason === 'wait', 'через 140 из 150 секунд — всё ещё рано');
  srv.ageObject(uid, 'herb_g1', 15);
  const c = await W('herb_g1');
  ok(c.ok && st.item('moon_herb') === 2, 'через 155 секунд (по времени сервера) трава выросла: сбор прошёл');
  // 2) состояние объектов мира клиент записать не может: ни «сбросить», ни «выдумать»
  delete st.data.worldObjects.herb_g1; st.data.worldObjects.mush_t1 = { state: 'picked', t: 1 }; st.data.worldObjects.glade_cache = { state: 'opened' }; st.save();
  await d.session.flush({ force: true });
  ok(st.getObject('herb_g1')?.state === 'picked' && !st.getObject('mush_t1') && !st.getObject('glade_cache'), 'клиент не может сбросить время сбора или «открыть» сундук: сервер вернул своё состояние');
  ok((await W('herb_g1')).reason === 'wait', 'после попытки сбросить состояние сбор всё равно ждёт возрождения');
  // 3) мана: не хватает — отказ без побочных эффектов
  await setVitals(d, { hp: null, mana: 3 });
  const m = await W('mush_t1');
  ok(!m.ok && m.reason === 'mana' && m.mana === 4 && st.item('forest_mushroom') === 0 && near(mana(), 3) && !st.getObject('mush_t1'), 'не хватает маны: ничего не выдано, не записано, не списано');
  // 4) находки: один раз, награда по таблице (в том числе опыт)
  const xp0 = st.data.heroXP;
  const w1 = await W('west_chest');
  ok(w1.ok && w1.kind === 'loot' && st.item('lunar_shard') === 2 && st.item('rune_dust') === 1 && st.data.heroXP === xp0 + 15 && st.getObject('west_chest').state === 'opened', 'сундук: награда по правилам сервера (+40 монет, 2 осколка, пыль, 15 опыта)');
  const w2 = await W('west_chest');
  ok(!w2.ok && w2.reason === 'done' && st.item('rune_dust') === 1 && st.data.heroXP === xp0 + 15, 'сундук второй раз пустой');
  const other = device(srv, d.storage); await other.session.restore();
  ok((await other.session.runAction({ op: 'world', obj: 'west_chest' })).reason === 'done', 'второе устройство тоже не откроет открытый сундук');
  // 5) условия: побеждённый враг, событие
  const g0 = await W('guard_cache');
  ok(!g0.ok && g0.reason === 'locked' && st.item('rune_dust') === 1, 'сундук за врагом: пока враг жив — закрыт');
  await give(d, { enemies: ['lunar_guard'] });
  ok((await W('guard_cache')).ok && st.item('rune_dust') === 2, 'враг побеждён — сундук открывается');
  ok((await W('flame_a')).reason === 'locked', 'огонёк на ветке: сначала нужно задание алтаря');
  // 6) дар и его ступень, мана на магию
  await setVitals(d, { hp: null, mana: 100 });
  const h = await W('moon_plant');
  ok(!h.ok && h.reason === 'locked' && st.item('moon_herb') === 2, 'притянуть растение без дара Телекинеза: закрыто');
  await give(d, { abilities: { telekinesis: { level: 1, unlocked: true } } });
  const h2 = await W('moon_plant');
  ok(h2.ok && st.item('moon_herb') === 3 && near(mana(), 96), 'Телекинез открыт: растение притянуто, −4 маны, +1 трава одной операцией');
  ok((await W('heavy_boulder')).reason === 'locked' && near(mana(), 96), 'тяжёлая глыба при Телекинезе I: закрыто, мана на месте');
  // награда из-под камня: только когда камень сдвинут
  ok((await W('glade_rock_reward')).reason === 'locked', 'монеты под камнем: пока камень на месте — закрыто');
  const rk = await W('glade_rock');
  ok(rk.ok && rk.kind === 'cast' && near(mana(), 84) && st.getObject('glade_rock')?.state === 'moved', 'сдвиг среднего камня: −12 маны, состояние «сдвинут» записал сервер');
  ok((await W('corrupted_roots')).reason === 'locked', 'Огонь без дара: корни не поддаются');
  // 7) камень сдвинут (сервером) — награда под ним выдаётся один раз
  const c0 = st.item('coins');
  ok((await W('glade_rock_reward')).ok && st.item('coins') === c0 + 20 && (await W('glade_rock_reward')).reason === 'done', 'камень сдвинут: +20 монет один раз');
  // 8) запас под охраной: один победный цикл — одна выдача
  ok((await W('dust_stash')).reason === 'locked', 'запас пыли: пока охранник не побеждён — закрыт');
  await give(d, { enemies: ['rootling_02'] });
  const r0 = st.item('rune_dust');
  ok((await W('dust_stash')).ok && st.item('rune_dust') === r0 + 2 && (await W('dust_stash')).reason === 'done', 'запас: +2 пыли, второй раз за тот же цикл — нет');
  await give(d, { objects: { 'rep:rootling_02': { wins: 2, at: 1 } } });
  ok((await W('dust_stash')).ok && st.item('rune_dust') === r0 + 4, 'вторая победа над охранником — ещё одна выдача');
  // 9) выдуманные и служебные идентификаторы, бой, повтор запроса
  ok((await W('no_such_object')).reason === 'unknown' && (await W('__proto__')).reason === 'unknown' && (await W('constructor')).reason === 'unknown' && (await W(null)).reason === 'unknown', 'выдуманные и служебные идентификаторы: unknown');
  const acts = new PlayerActions({ state: st, getSession: () => d.session });
  await acts.combatStart('rootling_05', 'rootling');
  ok((await W('mush_t1')).reason === 'combat', 'в бою действия в мире закрыты');
  await acts.combatEnd('retreat');
  await setVitals(d, { hp: null, mana: 50 });
  srv.loseNextResponse = true;
  const lost = await d.session.runAction({ op: 'world', obj: 'mush_t1', id: 'world-retry-0001' }).catch(() => null);
  const again = device(srv, d.storage); await again.session.restore();
  ok(again.state.item('forest_mushroom') === 1 && near(srv.rawVitals(uid).mana, 46), 'потерянный ответ: узел собран один раз, мана списана один раз');
  // 10) без связи
  srv.offline = true;
  const off = await W('resin_t1');
  srv.offline = false; await d.session.retryNow();
  ok(!off.ok && off.reason === 'network' && st.item('tree_resin') === 0, 'без связи сбор не проходит: ничего не выдано');
}

console.log('\nv0.15.0. Прогресс закрыт для sync_player: игра показывает сразу, сервер подтверждает операциями');
{
  const d = device(srv); await d.session.playAsGuest('witch');
  const st = d.state, uid = d.session.userId;
  const bus = new EventBus();
  const actions = new PlayerActions({ state: st, getSession: () => d.session, bus });
  const quests = new QuestFlags(st, bus), abilities = new AbilitySystem(st, quests, bus), log = new QuestLog(st, bus);
  const dialogue = new DialogueSystem({ state: st, log, bus });
  quests.mirror = log.mirror = dialogue.mirror = abilities.mirror = (a) => actions.mirror(a);
  const real = () => d.api.getPlayer(d.session.auth.access_token);
  const settle = async () => { await actions.chain; };

  // событие-дар: сразу видно у себя, на сервере — дар и событие
  abilities.unlock('telekinesis', 1); quests.complete('unlock_telekinesis_1');
  ok(st.isUnlocked('telekinesis') && st.hasEvent('unlock_telekinesis_1'), 'дар виден сразу, не дожидаясь сервера');
  await settle();
  let r = await real();
  ok(r.quests.includes('unlock_telekinesis_1') && r.abilities.telekinesis?.unlocked && r.abilities.telekinesis.level === 1, 'сервер подтвердил: событие и Телекинез I записаны им');

  // закрытое условие: Огонь без пройденного пути — сервер отказывает, у игрока всё откатывается
  abilities.unlock('fire', 1); quests.complete('unlock_fire_1');
  ok(st.isUnlocked('fire'), 'локально Огонь «получен» (до ответа сервера)');
  await settle();
  r = await real();
  ok(!r.quests.includes('unlock_fire_1') && !r.abilities.fire?.unlocked && !st.hasEvent('unlock_fire_1') && !st.isUnlocked('fire'), 'сервер отказал (путь не открыт): Огонь у игрока снова закрыт');
  const xpBefore = r.xp;
  await give(d, { quests: ['heavy_path_open'] });
  abilities.unlock('fire', 1); quests.complete('unlock_fire_1'); await settle();
  r = await real();
  ok(r.quests.includes('unlock_fire_1') && r.abilities.fire?.unlocked && r.xp === xpBefore + 30 && st.data.heroXP === r.xp, 'путь открыт: Огонь выдан, награда события (+30 опыта) — одна, у игрока и на сервере поровну');

  // события: диалог, выдуманные ключи
  dialogue.runEffects([{ event: 'prologue_seen' }]); await settle();
  ok((await real()).quests.includes('prologue_seen'), 'событие из диалога подтверждено сервером');
  const forged = await actions.event('chapter_1_complete');
  ok(!forged.ok && forged.reason === 'unknown' && !(await real()).quests.includes('chapter_1_complete'), 'выдуманное событие: сервер не знает такого действия');
  const again = await actions.event('prologue_seen');
  ok(!again.ok && again.reason === 'already', 'то же событие второй раз — отказ, награда не повторяется');

  // побочное задание: принять, сдать; чужое не сдать
  await give(d, { inv: { moon_herb: 3 } });
  ok(log.status('sq_herbs') === 'ready' || log.status('sq_herbs') === 'available', 'задание доступно на устройстве');
  const coins0 = st.item('coins');
  log.accept('sq_herbs'); await settle();
  ok((await real()).quests.includes('sq_herbs_start'), 'принятое задание записал сервер');
  log.turnIn('sq_herbs'); await settle();
  r = await real();
  ok(r.quests.includes('sq_herbs_done') && !r.inventory.moon_herb && r.inventory.coins === coins0 + 25 && r.inventory.elixir_life >= 1 && st.item('coins') === coins0 + 25, 'сдача: травы списаны, награда выдана один раз, у игрока и на сервере поровну');
  const t2 = await actions.questTurnIn('sq_herbs');
  ok(!t2.ok && t2.reason === 'already', 'повторная сдача — отказ');
  const t3 = await actions.questTurnIn('sq_hunter');
  ok(!t3.ok && t3.reason === 'not_started', 'сдать задание, которое не принято, нельзя');
  const t4 = await actions.questAccept('sq_nope');
  ok(!t4.ok && t4.reason === 'unknown', 'выдуманное задание — unknown');

  // изучение: цена и условия — на сервере, время — по часам сервера
  await give(d, { xp: 1260, school: { telekinesis: 150 }, inv: { lunar_shard: 5, moon_herb: 2, rune_dust: 1 }, quests: ['lunar_quest_complete'] });
  abilities.startResearch('telekinesis_2');
  ok(!!st.data.research, 'изучение началось сразу у игрока');
  await settle();
  r = await real();
  ok(r.research?.upgradeId === 'telekinesis_2' && r.school.telekinesis === 0 && !r.inventory.lunar_shard && r.quests.includes('telekinesis_2_start'), 'сервер записал изучение: цена списана, старт отмечен');
  abilities.update(true);   // «время вышло» по часам устройства
  await settle();
  r = await real();
  ok(r.abilities.telekinesis.level === 1 && !!r.research && !!st.data.research && abilities.holdUntil > st.now(), 'сервер время не засчитал: дар прежний, изучение продолжается, повторять не торопимся');
  await give(d, { research: { upgradeId: 'telekinesis_2', startedAt: 1, durationMs: 1 } });
  abilities.holdUntil = 0;
  abilities.update(); await settle();
  r = await real();
  ok(r.abilities.telekinesis.level === 2 && !r.research && r.quests.includes('telekinesis_2_complete') && st.data.telekinesisLevel === 2 && !st.data.research, 'время вышло по часам сервера: Телекинез II, событие завершения — одно');
  const noRes = await actions.researchFinish();
  ok(!noRes.ok && noRes.reason === 'none', 'завершать нечего — отказ');
  const rs = await actions.researchStart('fire_2');
  ok(!rs.ok && ['missing', 'locked', 'event'].includes(rs.reason), 'Огонь II без опыта, углей и уровня — отказ, ничего не списано');

  // билд: смена ветки без ветки и за чужие деньги не проходит
  const rsp = await actions.respec('telekinesis', 'lord');
  ok(!rsp.ok && rsp.reason === 'unavailable', 'смена ветки, которой нет, — отказ');

  // v0.16.0: слоты даров, амулеты и пресет — локально сразу, сервер подтверждает; подделка откатывается снимком сервера
  await give(d, { abilities: { fire: { level: 2, unlocked: true } }, inv: { amulet_focus: 1 } });
  await settle();
  st.setBuild({ slots: ['fire'] }); st.save();
  const bs = await actions.buildSet({ slots: ['fire'] });
  ok(bs.ok, 'слоты даров: сервер принял');
  await settle();
  r = await real();
  ok(JSON.stringify(r.objects.player_build?.slots) === '["fire"]' && JSON.stringify(st.buildData().slots) === '["fire"]', 'слоты записаны на сервере и у игрока');
  st.setBuild({ amulets: ['amulet_focus'] });
  const ba = await actions.buildSet({ amulets: ['amulet_focus'] });
  ok(ba.ok, 'амулет из сумки: сервер принял');
  await settle();
  r = await real();
  ok(JSON.stringify(r.objects.player_build?.amulets) === '["amulet_focus"]', 'амулет записан на сервере');
  const bf = await actions.buildSet({ amulets: ['amulet_lunar'] });
  ok(!bf.ok && bf.reason === 'missing', 'амулет, которого нет в сумке, сервер отклоняет');
  const bp = await actions.buildPreset('save');
  ok(bp.ok, 'пресет сохранён на сервере');

  // v0.17.0: сапфиры — только сервер: приветствие, ускорение изучения, пресет и смена ветки; «Новая игра» кошелёк не трогает
  const bw = await actions.bankWelcome();
  ok(bw.ok && st.sapphires() === 3, 'приветственные 3 сапфира пришли с сервера');
  ok((await actions.bankWelcome()).reason === 'already', 'второй раз приветствие не выдаётся');
  await give(d, { sapphires: 40, research: { upgradeId: 'seal_2', startedAt: st.now(), durationMs: 1800000 } });
  await settle();
  const su = await actions.researchSpeedup(1);
  ok(su.ok && su.price === 1 && st.data.research.durationMs === 900000 && st.sapphires() === 42, 'ускорение на 15 минут за 1 сапфир');
  const pu = await actions.presetUnlock();
  ok(pu.ok && st.buildData().presetSlots === 2 && st.sapphires() === 12, 'второй пресет открыт за 30 сапфиров');
  ok((await actions.presetUnlock()).reason === 'sapphires', 'на третий не хватает');
  r = await real();
  ok(r.wallet.sapphires === 12 && r.objects.player_build.presetSlots === 2, 'сервер хранит баланс и открытый пресет');
  await give(d, { research: null });
}

console.log('\n13–14. Старой «облачной» механики больше нет');
{
  const FORBIDDEN = ['Какое сохранение оставить', 'В облаке', 'На этом устройстве', 'Взять из облака', 'Оставить с устройства', 'Отправить в облако', 'Есть изменения, скоро отправим', 'showConflict', 'resolveConflict', 'pendingConflict'];
  const files = [];
  const walk = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|ts|html)$/.test(f.name)) files.push(p); } };
  walk(path.join(ROOT, 'src')); walk(path.join(ROOT, 'supabase')); files.push(path.join(ROOT, 'index.html'));
  const hits = [];
  for (const f of files) { const t = fs.readFileSync(f, 'utf8'); for (const w of FORBIDDEN) if (t.includes(w)) hits.push(`${path.relative(ROOT, f)}: «${w}»`); }
  ok(!hits.length, 'в коде нет окна выбора сохранения и кнопок «облака»' + (hits.length ? ': ' + hits.join('; ') : ''));
  ok(!fs.existsSync(path.join(ROOT, 'src/cloud/Account.js')), 'старый модуль облачного сейва удалён');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Сценарии аккаунта пройдены');
process.exit(failures ? 1 : 0);
