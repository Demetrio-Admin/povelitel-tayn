// Детерминированный проход главы III «Безымянная роща» тем же путём, что и глава II (story-pass.mjs): без побочных поручений,
// ежедневных заданий и повторных врагов. Герой стартует там, где его оставила глава II (15 уровень, Телекинез II, Огонь I, Астрал I,
// Лёд III), а дальше всё идёт настоящими серверными операциями (applyAction: event / world / craft) и проверенными боями
// (combat_start → бот → verifyCombat → combatApply). Скрипт заодно проверяет серверные правила главы: если событие, предмет
// или вход в бой не проходят на сервере, проход падает с понятным сообщением.
//
//   node tools/balance/chapter3-pass.mjs            — отчёт JSON: бои, уровни, монеты, зелья, остатки материалов
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { storyPass } from './story-pass.mjs';
import { applyAction, combatApply } from '../../src/cloud/playerModel.js';
import { verifyCombat } from '../../src/cloud/combatVerify.js';
import { serverRules } from '../../src/config/serverRules.js';
import { INTERACTIVES } from '../../src/config/world.layout.js';
import { STEP } from '../../src/systems/combatReplay.js';
import { playBot } from '../../tests/helpers/combat-bot.mjs';

const HP_PER_FIGHT_WARN = 0.2;   // меньше 20 % здоровья в конце победного боя — бой слишком тесный

