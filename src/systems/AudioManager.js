// AudioManager — процедурный звук на Web Audio (без файлов). Все эффекты и две музыкальные петли
// синтезируются на лету. Когда появятся настоящие звуки, достаточно заменить рецепт
// в SFX на проигрывание буфера — вызовы audio.play('fire_hit') по коду останутся теми же.
//
// Браузеры (особенно iOS) разрешают звук только после жеста пользователя: unlock() вызывается
// на первом pointerdown/keydown (см. installUnlock) и при нажатии кнопок меню.

const PENTA = [0, 3, 5, 7, 10]; // минорная пентатоника
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.unlocked = false;
    this.musicMode = null;   // 'explore' | 'combat' | 'menu' | null
    this.wantedMusic = null;
    this.last = {};          // анти-спам: время последнего запуска каждого звука
    this.step = 0;
    this.nextNoteAt = 0;
    this.timer = null;
    this.lowHp = false;
    this.played = [];        // журнал для e2e/отладки (последние 50)
    settings?.onChange((key) => this.applyVolumes(key));
  }

  // ---------------------------------------------------------------- жизненный цикл
  installUnlock() {
    if (typeof window === 'undefined') return;
    const h = () => { this.unlock(); };
    window.addEventListener('pointerdown', h, { capture: true });
    window.addEventListener('touchend', h, { capture: true });
    window.addEventListener('keydown', h, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend?.();
      else if (this.unlocked) this.ctx.resume?.();
    });
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.build();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (!this.unlocked) {
        // iOS: короткий тихий буфер внутри жеста «разблокирует» вывод
        const b = this.ctx.createBuffer(1, 1, 22050);
        const s = this.ctx.createBufferSource();
        s.buffer = b; s.connect(this.ctx.destination); s.start(0);
        this.unlocked = true;
        if (this.wantedMusic) this.setMusic(this.wantedMusic);
      }
      return true;
    } catch (e) {
      console.warn('[audio] unlock failed', e);
      return false;
    }
  }

  build() {
    const c = this.ctx;
    this.master = c.createDynamicsCompressor();
    this.master.threshold.value = -14; this.master.ratio.value = 4;
    this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    // общий буфер белого шума (2 с)
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // простой «реверб» — задержка с обратной связью для музыки
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.38;
    const fb = c.createGain(); fb.gain.value = 0.35;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.delay.connect(lp); lp.connect(fb); fb.connect(this.delay); lp.connect(this.musicBus);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.settings ? this.settings.get('sfx') : 0.75, t, 0.02);
    this.musicBus.gain.setTargetAtTime((this.settings ? this.settings.get('music') : 0.5) * 0.55, t, 0.1);
  }

  get ready() { return !!(this.ctx && this.unlocked && this.ctx.state !== 'closed'); }

  // ---------------------------------------------------------------- примитивы
  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }

  tone({ f = 440, to = null, dur = 0.15, type = 'sine', vol = 0.3, a = 0.005, at = 0, out = null, detune = 0 }) {
    const c = this.ctx; const t = c.currentTime + at;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + a + dur);
    this.env(g, t, a, vol, dur);
    o.connect(g); g.connect(out || this.sfxBus);
    o.start(t); o.stop(t + a + dur + 0.05);
    return g;
  }

  noise({ dur = 0.2, vol = 0.3, type = 'bandpass', f = 1000, to = null, q = 1, a = 0.005, at = 0, out = null }) {
    const c = this.ctx; const t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + a + dur);
    const g = c.createGain(); this.env(g, t, a, vol, dur);
    s.connect(fl); fl.connect(g); g.connect(out || this.sfxBus);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
  }

  // ---------------------------------------------------------------- SFX
  /** Играет звук по имени. opts.minGap — минимальный интервал повтора (мс). */
  play(name, opts = {}) {
    this.played.push(name); if (this.played.length > 50) this.played.shift();
    if (!this.ready || !(this.settings?.get('sfx') ?? 1)) return;
    const now = performance.now();
    const gap = opts.minGap ?? 40;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    const fn = SFX[name];
    if (!fn) { console.warn('[audio] unknown sfx', name); return; }
    try { fn(this, opts); } catch (e) { console.warn('[audio] sfx failed', name, e); }
  }

  vibrate(pattern) {
    if (!this.settings?.get('vibration')) return;
    try { navigator.vibrate?.(pattern); } catch (e) { /* not supported */ }
  }

  // ---------------------------------------------------------------- музыка
  /** mode: 'explore' | 'combat' | 'menu' | null */
  setMusic(mode) {
    this.wantedMusic = mode;
    if (!this.ready) return;
    if (mode === this.musicMode) return;
    this.stopMusic();
    this.musicMode = mode;
    if (!mode) return;
    const c = this.ctx;
    this.musicOut = c.createGain();
    this.musicOut.gain.setValueAtTime(0.0001, c.currentTime);
    this.musicOut.gain.exponentialRampToValueAtTime(1, c.currentTime + 1.5);
    this.musicOut.connect(this.musicBus);
    this.musicOut.connect(this.delay);
    this.startWind(mode === 'combat' ? 0.025 : 0.06);
    this.step = 0;
    this.nextNoteAt = c.currentTime + 0.3;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const c = this.ctx;
    if (this.musicOut && c) {
      const out = this.musicOut;
      out.gain.cancelScheduledValues(c.currentTime);
      out.gain.setTargetAtTime(0.0001, c.currentTime, 0.25);
      setTimeout(() => out.disconnect(), 1500);
    }
    if (this.wind) { try { this.wind.stop(c.currentTime + 1.2); } catch (e) { /* already stopped */ } this.wind = null; }
    this.musicOut = null;
    this.musicMode = null;
  }

  startWind(vol) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.7;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 300;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.musicOut);
    s.start(); lfo.start();
    s.onended = () => { try { lfo.stop(); } catch (e) { /* ok */ } };
    this.wind = s;
  }

  schedule() {
    if (!this.ready || !this.musicOut) return;
    const c = this.ctx;
    while (this.nextNoteAt < c.currentTime + 0.4) {
      const at = Math.max(0, this.nextNoteAt - c.currentTime);
      if (this.musicMode === 'combat') this.combatStep(at); else this.ambientStep(at);
      this.step++;
    }
  }

  // спокойная лесная петля: долгий пэд + редкие ноты пентатоники
  ambientStep(at) {
    const beat = 0.75;
    const s = this.step;
    const root = [57, 53, 55, 52][Math.floor(s / 16) % 4]; // A, F, G, E
    if (s % 16 === 0) {
      for (const iv of [0, 7, 12]) this.tone({ f: midi(root - 12 + iv), dur: beat * 15, a: 1.8, vol: 0.05, type: 'triangle', at, out: this.musicOut, detune: (Math.random() - 0.5) * 8 });
    }
    if (Math.random() < (s % 4 === 0 ? 0.6 : 0.22)) {
      const n = root + 12 + PENTA[Math.floor(Math.random() * PENTA.length)] + (Math.random() < 0.3 ? 12 : 0);
      this.tone({ f: midi(n), dur: 1.6, a: 0.01, vol: 0.06, type: 'sine', at, out: this.musicOut });
      this.tone({ f: midi(n) * 2, dur: 0.6, a: 0.01, vol: 0.015, type: 'sine', at, out: this.musicOut });
    }
    this.nextNoteAt += beat;
  }

  // боевая пульсация: барабан + остинато баса
  combatStep(at) {
    const sixteenth = 60 / 112 / 2;
    const s = this.step % 16;
    const bar = Math.floor(this.step / 16);
    const root = [45, 45, 41, 43][bar % 4];
    if (s % 4 === 0) this.tone({ f: 120, to: 40, dur: 0.22, vol: 0.32, type: 'sine', at, out: this.musicOut });
    if (s === 4 || s === 12) this.noise({ dur: 0.12, vol: 0.08, f: 1800, q: 0.8, at, out: this.musicOut });
    if (s % 2 === 0) this.noise({ dur: 0.03, vol: 0.025, type: 'highpass', f: 6000, at, out: this.musicOut });
    const pat = [0, null, 0, 12, null, 0, 7, null, 0, null, 0, 10, null, 7, 3, null];
    if (pat[s] !== null) this.tone({ f: midi(root + pat[s]), dur: 0.16, vol: 0.07, type: 'sawtooth', at, out: this.musicOut });
    if (this.lowHp && s % 8 === 0) {
      // сердцебиение при низком HP
      this.tone({ f: 70, to: 45, dur: 0.12, vol: 0.4, at, out: this.sfxBus });
      this.tone({ f: 65, to: 42, dur: 0.14, vol: 0.32, at: at + 0.22, out: this.sfxBus });
    }
    this.nextNoteAt += sixteenth;
  }
}

