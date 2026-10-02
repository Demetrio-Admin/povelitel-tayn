// Панель редактора карты — обычный HTML поверх игры (текстовые поля, список и кнопки удобнее на DOM).
// Не знает про Phaser: получает набор действий и возвращает методы обновления подписей.
import { PALETTE, propName } from '../world/propDefs.js';

const CSS = `
#me-panel{position:fixed;left:8px;bottom:8px;z-index:50;width:min(372px,calc(100vw - 16px));max-height:56vh;overflow:auto;
  background:linear-gradient(#2b1d15,#1c130e);border:2px solid #b8923c;border-radius:12px;color:#f1e3c2;
  font:14px/1.35 Georgia,'Philosopher',serif;box-shadow:0 8px 28px #000c;touch-action:pan-y;-webkit-user-select:none;user-select:none}
#me-panel *{box-sizing:border-box}
#me-panel header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #b8923c66;
  font-weight:700;color:#e8c56a;position:sticky;top:0;background:#2b1d15;z-index:1}
#me-panel .me-body{padding:8px 10px 10px;display:flex;flex-direction:column;gap:8px}
#me-panel.me-min .me-body{display:none}
#me-panel .me-info{min-height:2.7em;color:#f6e3a1}
#me-panel .me-row{display:flex;flex-wrap:wrap;gap:6px}
#me-panel button,#me-panel select{font:inherit;color:#f1e3c2;background:#4a3324;border:1px solid #b8923c88;border-radius:8px;padding:7px 10px;min-height:38px}
#me-panel button:active{background:#6a4a30}
#me-panel button.me-on{background:#7a5a22;border-color:#e8c56a}
#me-panel button.me-primary{background:#8a6a24;border-color:#e8c56a;font-weight:700}
#me-panel button.me-danger{border-color:#c8443a;color:#ffb0a0}
#me-panel button:disabled{opacity:.4}
#me-panel select{flex:1 1 150px;min-width:0}
#me-panel .me-status{font-size:12.5px;color:#a8977a;min-height:2.6em;white-space:pre-line}
#me-panel .me-hint{font-size:12px;color:#a8977a}
#me-panel .me-warn{color:#ff9a8a}
#me-panel .me-tabs button{flex:1 1 0;font-weight:700}
#me-panel:not([data-mode=props]) [data-sec=props],#me-panel:not([data-mode=terrain]) [data-sec=terrain],#me-panel:not([data-mode=walls]) [data-sec=walls]{display:none}
`;

