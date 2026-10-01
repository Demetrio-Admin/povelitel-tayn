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
};

// Шаги маршрута. Текущая цель = первый невыполненный шаг.
// done(state) — чистая функция от GameState, без ссылок на сцены.
export const QUEST_STEPS = [
  { id: 'book',     text: 'Изучите магическую книгу в доме',          done: s => s.hasEvent(EV.UNLOCK_TELEKINESIS_1) },
  { id: 'move',     text: 'Выйдите наружу и сдвиньте камень Телекинезом',done: s => s.hasEvent(EV.FIRST_WORLD_INTERACTION) },
  { id: 'fight',    text: 'Идите по лесной тропе на север',                done: s => s.isEnemyDefeated('scavenger_01') },
  { id: 'altar',    text: 'Осмотрите Лунный алтарь',                     done: s => s.hasEvent(EV.LUNAR_QUEST_START) },
  { id: 'flames',   text: 'Соберите лунные огоньки',                    progress: s => `${Math.min(3, s.flamesCollected())}/3`,
    done: s => s.flamesCollected() >= 3 || s.hasEvent(EV.LUNAR_QUEST_COMPLETE) },
  { id: 'return',   text: 'Верните огоньки к алтарю',                    done: s => s.hasEvent(EV.LUNAR_QUEST_COMPLETE) },
  { id: 'research', text: 'Начните изучение Телекинеза II у алтаря',     done: s => s.hasEvent(EV.TELEKINESIS_2_START) },
  { id: 'wait',     text: 'Дождитесь завершения изучения',               done: s => s.hasEvent(EV.TELEKINESIS_2_COMPLETE) },
  { id: 'heavy',    text: 'Сдвиньте тяжёлую глыбу за алтарём',            done: s => s.hasEvent(EV.HEAVY_PATH_OPEN) },
  { id: 'fire',     text: 'Исследуйте древний круг Огня',                done: s => s.hasEvent(EV.UNLOCK_FIRE_1) },
  { id: 'roots',    text: 'Вернитесь к чёрным корням у дома и сожгите их',  done: s => s.hasEvent(EV.FIRE_GATE_OPEN) },
  { id: 'guardian', text: 'Пройдите старый лес и одолейте Лесного Стража',done: s => s.hasEvent(EV.GUARDIAN_DEFEATED) },
  { id: 'gate',     text: 'Дойдите до Древних ворот',                       done: s => s.hasEvent(EV.SEAL_REQUIRED_01) },
  { id: 'end',      text: 'Прототип пройден. Ворота ждут Печать',          done: () => false },
];
