import { state, resetBattle, saveState, setHeroStatus, updateState } from './state/game-state.js';
import { $ } from './ui/dom.js';
import { closeModal, getHero, openHeroModal, openNamedModal, openVictoryModal, renderAbilities, renderAll, renderCombatState, renderParties, renderScreen, renderTravelProgress, showLocationPlate, showToast } from './ui/view.js';

function selectHero(heroId, source) {
  updateState({ selected: heroId, skill: null });
  renderParties(state);
  if (source === 'combat') renderAbilities(state);
  else openHeroModal(heroId);
}

function setScreen(screen) {
  updateState({ screen, skill: null });
  renderScreen(state);
  if (screen === 'combat') {
    renderAbilities(state);
    renderCombatState(state);
    showToast('Выберите героя, затем способность');
  }
}

function continueTravel() {
  if (state.busy) return;
  state.busy = true;
  const button = $('#continueBtn');
  button.classList.add('loading');
  button.querySelector('span').textContent = 'Путь открывается…';

  setTimeout(() => {
    $('#whisper').classList.add('show');
    updateState({ travelStep: Math.max(3, state.travelStep) });
    renderTravelProgress(state);
  }, 700);

  setTimeout(() => {
    button.classList.remove('loading');
    button.querySelector('span').textContent = 'Продолжить путь';
    $('#whisper').classList.remove('show');
    state.busy = false;
    setScreen('combat');
  }, 1700);
}

function chooseSkill(skillIndex) {
  updateState({ skill: skillIndex });
  renderAbilities(state);
}

function resolveAction() {
  if (state.busy || state.skill === null) return;
  state.busy = true;
  const hero = getHero(state.selected);
  const skillName = hero.skills[state.skill][1];
  const target = $('#targetZone');
  $('#confirmBtn').classList.add('loading');
  target.classList.add('respond');

  setTimeout(() => {
    updateState({ seals: Math.max(0, state.seals - 1), threat: Math.min(88, state.threat + 8) });
    renderCombatState(state);
    $('#roundResult').textContent = state.seals ? `${skillName}: печать дала трещину` : 'Ритуал остановлен';
    $('#roundResult').classList.add('show');
  }, 420);

  setTimeout(() => {
    target.classList.remove('respond');
    $('#roundResult').classList.remove('show');
    $('#confirmBtn').classList.remove('loading');
    Object.assign(state, { round: state.round + 1, skill: null, busy: false });
    saveState();
    renderCombatState(state);
    renderAbilities(state);
    if (state.seals === 0) openVictoryModal();
    else showToast('Мир изменился. Намерение цели продвинулось.');
  }, 1250);
}

function defend() {
  const hero = getHero(state.selected);
  setHeroStatus(hero.id, ['Щит']);
  renderParties(state);
  showToast(`${hero.name}: защита до следующего хода`);
}

function waitTurn() {
  updateState({ round: state.round + 1, threat: Math.min(92, state.threat + 10) });
  renderCombatState(state);
  showToast('Ход пропущен. Разлом приблизился.');
}

function handleModalClose() {
  if (state.seals === 0) {
    resetBattle();
    renderAll(state);
    showToast('Этап 4 открыт');
  }
  closeModal(state);
}

renderAll(state);
if (state.screen === 'travel') showLocationPlate();

$('#contextBar').addEventListener('click', showLocationPlate);
$('#locationPlate').addEventListener('click', () => $('#locationPlate').classList.add('hidden'));
$('#continueBtn').addEventListener('click', continueTravel);
$('#confirmBtn').addEventListener('click', resolveAction);
$('#defendBtn').addEventListener('click', defend);
$('#waitBtn').addEventListener('click', waitTurn);
$('#closeModal').addEventListener('click', handleModalClose);
$('#modalLayer').addEventListener('click', event => {
  if (event.target === $('#modalLayer')) handleModalClose();
});

document.addEventListener('click', event => {
  const openControl = event.target.closest('[data-open]');
  if (openControl) openNamedModal(openControl.dataset.open, state);

  const heroControl = event.target.closest('.hero');
  if (heroControl) selectHero(heroControl.dataset.hero, heroControl.closest('#combatParty') ? 'combat' : 'travel');

  const skillControl = event.target.closest('[data-skill]');
  if (skillControl) chooseSkill(Number(skillControl.dataset.skill));
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#modalLayer').classList.contains('open')) handleModalClose();
});
