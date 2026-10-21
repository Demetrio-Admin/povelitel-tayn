// Only a newly stamped Duel protocol opts into arena pacing. Saved v1/v2 replays are frozen.
export const DUEL_VERSION = 3;
export const DUEL_PACING = Object.freeze({ damageMultiplier: .4, minCastSec: .8, telekinesisCastSec: .35, interruptGraceSec: 3 });
export const duelVersionFor = (balanceVersion, requested) => balanceVersion === 40 && requested === 3 ? 3 : [38, 39, 40].includes(balanceVersion) && requested === 2 ? 2 : 1;
export const DUEL_PACING_TEXT = 'В Дуэли весь урон снижен на 60%. Подготовка Телекинеза — не менее 0,35 с, остальных даров — 0,8 с у обеих сторон. После прерывания герой на 3 с защищён от повторного прерывания.';
