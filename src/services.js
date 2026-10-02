// Общие сервисы игры (создаются один раз в BootScene).
import { GameState } from './state/GameState.js';
import { QuestFlags } from './state/QuestFlags.js';
import { bus } from './state/EventBus.js';
import { AbilitySystem } from './systems/AbilitySystem.js';
import { Settings } from './state/Settings.js';
import { AudioManager } from './systems/AudioManager.js';
import { TutorialSystem } from './systems/TutorialSystem.js';
import { resolveMap } from './world/mapData.js';
import { Account } from './cloud/Account.js';
import { SupabaseApi } from './cloud/api.js';
import { CLOUD } from './config/cloud.config.js';

export const services = {
  bus,
  state: null,
  quests: null,
  abilities: null,
  settings: null,
  audio: null,
  tutorial: null,
  account: null,   // вход и облачное сохранение (cloud/Account.js); в редакторе карты его нет
  hadSave: false,
  skipMenu: false,
  debug: false,
  edit: false,     // ?edit — редактор карты
  map: null,       // { base, edits, props, pos, fromDraft } — расстановка мира
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
  services.edit = params.has('edit');
  // ?edit — редактор: прогресс игрока не читаем и не пишем (хранилище не подключено);
  // ?draft — играть с черновиком правок карты из этого браузера
  services.map = resolveMap({ storage, useDraft: (services.edit && !params.has('nodraft')) || params.has('draft') });
  services.state = new GameState(services.edit ? null : storage);
  if (!services.edit) {
    const api = new SupabaseApi({ url: CLOUD.url, anonKey: CLOUD.anonKey, timeoutMs: CLOUD.timeoutMs });
    services.account = new Account({ api, storage, state: services.state, pushDelayMs: CLOUD.pushDelayMs });
  }
  if (params.has('reset') && !services.edit) services.state.reset();
  services.hadSave = services.edit ? false : services.state.load();
  services.skipMenu = params.has('skipmenu') || services.edit;
  services.settings = new Settings(storage);
  services.audio = new AudioManager(services.settings);
  services.audio.installUnlock();
  services.tutorial = new TutorialSystem(services.state, services.settings, bus);
  services.settings.onChange(() => services.tutorial.onSettingsChanged());
  services.quests = new QuestFlags(services.state, bus);
  services.abilities = new AbilitySystem(services.state, services.quests, bus);
  // отправляем прогресс, когда игрок сворачивает вкладку или закрывает игру
  const flushNow = () => { services.account?.flush({ keepalive: true }); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
  window.addEventListener('pagehide', flushNow);
  // для отладки из консоли браузера
  window.__witch = services;
  return services;
}

/** Восстанавливает вход при запуске, но не ждёт сервер дольше bootTimeoutMs: игра должна открываться и без связи. */
export async function bootCloud() {
  const acc = services.account;
  if (!acc || !acc.enabled) return;
  const slow = new Promise((resolve) => setTimeout(resolve, CLOUD.bootTimeoutMs, 'slow'));
  try { await Promise.race([acc.restore(), slow]); } catch (e) { /* без облака играем как гость */ }
  services.hadSave = services.state.hasSave();
}

/** «Новая игра» и «Сбросить прогресс»: у вошедшего игрока пустое сохранение должно уйти и в облако, иначе вход вернёт старый прогресс. */
export async function resetProgress() {
  const { state, account } = services;
  state.reset();
  if (account?.signedIn) {
    state.save();
    await Promise.race([account.flush(), new Promise((r) => setTimeout(r, 4000))]);
  }
  services.hadSave = false;
}
