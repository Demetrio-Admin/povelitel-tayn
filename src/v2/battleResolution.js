import { replayHorizonBattle } from '../systems/HorizonBattle.js';
import { advanceQuest, settleElite, settleField } from './actProgress.js';
import { settleVictory } from './episode.js';
import { payItems } from './progression.js';
import { QUEST_BY_ID } from './quests.js';

// Context is the opening snapshot. Rewards and potion costs apply to the current save.
export function resolveHorizonBattle(progress, context, log, now) {
  const replay = replayHorizonBattle(context, log);
  if (!replay.result) throw new Error('Unfinished Horizon battle');
  const afterPotions = payItems(progress, replay.usedPotions);
  if (!afterPotions) throw new Error('Horizon battle potion inventory changed');
  if (replay.result !== 'victory') return { state: afterPotions, summary: '', victory: false };

  const { encounter } = context;
  let reward;
  if (encounter.quest) reward = { state: advanceQuest(afterPotions, QUEST_BY_ID[encounter.quest], encounter.index) };
  else if (encounter.eliteTier) reward = { state: settleElite(afterPotions, encounter, now) };
  else if (encounter.tier) reward = { state: settleField(afterPotions, encounter, replay.foxBonus, now) };
  else reward = settleVictory(afterPotions, encounter, replay.foxBonus, now);
  return { summary: '', ...reward, victory: true };
}
