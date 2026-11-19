import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';

const revision = process.env.GITHUB_SHA;
if (!/^[\da-f]{40}$/.test(revision || '')) throw new Error('The public preview requires a GitHub commit SHA');
const output = resolve('dist-v2-preview');
await build({
  configFile: false,
  base: './',
  build: {
    outDir: output,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: () => true,
    rollupOptions: { input: 'index.html', output: { format: 'iife', inlineDynamicImports: true } },
  },
});
const entry = resolve(output, 'index.html');
const html = await readFile(entry, 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gi)];
if (scripts.length !== 1) throw new Error('Expected one browser bundle, found ' + scripts.length);
const bundle = await readFile(resolve(dirname(entry), scripts[0][1]), 'utf8');
const styles = [...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"]+)"[^>]*>/gi)];
const css = await Promise.all(styles.map(match => readFile(resolve(dirname(entry), match[1]), 'utf8')));
const assetRoot = 'https://raw.githubusercontent.com/Demetrio-Admin/povelitel-tayn/' + revision + '/public/';
const boot = 'const publicAssets = ' + JSON.stringify(assetRoot) + ';\n'
  + 'let base = document.querySelector("base"); if (!base) { base = document.createElement("base"); document.head.prepend(base); } base.href = publicAssets;\n'
  + 'window.__horizonPreview = { revision: ' + JSON.stringify(revision) + ' };\n';
let page = html.replace(scripts[0][0], '').replace(/<link\b(?=[^>]*\brel="(?:icon|apple-touch-icon)")?[^>]*>/g, '');
page = page.replace('</head>', '<style>\n' + css.join('\n') + '\n</style>\n</head>');
page = page.replace('</body>', () => '<script>(() => {\n' + boot + bundle.replace(/<\/script/gi, '<\\/script') + '\n})();</script>\n</body>');
await writeFile('play.html', page);
console.log('Prepared original Phaser client and assets for ' + revision);
