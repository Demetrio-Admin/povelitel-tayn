import { InteractiveObject } from './InteractiveObject.js';
import { COLORS } from '../config/game.config.js';

// No rewards or state mutation: crossing a doorway persists the ordinary position.
export class RoomDoor extends InteractiveObject {
  get label(){ return this.cfg.room === 'city' ? 'Выйти' : 'Войти'; }
  get title(){return this.cfg.hint;}
  get markerIcon(){return 'icon_hand';}
  get markerColor(){return COLORS.gold;}
  requirementsMet(){return true;}
  isDone(){return false;}
  isAvailable(){return super.isAvailable() && (!this.cfg.requiresEvent || this.state.hasEvent(this.cfg.requiresEvent));}
  interact(ability=null){
    if(ability){this.scene.toast('Вход открывается кнопкой действия.');return;}
    if(this.cfg.requiresEvent && !this.state.hasEvent(this.cfg.requiresEvent)){
      this.scene.toast('Сначала завершите действие у входа.');return;
    }
    this.scene.travelToLocation(this.cfg.room,this.cfg.target);
  }
}
