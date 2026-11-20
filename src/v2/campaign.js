import { services } from '../services.js';
import { MSG } from '../state/EventBus.js';
import { CORE, levelScale } from '../config/horizon/rules.js';
import { setCompanionPref } from '../objects/Companion.js';
import { starterState, titleOf } from './episode.js';
import { HEARTH_START, hearthArrival } from './hearth.js';

const KEY = 'horizon_campaign';

const OBJECTIVES = {
  intro: 'Нажми на Мирру у крыльца.',
  spark: 'Отгони Искроцапа от фонаря.',
  lantern: 'Подбери треснувший фонарь Мирры.',
  upgrade: 'Подойди к верстаку и усиль палочку.',
  frost: 'Отгони Морозуна. Калитка скована льдом.',
  thaw: 'Открой калитку, чтобы впустить Рыжика.',
  veda: 'Поговори с Ведой у калитки.',
  grom: 'Поговори с Громом у костра.',
  hunt: 'Выбери отряд в Янтарном Бору или вернись к Привалу Грома.',
};

export function heroStatsAt(level) {
  const fraction = (Math.min(level, CORE.target_year_levels) - 1) / (CORE.target_year_levels - 1);
  return {
    maxHp: Math.round(CORE.hero_base_hp * levelScale(level)),
    maxMana: CORE.mana_start + (CORE.mana_end - CORE.mana_start) * fraction,
    manaRegen: CORE.mana_regen_start + (CORE.mana_regen_end - CORE.mana_regen_start) * fraction,
    damageMult: levelScale(level),
  };
}

export function campaign() {
  const state = services.state;
  return { ...state.getObject(KEY), coins: state.item('coins'), herbs: state.item('moon_herb') };
}

function syncRelics(state, progress) {
  if (!progress.storyPage) return;
  state.data.inventory.mirra_lantern_cracked = 1;
  state.data.inventory.grimoire_page_fragment = 1;
}

export function saveCampaign(next, { notify = true } = {}) {
  const { state, bus } = services;
  state.setObject(KEY, next);
  state.data.inventory.coins = next.coins;
  state.data.inventory.moon_herb = next.herbs;
  syncRelics(state, next);
  if (next.fox) state.data.inventory.companion_fox = 1;
  state.data.heroLevel = next.huntLevel;
  state.data.heroXP = state.levelRow().xp;
  state.save();
  if (notify) {
    bus.emit(MSG.HUD_REFRESH);
    bus.emit(MSG.QUEST_CHANGED);
  }
}

export function objective() {
  const { step, workbenchRestored } = campaign();
  if (step === 'hunt' && !workbenchRestored) {
    return { id: 'workbench', title: 'Оживший верстак', text: 'Отогрей верстак Огнём и прочитай записку Мирры.' };
  }
  return { id: step, title: titleOf(step), text: OBJECTIVES[step] };
}

export function prepareCampaign() {
  const { state, quests, guidance } = services;
  state.heroStats = () => heroStatsAt(state.data.heroLevel);
  quests.currentStep = objective;
  quests.objectiveText = () => objective().text;
  guidance.pointerActive = () => true;
  if (!state.getObject(KEY)) {
    state.data.player = { ...HEARTH_START };
    state.data.safePoint = { ...HEARTH_START };
    state.data.inventory = { coins: 0, moon_herb: 0 };
    saveCampaign(starterState(), { notify: false });
  }
  for (const id of ['fire', 'telekinesis']) state.unlockAbility(id, 1);
  state.setBuild({ slots: ['telekinesis', 'fire'] });
  const progress = campaign();
  state.data.player = { ...hearthArrival(state.data.player, progress.step) };
  state.data.safePoint = { ...hearthArrival(state.data.safePoint, progress.step) };
  syncRelics(state, progress);
  if (progress.fox) {
    setCompanionPref('fox');
    if (!progress.foxStars) saveCampaign({ ...progress, foxStars: 1 }, { notify: false });
  }
  state.save();
}
