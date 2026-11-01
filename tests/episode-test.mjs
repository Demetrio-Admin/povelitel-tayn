// Эпизод «Первое пламя»: модели жара, телекинеза, направленного пламени, ритуала, боя, шагов и изоляции сохранения.
import assert from 'node:assert/strict';
import { createHeat, stepHeat, createRitual, stepRitual, createDrag, stepDrag, releaseDrag, createStream, stepStream, streamEnd, controlLevel, FIRE_CONTROL, PRACTICE_FOR_CONFIDENT } from '../src/episode/model/heat.js';
import { EpisodeBattle, MOVES, LOADOUT_SIZE, simulate, smartPolicy, spamPolicy, validLoadout } from '../src/episode/model/combat.js';
import { STEPS, freshProgress, advance, atLeast, notePractice, ritualMissing, goalLine, RITUAL_NEEDS } from '../src/episode/model/story.js';
import { isolatedStorage, PREFIX } from '../src/episode/model/storage.js';

const DT = 1 / 30;

// ---------------------------------------------------------------- жар
/** Игрок, который отпускает палец, когда стрелка доходит до точки `at` полосы. */
function play(level, task, at, { maxSec = 20 } = {}) {
  const h = createHeat(task, level);
  while (!h.result && h.time < maxSec) {
    const [lo, hi] = task.band;
    stepHeat(h, DT, h.value < lo + (hi - lo) * at);
  }
  return h;
}
const herbs = { band: [0.42, 0.66], need: 1.6, over: 0.76 };
{
  // держать не отпуская — перегрев на любой ступени
  for (let lv = 0; lv < FIRE_CONTROL.length; lv++) {
    const h = createHeat(herbs, lv); while (!h.result) stepHeat(h, DT, true);
    assert.equal(h.result, 'over', `constant hold overheats at level ${lv}`);
  }
  // аккуратный игрок справляется на любой ступени
  for (let lv = 0; lv < FIRE_CONTROL.length; lv++) assert.equal(play(lv, herbs, 0.35).result, 'done', `careful play succeeds at level ${lv}`);
  // отпустить у верхнего края: у новичка жар перескакивает за край, после урока — нет
  const peak = (lv) => { const h = createHeat(herbs, lv); let max = 0; while (h.value < herbs.band[1] - 0.02) stepHeat(h, DT, true); for (let i = 0; i < 60; i++) { stepHeat(h, DT, false); max = Math.max(max, h.value); } return max - herbs.band[1]; };
  assert.ok(peak(0) > peak(1) + 0.05, 'the lesson reduces overshoot');
  assert.ok(peak(1) >= peak(2), 'practice reduces it further');
  assert.equal(play(0, herbs, 0.95).result, 'over', 'novice releasing at the top edge overheats');
  assert.equal(play(1, herbs, 0.9).result, 'done', 'after the lesson the same timing works');
  assert.equal(controlLevel({ lesson: false, practice: 9 }), 0);
  assert.equal(controlLevel({ lesson: true, practice: PRACTICE_FOR_CONFIDENT - 1 }), 1);
  assert.equal(controlLevel({ lesson: true, practice: PRACTICE_FOR_CONFIDENT }), 2);
}

// ---------------------------------------------------------------- ритуал
{
  const r = createRitual([[0.3, 0.5], [0.5, 0.7], [0.68, 0.88]], 1.4, 1);
  let t = 0;
  while (!r.done && t < 30) { const [lo, hi] = r.bands[r.rune]; stepRitual(r, DT, r.heat.value < lo + (hi - lo) * 0.4); t += DT; }
  assert.ok(r.done && r.rune === 3, 'three runes in a row');
  const f = createRitual([[0.3, 0.5], [0.5, 0.7]], 1.4, 1);
  for (let i = 0; i < 200 && !f.flares; i++) stepRitual(f, DT, true);
  assert.equal(f.flares, 1); assert.equal(f.done, false); assert.equal(f.rune, 0, 'an overheat resets the rune, not the ritual');
}

// ---------------------------------------------------------------- телекинез
{
  const d = createDrag({ x: 0, y: 0, target: { x: 300, y: -200 }, radius: 70 });
  let mana = 100, t = 0;
  while (t < 1) { const r = stepDrag(d, DT, { x: 150, y: -100 }, mana); mana -= r.spent; t += DT; }
  releaseDrag(d);
  assert.equal(d.result, null, 'dropped halfway — not done');
  t = 0; while (t < 4) { const r = stepDrag(d, DT, { x: 300, y: -200 }, mana); mana -= r.spent; t += DT; }
  assert.ok(mana < 100, 'holding costs mana');
  releaseDrag(d); assert.equal(d.result, 'done', 'dropped in the circle');
  const heavy = createDrag({ x: 0, y: 0, weight: 'heavy', target: { x: 300, y: 0 } }), light = createDrag({ x: 0, y: 0, weight: 'light', target: { x: 300, y: 0 } });
  stepDrag(heavy, 0.2, { x: 300, y: 0 }, 100); stepDrag(light, 0.2, { x: 300, y: 0 }, 100);
  assert.ok(light.x > heavy.x, 'heavy objects lag behind the finger');
  const none = createDrag({ x: 0, y: 0, target: { x: 300, y: 0 } }); stepDrag(none, 1, { x: 300, y: 0 }, 0);
  assert.equal(none.x, 0, 'no mana — nothing moves');
}

