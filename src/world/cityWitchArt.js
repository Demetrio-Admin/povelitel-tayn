import { CITY_WITCH_ATLASES, CITY_WITCH_SPRITES } from '../config/city.witch.art.js';

/** Small standalone textures preserve the existing editor/object keys and avoid
 * uploading the entire atlas once per house. Geometry and quest IDs stay independent. */
export function installCityWitchSprites(textures) {
  for(const [key,def] of Object.entries(CITY_WITCH_SPRITES)){
    if(textures.exists(key) || !textures.exists(def.atlas))continue;
    const source=textures.get(def.atlas).getSourceImage(),f=def.frame;
    const texture=textures.createCanvas(key,f.w,f.h);
    texture.context.drawImage(source,f.x,f.y,f.w,f.h,0,0,f.w,f.h);
    texture.customData.cityWitch=true;
    texture.refresh();
  }
  for(const key of Object.keys(CITY_WITCH_ATLASES))if(textures.exists(key))textures.remove(key);
}
