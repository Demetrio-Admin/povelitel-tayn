// v0.9.1: стартовый набор и лечение у Мирры в настоящей игре (браузер) против сервера с задержкой — как на проде.
// Регрессия бага v0.9.0: мир менял состояние каждый кадр, flush() перед действием «догонял» его 5 раз (пачка sync_player 200),
// возвращал false — и игра писала «Нет связи», не вызвав player_action.
//
// Сервер — FakeSupabase по HTTP на 127.0.0.1:SERVER_PORT (8174) с задержкой ответа SERVER_DELAY_MS (300 мс):
//   BACKEND=pg — настоящие SQL-функции и права supabase/schema.sql на Postgres (PGHOST/PGPORT/PGUSER/PGDATABASE);
//   по умолчанию — JS-зеркало схемы.
// Игра должна быть собрана с VITE_SUPABASE_URL=http://127.0.0.1:8174 и VITE_SUPABASE_ANON_KEY=anon-key.
// Запуск: UI_BASE_URL=http://…/ [BACKEND=pg] node tests/e2e/server-actions.mjs
import { chromium } from 'playwright';
import { startFakeHttp } from '../helpers/fake-http.mjs';

const BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:5173/';
const PORT = +(process.env.SERVER_PORT || 8174);
const DELAY = +(process.env.SERVER_DELAY_MS || 300);
const { srv, close: closeServer } = await startFakeHttp({ backend: process.env.BACKEND || 'model', port: PORT, delayMs: DELAY });

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));

// Сеть, как во вкладке Network: каждый RPC игры — имя, тело, статус и шло ли в момент отправки действие сервера
await ctx.addInitScript(() => {
  const orig = window.fetch.bind(window);
  window.__net = [];
  window.fetch = async (url, opts) => {
    const m = String(url).match(/\/rest\/v1\/rpc\/(\w+)/);
    const rec = m ? { rpc: m[1], busy: !!window.__witch?.actions?.busy, body: String(opts?.body || ''), status: 0 } : null;
    if (rec) window.__net.push(rec);
    const r = await orig(url, opts);
    if (rec) rec.status = r.status;
    return r;
  };
});
const ev = (f, a) => p.evaluate(f, a);
const sleep = (ms) => p.waitForTimeout(ms);

/** Слежка в странице: тексты toast и время игры/HP/мана в каждом кадре, пока идёт действие сервера. */
const watch = () => ev(() => {
  const S = window.__witch;
  window.__toasts = [];
  const u = window.__game.scene.getScene('UIScene'), orig = u.toast.bind(u);
  u.toast = (t, c) => { window.__toasts.push(String(t)); return orig(t, c); };   // все сообщения интерфейса
  window.__busyFrames = [];
  const loop = () => { if (S.actions.busy) window.__busyFrames.push([S.state.data.stats.playTimeMs, S.state.data.hp ?? 1e9, S.state.data.mana ?? 1e9]); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});

/** Разговор с Миррой: подойти, начать, пролистать; answer — выбрать ответ по тексту (иначе первый). */
async function talkMirra(answer = null) {
  await ev(() => { const ex = window.__game.scene.getScene('ExplorationScene'); const o = ex.objects.find(x => x.id === 'npc_mirra'); ex.player.setPosition(o.x, o.y + 40); });
  await sleep(300);
  await ev(() => { const ex = window.__game.scene.getScene('ExplorationScene'); const o = ex.objects.find(x => x.id === 'npc_mirra'); ex.interaction.setFocus(o); ex.onContext(); });
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    const open = await ev((answer) => {
      const u = window.__game.scene.getScene('UIScene'), S = window.__witch;
      if (!u.dlg) return false;
      u.finishTyping();
      const v = S.dialogue.view();
      const ch = (answer && v?.choices?.find(c => c.label === answer)) || v?.choices?.[0];
      if (ch) u.dialogueChoose(ch.index); else u.dialogueTap();
      return true;
    }, answer);
    if (!open) break;
  }
}

