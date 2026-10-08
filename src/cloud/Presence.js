// v0.29.0 — «в игре»: открытая игра раз в ~45 с (пока вкладка видна и вход готов) подаёт серверу знак presence_ping;
// по нему список «Онлайн» знает, кто сейчас играет. Ошибки связи молча пропускаются — следующий знак через минуту.
import { RATINGS } from '../config/ratings.js';

export class Presence {
  /** env — для тестов: { doc, setInterval, clearInterval }. */
  constructor(session, env = {}) {
    this.session = session;
    this.doc = env.doc ?? (typeof document !== 'undefined' ? document : null);
    this.setIv = env.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIv = env.clearInterval ?? ((id) => clearInterval(id));
    this.iv = null;
    this.pings = 0;
    this.onVisible = () => { if (this.doc?.visibilityState === 'visible') this.ping(); };
  }

  start() {
    if (this.iv != null) return;
    this.iv = this.setIv(() => this.ping(), RATINGS.pingSec * 1000);
    this.doc?.addEventListener?.('visibilitychange', this.onVisible);
    this.session.onChange?.((reason) => { if (reason === 'status' || reason === 'signin') this.ping(); });
    this.ping();
  }

  stop() {
    if (this.iv != null) this.clearIv(this.iv);
    this.iv = null;
    this.doc?.removeEventListener?.('visibilitychange', this.onVisible);
  }

  /** Знак подаётся, только если игрок правда в игре: вкладка видна и вход готов. */
  async ping() {
    const s = this.session;
    if (s.status !== 'ready' || (this.doc && this.doc.visibilityState === 'hidden')) return false;
    this.pings++;
    try { await s._authed((t) => s.api.presencePing(t)); return true; } catch (e) { return false; }
  }
}
