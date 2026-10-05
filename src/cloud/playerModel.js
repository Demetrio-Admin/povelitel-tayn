// Модель игрока на сервере и способ её менять. Без Phaser и DOM.
//
// Главное правило: клиент НЕ отправляет «весь сейв». Он считает, что изменилось с момента последнего ответа сервера (diff),
// и шлёт только это (patch). Сервер сам сливает изменения с актуальным состоянием игрока и возвращает его целиком (snapshot).
// Поэтому устройство с устаревшими данными не может затереть более свежий прогресс другого устройства:
//   • числа-счётчики (предметы, опыт дара, время игры) меняются дельтами: +3 монеты, а не «монет = 17»;
//   • уровень, опыт героя и уровни даров только растут (greatest);
//   • события, пути, побеждённые враги, подсказки только добавляются (объединение множеств);
//   • позиция, точка возрождения, состояние предметов мира, исследование — «последний записал»;
//   • история боёв дописывается;
//   • v0.12.0: HP и мана принадлежат серверу. Они восстанавливаются по времени сервера (в том числе пока игрок офлайн),
//     клиент их не записывает — только атомарные действия (drink, heal, combat_*, v0.13.0: world — сбор, находки и магия в мире).
//   • v0.13.0: состояние объектов мира kind gather/loot/stash (rules.world) пишет только сервер; их ключи в patch.objects игнорируются.
//   • v0.15.0: клиент больше не пишет прогресс вообще: опыт героя и даров, предметы, дары, события, пути, побеждённые враги и изучение —
//     поля xp, school, inv, abilities, quests, paths, enemies, research в patch игнорируются. Всё это решают операции сервера
//     (event, quest_*, research_*, respec, world, craft, use, combat_*). Клиент пишет только позицию, точку возрождения, время игры,
//     историю боёв, подсказки и состояние «мелких» объектов мира (след врага, прочитанная книга).
// applyPatch ниже — точное зеркало SQL-функции sync_player (supabase/schema.sql); соответствие проверяет tools/sql/diff-test.mjs.
// applyAction — зеркало player_action (v0.9): платное лечение и стартовый набор зелий — атомарные операции сервера,
// а не дельты patch (иначе при нехватке монет сервер обрезал бы списание до нуля, а HP всё равно стало бы полным).
import { createDefaultState } from '../state/GameState.js';
import { HERO_LEVELS, HEALING } from '../config/balance.hero.js';
import { serverRules } from '../config/serverRules.js';

const RULES = serverRules();
/**
 * Ключи объектов мира, состояние которых пишет только сервер: всё, что есть в RULES.world (с v0.15.0 и магия — сервер ставит mark),
 * победы над врагами rep:* (по ним открываются запасы) и build — ветки даров (player_build).
 */
export const serverOwnedObject = (k) => typeof k === 'string' && (Object.hasOwn(RULES.world, k) || k.startsWith('rep:') || k === 'player_build');

export const ABILITY_IDS = ['telekinesis', 'fire', 'seal'];
export const SCHOOL_IDS = ['telekinesis', 'fire', 'seal'];

/** Пределы, которые сервер проверяет у каждого patch (защита от явных подделок; см. раздел «Доверие клиенту» в README). */
export const LIMITS = {
  maxLevel: 100,
  maxXp: 100_000_000,
  maxCounter: 1_000_000_000,   // предметы и опыт дара
  maxSpendPerSync: 100_000_000, // тратить можно сколько есть
  // сколько можно получить за одно сохранение (см. sync_player): самая большая награда сейчас — 150 опыта и 60 монет
  gainXp: 1000,
  gainSchool: 500,
  gainCoins: 500,
  gainItem: 50,
  maxPlayMsPerSync: 600_000,
  maxAbilityLevel: 10,
  maxItems: 100,
  maxKeys: 1000,               // событий / путей / врагов / подсказок
  maxObjects: 500,
  maxCombats: 50,
  idRe: /^[A-Za-z0-9_.:-]{1,64}$/,
};

const isId = (s) => typeof s === 'string' && LIMITS.idRe.test(s);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// «число» в смысле сервера: настоящее число не больше 1e15 по модулю (иначе значение игнорируется, как в SQL-функции _num)
const num = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e15;
const int = (v) => (num(v) ? Math.trunc(v) : 0);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const uniq = (a) => [...new Set(a)];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Уровень по суммарному опыту (как game_hero_levels на сервере). */
export function levelForXp(xp) {
  let lvl = 1;
  for (const r of HERO_LEVELS) if (r.xp <= xp && r.level > lvl) lvl = r.level;
  return lvl;
}

const levelRow = (lvl) => HERO_LEVELS.find(r => r.level === lvl) || HERO_LEVELS[HERO_LEVELS.length - 1];
/** Максимум HP и маны уровня (как game_hero_levels.max_hp / max_mana на сервере). */
export const maxVitals = (lvl) => ({ hp: levelRow(lvl).maxHp, mana: levelRow(lvl).maxMana });

/** Снимок игрока по умолчанию (новый персонаж). */
export function emptySnapshot() {
  return toSnapshot(createDefaultState());
}

