import { INTERACTION, DEPTH, CONTROLS } from '../config/game.config.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { MSG } from '../state/EventBus.js';

/**
 * InteractionSystem — выбирает ближайший доступный объект (focus), рисует магические маркеры
 * над интерактивными объектами и передаёт им действия игрока.
 * Не требует точности: фокус выбирается по радиусу, тап считается по большой зоне.
 */
export class InteractionSystem {
  constructor(scene, bus) {
    this.scene = scene;
    this.bus = bus;
    this.objects = [];
    this.markers = new Map();
    this.focus = null;
    this.time = 0;
    this.ring = scene.add.image(0, 0, 'fx_ring').setDepth(DEPTH.path + 2).setVisible(false).setBlendMode('ADD');
  }

  add(obj) {
    this.objects.push(obj);
    const m = this.scene.add.image(obj.x, obj.markerY, obj.markerIcon).setDepth(DEPTH.markers).setScale(0.5).setVisible(false);
    const glow = this.scene.add.image(obj.x, obj.markerY, 'fx_glow').setDepth(DEPTH.markers - 1).setScale(0.6).setBlendMode('ADD').setVisible(false);
    this.markers.set(obj, { m, glow });
    return obj;
  }

  update(dt, player) {
    this.time += dt;
    let best = null, bestD = Infinity;
    for (const obj of this.objects) {
      const mk = this.markers.get(obj);
      if (obj.removed) { if (mk) { mk.m.destroy(); mk.glow.destroy(); this.markers.delete(obj); } continue; }
      const avail = obj.isAvailable();
      const d = Math.hypot(obj.x - player.x, obj.y - player.y);
      const show = avail && d < (obj.markerDistance ?? INTERACTION.markerVisibleDistance);
      mk.m.setVisible(show); mk.glow.setVisible(show);
      if (show) {
        const bob = Math.sin(this.time * 3 + obj.x) * 5;
        mk.m.setPosition(obj.x, obj.markerY + bob).setTexture(obj.markerIcon);
        mk.glow.setPosition(obj.x, obj.markerY + bob).setTint(obj.markerColor);
      }
      if (avail && d <= obj.radius && d < bestD) { best = obj; bestD = d; }
    }
    this.objects = this.objects.filter(o => !o.removed);
    this.setFocus(best);

    if (this.focus) {
      const mk = this.markers.get(this.focus);
      const pulse = 0.62 + Math.sin(this.time * 6) * 0.06;
      if (mk) { mk.m.setScale(pulse); mk.glow.setScale(0.9); }
      const w = Math.max(90, this.focus.sprite.displayWidth * 1.1);
      this.ring.setVisible(true).setPosition(this.focus.x, this.focus.y - 4).setDisplaySize(w, w * 0.4).setTint(this.focus.markerColor).setAlpha(0.6 + Math.sin(this.time * 6) * 0.2);
    } else this.ring.setVisible(false);
  }

  setFocus(obj) {
    if (obj === this.focus) return;
    if (this.focus) { const mk = this.markers.get(this.focus); if (mk) { mk.m.setScale(0.5); mk.glow.setScale(0.6); } }
    this.focus = obj;
    this.bus.emit(MSG.FOCUS_CHANGED, obj ? this.focusInfo() : null);
    if (obj) { obj.onFocus(); obj.focusPop?.(); }
  }

  focusInfo() {
    const f = this.focus;
    if (!f) return null;
    const cost = f.manaCost?.() || 0;   // v0.9: цена видна до нажатия — «Сдвинуть · 8 маны»
    return { label: cost ? `${f.label} · ${cost} маны` : f.label, icon: f.markerIcon, color: f.markerColor, ability: f.ability, abilityName: f.ability ? ABILITIES[f.ability].name : null, cost };
  }

  /** Действие игрока: abilityId = null — универсальная кнопка / E. */
  act(abilityId = null) {
    const f = this.focus;
    if (!f || !f.isAvailable()) {
      if (abilityId) this.scene.toast(`Рядом нет цели для дара «${ABILITIES[abilityId].name}»`);
      return false;
    }
    f.interact(abilityId);
    this.bus.emit(MSG.FOCUS_CHANGED, f.isAvailable() ? this.focusInfo() : null);
    return true;
  }

  /** Тап по миру: ближайший объект в большом радиусе вокруг точки касания. */
  pick(wx, wy) {
    let best = null, bestD = Infinity;
    for (const obj of this.objects) {
      if (!obj.isAvailable()) continue;
      const cy = obj.sprite.y - obj.sprite.displayHeight / 2;
      const d = Math.min(Math.hypot(obj.x - wx, obj.y - wy), Math.hypot(obj.x - wx, cy - wy));
      if (d < Math.max(CONTROLS.tapPickRadius, obj.sprite.displayWidth / 2) && d < bestD) { best = obj; bestD = d; }
    }
    return best;
  }

  clearFocus() { this.setFocus(null); }
}
