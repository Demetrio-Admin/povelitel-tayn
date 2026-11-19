import { HORIZON_TABLES } from '../../src/config/horizon/tables.generated.js';

const settings = Object.fromEntries(HORIZON_TABLES.core_curves.map(({ param_key, value }) => [param_key, value]));
const economy = new Map(HORIZON_TABLES.economy_tide.map(row => [row.section + '.' + row.key, row.value]));
const tide = HORIZON_TABLES.economy_tide.filter(row => row.section === 'tide');

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

const baseCoins = level => Math.floor(economy.get('coins.base_fight') * economy.get('coins.reward_growth') ** (level - 1));
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
const scenarios = [
  {
    assumptions: 'Бои дают 60% дневного дохода в обоих профилях.',
    players: [simulate(f2pWins, share), simulate(hardcoreWins, share)],
  },
  {
    assumptions: 'Доход калибруется по контрольным суммам L1. Доля дохода от боёв фиксируется отдельно для каждого профиля.',
    players: [
      simulate(f2pWins, tableShare(f2pWins, 'coins.control_daily_f2p_level_one')),
      simulate(hardcoreWins, tableShare(hardcoreWins, 'coins.control_daily_hardcore_level_one')),
    ],
  },
];

console.log(JSON.stringify({ balanceVersion: settings.balance_version, targetLevel: settings.target_year_levels, scenarios }, null, 2));
