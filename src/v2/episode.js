import { CORE, ECONOMY, TIDE, baseBattleCoins, tideAt, wandInterval } from '../config/horizon/rules.js';
import { PREVIEW_CORE } from '../config/horizon/previewTuning.js';
export { PROLOGUE_DIALOGUE as DIALOGUE } from './dialogue.js';

const TITLES = {
  intro: 'Очаг Мирры',
  spark: 'Не трожь фонарь!',
  lantern: 'Не трожь фонарь!',
  upgrade: 'Искра в палочке',
  frost: 'Тепло у калитки',
  thaw: 'Тепло у калитки',
  veda: 'Привал Грома',
  grom: 'Привал Грома',
  hunt: 'Свободная охота',
};
export const STEPS = Object.keys(TITLES);
export const titleOf = step => TITLES[step];

export const MIRRA_NOTE = '«Мастерская теперь твоя. В Светлодоле раскололся Лунный Гримуар — его страницы будят зверей и тянут тепло из земли. Собирай осколки, грей очаг — и не верь тем, кто захочет запереть магию на замок».';

export function restoreWorkbench(state) {
  if (state.step !== 'hunt' || state.workbenchRestored) return state;
  return { ...state, workbenchRestored: true, coins: state.coins + 50, herbs: state.herbs + 3 };
}

const FOES = {
  spark: { name: 'Искроцап', texture: 'enemy_scavenger_small', role: 'fighter' },
  frost: { name: 'Морозун', texture: 'enemy_frost_critter', role: 'fighter' },
  thorn: { name: 'Колючник', texture: 'enemy_rootling', role: 'warder' },
};
export const STORY_ENCOUNTERS = Object.fromEntries(['spark', 'frost'].map(key => [key, {
  id: key, name: FOES[key].name, level: 1, pack: 'solo', enemies: [FOES[key]], arena: ['light'],
}]));

const SLOT_LAYOUT = [
  ['camp-edge', -1, 'solo', ['spark']],
  ['pine-crossing', 0, 'duo', ['thorn', 'spark']],
  ['white-bridge', 1, 'duo', ['frost', 'thorn']],
  ['wood-road', 2, 'trio', ['thorn', 'spark', 'frost']],
];
const LUNAR_TIER_MAX = TIDE[0].threshold;
const REGION_MAX = 21;
const dayKey = now => new Date(now).toISOString().slice(0, 10);
export const starterState = () => ({
  step: 'intro', coins: 0, herbs: 0, storyPage: false, wandRank: 0, fox: false, foxStars: 0,
  huntLevel: 1, date: '', dailyWins: 0, totalWins: 0, shards: 0, respawns: {},
  bestiary: {},
});

export function finishDialogue(state) {
  if (state.step === 'thaw') return { ...state, step: 'veda', fox: true, foxStars: 1 };
  const next = { intro: 'spark', veda: 'grom', grom: 'hunt' }[state.step];
  return next ? { ...state, step: next } : state;
}

export function claimMirraLantern(state) {
  if (state.step !== 'lantern') return state;
  return { ...state, step: 'upgrade', coins: state.coins + 65, herbs: state.herbs + 3, storyPage: true };
}

export function upgradeWand(state) {
  const { act1_first_wand_coins: coins, act1_first_wand_herbs: herbs } = CORE;
  if (state.step !== 'upgrade' || state.coins < coins || state.herbs < herbs) return state;
  return { ...state, step: 'frost', coins: state.coins - coins, herbs: state.herbs - herbs, wandRank: PREVIEW_CORE.episode_wand_rank_step };
}

export function huntOffers(state, now) {
  if (state.step !== 'hunt') return [];
  return SLOT_LAYOUT.map(([id, offset, pack, enemyIds]) => {
    const level = Math.max(1, Math.min(REGION_MAX, state.huntLevel + offset));
    return {
      id, level, pack, enemyIds, enemies: enemyIds.map(key => FOES[key]),
      arena: pack === 'solo' ? ['light'] : ['light', 'heavy'],
      name: enemyIds.map(key => FOES[key].name).join(' и '),
      readyAt: state.respawns[id] ?? 0, ready: (state.respawns[id] ?? 0) <= now,
    };
  });
}

export function battleContext(state, encounter) {
  return {
    balanceVersion: CORE.balance_version,
    heroLevel: state.huntLevel, wandRank: state.wandRank, fox: state.fox, encounter,
    slots:state.loadout, gifts:state.gifts, vigor:state.vigor, wandLevel:state.wandLevel,
    pet:state.activeCompanion, petRank:state.tempers?.[state.activeCompanion],
    amulet:state.amulet, amuletRank:state.amuletLevels?.[state.amulet],
    potions:state.inv,
  };
}

export function tideStatus(state, now) {
  const wins = state.date === dayKey(now) ? state.dailyWins : 0;
  return { wins, remaining: Math.max(0, LUNAR_TIER_MAX - wins), tide: tideAt(wins) };
}

export function settleVictory(state, encounter, foxBonus, now) {
  if (state.step === 'spark' && encounter.id === 'spark') {
    return {
      state: { ...state, step: 'lantern' },
      summary: 'Подбери треснувший фонарь Мирры.'
    };
  }
  if (state.step === 'frost' && encounter.id === 'frost') {
    return {
      state: { ...state, step: 'thaw', coins: state.coins + 40, herbs: state.herbs + 2 },
      summary: '40 монет · 2 Лунные травы',
    };
  }
  const current = huntOffers(state, now).find(offer => offer.id === encounter.id && offer.ready && offer.level === encounter.level);
  if (!current) return { state, summary: '' };
  const { wins, tide } = tideStatus(state, now);
  const coins = Math.floor(baseBattleCoins(encounter.level) * tide.value * (foxBonus ? 1 + CORE.episode_fox_kill_coins : 1));
  const shards = encounter.level > state.huntLevel ? 1 : 0;
  const level = Math.min(REGION_MAX, state.huntLevel + Number(encounter.level >= state.huntLevel));
  const bestiary = { ...state.bestiary };
  for (const id of current.enemyIds) bestiary[id] = (bestiary[id] ?? 0) + 1;
  const summary = [coins + ' монет', shards ? shards + ' осколок Огня' : '', level > state.huntLevel ? 'Охота · ур. ' + level : '']
    .filter(Boolean).join(' · ');
  return {
    state: {
      ...state, huntLevel: level, coins: state.coins + coins, date: dayKey(now), dailyWins: wins + 1,
      totalWins: state.totalWins + 1, shards: state.shards + shards, bestiary,
      respawns: { ...state.respawns, [encounter.id]: now + ECONOMY['hunt.respawn_seconds'] * 1000 },
    },
    summary,
  };
}

export const wandSeconds = rank => wandInterval(rank).toFixed(2).replace('.', ',');
