import Phaser from 'phaser';
import { MSG } from '../state/EventBus.js';

/**
 * InputController — клавиатура (WASD / стрелки / E / Пробел / 1-2-3 / Q / B / Esc).
 * Джойстик и тапы обрабатывает UIScene и пишет в тот же shared-объект input.
 * Итоговый вектор движения: input.move = клавиатура, иначе джойстик.
 */
export class InputController {
  constructor(scene, bus, input, handlers = {}) {
    this.scene = scene;
    this.bus = bus;
    this.input = input; // { joy: {x,y}, kb: {x,y}, move: {x,y} }
    this.handlers = handlers;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const kb = scene.input.keyboard;
    this.keys = kb.addKeys({
      up: K.W, down: K.S, left: K.A, right: K.D,
      up2: K.UP, down2: K.DOWN, left2: K.LEFT, right2: K.RIGHT,
    });
    const on = (code, fn) => kb.on(`keydown-${code}`, fn);
    on('E', () => this.primary());
    on('SPACE', () => this.primary());
    on('ENTER', () => this.primary());
    on('ONE', () => this.ability('telekinesis'));
    on('TWO', () => this.ability('fire'));
    on('THREE', () => this.ability('seal'));
    on('Q', () => bus.emit(MSG.COMBAT_CYCLE));
    on('TAB', (e) => { e.preventDefault?.(); bus.emit(MSG.COMBAT_CYCLE); });
    on('B', () => !this.handlers.isModal?.() && bus.emit(MSG.OPEN_BAG));
    on('I', () => !this.handlers.isModal?.() && bus.emit(MSG.OPEN_BAG));
    on('ESC', () => this.handlers.onEscape?.());
    on('F', () => this.handlers.onDebug?.());
    kb.addCapture([K.SPACE, K.UP, K.DOWN, K.LEFT, K.RIGHT, K.TAB]);
  }

  primary() {
    if (this.handlers.isModal?.()) { this.handlers.onModalPrimary?.(); return; }
    this.bus.emit(MSG.CONTEXT_ACTION);
  }

  ability(id) {
    if (this.handlers.isModal?.()) return;
    this.bus.emit(MSG.ABILITY_USE, id);
  }

  update() {
    if (this.handlers.isModal?.()) {
      this.input.kb.x = this.input.kb.y = this.input.move.x = this.input.move.y = 0;
      return;
    }
    const k = this.keys;
    let x = 0, y = 0;
    if (k.left.isDown || k.left2.isDown) x -= 1;
    if (k.right.isDown || k.right2.isDown) x += 1;
    if (k.up.isDown || k.up2.isDown) y -= 1;
    if (k.down.isDown || k.down2.isDown) y += 1;
    const m = Math.hypot(x, y) || 1;
    this.input.kb.x = x / m; this.input.kb.y = y / m;
    const src = (x || y) ? this.input.kb : this.input.joy;
    this.input.move.x = src.x; this.input.move.y = src.y;
  }
}