const inGame = () => p.waitForFunction(() => window.__game?.scene.isActive('ExplorationScene') && window.__game.scene.isActive('UIScene') && window.__witch?.session?.status === 'ready', null, { timeout: 120000 });
/** Мир стоял: от кадра к кадру время игры, HP и мана не росли (cols — какие проверять; сервер может округлить время вниз). */
const frozen = (frames, cols = [0, 1, 2]) => frames.length > 0 && frames.every((f, i) => i === 0 || cols.every(c => f[c] <= frames[i - 1][c]));
const netNow = () => ev(() => window.__net.slice());
const busyNet = async (from) => (await netNow()).slice(from).filter(n => n.busy);
const count = (list, rpc) => list.filter(n => n.rpc === rpc).length;

console.log(`\nСервер: ${srv.backend === 'pg' ? 'настоящие SQL-функции (Postgres)' : 'JS-зеркало схемы'}, задержка ответа ${DELAY} мс`);

// 1) гость с первым даром (Телекинез), без набора; HP и мана не полные — мир восстанавливает их каждый кадр
await p.goto(BASE);
await p.waitForFunction(() => !!window.__witch?.session, null, { timeout: 120000 });
await ev(async () => {
  const S = window.__witch;
  await S.session.playAsGuest('witch');
  const st = S.state;
  st.markEvent('prologue_seen'); st.markEvent('unlock_telekinesis_1'); st.unlockAbility('telekinesis', 1);
  st.addItem('coins', 50); st.save();
  await S.session.flush();
});
// v0.12.0: HP и ману задаёт сервер — выставляем их на сервере (не полные), мир их восстанавливает
srv.setVitals(await ev(() => window.__witch.session.userId), { hp: 45, mana: 20 });
await p.goto(new URL('?skipmenu', BASE).href);
await inGame();
await watch();
await sleep(2500);
const before = await ev(() => { const s = window.__witch.state; return { play: s.data.stats.playTimeMs, hp: s.data.hp, mana: s.data.mana, zone: window.__game.scene.getScene('ExplorationScene').zone?.id }; });
ok(before.play > 0 && before.hp > 45 && before.mana > 20, `мир живёт: время игры идёт, HP ${Math.round(before.hp)} и мана ${Math.round(before.mana)} восстанавливаются (зона ${before.zone})`);

console.log('\nСтартовый набор');
let from = (await netNow()).length;
await talkMirra();
await p.waitForFunction(() => window.__witch.state.hasEvent('mirra_starter_kit') || window.__toasts.some(t => /Нет связи|Ошибка сервера/.test(t)), null, { timeout: 30000 }).catch(() => {});
await sleep(500);
let k = await ev(() => { const s = window.__witch.state; return { life: s.item('elixir_life'), mana: s.item('elixir_mana'), ev: s.hasEvent('mirra_starter_kit'), toasts: window.__toasts.slice(), frames: window.__busyFrames.slice(), nFrames: window.__busyFrames.length }; });
let act = await busyNet(from);
console.log('  Network во время действия:', act.map(n => `${n.rpc} ${n.status}`).join(' → ') || '(пусто)');
ok(count(act, 'sync_player') <= 1, `перед действием не больше одного sync_player (${count(act, 'sync_player')})`);
ok(count(act, 'player_action') === 1 && act.find(n => n.rpc === 'player_action')?.status === 200, 'вызван rpc/player_action, статус 200');
ok(/"op":"starter_kit"/.test(act.find(n => n.rpc === 'player_action')?.body || ''), 'тело запроса: { action: { op: "starter_kit", id } }');
ok(k.life === 1 && k.mana === 1 && k.ev, 'в сумке 1 Настой жизни и 1 Лунный эликсир, событие mirra_starter_kit');
ok(!k.toasts.some(t => /Нет связи|Ошибка сервера/.test(t)), `нет ложного «Нет связи» (сообщения: ${k.toasts.join(' | ') || '—'})`);
ok(frozen(k.frames, [0]), `пока действие выполнялось (${k.nFrames} кадров), время игры не шло (мир стоял)`);

