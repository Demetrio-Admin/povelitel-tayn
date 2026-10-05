import { GAME_TITLE } from '../config/branding.js';

const witchFlight = new URL('../assets/loading/witch-flight.webp', import.meta.url).href;

let screen = null;

/** Small static art and fixed CSS sparks; no frame loop or particle allocation. */
export function showLoadingScreen(message = 'Пробуждаем магию…') {
  if (typeof document === 'undefined') return;
  if (screen) {
    screen.message.textContent = message;
    return;
  }
  const root = document.createElement('div');
  root.className = 'witch-loading';
  root.innerHTML = `
    <section class="witch-loading__panel" aria-label="Загрузка игры" aria-busy="true">
      <div class="witch-loading__sky" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
      <p class="witch-loading__brand">${GAME_TITLE}</p>
      <div class="witch-loading__orbit" aria-hidden="true"></div>
      <div class="witch-loading__moon" aria-hidden="true">
        <svg viewBox="0 0 64 64"><path d="M48 8A25 25 0 1 0 56 48A23 23 0 0 1 48 8Z"/></svg>
      </div>
      <div class="witch-loading__flight" aria-hidden="true">
        <img class="witch-loading__witch" src="${witchFlight}" width="480" height="320" alt="" fetchpriority="high" decoding="async">
        <div class="witch-loading__sparks"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="witch-loading__copy">
        <span class="witch-loading__ornament" aria-hidden="true">✦</span>
        <h1>Летим в Шепчущий лес</h1>
        <p>Немного терпения — и начнётся волшебство</p>
      </div>
      <div class="witch-loading__progress">
        <div class="witch-loading__status">
          <span role="status"></span><span class="witch-loading__percent" aria-hidden="true"></span>
        </div>
        <div class="witch-loading__track" role="progressbar" aria-label="Загрузка ресурсов игры" aria-valuemin="0" aria-valuemax="100">
          <div class="witch-loading__channel"><div class="witch-loading__fill"></div></div>
          <div class="witch-loading__charge-area" aria-hidden="true">
            <span class="witch-loading__charge">
              <svg viewBox="0 0 24 24"><path d="M12 0 15 9 24 12 15 15 12 24 9 15 0 12 9 9Z"/></svg>
              <i></i><i></i>
            </span>
          </div>
        </div>
      </div>
    </section>`;
  const messageNode = root.querySelector('[role="status"]');
  messageNode.textContent = message;
  // The same 9:16 FIT rectangle as the game canvas, including landscape phones.
  document.body.append(root);
  const onVisibility = () => root.classList.toggle('witch-loading--paused', document.hidden);
  document.addEventListener('visibilitychange', onVisibility);
  onVisibility();
  screen = {
    root, message: messageNode,
    percent: root.querySelector('.witch-loading__percent'),
    track: root.querySelector('[role="progressbar"]'),
    fill: root.querySelector('.witch-loading__fill'),
    onVisibility,
  };
}

/** Progress comes from Phaser's asset loader; connection/font phases remain indeterminate. */
export function setLoadingProgress(value) {
  if (!screen) return;
  const progress = Math.max(0, Math.min(1, Number(value) || 0));
  const percent = Math.round(progress * 100);
  screen.percent.textContent = `${percent}%`;
  screen.track.setAttribute('aria-valuenow', String(percent));
  screen.fill.style.transform = `scaleX(${progress})`;
  screen.track.style.setProperty('--loading-progress', String(progress));
  screen.track.classList.toggle('has-progress', progress > 0);
}

export function hideLoadingScreen() {
  if (!screen) return;
  document.removeEventListener('visibilitychange', screen.onVisibility);
  screen.root.remove(); // Removing the nodes also cancels all CSS animations.
  screen = null;
}
