// Тесты аккаунтов и облачного сохранения на фальшивом Supabase. node tests/cloud-test.js
import { GameState, createDefaultState } from '../src/state/GameState.js';
import { SupabaseApi, CloudError, mapError, errorText } from '../src/cloud/api.js';
import { Account, hasProgress, summarize, SESSION_KEY } from '../src/cloud/Account.js';
import { validateNickname, validateEmail, validatePassword, shortNick } from '../src/cloud/validators.js';
import { SAVE } from '../src/config/game.config.js';
import { FakeSupabase } from './helpers/fake-supabase.mjs';
import { services, resetProgress } from '../src/services.js';

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failures++; console.log('  ✗', msg); } };
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

/** Одно «устройство»: своё хранилище, состояние игры и аккаунт; сервер можно разделять между устройствами. */
function device(server, storage = memStorage()) {
  const clock = { t: 1_700_000_000_000 };
  const timers = [];
  const state = new GameState(storage, () => (clock.t += 10));
  const api = new SupabaseApi({ url: 'https://x.supabase.co', anonKey: 'anon', fetchFn: server.fetch, timeoutMs: 1000, now: () => clock.t });
  const account = new Account({
    api, storage, state, now: () => clock.t, pushDelayMs: 8000, retryMs: 30000,
    setTimer: (f, ms) => { const t = { f, ms, live: true }; timers.push(t); return t; }, clearTimer: (t) => { if (t) t.live = false; },
  });
  const fire = async () => { const live = timers.filter(t => t.live); live.forEach(t => { t.live = false; }); for (const t of live) await t.f(); };
  return { clock, timers, state, api, account, storage, fire, pending: () => timers.filter(t => t.live) };
}
const play = (state, events = ['a', 'b', 'c'], level = 3) => { state.data.completedEvents = [...events]; state.data.heroLevel = level; state.data.stats.playTimeMs = 600000; state.save(); };
const CRED = { email: 'nyuta@mail.ru', password: 'sekret-pass', nickname: 'Нюта' };

console.log('\nОблако: проверка полей');
{
  ok(validateNickname('  Нюта  ').ok && validateNickname('Нюта').value === 'Нюта', 'ник: пробелы по краям убираются');
  ok(!validateNickname('ab').ok && !validateNickname('x'.repeat(17)).ok, 'ник: 3–16 символов');
  ok(!validateNickname('Hack<script>').ok && validateNickname('Witch_Lady-7').ok && validateNickname('Ведьма Лесная').ok, 'ник: буквы, цифры, пробел, _ и -');
  ok(validateNickname('Ann   Lee').value === 'Ann Lee', 'ник: двойные пробелы схлопываются');
  ok(validateEmail('a@b.ru').ok && !validateEmail('a@b').ok && !validateEmail('нет').ok, 'почта: простая проверка формы');
  ok(validatePassword('12345678').ok && !validatePassword('1234567').ok, 'пароль: от 8 символов');
  ok(shortNick('Нюта') === 'Нюта' && shortNick('ОченьДлинныйНик').length === 9 && shortNick('ОченьДлинныйНик').endsWith('…'), 'shortNick для HUD');
  ok(mapError(400, { error_code: 'invalid_credentials' }) === 'invalid_credentials' && mapError(422, { msg: 'User already registered' }) === 'email_taken'
    && mapError(429, {}) === 'rate_limited' && mapError(409, { code: '23505' }) === 'nickname_taken' && mapError(401, { code: 'PGRST301' }) === 'unauthorized'
    && mapError(500, { message: 'weird' }) === 'unknown', 'коды ошибок сервера понятны');
  ok(errorText('invalid_credentials').includes('Неверная') && errorText('zzz') === errorText('unknown'), 'тексты ошибок по-русски');
}

