// Загрузка эпизода: изолированное сохранение (свой префикс), без облака, со своей стартовой точкой и прогрессом.
import { BootScene } from '../../scenes/BootScene.js';
import { initServices, services } from '../../services.js';
import { setCompanionStorage } from '../../objects/Companion.js';
import { STORY } from '../../config/story.js';
import { experiment } from '../../camera-test/model.js';
import { isolatedStorage, installEpisodeServices } from '../runtime.js';
import { HERO_START } from '../content.js';
import { STEPS, freshProgress, stepIndex, RITUAL_NEEDS } from '../model/story.js';
import { PREFIX } from '../model/storage.js';
import { frostwoodPoint } from '../../config/frostwood.plan.js';

export class EpisodeBootScene extends BootScene {
  create() {
    let raw; try { raw = window.localStorage; } catch { /* private browsing */ }
    // ?step=<шаг> — начать эпизод с нужного места (для проверки и показа): прежний прогресс эпизода стирается
    const jump = new URLSearchParams(window.location.search).get('step');
    if (jump && STEPS.some(s => s.id === jump)) {
      try { for (const k of Object.keys(raw || {})) if (k.startsWith(PREFIX)) raw.removeItem(k); } catch { /* ignore */ }
    }
    const storage = isolatedStorage(raw);
    setCompanionStorage(storage);
    initServices({ storage, localOnly: true });
    services.skipMenu = true;
    services.settings.set('hints', false);
    experiment.profile = 'b';          // камера B: героиня крупнее, мягкое опережение
    experiment.hudPadding = true;
    if (!services.hadSave) {
      const state = services.state;
      state.data.player = { ...HERO_START };
      state.data.safePoint = { ...HERO_START };
      state.data.completedEvents.push(STORY.prologueEvent, STORY.starterKitEvent, 'unlock_telekinesis_1');
      state.data.unlockedAbilities = ['telekinesis'];
      state.data.telekinesisLevel = 1;
      state.data.inventory.coins = 120;
      state.save();
    }
    if (jump && STEPS.some(s => s.id === jump)) jumpTo(services.state, jump);
    installEpisodeServices();
    this.scene.start('PreloadScene');
  }
}

/** Где стоит герой, когда эпизод начинают с шага (рядом с целью шага). */
const STEP_SPOT = {
  intro: HERO_START, goran: { x: 1300, y: 4060 }, tree: { x: 1238, y: 3130 }, wall: { x: 1250, y: 2110 },
  ask_fire: { x: 1150, y: 2150 }, spark: { x: 1000, y: 2490 }, herbs: { x: 1505, y: 2540 }, gather: { x: 1300, y: 2450 },
  ritual: { x: 1000, y: 2490 }, melt: { x: 1250, y: 2110 }, fight: { x: 1250, y: 2110 }, enter: { x: 1250, y: 2010 },
  sanctuary: frostwoodPoint(735, 1440), done: frostwoodPoint(818, 330),
};

/** Состояние, как если бы шаги до `step` уже пройдены (ровно, без ошибок). */
function jumpTo(state, step) {
  const at = (id) => stepIndex(step) >= stepIndex(id);
  const ep = { ...freshProgress(), step };
  if (at('spark') && stepIndex(step) > stepIndex('spark')) { state.unlockAbility('fire', 1); ep.fireLevel = 1; }
  if (at('gather')) { ep.lesson = true; ep.herbsThawed = 1; ep.practice = 1; state.setObject('ep_herbs_1', { state: 'done' }); }
  if (at('ritual')) {
    for (const [id, n] of Object.entries(RITUAL_NEEDS)) state.data.inventory[id] = n;
    ep.practice = 3;
    for (const id of ['ep_shard', 'ep_moon_1', 'ep_moon_2', 'ep_moon_4']) state.setObject(id, { state: 'collected' });
    for (const id of ['ep_resin_1', 'ep_resin_2']) state.setObject(id, { state: 'done' });
  }
  if (at('melt')) { for (const id of Object.keys(RITUAL_NEEDS)) state.data.inventory[id] = 0; state.unlockAbility('fire', 2); ep.fireLevel = 2; }
  if (at('wall')) state.setObject('ep_tree', { state: 'moved' });
  if (at('ask_fire')) ep.found.push('wall_push');
  if (at('enter')) ep.fights = 1;
  ep.loadout = at('fight') ? ['flame', 'push', 'hold', 'ignite'] : null;
  state.setObject('episode', ep);
  const spot = STEP_SPOT[step] || HERO_START;
  state.data.player = { x: Math.round(spot.x), y: Math.round(spot.y) };
  state.data.safePoint = { ...state.data.player };
  state.save();
}
