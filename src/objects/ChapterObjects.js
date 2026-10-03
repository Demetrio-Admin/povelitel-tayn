// v0.10.0 — объекты первой главы «Лес, который забыл нас»:
//   GateObject      — Древние ворота: проявить знаки (Проявляющий состав), открыть Печатью (20 маны)
//   SealSigilObject — учебный знак у алтаря: спокойное первое применение Печати (20 маны)
//   DustStashObject — охраняемый запас пыли: +2 за каждый победный цикл своего Корневика
//   ForestNodeObject— повреждённый узел за воротами: связка + Печать (одна операция сервера, 20 маны)
// Применение сюжетных предметов идёт через services.actions.use(item) — атомарно (сервер или JS-зеркало).
import { COLORS } from '../config/game.config.js';
import { WORLD_MANA_COST } from '../config/balance.abilities.js';
import { STORY_ITEMS } from '../config/storyItems.js';
import { EV } from '../config/events.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { fm } from '../state/hero.js';
import { useFailText } from '../ui/windows09.js';
import { InteractiveObject, applyDisplaySize, itemName } from './InteractiveObject.js';

const SEAL = COLORS.seal;

/** Текст награды из outcome операции: «+30 опыта, +40 опыта Печати, +30 монет». */
export function outcomeText(out) {
  if (!out) return '';
  const parts = [];
  if (out.heroXP) parts.push(`+${out.heroXP} опыта`);
  for (const [k, v] of Object.entries(out.items || {})) if (v > 0) parts.push(k === 'coins' ? `+${v} монет` : `+${v} ${itemName(k)}`);
  for (const lv of out.levelUps || []) parts.push(`новый уровень ${lv.level}`);
  return parts.join(', ');
}

/**
 * Применить сюжетный предмет (кнопка у объекта). Пока идёт запрос, объект занят; при отказе — понятная причина,
 * ничего не списано. Возвращает результат операции ({ ok, outcome, … }).
 */
export async function useStoryItem(obj, item) {
  if (obj.busy || services.actions.busy) return { ok: false, reason: 'busy' };
  obj.busy = true;
  let r;
  try { r = await services.actions.use(item); } finally { obj.busy = false; }
  if (!r.ok) {
    const t = useFailText(r, STORY_ITEMS[item]?.name || item);
    if (t) { obj.scene.toast(t, COLORS.danger); services.audio.play('locked'); }
  }
  return r;
}

