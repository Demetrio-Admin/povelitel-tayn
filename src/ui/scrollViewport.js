// A clipped, touch-scrollable area inside a fixed modal. Header/footer stay put.
// Phaser masks only clip rendering: separately disable hit areas outside the view.
export function addScrollViewport(scene, root, content, { x, y, width, height, contentHeight }) {
  const maskSource = scene.add.graphics().fillStyle(0xffffff).fillRect(x, y, width, height).setVisible(false);
  const mask = maskSource.createGeometryMask();
  content.setMask(mask);
  const catcher = scene.add.zone(x, y, width, height).setOrigin(0).setInteractive();
  root.add(catcher);
  root.add(content);
  const track = scene.add.graphics();
  root.add(track);
  const max = Math.max(0, contentHeight - height);
  let offset = 0, drag = null, moved = false;
  const point = p => scene.viewport?.point(p) || p;
  const inside = p => { const at = point(p); return at.x >= x && at.x <= x + width && at.y >= y && at.y <= y + height; };
  const interactive = [];
  const collect = o => { if (o.input) interactive.push(o); if (Array.isArray(o.list)) o.list.forEach(collect); };
  if (Array.isArray(content.list)) content.list.forEach(collect);
  const api = {
    max, height, contentHeight, x, y, width,
    get offset() { return offset; },
    canTap: () => !moved && inside(scene.input.activePointer),
    refreshInput: () => {
      for (const o of interactive) {
        const b = o.getBounds();
        o.input.enabled = b.top >= y - 1 && b.bottom <= y + height + 1;
      }
    },
    scrollTo: value => {
      offset = Math.max(0, Math.min(max, value));
      content.setPosition(x, y - offset);
      api.refreshInput();
      track.clear();
      if (max) {
        const thumbH = Math.max(44, height * height / contentHeight);
        track.fillStyle(0x8a6a2a, 0.35).fillRoundedRect(x + width + 8, y, 6, height, 3);
        track.fillStyle(0xf6e3a1, 0.95).fillRoundedRect(x + width + 6, y + (height - thumbH) * offset / max, 10, thumbH, 5);
      }
    },
    destroy: () => {
      scene.input.off('pointerdown', down);
      scene.input.off('pointermove', move);
      scene.input.off('pointerup', up);
      scene.input.off('pointerupoutside', up);
      scene.input.off('wheel', wheel);
      scene.input.keyboard?.off('keydown', key);
      content.clearMask(); mask.destroy(); maskSource.destroy();
    },
  };
  const down = p => { if (inside(p)) { moved = false; drag = { id: p.id, y: p.y, offset }; } else drag = null; };
  const move = p => {
    if (!drag || p.id !== drag.id || !p.isDown) return;
    if (Math.abs(p.y - drag.y) > 12) moved = true;
    if (moved) api.scrollTo(drag.offset + drag.y - p.y);
  };
  const up = () => { drag = null; }; // moved stays set until the next pointerdown: release cannot craft/select.
  const wheel = (p, over, dx, dy) => { if (inside(p)) api.scrollTo(offset + dy); };
  const key = e => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { api.scrollTo(offset + height * 0.7); e.preventDefault(); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { api.scrollTo(offset - height * 0.7); e.preventDefault(); }
  };
  scene.input.on('pointerdown', down);
  scene.input.on('pointermove', move);
  scene.input.on('pointerup', up);
  scene.input.on('pointerupoutside', up);
  scene.input.on('wheel', wheel);
  scene.input.keyboard?.on('keydown', key);
  api.scrollTo(0);
  return api;
}
