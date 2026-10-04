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
// applyPatch ниже — точное зеркало SQL-функции sync_player (supabase/schema.sql); соответствие проверяет tools/sql/diff-test.mjs.
// applyAction — зеркало player_action (v0.9): платное лечение и стартовый набор зелий — атомарные операции сервера,
// а не дельты patch (иначе при нехватке монет сервер обрезал бы списание до нуля, а HP всё равно стало бы полным).
import { createDefaultState } from '../state/GameState.js';
import { HERO_LEVELS, HEALING } from '../config/balance.hero.js';
import { serverRules } from '../config/storyItems.js';

const RULES = serverRules();
/** v0.13.0: ключи объектов мира, состояние которых пишет только сервер (сбор, находки, запасы). Магия (kind cast) остаётся за клиентом. */
export const serverOwnedObject = (k) => typeof k === 'string' && Object.hasOwn(RULES.world, k) && RULES.world[k].kind !== 'cast';

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
  d.stats = { playTimeMs: s.play || 0, combats: (s.combats || []).map(c => ({ ...c })) };
  d.tutorial = [...(s.tutorial || [])];
  return d;
}

/** Что изменилось в cur по сравнению с base. Пустой объект — менять нечего. */
export function diffSnapshots(base, cur) {
  const p = {};
  if (cur.xp > base.xp) p.xp = cur.xp; // уровень сервер считает сам по опыту
  const school = {};
  for (const k of new Set([...Object.keys(base.school), ...Object.keys(cur.school)])) { const dlt = (cur.school[k] || 0) - (base.school[k] || 0); if (dlt) school[k] = dlt; }
  if (Object.keys(school).length) p.school = school;
  const inv = {};
  for (const k of new Set([...Object.keys(base.inventory), ...Object.keys(cur.inventory)])) { const dlt = (cur.inventory[k] || 0) - (base.inventory[k] || 0); if (dlt) inv[k] = dlt; }
  if (Object.keys(inv).length) p.inv = inv;
  const abilities = {};
  for (const id of ABILITY_IDS) {
    const b = base.abilities[id] || { level: 0, unlocked: false }, c = cur.abilities[id] || { level: 0, unlocked: false };
    if (c.level > b.level || (c.unlocked && !b.unlocked)) abilities[id] = { level: c.level, unlocked: !!c.unlocked };
  }
  if (Object.keys(abilities).length) p.abilities = abilities;
  for (const [key, field] of [['quests', 'quests'], ['paths', 'paths'], ['enemies', 'enemies'], ['tutorial', 'tutorial']]) {
    const add = cur[field].filter(x => !base[field].includes(x));
    if (add.length) p[key] = add;
  }
  const objects = {};
  for (const k of new Set([...Object.keys(base.objects), ...Object.keys(cur.objects)])) {
    if (!(k in cur.objects)) objects[k] = null; else if (!eq(base.objects[k], cur.objects[k])) objects[k] = cur.objects[k];
  }
  if (Object.keys(objects).length) p.objects = objects;
  if (!eq(base.research, cur.research)) p.research = { value: cur.research };
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
    else { h = Math.max(h, defeatHp(mx.hp)); from = Math.max(from, staleAt); s.combatSince = null; }
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
  if (num(patch.xp)) s.xp = clamp(Math.min(Math.max(s.xp, int(patch.xp)), s.xp + LIMITS.gainXp), 0, LIMITS.maxXp);
  s.level = Math.max(s.level, levelForXp(s.xp));
  for (const [k, v] of Object.entries(isObj(patch.school) ? patch.school : {})) {
    if (!SCHOOL_IDS.includes(k) || !num(v)) continue;
    s.school[k] = clamp((s.school[k] || 0) + clamp(int(v), -LIMITS.maxSpendPerSync, LIMITS.gainSchool), 0, LIMITS.maxCounter);
  }
  for (const [k, v] of Object.entries(isObj(patch.inv) ? patch.inv : {})) {
    if (!isId(k) || !num(v)) continue;
    if (!(k in s.inventory) && Object.keys(s.inventory).length >= LIMITS.maxItems) continue;
    const gain = k === 'coins' ? LIMITS.gainCoins : LIMITS.gainItem;
    s.inventory[k] = clamp((s.inventory[k] || 0) + clamp(int(v), -LIMITS.maxSpendPerSync, gain), 0, LIMITS.maxCounter);
  }
  for (const [k, v] of Object.entries(isObj(patch.abilities) ? patch.abilities : {})) {
    if (!ABILITY_IDS.includes(k) || !isObj(v)) continue;
    const cur = s.abilities[k] || { level: 0, unlocked: false };
    s.abilities[k] = { level: clamp(Math.max(cur.level, int(v.level)), 0, LIMITS.maxAbilityLevel), unlocked: !!cur.unlocked || v.unlocked === true };
  }
  s.quests = union(s.quests, patch.quests, LIMITS.maxKeys);
  s.paths = union(s.paths, patch.paths, LIMITS.maxKeys);
  s.enemies = union(s.enemies, patch.enemies, LIMITS.maxKeys);
  s.tutorial = union(s.tutorial, patch.tutorial, LIMITS.maxKeys);
  for (const [k, v] of Object.entries(isObj(patch.objects) ? patch.objects : {})) {
    if (!isId(k) || serverOwnedObject(k)) continue;
    if (v === null) delete s.objects[k];
    else if (isObj(v) && (k in s.objects || Object.keys(s.objects).length < LIMITS.maxObjects)) s.objects[k] = v;
  }
  if (isObj(patch.research) && 'value' in patch.research) s.research = isObj(patch.research.value) ? patch.research.value : null;
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
  if (r.kind === 'loot' && st(id)?.state === r.mark) return { ok: false, reason: 'done' };
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
  }
  return { ok: true, kind: r.kind, id, mana: r.mana || 0 };
}

