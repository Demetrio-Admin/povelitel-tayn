// Общие сервисы игры (создаются один раз в BootScene).
import { GameState } from './state/GameState.js';
import { QuestFlags } from './state/QuestFlags.js';
import { bus } from './state/EventBus.js';
import { AbilitySystem } from './systems/AbilitySystem.js';
import { Settings } from './state/Settings.js';
import { AudioManager } from './systems/AudioManager.js';
import { TutorialSystem } from './systems/TutorialSystem.js';
import { QuestLog } from './state/QuestLog.js';
import { Alchemy } from './systems/Alchemy.js';
import { DialogueSystem } from './systems/DialogueSystem.js';
import { GuidanceSystem } from './systems/GuidanceSystem.js';
import { PlayerActions } from './systems/PlayerActions.js';
import { resolveMap } from './world/mapData.js';
import { PlayerSession } from './cloud/PlayerSession.js';
import { SupabaseApi } from './cloud/api.js';
import { CLOUD } from './config/cloud.config.js';
import { showLoading, showOffline, showNotice } from './ui/accountUI.js';

export const services = {
  bus,
  state: null,
  quests: null,
  abilities: null,
  settings: null,
  audio: null,
  tutorial: null,
  // v0.8: побочные задания, алхимия, диалоги, мягкое наведение
  log: null,
  alchemy: null,
  dialogue: null,
  guidance: null,
  actions: null,   // v0.9: лечение за монеты и стартовый набор — атомарно на сервере
  // Онлайн-режим: игрок и его прогресс живут на сервере (cloud/PlayerSession.js). null — режим разработки без сервера
  // (не задан VITE_SUPABASE_URL): прогресс в localStorage этого браузера; так же работает автотест и редактор карты.
  session: null,
  offline: false,  // нет связи с сервером: игра стоит, пока висит окно «Нет соединения»
  savePosition: null, // ExplorationScene: записать позицию героя в состояние (перед отправкой на сервер)
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
  const api = new SupabaseApi({ url: CLOUD.url, anonKey: CLOUD.anonKey, loginDomain: CLOUD.loginDomain, timeoutMs: CLOUD.timeoutMs });
  const online = api.enabled && !services.edit;
  // онлайн: в браузере только токен входа, прогресс приходит с сервера; без сервера — localStorage (разработка)
  services.state = new GameState(online || services.edit ? null : storage);
  if (online) {
    services.session = new PlayerSession({ api, state: services.state, storage, saveDelayMs: CLOUD.saveDelayMs, minorDelayMs: CLOUD.minorDelayMs });
    installSessionUI(services.session);
  } else {
    if (params.has('reset') && !services.edit) services.state.reset();
    services.hadSave = services.edit ? false : services.state.load();
  }
  services.skipMenu = params.has('skipmenu') || services.edit;
  services.settings = new Settings(storage);
  services.audio = new AudioManager(services.settings);
  services.audio.installUnlock();
  services.tutorial = new TutorialSystem(services.state, services.settings, bus);
  services.settings.onChange(() => services.tutorial.onSettingsChanged());
  services.quests = new QuestFlags(services.state, bus);
  services.abilities = new AbilitySystem(services.state, services.quests, bus);
  services.log = new QuestLog(services.state, bus);
  services.alchemy = new Alchemy(services.state, bus);
  services.dialogue = new DialogueSystem({ state: services.state, log: services.log, bus, goalText: () => services.quests.objectiveText() });
  services.guidance = new GuidanceSystem({ state: services.state, quests: services.quests, log: services.log, bus });
  services.actions = new PlayerActions({ state: services.state, getSession: () => services.session });
  // отправляем прогресс, когда игрок сворачивает вкладку или закрывает игру
  const flushNow = () => { if (!services.session) return; services.savePosition?.(); services.session.flush({ keepalive: true }).catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
  window.addEventListener('pagehide', flushNow);
  // для отладки из консоли браузера
  window.__witch = services;
  return services;
}

/** Окно «Нет соединения» и потеря входа — общие для всех сцен. */
export function installSessionUI(session) {
  let offlineWin = null;
  session.onChange((reason) => {
    if (reason === 'status') {
      const off = session.status === 'offline';
      services.offline = off;
      if (off && !offlineWin) offlineWin = showOffline({ onRetry: () => session.retryNow() });
      if (!off && offlineWin) { offlineWin.close(); offlineWin = null; }
    }
    if (reason === 'session-lost') {
      showNotice({ title: 'Сессия завершилась', text: 'Войдите снова, чтобы продолжить игру.', button: 'На стартовый экран', onClose: () => reloadToMenu() });
    }
  });
}

/** Перезапуск игры с главного меню (после выхода, входа в другой аккаунт, потери входа). */
export function reloadToMenu() {
  const url = new URL(window.location.href);
  for (const k of ['reset', 'skipmenu']) url.searchParams.delete(k);
  window.location.href = url.toString();
}

/**
 * Запуск: если на устройстве есть вход, загружаем персонажа с сервера и только потом открываем меню.
 * Нет связи — окно «Нет соединения» (сессия сама повторяет попытки), игра ждёт.
 */
export async function bootSession() {
  const session = services.session;
  if (!session) return;
  const loading = showLoading('Загрузка персонажа…');
  try {
    let r = await session.restore();
    loading.close();
    while (r === 'offline') {
      r = await new Promise((resolve) => {
        const off = session.onChange((reason) => {
          if (reason === 'status' && session.status !== 'offline') { off(); resolve(session.status === 'ready' ? 'ready' : 'signed_out'); }
        });
      });
    }
  } finally { loading.close(); }
}

/** «Новая игра» / «Сбросить прогресс». Онлайн: прогресс на сервере с нуля, аккаунт и ник те же. */
export async function resetProgress(hero) {
  const { state, session } = services;
  if (session?.ready) await session.resetProgress(hero);
  else state.reset();
  services.hadSave = false;
}
