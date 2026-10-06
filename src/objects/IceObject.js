import { COLORS, DEPTH } from '../config/game.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { WORLD_MANA_COST } from '../config/balance.abilities.js';
import { InteractiveObject, applyDisplaySize } from './InteractiveObject.js';

/**
 * v0.21.0 — IceObject: объект, который замораживают Льдом (глава II). Состояния: normal → frozen.
 * walkable: true — замёрзшая вода (лужа, ручей): преграда исчезает, лёд остаётся на полу, по нему можно пройти.
 * frozenTexture — картинка после заморозки. doneEvent / opensPath — как у остальной магии (решает сервер, операция world).
 */
export class IceObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.ability = 'ice';
    if (this.saved.state === 'frozen') this.freezeView(false);
  }

  get markerIcon() { return 'icon_ice'; }
  get markerColor() { return this.abilities.isUnlocked('ice') ? COLORS.ice : 0x7a6a62; }
  get label() { return 'Заморозить'; }
  isDone() { return this.saved.state === 'frozen'; }
  manaCost() { return this.abilities.isUnlocked('ice') ? WORLD_MANA_COST.ice : 0; }

  async interact(abilityId) {
    if (this.rejectWrongAbility(abilityId)) return;
    if (!this.abilities.isUnlocked('ice')) {
      this.scene.toast(this.cfg.lockedText || 'Здесь пригодился бы Лёд.', COLORS.ice);
      services.audio.play('locked');
      return;
    }
    if (this.waiting()) { this.scene.toast(this.cfg.lockedText || 'Пока рано.', COLORS.ice); services.audio.play('locked'); return; }
    if (this.busy || this.isDone()) return;
    const r = await this.serverAct();
    if (!r || this.removed || !this.sprite.active) return;
    this.scene.player.castAt(this.x, this.baseY, 'telekinesis');
    this.scene.castFx(this.x, this.baseY - 20, COLORS.ice);
    this.freezeView(true);
    if (this.cfg.doneText) this.scene.toast(this.cfg.doneText, COLORS.ice);
    services.bus.emit(MSG.QUEST_CHANGED);
  }

  freezeView(animate) {
    if (this.cfg.frozenTexture && this.sprite.active) {
      this.sprite.setTexture(this.cfg.frozenTexture);
      applyDisplaySize(this.sprite, this.cfg.frozenTexture);
      this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY };
    }
    if (this.cfg.walkable) {
      if (this.blocker) { this.blocker.destroy(); this.blocker = null; }
      if (this.cfg.groundWhenFrozen !== false) this.sprite.setDepth(DEPTH.path + 1);
    }
    if (animate) {
      this.scene.burst(this.x, this.baseY - 20, COLORS.ice, 26);
      this.scene.sparkleShower?.(this.x, this.baseY - 24, COLORS.ice);
      services.audio.play('quest_update');
    }
  }
}
