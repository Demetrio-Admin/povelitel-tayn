import { CORE as settings, ECONOMY, TIDE as tide, baseBattleCoins as baseCoins } from '../../src/config/horizon/rules.js';

const economy = new Map(Object.entries(ECONOMY));

function rewardUnits(wins) {
  let units = 0;
  let previous = 0;
  for (const { threshold, value } of tide) {
    const end = threshold ?? wins;
    if (end < previous) throw new Error('Лунный прилив: пороги должны возрастать.');
    units += Math.max(0, Math.min(end, wins) - previous) * value;
    if (end >= wins) return units;
    previous = end;
  }
  throw new Error('Лунный прилив: отсутствует последняя ступень без лимита.');
}

const roundCost = level => economy.get('level.active_tracks')
  * Math.floor(economy.get('level.cost_base') * economy.get('level.cost_growth') ** (level - 1));

function simulate(wins, incomeShare) {
  const milestones = [1, 30, 180, 365];
  const units = rewardUnits(wins);
  const maxLevel = settings.target_year_levels;
  let level = 1;
  let wallet = 0;
  let daysToTarget = null;
  const snapshots = {};
  for (let day = 1; day <= milestones.at(-1); day++) {
    if (level < maxLevel) {
      wallet += Math.floor(baseCoins(level) * units / incomeShare);
      while (level < maxLevel && wallet >= roundCost(level)) {
        wallet -= roundCost(level);
        level++;
      }
    }
    if (level === maxLevel && daysToTarget === null) daysToTarget = day;
    if (milestones.includes(day)) snapshots[day] = level;
  }
  return {
    wins,
    equivalentWins: units,
    firstDayIncome: Math.floor(baseCoins(1) * units / incomeShare),
    snapshots,
    daysToTarget,
    daysWithAmuletAndColors: daysToTarget === null ? null : [
      daysToTarget + economy.get('simulation.extra_days_min'),
      daysToTarget + economy.get('simulation.extra_days_max'),
    ],
  };
}

const f2pWins = 20;
const hardcoreWins = 400;
const share = economy.get('coins.combat_income_share');
const tableShare = (wins, key) => baseCoins(1) * rewardUnits(wins) / economy.get(key);
const canonical = {
  assumptions: 'Контрольные доходы L1. Доля дохода от боёв фиксируется отдельно для каждого профиля.',
  players: [
    simulate(f2pWins, tableShare(f2pWins, 'coins.control_daily_f2p_level_one')),
    simulate(hardcoreWins, tableShare(hardcoreWins, 'coins.control_daily_hardcore_level_one')),
  ],
};

const result = { balanceVersion: settings.balance_version, targetLevel: settings.target_year_levels, canonical };
if (process.argv.includes('--compare')) {
  result.comparison = {
    assumptions: 'Бои дают 60% дневного дохода в обоих профилях.',
    players: [simulate(f2pWins, share), simulate(hardcoreWins, share)],
  };
}
console.log(JSON.stringify(result, null, 2));
