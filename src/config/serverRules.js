// Правила, которые знает сервер (функция _game_rules() в supabase/schema.sql генерируется отсюда: node tools/sql/gen-rules.mjs;
// тот же объект читает JS-зеркало cloud/playerModel.js). Только данные из конфигов — ничего не придумывается руками здесь.
//
// v0.10.0: рецепты и сюжетные предметы. v0.12.0: восстановление HP и маны. v0.13.0: действия в мире (world).
// v0.15.0: всё остальное, что клиент раньше записывал сам через sync_player — сюжетные события, побочные задания, изучение даров,
//          смена ветки, опыт даров за магию в мире. Теперь это операции сервера (README «v0.15.0»).
import { RECIPES } from './recipes.js';
import { VITALS, HERO_RECOVERY } from './balance.hero.js';
import { POTIONS } from './resources.js';
import { ZONES, INTERACTIVES, ENEMY_SPAWNS } from './world.layout.js';
import { ABILITIES, WORLD_MANA_COST, WEIGHT_CLASSES, SCHOOL_XP_PER_USE } from './balance.abilities.js';
import { UPGRADES, TIMER_MODE, EVENT_REWARDS, BRANCH_RESPEC } from './balance.progression.js';
import { SIDE_QUESTS, SIDE_QUEST_ORDER, questEvent } from './quests.js';
import { STORY_USES, FIRST_CRAFT, MIGRATION_V10 } from './storyItems.js';
import { buildSlotRules } from './build.js';
import { sapphireRules } from './sapphires.js';
import { bagRules, GIFT_PRICES } from './bag.js';
import { shopRules } from './shop.js';
import { dailyRules } from './daily.js';
import { covenRules } from './covens.js';
import { duelRules } from './duel.js';

/**
 * Награда из конфигов → формат серверной операции (_grant / grant):
 * { heroXP, coins, items:{id:N}, schoolXP:{школа:N}, topUp:{ school:{школа:минимум}, items:{id:минимум} } }.
 * topUpFor (гарантия цены изучения) раскладывается в topUp; ресурсы из noTopUp игрок добывает сам, их не доливаем.
 */
export function grantOf(r = {}) {
  const g = {};
  if (r.heroXP) g.heroXP = r.heroXP;
  if (r.coins) g.coins = r.coins;
  if (r.items && Object.keys(r.items).length) g.items = { ...r.items };
  if (r.schoolXP && Object.keys(r.schoolXP).length) g.schoolXP = { ...r.schoolXP };
  const up = r.topUpFor ? UPGRADES[r.topUpFor] : null;
  if (up) {
    const items = {};
    for (const [k, v] of Object.entries(up.cost.items || {})) if (!up.cost.noTopUp?.includes(k)) items[k] = v;
    g.topUp = { school: { [up.ability]: up.cost.schoolXP }, items };
  }
  return g;
}

/**
 * v0.15.0: сюжетные события, которые игрок отмечает сам действием в мире, диалогом или окном ({ op: 'event', key }).
 * Всё, чего здесь нет, клиент отметить не может: события боёв, крафта, применения предметов, заданий и изучения ставят свои операции.
 *   requires — какие события уже должны быть (то же условие, что у диалога или объекта в игре),
 *   unlock   — дар, который открывается вместе с событием ({ id: ступень }); награда события — из EVENT_REWARDS (balance.progression.js).
 *   v0.22.0: blockedBy — события, после которых это уже нельзя (reason 'done'); consume — предметы, которые событие забирает
 *   ({ id: N }, не хватает — 'missing'); branch — ветка дара ({ ice: 'frost' }); marks — какие события отметить вместе с этим;
 *   sapphires — сапфиры в награду (в журнал сапфиров с ref 'event:<ключ>', повтор невозможен).
 */
