// Публичный профиль читает только разрешённые сервером поля. Кошелёк туда не входит.
export class HeroProfileService {
  constructor(session) { this.session = session; }
  get available() { return !!this.session?.ready; }
  async get(playerId = null) {
    if (!this.available) throw Error('Профиль временно недоступен.');
    const r = await this.session._authed(t => this.session.api.rpc('hero_profile', { target_id: playerId }, t));
    if (!r?.ok) throw Error(r?.reason === 'not_found' ? 'Игрок не найден.' : 'Профиль временно недоступен.');
    return r;
  }
  async touch() {
    if (this.available) await this.session._authed(t => this.session.api.rpc('hero_presence', {}, t));
  }
}

export function bindHeroPresence(service, doc = document, win = window) {
  let stopped = false, pending = false, last = 0;
  const touch = async () => {
    if (stopped || pending || doc.visibilityState === 'hidden' || !service.available || Date.now() - last < 55_000) return;
    pending = true;
    try { await service.touch(); last = Date.now(); } catch { /* Ввод игры не зависит от индикатора присутствия. */ }
    finally { pending = false; }
  };
  const timer = win.setInterval(touch, 60_000);
  const off = service.session.onChange(() => { touch(); });
  doc.addEventListener('visibilitychange', touch);
  touch();
  return () => { stopped = true; win.clearInterval(timer); off(); doc.removeEventListener('visibilitychange', touch); };
}