/** GameState.data → снимок (то, что хранится на сервере). */
export function toSnapshot(d) {
  const abilities = {};
  for (const id of ABILITY_IDS) abilities[id] = { level: d[`${id}Level`] || 0, unlocked: (d.unlockedAbilities || []).includes(id) };
  return {
    level: d.heroLevel, xp: d.heroXP,
    school: { ...SCHOOL_IDS.reduce((o, k) => ({ ...o, [k]: 0 }), {}), ...(d.schoolXP || {}) },
    abilities,
    inventory: { ...(d.inventory || {}) },
    quests: uniq(d.completedEvents || []),
    paths: uniq(d.openedPaths || []),
    enemies: uniq(d.defeatedEnemies || []),
    objects: JSON.parse(JSON.stringify(d.worldObjects || {})),
    research: d.research ? { ...d.research } : null,
    pos: { x: d.player?.x ?? 0, y: d.player?.y ?? 0 },
    safe: { x: d.safePoint?.x ?? 0, y: d.safePoint?.y ?? 0 },
    hp: d.hp ?? null,
    mana: d.mana ?? null,
    vitalsAt: d.vitalsClock ?? null,      // v0.12.0: момент (мс), на который верны hp и mana
    combatSince: d.combatSince ?? null,   // v0.12.0: начало боя, о завершении которого сервер ещё не знает
    combatCtx: d.combatCtx ?? null,       // v0.14.0: что сервер запомнил о герое в начале боя (по этому проверяется запись боя)
    play: d.stats?.playTimeMs || 0,
    combats: (d.stats?.combats || []).map(c => ({ ...c })),
    tutorial: uniq(d.tutorial || []),
  };
}

/** Снимок → GameState.data (поверх значений по умолчанию, чтобы новые поля игры не терялись). */
export function fromSnapshot(s, base = createDefaultState()) {
  const d = { ...base };
  d.heroLevel = s.level; d.heroXP = s.xp;
  d.schoolXP = { ...base.schoolXP, ...(s.school || {}) };
  d.unlockedAbilities = [];
  for (const id of ABILITY_IDS) {
    const a = s.abilities?.[id] || { level: 0, unlocked: false };
    d[`${id}Level`] = a.level || 0;
    if (a.unlocked) d.unlockedAbilities.push(id);
  }
  d.inventory = { ...base.inventory, ...(s.inventory || {}) };
  d.completedEvents = [...(s.quests || [])];
  d.openedPaths = [...(s.paths || [])];
  d.defeatedEnemies = [...(s.enemies || [])];
  d.worldObjects = JSON.parse(JSON.stringify(s.objects || {}));
  d.research = s.research ? { ...s.research } : null;
  d.player = { x: s.pos.x, y: s.pos.y };
  d.safePoint = { x: s.safe.x, y: s.safe.y };
  d.hp = s.hp ?? null;
  d.mana = s.mana ?? null;
  d.vitalsClock = s.vitalsAt ?? null;
  d.combatSince = s.combatSince ?? null;
  d.combatCtx = s.combatCtx ?? null;
  d.stats = { playTimeMs: s.play || 0, combats: (s.combats || []).map(c => ({ ...c })) };
  d.tutorial = [...(s.tutorial || [])];
  return d;
}

/**
 * Что изменилось в cur по сравнению с base. Пустой объект — менять нечего.
 * v0.15.0: только то, что клиент вправе записывать (подсказки, объекты мира без серверных правил, позиция, точка возрождения, время игры,
 * история боёв). Прогресс (опыт, предметы, дары, события, пути, враги, изучение) приходит от сервера как результат операций.
 */
export function diffSnapshots(base, cur) {
  const p = {};
  const tutorial = cur.tutorial.filter(x => !base.tutorial.includes(x));
  if (tutorial.length) p.tutorial = tutorial;
  const objects = {};
  for (const k of new Set([...Object.keys(base.objects), ...Object.keys(cur.objects)])) {
    if (serverOwnedObject(k)) continue;
    if (!(k in cur.objects)) objects[k] = null; else if (!eq(base.objects[k], cur.objects[k])) objects[k] = cur.objects[k];
  }
  if (Object.keys(objects).length) p.objects = objects;
  if (!eq(base.pos, cur.pos)) p.pos = cur.pos;
  if (!eq(base.safe, cur.safe)) p.safe = cur.safe;
  if (cur.play > base.play) p.play = cur.play - base.play;
  if (cur.combats.length > base.combats.length) p.combats = cur.combats.slice(base.combats.length);
  return p;
}

/** Только «мелочь» (позиция, время игры): такие изменения можно отправлять реже. */
export function isMinorPatch(p) {
  return Object.keys(p).every(k => k === 'pos' || k === 'play');
}

const union = (list, add, max) => {
  const out = [...list];
  for (const x of Array.isArray(add) ? add : []) if (isId(x) && !out.includes(x) && out.length < max) out.push(x);
  return out;
};

/** HP, до которого поднимает отступление или поражение: defeatHpFraction максимума, не меньше 1. */
export const defeatHp = (maxHp) => Math.max(1, Math.ceil(maxHp * RULES.vitals.defeatHpFraction - 1e-9));

/** Дом Мирры: там мана восстанавливается быстрее (по сохранённой позиции). */
export const inHouse = (pos) => {
  const h = RULES.vitals.house;
  if (!pos) return true;   // позиции ещё нет — персонаж на старте, а старт в доме Мирры
  return num(pos.x) && num(pos.y) && pos.x >= h.x && pos.x <= h.x + h.w && pos.y >= h.y && pos.y <= h.y + h.h;
};

