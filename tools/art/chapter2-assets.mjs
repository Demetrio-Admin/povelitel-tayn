// Export generated production artwork, preserving alpha and aspect ratio.
// Input is a local JSON map { assetId: '/absolute/path/to/generated.png' }.
// Only technical sprite trimming, portrait framing, resampling and WebP encoding.
// node tools/art/chapter2-assets.mjs /absolute/path/sources.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const input = process.argv[2];
if (!input) throw new Error('Pass the generated artwork source map JSON.');
const sources = JSON.parse(fs.readFileSync(input, 'utf8'));
const force = process.argv.includes('--force');
const root = path.resolve(new URL('../../', import.meta.url).pathname);
const out = path.join(root, 'public/assets/chapter2');
fs.mkdirSync(out, { recursive: true });
const configPath = path.join(root, 'src/config/chapter2.art.generated.js');
const previous = fs.existsSync(configPath) ? await import(configPath + '?v=' + Date.now()) : {};
const files = { ...previous.CHAPTER2_FILES }, sizes = { ...previous.CHAPTER2_SIZES };
const provenancePath = path.join(out, 'sources.json');
const provenance = fs.existsSync(provenancePath) ? JSON.parse(fs.readFileSync(provenancePath, 'utf8')) : {};
const cast = { ilaria: 120, severin: 124, nerys: 120, merchant: 120, banker: 118, duelist: 124, rowena: 124, tikhon: 120 };
const enemies = { frost_critter: 72, frost_collector: 112, frost_collector_elite: 132, ice_guardian: 192, experimental_construct: 176,
  frost_wolf: 102, frost_alpha: 138, grave_wisp: 96, grave_hound: 112, barrow_warden: 192 };
const props = { fountain: ['city_fountain', 168], fountain_frozen: ['fountain_frozen', 168], market_stall: ['market_stall_01', 180], notice_board: ['notice_board_01', 120], city_lamp: ['city_lamp_01', 114],
  crate: ['city_crate', 72], barrel: ['city_barrel', 72], city_house: ['city_house', 300], frozen_house: ['city_frozen_house', 300],
  archive_document: ['city_archive_document', 58], lab_journal: ['city_lab_journal', 58], final_letters: ['city_letters', 54], equipment: ['city_equipment', 90],
  lab_machine: ['city_lab_machine', 138], frost_trace: ['city_frost_trace', 42], ice_wall: ['ice_wall_01', 118], ice_construct: ['ice_construct_01', 138],
  lab_door: ['city_lab_door', 154], lab_door_open: ['city_lab_door_open', 154], frozen_door: ['frozen_door_01', 126], open_door: ['city_door_open', 126],
  cellar: ['city_cellar', 64], water: ['water_patch_01', 70], ice_floor: ['ice_floor_01', 70], lab_chest: ['city_lab_chest', 68], lab_chest_open: ['city_lab_chest_open', 72],
  ward: ['astral_ward_01', 134], coolant: ['city_coolant', 116], coolant_stable: ['city_coolant_stable', 116], debris: ['city_debris', 98],
  cache_wolf: ['city_wolf_cache', 72], cache_grave: ['city_grave_cache', 76], cache_wolf_empty: ['city_wolf_cache_empty', 72], cache_grave_empty: ['city_grave_cache_empty', 76], warehouse_front: ['city_warehouse', 240],
  frost_tree_1: ['tree_frost_01', 220], frost_tree_2: ['tree_frost_02', 220], grave_tree: ['dead_tree_grey_01', 180],
  gravestone_1: ['gravestone_01', 76], gravestone_2: ['gravestone_02', 64], crypt: ['crypt_01', 220],
  sign_archive: ['city_sign_archive', 62], sign_society: ['city_sign_society', 62], sign_duel: ['city_sign_duel', 62], sign_coven: ['city_sign_coven', 62] };
