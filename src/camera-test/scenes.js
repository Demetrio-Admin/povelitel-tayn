import { BootScene } from '../scenes/BootScene.js';
import { ExplorationScene } from '../scenes/ExplorationScene.js';
import { UIScene } from '../scenes/UIScene.js';
import { initServices, services } from '../services.js';
import { setCompanionStorage } from '../objects/Companion.js';
import { locationById } from '../config/locations.js';
import { cityPoint } from '../config/city.plan.js';
import { STORY } from '../config/story.js';
import { PROFILES, experiment, isolatedStorage, lookAhead } from './model.js';

export class CameraBootScene extends BootScene {
  create() {
    let raw; try { raw = window.localStorage; } catch { /* private browsing */ }
    const storage = isolatedStorage(raw);
    setCompanionStorage(storage);
    initServices({ storage, localOnly: true });
    services.skipMenu = true;
    services.settings.set('hints', false);
    if (!services.hadSave) {
      const state = services.state;
      state.data.player = { x: 1200, y: 4416 };
      state.data.safePoint = { ...state.data.player };
      state.data.completedEvents.push(STORY.prologueEvent, STORY.starterKitEvent, 'unlock_telekinesis_1', 'ch2_start');
      state.data.unlockedAbilities = ['telekinesis'];
      state.data.telekinesisLevel = 1;
      state.data.inventory.coins = 500;
      state.save();
    }
    this.scene.start('PreloadScene');
  }
}

export class CameraExplorationScene extends ExplorationScene {
  create() {
    this.look = { x: 0, y: 0 };
    super.create();
    // Resize only the visible image around its foot pivot, after the existing animator.
    const player = this.player, draw = player.updateVisual.bind(player);
    player.updateVisual = (...args) => {
      draw(...args);
      const factor = PROFILES[experiment.profile].scale, view = player.view;
      view.setPosition(player.x + (view.x - player.x) * factor, player.y + (view.y - player.y) * factor);
      view.setScale(view.scaleX * factor, view.scaleY * factor);
    };
    player.updateVisual(0, 0, 0);
    this.applyProfile();
  }
  follow() {
    this.look = { x: 0, y: 0 };
    super.follow();
  }
  applyProfile() {
    this.look = { x: 0, y: 0 };
    this.player.updateVisual(0, 0, 0);
    this.cameras.main.setFollowOffset(0, this.followOffsetY);
  }
  canAct() { return super.canAct() && !services.dialogue.active && !experiment.panelOpen; }
  update(time, delta) {
    super.update(time, delta);
    if (!this.player || services.mode !== 'exploration') return;
    const cam = this.cameras.main, amount = PROFILES[experiment.profile].look;
    const velocity = this.canAct() ? this.player.sprite.body.velocity : { x: 0, y: 0 };
    this.look = lookAhead(this.look, velocity, delta / 1000, cam.width / cam.zoom, cam.height / cam.zoom, amount);
    // Phaser subtracts the follow offset from the target position.
    cam.setFollowOffset(-this.look.x, this.followOffsetY - this.look.y);
  }
  // Fail closed if navigation cannot find a path; never fall back to a straight line through a wall.
  onTap(point) {
    if (!this.canAct()) return;
    const wp = this.cameras.main.getWorldPoint(point.x, point.y);
    const object = this.interaction.pick(wp.x, wp.y);
    const target = object ? object.cfg.approach || object : wp;
    if (!this.planPath(target.x, target.y)) { this.player.stop(); this.toast('Сюда не пройти'); return; }
    this.player.moveTarget = null;
    super.onTap(point);
  }
  scheduleStory() {} // The test skips scripted introductions, not ordinary object interaction.
}

export class CameraUIScene extends UIScene {
  openWallet() { this.toast('Тестовый режим: покупки отключены'); }
  openAccount() { this.toast('Локальный тест: вход в аккаунт отключён'); }
  openChat() { this.toast('Тестовый режим: чат отключён'); }
  openCovens() { this.toast('Тестовый режим: Ковены отключены'); }
  openDuel() { this.toast('Тестовый режим: сетевые дуэли отключены'); }
  setupPointer() {
    const before = new Set(this.input.listeners('pointerdown'));
    super.setupPointer();
    const start = this.input.listeners('pointerdown').find(fn => !before.has(fn));
    this.input.off('pointerdown', start);
    this.input.on('pointerdown', (p, over) => { if (!this.touch) start(p, over); });
    // A second finger on a HUD control must not replace an active joystick gesture.
    this.input.on('pointermove', () => { if (Math.hypot(services.input.joy.x, services.input.joy.y) > .01) this.scene.get('ExplorationScene').player.moveTarget = null; });
  }
}

export function testScene() { return window.__game?.scene.getScene('ExplorationScene'); }
export async function jumpTo(id) {
  const scene = testScene(), loc = locationById(id);
  if (!loc || !scene?.canAct() || experiment.changing) return;
  if (loc.requires && !services.state.hasEvent(loc.requires)) services.state.markEvent(loc.requires);
  const at = id === 'city' ? cityPoint(1700, 3620) : loc.arrival;
  if (scene.loc.id === id) { scene.player.stop(); scene.player.setPosition(at.x, at.y); scene.savePosition(); return; }
  scene.travelToLocation(id, at);
}
