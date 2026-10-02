// Общая подготовка стенда интерфейса: заглушка Phaser, текстуры, сервисы игры.
// Используется и превью (render-scenes.mjs, настоящий canvas), и дымовым тестом (tests/ui-smoke.mjs, стабы).
import { Reg } from './fake-phaser.mjs';

const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };

/** createCanvas(w,h) и loadImage(path) — настоящие (превью) или стабы (тест). */
export async function setupStage({ createCanvas, loadImage, root }) {
  const path = await import('path');
  const widgets = await import('../../src/ui/widgets.js');
  widgets.env.createCanvas = (w, h) => createCanvas(w, h);
  const { ASSET_FILES } = await import('../../src/config/assets.manifest.js');
  for (const [key, p] of Object.entries(ASSET_FILES)) {
    if (!p) continue;
    Reg.textures.set(key, await loadImage(path.join(root, 'public', p)));
  }
  const gen = (key, w, h, fn) => { const c = createCanvas(w, h); fn(c.getContext('2d'), w, h); Reg.textures.set(key, c); };
  gen('fx_dot', 16, 16, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(8, 8, 8, 0, 7); g.fill(); });
  gen('fx_glow', 128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
  gen('fx_ring', 128, 128, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.stroke(); });
  gen('hero_shadow', 64, 20, (g) => { g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(32, 10, 32, 10, 0, 0, 7); g.fill(); });
  return { Reg, widgets };
}

/** Свежий мир игры; progress: 'new' | 'mid'. */
export async function freshWorld(progress = 'mid') {
  const { services } = await import('../../src/services.js');
  const { GameState } = await import('../../src/state/GameState.js');
  const { QuestFlags } = await import('../../src/state/QuestFlags.js');
  const { bus } = await import('../../src/state/EventBus.js');
  const { AbilitySystem } = await import('../../src/systems/AbilitySystem.js');
  const { Settings } = await import('../../src/state/Settings.js');
  const { AudioManager } = await import('../../src/systems/AudioManager.js');
  const { TutorialSystem } = await import('../../src/systems/TutorialSystem.js');
  const { EV } = await import('../../src/config/events.js');
  const state = new GameState(memStorage());
  const quests = new QuestFlags(state, bus);
  services.state = state; services.quests = quests;
  services.abilities = new AbilitySystem(state, quests, bus);
  services.settings = new Settings(memStorage());
  services.audio = new AudioManager(services.settings);
  services.tutorial = new TutorialSystem(state, services.settings, bus);
  services.input.move.x = services.input.move.y = 0;
  services.modalOpen = false; services.mode = 'exploration';
  if (progress !== 'new') {
    quests.complete(EV.UNLOCK_TELEKINESIS_1); services.abilities.unlock('telekinesis', 1);
    quests.complete(EV.FIRST_WORLD_INTERACTION); quests.complete(EV.COMBAT_INTRO_01);
    state.data.heroLevel = 3; state.data.heroXP = 140;
    state.data.inventory.coins = 128; state.data.inventory.lunar_shard = 4; state.data.inventory.lunar_flame = 2;
    state.data.stats.combats.push({ enemy: 'forest_scavenger', result: 'victory', timeSec: 26.5 });
    state.data.stats.playTimeMs = 9 * 60 * 1000;
  }
  return services;
}

export function mkHud(ui, { hp = 99, mana = 55 } = {}) {
  ui.registry.set('hudProvider', () => ({ hp, maxHp: 138, mana, maxMana: 100 }));
  ui.registry.set('abilityProvider', (id) => ({ state: id === 'seal' ? 'locked' : id === 'fire' ? 'cooldown' : 'ready', cdFrac: 0.4, cdLeft: 2.3, suggested: id === 'telekinesis' }));
}
