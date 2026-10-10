// v0.37.0: environment between the facades of the walkable town (tools/art/city-walk-art.py).
// Lawn and wall textures tile; props use the bottom-centre pivot like every world sprite.
const sizes = {
  wall_post: [44, 95],
  tree_sage: [96, 148], tree_amber: [96, 148], tree_plum: [90, 150],
  hedge: [116, 63], flowerbed: [124, 67], herbbed: [124, 67], planter: [80, 63],
  woodpile: [104, 69], cart: [132, 97], dummy: [58, 100], sacks: [80, 58],
};
const tiles = ['lawn', 'wall_face', 'wall_top', 'fence_iron', 'fence_wood'];
export const CITY_WALK_FILES = Object.fromEntries([...tiles, ...Object.keys(sizes)].map(k =>
  ['city_walk_' + k, 'assets/city-walk/' + k + '.webp?v=walk-20261010']));
export const CITY_WALK_SIZES = Object.fromEntries(Object.entries(sizes).map(([k, v]) => ['city_walk_' + k, v]));