// ------------------------------------------------------------------ рецепты эффектов
const SFX = {
  ui_click: a => { a.tone({ f: 900, to: 600, dur: 0.05, vol: 0.12, type: 'triangle' }); },
  ui_back: a => { a.tone({ f: 600, to: 380, dur: 0.07, vol: 0.12, type: 'triangle' }); },
  modal_open: a => { a.tone({ f: 523, dur: 0.18, vol: 0.08, type: 'sine' }); a.tone({ f: 784, dur: 0.22, vol: 0.06, at: 0.05 }); },
  footstep: a => { a.noise({ dur: 0.05, vol: 0.05, type: 'lowpass', f: 500 + Math.random() * 300 }); },
  pickup: a => { a.tone({ f: 880, dur: 0.08, vol: 0.12, type: 'square' }); a.tone({ f: 1320, dur: 0.12, vol: 0.1, type: 'square', at: 0.06 }); },
  coin: a => { a.tone({ f: 1568, dur: 0.06, vol: 0.09, type: 'square' }); a.tone({ f: 2093, dur: 0.18, vol: 0.08, type: 'square', at: 0.05 }); },
  chest: a => {
    a.noise({ dur: 0.18, vol: 0.2, type: 'lowpass', f: 700 });
    [523, 659, 784, 1047].forEach((f, i) => a.tone({ f, dur: 0.2, vol: 0.1, type: 'triangle', at: 0.12 + i * 0.07 }));
  },
  telekinesis_cast: a => {
    a.tone({ f: 300, to: 900, dur: 0.35, vol: 0.12, type: 'sine', a: 0.04 });
    a.tone({ f: 450, to: 1350, dur: 0.35, vol: 0.06, type: 'triangle', a: 0.04, detune: 12 });
    a.noise({ dur: 0.35, vol: 0.06, f: 1500, to: 4000, q: 4, a: 0.05 });
  },
  telekinesis_impact: (a, o) => {
    const heavy = o.heavy;
    a.tone({ f: heavy ? 110 : 180, to: 40, dur: heavy ? 0.4 : 0.22, vol: heavy ? 0.5 : 0.35 });
    a.noise({ dur: heavy ? 0.35 : 0.18, vol: heavy ? 0.35 : 0.22, type: 'lowpass', f: heavy ? 600 : 1200 });
  },
  fire_cast: a => {
    a.noise({ dur: 0.45, vol: 0.25, f: 400, to: 2500, q: 0.8, a: 0.03 });
    a.tone({ f: 160, to: 320, dur: 0.3, vol: 0.08, type: 'sawtooth' });
  },
  fire_hit: a => {
    a.noise({ dur: 0.35, vol: 0.32, type: 'lowpass', f: 3000, to: 300 });
    a.tone({ f: 140, to: 60, dur: 0.25, vol: 0.25 });
  },
  burn_tick: a => { a.noise({ dur: 0.08, vol: 0.06, f: 2200, q: 2 }); },
  roots_burn: a => {
    a.noise({ dur: 1.0, vol: 0.25, f: 900, to: 300, q: 0.6, a: 0.05 });
    for (let i = 0; i < 5; i++) a.noise({ dur: 0.04, vol: 0.18, type: 'highpass', f: 3000, at: 0.1 + Math.random() * 0.8 });
  },
  auto_hit: a => { a.noise({ dur: 0.06, vol: 0.12, f: 2500, q: 1.5 }); a.tone({ f: 660, to: 330, dur: 0.06, vol: 0.06, type: 'triangle' }); },
  enemy_hit: a => { a.tone({ f: 220, to: 90, dur: 0.12, vol: 0.25, type: 'square' }); a.noise({ dur: 0.1, vol: 0.2, type: 'lowpass', f: 1500 }); },
  hero_hurt: a => {
    a.tone({ f: 300, to: 120, dur: 0.18, vol: 0.25, type: 'sawtooth' });
    a.noise({ dur: 0.15, vol: 0.25, type: 'lowpass', f: 900 });
  },
  strong_hurt: a => {
    a.tone({ f: 90, to: 30, dur: 0.6, vol: 0.6 });
    a.tone({ f: 200, to: 60, dur: 0.4, vol: 0.25, type: 'sawtooth' });
    a.noise({ dur: 0.5, vol: 0.4, type: 'lowpass', f: 1200, to: 200 });
  },
  warning: a => {
    for (let i = 0; i < 3; i++) a.tone({ f: 740, dur: 0.09, vol: 0.14, type: 'square', at: i * 0.16 });
    a.tone({ f: 70, dur: 0.6, vol: 0.2, type: 'sawtooth', a: 0.1 });
  },
  interrupt: a => {
    a.noise({ dur: 0.08, vol: 0.4, type: 'highpass', f: 2000 });
    a.tone({ f: 1200, to: 300, dur: 0.3, vol: 0.2, type: 'square' });
    a.tone({ f: 1800, dur: 0.5, vol: 0.08, type: 'sine', at: 0.05 });
  },
  fail: a => { a.tone({ f: 200, dur: 0.12, vol: 0.15, type: 'square' }); a.tone({ f: 150, dur: 0.2, vol: 0.15, type: 'square', at: 0.12 }); },
  armor_break: a => {
    for (let i = 0; i < 6; i++) a.tone({ f: 1500 + Math.random() * 2500, dur: 0.25, vol: 0.07, type: 'triangle', at: i * 0.03 });
    a.noise({ dur: 0.4, vol: 0.3, type: 'highpass', f: 2500 });
  },
  victory: a => {
    [523, 659, 784].forEach((f, i) => a.tone({ f, dur: 0.18, vol: 0.14, type: 'triangle', at: i * 0.12 }));
    [1047, 1319, 1568].forEach(f => a.tone({ f, dur: 1.0, vol: 0.07, type: 'triangle', at: 0.38 }));
  },
  defeat: a => { [392, 349, 311, 262].forEach((f, i) => a.tone({ f, dur: 0.35, vol: 0.13, type: 'triangle', at: i * 0.22 })); },
  unlock_magic: a => {
    a.noise({ dur: 1.2, vol: 0.08, f: 3000, to: 8000, q: 3, a: 0.3 });
    [0, 4, 7, 11, 14].forEach((s, i) => a.tone({ f: midi(69 + s), dur: 1.2, vol: 0.08, type: 'sine', at: i * 0.09 }));
  },
  level_up: a => { [0, 4, 7, 12, 16].forEach((s, i) => a.tone({ f: midi(72 + s), dur: 0.3, vol: 0.11, type: 'square', at: i * 0.07 })); },
  quest_update: a => { a.tone({ f: 784, dur: 0.12, vol: 0.08, type: 'triangle' }); a.tone({ f: 1175, dur: 0.3, vol: 0.08, type: 'triangle', at: 0.1 }); },
  zone: a => { a.tone({ f: 330, dur: 1.2, vol: 0.06, a: 0.2 }); a.tone({ f: 495, dur: 1.2, vol: 0.05, a: 0.3, at: 0.15 }); },
  locked: a => { a.tone({ f: 160, dur: 0.08, vol: 0.18, type: 'square' }); a.noise({ dur: 0.08, vol: 0.12, type: 'lowpass', f: 600 }); },
  combat_start: a => { a.tone({ f: 110, to: 55, dur: 0.8, vol: 0.4, type: 'sawtooth' }); a.noise({ dur: 0.7, vol: 0.2, f: 300, to: 3000, a: 0.2 }); },
  heartbeat: a => { a.tone({ f: 70, to: 45, dur: 0.12, vol: 0.4 }); a.tone({ f: 65, to: 42, dur: 0.14, vol: 0.32, at: 0.22 }); },
  // v0.8: сбор, разговоры, варка
  gather: a => { a.noise({ dur: 0.32, vol: 0.14, type: 'bandpass', f: 1800, to: 900, q: 1.2, a: 0.03 }); a.noise({ dur: 0.2, vol: 0.08, type: 'highpass', f: 3500, at: 0.12 }); },
  gather_done: a => { [784, 988, 1319].forEach((f, i) => a.tone({ f, dur: 0.22, vol: 0.09, type: 'triangle', at: i * 0.07 })); a.tone({ f: 2093, dur: 0.35, vol: 0.04, at: 0.2 }); },
  talk_open: a => { a.tone({ f: 440, dur: 0.14, vol: 0.06, type: 'sine' }); a.tone({ f: 660, dur: 0.2, vol: 0.05, at: 0.07 }); },
  talk_blip: a => { a.tone({ f: 520 + Math.random() * 140, dur: 0.035, vol: 0.035, type: 'triangle' }); },
  hero_say: a => { a.tone({ f: 740, to: 820, dur: 0.09, vol: 0.05, type: 'sine' }); },
  journal: a => { a.noise({ dur: 0.14, vol: 0.09, type: 'bandpass', f: 2600, to: 1200, q: 0.8 }); a.tone({ f: 587, dur: 0.14, vol: 0.05, at: 0.05, type: 'triangle' }); },
  brew: a => {
    for (let i = 0; i < 6; i++) a.tone({ f: 300 + Math.random() * 300, to: 700 + Math.random() * 400, dur: 0.07, vol: 0.07, type: 'sine', at: i * 0.07 });
    a.noise({ dur: 0.5, vol: 0.07, type: 'lowpass', f: 700, to: 1500 });
    [523, 659, 784, 1047].forEach((f, i) => a.tone({ f, dur: 0.28, vol: 0.08, type: 'triangle', at: 0.4 + i * 0.08 }));
  },
  potion: a => { a.tone({ f: 260, to: 520, dur: 0.18, vol: 0.12, type: 'sine' }); a.tone({ f: 523, to: 784, dur: 0.22, vol: 0.09, type: 'triangle', at: 0.12 }); a.noise({ dur: 0.18, vol: 0.06, f: 1800, q: 2 }); },
  purr: a => { for (let i = 0; i < 6; i++) a.tone({ f: 70 + (i % 2) * 8, dur: 0.1, vol: 0.06, type: 'sawtooth', at: i * 0.11 }); },
  hint: a => { a.tone({ f: 1047, dur: 0.15, vol: 0.06 }); a.tone({ f: 1568, dur: 0.25, vol: 0.05, at: 0.08 }); },
};

export const SFX_NAMES = Object.keys(SFX);