console.log('\nПерезагрузка и повторный разговор');
await p.goto(new URL('?skipmenu', BASE).href);
await inGame(); await watch(); await sleep(1500);
k = await ev(() => { const s = window.__witch.state; return { life: s.item('elixir_life'), mana: s.item('elixir_mana'), ev: s.hasEvent('mirra_starter_kit') }; });
ok(k.life === 1 && k.mana === 1 && k.ev, 'после перезагрузки набор в сумке, событие сохранено');
from = (await netNow()).length;
await talkMirra(); await sleep(1500);
k = await ev(() => { const s = window.__witch.state; return { life: s.item('elixir_life'), mana: s.item('elixir_mana') }; });
ok(k.life === 1 && k.mana === 1 && !(await netNow()).slice(from).some(n => n.rpc === 'player_action' && /starter_kit/.test(n.body || '')), 'повторный разговор не выдаёт второй набор');

console.log('\nЛечение у Мирры');
srv.setVitals(await ev(() => window.__witch.session.userId), { hp: 40, mana: 20 });
await ev(() => window.__witch.session.flush({ force: true }));
await sleep(1500);
const h0 = await ev(() => ({ coins: window.__witch.state.item('coins'), hp: window.__witch.state.data.hp }));
from = (await netNow()).length;
await talkMirra('Восстановить здоровье');
await sleep(600);
const win = await ev(() => { const u = window.__game.scene.getScene('UIScene'); return u.modal?.opts?.text || ''; });
console.log('  окно:', win.replace(/\n+/g, ' | '));
await ev(() => { window.__toasts.length = 0; window.__busyFrames.length = 0; const u = window.__game.scene.getScene('UIScene'); const btn = u.modal?.buttons?.find(x => /^Восстановить за/.test(x.label)); if (btn) u.closeModal(btn); });
await p.waitForFunction(() => window.__toasts.some(t => /Здоровье восстановлено|Нет связи|Ошибка/.test(t)), null, { timeout: 30000 }).catch(() => {});
await sleep(400);
const h1 = await ev(() => { const s = window.__witch.state; return { coins: s.item('coins'), hp: s.data.hp, max: s.heroStats().maxHp, toasts: window.__toasts.slice(), frames: window.__busyFrames.slice(), nFrames: window.__busyFrames.length }; });
act = await busyNet(from);
console.log('  Network во время действия:', act.map(n => `${n.rpc} ${n.status}`).join(' → ') || '(пусто)');
const price = h0.coins - h1.coins;
ok(count(act, 'player_action') === 1 && act.find(n => n.rpc === 'player_action')?.status === 200 && /"op":"heal"/.test(act.find(n => n.rpc === 'player_action')?.body || ''), 'лечение: один rpc/player_action { op: "heal" }, статус 200');
ok(count(act, 'sync_player') <= 1, `перед лечением не больше одного sync_player (${count(act, 'sync_player')})`);
const winPrice = +(/Цена: (\d+)/.exec(win)?.[1] || NaN);   // между окном и нажатием HP успевает вырасти (на медленной машине — на несколько единиц): цена может стать меньше
ok(h1.hp === h1.max && price > 0 && winPrice >= price && winPrice - price <= 4, `HP ${h1.max}/${h1.max}, списано ${price} монет — как в окне подтверждения (${winPrice})`);
ok(!h1.toasts.some(t => /Нет связи|Ошибка сервера/.test(t)) && h1.toasts.some(t => /Здоровье восстановлено/.test(t)), `сообщение: ${h1.toasts.join(' | ')}`);
ok(frozen(h1.frames, [0]), `пока шло лечение (${h1.nFrames} кадров), мир стоял`);

// 2) после перезагрузки — то же на сервере
await p.goto(new URL('?skipmenu', BASE).href);
await inGame();
const after = await ev(() => { const s = window.__witch.state; return { coins: s.item('coins'), hp: s.data.hp, max: s.heroStats().maxHp }; });
ok(after.coins === h1.coins && after.hp === after.max, 'после перезагрузки монеты и полное HP — с сервера');
ok(!errs.length, 'без ошибок в консоли страницы' + (errs.length ? ': ' + errs.join('; ') : ''));

console.log(failures ? `\n✗ Провалено проверок: ${failures}` : '\n✓ Стартовый набор и лечение работают через player_action');
await b.close(); await closeServer();
process.exit(failures ? 1 : 0);