/**
 * Восстановление HP и маны до момента nowMs (мс) — зеркало SQL _advance. Меняет s.
 *  • null в hp/mana — «полный запас» (фиксируется числом);
 *  • идёт бой (combatSince) — время не засчитывается; бой старше staleCombatSec считается отступлением (HP не ниже доли поражения);
 *  • мана быстрее, если герой сохранён в доме Мирры.
 */
export function advanceVitals(s, nowMs) {
  const V = RULES.vitals;
  const mx = maxVitals(s.level);
  let h = num(s.hp) ? clamp(s.hp, 0, mx.hp) : mx.hp;
  const m = num(s.mana) ? clamp(s.mana, 0, mx.mana) : mx.mana;
  let from = num(s.vitalsAt) ? s.vitalsAt : nowMs;
  if (num(s.combatSince)) {
    const staleAt = s.combatSince + V.staleCombatSec * 1000;
    if (nowMs < staleAt) from = nowMs;
    else { h = Math.max(h, defeatHp(mx.hp)); from = Math.max(from, staleAt); s.combatSince = null; s.combatCtx = null; }
  }
  const el = Math.max(0, (nowMs - from) / 1000);
  s.hp = Math.min(mx.hp, h + el * V.hpRegenPerSec);
  s.mana = Math.min(mx.mana, m + el * (inHouse(s.pos) ? V.manaRegenHouse : V.manaRegenWorld));
  s.vitalsAt = nowMs;
  return s;
}

/**
 * Применяет patch к снимку по правилам сервера. Возвращает новый снимок, исходный не меняет.
 * nowMs — время сервера: если задано, сначала HP и мана восстанавливаются до этого момента (как делает sync_player).
 * Клиент без nowMs накладывает свои несохранённые изменения поверх ответа сервера — без пересчёта времени.
 */
export function applyPatch(snap, patch = {}, nowMs = null) {
  const s = JSON.parse(JSON.stringify(snap));
  if (num(nowMs)) advanceVitals(s, nowMs);
  // v0.15.0: поля xp, school, inv, abilities, quests, paths, enemies и research игнорируются — прогресс пишут только операции сервера
  s.tutorial = union(s.tutorial, patch.tutorial, LIMITS.maxKeys);
  for (const [k, v] of Object.entries(isObj(patch.objects) ? patch.objects : {})) {
    if (!isId(k) || serverOwnedObject(k)) continue;
    if (v === null) delete s.objects[k];
    else if (isObj(v) && (k in s.objects || Object.keys(s.objects).length < LIMITS.maxObjects)) s.objects[k] = v;
  }
  if (isObj(patch.pos) && num(patch.pos.x) && num(patch.pos.y)) s.pos = { x: patch.pos.x, y: patch.pos.y };
  if (isObj(patch.safe) && num(patch.safe.x) && num(patch.safe.y)) s.safe = { x: patch.safe.x, y: patch.safe.y };
  // HP и ману клиент не записывает: поля hp, mana (и устаревшее mana_spent, v0.12.0) игнорируются.
  // Ману тратят операции сервера (world, use), остаток после боя сообщает combat_end.
  if (num(patch.play)) s.play += clamp(int(patch.play), 0, LIMITS.maxPlayMsPerSync);
  if (Array.isArray(patch.combats)) s.combats = [...s.combats, ...patch.combats.filter(isObj)].slice(-LIMITS.maxCombats);
  return s;
}

export const STARTER_KIT = { event: 'mirra_starter_kit', items: { elixir_life: 1, elixir_mana: 1 } };

/** Цена лечения у Мирры по снимку: ceil(недостающее HP / 10); null — полное HP. */
export function healPriceOf(s) {
  const max = maxVitals(s.level).hp;
  const cur = num(s.hp) ? clamp(s.hp, 0, max) : max;
  return Math.ceil((max - cur) / HEALING.hpPerCoin - 1e-9);
}

// ---------------------------------------------------------------- v0.10.0: крафт, сюжетные предметы, миграция
const has = (s, ev) => s.quests.includes(ev);
const addEvent = (s, ev) => { if (!s.quests.includes(ev)) s.quests = [...s.quests, ev]; };
const addItem = (s, id, n) => { s.inventory[id] = clamp((s.inventory[id] || 0) + n, 0, LIMITS.maxCounter); };

/**
 * Разовая награда операции (зеркало SQL _grant): опыт героя (уровень растёт по таблице; перед повышением «полные» HP/мана
 * фиксируются числом, как GameState.addHeroXP), монеты, предметы, опыт школ, topUp — «не меньше» (гарантия цены изучения).
 */
function grant(s, reward = {}) {
  if (reward.heroXP) {
    const before = s.level;
    s.xp = clamp(s.xp + reward.heroXP, 0, LIMITS.maxXp);
    const lvl = Math.max(s.level, levelForXp(s.xp));
    if (lvl > before) {
      const mx = maxVitals(before);
      if (!num(s.hp)) s.hp = mx.hp;
      if (!num(s.mana)) s.mana = mx.mana;
    }
    s.level = lvl;
  }
  if (reward.coins) addItem(s, 'coins', reward.coins);
  for (const [k, v] of Object.entries(reward.items || {})) addItem(s, k, v);
  for (const [k, v] of Object.entries(reward.schoolXP || {})) s.school[k] = clamp((s.school[k] || 0) + v, 0, LIMITS.maxCounter);
  for (const [k, v] of Object.entries(reward.topUp?.school || {})) s.school[k] = Math.max(s.school[k] || 0, v);
  for (const [k, v] of Object.entries(reward.topUp?.items || {})) s.inventory[k] = Math.max(s.inventory[k] || 0, v);
}

