// Автопрохождение маршрута в headless Chrome. См. README → «Автотест маршрута».
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/local/bin/chromium', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const p = await b.newPage(); await p.setViewport({ width: 405, height: 720 });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
p.on('console', m => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + t); else if (t.startsWith('[combat]')) console.log(t); });
p.on('requestfailed', r => errs.push('REQFAIL ' + r.url()));
p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
// BOT_HERO=warlock — тот же маршрут колдуном (v0.9.2)
await p.goto((process.env.GAME_URL || 'http://localhost:4173/') + '?reset&skipmenu' + (process.env.BOT_HERO ? '&hero=' + process.env.BOT_HERO : ''), { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 4500));
await p.addScriptTag({ content: fs.readFileSync(new URL('./bot.js', import.meta.url), 'utf8') });
if (process.env.BOT_LOSE) await p.evaluate((l) => { window.__botLose = l.split(','); }, process.env.BOT_LOSE);
const shots = null;
const log = await p.evaluate(() => window.__bot());
console.log(log.join('\n'));
console.log('---- errors ----\n' + (errs.join('\n') || 'none'));
await b.close();
