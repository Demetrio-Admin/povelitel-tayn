// Модель жара для применений Огня в мире (без Phaser — проверяется в Node).
//
// Игрок держит палец — жар растёт; отпускает — спадает. У неопытного огня есть инерция: после отпускания жар
// ещё немного растёт, поэтому передержать легко. Чувство жара (урок Мирры) и практика уменьшают инерцию.
// Задача считается выполненной, когда жар провёл в «тёплой полосе» нужное время; дошёл до 1 — перегрев.

/** Ступени владения огнём: 0 — первые дни, 1 — урок Мирры «чувство жара», 2 — уверенный огонь (после практики). */
export const FIRE_CONTROL = [
  { name: 'Первое пламя', rise: 0.62, fall: 0.5, inertia: 0.6, warn: false },
  { name: 'Чувство жара', rise: 0.5, fall: 0.6, inertia: 0.22, warn: true },
  { name: 'Уверенный огонь', rise: 0.46, fall: 0.7, inertia: 0.1, warn: true, easy: true },
];

/** Сколько удачных применений нужно для «Уверенного огня». */
export const PRACTICE_FOR_CONFIDENT = 3;

export function controlLevel({ lesson = false, practice = 0 } = {}) {
  if (lesson && practice >= PRACTICE_FOR_CONFIDENT) return 2;
  return lesson ? 1 : 0;
}

/**
 * @param {object} task  { band: [lo, hi], need: секунды в полосе, over: порог перегрева (1), decay: потеря прогресса вне полосы в секунду }
 * @param {number} level ступень FIRE_CONTROL
 */
export function createHeat(task, level = 0) {
  return {
    task: { over: 1, decay: 0, ...task },
    ctl: FIRE_CONTROL[Math.max(0, Math.min(FIRE_CONTROL.length - 1, level))],
    value: 0, vel: 0, progress: 0, holding: false, time: 0,
    result: null,   // null — идёт; 'done' — получилось; 'over' — перегрев
  };
}

export const inBand = (h) => h.value >= h.task.band[0] && h.value <= h.task.band[1];

/** Один шаг модели. holding — палец прижат. Возвращает ту же модель (изменённую). */
export function stepHeat(h, dt, holding) {
  if (h.result) return h;
  h.holding = holding;
  h.time += dt;
  const target = holding ? h.ctl.rise : -h.ctl.fall;
  h.vel += (target - h.vel) * Math.min(1, dt / Math.max(0.01, h.ctl.inertia));
  h.value = Math.max(0, Math.min(1.1, h.value + h.vel * dt));
  if (h.value <= 0 && h.vel < 0) h.vel = 0;
  if (inBand(h)) h.progress = Math.min(h.task.need, h.progress + dt);
  else if (h.task.decay) h.progress = Math.max(0, h.progress - h.task.decay * dt);
  if (h.value >= h.task.over) h.result = 'over';
  else if (h.progress >= h.task.need) h.result = 'done';
  return h;
}

/** Близко к краю полосы — пора отпускать (подсказка «чувства жара»). */
export const nearTop = (h) => h.vel > 0 && h.value + h.vel * h.ctl.inertia * 1.6 > h.task.band[1];

/**
 * Ритуал: несколько рун подряд, у каждой своя полоса. Перегрев не проваливает ритуал — сбрасывает текущую руну.
 * @param {Array<[number, number]>} bands
 */
export function createRitual(bands, need = 1.5, level = 1) {
  return { bands, need, rune: 0, heat: createHeat({ band: bands[0], need, decay: 0.6 }, level), flares: 0, done: false };
}

export function stepRitual(r, dt, holding) {
  if (r.done) return r;
  stepHeat(r.heat, dt, holding);
  if (r.heat.result === 'over') {
    r.flares += 1;
    const level = FIRE_CONTROL.indexOf(r.heat.ctl);
    r.heat = createHeat({ band: r.bands[r.rune], need: r.need, decay: 0.6 }, level);
    r.heat.value = 0.25;
    r.flare = true;
  } else if (r.heat.result === 'done') {
    r.rune += 1;
    if (r.rune >= r.bands.length) { r.done = true; return r; }
    const { value, vel, ctl } = r.heat;
    r.heat = createHeat({ band: r.bands[r.rune], need: r.need, decay: 0.6 }, FIRE_CONTROL.indexOf(ctl));
    r.heat.value = value; r.heat.vel = vel;
  }
  return r;
}

/**
 * Телекинез: предмет тянется за пальцем с запаздыванием, зависящим от веса. Мана тратится, пока предмет в воздухе.
 * Успех — центр предмета в целевой зоне, когда палец отпущен.
 */
export const WEIGHT_FOLLOW = { light: 9, medium: 4.5, heavy: 2.4 };

export function createDrag({ x, y, weight = 'heavy', target, radius = 70, drain = 7 }) {
  return { x, y, weight, target, radius, drain, holding: false, lifted: 0, result: null };
}

export function stepDrag(d, dt, finger, mana) {
  if (d.result) return { d, spent: 0 };
  let spent = 0;
  if (finger && mana > 0) {
    const k = Math.min(1, WEIGHT_FOLLOW[d.weight] * dt);
    d.x += (finger.x - d.x) * k; d.y += (finger.y - d.y) * k;
    d.lifted = Math.min(1, d.lifted + dt * 3);
    d.holding = true;
    spent = d.drain * dt;
  } else {
    d.holding = false;
    d.lifted = Math.max(0, d.lifted - dt * 4);
  }
  return { d, spent };
}

export const dragInTarget = (d) => Math.hypot(d.x - d.target.x, d.y - d.target.y) <= d.radius;

/** Отпустили палец: предмет падает там, где он есть. Успех, если упал в зону. */
export function releaseDrag(d) {
  d.holding = false;
  if (dragInTarget(d)) d.result = 'done';
  return d;
}

/**
 * Направленное пламя (Огонь II): поток идёт от героя к пальцу. У цели несколько «слабых мест»;
 * каждое оттаивает, пока на него направлен поток. Мана тратится, пока поток идёт.
 */
export function createStream(spots, { reach = 520, width = 70, need = 1.2, drain = 6 } = {}) {
  return { spots: spots.map(s => ({ ...s, heat: 0, done: false })), reach, width, need, drain, result: null };
}

/** Точка, где поток реально заканчивается (не дальше reach от героя). */
export function streamEnd(from, to, reach) {
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, reach / len);
  return { x: from.x + dx * k, y: from.y + dy * k };
}

export function stepStream(s, dt, from, finger, mana) {
  if (s.result) return { s, spent: 0, end: null };
  if (!finger || mana <= 0) {
    for (const p of s.spots) if (!p.done) p.heat = Math.max(0, p.heat - dt * 0.35);
    return { s, spent: 0, end: null };
  }
  const end = streamEnd(from, finger, s.reach);
  for (const p of s.spots) {
    if (p.done) continue;
    const hit = Math.hypot(end.x - p.x, end.y - p.y) <= s.width + (p.r || 0);
    p.heat = hit ? Math.min(s.need, p.heat + dt) : Math.max(0, p.heat - dt * 0.35);
    if (p.heat >= s.need) p.done = true;
  }
  if (s.spots.every(p => p.done)) s.result = 'done';
  return { s, spent: s.drain * dt, end };
}
