import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';

const output = resolve(process.argv[2]);
const preview = resolve(process.argv[3]);
const site = new URL('https://demetrio-admin.github.io/povelitel-tayn/');
const pages = new Map();
const fetched = new Map();
const seen = new Set();
const queue = [];
const types = /\.((?:html|js|css|json|woff2?|ttf|wasm|svg|webp|png|jpe?g|ico|mp3|ogg|webmanifest))$/i;
const hashed = /[-.][\w-]{8}\.(?:js|css|woff2?|ttf|wasm|svg|webp|png|jpg|ogg|mp3|json)$/i;

async function collectHtml(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await collectHtml(path);
    else if (entry.name.endsWith('.html')) {
      const rel = relative(output, path).split(sep).join('/');
      pages.set(new URL(rel, site).href, rel);
    }
  }
}

function enqueue(value, from, required = true) {
  if (!value || /^(?:data|blob|mailto|tel):/i.test(value)) return;
  const url = new URL(value, from);
  if (url.origin !== site.origin || !url.pathname.startsWith(site.pathname) || !types.test(url.pathname)) return;
  url.search = '';
  url.hash = '';
  if (!seen.has(url.href)) {
    seen.add(url.href);
    queue.push({ url, required });
  }
}

function references(body, url) {
  const ext = extname(url.pathname);
  if (ext === '.html') {
    for (const tag of body.matchAll(/<(?:script|link|img|source)\b[^<>]*?\b(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)')[^<>]*>/gi)) {
      enqueue(tag[1] ?? tag[2], url);
    }
  }
  if (ext === '.css') {
    for (const ref of body.matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi)) enqueue(ref[2], url);
  }
  if (ext === '.js' || ext === '.css') {
    for (const ref of body.matchAll(/(['"])((?:\.\.?\/|\/)[\w./@-]+\.(?:js|css|woff2?|ttf|wasm|svg|webp|png|jpg|ogg|mp3|json))\1/g)) {
      if (hashed.test(ref[2])) enqueue(ref[2], url);
    }
  }
}

async function fetchFile({ url, required }) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    if (!required && response.status === 404) return;
    throw new Error('Published file returned HTTP ' + response.status + ': ' + url.pathname);
  }
  const ext = extname(url.pathname);
  const mime = response.headers.get('content-type') ?? '';
  if (ext === '.html' && !mime.includes('text/html')) throw new Error('Expected an HTML page: ' + url.pathname);
  if (ext !== '.html' && mime.includes('text/html')) throw new Error('Asset resolved to a web page: ' + url.pathname);
  const body = Buffer.from(await response.arrayBuffer());
  const rel = decodeURIComponent(url.pathname.slice(site.pathname.length));
  if (rel.startsWith('v2/')) throw new Error('Unexpected reference to the playtest directory in the live release');
  const file = resolve(output, rel);
  if (!file.startsWith(output + sep)) throw new Error('Published file path left the site root');
  fetched.set(file, body);
  if (['.html', '.js', '.css'].includes(ext)) references(body.toString('utf8'), url);
}

await collectHtml(output);
if (pages.size < 2 || !pages.has(new URL('index.html', site).href) || !pages.has(new URL('admin.html', site).href)) {
  throw new Error('Production build did not include the expected entry points');
}
for (const url of pages.keys()) enqueue(url, site);
while (queue.length) {
  const batch = queue.splice(0, 10);
  await Promise.all(batch.map(fetchFile));
}
for (const [file, body] of fetched) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
}
console.log('Preserved ' + pages.size + ' published HTML entry points and their referenced assets (' + fetched.size + ' files total).');

const html = await readFile(preview, 'utf8');
if (!html.includes('<title>Погасший очаг · Колдовство</title>') || !html.includes('const previewImages')) throw new Error('Playtest page is missing');
const target = resolve(output, 'v2/index.html');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, html.replace('</head>', '<meta name="playtest-commit" content="' + process.env.GITHUB_SHA + '"></head>'));
