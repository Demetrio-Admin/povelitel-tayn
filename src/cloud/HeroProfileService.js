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

