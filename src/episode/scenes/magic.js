// Короткие управляемые действия магии в мире: жар (удержание), телекинез (ведение пальцем), направленное пламя, ритуал.
// Сцена-оверлей поверх HUD: забирает касания, рисует шкалу и подсказку; мир меняется в ExplorationScene.
import Phaser from 'phaser';
import { COLORS, DEPTH } from '../../config/game.config.js';
import { UI } from '../../config/ui.config.js';
import { MSG } from '../../state/EventBus.js';
import { services } from '../../services.js';
import * as vitals from '../../state/vitals.js';
import { drawPlate, addButton } from '../../ui/widgets.js';
import { createHeat, stepHeat, nearTop, createRitual, stepRitual, createDrag, stepDrag, releaseDrag, dragInTarget, createStream, stepStream } from '../model/heat.js';
import { episode } from '../runtime.js';
import { spendWorldMana } from '../objects.js';

const FONT = UI.font;
const SH = { offsetX: 0, offsetY: 2, color: '#000', blur: 4, fill: true };
const START_COST = { heat: 4, ritual: 0, drag: 0, stream: 0 };

export class EpisodeMagicScene extends Phaser.Scene {
  constructor() { super('EpisodeMagicScene'); }

  create(data) {
    this.kind = data.kind;
    this.opts = data.opts;
    this.resolve = data.resolve;
    this.world = this.scene.get('ExplorationScene');
    this.cam = this.world.cameras.main;
    this.finger = null;
    this.ended = false;
    // сцена переиспользуется: ссылки на объекты прошлого действия уже уничтожены
    this.progressText = null; this.statusText = null; this.model = null; this.streamFx = null;
    this.W = this.scale.gameSize.width; this.H = this.scale.gameSize.height;
    services.modalOpen = true;
    services.bus.emit(MSG.MODAL_OPEN);
    // старые уведомления не должны лежать под карточкой действия
    const ui = this.scene.get('UIScene');
    ui?.toasts?.slice().forEach(t => ui.dropToast?.(t));
    this.world.player.stop();
    const o = this.opts.obj;
    this.world.player.castAt(o.x, o.baseY, this.kind === 'drag' ? 'telekinesis' : 'fire');

    const cost = START_COST[this.kind];
    if (cost && vitals.mana(services.state) < cost) { this.world.onManaShort?.(cost, o); this.finish('cancel', 0); return; }
    if (cost) spendWorldMana(cost);

    // касание в любом месте — действие; кнопка «Отмена» — выход
    this.catcher = this.add.zone(0, 0, this.W, this.H).setOrigin(0).setInteractive();
    this.catcher.on('pointerdown', (p) => this.down(p));
    this.input.on('pointermove', (p) => { if (p.isDown && this.finger) this.finger = { x: p.x, y: p.y }; });
    this.input.on('pointerup', () => this.up());
    this.input.on('gameout', () => this.up());

    this.buildCard();
    this.gfx = this.world.add.graphics().setDepth(DEPTH.fx + 2);   // в мире: цели, поток, луч
    this.bar = this.add.graphics();
    this.label = this.add.text(this.W / 2, 0, '', { fontFamily: FONT, fontSize: 26, color: '#f6e3a1', shadow: SH }).setOrigin(0.5);
    this.cancel = addButton(this, 120, this.H - 66, 200, 88, 'Отмена', { fontSize: 28, onPress: () => this.finish('cancel') });

    const level = this.opts.level ?? episode.control();
    if (this.kind === 'heat') this.model = createHeat(this.opts.task, level);
    if (this.kind === 'ritual') this.model = createRitual(this.opts.bands, 1.4, Math.max(1, level));
    if (this.kind === 'drag') this.model = createDrag({ x: o.x, y: o.baseY, target: this.opts.target, radius: this.opts.radius });
    if (this.kind === 'stream') this.model = createStream(this.opts.spots, { need: this.opts.need || 1.2 });
    this.flames = this.world.add.particles(o.x, o.baseY - 30, 'fx_dot', {
      x: { min: -26, max: 26 }, speedY: { min: -140, max: -50 }, speedX: { min: -16, max: 16 }, scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 },
      lifespan: 620, frequency: 40, quantity: 1, tint: [COLORS.fire, 0xffc46b, 0xff3b2f], blendMode: 'ADD', emitting: false,
    }).setDepth(DEPTH.fx + 1);
    if (this.kind === 'stream') {
      this.streamFx = this.world.add.particles(0, 0, 'fx_dot', {
        speed: { min: 20, max: 90 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: 380, frequency: 16, quantity: 2,
        tint: [COLORS.fire, 0xffc46b, 0xffe9b0], blendMode: 'ADD', emitting: false,
      }).setDepth(DEPTH.fx + 2);
    }
    this.events.once('shutdown', () => this.cleanup());
  }