// ---------------------------------------------------------------------------
export class GateObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    scene.addGlow(cfg.x, cfg.y - 120, SEAL, 0.5, this, 2.4);
    this.markView = null;
    if (this.opened) this.showOpen(false);
    else if (this.state.hasEvent(EV.GATE_MARKS_REVEALED)) this.showMark(false);
  }

  get opened() { return this.state.hasEvent(this.cfg.openEvent); }
  /** Этап ворот: sleep → marks → tell → train → seal → open. */
  get stage() {
    const s = this.state;
    if (this.opened) return 'open';
    if (!s.hasEvent(this.cfg.requiresEvent)) return 'sleep';
    if (!s.hasEvent(EV.GATE_MARKS_REVEALED)) return 'marks';
    if (!s.hasEvent(EV.UNLOCK_SEAL_1)) return 'tell';
    if (!s.hasEvent(EV.SEAL_TRAINING_COMPLETE)) return 'train';
    return 'seal';
  }
  get ability() { return this.stage === 'seal' ? 'seal' : null; }
  set ability(v) { /* дар ворот зависит от этапа (базовый конструктор пишет null) */ }
  get hasCompound() { return this.state.item('revealing_compound') > 0; }
  get markerIcon() { const st = this.stage; return st === 'seal' ? 'icon_seal' : st === 'marks' && this.hasCompound ? 'icon_compound' : 'icon_inspect'; }
  get markerColor() { return SEAL; }
  get label() {
    const st = this.stage;
    if (st === 'seal') return 'Открыть Печатью';
    if (st === 'marks' && this.hasCompound) return 'Проявить знаки';
    return 'Древние ворота';
  }
  manaCost() { return this.stage === 'seal' ? WORLD_MANA_COST.seal : 0; }
  // ворота видны всегда; до победы над Стражем они просто «молчат»
  refresh() { if (this.removed) return; this.sprite.setVisible(true); for (const g of this.glows || []) g.setVisible(true); }
  isDone() { return this.opened; }

  interact(abilityId) {
    if (!this.isAvailable()) return;
    const st = this.stage;
    const toast = (t) => this.scene.toast(t, SEAL);
    if (abilityId && abilityId !== 'seal' && st !== 'sleep') {
      toast('Ворота держит древняя связь — ни Телекинез, ни Огонь её не разорвут. Нужна Печать.');
      services.audio.play('locked');
      return;
    }
    switch (st) {
      case 'sleep': toast('Древние ворота молчат. Путь к ним стережёт Лесной Страж.'); return;
      case 'marks':
        if (this.hasCompound) { this.reveal(); return; }
        toast('На створках — стёртый, повреждённый знак. Селена говорила: его проявит Проявляющий состав из котла Мирры.');
        return;
      case 'tell':
        this.scene.dialog({
          title: 'Проявленный знак', color: SEAL,
          text: 'На камне светится знак защитной связи — и он разорван, будто из узла за воротами вытянули силу.\n\nСелена у алтаря должна знать, что это значит.',
          buttons: [{ label: fm('Пойду к Селене', 'Пойду к Селене'), primary: true }],
        });
        return;
      case 'train': toast('Печать ещё непривычна рукам. Сначала спокойно опробуйте её на учебном знаке у алтаря.'); return;
      case 'seal': this.openWithSeal(); return;
      default: break;
    }
  }

  async reveal() {
    const r = await useStoryItem(this, 'revealing_compound');
    if (!r.ok) return;
    services.audio.play('quest_update');
    this.scene.burst(this.x, this.baseY - 150, SEAL, 30);
    this.showMark(true);
    this.scene.dialog({
      title: 'Знаки проявились', color: SEAL,
      text: 'Состав впитался в камень, и на створках проступил знак защитной связи — разорванный.\n\nТак вот почему лес ошибается. Ворота сами не откроются.'
        + (outcomeText(r.outcome) ? `\n\nНаграда: ${outcomeText(r.outcome)}.` : '') + '\n\nРасскажите об этом Селене у алтаря.',
      buttons: [{ label: 'К Селене', primary: true }],
    });
  }

  openWithSeal() {
    if (this.busy || !this.payMana()) return;
    this.busy = true;
    const sc = this.scene;
    sc.player.castAt(this.x, this.baseY, 'telekinesis');
    sc.castFx(this.x, this.baseY - 120, SEAL);
    this.abilities.grantUseXP('seal', 'exploration');
    sc.time.delayedCall(450, () => {
      this.busy = false;
      if (this.cfg.opensPath) this.state.openPath(this.cfg.opensPath);
      this.quests.complete(this.cfg.openEvent);
      services.audio.play('chest');
      sc.burst(this.x, this.baseY - 150, SEAL, 40);
      sc.sparkleShower?.(this.x, this.baseY - 160, SEAL);
      this.showOpen(true);
      sc.toast('Печать связала разорванный знак — Древние ворота открылись', SEAL);
      services.bus.emit(MSG.QUEST_CHANGED);
      if (this.cfg.panOnOpen) sc.panTo(this.cfg.panOnOpen.x, this.cfg.panOnOpen.y);
    });
  }

  /** Знак на створках: печать на камне (тусклая до открытия). */
  showMark(animate) {
    if (this.markView || !this.sprite.active) return;
    this.markView = this.scene.add.image(this.x, this.baseY - 175, 'icon_seal').setDisplaySize(70, 70)
      .setDepth(this.sprite.depth + 1).setAlpha(animate ? 0 : 0.75).setTint(0xd8c2ff);
    if (animate) this.scene.tweens.add({ targets: this.markView, alpha: 0.75, duration: 900 });
  }

  /** Проход открыт: створки больше не держат, знак горит ровным светом. */
  showOpen(animate) {
    if (this.blocker) { this.blocker.destroy(); this.blocker = null; }
    this.showMark(false);
    this.markView?.setAlpha(1).clearTint();
    this.sprite.setTint(0xe9dcff);
    for (const g of this.glows || []) { g.setAlpha(animate ? 0.2 : 0.6); if (animate) this.scene.tweens.add({ targets: g, alpha: 0.6, duration: 800 }); }
  }
}