/** Начало боя: HP и мана замирают, лечение и зелья из сумки закрыты. Повтор начало не сдвигает. */
function combatStart(s) {
  if (s.combatSince == null) s.combatSince = s.vitalsAt;
  return { ok: true };
}

/**
 * Итог боя: победа — полное HP, поражение — доля максимума, отступление (перезагрузка посреди боя) — не ниже этой доли.
 * Остаток маны сообщает клиент (до серверного боя) — в пределах максимума.
 */
function combatEnd(s, action) {
  if (s.combatSince == null) return { ok: false, reason: 'no_combat' };
  const outcome = action.outcome;
  if (!['victory', 'defeat', 'retreat'].includes(outcome)) return { ok: false, reason: 'bad_outcome' };
  const mx = maxVitals(s.level);
  const cur = num(s.hp) ? clamp(s.hp, 0, mx.hp) : mx.hp;
  const floor = defeatHp(mx.hp);
  s.hp = outcome === 'victory' ? mx.hp : outcome === 'defeat' ? floor : Math.max(cur, floor);
  if (outcome !== 'retreat' && num(action.mana)) s.mana = clamp(action.mana, 0, mx.mana);
  s.combatSince = null;
  return { ok: true, outcome };
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
 *   { op: 'combat_start' }  — бой начался: восстановление стоит
 *   { op: 'combat_end', outcome: 'victory'|'defeat'|'retreat', mana } — бой закончен
 *   v0.13.0:
 *   { op: 'world', obj }    — сбор узла, находка, запас или магия в мире (правила RULES.world: мана, дар, возрождение, награда)
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
  if (op === 'combat_start') return { snapshot: s, result: combatStart(s) };
  if (op === 'combat_end') return { snapshot: s, result: combatEnd(s, action) };
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
      vitalsAt: s.vitalsAt ?? null, combatSince: s.combatSince ?? null,
    },
    meta: meta || {},
    action: action || null,
  };
}
