// Settings — настройки игрока (звук, вибрация, подсказки). Хранятся отдельно от сохранения прогресса,
// поэтому «Новая игра» / «Сбросить прогресс» их не трогает. Не зависит от Phaser.

export const SETTINGS_KEY = 'witch_rpg_settings_v1';
export const VOLUME_STEPS = [0, 0.25, 0.5, 0.75, 1];

export function createDefaultSettings() {
  return { sfx: 0.75, music: 0.5, vibration: true, hints: true };
}

export class Settings {
  constructor(storage = null) {
    this.storage = storage;
    this.data = createDefaultSettings();
    this.listeners = new Set();
    this.load();
  }

  load() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(SETTINGS_KEY);
      if (raw) this.data = { ...createDefaultSettings(), ...JSON.parse(raw) };
    } catch (e) { /* битые настройки — используем значения по умолчанию */ }
  }

  save() {
    if (!this.storage) return;
    try { this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
  }

  get(key) { return this.data[key]; }

  set(key, value) {
    this.data[key] = value;
    this.save();
    this.listeners.forEach(fn => fn(key, value));
  }

  /** Шаг громкости вверх/вниз по VOLUME_STEPS. */
  stepVolume(key, dir) {
    const cur = this.data[key];
    let i = VOLUME_STEPS.findIndex(v => Math.abs(v - cur) < 0.01);
    if (i < 0) i = 2;
    i = Math.max(0, Math.min(VOLUME_STEPS.length - 1, i + dir));
    this.set(key, VOLUME_STEPS[i]);
    return VOLUME_STEPS[i];
  }

  toggle(key) { this.set(key, !this.data[key]); return this.data[key]; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
