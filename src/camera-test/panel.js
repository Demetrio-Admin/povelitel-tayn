import { services } from '../services.js';
import { PROFILES, experiment } from './model.js';
import { testScene, jumpTo } from './scenes.js';
export function installPanel(game) {
  const panel = document.createElement('details'); panel.id = 'camera-test-panel';
  panel.innerHTML = `<summary>Тест камеры · <span id="camera-profile">B</span></summary>
    <div class="camera-content"><strong>Эксперимент: камера и управление</strong>
    <p>Тап — идти. Проведение пальцем — джойстик.</p>
    <div class="camera-profiles" role="group" aria-label="Профиль камеры">${Object.entries(PROFILES).map(([id,p]) => `<button type="button" data-profile="${id}" aria-pressed="${id==='b'}">${p.label}</button>`).join('')}</div>
    <div class="camera-locations"><button data-location="forest">Лес Мирры</button><button data-location="city">Город</button><button data-location="city_bank">Интерьер</button></div>
    <div class="camera-actions"><button id="camera-hero">Герой: ведьма</button><button id="camera-reset">Сброс вида</button></div>
    <p>Прогресс локальный. Покупки отключены.</p><a href="./">Основная версия ↗</a></div>`;
  document.body.append(panel);
  for (const type of ['pointerdown','pointermove','pointerup','touchstart','touchmove','touchend']) panel.addEventListener(type, e => e.stopPropagation());
  panel.addEventListener('toggle', () => {
    // Opening the comparison menu cancels movement and blocks world taps.
    experiment.panelOpen = panel.open;
    const scene = testScene(); scene?.player?.stop();
    panel.querySelector('#camera-hero').textContent = 'Герой: ' + (services.state?.data.heroId === 'warlock' ? 'колдун' : 'ведьма');
    const ui = game.scene.getScene('UIScene'); ui?.resetJoystick?.();
    services.input.joy.x = services.input.joy.y = 0;
    scene?.input && (scene.input.enabled = !panel.open);
    if (ui?.input) ui.input.enabled = !panel.open;
  });
  function select(id) {
    experiment.profile = id;
    panel.querySelector('#camera-profile').textContent = id === 'original' ? 'Исходный' : id.toUpperCase();
    panel.querySelectorAll('[data-profile]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.profile===id)));
    testScene()?.player && testScene().applyProfile();
  }
  panel.querySelectorAll('[data-profile]').forEach(b => b.onclick = () => select(b.dataset.profile));
  panel.querySelector('#camera-reset').onclick = () => select(experiment.profile);
  panel.querySelectorAll('[data-location]').forEach(b => b.onclick = () => { experiment.panelOpen=false; panel.open=false; jumpTo(b.dataset.location); });
  panel.querySelector('#camera-hero').onclick = () => {
    const scene = testScene(); if (!scene?.player || services.mode !== 'exploration' || services.modalOpen || services.dialogue.active) return;
    scene.player.stop(); scene.savePosition();
    services.state.data.heroId = services.state.data.heroId === 'warlock' ? 'witch' : 'warlock';
    services.state.save();
    panel.querySelector('#camera-hero').textContent = 'Герой: ' + (services.state.data.heroId === 'warlock' ? 'колдун' : 'ведьма');
    experiment.panelOpen=false; panel.open=false; scene.scene.restart();
  };
  game.events.once('destroy', () => panel.remove());
}
