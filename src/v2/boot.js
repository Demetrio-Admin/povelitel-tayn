import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { initServices, services } from '../services.js';
import { setCompanionStorage } from '../objects/Companion.js';
import { ITEMS } from '../config/balance.progression.js';
import { PACK_IMAGES } from '../config/assets.packs.js';
import { prepareCampaign } from './campaign.js';

function campaignStorage() {
  const prefix = 'koldovstvo.horizon41.hearth.';
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
    Object.assign(ITEMS, {
      mirra_lantern_cracked: { name: 'Треснувший фонарь Мирры', icon: 'lantern_02' },
      grimoire_page_fragment: { name: 'Расколотая страница Гримуара', icon: 'magic_book_01' },
    });
    prepareCampaign();
    this.scene.start('PreloadScene');
  }
}

export class HorizonPreloadScene extends PreloadScene {
  preload() {
    super.preload();
    this.load.image('enemy_frost_critter', PACK_IMAGES.chapter2.enemy_frost_critter);
    this.load.image('horizon_hearth_yard', 'assets/horizon-hearth/yard.webp');
    this.load.image('arena_mirra_hearth', 'assets/horizon-hearth/arena.webp');
    for (const key of ['fence', 'gate', 'ice']) {
      this.load.image('horizon_hearth_' + key, 'assets/horizon-hearth/' + key + '.webp');
    }
  }
}