console.log('\nОблако: регистрация и вход');
{
  const srv = new FakeSupabase();
  const d = device(srv);
  ok(!new SupabaseApi({}).enabled && d.api.enabled, 'без URL и ключа облако выключено');
  const e1 = await rejects(() => d.account.signUp({ ...CRED, nickname: 'ab' }));
  ok(e1 instanceof CloudError && e1.code === 'validation', 'регистрация: плохой ник отклоняется до запроса');
  ok(srv.calls.length === 0, 'регистрация: на сервер ничего не ушло');
  const r = await d.account.signUp(CRED);
  ok(r.ok && d.account.signedIn && d.account.nickname === 'Нюта' && d.account.email === CRED.email, 'регистрация: вошли, ник из профиля');
  ok(JSON.parse(d.storage.getItem(SESSION_KEY)).refresh_token.startsWith('rt-'), 'сессия сохранена в хранилище');
  ok(d.storage.getItem(SESSION_KEY).indexOf(CRED.password) < 0, 'пароль нигде не хранится');
  ok(d.state.key === d.account.userKey(), 'после входа игра пишет в личную ячейку');
  const d2 = device(srv);
  const e2 = await rejects(() => d2.account.signUp({ ...CRED, email: 'other@mail.ru', nickname: 'нюта' }));
  ok(e2?.code === 'nickname_taken', 'регистрация: ник занят (без учёта регистра букв)');
  const e3 = await rejects(() => d2.account.signUp({ ...CRED, nickname: 'Другая' }));
  ok(e3?.code === 'email_taken', 'регистрация: почта уже есть');
  const e4 = await rejects(() => d2.account.signIn({ email: CRED.email, password: 'wrong-wrong' }));
  ok(e4?.code === 'invalid_credentials' && e4.message.includes('Неверная'), 'вход: неверный пароль');
  const e5 = await rejects(() => d2.account.signIn({ email: 'a@b', password: 'x' }));
  ok(e5?.code === 'validation', 'вход: плохая почта отклоняется до запроса');
  const ok2 = await d2.account.signIn({ email: CRED.email, password: CRED.password });
  ok(ok2.ok && d2.account.nickname === 'Нюта', 'вход на втором устройстве');
  const srvC = new FakeSupabase({ confirmEmail: true });
  const dc = device(srvC);
  const rc = await dc.account.signUp({ ...CRED });
  ok(rc.needsConfirm === true && !dc.account.signedIn, 'подтверждение почты: сообщаем, что нужно письмо');
  const e6 = await rejects(() => dc.account.signIn({ email: CRED.email, password: CRED.password }));
  ok(e6?.code === 'email_not_confirmed', 'вход до подтверждения почты: понятная ошибка');
  const off = new FakeSupabase(); off.online = false;
  const e7 = await rejects(() => device(off).account.signIn({ email: CRED.email, password: CRED.password }));
  ok(e7?.code === 'network' && e7.message.includes('Нет связи'), 'нет сети: понятная ошибка');
}

console.log('\nОблако: перенос прогресса и сохранение');
{
  const srv = new FakeSupabase();
  const d = device(srv);
  play(d.state, ['intro', 'book'], 2);                 // гость успел поиграть
  ok(d.state.key === SAVE.key && d.account.signedIn === false, 'гость пишет в гостевую ячейку');
  await d.account.signUp(CRED);
  ok(srv.saves.size === 1 && srv.saves.get('u-1').data.completedEvents.length === 2, 'гостевой прогресс отправлен в аккаунт при регистрации');
  ok(d.state.data.heroLevel === 2 && d.state.key.includes(':u:'), 'игра продолжается с тем же прогрессом в личной ячейке');
  // автосохранение: пометка и отправка не чаще раза в 8 с
  const before = srv.calls.filter(c => c === 'POST /rest/v1/saves').length;
  d.state.data.heroLevel = 3; d.state.save(); d.state.data.heroLevel = 4; d.state.save(); d.state.data.heroLevel = 5; d.state.save();
  ok(d.pending().length === 1, 'три сохранения подряд — одна отложенная отправка');
  ok(srv.calls.filter(c => c === 'POST /rest/v1/saves').length === before, 'до срока ничего не отправлено');
  await d.fire();
  ok(srv.saves.get('u-1').data.heroLevel === 5, 'после срока в облаке последний прогресс');
  ok(d.account._meta().dirty === false && d.account.sync.state === 'ok', 'после отправки пометка «грязное» снята');
  // нет связи: прогресс не теряется
  srv.online = false;
  d.state.data.heroLevel = 6; d.state.save();
  await d.fire();
  ok(d.account._meta().dirty && d.account.sync.state === 'error' && d.account.sync.error === 'network', 'без сети: пометка остаётся, ошибка видна');
  ok(d.pending().length === 1 && d.pending()[0].ms === 30000, 'без сети: повтор через 30 с');
  srv.online = true;
  await d.fire();
  ok(srv.saves.get('u-1').data.heroLevel === 6 && !d.account._meta().dirty, 'связь вернулась: прогресс догнал облако');
  // истёкший токен
  srv.expireAccessTokens();
  d.state.data.heroLevel = 7; d.state.save();
  await d.fire();
  ok(srv.saves.get('u-1').data.heroLevel === 7, 'токен истёк: обновился и отправка прошла');
  ok(srv.calls.includes('POST /auth/v1/token?refresh_token'), 'использован refresh_token');
  // гость ничего не отправляет
  const g = device(srv);
  play(g.state, ['x']);
  ok(g.pending().length === 0 && srv.calls.filter(c => c.startsWith('POST /rest/v1/saves')).length >= 1, 'гость: отправки не планируются');
}