export const EVENT_ACTIONS = {
  prologue_seen: {},
  mirra_taught_alchemy: {},
  // подсказки «здесь нужен дар / сила»: отмечаются при первом взгляде на закрытый объект, наград нет
  fire_required_01: {},
  heavy_blocked_01: {},
  unlock_telekinesis_1: { unlock: { telekinesis: 1 } },
  lunar_quest_start: { requires: ['unlock_telekinesis_1'] },
  unlock_fire_1: { requires: ['heavy_path_open'], unlock: { fire: 1 } },
  unlock_seal_1: { requires: ['gate_marks_revealed'], unlock: { seal: 1 } },
  // v0.20.0 — глава II, квесты 1–5 (диалоги Мирры, Иларии, Северина, торговца; первый вход на площадь)
  ch2_start: { requires: ['chapter_1_complete'] },
  ch2_city_arrived: { requires: ['ch2_start'] },
  ch2_met_ilaria: { requires: ['ch2_plaza_cleared'] },
  ch2_trace_found: { requires: ['ch2_trace_astral', 'ch2_trace_debris'] },
  ch2_met_severin: { requires: ['ch2_archive_read'] },
  city_merchant_open: { requires: ['ch2_city_arrived'] },
  // v0.21.0 — квесты 6–10 (торговец, Илария, Северин, Нэрис)
  ch2_cargo_start: { requires: ['ch2_met_severin'] },
  ch2_cargo_reported: { requires: ['ch2_cargo_found', 'ch2_serials_read'] },
  ch2_severin_asked: { requires: ['ch2_cargo_reported'] },
  ch2_frost_wave: { requires: ['ch2_lab_critter'] },
  ch2_nerys_met: { requires: ['ch2_construct_unstable'] },
  ch2_rescue_done: { requires: ['ch2_rescue_door', 'ch2_rescue_cellar'] },
  unlock_ice_1: { requires: ['ch2_rescue_done', 'warm_potion_crafted'], unlock: { ice: 1 } },
  ch2_ice_trained: { requires: ['ch2_training_done'] },
  ch2_choice_start: { requires: ['ch2_ice_trained'] },
  ch2_quarter_cleared: { requires: ['ch2_ice_guardian_defeated', 'ch2_deep_1', 'ch2_deep_2'] },
  // v0.22.0 — квесты 11–15 (Нэрис, Тихон, Илария, Северин, Ровена, Мирра)
  unlock_ice_2: { requires: ['ch2_quarter_cleared'], consume: { coins: GIFT_PRICES.storyIce2.coins }, unlock: { ice: 2 } },
  ch2_brittle_done: { requires: ['ch2_brittle_1', 'ch2_brittle_2', 'brittle_flask_crafted'] },
  ch2_lab_found: { requires: ['ch2_brittle_done'] },
  ch2_stabilized: { requires: ['ch2_vol_1', 'ch2_vol_2'], consume: { stabilizing_potion: 2 } },
  ch2_lab_reported: { requires: ['ch2_stabilized', 'ch2_lab_journal'] },
  // ответ героя Северину — без ветвления сюжета, только отношение (его вспомнит Мирра)
  ch2_view_danger: { requires: ['ch2_lab_reported'], blockedBy: ['ch2_severin_confronted'] },
  ch2_view_methods: { requires: ['ch2_lab_reported'], blockedBy: ['ch2_severin_confronted'] },
  ch2_view_market: { requires: ['ch2_lab_reported'], blockedBy: ['ch2_severin_confronted'] },
  ch2_view_unsure: { requires: ['ch2_lab_reported'], blockedBy: ['ch2_severin_confronted'] },
  ch2_severin_confronted: { requires: ['ch2_lab_reported'] },
  ch2_coven_met: { requires: ['ch2_severin_confronted'] },
  ch2_coven_supplies: { requires: ['ch2_coven_met'], consume: { crystal_guard: 1, frost_herb: 2 } },
  ch2_coven_ready: { requires: ['ch2_unstable_1', 'ch2_unstable_2', 'ch2_coven_supplies'] },
  ch2_final_start: { requires: ['ch2_coven_ready'] },
  // Лёд III перед боем: ветка выбирается один раз (ch2_ice3 — общая отметка, по ней появляется Северин)
  ch2_ice3_frost: { requires: ['ch2_fin_tk', 'ch2_fin_fire', 'ch2_fin_ice', 'ch2_fin_seal'], blockedBy: ['ch2_ice3'], consume: { coins: GIFT_PRICES.storyIce3.coins }, unlock: { ice: 3 }, branch: { ice: 'frost' }, marks: ['ch2_ice3'] },
  ch2_ice3_shard: { requires: ['ch2_fin_tk', 'ch2_fin_fire', 'ch2_fin_ice', 'ch2_fin_seal'], blockedBy: ['ch2_ice3'], consume: { coins: GIFT_PRICES.storyIce3.coins }, unlock: { ice: 3 }, branch: { ice: 'shard' }, marks: ['ch2_ice3'] },
  ch2_epilogue: { requires: ['ch2_letters_read'] },
  chapter_2_complete: { requires: ['ch2_epilogue'], marks: ['title_frost_survivor'], sapphires: 5 },
};

