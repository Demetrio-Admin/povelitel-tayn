// v0.26.0 — Магическая Дуэль (stage-2-design-pack §27–33). Игрок ведёт своего героя сам; соперник — слепок другого игрока
// (уровень, дары, ветки, амулеты) под управлением боевого ИИ. Бой проверяет сервер (та же запись боя, что и с врагами).
// Сила не выравнивается: развитый герой сильнее — так задумано. Рейтинг быстро разводит игроков по лигам.
// Если подходящих соперников нет — «Тень дуэлянта»: зеркальный слепок самого игрока (тот же уровень, дары и рейтинг).
import { HERO_LEVELS } from './balance.hero.js';
import { GIFT_IDS, SLOT_RULES } from './build.js';
import { HEROES, DEFAULT_HERO_ID } from './heroes.js';

export const DUEL = {
  requires: 'chapter_2_complete',
  attemptsPerDay: 8,               // 5–10 значимых боёв в день (§31)
  baseRating: 1000,
  k: 32,                           // Эло: изменение за бой — до 32 очков
  dayMs: 86_400_000,
  // Сезон 0 — тестовый, 4 недели (§33); следующие идут подряд той же длины. При смене сезона рейтинг сжимается к базовому наполовину.
  season: { startMs: Date.UTC(2026, 9, 5), lengthDays: 28 },
  matchWindow: 200,                // соперник ищется в этом окне рейтинга, дальше — ближайший
  reward: { victory: { coins: 30, heroXP: 20 }, defeat: { coins: 10 } },
  // v0.34.0: сапфиры арены. Итог сезона — по лиге на момент его конца (нужно не меньше minBattles боёв в этом сезоне);
  // бонус за новую лигу выдаётся один раз за всё время (по лучшему рейтингу сезона). Выдача идемпотентна: ключи arena:<сезон> и league:<лига>.
  sapphires: {
    minBattles: 5,
    season: { bronze: 10, silver: 20, gold: 40, platinum: 60, diamond: 90, master: 120, legend: 150 },
    promo: { silver: 10, gold: 20, platinum: 30, diamond: 50, master: 70, legend: 100 },
  },
};

// Лиги — рабочие границы для Сезона 0 (§30: окончательные — после тестов)
export const LEAGUES = [
  { id: 'bronze', name: 'Бронза', from: 0 },
  { id: 'silver', name: 'Серебро', from: 1100 },
  { id: 'gold', name: 'Золото', from: 1250 },
  { id: 'platinum', name: 'Платина', from: 1400 },
  { id: 'diamond', name: 'Алмаз', from: 1550 },
  { id: 'master', name: 'Мастер', from: 1700 },
  { id: 'legend', name: 'Высшая лига', from: 1850 },
];
/** Сапфиры за итог сезона по лиге (0 — не положено) и за первое достижение лиги. */
export const seasonSapphires = (leagueId) => DUEL.sapphires.season[leagueId] || 0;
export const promoSapphires = (leagueId) => DUEL.sapphires.promo[leagueId] || 0;
export const leagueOf = (rating) => [...LEAGUES].reverse().find((l) => rating >= l.from) || LEAGUES[0];

/** Номер сезона по времени (0 — первый). */
export function seasonOf(nowMs) {
  const len = DUEL.season.lengthDays * DUEL.dayMs;
  return Math.max(0, Math.floor((nowMs - DUEL.season.startMs) / len));
}
export function seasonEndMs(season) { return DUEL.season.startMs + (season + 1) * DUEL.season.lengthDays * DUEL.dayMs; }

/** Изменение рейтинга (Эло): победа над сильным даёт больше, поражение от слабого стоит дороже. */
export function ratingDelta(my, opp, win) {
  const expected = 1 / (1 + 10 ** ((opp - my) / 400));
  return Math.round(DUEL.k * ((win ? 1 : 0) - expected));
}

const levelRow = (lvl) => HERO_LEVELS[Math.max(1, Math.min(HERO_LEVELS.length, Math.floor(lvl) || 1)) - 1];

