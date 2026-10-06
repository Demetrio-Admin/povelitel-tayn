// v0.23.0 — доска поручений города (stage-2-design-pack §23, chapter-2-balance §28).
// Каждый день (сутки UTC) на доске 5 поручений из общего списка — одни и те же для всех героев (городская доска);
// взять можно 3. Поручения тематические: принести материалы или зелья, отогнать существ с возобновляемых мест.
// Решает сервер (операции daily_take / daily_done; JS-зеркало — cloud/playerModel.js); состояние — объект мира 'daily'.
// Награда одного поручения — 30–60 опыта и 20–40 монет плюс материалы: полезно, но уровень 15 даёт сюжет, а не доска.

export const DAILY = {
  requires: 'ch2_quarter_cleared',   // доска открывается во второй половине главы II (после квеста 10)
  offers: 5,
  picks: 3,
  dayMs: 86_400_000,
};

/**
 * Поручения. goal: { type: 'deliver', items: { id: N } } — принести (сервер забирает);
 *                  { type: 'wins', spawns: [...], count } — победы на возобновляемых местах после того, как поручение взято.
 * requires — событие, без которого поручение видно, но взять нельзя.
 */
export const DAILY_POOL = {
  herbs_alchemist: { giver: 'Борис, лавка', title: 'Морозник для настоек', text: 'Алхимику с рынка не хватает морозника — покупатели греются настойками.',
    goal: { type: 'deliver', items: { frost_herb: 4 } }, reward: { heroXP: 40, coins: 30, items: { moon_herb: 1 } } },
  archive_crystal: { giver: 'Илария, Архив', title: 'Образец для Архива', text: 'Архиву нужен образец ледяного кристалла — сравнить с записями о прошлых вспышках.',
    goal: { type: 'deliver', items: { ice_crystal: 1 } }, reward: { heroXP: 50, coins: 25, items: { rune_dust: 1 } } },
  warm_test: { giver: 'Нэрис', title: 'Испытать тёплый настой', text: 'Нэрис просит тёплый настой — проверить новую закваску морозника.',
    goal: { type: 'deliver', items: { warm_potion: 1 } }, reward: { heroXP: 45, coins: 35, items: { ice_crystal: 1 } } },
  guard_resin: { giver: 'Городская стража', title: 'Смола для факелов', text: 'Ночные патрули жгут факелы втрое чаще. Нужна смола.',
    goal: { type: 'deliver', items: { tree_resin: 3 } }, reward: { heroXP: 35, coins: 25, items: { forest_mushroom: 1 } } },
  society_dust: { giver: 'Общество Преображения', title: 'Пыль для приборов', text: 'Честная часть Общества чинит свои приборы — им нужна руническая пыль.',
    goal: { type: 'deliver', items: { rune_dust: 2 } }, reward: { heroXP: 40, coins: 30, items: { lunar_shard: 1 } } },
  healer_elixirs: { giver: 'Лекарь у фонтана', title: 'Настои для обмороженных', text: 'После волны холода у лекаря очередь. Два настоя жизни спасут чей-то вечер.',
    goal: { type: 'deliver', items: { elixir_life: 2 } }, reward: { heroXP: 50, coins: 40 } },
  coven_mushrooms: { giver: 'Ровена, Ковен', title: 'Грибы для оберегов', text: 'Ковен плетёт обереги для стен. Нужны лесные грибы.',
    goal: { type: 'deliver', items: { forest_mushroom: 3 } }, reward: { heroXP: 35, coins: 25, items: { frost_herb: 1 } } },
  hunt_collectors: { giver: 'Складской квартал', title: 'Сборщики вернулись', text: 'На складах и в Замёрзшем квартале снова бродят морозные сборщики. Отгоните двоих.',
    goal: { type: 'wins', spawns: ['wh_collector_1', 'wh_collector_2', 'fq_deep_1', 'fq_deep_2'], count: 2 }, reward: { heroXP: 60, coins: 40, items: { ice_crystal: 1 } } },
  hunt_critter: { giver: 'Жители квартала', title: 'Зверёк у погреба', text: 'Инеевый зверёк снова скребётся у погреба на западе квартала.',
    goal: { type: 'wins', spawns: ['fq_critter'], count: 1 }, reward: { heroXP: 40, coins: 25, items: { frost_herb: 2 } } },
  hunt_rootlings: { giver: 'Мирра', title: 'Корневики у тропы', text: 'Мирра пишет: корневики в старом лесу снова оживились. Двоих хватит, чтобы остальные притихли.',
    goal: { type: 'wins', spawns: ['rootling_01', 'rootling_02', 'rootling_03'], count: 2 }, reward: { heroXP: 45, coins: 30, items: { tree_resin: 2 } } },
  construct_test: { giver: 'Нэрис', title: 'Конструкт в погребе', text: 'В лаборатории снова собрался конструкт. Разберите его — Нэрис изучит обломки.',
    goal: { type: 'wins', spawns: ['lab_construct'], count: 1 }, requires: 'ch2_lab_open', reward: { heroXP: 60, coins: 40, items: { ice_crystal: 2 } } },
  guardian_hunt: { giver: 'Стража квартала', title: 'Ледяной страж', text: 'В глубине Замёрзшего квартала снова стоит Ледяной страж. Пройдите мимо него — через него.',
    goal: { type: 'wins', spawns: ['fq_guardian'], count: 1 }, reward: { heroXP: 60, coins: 40, items: { ice_crystal: 1 } } },
  // v0.24.0: охота в вылазках (после главы II)
  hunt_wolves: { giver: 'Охотники у северной дороги', title: 'Волчицы метели', text: 'Морозные волчицы подходят к северной дороге всё ближе. Отгоните троих.',
    goal: { type: 'wins', spawns: ['fw_wolf_1', 'fw_wolf_2', 'fw_wolf_3', 'fw_wolf_4'], count: 3 }, requires: 'chapter_2_complete', reward: { heroXP: 60, coins: 40, items: { ice_crystal: 1 } } },
  hunt_wisps: { giver: 'Сторож кладбища', title: 'Огоньки на погосте', text: 'По ночам над могилами снова бродят огоньки. Сторож просит развеять двоих.',
    goal: { type: 'wins', spawns: ['gy_wisp_1', 'gy_wisp_2'], count: 2 }, requires: 'chapter_2_complete', reward: { heroXP: 55, coins: 35, items: { rune_dust: 2 } } },
};
/** Порядок списка для выбора дня (не менять местами: от него зависит, какие поручения выпадут в какой день). */
export const DAILY_ORDER = Object.keys(DAILY_POOL);

/** Номер суток UTC. */
export const dailyDay = (nowMs) => Math.floor(nowMs / DAILY.dayMs);

/**
 * Поручения дня: частичное перемешивание списка генератором Парка — Миллера (x · 48271 mod 2³¹−1).
 * Целочисленно и без переполнения в JS (произведение < 2⁵³) — тот же расчёт в SQL (_daily_offers), совпадение проверяет дифф-тест.
 */
export function dailyOffers(day, order = DAILY_ORDER, n = DAILY.offers) {
  const a = [...order];
  let x = (((day % 2147483646) + 2147483646) % 2147483646) + 1;
  for (let i = 0; i < Math.min(n, a.length); i++) {
    x = (x * 48271) % 2147483647;
    const j = i + (x % (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** Для сервера (_game_rules). */
export function dailyRules() {
  return { requires: DAILY.requires, offers: DAILY.offers, picks: DAILY.picks, dayMs: DAILY.dayMs, order: DAILY_ORDER,
    pool: Object.fromEntries(Object.entries(DAILY_POOL).map(([id, o]) => [id, { goal: o.goal, reward: o.reward, requires: o.requires || null }])) };
}