/**
 * v0.13.0: действия в мире, которые выполняет сервер ({ op: 'world', obj }). Правила строятся из конфигурации объектов мира:
 *   kind 'gather' — сбор узла: ресурс, мана, возрождение по времени сервера (respawnSec); состояние объекта { state: 'picked', t }
 *   kind 'loot'   — разовая находка (сундук, подбор, осмотр с запасом, растение/огонёк Телекинезом, награда из-под камня или куста);
 *                   состояние { state: mark }; parent — объект, который должен быть уже в нужном состоянии (камень сдвинут, куст сожжён)
 *   kind 'stash'  — запас под охраной: один победный цикл охранника — одна выдача (claimed)
 *   kind 'cast'   — магия: Телекинез толкает, Огонь жжёт, Астрал открывает ворота
 * Поля: mana (цена), ability + minLevel (нужный дар), requires (события), requiresEnemy (побеждённые враги), blockedBy (события «уже сделано»),
 * reward (награда как у операций сервера).
 * v0.15.0: у магии (cast и притягивание) добавились: school — опыт дара за применение в мире, events — события, которые отмечает сам
 * успех (с наградами EVENT_REWARDS), path — открываемый путь, mark — состояние объекта после успеха (его пишет сервер; повтор — «уже сделано»).
 * Состояние объектов из этого списка пишет только сервер (sync_player игнорирует их ключи).
 */
