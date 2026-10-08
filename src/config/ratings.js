// v0.29.0 — рейтинги: по уровню героя, по лучшей победе над монстром и по арене (лига Магической Дуэли), а также список игроков онлайн.
// Уровень монстра — рекомендуемый уровень героя (шкала 1–15, как у героя): чем сильнее побеждённый монстр, тем выше место.
// Лучшая победа считается по побеждённым точкам боя (player_world 'enemy'): сервер видит их у всех игроков, в том числе у старых.
// Эти данные уходят на сервер в _game_rules() (node tools/sql/gen-rules.mjs), а клиент использует их же для своей строки.
import { ENEMIES } from './balance.enemies.js';
import { ENEMY_SPAWNS } from './world.layout.js';

export const MONSTER_LEVELS = {
  forest_scavenger: 1, young_scavenger: 1,
  rootling: 2,
  forest_guardian: 4,
  node_guardian: 6,
  frost_critter: 7,
  frost_collector: 8,
  volunteer: 9, frost_collector_elite: 9,
  ice_guardian: 10, experimental_construct: 10, frost_wolf: 10, grave_wisp: 10,
  grave_hound: 11,
  severin_boss: 12, frost_alpha: 12, barrow_warden: 12,
};

export const RATINGS = {
  top: 50,          // сколько мест показывает таблица
  onlineSec: 100,   // игрок «в игре», если подавал знак не позже этого
  pingSec: 45,      // как часто открытая игра подаёт знак
  cacheSec: 20,     // таблицы в окне не запрашиваются чаще
};

export const TABS = [
  { id: 'level', label: 'Уровень' },
  { id: 'monster', label: 'Монстры' },
  { id: 'arena', label: 'Арена' },
  { id: 'online', label: 'Онлайн' },
];

export const monsterLevel = (enemyId) => MONSTER_LEVELS[enemyId] || 0;
export const monsterName = (enemyId) => ENEMIES[enemyId]?.name || enemyId;

/** Лучшая победа по списку побеждённых точек боя: { enemy, level, power } или null. Тот же порядок, что в SQL: уровень, потом здоровье. */
export function bestKillOf(defeatedSpawnIds = []) {
  const enemyOf = Object.fromEntries(ENEMY_SPAWNS.map(s => [s.id, s.enemy]));
  let best = null;
  for (const id of defeatedSpawnIds) {
    const enemy = enemyOf[id], level = monsterLevel(enemy);
    if (!level) continue;
    const power = ENEMIES[enemy]?.hp || 0;
    if (!best || level > best.level || (level === best.level && power > best.power)) best = { enemy, level, power };
  }
  return best;
}

/** Правила для сервера: уровень и здоровье монстров, из какой точки боя какой монстр. */
export function ratingsRules() {
  return {
    top: RATINGS.top, onlineSec: RATINGS.onlineSec,
    levels: { ...MONSTER_LEVELS },
    power: Object.fromEntries(Object.keys(MONSTER_LEVELS).map(k => [k, ENEMIES[k]?.hp || 0])),
    spawns: Object.fromEntries(ENEMY_SPAWNS.filter(s => MONSTER_LEVELS[s.enemy]).map(s => [s.id, s.enemy])),
  };
}
