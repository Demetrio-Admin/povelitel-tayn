// v0.10.0 — первая глава «Лес, который забыл нас»: сюжетные предметы, их применение и разовые награды операций сервера.
// Эти правила (вместе с RECIPES) выполняет атомарная операция player_action — на сервере (supabase/schema.sql,
// функция _game_rules) и в JS-зеркале (cloud/playerModel.js applyAction); совпадение проверяет tools/sql/diff-test.mjs.
// Награда: { heroXP, coins, schoolXP:{школа:N}, items:{id:N}, topUp:{ school:{школа:минимум}, items:{id:минимум} } }.

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