export function worldRules() {
  const world = {};
  const base = (o) => ({
    requires: [o.requiresEvent, o.waitEvent].filter(Boolean),   // v0.21.0: waitEvent — объект виден, но поддаётся после события
    requiresEnemy: o.requiresEnemyDefeated ? [o.requiresEnemyDefeated] : [],
  });
  const itemReward = (item, amount) => (item === 'coins' ? { coins: amount } : { items: { [item]: amount } });
  const tkLevel = (weight) => {
    for (const [lvl, st] of Object.entries(ABILITIES.telekinesis.levels)) if (WEIGHT_CLASSES.indexOf(weight) <= WEIGHT_CLASSES.indexOf(st.maxWeight)) return Number(lvl);
    return 99;
  };
  const pickupAfter = (o, spawn, parentState) => {
    if (spawn) world[`${o.id}_reward`] = { kind: 'loot', mark: 'collected', reward: itemReward(spawn.item, spawn.amount || 1), parent: { id: o.id, state: parentState } };
  };
  const school = (ability) => ({ [ability]: SCHOOL_XP_PER_USE.exploration[ability] || 0 });
  /** События успеха и путь: first_world_interaction, doneEvent / openEvent / destroyEvent, opensPath. */
  const effects = (o) => {
    const events = [];
    if (o.countsAsFirstInteraction) events.push('first_world_interaction');
    for (const k of [o.doneEvent, o.openEvent, o.destroyEvent]) if (k) events.push(k);
    const out = { events };
    if (o.opensPath) out.path = o.opensPath;
    return out;
  };
  for (const o of INTERACTIVES) {
    switch (o.kind) {
      case 'gather':
        world[o.id] = { kind: 'gather', item: o.res, amount: o.amount || 1, respawnSec: o.respawnSec ?? 180, mana: WORLD_MANA_COST.gather, ...base(o) };
        break;
      case 'chest': world[o.id] = { kind: 'loot', mark: 'opened', reward: o.reward, ...base(o) }; break;
      case 'pickup': world[o.id] = { kind: 'loot', mark: 'collected', reward: itemReward(o.item, o.amount || 1), ...base(o) }; break;
      case 'inspect': if (o.first) world[o.id] = { kind: 'loot', mark: 'looted', reward: { items: o.first.items }, ...base(o) }; break;
      case 'stash': world[o.id] = { kind: 'stash', guard: o.guard, items: o.items, ...base(o) }; break;
      case 'telekinesis': {
        const weight = o.weight || 'light';
        const mana = o.mode === 'pull' ? WORLD_MANA_COST.pull : (WORLD_MANA_COST.push[weight] ?? WORLD_MANA_COST.push.light);
        if (o.mode === 'pull') world[o.id] = { kind: 'loot', mark: 'collected', reward: o.reward || {}, mana, ability: 'telekinesis', minLevel: tkLevel(weight), school: school('telekinesis'), ...effects(o), ...base(o) };
        else world[o.id] = { kind: 'cast', mark: 'moved', mana, ability: 'telekinesis', minLevel: tkLevel(weight), blockedBy: [], school: school('telekinesis'), ...effects(o), ...base(o) };
        pickupAfter(o, o.hiddenReward?.spawnPickup, 'moved');
        break;
      }
      case 'fire':
        world[o.id] = { kind: 'cast', mark: o.persistent ? 'burning' : 'destroyed', mana: WORLD_MANA_COST.fire, ability: 'fire', minLevel: 1, blockedBy: [],
          school: school('fire'), ...effects(o), ...base(o) };
        pickupAfter(o, o.reveal?.spawnPickup, 'destroyed');
        break;
      case 'ice':   // v0.21.0: заморозить Льдом (вода → проход, механизм, нестабильный предмет)
        world[o.id] = { kind: 'cast', mark: 'frozen', mana: WORLD_MANA_COST.ice, ability: 'ice', minLevel: o.minLevel || 1, blockedBy: [],
          school: school('ice'), ...effects(o), ...base(o) };
        break;
      case 'gate':
        // Астрал открывает ворота только после всей цепочки: Страж побеждён, знаки проявлены, дар получен, камень опробован
        world[o.id] = { kind: 'cast', mana: WORLD_MANA_COST.seal, ability: 'seal', minLevel: 1, blockedBy: [o.openEvent], school: school('seal'), ...effects(o),
          requires: ['guardian_defeated', 'gate_marks_revealed', 'unlock_seal_1', 'seal_training_complete'], requiresEnemy: [] };
        break;
      case 'seal_sigil':
        world[o.id] = { kind: 'cast', mana: WORLD_MANA_COST.seal, ability: 'seal', minLevel: 1, blockedBy: [o.doneEvent], school: school('seal'), ...effects(o), ...base(o) };
        break;
      default: break;
    }
  }
  return world;
}

/** Побочные задания (op 'quest_accept' / 'quest_turn_in'): условия и награда — из config/quests.js, прогресс считает сервер по своим данным. */
export function questRules() {
  const out = {};
  for (const id of SIDE_QUEST_ORDER) {
    const q = SIDE_QUESTS[id];
    out[id] = {
      start: questEvent(id, 'start'), done: questEvent(id, 'done'),
      requires: q.requires?.event || null,
      objectives: q.objectives.map(o => (o.type === 'item' ? { type: 'item', item: o.item, count: o.count }
        : o.type === 'enemy' ? { type: 'enemy', id: o.id } : { type: 'event', key: o.key })),
      consume: { ...(q.turnIn?.consume || {}) },
      reward: grantOf(q.reward),
    };
  }
  return out;
}

/** Изучение даров (op 'research_start' / 'research_finish'): цена, условия и длительность по режиму таймеров TIMER_MODE — из UPGRADES. */
export function researchRules() {
  const out = {};
  for (const [id, up] of Object.entries(UPGRADES)) {
    const r = up.requires || {};
    out[id] = {
      ability: up.ability, toLevel: up.toLevel, branch: up.branch || null, locked: !!up.locked,
      heroLevel: r.heroLevel || 0, abilityLevel: r.abilityLevel || 0, event: r.event || null,
      schoolXP: up.cost.schoolXP, items: { ...(up.cost.items || {}), coins: up.cost.coins || 0 }, sapphires: up.cost.sapphires || 0,
      durationMs: up.timerSec[TIMER_MODE] * 1000,
      startEvent: up.startEvent || null, completeEvent: up.completeEvent || null,
    };
  }
  return out;
}

