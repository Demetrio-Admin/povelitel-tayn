// Общие сервисы игры (создаются один раз в BootScene).
import { GameState } from './state/GameState.js';
import { QuestFlags } from './state/QuestFlags.js';
import { bus } from './state/EventBus.js';
import { AbilitySystem } from './systems/AbilitySystem.js';
import { Settings } from './state/Settings.js';
import { AudioManager } from './systems/AudioManager.js';
import { TutorialSystem } from './systems/TutorialSystem.js';

export const services = {
  bus,
  state: null,
  quests: null,
  abilities: null,
  settings: null,
  audio: null,
  tutorial: null,
  hadSave: false,
  skipMenu: false,
  debug: false,
  // 'exploration' | 'combat' | 'transition' | 'cutscene'
  mode: 'exploration',
  modalOpen: false,
  // общий ввод: клавиатура + джойстик (заполняют InputController и UIScene)
  input: { joy: { x: 0, y: 0 }, kb: { x: 0, y: 0 }, move: { x: 0, y: 0 } },
};

export function initServices() {
  const params = new URLSearchParams(window.location.search);
  const storage = window.localStorage;
  services.debug = params.has('debug');
  services.state = new GameState(storage);
  if (params.has('reset')) services.state.reset();
  services.hadSave = services.state.load();
  services.skipMenu = params.has('skipmenu');
  services.settings = new Settings(storage);
  services.audio = new AudioManager(services.settings);
  services.audio.installUnlock();
  services.tutorial = new TutorialSystem(services.state, services.settings, bus);
  services.settings.onChange(() => services.tutorial.onSettingsChanged());
  services.quests = new QuestFlags(services.state, bus);
  services.abilities = new AbilitySystem(services.state, services.quests, bus);
  // для отладки из консоли браузера
  window.__witch = services;
  return services;
}
