// Расчёты к «Модели монетизации v0.1» (подготовка, без изменений игры). Работает на конфигах и боевом движке v0.10.0.
//   node tools/balance/monetization-sim.mjs        — markdown-таблицы для docs/MONETIZATION-v0.1-prep.md
//
// 1. Повторный ресурсный выход по реальным узлам и Корневикам; чему по добыче равны наборы из каталога (§5–6).
// 2. Премиум +25 % через накопитель по каждому ресурсу (§7): проверка таблицы «4 выхода».
// 3. Обереги (§8): +12 % маны / +10 % HP / +8 % урона на Страже ворот, Страже узла и Корневике — бот с задержкой
//    реакции и пропусками прерываний, с зельями и без, с полной и половинной маной.
// Ничего из этого не цены и не решения: только числа для обсуждения.
import { GameState } from '../../src/state/GameState.js';
import { QuestFlags } from '../../src/state/QuestFlags.js';
import { EventBus } from '../../src/state/EventBus.js';
import { AbilitySystem } from '../../src/systems/AbilitySystem.js';
import { CombatManager } from '../../src/systems/CombatManager.js';
import { INTERACTIVES, ENEMY_SPAWNS } from '../../src/config/world.layout.js';
import { ENEMIES } from '../../src/config/balance.enemies.js';
import { RECIPES } from '../../src/config/recipes.js';
import { HERO_LEVELS } from '../../src/config/balance.hero.js';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const MATS = ['moon_herb', 'forest_mushroom', 'tree_resin', 'rune_dust'];
const NAME = { moon_herb: 'Трава', forest_mushroom: 'Грибы', tree_resin: 'Смола', rune_dust: 'Пыль', lunar_shard: 'Осколки' };

// ---------------------------------------------------------------- 1. повторный выход
function repeatRun() {
  const y = { moon_herb: 0, forest_mushroom: 0, tree_resin: 0, rune_dust: 0, lunar_shard: 0 };
  const src = { moon_herb: [], forest_mushroom: [], tree_resin: [], rune_dust: [], lunar_shard: [] };
  for (const o of INTERACTIVES.filter(o => o.kind === 'gather')) { y[o.res] += o.amount || 1; src[o.res].push(o.id); }
  const rep = ENEMY_SPAWNS.filter(e => e.repeatSec);
  const rr = ENEMIES.rootling.repeatRewards;
  for (const e of rep) for (const [k, v] of Object.entries(rr.items)) { y[k] += v; src[k].push(e.id); }
  const stash = INTERACTIVES.find(o => o.kind === 'stash');
  for (const [k, v] of Object.entries(stash.items)) { y[k] += v; src[k].push(stash.id); }
  return { y, src, xp: rr.heroXP * rep.length, coins: rr.coins * rep.length, fights: rep.length };
}

const KITS = {
  'Набор для похода (99 ₽)': { moon_herb: 6, forest_mushroom: 2, tree_resin: 2, rune_dust: 3 },
  'Набор знакомства (149 ₽, один раз)': { moon_herb: 12, forest_mushroom: 4, tree_resin: 4, rune_dust: 6 },
};
const brews = (inv) => {   // что можно сварить из набора по назначению §6 (2 настоя, 2 эликсира, 1 склянка на комплект)
  const need = (id) => RECIPES[id].needs;
  const inv2 = { ...inv }; const out = { elixir_life: 0, elixir_mana: 0, resin_flask: 0 };
  for (let round = 0; round < 20; round++) for (const [id, n] of [['elixir_life', 2], ['elixir_mana', 2], ['resin_flask', 1]]) {
    for (let i = 0; i < n; i++) if (Object.entries(need(id)).every(([k, v]) => (inv2[k] || 0) >= v)) { for (const [k, v] of Object.entries(need(id))) inv2[k] -= v; out[id]++; }
  }
  return { out, left: inv2 };
};

// ---------------------------------------------------------------- 2. премиум +25 % с накопителем
function premium(runs, perRun, rate = 0.25) {
  const acc = Object.fromEntries(MATS.map(k => [k, 0])); const base = { ...acc }, bonus = { ...acc };
  for (let r = 0; r < runs; r++) for (const k of MATS) {
    for (let u = 0; u < perRun[k]; u++) { base[k]++; acc[k] += rate; while (acc[k] >= 1 - 1e-9) { acc[k] -= 1; bonus[k]++; } }
  }
  return { base, bonus, acc };
}

