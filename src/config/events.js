// Event keys прототипа (First Location Blueprint v0.1 §16) и цепочка задач для quest panel.

export const EV = {
  UNLOCK_TELEKINESIS_1: 'unlock_telekinesis_1',
  FIRST_WORLD_INTERACTION: 'first_world_interaction',
  FIRE_REQUIRED_01: 'fire_required_01',
  COMBAT_INTRO_01: 'combat_intro_01',
  LUNAR_QUEST_START: 'lunar_quest_start',
  LUNAR_QUEST_COMPLETE: 'lunar_quest_complete',
  TELEKINESIS_2_START: 'telekinesis_2_start',
  TELEKINESIS_2_COMPLETE: 'telekinesis_2_complete',
  HEAVY_PATH_OPEN: 'heavy_path_open',
  UNLOCK_FIRE_1: 'unlock_fire_1',
  FIRE_GATE_OPEN: 'fire_gate_open',
  FOREST_GUARDIAN_01: 'forest_guardian_01',
  GUARDIAN_DEFEATED: 'guardian_defeated',
  SEAL_REQUIRED_01: 'seal_required_01',
  PROTOTYPE_COMPLETE: 'prototype_complete',
  // адаптация: дополнительный ключ для маленького врага у огонька C
  LUNAR_GUARD_01: 'lunar_guard_01',
  HEAVY_BLOCKED_01: 'heavy_blocked_01',
  // v0.8
  MIRRA_TAUGHT_ALCHEMY: 'mirra_taught_alchemy',
  HUNTER_THREAT_01: 'hunter_threat_01',
  // v0.10.0 — первая глава «Лес, который забыл нас» (карта ключей — README, раздел «Состояния главы»)
  FIRST_CRAFT_COMPLETE: 'first_craft_complete',
  LUNAR_WICK_CRAFTED: 'lunar_wick_crafted',
  REVEALING_COMPOUND_CRAFTED: 'revealing_compound_crafted',
  GATE_MARKS_REVEALED: 'gate_marks_revealed',
  UNLOCK_SEAL_1: 'unlock_seal_1',
  SEAL_TRAINING_COMPLETE: 'seal_training_complete',
  ANCIENT_GATE_OPEN: 'ancient_gate_open',
  CHAPTER_TRIAL_DEFEATED: 'chapter_trial_defeated',
  RESTORATION_BUNDLE_CRAFTED: 'restoration_bundle_crafted',
  CHAPTER_1_COMPLETE: 'chapter_1_complete',
};

// Финальная запись главы (журнал, HUD, финальное окно)
export const CHAPTER_1_FINAL = 'Защита этого участка восстановлена. След вмешательства ведёт в город';

// Шаги маршрута. Текущая цель = первый невыполненный шаг.
// done(state) — чистая функция от GameState, без ссылок на сцены.
// v0.10.0: craft — сюжетный рецепт шага (журнал показывает его состав и где взять недостающее),
// use — сюжетный предмет, который шаг просит применить (журнал показывает, есть ли он в сумке).
const has = (s, k) => s.hasEvent(k);
const altarLit = s => has(s, EV.LUNAR_QUEST_COMPLETE);
export const QUEST_STEPS = [
  { id: 'book',     text: 'Прочтите книгу первого дара на столе в доме',          done: s => has(s, EV.UNLOCK_TELEKINESIS_1) },
  { id: 'move',     text: 'Проверьте дар: сдвиньте камень на поляне Телекинезом',done: s => has(s, EV.FIRST_WORLD_INTERACTION) },
  { id: 'fight',    text: 'Идите по лесной тропе на север, к алтарю',                done: s => s.isEnemyDefeated('scavenger_01') },
  { id: 'altar',    text: 'Узнайте, почему гаснет Лунный алтарь',                     done: s => has(s, EV.LUNAR_QUEST_START) },
  // v0.10.0: огоньки уходят в фитиль, поэтому шаг сбора выполнен и тогда, когда их в сумке уже нет
  { id: 'flames',   text: 'Соберите три лунных огонька для алтаря',                    progress: s => `${Math.min(3, s.flamesCollected())}/3`,
    done: s => s.flamesCollected() >= 3 || s.item('lunar_wick') > 0 || has(s, EV.LUNAR_WICK_CRAFTED) || altarLit(s) },
  { id: 'wick',     text: 'Сварите Лунный фитиль у котла Мирры', craft: 'lunar_wick', done: s => has(s, EV.LUNAR_WICK_CRAFTED) || altarLit(s) },
  { id: 'return',   text: 'Вставьте Лунный фитиль в алтарь', use: 'lunar_wick', done: altarLit },
  { id: 'research', text: 'Начните изучение Телекинеза II у алтаря',     done: s => has(s, EV.TELEKINESIS_2_START) },
  { id: 'wait',     text: 'Дождитесь завершения изучения',               done: s => has(s, EV.TELEKINESIS_2_COMPLETE) },
  { id: 'heavy',    text: 'Сдвиньте тяжёлую глыбу за алтарём',            done: s => has(s, EV.HEAVY_PATH_OPEN) },
  { id: 'fire',     text: 'Исследуйте древний круг Огня',                done: s => has(s, EV.UNLOCK_FIRE_1) },
  { id: 'roots',    text: 'Вернитесь к чёрным корням у дома и сожгите их',  done: s => has(s, EV.FIRE_GATE_OPEN) },
  { id: 'compound', text: 'Сварите Проявляющий состав — он нужен у Древних ворот', craft: 'revealing_compound',
    done: s => has(s, EV.REVEALING_COMPOUND_CRAFTED) || has(s, EV.GATE_MARKS_REVEALED) },
  { id: 'guardian', text: 'Пройдите старый лес и одолейте Стража ворот',done: s => has(s, EV.GUARDIAN_DEFEATED) },
  { id: 'reveal',   text: 'Примените Проявляющий состав к Древним воротам', use: 'revealing_compound', done: s => has(s, EV.GATE_MARKS_REVEALED) },
  { id: 'seal',     text: 'Расскажите Селене о знаке на воротах',         done: s => has(s, EV.UNLOCK_SEAL_1) },
  { id: 'training', text: 'Опробуйте Печать на учебном знаке у алтаря',   done: s => has(s, EV.SEAL_TRAINING_COMPLETE) },
  { id: 'gate',     text: 'Откройте Древние ворота Печатью',             done: s => has(s, EV.ANCIENT_GATE_OPEN) },
  { id: 'bundle',   text: 'Сварите Восстановительную связку у котла Мирры', craft: 'restoration_bundle',
    done: s => has(s, EV.RESTORATION_BUNDLE_CRAFTED) || has(s, EV.CHAPTER_1_COMPLETE) },
  { id: 'trial',    text: 'Одолейте Стража узла за воротами',             done: s => has(s, EV.CHAPTER_TRIAL_DEFEATED) },
  { id: 'repair',   text: 'Восстановите узел: связка и Печать',  use: 'restoration_bundle', done: s => has(s, EV.CHAPTER_1_COMPLETE) },
  { id: 'end',      text: CHAPTER_1_FINAL, done: () => false },
];