/** Ветки даров и цена смены (op 'respec'): { price, branches: { дар: { ветка: { fromLevel } } } }. */
export function buildRules() {
  const branches = {};
  for (const [id, a] of Object.entries(ABILITIES)) {
    if (!a.branches) continue;
    branches[id] = Object.fromEntries(Object.entries(a.branches).map(([b, v]) => [b, { fromLevel: v.fromLevel || 1 }]));
  }
  // v0.16.0: слоты даров (три; 4-й уровнем не открывается — v0.16.4), два слота амулетов, список даров и амулетов (config/build.js)
  return { respecCoins: BRANCH_RESPEC.coins, branches, ...buildSlotRules() };
}

/** События, которые сервер ставит в начале боя: сюда место боя → событие и условие (раньше это делал клиент до combat_start). */
export function spawnStartRules() {
  const out = {};
  for (const s of ENEMY_SPAWNS) if (s.startEvent) out[s.id] = { event: s.startEvent, requires: s.requiresEvent || null };
  return out;
}

/** То, что читает сервер (функция _game_rules в schema.sql генерируется из этого: node tools/sql/gen-rules.mjs). */
export function serverRules() {
  const recipes = Object.fromEntries(Object.entries(RECIPES).map(([id, r]) => [id, {
    result: r.result, amount: r.amount, needs: r.needs, requires: r.requires || [], crafted: r.crafted || null, blockedBy: r.blockedBy || [],
  }]));
  // v0.12.0: восстановление HP и маны считает сервер по времени (см. README «v0.12.0»)
  const house = ZONES.find(z => z.id === VITALS.houseZone);
  const vitals = {
    hpRegenPerSec: VITALS.hpRegenPerSec, manaRegenWorld: VITALS.manaRegenWorld, manaRegenHouse: VITALS.manaRegenHouse,
    house: { x: house.x, y: house.y, w: house.w, h: house.h },
    defeatHpFraction: HERO_RECOVERY.defeatHpFraction, staleCombatSec: VITALS.staleCombatSec,
  };
  // зелья, которые пьются вне боя (op 'drink'): сколько долей максимума возвращают
  const potions = Object.fromEntries(Object.entries(POTIONS).filter(([, p]) => p.outside && (p.effect.type === 'heal' || p.effect.type === 'mana'))
    .map(([id, p]) => [id, { kind: p.effect.type, amount: p.effect.amount }]));
  // v0.15.0
  const events = Object.fromEntries(Object.entries(EVENT_ACTIONS).map(([k, e]) => [k, {
    requires: e.requires || [], unlock: e.unlock || {},
    // v0.22.0: blockedBy — событие уже не нужно; consume — что забирает (предметы); branch — ветка дара вместе с открытием;
    // marks — ещё события вместе с этим (с их наградами); sapphires — сапфиры в награду (журнал сапфиров, один раз)
    blockedBy: e.blockedBy || [], consume: e.consume || {}, branch: e.branch || {}, marks: e.marks || [], sapphires: e.sapphires || 0,
  }]));
  const eventRewards = Object.fromEntries(Object.entries(EVENT_REWARDS).map(([k, r]) => [k, grantOf(r)]));
  return {
    recipes, uses: STORY_USES, firstCraft: FIRST_CRAFT, migration: MIGRATION_V10, vitals, potions, world: worldRules(),
    events, eventRewards, quests: questRules(), research: researchRules(), build: buildRules(), spawnStart: spawnStartRules(),
    sapphires: sapphireRules(), bag: bagRules(),
    shop: shopRules(),             // v0.19.0: торговец
    daily: dailyRules(),           // v0.23.0: доска поручений
    covens: covenRules(),          // v0.25.0: Ковены (недельная цель)
    duel: duelRules(),             // v0.26.0: Магическая Дуэль
    combatPotions: Object.keys(POTIONS),   // v0.19.0: какие расходники бой запоминает в начале и списывает по итогам
  };
}
