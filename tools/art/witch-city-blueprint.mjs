import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDINGS, CITY_RECT, CITY_ROOMS, CITY_PORTALS, CITY_POSITIONS, CITY_SPOTS, CITY_CANAL, CITY_LAYOUT_VERSION, cityMapData } from '../../src/config/city.plan.js';
import { INTERACTIVES, ENEMY_SPAWNS } from '../../src/config/world.layout.js';
import { resolveMap, applyPos } from '../../src/world/mapData.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'docs/design/city-witch-v1');
await fs.mkdir(output, { recursive: true });
const colors = {
  north_bay: ['#774b65', '#d4ad84', 'винная', 'абрикосовый'],
  north_workshop: ['#9b5948', '#c8b27b', 'терракотовая', 'охристый'],
  cellar: ['#406c69', '#a0ae88', 'сине-зелёная', 'шалфейный'],
  rescue: ['#754752', '#ddd1ae', 'бордовая', 'кремовый'],
  archive: ['#685074', '#a8b28e', 'сливовая', 'шалфейный'],
  society: ['#3f676f', '#a7b7b4', 'петролевая', 'серо-голубой'],
  bank: ['#4d607c', '#bdb6c5', 'сланцево-синяя', 'светло-лавандовый'],
  duel: ['#6b507e', '#bf967d', 'тёмно-фиолетовая', 'тёплый кирпич'],
  coven: ['#805058', '#cdb885', 'винная', 'светлая охра'],
  warehouse_a: ['#50694d', '#c5b893', 'мохово-зелёная', 'песочный'],
  warehouse_b: ['#506774', '#c39b81', 'сине-серая', 'приглушённая терракота'],
  lab: ['#615769', '#a9aa8c', 'дымчато-сливовая', 'серо-оливковый'],
};
const local = p => ({ x: p.x - CITY_RECT.x, y: p.y - CITY_RECT.y });
const inCity = p => p.x >= CITY_RECT.x && p.x <= CITY_RECT.x + CITY_RECT.w && p.y >= CITY_RECT.y && p.y <= CITY_RECT.y + CITY_RECT.h;
const map = resolveMap();
const objects = applyPos(INTERACTIVES, map.pos);
const enemies = applyPos(ENEMY_SPAWNS, map.pos);
const select = o => ({ ...o, mapPosition: inCity(o) ? local(o) : null });
const buildings = BUILDINGS.map((b, i) => ({
  ...b, number: i + 1, mapPosition: local(b), mapDoor: local(b.door),
  palette: { roof: colors[b.id][0], facade: colors[b.id][1], roofName: colors[b.id][2], facadeName: colors[b.id][3] },
  roomId: CITY_ROOMS.find(r => r.entrances.includes('door_' + b.id))?.id || null,
  clearApproach: { radius: 110, returnOffsetY: 100 },
  exteriorTexture: 'city_final_' + b.id + '_exterior',
}));
const data = {
  schema: 'witch-city-art-handoff-v1',
  status: 'approved-style-production-art; walkable town plan v' + CITY_LAYOUT_VERSION + ' integrated in runtime v0.37.0',
  places: Object.fromEntries(Object.entries(CITY_SPOTS).map(([k, p]) => [k, local(p)])),
  coordinateAuthority: 'src/config/city.plan.js; generated overview is an art reference, not collision geometry',
  worldRect: CITY_RECT, overviewViewBox: { x: 0, y: 0, w: CITY_RECT.w, h: CITY_RECT.h },
  style: 'Разноцветный ведьминский город; палитра Леса Мирры; ровные улицы с плавными поворотами',
  buildings, rooms: CITY_ROOMS, portals: CITY_PORTALS,
  roads: cityMapData().roads,
  interactives: objects.filter(o => inCity(o) || CITY_ROOMS.some(r => o.x >= r.rect.x && o.x <= r.rect.x + r.rect.w && o.y >= r.rect.y && o.y <= r.rect.y + r.rect.h)).map(select),
  enemies: enemies.filter(o => inCity(o) || CITY_ROOMS.some(r => o.x >= r.rect.x && o.x <= r.rect.x + r.rect.w && o.y >= r.rect.y && o.y <= r.rect.y + r.rect.h)).map(select),
  dynamicExteriorIds: ['frost_barrier', 'fq_water', 'ice_construct', 'fq_cellar', 'fq_door', 'fq_cauldron', 'plaza_trace', 'plaza_debris', 'lab_seal', 'final_debris', 'final_ice_wall', 'final_rift', 'final_ward', 'sapphire_city_cache_1', 'sapphire_city_cache_2'],
  artFiles: { overview: 'city-overview.png', northFacades: 'city-facades-north.png', southFacades: 'city-facades-south.png' },
};
await fs.writeFile(path.join(output, 'city-layout.json'), JSON.stringify(data, null, 2) + '\n');
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const plan = cityMapData();
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${CITY_RECT.w}" height="${CITY_RECT.h}" viewBox="0 0 ${CITY_RECT.w} ${CITY_RECT.h}">`,
  '<rect width="100%" height="100%" fill="#6d7b57"/>'];
