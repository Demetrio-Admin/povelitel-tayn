// Рисованные элементы одобренного интерфейса. Текст и состояния остаются отдельными объектами Phaser.
import { UI } from '../config/ui.config.js';
import { currentHero } from '../state/hero.js';
import { ensureTexture } from './widgets.js';

export function addCraftMedallion(scene, x, y, size) {
  return scene.add.image(x, y, 'ui_craft_medallion').setDisplaySize(size, size);
}

// Не меняем scale каждый кадр: анимация нажатия должна закончиться сама.
export function setCraftMedallion(image, locked) {
  if (image.craftLocked === locked) return;
  image.craftLocked = locked;
  image.setAlpha(locked ? 0.48 : 1);
}

export function addCraftMenuPanel(scene, x, y, width, height) {
  // Исходник включает выступающий серп над верхней кромкой панели.
  return scene.add.image(x, y - UI.menu.crest, 'ui_craft_menu').setOrigin(0)
    .setDisplaySize(width, height + UI.menu.crest);
}

/** Портрет из текущего героя в общей рамке: ведьма и колдун имеют разные ключи кэша. */
export function addCraftPortrait(scene, x, y, size, texture = currentHero().textures.down) {
  const key = `ui:craft-portrait:${texture}:${size}`;
  ensureTexture(scene, key, size, size, (ctx) => {
    const hero = scene.textures.get(texture).getSourceImage();
    const side = Math.min(hero.width, hero.height * 0.5);
    const inset = size * 0.12, opening = size - inset * 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(inset, inset, opening, opening, size * 0.12);
    ctx.clip();
    ctx.drawImage(hero, (hero.width - side) / 2, hero.height * 0.02, side, side,
      inset, inset, opening, opening);
    ctx.restore();
    ctx.drawImage(scene.textures.get('ui_craft_portrait').getSourceImage(), 0, 0, size, size);
  }, 0);
  return scene.add.image(x, y, key).setDisplaySize(size, size);
}
