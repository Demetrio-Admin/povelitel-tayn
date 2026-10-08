// Проверка готовой (боевой) сборки: сборщик не должен вырезать то, что игра делает по нажатию.
// Однажды Rollup счёл slot.id всегда null и оставил у кнопок даров пустую функцию — в игре они молчали, а тесты на dev-сборке проходили.
//   npm run build && node tools/check-bundle.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = 'dist/assets';
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^index-.*\.js$/.test(f)) : [];
let failed = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { failed++; console.log('  ✗', m); } };
ok(files.length > 0, 'есть собранный index-*.js (сначала npm run build)');
// The administration entry shares cloud/config modules with the game. Check
// only scripts and preloaded JS actually referenced by the game's HTML.
const html = fs.readFileSync('dist/index.html', 'utf8');
const gameFiles = [...new Set([...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map(m => m[1]))];
const js = gameFiles.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

// 1) кнопки даров: после сборки нажатие должно отправлять команду дара
const i = js.indexOf('buildBottomBar(){');
const seg = i >= 0 ? js.slice(i, js.indexOf('dockIds(){', i)) : '';
ok(seg.length > 0 && !/\(\)=>\{\}\)/.test(seg), 'кнопки даров: в сборке у них не пустая функция нажатия');
ok(/pressDock\([A-Za-z_$]+\)\{[^}]*ABILITY_USE/.test(js), 'нажатие дара (pressDock) отправляет ABILITY_USE');
// 2) сумка и контекстная кнопка не вырезаны
ok(/OPEN_BAG/.test(seg), 'кнопка «Сумка»: нажатие на месте');
// 4) живой мир (v0.28.0): рябь, качание, птицы не вырезаны
ok(/updateSway\(/.test(js) && /flyBird\(\)\{/.test(js) && /spawnRipple\(/.test(js) && /life_bird_1/.test(js), 'живой мир: качание, рябь и птицы остались в сборке');
// 5) рейтинг (v0.29.0): пункт меню открывает окно, окно просит таблицы, знак «в игре» подаётся
ok(/openRating\(/.test(js) && /ratings_board/.test(js) && /online_players/.test(js) && /presence_ping/.test(js), 'рейтинг: окно, таблицы, «Онлайн» и знак присутствия остались в сборке');
ok(/id:"rating",label:"Рейтинг"[^}]*\}/.test(js) && !/id:"rating",label:"Рейтинг"[^}]*stub/.test(js), 'пункт меню «Рейтинг» — не заглушка');

console.log(failed ? '\n✗ Сборка: провал' : '\n✓ Сборка: нажатия на месте');
process.exit(failed ? 1 : 0);
