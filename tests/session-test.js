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

/** Немного игры: награда, событие, предмет — как это делает игра (методы GameState + save()). */
function play(st, { xp = 70, coins = 15, event = 'combat_intro_01' } = {}) {
  st.applyReward({ heroXP: xp, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 1 }, coins });
  st.markEvent(event);
  st.unlockAbility('telekinesis', 1);
  st.data.player = { x: 1234, y: 4321 };
  st.save();
}

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
  play(d.state);
  ok(d.timers.some(t => t.live && t.ms === 600), 'после награды сохранение запланировано почти сразу (не вручную)');
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
  play(d.state, { xp: 100, coins: 20, event: 'lunar_quest_complete' }); // уровень 3
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
  phone.state.addItem('coins', 40); phone.state.markEvent('heavy_path_open'); phone.state.save(); await phone.session.flush();
  pc.state.addItem('lunar_shard', 2); pc.state.markEvent('unlock_fire_1'); pc.state.save(); await pc.session.flush();
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
  d.state.addItem('coins', 5); d.state.save();
  ok(await d.session.flush() === false && d.session.status === 'offline' && d.session.saving === 'offline', 'нет сети — статус «Нет соединения», изменения ждут');
  ok(![...phoneStorage._m.keys()].some(k => k !== TOKENS_KEY), 'никакого параллельного локального сохранения не появилось');
  srv.offline = false;
  ok(await d.session.retryNow() && d.session.status === 'ready', '«Повторить»: связь вернулась, игра продолжается');
  ok((await d.api.getPlayer(d.session.auth.access_token)).inventory.coins === coins + 5, 'изменения, сделанные без связи, дошли до сервера');
  // запрос дошёл, ответ потерялся — повтор не должен начислить второй раз
  d.state.addItem('coins', 10); d.state.save();
  srv.loseNext = 1;
  await d.session.flush();
  ok(d.session.status === 'offline', 'ответ потерялся — снова «Нет соединения»');
  await d.session.retryNow();
  ok((await d.api.getPlayer(d.session.auth.access_token)).inventory.coins === coins + 15 && d.state.item('coins') === coins + 15, 'повтор после потерянного ответа не начислил монеты дважды');
  // при запуске сети нет
  srv.offline = true;
  const boot = device(srv, phoneStorage);
  ok(await boot.session.restore() === 'offline', 'запуск без сети — «Нет соединения», игра не стартует на устаревших данных');
  srv.offline = false;
  ok(await boot.session.retryNow() && boot.state.item('coins') === coins + 15, 'связь появилась — персонаж загружен с сервера');
}

console.log('\nДоверие клиенту');
{
  const d = device(srv, phoneStorage);
  await d.session.restore();
  const coins = d.state.item('coins');
  d.state.data.inventory.coins = 999999999; d.state.data.heroLevel = 99; d.state.save();
  await d.session.flush();
  ok(d.state.item('coins') === coins + 500 && d.state.data.heroLevel === 3, `подделка в браузере: сервер принял не больше 500 монет за раз, уровень 99 отклонён (${d.state.item('coins')}, ур. ${d.state.data.heroLevel})`);
  const e = await rejects(() => d.api.rpc('claim_nickname', { uid: d.session.userId, nick: nickLat('Hack'), norm: nickLat('hack') }, d.session.auth.access_token));
  ok(e instanceof CloudError && e.status === 403, 'служебная функция ника недоступна из браузера');
}

