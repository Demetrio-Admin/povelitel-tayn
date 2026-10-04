// v0.12.0: HP и мана на сервере в настоящей игре (браузер) против фальшивого сервера по HTTP:
//   бой сообщает серверу о начале (восстановление стоит) и об итоге (победа — полное HP); перезагрузка посреди боя — отступление;
//   зелье из сумки пьёт сервер; мана, потраченная на сбор, доходит до сервера (mana_spent).
// Игра собирается с VITE_SUPABASE_URL=http://127.0.0.1:8174 и VITE_SUPABASE_ANON_KEY=anon-key.
// Запуск: UI_BASE_URL=http://… [BACKEND=pg] node tests/e2e/vitals-online.mjs
import { chromium } from 'playwright';
import { startFakeHttp } from '../helpers/fake-http.mjs';

const BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:5173/';
const { srv, close: closeServer } = await startFakeHttp({ backend: process.env.BACKEND || 'model', port: +(process.env.SERVER_PORT || 8174), delayMs: +(process.env.SERVER_DELAY_MS || 120) });
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const near = (a, b, e = 3) => Math.abs(a - b) <= e;

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => p.evaluate(f, a);
const sleep = (ms) => p.waitForTimeout(ms);
const inGame = () => p.waitForFunction(() => window.__game?.scene.isActive('ExplorationScene') && window.__game.scene.isActive('UIScene') && window.__witch?.session?.status === 'ready', null, { timeout: 120000 });
const inCombat = () => p.waitForFunction(() => { const g = window.__game, c = g.scene.getScene('CombatScene'); return g.scene.isActive('CombatScene') && c.started; }, null, { timeout: 120000 });
const toEnemy = () => ev(() => { const ex = window.__game.scene.getScene('ExplorationScene'); const t = ex.enemies.find(e => e.id === 'scavenger_01'); ex.player.setPosition(t.cfg.x, t.cfg.y + 30); });

console.log(`\nСервер: ${srv.backend === 'pg' ? 'настоящий Postgres' : 'JS-зеркало схемы'}`);
await p.goto(BASE);
await p.waitForFunction(() => !!window.__witch?.session, null, { timeout: 120000 });
await ev(async () => {
  const S = window.__witch; await S.session.playAsGuest('witch');
  const st = S.state; st.markEvent('prologue_seen'); st.markEvent('unlock_telekinesis_1'); st.unlockAbility('telekinesis', 1); st.markEvent('mirra_starter_kit');
  st.addItem('elixir_life', 2); st.addItem('moon_herb', 0); st.save(); await S.session.flush();
});
const uid = await ev(() => window.__witch.session.userId);
srv.setVitals(uid, { hp: 50, mana: 40 });
await p.goto(new URL('?skipmenu', BASE).href);
await inGame();
await ev(() => { const u = window.__game.scene.getScene('UIScene'); if (u.dlg) u.closeDialogue(true); });
await sleep(1500);

