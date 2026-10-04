// Телеметрия живого теста: где игроки останавливаются, сколько идёт глава, на ком проигрывают.
// Не зависит от Phaser: отправка и часы подставляются снаружи, поэтому всё проверяется без браузера.
//
// Правила:
//  - никаких личных данных: только короткие имена событий и числа (id игрока сервер берёт из входа сам);
//  - любая ошибка телеметрии молча глотается: игру она не ломает и не тормозит;
//  - события копятся и уходят пачкой (раз в 20 секунд, при сворачивании вкладки и по достижении 40 штук);
//  - выключается адресом ?notrack и настройкой localStorage 'witch_notrack'.

export const TELEMETRY = {
  flushMs: 20000,     // как часто отправлять накопленное
  heartbeatMs: 30000, // «я ещё играю» — из них считается время в игре
  batchMax: 40,       // накопилось столько — отправляем сразу
  bufferMax: 300,     // потолок очереди, если сервер недоступен (старое отбрасываем)
  sendMax: 100,       // не больше, чем принимает сервер за раз
  nameRe: /^[a-z0-9_:.]{1,40}$/,
};

/** Оставляем в данных события только короткие строки, числа и булевы значения. */
export function cleanData(d) {
  const out = {};
  if (!d || typeof d !== 'object') return out;
  let n = 0;
  for (const [k, v] of Object.entries(d)) {
    if (n >= 12 || !/^[a-z0-9_]{1,24}$/i.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) { out[k] = Math.round(v * 100) / 100; n++; }
    else if (typeof v === 'boolean') { out[k] = v; n++; }
    else if (typeof v === 'string') { out[k] = v.slice(0, 80); n++; }
  }
  return out;
}

export class Telemetry {
  /**
   * send(sessionId, events, { keepalive }) → Promise: отправка пачки (в игре — PlayerSession.sendTelemetry).
   * meta — постоянные поля сессии (версия, герой, размер экрана): уходят в событии session_start.
   */
  constructor({ send, now = () => Date.now(), setTimer = (f, ms) => setInterval(f, ms), clearTimer = (t) => clearInterval(t), enabled = true, meta = {} } = {}) {
    this.send = send;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.enabled = !!enabled && typeof send === 'function';
    this.meta = meta;
    this.sessionId = Telemetry.makeId();
    this.t0 = this.now();
    this.buf = [];
    this.sending = false;
    this.timers = [];
    this.dropped = 0;
    this.active = true;      // false, пока вкладка скрыта: heartbeat в это время не считается временем игры
    this.context = {};       // сцена/зона для heartbeat
  }

  static makeId() {
    const a = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Записать событие. name — латиница, цифры, _ : . ; data — плоский объект с короткими значениями. */
  track(name, data) {
    if (!this.enabled) return false;
    try {
      if (!TELEMETRY.nameRe.test(String(name))) return false;
      this.buf.push({ n: String(name), t: Math.max(0, Math.round(this.now() - this.t0)), d: cleanData(data) });
      if (this.buf.length > TELEMETRY.bufferMax) { this.buf.splice(0, this.buf.length - TELEMETRY.bufferMax); this.dropped++; }
      if (this.buf.length >= TELEMETRY.batchMax) this.flush().catch(() => {});
      return true;
    } catch (e) { return false; }
  }

  /** Запомнить, где игрок сейчас: попадёт в heartbeat. */
  setContext(patch) { this.context = { ...this.context, ...cleanData(patch) }; }

  start() {
    if (!this.enabled || this.timers.length) return;
    this.track('session_start', this.meta);
    this.timers.push(this.setTimer(() => this.flush().catch(() => {}), TELEMETRY.flushMs));
    this.timers.push(this.setTimer(() => { if (this.active) this.track('tick', this.context); }, TELEMETRY.heartbeatMs));
  }

  stop() { for (const t of this.timers) this.clearTimer(t); this.timers = []; }

  /** Вкладка свернута/показана. При сворачивании сразу отправляем остаток. */
  setActive(on) {
    this.active = !!on;
    if (!on) { this.track('hidden', this.context); this.flush({ keepalive: true }).catch(() => {}); }
    else this.track('visible', this.context);
  }

  /** Отправить накопленное. Не удалось — события остаются в очереди до следующей попытки. */
  async flush({ keepalive = false } = {}) {
    if (!this.enabled || this.sending || !this.buf.length) return 0;
    this.sending = true;
    const batch = this.buf.slice(0, TELEMETRY.sendMax);
    try {
      await this.send(this.sessionId, batch, { keepalive });
      // за время отправки очередь могла обрезаться с головы: убираем только то, что реально ушло
      const sent = new Set(batch);
      this.buf = this.buf.filter((e) => !sent.has(e));
      return batch.length;
    } catch (e) {
      return 0;
    } finally { this.sending = false; }
  }
}
