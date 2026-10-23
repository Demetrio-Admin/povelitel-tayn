// После tools/art/optimize-assets.py --apply: заменяет ссылки assets/sprites/X.png на X.webp
// там, где PNG уже заменён WebP-файлом. Динамические пути (`${key}.png`) правятся вручную.
//   node tools/art/rename-png-refs.mjs          # показать
//   node tools/art/rename-png-refs.mjs --write  # записать
import fs from 'node:fs';
import path from 'node:path';

const write = process.argv.includes('--write');
const roots = ['src', 'tests', 'tools/ui', 'tools/world', 'tools/art/render-cozy-city.mjs'];
const exts = new Set(['.js', '.mjs', '.json', '.html', '.py']);
const re = /(assets\/sprites\/[A-Za-z0-9_\-]+)\.png/g;
let changed = 0;

function visit(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const n of fs.readdirSync(p)) visit(path.join(p, n)); return; }
  if (!exts.has(path.extname(p))) return;
  const src = fs.readFileSync(p, 'utf8');
  const out = src.replace(re, (m, base) => {
    const f = `public/${base}`;
    return !fs.existsSync(`${f}.png`) && fs.existsSync(`${f}.webp`) ? `${base}.webp` : m;
  });
  if (out === src) return;
  changed++;
  console.log((write ? 'rewrite ' : 'would rewrite ') + p);
  if (write) fs.writeFileSync(p, out);
}

for (const r of roots) if (fs.existsSync(r)) visit(r);
console.log(`${changed} file(s)`);
