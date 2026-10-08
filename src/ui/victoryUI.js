import { domEl as el, domOverlay } from './accountUI.js';
import { ASSET_FILES } from '../config/assets.manifest.js';
import { ITEMS } from '../config/balance.progression.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { heroById } from '../config/heroes.js';

const amount = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const num = value => Number(value).toLocaleString('ru-RU');
const text = (value, cls = '') => el('span', { class: cls, text: value });
const asset = path => `${import.meta.env.BASE_URL}${path}`;
const image = (key, cls = '') => el('img', { src: asset(ASSET_FILES[key] || ASSET_FILES.icon_lock), class: cls, alt: '', draggable: 'false' });

// Read only: the confirmed combat result has already been applied by PlayerActions.
export function victoryViewModel({ reward = {}, levelUps = [], seconds = 0, interrupts = 0, vitals = {}, heroId } = {}) {
  const hero = heroById(heroId);
  const loot = Object.entries(reward.items || {}).filter(([, n]) => amount(n) > 0)
    .sort(([a], [b]) => (a === 'coins' ? -1 : b === 'coins' ? 1 : 0))
    .map(([id, n]) => ({ id, name: ITEMS[id]?.name || id, icon: ITEMS[id]?.icon || 'icon_lock', quantity: amount(n) }));
  const schools = Object.entries(reward.schoolXP || {}).filter(([id, n]) => ABILITIES[id] && amount(n) > 0)
    .map(([id, n]) => ({ id, name: ABILITIES[id].name, icon: `icon_${id}`, xp: amount(n) }));
  return { hero, loot, schools, heroXP: amount(reward.heroXP),
    levelUps: levelUps.filter(row => amount(row.level) > 0).map(row => ({ level: amount(row.level), note: row.note || '' })),
    seconds: Math.max(0, Number(seconds) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 }),
    interrupts: amount(interrupts), mana: amount(vitals.mana), maxMana: amount(vitals.maxMana) };
}

export function showVictory({ result, heroId, audio, onClose } = {}) {
  const view = victoryViewModel({ ...result, heroId });
  const card = el('div', { class: 'acc-card victory-card' });
  const crest = el('img', { class: 'victory-crest', src: asset(`assets/ui/victory/hero-${view.hero.id}.webp`), alt: '', draggable: 'false' });
  const header = el('header', { class: 'victory-header' }, crest, el('h2', { text: 'Победа!' }));
  const rewards = el('div', { class: 'victory-rewards', tabindex: '0', 'aria-label': 'Награды за бой' });
  if (view.loot.length) {
    const loot = el('div', { class: 'victory-loot', style: `--loot-columns:${Math.min(2, view.loot.length)}` });
    for (const row of view.loot) loot.append(el('div', { class: `victory-drop${row.quantity >= 1000 ? ' victory-drop-wide' : ''}`, 'data-item': row.id }, image(row.icon),
      el('div', {}, text(`+${num(row.quantity)}`, 'victory-quantity'), text(row.name, 'victory-item-name'))));
    rewards.append(loot);
  }
  if (view.heroXP) rewards.append(el('div', { class: 'victory-hero-xp' }, el('img', { src: asset('assets/ui/victory/experience.webp'), alt: '', draggable: 'false' }),
    text(`+${num(view.heroXP)} опыта ${view.hero.gender === 'male' ? 'героя' : 'героини'}`)));
  if (view.schools.length) {
    const schools = el('div', { class: 'victory-schools', style: `--gift-columns:${Math.min(3, view.schools.length)}` });
    for (const row of view.schools) schools.append(el('div', { class: 'victory-school', 'data-school': row.id }, image(row.icon),
      el('div', {}, text(row.name, 'victory-school-name'), text(`+${num(row.xp)}`, 'victory-school-quantity'))));
    rewards.append(el('section', { class: 'victory-magic', 'aria-label': 'Опыт даров' }, el('h3', { text: 'Опыт даров' }), schools));
  }
  for (const row of view.levelUps) rewards.append(el('div', { class: 'victory-level' }, text(`Новый уровень ${row.level}!`),
    row.note ? el('small', { text: row.note }) : null));
  const details = el('div', { class: 'victory-details' },
    text('Здоровье восстановлено', 'victory-health'), text(`Мана: ${num(view.mana)} / ${num(view.maxMana)}`),
    text(`${view.seconds} сек · Прерываний: ${num(view.interrupts)}`, 'victory-time'));
  let h, advance = true;
  const done = el('button', { type: 'button', class: 'victory-continue', text: 'Продолжить', onclick: () => { audio?.play('ui_click'); h.close(); } });
  card.append(header);
  if (rewards.childElementCount) card.append(rewards);
  card.append(details, done);
  h = domOverlay(card, { label: 'Победа!', closeButton: false, paintPanel: false, onClose: () => onClose?.(advance) });
  h.ov.classList.add('victory-window');
  // A touch on the dialog must never reach the battle below it.
  for (const event of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel', 'click']) h.ov.addEventListener(event, e => e.stopPropagation());
  done.focus({ preventScroll: true });
  return { ov: h.ov, close: h.close, destroy() { advance = false; h.close(); }, get closed() { return h.closed; } };
}
