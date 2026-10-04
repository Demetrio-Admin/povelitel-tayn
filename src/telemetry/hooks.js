// Подключение телеметрии к игре: что именно записываем. Вся логика отправки — в Telemetry.js.
import { MSG } from '../state/EventBus.js';
import { VERSION } from '../config/version.js';
import { Telemetry } from './Telemetry.js';

const errCap = 5; // не больше пяти ошибок за сессию: чтобы цикл ошибок не забил очередь

/** Включена ли телеметрия: нет адреса ?notrack и нет настройки в этом браузере. */
export function telemetryAllowed(search, storage) {
  try { if (new URLSearchParams(search).has('notrack')) return false; } catch (e) { /* считаем разрешённой */ }
  try { if (storage?.getItem('witch_notrack')) return false; } catch (e) { /* хранилище недоступно */ }
  return true;
}

export function createTelemetry({ session, bus, state, heroId, win = window, doc = document, storage = null } = {}) {
  const tm = new Telemetry({
    send: (sid, events, opts) => session.sendTelemetry(sid, events, opts),
    enabled: telemetryAllowed(win.location?.search || '', storage),
    meta: {
      v: VERSION,
      hero: String(heroId?.() || ''),
      w: win.innerWidth || 0, h: win.innerHeight || 0,
      dpr: win.devicePixelRatio || 1,
      touch: !!('ontouchstart' in win || (win.navigator?.maxTouchPoints || 0) > 0),
      pwa: !!(win.matchMedia && win.matchMedia('(display-mode: standalone)').matches),
    },
  });

  const lvl = () => state.data.heroLevel;
  bus.on(MSG.WORLD_EVENT, (key) => { tm.track('ev', { k: String(key), lvl: lvl() }); });
  bus.on(MSG.ZONE_CHANGED, (z) => { const id = z?.id || z?.name || ''; tm.setContext({ zone: id }); tm.track('zone', { z: id, lvl: lvl() }); });
  bus.on(MSG.CRAFTED, (c) => { tm.track('craft', { r: c?.recipeId }); });
  bus.on(MSG.RESEARCH_DONE, () => { tm.track('research_done', { lvl: lvl() }); });
  bus.on(MSG.FINAL_SCREEN, (f) => { tm.track('final', { outcome: f?.outcome }); });
  bus.on(MSG.REWARD, (r) => { if (r?.levelUps?.length) tm.track('levelup', { lvl: lvl() }); });
  bus.on(MSG.UI_MODE, (m) => { tm.setContext({ mode: String(m || '') }); });

  let errs = 0;
  win.addEventListener('error', (e) => { if (errs++ < errCap) tm.track('js_error', { msg: String(e?.message || '').slice(0, 80), line: e?.lineno || 0 }); });
  win.addEventListener('unhandledrejection', (e) => { if (errs++ < errCap) tm.track('js_error', { msg: String(e?.reason?.message || e?.reason || '').slice(0, 80), rej: true }); });
  doc.addEventListener('visibilitychange', () => tm.setActive(doc.visibilityState !== 'hidden'));
  win.addEventListener('pagehide', () => { tm.track('pagehide', {}); tm.flush({ keepalive: true }).catch(() => {}); });

  // старт — когда игрок вошёл и загружен; выход — остановка таймеров
  const begin = () => { if (session.status === 'ready') tm.start(); };
  session.onChange((reason) => {
    if (reason === 'signin') begin();
    if (reason === 'status') begin();
    if (reason === 'signout' || reason === 'session-lost') { tm.track('signout', {}); tm.flush().catch(() => {}); tm.stop(); }
  });
  begin();
  return tm;
}
