// Записывает в supabase/schema.sql функцию _game_rules() — правила крафта и сюжетных предметов из
// src/config/recipes.js и src/config/storyItems.js (то же, что читает JS-зеркало playerModel.applyAction).
// Запуск после правки рецептов/наград: node tools/sql/gen-rules.mjs  (проверка совпадения: npm run test:db → diff-test)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { serverRules } from '../../src/config/storyItems.js';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/schema.sql');
const json = JSON.stringify(serverRules());
if (json.includes('$r$')) throw new Error('rules contain $r$');
const fn = `create or replace function public._game_rules() returns jsonb language sql immutable as $r$ select '${json.replace(/'/g, "''")}'::jsonb $r$;`;
const s = fs.readFileSync(file, 'utf8');
const re = /-- @rules:begin\n[\s\S]*?-- @rules:end/;
if (!re.test(s)) throw new Error('markers not found');
fs.writeFileSync(file, s.replace(re, `-- @rules:begin\n${fn}\n-- @rules:end`));
console.log('_game_rules() обновлена:', json.length, 'символов');
