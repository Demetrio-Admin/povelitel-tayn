import { services } from '../services.js';
import { MSG } from '../state/EventBus.js';
import { CORE, GIFT_RULES, levelScale } from '../config/horizon/rules.js';
import { setCompanionPref } from '../objects/Companion.js';
import { starterState, titleOf } from './episode.js';
import { HEARTH_START, hearthArrival } from './hearth.js';
import { actLocationAt, HEARTH_TRAIL } from './regions.js';
import { advanceQuest, mainQuest, questDone, questStep, taskTarget, townOpen } from './actProgress.js';
import { hydrateActProgress, itemList, payItems, startColor } from './progression.js';
import { QUEST_BY_ID } from './quests.js';

const KEY = 'horizon_campaign';
let cachedProgress;

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
    maxMana: Math.round(CORE.mana_start + (CORE.mana_end - CORE.mana_start) * fraction),
    manaRegen: CORE.mana_regen_start + (CORE.mana_regen_end - CORE.mana_regen_start) * fraction,
    damageMult: levelScale(level),
  };
}

export function campaign() {
  const state = services.state;
  const raw=state.getObject(KEY), inventory=state.data.inventory, sapphires=state.sapphires();
  const revision=[raw,inventory,sapphires,inventory.coins,inventory.moon_herb];
  if (cachedProgress && revision.every((value,index)=>value===cachedProgress.revision[index])) return cachedProgress.value;
  const value=hydrateActProgress(raw || {},inventory,sapphires);
  cachedProgress={revision,value};
  return value;
}

function syncRelics(state, progress) {
  if (!progress.storyPage) return;
  state.data.inventory.mirra_lantern_cracked = 1;
  state.data.inventory.grimoire_page_fragment = 1;
}

export function saveCampaign(next, { notify = true } = {}) {
  const { state, bus } = services;
  const { inv, ...saved } = next;
  state.setObject(KEY, saved);
  if (inv) state.data.inventory = { ...inv };
  state.data.inventory.coins = next.coins;
  state.data.inventory.moon_herb = next.herbs;
  if (Number.isFinite(next.sapphires)) state.data.wallet.sapphires = next.sapphires;
  syncRelics(state, next);
  if (next.fox) state.data.inventory.companion_fox = 1;
  if (next.activeCompanion && state.data.inventory['companion_'+next.activeCompanion]) setCompanionPref(next.activeCompanion);
  if (next.tasks) {
    if (townOpen(next)) state.markEvent('ch2_city_arrived');
    if (questDone(next,'bridge_wall')) state.markEvent('ch2_quarter_open');
    if (questDone(next,'cellar_house')) state.markEvent('ch2_rescue_cellar');
    if (questDone(next,'rescue_house')) state.markEvent('ch2_rescue_door');
    if (next.tasks.flood > 0) state.markEvent('ch2_water_frozen');
    if (questDone(next,'august')) state.markEvent('chapter_2_complete');
  }
  state.data.heroLevel = next.huntLevel;
  state.data.heroXP = state.levelRow().xp;
  state.save();
  if (notify) {
    bus.emit(MSG.HUD_REFRESH);
    bus.emit(MSG.QUEST_CHANGED);
  }
}

export function objective() {
  const p = campaign(), { step, workbenchRestored } = p;
  const location = actLocationAt(services.state.data.player);
  const tier = location?.tier || (location?.interior ? 2 : 1);
  if (step === 'hunt' && (workbenchRestored || tier===2)) {
    const tracked=QUEST_BY_ID[p.tracked];
    const quest=questStep(p,tracked) ? tracked : mainQuest(p,tier);
    if (quest) {
      const goal=questStep(p,quest);
      return { id:taskTarget(quest.id,goal.index),title:quest.title,text:goal.label,where:goal.where };
    }
    if (tier===1 && townOpen(p)) return { id:'v2_town_route',title:'Тракт в Светлодол',
      text:'Иди по восточному тракту в Светлодол.',where:location?.tier===1?null:HEARTH_TRAIL };
    if (questDone(p,'august')) return {id:'hunt',title:'Светлодол оттаял',text:'След Крона ведёт в Хрустальную Чащу.'};
  }
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
  const progress = campaign();
  const position=state.data.player;
  if (!actLocationAt(position) || actLocationAt(position).id==='mirra-hearth') {
    state.data.player={...hearthArrival(position,progress.step)};
  }
  if (!actLocationAt(state.data.safePoint)) state.data.safePoint={...HEARTH_START};
  state.giftSlotCount=()=>3;
  state.isUnlocked=id=>!!campaign().gifts[id];
  state.equippedGifts=()=>campaign().loadout;
  state.isEquipped=id=>state.equippedGifts().includes(id);
  services.abilities.label=id=>GIFT_RULES[id]?.name || id;
  syncRelics(state, progress);
  if (progress.fox) {
    setCompanionPref(progress.activeCompanion || 'fox');
    if (!progress.foxStars) saveCampaign({ ...progress, foxStars: 1 }, { notify: false });
  }
  state.save();
}

export function completeActStep(p, quest, index) {
  const step=questStep(p,quest);
  if (!step || step.index!==index) return { error:'Сначала заверши предыдущий шаг.' };
  if (step.needsTactical && !Object.entries(p.inv).some(([id,n])=>n>0 && ['potion_fire_flask','potion_resin_flask','potion_warm','potion_guard','potion_stable','potion_brittle'].includes(id))) {
    return { error:'Свари тактический настой в котле Мирры или возьми готовый из сумки.' };
  }
  let next=p;
  if (step.cost) {
    next=payItems(p,step.cost);
    if (!next) return {error:'Понадобится: '+itemList(step.cost)};
  }
  if (step.practiceColor) {
    const choice=next.loadout.find(id=>next.gifts[id]?.color==='white');
    if (choice) {
      next=startColor(next,choice,Date.now(),true);
      if (!next) return {error:'Сначала собери четыре Лунных травы и две Древесные смолы.'};
    }
  }
  return { next:advanceQuest(next,quest,index) };
}