// ---------------------------------------------------------------------------
export class SealSigilObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.ability = 'seal';
    if (this.isDone()) this.light(false);
    else this.glow = scene.addGlow(cfg.x, cfg.y - 20, SEAL, 0.18, this, 1.0);
  }
  get markerIcon() { return 'icon_seal'; }
  get markerColor() { return SEAL; }
  get label() { return 'Печать'; }
  isDone() { return this.state.hasEvent(this.cfg.doneEvent); }
  manaCost() { return this.abilities.isUnlocked('seal') && !this.isDone() ? WORLD_MANA_COST.seal : 0; }

  interact(abilityId) {
    if (!this.isAvailable()) return;
    if (this.rejectWrongAbility(abilityId)) return;
    if (!this.abilities.isUnlocked('seal')) {
      this.scene.toast('Погасший знак связи. Селена знает, как вернуть ему свет.', SEAL);
      return;
    }
    if (!this.payMana()) return;
    this.busy = true;
    const sc = this.scene;
    sc.player.castAt(this.x, this.baseY, 'telekinesis');
    sc.castFx(this.x, this.baseY - 20, SEAL);
    this.abilities.grantUseXP('seal', 'exploration');
    sc.time.delayedCall(450, () => {
      this.busy = false;
      this.light(true);
      this.quests.complete(this.cfg.doneEvent);
      services.audio.play('quest_update');
      sc.dialog({
        title: 'Знак ожил', color: SEAL,
        text: 'Трещины затянулись, и знак засиял ровным лиловым светом. Печать не ломает и не жжёт — она связывает то, что разорвано.\n\n'
          + 'В бою она на миг сковывает противника, ослабляет его удары и прерывает сильную подготовку, которую не берут ни камень, ни огонь.\n\n'
          + 'Теперь — к Древним воротам.',
        buttons: [{ label: 'К воротам', primary: true }],
      });
    });
  }

  light(animate) {
    const tex = this.cfg.litTexture;
    if (!tex || !this.sprite.active) return;
    this.sprite.setTexture(tex);
    applyDisplaySize(this.sprite, tex);
    this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY };
    if (animate) {
      this.scene.burst(this.x, this.baseY - 20, SEAL, 30);
      this.scene.sparkleShower?.(this.x, this.baseY - 24, SEAL);
      this.react(SEAL, 1.2);
    }
    if (!this.litGlow) this.litGlow = this.scene.addGlow(this.cfg.x, this.cfg.y - 20, SEAL, 0.45, this, 1.1);
  }
}

// ---------------------------------------------------------------------------
/** Ключ живого состояния возобновляемого врага (см. EnemyTrigger): { wins, at }. */
export const repKey = (spawnId) => `rep:${spawnId}`;

export class DustStashObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.sparkle = scene.addGlow(cfg.x - 20, cfg.y - 14, 0xc9a2ff, 0.35, this, 0.8);
    this.applyVisual();
  }
  get markerIcon() { return 'icon_gather'; }
  get markerColor() { return 0xc9a2ff; }
  get label() { return 'Забрать пыль'; }
  get title() { return this.cfg.hint; }
  /** Победный цикл охранника, за который запас ещё не взят. */
  get wins() { return this.state.getObject(repKey(this.cfg.guard))?.wins || (this.state.isEnemyDefeated(this.cfg.guard) ? 1 : 0); }
  get claimed() { return this.saved.claimed || 0; }
  /** Охранник сейчас стоит у запаса (вернулся после 600 с и ещё не побеждён). */
  guardAlive() { const g = this.scene.enemies?.find(e => e.id === this.cfg.guard); return g ? !g.defeated : !this.state.isEnemyDefeated(this.cfg.guard); }
  ready() { return this.wins > this.claimed && !this.guardAlive(); }
  isDone() { return !this.ready(); }
  refresh() { super.refresh(); this.applyVisual(); }
  update() { if (!this.removed && this.full !== this.ready()) this.applyVisual(); }

  applyVisual() {
    if (this.removed || !this.sprite.active) return;
    this.full = this.ready();
    const tex = this.full || this.guardAlive() ? this.cfg.texture : this.cfg.emptyTexture;
    if (this.sprite.texture?.key !== tex) { this.sprite.setTexture(tex); applyDisplaySize(this.sprite, tex); this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY }; }
    for (const g of this.glows || []) g.setVisible(this.full || this.guardAlive());
  }

  interact() {
    if (!this.isAvailable()) {
      if (this.guardAlive()) this.scene.toast('Запас стережёт Корневик.', COLORS.danger);
      return;
    }
    // один победный цикл — одно разрешение: отметка claimed = номер цикла, перезаход второй выдачи не даёт
    this.persist({ claimed: this.wins });
    for (const [k, v] of Object.entries(this.cfg.items)) this.state.addItem(k, v);
    this.state.save();
    services.audio.play('gather_done');
    this.scene.burst(this.x - 20, this.baseY - 14, 0xc9a2ff, 18);
    for (const [k, v] of Object.entries(this.cfg.items)) this.scene.floatIcon?.(this.x, this.baseY - 60, 'icon_dust', `+${v} ${itemName(k)}`, 0xc9a2ff);
    this.applyVisual();
    services.bus.emit(MSG.GATHERED, { item: Object.keys(this.cfg.items)[0], amount: Object.values(this.cfg.items)[0], id: this.id });
    services.bus.emit(MSG.HUD_REFRESH);
    services.bus.emit(MSG.QUEST_CHANGED);
  }
}

