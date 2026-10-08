import { domEl as el, domOverlay } from './accountUI.js';
import { ASSET_FILES } from '../config/assets.manifest.js';
import { HeroProfileService } from '../cloud/HeroProfileService.js';
import { heroProfileView, localHeroProfile, profileDate, presenceText } from '../systems/heroProfile.js';
import { ENEMY_DIFFICULTY } from '../config/enemyRanks.js';
import { COVEN_ROLES } from '../config/covens.js';
import { xpProgress } from '../state/heroProgress.js';
import * as vitals from '../state/vitals.js';

const img = (key, alt = '') => el('img', { src: `${import.meta.env.BASE_URL}${ASSET_FILES[key]?.split('?')[0] || ASSET_FILES.icon_lock}`, alt });
const text = (value, cls = '') => el('div', { class: cls, text: value });
const num = value => Number(value || 0).toLocaleString('ru-RU');

export function showHeroProfile({ state, session, service = session ? new HeroProfileService(session) : null, targetId = null, onClose, onAccount } = {}) {
  const own = targetId == null || String(targetId) === String(session?.meta?.playerId);
  const card = el('div', { class: 'acc-card hp-card' });
  let h, selected = 'hero', loading = false;
  const render = raw => {
    if (h.closed) return;
    const p = heroProfileView(raw);
    card.replaceChildren();
    const portrait = el('div', { class: 'hp-portrait' }, img(p.heroDef.textures.down));
    const identity = el('div', { class: 'hp-identity' }, portrait, el('div', {},
      text(p.nickname, 'hp-name'), text(`${p.heroDef.name} · ур. ${p.level}${p.playerId ? ` · ID ${p.playerId}` : ''}`, 'hp-sub'),
      text(own ? 'В игре' : presenceText(p), 'hp-presence' + (own || p.online ? ' online' : ''))));
    card.append(identity);
    if (own && state) {
      const xp = xpProgress(state);
      card.append(el('div', { class: 'hp-xp', role: 'progressbar', 'aria-label': 'Опыт героя', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(xp.progress * 100)) }, el('div', { style: `width:${xp.progress * 100}%` })), text(xp.caption, 'hp-sub'));
    }
    card.append(el('div', { class: 'hp-coven' }, text(p.coven ? `Ковен «${p.coven.name}»` : 'Без ковена', 'hp-gold'), p.coven ? text(COVEN_ROLES[p.coven.role] || 'Участник', 'hp-sub') : null));
    if (own && state) card.append(el('div', { class: 'hp-wallet' },
      el('div', {}, img('icon_coin'), el('span', {}, text(num(state.item('coins')), 'hp-gold'), text('Монеты', 'hp-sub'))),
      el('div', {}, img('icon_sapphire'), el('span', {}, text(num(state.sapphires()), 'hp-gold'), text('Сапфиры', 'hp-sub')))));
    const nav = el('div', { class: 'hp-tabs', role: 'tablist', 'aria-label': 'Раздел профиля' });
    const sheets = {};
    for (const [id, label] of [['hero', 'Герой'], ['feats', 'Подвиги'], ['info', 'Сведения']]) {
      const button = el('button', { type: 'button', id: `hp-tab-${id}`, role: 'tab', 'aria-controls': `hp-sheet-${id}`, 'aria-selected': String(selected === id), text: label });
      const sheet = el('div', { id: `hp-sheet-${id}`, role: 'tabpanel', 'aria-labelledby': `hp-tab-${id}` });
      sheet.hidden = selected !== id;
      button.onclick = () => { selected = id; for (const [key, node] of Object.entries(sheets)) node.hidden = key !== id; for (const b of nav.children) b.setAttribute('aria-selected', String(b === button)); };
      sheets[id] = sheet; nav.append(button);
    }
    card.append(nav, ...Object.values(sheets));
    const section = value => text(value, 'hp-section');
    const record = details => {
      if (!p.strongest) return text('Побед пока нет', 'hp-sub');
      const r = p.strongest;
      return el('div', { class: 'hp-record' }, img(r.texture, r.name), el('div', {},
        text(r.name, 'hp-gold'), text(`Уровень ${r.level} · ${ENEMY_DIFFICULTY[r.difficulty]}`, 'hp-sub'),
        r.heroLevel ? text(`Побеждён героем ${r.heroLevel} уровня`, 'hp-sub') : null,
        details ? text(r.wonAt ? `Победа: ${profileDate(r.wonAt)}` : 'Дата старой победы неизвестна', 'hp-sub') : null));
    };
    const gifts = el('div', { class: 'hp-gifts' });
    const note = text('Отмечены дары, выбранные для боя.', 'hp-sub hp-gift-note'); note.setAttribute('aria-live', 'polite');
    for (const g of p.gifts) {
      const b = el('button', { type: 'button', class: 'hp-gift' + (g.active ? ' equipped' : '') + (!g.level ? ' locked' : ''), 'aria-label': `${g.name}: ${g.level ? `уровень ${g.level}, ${g.active ? 'в бою' : 'изучен'}` : 'не открыт'}` },
        el('span', { class: 'hp-gift-disc' }, img(g.icon), el('span', { class: 'hp-gift-level', text: g.level ? String(g.level) : '—' })),
        el('span', { text: g.name }), el('small', { text: g.level ? (g.active ? 'В бою' : 'Изучен') : 'Не открыт' }));
      b.onclick = () => { note.textContent = `${g.name}: ${g.level ? `уровень ${g.level}. ${g.active ? 'Выбран для боя.' : 'Изучен, для боя не выбран.'}` : 'Этот дар ещё не открыт.'}`; };
      gifts.append(b);
    }
    const amulets = el('div', { class: 'hp-amulets' });
    for (const a of p.amulets) amulets.append(el('div', {}, img(a.icon), text(`${a.name}${a.level ? ` +${a.level}` : ''}`)));
    if (!p.amulets.length) amulets.append(text('Амулеты не надеты', 'hp-sub'));
    sheets.hero.append(section('Дары'), gifts, note, section('Надетые амулеты'), amulets, section('Самый сильный побеждённый'), record(false));
    sheets.feats.append(section('Сильнейшая победа'), record(true), section('Магическая Дуэль'),
      text(`Рейтинг: ${num(p.duel?.rating ?? 1000)} · ${p.league}`), text(`Победы: ${p.duel?.wins || 0} · поражения: ${p.duel?.losses || 0}`, 'hp-sub'),
      section('Приключения'), text(`Побеждено типов противников: ${p.uniqueWins || 0}`),
      text(`Глава I: ${p.chapters?.[0] ? 'пройдена' : 'не завершена'}`, 'hp-sub'), text(`Глава II: ${p.chapters?.[1] ? 'пройдена' : 'не завершена'}`, 'hp-sub'));
    if (p.coven) sheets.feats.append(section('Ковен'), text(`Вклад этой недели: ${p.coven.given || 0} очков`));
    const v = own && state ? vitals.view(state) : null;
    const rows = [[own ? 'Здоровье' : 'Максимум здоровья', v ? `${Math.ceil(v.hp)} / ${v.maxHp}` : p.stats.maxHp], [own ? 'Мана' : 'Максимум маны', v ? `${Math.floor(v.mana)} / ${v.maxMana}` : p.stats.maxMana], ['Сила магии', `+${Math.round((p.stats.damageMult - 1) * 100)}%`], ['Восстановление маны', `${p.stats.manaRegen.toLocaleString('ru-RU')} / с`]];
    sheets.info.append(section('Характеристики'), ...rows.map(([k, val]) => el('div', { class: 'hp-stat' }, text(k), text(String(val), 'hp-gold'))),
      section('Сведения об игроке'), text(`Регистрация: ${profileDate(p.registeredAt)}`, 'hp-sub'),
      text(`Был в игре: ${profileDate(p.lastSeenAt)}`, 'hp-sub'), text('Время показано в вашем часовом поясе', 'hp-sub'));
    if (!session && own) sheets.info.append(text('Локальный персонаж — публичный профиль недоступен.', 'hp-sub'));
    if (own && onAccount) card.append(el('div', { class: 'hp-footer' }, el('button', { type: 'button', text: 'Аккаунт', onclick: () => { h.close(); onAccount(); } })));
  };
  async function load() {
    if (!service?.available || loading || h.closed) return;
    loading = true;
    try { render(await service.get(own ? null : targetId)); }
    catch (e) {
      if (h.closed) return;
      const retry = el('button', { type: 'button', text: 'Повторить', onclick: () => { error.remove(); retry.remove(); load(); } });
      const error = text(own ? 'Не удалось загрузить дополнительные сведения.' : e.message, 'hp-sub');
      card.append(error, retry);
    } finally { loading = false; }
  }
  h = domOverlay(card, { onClose, top: !own, label: own ? 'Профиль героя' : 'Профиль игрока' });
  h.ov.classList.add('hero-profile');
  // Phaser also listens on window for input outside its canvas. Keep profile taps inside HTML.
  for (const event of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel', 'click']) {
    h.ov.addEventListener(event, e => e.stopPropagation());
  }
  if (own && state) render(localHeroProfile(state, session));
  else card.append(text('Загрузка профиля…', 'hp-sub'));
  load();
  return h;
}
