// First interior pass: a working storehouse, with a warm keeper's corner.
// Existing game sprites; coordinates are local and furniture keeps physical footprints.
export function dressWarehouseA({ furniture, roomProp }) {
  const key = 'warehouse_a';
  roomProp(key, 'back_wall', 'city_final_warehouse_wall', 360, 164,
    { l: 'back', w: 672, h: 140 });
  furniture(key, 'warehouse_a_stove', 75, 280, 90, 36, 'city_final_home_stove',
    { editorStyle: { w: 110, h: 178 } });
  furniture(key, 'warehouse_a_desk', 430, 275, 190, 40, 'city_archive_desk',
    { editorStyle: { w: 210, h: 140 } });
  roomProp(key, 'keeper_bench', 'city_final_bench', 250, 300,
    { w: 140, h: 70, solid: { w: 130, h: 24 } });
  roomProp(key, 'stove_wood', 'city_walk_woodpile', 80, 380,
    { w: 90, h: 65, solid: { w: 80, h: 24 } });
  roomProp(key, 'keeper_mat', 'city_final_bank_rug', 290, 440,
    { l: 'room-floor', w: 220, h: 150, tint: 0xc5ad8c });
  roomProp(key, 'desk_lamp', 'candle_group_01', 574, 255,
    { w: 40, h: 48, light: 48 });
  // The centre stays open; supplies form short bays rather than a huge empty hall.
  for (const [id, x, y, w, h] of [
    ['west_upper', 150, 555, 160, 145], ['east_upper', 570, 580, 150, 135],
    ['west_lower', 135, 825, 130, 120], ['east_lower', 575, 835, 160, 145],
  ]) roomProp(key, id, 'city_crate', x, y, { w, h, solid: { w: w - 16, h: 38 } });
  for (const [id, x, y] of [['west', 82, 690], ['east', 640, 705]])
    roomProp(key, 'barrel_' + id, 'city_barrel', x, y,
      { w: 70, h: 100, solid: { w: 60, h: 34 } });
  roomProp(key, 'sacks', 'city_walk_sacks', 215, 765,
    { w: 110, h: 90, solid: { w: 90, h: 28 } });
  roomProp(key, 'entry_supplies', 'city_walk_sacks', 625, 1010,
    { w: 90, h: 75, solid: { w: 74, h: 26 } });
  roomProp(key, 'entry_lantern', 'lantern_02', 80, 1000,
    { w: 52, h: 95, light: 55, solid: { w: 28, h: 14 } });
}
