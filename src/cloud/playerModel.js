// Модель игрока на сервере и способ её менять. Без Phaser и DOM.
//
// Главное правило: клиент НЕ отправляет «весь сейв». Он считает, что изменилось с момента последнего ответа сервера (diff),
// и шлёт только это (patch). Сервер сам сливает изменения с актуальным состоянием игрока и возвращает его целиком (snapshot).
// Поэтому устройство с устаревшими данными не может затереть более свежий прогресс другого устройства:
//   • числа-счётчики (предметы, опыт дара, время игры) меняются дельтами: +3 монеты, а не «монет = 17»;
//   • уровень, опыт героя и уровни даров только растут (greatest);
//   • события, пути, побеждённые враги, подсказки только добавляются (объединение множеств);
//   • позиция, точка возрождения, состояние предметов мира и исследование — «последний записал»;
//   • история боёв дописывается.
// applyPatch ниже — точное зеркало SQL-функции sync_player (supabase/schema.sql); соответствие проверяет tools/sql/diff-test.mjs.
import { createDefaultState } from '../state/GameState.js';
import { HERO_LEVELS } from '../config/balance.hero.js';

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
  if (base.hp !== cur.hp) p.hp = { value: cur.hp };
  if (cur.play > base.play) p.play = cur.play - base.play;
  if (cur.combats.length > base.combats.length) p.combats = cur.combats.slice(base.combats.length);
  return p;
}

/** Только «мелочь» (позиция, время, здоровье): такие изменения можно отправлять реже. */
export function isMinorPatch(p) {
  return Object.keys(p).every(k => k === 'pos' || k === 'play' || k === 'hp');
}

const union = (list, add, max) => {
  const out = [...list];
  for (const x of Array.isArray(add) ? add : []) if (isId(x) && !out.includes(x) && out.length < max) out.push(x);
  return out;
};

/** Применяет patch к снимку по правилам сервера. Возвращает новый снимок, исходный не меняет. */
export function applyPatch(snap, patch = {}) {
  const s = JSON.parse(JSON.stringify(snap));
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
    if (!isId(k)) continue;
    if (v === null) delete s.objects[k];
    else if (isObj(v) && (k in s.objects || Object.keys(s.objects).length < LIMITS.maxObjects)) s.objects[k] = v;
  }
  if (isObj(patch.research) && 'value' in patch.research) s.research = isObj(patch.research.value) ? patch.research.value : null;
  if (isObj(patch.pos) && num(patch.pos.x) && num(patch.pos.y)) s.pos = { x: patch.pos.x, y: patch.pos.y };
  if (isObj(patch.safe) && num(patch.safe.x) && num(patch.safe.y)) s.safe = { x: patch.safe.x, y: patch.safe.y };
  if (isObj(patch.hp) && 'value' in patch.hp) s.hp = num(patch.hp.value) ? patch.hp.value : null;
  if (num(patch.play)) s.play += clamp(int(patch.play), 0, LIMITS.maxPlayMsPerSync);
  if (Array.isArray(patch.combats)) s.combats = [...s.combats, ...patch.combats.filter(isObj)].slice(-LIMITS.maxCombats);
  return s;
}

/** Ответ сервера → снимок с недостающими полями по умолчанию (новый персонаж: позиция null, пустые дары и т.д.). */
export function fillDefaults(raw) {
  const def = emptySnapshot();
  const { meta, ...s } = raw;
  return {
    snapshot: {
      ...def, ...s,
      school: { ...def.school, ...(s.school || {}) },
      abilities: { ...def.abilities, ...(s.abilities || {}) },
      inventory: { ...def.inventory, ...(s.inventory || {}) },
      pos: s.pos || def.pos, safe: s.safe || def.safe,
    },
    meta: meta || {},
  };
}
