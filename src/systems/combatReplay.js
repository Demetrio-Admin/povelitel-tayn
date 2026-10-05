// v0.14.0 — запись и повтор боя. Без Phaser.
// Бой идёт на фиксированном шаге STEP (1/60 с), без случайных чисел, поэтому он полностью определяется стартовым состоянием героя,
// врагом и действиями игрока по номеру шага. Клиент записывает действия (CombatRecorder), а сервер проигрывает ту же запись
// заново тем же движком (replayCombat) и сам решает исход — присланному «я победил» верить не нужно.
//
// Формат записи (log):
//   { v: 1, ticks: N, ev: [[tick, code, arg?], …], hold: [tick, …] }
//   • ticks — сколько шагов симуляции прошло до конца боя;
//   • ev — действия игрока: tick — сколько шагов уже выполнено, когда игрок нажал (0 = до первого шага);
//       'a' <дар> — применить дар, 'p' <зелье>, 's' <объект поля> — выбрать/снять выбор, 'c' — выбор следующего объекта;
//     записываются только действия, которые сработали (отказ ничего не меняет);
//   • hold — номера шагов, на которых меняется «враг стоит» (обучение первого боя): первый номер включает паузу, второй выключает…
import { POTIONS } from '../config/resources.js';
import { ABILITY_ORDER } from './AbilitySystem.js';

export const STEP = 1 / 60;
/** Не больше 15 минут боя (как staleCombatSec): дальше сервер считает бой отступлением. */
export const MAX_TICKS = 60 * 60 * 15;
export const MAX_EVENTS = 2000;
/** Обучение держит врага на месте, пока игрок читает: не дольше 5 минут. */
export const MAX_HOLD_TICKS = 60 * 60 * 5;

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

export class CombatRecorder {
  constructor() { this.ticks = 0; this.ev = []; this.hold = []; this.holding = false; }
  /** Перед каждым шагом симуляции: включена ли пауза врага (обучение). */
  beforeTick(hold) { if (!!hold !== this.holding) { this.holding = !!hold; this.hold.push(this.ticks); } }
  afterTick() { this.ticks++; }
  input(code, arg) { this.ev.push(arg === undefined ? [this.ticks, code] : [this.ticks, code, arg]); }
  toJSON() { return { v: 1, ticks: this.ticks, ev: this.ev.map(e => [...e]), hold: [...this.hold] }; }
}

const isInt = (n) => Number.isInteger(n) && n >= 0;

/**
 * Проверка формы записи, присланной клиентом. Возвращает чистую копию или null.
 * Содержимое действий (есть ли такой дар, хватает ли маны) здесь не проверяется — это решает сам бой при повторе.
 */
export function normalizeLog(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
  if (!isInt(raw.ticks) || raw.ticks > MAX_TICKS) return null;
  if (!Array.isArray(raw.ev) || raw.ev.length > MAX_EVENTS) return null;
  if (!Array.isArray(raw.hold) || raw.hold.length > 200) return null;
  const ev = [];
  let last = 0;
  for (const e of raw.ev) {
    if (!Array.isArray(e) || e.length < 2 || e.length > 3) return null;
    const [t, code, arg] = e;
    if (!isInt(t) || t < last || t > raw.ticks) return null;
    if (code === 'c') { if (e.length !== 2) return null; ev.push([t, 'c']); }
    else if (code === 'a' || code === 'p' || code === 's') {
      if (typeof arg !== 'string' || !ID_RE.test(arg)) return null;
      ev.push([t, code, arg]);
    } else return null;
    last = t;
  }
  const hold = [];
  let prev = -1;
  for (const t of raw.hold) { if (!isInt(t) || t <= prev || t > raw.ticks) return null; hold.push(t); prev = t; }
  return { v: 1, ticks: raw.ticks, ev, hold };
}

/** Применить действие игрока к бою. true — сработало. */
function apply(cm, e) {
  const [, code, arg] = e;
  if (code === 'a') return ABILITY_ORDER.includes(arg) && cm.useAbility(arg).ok;
  if (code === 'p') return Object.hasOwn(POTIONS, arg) && cm.usePotion(arg).ok;
  if (code === 's') return cm.selectObject(arg);
  cm.cycleSelection();
  return true;
}

/**
 * Проиграть запись на CombatManager. Возвращает { ticks, held, ignored }:
 * ticks — сколько шагов выполнено (бой мог закончиться раньше), held — шагов с паузой врага, ignored — действий, которые не сработали.
 * holdAllowed=false — паузу врага игнорировать нельзя (она не положена): такая запись отвергается (held > 0 → вызывающий решает).
 */
export function replayCombat(cm, log) {
  cm.emit = () => {};   // события нужны только экрану; при повторе очередь не копим
  const { ev, hold } = log;
  let e = 0, p = 0, held = false, heldTicks = 0, ignored = 0, i = 0;
  for (; ; i++) {
    while (e < ev.length && ev[e][0] === i) { if (!apply(cm, ev[e])) ignored++; e++; }
    if (cm.result || i >= log.ticks) break;
    while (p < hold.length && hold[p] === i) { held = !held; p++; }
    if (held) heldTicks++;
    cm.tick(STEP, { holdEnemy: held });
  }
  return { ticks: i, held: heldTicks, ignored };
}
