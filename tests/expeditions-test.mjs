// v0.24.0 — вылазки: данные мест, сопротивления (разные дары для разных мест), бои и запасы на JS-зеркале сервера, повтор через время.
//   node tests/expeditions-test.mjs
import { ENEMIES } from '../src/config/balance.enemies.js';
import { INTERACTIVES, ENEMY_SPAWNS, ZONES, WORLD } from '../src/config/world.layout.js';
import { EXP_X, FROSTWOOD_START, GRAVEYARD_START } from '../src/config/world.expeditions.js';
import { DISPLAY_SIZE } from '../src/config/assets.manifest.js';
import { applyAction, emptySnapshot, combatApply } from '../src/cloud/playerModel.js';
import { verifyCombat } from '../src/cloud/combatVerify.js';
import { playBot, ctxFor } from './helpers/combat-bot.mjs';
import { STEP } from '../src/systems/combatReplay.js';
import fs from 'fs';

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failures++; console.log('  ✗', m); } };

console.log('\nВылазки: данные');
{
  ok(WORLD.width === 5400 && ZONES.some(z => z.id === 'FW') && ZONES.some(z => z.id === 'GY'), 'мир шире: Морозный лес и Старое кладбище к востоку от города');
  const exp = [...INTERACTIVES, ...ENEMY_SPAWNS].filter(o => o.x >= EXP_X);
  ok(exp.length >= 24 && exp.every(o => o.x < WORLD.width && o.y < WORLD.height), `в вылазках ${exp.length} объектов, все внутри мира`);
  ok(exp.filter(o => o.kind !== 'travel').every(o => o.requiresEvent === 'chapter_2_complete'), 'всё внутри открывается после главы II');
  const spawns = ENEMY_SPAWNS.filter(o => o.x >= EXP_X);
  ok(spawns.length === 10 && spawns.every(s => s.repeatSec >= 600), 'десять мест боя, все возобновляются (звери — 10 мин, вожак и страж — час)');
  for (const id of ['frost_wolf', 'frost_alpha', 'grave_wisp', 'grave_hound', 'barrow_warden']) {
    const e = ENEMIES[id];
    ok(e && fs.existsSync(`public/assets/sprites/${e.texture}.png`) && DISPLAY_SIZE[e.texture] && e.repeatRewards, `${e?.name}: данные, спрайт, награда за повтор`);
  }
  ok(ENEMIES.frost_wolf.weaknesses.ice < 0 && ENEMIES.frost_wolf.weaknesses.fire > 0 && ENEMIES.grave_wisp.weaknesses.fire < 0 && ENEMIES.grave_wisp.weaknesses.seal > 0,
    'в лесу Лёд слабее, а Огонь сильнее; на кладбище наоборот Огонь слабее, Астрал сильнее');
  const caches = INTERACTIVES.filter(o => o.kind === 'stash' && o.x >= EXP_X);
  ok(caches.length === 2 && caches.every(c => c.items.frost_shard === 1 && spawns.some(s => s.id === c.guard && s.repeatSec === 3600)), 'запасы вожака и стража: инеевый осколок за каждую победу (раз в час)');
  const t = INTERACTIVES.filter(o => o.kind === 'travel' && o.brief);
  ok(t.length === 2 && t.every(o => o.target === FROSTWOOD_START || o.target === GRAVEYARD_START), 'указатели из города: описание места перед отправкой');
}