console.log('\nОблако: второе устройство, конфликты');
{
  const srv = new FakeSupabase();
  const a = device(srv);
  await a.account.signUp(CRED);
  play(a.state, ['e1', 'e2', 'e3', 'e4'], 5); await a.account.flush();
  const b = device(srv);
  const r = await b.account.signIn({ email: CRED.email, password: CRED.password });
  ok(r.sync.kind === 'loaded' && b.state.data.heroLevel === 5 && b.state.data.completedEvents.length === 4, 'новое устройство: прогресс загружен из облака');
  // обе стороны играют: a — онлайн, b — оффлайн
  srv.online = false;
  b.state.data.heroLevel = 6; b.state.save(); await b.fire();
  srv.online = true;
  a.state.data.heroLevel = 9; a.state.save(); await a.account.flush();
  ok(srv.saves.get('u-1').data.heroLevel === 9, 'устройство A записало уровень 9');
  // b перезапускается: у него несинхронизированные правки, а облако новее — конфликт
  const b2 = device(srv, b.storage);
  const rr = await b2.account.restore();
  ok(rr.kind === 'conflict' && b2.account.pendingConflict && rr.cloud.summary.level === 9 && rr.local.summary.level === 6, 'перезапуск: обнаружен конфликт, показаны обе стороны');
  const before = srv.calls.length;
  b2.state.save();
  ok(b2.pending().length === 0 && srv.calls.length === before, 'пока конфликт не решён, ничего не отправляется');
  await b2.account.resolveConflict('cloud');
  ok(b2.state.data.heroLevel === 9 && !b2.account.pendingConflict && !b2.account._meta().dirty, 'выбрано облако: загружен уровень 9');
  // другой исход: выбрать «это устройство»
  const c = device(srv);
  await c.account.signIn({ email: CRED.email, password: CRED.password });
  srv.online = false; c.state.data.heroLevel = 11; c.state.save(); srv.online = true;
  a.state.data.heroLevel = 12; a.state.save(); await a.account.flush();
  const c2 = device(srv, c.storage);
  const r2 = await c2.account.restore();
  await c2.account.resolveConflict('local');
  ok(r2.kind === 'conflict' && srv.saves.get('u-1').data.heroLevel === 11, 'выбрано это устройство: облако перезаписано уровнем 11');
  // гость играл до входа и в облаке уже есть другое — спрашиваем
  const g = device(srv);
  play(g.state, ['guest1', 'guest2'], 2);
  const rg = await g.account.signIn({ email: CRED.email, password: CRED.password });
  ok(rg.sync.kind === 'conflict' && rg.sync.local.source === 'guest', 'гость с прогрессом входит в аккаунт с сохранением: выбор игрока');
  await g.account.resolveConflict('cloud');
  ok(g.state.data.heroLevel === 11, 'выбрано облако — гость получил прогресс аккаунта');
  const guestSlot = JSON.parse(g.storage.getItem(SAVE.key));
  ok(guestSlot.heroLevel === 2, 'гостевое сохранение на устройстве не тронуто');
  await g.account.signOut();
  const rg2 = await g.account.signIn({ email: CRED.email, password: CRED.password });
  ok(rg2.sync.kind === 'loaded', 'второй вход на этом устройстве: гостя повторно не спрашиваем');
}

