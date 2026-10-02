import { COLORS, DEPTH } from '../config/game.config.js';
import { NPCS } from '../config/npcs.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { InteractiveObject } from './InteractiveObject.js';

const hex = c => '#' + c.toString(16).padStart(6, '0');

/**
 * NpcObject (v0.8) — персонаж, с которым можно поговорить. Реплики выбирает DialogueSystem по прогрессу.
 * Живость: «дыхание», тень, имя при приближении, поворот к героине, подпрыгивание-приветствие, значок «!» / «?».
 */
export class NpcObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.npc = NPCS[cfg.npc];
    if (!this.npc) throw new Error(`NpcObject ${cfg.id}: нет персонажа ${cfg.npc}`);
    this.baseSpriteY = this.sprite.y;
    this.talking = false;
    this.greeted = false;
    this.shadow = scene.add.image(cfg.x, cfg.y - 2, 'hero_shadow').setDepth(DEPTH.path + 1).setAlpha(this.npc.float ? 0.45 : 0.75)
      .setDisplaySize(this.sprite.displayWidth * 0.8, 20);
    if (this.npc.float) {
      // дух парит: плавное покачивание и мерцание
      scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 10, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      scene.tweens.add({ targets: this.sprite, alpha: { from: 0.86, to: 1 }, duration: 1100, yoyo: true, repeat: -1 });
      scene.addGlow(cfg.x, cfg.y - 70, this.npc.color, 0.35, this, 1.2);
    } else {
      // «дыхание»: еле заметное сжатие-растяжение
      scene.tweens.add({ targets: this.sprite, scaleY: this.baseScale.y * 1.018, scaleX: this.baseScale.x * 0.992, duration: 1300 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.nameText = scene.add.text(cfg.x, cfg.y - this.sprite.displayHeight - (cfg.elevated || 0) - 14, `${this.npc.name} · ${this.npc.title}`, {
      fontFamily: 'Georgia, serif', fontSize: '19px', color: hex(this.npc.color), stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(DEPTH.markers).setAlpha(0);
    this.badge = scene.add.text(cfg.x, cfg.y - this.sprite.displayHeight - (cfg.elevated || 0) - 8, '', {
      fontFamily: 'Georgia, serif', fontSize: '40px', fontStyle: 'bold', color: '#ffe08a', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5, 1).setDepth(DEPTH.markers).setVisible(false);
    scene.tweens.add({ targets: this.badge, y: this.badge.y - 8, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.refresh();
  }

  get markerIcon() { return 'icon_talk'; }
  get markerColor() { return this.npc.color; }
  get label() { return 'Говорить'; }
  get title() { return this.npc.name; }
  get markerY() { return this.sprite.y - this.sprite.displayHeight - 44; }

  /** «!» — есть что-то новое, «?» — задание в процессе. */
  updateBadge() {
    if (this.removed) return;
    const b = services.dialogue?.badge(this.npc.id);
    this.badge.setText(b || '').setVisible(!!b && this.requirementsMet());
  }
  refresh() { super.refresh(); this.updateBadge(); }

  update(dt, player) {
    if (this.removed) return;
    const d = Math.hypot(player.x - this.x, player.y - this.baseY);
    // имя показывается вблизи
    const want = d < 300 ? 1 : 0;
    this.nameText.setAlpha(this.nameText.alpha + (want - this.nameText.alpha) * Math.min(1, dt * 6));
    // повернуться к героине
    if (d < 340) this.sprite.setFlipX(player.x < this.x);
    // приветствие: один подскок при приближении
    if (d < 210 && !this.greeted && !this.talking) { this.greeted = true; this.hop(); }
    if (d > 380) this.greeted = false;
    this.badge.setPosition(this.x, this.badge.y);
  }

  hop() {
    if (this.hopping) return;
    this.hopping = true;
    this.scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 12, duration: 130, yoyo: true, ease: 'Quad.easeOut', onComplete: () => { this.hopping = false; } });
  }

  interact() {
    if (services.dialogue.active) return;
    this.talking = true;
    this.busy = true;
    const p = this.scene.player;
    p.face(this.x - p.x, this.baseY - p.y);
    this.sprite.setFlipX(p.x < this.x);
    this.hop();
    this.react(this.npc.color, 1.06);
    services.dialogue.start(this.npc.id);
  }

  onTalkEnd() {
    this.talking = false;
    this.busy = false;
    this.greeted = true;
    this.updateBadge();
  }

  /** Редактор карты: объект сдвинули на (dx, dy) — переносим всё, что нарисовано отдельно. */
  relocate(dx, dy) {
    this.shadow.setPosition(this.shadow.x + dx, this.shadow.y + dy);
    this.nameText.setPosition(this.nameText.x + dx, this.nameText.y + dy);
    this.badge.setPosition(this.badge.x + dx, this.badge.y + dy);
  }
  onFreeze() { this.nameText.setAlpha(1); this.badge.setVisible(false); }

  remove(animate) {
    this.nameText?.destroy(); this.badge?.destroy(); this.shadow?.destroy();
    super.remove(animate);
  }
}