// ---------------------------------------------------------------- 3. обереги
const AMULETS = {
  'без оберега': {},
  'Лунный (+12 % маны)': { mana: 0.12 },
  'Лесной (+10 % HP)': { hp: 0.10 },
  'Сосредоточения (+8 % урона)': { dmg: 0.08 },
};

/** Бот с человеческими поправками: реакция на сильную подготовку через delay с, каждое miss-е предупреждение пропускается. */
function makeBot({ delay = 0, miss = 0 } = {}) {
  let warn = 0, decided = null;
  return (cm) => {
    const e = cm.enemy, sa = e.def.strongAttack;
    const ready = id => cm.abilityState(id).state === 'ready';
    const heavy = cm.fieldObjects.find(o => o.available && o.def.weight === 'heavy' && o.def.throwable && cm.canLift(o));
    const light = cm.fieldObjects.find(o => o.available && o.def.weight !== 'heavy' && o.def.throwable);
    const crystal = cm.fieldObjects.find(o => o.available && o.def.breaksArmor);
    if (cm.hero.hp < cm.hero.maxHp * 0.4 && cm.state.item('elixir_life') > 0) cm.usePotion('elixir_life');
    if (cm.hero.mana < 20 && cm.state.item('elixir_mana') > 0) cm.usePotion('elixir_mana');
    if (cm.state.item('resin_flask') > 0 && e.hp > 120 && !e.isPreparing && (cm.stats.potions || 0) < 3) cm.usePotion('resin_flask');
    const sealOnly = sa && !sa.interruptBy.some(t => t.startsWith('telekinesis'));
    if (e.isPreparing) {
      if (decided === null) { warn++; decided = miss && warn % miss === 0 ? 'skip' : 'act'; }
      const elapsed = sa.prepSec - e.prepLeft;
      if (decided === 'skip' || elapsed < delay) return;
      if (sa.interruptBy.includes('seal') && ready('seal') && (sealOnly || !ready('telekinesis') || (!heavy && !sa.interruptBy.includes('telekinesis')))) { cm.useAbility('seal'); return; }
      if (sealOnly) return;
      const needsHeavy = !sa.interruptBy.includes('telekinesis');
      if (ready('telekinesis') && (!needsHeavy || heavy)) { cm.selectedId = needsHeavy ? heavy.id : (light?.id ?? null); cm.useAbility('telekinesis'); return; }
      return;
    }
    decided = null;
    if (sealOnly && e.strongCd < 4 && cm.hero.mana < 44) return;
    const strongSoon = sa && e.strongCd < 2.5;
    if (crystal && e.armorActive && ready('telekinesis') && !strongSoon) { cm.selectedId = crystal.id; cm.useAbility('telekinesis'); return; }
    if (ready('fire')) { cm.useAbility('fire'); return; }
    if (ready('telekinesis') && !strongSoon) { cm.selectedId = (heavy && !(sa && !sa.interruptBy.includes('telekinesis'))) ? heavy.id : (light?.id ?? null); cm.useAbility('telekinesis'); }
  };
}

function fight(type, { level, amulet = {}, potions = false, manaFrac = 1, bot = {} }) {
  const state = new GameState(mem(), () => 0);
  const bus = new EventBus();
  const abilities = new AbilitySystem(state, new QuestFlags(state, bus), bus);
  abilities.unlock('telekinesis', 2); abilities.unlock('fire', 1);
  if (type === 'node_guardian') abilities.unlock('seal', 1);
  state.addHeroXP(HERO_LEVELS.find(r => r.level === level).xp);
  if (potions) { state.addItem('elixir_life', 2); state.addItem('elixir_mana', 2); }
  const cm = new CombatManager({ enemyType: type, state, abilities });
  const h = cm.hero;
  // оберег: множители к максимуму и урону; бой начинается с доли нового максимума маны и полным HP
  h.maxMana = Math.round(h.maxMana * (1 + (amulet.mana || 0)));
  h.maxHp = Math.round(h.maxHp * (1 + (amulet.hp || 0)));
  h.damageMult = h.damageMult * (1 + (amulet.dmg || 0));
  h.mana = h.maxMana * manaFrac; h.hp = h.maxHp;
  cm.commit = () => {};   // в симуляции общий запас не пишем (оберег меняет максимум, которого нет в таблице уровней)
  const b = makeBot(bot);
  let t = 0; while (!cm.result && t < 400) { b(cm); cm.tick(1 / 30); t += 1 / 30; }
  return { win: cm.result === 'victory', sec: +cm.time.toFixed(1), hpLeft: Math.round(cm.hero.hp), maxHp: h.maxHp, enemyLeft: cm.enemy.hp, potions: cm.stats.potions || 0 };
}