console.log('\nОблако: выход и смена игрока');
{
  const srv = new FakeSupabase();
  const d = device(srv);
  play(d.state, ['g1'], 2);                    // гость
  await d.account.signUp(CRED);
  play(d.state, ['a1', 'a2', 'a3'], 7);
  const out = await d.account.signOut();
  ok(out.pushed && !d.account.signedIn && d.storage.getItem(SESSION_KEY) === null, 'выход: сессия удалена');
  ok(srv.saves.get('u-1').data.heroLevel === 7, 'выход: прогресс перед выходом отправлен');
  ok(d.state.key === SAVE.key && d.state.data.heroLevel === 2, 'после выхода игра вернулась к гостевому прогрессу');
  ok(d.storage.getItem(d.account.userKey('u-1')) === null, 'личная копия на устройстве стёрта');
  const other = await d.account.signUp({ email: 'b@mail.ru', password: 'password-2', nickname: 'Второй' });
  ok(other.ok && d.state.data.completedEvents.length === 0 || d.state.data.heroLevel !== 7, 'другой игрок не видит чужой прогресс');
  ok(srv.saves.get('u-2')?.data.heroLevel !== 7, 'чужое сохранение не перезаписано');
  // выход без сети: прогресс остаётся локально и догонит позже
  const d3 = device(srv);
  await d3.account.signIn({ email: CRED.email, password: CRED.password });
  play(d3.state, ['n1', 'n2', 'n3', 'n4'], 8);
  srv.online = false;
  const out3 = await d3.account.signOut();
  ok(!out3.pushed && d3.storage.getItem(d3.account.userKey('u-1')) !== null, 'выход без сети: личная копия сохранена до следующего входа');
  srv.online = true;
  const back = await d3.account.signIn({ email: CRED.email, password: CRED.password });
  ok(back.sync.kind === 'uploaded' && srv.saves.get('u-1').data.heroLevel === 8, 'повторный вход: накопленный прогресс отправлен');
}

console.log('\nОблако: перезапуск и профиль');
{
  const srv = new FakeSupabase();
  const d = device(srv);
  await d.account.signUp(CRED); play(d.state, ['r1', 'r2'], 4); await d.account.flush();
  const d2 = device(srv, d.storage);
  const r = await d2.account.restore();
  ok(d2.account.signedIn && d2.account.nickname === 'Нюта' && r.kind === 'loaded' && d2.state.data.heroLevel === 4, 'перезапуск: вход и прогресс восстановлены');
  srv.online = false;
  const d3 = device(srv, d.storage);
  const r3 = await d3.account.restore();
  ok(d3.account.signedIn && d3.state.data.heroLevel === 4 && r3.kind === 'offline', 'перезапуск без сети: играем с личной копией');
  srv.online = true; srv.revokeRefreshTokens(); d.clock.t += 4 * 3600 * 1000;
  const d4 = device(srv, d.storage); d4.clock.t = d.clock.t;
  const r4 = await d4.account.restore();
  ok(!d4.account.signedIn && r4.kind === 'guest' && d4.storage.getItem(SESSION_KEY) === null && d4.state.key === SAVE.key, 'refresh_token отозван: тихо возвращаемся к гостю');
  const e = await rejects(() => d2.account.changeNickname('Нюта'));
  ok(e === null, 'смена ника на свой же (другой регистр) допустима');
  await d2.account.signOut();
  await d2.account.signUp({ email: 'z@mail.ru', password: 'password-3', nickname: 'Зайка' });
  const e2 = await rejects(() => d2.account.changeNickname('Нюта'));
  ok(e2?.code === 'nickname_taken', 'смена ника: занято');
  const nn = await d2.account.changeNickname('Зайка Новая');
  ok(nn === 'Зайка Новая' && srv.users.get('z@mail.ru').nickname === 'Зайка Новая', 'смена ника: записана в профиль');
  const s = summarize(d.state.data);
  ok(s.level === 4 && s.events === 2 && hasProgress(d.state.data) && !hasProgress(createDefaultState()), 'summarize / hasProgress');
}

console.log('\nОблако: «Новая игра» у вошедшего игрока');
{
  const srv = new FakeSupabase();
  const d = device(srv);
  await d.account.signUp(CRED);
  play(d.state, ['a', 'b', 'c', 'd'], 5);
  await d.account.flush();
  ok(srv.saves.get('u-1').data.heroLevel === 5, 'до сброса в облаке уровень 5');
  Object.assign(services, { state: d.state, account: d.account });
  await resetProgress();
  ok(srv.saves.get('u-1').data.heroLevel === 1 && srv.saves.get('u-1').data.completedEvents.length === 0, 'сброс ушёл и в облако');
  await d.account.signOut();
  const d2 = device(srv);
  const r = await d2.account.signIn(CRED);
  ok(r.sync.kind === 'loaded' && !hasProgress(d2.state.data) && d2.state.data.heroLevel === 1, 'после входа старый прогресс не вернулся');
  // гость сбрасывает без облака
  const g = device(new FakeSupabase());
  play(g.state);
  Object.assign(services, { state: g.state, account: g.account });
  await resetProgress();
  ok(!hasProgress(g.state.data) && !g.state.hasSave() && services.hadSave === false, 'гость: сброс стирает локальное сохранение');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Тесты облака пройдены');
process.exit(failures ? 1 : 0);
