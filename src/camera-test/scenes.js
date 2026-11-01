import { BootScene } from '../scenes/BootScene.js';
import { ExplorationScene } from '../scenes/ExplorationScene.js';
import { initServices, services } from '../services.js';
import { setCompanionStorage } from '../objects/Companion.js';
import { locationById } from '../config/locations.js';
import { cityPoint } from '../config/city.plan.js';
import { STORY } from '../config/story.js';
import { PROFILES, experiment, isolatedStorage, lookAhead } from './model.js';
import { HUD_PAD } from './hud.js';

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
    this.padForHud();
    super.follow();
  }
  // Painted rooms have no dark bands (extraTop/extraBottom = 0), so at the room edge the hero would walk under the
  // permanent HUD. With the compact HUD the camera may scroll a little past the room (dark floor colour), enough to
  // keep the hero clear of the top zone and the bottom bar. Experiment only: ExplorationScene is untouched.
  padForHud() {
    const loc = this.loc, cam = this.cameras.main;
    if (!experiment.hudPadding || !loc?.painted || loc.extraTop || loc.extraBottom) return;
    const zoom = cam.zoom || 1, v = this.view;
    const top = Math.ceil(HUD_PAD.top / zoom), bottom = Math.ceil(HUD_PAD.bottom / zoom);
    cam.setBounds(v.x, v.y - top, v.w, v.h + top + bottom);
    cam.setBackgroundColor(0x17120e);
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

// The UI scenes live in ui.js: the compact mobile HUD, and the production HUD (?hud=classic) for comparison.
export { CameraUIScene, ClassicCameraUIScene } from './ui.js';

export function testScene() { return window.__game?.scene.getScene('ExplorationScene'); }
export async function jumpTo(id) {
  const scene = testScene(), loc = locationById(id);
  if (!loc || !scene?.canAct() || experiment.changing) return;
  if (loc.requires && !services.state.hasEvent(loc.requires)) services.state.markEvent(loc.requires);
  const at = id === 'city' ? cityPoint(1700, 3620) : loc.arrival;
  if (scene.loc.id === id) { scene.player.stop(); scene.player.setPosition(at.x, at.y); scene.savePosition(); return; }
  scene.travelToLocation(id, at);
}
