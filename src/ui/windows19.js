import { services } from '../services.js';
import { MSG } from '../state/EventBus.js';
import { showShop } from './shopUI.js';

export const windows19 = {
  openShop(title = 'Лавка') {
    if (this.mode === 'combat') return;
    if (this.modal) this.closeModal(null);
    services.audio.play('journal');
    const modal = this.modal = { dom: true, opts: { title } };
    services.modalOpen = true;
    this.resetJoystick();
    this.bus.emit(MSG.MODAL_OPEN);
    const shop = showShop({ title, state: services.state, actions: services.actions, audio: services.audio,
      onRefresh: () => this.refreshHud?.(),
      onClose: () => { if (this.modal === modal) { this.modal = null; services.modalOpen = false; this.bus.emit(MSG.MODAL_CLOSED); } },
    });
    modal.close = shop.close;
    return shop;
  },
};
