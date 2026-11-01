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
import { CameraBootScene as BootScene, CameraExplorationScene as ExplorationScene, CameraUIScene, ClassicCameraUIScene } from './scenes.js';
import { installPanel } from './panel.js';
import { experiment } from './model.js';
import './panel.css';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { CombatScene } from '../scenes/CombatScene.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { loadUIFont } from '../ui/fonts.js';
import { showLoadingScreen } from '../ui/loadingScreen.js';
import { bindBrowserViewport, viewportScaleMode } from '../ui/viewport.js';

const query = new URLSearchParams(window.location.search);
const debug = query.has('debug');
// The compact mobile HUD is the experiment; ?hud=classic restores the production HUD for side-by-side comparison.
const classicHud = query.get('hud') === 'classic';
const UIScene = classicHud ? ClassicCameraUIScene : CameraUIScene;
experiment.hudPadding = !classicHud;
const editor = false;   // map editor: the map fills the free space
document.title = 'Колдовство — тест камеры';
// Resolve existing public assets from the game root, including lazy Phaser loads.
const base = document.createElement('base');
base.href = new URL('../', location.href).href;
document.head.append(base);

const config = {
  title: GAME_TITLE,
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: VIEW.background,
  // Portrait screens show more map instead of letterboxing; wide screens retain the portrait frame.
  scale: {
    mode: viewportScaleMode(document.getElementById('game'), { editor }),
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW.width,
    height: VIEW.height,
    expandParent: false,
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
{
showLoadingScreen();
loadUIFont().then(() => {
  const game = new Phaser.Game(config);
  window.__game = game;
  installPanel(game);
  game.events.once(Phaser.Core.Events.READY, () => bindBrowserViewport(game, document.getElementById('game'), { editor }));
});

}
