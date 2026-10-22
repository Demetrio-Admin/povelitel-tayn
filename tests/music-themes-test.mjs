// Музыка по локациям: у города (и его комнат) и Безымянной рощи своя тема, остальные места играют лесную. Без браузера и AudioContext:
// проверяем выбор темы и что шаги тем дают ноты в разумных пределах, идут вперёд по времени и не падают.
import assert from 'node:assert/strict';
import { AudioManager, musicThemeFor } from '../src/systems/AudioManager.js';
import { LOCATIONS } from '../src/config/locations.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };

// ---- выбор темы
const by = id => LOCATIONS.find(l => l.id === id);
ok(musicThemeFor(by('forest')) === 'forest', 'лес — лесная тема');
ok(musicThemeFor(by('city')) === 'city', 'город — городская тема');
ok(musicThemeFor(by('grove')) === 'grove', 'Безымянная роща — своя тема');
ok(musicThemeFor(null) === 'forest', 'редактор карты (локации нет) — лесная');
const rooms = LOCATIONS.filter(l => l.interior && l.parent === 'city');
ok(rooms.length > 0 && rooms.every(r => musicThemeFor(r) === 'city'), `комнаты города играют музыку города (${rooms.length})`);
ok(['frostwood', 'graveyard'].every(id => musicThemeFor(by(id)) === 'forest'), 'вылазки пока играют лесную');
ok(new Set(LOCATIONS.map(musicThemeFor)).size === 3, 'в игре три прогулочные темы');

// ---- шаги тем на заглушке звука
function harness(theme) {
  const a = new AudioManager(null);
  const tones = [], noises = [];
  a.ctx = { currentTime: 0, state: 'running' }; a.unlocked = true; a.musicOut = {};
  a.tone = o => { tones.push(o); }; a.noise = o => { noises.push(o); };
  a.musicTheme = theme; a.nextNoteAt = 0; a.step = 0;
  return { a, tones, noises };
}
for (const [theme, stepFn, minLen, maxLen] of [['forest', 'ambientStep', 0.5, 1], ['city', 'cityStep', 0.25, 0.4], ['grove', 'groveStep', 1, 1.5]]) {
  const { a, tones, noises } = harness(theme);
  let bad = null;
  for (let i = 0; i < 256; i++) {   // 256 шагов: несколько кругов аккордов
    const before = a.nextNoteAt; a[stepFn](0); a.step++;
    const len = a.nextNoteAt - before;
    if (!(len >= minLen && len <= maxLen)) bad = `шаг ${i}: длина ${len}`;
  }
  ok(!bad, `${theme}: длина шага в пределах ${minLen}–${maxLen} с (${bad || 'ок'})`);
  ok(tones.length > 100, `${theme}: ноты звучат (${tones.length})`);
  ok(tones.every(t => Number.isFinite(t.f) && t.f > 25 && t.f < 8000 && t.vol > 0 && t.vol <= 0.15 && t.dur > 0), `${theme}: частоты, громкость и длительность в пределах`);
  if (theme !== 'forest') ok(tones.every(t => t.out === a.musicOut), `${theme}: всё идёт в музыкальную шину`);
}

// ---- город детерминирован: два прохода по 64 шага дают одну и ту же мелодию (случайны лишь редкий колокольчик и тонкая расстройка)
{
  const melody = () => { const { a, tones } = harness('city'); const out = []; for (let i = 0; i < 64; i++) { const n = tones.length; a.cityStep(0); a.step++; out.push(tones.slice(n).filter(t => t.type === 'triangle' && t.dur === 0.8).map(t => Math.round(t.f)).join()); } return out.join('|'); };
  ok(melody() === melody(), 'город: мелодия не меняется от прохода к проходу');
}

// ---- смена темы: тот же режим «прогулка», но другая локация — музыка перезапускается; боевая не трогается
{
  const a = new AudioManager(null);
  const log = [];
  a.ctx = { currentTime: 0, state: 'running', createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} }) };
  a.unlocked = true; a.musicBus = {}; a.delay = {}; a.noiseBuf = {};
  a.startWind = (vol, f) => { log.push(['wind', vol, f]); a.wind = null; };
  const realStop = a.stopMusic.bind(a); a.stopMusic = () => { log.push(['stop']); realStop(); };
  a.setMusic('explore'); assert.equal(a.musicTheme, 'forest'); checks++;
  a.setArea(by('city')); ok(a.musicTheme === 'city' && log.some(e => e[0] === 'wind' && e[2] === 380), 'при входе в город тема сменилась на городскую');
  const stops = log.filter(e => e[0] === 'stop').length;
  a.setArea(by('city')); ok(log.filter(e => e[0] === 'stop').length === stops, 'та же тема — музыка не перезапускается');
  a.setMusic('combat'); a.setArea(by('grove')); ok(a.musicTheme === 'combat', 'в бою тема локации не вмешивается');
  a.setMusic('explore'); ok(a.musicTheme === 'grove', 'после боя играет тема той локации, где герой');
  clearInterval(a.timer);
}

console.log(`✓ Музыка по локациям: города, рощи и леса (${checks} проверок).`);
