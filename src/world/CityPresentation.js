import { CITY_COLLIDERS, CITY_ROOM_DECOR } from '../config/world.city.js';
import { EXP_COLLIDERS } from '../config/world.expeditions.js';
import { COLORS, DEPTH } from '../config/game.config.js';
import { applyDisplaySize } from '../objects/InteractiveObject.js';
import { services } from '../services.js';

// City-only visual layers. Solid forest blocks already define collision; filler
// trees are placed inside them without rebaking or changing the first forest.
export function cityForestDecor() {
  const props = [];
  const keys = ['tree_dark_01', 'tree_dark_02', 'tree_autumn_01', 'tree_autumn_02', 'birch_01'];
  let seed = 20261006;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (const c of CITY_COLLIDERS.filter(c => c.kind === 'trees' && c.w >= 150)) {
    const top = Math.max(1260, c.y);
    for (let y = top + 60; y < c.y + c.h; y += 74) {
      for (let x = c.x + 45; x < c.x + c.w - 30; x += 85) {
        props.push({ id: `city_forest_${props.length}`, k: keys[Math.floor(random() * keys.length)],
          x: x + (random() - 0.5) * 20, y: y + (random() - 0.5) * 16, flip: random() < 0.5 });
      }
    }
  }
  return props;
}

/** Fill already blocked expedition thickets; no new obstacles or route changes. */
export function expeditionForestDecor(loc) {
  if (!loc?.expedition) return [];
  const props = [], r = loc.rect;
  const keys = loc.id === 'frostwood' ? ['tree_frost_01', 'tree_frost_01', 'tree_frost_02'] : ['dead_tree_grey_01'];
  let n = 0;
  for (const c of EXP_COLLIDERS.filter(c => c.kind === 'trees')) {
    const x0 = Math.max(c.x, r.x), x1 = Math.min(c.x + c.w, r.x + r.w);
    const y0 = Math.max(c.y, r.y), y1 = Math.min(c.y + c.h, r.y + r.h);
    if (x1 <= x0 || y1 <= y0) continue;
    for (let y = y0 + 55; y < y1; y += 88) {
      for (let x = x0 + Math.min(45, (x1-x0)/2); x < x1-20; x += 95) {
        props.push({ id: `exp_forest_${loc.id}_${n}`, k: keys[n % keys.length], x, y: y + (n % 3) * 4,
          flip: n % 2 === 0, scale: c.h < 200 && c.w > 200 ? 0.72 : 1 });
        n++;
      }
    }
  }
  return props;
}

export class CityPresentation {
  constructor(scene) {
    this.scene = scene;
    this.images = [];
    this.dynamic = [];
    this.frostFloors = [
      scene.add.tileSprite(2400, 1500, 1160, 1000, 'city_paving_frost').setOrigin(0).setTileScale(0.5).setDepth(DEPTH.path + 0.2),
      scene.add.tileSprite(2400, 3040, 1160, 1060, 'city_paving_frost').setOrigin(0).setTileScale(0.5).setDepth(DEPTH.path + 0.2),
    ];
    for (const d of cityForestDecor()) this.image(d.k, d.x, d.y, { flip: d.flip });
    // Planting stays against solid walls, leaving the middle of every street walkable.
    for (const x of [2425, 3535]) {
      for (const y of [1660, 1840, 2280, 2460, 3160, 3360, 3860, 4020, 4800, 4960]) {
        this.image('bush_02', x, y, { scale: 0.72 });
        this.image('flower_white_01', x + (x < 3000 ? 16 : -16), y + 8, { scale: 0.65 });
      }
    }
    for (const d of CITY_ROOM_DECOR) this.image(d.key, d.x, d.y, d);
    // Market stock is against the stall, away from the bank's visitor area.
    this.image('city_barrel', 3470, 3450);
    this.image('city_crate', 3440, 3500);
    // A clear training floor, with equipment along the sides instead of a living-room rug.
    const mat = scene.add.graphics().setDepth(DEPTH.path + 0.6);
    mat.fillStyle(0x695453, 0.22).fillRect(2570, 4230, 140, 150);
    mat.lineStyle(2, 0xb79c67, 0.7).strokeRect(2570, 4230, 140, 150);
    mat.strokeEllipse(2640, 4305, 100, 72);
    this.images.push(mat);
    const bankName = scene.add.text(3320, 3570, 'Городской Банк', {
      fontFamily: 'Philosopher', fontSize: '25px', color: '#e7d6ad', stroke: '#251c14', strokeThickness: 5,
    }).setOrigin(0.5, 1).setDepth(DEPTH.markers - 2);
    this.images.push(bankName);
    this.image('city_cellar', 2500, 2190, { ground: true, requires: 'ch2_rescue_cellar' });
    this.image('city_patient_miron', 2170, 4450, { requires: 'ch2_vol_2' });
    this.image('city_resident_woman', 3410, 2280, { requires: 'ch2_rescue_door' });
    this.image('city_resident_man', 3480, 2320, { requires: 'ch2_rescue_door' });
    this.refresh();
  }

  image(key, x, y, options = {}) {
    if (!this.scene.textures.exists(key)) return null;
    const im = this.scene.add.image(x, y, key).setOrigin(0.5, 1);
    applyDisplaySize(im, key);
    im.setDepth(options.ground ? DEPTH.path + 0.7 : DEPTH.mainBase + y);
    if (options.scale) im.setScale(im.scaleX * options.scale, im.scaleY * options.scale);
    if (options.flip) im.setFlipX(true);
    if (options.tint) im.setTint(options.tint);
    this.images.push(im);
    if (options.requires) this.dynamic.push({ im, event: options.requires });
    return im;
  }

  refresh() {
    const state = services.state;
    const editor = services.edit;
    const thawed = state.hasEvent('ch2_severin_defeated');
    const quarter = state.hasEvent('ch2_frost_wave') || editor;
    const finale = state.hasEvent('ch2_final_start') && !thawed;
    this.frostFloors[0].setVisible(quarter || thawed).setAlpha(thawed ? 0.25 : 1);
    this.frostFloors[1].setVisible(finale || editor).setAlpha(0.65);
    for (const { im, event } of this.dynamic) im.setVisible(editor || state.hasEvent(event));
    for (const im of this.scene.colliderObjects?.filter(im => ['city_house', 'city_frozen_house'].includes(im.texture?.key)) || []) {
      if (im.y < 2500 && this.scene.textures.exists('city_frozen_house')) {
        im.setTexture(quarter && !thawed ? 'city_frozen_house' : 'city_house');
        applyDisplaySize(im, im.texture.key);
      }
    }
    const fountain = this.scene.colliderObjects?.find(im => ['fountain_frozen', 'city_fountain'].includes(im.texture?.key));
    if (fountain && this.scene.textures.exists('city_fountain')) {
      const key = !thawed && (state.hasEvent('ch2_city_arrived') || editor) ? 'fountain_frozen' : 'city_fountain';
      fountain.setTexture(key); applyDisplaySize(fountain, key);
    }
    for (const im of this.scene.cityLamps || []) {
      if (finale) im.setTint(COLORS.ice); else im.clearTint();
    }
  }
}
