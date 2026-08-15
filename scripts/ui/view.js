import { HEROES } from '../data/game-data.js';
import { $, $$ } from './dom.js';
import { abilityButtons, updatePrimaryButton } from './buttons.js';
import { bagModal, heroCard, heroModal, mapModal, victoryModal } from './templates.js';

let plateTimer;
let toastTimer;

export function getHero(id) {
  return HEROES.find(hero => hero.id === id);
}

export function renderParties(state) {
  $('#travelParty').innerHTML = HEROES.map(hero => heroCard(hero, state)).join('');
  $('#combatParty').innerHTML = HEROES.map(hero => heroCard(hero, state, true)).join('');
}

export function renderAbilities(state) {
  const hero = getHero(state.selected);
  $('#abilities').innerHTML = abilityButtons(hero, state.skill);
  $('#abilities').classList.add('open');
  updatePrimaryButton($('#confirmBtn'), hero, state.skill);
}

export function renderTravelProgress(state) {
  const markers = $$('.context-bar .step i');
  markers.forEach((marker, index) => marker.classList.toggle('done', index < state.travelStep));
  $('.context-bar .step').setAttribute('aria-label', `${state.travelStep} из пяти этапов`);
}

export function renderCombatState(state) {
  $('#roundLabel').textContent = `Раунд ${state.round}`;
  $('.target-label').textContent = `Хранитель разлома · ${state.seals}/4 печати`;
  $('#targetZone').classList.toggle('cracked', state.seals <= 2);
  $('#targetZone').classList.toggle('defeated', state.seals === 0);
  $('#threat .timeline').style.setProperty('--threat', `${state.threat}%`);
}

export function renderScreen(state) {
  $('#app').dataset.screen = state.screen;
  $$('.screen').forEach(screen => {
    const isActive = screen.id === `${state.screen}Screen`;
    screen.classList.toggle('active', isActive);
    screen.setAttribute('aria-hidden', String(!isActive));
  });
}

export function renderAll(state) {
  renderParties(state);
  renderAbilities(state);
  renderTravelProgress(state);
  renderCombatState(state);
  renderScreen(state);
}

export function showToast(text) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

export function showLocationPlate() {
  clearTimeout(plateTimer);
  $('#locationPlate').classList.remove('hidden');
  plateTimer = setTimeout(() => $('#locationPlate').classList.add('hidden'), 2800);
}

export function openModal(content, variant = '') {
  const modal = $('#modal');
  modal.classList.remove('victory', 'leaving');
  if (variant) modal.classList.add(variant);
  $('#modalContent').innerHTML = content;
  $('#modalLayer').classList.add('open');
  $('#modalLayer').setAttribute('aria-hidden', 'false');
  $('#closeModal').focus();
}

export function openNamedModal(kind, state) {
  if (kind === 'map') openModal(mapModal(state.travelStep));
  if (kind === 'bag') openModal(bagModal());
}

export function openHeroModal(heroId) {
  openModal(heroModal(getHero(heroId)));
}

export function openVictoryModal() {
  $('#app').classList.add('victory');
  openModal(victoryModal(), 'victory');
}

export function closeModal(state) {
  $('#modalLayer').classList.remove('open');
  $('#modalLayer').setAttribute('aria-hidden', 'true');
  $('#modal').classList.remove('victory', 'leaving');
  $('#app').classList.remove('victory');
  setTimeout(() => (state.screen === 'travel' ? $('#continueBtn') : $('#confirmBtn')).focus(), 20);
}
