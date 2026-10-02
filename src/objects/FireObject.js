import { COLORS, DEPTH } from '../config/game.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { InteractiveObject } from './InteractiveObject.js';

/**
 * FireObject — объект, реагирующий на Огонь. Состояния: normal → burning → destroyed.
 * persistent: true — остаётся гореть (факел). opensPath — уничтожение открывает проход.
 */
export class FireObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.ability = 'fire';
    this.fireState = this.saved.state || 'normal';
    this.emitter = null;
    if (this.fireState === 'destroyed') this.remove(false);
    else if (this.fireState === 'burning') this.startFlames(cfg.persistent ? 0.6 : 1);
    if (cfg.id === 'corrupted_roots' && !this.removed) {
      // тёмная дымка над порчей
      scene.addGlow(cfg.x, cfg.y - 50, COLORS.seal, 0.25, this, 1.8);
    }
  }

  get markerIcon() { return 'icon_fire'; }
  get markerColor() { return this.abilities.isUnlocked('fire') ? COLORS.fire : 0x7a6a62; }
  get label() { return this.cfg.persistent ? 'Зажечь' : 'Поджечь'; }
  isDone() { return this.fireState !== 'normal'; }

  lockedText() { return this.cfg.lockedText || 'Здесь нужен Огонь.'; }

  onFocus() {
    if (this.cfg.lockedEvent && !this.abilities.isUnlocked('fire') && !this.quests.has(this.cfg.lockedEvent)) {
      this.quests.complete(this.cfg.lockedEvent);
      this.scene.toast(this.lockedText(), COLORS.fire);
    }
  }

  interact(abilityId) {
    if (this.rejectWrongAbility(abilityId)) return;
    if (!this.abilities.isUnlocked('fire')) {
      if (this.cfg.lockedEvent) this.quests.complete(this.cfg.lockedEvent);
      this.scene.toast(this.lockedText(), COLORS.fire);
      services.audio.play('locked');
      return;
    }
    this.scene.player.castAt(this.x, this.baseY, 'fire');
    this.scene.castFx(this.x, this.baseY - 30, COLORS.fire);
    this.ignite();
  }

  startFlames(intensity = 1) {
    if (this.emitter) return;
    const top = this.cfg.persistent ? this.sprite.y - this.sprite.displayHeight + 14 : this.baseY - this.sprite.displayHeight * 0.5;
    const spread = this.cfg.persistent ? 6 : this.sprite.displayWidth * 0.35;
    this.emitter = this.scene.add.particles(this.x, top, 'fx_dot', {
      x: { min: -spread, max: spread },
      speedY: { min: -120, max: -40 }, speedX: { min: -15, max: 15 },
      scale: { start: 0.9 * intensity, end: 0 }, alpha: { start: 0.9, end: 0 },
      lifespan: 700, frequency: this.cfg.persistent ? 60 : 25, quantity: this.cfg.persistent ? 1 : 2,
      tint: [COLORS.fire, 0xffc46b, 0xff3b2f], blendMode: 'ADD',
    }).setDepth(DEPTH.fx);
    this.flameGlow = this.scene.addGlow(this.x, top, COLORS.fire, 0.55, this, this.cfg.persistent ? 1.3 : 2);
  }

  ignite() {
    this.fireState = 'burning';
    this.busy = true;
    this.startFlames();
    this.abilities.grantUseXP('fire', 'exploration');
    if (this.cfg.persistent) {
      this.busy = false;
      this.persist({ state: 'burning' });
      this.scene.toast('Факел загорелся', COLORS.fire);
      return;
    }
    this.sprite.setTint(0xff9a5a);
    this.scene.time.delayedCall((this.cfg.burnSec || 1.2) * 1000, () => this.destroyByFire());
  }

  destroyByFire() {
    this.fireState = 'destroyed';
    this.busy = false;
    this.persist({ state: 'destroyed' });
    services.audio.play('roots_burn');
    this.scene.burst(this.x, this.baseY - 30, 0x3a2a22, 26);
    this.sprite.setTint(0x222222);
    if (this.emitter) this.scene.time.delayedCall(500, () => { this.emitter.stop(); });
    this.remove(true);
    const r = this.cfg.reveal?.spawnPickup;
    if (r) this.scene.spawnPickup({ id: `${this.id}_reward`, x: this.cfg.x, y: this.cfg.y, item: r.item, amount: r.amount, texture: r.texture });
    if (this.cfg.opensPath) this.state.openPath(this.cfg.opensPath);
    if (this.cfg.destroyEvent) this.quests.complete(this.cfg.destroyEvent);
    this.state.save();
    services.bus.emit(MSG.QUEST_CHANGED);
    if (this.cfg.panOnOpen) this.scene.panTo(this.cfg.panOnOpen.x, this.cfg.panOnOpen.y);
  }
}
