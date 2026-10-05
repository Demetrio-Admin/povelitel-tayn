// v0.25.0 — клиент Ковенов: RPC coven_request (supabase/migrations/20261007_covens.sql). Материалы и награда недели — через
// player_action (services.actions.covenGive / covenClaim), чтобы сумка менялась обычным путём.
import { CloudError } from './api.js';

export const COVEN_REASONS = {
  locked: 'Ковены откроются после квеста «Не в одиночку» (Дом Ковенов, Ровена).',
  register: 'Создайте аккаунт с никнеймом, чтобы вступить в ковен.',
  already: 'Вы уже состоите в ковене.',
  bad_name: 'Название: от 3 до 24 символов — буквы, цифры, пробел, _ и -.',
  name_taken: 'Это название уже занято.',
  not_found: 'Ковен или участник не найден. Обновите окно.',
  full: 'В ковене нет мест.',
  no_coven: 'Вы не состоите в ковене.',
  leader: 'Сначала передайте главенство другому участнику.',
  forbidden: 'Недостаточно прав.',
  same: 'Роль уже такая.',
  progress: 'Цель недели ещё не набрана.',
  given: 'Чтобы забрать награду, внесите в цель недели хотя бы немного сами.',
  missing: 'Этого нет в сумке.',
  unknown: 'Не получилось. Обновите окно.',
};
export const covenReason = (r) => COVEN_REASONS[r] || COVEN_REASONS.unknown;

export class CovenService {
  constructor(session) { this.session = session; }
  get available() { return !!this.session?.signedIn; }
  async request(op, args = {}) {
    if (!this.available) throw new CloudError('not_configured', 'Ковены доступны в онлайн-аккаунте.');
    return this.session._authed((token) => this.session.api.rpc('coven_request', { op, args }, token));
  }
}