/** Изготовление: рецепт известен, не уже сделан (сюжетный), ингредиентов хватает — иначе ничего не меняется. */
function craft(s, id) {
  const r = typeof id === 'string' && Object.hasOwn(RULES.recipes, id) ? RULES.recipes[id] : null;
  if (!r) return { ok: false, reason: 'unknown' };
  if (!r.requires.every(ev => has(s, ev))) return { ok: false, reason: 'locked' };
  if (r.blockedBy.some(ev => has(s, ev))) return { ok: false, reason: 'done' };
  const missing = Object.entries(r.needs).filter(([k, n]) => (s.inventory[k] || 0) < n).map(([k]) => k).sort();
  if (missing.length) return { ok: false, reason: 'missing', missing };
  for (const [k, n] of Object.entries(r.needs)) addItem(s, k, -n);
  addItem(s, r.result, r.amount);
  if (r.crafted) addEvent(s, r.crafted);
  let firstCraft = false;
  if (!has(s, RULES.firstCraft.event)) { addEvent(s, RULES.firstCraft.event); grant(s, RULES.firstCraft.reward); firstCraft = true; }
  return { ok: true, recipe: id, result: r.result, amount: r.amount, firstCraft };
}

/** Применение сюжетного предмета: условия, предмет (и мана) списываются вместе с событием и наградой — одной операцией. */
function useItem(s, id) {
  const u = typeof id === 'string' && Object.hasOwn(RULES.uses, id) ? RULES.uses[id] : null;
  if (!u) return { ok: false, reason: 'unknown' };
  if (u.blockedBy.some(ev => has(s, ev))) return { ok: false, reason: 'done' };
  if (!u.requires.every(ev => has(s, ev))) return { ok: false, reason: 'locked' };
  if ((s.inventory[id] || 0) < 1) return { ok: false, reason: 'missing' };
  if (u.mana) {
    const cur = num(s.mana) ? clamp(s.mana, 0, maxVitals(s.level).mana) : maxVitals(s.level).mana;
    if (cur < u.mana) return { ok: false, reason: 'mana', mana: u.mana };
    s.mana = cur - u.mana;
  }
  addItem(s, id, -1);
  for (const ev of u.events) addEvent(s, ev);
  grant(s, u.reward);
  return { ok: true, item: id, events: u.events };
}

// ---------------------------------------------------------------- v0.15.0: события, задания, изучение, ветки, магия в мире
/** Новое событие с наградой EVENT_REWARDS (одна на событие). false — событие уже было. */
function setEvent(s, key) {
  if (has(s, key)) return false;
  addEvent(s, key);
  if (Object.hasOwn(RULES.eventRewards, key)) grant(s, RULES.eventRewards[key]);
  return true;
}
const openPath = (s, id) => { if (!s.paths.includes(id)) s.paths = [...s.paths, id]; };
/** Открыть дар (или поднять ступень); ступень только растёт. */
function unlockAbility(s, id, level) {
  const a = s.abilities[id] || { level: 0, unlocked: false };
  s.abilities[id] = { level: Math.max(a.level || 0, level), unlocked: true };
}
const buildBranches = (s) => (isObj(s.objects.player_build) && isObj(s.objects.player_build.branches) ? s.objects.player_build.branches : {});
function setBranch(s, ability, branch) { s.objects.player_build = { branches: { ...buildBranches(s), [ability]: branch } }; }

/** Сюжетное событие по действию игрока (книга, алтарь, круг Огня, Селена, подсказки): только из RULES.events, с условиями и наградой. */
function eventAct(s, key) {
  const r = typeof key === 'string' && Object.hasOwn(RULES.events, key) ? RULES.events[key] : null;
  if (!r) return { ok: false, reason: 'unknown' };
  if (has(s, key)) return { ok: false, reason: 'already' };
  if (!r.requires.every(ev => has(s, ev))) return { ok: false, reason: 'locked' };
  setEvent(s, key);
  for (const [id, lvl] of Object.entries(r.unlock)) unlockAbility(s, id, lvl);
  return { ok: true, key };
}