for (const c of plan.colliders.filter(c => c.kind === 'trees')) { const p = local(c); svg.push(`<rect x="${p.x}" y="${p.y}" width="${c.w}" height="${c.h}" fill="#344333"/>`); }
const canal = CITY_CANAL.pts.map(([x, y]) => local({ x, y }));
svg.push(`<rect x="${canal[0].x}" y="${canal[0].y - CITY_CANAL.half}" width="${canal[1].x - canal[0].x}" height="${CITY_CANAL.half * 2}" fill="#3f6b70" stroke="#c3b694" stroke-width="10"/>`);
for (const r of plan.roads) {
  const points = r.pts.map(([x,y]) => `${x-CITY_RECT.x},${y-CITY_RECT.y}`).join(' ');
  svg.push(`<polyline points="${points}" stroke="#aea085" stroke-width="${r.w+14}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  svg.push(`<polyline points="${points}" stroke="${r.kind==='dirt'?'#867554':'#d7c8a6'}" stroke-width="${r.w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
}
for (const c of plan.colliders.filter(c => c.kind === 'citywall' || c.kind === 'fence')) {
  const p=local(c); svg.push(`<rect x="${p.x}" y="${p.y}" width="${c.w}" height="${Math.max(c.h, 10)}" fill="${c.kind === 'fence' ? '#3a3238' : '#cfc3a3'}" stroke="#524d3c" stroke-width="3"/>`);
}
for (const b of buildings) {
  const p=b.mapPosition, d=b.mapDoor;
  svg.push(`<rect x="${p.x}" y="${p.y}" width="${b.w}" height="${b.h}" rx="12" fill="${b.palette.facade}" stroke="#28271f" stroke-width="5"/>`);
  svg.push(`<rect x="${p.x+8}" y="${p.y+8}" width="${b.w-16}" height="${b.h*0.48}" rx="10" fill="${b.palette.roof}"/>`);
  svg.push(`<text x="${p.x+b.w/2}" y="${p.y+66}" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="bold" fill="#fff4d5">${b.number}. ${esc(b.id)}</text>`);
  svg.push(`<circle cx="${d.x}" cy="${d.y+28}" r="24" fill="#f9df97" stroke="#362820" stroke-width="5"/>`);
}
for (const id of ['frost_barrier','fq_water','lab_seal']) {
  const o=CITY_POSITIONS[id],p=local(o),w=o.collide?.w||110;
  svg.push(`<rect x="${p.x-w/2}" y="${p.y-26}" width="${w}" height="30" fill="#a3d8df" stroke="#426976" stroke-width="3"/>`);
  svg.push(`<text x="${p.x}" y="${p.y-36}" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#eafcff">${({frost_barrier:'ICE WALL ON THE BRIDGE',fq_water:'FLOODED PASSAGE',lab_seal:'LAB SEAL'})[id]}</text>`);
}
const fountain = plan.colliders.find(c => c.id === 'city_plan_fountain'), f = local({ x: fountain.x + fountain.w / 2, y: fountain.y + fountain.h / 2 });
svg.push(`<circle cx="${f.x}" cy="${f.y}" r="64" fill="#66b9bc" stroke="#ebd7ab" stroke-width="12"/>`);
const placeNames = { road: 'ROAD', gate: 'GATE · WAREHOUSES', market: 'MARKET', square: 'SQUARE', garden: 'GARDEN', bridgeSouth: 'EMBANKMENT', quarter: 'FROZEN QUARTER', yard: 'NORTHERN YARD', labTrail: 'LAB TRAIL' };
for (const [k, label] of Object.entries(placeNames)) { const p = local(CITY_SPOTS[k]); svg.push(`<text x="${p.x + 60}" y="${p.y}" font-family="sans-serif" font-size="30" font-weight="bold" fill="#2b2420" stroke="#f4e4ba" stroke-width="6" paint-order="stroke">${label}</text>`); }
svg.push('</svg>');
await fs.writeFile(path.join(output, 'city-blueprint.svg'), svg.join('\n'));
const rows=buildings.map(b=>`| ${b.number} | ${b.name} | \`${b.id}\` | ${b.palette.roofName} / ${b.palette.facadeName} | ${b.roomId ? '\`'+b.roomId+'\`' : 'Декоративный жилой дом'} |`).join('\n');
const doc=`# Полный город: разноцветный ведьминский стиль\n\nВыбран Димой 10 октября 2026 года: ведьминская архитектура третьего варианта, разноцветные крыши и фасады, приглушённая палитра Леса Мирры. Масштаб домов сохранён; с v0.37.0 город — прогулочный план v4 (асимметричные группы домов вдоль плавной главной улицы).\n\n## Состав\n\n| № | Здание | ID | Крыша / фасад | Помещение |\n| --- | --- | --- | --- | --- |\n${rows}\n\n## Графика и координаты\n\nПолный обзор показывает художественный облик. Точные координаты, входы и ограничения лежат в city-layout.json, экспортированы из city.plan.js. city-blueprint.svg — точная схема текущей расстановки. Атласы фасадов предназначены для последующего разделения на игровые кадры; обводка, пропорции, цвета и общий вид едины.\n\nИзображения не заменяют геометрию столкновений. Готовность к игровому использованию требует привязки спрайтов к существующим дверям, проверки прозрачных полей и размеров кадров, затем проверки движения и всех сюжетных переходов в браузере. В этом этапе меняется художественный пакет; игровые события и серверные правила не изменяются.\n\n## Квестовые ограничения\n\n- Основная цепочка главы II содержит 15 квестов. Все существующие ID объектов, врагов, событий и помещений сохраняются.\n- Ледяная преграда frost_barrier перекрывает единственный вход в северный квартал до ch2_quarter_open. Ограды по обеим сторонам продолжаются до внешней стены, обход отсутствует.\n- Затопленный пролом fq_water отделяет тренировочный двор. Проход открывается после ch2_water_frozen; декоративная дорожка не создаёт обход.\n- Двери cellar и rescue открываются после соответствующего спасения жителей. Рядом остаются места для ящиков, противников, обледеневшей двери и котла.\n- Два входа warehouse_a и warehouse_b ведут в одно помещение city_warehouse. Груз, оборудование и бои остаются внутри него.\n- Тайная лаборатория остаётся за западной стеной у боковой тропы. lab_seal и ch2_lab_open управляют доступом.\n- Финальные препятствия у Дуэльного зала и рынка, повреждённый резервуар, Астральный барьер, Нэрис и финальные враги — отдельные изменяемые слои.\n- Фонтан имеет обычное и замёрзшее состояние, которое меняет игра.\n- Иней, враги, NPC, тайники, сундуки, ящики, котлы, квестовые следы и перекрывающий лёд не запекаются в статичный фон или фасады.\n- Документ Архива, лабораторный журнал и письма Северина сохраняют свои столы, радиусы подхода и отдельные интерактивные спрайты.\n- Перед каждой дверью оставляется свободная площадка. Декоративные клумбы, ограды и вывески располагаются вне подходов и радиусов квестовых объектов.\n\n## Улицы и атмосфера\n\nОсновная улица состоит из ровных участков с широкими плавными поворотами. Поперечные улицы имеют постоянную ширину, округлённые углы и аккуратные бордюры. Центральная площадь — небольшое расширение улицы с фонтаном сбоку, доской поручений и скамьями; зелень содержится в двориках, палисадниках и посадочных лунках. Общие материалы: тёплый камень, дерево, железо, состаренная медь; свет окон янтарный. Дома различаются цветом и силуэтом, но используют один уровень детализации и единые контуры.\n\n## Проверка основы\n\nДля исходной компактной расстановки применяются tests/city-layout-test.mjs и tests/chapter2-test.mjs: доступность всех подходов и комнат, отсутствие обхода сюжетных барьеров, сохранение событий главы II. Эти проверки относятся к координатной основе; художественные изображения требуют отдельной проверки после интеграции.\n`;
// Preserve the reviewed art notes when regenerating coordinates.
try {
  await fs.writeFile(path.join(output, 'city-art-handoff.md'), doc, { flag: 'wx' });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
console.log(JSON.stringify({output, buildings:buildings.length, rooms:CITY_ROOMS.length, interactives:data.interactives.length, enemies:data.enemies.length}));
