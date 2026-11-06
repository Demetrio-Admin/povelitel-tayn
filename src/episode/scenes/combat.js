// Episode: choose learned moves, then watch an automatic battle in a separate scene.
import Phaser from 'phaser';
import { ASSET_FILES } from '../../config/assets.manifest.js';
import { COLORS } from '../../config/game.config.js';
import { UI } from '../../config/ui.config.js';
import { services } from '../../services.js';
import { currentHero } from '../../state/hero.js';
import { applyDisplaySize } from '../../objects/InteractiveObject.js';
import { applyMonsterArt, addMonsterShadow, monsterCombatScale } from '../../world/monsterArt.js';
import { HeroAnimator } from '../../systems/HeroAnimator.js';
import { addButton, drawPlate } from '../../ui/widgets.js';
import { EpisodeBattle, MOVES, FOCUS, LOADOUT_SIZE, WOLF } from '../model/combat.js';
import { autoCombatPolicy, battleDiagnosis } from '../model/autoCombatPolicy.js';
import { battleOptions, defaultLoadout, ENCOUNTERS } from '../model/progression.js';
import { learnedMoves, powerDefinition } from '../../config/magic.powers.js';
import { panel, node, button } from '../panels.js';
import { episode } from '../runtime.js';

const FONT = UI.font;
const SH = { offsetX: 0, offsetY: 2, color: '#000', blur: 4, fill: true };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const SCHOOL_COLOR = { telekinesis: COLORS.telekinesis, fire: COLORS.fire, seal: 0xbb99ff, curse: 0xbb7fe0, barrier: 0x8fdfc9 };
const COUNTERS = {
  bite: 'сбивает Толчок или Удержание',
  leap: 'сбивает Толчок или Удержание · смягчит Тёплый щит',
  breath: 'растапливает Пламя · держит Удержание',
  howl: 'сбивает Толчок или Удержание',
};

export class EpisodeCombatScene extends Phaser.Scene {
  constructor() { super('EpisodeCombatScene'); }

  create(data) {
    this.onEnd = data.onEnd;
    this.enemyId = data.enemyId || 'frost_wolf';
    this.options = battleOptions(services.state.data, episode.ep, this.enemyId);
    this.def = this.options.enemy; this.speed = 1; this.accumulator = 0;
    this.events.once('shutdown', () => { this.domPanel?.root.remove(); this.liveControls?.remove(); });
    this.W = this.scale.gameSize.width; this.H = this.scale.gameSize.height;
    this.ended = false;
    // повторный бой (после отступления) — сцена та же, прошлый бой и его объекты уже уничтожены
    this.battle = null; this.buttons = null; window.__episodeBattle = null;
    this.buildArena();
    this.buildActors();
    this.loadoutView();
  }

