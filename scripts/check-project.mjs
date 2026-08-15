import { access, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const requiredIds = ['app', 'travelScreen', 'combatScreen', 'travelParty', 'combatParty', 'continueBtn', 'confirmBtn', 'modalLayer'];
const requiredCopy = ['Адам', 'Мира', 'Гаррет', 'Эллиан', 'Продолжить путь', 'Через 1 ход: Разлом'];
const assets = ['assets/images/whispering-forest.png', 'assets/images/ritual-observatory.png'];
const styles = ['styles/buttons.css', 'styles/modals.css', 'styles/main.css'];
const scripts = [
  'scripts/data/game-data.js',
  'scripts/state/game-state.js',
  'scripts/ui/dom.js',
  'scripts/ui/buttons.js',
  'scripts/ui/templates.js',
  'scripts/ui/view.js',
  'scripts/check-build.mjs',
  'scripts/app.js'
];
const html = await readFile('index.html', 'utf8');
const projectText = [
  html,
  ...await Promise.all(styles.map(file => readFile(file, 'utf8'))),
  ...await Promise.all(scripts.map(file => readFile(file, 'utf8')))
].join('\n');

for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing required element: #${id}`);
}

for (const text of requiredCopy) {
  if (!projectText.includes(text)) throw new Error(`Missing required copy: ${text}`);
}

for (const asset of assets) {
  await access(asset);
  const info = await stat(asset);
  if (info.size < 100_000) throw new Error(`Asset looks incomplete: ${asset}`);
  if (!projectText.includes(asset) && !projectText.includes(`../${asset}`)) throw new Error(`Asset is not referenced: ${asset}`);
}

for (const style of styles) {
  await access(style);
  if (!html.includes(style)) throw new Error(`Stylesheet is not linked: ${style}`);
}

for (const script of scripts) {
  await access(script);
  const result = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`JavaScript syntax error in ${script}:\n${result.stderr}`);
}

if (!html.includes('type="module" src="scripts/app.js"')) throw new Error('Application module entry is not linked');

console.log('OK: project structure, required UI, assets and JavaScript syntax');
