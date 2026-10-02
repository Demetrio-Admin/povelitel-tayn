import Phaser from 'phaser';
import { VIEW } from './config/game.config.js';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { ExplorationScene } from './scenes/ExplorationScene.js';
import { CombatScene } from './scenes/CombatScene.js';
import { UIScene } from './scenes/UIScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { HeroSelectScene } from './scenes/HeroSelectScene.js';
import { loadUIFont } from './ui/fonts.js';

const debug = new URLSearchParams(window.location.search).has('debug');

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: VIEW.background,
  // Portrait 9:16. FIT сохраняет пропорции на любом экране (на ПК — полосы по бокам).
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
  scene: [BootScene, PreloadScene, MenuScene, HeroSelectScene, ExplorationScene, CombatScene, UIScene],
};

// Шрифт интерфейса грузится до старта игры (макс. 2 с), иначе Canvas нарисует текст запасным шрифтом навсегда.
loadUIFont().then(() => { window.__game = new Phaser.Game(config); });
