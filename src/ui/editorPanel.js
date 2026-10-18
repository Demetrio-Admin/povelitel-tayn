// Панель редактора карты — обычный HTML поверх игры (поля, списки и кнопки удобнее на DOM).
// Не знает про Phaser: получает набор действий и возвращает методы обновления.
// На ПК (широкий экран) панели стоят вокруг карты: сверху инструменты, слева каталог и списки, справа свойства,
// снизу строка состояния. Карта занимает всё остальное место. На телефоне то же самое — шторка снизу.
import {
  Trees, Route, BrickWall, Undo2, Redo2, Grid3x3, SquareDashed, ShieldCheck, Play, FileDown, CircleHelp,
  PanelLeftClose, PanelLeftOpen, ChevronDown, ZoomIn, ZoomOut, Expand, LocateFixed, Search, X, CopyPlus, FlipHorizontal2,
  Trash2, Minus, Plus, Paintbrush, Replace, AlignCenterHorizontal, AlignCenterVertical, StretchHorizontal, StretchVertical,
  Magnet, Spline, Link, CirclePlus, Waves, Droplets, Upload, Copy, RotateCcw, LogOut,
} from 'lucide';
import { ASSET_CATALOG } from '../world/assetCatalog.js';
import { LOCATIONS } from '../config/locations.js';

// lucide хранит значки как данные — превращаем их в разметку SVG без DOM (так панель работает и в тестах на Node).
const svg = ([tag, attrs, children = []]) =>
  `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}>${children.map(svg).join('')}</${tag}>`;
const ic = (node) => svg([node[0], { ...node[1], width: 18, height: 18, class: 'me-ic', 'aria-hidden': 'true' }, node[2]]);

const GROUPS = [
  ['nature', 'Природа'], ['town', 'Город'], ['furniture', 'Мебель'], ['objects', 'Предметы'], ['ground', 'Полы и стены'],
  ['animals', 'Животные'], ['characters', 'Персонажи'], ['enemies', 'Монстры'], ['portraits', 'Портреты'], ['backgrounds', 'Фоны'], ['ui', 'Иконки'],
];
const GROUP_RANK = Object.fromEntries(GROUPS.map(([g], i) => [g, i]));
// Портреты, фоны и иконки на карту ставят редко — у них одна общая кнопка.
const CHIPS = [['nature', 'Природа'], ['town', 'Город'], ['furniture', 'Мебель'], ['objects', 'Предметы'], ['ground', 'Полы и стены'],
  ['animals', 'Животные'], ['characters', 'Персонажи'], ['enemies', 'Монстры'], ['interface', 'Интерфейс']];
const CHIP_GROUPS = { interface: ['portraits', 'backgrounds', 'ui'] };
const inChip = (chip, g) => chip === 'all' || chip === g || (CHIP_GROUPS[chip] || []).includes(g);
// Каталог: сначала то, что ставят на карту, иконки интерфейса и портреты — в конце.
const CATALOG = ASSET_CATALOG.map((a, i) => ({ ...a, i })).sort((a, b) => (GROUP_RANK[a.group] ?? 99) - (GROUP_RANK[b.group] ?? 99) || a.i - b.i);
const FILTERS = [['all', 'Все'], ['prop', 'Декор'], ['col', 'Дома и мебель'], ['obj', 'Сюжет и NPC'], ['enemy', 'Враги'], ['ground', 'Полы']];
export const WALL_KINDS = [['wall', 'Стена дома'], ['citywall', 'Городская стена'], ['fence', 'Ограда сада'], ['ruin', 'Руины'], ['trees', 'Лес (непроходимо)'], ['furniture', 'Мебель']];
const RECENT_KEY = 'witch_rpg_editor_recent_v1';
const LIST_LIMIT = 300;