const questRule = (id) => (typeof id === 'string' && Object.hasOwn(RULES.quests, id) ? RULES.quests[id] : null);
/** Принять побочное задание: доступно (условие выполнено), не принято и не сдано. */
function questAccept(s, id) {
  const q = questRule(id);
  if (!q) return { ok: false, reason: 'unknown' };
  if (has(s, q.done) || has(s, q.start)) return { ok: false, reason: 'already' };
  if (q.requires && !has(s, q.requires)) return { ok: false, reason: 'locked' };
  addEvent(s, q.start);
  return { ok: true, id };
}
/** Сдать задание: принято, все цели выполнены по данным сервера (сумка, побеждённые враги, события), предметы отдаются, награда выдаётся. */
function questTurnIn(s, id) {
  const q = questRule(id);
  if (!q) return { ok: false, reason: 'unknown' };
  if (has(s, q.done)) return { ok: false, reason: 'already' };
  if (!has(s, q.start)) return { ok: false, reason: 'not_started' };
  const done = (o) => (o.type === 'item' ? (s.inventory[o.item] || 0) >= o.count : o.type === 'enemy' ? s.enemies.includes(o.id) : has(s, o.key));
  if (!q.objectives.every(done)) return { ok: false, reason: 'not_ready' };
  if (Object.entries(q.consume).some(([k, n]) => (s.inventory[k] || 0) < n)) return { ok: false, reason: 'missing' };
  for (const [k, n] of Object.entries(q.consume)) addItem(s, k, -n);
  addEvent(s, q.done);
  grant(s, q.reward);
  return { ok: true, id };
}

/** Начать изучение: условия и цена (опыт дара, предметы) проверяет и списывает сервер; таймер идёт по времени сервера. */
function researchStart(s, id) {
  const up = typeof id === 'string' && Object.hasOwn(RULES.research, id) ? RULES.research[id] : null;
  if (!up) return { ok: false, reason: 'unknown' };
  if (up.locked) return { ok: false, reason: 'locked' };
  if ((s.abilities[up.ability]?.level || 0) >= up.toLevel) return { ok: false, reason: 'done' };
  if (s.research) return { ok: false, reason: s.research.upgradeId === id ? 'in_progress' : 'busy' };
  if (up.event && !has(s, up.event)) return { ok: false, reason: 'event' };
  const enough = s.level >= up.heroLevel && (s.abilities[up.ability]?.level || 0) >= up.abilityLevel
    && (s.school[up.ability] || 0) >= up.schoolXP && Object.entries(up.items).every(([k, n]) => (s.inventory[k] || 0) >= n);
  if (!enough) return { ok: false, reason: 'missing' };
  s.school[up.ability] = (s.school[up.ability] || 0) - up.schoolXP;
  for (const [k, n] of Object.entries(up.items)) addItem(s, k, -n);
  s.research = { upgradeId: id, startedAt: num(s.vitalsAt) ? s.vitalsAt : 0, durationMs: up.durationMs };
  if (up.startEvent) setEvent(s, up.startEvent);
  return { ok: true, upgrade: id };
}
/** Завершить изучение, когда по времени сервера оно готово: дар поднимается, ветка записывается, событие завершения выдаёт награду. */
function researchFinish(s) {
  if (!s.research) return { ok: false, reason: 'none' };
  const id = s.research.upgradeId;
  const up = typeof id === 'string' && Object.hasOwn(RULES.research, id) ? RULES.research[id] : null;
  if (!up) return { ok: false, reason: 'unknown' };
  const now = num(s.vitalsAt) ? s.vitalsAt : 0;
  const left = (num(s.research.startedAt) ? s.research.startedAt : 0) + (num(s.research.durationMs) ? s.research.durationMs : up.durationMs) - now;
  if (left > 0) return { ok: false, reason: 'wait', left: Math.ceil(left / 1000) };
  unlockAbility(s, up.ability, up.toLevel);
  if (up.branch) setBranch(s, up.ability, up.branch);
  s.research = null;
  if (up.completeEvent) setEvent(s, up.completeEvent);
  return { ok: true, upgrade: id, events: up.completeEvent ? [up.completeEvent] : [] };
}

/** Смена ветки дара за монеты (вне боя): ветка должна быть открыта уровнем дара и отличаться от текущей. */
function respec(s, ability, branch) {
  const B = RULES.build;
  const opt = isId(ability) && isId(branch) ? B.branches[ability]?.[branch] : null;
  const lvl = s.abilities[ability]?.level || 0;
  const curId = isId(ability) ? buildBranches(s)[ability] : null;
  const curOpt = isId(curId) ? B.branches[ability]?.[curId] : null;
  if (!opt || !curOpt || lvl < curOpt.fromLevel || lvl < opt.fromLevel) return { ok: false, reason: 'unavailable' };
  if (s.combatSince != null) return { ok: false, reason: 'combat' };
  if (curId === branch) return { ok: false, reason: 'same' };
  if ((s.inventory.coins || 0) < B.respecCoins) return { ok: false, reason: 'coins', need: B.respecCoins };
  addItem(s, 'coins', -B.respecCoins);
  setBranch(s, ability, branch);
  return { ok: true, price: B.respecCoins };
}

/** Зелье из сумки вне боя: возвращает долю максимума; при полном запасе не тратится. */
function drink(s, item) {
  const u = typeof item === 'string' && Object.hasOwn(RULES.potions, item) ? RULES.potions[item] : null;
  if (!u) return { ok: false, reason: 'unknown' };
  if (s.combatSince != null) return { ok: false, reason: 'combat' };
  if ((s.inventory[item] || 0) < 1) return { ok: false, reason: 'none' };
  const mx = maxVitals(s.level);
  const key = u.kind === 'heal' ? 'hp' : 'mana';
  const cur = num(s[key]) ? clamp(s[key], 0, mx[key]) : mx[key];
  if (cur >= mx[key]) return { ok: false, reason: 'full', kind: u.kind };
  addItem(s, item, -1);
  s[key] = Math.min(mx[key], cur + Math.round(mx[key] * u.amount));
  return { ok: true, kind: u.kind, amount: s[key] - cur };
}