/** Дары в слотах соперника: из его билда (только открытые), иначе — первые открытые по порядку. */
export function duelSlots(opp) {
  const open = GIFT_IDS.filter((g) => opp.abilities?.[g]?.unlocked && (opp.abilities[g].level || 0) > 0);
  const slots = Array.isArray(opp.build?.slots) ? opp.build.slots.filter((g) => open.includes(g)) : [];
  return (slots.length ? slots : open).slice(0, SLOT_RULES.base);
}

const SIGNATURE = {
  fire: { name: 'Огненный шар', damage: 26, prepSec: 2.0, cooldownSec: 9, interruptBy: ['telekinesis'], hint: 'Прервите Телекинезом!' },
  ice: { name: 'Ледяное копьё', damage: 24, prepSec: 2.2, cooldownSec: 10, interruptBy: ['telekinesis'], hint: 'Прервите Телекинезом!' },
  seal: { name: 'Астральный удар', damage: 28, prepSec: 2.4, cooldownSec: 10, interruptBy: ['telekinesis_heavy'], hint: 'Бросьте тяжёлый камень!' },
  telekinesis: { name: 'Каменный град', damage: 25, prepSec: 2.0, cooldownSec: 9, interruptBy: ['telekinesis'], hint: 'Прервите Телекинезом!' },
};
const PRIORITY = ['fire', 'ice', 'seal', 'telekinesis'];

/**
 * Боевой профиль соперника из его слепка — для боя на устройстве и для проверки на сервере (одна функция).
 * Здоровье — от уровня и амулетов; обычный удар — от уровня (Лёд в слотах — холодит); сильный удар — главный дар (самый развитый);
 * Астрал в слотах — барьер (защита 20%), Телекинез III — кристальная броня; к дарам, которых нет в его слотах, соперник уязвим (+25%).
 */
export function duelEnemyDef(opp) {
  const lv = levelRow(opp.level), mult = lv.damageMult;
  const slots = duelSlots(opp);
  const amulets = Array.isArray(opp.build?.amulets) ? opp.build.amulets.slice(0, 2) : [];
  const main = [...slots].sort((a, b) => (opp.abilities[b]?.level || 0) - (opp.abilities[a]?.level || 0) || PRIORITY.indexOf(a) - PRIORITY.indexOf(b))[0] || 'telekinesis';
  const sig = SIGNATURE[main];
  const weaknesses = {};
  for (const g of GIFT_IDS) if (!slots.includes(g)) weaknesses[g] = 0.25;
  const hero = HEROES.find((h) => h.id === opp.hero) || HEROES.find((h) => h.id === DEFAULT_HERO_ID);
  return {
    name: opp.name || 'Тень дуэлянта',
    texture: hero.textures.down,
    tier: 'strong',
    hp: Math.round(lv.maxHp * 4.2 * (1 + 0.05 * amulets.length)),
    normalAttack: { damage: Math.round(9 * mult), intervalSec: 2.8, ...(slots.includes('ice') ? { chill: { pct: 0.3, sec: 2.5 } } : {}) },
    strongAttack: { ...sig, damage: Math.round(sig.damage * mult), firstDelaySec: 5 },
    staggerSec: 1.0,
    interruptedCooldownSec: 6,
    defense: slots.includes('seal') ? 0.2 : 0,
    ...(slots.includes('seal') ? { onFireHit: { disableDefenseSec: 4 } } : {}),
    ...((opp.abilities?.telekinesis?.level || 0) >= 3 && slots.includes('telekinesis') ? { armor: { value: 0.35, source: 'crystal', disabledSec: 8 } } : {}),
    weaknesses,
    rewards: {},
    arena: 'duel',
    duel: { slots, main },
  };
}

/** Для сервера (_game_rules). */
export function duelRules() {
  return { requires: DUEL.requires, attemptsPerDay: DUEL.attemptsPerDay, baseRating: DUEL.baseRating, k: DUEL.k, dayMs: DUEL.dayMs,
    seasonStartMs: DUEL.season.startMs, seasonMs: DUEL.season.lengthDays * DUEL.dayMs, matchWindow: DUEL.matchWindow, reward: DUEL.reward,
    leagues: LEAGUES.map((l) => ({ id: l.id, from: l.from })), sapphires: DUEL.sapphires };
}
