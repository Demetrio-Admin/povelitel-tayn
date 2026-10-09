// Production sprites, derived from the approved house and spacious town concepts.
// World sprites use the bottom centre as their pivot; floor tiles stay walkable.
const sizes = {
  bank_exterior: [500, 460], archive_exterior: [540, 490],
  paving: [224, 224], wood_floor: [276, 276],
  bank_counter: [440, 147], archive_shelf: [220, 200], archive_desk: [260, 130],
  bank_wall: [672, 224], archive_wall: [852, 284],
  bench: [160, 80], fountain: [210, 200], fountain_frozen: [210, 200],
  bank_rug: [360, 250], archive_rug: [410, 290],
  society_exterior: [560, 490], lab_exterior: [380, 450],
  duel_exterior: [600, 470], coven_exterior: [560, 470],
  warehouse_a_exterior: [600, 380], warehouse_b_exterior: [560, 380],
  cellar_exterior: [540, 420], rescue_exterior: [560, 420],
  north_bay_exterior: [540, 490], north_workshop_exterior: [560, 420],
  society_wall: [852, 260], lab_wall: [912, 270], duel_wall: [1032, 300],
  coven_wall: [792, 260], warehouse_wall: [1392, 290], home_wall: [672, 240],
  stone_floor: [256, 256], duel_circle: [720, 720],
  coven_map_table: [260, 145], coven_sofa: [260, 150], home_stove: [130, 210],
};
export const CITY_FINAL_FILES = Object.fromEntries(Object.keys(sizes).map(k =>
  ['city_final_' + k, 'assets/city-final/' + k + '-v1.webp']));
export const CITY_FINAL_SIZES = Object.fromEntries(Object.entries(sizes).map(([k,v]) => ['city_final_' + k,v]));
