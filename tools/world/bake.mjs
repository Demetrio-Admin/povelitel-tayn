// Генерирует начальную расстановку мира → src/config/world.props.js.
//   node tools/world/bake.mjs
// ВНИМАНИЕ: перезаписывает world.props.js. Ручные правки живут в world.edits.js (редактор ?edit)
// и после перегенерации могут «съехать». Запускайте, только если меняете сами правила генерации.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WORLD, ZONES, COLLIDERS, DECOR, INTERACTIVES, ENEMY_SPAWNS, KEEP_CLEAR } from '../../src/config/world.layout.js';
import { ROADS, WATERS } from '../../src/config/world.terrain.js';
import { buildTerrain } from '../../src/world/terrain.js';
import { generateProps } from '../../src/world/generate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const terrain = buildTerrain({ ROADS, WATERS });
const props = generateProps({ WORLD, ZONES, COLLIDERS, DECOR, INTERACTIVES, ENEMY_SPAWNS, KEEP_CLEAR, terrain });
const body = props.map(p => '  ' + JSON.stringify(p)).join(',\n');
const out = `// Расстановка мира (деревья, кусты, камни, грибы, цветы, фонари…). Создано tools/world/bake.mjs.
// Поля: id, k — ключ текстуры, x/y — точка основания, f — зеркало, s — масштаб,
// fill — лес-заполнитель (коллизию даёт большой блок), l — слой (back | front), light — радиус свечения.
// Не правьте вручную: двигайте объекты в редакторе (?edit) — правки сохраняются в world.edits.js.
export const PROPS = [
${body},
];
`;
fs.writeFileSync(path.join(ROOT, 'src/config/world.props.js'), out);
const stats = {};
for (const p of props) { const g = p.id[0]; stats[g] = (stats[g] || 0) + 1; }
console.log('props', props.length, stats);
