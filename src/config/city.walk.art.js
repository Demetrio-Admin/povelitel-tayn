// Approved blend: fresh sage/teal/plum palette with cozy inhabited gardens.
// Lawn and wall textures tile; props use the bottom-centre pivot like every world sprite.
const sizes = {
  wall_post: [44, 95],
  tree_sage: [114, 160], tree_amber: [114, 160], tree_plum: [108, 160],
  hedge: [116, 63], flowerbed: [124, 67], herbbed: [124, 67], planter: [80, 63],
  woodpile: [104, 69], cart: [132, 97], dummy: [58, 100], sacks: [80, 58],
  pumpkins: [110, 64], porch_pots: [90, 75], lamp: [52, 142],
};
const tiles = ['lawn', 'paving', 'wall_face', 'wall_top', 'fence_iron', 'fence_wood'];
export const CITY_WALK_FILES = Object.fromEntries([...tiles, ...Object.keys(sizes)].map(k =>
  ['city_walk_' + k, 'assets/city-cozy/' + k + '.webp?v=cozy-20261010']));
export const CITY_WALK_SIZES = Object.fromEntries(Object.entries(sizes).map(([k, v]) => ['city_walk_' + k, v]));
