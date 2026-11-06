// HUD эпизода — компактный мобильный HUD из /camera-test/ плюс строка цели под ним, журнал эпизода и финальное окно.
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { drawPlate } from '../ui/widgets.js';
import { CameraUIScene } from '../camera-test/ui.js';
import { powerDefinition, powerLevel } from '../config/magic.powers.js';
import { EPISODE_UPGRADES, beginEpisodeResearch, brewEpisode, sellEpisodePotion } from './model/progression.js';
import { ITEMS } from '../config/balance.progression.js';
import { panel, node, button } from './panels.js';
import { episode, PREFIX } from './runtime.js';
import { FIRE_CONTROL, PRACTICE_FOR_CONFIDENT } from './model/heat.js';
import { RITUAL_NEEDS, stepIndex, STEPS } from './model/story.js';

const FONT = UI.font;
const SH = UI.shadow;
const GOAL = { y: 168, h: 58, w: 560 };

export class EpisodeUIScene extends CameraUIScene {
  create() {
    super.create();
    this.buildGoal();
    const refresh = () => this.refreshGoal();
    this.bus.on(MSG.QUEST_CHANGED, refresh, this);
    this.bus.on('episode:end', () => this.openEnd(), this);
    this.events.once('shutdown', () => { this.bus.off(MSG.QUEST_CHANGED, refresh, this); this.bus.off('episode:end', undefined, this); });
  }

  // Облачные окна основной игры в эпизоде не нужны.
  openWallet() { this.toast('В эпизоде кошелька нет.'); }

  /** «Все дары» в эпизоде — что умеет герой сейчас (таймеры изучения и слоты основной игры здесь не участвуют). */
  toggleTray() { if (this.magicPanel) this.magicPanel.close(); else if (!this.modal && this.mode === 'exploration') this.openGifts(); }

  openGifts() {
    if (this.magicPanel) return;
    services.modalOpen = true; this.bus.emit(MSG.MODAL_OPEN);
    this.scene.get('ExplorationScene')?.player.stop();
    const p = panel('Магия и подготовка', { onClose: () => {
      this.magicPanel = null; services.modalOpen = false; this.bus.emit(MSG.MODAL_CLOSED); this.refreshHud();
    } });
    this.magicPanel = p;
    this.events.once('shutdown', () => { p.root.remove(); this.magicPanel = null; services.modalOpen = false; });
    const render = () => {
      if (!p.root.isConnected) return;
      const d = services.state.data, ep = episode.ep;
      p.content.replaceChildren();
      p.content.append(node('p', `Монеты: ${d.inventory.coins || 0} · смола: ${d.inventory.tree_resin || 0} · пыль: ${d.inventory.rune_dust || 0}`, 'ep-note'));
      if (d.research) p.content.append(node('p', `Изучение: ${EPISODE_UPGRADES[d.research.upgradeId]?.title || 'дар'} — ${Math.ceil(services.state.researchRemainingMs() / 1000)} с`, 'ep-counter'));
      for (const id of ['telekinesis', 'fire', 'seal', 'curse', 'barrier']) {
        const def = powerDefinition(id, { experimental: true }), level = powerLevel(d, id);
        const box = node('div', null, 'ep-box');
        box.append(node('h2', `${def.name}${level ? ` · ${level}` : ' · спит'}`), node('p', `${def.school} · опыт ${d.schoolXP[id] || 0}`, 'ep-note'));
        const tips = {
          telekinesis: `Мир: притянуть сбор, отвести дерево. Бой: Бросок и Толчок${level >= 2 ? ', Удержание → Огонь' : '; на II — Удержание'}.`,
          fire: level ? `Мир: смола и фонари одним касанием${level >= 2 ? ', направленный поток' : ''}. Бой: Пламя и Поджог${level >= 3 ? ' с горением' : '; на III — горение'}.` : 'Разбудите огонь в круге по сюжету.',
          seal: 'Древняя печать у алтаря открывает Астрал: тайник в мире, пробитие брони в бою.',
          curse: 'Проклятые корни у Веды открывают Порчу: ослабление и Огонь ×1,5; на II — запрет лечения.',
          barrier: 'Морозная ловушка у круга открывает Барьер: безопасный сбор в мире, щит и отражение в бою.',
        };
        box.append(node('p', tips[id]));
        for (const [key, u] of Object.entries(EPISODE_UPGRADES).filter(([, u]) => u.ability === id && u.toLevel > level)) {
          box.append(node('p', `${u.title}: ${u.cost.coins} монет, ${u.cost.schoolXP} опыта, ${Object.entries(u.cost.items).map(([k,n]) => `${ITEMS[k]?.name || k} ×${n}`).join(', ')}. ${u.explanation}`, 'ep-note'));
          box.append(button(`Изучить ${u.title}`, () => {
            const r = beginEpisodeResearch(services.state, ep, key); episode.save(); render();
            if (!r.ok) this.toast(r.reason);
          }));
        }
        p.content.append(box);
      }
      p.content.append(node('h2', 'Алхимия и снаряжение'), node('p', `Трава ${d.inventory.moon_herb || 0} · грибы ${d.inventory.forest_mushroom || 0} · настои ${d.inventory.potion_life_small || 0}. Настой варится из 1 травы и 1 гриба.`, 'ep-note'));
      const row = node('div', null, 'ep-row');
      row.append(button('Сварить настой', () => { const ok = brewEpisode(d); episode.save(); render(); if (!ok) this.toast('Нужны лунная трава и лесной гриб.'); }), button('Продать настой · 25 монет', () => { const ok = sellEpisodePotion(d); episode.save(); render(); if (!ok) this.toast('Сначала сварите настой.'); }));
      p.content.append(row);
      if (d.inventory.amulet_focus) p.content.append(button(`Амулет Сосредоточения: ${ep.amulet ? 'надет' : 'надеть'}`, () => { ep.amulet = ep.amulet ? null : 'amulet_focus'; episode.save(); render(); }));
      p.content.append(node('p', ep.morven ? 'Морвен рядом: усиливает проклятую цель.' : 'Морвен присоединится, когда вы распутаете проклятие корней.', 'ep-note'));
      p.content.append(node('h2', 'Найти в лесу'));
      const links = [['ep_regrow_herb','Травы и грибы'],['ep_regrow_resin','Смола и пыль'],['ep_farm_wolf','Лёгкий волк'],['ep_farm_spirit','Лесной дух'],['ep_astral_cache','Древняя печать'],['ep_cursed_roots','Проклятые корни'],['ep_magic_trap','Морозная ловушка'],['ep_wolf','Волк метели']];
      const paths = node('div', null, 'ep-row');
      for (const [id, label] of links) paths.append(button(label, () => { p.close(); this.scene.get('ExplorationScene').walkToEpisodeObject(id); }));
      p.content.append(paths, node('p', 'Тестовый эпизод. Прогресс сохраняется отдельно от основной игры.', 'ep-note'));
    };
    render();
    const timer = this.time.addEvent({ delay: 1000, loop: true, callback: () => { if (!p.root.isConnected) timer.remove(); else if (services.state.data.research || this.panelResearch) { this.panelResearch = services.state.data.research; render(); } } });
  }

