// Shared, touch-friendly close control for non-blocking notices.
export function addNoticeClose(scene, container, onClose, { x = 0, y = 0 } = {}) {
  const button = scene.add.container(x, y);
  const bg = scene.add.circle(0, 0, 22, 0x120d0b, 0.9).setStrokeStyle(2, 0xe8c56a, 0.8);
  const icon = scene.add.image(0, 0, 'icon_close').setDisplaySize(28, 28);
  const hit = scene.add.zone(0, 0, 64, 64).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', (_pointer, _x, _y, event) => {
    event?.stopPropagation(); // closing must not move the hero or use a gift
    onClose();
  });
  button.add([bg, icon, hit]);
  container.add(button);
  return button;
}