// ---------------------------------------------------------------- направленное пламя
{
  const s = createStream([{ x: 100, y: 0 }, { x: 0, y: -300 }], { reach: 520, width: 60, need: 1 });
  const from = { x: 0, y: 0 };
  let t = 0; while (t < 1.5) { stepStream(s, DT, from, { x: 100, y: 0 }, 100); t += DT; }
  assert.equal(s.spots[0].done, true); assert.equal(s.spots[1].done, false, 'only the spot under the flame melts');
  t = 0; while (t < 1.5) { stepStream(s, DT, from, { x: 0, y: -300 }, 100); t += DT; }
  assert.equal(s.result, 'done');
  const far = streamEnd({ x: 0, y: 0 }, { x: 0, y: -2000 }, 520);
  assert.equal(Math.round(far.y), -520, 'the flame has a range');
  const idle = createStream([{ x: 100, y: 0 }], { need: 1 }); stepStream(idle, 2, from, null, 100);
  assert.equal(idle.spots[0].heat, 0, 'no finger — no flame');
}

// ---------------------------------------------------------------- бой
{
  assert.equal(LOADOUT_SIZE, 4);
  assert.ok(validLoadout(['flame', 'push', 'hold', 'ignite']));
  assert.ok(!validLoadout(['flame', 'push', 'hold', 'ignite', 'ward']), 'at most four moves');
  assert.ok(!validLoadout(['flame', 'flame']), 'no duplicates');
  assert.throws(() => new EpisodeBattle({ loadout: ['nope'] }));
  // без команд игрока герой не атакует: автоатаки нет
  const idle = new EpisodeBattle({ loadout: ['flame', 'push', 'hold', 'ignite'], seed: 3 });
  for (let i = 0; i < 300 && !idle.result; i++) idle.tick(0.05);
  assert.equal(idle.enemy.hp, idle.enemy.maxHp, 'no auto attack');
  assert.ok(idle.hero.hp < idle.hero.maxHp, 'the wolf acts on its own');
  // намерение видно заранее, Толчок сбивает прыжок
  const b = new EpisodeBattle({ loadout: ['flame', 'push', 'hold', 'ignite'], seed: 5 });
  b.enemy.state = 'windup'; b.enemy.action = 'leap'; b.enemy.timer = 1.5;
  assert.equal(b.intent().name, 'Прыжок');
  b.command('push'); for (let i = 0; i < 10; i++) b.tick(0.05);
  assert.notEqual(b.enemy.action, 'leap'); assert.equal(b.stats.interrupts, 1); assert.equal(b.hero.hp, b.hero.maxHp, 'interrupted leap deals no damage');
  // Пламя не сбивает прыжок, но растапливает дыхание
  const c = new EpisodeBattle({ loadout: ['flame', 'push', 'hold', 'ignite'], seed: 5 });
  c.enemy.state = 'windup'; c.enemy.action = 'breath'; c.enemy.timer = 1.4;
  c.command('flame'); for (let i = 0; i < 12; i++) c.tick(0.05);
  assert.equal(c.stats.interrupts, 1, 'flame melts the breath');
  // сочетания
  const hb = new EpisodeBattle({ loadout: ['flame', 'push', 'hold', 'ignite'], seed: 5 });
  hb.command('hold'); for (let i = 0; i < 8; i++) hb.tick(0.05);
  assert.ok(hb.enemy.held > 0);
  const before = hb.enemy.hp; hb.command('flame'); for (let i = 0; i < 12; i++) hb.tick(0.05);
  assert.equal(before - hb.enemy.hp, Math.round(MOVES.flame.dmg * 1.75), 'hold → flame is stronger');
  const fp = new EpisodeBattle({ loadout: ['flame', 'push', 'hold', 'ignite'], seed: 5 });
  fp.command('ignite'); for (let i = 0; i < 8; i++) fp.tick(0.05);
  assert.ok(fp.patch > 0);
  const hp0 = fp.enemy.hp; fp.command('push'); for (let i = 0; i < 8; i++) fp.tick(0.05);
  assert.equal(hp0 - fp.enemy.hp, 20, 'push into the burning brushwood'); assert.equal(fp.stats.combos, 1);
  // очередь: следующая команда исполняется после текущей
  const q = new EpisodeBattle({ loadout: ['flame', 'push', 'hold', 'throw'], seed: 9 });
  assert.equal(q.command('flame'), 'cast'); assert.equal(q.command('throw'), 'queued');
  for (let i = 0; i < 20; i++) q.tick(0.05);
  assert.equal(q.stats.commands.throw, 1); assert.equal(q.hero.queue, null);
  // нехватка маны: выход — «Собраться», удар его сбивает
  const m = new EpisodeBattle({ loadout: ['flame', 'push', 'hold', 'throw'], seed: 9 });
  m.hero.mana = 3; assert.equal(m.command('flame'), 'mana');
  m.enemy.timer = 99; assert.equal(m.command('focus'), 'cast');
  for (let i = 0; i < 40; i++) m.tick(0.05);
  assert.ok(m.hero.mana > 25, 'focus restores mana');
  const fb = new EpisodeBattle({ loadout: ['flame', 'push', 'hold', 'throw'], seed: 9 });
  fb.hero.mana = 3; fb.command('focus'); fb.hitHero(5, 'bite');
  assert.equal(fb.hero.focus, null, 'a hit breaks focus');
  // баланс: продуманная игра побеждает с разными наборами, нажатие одной кнопки — проигрывает
  for (const loadout of [['hold', 'flame', 'push', 'ignite'], ['flame', 'push', 'ward', 'throw'], ['throw', 'push', 'hold', 'ignite']]) {
    let wins = 0; for (let seed = 1; seed <= 12; seed++) if (simulate(loadout, smartPolicy, { seed }).result === 'victory') wins++;
    assert.ok(wins >= 11, `${loadout} is winnable (${wins}/12)`);
  }
  for (const id of ['throw', 'flame']) {
    let wins = 0; for (let seed = 1; seed <= 12; seed++) if (simulate(['throw', 'flame', 'push', 'hold'], spamPolicy(id), { seed }).result === 'victory') wins++;
    assert.ok(wins <= 2, `spamming ${id} rarely wins (${wins}/12)`);
  }
  const smart = simulate(['hold', 'flame', 'push', 'ignite'], smartPolicy, { seed: 4 });
  assert.ok(smart.stats.combos >= 1 && smart.stats.interrupts >= 1, 'a good fight uses combos and interrupts');
  assert.ok(Object.keys(smart.stats.commands).length >= 3, 'and several different commands');
}

