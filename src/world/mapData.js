// Данные карты: базовая расстановка + правки из редактора. Без Phaser и DOM.
import { PROPS } from '../config/world.props.js';
import { EDITS } from '../config/world.edits.js';
import { ROADS, WATERS } from '../config/world.terrain.js';
import { COLLIDERS } from '../config/world.layout.js';

export const DRAFT_KEY = 'witch_rpg_map_draft_v1';

const norm = (p) => ({ ...p, f: p.f ? 1 : 0, s: p.s || 1 });
const clean = (p) => {
  const o = { ...p };
  if (!o.f) delete o.f;
  if (!o.s || Math.abs(o.s - 1) < 0.005) delete o.s;
  return o;
};

/** Накладывает правки на базовую расстановку. Возвращает новый массив, исходный не меняется. */
export function applyEdits(base, edits) {
  const e = edits || {};
  const patches = e.props || {};
  const out = [];
  for (const p of base) {
    const patch = patches[p.id];
    if (patch === null) continue;
    out.push(patch ? clean({ ...p, ...patch }) : { ...p });
  }
  for (const a of e.add || []) out.push(clean({ ...a }));
  return out;
}

/** Правки, которые превращают base в current (только отличия). */
export function diffEdits(base, current, pos = {}) {
  const byId = new Map(base.map(p => [p.id, norm(p)]));
  const props = {};
  const add = [];
  const seen = new Set();
  for (const c of current) {
    const b = byId.get(c.id);
    if (!b) { add.push(clean({ ...c })); continue; }
    seen.add(c.id);
    const n = norm(c);
    const patch = {};
    for (const k of ['x', 'y', 'f', 's']) if (Math.abs((n[k] ?? 0) - (b[k] ?? 0)) > (k === 's' ? 0.004 : 0.4)) patch[k] = n[k];
    if (Object.keys(patch).length) props[c.id] = patch;
  }
  for (const id of byId.keys()) if (!seen.has(id)) props[id] = null;
  return { v: 1, props, add, pos: { ...pos } };
}

/** Сдвигает интерактивные объекты и врагов по pos { id: {x, y} }; связанные точки (target, panOnOpen) едут вместе. */
export function applyPos(list, pos = {}) {
  return list.map((cfg) => {
    const m = pos[cfg.id];
    const dx = m ? m.x - cfg.x : 0, dy = m ? m.y - cfg.y : 0;
    const out = { ...cfg };
    if (!m || (!dx && !dy)) return out; // всегда копия: редактор меняет cfg, а исходные данные трогать нельзя
    out.x = m.x; out.y = m.y;
    if (cfg.target) out.target = { x: cfg.target.x + dx, y: cfg.target.y + dy };
    if (cfg.panOnOpen) out.panOnOpen = { x: cfg.panOnOpen.x + dx, y: cfg.panOnOpen.y + dy };
    return out;
  });
}

/** Только реально изменённые позиции относительно исходной раскладки. */
export function diffPos(list, current) {
  const out = {};
  const base = new Map(list.map(c => [c.id, c]));
  for (const [id, m] of Object.entries(current)) {
    const b = base.get(id);
    if (b && (Math.round(m.x) !== b.x || Math.round(m.y) !== b.y)) out[id] = { x: Math.round(m.x), y: Math.round(m.y) };
  }
  return out;
}

// ---------------------------------------------------------------- дороги, вода и стены
// Базовые фигуры лежат в world.terrain.js и world.layout.js, правки — в EDITS.roads / waters / cols:
//   { id: полное_описание | null } — изменённая или новая фигура целиком, null — удалена.
// Стены (COLLIDERS) не имеют id в исходнике, поэтому базовым достаётся c0, c1… по порядку в списке (порядок не менять!).
// Каждой фигуре кладётся n: у базовых это место в списке, у новых — своё, сохранённое в правках. По n считается
// «дрожание» краёв, так что удаление одной дороги не меняет вид остальных.

const clone = (v) => JSON.parse(JSON.stringify(v));

/** Базовые списки с id и номером шума. Каждый раз новые копии: редактор их меняет. */
export function baseTerrain() {
  return {
    roads: ROADS.map((r, i) => ({ ...clone(r), n: i })),
    waters: WATERS.map((w, i) => ({ ...clone(w), n: i })),
    cols: COLLIDERS.map((c, i) => ({ ...clone(c), id: `c${i}` })),
  };
}

/** base + правки по id. Результат — новые копии. Порядок: базовые как были, новые в конец. */
export function applyListEdits(base, patches = {}) {
  const out = [];
  const seen = new Set();
  for (const b of base) {
    seen.add(b.id);
    const p = patches[b.id];
    if (p === null) continue;
    out.push(clone(p || b));
  }
  for (const [id, p] of Object.entries(patches)) if (p && !seen.has(id)) out.push(clone(p));
  return out;
}

export function applyTerrainEdits(edits) {
  const b = baseTerrain(), e = edits || {};
  return {
    roads: applyListEdits(b.roads, e.roads),
    waters: applyListEdits(b.waters, e.waters),
    colliders: applyListEdits(b.cols, e.cols),
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Отличия current от base: { id: описание | null }. */
export function diffList(base, current) {
  const out = {};
  const byId = new Map(base.map(b => [b.id, b]));
  const seen = new Set();
  for (const c of current) {
    seen.add(c.id);
    const b = byId.get(c.id);
    if (!b || !same(b, c)) out[c.id] = clone(c);
  }
  for (const id of byId.keys()) if (!seen.has(id)) out[id] = null;
  return out;
}

/** Правки дорог, воды и стен для файла; пустые разделы не пишутся, чтобы файл не раздувался. */
export function diffTerrain({ roads, waters, colliders }) {
  const b = baseTerrain();
  const out = {};
  const r = diffList(b.roads, roads), w = diffList(b.waters, waters), c = diffList(b.cols, colliders);
  if (Object.keys(r).length) out.roads = r;
  if (Object.keys(w).length) out.waters = w;
  if (Object.keys(c).length) out.cols = c;
  return out;
}

export function loadDraft(storage) {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 1 ? d : null;
  } catch (e) { return null; }
}

export function saveDraft(storage, edits) {
  try { storage?.setItem(DRAFT_KEY, JSON.stringify(edits)); return true; } catch (e) { return false; }
}

export function clearDraft(storage) { try { storage?.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } }

/** Файл world.edits.js для вставки в репозиторий. */
export function exportEditsFile(edits) {
  const json = JSON.stringify(edits, null, 1).replace(/\n\s+/g, (m) => (m.length > 2 ? '\n ' : m));
  return `// Правки карты, сделанные в редакторе (?edit → «Скачать»). Заменяйте файл целиком.\n// props: { id: { x, y, f, s } | null } — сдвиг/зеркало/масштаб, null — удалён; add — добавленные; pos — интерактивные объекты и враги.\n// roads / waters / cols: { id: полное описание | null } — дороги, вода и стены (коллизии), изменённые, новые или удалённые.\nexport const EDITS = ${JSON.stringify(edits)};\n`;
}

/**
 * Что показывать в игре: committed (world.edits.js) или черновик редактора.
 * useDraft — режим ?edit или ?draft: берём черновик из localStorage, если он есть.
 */
export function resolveMap({ storage = null, useDraft = false } = {}) {
  const draft = useDraft ? loadDraft(storage) : null;
  const edits = draft || EDITS;
  return { base: PROPS, edits, props: applyEdits(PROPS, edits), pos: edits.pos || {}, ...applyTerrainEdits(edits), fromDraft: !!draft };
}
