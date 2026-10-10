import Phaser from 'phaser';
import { VIEW } from '../config/game.config.js';

// Expand the visible map, keeping the authored 720×1280 UI and sprites at one uniform scale.
export function viewportScaleMode(host) {
  return host.clientWidth <= host.clientHeight ? Phaser.Scale.EXPAND : Phaser.Scale.FIT;
}

export function bindBrowserViewport(game, host) {
  const viewport = window.visualViewport;
  let frame = null, lastWidth = 0;
  const update = () => {
    frame = null;
    const width = viewport?.width || window.innerWidth;
    const active = document.activeElement;
    const typing = active?.matches('input, textarea, [contenteditable="true"]');
    // Keyboard overlays already follow visualViewport. Keep the map and its controls steady while typing.
    if (typing && Math.abs(width - lastWidth) < 2) return;
    lastWidth = width;
    const style = document.documentElement.style;
    style.setProperty('--viewport-width', `${width}px`);
    style.setProperty('--viewport-height', `${viewport?.height || window.innerHeight}px`);
    style.setProperty('--viewport-left', `${viewport?.offsetLeft || 0}px`);
    style.setProperty('--viewport-top', `${viewport?.offsetTop || 0}px`);
    const mode = viewportScaleMode(host);
    if (game.scale.scaleMode !== mode) {
      game.scale.scaleMode = mode;
      game.scale.displaySize.setAspectMode(mode === Phaser.Scale.FIT ? Phaser.Scale.FIT : 0);
      game.scale.setGameSize(VIEW.width, VIEW.height);
    }
    game.scale.refresh();
  };
  const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  document.addEventListener('focusout', schedule);
  document.addEventListener('fullscreenchange', schedule);
  update();
  game.events.once('destroy', () => {
    if (frame !== null) cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    document.removeEventListener('focusout', schedule);
    document.removeEventListener('fullscreenchange', schedule);
  });
}

// Separate camera transforms anchor HUD/dock without stretching artwork or moving modal masks.
export function bindSceneViewport(scene, { hud = false, world = false } = {}) {
  if (!scene.scale.on || !scene.cameras?.main?.setViewport) return null; // CPU-only UI harness.
  const center = scene.cameras.main;
  const cameras = { center };
  if (hud) {
    cameras.top = scene.cameras.add();
    cameras.bottom = scene.cameras.add();
    // Dialogs and dimmers render above both HUD layers.
    scene.cameras.cameras.splice(0, 3, cameras.top, cameras.bottom, center);
  }
  const covers = new Set();
  const fills = new Set();
  const pending = new Set();
  const assign = (object, name = 'center') => {
    object.cameraFilter = Object.entries(cameras).reduce((mask, [key, camera]) => key === name ? mask : mask | camera.id, 0);
    for (const child of object.list || []) assign(child, name);
    return object;
  };
  const fill = (object) => {
    // Full-screen dimmers are authored as reference rectangles; retain their color, alpha and input area.
    fills.add(object);
    return object;
  };
  const update = () => {
    const { width, height } = scene.scale.gameSize;
    for (const [name, camera] of Object.entries(cameras)) {
      camera.setViewport(0, 0, width, height);
      if (!world) camera.setScroll((VIEW.width - width) / 2,
        name === 'top' ? 0 : name === 'bottom' ? VIEW.height - height : (VIEW.height - height) / 2);
    }
    for (const object of covers) {
      if (!object.scene) { covers.delete(object); continue; }
      const factor = Math.max(width / object.width, height / object.height);
      object.setPosition(VIEW.width / 2, VIEW.height / 2).setOrigin(0.5).setScale(factor);
    }
    for (const object of fills) {
      if (!object.scene) { fills.delete(object); continue; }
      object.setPosition(center.scrollX, center.scrollY).setSize(width, height).setOrigin(0);
      if (object.input) object.input.hitArea.setTo(0, 0, width, height);
    }
  };
  const added = object => { assign(object); pending.add(object); };
  // Detect reference-size dimmers after their factory chain has set origin and dimensions.
  const beforeUpdate = () => {
    let changed = false;
    for (const object of pending) {
      if (object.type === 'Rectangle' && object.width === VIEW.width && object.height === VIEW.height
        && object.fillColor === 0 && object.fillAlpha > 0 && object.originX === 0 && object.originY === 0) {
        fill(object); changed = true;
      }
    }
    pending.clear();
    if (changed) update();
  };
  scene.events.on('addedtoscene', added);
  scene.events.on('preupdate', beforeUpdate);
  scene.scale.on('resize', update);
  scene.events.once('shutdown', () => {
    scene.events.off('addedtoscene', added);
    scene.events.off('preupdate', beforeUpdate);
    scene.scale.off('resize', update);
  });
  update();
  return {
    cameras,
    assign,
    cover(object) { covers.add(object); update(); return object; },
    point(pointer, name = 'center') { return cameras[name].getWorldPoint(pointer.x, pointer.y); },
  };
}

export function fullscreenSupported() {
  return typeof document !== 'undefined' && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
}

export async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
}
