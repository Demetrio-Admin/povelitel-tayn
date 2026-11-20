import { DEPTH, PLAYER } from '../config/game.config.js';
import { applyDisplaySize } from '../objects/InteractiveObject.js';

export const HEARTH_START = { x: 691, y: 733 };
export const HEARTH = {
  id: 'mirra-hearth', name: 'Очаг Мирры', rect: { x: 0, y: 0, w: 1920, h: 1280 },
  arrival: HEARTH_START, painted: true,
};
export const GATE = { x: 687, y: 871, w: 160, h: 42 };
export const WORKBENCH = { x: 911, y: 665 };
export const LANTERN = { x: 867, y: 775 };
export const FROST = { x: 794, y: 829 };
export const FOX = { x: 638, y: 954 };
export const CAMPFIRE = { x: 1238, y: 1059 };

const WEST = 416, EAST = 970, PORCH = 552;
const NORTH = { x: WEST, y: 510, w: EAST - WEST + 22, h: 73 };
const LEFT = { x: WEST - 16, y: PORCH, w: 38, h: GATE.y - PORCH };
const RIGHT = { x: EAST - 18, y: PORCH, w: 40, h: GATE.y - PORCH };
const FRONT = [
  { x: WEST - 16, y: GATE.y - GATE.h, w: GATE.x - GATE.w / 2 - WEST + 16, h: GATE.h },
  { x: GATE.x + GATE.w / 2, y: GATE.y - GATE.h, w: EAST + 22 - GATE.x - GATE.w / 2, h: GATE.h },
];
const GATE_BOX = { x: GATE.x - GATE.w / 2, y: GATE.y - GATE.h, w: GATE.w, h: GATE.h };
const COLLIDERS = [
  NORTH, LEFT, RIGHT, ...FRONT,
  { x: 287, y: 109, w: 720, h: 440 }, // Cottage, porch railings and woodpile.
  { x: 0, y: 0, w: 275, h: 1160 }, // Dense trees and heather.
  { x: 0, y: 0, w: 1480, h: 364 },
  { x: 0, y: 1184, w: 1920, h: 96 },
  { x: 1872, y: 0, w: 48, h: 1280 },
  { x: 875, y: 638, w: 72, h: 33 }, // Feet of the workbench.
];
const ARRIVALS = {
  spark: { x: 739, y: 737 },
  lantern: { x: 742, y: 741 },
  upgrade: { x: 804, y: 727 },
  frost: { x: 776, y: 756 },
  thaw: { x: 692, y: 770 },
  veda: { x: 689, y: 943 },
  grom: { x: 1107, y: 1061 },
  hunt: { x: 1107, y: 1061 },
};
const CLOSED_STEPS = new Set(['intro', 'spark', 'lantern', 'upgrade', 'frost', 'thaw']);
export const gateClosed = step => CLOSED_STEPS.has(step);

export function hearthMap() {
  return { roads: [], waters: [], props: [], pos: {}, colliders: COLLIDERS };
}

export function hearthArrival(position, step) {
  const { x, y } = position || {};
  const { w, h } = PLAYER.hitbox;
  const boxes = gateClosed(step) ? [...COLLIDERS, GATE_BOX] : COLLIDERS;
  const blocked = boxes.some(b => x + w / 2 > b.x && x - w / 2 < b.x + b.w && y > b.y && y - h < b.y + b.h);
  const inMap = x > 0 && y > 0 && x < HEARTH.rect.w && y < HEARTH.rect.h;
  const inYard = x > LEFT.x + LEFT.w && x < RIGHT.x && y > NORTH.y + NORTH.h && y < GATE_BOX.y;
  return inMap && !blocked && (!gateClosed(step) || inYard) ? position : (ARRIVALS[step] || HEARTH_START);
}

