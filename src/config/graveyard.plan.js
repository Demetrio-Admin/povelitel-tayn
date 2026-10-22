// The supplied painting is the production map. Coordinates below use its original
// 941 × 1672 canvas; one uniform scale preserves the approved proportions.
export const GRAVEYARD_ART = { key: 'graveyard_painted', width: 941, height: 1672 };
export const GRAVEYARD_RECT = { x: 3750, y: 2675, w: 1500, h: 1500 * 1672 / 941 };
export const graveyardPoint = (x, y) => ({
  x: GRAVEYARD_RECT.x + x * GRAVEYARD_RECT.w / GRAVEYARD_ART.width,
  y: GRAVEYARD_RECT.y + y * GRAVEYARD_RECT.h / GRAVEYARD_ART.height,
});
export const GRAVEYARD_ARRIVAL = graveyardPoint(400, 1490);

// Place existing live objects beside the paths, never inside painted graves.
// IDs, rewards, guard relationships and respawn timers remain server compatible.
export const GRAVEYARD_POSITIONS = Object.fromEntries(Object.entries({
  exit_graveyard: [350, 1535],
  gy_dust_1: [480, 1190], gy_mush_1: [480, 1010],
  gy_dust_2: [500, 790], gy_mush_2: [490, 530],
  gy_shard_1: [640, 425], gy_cache: [625, 220],
  gy_wisp_1: [480, 1230], gy_hound_1: [440, 1040],
  gy_wisp_2: [480, 760], gy_hound_2: [550, 445],
  gy_warden: [555, 285],
}).map(([id, p]) => [id, graveyardPoint(...p)]));

// Left/right edges of the winding stone path, traced on the reference. Short
// horizontal strips block the graves/trees without invisible straight row walls.
const PATH_EDGES = [
  [180, 510, 640], [230, 460, 680], [280, 475, 650],
  [330, 470, 610], [380, 515, 640], [430, 500, 660],
  [480, 465, 640], [530, 440, 585], [580, 420, 550],
  [630, 405, 540], [680, 390, 520], [730, 400, 525],
  [780, 420, 545], [830, 445, 575], [880, 460, 600],
  [930, 465, 605], [980, 425, 575], [1030, 385, 530],
  [1080, 375, 510], [1130, 385, 520], [1180, 415, 555],
  [1230, 440, 560], [1280, 410, 545], [1330, 365, 520],
  [1380, 365, 520], [1430, 335, 520], [1480, 320, 495],
  [1530, 300, 465], [1580, 280, 450], [1630, 270, 445],
  [1672, 270, 450],
];
const edgeAt = y => {
  const i = PATH_EDGES.findIndex(p => p[0] >= y);
  if (i <= 0) return PATH_EDGES[0].slice(1);
  const a = PATH_EDGES[i - 1], b = PATH_EDGES[i], t = (y - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
};

export function graveyardMapData() {
  const colliders = [];
  const box = (id, x, y, w, h) => colliders.push({ id: 'graveyard_' + id,
    kind: 'painted_obstacle', ...graveyardPoint(x, y),
    w: w * GRAVEYARD_RECT.w / 941, h: h * GRAVEYARD_RECT.h / 1672 });
  box('chapel', 0, 0, 941, 180);
  // Also close the coordinate island for whole-world navigation/editor checks;
  // the visible path meets the lower camera edge, never a neighbouring region.
  box('south_boundary', 0, 1660, 941, 12);
  for (let y = 180; y < 1672; y += 12) {
    const h = Math.min(12, 1672 - y);
    const a = edgeAt(y), b = edgeAt(y + h);
    // The intersection of both row ends stays on the visible path.
    const left = Math.max(a[0], b[0]), right = Math.min(a[1], b[1]);
    box('west_' + y, 0, y, left, h);
    box('east_' + y, right, y, 941 - right, h);
  }
  return { colliders, grounds: [{ id: 'graveyard_painting', tex: GRAVEYARD_ART.key,
    ...GRAVEYARD_RECT, plate: true }] };
}

/** Old map data retains its indices so unrelated editor c<number> IDs never move. */
export const legacyGraveyardPoint = p => p.x >= 3600 && p.x < 5400 && p.y >= 2650 && p.y < 5400;
export function withoutLegacyGraveyard(c) {
  if (c.x < 3600 || c.x >= 5400 || c.y >= 5400 || c.y + c.h <= 2650) return c;
  // These two outer borders lie beyond the new painting and still isolate the
  // expedition island in the full-world editor/navigation grid.
  if (c.kind === 'trees' && c.w === 100 && (c.x === 3600 || c.x === 5300)) return c;
  return c.y < 2650 ? { ...c, h: 2650 - c.y } : null;
}