/**
 * v0.13.0: действие в мире по правилам RULES.world (сбор, находка, запас, магия). Порядок проверок (его повторяет SQL):
 * неизвестный объект → бой → закрыто (события, побеждённые враги, состояние «родителя», дар и его ступень) → уже сделано / ещё не выросло → мана.
 * Время «сейчас» — vitalsAt (после advanceVitals это момент сервера).
 */
function worldAct(s, id) {
  const r = typeof id === 'string' && Object.hasOwn(RULES.world, id) ? RULES.world[id] : null;
  if (!r) return { ok: false, reason: 'unknown' };
  if (s.combatSince != null) return { ok: false, reason: 'combat' };
  const now = num(s.vitalsAt) ? s.vitalsAt : 0;
  const st = (k) => (isObj(s.objects[k]) ? s.objects[k] : null);
  const locked = !(r.requires || []).every(ev => has(s, ev)) || !(r.requiresEnemy || []).every(e => s.enemies.includes(e))
    || (r.parent && st(r.parent.id)?.state !== r.parent.state)
    || (r.ability && !((s.abilities[r.ability]?.unlocked) && (s.abilities[r.ability]?.level || 0) >= (r.minLevel || 1)));
  if (locked) return { ok: false, reason: 'locked' };
  if ((r.blockedBy || []).some(ev => has(s, ev))) return { ok: false, reason: 'done' };
  let wins = 0;
  if ((r.kind === 'loot' || r.kind === 'cast') && r.mark && st(id)?.state === r.mark) return { ok: false, reason: 'done' };
  if (r.kind === 'gather') {
    const o = st(id);
    if (o && o.state === 'picked') {
      const left = (num(o.t) ? o.t : 0) + r.respawnSec * 1000 - now;
      if (left > 0) return { ok: false, reason: 'wait', left: Math.ceil(left / 1000) };
    }
  }
  if (r.kind === 'stash') {
    const rep = st(`rep:${r.guard}`);
    wins = num(rep?.wins) ? rep.wins : (s.enemies.includes(r.guard) ? 1 : 0);
    const claimed = num(st(id)?.claimed) ? st(id).claimed : 0;
    if (wins <= 0) return { ok: false, reason: 'locked' };
    if (wins <= claimed) return { ok: false, reason: 'done' };
  }
  if (r.mana) {
    const mx = maxVitals(s.level);
    const cur = num(s.mana) ? clamp(s.mana, 0, mx.mana) : mx.mana;
    if (cur < r.mana) return { ok: false, reason: 'mana', mana: r.mana };
    s.mana = cur - r.mana;
  }
  if (r.kind === 'gather') {
    addItem(s, r.item, r.amount);
    s.objects[id] = { state: 'picked', t: now };
  } else if (r.kind === 'loot') {
    grant(s, r.reward);
    s.objects[id] = { state: r.mark };
  } else if (r.kind === 'stash') {
    grant(s, { items: r.items });
    s.objects[id] = { ...(st(id) || {}), claimed: wins };
  } else if (r.mark) {
    s.objects[id] = { state: r.mark };
  }
  // v0.15.0: опыт дара за применение в мире, события и путь, которые открывает успех (с наградами событий)
  for (const [k, n] of Object.entries(r.school || {})) if (n > 0) s.school[k] = clamp((s.school[k] || 0) + n, 0, LIMITS.maxCounter);
  for (const ev of r.events || []) setEvent(s, ev);
  if (r.path) openPath(s, r.path);
  return { ok: true, kind: r.kind, id, mana: r.mana || 0 };
}

/** Зелья, которые можно выпить в бою (как POTIONS в config/resources.js; их набор фиксирован серверной схемой). */
export const COMBAT_POTIONS = ['elixir_life', 'elixir_mana', 'resin_flask'];

/**
 * v0.14.0: что сервер запоминает о герое в начале боя — по этому состоянию он потом проигрывает запись боя.
 * Уровень, дары, ветки, зелья, HP и мана берутся из его собственных данных, а не от клиента; клиент называет только место (spawn) и врага.
 */
export function combatCtxOf(s, spawn, enemy) {
  const mx = maxVitals(s.level);
  const abilities = {};
  for (const id of ABILITY_IDS) { const a = s.abilities?.[id]; abilities[id] = { level: a?.level || 0, unlocked: !!a?.unlocked }; }
  const potions = {};
  for (const id of COMBAT_POTIONS) potions[id] = s.inventory[id] || 0;
  return {
    spawn, enemy, level: s.level, abilities,
    hp: num(s.hp) ? clamp(s.hp, 0, mx.hp) : mx.hp,
    mana: num(s.mana) ? clamp(s.mana, 0, mx.mana) : mx.mana,
    potions,
    build: s.objects?.player_build ?? null,
  };
}

