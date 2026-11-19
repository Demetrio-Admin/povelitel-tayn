// Записывает в supabase/schema.sql функцию _game_rules() — правила крафта и сюжетных предметов из
// src/config/recipes.js и src/config/storyItems.js (то же, что читает JS-зеркало playerModel.applyAction).
// Запуск после правки рецептов/наград: node tools/sql/gen-rules.mjs  (проверка совпадения: npm run test:db → diff-test)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { serverRules } from '../../src/config/serverRules.js';
import { horizonRules } from './rules-config.mjs';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/schema.sql');
const json = JSON.stringify(serverRules());
if (json.includes('$r$')) throw new Error('rules contain $r$');
const fn = `create or replace function public._game_rules() returns jsonb language sql immutable as $r$ select '${json.replace(/'/g, "''")}'::jsonb $r$;`;
const s = fs.readFileSync(file, 'utf8');
const re = /-- @rules:begin\n[\s\S]*?-- @rules:end/;
if (!re.test(s)) throw new Error('markers not found');
const horizonRe = /-- @horizon-rules:begin\n[\s\S]*?-- @horizon-rules:end/;
if (!horizonRe.test(s)) throw new Error('horizon rules markers not found');
const horizonJson = JSON.stringify(horizonRules()).replace(/'/g, "''");
if (horizonJson.includes('$r$')) throw new Error('horizon rules contain $r$');
const horizonFn = `create or replace function public._horizon_rules() returns jsonb language sql immutable as $r$ select '${horizonJson}'::jsonb $r$;`;
const generated = s.replace(re, () => `-- @rules:begin\n${fn}\n-- @rules:end`)
  .replace(horizonRe, () => `-- @horizon-rules:begin\n${horizonFn}\n-- @horizon-rules:end`);
if (process.argv.includes('--check')) {
  if (s !== generated) throw new Error('_game_rules() расходится с serverRules.js. Запустите node tools/sql/gen-rules.mjs.');
  console.log('_game_rules() соответствует serverRules.js');
} else {
  fs.writeFileSync(file, generated);
  console.log('_game_rules() обновлена:', json.length, 'символов');
}
