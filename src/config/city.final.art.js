// Production sprites, derived from the approved house and spacious town concepts.
// World sprites use the bottom centre as their pivot; floor tiles stay walkable.
const sizes = {
  bank_exterior: [500, 460], archive_exterior: [540, 490],
  paving: [224, 224], wood_floor: [276, 276],
  bank_counter: [440, 147], archive_shelf: [220, 200], archive_desk: [260, 130],
  bank_wall: [672, 224], archive_wall: [852, 284],
  bench: [160, 80], fountain: [210, 200], fountain_frozen: [210, 200],
  bank_rug: [360, 250], archive_rug: [410, 290],
};
export const CITY_FINAL_FILES = Object.fromEntries(Object.keys(sizes).map(k =>
  ['city_final_' + k, 'assets/city-final/' + k + '-v1.webp']));
export const CITY_FINAL_SIZES = Object.fromEntries(Object.entries(sizes).map(([k,v]) => ['city_final_' + k,v]));