// ---------------------------------------------------------------- вывод
const out = [];
const P = (s = '') => out.push(s);
const run = repeatRun();
P('### 1. Повторный ресурсный выход (реальные узлы и Корневики v0.10.0)');
P('');
P('| Материал | За один выход | Источники |');
P('| --- | --- | --- |');
for (const k of [...MATS, 'lunar_shard']) P(`| ${NAME[k]} | ${run.y[k]} | ${run.src[k].join(', ')} |`);
P(`| XP / монеты | ${run.xp} / ${run.coins} | ${run.fights} повторных Корневика × (${ENEMIES.rootling.repeatRewards.heroXP} XP, ${ENEMIES.rootling.repeatRewards.coins} монет) |`);
P('');
P('### 2. Наборы из каталога против повторного выхода');
P('');
P('| Набор | Состав | Сколько выходов заменяет (по самому дефицитному материалу) | Что сварить (по назначению §6) |');
P('| --- | --- | --- | --- |');
for (const [name, kit] of Object.entries(KITS)) {
  const runs = Math.max(...MATS.map(k => kit[k] / run.y[k]));
  const per = MATS.map(k => `${NAME[k]} ${(kit[k] / run.y[k]).toFixed(1)}`).join(', ');
  const b = brews(kit);
  P(`| ${name} | ${MATS.map(k => `${NAME[k].toLowerCase()} ${kit[k]}`).join(', ')} | **${runs.toFixed(1)}** (${per}) | ${b.out.elixir_life} настоя, ${b.out.elixir_mana} эликсира, ${b.out.resin_flask} склянки; остаток ${MATS.map(k => b.left[k]).join('/')} |`);
}
P('');
P('### 3. Премиум +25 % (накопитель по каждому ресурсу, бонус «+1» на каждые 4 обычные единицы)');
P('');
const prem = premium(4, run.y);
P('| Материал | 4 обычных выхода | 4 выхода с премиумом | Остаток накопителя |');
P('| --- | --- | --- | --- |');
for (const k of MATS) P(`| ${NAME[k]} | ${prem.base[k]} | ${prem.base[k] + prem.bonus[k]} | ${prem.acc[k].toFixed(2)} |`);
P(`| Осколки / XP / монеты | ${run.y.lunar_shard * 4} / ${run.xp * 4} / ${run.coins * 4} | без изменений (бонус их не касается) | — |`);
P('');
P('### 4. Обереги на боевом движке');
P('');
const cases = [
  ['Страж ворот (420 HP), ур. 5', 'forest_guardian', 5],
  ['Страж узла (900 HP), ур. 6', 'node_guardian', 6],
  ['Корневик (230 HP), ур. 5', 'rootling', 5],
];
const styles = [
  ['идеальная реакция', { potions: true, bot: {} }],
  ['реакция 1,2 с, пропуск каждого 3-го удара', { potions: true, bot: { delay: 1.2, miss: 3 } }],
  ['то же, половина маны на старте', { potions: true, manaFrac: 0.5, bot: { delay: 1.2, miss: 3 } }],
  ['без зелий, реакция 1,2 с', { potions: false, bot: { delay: 1.2 } }],
];
for (const [title, type, level] of cases) {
  P(`**${title}** — победа · время · HP после боя (из максимума) · зелий`);
  P('');
  P(`| Стиль | ${Object.keys(AMULETS).join(' | ')} |`);
  P(`| --- | ${Object.keys(AMULETS).map(() => '---').join(' | ')} |`);
  for (const [sname, opt] of styles) {
    if (type === 'rootling' && sname !== 'идеальная реакция' && sname !== 'без зелий, реакция 1,2 с') continue;
    const cells = Object.values(AMULETS).map(a => { const r = fight(type, { level, amulet: a, ...opt }); return r.win ? `✓ ${r.sec} с · ${r.hpLeft}/${r.maxHp} · ${r.potions}` : `✗ ${r.sec} с (враг ${r.enemyLeft})`; });
    P(`| ${sname} | ${cells.join(' | ')} |`);
  }
  P('');
}
console.log(out.join('\n'));
