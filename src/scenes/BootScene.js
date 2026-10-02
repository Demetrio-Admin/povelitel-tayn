import Phaser from 'phaser';
import { initServices, bootCloud } from '../services.js';

// BootScene — инициализация состояния/сервисов и переход к загрузке.
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    initServices();
    const next = () => this.scene.start('PreloadScene');
    bootCloud().then(next, next); // вход восстанавливается параллельно, ждём не дольше нескольких секунд
  }
}