// ---------------------------------------------------------------------------
export class ForestNodeObject extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.sprite.setDepth(this.sprite.depth - 40);
    this.glowNode = scene.addGlow(cfg.x, cfg.y - 70, this.restored ? 0x7be2c8 : 0x8a6bb0, this.restored ? 0.5 : 0.25, this, 2.2);
    if (this.restored) this.showRestored(false);
  }
  get restored() { return this.state.hasEvent(EV.CHAPTER_1_COMPLETE); }
  get ability() { return this.stage === 'repair' ? 'seal' : null; }
  set ability(v) { /* дар узла зависит от этапа */ }
  get stage() {
    if (this.restored) return 'done';
    if (!this.state.hasEvent(EV.CHAPTER_TRIAL_DEFEATED)) return 'guarded';
    if (this.state.item('restoration_bundle') < 1) return 'bundle';
    return 'repair';
  }
  get markerIcon() { return this.stage === 'repair' ? 'icon_bundle' : 'icon_inspect'; }
  get markerColor() { return 0x7be2c8; }
  get label() { return this.stage === 'repair' ? 'Восстановить узел' : 'Узел защиты'; }
  manaCost() { return this.stage === 'repair' ? WORLD_MANA_COST.seal : 0; }
  isDone() { return this.restored; }
  get markerY() { return this.baseY - 150; }

  interact(abilityId) {
    if (!this.isAvailable()) return;
    if (abilityId && abilityId !== 'seal') { this.scene.toast('Узлу не помогут ни Телекинез, ни Огонь: нужны связка и Печать.', SEAL); return; }
    switch (this.stage) {
      case 'guarded': this.scene.toast('Узел охраняет Страж узла.', COLORS.danger); return;
      case 'bundle':
        this.scene.dialog({
          title: 'Повреждённый узел', color: 0x7be2c8,
          text: 'Кристалл узла треснул, из трещин тянется лиловый след — силу вытянули намеренно.\n\n'
            + 'Чтобы залатать разрыв, нужна Восстановительная связка (котёл Мирры: 2 травы, 2 смолы, 2 пыли, осколок и ядро Стража) и Печать — 20 маны.',
          buttons: [{ label: fm('Поняла', 'Понял'), primary: true }, { label: 'Открыть журнал', onClick: () => services.bus.emit(MSG.OPEN_JOURNAL) }],
        });
        return;
      case 'repair': this.repair(); return;
      default: break;
    }
  }

  async repair() {
    const sc = this.scene;
    sc.player.castAt(this.x, this.baseY, 'telekinesis');
    // связка и 20 маны списываются одной операцией вместе с итогом главы: нехватка — ничего не меняется
    const r = await useStoryItem(this, 'restoration_bundle');
    if (!r.ok) return;
    sc.castFx(this.x, this.baseY - 80, SEAL);
    services.audio.play('victory');
    sc.burst(this.x, this.baseY - 90, 0x7be2c8, 44);
    sc.sparkleShower?.(this.x, this.baseY - 100, 0x7be2c8);
    this.showRestored(true);
    services.bus.emit(MSG.FINAL_SCREEN, { outcome: r.outcome, reward: outcomeText(r.outcome) });
  }

  showRestored(animate) {
    const tex = this.cfg.restoredTexture;
    if (!this.sprite.active) return;
    this.sprite.setTexture(tex);
    applyDisplaySize(this.sprite, tex);
    this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY };
    this.glowNode?.setTint?.(0x7be2c8);
    if (animate) this.react(0x7be2c8, 1.15);
  }
}