  buildCard() {
    const w = Math.min(660, this.W - 40), x = this.W / 2, top = 150;
    const title = this.add.text(x, top + 20, this.opts.title || '', { fontFamily: FONT, fontSize: 32, fontStyle: 'bold', color: '#ffcf8a', shadow: SH }).setOrigin(0.5, 0);
    const hint = this.add.text(x, top + 62, this.opts.hint || '', { fontFamily: FONT, fontSize: 26, color: '#f1e3c2', align: 'center', wordWrap: { width: w - 40 }, shadow: SH, lineSpacing: 4 }).setOrigin(0.5, 0);
    const h = 62 + hint.height + 26;
    const plate = drawPlate(this.add.graphics(), w, h, { accent: COLORS.fire, alpha: 0.93, radius: 18 }).setPosition(x, top + h / 2);
    plate.setDepth(-1);
    this.cardBottom = top + h;
  }

  down(p) {
    if (this.ended) return;
    const c = this.cancel.hit.getBounds();
    if (c.contains(p.x, p.y)) return;
    if (this.kind === 'drag') {
      // подхватить можно только сам предмет (рядом с ним), а не «из воздуха»
      const s = this.toScreen(this.model.x, this.model.y - 40);
      if (Math.hypot(p.x - s.x, p.y - s.y) > 170) { this.flashText('Коснитесь ствола, чтобы подхватить'); return; }
    }
    this.finger = { x: p.x, y: p.y };
  }

  up() {
    if (!this.finger) return;
    this.finger = null;
    if (this.kind === 'drag' && !this.ended) {
      releaseDrag(this.model);
      if (this.model.result === 'done') this.finish('done');
      else if (this.model.lifted > 0.2) this.flashText(dragInTarget(this.model) ? '' : 'Не дотянули до круга — подхватите ещё раз');
    }
  }

  toScreen(wx, wy) { return { x: (wx - this.cam.worldView.x) * this.cam.zoom, y: (wy - this.cam.worldView.y) * this.cam.zoom }; }
  toWorld(p) { return this.cam.getWorldPoint(p.x, p.y); }

  flashText(t) {
    if (!t) return;
    this.label.setText(t).setAlpha(1);
    this.tweens.killTweensOf(this.label);
    this.tweens.add({ targets: this.label, alpha: 0, delay: 1600, duration: 400 });
  }

