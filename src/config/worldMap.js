// Logical coordinates on the 4:5 painted map, separate from playable world coordinates.
export const WORLD_MAP = { width: 584, height: 730 };
export const WORLD_MAP_POINTS = {
  forest: { x: 140, y: 511 },
  city: { x: 298, y: 292 },
  grove: { x: 111, y: 175 },
  frostwood: { x: 479, y: 102 },
  graveyard: { x: 479, y: 569 },
};
export const WORLD_MAP_FILES = {
  world_map_01: 'assets/world-map/world-map-v2.webp',
  map_current_ribbon: 'assets/world-map/current-ribbon-v2.webp',
  ...Object.fromEntries(Object.keys(WORLD_MAP_POINTS).map(id =>
    [`map_marker_${id}`, `assets/world-map/marker-${id}-v2.webp`])),
};