export class HearthPresentation {
  constructor(scene) {
    this.scene = scene;
    const fenceArt = scene.textures.get('horizon_hearth_fence');
    if (!fenceArt.has('end-post')) fenceArt.add('end-post', 0, 7, 0, 45, fenceArt.source[0].height);
    const gateArt = scene.textures.get('horizon_hearth_gate');
    const { width, height } = gateArt.source[0];
    if (!gateArt.has('left-post')) {
      gateArt.add('left-post', 0, 0, 0, 60, height);
      gateArt.add('right-post', 0, width - 64, 0, 64, height);
      gateArt.add('left-leaf', 0, 62, 27, 157, height - 34);
      gateArt.add('right-leaf', 0, 222, 27, 153, height - 34);
    }
    for (const section of FRONT) this.fence(section);
    for (const section of [LEFT, RIGHT]) this.sideFence(section);
    const gateDepth = DEPTH.mainBase + GATE.y;
    scene.add.ellipse(GATE.x, GATE.y - 3, 227, 34, 0x201710, 0.44).setDepth(DEPTH.path);
    this.gate = scene.add.image(GATE.x, GATE.y, 'horizon_hearth_gate', '__BASE').setOrigin(0.5, 1)
      .setDisplaySize(220, 125).setDepth(gateDepth + 1);
    this.openLeaves = [-1, 1].flatMap(side => {
      const name = side < 0 ? 'left' : 'right';
      const post = scene.add.image(GATE.x + side * 96, GATE.y, 'horizon_hearth_gate', name + '-post')
        .setOrigin(0.5, 1).setDisplaySize(31, 125).setDepth(gateDepth + 1);
      const leaf = scene.add.image(GATE.x + side * 77, GATE.y - 19, 'horizon_hearth_gate', name + '-leaf')
        .setOrigin(0.5, 1).setDisplaySize(36, 99).setAngle(side * 16).setTint(0xc9bcab).setDepth(gateDepth);
      return [post, leaf];
    });
    this.blocker = scene.addBlocker(GATE.x, GATE.y, GATE.w, GATE.h);
    this.ice = scene.add.image(GATE.x + 2, GATE.y + 4, 'horizon_hearth_ice').setOrigin(0.5, 1)
      .setDisplaySize(232, 124).setDepth(gateDepth + 2);
    this.frostLight = scene.add.image(GATE.x, GATE.y - 37, 'fx_glow').setTint(0x65d8fc)
      .setDisplaySize(275, 177).setBlendMode('ADD').setDepth(gateDepth).setAlpha(0.23);
    this.frostMist = scene.add.particles(GATE.x, GATE.y - 24, 'fx_dot', {
      x: { min: -94, max: 94 }, y: { min: -30, max: 9 },
      speedX: { min: -12, max: 22 }, speedY: { min: -28, max: -7 },
      scale: { start: 0.23, end: 0 }, lifespan: 1200, frequency: 140,
      alpha: { start: 0.56, end: 0 }, tint: [0xc8f6ff, 0x8af0f4], blendMode: 'ADD', emitting: false,
    }).setDepth(gateDepth + 4);
    const props = [
      [WORKBENCH.x, WORKBENCH.y, 'table_01'],
      [929, 619, 'plant_pot_01'],
      [924, 744, 'cauldron_01'],
      [LANTERN.x, LANTERN.y + 16, 'lantern_02'],
      [858, 991, 'flower_purple_01'],
      [1110, 994, 'signpost_01'],
      [CAMPFIRE.x, CAMPFIRE.y, 'campfire_01'],
      [1322, 1038, 'trunk_01'],
      [1425, 1094, 'rock_small_01'],
      [1375, 813, 'mushroom_red_01'],
      [1479, 638, 'rock_medium_01'],
    ];
    const views = props.map(([x, y, key]) => this.prop(x, y, key));
    this.workbench = views[0];
    this.workbenchIce = this.prop(WORKBENCH.x + 11, WORKBENCH.y - 11, 'horizon_hearth_ice')
      .setDisplaySize(88, 43).setAlpha(0.62).setDepth(DEPTH.mainBase + WORKBENCH.y + 0.5);
    this.cauldron = views[2];
    this.lantern = views[3];
    this.fox = this.prop(FOX.x, FOX.y, 'companion_fox').setDisplaySize(63, 42);
    this.lanternLight = this.warmLight(LANTERN.x, LANTERN.y - 49, 142);
    this.warmLight(CAMPFIRE.x, CAMPFIRE.y - 28, 173);
    scene.add.particles(CAMPFIRE.x, CAMPFIRE.y - 29, 'fx_dot', {
      x: { min: -9, max: 9 }, speedY: { min: -37, max: -10 }, speedX: { min: -10, max: 10 },
      alpha: { start: 0.62, end: 0 }, scale: { start: 0.33, end: 0.05 }, lifespan: 940, frequency: 210,
      tint: [0xff913b, 0xffd77e], blendMode: 'ADD',
    }).setDepth(DEPTH.mainBase + CAMPFIRE.y + 1);
  }

