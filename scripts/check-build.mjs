import { readFile, stat } from 'node:fs/promises';

const output = 'dist/povelitel_tayn_standalone.html';
const html = await readFile(output, 'utf8');
const info = await stat(output);

if (info.size < 1_000_000) throw new Error('Standalone build looks incomplete');
if (html.includes('<link rel="stylesheet"')) throw new Error('Standalone build still references external styles');
if (html.includes('<script type="module" src=')) throw new Error('Standalone build still references external JavaScript');
if (!html.includes('data:image/png;base64,')) throw new Error('Standalone build does not contain embedded images');
if (!html.includes('<script type="module">')) throw new Error('Standalone application module was not embedded');

console.log('OK: standalone HTML contains embedded styles, JavaScript and images');