  buildArena() {
    const { W, H } = this;
    if (this.textures.exists('arena_frostwood')) {
      const img = this.add.image(W / 2, H / 2, 'arena_frostwood');
      const k = Math.max(W / img.width, H / img.height);
      img.setScale(k);
    } else this.add.rectangle(0, 0, W, H, 0x1d2a33).setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0a1218, 0.25).setOrigin(0);
  }

  buildActors() {
    const { W, H } = this;
    this.enemyPos = { x: W / 2, y: Math.round(H * 0.45) };
    this.heroPos = { x: W / 2, y: Math.round(H * 0.74) };
    const s = this.add.image(this.enemyPos.x, this.enemyPos.y, this.def.texture).setOrigin(0.5, 1);
    applyDisplaySize(s, this.def.texture);
    const readable = applyMonsterArt(s, this.def.texture);
    const mul = readable ? monsterCombatScale(s.monsterArt.visibleHeight, 1.9) : 1.9;
    s.setScale(s.scaleX * mul, s.scaleY * mul).setDepth(this.enemyPos.y);
    if (readable) { const sh = addMonsterShadow(this, s, this.enemyPos.y - 1); sh.setScale(sh.scaleX * mul, sh.scaleY * mul); }
    this.enemy = s; this.enemyBase = { sx: s.scaleX, sy: s.scaleY };
    this.enemyIdle = this.tweens.add({ targets: s, scaleY: s.scaleY * 1.04, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.prepGlow = this.add.image(this.enemyPos.x, this.enemyPos.y - s.displayHeight / 2, 'fx_glow').setTint(COLORS.danger).setBlendMode('ADD').setScale(3).setAlpha(0).setDepth(this.enemyPos.y + 1);
    this.holdRing = this.add.image(this.enemyPos.x, this.enemyPos.y - s.displayHeight / 2, 'fx_ring').setTint(COLORS.telekinesis).setBlendMode('ADD').setScale(2.6, 3).setAlpha(0).setDepth(this.enemyPos.y + 2);
    this.patchFx = this.add.particles(this.enemyPos.x, this.enemyPos.y - 6, 'fx_dot', {
      x: { min: -120, max: 120 }, speedY: { min: -150, max: -50 }, scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 },
      lifespan: 700, frequency: 18, tint: [COLORS.fire, 0xffc46b, 0xff3b2f], blendMode: 'ADD', emitting: false,
    }).setDepth(this.enemyPos.y - 2);
    this.breathFx = this.add.particles(this.enemyPos.x, this.enemyPos.y - 60, 'fx_dot', {
      angle: { min: 80, max: 100 }, speed: { min: 260, max: 420 }, scale: { start: 0.9, end: 1.8 }, alpha: { start: 0.8, end: 0 },
      lifespan: 900, frequency: 14, tint: [0xd8f4ff, 0x9fe6ff], emitting: false,
    }).setDepth(this.heroPos.y + 5);

    if (this.options.familiar && this.textures.exists('cat_01')) {
      const cat = this.add.image(this.heroPos.x + 120, this.heroPos.y - 8, 'cat_01').setOrigin(.5, 1).setDepth(this.heroPos.y + 1);
      cat.setScale(72 / cat.height);
      this.add.text(this.heroPos.x + 120, this.heroPos.y + 18, 'Морвен', { fontFamily: FONT, fontSize: 22, color: '#ddcaff', shadow: SH }).setOrigin(.5).setDepth(3000);
    }
    const hero = currentHero();
    this.heroShadow = this.add.image(this.heroPos.x, this.heroPos.y - 2, 'hero_shadow').setDepth(this.heroPos.y - 1);
    this.hero = this.add.image(this.heroPos.x, this.heroPos.y, hero.textures.up).setOrigin(0.5, 1).setDepth(this.heroPos.y);
    this.heroBase = 170 / this.hero.height;
    this.hero.setScale(this.heroBase);
    this.anim = new HeroAnimator();
    this.wardRing = this.add.image(this.heroPos.x, this.heroPos.y - 80, 'fx_ring').setTint(COLORS.fire).setBlendMode('ADD').setScale(2, 2.4).setAlpha(0).setDepth(this.heroPos.y + 3);
  }

  // ------------------------------------------------------------------ выбор приёмов
  loadoutView() {
    const learned = learnedMoves(services.state.data);
    const saved = episode.ep.loadout || defaultLoadout(services.state.data);
    this.pick = new Set([...saved, ...defaultLoadout(services.state.data)].filter(id => learned.includes(id)).filter((id, i, a) => a.indexOf(id) === i).slice(0, LOADOUT_SIZE));
    this.domPanel = panel(this.def.name, { onClose: () => this.leave('cancel') });
    const { content, footer } = this.domPanel;
    content.append(node('p', this.enemyId === 'frost_wolf' ? 'Сложная встреча. Усильте магию или соедините силы, прежде чем бросать вызов метели.' : this.enemyId === 'forest_spirit' ? 'Броня и медленное восстановление. Астрал пробивает защиту; Порча II останавливает лечение.' : 'Короткая встреча: опыт даров, травы и монеты.'));
    content.append(node('p', 'До 4 приёмов. Ведьма сама применит выбранные чары и восстановит ману.', 'ep-note'));
    const grid = node('div', null, 'ep-moves');
    this.cards = learned.map(id => {
      const m = MOVES[id], def = powerDefinition(m.powerId, { experimental: true });
      const card = button('', () => this.togglePick(id), 'ep-move');
      const img = node('img'); img.src = new URL(ASSET_FILES[m.icon], document.baseURI).href; img.alt = '';
      const text = node('span'); text.append(node('strong', m.name), node('small', `${def.name} · ${def.school}`), node('small', `${m.cost} маны · ${m.cd} с`), node('small', m.desc, 'ep-desc'));
      card.append(img, text); grid.append(card); return { id, card };
    });
    content.append(grid);
    const row = node('div', null, 'ep-row');
    this.potionButton = button('', () => { episode.ep.usePotion = !episode.ep.usePotion; episode.save(); this.drawCards(); }); row.append(this.potionButton);
    if (episode.ep.morven) row.append(node('p', 'Морвен усиливает проклятую цель', 'ep-note'));
    content.append(row);
    this.pickHint = node('div', '', 'ep-counter'); this.pickHint.setAttribute('role', 'status'); footer.append(this.pickHint);
    this.goBtn = button('В бой', () => this.startFight(), 'ep-primary'); footer.append(this.goBtn);
    this.drawCards();
  }
  togglePick(id) {
    if (this.pick.has(id)) this.pick.delete(id);
    else if (this.pick.size < LOADOUT_SIZE) this.pick.add(id);
    else { this.pickHint.textContent = 'Снимите один приём, чтобы выбрать другой.'; return; }
    services.audio.play('ui_click'); this.drawCards();
  }
  drawCards() {
    for (const { id, card } of this.cards) card.setAttribute('aria-pressed', String(this.pick.has(id)));
    this.pickHint.textContent = `Выбрано ${this.pick.size} / ${LOADOUT_SIZE}`;
    this.goBtn.disabled = this.pick.size === 0;
    this.potionButton.textContent = `Настой +40 HP: ${episode.ep.usePotion ? 'взять' : 'не брать'} (${services.state.item('potion_life_small')})`;
    this.potionButton.disabled = !services.state.item('potion_life_small');
  }

  // ------------------------------------------------------------------ бой
  startFight() {
    if (!this.pick.size) return;
    const loadout = Object.keys(MOVES).filter(id => this.pick.has(id));
    episode.ep.loadout = loadout;
    episode.save();
    this.domPanel.root.remove();
    this.options = battleOptions(services.state.data, episode.ep, this.enemyId);
    this.battle = new EpisodeBattle({ ...this.options, loadout, seed: (Date.now() & 0xffff) || 7 });
    window.__episodeBattle = this.battle;
    this.buildFightUi(loadout);
    this.banner('Автобой', 0xcfefff);
    this.liveControls = node('div', null, 'ep-live');
    if ((episode.ep.encounters?.[this.enemyId] || 0) > 0 || episode.ep.defeats > 0) this.liveControls.append(button('Скорость ×1', () => {}));
    const speedBtn = this.liveControls.firstChild; if (speedBtn) speedBtn.onclick = () => { this.speed = this.speed === 1 ? 2 : 1; speedBtn.textContent = `Скорость ×${this.speed}`; };
    this.liveControls.append(button('Отступить', () => this.finish('defeat')));
    document.getElementById('game').append(this.liveControls);
  }

  buildFightUi(loadout) {
    const { W, H } = this;
    // враг: имя, здоровье, намерение
    const top = 150;
    this.add.text(W / 2, top, this.def.name, { fontFamily: FONT, fontSize: 30, fontStyle: 'bold', color: '#cfefff', shadow: SH }).setOrigin(0.5).setDepth(3000);
    this.ehp = this.add.graphics().setDepth(3000);
    this.intentPlate = drawPlate(this.add.graphics(), W - 80, 104, { accent: COLORS.danger, alpha: 0.85, radius: 16 }).setPosition(W / 2, top + 108).setDepth(3000);
    this.intentText = this.add.text(W / 2, top + 84, '', { fontFamily: FONT, fontSize: 30, fontStyle: 'bold', color: '#ffb3a6', shadow: SH }).setOrigin(0.5).setDepth(3001);
    this.intentHint = this.add.text(W / 2, top + 120, '', { fontFamily: FONT, fontSize: 21, color: '#e8dcc4', shadow: SH }).setOrigin(0.5).setDepth(3001);
    this.intentBar = this.add.graphics().setDepth(3001);
    // герой: здоровье и мана
    this.hbars = this.add.graphics().setDepth(3000);
    this.hText = this.add.text(40, H - 372, '', { fontFamily: FONT, fontSize: 22, color: '#fff', shadow: SH }).setDepth(3001);
    this.mText = this.add.text(40, H - 336, '', { fontFamily: FONT, fontSize: 22, color: '#fff', shadow: SH }).setDepth(3001);
    // приёмы
    const bw = (W - 50) / 4, by = H - 150;
    this.buttons = loadout.map((id, i) => {
      const m = MOVES[id], x = 10 + i * (bw + 10) + bw / 2;
      const g = this.add.graphics().setDepth(3000);
      const icon = this.add.image(x, by - 30, m.icon).setDisplaySize(70, 70).setDepth(3001);
      const name = this.add.text(x, by + 30, m.name, { fontFamily: FONT, fontSize: 24, fontStyle: 'bold', color: '#fbefd2', align: 'center', wordWrap: { width: bw - 10 }, shadow: SH }).setOrigin(0.5).setDepth(3001);
      const cost = this.add.text(x, by + 62, `${m.cost}`, { fontFamily: FONT, fontSize: 21, color: '#9fc8ff', shadow: SH }).setOrigin(0.5).setDepth(3001);
      const cd = this.add.graphics().setDepth(3002);
      const hit = this.add.zone(x, by, bw, 170).setDepth(3003);
      return { id, x, y: by, w: bw, h: 170, g, icon, name, cost, cd, hit };
    });
    // «Собраться»
    const fx = W - 130, fy = H - 330;
    this.focusG = this.add.graphics().setDepth(3000);
    this.focusText = this.add.text(fx, fy, FOCUS.name, { fontFamily: FONT, fontSize: 26, fontStyle: 'bold', color: '#cfe6ff', shadow: SH }).setOrigin(0.5).setDepth(3001);
    this.focusZone = this.add.zone(fx, fy, 220, 92).setDepth(3003);
    this.focusPos = { x: fx, y: fy };
    this.comboText = this.add.text(W / 2, Math.round(H * 0.56), '', { fontFamily: FONT, fontSize: 44, fontStyle: 'bold', color: '#ffd08a', stroke: '#2a1408', strokeThickness: 8 }).setOrigin(0.5).setDepth(4000).setAlpha(0);
  }

  update(time, delta) {
    this.updateHero(delta);
    if (!this.battle || this.ended) return;
    this.accumulator += Math.min(delta, 250) / 1000 * this.speed;
    while (this.accumulator >= .05 && !this.battle.result) {
      this.accumulator -= .05;
      const id = autoCombatPolicy(this.battle); if (id) this.battle.command(id);
      this.battle.tick(.05);
      if (this.battle.time >= 150 && !this.battle.result) { this.battle.result = 'defeat'; this.battle.emit({ type: 'result', result: 'defeat' }); }
    }
    this.processEvents();
    this.drawUi(time);
  }

  updateHero(delta) {
    const pose = this.anim.update(Math.min(delta, 50) / 1000, { speed: 0, dir: 0, face: 'up' });
    const Hh = 170, b = this.heroBase, s = this.hero;
    s.setPosition(this.heroPos.x + pose.dx * Hh, this.heroPos.y + pose.dy * Hh);
    s.setScale(b * pose.sx, b * pose.sy).setAngle(pose.rot).setAlpha(pose.alpha);
    if (pose.flash) s.setTintFill(COLORS.danger); else s.clearTint();
    this.heroShadow.setScale(pose.shadowScale).setAlpha(pose.shadowAlpha);
  }

  processEvents() {
    const b = this.battle;
    for (const e of b.drainEvents()) {
      if (e.type === 'cast') { this.anim.playCast(MOVES[e.move].school); this.castFx(e.move); }
      if (e.type === 'queued') this.floatText(this.heroPos.x, this.heroPos.y - 210, `Следом: ${MOVES[e.move].name}`, 0xffe9b0);
      if (e.type === 'hit' && e.target === 'enemy') {
        this.floatText(this.enemyPos.x + Phaser.Math.Between(-60, 60), this.enemyPos.y - 220, `−${e.dmg}`, e.source === 'flame' || e.combo === 'firePush' ? 0xffb070 : 0xcfefff, e.combo ? 46 : 36);
        this.tweens.add({ targets: this.enemy, x: this.enemyPos.x + 14, duration: 50, yoyo: true, repeat: 2 });
        this.enemy.setTintFill(0xffffff); this.time.delayedCall(80, () => this.enemy.clearTint());
      }
      if (e.type === 'hit' && e.target === 'hero') {
        this.anim.playHurt(e.dmg >= 12);
        this.cameras.main.shake(e.dmg >= 12 ? 220 : 120, e.dmg >= 12 ? 0.012 : 0.005);
        this.floatText(this.heroPos.x + Phaser.Math.Between(-40, 40), this.heroPos.y - 190, `−${e.dmg}${e.warded ? ' (щит)' : ''}`, 0xff8a7a, 34);
        if (e.source === 'leap' || e.source === 'bite') this.lunge();
      }
      if (e.type === 'status') this.floatText(this.enemyPos.x, this.enemyPos.y - 280, e.text, 0xcab3ff, 30);
      if (e.type === 'combo') this.combo(e.text);
      if (e.type === 'interrupt') { this.floatText(this.enemyPos.x, this.enemyPos.y - 280, 'Прервано!', 0x9fffc0, 40); services.audio.play('telekinesis_impact', { heavy: false }); }
      if (e.type === 'melt') this.floatText(this.enemyPos.x, this.enemyPos.y - 320, 'Дыхание растаяло', 0xffd08a, 32);
      if (e.type === 'patch') this.patchFx.emitting = e.on;
      if (e.type === 'breath') this.breathFx.emitting = e.on;
      if (e.type === 'howl') this.floatText(this.enemyPos.x, this.enemyPos.y - 280, 'Вой! Следующий удар сильнее', 0xff8a7a, 30);
      if (e.type === 'focus' && e.gained) this.floatText(this.heroPos.x, this.heroPos.y - 200, `+${e.gained} маны`, 0x9fc8ff, 34);
      if (e.type === 'focus' && e.broken) this.floatText(this.heroPos.x, this.heroPos.y - 200, 'Сбили!', 0xff8a7a, 34);
      if (e.type === 'result') this.finish(e.result);
    }
  }

  castFx(id) {
    const m = MOVES[id], from = { x: this.heroPos.x, y: this.heroPos.y - 110 }, to = { x: this.enemyPos.x, y: this.enemyPos.y - 120 };
    if (['flame', 'throw', 'push', 'astral', 'hex'].includes(id)) {
      const dot = this.add.image(from.x, from.y, 'fx_glow').setTint(SCHOOL_COLOR[m.school]).setBlendMode('ADD').setScale(id === 'flame' ? 1.4 : 0.9).setDepth(3500);
      this.tweens.add({ targets: dot, x: to.x, y: to.y, duration: m.cast * 1000, ease: 'Quad.easeIn', onComplete: () => dot.destroy() });
    }
    if (id === 'ward' || id === 'barrier') { this.wardRing.setTint(SCHOOL_COLOR[m.school]).setAlpha(0.9); }
  }

  lunge() {
    this.tweens.add({ targets: this.enemy, y: this.enemyPos.y + 70, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  combo(text) {
    this.comboText.setText(text).setAlpha(1).setScale(0.6);
    this.tweens.killTweensOf(this.comboText);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.comboText, alpha: 0, delay: 900, duration: 400 });
    this.cameras.main.flash(160, 255, 200, 140);
  }

  drawUi(time) {
    const b = this.battle, { W, H } = this, e = b.enemy, h = b.hero;
    // здоровье врага
    const g = this.ehp.clear(), bx = 70, bw = W - 140, by = 180;
    g.fillStyle(0x1a0d0b, 0.9).fillRoundedRect(bx, by, bw, 22, 11);
    g.fillStyle(0xd9534a, 1).fillRoundedRect(bx, by, Math.max(12, bw * e.hp / e.maxHp), 22, 11);
    g.lineStyle(2, 0xffd0c8, 0.7).strokeRoundedRect(bx, by, bw, 22, 11);
    // намерение
    const it = b.intent(), ib = this.intentBar.clear();
    if (it.state === 'windup' || it.state === 'channel') {
      this.intentText.setText(it.state === 'channel' ? `${it.name}!` : `Готовит: ${it.name}`).setColor(it.state === 'channel' ? '#cfefff' : '#ffb3a6');
      this.intentHint.setText(COUNTERS[it.action] || '');
      ib.fillStyle(0x2a1210, 1).fillRoundedRect(80, 296, W - 160, 12, 6).fillStyle(it.state === 'channel' ? 0x9fe6ff : 0xff6a5a, 1).fillRoundedRect(80, 296, (W - 160) * Math.min(1, it.progress), 12, 6);
      this.prepGlow.setAlpha(0.25 + 0.35 * it.progress);
    } else {
      this.intentText.setText(it.state === 'held' ? 'Скован!' : it.state === 'staggered' ? 'Оглушён' : 'Кружит, выжидает').setColor(it.state === 'held' ? '#9fe9ff' : '#d8c7a5');
      this.intentHint.setText(it.state === 'held' ? 'Огонь по скованному — сильнее' : b.patch > 0 ? 'Хворост горит — Толчок в огонь!' : '');
      this.prepGlow.setAlpha(0);
    }
    this.holdRing.setAlpha(e.held > 0 ? 0.6 + Math.sin(time / 90) * 0.2 : 0);
    this.wardRing.setAlpha(h.ward > 0 ? 0.5 + Math.sin(time / 120) * 0.25 : 0);
    // здоровье и мана героя
    const hb = this.hbars.clear(), hw = W - 320, hy = H - 376;
    hb.fillStyle(0x140d09, 0.85).fillRoundedRect(24, hy - 14, hw + 40, 96, 16);
    hb.fillStyle(0x2a0f0d, 1).fillRoundedRect(140, hy, hw - 100, 26, 13).fillStyle(0xd9534a, 1).fillRoundedRect(140, hy, Math.max(13, (hw - 100) * h.hp / h.maxHp), 26, 13);
    hb.fillStyle(0x0d1a2a, 1).fillRoundedRect(140, hy + 36, hw - 100, 26, 13).fillStyle(h.chill > 0 || e.state === 'channel' ? 0x8ab4d8 : 0x4a8fe0, 1).fillRoundedRect(140, hy + 36, Math.max(13, (hw - 100) * h.mana / h.maxMana), 26, 13);
    this.hText.setText(`Здоровье ${Math.ceil(h.hp)}`).setPosition(36, hy - 1);
    this.mText.setText(`Мана ${Math.floor(h.mana)}`).setPosition(36, hy + 35);
    // кнопки
    for (const btn of this.buttons) {
      const m = MOVES[btn.id], why = b.blocked(btn.id), cast = h.cast?.id === btn.id, queued = h.queue === btn.id;
      drawPlate(btn.g, btn.w, btn.h, { accent: queued ? 0xffe9b0 : SCHOOL_COLOR[m.school], fill: cast ? 0x3a2414 : 0x1a120d, alpha: 0.92, radius: 18 }).setPosition(btn.x, btn.y);
      if (queued) btn.g.lineStyle(5, 0xffe9b0, 1).strokeRoundedRect(-btn.w / 2 + 4, -btn.h / 2 + 4, btn.w - 8, btn.h - 8, 14);
      const dim = why === 'mana' || why === 'cd';
      btn.icon.setAlpha(dim ? 0.45 : 1); btn.name.setAlpha(dim ? 0.6 : 1);
      btn.cost.setColor(why === 'mana' ? '#ff8a7a' : '#9fc8ff');
      const k = b.cooldown(btn.id) / m.cd;
      btn.cd.clear();
      if (k > 0) btn.cd.fillStyle(0x000000, 0.55).fillRoundedRect(btn.x - btn.w / 2 + 3, btn.y - btn.h / 2 + 3 + (btn.h - 6) * (1 - k), btn.w - 6, (btn.h - 6) * k, 14);
    }
    const fz = this.focusPos, focusing = !!h.focus;
    drawPlate(this.focusG, 220, 92, { accent: 0x9fc8ff, fill: focusing ? 0x14243a : 0x101820, alpha: 0.92, radius: 18 }).setPosition(fz.x, fz.y);
    if (focusing) this.focusG.fillStyle(0x9fc8ff, 0.35).fillRoundedRect(-106, -42, 212 * (1 - h.focus.t / FOCUS.channel), 84, 14);
    this.focusText.setAlpha(b.blocked('focus') === 'cd' ? 0.5 : 1).setText(focusing ? 'Собираюсь…' : 'Автоматически');
  }

  floatText(x, y, text, color, size = 30) {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: size, fontStyle: 'bold', color: hex(color), stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(4200);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 1100, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  banner(text, color) {
    const t = this.add.text(this.W / 2, this.H * 0.56, text, { fontFamily: FONT, fontSize: 64, fontStyle: 'bold', color: hex(color), stroke: '#000', strokeThickness: 8 }).setOrigin(0.5).setDepth(4300).setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 700, duration: 400, onComplete: () => t.destroy() });
  }

  finish(result) {
    if (this.ended) return;
    this.ended = true;
    this.patchFx.emitting = false; this.breathFx.emitting = false; this.prepGlow.setAlpha(0);
    const b = this.battle, s = b.stats;
    if (result === 'victory') {
      this.tweens.add({ targets: this.enemy, alpha: 0, y: this.enemyPos.y - 40, duration: 900 });
      services.audio.play('victory');
    } else this.anim.playDeath();
    this.liveControls?.remove();
    this.domPanel = panel(result === 'victory' ? 'Победа' : 'Отступление');
    const lines = result === 'victory'
      ? [`${this.def.name}: ${Math.round(b.time)} с · сочетаний ${s.combos} · прерываний ${s.interrupts}`, `Награда: ${this.def.reward.coins} монет и ингредиенты. Опыт использованных сил +${this.def.xp}.`, ...(s.familiarHits ? [`Морвен помог ${s.familiarHits} раз.`] : [])]
      : battleDiagnosis(b);
    for (const line of lines) this.domPanel.content.append(node('p', line));
    this.domPanel.footer.append(button(result === 'victory' ? 'Дальше' : 'Вернуться и усилиться', () => this.leave(result), 'ep-primary'));
  }

  leave(result) {
    const cb = this.onEnd;
    window.__episodeBattle = null;
    this.scene.stop();
    cb?.(result, this.battle);
  }
}
