import { COLORS, DEPTH } from '../config/game.config.js';
import { EXPLORATION_MAGIC, WORLD_MANA_COST } from '../config/balance.abilities.js';
import { EV } from '../config/events.js';
import { LUNAR_QUEST } from '../config/balance.progression.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { InteractiveObject, ROMAN } from './InteractiveObject.js';

const WEIGHT_RU = { light: 'лёгкий', medium: 'средний', heavy: 'тяжёлый' };

/**
 * TelekinesisObject — предмет с weight_class (light / medium / heavy).
 * mode 'push' — поднять и перенести в target_position (камень, глыба);
 * mode 'pull' — притянуть к героине и забрать (растение, огонёк на ветке).
 * Поля: id, weight_class (cfg.weight), movable, throwable, hidden_reward, target_position.
 */
export class TelekinesisObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.ability = 'telekinesis';
    this.weight_class = cfg.weight || 'light';
    this.movable = true;
    this.throwable = cfg.throwable ?? this.weight_class !== 'heavy';
    this.hidden_reward = cfg.hiddenReward || null;
    this.target_position = cfg.target || null;

    if (this.saved.state === 'collected') this.remove(false);
    else if (this.saved.state === 'moved') {
      this.placeAt(this.saved.x ?? this.target_position.x, this.saved.y ?? this.target_position.y);
      this.spawnHiddenReward();
    }
    if (cfg.elevated && !this.removed) {
      scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 10, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      scene.addGlow(cfg.x, cfg.y - cfg.elevated - 20, 0x9fe9ff, 0.5, this);
    }
  }

  get markerIcon() { return 'icon_telekinesis'; }
  get markerColor() { return this.abilities.canMoveWeight(this.weight_class) ? COLORS.telekinesis : 0x6a7a78; }
  get label() { return this.cfg.mode === 'pull' ? 'Притянуть' : 'Сдвинуть'; }
  isDone() { return this.saved.state === 'moved' || this.saved.state === 'collected'; }

  manaCost() {
    if (!this.abilities.isUnlocked('telekinesis') || !this.abilities.canMoveWeight(this.weight_class)) return 0;
    return this.cfg.mode === 'pull' ? WORLD_MANA_COST.pull : (WORLD_MANA_COST.push[this.weight_class] ?? WORLD_MANA_COST.push.light);
  }

  placeAt(x, y) {
    this.sprite.setPosition(x, y);
    this.baseY = y;
    this.sprite.setDepth(DEPTH.mainBase + y);
    if (this.blocker) { this.blocker.setPosition(x, y - this.cfg.collide.h / 2); this.blocker.body.updateFromGameObject(); }
  }

  spawnHiddenReward() {
    const r = this.hidden_reward?.spawnPickup;
    if (!r) return;
    this.scene.spawnPickup({ id: `${this.id}_reward`, x: this.cfg.x, y: this.cfg.y + 4, item: r.item, amount: r.amount, texture: r.texture });
  }

  onFocus() {
    // первый взгляд на слишком тяжёлый предмет — фиксируем событие и подсказываем
    if (this.cfg.lockedEvent && !this.abilities.canMoveWeight(this.weight_class) && !this.quests.has(this.cfg.lockedEvent)) {
      this.quests.complete(this.cfg.lockedEvent);
      this.scene.toast(this.lockedText(), COLORS.telekinesis);
    }
  }

  lockedText() {
    const need = this.abilities.requiredTelekinesisLevel(this.weight_class);
    return `Слишком тяжело (${WEIGHT_RU[this.weight_class]}). Нужен Телекинез ${ROMAN[need] || need}.`;
  }

  async interact(abilityId) {
    if (this.rejectWrongAbility(abilityId)) return;
    if (!this.abilities.isUnlocked('telekinesis')) { this.scene.toast('Нужен дар Телекинеза'); return; }
    if (!this.abilities.canMoveWeight(this.weight_class)) {
      if (this.cfg.lockedEvent) this.quests.complete(this.cfg.lockedEvent);
      this.scene.toast(this.lockedText(), COLORS.telekinesis);
      services.audio.play('locked');
      this.scene.tweens.add({ targets: this.sprite, x: this.sprite.x + 4, duration: 50, yoyo: true, repeat: 3 });
      return;
    }
    // v0.13.0: ману списывает сервер (операция world); у растений и огоньков (pull) он же выдаёт добычу
    const r = await this.serverAct();
    if (!r || this.removed || !this.sprite.active) return;
    this.busy = true;
    this.scene.player.castAt(this.x, this.baseY, 'telekinesis');
    this.scene.castFx(this.x, this.sprite.y - this.sprite.displayHeight / 2, COLORS.telekinesis);
    this.sprite.setTint(COLORS.telekinesis);
    if (this.cfg.mode === 'pull') this.pull(r); else this.push();
  }

  push() {
    const t = this.target_position;
    const lift = EXPLORATION_MAGIC.liftHeight;
    const scene = this.scene;
    scene.tweens.chain({
      targets: this.sprite,
      tweens: [
        { y: this.sprite.y - lift, duration: 220, ease: 'Sine.easeOut' },
        { x: t.x, y: t.y - lift, duration: EXPLORATION_MAGIC.telekinesisMoveSec * 1000, ease: 'Sine.easeInOut' },
        { y: t.y, duration: 160, ease: 'Bounce.easeOut' },
      ],
      onComplete: () => {
        this.sprite.clearTint();
        this.placeAt(t.x, t.y);
        scene.cameras.main.shake(120, this.weight_class === 'heavy' ? 0.008 : 0.003);
        services.audio.play('telekinesis_impact', { heavy: this.weight_class === 'heavy' });
        if (this.weight_class === 'heavy') services.audio.vibrate(50);
        scene.burst(t.x, t.y - 10, 0xb8a990, 14);
        this.busy = false;
        this.finish();
        this.spawnHiddenReward();
      },
    });
  }

  pull(r) {
    const p = this.scene.player;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite, x: p.x, y: p.y - 40, scale: this.sprite.scale * 0.5,
      duration: EXPLORATION_MAGIC.telekinesisPullSec * 1000, ease: 'Sine.easeIn',
      onComplete: () => {
        this.busy = false;
        services.audio.play('pickup');
        if (this.cfg.reward) {
          this.announce(r); // награду выдал сервер (world); тосты показывает UIScene
          if (this.cfg.reward.items?.lunar_flame && !this.state.hasEvent(EV.LUNAR_QUEST_COMPLETE)) {
            this.scene.toast(`Лунные огоньки: ${Math.min(LUNAR_QUEST.flamesRequired, this.state.flamesCollected())}/${LUNAR_QUEST.flamesRequired}`, 0x9fe9ff);
          }
        }
        this.remove(false);
        this.finish();
      },
    });
  }

  // v0.15.0: опыт школы, состояние объекта, открытый проход и события записал сервер вместе с действием (операция world)
  finish() {
    services.bus.emit(MSG.QUEST_CHANGED);
    if (this.cfg.panOnOpen) this.scene.panTo(this.cfg.panOnOpen.x, this.cfg.panOnOpen.y);
  }
}