export async function chapter3Pass({ log = () => {} } = {}) {
  const base = await storyPass();
  let s = base.snapshot, time = 2.1e12;
  const fights = [], notes = [];
  const act = (op, args = {}) => {
    time += 300_000;
    const r = applyAction(s, { op, ...args }, time, () => .999999);
    s = r.snapshot;
    assert.ok(r.result.ok, `${op} ${JSON.stringify(args)}: ${JSON.stringify(r.result)}`);
    return r.result;
  };
  const event = key => act('event', { key });
  const world = obj => act('world', { obj });
  const slots = (...list) => act('build_set', { slots: list });
  const has = key => s.quests.includes(key);
  let spent = 0;
  const buy = (item, qty) => { const before = s.inventory.coins; act('shop_buy', { item, qty }); spent += before - s.inventory.coins; };
  /** Крафт: недостающее добывается тем же, чем его добыл бы игрок, — узлами сбора, открытыми к этому шагу, — и докупается в лавке. */
  const craft = recipe => {
    for (const [item, n] of Object.entries(serverRules().recipes[recipe].needs)) {
      if (item === 'coins') continue;
      const nodes = INTERACTIVES.filter(o => o.kind === 'gather' && o.res === item && (!o.requiresEvent || has(o.requiresEvent)));
      for (let i = 0; (s.inventory[item] || 0) < n && nodes.length && i < 60; i++) {
        try { world(nodes[i % nodes.length].id); } catch { /* узел ещё не вырос: берём следующий */ }
      }
      const remain = Math.max(0, n - (s.inventory[item] || 0));
      if (remain) { notes.push(`${recipe}: не хватило ${item} ×${remain} у узлов — докуплено в лавке`); buy(item, remain); }
    }
    return act('craft', { recipe });
  };
  const replenish = (target = 2) => { while ((s.inventory.potion_life_medium || 0) < target) craft('potion_life_medium'); };

  // Бот: те же приёмы, что в главе II, плюс зелья по ходу боя.
  const driver = (cm, input) => {
    const e = cm.enemy, ready = id => cm.abilityState(id).state === 'ready';
    const heavy = cm.fieldObjects.find(o => o.available && o.def.weight === 'heavy' && cm.canLift(o));
    const light = cm.fieldObjects.find(o => o.available && o.def.throwable && o.def.weight !== 'heavy');
    const crystal = cm.fieldObjects.find(o => o.available && o.def.breaksArmor);
    const throwAt = o => { if (o) input('s', o.id); return input('a', 'telekinesis'); };
    if (cm.heroChill.left > 0 && !cm.chillResist && cm.potionSlots.includes('warm_potion')) input('p', 'warm_potion');
    if (cm.hero.hp < cm.hero.maxHp * .8) input('p', 'potion_crystal_shield');
    if (cm.hero.hp < cm.hero.maxHp * .55) input('p', 'potion_life_medium');
    if (cm.hero.mana < 20) for (const id of cm.potionSlots) if (id.includes('mana')) { input('p', id); break; }
    if (e.isPreparing && ready('telekinesis')) { throwAt(e.def.strongAttack.interruptBy.includes('telekinesis') ? light : heavy); return; }
    const soon = e.def.strongAttack && e.strongCd < 2.5;
    if (crystal && e.armorActive && ready('telekinesis') && !soon) { throwAt(crystal); return; }
    if (ready('ice')) { input('a', 'ice'); return; }
    if (ready('seal') && cm.hero.mana >= 34 && !soon) { input('a', 'seal'); return; }
    if (ready('fire')) { input('a', 'fire'); return; }
    if (ready('telekinesis') && !soon) throwAt(light);
  };
  const fight = (spawn, enemy, { prep = [], build, life = 0 } = {}) => {
    if (life) replenish(life);   // как в главе II: к сильным боям игрок варит зелья здоровья
    for (const r of prep) craft(r);
    if (build) slots(...build);   // игрок подбирает три дара из четырёх под семью врагов (README главы: «даров четыре, слотов три»)
    time += Math.max(0, 250 - (s.mana || 0)) * 2000;   // отдых между боями: мана восстанавливается сама
    act('combat_start', { spawn, enemy, balanceVersion: 40 });
    let best, tries = 0;
    const attempts = [];
    for (let seed = 1; seed <= 8 && !best; seed++) {
      tries++;
      const play = playBot(s.combatCtx, { seed, policy: 'smart', driver });
      attempts.push(`seed ${seed}: ${play.cm.result} за ${play.cm.time.toFixed(0)} с, у врага осталось ${Math.round(100 * play.cm.enemy.hp / play.cm.enemy.maxHp)}% здоровья, зелий ${play.cm.stats.potions || 0}`);
      if (play.cm.result === 'victory') best = play;
    }
    assert.ok(best, `${spawn} (${enemy}): ни одной победы бота на уровне ${s.level}, зелий здоровья ${s.inventory.potion_life_medium || 0}\n  ${attempts.join('\n  ')}`);
    time = s.combatSince + best.log.ticks * STEP * 1000 + 1000;
    const v = verifyCombat(s, best.log, time); assert.ok(v.ok, `${spawn}: ${v.reason}`);
    const xpBefore = s.xp, levelBefore = s.level;
    s = combatApply(s, v.verdict, time, () => .999999).snapshot;
    const hpLeft = best.cm.hero.hp / best.cm.hero.maxHp;
    fights.push({ spawn, enemy, level: levelBefore, levelAfter: s.level, seconds: +best.cm.time.toFixed(1), potions: best.cm.stats.potions || 0,
      hpLeft: +hpLeft.toFixed(2), tries, xp: s.xp - xpBefore });
    if (hpLeft < HP_PER_FIGHT_WARN) notes.push(`${spawn}: победа с ${Math.round(hpLeft * 100)}% здоровья — бой тесный`);
    log(`  бой ${spawn}: ${best.cm.time.toFixed(0)} с, зелий ${best.cm.stats.potions || 0}, здоровья ${Math.round(hpLeft * 100)}%, ур. ${s.level}`);
  };

  const coinsAtStart = s.inventory.coins, xpAtStart = s.xp;
  // ---- Акт I: подпись без имени
  event('ch3_start'); event('ch3_ilaria_talk'); event('ch3_severin_talk'); world('ch3_glass_leaf');
  assert.ok(has('ch3_leaf_read'), 'стеклянный лист прочитан Астралом');
  // ---- Акт II: стеклянная тишина (стеклянные звери — Лёд и Телекинез; эхо — Астрал)
  const BEASTS = ['ice', 'telekinesis', 'seal'], ECHO = ['seal', 'telekinesis', 'ice'], NEEDLE = ['fire', 'telekinesis', 'seal'];
  event('ch3_grove_arrived'); event('ch3_nerys_met');
  fight('gb_stoat_1', 'glass_stoat', { build: BEASTS }); fight('gb_stoat_2', 'glass_stoat', { build: BEASTS });
  event('ch3_nameless_met'); slots(...ECHO); world('ge_echo_stream');
  fight('ge_echo_1', 'echo_wisp', { build: ECHO }); fight('ge_echo_2', 'echo_wisp', { build: ECHO });
  craft('memory_draught'); event('ch3_name_stream');
  slots('fire', 'telekinesis', 'ice'); world('ge_dam'); assert.ok(has('ch3_dam_open'), 'плотина растоплена Огнём');
  // ---- Акт III: сад Ивы
  world('gg_jar_bird'); world('gg_jar_fox'); event('ch3_iva_met');
  slots(...ECHO); world('gg_echo_willow'); craft('memory_draught'); event('ch3_name_willow');
  slots('fire', 'telekinesis', 'ice'); world('gr_roots'); assert.ok(has('ch3_roots_open'), 'корни Ракиты отогреты');
  fight('gr_needle_1', 'needle', { build: NEEDLE }); fight('gr_needle_2', 'needle', { build: NEEDLE }); fight('gr_needle_elite', 'needle_elite', { build: NEEDLE, life: 2 });
  // ---- Акт IV: отпустить
  event('ch3_mirra_met'); slots(...ECHO); world('gr_echo_vetla');
  slots('ice', 'telekinesis', 'fire'); world('gh_wall'); world('gh_wall_block'); world('gh_bridge'); world('gh_cocoon');
  slots('seal', 'telekinesis', 'ice'); world('gh_ward');
  assert.ok(['ch3_lock_wall', 'ch3_lock_bridge', 'ch3_lock_sapling', 'ch3_lock_ward'].every(has), 'четыре замка открыты');
  fight('gh_guardian', 'glass_guardian', { build: ['ice', 'telekinesis', 'seal'], life: 3, prep: ['potion_crystal_shield'] });
  event('ch3_iva_refused');
  fight('gh_reflection', 'iva_reflection', { build: ['ice', 'telekinesis', 'seal'], life: 4, prep: ['potion_mana_medium', 'potion_crystal_shield'] });
  event('ch3_name_vetla'); event('ch3_vetla_blessing'); event('ch3_epilogue');
  const xpBeforeFinalReward = s.xp; event('chapter_3_complete');

  return {
    start: { level: base.final.level, xp: xpAtStart, coins: coinsAtStart, sapphires: base.final.sapphires },
    fights, notes, spent,
    final: { level: s.level, xp: s.xp, coins: s.inventory.coins, sapphires: s.wallet.sapphires, xpBeforeFinalReward,
      glass_leaf: s.inventory.glass_leaf || 0, memory_spark: s.inventory.memory_spark || 0, willow_bark: s.inventory.willow_bark || 0, vetla_seed: s.inventory.vetla_seed || 0 },
    snapshot: s,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { snapshot, ...report } = await chapter3Pass({ log: console.error });
  console.log(JSON.stringify(report, null, 2));
}
