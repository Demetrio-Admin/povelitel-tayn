// Панель редактора карты — обычный HTML поверх игры (текстовые поля, список и кнопки удобнее на DOM).
// Не знает про Phaser: получает набор действий и возвращает методы обновления подписей.
import { ASSET_CATALOG, ASSET_GROUPS } from '../world/assetCatalog.js';
import { LOCATIONS } from '../config/locations.js';

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
#me-panel button,#me-panel select,#me-panel input{font:inherit;color:#f1e3c2;background:#4a3324;border:1px solid #b8923c88;border-radius:8px;padding:7px 10px;min-height:38px}
#me-panel [hidden]{display:none!important}
#me-panel input{width:100%;min-width:0;user-select:text}
#me-panel .me-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
#me-panel label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#ccb88e}
#me-panel .me-info{white-space:pre-line;font-size:13px}
#me-panel summary{cursor:pointer;color:#ead3a0;padding:6px 0;font-weight:700}
#me-panel .me-assets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;max-height:225px;overflow:auto;padding:4px 0}
#me-panel .me-assets button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:5px;font-size:11px;line-height:1.2;min-width:0}
#me-panel .me-assets img{width:64px;height:64px;object-fit:contain;background:#ead8aa18;border-radius:5px}
#me-panel .me-picked{display:flex;align-items:center;gap:8px;font-size:12px}
#me-panel .me-picked img{width:50px;height:50px;object-fit:contain}
#me-panel .me-inspector{padding-top:8px;border-top:1px solid #b8923c55}
@media(min-width:900px){#me-panel{top:12px;bottom:12px;left:12px;width:360px;max-height:calc(100vh - 24px)}#me-panel.me-min{bottom:auto}#me-panel .me-assets{max-height:270px}}
@media(max-width:500px){#me-panel input,#me-panel select{font-size:16px}#me-panel button{min-height:42px}}
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
      <div class="me-row"><select data-r="location" aria-label="Локация"><option value="">Перейти к локации…</option></select></div>
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
          <button data-a="road_joined">＋ Тропа без швов</button><button data-a="stone_joined">＋ Каменная без швов</button>
          <button data-a="road_borderless">＋ Вставка без краёв</button><button data-a="stone_borderless">＋ Каменная вставка без краёв</button>
          <button data-a="seamless">Стыки: со швом</button>
          <button data-a="borderless">Края: с каймой</button>
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
        <button data-a="fit">Вся карта</button><button data-a="hero">К герою</button>
      </div>
      <div data-sec="props">
        <details open>
          <summary>Каталог рисунков <span data-r="asset-count"></span></summary>
          <input type="search" data-r="asset-search" placeholder="Найти: фонарь, ящик, цветы…" aria-label="Поиск рисунков">
          <select data-r="asset-group" aria-label="Категория рисунков"><option value="all">Все картинки</option></select>
          <div class="me-assets" data-r="assets"></div>
          <div class="me-picked"><img data-r="asset-preview" alt=""><span data-r="asset-name"></span></div>
          <div class="me-row"><select data-r="placement" aria-label="Способ размещения"><option value="prop">Объект на карте</option><option value="ground">Участок пола / покрытия</option></select></div>
          <div class="me-row"><button data-a="add" class="me-primary">＋ Добавить</button><button data-a="replace">Заменить рисунок</button></div>
          <div class="me-hint">Картинки персонажей и монстров добавляются как декор. У существующих сюжетных объектов сохраняется поведение.</div>
        </details>
        <details>
          <summary>Объекты на карте</summary>
          <select data-r="entity-filter" aria-label="Тип объектов"><option value="all">Все объекты</option><option value="prop">Декор и растения</option><option value="col">Мебель и стены</option><option value="obj">Сюжетные объекты и NPC</option><option value="enemy">Враги</option><option value="ground">Полы и покрытия</option></select>
          <input type="search" data-r="entity-search" placeholder="Название или ID объекта" aria-label="Поиск объектов на карте">
          <select data-r="entities" aria-label="Выбрать объект"><option value="">Выберите объект…</option></select>
        </details>
        <div class="me-inspector" data-r="inspector" hidden>
          <div class="me-grid">
            <label>X<input data-p="x" type="number" step="1"></label><label>Y<input data-p="y" type="number" step="1"></label>
            <label>Ширина рисунка<input data-p="w" type="number" min="1" max="8000" step="1"></label><label>Высота рисунка<input data-p="h" type="number" min="1" max="8000" step="1"></label>
            <label>Масштаб<input data-p="s" type="number" min="0.05" max="10" step="0.05"></label><label>Поворот, °<input data-p="a" type="number" step="5"></label>
            <label>Непрозрачность<input data-p="alpha" type="number" min="0" max="1" step="0.1"></label>
            <label>Слой<select data-p="l"><option value="main">По высоте объекта</option><option value="back">Позади объектов</option><option value="front">Поверх объектов</option><option value="room-floor">На полу комнаты</option><option value="floor">На земле</option></select></label>
            <label>Коллизия<select data-p="collision"><option value="auto">По типу картинки</option><option value="none">Можно проходить</option><option value="custom">Свой размер</option></select></label>
            <label>Масштаб плитки<input data-p="tileScale" type="number" min="0.05" max="8" step="0.05"></label>
            <label>След: ширина<input data-p="solid_w" type="number" min="1" max="8000" step="1"></label><label>След: высота<input data-p="solid_h" type="number" min="1" max="8000" step="1"></label>
          </div>
        </div>
      </div>
      <div class="me-row">
        <button data-a="check">Проверить проходимость</button>
        <button data-a="play" class="me-primary">▶ Играть с правками</button>
      </div>
      <div class="me-row">
        <button data-a="import">Загрузить правки</button><input data-r="import" type="file" accept=".js,.json" hidden><button data-a="copy">Копировать правки</button><button data-a="download">Скачать world.edits.js</button>
        <button data-a="reset" class="me-danger">Сбросить черновик</button><button data-a="exit">Выйти</button>
      </div>
      <div class="me-status" data-r="status"></div>
      <div class="me-hint">Правки сохраняются в этом браузере сами. Чтобы они попали в игру для всех — «Скачать world.edits.js» и положить файл в src/config/ (или прислать мне). Дороги, река и стены хранятся в том же файле.</div>
    </div>`;
  document.body.appendChild(root);

  const $=r=>root.querySelector(`[data-r=${r}]`);
  const btn=a=>root.querySelector(`[data-a=${a}]`);
  let chosen='lantern_01',entities=[],lastEntities='';
  for(const [value,label] of Object.entries(ASSET_GROUPS)){const o=document.createElement('option');o.value=value;o.textContent=label;$('asset-group').appendChild(o);}
  for(const l of LOCATIONS){const o=document.createElement('option');o.value=l.id;o.textContent=l.name;$('location').appendChild(o);}
  const picked=()=>{
    const a=ASSET_CATALOG.find(a=>a.key===chosen);
    if(!a)return;
    $('asset-preview').src=a.src;$('asset-preview').alt=a.name;$('asset-name').textContent=a.name;
    for(const b of $('assets').querySelectorAll('[data-asset]'))b.classList.toggle('me-on',b.dataset.asset===chosen);
  };
  const renderAssets=()=>{
    const query=$('asset-search').value.trim().toLocaleLowerCase('ru'),group=$('asset-group').value;
    const shown=ASSET_CATALOG.filter(a=>(group==='all'||a.group===group)&&(`${a.name} ${a.key}`.toLocaleLowerCase('ru').includes(query)));
    if(shown.length&&!shown.some(a=>a.key===chosen))chosen=shown[0].key;
    $('assets').replaceChildren();
    for(const a of shown){
      const b=document.createElement('button');b.type='button';b.dataset.asset=a.key;b.title=`${a.name} (${a.key})`;
      const img=document.createElement('img');img.src=a.src;img.alt=a.name;img.loading='lazy';img.decoding='async';
      const label=document.createElement('span');label.textContent=a.name;b.append(img,label);$('assets').appendChild(b);
    }
    $('asset-count').textContent=`${shown.length} / ${ASSET_CATALOG.length}`;
    btn('add').disabled=!shown.length;picked();
  };
  const renderEntities=selected=>{
    const query=$('entity-search').value.trim().toLocaleLowerCase('ru');
    const shown=entities.filter(e=>`${e.name} ${e.id}`.toLocaleLowerCase('ru').includes(query));
    const signature=JSON.stringify(shown);
    if(signature!==lastEntities){
      lastEntities=signature;$('entities').replaceChildren();
      const first=document.createElement('option');first.value='';first.textContent=`Выбрать объект (${shown.length})…`;$('entities').appendChild(first);
      for(const e of shown){const o=document.createElement('option');o.value=e.id;o.textContent=e.name;$('entities').appendChild(o);}
    }
    $('entities').value=selected||'';
  };
  $('asset-search').addEventListener('input',renderAssets);$('asset-group').addEventListener('change',renderAssets);
  $('assets').addEventListener('click',e=>{const b=e.target.closest('[data-asset]');if(b){chosen=b.dataset.asset;picked();}});
  $('entity-search').addEventListener('input',()=>renderEntities($('entities').value));
  $('entities').addEventListener('change',e=>actions.select_entity?.(e.target.value));
  $('entity-filter').addEventListener('change',e=>actions.entity_filter?.(e.target.value));
  $('location').addEventListener('change',e=>actions.location?.(e.target.value));
  root.addEventListener('change',e=>{if(e.target.dataset.p)actions.property?.(e.target.dataset.p,e.target.value);});
  $('import').addEventListener('change',e=>actions.import?.(e.target.files?.[0]));
  renderAssets();

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a === 'min') { root.classList.toggle('me-min'); b.textContent = root.classList.contains('me-min') ? '▸' : '▾'; return; }
    if (a === 'add') { actions.add?.(chosen,$('placement').value); return; }
    if(a==='import'){$('import').click();return;}
    if(a==='replace'){actions.replace?.(chosen);return;}
    if (a === 'wall_add') { actions.wall_add?.(root.querySelector('[data-r=wallkind]').value); return; }
    actions[a]?.();
  });
  root.querySelector('[data-r=wallkind]').addEventListener('change', (e) => e.target.blur());
  root.dataset.mode = 'props';
  // клавиши редактора не должны уходить в поле выбора
  root.addEventListener('keydown', (e) => e.stopPropagation());

  return {
    root,
    setEntities(items,selected,filter){entities=items;$('entity-filter').value=filter;renderEntities(selected);},
    setInspector(e,values={}){
      $('inspector').hidden=!e;if(!e)return;
      const props={...values,s:values.s||1,a:values.a||0,alpha:values.alpha??1,l:values.l||'main',tileScale:values.tileScale||1,
        collision:e.kind==='prop'?(e.ref.p.solid===undefined||e.ref.p.solid==='auto'?'auto':e.ref.p.solid===null?'none':'custom'):'custom',solid_w:values.solid?.w||0,solid_h:values.solid?.h||0};
      for(const el of root.querySelectorAll('[data-p]')){
        const k=el.dataset.p;
        if(document.activeElement!==el)el.value=typeof props[k]==='number'?Math.round(props[k]*100)/100:props[k]??'';
        el.disabled=k==='collision'?e.kind!=='prop':k==='tileScale'?e.kind!=='ground':k.startsWith('solid_')?!['prop','col'].includes(e.kind):k==='s'&&e.kind==='ground'||['w','h','s','a','alpha','l'].includes(k)&&e.kind==='col'&&e.ref.kind!=='furniture';
      }
    },
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
