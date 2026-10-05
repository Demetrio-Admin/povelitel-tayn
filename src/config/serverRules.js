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
    requires: o.requiresEvent ? [o.requiresEvent] : [],
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
      schoolXP: up.cost.schoolXP, items: { ...(up.cost.items || {}) },
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
  return { respecCoins: BRANCH_RESPEC.coins, branches };
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
  const events = Object.fromEntries(Object.entries(EVENT_ACTIONS).map(([k, e]) => [k, { requires: e.requires || [], unlock: e.unlock || {} }]));
  const eventRewards = Object.fromEntries(Object.entries(EVENT_REWARDS).map(([k, r]) => [k, grantOf(r)]));
  return {
    recipes, uses: STORY_USES, firstCraft: FIRST_CRAFT, migration: MIGRATION_V10, vitals, potions, world: worldRules(),
    events, eventRewards, quests: questRules(), research: researchRules(), build: buildRules(), spawnStart: spawnStartRules(),
  };
}