const CSS = `
#me-panel{--me-bg:#1d1510;--me-bg2:#271c15;--me-bg3:#33251b;--me-line:#4b3826;--me-brass:#c9a24f;--me-brass2:#e7c77c;
  --me-text:#efe2c4;--me-muted:#a69378;--me-teal:#4fe3c1;--me-warn:#ff9a8a;
  position:fixed;left:8px;bottom:8px;z-index:50;width:min(420px,calc(100vw - 16px));max-height:58vh;overflow:auto;overscroll-behavior:contain;
  display:flex;flex-direction:column;background:var(--me-bg);border:1px solid var(--me-brass);border-radius:12px;box-shadow:0 10px 30px #000b;
  color:var(--me-text);font:14px/1.35 'PT Sans',system-ui,sans-serif;touch-action:pan-y;-webkit-user-select:none;user-select:none}
#me-panel *{box-sizing:border-box}
#me-panel [hidden]{display:none!important}
#me-panel .me-ic{width:18px;height:18px;flex:none}
#me-panel button,#me-panel select,#me-panel input:not([type=checkbox]){font:inherit;color:var(--me-text);background:var(--me-bg3);
  border:1px solid var(--me-line);border-radius:8px;min-height:40px;padding:6px 10px}
#me-panel button{display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;text-align:left}
#me-panel button:hover:not(:disabled){border-color:#7a5d38;background:#3d2c20}
#me-panel button:active:not(:disabled){background:#4c3726}
#me-panel button:disabled{opacity:.38;cursor:default}
#me-panel button.me-on{background:#4a381c;border-color:var(--me-brass);color:var(--me-brass2)}
#me-panel button.me-primary{background:#8d6b25;border-color:var(--me-brass2);color:#fff6df;font-weight:700}
#me-panel button.me-primary:hover:not(:disabled){background:#a07a2b}
#me-panel button.me-danger{color:var(--me-warn);border-color:#7a3a32}
#me-panel input{width:100%;min-width:0;user-select:text;-webkit-user-select:text}
#me-panel input[type=checkbox]{width:16px;height:16px;accent-color:var(--me-brass)}
#me-panel select{min-width:0;cursor:pointer}
#me-panel :focus-visible{outline:2px solid var(--me-brass2);outline-offset:1px}
#me-panel kbd{font:12px/1 'PT Sans',sans-serif;padding:2px 5px;border:1px solid var(--me-line);border-bottom-width:2px;border-radius:4px;color:var(--me-muted);background:var(--me-bg2);white-space:nowrap}
#me-panel h3{margin:4px 0 2px;font:700 12.5px/1.3 'PT Sans',sans-serif;color:var(--me-muted)}
#me-panel p{margin:0}
#me-panel .me-row{display:flex;flex-wrap:wrap;gap:6px}
#me-panel .me-row>button{flex:1 1 auto}
#me-panel .me-hint{font-size:12.5px;color:var(--me-muted)}
#me-panel .me-warn{color:var(--me-warn)}
#me-panel .me-bar{display:contents}
#me-panel .me-tools{order:0}
#me-panel button kbd,#me-panel .me-desk{display:none}
html.me-desktop #me-panel button kbd{display:inline}
html.me-desktop #me-panel .me-desk{display:block}
#me-panel .me-head{order:-1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px 6px 12px;position:sticky;top:0;z-index:3;
  background:var(--me-bg);border-bottom:1px solid var(--me-line)}
#me-panel .me-brand{font:700 15px/1.2 'Philosopher',Georgia,serif;color:var(--me-brass2);white-space:nowrap}
#me-panel .me-tools{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;align-items:center}
#me-panel .me-tools button{white-space:nowrap}
#me-panel .me-tools .me-fill{display:none}
#me-panel .me-seg{display:flex;flex:1 1 100%}
#me-panel .me-seg>button{flex:1 1 0;border-radius:0;font-weight:700}
#me-panel .me-seg>button:first-child{border-radius:8px 0 0 8px}
#me-panel .me-seg>button:last-child{border-radius:0 8px 8px 0}
#me-panel .me-seg>button+button{margin-left:-1px}
#me-panel .me-lbl-wide{display:none}
#me-panel .me-snap{display:inline-flex;align-items:center;gap:4px;color:var(--me-muted)}
#me-panel .me-file{position:relative}
#me-panel .me-file-menu{display:flex;flex-wrap:wrap;gap:6px;flex:1 1 100%;padding:8px;border:1px solid var(--me-line);border-radius:10px;background:var(--me-bg2)}
#me-panel .me-file-menu button{flex:1 1 auto}
#me-panel .me-file-menu kbd{margin-left:auto}
#me-panel .me-left,#me-panel .me-right{display:flex;flex-direction:column;gap:8px;padding:8px 10px}
#me-panel .me-right{order:1}
#me-panel .me-left{order:2;border-top:1px solid var(--me-line)}
#me-panel .me-status{order:3}
#me-panel:not([data-mode=props]) [data-sec=props],#me-panel:not([data-mode=terrain]) [data-sec=terrain],#me-panel:not([data-mode=walls]) [data-sec=walls]{display:none!important}
#me-panel:not([data-tab=catalog]) [data-pane=catalog],#me-panel:not([data-tab=list]) [data-pane=list]{display:none!important}
#me-panel .me-tabs{display:flex;gap:4px}
#me-panel .me-tabs button{flex:1 1 0;font-weight:700}
#me-panel .me-search{position:relative}
#me-panel .me-search .me-ic{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--me-muted);pointer-events:none}
#me-panel .me-search input{padding-left:34px}
#me-panel .me-chips{display:flex;flex-wrap:wrap;gap:4px}
#me-panel .me-chips button{min-height:30px;padding:3px 9px;border-radius:999px;font-size:12.5px}
#me-panel .me-chips button small{color:var(--me-muted);font-size:11px}
#me-panel .me-chips button.me-on small{color:inherit}
#me-panel .me-assets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:max-content;gap:6px;max-height:230px;overflow:auto;padding:2px}
#me-panel .me-assets button{flex-direction:column;gap:4px;padding:5px;font-size:11.5px;line-height:1.2;min-width:0;text-align:center;justify-content:flex-start}
#me-panel .me-assets button span:last-child{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#me-panel .me-assets img,#me-panel .me-art{width:60px;height:60px;object-fit:contain;background:#ead8aa14;border-radius:6px;flex:none}
#me-panel .me-art{display:flex;align-items:center;justify-content:center}
#me-panel .me-art canvas{max-width:100%;max-height:100%}
#me-panel .me-recent{display:flex;gap:4px;overflow-x:auto;padding-bottom:2px}
#me-panel .me-recent button{padding:2px;min-height:0;flex:none}
#me-panel .me-recent img,#me-panel .me-recent .me-art{width:38px;height:38px}
#me-panel .me-picked{display:flex;align-items:center;gap:10px;min-height:52px}
#me-panel .me-picked img,#me-panel .me-picked .me-art{width:48px;height:48px;object-fit:contain}
#me-panel .me-picked b{display:block;font-size:13.5px}
#me-panel .me-picked small,#me-panel .me-sel small{display:block;color:var(--me-muted);font-size:11.5px;word-break:break-all}
#me-panel .me-placing{display:flex;flex-direction:column;gap:6px}
#me-panel .me-check{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--me-muted);cursor:pointer}
#me-panel .me-items{display:flex;flex-direction:column;gap:1px;max-height:260px;overflow:auto}
#me-panel .me-items .me-gh{position:sticky;top:0;background:var(--me-bg);color:var(--me-brass);font-size:12px;font-weight:700;padding:6px 4px 3px;z-index:1}
#me-panel .me-items>*{flex:none}
#me-panel .me-items button{justify-content:flex-start;min-height:32px;padding:4px 8px;border-color:transparent;background:none;border-radius:6px;font-size:13px;width:100%}
#me-panel .me-items button small{margin-left:auto;color:var(--me-muted);font-size:11px;padding-left:8px;white-space:nowrap}
#me-panel .me-items button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#me-panel .me-items button.me-on{background:#1f3b33;border-color:var(--me-teal);color:#d9fff4}
#me-panel .me-items .me-more{padding:6px;color:var(--me-muted);font-size:12px}
#me-panel .me-info{white-space:pre-line;font-size:13px;color:#f3dfa6;min-height:1.4em}
#me-panel .me-sel{display:flex;align-items:center;gap:10px}
#me-panel .me-sel .me-art,#me-panel .me-sel img{width:44px;height:44px;object-fit:contain}
#me-panel .me-sel b{display:block;font-size:14px}
#me-panel .me-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 8px}
#me-panel .me-grid label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--me-muted)}
#me-panel .me-grid label.me-wide{grid-column:1/-1}
#me-panel .me-grid input,#me-panel .me-grid select{min-height:34px;padding:4px 8px}
#me-panel .me-fs{display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid var(--me-line)}
#me-panel .me-acts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
#me-panel .me-acts button{justify-content:flex-start}
#me-panel .me-acts button kbd{margin-left:auto}
#me-panel .me-tips{display:none}
#me-panel .me-tips dl{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;margin:0;font-size:12.5px}
#me-panel .me-tips dt{color:var(--me-brass2);white-space:nowrap}
#me-panel .me-tips dd{margin:0;color:var(--me-muted)}
html.me-desktop #me-panel .me-tips:not([hidden]){display:flex}
#me-panel details.me-more-tools summary{cursor:pointer;color:var(--me-muted);font-size:12.5px;padding:4px 0}
#me-panel .me-status{display:flex;flex-wrap:wrap;gap:4px 12px;padding:8px 10px 10px;border-top:1px solid var(--me-line);font-size:12.5px;color:var(--me-muted)}
#me-panel .me-status [data-r=cursor],#me-panel .me-status [data-r=zoom-status]{display:none}
#me-panel .me-msg{flex:1 1 100%;white-space:pre-line;color:#c9b58f}
#me-panel .me-msg.me-warn{color:var(--me-warn)}
#me-panel .me-saved{display:inline-flex;align-items:center;gap:6px}
#me-panel .me-saved button{min-height:26px;padding:2px 8px;font-size:12px}
#me-panel.me-min .me-tools,#me-panel.me-min .me-left,#me-panel.me-min .me-right,#me-panel.me-min .me-status{display:none}
#me-panel.me-min .me-head{border-bottom:0}
/* плавающие элементы над картой */
#me-panel .me-mapctl{position:fixed;top:10px;right:10px;z-index:4;display:flex;gap:4px;padding:4px;border:1px solid var(--me-line);border-radius:10px;background:#1d1510e6;box-shadow:0 4px 14px #0008}
#me-panel .me-mapctl button{min-height:34px;min-width:34px;padding:4px 6px}
#me-panel .me-mapctl [data-a=zoom_reset]{min-width:58px;font-variant-numeric:tabular-nums}
#me-panel .me-tip{position:fixed;z-index:6;pointer-events:none;max-width:320px;padding:4px 8px;border-radius:6px;background:#120c08ee;border:1px solid var(--me-line);font-size:12.5px;color:var(--me-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#me-panel .me-tip small{color:var(--me-muted);margin-left:6px}
#me-panel .me-menu{position:fixed;z-index:7;min-width:230px;padding:5px;border:1px solid var(--me-brass);border-radius:10px;background:var(--me-bg);box-shadow:0 10px 28px #000c;display:flex;flex-direction:column;gap:1px}
#me-panel .me-menu button{justify-content:flex-start;border-color:transparent;background:none;min-height:32px;padding:4px 10px;font-size:13px}
#me-panel .me-menu button:hover:not(:disabled){background:#3d2c20}
#me-panel .me-menu button kbd{margin-left:auto}
#me-panel .me-menu hr{border:0;border-top:1px solid var(--me-line);margin:3px 4px}
#me-panel .me-menu .me-mh{padding:4px 10px 2px;font-size:12px;color:var(--me-brass);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px}
#me-panel .me-pop{position:fixed;z-index:5;top:10px;left:10px;right:10px;max-height:45vh;overflow:auto;padding:10px;border:1px solid var(--me-brass);border-radius:12px;background:var(--me-bg);box-shadow:0 10px 28px #000c;display:flex;flex-direction:column;gap:6px}
#me-panel .me-pop header{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:700;color:var(--me-brass2)}
#me-panel .me-pop header button{min-height:30px;min-width:30px;padding:2px}
#me-panel .me-pop .me-items{max-height:none}
#me-panel .me-pop .me-items button{white-space:normal;align-items:flex-start;text-align:left}
#me-panel .me-help{position:fixed;inset:0;z-index:8;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px}
#me-panel .me-help>div{position:relative;width:min(860px,100%);max-height:100%;overflow:auto;padding:18px 20px;border:1px solid var(--me-brass);border-radius:14px;background:var(--me-bg);box-shadow:0 18px 50px #000d;user-select:text;-webkit-user-select:text}
#me-panel .me-help h2{margin:0 0 10px;font:700 21px/1.2 'Philosopher',Georgia,serif;color:var(--me-brass2)}
#me-panel .me-help h3{margin:14px 0 6px;font:700 15px/1.2 'Philosopher',Georgia,serif;color:var(--me-brass2)}
#me-panel .me-help .me-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0 28px}
#me-panel .me-help dl{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0;font-size:13.5px}
#me-panel .me-help dt{color:var(--me-brass2);white-space:nowrap}
#me-panel .me-help dd{margin:0;color:var(--me-text)}
#me-panel .me-help ol{margin:0;padding-left:20px;font-size:13.5px;display:flex;flex-direction:column;gap:4px}
#me-panel .me-help [data-a=help_close]{position:absolute;top:10px;right:10px;min-height:34px;min-width:34px;padding:2px}
@media(max-width:500px){#me-panel input,#me-panel select{font-size:16px}#me-panel button{min-height:42px}}
/* ---------------- ПК: панели вокруг карты ---------------- */
html.me-desktop{--me-l:288px;--me-r:276px;--me-t:50px;--me-b:30px}
html.me-desktop.me-nopanels{--me-l:0px;--me-r:0px}
@media(min-width:1600px){html.me-desktop{--me-l:320px;--me-r:300px}}
html.me-desktop body{background:#120d0b}
html.me-desktop #game{left:var(--me-l);top:var(--me-t);width:calc(100vw - var(--me-l) - var(--me-r));height:calc(100vh - var(--me-t) - var(--me-b))}
html.me-desktop #game canvas{box-shadow:none}
html.me-desktop #me-panel{inset:0;width:auto;max-height:none;overflow:visible;display:grid;border:0;border-radius:0;background:none;box-shadow:none;pointer-events:none;
  grid-template-columns:var(--me-l) 1fr var(--me-r);grid-template-rows:var(--me-t) minmax(0,1fr) var(--me-b);
  grid-template-areas:"top top top" "left map right" "status status status";font-size:13px;touch-action:auto}
html.me-desktop #me-panel>*{pointer-events:auto}
html.me-desktop #me-panel button,html.me-desktop #me-panel select,html.me-desktop #me-panel input:not([type=checkbox]){min-height:32px;padding:4px 9px;border-radius:7px}
html.me-desktop #me-panel .me-bar{grid-area:top;display:flex;align-items:center;gap:8px;padding:0 10px;background:var(--me-bg);border-bottom:1px solid var(--me-line);min-width:0}
html.me-desktop #me-panel .me-head{display:contents}
html.me-desktop #me-panel .me-brand{order:0;padding-right:4px}
html.me-desktop #me-panel [data-a=min]{order:2}
html.me-desktop #me-panel .me-tools{order:1;flex:1 1 auto;flex-wrap:nowrap;padding:0;gap:6px;min-width:0}
html.me-desktop #me-panel .me-tools .me-fill{display:block;flex:1 1 auto}
html.me-desktop #me-panel .me-seg{flex:none}
html.me-desktop #me-panel .me-seg>button{padding:4px 12px}
html.me-desktop #me-panel .me-tools select{max-width:190px}
html.me-desktop #me-panel .me-file-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:7;flex-direction:column;flex-wrap:nowrap;width:280px;padding:5px;gap:1px;
  border-color:var(--me-brass);background:var(--me-bg);box-shadow:0 10px 28px #000c}
html.me-desktop #me-panel .me-file-menu button{justify-content:flex-start;border-color:transparent;background:none}
html.me-desktop #me-panel .me-file-menu button:hover:not(:disabled){background:#3d2c20}
html.me-desktop #me-panel .me-left{grid-area:left;order:0;border-top:0;border-right:1px solid var(--me-line);background:var(--me-bg);min-height:0;overflow:hidden;padding:10px}
html.me-desktop #me-panel .me-right{grid-area:right;order:0;border-left:1px solid var(--me-line);background:var(--me-bg);min-height:0;overflow:auto;padding:10px}
html.me-desktop #me-panel .me-assets{max-height:none;flex:1 1 0;min-height:120px;align-content:start}
html.me-desktop #me-panel .me-items{max-height:none;flex:1 1 0;min-height:80px}
html.me-desktop #me-panel .me-left>section{display:flex;flex-direction:column;gap:8px;min-height:0}
html.me-desktop #me-panel .me-left>*{flex:none}
html.me-desktop #me-panel .me-left>section>*:not(.me-assets):not(.me-items){flex:none}
html.me-desktop #me-panel .me-search input{padding-left:32px}
html.me-desktop #me-panel .me-left>section.me-grow{flex:1 1 0}
html.me-desktop #me-panel .me-right>*{flex:none}
html.me-desktop #me-panel .me-placing{border-top:1px solid var(--me-line);padding-top:8px}
html.me-desktop #me-panel .me-status{grid-area:status;order:0;flex-wrap:nowrap;align-items:center;gap:0;padding:0 4px;border-top:1px solid var(--me-line);background:var(--me-bg);white-space:nowrap;overflow:hidden}
html.me-desktop #me-panel .me-status>*{padding:0 10px;border-right:1px solid var(--me-line);line-height:18px}
html.me-desktop #me-panel .me-status>*:last-child{border-right:0}
html.me-desktop #me-panel .me-status [data-r=cursor],html.me-desktop #me-panel .me-status [data-r=zoom-status]{display:block;font-variant-numeric:tabular-nums}
html.me-desktop #me-panel .me-status>:empty{display:none}
html.me-desktop #me-panel .me-msg{flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
html.me-desktop #me-panel .me-mapctl{top:auto;right:calc(var(--me-r) + 12px);bottom:calc(var(--me-b) + 12px)}
html.me-desktop #me-panel .me-pop{top:calc(var(--me-t) + 10px);left:auto;right:calc(var(--me-r) + 12px);width:360px;max-height:calc(100vh - var(--me-t) - var(--me-b) - 90px)}
html.me-desktop.me-nopanels #me-panel .me-left,html.me-desktop.me-nopanels #me-panel .me-right{display:none}
html.me-desktop #me-panel .me-chips{gap:3px}
html.me-desktop #me-panel .me-chips button{min-height:24px;padding:1px 7px;font-size:12px}
html.me-desktop #me-panel .me-chips button small{display:none}
@media(min-width:1500px){html.me-desktop #me-panel .me-lbl-wide{display:inline}}
@media(max-width:1499px){html.me-desktop #me-panel .me-brand{display:none}}
@media(max-width:1279px){html.me-desktop #me-panel .me-lbl-mid{display:none}html.me-desktop #me-panel .me-tools select{max-width:150px}}
`;

