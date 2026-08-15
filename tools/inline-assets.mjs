import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';

const source = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const root = dirname(source);
let html = await readFile(source, 'utf8');

const styleFiles = ['styles/buttons.css', 'styles/modals.css', 'styles/main.css'];
for (const file of styleFiles) {
  const css = await readFile(join(root, file), 'utf8');
  html = html.replace(`<link rel="stylesheet" href="${file}">`, `<style>\n${css}\n</style>`);
}

for (const file of ['whispering-forest.png', 'ritual-observatory.png']) {
  const bytes = await readFile(join(root, 'assets', 'images', file));
  const data = `data:image/png;base64,${bytes.toString('base64')}`;
  html = html.replaceAll(`../assets/images/${file}`, data);
  html = html.replaceAll(`assets/images/${file}`, data);
}

const moduleFiles = [
  'scripts/data/game-data.js',
  'scripts/state/game-state.js',
  'scripts/ui/dom.js',
  'scripts/ui/buttons.js',
  'scripts/ui/templates.js',
  'scripts/ui/view.js',
  'scripts/app.js'
];
const moduleSource = (await Promise.all(moduleFiles.map(file => readFile(join(root, file), 'utf8'))))
  .map(sourceCode => sourceCode.replace(/^import .*;\r?\n/gm, '').replace(/^export\s+/gm, ''))
  .join('\n');
html = html.replace(
  '<script type="module" src="scripts/app.js"></script>',
  () => `<script type="module">\n${moduleSource}\n</script>`
);

await writeFile(output, html);
