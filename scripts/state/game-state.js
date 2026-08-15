import { HEROES, INITIAL_STATE } from '../data/game-data.js';

const STORAGE_KEY = 'povelitel-tayn:stage-7';

function freshState() {
  return {
    ...INITIAL_STATE,
    heroStatuses: Object.fromEntries(HEROES.map(hero => [hero.id, [...hero.status]]))
  };
}

function normalizeState(saved) {
  const next = { ...freshState(), ...saved, skill: null, busy: false };
  next.screen = next.screen === 'combat' ? 'combat' : 'travel';
  next.round = Math.max(1, Number(next.round) || 1);
  next.seals = Math.min(4, Math.max(0, Number(next.seals) || 0));
  next.threat = Math.min(92, Math.max(58, Number(next.threat) || 58));
  next.travelStep = Math.min(5, Math.max(2, Number(next.travelStep) || 2));
  next.heroStatuses = { ...freshState().heroStatuses, ...(saved?.heroStatuses || {}) };

  if (!HEROES.some(hero => hero.id === next.selected)) next.selected = 'adam';
  if (next.seals === 0) {
    next.screen = 'travel';
    next.round = 1;
    next.seals = 4;
    next.threat = 58;
    next.travelStep = Math.max(4, next.travelStep);
  }
  return next;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? normalizeState(saved) : freshState();
  } catch {
    return freshState();
  }
}

export const state = loadState();

export function saveState() {
  const { busy, skill, ...persistentState } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentState));
}

export function updateState(patch) {
  Object.assign(state, patch);
  saveState();
}

export function setHeroStatus(heroId, statuses) {
  state.heroStatuses = { ...state.heroStatuses, [heroId]: [...statuses] };
  saveState();
}

export function resetBattle() {
  Object.assign(state, {
    screen: 'travel',
    skill: null,
    round: 1,
    seals: 4,
    threat: 58,
    travelStep: Math.max(4, state.travelStep),
    busy: false
  });
  saveState();
}