  buildGoal() {
    const c = this.add.container(20 + GOAL.w / 2, GOAL.y).setDepth(40);
    this.goalPlate = drawPlate(this.add.graphics(), GOAL.w, GOAL.h, { accent: COLORS.fire, alpha: 0.78, radius: 18 });
    this.goalIcon = this.add.text(-GOAL.w / 2 + 26, 0, '◆', { fontFamily: FONT, fontSize: 24, color: '#ffc46b', shadow: SH }).setOrigin(0.5);
    this.goalText = this.add.text(-GOAL.w / 2 + 48, 0, '', { fontFamily: FONT, fontSize: 24, color: '#fbefd2', shadow: SH, wordWrap: { width: GOAL.w - 70 } }).setOrigin(0, 0.5);
    const hit = this.add.zone(0, 0, GOAL.w, GOAL.h).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => { if (!this.modal && this.mode === 'exploration') this.openJournal(); });
    c.add([this.goalPlate, this.goalIcon, this.goalText, hit]);
    this.goalC = c;
    this.viewport?.assign(c, 'top');
    this.refreshGoal();
  }

  refreshGoal() {
    if (!this.goalText || !episode.ep) return;
    const text = episode.goal();
    if (text === this.lastGoal) return;
    const changed = this.lastGoal != null;
    this.lastGoal = text;
    this.goalText.setText(text);
    const h = Math.max(GOAL.h, this.goalText.height + 22);
    drawPlate(this.goalPlate, GOAL.w, h, { accent: COLORS.fire, alpha: 0.78, radius: 18 });
    this.goalC.setY(GOAL.y + (h - GOAL.h) / 2);
    if (changed) {
      this.tweens.add({ targets: this.goalC, scale: { from: 1.06, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      services.audio.play('quest_update', { minGap: 400 });
    }
  }

  fieldTop() { return GOAL.y + 70; }
  // цели главы I в эпизоде не показываются: цель эпизода всегда видна в строке под HUD
  showGoalBanner() {}

  update(time, delta) {
    super.update(time, delta);
    const magic = this.scene.isActive('EpisodeMagicScene');
    this.goalC?.setVisible(this.mode === 'exploration' && !this.modal && !magic);
    // во время действия магии нижняя панель уступает место шкале и кнопке «Отмена»
    if (this.mode === 'exploration') for (const b of [this.magicBtn, this.bagBtn]) b?.c.setVisible(!magic);
  }

  /** Журнал эпизода: цель, зачем, что собрано, чему научились. */
  openJournal() {
    const ep = episode.ep, inv = services.state.data.inventory;
    const done = STEPS.slice(0, Math.max(0, stepIndex(ep.step))).filter(s => s.id !== 'done');
    const ctl = FIRE_CONTROL[episode.control()];
    const names = { tree_resin: 'Смола', moon_herb: 'Лунная трава', frost_shard: 'Осколок льда' };
    const lines = [
      `Цель: ${episode.goal()}`,
      episode.why() ? `Зачем: ${episode.why()}` : '',
      '',
      'Сила',
      `• Телекинез: подхватить, отвести, притянуть`,
      services.abilities.isUnlocked('fire') ? `• Огонь ${ep.fireLevel} — ${ep.fireLevel >= 3 ? 'пламя и горение' : ep.fireLevel >= 2 ? 'направленное пламя' : 'первый жар'}` : '• Огонь ещё спит',
      services.abilities.isUnlocked('fire') ? `• Владение огнём: ${ctl.name}${ep.lesson && episode.control() < 2 ? ` (практика ${Math.min(ep.practice, PRACTICE_FOR_CONFIDENT)}/${PRACTICE_FOR_CONFIDENT})` : ''}` : '',
      '',
      stepIndex(ep.step) >= stepIndex('gather') && stepIndex(ep.step) <= stepIndex('ritual')
        ? `Для ритуала: ${Object.entries(RITUAL_NEEDS).map(([id, n]) => `${names[id]} ${Math.min(n, inv[id] || 0)}/${n}`).join(' · ')}` : '',
      done.length ? `Пройдено: ${done.map(s => s.goal[0].toLowerCase() + s.goal.slice(1)).join('; ')}.` : '',
    ].filter((l, i, a) => l !== '' || (a[i - 1] && a[i - 1] !== ''));
    this.openModal({
      title: 'Первое пламя', color: COLORS.fire, text: lines.join('\n'),
      buttons: [{ label: 'Закрыть', primary: true }, { label: 'Начать заново', onClick: () => this.confirmRestart() }],
    });
  }

  confirmRestart() {
    this.openModal({
      title: 'Начать эпизод заново?', color: COLORS.danger,
      text: 'Прогресс эпизода сотрётся. Основная игра и её сохранения не затрагиваются.',
      buttons: [{ label: 'Да, заново', primary: true, onClick: () => restartEpisode() }, { label: 'Отмена' }],
    });
  }

  openEnd() {
    const ep = episode.ep;
    const mistake = ep.charred ? 'Вы обожгли сбор Веды — и научились отпускать жар раньше.' : 'Вы отогрели травы с первого раза — Мирра всё равно показала, как слушать жар.';
    const growth = episode.control() >= 2 ? 'Огонь стал послушным: простое пламя — одним касанием.' : `Практика огня: ${Math.min(ep.practice, PRACTICE_FOR_CONFIDENT)}/${PRACTICE_FOR_CONFIDENT}.`;
    const fight = `Бой: ${ep.defeats ? `с ${ep.defeats + 1}-й попытки` : 'с первой попытки'}, приёмы — ${(ep.loadout || []).map(id => ({ astral: 'Астрал', hex: 'Порча', barrier: 'Барьер', throw: 'Бросок', push: 'Толчок', hold: 'Удержание', flame: 'Пламя', ignite: 'Поджог', ward: 'Тёплый щит' })[id]).join(', ')}.`;
    this.openModal({
      title: 'Эпизод «Первое пламя» пройден', color: 0xffc46b,
      text: `${mistake}\n${growth}\n${fight}\n\nЖивое пламя знает, куда унесли сердце зимы, — на старое кладбище. Чтобы дойти туда, придётся научиться соединять силы.\n\n`
        + 'Что важно понять после игры:\n• захотелось ли самому пробовать силу;\n• понятно ли, зачем были находки;\n• почувствовался ли рост;\n• было ли видно, как выбранные силы работают вместе;\n• оправдал ли Морозный лес ожидание.',
      buttons: [{ label: 'Остаться в Морозном лесу', primary: true }, { label: 'Пройти заново', onClick: () => restartEpisode() }],
    });
  }
}

/** Стереть только сохранение эпизода (ключи с его префиксом) и перезагрузить страницу. */
export function restartEpisode() {
  try {
    const ls = window.localStorage;
    for (const k of Object.keys(ls)) if (k.startsWith(PREFIX)) ls.removeItem(k);
  } catch { /* private browsing: сохранение и так в памяти */ }
  window.location.reload();
}