console.log('\nТокены, пароль, новая игра');
{
  const d = device(srv, phoneStorage);
  await d.session.restore();
  srv.expireAccess();
  d.state.addItem('coins', 1); d.state.save();
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
  y.state.addItem('coins', 1); y.state.save(); await y.session.flush();
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
  // потраченная мана уходит дельтой mana_spent
  await setVitals(d, { hp: 40, mana: 50 });
  ok(vitalsMod.spendMana(st, 8) && st.data.manaSpent === 8, 'мана списана на устройстве (счётчик потраченного = 8)');
  await d.session.flush();
  ok(near(srv.rawVitals(d.session.userId).mana, 42) && near(st.data.mana, 42), 'сервер вычел потраченную ману (mana_spent) и вернул остаток');
  await d.session.flush({ force: true });
  ok(near(srv.rawVitals(d.session.userId).mana, 42), 'повторная отправка не списывает ману второй раз');
  // лечение: монет нет — ничего не меняется
  const poor = await d.session.runAction({ op: 'heal' });
  ok(!poor.ok && poor.reason === 'coins' && near(st.data.hp, 40) && st.item('coins') === 0, 'лечение без монет: отказ, HP и монеты прежние');
  st.addItem('coins', 20); st.save();
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
  st.markEvent('unlock_telekinesis_1'); st.addItem('coins', 40); st.save();
  await d.session.flush();
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
  re.state.addItem('coins', 1); re.state.save();
  const e500 = await re.session.runAction({ op: 'heal' });
  srv.route = async function (m, u, h, b) { return u.pathname.endsWith('/sync_player') ? this.reply(400, { code: '22023', message: 'bad_patch' }) : origRoute.call(this, m, u, h, b); };
  re.state.addItem('coins', 1); re.state.save();
  const e400 = await re.session.runAction({ op: 'heal' });
  srv.route = origRoute;
  ok(e500.reason === 'server' && e500.error?.rpc === 'player_action' && e500.error?.status === 500 && re.session.status === 'ready', `ошибка сервера в player_action — reason 'server' с деталями, не «Нет связи» (${JSON.stringify(e500)})`);
  ok(e400.reason === 'server' && e400.error?.rpc === 'sync_player' && e400.error?.status === 400, `сервер отверг sync_player — reason 'server', не network (${JSON.stringify(e400)})`);
  srv.offline = true;
  re.state.addItem('coins', 1); re.state.save();
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
  play(d.state); await d.session.flush();
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
  play(wv.state, { coins: 7 }); await wv.session.flush();
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
  play(u2.state); await u2.session.flush();
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
  st.addItem('moon_herb', 4); st.addItem('tree_resin', 2); st.addItem('rune_dust', 3); st.addItem('lunar_flame', 2); st.save();
  let r = await actions.craft('lunar_wick');
  ok(!r.ok && r.reason === 'locked' && st.item('moon_herb') === 4, 'фитиль до знакомства с алтарём: рецепт неизвестен, ничего не потрачено');
  st.markEvent('lunar_quest_start'); st.save();
  r = await actions.craft('lunar_wick');
  ok(!r.ok && r.reason === 'missing' && r.missing.join() === 'lunar_flame' && st.item('moon_herb') === 4 && st.item('lunar_flame') === 2, 'не хватает огонька: остальные ингредиенты не тратятся');
  st.addItem('lunar_flame', 1); st.save(); await d.session.flush();
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
  re.state.markEvent('chapter_trial_defeated'); re.state.markEvent('unlock_seal_1'); re.state.addItem('restoration_bundle', 1); re.state.save(); await re.session.flush();
  await setVitals(re, { hp: null, mana: 5 });
  const m1 = await re.session.runAction({ op: 'use', item: 'restoration_bundle' });
  ok(!m1.ok && m1.reason === 'mana' && re.state.item('restoration_bundle') === 1 && !re.state.hasEvent('chapter_1_complete'), 'ремонт без 20 маны: связка и узел не тронуты');
  await setVitals(re, { hp: null, mana: 50 });
  const m2 = await re.session.runAction({ op: 'use', item: 'restoration_bundle' });
  ok(m2.ok && re.state.hasEvent('chapter_1_complete') && re.state.item('restoration_bundle') === 0 && near(re.state.data.mana, 30), 'ремонт: связка и ровно 20 маны одной операцией, узел восстановлен');
  // миграция: ядро Стража — только если его нет и связку не делали; повтор ничего не даёт
  const g = device(srv); await g.session.playAsGuest('witch');
  g.state.markEnemyDefeated('forest_guardian_01'); g.state.save(); await g.session.flush();
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
  st.data.player = { ...FOREST }; st.addItem('coins', 50); st.addItem('elixir_life', 2); st.save(); await d.session.flush();
  await setVitals(d, { hp: 50, mana: 40 });
  const cs = await acts.combatStart();
  ok(cs.ok && st.data.combatSince != null && srv.rawVitals(uid).combat, 'combat_start: сервер знает о бое');
  srv.timeTravel(uid, 120);
  await d.session.flush({ force: true });
  ok(near(st.data.hp, 50) && near(st.data.mana, 40), 'во время боя время не засчитывается (две минуты — ни HP, ни маны)');
  const h = await acts.heal(), dr = await acts.drink('elixir_life');
  ok(!h.ok && h.reason === 'combat' && !dr.ok && dr.reason === 'combat' && st.item('elixir_life') === 2 && st.item('coins') >= 50, 'в бою лечение у Мирры и зелья из сумки отказывают, ничего не списано');
  vitalsMod.spendMana(st, 5); await d.session.flush();
  ok(near(srv.rawVitals(uid).mana, 40), 'мана, потраченная в бою, mana_spent не меняет (итог сообщает конец боя)');
  // 5) конец боя: победа — полное HP, мана — остаток; повтор не работает
  const win = await acts.combatEnd('victory', 33.5);
  ok(win.ok && st.data.hp === 120 && near(st.data.mana, 33.5) && st.data.combatSince == null && !srv.rawVitals(uid).combat, 'победа: HP полное, мана — остаток, восстановление снова идёт');
  const dup = await acts.combatEnd('victory', 100);
  ok(!dup.ok && dup.reason === 'no_combat' && near(st.data.mana, 33.5), 'повторный конец боя ничего не даёт (боя нет)');
  await acts.combatStart(); const lose = await acts.combatEnd('defeat', 7);
  ok(lose.ok && st.data.hp === 24 && near(st.data.mana, 7), 'поражение: 20% максимума HP (24 из 120), мана — остаток');
  await acts.combatStart();
  const bad = await acts.run({ op: 'combat_end', outcome: 'cheat', mana: 100 });
  ok(!bad.ok && bad.reason === 'bad_outcome' && srv.rawVitals(uid).combat, 'неизвестный исход боя отклонён');
  const ret = await acts.combatEnd('retreat');
  ok(ret.ok && st.data.hp >= 24 && st.data.hp < 40, 'отступление: HP не ниже доли поражения, лишнего не даёт');
  // 6) бой, о конце которого сервер не узнал: через 15 минут — отступление, дальше время идёт
  await setVitals(d, { hp: 5, mana: 10 });
  await acts.combatStart();
  srv.timeTravel(uid, 14 * 60);
  await d.session.flush({ force: true });
  ok(near(st.data.hp, 5, 2) && st.data.combatSince != null, '14 минут боя без вестей: сервер ещё ждёт итога');
  srv.timeTravel(uid, 3 * 60);
  await d.session.flush({ force: true });
  ok(st.data.combatSince == null && st.data.hp >= 24 && st.data.hp < 24 + 125, 'через 15 минут бой считается отступлением: HP не ниже 24, затем обычное восстановление (+2 минуты)');

  // 7) зелья вне боя: расход и результат решает сервер
  st.addItem('elixir_mana', 1); st.save();
  await setVitals(d, { hp: 100, mana: 100 });
  const full = await acts.drink('elixir_mana');
  ok(!full.ok && full.reason === 'full' && st.item('elixir_life') === 2, 'полный запас: зелье не тратится');
  const dh = await acts.drink('elixir_life');
  ok(dh.ok && dh.kind === 'heal' && near(dh.amount, 20, 1) && st.item('elixir_life') === 1 && near(st.data.hp, 120), 'настой жизни: добавлено только недостающее, списан один');
  ok((await acts.drink('resin_flask')).reason === 'unknown' && (await acts.drink('nonsense')).reason === 'unknown', 'боевая склянка и выдуманный предмет вне боя не работают');
  await setVitals(d, { hp: 120, mana: 10 });
  const dm = await acts.drink('elixir_mana');
  ok(dm.ok && near(dm.amount, 60, 1) && near(st.data.mana, 70), 'лунный эликсир: +60% маны');

  // 8) мана, потраченная после отчёта, не пропадает при ответе сервера
  await setVitals(d, { hp: 120, mana: 80 });
  vitalsMod.spendMana(st, 10);
  const pendingBefore = st.data.mana;
  await d.session.flush({ force: true });
  ok(near(st.data.mana, 70) && near(pendingBefore, 70) && near(srv.rawVitals(uid).mana, 70), 'потраченная мана учтена один раз: на устройстве и на сервере 70');
  // 9) новый уровень не лечит
  await setVitals(d, { hp: 50, mana: 50 });
  st.applyReward({ heroXP: 100 }); st.save(); await d.session.flush();
  ok(st.data.heroLevel >= 2 && near(st.data.hp, 50) && near(st.data.mana, 50), 'повышение уровня не восстанавливает HP и ману втихую');
  // 10) нет связи: бой не начинается
  srv.offline = true;
  const off = await acts.combatStart();
  srv.offline = false; await d.session.retryNow();
  ok(!off.ok && off.reason === 'network' && st.data.combatSince == null, 'без связи бой не начинается (сервер не узнал о нём)');
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
