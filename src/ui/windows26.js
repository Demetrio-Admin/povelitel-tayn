// v0.26.0 — окно Магической Дуэли: сезон, рейтинг и лига, победы и поражения, попытки дня, таблица сезона (онлайн) и «Вызов».
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { services } from '../services.js';
import { MSG } from '../state/EventBus.js';
import { DUEL, LEAGUES, leagueOf, seasonEndMs } from '../config/duel.js';
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

  async loadDuelBoard() {
    const ses = services.session;
    this.duelBoardLoading = true;
    try { this.duelBoard = await ses._authed((t) => ses.api.rpc('duel_board', {}, t)); } catch { this.duelBoard = null; }
    this.duelBoardLoading = false;
    setTimeout(() => { this.duelBoard = null; }, 60_000);   // через минуту — свежая таблица при следующем открытии
    if (this.modal?.opts?.title === 'Магическая Дуэль') this.reopenModal?.();
  },
};