console.log('\nВылазки: сервер (JS-зеркало)');
{
  let s = { ...emptySnapshot(), level: 15, xp: 8000,
    abilities: { telekinesis: { level: 3, unlocked: true }, fire: { level: 2, unlocked: true }, seal: { level: 2, unlocked: true }, ice: { level: 3, unlocked: true } } };
  s.inventory = { ...s.inventory, elixir_life: 6, elixir_mana: 4 };
  s.objects.player_build = { branches: { telekinesis: 'lord', ice: 'frost' }, slots: ['fire', 'telekinesis', 'seal'] };
  let T = 2e12;
  const act = (a) => { T += 60_000; const r = applyAction(s, a, T); s = r.snapshot; return r.result; };
  const fight = (spawn, enemy) => {
    T += 900_000;
    const st = act({ op: 'combat_start', spawn, enemy });
    if (!st.ok) return { ok: false, reason: st.reason };
    let best = null;
    for (let seed = 1; seed <= 6 && !best; seed++) { const p = playBot(s.combatCtx, { seed, policy: 'smart', maxTicks: 60 * 240 }); if (p.cm.result === 'victory') best = p; }
    if (!best) return { ok: false, reason: 'lost' };
    const v = verifyCombat(s, JSON.parse(JSON.stringify(best.log)), s.combatSince + best.log.ticks * STEP * 1000 + 1000);
    if (!v.ok) { act({ op: 'combat_end', outcome: 'retreat', mana: 1 }); return { ok: false, reason: v.reason }; }
    T = s.combatSince + best.log.ticks * STEP * 1000 + 2000;
    s = combatApply(s, v.verdict, T).snapshot;
    return { ok: v.verdict.outcome === 'victory', time: best.cm.time, first: v.verdict.first };
  };
  ok(fight('fw_wolf_1', 'frost_wolf').reason === 'locked', 'до конца главы II бой в вылазке не засчитывается');
  ok(act({ op: 'world', obj: 'fw_herb_1' }).reason === 'locked', 'и сбор тоже');
  s.quests = [...s.quests, 'chapter_2_complete'];
  ok(act({ op: 'world', obj: 'fw_herb_1' }).ok && act({ op: 'world', obj: 'fw_crystal_1' }).ok, 'сбор в Морозном лесу: морозник и ледяной кристалл');
  const w = fight('fw_wolf_1', 'frost_wolf');
  ok(w.ok, `волчица (Огонь в слотах) — ${Math.round(w.time || 0)} с`);
  ok(act({ op: 'world', obj: 'fw_cache' }).reason !== undefined && !(s.inventory.frost_shard > 0), 'логово закрыто, пока вожак не побеждён');
  s.inventory.elixir_life = 6;
  const a = fight('fw_alpha', 'frost_alpha');
  ok(a.ok, `Вожак метели побеждён за ${Math.round(a.time || 0)} с` + (a.ok ? '' : ` (${a.reason})`));
  ok(act({ op: 'world', obj: 'fw_cache' }).ok && s.inventory.frost_shard === 1, 'логово: инеевый осколок');
  ok(act({ op: 'world', obj: 'fw_cache' }).reason !== undefined && s.inventory.frost_shard === 1, 'одна выдача за победу');
  ok(fight('fw_alpha', 'frost_alpha').reason === 'down', 'вожак вернётся только через час');
  T += 3_600_000;
  s.inventory.elixir_life = 6;
  const a2 = fight('fw_alpha', 'frost_alpha');
  ok(a2.ok && a2.first === false && act({ op: 'world', obj: 'fw_cache' }).ok && s.inventory.frost_shard === 2, 'через час — снова вожак и снова добыча (награда за повтор)');
  // кладбище: Астрал вместо Огня
  ok(act({ op: 'build_set', slots: ['seal', 'telekinesis', 'ice'] }).ok, 'на кладбище — Астрал, Телекинез и Лёд');
  s.inventory.elixir_life = 6;
  const g1 = fight('gy_wisp_1', 'grave_wisp'), g2 = fight('gy_warden', 'barrow_warden');
  ok(g1.ok && g2.ok && act({ op: 'world', obj: 'gy_cache' }).ok && s.inventory.frost_shard === 3, `огонёк (${Math.round(g1.time || 0)} с) и Страж кургана (${Math.round(g2.time || 0)} с), сокровище кургана`);
}

console.log(failures ? `\n✗ ПРОВАЛЕНО: ${failures}` : '\n✓ Вылазки: всё в порядке');
process.exit(failures ? 1 : 0);
