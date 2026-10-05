// v0.10.0 — первая глава «Лес, который забыл нас»: сюжетные предметы, их применение и разовые награды операций сервера.
// Эти правила (вместе с RECIPES) выполняет атомарная операция player_action — на сервере (supabase/schema.sql,
// функция _game_rules) и в JS-зеркале (cloud/playerModel.js applyAction); совпадение проверяет tools/sql/diff-test.mjs.
// Награда: { heroXP, coins, schoolXP:{школа:N}, items:{id:N}, topUp:{ school:{школа:минимум}, items:{id:минимум} } }.
import { RECIPES } from './recipes.js';
import { VITALS, HERO_RECOVERY } from './balance.hero.js';
import { POTIONS } from './resources.js';
import { ZONES, INTERACTIVES } from './world.layout.js';
import { ABILITIES, WORLD_MANA_COST, WEIGHT_CLASSES } from './balance.abilities.js';

/** Сюжетные предметы: название, иконка, где применить (интерфейс). Предметы инвентаря как обычные, но не зелья. */
export const STORY_ITEMS = {
  lunar_wick: { name: 'Лунный фитиль', icon: 'icon_wick', color: 0x9fe9ff,
    purpose: 'Вернёт свет Лунному алтарю. Применить у алтаря.' },
  revealing_compound: { name: 'Состав ясного взгляда', icon: 'icon_compound', color: 0xc9a2ff,
    purpose: 'Покажет стёртый знак на Древних воротах. Применить у ворот после победы над Стражем.' },
  restoration_bundle: { name: 'Целебный сбор', icon: 'icon_bundle', color: 0x7be28a,
    purpose: 'Вылечит сердце рощи за воротами вместе с Астралом (20 маны).' },
};
export const STORY_ITEM_ORDER = ['lunar_wick', 'revealing_compound', 'restoration_bundle'];

/**
 * Применение сюжетного предмета ({ op: 'use', item }): requires — нужные события, blockedBy — уже сделано,
 * mana — цена (один каст Астрала у сердца рощи), events — что отмечается, reward — разовая награда.
 */
export const STORY_USES = {
  lunar_wick: {
    requires: ['lunar_quest_start'], blockedBy: ['lunar_quest_complete'], events: ['lunar_quest_complete'],
    // прежняя разовая награда алтаря + гарантия цены Телекинеза II по школьному опыту и осколкам (трава и пыль — сами)
    reward: { heroXP: 50, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 3 }, topUp: { school: { telekinesis: 150 }, items: { lunar_shard: 5 } } },
  },
  revealing_compound: {
    requires: ['guardian_defeated'], blockedBy: ['gate_marks_revealed'], events: ['gate_marks_revealed'],
    reward: { heroXP: 30 },
  },
  restoration_bundle: {
    requires: ['chapter_trial_defeated', 'unlock_seal_1'], blockedBy: ['chapter_1_complete'], mana: 20, events: ['chapter_1_complete'],
    reward: { heroXP: 100, coins: 30, schoolXP: { seal: 40 } },
  },
};

/** Первый успешный крафт в котле — +15 опыта один раз (дальнейший крафт опыта героя не даёт). */
export const FIRST_CRAFT = { event: 'first_craft_complete', reward: { heroXP: 15 } };

/**
 * Разовая миграция старых сохранений (op 'migrate_v10'): если Страж побеждён до v0.10, а ядра нет и связку не делали —
 * одно ядро. Флаг event отмечается в любом случае, поэтому перезагрузка и повторный запуск компенсацию не повторяют.
 */
export const MIGRATION_V10 = { event: 'mig_v10', guardian: 'forest_guardian_01', item: 'rare_core',
  notIf: ['restoration_bundle_crafted', 'chapter_1_complete'] };

/**
 * v0.13.0: действия в мире, которые выполняет сервер ({ op: 'world', obj }). Правила строятся из конфигурации объектов мира:
 *   kind 'gather' — сбор узла: ресурс, мана, возрождение по времени сервера (respawnSec); состояние объекта { state: 'picked', t }
 *   kind 'loot'   — разовая находка (сундук, подбор, осмотр с запасом, растение/огонёк Телекинезом, награда из-под камня или куста);
 *                   состояние { state: mark }; parent — объект, который должен быть уже в нужном состоянии (камень сдвинут, куст сожжён)
 *   kind 'stash'  — запас под охраной: один победный цикл охранника — одна выдача (claimed)
 *   kind 'cast'   — магия без награды: Телекинез толкает, Огонь жжёт, Астрал открывает ворота — сервер только проверяет дар и списывает ману
 * Поля: mana (цена), ability + minLevel (нужный дар), requires (события), requiresEnemy (побеждённые враги), blockedBy (события «уже сделано»),
 * reward (награда как у операций сервера). Состояние объектов kind gather/loot/stash пишет только сервер (sync_player игнорирует их ключи).
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
        if (o.mode === 'pull') world[o.id] = { kind: 'loot', mark: 'collected', reward: o.reward || {}, mana, ability: 'telekinesis', minLevel: tkLevel(weight), ...base(o) };
        else world[o.id] = { kind: 'cast', mana, ability: 'telekinesis', minLevel: tkLevel(weight), blockedBy: [], ...base(o) };
        pickupAfter(o, o.hiddenReward?.spawnPickup, 'moved');
        break;
      }
      case 'fire':
        world[o.id] = { kind: 'cast', mana: WORLD_MANA_COST.fire, ability: 'fire', minLevel: 1, blockedBy: [], ...base(o) };
        pickupAfter(o, o.reveal?.spawnPickup, 'destroyed');
        break;
      case 'gate':
        // Астрал открывает ворота только после всей цепочки: Страж побеждён, знаки проявлены, дар получен, камень опробован
        world[o.id] = { kind: 'cast', mana: WORLD_MANA_COST.seal, ability: 'seal', minLevel: 1, blockedBy: [o.openEvent],
          requires: ['guardian_defeated', 'gate_marks_revealed', 'unlock_seal_1', 'seal_training_complete'], requiresEnemy: [] };
        break;
      case 'seal_sigil':
        world[o.id] = { kind: 'cast', mana: WORLD_MANA_COST.seal, ability: 'seal', minLevel: 1, blockedBy: [o.doneEvent], ...base(o) };
        break;
      default: break;
    }
  }
  return world;
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
  return { recipes, uses: STORY_USES, firstCraft: FIRST_CRAFT, migration: MIGRATION_V10, vitals, potions, world: worldRules() };
}