  update(time, delta) {
    if (this.ended) return;
    const dt = Math.min(delta, 50) / 1000;
    const o = this.opts.obj, holding = !!this.finger;
    this.gfx.clear();
    if (this.kind === 'heat' || this.kind === 'ritual') {
      const m = this.kind === 'heat' ? stepHeat(this.model, dt, holding) : stepRitual(this.model, dt, holding);
      const h = this.kind === 'heat' ? m : m.heat;
      o.setHeat?.(h.value);
      this.flames.setPosition(o.x, o.baseY - (o.cfg.flameY || 30));
      this.flames.emitting = h.value > 0.08;
      this.flames.frequency = Math.max(14, 90 - h.value * 80);
      if (this.kind === 'ritual') {
        this.drawRunes(m);
        if (m.flare) { m.flare = false; this.world.burst(o.x, o.baseY - 30, 0xff6a3d, 20); this.flashText('Пламя рвануло — руна ждёт, мягче'); }
        if (m.done) { this.finish('done'); return; }
      } else if (m.result) { this.finish(m.result); return; }
      this.drawGauge(h, this.kind === 'ritual' ? `Руна ${m.rune + 1} из ${m.bands.length}` : (o.cfg.purpose === 'herbs' ? 'Оттаивание' : 'Готово'));
    }
    if (this.kind === 'drag') {
      const fw = this.finger ? this.toWorld(this.finger) : null;
      const { spent } = stepDrag(this.model, dt, fw ? { x: fw.x, y: fw.y + 40 } : null, vitals.mana(services.state));
      if (spent) { const left = spendWorldMana(spent); if (left <= 0) { this.finger = null; releaseDrag(this.model); this.flashText('Мана иссякла — передохните и подхватите снова'); } }
      const m = this.model, lift = m.lifted * 30;
      if (m.lifted > 0) o.liftOff?.();
      o.sprite.setPosition(m.x, m.y - lift - (o.cfg.center ? 20 : 0));
      o.sprite.setDepth(DEPTH.mainBase + m.y + 200);
      const t = this.opts.target, ok = dragInTarget(m);
      this.gfx.lineStyle(4, ok ? 0x9fffc0 : COLORS.telekinesis, 0.85).strokeEllipse(t.x, t.y, this.opts.radius * 2, this.opts.radius * 0.9);
      this.gfx.fillStyle(ok ? 0x9fffc0 : COLORS.telekinesis, 0.12 + Math.sin(time / 260) * 0.05).fillEllipse(t.x, t.y, this.opts.radius * 2, this.opts.radius * 0.9);
      if (m.holding) {
        const p = this.world.player;
        this.gfx.lineStyle(6, COLORS.telekinesis, 0.35).lineBetween(p.x, p.y - 70, m.x, m.y - lift - 30);
        this.gfx.lineStyle(2, 0xe8ffff, 0.8).lineBetween(p.x, p.y - 70, m.x, m.y - lift - 30);
        this.world.player.face(m.x - p.x, m.y - p.y);
      }
      this.drawStatus(ok ? 'Отпустите — дерево ляжет у обочины' : m.holding ? 'Ведите к светлому кругу' : 'Прижмите палец к стволу');
    }
    if (this.kind === 'stream') {
      const p = this.world.player, from = { x: p.x, y: p.y - 70 };
      const fw = this.finger ? this.toWorld(this.finger) : null;
      const { spent, end } = stepStream(this.model, dt, from, fw, vitals.mana(services.state));
      if (spent) { const left = spendWorldMana(spent); if (left <= 0) { this.finger = null; this.flashText('Мана иссякла — переведите дух'); } }
      for (const s of this.model.spots) {
        const k = s.heat / this.model.need;
        this.gfx.lineStyle(4, s.done ? 0xffe9b0 : 0x9fe9ff, 0.9).strokeCircle(s.x, s.y, (s.r || 20) + 14);
        if (!s.done) this.gfx.fillStyle(0xff8a3d, 0.25 + k * 0.6).fillCircle(s.x, s.y, ((s.r || 20) + 10) * Math.max(0.15, k));
        else this.gfx.fillStyle(0xffe9b0, 0.5).fillCircle(s.x, s.y, (s.r || 20) + 8);
      }
      if (end) {
        this.gfx.lineStyle(18, COLORS.fire, 0.35).lineBetween(from.x, from.y, end.x, end.y);
        this.gfx.lineStyle(7, 0xffd08a, 0.9).lineBetween(from.x, from.y, end.x, end.y);
        this.streamFx.setPosition(end.x, end.y); this.streamFx.emitting = true;
        p.face(end.x - p.x, end.y - p.y);
      } else if (this.streamFx) this.streamFx.emitting = false;
      if (this.model.result) { this.finish('done'); return; }
      const done = this.model.spots.filter(s => s.done).length;
      this.drawStatus(this.model.spots.length > 1 ? `Трещины: ${done} из ${this.model.spots.length}` : `Лёд тает: ${Math.round(this.model.spots[0].heat / this.model.need * 100)}%`);
    }
  }

