import Phaser from 'phaser';
import { initServices } from '../services.js';

// BootScene — инициализация состояния/сервисов и переход к загрузке.
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    initServices();
    this.scene.start('PreloadScene');
  }
}