/** Начало боя: HP и мана замирают, лечение и зелья из сумки закрыты. Повтор начало не сдвигает, но состояние героя запоминается заново. */
function combatStart(s, action = {}) {
  if (!isId(action.spawn) || !isId(action.enemy)) return { ok: false, reason: 'bad_spawn' };
  if (s.combatSince == null) s.combatSince = s.vitalsAt;
  s.combatCtx = combatCtxOf(s, action.spawn, action.enemy);
  // v0.15.0: событие «встреча началась» (combat_intro_01 и др.) ставит сервер, если место боя уже открыто
  const ss = Object.hasOwn(RULES.spawnStart, action.spawn) ? RULES.spawnStart[action.spawn] : null;
  if (ss && (!ss.requires || has(s, ss.requires))) setEvent(s, ss.event);
  return { ok: true, hp: s.combatCtx.hp, mana: s.combatCtx.mana };
}

/**
 * Итог боя без проверки записи — только отступление (перезагрузка посреди боя): HP не ниже доли поражения, мана как была.
 * Победа и поражение с v0.14.0 принимаются только через combat_apply (проверенная запись), пока сервер запомнил состояние боя.
 * Без запомненного состояния (бой начат до обновления) старое поведение: остаток маны сообщает клиент.
 */
function combatEnd(s, action) {
  if (s.combatSince == null) return { ok: false, reason: 'no_combat' };
  const outcome = action.outcome;
  if (!['victory', 'defeat', 'retreat'].includes(outcome)) return { ok: false, reason: 'bad_outcome' };
  if (outcome !== 'retreat' && s.combatCtx) return { ok: false, reason: 'verify' };
  const mx = maxVitals(s.level);
  const cur = num(s.hp) ? clamp(s.hp, 0, mx.hp) : mx.hp;
  const floor = defeatHp(mx.hp);
  s.hp = outcome === 'victory' ? mx.hp : outcome === 'defeat' ? floor : Math.max(cur, floor);
  if (outcome !== 'retreat' && num(action.mana)) s.mana = clamp(action.mana, 0, mx.mana);
  s.combatSince = null;
  s.combatCtx = null;
  return { ok: true, outcome };
}

/**
 * v0.14.0: применить проверенный итог боя (зеркало SQL combat_apply; вызывает только проверяющий — Edge Function combat).
 * verdict считает verifyCombat (cloud/combatVerify.js): исход, остаток маны, израсходованные зелья, награда (опыт героя,
 * опыт даров за применения и победу, предметы и монеты), штраф монет, победа на месте, путь, события, состояние возобновляемого места, запись истории.
 * Зелья: в сумке остаётся не больше, чем было в начале боя минус выпитое (так списание не удваивается, даже если клиент уже сообщил о нём).
 */
export function combatApply(snap, v, nowMs = null) {
  const s = JSON.parse(JSON.stringify(snap));
  if (num(nowMs)) advanceVitals(s, nowMs);
  const res = (r) => ({ snapshot: s, result: r });
  const ctx = s.combatCtx;
  if (s.combatSince == null || !ctx) return res({ ok: false, reason: 'no_combat' });
  if (!isObj(v) || !['victory', 'defeat', 'retreat'].includes(v.outcome)) return res({ ok: false, reason: 'bad_verdict' });
  if (v.since !== s.combatSince || v.spawn !== ctx.spawn) return res({ ok: false, reason: 'stale' });
  const mx0 = maxVitals(s.level);
  const cur = num(s.hp) ? clamp(s.hp, 0, mx0.hp) : mx0.hp;
  if (v.outcome !== 'retreat') {
    for (const id of COMBAT_POTIONS) {
      const used = int(v.potions?.[id]);
      if (used > 0) s.inventory[id] = Math.min(s.inventory[id] || 0, Math.max(0, (ctx.potions[id] || 0) - used));
    }
    grant(s, v.reward || {});
    if (v.coinsLost > 0) addItem(s, 'coins', -int(v.coinsLost));
    if (v.outcome === 'victory') {
      if (!s.enemies.includes(v.spawn)) s.enemies = [...s.enemies, v.spawn];
      if (isId(v.path) && !s.paths.includes(v.path)) s.paths = [...s.paths, v.path];
      for (const ev of Array.isArray(v.events) ? v.events : []) if (isId(ev)) addEvent(s, ev);
      if (isObj(v.rep) && isId(v.rep.key)) s.objects[v.rep.key] = { ...(s.objects[v.rep.key] || {}), wins: int(v.rep.wins), at: num(v.rep.at) ? v.rep.at : 0 };
    }
    if (isObj(v.entry)) s.combats = [...s.combats, v.entry].slice(-LIMITS.maxCombats);
  }
  const mx = maxVitals(s.level);
  const floor = defeatHp(mx.hp);
  s.hp = v.outcome === 'victory' ? mx.hp : v.outcome === 'defeat' ? floor : Math.max(cur, floor);
  if (v.outcome !== 'retreat' && num(v.mana)) s.mana = clamp(v.mana, 0, mx.mana);
  s.combatSince = null;
  s.combatCtx = null;
  return res({ ok: true, outcome: v.outcome });
}

/** Разовая миграция v0.10: ядро Стража тем, кто победил его до главы и не имеет ядра (флаг — всегда). */
function migrateV10(s) {
  const m = RULES.migration;
  if (has(s, m.event)) return { ok: false, reason: 'already' };
  addEvent(s, m.event);
  const core = s.enemies.includes(m.guardian) && !(s.inventory[m.item] > 0) && !m.notIf.some(ev => has(s, ev));
  if (core) addItem(s, m.item, 1);
  return { ok: true, core: core ? 1 : 0 };
}

