const witchFlight = new URL('../assets/loading/witch-flight.webp', import.meta.url).href;

let screen = null;

/** One small illustration and six reusable sparks; no frame loop or particle allocation. */
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
      <p class="witch-loading__brand">Повелитель тайн</p>
      <div class="witch-loading__orbit" aria-hidden="true"></div>
      <div class="witch-loading__moon" aria-hidden="true"></div>
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
          <div class="witch-loading__fill"></div>
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
}

export function hideLoadingScreen() {
  if (!screen) return;
  document.removeEventListener('visibilitychange', screen.onVisibility);
  screen.root.remove(); // Removing the nodes also cancels all CSS animations.
  screen = null;
}
