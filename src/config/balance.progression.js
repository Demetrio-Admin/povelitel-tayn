// Развитие даров, ресурсы, таймеры и награды за события.
// Источник: Progression & Economy v0.1, First Location Blueprint v0.1 (зоны E, F).
import { RESOURCE_ITEMS } from './resources.js';
import { STORY_ITEMS } from './storyItems.js';

export const ITEMS = {
  coins:        { name: 'Монеты',          icon: 'icon_coin' },
  lunar_shard:  { name: 'Лунный осколок',  icon: 'icon_shard' },
  lunar_flame:  { name: 'Лунный огонёк',   icon: 'lunar_flame_01' },
  moon_herb:    { name: 'Лунная трава',     icon: 'moon_plant_01' },
  crimson_ember:{ name: 'Багровый уголь',    icon: 'icon_ember' },
  moonstone:    { name: 'Лунный камень (редкий)', icon: 'icon_shard' },
  rare_core:    { name: 'Редкое ядро',      icon: 'icon_core' },
  ...RESOURCE_ITEMS, // v0.8: лесные грибы, смола, пыль и расходники (названия лунной травы и осколка берутся отсюда)
  // v0.10.0: сюжетные предметы первой главы
  ...Object.fromEntries(Object.entries(STORY_ITEMS).map(([id, it]) => [id, { name: it.name, icon: it.icon }])),
};

// Таймеры изучения — секунды. С v0.10.2 игра идёт в режиме 'live': первая ступень занимает 5 минут
// (30 минут были слишком долго для первого этапа). 'prototype' — быстрый режим для разработки и автотестов.
export const TIMER_MODE = 'live'; // 'prototype' | 'live'

export const UPGRADES = {
  telekinesis_2: {
    ability: 'telekinesis', toLevel: 2,
    title: 'Телекинез II',
    description: 'Тяжёлые объекты, +35% урона бросками, новые проходы.',
    requires: { heroLevel: 3, abilityLevel: 1, event: 'lunar_quest_complete' },
    // v0.8: к осколкам добавились травы и пыль. Осколки награда за алтарь догоняет сама (topUp),
    // а травы и пыль игрок собирает сам — они растут заново (world.resources.js), так что застрять нельзя.
    cost: { schoolXP: 150, items: { lunar_shard: 5, moon_herb: 2, rune_dust: 1 }, noTopUp: ['moon_herb', 'rune_dust'] },
    timerSec: { prototype: 60, live: 5 * 60 },
    startEvent: 'telekinesis_2_start',
    completeEvent: 'telekinesis_2_complete',
  },
  // Следующие ступени — только данные, в маршрут прототипа не входят.
  fire_2: {
    ability: 'fire', toLevel: 2, title: 'Огонь II', locked: true,
    description: '+25% урона, более долгое горение.',
    requires: { heroLevel: 6, abilityLevel: 1 },
    cost: { schoolXP: 180, items: { crimson_ember: 6 } },
    timerSec: { prototype: 90, live: 45 * 60 },
  },
};

// Награды за события мира. topUpFor — гарантировать ресурсы на улучшение
// (Blueprint, зона E: «игрок получает достаточно ресурсов для Телекинеза II»).
export const EVENT_REWARDS = {
  first_world_interaction: { heroXP: 10 },
  lunar_quest_complete:    { heroXP: 50, schoolXP: { telekinesis: 40 }, items: { lunar_shard: 3 }, topUpFor: 'telekinesis_2' },
  telekinesis_2_complete:  { heroXP: 30 },
  heavy_path_open:         { heroXP: 20 },
  unlock_fire_1:           { heroXP: 30 },
  fire_gate_open:          { heroXP: 20, schoolXP: { fire: 20 } },
  // v0.10.0: Селена открывает Печать I сюжетно — без уровня, платы и таймера. Учебный знак и ворота дают только
  // обычный школьный опыт мира (+6), отдельной награды «за обучение» нет.
  unlock_seal_1:           { heroXP: 60 },
};
// lunar_quest_complete теперь выдаёт атомарная операция «применить Лунный фитиль» (storyItems.js STORY_USES.lunar_wick,
// те же числа); запись выше осталась для старого пути QuestFlags.complete и тестов — алтарь его больше не вызывает.

export const LUNAR_QUEST = { flamesRequired: 3 };