/**
 * Атомарные действия сервера (зеркало player_action в supabase/schema.sql). Возвращает { snapshot, result }.
 *   { op: 'heal' }        — полное HP за монеты; при нехватке ничего не меняется
 *   { op: 'starter_kit' } — один раз: событие mirra_starter_kit + настой жизни и лунный эликсир
 *   v0.10.0:
 *   { op: 'craft', recipe } — изготовление в котле (первый крафт: +15 опыта один раз)
 *   { op: 'use', item }     — применение сюжетного предмета (фитиль, состав, связка + 20 маны)
 *   { op: 'migrate_v10' }   — разовая компенсация ядра старым сохранениям
 *   v0.12.0:
 *   { op: 'drink', item }   — зелье из сумки вне боя (настой жизни, лунный эликсир)
 *   { op: 'combat_start', spawn, enemy } — бой начался: восстановление стоит; сервер запоминает состояние героя (v0.14.0)
 *   { op: 'combat_end', outcome: 'victory'|'defeat'|'retreat', mana } — бой закончен (с v0.14.0 победу и поражение принимает только combatApply)
 *   v0.13.0:
 *   { op: 'world', obj }    — сбор узла, находка, запас или магия в мире (правила RULES.world: мана, дар, возрождение, награда)
 *   v0.15.0 (прогресс только от сервера):
 *   { op: 'event', key }              — сюжетное событие по действию игрока (RULES.events: условия, дар, награда)
 *   { op: 'quest_accept' | 'quest_turn_in', id } — побочное задание: принять / сдать (цели и награда — RULES.quests)
 *   { op: 'research_start', upgrade } — начать изучение (цена и условия — RULES.research), { op: 'research_finish' } — завершить, когда время вышло
 *   { op: 'respec', ability, branch } — сменить ветку дара за монеты
 * nowMs — время сервера: перед любым действием HP и мана восстанавливаются до него (как player_action).
 */
export function applyAction(snap, action = {}, nowMs = null) {
  const s = JSON.parse(JSON.stringify(snap));
  if (num(nowMs)) advanceVitals(s, nowMs);
  const op = isObj(action) ? action.op : null;
  if (op === 'craft') return { snapshot: s, result: craft(s, action.recipe) };
  if (op === 'use') return { snapshot: s, result: useItem(s, action.item) };
  if (op === 'migrate_v10') return { snapshot: s, result: migrateV10(s) };
  if (op === 'drink') return { snapshot: s, result: drink(s, action.item) };
  if (op === 'world') return { snapshot: s, result: worldAct(s, action.obj) };
  if (op === 'combat_start') return { snapshot: s, result: combatStart(s, action) };
  if (op === 'combat_end') return { snapshot: s, result: combatEnd(s, action) };
  if (op === 'event') return { snapshot: s, result: eventAct(s, action.key) };
  if (op === 'quest_accept') return { snapshot: s, result: questAccept(s, action.id) };
  if (op === 'quest_turn_in') return { snapshot: s, result: questTurnIn(s, action.id) };
  if (op === 'research_start') return { snapshot: s, result: researchStart(s, action.upgrade) };
  if (op === 'research_finish') return { snapshot: s, result: researchFinish(s) };
  if (op === 'respec') return { snapshot: s, result: respec(s, action.ability, action.branch) };
  if (op === 'heal') {
    const price = healPriceOf(s);
    if (s.combatSince != null) return { snapshot: s, result: { ok: false, reason: 'combat', price: 0 } };
    if (price <= 0) return { snapshot: s, result: { ok: false, reason: 'full', price: 0 } };
    const coins = s.inventory.coins || 0;
    if (coins < price) return { snapshot: s, result: { ok: false, reason: 'coins', price } };
    s.inventory.coins = coins - price;
    s.hp = maxVitals(s.level).hp;
    return { snapshot: s, result: { ok: true, price } };
  }
  if (op === 'starter_kit') {
    if (s.quests.includes(STARTER_KIT.event)) return { snapshot: s, result: { ok: false, reason: 'already' } };
    s.quests = [...s.quests, STARTER_KIT.event];
    for (const [k, v] of Object.entries(STARTER_KIT.items)) s.inventory[k] = (s.inventory[k] || 0) + v;
    return { snapshot: s, result: { ok: true } };
  }
  return { snapshot: s, result: { ok: false, reason: 'unknown' } };
}

/** Ответ сервера → снимок с недостающими полями по умолчанию (новый персонаж: позиция null, пустые дары и т.д.). */
export function fillDefaults(raw) {
  const def = emptySnapshot();
  const { meta, action, ...s } = raw;
  return {
    snapshot: {
      ...def, ...s,
      school: { ...def.school, ...(s.school || {}) },
      abilities: { ...def.abilities, ...(s.abilities || {}) },
      inventory: { ...def.inventory, ...(s.inventory || {}) },
      pos: s.pos || def.pos, safe: s.safe || def.safe,
      hp: s.hp ?? null, mana: s.mana ?? null,   // нет поля (старая схема) — «полный запас»; числовой 0 сохраняется
      vitalsAt: s.vitalsAt ?? null, combatSince: s.combatSince ?? null, combatCtx: s.combatCtx ?? null,
    },
    meta: meta || {},
    action: action || null,
  };
}