console.log('\nБой: начало и победа');
const v0 = await ev(() => ({ hp: window.__witch.state.data.hp, mana: window.__witch.state.data.mana }));
ok(v0.hp > 50 && v0.hp < 118 && v0.mana > 40 && v0.mana < 99, `в игре серверные числа (не полные; запуск игры занял время, и сервер всё это время восстанавливал): HP ${v0.hp.toFixed(1)}, мана ${v0.mana.toFixed(1)}`);
await toEnemy();
await inCombat();
ok(srv.rawVitals(uid).combat === true, 'сервер узнал о бое до его начала (combat_since)');
ok(await ev(() => window.__witch.state.data.combatSince != null), 'клиент знает, что бой идёт');
srv.timeTravel(uid, 600);   // десять минут «боя» — на сервере время не засчитывается
await ev(() => { const c = window.__game.scene.getScene('CombatScene'); c.cm.hero.mana = 77.5; c.cm.enemy.hp = 0; c.cm.checkResult(); c.processEvents(); });
await p.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Победа!' || window.__game.scene.getScene('UIScene').dlgModal, null, { timeout: 30000 }).catch(() => {});
await sleep(1500);
await ev(() => window.__game.scene.getScene('UIScene').pressModalButton(true));
await p.waitForFunction(() => { const g = window.__game; return g.scene.isActive('ExplorationScene') && !g.scene.isActive('CombatScene') && !g.scene.isSleeping('ExplorationScene') && window.__witch.mode === 'exploration'; }, null, { timeout: 60000 });
await sleep(800);
const after = await ev(() => { const s = window.__witch.state; return { hp: s.data.hp, max: s.heroStats().maxHp, mana: s.data.mana, cs: s.data.combatSince }; });
const sv = srv.rawVitals(uid);
ok(!sv.combat && sv.hp >= after.max - 0.01, `итог боя на сервере: бой закрыт, HP полное (${sv.hp})`);
ok(sv.mana >= 77 && sv.mana < 95 && after.mana >= 77 && after.mana < 95, `остаток маны (77,5 + восстановление после боя) из боя на сервере и в игре (${after.mana.toFixed(1)})`);
ok(after.cs == null && after.hp >= after.max - 0.01, 'в игре восстановление снова идёт, HP полное');

console.log('\nСумка и сбор: зелье и мана через сервер');
srv.setVitals(uid, { hp: 60, mana: 30 });
await ev(() => window.__witch.session.flush({ force: true }));
const d1 = await ev(async () => { const u = window.__game.scene.getScene('UIScene'); await u.drinkFromBag('elixir_life'); const s = window.__witch.state; return { hp: s.data.hp, life: s.item('elixir_life') }; });
ok(near(d1.hp, 60 + 54, 4) && d1.life === 1, `настой жизни выпит на сервере: HP ${d1.hp.toFixed(1)}, остался 1`);
// трата маны на сборе: то же, что делает vitals.spendMana (мана на устройстве и счётчик потраченного), затем обычное сохранение
const sv3a = srv.rawVitals(uid).mana;
await ev(() => { const st = window.__witch.state; st.data.mana -= 6; st.data.manaSpent = (st.data.manaSpent || 0) + 6; st.save(); });
await ev(() => window.__witch.session.flush());
const sv3 = srv.rawVitals(uid).mana;
ok(near(sv3a - sv3, 6, 2.5), `потраченная мана дошла до сервера (mana_spent): было ${sv3a.toFixed(1)}, стало ${sv3.toFixed(1)}`);

console.log('\nПерезагрузка посреди боя');
srv.setVitals(uid, { hp: 90, mana: 50 });
await ev(() => window.__witch.session.flush({ force: true }));
const target = 'rootling_01';
await ev((id) => { const ex = window.__game.scene.getScene('ExplorationScene'); const t = ex.enemies.find(e => e.id === id); ex.player.setPosition(t.cfg.x, t.cfg.y + 30); }, target);
await inCombat();
ok(srv.rawVitals(uid).combat === true, `бой с ${target}: сервер знает о нём`);
await ev(() => { const c = window.__game.scene.getScene('CombatScene'); c.cm.hero.hp = 20; c.cm.commit(); window.__witch.state.save(); });
await p.goto(new URL('?skipmenu', BASE).href);
await inGame(); await sleep(3000);
const rr = await ev(() => { const s = window.__witch.state; return { hp: s.data.hp, cs: s.data.combatSince, max: s.heroStats().maxHp }; });
const sv2 = srv.rawVitals(uid);
ok(!sv2.combat && rr.cs == null, 'после перезагрузки игра сообщила об отступлении: бой на сервере закрыт');
ok(rr.hp >= Math.ceil(rr.max * 0.2) - 0.01 && rr.hp < rr.max, `HP не ниже доли поражения и не полное (${rr.hp.toFixed(1)})`);

ok(errs.length === 0, 'без ошибок в консоли страницы' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); await closeServer();
console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ HP и мана на сервере работают в игре');
process.exit(failures ? 1 : 0);
