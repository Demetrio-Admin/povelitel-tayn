import { COLORS, DEPTH } from '../config/game.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { InteractiveObject, itemName } from './InteractiveObject.js';

/**
 * InspectObject (v0.8) — «осмотреть»: героиня комментирует предмет интерьера. Реплики идут по кругу.
 * cfg.first — одноразовая находка при первом осмотре (запас в сундуке). cfg.living = 'cat' — живой питомец (дышит, мурлычет).
 */
export class InspectObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.n = 0;
    if (cfg.living === 'cat') {
      scene.tweens.add({ targets: this.sprite, scaleY: this.baseScale.y * 1.05, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.zz = 2;
    }
  }
  get markerIcon() { return 'icon_inspect'; }
  get markerColor() { return this.cfg.living ? 0xffb6c9 : 0xd9c49a; }
  get label() { return this.cfg.living ? 'Погладить' : 'Осмотреть'; }
  get markerDistance() { return this.cfg.markerDist ?? 150; }
  looted() { return this.saved.state === 'looted'; }

  update(dt) {
    if (this.cfg.living !== 'cat' || this.removed) return;
    this.zz -= dt;
    if (this.zz <= 0) { this.zz = 3.4; this.scene.floatText?.(this.x + 14, this.baseY - this.sprite.displayHeight - 6, 'z', 0xcfe3ff, 20, 1500); }
  }

  interact() {
    const sc = this.scene;
    sc.player.face(this.x - sc.player.x, this.baseY - sc.player.y);
    this.react(this.markerColor, this.cfg.living ? 1.1 : 1.04);
    if (this.cfg.first && !this.looted()) {
      this.persist({ state: 'looted' });
      services.audio.play('pickup');
      sc.sparkleShower?.(this.x, this.baseY - 30, COLORS.gold);
      const res = this.state.applyReward({ items: this.cfg.first.items });
      this.state.save();
      sc.heroSay?.(this.cfg.first.text, 4200);
      services.bus.emit(MSG.REWARD, { title: null, ...res, silent: true });
      services.bus.emit(MSG.HUD_REFRESH);
      return;
    }
    const lines = this.cfg.lines || ['…'];
    const line = lines[this.n++ % lines.length];
    if (this.cfg.living === 'cat') {
      services.audio.play('purr');
      sc.floatText?.(this.x, this.baseY - this.sprite.displayHeight - 10, '♥', 0xff8fb0, 30, 1100);
    } else services.audio.play('ui_click');
    sc.heroSay?.(line, 3600);
  }
}