export function buildEditorPanel(actions) {
  const css = document.createElement('style');
  css.textContent = CSS;
  document.head.appendChild(css);

  const root = document.createElement('div');
  root.id = 'me-panel';
  root.innerHTML = `
    <header><span>Редактор карты</span><button data-a="min" title="Свернуть">▾</button></header>
    <div class="me-body">
      <div class="me-row me-tabs">
        <button data-a="mode_props">Объекты</button><button data-a="mode_terrain">Дороги и река</button><button data-a="mode_walls">Стены</button>
      </div>
      <div class="me-info" data-r="info">Коснитесь объекта, чтобы выбрать. Тяните — переместить. Пустое место — двигать карту.</div>
      <div class="me-row">
        <button data-a="undo">↶ Отмена</button><button data-a="redo">↷ Повтор</button>
      </div>
      <div class="me-row" data-sec="props">
        <button data-a="dup">⧉ Копия</button><button data-a="flip">⇆ Зеркало</button>
        <button data-a="smaller">− Меньше</button><button data-a="bigger">+ Больше</button>
        <button data-a="delete" class="me-danger">🗑 Удалить</button>
      </div>
      <div data-sec="terrain" class="me-body" style="padding:0">
        <div class="me-row">
          <button data-a="pt_add">＋ Точка</button><button data-a="pt_add_start">＋ Точка в начале</button>
          <button data-a="pt_del" class="me-danger">− Убрать точку</button>
        </div>
        <div class="me-row">
          <button data-a="wider">↔ Шире</button><button data-a="narrower">↔ Уже</button>
          <button data-a="smooth">〰 Сгладить</button><button data-a="join">⛓ Примкнуть к дороге</button>
        </div>
        <div class="me-row">
          <button data-a="magnet">Магнит стыков</button>
          <button data-a="road_new">＋ Тропа</button><button data-a="stone_new">＋ Каменная</button><button data-a="pond_new">＋ Водоём</button>
          <button data-a="shape_del" class="me-danger">🗑 Убрать всю линию</button>
        </div>
      </div>
      <div data-sec="walls" class="me-body" style="padding:0">
        <div class="me-row">
          <select data-r="wallkind"><option value="wall">Стена дома</option><option value="ruin">Руины</option><option value="trees">Лес (непроходимо)</option><option value="furniture">Мебель</option></select>
          <button data-a="wall_add">＋ Добавить</button>
        </div>
        <div class="me-row">
          <button data-a="w_minus">↔ −</button><button data-a="w_plus">↔ +</button>
          <button data-a="h_minus">↕ −</button><button data-a="h_plus">↕ +</button>
          <button data-a="wall_dup">⧉ Копия</button><button data-a="wall_del" class="me-danger">🗑 Удалить</button>
        </div>
      </div>
      <div class="me-row">
        <button data-a="snap">Сетка: нет</button><button data-a="colliders">Коллизии</button>
        <button data-a="fit">Вся карта</button><button data-a="hero">К героине</button>
      </div>
      <div class="me-row" data-sec="props">
        <select data-r="palette"></select><button data-a="add">＋ Добавить</button>
      </div>
      <div class="me-row">
        <button data-a="check">Проверить проходимость</button>
        <button data-a="play" class="me-primary">▶ Играть с правками</button>
      </div>
      <div class="me-row">
        <button data-a="copy">Копировать правки</button><button data-a="download">Скачать world.edits.js</button>
        <button data-a="reset" class="me-danger">Сбросить черновик</button><button data-a="exit">Выйти</button>
      </div>
      <div class="me-status" data-r="status"></div>
      <div class="me-hint">Правки сохраняются в этом браузере сами. Чтобы они попали в игру для всех — «Скачать world.edits.js» и положить файл в src/config/ (или прислать мне). Дороги, река и стены хранятся в том же файле.</div>
    </div>`;
  document.body.appendChild(root);

  const sel = root.querySelector('[data-r=palette]');
  for (const g of PALETTE) {
    const og = document.createElement('optgroup');
    og.label = g.title;
    for (const k of g.keys) { const o = document.createElement('option'); o.value = k; o.textContent = propName(k); og.appendChild(o); }
    sel.appendChild(og);
  }
  const $ = (r) => root.querySelector(`[data-r=${r}]`);
  const btn = (a) => root.querySelector(`[data-a=${a}]`);

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a === 'min') { root.classList.toggle('me-min'); b.textContent = root.classList.contains('me-min') ? '▸' : '▾'; return; }
    if (a === 'add') { actions.add?.(sel.value); return; }
    if (a === 'wall_add') { actions.wall_add?.(root.querySelector('[data-r=wallkind]').value); return; }
    actions[a]?.();
  });
  sel.addEventListener('change', () => sel.blur());
  root.querySelector('[data-r=wallkind]').addEventListener('change', (e) => e.target.blur());
  root.dataset.mode = 'props';
  // клавиши редактора не должны уходить в поле выбора
  root.addEventListener('keydown', (e) => e.stopPropagation());

  return {
    root,
    setInfo(text) { $('info').textContent = text; },
    setStatus(text, warn = false) { const el = $('status'); el.textContent = text; el.classList.toggle('me-warn', warn); },
    setToggle(name, on, label) { const b = btn(name); b.classList.toggle('me-on', !!on); if (label) b.textContent = label; },
    setMode(m) {
      root.dataset.mode = m;
      for (const k of ['props', 'terrain', 'walls']) btn('mode_' + k).classList.toggle('me-on', k === m);
    },
    setEnabled(name, on) { const b = btn(name); if (b) b.disabled = !on; },
    destroy() { root.remove(); css.remove(); },
  };
}
