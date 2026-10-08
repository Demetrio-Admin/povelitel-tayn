// v0.26.0 — Магическая Дуэль: профиль соперника из слепка, рейтинг (Эло), лиги, сезоны, попытки, бой на JS-зеркале с проверкой записи.
//   node tests/duel-test.mjs
import { DUEL, LEAGUES, leagueOf, seasonOf, seasonEndMs, ratingDelta, duelEnemyDef, duelSlots, duelRules, seasonSapphires, promoSapphires } from '../src/config/duel.js';
import { applyAction, emptySnapshot, combatApply, duelStateOf } from '../src/cloud/playerModel.js';
import { verifyCombat } from '../src/cloud/combatVerify.js';
import { playBot } from './helpers/combat-bot.mjs';
import { STEP } from '../src/systems/combatReplay.js';
import { HERO_LEVELS } from '../src/config/balance.hero.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };
const AB = (ice = 3) => ({ telekinesis: { level: 3, unlocked: true }, fire: { level: 2, unlocked: true }, seal: { level: 2, unlocked: true }, ice: { level: ice, unlocked: ice > 0 } });

console.log('\nДуэль: правила');
{
  ok(ratingDelta(1000, 1000, true) === 16 && ratingDelta(1000, 1000, false) === -16, 'равные: ±16');
  ok(ratingDelta(1000, 1400, true) > 25 && ratingDelta(1400, 1000, true) < 6, 'победа над сильным — больше, над слабым — мало');
  ok(leagueOf(1000).id === 'bronze' && leagueOf(1260).id === 'gold' && leagueOf(5000).id === 'legend' && LEAGUES.length === 7, 'семь лиг: от Бронзы до Высшей');
  const t0 = DUEL.season.startMs;
  ok(seasonOf(t0) === 0 && seasonOf(t0 + 27 * DUEL.dayMs) === 0 && seasonOf(t0 + 28 * DUEL.dayMs) === 1 && seasonEndMs(0) === t0 + 28 * DUEL.dayMs, 'Сезон 0 — четыре недели');
  ok(DUEL.attemptsPerDay >= 5 && DUEL.attemptsPerDay <= 10, `${DUEL.attemptsPerDay} боёв в день (5–10)`);
}

console.log('\nДуэль: профиль соперника');
{
  const opp = { name: 'Мирон', level: 15, hero: 'warlock', abilities: AB(), build: { slots: ['fire', 'telekinesis', 'ice'], amulets: ['amulet_focus'] }, rating: 1100 };
  const d = duelEnemyDef(opp);
  ok(d.name === 'Мирон' && d.texture === 'warlock_down' && d.arena === 'duel', 'имя и облик героя соперника');
  ok(d.hp === Math.round(HERO_LEVELS[14].maxHp * 4.2 * 1.05), 'здоровье — от уровня и амулетов');
  ok(d.strongAttack.name === 'Ледяное копьё' && d.normalAttack.chill, 'главный дар — самый развитый (Лёд III): копьё и холод');
  ok(d.weaknesses.seal === 0.25 && !d.weaknesses.fire && d.defense === 0, 'без Астрала в слотах — уязвим к нему, барьера нет');
  ok(d.armor?.value === 0.35, 'Телекинез III в слотах — кристальная броня');
  const d2 = duelEnemyDef({ ...opp, build: { slots: ['seal', 'fire', 'nope'] } });
  ok(d2.defense === 0.2 && duelSlots({ ...opp, build: { slots: ['seal', 'fire', 'nope'] } }).join() === 'seal,fire' && d2.weaknesses.telekinesis === 0.25 && d2.weaknesses.ice === 0.25, 'Астрал — барьер; чужие дары в слотах не считаются');
  ok(duelEnemyDef({ ...opp, build: null }).duel.slots.join() === 'telekinesis,fire,seal', 'без билда — первые открытые дары');
}

