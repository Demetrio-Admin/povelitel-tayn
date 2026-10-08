// v0.26.0 — окно Магической Дуэли: сезон, рейтинг и лига, победы и поражения, попытки дня, таблица сезона (онлайн) и «Вызов».
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { services } from '../services.js';
import { MSG } from '../state/EventBus.js';
import { DUEL, LEAGUES, leagueOf, seasonEndMs, seasonSapphires, promoSapphires } from '../config/duel.js';
import { sapphires as sapphireText } from '../systems/wallet.js';
import { duelStateOf } from '../cloud/playerModel.js';

const FONT = UI.font;
const SH = UI.shadow;

export const windows26 = {
  openDuel() {
    if (this.mode === 'combat') return;
    if (this.modal) this.closeModal(null);
    const st = services.state;
    if (!st.hasEvent(DUEL.requires)) { this.toast('Магическая Дуэль откроется после главы II.'); return; }
    services.audio.play('journal');
    const now = st.now();
    const d = duelStateOf({ objects: { duel: st.getObject('duel') } }, now);
    const left = Math.max(0, DUEL.attemptsPerDay - d.used);
    const lg = leagueOf(d.rating), next = LEAGUES[LEAGUES.indexOf(lg) + 1];
    const ends = new Date(seasonEndMs(d.season));
    if (!this.duelBoard && services.session?.signedIn && !this.duelBoardLoading) this.loadDuelBoard();
    this.claimDuelSeason();   // v0.34.0: сапфиры за прошлый сезон забираются при открытии окна
    const battles = d.wins + d.losses, need = DUEL.sapphires.minBattles;
    const prevBattles = d.prev ? d.prev.wins + d.prev.losses : 0;
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        let cy = y;
        const text = (str, style = {}) => {
          const t = this.add.text(x, cy, str, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH, wordWrap: { width: w }, lineSpacing: 2, ...style });
          c.add(t); cy += t.height + 8; return t;
        };
        text(`Сезон ${d.season} · до ${ends.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`, { color: COLORS.textDim });
        text(`Рейтинг: ${d.rating} · ${lg.name}${next ? ` (до лиги «${next.name}» — ${next.from - d.rating})` : ''}`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
        text(`Победы: ${d.wins} · поражения: ${d.losses} · лучший рейтинг сезона: ${d.best}`);
        text(`Попыток сегодня: ${left} из ${DUEL.attemptsPerDay}. Награда: победа — ${DUEL.reward.victory.coins} монет и ${DUEL.reward.victory.heroXP} опыта, поражение — ${DUEL.reward.defeat.coins} монет.`);
        text('Соперник — слепок другого героя под управлением ИИ: его уровень, дары, ветки и амулеты. К дарам, которых нет в его слотах, он уязвим. '
          + 'Здоровье после Дуэли не теряется; выпитые зелья — тратятся.', { color: COLORS.textDim });
        // v0.34.0: сапфиры арены
        text('Награды арены', { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
        text(`Итог сезона — по лиге в его конце, если в сезоне не меньше ${need} боёв: ${LEAGUES.map((l) => `${l.name} ${seasonSapphires(l.id)}`).join(' · ')}.`);
        text(battles >= need
          ? `Сейчас: «${lg.name}» — ${sapphireText(seasonSapphires(lg.id))} (боёв в сезоне: ${battles}).`
          : `Сейчас: боёв в сезоне ${battles} из ${need} — до награды сезона ещё ${need - battles}.`, { color: COLORS.textGold });
        text(`Лучшим игрокам сезона (итоговая таблица, те же ${need} боёв): ${DUEL.sapphires.top.map((n, i) => `${i + 1}-е место ${n}`).join(' · ')}. Забрать нужно в следующем сезоне — откройте это окно или вызовите соперника.`, { color: COLORS.textDim });
        text(`Первая лига (один раз за всё время): ${LEAGUES.slice(1).map((l) => `${l.name} +${promoSapphires(l.id)}`).join(' · ')}.`, { color: COLORS.textDim });
        if (d.prev) {
          const pl = leagueOf(d.prev.rating);
          text(prevBattles >= need ? `Прошлый сезон ${d.prev.season}: «${pl.name}» — ${sapphireText(seasonSapphires(pl.id))}.` : `Прошлый сезон ${d.prev.season}: боёв ${prevBattles} из ${need} — без награды.`, { color: COLORS.textDim });
        }
        const b = this.duelBoard;
        if (b?.top?.length) {
          text('Таблица сезона', { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
          for (const r of b.top.slice(0, 10)) text(`${r.rank}. ${r.nickname} — ${r.rating} (${leagueOf(r.rating).name}) · ${r.wins}/${r.losses}${r.me ? '  ← вы' : ''}`, { color: r.me ? COLORS.textGold : COLORS.text });
          if (b.me && b.me.rank > 10) text(`Ваше место: ${b.me.rank}`, { color: COLORS.textGold });
        } else if (services.session?.signedIn) text(this.duelBoardLoading ? 'Таблица сезона загружается…' : 'В таблице сезона пока никого — станьте первыми!', { color: COLORS.textDim });
        else text('Таблица сезона — в онлайн-аккаунте.', { color: COLORS.textDim });
        return cy - y;
      },
    };
    this.openModal({
      title: 'Магическая Дуэль', color: COLORS.gold, text: '', content,
      buttons: [
        { label: left > 0 ? `Вызов (${left})` : 'Попытки закончились', primary: left > 0, onClick: () => { if (left > 0) this.bus.emit(MSG.DUEL_START); } },
        { label: 'Дары', onClick: () => this.bus.emit(MSG.OPEN_GIFTS) },
        { label: 'Закрыть' },
      ],
    });
  },

  /** v0.34.0: забрать сапфиры за прошлый сезон арены (раз в минуту при открытии окна; повтор на сервере ничего не начисляет). */
  async claimDuelSeason() {
    if (!services.session?.signedIn || this.duelSeasonBusy) return;
    this.duelSeasonBusy = true;
    setTimeout(() => { this.duelSeasonBusy = false; }, 60_000);
    let r = null;
    try { r = await services.actions.duelSeason(); } catch { r = null; }
    const rw = r?.ok ? r.reward : null;
    if (rw?.fresh && rw.paid > 0) {
      this.toast(`Награда сезона ${rw.season}: +${sapphireText(rw.paid)}${rw.top > 0 ? ` (${rw.rank}-е место в таблице!)` : ''}`, 0x6fa8ff);
      this.refreshHud?.();
    }
  },

  async loadDuelBoard() {
    const ses = services.session;
    this.duelBoardLoading = true;
    try { this.duelBoard = await ses._authed((t) => ses.api.rpc('duel_board', {}, t)); } catch { this.duelBoard = null; }
    this.duelBoardLoading = false;
    setTimeout(() => { this.duelBoard = null; }, 60_000);   // через минуту — свежая таблица при следующем открытии
    if (this.modal?.opts?.title === 'Магическая Дуэль') this.reopenModal?.();
  },
};
