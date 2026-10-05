// Собирает Edge Function «combat» одним файлом: проверка боя (cloud/combatVerify.js) + движок боя + правила и баланс игры.
//   node tools/build-combat-function.mjs          — записать supabase/functions/combat/index.ts
//   node tools/build-combat-function.mjs --check  — убедиться, что файл в репозитории соответствует исходникам (для тестов)
// Supabase Dashboard принимает один файл, поэтому всё собирается esbuild-ом без внешних зависимостей. Руками index.ts не править.
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = createRequire(import.meta.url)('esbuild');   // esbuild приходит вместе с vite
const out = resolve(root, 'supabase/functions/combat/index.ts');
const HEADER = `// Edge Function «combat» (v0.14.0): сервер проверяет бой. ФАЙЛ СОБРАН АВТОМАТИЧЕСКИ: node tools/build-combat-function.mjs. Руками не править.
//
// Игра пишет действия игрока в бою, а эта функция проигрывает запись тем же движком боя с состояния героя, которое база запомнила
// в начале боя (player_action combat_start), сама решает исход и атомарно записывает итог (SQL combat_apply). Присланному «я победил» верить нельзя.
//
// Развёртывание: Supabase → Edge Functions → Deploy a new function → имя «combat» → вставить этот файл → Deploy.
// Переменные SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам. Перед включением выполните supabase/schema.sql (combat_load / combat_apply).
//
`;

const r = await build({
  entryPoints: [resolve(root, 'src/cloud/combatHandler.js')], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  write: false, legalComments: 'none', logLevel: 'error', mainFields: ['module', 'main'], treeShaking: true,
});
const code = HEADER + r.outputFiles[0].text;
if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = readFileSync(out, 'utf8'); } catch { /* нет файла */ }
  if (cur !== code) { console.error('supabase/functions/combat/index.ts устарел: node tools/build-combat-function.mjs'); process.exit(1); }
  console.log('  ✓ supabase/functions/combat/index.ts соответствует исходникам (' + Math.round(code.length / 1024) + ' КБ)');
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, code);
  console.log('записано', out, Math.round(code.length / 1024) + ' КБ');
}