const HELP = `
<div role="dialog" aria-modal="true" aria-labelledby="me-help-title">
  <button data-a="help_close" title="Закрыть (Esc)" aria-label="Закрыть">${ic(X)}</button>
  <h2 id="me-help-title">Как работать в редакторе</h2>
  <ol>
    <li>Выберите режим сверху: <b>Объекты</b>, <b>Дороги и вода</b> или <b>Стены</b>.</li>
    <li>Найдите картинку в каталоге слева и перетащите её на карту. Или выберите её и нажмите «Кисть»: каждый клик по карте ставит копию.</li>
    <li>Щёлкните объект, чтобы выбрать. Точные значения — справа, в свойствах. Отмена — <kbd>Ctrl</kbd>+<kbd>Z</kbd>.</li>
    <li>Перед выходом нажмите «Проверить»: редактор найдёт места, куда стало нельзя дойти.</li>
    <li>Правки сами сохраняются в этом браузере. Чтобы они попали в игру для всех: <b>Файл → Скачать world.edits.js</b> и замените им <code>src/config/world.edits.js</code>.</li>
  </ol>
  <div class="me-cols">
    <section><h3>Мышь</h3><dl>
      <dt>Клик</dt><dd>выбрать объект, линию или стену</dd>
      <dt>Shift / Ctrl + клик</dt><dd>добавить к выбору или убрать из него</dd>
      <dt>Shift + рамка</dt><dd>зажмите Shift и тяните — выберется всё в рамке</dd>
      <dt>Тянуть объект</dt><dd>переместить его вместе со всеми выбранными</dd>
      <dt>Alt + тянуть</dt><dd>переместить копию, оригинал останется на месте</dd>
      <dt>Тянуть пустое место</dt><dd>двигать карту; также средняя и правая кнопка или пробел</dd>
      <dt>Колесо</dt><dd>масштаб под курсором</dd>
      <dt>Правый клик</dt><dd>меню действий для того, что под курсором</dd>
      <dt>Картинка → карта</dt><dd>перетащите из каталога, чтобы поставить в точку</dd>
      <dt>Дороги</dt><dd>двойной клик по линии — новая точка; Alt + клик по точке — убрать её; тяните выбранную линию — сдвинуть её целиком</dd>
      <dt>Стены</dt><dd>тяните прямоугольник — двигать, квадратики по краям — менять размер</dd>
    </dl></section>
    <section><h3>Клавиши</h3><dl>
      <dt><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></dt><dd>режимы: объекты, дороги, стены</dd>
      <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></dt><dd>отменить / повторить</dd>
      <dt><kbd>Ctrl</kbd>+<kbd>C</kbd> <kbd>X</kbd> <kbd>V</kbd></dt><dd>копировать, вырезать, вставить под курсор</dd>
      <dt><kbd>D</kbd> или <kbd>Ctrl</kbd>+<kbd>D</kbd></dt><dd>копия рядом</dd>
      <dt><kbd>Ctrl</kbd>+<kbd>A</kbd></dt><dd>выбрать всё в локации (с учётом фильтра)</dd>
      <dt><kbd>Delete</kbd></dt><dd>удалить выбранное</dd>
      <dt>Стрелки</dt><dd>сдвиг на 1 пиксель, с <kbd>Shift</kbd> — на 10; без выбора — двигают карту</dd>
      <dt><kbd>F</kbd> <kbd>R</kbd></dt><dd>зеркало; поворот на 15° (<kbd>Shift</kbd>+<kbd>R</kbd> — обратно)</dd>
      <dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>больше / меньше; без выбора — масштаб карты</dd>
      <dt><kbd>B</kbd></dt><dd>кисть: ставить выбранную картинку кликом</dd>
      <dt><kbd>G</kbd> <kbd>C</kbd></dt><dd>сетка; показать непроходимые места</dd>
      <dt><kbd>Ctrl</kbd>+<kbd>0</kbd> / <kbd>Ctrl</kbd>+<kbd>1</kbd></dt><dd>локация целиком / масштаб 100%</dd>
      <dt><kbd>Tab</kbd></dt><dd>спрятать панели и смотреть на всю карту</dd>
      <dt><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd></dt><dd>скачать world.edits.js</dd>
      <dt><kbd>Esc</kbd></dt><dd>закончить кисть, закрыть меню, снять выбор</dd>
      <dt><kbd>?</kbd></dt><dd>эта справка</dd>
    </dl></section>
  </div>
</div>`;

