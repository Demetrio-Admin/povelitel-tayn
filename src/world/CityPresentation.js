import { COLORS, DEPTH } from '../config/game.config.js';
import { applyDisplaySize } from '../objects/InteractiveObject.js';
import { services } from '../services.js';

export { cityForestDecor, expeditionForestDecor } from './decorData.js';

export class CityPresentation {
  constructor(scene) {
    this.scene = scene;
    this.images = [];
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
    this.refresh();
  }

  get frostFloors(){return ['city_frost_quarter','city_frost_plaza'].map(id=>this.scene.groundViews.get(id)?.img);}

  refresh() {
    const state = services.state;
    const editor = services.edit;
    const thawed = state.hasEvent('ch2_severin_defeated');
    const quarter = state.hasEvent('ch2_frost_wave') || editor;
    const finale = state.hasEvent('ch2_final_start') && !thawed;
    this.frostFloors[0]?.setVisible(quarter || thawed).setAlpha((thawed ? 0.25 : 1)*(this.scene.groundViews.get('city_frost_quarter')?.g.alpha??1));
    this.frostFloors[1]?.setVisible(finale || editor).setAlpha(0.65*(this.scene.groundViews.get('city_frost_plaza')?.g.alpha??1));
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
    for(const {c,img} of this.scene.colliderViews.values())if(c.editorStyle)this.scene.styleImage(img,c.editorStyle,img.texture.key);
    for (const im of this.scene.cityLamps || []) {
      if (finale) im.setTint(COLORS.ice); else im.clearTint();
    }
  }
}