// ---------------------------------------------------------------- шаги эпизода
{
  const ids = STEPS.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const must of ['intro', 'goran', 'tree', 'wall', 'spark', 'herbs', 'gather', 'ritual', 'melt', 'fight', 'enter', 'sanctuary', 'done']) assert.ok(ids.includes(must), must);
  assert.ok(ids.indexOf('herbs') < ids.indexOf('gather') && ids.indexOf('gather') < ids.indexOf('ritual') && ids.indexOf('ritual') < ids.indexOf('fight'));
  const ep = freshProgress();
  assert.equal(advance(ep, 'tree'), false, 'cannot skip ahead');
  assert.equal(advance(ep, 'intro'), true); assert.equal(ep.step, 'goran');
  assert.equal(advance(ep, 'intro'), false, 'repeating a step does nothing');
  assert.ok(atLeast(ep, 'intro') && !atLeast(ep, 'tree'));
  assert.equal(notePractice(ep), false); assert.equal(ep.practice, 0, 'no practice before the lesson');
  ep.lesson = true;
  const opened = [1, 2, 3].map(() => notePractice(ep));
  assert.deepEqual(opened, [false, false, true], 'confident fire after three good uses');
  assert.deepEqual(ritualMissing({}).map(x => x.id), Object.keys(RITUAL_NEEDS));
  assert.deepEqual(ritualMissing({ tree_resin: 2, moon_herb: 3, frost_shard: 1 }), []);
  ep.step = 'gather';
  assert.equal(goalLine(ep, { tree_resin: 1 }, { tree_resin: 'смола', moon_herb: 'трава', frost_shard: 'осколок' }), 'Собрать для ритуала Проводника: смола 1/2, трава 0/3, осколок 0/1');
}

// ---------------------------------------------------------------- изоляция сохранения
{
  const saved = new Map([['witch_rpg_proto_save_v1', 'production'], ['witch_camera_test_v1:witch_rpg_proto_save_v1', 'camera']]);
  const raw = { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) };
  const s = isolatedStorage(raw);
  assert.equal(s.getItem('witch_rpg_proto_save_v1'), null, 'the episode does not see the production save');
  s.setItem('witch_rpg_proto_save_v1', 'episode');
  assert.equal(saved.get(PREFIX + 'witch_rpg_proto_save_v1'), 'episode');
  assert.equal(saved.get('witch_rpg_proto_save_v1'), 'production');
  assert.equal(saved.get('witch_camera_test_v1:witch_rpg_proto_save_v1'), 'camera');
  const mem = isolatedStorage(null); mem.setItem('a', 1); assert.equal(mem.getItem('a'), '1');
}

console.log('Episode «Первое пламя»: heat, ritual, telekinesis, flame stream, combat, steps and save isolation checks passed');
