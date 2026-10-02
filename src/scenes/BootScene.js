import Phaser from 'phaser';
import { initServices, bootSession } from '../services.js';

// BootScene — сервисы и (в онлайн-режиме) загрузка игрока с сервера, затем загрузка ассетов.
// Игра не начинается, пока не известно, кто играет и какое у него состояние на сервере.
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    initServices();
    bootSession().then(() => this.scene.start('PreloadScene'));
  }
}
