// Эпизод «Первое пламя»: шаги, цели и прогресс (без Phaser — проверяется в Node).
// Прогресс эпизода хранится в одном объекте мира 'episode' изолированного сохранения.
import { controlLevel, PRACTICE_FOR_CONFIDENT } from './heat.js';

export const EPISODE_ID = 'first_flame';

/** Что нужно для ритуала Проводника (id предметов существующей игры, чтобы сумка показывала их как обычно). */
export const RITUAL_NEEDS = { tree_resin: 2, moon_herb: 3, frost_shard: 1 };

export const STEPS = [
  { id: 'intro', goal: 'Поговорить с Миррой', target: 'ep_mirra' },
  { id: 'goran', goal: 'Расспросить Горана у костра', target: 'ep_goran' },
  { id: 'tree', goal: 'Убрать с северной тропы поваленное дерево', target: 'ep_tree', why: 'За деревом — тропа к ледяной стене.' },
  { id: 'wall', goal: 'Посмотреть на ледяную стену', target: 'ep_wall', why: 'Что светится подо льдом?' },
  { id: 'ask_fire', goal: 'Спросить Мирру, чем растопить лёд', target: 'ep_mirra' },
  { id: 'spark', goal: 'Разбудить искру в круге огня', target: 'ep_circle' },
  { id: 'herbs', goal: 'Отогреть замёрзшие травы Веды', target: 'ep_herbs_1', why: 'Мягко: травы должны оттаять, а не сгореть.' },
  { id: 'gather', goal: 'Собрать для ритуала Проводника', target: null, why: 'Ритуал направит огонь сквозь толстый лёд.' },
  { id: 'ritual', goal: 'Провести ритуал в круге огня', target: 'ep_circle' },
  { id: 'melt', goal: 'Растопить ледяную стену направленным пламенем', target: 'ep_wall' },
  { id: 'fight', goal: 'Волк метели!', target: 'ep_wolf' },
  { id: 'enter', goal: 'Пройти в Морозный лес', target: 'ep_frost_path' },
  { id: 'sanctuary', goal: 'Подняться к ледяному святилищу', target: 'ep_crystal', why: 'Тёплый свет идёт оттуда.' },
  { id: 'done', goal: 'Эпизод пройден', target: null },
];

export const stepIndex = (id) => STEPS.findIndex(s => s.id === id);
export const stepDef = (id) => STEPS[stepIndex(id)] || STEPS[0];

export function freshProgress() {
  return {
    episode: EPISODE_ID, step: 'intro',
    lesson: false, practice: 0, charred: 0, herbsThawed: 0, resinBurnt: 0,
    fireLevel: 0, loadout: null, fights: 0, defeats: 0,
    encounters: {}, morven: false, usePotion: false, amulet: null,
    found: [],   // что игрок уже увидел/сделал (для реплик и проверок)
  };
}

export function readProgress(state) {
  const saved = state.getObject('episode');
  return saved?.episode === EPISODE_ID ? { ...freshProgress(), ...saved } : freshProgress();
}

export function writeProgress(state, ep) {
  state.setObject('episode', { ...ep });
  state.save();
}

/** Перейти к следующему шагу (только вперёд; повторный вызов для уже пройденного шага ничего не делает). */
export function advance(ep, fromId) {
  const i = stepIndex(ep.step);
  if (fromId && ep.step !== fromId) return false;
  if (i < 0 || i >= STEPS.length - 1) return false;
  ep.step = STEPS[i + 1].id;
  return true;
}

export const atLeast = (ep, id) => stepIndex(ep.step) >= stepIndex(id);
export const fireControl = (ep) => controlLevel(ep);

/** Отметить удачное применение огня. Возвращает true, если только что открылся «Уверенный огонь». */
export function notePractice(ep) {
  if (!ep.lesson) return false;
  const before = controlLevel(ep);
  ep.practice += 1;
  return before < 2 && controlLevel(ep) === 2;
}

export function ritualMissing(inventory) {
  return Object.entries(RITUAL_NEEDS)
    .map(([id, n]) => ({ id, need: n, have: Math.min(n, inventory[id] || 0) }))
    .filter(x => x.have < x.need);
}

/** Строка цели для HUD: с количеством для сбора и пояснением. */
export function goalLine(ep, inventory = {}, names = {}) {
  const s = stepDef(ep.step);
  if (s.id === 'gather') {
    const parts = Object.entries(RITUAL_NEEDS).map(([id, n]) => `${names[id] || id} ${Math.min(n, inventory[id] || 0)}/${n}`);
    return `${s.goal}: ${parts.join(', ')}`;
  }
  if (s.id === 'herbs' && ep.charred && !ep.herbsThawed) return 'Отогреть вторую связку — бережно, по-новому';
  return s.goal;
}

export { PRACTICE_FOR_CONFIDENT };
