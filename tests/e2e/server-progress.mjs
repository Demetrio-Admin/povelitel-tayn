// v0.15.0: опыт, события, квесты и дары в настоящей игре (браузер) против фальшивого сервера по HTTP.
// Мир (камень сдвинут Телекинезом) — награду, опыт школы и событие записывает сервер одной операцией, а не игра;
// подделка в консоли браузера (монеты, опыт, события, дары) до сервера не доходит и пропадает у игрока; событие без условий откатывается.
// Игра собирается с VITE_SUPABASE_URL=http://127.0.0.1:8174. Запуск: UI_BASE_URL=http://… [BACKEND=pg] node tests/e2e/server-progress.mjs
import { chromium } from 'playwright';
import { startFakeHttp } from '../helpers/fake-http.mjs';

const BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:5173/';
const { srv, close: closeServer } = await startFakeHttp({ backend: process.env.BACKEND || 'model', port: +(process.env.SERVER_PORT || 8174), delayMs: +(process.env.SERVER_DELAY_MS || 120) });
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const WAIT = +(process.env.WAIT_MS || 120000);

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => p.evaluate(f, a);
const sleep = (ms) => p.waitForTimeout(ms);
const inGame = () => p.waitForFunction(() => window.__game?.scene.isActive('ExplorationScene') && window.__game.scene.isActive('UIScene') && window.__witch?.session?.status === 'ready', null, { timeout: WAIT });
/** Что сервер хранит про игрока (через тот же вход, что у игры). */
const server = () => ev(async () => { const s = window.__witch.session; return s.api.getPlayer(s.auth.access_token); });
/** Подождать, пока все подтверждения игры дойдут до сервера. */
const settle = () => ev(async () => { await window.__witch.actions.chain; await window.__witch.session.flush(); });

console.log(`\nСервер: ${srv.backend === 'pg' ? 'настоящий Postgres' : 'JS-зеркало схемы'}`);
await p.goto(BASE);
await p.waitForFunction(() => !!window.__witch?.session, null, { timeout: WAIT });
await ev(async () => { await window.__witch.session.playAsGuest('witch'); });
const uid = await ev(() => window.__witch.session.userId);
srv.grant(uid, { quests: ['prologue_seen', 'unlock_telekinesis_1'], abilities: { telekinesis: { level: 1, unlocked: true } } });
await ev(async () => { await window.__witch.session.flush({ force: true }); });
srv.setVitals(uid, { hp: null, mana: 100 });
await p.goto(new URL('?skipmenu', BASE).href);
await inGame();
await ev(() => { const u = window.__game.scene.getScene('UIScene'); if (u.dlg) u.closeDialogue(true); });
await sleep(1200);

console.log('\nМир: камень сдвигает Телекинез, остальное записывает сервер');
const s0 = await server();
await ev(() => { const ex = window.__game.scene.getScene('ExplorationScene'); const rock = ex.objects.find(o => o.id === 'glade_rock'); ex.player.setPosition(rock.x - 70, rock.baseY + 10); window.__rock = rock; });
await sleep(600);
await ev(() => window.__rock.interact('telekinesis'));
await p.waitForFunction(() => window.__witch.state.getObject('glade_rock')?.state === 'moved', null, { timeout: 30000 });
await sleep(3000);
await settle();
const s1 = await server();
const local = await ev(() => { const s = window.__witch.state; return { xp: s.data.heroXP, school: s.data.schoolXP.telekinesis, ev: s.hasEvent('first_world_interaction') }; });
ok(s1.objects.glade_rock?.state === 'moved', 'состояние «камень сдвинут» записал сервер');
ok(s1.quests.includes('first_world_interaction') && s1.xp === s0.xp + 10, `событие и награда (+10 опыта) — от сервера, один раз (было ${s0.xp}, стало ${s1.xp})`);
ok((s1.school.telekinesis || 0) === (s0.school.telekinesis || 0) + 6, 'опыт дара за использование (+6) — от сервера, один раз');
ok(local.xp === s1.xp && local.school === s1.school.telekinesis && local.ev, 'у игрока ровно то же, что на сервере: ничего не продублировалось');

console.log('\nПодделка в консоли браузера');
await ev(async () => {
  const S = window.__witch, D = S.state.data;
  D.inventory.coins = 99999; D.heroXP = 99999; D.heroLevel = 50; D.completedEvents.push('chapter_1_complete'); D.unlockedAbilities.push('fire'); D.fireLevel = 3;
  D.worldObjects.west_chest = { state: 'opened' };
  S.state.save(); await S.session.flush();
});
const s2 = await server();
const loc2 = await ev(() => { const s = window.__witch.state; return { coins: s.item('coins'), xp: s.data.heroXP, lvl: s.data.heroLevel, ev: s.hasEvent('chapter_1_complete'), fire: s.isUnlocked('fire') }; });
ok(s2.inventory.coins === s1.inventory.coins && s2.xp === s1.xp && s2.level === s1.level && !s2.quests.includes('chapter_1_complete') && !s2.abilities.fire?.unlocked && !s2.objects.west_chest, 'монеты, опыт, уровень, событие, дар и сундук: сервер ничего не принял');
ok(loc2.coins === s1.inventory.coins && loc2.xp === s1.xp && loc2.lvl === s1.level && !loc2.ev && !loc2.fire, 'у игрока подделка исчезла: взято состояние сервера');

console.log('\nСобытие без условий и обычное задание');
await ev(() => { const S = window.__witch; S.abilities.unlock('fire', 1); S.quests.complete('unlock_fire_1'); });
const early = await ev(() => window.__witch.state.isUnlocked('fire'));
await settle();
const loc3 = await ev(() => ({ fire: window.__witch.state.isUnlocked('fire'), ev: window.__witch.state.hasEvent('unlock_fire_1') }));
ok(early && !loc3.fire && !loc3.ev && !(await server()).abilities.fire?.unlocked, 'Огонь «получен» сразу, но сервер отказал (путь не открыт) — у игрока он снова закрыт');
await ev(() => { window.__witch.log.accept('sq_herbs'); });
await settle();
ok((await server()).quests.includes('sq_herbs_start') && await ev(() => window.__witch.log.isStarted('sq_herbs')), 'принятое задание записал сервер');

console.log('\nПерезагрузка');
await p.goto(new URL('?skipmenu', BASE).href);
await inGame();
await sleep(1500);
const re = await ev(() => { const s = window.__witch.state; const ex = window.__game.scene.getScene('ExplorationScene'); const rock = ex.objects.find(o => o.id === 'glade_rock'); return { moved: s.getObject('glade_rock')?.state, rockX: Math.round(rock.x), atTarget: Math.abs(rock.sprite.x - rock.target_position.x) < 1 && Math.abs(rock.baseY - rock.target_position.y) < 1, ev: s.hasEvent('first_world_interaction'), q: s.hasEvent('sq_herbs_start') }; });
ok(re.moved === 'moved' && re.atTarget && re.ev && re.q, `после перезагрузки: камень на новом месте, события и задание на месте`);
ok(!errs.length, 'без ошибок в консоли страницы' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close(); await closeServer();
console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Прогресс на сервере работает в игре');
process.exit(failures ? 1 : 0);