export function buildEditorPanel(actions) {
  const css = document.createElement('style');
  css.textContent = CSS;
  document.head.appendChild(css);
  const html = document.documentElement;
  html?.classList.add('me-editor');

  const root = document.createElement('div');
  root.id = 'me-panel';
  root.innerHTML = `
    <div class="me-bar">
      <div class="me-head">
        <span class="me-brand">Редактор карты</span>
        <button data-a="min" title="Свернуть панель" aria-label="Свернуть панель">${ic(ChevronDown)}</button>
      </div>
      <div class="me-tools" role="toolbar" aria-label="Инструменты редактора">
        <div class="me-seg" role="tablist" aria-label="Что править">
          <button data-a="mode_props" title="Объекты: деревья, дома, мебель, NPC — всё, что стоит на карте (1)">${ic(Trees)}<span class="me-lbl-mid">Объекты</span></button>
          <button data-a="mode_terrain" title="Дороги и вода: дороги, ручей, канал и водоёмы (2)">${ic(Route)}<span class="me-lbl-mid">Дороги и вода</span></button>
          <button data-a="mode_walls" title="Стены: непроходимые прямоугольники — стены, ограды, лес (3)">${ic(BrickWall)}<span class="me-lbl-mid">Стены</span></button>
        </div>
        <button data-a="undo" title="Отменить (Ctrl+Z)">${ic(Undo2)}<span class="me-lbl-wide">Отмена</span></button>
        <button data-a="redo" title="Повторить (Ctrl+Y)">${ic(Redo2)}<span class="me-lbl-wide">Повтор</span></button>
        <select data-r="location" aria-label="Перейти к локации" title="Перейти к локации"><option value="">Перейти к локации…</option><option value="all">Все локации сразу</option></select>
        <label class="me-snap" title="Сетка: объекты и точки встают на её узлы (G)">${ic(Grid3x3)}<select data-r="snap" aria-label="Сетка">
          <option value="0">Без сетки</option><option value="8">Сетка 8</option><option value="16">Сетка 16</option><option value="32">Сетка 32</option><option value="64">Сетка 64</option></select></label>
        <button data-a="colliders" title="Подсветить места, через которые нельзя пройти (C)">${ic(SquareDashed)}<span class="me-lbl-mid">Коллизии</span></button>
        <span class="me-fill"></span>
        <button data-a="check" title="Проверить, что до всех мест можно дойти">${ic(ShieldCheck)}<span class="me-lbl-mid">Проверить</span></button>
        <button data-a="play" class="me-primary" title="Запустить игру с этими правками">${ic(Play)}<span>Играть<span class="me-lbl-wide"> с правками</span></span></button>
        <div class="me-file">
          <button data-a="file" title="Скачать, загрузить или сбросить правки" aria-haspopup="true">${ic(FileDown)}<span>Файл</span></button>
          <div class="me-file-menu" data-r="file-menu" hidden>
            <button data-a="download">${ic(FileDown)}Скачать world.edits.js<kbd>Ctrl+Shift+S</kbd></button>
            <button data-a="copy">${ic(Copy)}Копировать правки</button>
            <button data-a="import">${ic(Upload)}Загрузить правки из файла…</button>
            <button data-a="reset" class="me-danger">${ic(RotateCcw)}Сбросить черновик</button>
            <button data-a="exit">${ic(LogOut)}Выйти из редактора</button>
          </div>
          <input data-r="import" type="file" accept=".js,.json" hidden>
        </div>
        <button data-a="help" title="Справка и горячие клавиши (?)" aria-label="Справка">${ic(CircleHelp)}</button>
      </div>
    </div>

    <aside class="me-left" aria-label="Каталог и списки">
      <div class="me-tabs" data-sec="props">
        <button data-tabbtn="catalog" title="Картинки, которые можно поставить на карту">Каталог</button>
        <button data-tabbtn="list" title="Всё, что уже стоит на карте">Объекты на карте</button>
      </div>
      <section class="me-grow" data-sec="props" data-pane="catalog">
        <div class="me-search">${ic(Search)}<input type="search" data-r="asset-search" placeholder="Найти: фонарь, ящик, цветы…" aria-label="Поиск картинок"></div>
        <div class="me-chips" data-r="asset-groups" aria-label="Категории"></div>
        <div class="me-recent" data-r="recent" aria-label="Недавние" hidden></div>
        <div class="me-assets" data-r="assets"></div>
      </section>
      <section class="me-placing" data-sec="props" data-pane="catalog">
        <div class="me-picked"><span data-r="asset-preview"></span><div><b data-r="asset-name"></b><small data-r="asset-key"></small></div></div>
        <select data-r="placement" aria-label="Как поставить"><option value="prop">Поставить как объект</option><option value="ground">Поставить как участок пола</option></select>
        <div class="me-row">
          <button data-a="add" class="me-primary" title="Поставить в центр карты (двойной клик по картинке — то же самое)">${ic(Plus)}В центр карты</button>
          <button data-a="brush" title="Каждый клик по карте ставит эту картинку (B). Esc — закончить">${ic(Paintbrush)}Кисть</button>
        </div>
        <label class="me-check"><input type="checkbox" data-r="brush-vary">Разные копии: случайное зеркало и размер ±10%</label>
        <p class="me-hint me-desk">Перетащите картинку на карту — она встанет туда, где отпустите.</p>
      </section>
      <section class="me-grow" data-sec="props" data-pane="list">
        <div class="me-chips" data-r="entity-filter" aria-label="Что показывать и выбирать"></div>
        <div class="me-search">${ic(Search)}<input type="search" data-r="entity-search" placeholder="Название или ID" aria-label="Поиск объектов на карте"></div>
        <div class="me-items" data-r="entities"></div>
      </section>
      <section class="me-grow" data-sec="terrain">
        <h3>Дороги и вода на карте</h3>
        <div class="me-search">${ic(Search)}<input type="search" data-r="shape-search" placeholder="Название или ID" aria-label="Поиск линий"></div>
        <div class="me-items" data-r="shapes"></div>
      </section>
      <section class="me-grow" data-sec="walls">
        <h3>Стены и непроходимые зоны</h3>
        <div class="me-search">${ic(Search)}<input type="search" data-r="wall-search" placeholder="Тип, подпись или ID" aria-label="Поиск стен"></div>
        <div class="me-items" data-r="walls"></div>
      </section>
    </aside>

    <aside class="me-right" aria-label="Свойства">
      <div class="me-sel" data-r="sel-head" hidden><span data-r="sel-art"></span><div><b data-r="sel-name"></b><small data-r="sel-sub"></small></div></div>
      <div class="me-info" data-r="info">Щёлкните объект, чтобы выбрать.</div>

      <div class="me-fs me-tips" data-sec="props" data-r="tips">
        <h3>Быстрые приёмы</h3>
        <dl>
          <dt>Колесо мыши</dt><dd>масштаб под курсором</dd>
          <dt>Тянуть пустое место</dt><dd>двигать карту (или правой кнопкой)</dd>
          <dt>Правый клик</dt><dd>меню действий</dd>
          <dt>Shift + рамка</dt><dd>выбрать несколько</dd>
          <dt>Картинку на карту</dt><dd>перетащите из каталога слева</dd>
          <dt><kbd>?</kbd></dt><dd>все клавиши и подсказки</dd>
        </dl>
      </div>
      <div data-sec="props" class="me-acts" data-r="props-acts" hidden>
        <button data-a="dup" title="Копия рядом (D)">${ic(CopyPlus)}Копия<kbd>D</kbd></button>
        <button data-a="flip" title="Отразить (F)">${ic(FlipHorizontal2)}Зеркало<kbd>F</kbd></button>
        <button data-a="smaller" title="Меньше (−)">${ic(Minus)}Меньше<kbd>−</kbd></button>
        <button data-a="bigger" title="Больше (+)">${ic(Plus)}Больше<kbd>+</kbd></button>
        <button data-a="delete" class="me-danger" title="Удалить (Delete)">${ic(Trash2)}Удалить<kbd>Del</kbd></button>
        <button data-a="replace" title="Поставить вместо рисунка картинку, выбранную в каталоге">${ic(Replace)}Заменить</button>
      </div>
      <div class="me-fs" data-sec="props" data-r="multi" hidden>
        <h3>Выровнять выбранные</h3>
        <div class="me-acts">
          <button data-a="align_y" title="Поставить на одну горизонтальную линию">${ic(AlignCenterHorizontal)}В ряд</button>
          <button data-a="align_x" title="Поставить на одну вертикальную линию">${ic(AlignCenterVertical)}В столбец</button>
          <button data-a="spread_x" title="Равные промежутки слева направо">${ic(StretchHorizontal)}Поровну ↔</button>
          <button data-a="spread_y" title="Равные промежутки сверху вниз">${ic(StretchVertical)}Поровну ↕</button>
        </div>
      </div>
      <div class="me-fs" data-sec="props" data-r="inspector" hidden>
        <div class="me-grid">
          <label>X<input data-p="x" type="number" step="1"></label><label>Y (низ объекта)<input data-p="y" type="number" step="1"></label>
          <label>Ширина рисунка<input data-p="w" type="number" min="1" max="8000" step="1"></label><label>Высота рисунка<input data-p="h" type="number" min="1" max="8000" step="1"></label>
          <label>Масштаб<input data-p="s" type="number" min="0.05" max="10" step="0.05"></label><label>Поворот, °<input data-p="a" type="number" step="5"></label>
          <label>Непрозрачность<input data-p="alpha" type="number" min="0" max="1" step="0.1"></label>
          <label>Масштаб плитки<input data-p="tileScale" type="number" min="0.05" max="8" step="0.05"></label>
          <label class="me-wide">Слой<select data-p="l"><option value="main">По высоте объекта (обычно)</option><option value="back">Позади всех объектов</option><option value="front">Поверх всех объектов</option><option value="room-floor">На полу комнаты</option><option value="floor">На земле</option><option value="ground">Под дорогами</option></select></label>
          <label class="me-wide">Проход<select data-p="collision"><option value="auto">Как обычно у этой картинки</option><option value="none">Можно проходить насквозь</option><option value="custom">Препятствие своего размера</option></select></label>
          <label>Препятствие: ширина<input data-p="solid_w" type="number" min="1" max="8000" step="1"></label><label>Препятствие: высота<input data-p="solid_h" type="number" min="1" max="8000" step="1"></label>
        </div>
        <p class="me-hint">Y — это точка у основания: по ней объект встаёт перед или за другими. Красный прямоугольник у основания — препятствие.</p>
      </div>

      <div data-sec="terrain" class="me-fs" style="border-top:0;padding-top:0">
        <h3>Новая линия в центре карты</h3>
        <div class="me-acts">
          <button data-a="road_new" title="Земляная тропа">${ic(Route)}Тропа</button>
          <button data-a="stone_new" title="Каменная дорога (в городе — светлая мостовая)">${ic(Route)}Каменная</button>
          <button data-a="pond_new" title="Водоём-пятно">${ic(Droplets)}Водоём</button>
          <button data-a="magnet" title="Конец дороги прилипает к соседней дороге">${ic(Magnet)}Магнит стыков</button>
        </div>
        <details class="me-more-tools"><summary>Ещё: дороги без швов и вставки без краёв</summary>
          <div class="me-acts">
            <button data-a="road_joined">${ic(CirclePlus)}Тропа без швов</button><button data-a="stone_joined">${ic(CirclePlus)}Каменная без швов</button>
            <button data-a="road_borderless">${ic(CirclePlus)}Вставка без краёв</button><button data-a="stone_borderless">${ic(CirclePlus)}Каменная вставка</button>
          </div>
        </details>
      </div>
      <div data-sec="terrain" class="me-fs" data-r="tinspector" hidden>
        <div class="me-grid" data-r="tfields"></div>
        <h3>Точки линии</h3>
        <div class="me-acts">
          <button data-a="pt_add" title="Новая точка после выбранной или посреди выбранного отрезка">${ic(CirclePlus)}＋ Точка</button>
          <button data-a="pt_add_start" title="Продолжить линию от начала">${ic(CirclePlus)}＋ В начале</button>
          <button data-a="pt_del" class="me-danger" title="Убрать выбранную точку (Delete)">${ic(Minus)}Убрать точку</button>
          <button data-a="join" title="Прижать выбранный конец к ближайшей дороге">${ic(Link)}Примкнуть</button>
        </div>
        <h3>Вся линия</h3>
        <div class="me-acts">
          <button data-a="narrower" title="Уже">${ic(Minus)}Уже</button><button data-a="wider" title="Шире">${ic(Plus)}Шире</button>
          <button data-a="smooth" title="Выровнять изгибы, концы останутся на месте">${ic(Spline)}Сгладить</button>
          <button data-a="seamless" title="Как дорога соединяется с другими дорогами">Стыки: со швом</button>
          <button data-a="borderless" title="Кайма по краям дороги">Края: с каймой</button>
          <button data-a="shape_del" class="me-danger" title="Убрать всю линию">${ic(Trash2)}Убрать линию</button>
        </div>
      </div>

      <div data-sec="walls" class="me-fs" style="border-top:0;padding-top:0">
        <h3>Новая стена в центре карты</h3>
        <div class="me-row"><select data-r="wallkind" aria-label="Тип новой стены">${WALL_KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          <button data-a="wall_add" title="Добавить">${ic(Plus)}Добавить</button></div>
      </div>
      <div data-sec="walls" class="me-fs" data-r="winspector" hidden>
        <div class="me-grid">
          <label class="me-wide">Тип<select data-w="kind">${WALL_KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label>X (левый край)<input data-w="x" type="number" step="1"></label><label>Y (верхний край)<input data-w="y" type="number" step="1"></label>
          <label>Ширина<input data-w="w" type="number" min="10" step="1"></label><label>Высота<input data-w="h" type="number" min="10" step="1"></label>
        </div>
        <div class="me-acts">
          <button data-a="w_minus" title="Уже на шаг сетки">↔ −</button><button data-a="w_plus" title="Шире на шаг сетки">↔ +</button>
          <button data-a="h_minus" title="Ниже на шаг сетки">↕ −</button><button data-a="h_plus" title="Выше на шаг сетки">↕ +</button>
          <button data-a="wall_dup" title="Копия (D)">${ic(CopyPlus)}Копия<kbd>D</kbd></button>
          <button data-a="wall_del" class="me-danger" title="Удалить (Delete)">${ic(Trash2)}Удалить<kbd>Del</kbd></button>
        </div>
      </div>
    </aside>

    <div class="me-status" aria-live="polite">
      <span data-r="cursor"></span>
      <span data-r="zoom-status"></span>
      <span data-r="sel-status"></span>
      <span class="me-msg" data-r="status"></span>
      <span class="me-saved"><span data-r="saved"></span><button data-a="download_status" title="Скачать world.edits.js (Ctrl+Shift+S)">${ic(FileDown)}Скачать</button></span>
    </div>

    <div class="me-mapctl" aria-label="Вид карты">
      <button data-a="zoom_out" title="Отдалить (Ctrl+−)" aria-label="Отдалить">${ic(ZoomOut)}</button>
      <button data-a="zoom_reset" data-r="zoom" title="Масштаб 100% (Ctrl+1)">55%</button>
      <button data-a="zoom_in" title="Приблизить (Ctrl++)" aria-label="Приблизить">${ic(ZoomIn)}</button>
      <button data-a="fit" title="Показать локацию целиком (Ctrl+0)" aria-label="Локация целиком">${ic(Expand)}</button>
      <button data-a="hero" title="К месту старта героини" aria-label="К старту героини">${ic(LocateFixed)}</button>
    </div>
    <div class="me-tip" data-r="tip" hidden></div>
    <div class="me-menu" data-r="menu" role="menu" hidden></div>
    <div class="me-pop" data-r="problems" hidden></div>
    <div class="me-help" data-r="help" hidden>${HELP}</div>`;
  document.body.appendChild(root);

  const $ = r => root.querySelector(`[data-r=${r}]`);
  const btn = a => root.querySelector(`[data-a=${a}]`);
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  let chosen = 'lantern_01', group = 'all', entities = [], lastEntities = '', selectedSet = new Set(), filter = 'all', locationId = '';
  let shapes = [], shapeSel = '', lastShapes = '', walls = [], wallSel = '', lastWalls = '', menuItems = [];
  let recent = [];
  try { recent = JSON.parse(storage?.getItem(RECENT_KEY) || '[]').filter(k => CATALOG.some(a => a.key === k)).slice(0, 10); } catch (e) { recent = []; }

  // ---------------------------------------------------------------- превью картинок
  const images = new Map();
  const art = (a, size = 60) => {
    if (!a) { const s = document.createElement('span'); return s; }
    if (!a.frame) { const img = document.createElement('img'); img.src = a.src; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false; return img; }
    const wrap = document.createElement('span'); wrap.className = 'me-art'; wrap.setAttribute('role', 'img'); wrap.setAttribute('aria-label', a.name);
    const canvas = document.createElement('canvas'), f = a.frame, scale = size / Math.max(f.w, f.h);
    canvas.width = Math.max(1, Math.round(f.w * scale)); canvas.height = Math.max(1, Math.round(f.h * scale)); wrap.append(canvas);
    if (!images.has(a.src)) images.set(a.src, new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = a.src; }));
    images.get(a.src).then(img => canvas.getContext('2d').drawImage(img, f.x, f.y, f.w, f.h, 0, 0, canvas.width, canvas.height)).catch(() => { wrap.textContent = 'Нет превью'; });
    return wrap;
  };
  const assetOf = key => CATALOG.find(a => a.key === key) || null;

  // ---------------------------------------------------------------- каталог
  const counts = Object.fromEntries(CHIPS.map(([c]) => [c, CATALOG.filter(a => inChip(c, a.group)).length]));
  $('asset-groups').innerHTML = [['all', 'Все', CATALOG.length], ...CHIPS.filter(([c]) => counts[c]).map(([c, l]) => [c, l, counts[c]])]
    .map(([g, l, n]) => `<button type="button" data-group="${g}" title="${l}: ${n}">${l} <small>${n}</small></button>`).join('');
  $('entity-filter').innerHTML = FILTERS.map(([f, l]) => `<button type="button" data-filter="${f}">${l}</button>`).join('');
  for (const l of LOCATIONS) { const o = document.createElement('option'); o.value = l.id; o.textContent = l.name; $('location').appendChild(o); }

  const picked = () => {
    const a = assetOf(chosen);
    if (!a) return;
    $('asset-preview').replaceChildren(art(a, 48)); $('asset-name').textContent = a.name; $('asset-key').textContent = a.key;
    for (const b of $('assets').querySelectorAll('[data-asset]')) b.classList.toggle('me-on', b.dataset.asset === chosen);
    for (const b of $('recent').querySelectorAll('[data-recent]')) b.classList.toggle('me-on', b.dataset.recent === chosen);
    const r = btn('replace'); if (r) r.title = `Поставить вместо рисунка «${a.name}» из каталога`;
  };
  const renderAssets = () => {
    const query = $('asset-search').value.trim().toLocaleLowerCase('ru');
    const shown = CATALOG.filter(a => inChip(group, a.group) && `${a.name} ${a.key}`.toLocaleLowerCase('ru').includes(query));
    if (shown.length && !shown.some(a => a.key === chosen)) chosen = shown[0].key;
    $('assets').replaceChildren();
    for (const a of shown) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.asset = a.key; b.title = `${a.name}\n${a.key} · ${a.size[0]}×${a.size[1]}\nПеретащите на карту или дважды щёлкните`;
      b.draggable = true;
      const label = document.createElement('span'); label.textContent = a.name; b.append(art(a), label); $('assets').appendChild(b);
    }
    if (!shown.length) { const p = document.createElement('p'); p.className = 'me-hint'; p.textContent = 'Ничего не нашлось. Попробуйте другое слово или категорию «Все».'; $('assets').appendChild(p); }
    for (const b of $('asset-groups').querySelectorAll('[data-group]')) b.classList.toggle('me-on', b.dataset.group === group);
    btn('add').disabled = !shown.length; picked();
  };
  const renderRecent = () => {
    $('recent').hidden = !recent.length;
    $('recent').replaceChildren();
    for (const key of recent) {
      const a = assetOf(key); if (!a) continue;
      const b = document.createElement('button'); b.type = 'button'; b.dataset.recent = key; b.title = `Недавно: ${a.name}`; b.draggable = true;
      b.append(art(a, 38)); $('recent').appendChild(b);
    }
    picked();
  };

  // ---------------------------------------------------------------- списки
  const rowsInto = (box, groups, isOn, attr, emptyText) => {
    box.replaceChildren();
    let n = 0, total = 0;
    for (const [title, items] of groups) total += items.length;
    for (const [title, items] of groups) {
      if (!items.length || n >= LIST_LIMIT) continue;
      if (title) { const h = document.createElement('div'); h.className = 'me-gh'; h.textContent = `${title} · ${items.length}`; box.appendChild(h); }
      for (const it of items) {
        if (n++ >= LIST_LIMIT) break;
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute(attr, it.id); b.title = `${it.name} (${it.id})`;
        b.classList.toggle('me-on', isOn(it.id));
        const name = document.createElement('span'); name.textContent = it.name;
        const id = document.createElement('small'); id.textContent = it.sub ?? it.id;
        b.append(name, id); box.appendChild(b);
      }
    }
    if (!total) { const p = document.createElement('p'); p.className = 'me-more'; p.textContent = emptyText; box.appendChild(p); }
    else if (total > LIST_LIMIT) { const p = document.createElement('p'); p.className = 'me-more'; p.textContent = `Показаны ${LIST_LIMIT} из ${total}. Уточните поиск или фильтр.`; box.appendChild(p); }
  };
  const byLocation = (items) => {
    const groups = new Map();
    for (const it of items) { const k = it.loc || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    const name = id => LOCATIONS.find(l => l.id === id)?.name || 'Вне локаций';
    return [...groups.entries()].sort((a, b) => (b[0] === locationId) - (a[0] === locationId) || LOCATIONS.findIndex(l => l.id === a[0]) - LOCATIONS.findIndex(l => l.id === b[0]))
      .map(([id, list]) => [name(id), list]);
  };
  const match = (q, it) => !q || `${it.name} ${it.id} ${it.sub || ''}`.toLocaleLowerCase('ru').includes(q);
  const renderEntities = () => {
    const q = $('entity-search').value.trim().toLocaleLowerCase('ru');
    const shown = entities.filter(e => match(q, e));
    const signature = JSON.stringify([locationId, q, shown.length, shown.slice(0, LIST_LIMIT).map(e => e.id + e.name)]);
    if (signature !== lastEntities) {
      lastEntities = signature;
      rowsInto($('entities'), byLocation(shown), id => selectedSet.has(id), 'data-entity', q ? 'Ничего не нашлось.' : 'Здесь пока пусто.');
    } else for (const b of $('entities').querySelectorAll('[data-entity]')) b.classList.toggle('me-on', selectedSet.has(b.getAttribute('data-entity')));
    for (const b of $('entity-filter').querySelectorAll('[data-filter]')) b.classList.toggle('me-on', b.dataset.filter === filter);
  };
  const renderShapes = () => {
    const q = $('shape-search').value.trim().toLocaleLowerCase('ru');
    const shown = shapes.filter(s => match(q, s));
    const signature = JSON.stringify([locationId, q, shown.map(s => s.id + s.name)]);
    if (signature !== lastShapes) { lastShapes = signature; rowsInto($('shapes'), byLocation(shown), id => id === shapeSel, 'data-shape', 'Линий не нашлось.'); }
    else for (const b of $('shapes').querySelectorAll('[data-shape]')) b.classList.toggle('me-on', b.getAttribute('data-shape') === shapeSel);
  };
  const renderWalls = () => {
    const q = $('wall-search').value.trim().toLocaleLowerCase('ru');
    const shown = walls.filter(s => match(q, s));
    const signature = JSON.stringify([locationId, q, shown.map(s => s.id + s.name)]);
    if (signature !== lastWalls) { lastWalls = signature; rowsInto($('walls'), byLocation(shown), id => id === wallSel, 'data-wall', 'Стен не нашлось.'); }
    else for (const b of $('walls').querySelectorAll('[data-wall]')) b.classList.toggle('me-on', b.getAttribute('data-wall') === wallSel);
  };
  const scrollToOn = box => { const on = box.querySelector?.('.me-on'); on?.scrollIntoView?.({ block: 'nearest' }); };

  // ---------------------------------------------------------------- раскладка ПК / телефон
  const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1000px) and (min-height: 600px)') : null;
  const isDesktop = () => !!mq?.matches;
  const applyLayout = () => {
    html?.classList.toggle('me-desktop', isDesktop());
    const min = btn('min'), hidden = isDesktop() ? !!html?.classList.contains('me-nopanels') : root.classList.contains('me-min');
    if (min) {
      min.innerHTML = isDesktop() ? ic(hidden ? PanelLeftOpen : PanelLeftClose) : ic(ChevronDown);
      min.title = isDesktop() ? (hidden ? 'Показать панели (Tab)' : 'Спрятать панели и смотреть на всю карту (Tab)') : (hidden ? 'Развернуть панель' : 'Свернуть панель');
      min.setAttribute('aria-label', min.title);
      min.classList.toggle('me-on', hidden);
      if (!isDesktop()) min.style.transform = hidden ? 'rotate(180deg)' : '';
      else min.style.transform = '';
    }
  };
  const onLayout = () => { applyLayout(); actions.layout?.(); };
  mq?.addEventListener?.('change', onLayout);
  applyLayout();

  // ---------------------------------------------------------------- события
  $('asset-search').addEventListener('input', renderAssets);
  $('entity-search').addEventListener('input', renderEntities);
  $('shape-search').addEventListener('input', renderShapes);
  $('wall-search').addEventListener('input', renderWalls);
  $('location').addEventListener('change', e => { actions.location?.(e.target.value); e.target.blur?.(); });
  $('snap').addEventListener('change', e => { actions.snap_set?.(Number(e.target.value) || 0); e.target.blur?.(); });
  $('import').addEventListener('change', e => { actions.import?.(e.target.files?.[0]); e.target.value = ''; });
  root.querySelector('[data-r=wallkind]').addEventListener('change', e => e.target.blur?.());
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset?.p) actions.property?.(t.dataset.p, t.value);
    else if (t.dataset?.t) actions.t_prop?.(t.dataset.t, t.value);
    else if (t.dataset?.w) actions.w_prop?.(t.dataset.w, t.value);
    else return;
    if (t.tagName === 'SELECT') t.blur?.();   // выбор в списке сделан — клавиши снова управляют картой
  });
  // Enter в числовом поле применяет значение сразу, Esc — возвращает фокус карте.
  root.addEventListener('keydown', e => {
    const t = e.target, typing = /^(INPUT|SELECT|TEXTAREA)$/.test(t?.tagName || '');
    if (typing && e.key === 'Enter' && (t.dataset?.p || t.dataset?.t || t.dataset?.w)) { t.blur(); e.preventDefault(); }
    if (typing && e.key === 'Escape') { t.blur(); e.preventDefault(); }
    // клавиши в полях ввода не должны уходить в редактор (Delete стёр бы объект, а не букву)
    if (typing) e.stopPropagation();
  });
  root.addEventListener('dragstart', e => {
    const b = e.target.closest?.('[data-asset],[data-recent]');
    if (!b) return;
    const key = b.dataset.asset || b.dataset.recent;
    chosen = key; picked();
    e.dataTransfer?.setData('text/plain', key);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    actions.drag_asset?.(key);
  });
  root.addEventListener('dragend', () => actions.drag_asset?.(null));
  root.addEventListener('dblclick', e => {
    const b = e.target.closest?.('[data-asset],[data-recent]');
    if (b) actions.add?.(b.dataset.asset || b.dataset.recent, $('placement').value);
  });
  root.addEventListener('click', (e) => {
    const t = e.target;
    const g = t.closest?.('[data-group]'); if (g) { group = g.dataset.group; renderAssets(); return; }
    const a = t.closest?.('[data-asset],[data-recent]'); if (a) { chosen = a.dataset.asset || a.dataset.recent; picked(); actions.choose?.(chosen); return; }
    const f = t.closest?.('[data-filter]'); if (f) { actions.entity_filter?.(f.dataset.filter); return; }
    const tab = t.closest?.('[data-tabbtn]'); if (tab) { api.setTab(tab.dataset.tabbtn); return; }
    const ent = t.closest?.('[data-entity]'); if (ent) { actions.select_entity?.(ent.getAttribute('data-entity'), { add: e.shiftKey || e.ctrlKey || e.metaKey }); return; }
    const sh = t.closest?.('[data-shape]'); if (sh) { actions.select_shape?.(sh.getAttribute('data-shape')); return; }
    const w = t.closest?.('[data-wall]'); if (w) { actions.select_wall?.(w.getAttribute('data-wall')); return; }
    const pr = t.closest?.('[data-problem]'); if (pr) { actions.problem?.(pr.getAttribute('data-problem')); return; }
    const mi = t.closest?.('[data-mi]'); if (mi) { const item = menuItems[Number(mi.dataset.mi)]; api.hideMenu(); if (item && !item.disabled) item.run(); return; }
    const b = t.closest?.('button[data-a]');
    if (!b || b.disabled) return;
    const act = b.dataset.a;
    // кнопки не держат фокус: иначе горячие клавиши и пробел нажимали бы её снова
    if (isDesktop()) b.blur?.();
    if (act !== 'file') $('file-menu').hidden = true;
    if (act === 'min') {
      if (isDesktop()) html?.classList.toggle('me-nopanels'); else root.classList.toggle('me-min');
      onLayout(); return;
    }
    if (act === 'file') { $('file-menu').hidden = !$('file-menu').hidden; return; }
    if (act === 'help' || act === 'help_close') { api.toggleHelp(act === 'help'); return; }
    if (act === 'add') { actions.add?.(chosen, $('placement').value); return; }
    if (act === 'import') { $('import').click(); return; }
    if (act === 'replace') { actions.replace?.(chosen); return; }
    if (act === 'download_status') { actions.download?.(); return; }
    if (act === 'wall_add') { actions.wall_add?.(root.querySelector('[data-r=wallkind]').value); return; }
    actions[act]?.();
  });
  // клик мимо меню «Файл» закрывает его; клик по затемнению справки — тоже
  const outside = (e) => {
    if (!$('file-menu').hidden && !e.target.closest?.('.me-file')) $('file-menu').hidden = true;
    // щелчок по карте закрывает меню сам редактор — и тогда этот щелчок больше ничего не делает
    if (!$('menu').hidden && !e.target.closest?.('[data-r=menu]') && e.target.tagName !== 'CANVAS') api.hideMenu();
    if (!$('help').hidden && e.target === $('help')) api.toggleHelp(false);
  };
  document.addEventListener?.('pointerdown', outside, true);

  root.dataset.mode = 'props';
  renderAssets(); renderRecent();

  // ---------------------------------------------------------------- поля свойств
  const setField = (el, value) => { if (document.activeElement !== el) el.value = value; };
  const round = v => typeof v === 'number' ? Math.round(v * 100) / 100 : v;

  const api = {
    root,
    isDesktop,
    /** Вкладка слева в режиме «Объекты»: каталог картинок или список того, что на карте. */
    setTab(name) {
      root.dataset.tab = name;
      for (const x of root.querySelectorAll('[data-tabbtn]')) x.classList.toggle('me-on', x.dataset.tabbtn === name);
      if (name === 'list') scrollToOn($('entities'));
    },
    chosen: () => chosen,
    placement: () => $('placement').value,
    vary: () => !!$('brush-vary').checked,
    setLocation(id) { locationId = id || ''; $('location').value = id || ''; renderEntities(); renderShapes(); renderWalls(); },
    setEntities(items, selected, f) {
      entities = items; filter = f || 'all';
      selectedSet = selected instanceof Set ? selected : new Set(selected ? [selected] : []);
      renderEntities();
    },
    setShapes(items, selected) { shapes = items; shapeSel = selected || ''; renderShapes(); },
    setWalls(items, selected) { walls = items; wallSel = selected || ''; renderWalls(); },
    reveal() { scrollToOn($('entities')); scrollToOn($('shapes')); scrollToOn($('walls')); },
    /** Шапка выбранного: картинка, название, что это. */
    setSelected(sel) {
      $('sel-head').hidden = !sel;
      if (!sel) return;
      $('sel-art').replaceChildren(art(assetOf(sel.key), 44));
      $('sel-name').textContent = sel.name; $('sel-sub').textContent = sel.sub || '';
    },
    setInspector(e, values = {}, { multi = 0 } = {}) {
      $('inspector').hidden = !e;
      $('props-acts').hidden = !e;
      $('tips').hidden = !!e;
      $('multi').hidden = multi < 2;
      if (!e) return;
      const props = { ...values, s: values.s || 1, a: values.a || 0, alpha: values.alpha ?? 1, l: values.l || 'main', tileScale: values.tileScale || 1,
        collision: e.kind === 'prop' ? (e.ref.p.solid === undefined || e.ref.p.solid === 'auto' ? 'auto' : e.ref.p.solid === null ? 'none' : 'custom') : 'custom',
        solid_w: values.solid?.w || 0, solid_h: values.solid?.h || 0 };
      for (const el of root.querySelectorAll('[data-p]')) {
        const k = el.dataset.p;
        setField(el, typeof props[k] === 'number' ? round(props[k]) : props[k] ?? '');
        const off = k === 'collision' ? e.kind !== 'prop' : k === 'tileScale' ? e.kind !== 'ground' : k.startsWith('solid_') ? !['prop', 'col'].includes(e.kind)
          : (k === 's' && e.kind === 'ground') || (['w', 'h', 's', 'a', 'alpha', 'l'].includes(k) && e.kind === 'col' && e.ref.kind !== 'furniture');
        // у группы меняются только общие свойства; X и Y двигают всю группу
        el.disabled = off || (multi > 1 && ['w', 'h', 'solid_w', 'solid_h', 'tileScale'].includes(k));
        el.closest?.('label')?.toggleAttribute?.('hidden', (k === 'tileScale' && e.kind !== 'ground') || (k.startsWith('solid_') && !['prop', 'col'].includes(e.kind)));
      }
    },
    /** Свойства выбранной дороги или воды: поля строит редактор, тут только разметка. */
    setTerrain(view) {
      $('tinspector').hidden = !view;
      if (!view) return;
      const box = $('tfields');
      const sig = JSON.stringify(view.fields.map(f => [f.key, f.label, f.disabled]));
      if (box.dataset?.sig !== sig) {
        box.innerHTML = view.fields.map(f => `<label${f.wide ? ' class="me-wide"' : ''}>${f.label}<input data-t="${f.key}" type="number" step="${f.step || 1}"${f.min != null ? ` min="${f.min}"` : ''}${f.disabled ? ' disabled' : ''}></label>`).join('');
        if (box.dataset) box.dataset.sig = sig;
      }
      for (const f of view.fields) { const el = box.querySelector(`[data-t=${f.key}]`); if (el) setField(el, f.value); }
    },
    setWall(view) {
      $('winspector').hidden = !view;
      if (!view) return;
      for (const el of root.querySelectorAll('[data-w]')) {
        const k = el.dataset.w;
        setField(el, view[k] ?? '');
        if (k === 'kind') el.disabled = !view.kindEditable;
      }
    },
    setInfo(text) { $('info').textContent = text; },
    setStatus(text, warn = false) { const el = $('status'); el.textContent = text; el.classList.toggle('me-warn', warn); el.title = text; },
    setCursor(text) { $('cursor').textContent = text; },
    setZoom(z) { const t = `${Math.round(z * 100)}%`; $('zoom').textContent = t; $('zoom-status').textContent = `Масштаб ${t}`; },
    setSelection(text) { $('sel-status').textContent = text; $('sel-status').hidden = !text; },
    setSaved(text, ok = true, pending = 0) {
      const el = $('saved'); el.textContent = text; el.classList.toggle('me-warn', !ok);
      el.title = pending ? 'Эти правки есть только в этом браузере. Чтобы они попали в игру, скачайте world.edits.js и замените им src/config/world.edits.js.' : '';
      btn('download_status')?.classList.toggle('me-primary', pending > 0);
    },
    setSnap(n) { $('snap').value = String(n || 0); },
    setHistory(undo, redo) {
      const u = btn('undo'), r = btn('redo');
      if (u) u.title = undo ? `Отменить: ${undo} (Ctrl+Z)` : 'Отменять пока нечего';
      if (r) r.title = redo ? `Повторить: ${redo} (Ctrl+Y)` : 'Повторять нечего';
    },
    setToggle(name, on, label) { const b = btn(name); if (!b) return; b.classList.toggle('me-on', !!on); if (label) b.textContent = label; },
    setMode(m) {
      root.dataset.mode = m;
      for (const k of ['props', 'terrain', 'walls']) { const b = btn('mode_' + k); b.classList.toggle('me-on', k === m); b.setAttribute?.('aria-selected', String(k === m)); }
    },
    setEnabled(name, on) { const b = btn(name); if (b) b.disabled = !on; },
    setBrush(on) { const b = btn('brush'); if (!b) return; b.classList.toggle('me-on', !!on); b.lastChild.textContent = on ? 'Кисть включена' : 'Кисть'; },
    /** Картинку поставили — она первая в «Недавних». */
    notePlaced(key) {
      recent = [key, ...recent.filter(k => k !== key)].slice(0, 10);
      try { storage?.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (e) { /* хранилище недоступно */ }
      renderRecent();
    },
    choose(key) { if (assetOf(key)) { chosen = key; picked(); } },
    showTip(x, y, title, sub = '') {
      const tip = $('tip');
      tip.textContent = title;
      if (sub) { const s = document.createElement('small'); s.textContent = sub; tip.appendChild(s); }
      tip.hidden = false;
      const w = tip.offsetWidth || 160, h = tip.offsetHeight || 24, vw = window.innerWidth || 1e4, vh = window.innerHeight || 1e4;
      tip.style.left = `${Math.min(x + 16, vw - w - 6)}px`; tip.style.top = `${Math.min(y + 18, vh - h - 6)}px`;
    },
    hideTip() { $('tip').hidden = true; },
    /** Контекстное меню: items — [{ label, keys, run, disabled, danger } | '-' | { title }]. */
    showMenu(x, y, items) {
      menuItems = [];
      const box = $('menu');
      box.innerHTML = items.map(it => {
        if (it === '-') return '<hr>';
        if (it.title) return `<div class="me-mh">${esc(it.title)}</div>`;
        menuItems.push(it);
        return `<button type="button" role="menuitem" data-mi="${menuItems.length - 1}"${it.disabled ? ' disabled' : ''}${it.danger ? ' class="me-danger"' : ''}>${esc(it.label)}${it.keys ? `<kbd>${esc(it.keys)}</kbd>` : ''}</button>`;
      }).join('');
      box.hidden = false;
      const w = box.offsetWidth || 240, h = box.offsetHeight || 200, vw = window.innerWidth || 1e4, vh = window.innerHeight || 1e4;
      box.style.left = `${Math.max(4, Math.min(x, vw - w - 4))}px`; box.style.top = `${Math.max(4, Math.min(y, vh - h - 4))}px`;
    },
    hideMenu() { $('menu').hidden = true; menuItems = []; },
    menuOpen: () => !$('menu').hidden,
    showProblems(list, title) {
      const box = $('problems');
      box.innerHTML = `<header><span>${esc(title)}</span><button type="button" data-a="problems_close" title="Закрыть" aria-label="Закрыть">${ic(X)}</button></header>
        <p class="me-hint">Щёлкните строку, чтобы показать место на карте.</p><div class="me-items">${list.map(p => `<button type="button" data-problem="${esc(p.id)}">${esc(p.text)}</button>`).join('')}</div>`;
      box.hidden = false;
    },
    hideProblems() { $('problems').hidden = true; },
    toggleHelp(on) { $('help').hidden = !(on ?? $('help').hidden); if (!$('help').hidden) $('help').querySelector('[data-a=help_close]')?.focus?.(); },
    helpOpen: () => !$('help').hidden,
    closeFileMenu() { const open = !$('file-menu').hidden; $('file-menu').hidden = true; return open; },
    destroy() {
      root.remove(); css.remove();
      document.removeEventListener?.('pointerdown', outside, true);
      mq?.removeEventListener?.('change', onLayout);
      html?.classList.remove('me-editor', 'me-desktop', 'me-nopanels');
    },
  };
  actions.problems_close = () => api.hideProblems();
  api.setTab('catalog');
  return api;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
