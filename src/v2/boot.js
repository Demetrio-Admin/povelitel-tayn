import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { initServices, services } from '../services.js';
import { setCompanionStorage } from '../objects/Companion.js';
import { PACK_IMAGES } from '../config/assets.packs.js';
import { prepareCampaign } from './campaign.js';

function campaignStorage() {
  const prefix = 'koldovstvo.horizon41.';
  let storage;
  try { storage = window.localStorage; } catch { /* private browsing */ }
  return {
    getItem: key => storage?.getItem(prefix + key) ?? null,
    setItem: (key, value) => storage?.setItem(prefix + key, value),
    removeItem: key => storage?.removeItem(prefix + key),
  };
}

export class HorizonBootScene extends BootScene {
  create() {
    const storage = campaignStorage();
    setCompanionStorage(storage);
    initServices({ storage, localOnly: true });
    services.skipMenu = true;
    services.settings.set('hints', false);
    prepareCampaign();
    this.scene.start('PreloadScene');
  }
}

export class HorizonPreloadScene extends PreloadScene {
  preload() {
    super.preload();
    this.load.image('enemy_frost_critter', PACK_IMAGES.chapter2.enemy_frost_critter);
    this.load.image('arena_frostwood', PACK_IMAGES.chapter2.arena_frostwood);
  }
}
