// Отдельная точка входа эпизода «Первое пламя» (/episode/). Основная игра (index.html → src/main.js) не меняется.
import '../ui/heroProfile.css';
import '../ui/shop.css';
import '../ui/victory.css';
import '@fontsource/pt-sans/cyrillic-400.css';
import '@fontsource/pt-sans/cyrillic-700.css';
import '@fontsource/pt-sans/latin-400.css';
import '@fontsource/pt-sans/latin-700.css';
import '@fontsource/philosopher/cyrillic-700.css';
import '@fontsource/philosopher/latin-700.css';
import '../ui/chat.css';
import '../ui/page.css';
import '../ui/loadingScreen.css';
import '@fontsource/philosopher/cyrillic-400.css';
import '@fontsource/philosopher/latin-400.css';
import Phaser from 'phaser';
import { VIEW } from '../config/game.config.js';
import { GAME_TITLE } from '../config/branding.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { CombatScene } from '../scenes/CombatScene.js';
import { loadUIFont } from '../ui/fonts.js';
import { showLoadingScreen } from '../ui/loadingScreen.js';
import { bindBrowserViewport, viewportScaleMode } from '../ui/viewport.js';
import { EpisodeBootScene } from './scenes/boot.js';
import { EpisodeExplorationScene } from './scenes/exploration.js';
import { EpisodeMagicScene } from './scenes/magic.js';
import { EpisodeCombatScene } from './scenes/combat.js';
import { EpisodeUIScene } from './ui.js';
import { services } from '../services.js';
import { episode } from './runtime.js';

const query = new URLSearchParams(window.location.search);
document.title = 'Колдовство — Первое пламя';
// Общие ассеты лежат в корне игры (как у /camera-test/).
const base = document.createElement('base');
base.href = new URL('../', location.href).href;
document.head.append(base);

const config = {
  title: GAME_TITLE,
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: VIEW.background,
  scale: {
    mode: viewportScaleMode(document.getElementById('game'), { editor: false }),
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW.width,
    height: VIEW.height,
    expandParent: false,
  },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: query.has('debug') } },
  input: { activePointers: 3 },
  render: { pixelArt: false, antialias: true },
  // CombatScene основной игры зарегистрирован, но в эпизоде не запускается: бой эпизода — EpisodeCombatScene.
  scene: [EpisodeBootScene, PreloadScene, MenuScene, EpisodeExplorationScene, CombatScene, EpisodeUIScene, EpisodeMagicScene, EpisodeCombatScene],
};

showLoadingScreen();
loadUIFont().then(() => {
  const game = new Phaser.Game(config);
  window.__game = game;
  window.__witch = services;
  window.__episode = episode;
  game.events.once(Phaser.Core.Events.READY, () => bindBrowserViewport(game, document.getElementById('game'), { editor: false }));
});
