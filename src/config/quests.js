// v0.8 — побочные задания. Только данные; логика — systems/QuestLog.js.
// Прогресс не хранится отдельно: он считается по инвентарю, побеждённым врагам и событиям (поэтому сервер не меняется).
// Сохраняются два события на задание: sq_<id>_start (принято) и sq_<id>_done (сдано, награда получена).
//
// Цели (objectives):
//   { type: 'item',  item, count, text }      — в сумке не меньше count предметов
//   { type: 'enemy', id, text }               — побеждён враг-триггер id (world.layout ENEMY_SPAWNS)
//   { type: 'event', key, text }              — произошло событие мира
// turnIn.consume — что отдаётся при сдаче (предметы уходят из сумки).

export const SIDE_QUESTS = {
  sq_herbs: {
    title: 'Лунные травы для Веды',
    giver: 'veda',
    place: 'Стартовая поляна',
    summary: 'Травница Веда варит настой и просит принести три лунные травы. Они растут на поляне и в лесу — их можно сорвать или притянуть Телекинезом.',
    objectives: [{ type: 'item', item: 'moon_herb', count: 3, text: 'Лунные травы' }],
    turnIn: { npc: 'veda', consume: { moon_herb: 3 } },
    reward: { heroXP: 15, coins: 25, items: { elixir_life: 1 } },
    rewardText: 'Настой жизни, 25 монет, 15 опыта',
  },
  sq_dust: {
    title: 'Пыль древних рун',
    giver: 'selena',
    place: 'Лунный алтарь',
    summary: 'Дух алтаря Селена просит найти руническую пыль у алтаря: её можно собрать с рунной плиты или найти под сдвинутым камнем.',
    objectives: [{ type: 'item', item: 'rune_dust', count: 1, text: 'Руническая пыль' }],
    turnIn: { npc: 'selena', consume: { rune_dust: 1 } },
    reward: { heroXP: 20, schoolXP: { telekinesis: 15 }, items: { lunar_shard: 1, elixir_mana: 1 } },
    rewardText: 'Лунный осколок, лунный эликсир, 20 опыта',
    requires: { event: 'lunar_quest_start' }, // Селена просит пыль, когда алтарь уже заговорил с героиней
  },
  sq_hunter: {
    title: 'Падальщик у тропы',
    giver: 'goran',
    place: 'Лесная тропа',
    summary: 'Охотник Горан просит прогнать падальщика, разорившего его лагерь у ручья. Огонь пугает зверя, брошенный камень ранит.',
    objectives: [{ type: 'enemy', id: 'scavenger_02', text: 'Прогнать падальщика' }],
    turnIn: { npc: 'goran', consume: {} },
    reward: { heroXP: 25, coins: 40, items: { tree_resin: 2, resin_flask: 1 } },
    rewardText: 'Смоляная склянка, 2 смолы, 40 монет, 25 опыта',
  },
};

export const SIDE_QUEST_ORDER = ['sq_herbs', 'sq_hunter', 'sq_dust'];

export const questEvent = (id, kind) => `${id}_${kind}`; // sq_herbs_start / sq_herbs_done
