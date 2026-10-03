// v0.9 — HUD-подсветка запасов, зелья из сумки, лечение у Мирры за монеты, стартовый набор зелий.
// Методы подмешиваются в UIScene (как windows08/hud082), `this` — UIScene. Логика — в state/vitals.js,
// systems/Consumables.js и systems/PlayerActions.js; здесь только окна и обратная связь.
import { fm } from '../state/hero.js';
import { COLORS } from '../config/game.config.js';
import { POTIONS } from '../config/resources.js';
import { STORY } from '../config/story.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import * as vitals from '../state/vitals.js';
import { drinkOutside } from '../systems/Consumables.js';

export const windows09 = {
  buildV09() {
    const { bus } = services;
    this.hpGlow = this.add.image(0, 0, 'fx_glow').setTint(COLORS.danger).setBlendMode('ADD').setAlpha(0).setDepth(55);
    this.manaGlow = this.add.image(0, 0, 'fx_glow').setTint(COLORS.mana).setBlendMode('ADD').setAlpha(0).setDepth(55);
    this.highlightT = { hp: 0, mana: 0 };
    bus.on(MSG.HUD_HIGHLIGHT, this.onHudHighlight, this);
    bus.on(MSG.MANA_SPENT, this.onManaSpentUi, this);
    bus.on(MSG.OPEN_HEAL, this.openHeal, this);
    bus.on(MSG.STARTER_KIT, this.onStarterKit, this);
  },

  /** Коротко подсветить индикатор HP или маны (первый урон, первый расход маны, нехватка). */
  onHudHighlight(which) {
    if (which === 'hp' || which === 'mana') this.highlightT[which] = 2.6;
  },

  updateV09(dt) {
    for (const [k, glow, bar] of [['hp', this.hpGlow, this.hpBar], ['mana', this.manaGlow, this.manaBar]]) {
      if (!glow || !bar) continue;
      this.highlightT[k] = Math.max(0, this.highlightT[k] - dt);
      const on = this.highlightT[k] > 0;
      if (on) {
        const t = bar.trough;
        glow.setPosition(t.x + t.displayWidth / 2, t.y + t.displayHeight / 2).setDisplaySize(t.displayWidth * 1.25, t.displayHeight * 2.6);
      }
      glow.setAlpha(on ? 0.35 + Math.sin(this.time.now / 120) * 0.25 : 0);
    }
  },

  /** Первый оплаченный сбор/магия: подсветка маны и короткое объяснение (один раз на персонажа). */
  onManaSpentUi() {
    this.onHudHighlight('mana');
    const list = services.state.data.tutorial;
    if (Array.isArray(list) && !list.includes('mana_cost') && services.settings?.get('hints') !== false) {
      list.push('mana_cost');
      services.state.save();
      this.toast(STORY.firstManaHint, COLORS.mana);
    }
    this.refreshHud();
  },

  // ================================================================== зелья из сумки
  drinkFromBag(id) {
    const r = drinkOutside(services.state, id);
    const p = POTIONS[id];
    if (!r.ok) {
      services.audio.play('locked');
      const msg = { full: r.kind === 'heal' ? 'Здоровье уже полное — настой не потрачен.' : 'Мана уже полная — эликсир не потрачен.', none: 'Такого зелья нет в сумке.', combat: 'Это зелье применяется только в бою.' }[r.reason];
      if (msg) this.toast(msg);
      return;
    }
    services.audio.play('potion');
    this.toast(`${p.name}: +${Math.round(r.amount)} ${r.kind === 'heal' ? 'здоровья' : 'маны'}`, p.color);
    this.onHudHighlight(r.kind === 'heal' ? 'hp' : 'mana');
    this.refreshHud();
    this.reopenModal();   // число в сумке и кнопки «Выпить» обновляются, позиция прокрутки сохраняется
  },

  // ================================================================== лечение у Мирры
  /** Окно подтверждения: текущее HP, результат, цена и монеты — по состоянию на момент открытия (после закрытия диалога). */
  openHeal() {
    if (this.modal || this.mode !== 'exploration') return;
    const st = services.state;
    const cur = vitals.hp(st), max = vitals.maxHp(st), coins = st.item('coins');
    const price = vitals.healPrice(cur, max);
    if (price <= 0) {
      this.openModal({ title: 'Лечение у Мирры', color: 0x7be28a, text: fm('Ты цела, ведьма. Лечить нечего.', 'Ты цел, колдун. Лечить нечего.'), buttons: [{ label: 'Закрыть', primary: true }] });
      return;
    }
    const head = `Здоровье: ${Math.ceil(cur)} / ${max}  →  ${max} / ${max}\nЦена: ${price} ${coinWord(price)}   ·   у вас: ${coins}`;
    if (coins < price) {
      this.openModal({
        title: 'Лечение у Мирры', color: 0x7be28a,
        text: `${head}\n\nМонет не хватает — ничего не списано. Здоровье и так понемногу возвращается вне боя, а Настой жизни из сумки вернёт почти половину.`,
        buttons: [{ label: 'Закрыть', primary: true }],
      });
      return;
    }
    this.openModal({
      title: 'Лечение у Мирры', color: 0x7be28a, vertical: true, text: `${head}\n\nМирра зашепчет рану — здоровье восстановится полностью.`,
      buttons: [{ label: `Восстановить за ${price} ${coinWord(price)}`, primary: true, onClick: () => this.doHeal() }, { label: 'Отмена', cancel: true }],
    });
  },

  async doHeal() {
    if (services.actions.busy) return;
    const before = vitals.hp(services.state);
    const r = await services.actions.heal();
    if (r.ok) {
      services.audio.play('potion');
      const v = vitals.view(services.state);
      this.toast(`Здоровье восстановлено: ${v.hp} / ${v.maxHp}${r.price ? ` (−${r.price} ${coinWord(r.price)})` : ''}`, 0x7be28a);
      this.onHudHighlight('hp');
    } else if (r.reason === 'coins') {
      this.toast('Монет не хватает — лечение не выполнено, монеты не списаны.', COLORS.danger);
    } else if (r.reason === 'full') {
      this.toast('Здоровье уже полное.');
    } else if (r.reason !== 'busy') {
      this.toast(actionFailText(r, 'лечение не выполнено, монеты не списаны'), COLORS.danger);
    }
    if (vitals.hp(services.state) !== before) this.refreshHud();
    this.refreshHud();
  },

  // ================================================================== стартовый набор
  async onStarterKit() {
    if (services.actions.busy || services.state.hasEvent(STORY.starterKitEvent)) return;
    const r = await services.actions.starterKit();
    if (r.ok) {
      services.audio.play('coin');
      this.toast(`+1 ${POTIONS.elixir_life.name}, +1 ${POTIONS.elixir_mana.name}`, COLORS.gold);
      this.refreshHud(); this.refreshQuest();
    } else if (r.reason === 'network') {
      this.toast('Нет связи — Мирра отдаст зелья, когда связь вернётся. Поговорите с ней ещё раз.', COLORS.danger);
    } else if (r.reason !== 'busy' && r.reason !== 'already') {
      this.toast(actionFailText(r, 'зелья пока не выданы', 'Поговорите с Миррой ещё раз.'), COLORS.danger);
    }
  },
};

/**
 * Текст отказа действия сервера. «Нет связи» — только при настоящей потере связи (reason 'network');
 * ошибка сервера и сбой клиента — отдельный текст, техническая причина — в консоль (и на экран в режиме ?debug).
 */
export function actionFailText(r, what, retry = 'Попробуйте ещё раз.') {
  if (r.reason === 'network') return `Нет связи с сервером — ${what}.`;
  if (r.reason === 'session') return 'Сессия завершилась. Войдите снова.';
  const e = r.error || {};
  console.error('[PlayerActions] действие не выполнено:', r.reason, `rpc=${e.rpc || '?'} status=${e.status ?? '?'} code=${e.code || '?'}${e.detail ? ` detail=${e.detail}` : ''}`);
  const tech = services.debug ? `\n[${e.rpc || '?'} · HTTP ${e.status ?? '?'} · ${e.code || r.reason}${e.detail ? ` · ${e.detail}` : ''}]` : '';
  return `${r.reason === 'error' ? 'Что-то пошло не так' : 'Ошибка сервера'}: ${what}. ${retry}${tech}`;
}

function coinWord(n) {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 14) return 'монет';
  if (b === 1) return 'монету';
  if (b >= 2 && b <= 4) return 'монеты';
  return 'монет';
}
