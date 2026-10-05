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
  // v0.20.0 — глава II «Город под инеем», квесты 1–5 (docs/design/chapter-2-quests-v0.1.md)
  CH2_START: 'ch2_start',
  CH2_CITY_ARRIVED: 'ch2_city_arrived',
  CH2_PLAZA_CLEARED: 'ch2_plaza_cleared',
  CH2_MET_ILARIA: 'ch2_met_ilaria',
  CH2_TRACE_ASTRAL: 'ch2_trace_astral',
  CH2_TRACE_DEBRIS: 'ch2_trace_debris',
  CH2_TRACE_FOUND: 'ch2_trace_found',
  CH2_ARCHIVE_READ: 'ch2_archive_read',
  CH2_MET_SEVERIN: 'ch2_met_severin',
  CITY_MERCHANT_OPEN: 'city_merchant_open',
};

// Финальная запись главы (журнал, HUD, финальное окно)
export const CHAPTER_1_FINAL = 'Защита рощи восстановлена. След беды ведёт в город';

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
  { id: 'compound', text: 'Сварите Состав ясного взгляда — он нужен у Древних ворот', craft: 'revealing_compound',
    done: s => has(s, EV.REVEALING_COMPOUND_CRAFTED) || has(s, EV.GATE_MARKS_REVEALED) },
  { id: 'guardian', text: 'Пройдите старый лес и одолейте Стража ворот',done: s => has(s, EV.GUARDIAN_DEFEATED) },
  { id: 'reveal',   text: 'Примените Состав ясного взгляда у Древних ворот', use: 'revealing_compound', done: s => has(s, EV.GATE_MARKS_REVEALED) },
  { id: 'seal',     text: 'Расскажите Селене, что вы увидели на воротах',         done: s => has(s, EV.UNLOCK_SEAL_1) },
  { id: 'training', text: 'Опробуйте Астрал на учебном камне у алтаря',   done: s => has(s, EV.SEAL_TRAINING_COMPLETE) },
  { id: 'gate',     text: 'Откройте Древние ворота Астралом',             done: s => has(s, EV.ANCIENT_GATE_OPEN) },
  { id: 'bundle',   text: 'Сварите Целебный сбор у котла Мирры', craft: 'restoration_bundle',
    done: s => has(s, EV.RESTORATION_BUNDLE_CRAFTED) || has(s, EV.CHAPTER_1_COMPLETE) },
  { id: 'trial',    text: 'Одолейте Хранителя сердца за воротами',             done: s => has(s, EV.CHAPTER_TRIAL_DEFEATED) },
  { id: 'repair',   text: 'Оживите сердце рощи: Целебный сбор и Астрал',  use: 'restoration_bundle', done: s => has(s, EV.CHAPTER_1_COMPLETE) },
  // v0.20.0: финал главы I — пока герой не поговорил с Миррой о городе
  { id: 'end',      text: CHAPTER_1_FINAL, done: s => has(s, EV.CH2_START) },
  // ---- глава II «Город под инеем», квесты 1–5
  { id: 'ch2_road',    text: 'Дорога в большой мир: идите по восточной тропе в город', done: s => has(s, EV.CH2_CITY_ARRIVED) },
  { id: 'ch2_plaza',   text: 'Морозная вспышка на площади! Остановите инеевого зверька', done: s => has(s, EV.CH2_PLAZA_CLEARED) },
  { id: 'ch2_ilaria',  text: 'Поговорите с Иларией Восс у Архива', done: s => has(s, EV.CH2_MET_ILARIA) },
  { id: 'ch2_trace',   text: 'Осмотрите площадь: Астрал проявит иней, Телекинез уберёт ящик',
    progress: s => `${[EV.CH2_TRACE_ASTRAL, EV.CH2_TRACE_DEBRIS].filter(k => has(s, k)).length}/2`,
    done: s => (has(s, EV.CH2_TRACE_ASTRAL) && has(s, EV.CH2_TRACE_DEBRIS)) || has(s, EV.CH2_TRACE_FOUND) },
  { id: 'ch2_tell',    text: 'Расскажите Иларии о находках', done: s => has(s, EV.CH2_TRACE_FOUND) },
  { id: 'ch2_archive', text: 'В Архиве прочтите старый документ Астралом', done: s => has(s, EV.CH2_ARCHIVE_READ) },
  { id: 'ch2_severin', text: 'Найдите Северина Вейра в Обществе Преображения', done: s => has(s, EV.CH2_MET_SEVERIN) },
  { id: 'ch2_next',    text: 'Продолжение расследования — в следующем обновлении главы II', done: () => false },
];
