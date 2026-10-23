// Пакеты графики (config/assets.packs.js): каждый ключ манифеста — ровно в одном пакете, все файлы существуют,
// у каждой локации есть список пакетов с core. Браузерная проверка «ничего не пропало» — tools/ui/packs-test.py.
import fs from 'node:fs';
import { ASSET_FILES } from '../src/config/assets.manifest.js';
import { CITY_WITCH_ATLASES, CITY_WITCH_SPRITES } from '../src/config/city.witch.art.js';
import { WALK_SHEET_FILES } from '../src/config/hero.walk.js';
import { LOCATIONS } from '../src/config/locations.js';
import { PACK_IDS, PACK_IMAGES, LAZY_KEYS, CORE_KEYS, packOfKey, packsForLocation } from '../src/config/assets.packs.js';

let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.log('  ✗ ' + m); } else console.log('  ✓ ' + m); };

const expected = Object.entries(ASSET_FILES).filter(([k, p]) => p && !CITY_WITCH_SPRITES[k]).map(([k]) => k);
const seen = new Map();
for (const id of PACK_IDS) for (const k of Object.keys(PACK_IMAGES[id])) seen.set(k, [...(seen.get(k) || []), id]);
ok(expected.every((k) => seen.get(k)?.length === 1), 'каждый файловый ключ манифеста — ровно в одном пакете');
ok(Object.keys(CITY_WITCH_ATLASES).every((k) => PACK_IMAGES.city[k]), 'атласы фасадов города — в пакете city');
ok(Object.keys(WALK_SHEET_FILES).every((k) => !LAZY_KEYS.has(k)), 'листы ходьбы героев не отложены (грузятся в core как spritesheet)');

const missing = [];
for (const id of PACK_IDS) for (const [k, p] of Object.entries(PACK_IMAGES[id])) if (!fs.existsSync(`public/${p.split('?')[0]}`)) missing.push(`${k} → ${p}`);
ok(!missing.length, `все файлы пакетов лежат на диске${missing.length ? ': ' + missing.slice(0, 5).join('; ') : ''}`);

ok([...CORE_KEYS].every((k) => packOfKey(k, ASSET_FILES[k]) === 'core'), 'CORE_KEYS действительно в core');
ok(/^(icon|portrait|npc|companion|enemy)_/.test('icon_x') && packOfKey('icon_x', 'assets/chapter2/x.webp') === 'core', 'иконка из папки главы остаётся в core');
ok(packOfKey('whatever', 'assets/new-folder/x.webp') === 'core', 'неизвестная папка → core');

for (const loc of LOCATIONS) {
  const packs = packsForLocation(loc);
  ok(packs.includes('core') && packs.every((p) => PACK_IDS.includes(p)), `локация ${loc.id}: пакеты ${packs.join('+')}`);
}
ok(packsForLocation({ id: 'city_bank', parent: 'city' }).includes('city'), 'комната города берёт пакет города');
ok(packsForLocation({ id: 'unknown' }).length === PACK_IDS.length, 'неизвестная локация — все пакеты');

const sizeOf = (id) => Object.values(PACK_IMAGES[id]).reduce((n, p) => { try { return n + fs.statSync(`public/${p.split('?')[0]}`).size; } catch { return n; } }, 0);
const mb = (b) => (b / 1048576).toFixed(1);
console.log('  размеры пакетов, МБ:', PACK_IDS.map((id) => `${id} ${mb(sizeOf(id))}`).join(', '));
ok(sizeOf('core') < 8 * 1048576, 'core остаётся лёгким (< 8 МБ): на старте лесу не нужен город');

console.log(failed ? `\nПровалено: ${failed}` : '\n✓ Пакеты графики: всё в порядке');
process.exit(failed ? 1 : 0);
