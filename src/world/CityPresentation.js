import { BUILDINGS } from '../config/city.plan.js';
import { COLORS, DEPTH } from '../config/game.config.js';
import { applyDisplaySize } from '../objects/InteractiveObject.js';
import { services } from '../services.js';

export { cityForestDecor, expeditionForestDecor } from './decorData.js';

export class CityPresentation {
  constructor(scene) {
    this.scene = scene;
    this.images = [];
    for(const b of BUILDINGS){
      const plaque=b.id==='bank'||b.id==='archive';
      const text=scene.add.text(b.door.x,b.door.y+(b.id==='bank'?-220:b.id==='archive'?-166:25),plaque?(b.id==='bank'?'БАНК':'АРХИВ'):b.name,{
        fontFamily:'Philosopher',fontSize:plaque?'25px':'28px',color:'#e7d6ad',stroke:'#251c14',strokeThickness:plaque?3:5,
      }).setOrigin(0.5,1).setDepth(DEPTH.markers-2);
      this.images.push(text);
    }
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
    const fountain = this.scene.colliderObjects?.find(im => ['city_final_fountain_frozen', 'city_final_fountain'].includes(im.texture?.key));
    if (fountain && this.scene.textures.exists('city_final_fountain')) {
      const key = !thawed && (state.hasEvent('ch2_city_arrived') || editor) ? 'city_final_fountain_frozen' : 'city_final_fountain';
      fountain.setTexture(key); applyDisplaySize(fountain, key);
    }
    for(const {c,img} of this.scene.colliderViews.values())if(c.editorStyle)this.scene.styleImage(img,c.editorStyle,img.texture.key);
    // Individual house art shares the story frost state without swapping back to generic houses.
    for(const {c,img} of this.scene.colliderViews.values()){
      if(['north_bay','north_workshop','cellar','rescue'].includes(c.building) && quarter && !thawed){
        img.setTint(0xb6dbea);
      }
    }
    for (const im of this.scene.cityLamps || []) {
      if (finale) im.setTint(COLORS.ice); else im.clearTint();
    }
  }
}