  prop(x, y, key) {
    return applyDisplaySize(this.scene.add.image(x, y, key), key).setOrigin(0.5, 1).setDepth(DEPTH.mainBase + y);
  }

  fence({ x, y, w, h }) {
    const { scene } = this, bottom = y + h;
    scene.add.ellipse(x + w / 2, bottom - 3, w + 9, 28, 0x211811, 0.43).setDepth(DEPTH.path);
    const count = Math.max(1, Math.round(w / 149)), sectionWidth = w / count;
    for (let i = 0; i < count; i++) {
      scene.add.image(x + (i + 0.5) * sectionWidth, bottom, 'horizon_hearth_fence', '__BASE').setOrigin(0.5, 1)
        .setDisplaySize(sectionWidth + 4, 77).setDepth(DEPTH.mainBase + bottom);
    }
  }

  sideFence({ x, y, w, h }) {
    const { scene } = this, count = 5;
    const posts = Array.from({ length: count }, (_, i) => ({
      x: x + w / 2 + (i % 2 ? -4 : 3),
      y: y + 17 + i * (h - 22) / (count - 1),
    }));
    for (const [i, post] of posts.entries()) {
      const prior = posts[i - 1];
      if (prior) {
        const rails = scene.add.graphics().setDepth(DEPTH.mainBase + post.y - 0.1);
        for (const offset of [41, 69]) {
          rails.lineStyle(14, 0x342219).lineBetween(prior.x + 4, prior.y - offset, post.x + 4, post.y - offset);
          rails.lineStyle(7, 0x624434).lineBetween(prior.x + 1, prior.y - offset, post.x + 1, post.y - offset);
        }
      }
      scene.add.ellipse(post.x + 8, post.y - 5, 57, 33, 0x221b18, 0.38).setDepth(DEPTH.path);
      scene.add.image(post.x, post.y, 'horizon_hearth_fence', 'end-post').setOrigin(0.5, 1)
        .setDisplaySize(26, 87).setTint(0xcbbaa5).setDepth(DEPTH.mainBase + post.y);
    }
  }

  warmLight(x, y, size) {
    const glow = this.scene.add.image(x, y, 'fx_glow').setTint(0xffad52).setDisplaySize(size, size)
      .setBlendMode('ADD').setDepth(DEPTH.mainBase + y + 38);
    this.scene.tweens.add({ targets: glow, alpha: { from: 0.29, to: 0.46 }, duration: 1020, yoyo: true, repeat: -1 });
    return glow;
  }

  setFrozen(frozen) {
    this.frozen = frozen;
    this.ice.setVisible(frozen).setAlpha(1);
    this.frostLight.setVisible(frozen).setAlpha(0.23);
    if (frozen && !this.frostMist.emitting) this.frostMist.start();
    if (!frozen && this.frostMist.emitting) this.frostMist.stop();
  }

  refresh({ step, workbenchRestored }, frozen = ['spark','lantern','upgrade','frost'].includes(step)) {
    const closed = gateClosed(step);
    const cold = !workbenchRestored && (frozen || step === 'thaw' || !closed);
    this.gate.setVisible(closed);
    this.blocker.body.enable = closed;
    for (const leaf of this.openLeaves) leaf.setVisible(!closed);
    this.setFrozen(frozen);
    this.fox.setVisible(closed);
    this.lantern.setVisible(step === 'intro' || !closed);
    this.lanternLight.setVisible(step === 'intro' || !closed);
    this.workbenchIce.setVisible(cold);
    this.workbench.setTint(cold ? 0x8bbcca : 0xffffff);
    this.cauldron.setTint(cold ? 0x9abdd3 : 0xffffff);
  }
}