const icons = ['frost_herb', 'ice_crystal', 'frost_shard', 'cold_heart', 'potion_warm', 'potion_stable', 'potion_brittle', 'potion_guard', 'reinforced_resin', 'astral_lens', 'amulet_frost'];
const tiles = { paving: 'city_paving', paving_frost: 'city_paving_frost', city_wall: 'city_wall', city_timber: 'city_timber', wood_floor: 'city_wood_floor', snow_ground: 'snow_ground_01', grave_ground: 'grave_ground_01' };
function run(args) { return execFileSync('convert', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim(); }
function register(key, file, height) {
  const [w, h] = execFileSync('identify', ['-format', '%w %h', file], { encoding: 'utf8' }).trim().split(' ').map(Number);
  files[key] = 'assets/chapter2/' + path.basename(file);
  sizes[key] = [Math.round(height * w / h), height];
}
function sprite(id, source, key, displayHeight) {
  const file = path.join(out, id + '.webp');
  run([source, '-trim', '+repage', '-resize', '480x480>', '-define', 'webp:alpha-quality=100', '-quality', '88', file]);
  register(key, file, displayHeight);
  return file;
}
for (const [id, source] of Object.entries(sources)) {
  if (!fs.existsSync(source)) throw new Error('Missing source ' + id);
  const hash = createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  if (!force && provenance[id]?.sha256 === hash) continue;
  let output;
  if (cast[id]) {
    output = sprite(id, source, 'npc_' + id, cast[id]);
    const [w, h] = execFileSync('identify', ['-format', '%w %h', source], { encoding: 'utf8' }).trim().split(' ').map(Number);
    const side = Math.round(w * 0.64), x = Math.round(w * 0.20), y = Math.round(h * 0.025);
    const portrait = path.join(out, 'portrait_' + id + '.webp');
    run([source, '-crop', `${side}x${side}+${x}+${y}`, '+repage', '-resize', '256x256', '-quality', '90', portrait]);
    files['portrait_' + id] = 'assets/chapter2/' + path.basename(portrait);
    sizes['portrait_' + id] = [128, 128];
    if (id === 'severin') { files.enemy_severin = files.npc_severin; sizes.enemy_severin = sizes.npc_severin; }
    if (id === 'tikhon') { files.enemy_volunteer = files.npc_tikhon; sizes.enemy_volunteer = sizes.npc_tikhon; }
  } else if (id === 'resident_woman' || id === 'resident_man') {
    output = sprite(id, source, 'city_' + id, 120);
  } else if (id === 'miron') {
    output = sprite(id, source, 'city_patient_miron', 120);
    files.enemy_volunteer_miron = files.city_patient_miron;
    sizes.enemy_volunteer_miron = sizes.city_patient_miron;
  } else if (enemies[id]) output = sprite(id, source, 'enemy_' + id, enemies[id]);
  else if (props[id]) output = sprite(id, source, ...props[id]);
  else if (icons.includes(id)) {
    output = sprite(id, source, 'icon_' + id, 64);
    if (id === 'frost_herb') { files.city_frost_herb = files.icon_frost_herb; sizes.city_frost_herb = [48, 48]; }
    if (id === 'ice_crystal') { files.ice_crystal_node_01 = files.icon_ice_crystal; sizes.ice_crystal_node_01 = [70, 70]; }
  } else if (tiles[id]) {
    output = path.join(out, id + '.webp');
    run([source, '-resize', '512x512!', '-quality', '87', output]);
    files[tiles[id]] = 'assets/chapter2/' + path.basename(output);
  } else if (id.startsWith('arena_')) {
    output = path.join(out, id + '.webp');
    run([source, '-resize', '720x1280!', '-quality', '88', output]);
    files[id] = 'assets/chapter2/' + path.basename(output);
  } else throw new Error('Unknown export asset ' + id);
  provenance[id] = { source: path.basename(source), sha256: hash, output: path.basename(output), generator: 'image_gen', export: 'alpha-preserving WebP' };
  console.log(id);
}
// Fully decode every output, including files skipped by the incremental export.
// Reading only dimensions is insufficient to detect a damaged compressed payload.
for (const file of new Set(Object.values(files))) run([path.join(root, 'public', file), 'null:']);
// Paired states occupy exactly the same world rectangle: thawing cannot move a doorway or rebuild a house.
for (const [base, changed] of [['city_house', 'city_frozen_house'], ['city_fountain', 'fountain_frozen'],
  ['water_patch_01', 'ice_floor_01'], ['city_lab_door', 'city_lab_door_open'], ['frozen_door_01', 'city_door_open'], ['city_coolant', 'city_coolant_stable'],
  ['city_wolf_cache', 'city_wolf_cache_empty'], ['city_grave_cache', 'city_grave_cache_empty']]) {
  if (sizes[base] && files[changed]) sizes[changed] = [...sizes[base]];
}
fs.writeFileSync(configPath, '// Generated by tools/art/chapter2-assets.mjs. World pivots: bottom centre.\n'
  + 'export const CHAPTER2_FILES = ' + JSON.stringify(files, null, 2) + ';\n'
  + 'export const CHAPTER2_SIZES = ' + JSON.stringify(sizes, null, 2) + ';\n');
fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
console.log('Registered', Object.keys(files).length, 'texture keys.');
