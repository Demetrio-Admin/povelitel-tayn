import '@fontsource/pt-sans/cyrillic-400.css';
import '@fontsource/pt-sans/cyrillic-700.css';
import '@fontsource/pt-sans/latin-400.css';
import '@fontsource/pt-sans/latin-700.css';
import '@fontsource/philosopher/cyrillic-700.css';
import '@fontsource/philosopher/latin-700.css';
import './ui/chat.css';
import './ui/page.css';
import './ui/loadingScreen.css';
import '@fontsource/philosopher/cyrillic-400.css';
import '@fontsource/philosopher/latin-400.css';
import Phaser from 'phaser';
import { VIEW } from './config/game.config.js';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { ExplorationScene } from './scenes/ExplorationScene.js';
import { CombatScene } from './scenes/CombatScene.js';
import { UIScene } from './scenes/UIScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { loadUIFont } from './ui/fonts.js';
import { showLoadingScreen } from './ui/loadingScreen.js';

const debug = new URLSearchParams(window.location.search).has('debug');

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: VIEW.background,
  // Portrait 9:16. FIT сохраняет пропорции; на ПК вокруг игры виден фон страницы.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW.width,
    height: VIEW.height,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug },
  },
  input: { activePointers: 3 },
  render: { pixelArt: false, antialias: true },
  scene: [BootScene, PreloadScene, MenuScene, ExplorationScene, CombatScene, UIScene],
};

// Шрифт интерфейса грузится до старта игры (макс. 2 с), иначе Canvas нарисует текст запасным шрифтом навсегда.
showLoadingScreen();
loadUIFont().then(() => { window.__game = new Phaser.Game(config); });