  drawRunes(m) {
    const o = this.opts.obj;
    for (let i = 0; i < m.bands.length; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / m.bands.length);
      const x = o.x + Math.cos(a) * 90, y = o.baseY - 20 + Math.sin(a) * 36;
      const lit = i < m.rune, cur = i === m.rune;
      const k = cur ? m.heat.progress / m.need : lit ? 1 : 0;
      this.gfx.fillStyle(lit ? 0xffd08a : 0x5a3a2a, lit ? 0.9 : 0.6).fillCircle(x, y, 16);
      if (cur) this.gfx.lineStyle(5, COLORS.fire, 0.95).beginPath().arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).strokePath();
    }
  }

  /** Горизонтальная шкала жара над нижней панелью: тёплая полоса, перегрев справа, прогресс под ней. */
  drawGauge(h, progressLabel) {
    const W = this.W, H = this.H, w = Math.min(600, W - 80), x0 = (W - w) / 2, y = H - 250, bh = 44;
    const g = this.bar.clear();
    g.fillStyle(0x140d09, 0.88).fillRoundedRect(x0 - 16, y - 50, w + 32, 156, 20);
    g.lineStyle(2.5, COLORS.fire, 0.8).strokeRoundedRect(x0 - 16, y - 50, w + 32, 156, 20);
    // холод → тепло → перегрев
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      const t = i / steps, c = t < 0.5 ? Phaser.Display.Color.Interpolate.ColorWithColor({ r: 90, g: 140, b: 190 }, { r: 230, g: 160, b: 70 }, 50, t * 100)
        : Phaser.Display.Color.Interpolate.ColorWithColor({ r: 230, g: 160, b: 70 }, { r: 210, g: 50, b: 30 }, 50, (t - 0.5) * 100);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 0.55).fillRect(x0 + t * w, y, w / steps + 1, bh);
    }
    const [lo, hi] = h.task.band;
    const warn = h.ctl.warn && nearTop(h);
    g.fillStyle(0xffe9b0, warn ? 0.55 : 0.32).fillRect(x0 + lo * w, y - 6, (hi - lo) * w, bh + 12);
    g.lineStyle(4, warn ? 0xff5a3a : 0xffe9b0, 1).strokeRect(x0 + lo * w, y - 6, (hi - lo) * w, bh + 12);
    const over = Math.min(1, h.task.over);
    g.fillStyle(0xff3b2f, 0.85).fillRect(x0 + w * over, y - 6, w * (1 - over), bh + 12);
    g.lineStyle(3, 0xff3b2f, 1).lineBetween(x0 + w * over, y - 10, x0 + w * over, y + bh + 10);
    const vx = x0 + Math.min(1, h.value) * w;
    g.fillStyle(0xffffff, 1).fillTriangle(vx - 14, y - 22, vx + 14, y - 22, vx, y - 4).fillRect(vx - 3, y - 4, 6, bh + 8);
    // прогресс
    const k = h.progress / h.task.need;
    g.fillStyle(0x2a1d16, 1).fillRoundedRect(x0, y + bh + 22, w, 18, 9);
    g.fillStyle(0xffc46b, 1).fillRoundedRect(x0, y + bh + 22, Math.max(18, w * k), 18, 9);
    this.label.setPosition(W / 2, y - 30).setText(this.finger ? (warn ? 'Отпускайте!' : 'Держите…') : 'Прижмите палец и держите').setAlpha(1);
    this.progressText ??= this.add.text(0, 0, '', { fontFamily: FONT, fontSize: 22, color: '#d8c7a5', shadow: SH }).setOrigin(0.5);
    this.progressText.setPosition(W / 2, y + bh + 62).setText(`${progressLabel}: ${Math.round(k * 100)}%`);
  }

  drawStatus(text) {
    const W = this.W, H = this.H, y = H - 220;
    this.bar.clear().fillStyle(0x140d09, 0.85).fillRoundedRect(W / 2 - 280, y - 32, 560, 64, 18).lineStyle(2.5, this.kind === 'drag' ? COLORS.telekinesis : COLORS.fire, 0.8).strokeRoundedRect(W / 2 - 280, y - 32, 560, 64, 18);
    this.statusText ??= this.add.text(W / 2, y, '', { fontFamily: FONT, fontSize: 26, color: '#f6e3a1', shadow: SH }).setOrigin(0.5);
    this.statusText.setText(text);
    this.label.setPosition(W / 2, y - 64);
  }

  finish(result, delay = result === 'cancel' ? 0 : 450) {
    if (this.ended) return;
    this.ended = true;
    this.finger = null;
    const o = this.opts.obj;
    if (this.kind === 'drag' && result !== 'done' && this.model) {
      // отпустили не там — дерево падает на месте и снова мешает; можно подхватить ещё раз
      o.dropAt?.(this.model.x, this.model.y);
    }
    if (result === 'done') this.label.setText('Получилось!').setAlpha(1).setPosition(this.W / 2, this.H - 300);
    if (result === 'over') this.label.setText(this.kind === 'heat' ? 'Перегрев!' : '').setAlpha(1);
    this.time.delayedCall(delay, () => {
      const resolve = this.resolve;
      this.scene.stop();
      resolve(result);
    });
  }

  cleanup() {
    this.gfx?.destroy(); this.flames?.destroy(); this.streamFx?.destroy();
    this.opts?.obj?.setHeat?.(0);
    if (this.opts?.obj?.cfg?.frozen && this.opts.obj.state0 !== 'done' && this.opts.obj.state0 !== 'charred') this.opts.obj.sprite.setTint(0xbfe2ff);
    services.modalOpen = false;
    services.bus.emit(MSG.MODAL_CLOSED);
  }
}