console.log('\nДуэль: сервер (JS-зеркало)');
{
  let T = DUEL.season.startMs + 3 * DUEL.dayMs + 3_600_000;
  let s = { ...emptySnapshot(), level: 15, xp: 8000, abilities: AB() };
  s.objects.player_build = { branches: { telekinesis: 'lord', ice: 'frost' }, slots: ['ice', 'telekinesis', 'seal'] };
  s.inventory = { ...s.inventory, elixir_life: 9, elixir_mana: 9 };
  const act = (a) => { T += 60_000; const r = applyAction(s, a, T); s = r.snapshot; return r.result; };
  ok(act({ op: 'duel_start' }).reason === 'locked', 'Дуэль — после главы II');
  s.quests = [...s.quests, 'chapter_2_complete'];
  const hp0 = s.hp;
  const r = act({ op: 'duel_start' });
  ok(r.ok && r.opponent.ghost && r.opponent.level === 15 && r.rating === 1000 && r.left === DUEL.attemptsPerDay - 1, 'соперника нет — «Тень дуэлянта», попытка списана');
  ok(act({ op: 'duel_start' }).reason === 'combat', 'второй вызов посреди боя — нельзя');
  // бой ботом, проверка записи, итог
  let won = null;
  for (let seed = 1; seed <= 8 && !won; seed++) { const p = playBot(s.combatCtx, { seed, policy: 'smart', maxTicks: 60 * 300 }); if (p.cm.result === 'victory') won = p; }
  ok(!!won, `бот выигрывает зеркальную дуэль (${Math.round(won?.cm.time || 0)} с)`);
  const v = verifyCombat(s, JSON.parse(JSON.stringify(won.log)), s.combatSince + won.log.ticks * STEP * 1000 + 1000);
  ok(v.ok && v.verdict.outcome === 'victory' && v.verdict.duel.delta === 16 && v.verdict.reward.items.coins === DUEL.reward.victory.coins, 'проверка: победа, +16 рейтинга, монеты Дуэли');
  T = s.combatSince + won.log.ticks * STEP * 1000 + 2000;
  const ap = combatApply(s, v.verdict, T);
  s = ap.snapshot;
  const st = duelStateOf(s, T);
  ok(ap.result.ok && st.rating === 1016 && st.wins === 1 && st.used === 1, 'рейтинг записан: 1016, одна победа');
  ok(s.combatSince == null && s.hp === hp0, 'Дуэль — арена: здоровье после боя как до него');
  // поражение
  act({ op: 'duel_start' });
  const lost = playBot(s.combatCtx, { seed: 3, policy: 'idle', maxTicks: 60 * 300 });
  const v2 = verifyCombat(s, JSON.parse(JSON.stringify(lost.log)), s.combatSince + lost.log.ticks * STEP * 1000 + 1000);
  ok(v2.ok && v2.verdict.outcome === 'defeat' && v2.verdict.duel.delta < 0 && !v2.verdict.coinsLost, 'поражение: рейтинг вниз, монеты не отнимаются');
  T = s.combatSince + lost.log.ticks * STEP * 1000 + 2000;
  s = combatApply(s, v2.verdict, T).snapshot;
  ok(duelStateOf(s, T).losses === 1 && duelStateOf(s, T).best === 1016, 'лучший рейтинг сезона запомнен');
  // попытки
  for (let i = 0; i < 6; i++) { act({ op: 'duel_start' }); act({ op: 'combat_end', outcome: 'retreat' }); }
  ok(act({ op: 'duel_start' }).reason === 'attempts', `попыток в день: ${DUEL.attemptsPerDay}`);
  T += DUEL.dayMs;
  ok(act({ op: 'duel_start' }).ok, 'на следующий день — снова');
  act({ op: 'combat_end', outcome: 'retreat' });
  // новый сезон: рейтинг сжимается к базе
  s.objects.duel = { ...s.objects.duel, rating: 1400 };
  T = seasonEndMs(0) + 1000;
  const ns = duelStateOf(s, T);
  ok(ns.season === 1 && ns.rating === 1200 && ns.wins === 0, 'новый сезон: рейтинг наполовину к 1000, счёт побед с нуля');
  ok(ns.prev?.season === 0 && ns.prev.rating === 1400 && ns.prev.wins === s.objects.duel.wins, 'итог прошлого сезона запоминается для награды');
  s.objects.duel = ns;
  ok(duelStateOf(s, T + DUEL.dayMs).prev?.season === 0, 'внутри сезона итог переносится как есть');
  ok(!duelStateOf({ objects: {} }, T).prev, 'у нового игрока прошлого сезона нет');
}

console.log('\nДуэль: сапфиры арены (v0.34.0)');
{
  const ids = LEAGUES.map((l) => l.id);
  ok(ids.every((id) => seasonSapphires(id) > 0) && ids.slice(1).every((id) => promoSapphires(id) > 0) && promoSapphires('bronze') === 0, 'итог сезона у каждой лиги, бонус — у всех, кроме Бронзы');
  const seas = ids.map(seasonSapphires), pro = ids.map(promoSapphires);
  ok(seas.every((v, i) => i === 0 || v > seas[i - 1]) && pro.slice(1).every((v, i) => i === 0 || v > pro[i]), 'награды растут вместе с лигой');
  ok(seasonSapphires('bronze') === 10 && seasonSapphires('legend') === 150 && DUEL.sapphires.minBattles === 5, 'Бронза 10 … Высшая лига 150, минимум 5 боёв');
  const r = duelRules();
  ok(r.leagues.length === 7 && r.leagues[2].id === 'gold' && r.leagues[2].from === 1250 && r.sapphires.season.master === 120, 'правила для сервера: лиги и награды');
  const s0 = emptySnapshot();
  ok(DUEL.sapphires.top.length === 3 && DUEL.sapphires.top[0] > DUEL.sapphires.top[1] && DUEL.sapphires.top[1] > DUEL.sapphires.top[2] && duelRules().sapphires.top[0] === 200, 'топ-3 сезона: 200 / 100 / 50, и они уходят в правила сервера');
  ok(applyAction(s0, { op: 'duel_season' }).result.reason === 'offline', 'без сервера сапфиры арены не выдаются');
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Дуэль: всё в порядке');
process.exit(failures ? 1 : 0);
