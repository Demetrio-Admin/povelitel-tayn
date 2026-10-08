// v0.29.0 — окно «Рейтинг»: четыре вкладки — уровень героя, лучшая победа над монстром, арена (лига Магической Дуэли) и «Онлайн»
// (кто сейчас в игре). Таблицы приходят с сервера одним запросом (ratings_board), онлайн — отдельным (online_players);
// ответы запоминаются на RATINGS.cacheSec секунд, «Обновить» просит свежие. Без сервера показываем только строку самого игрока.
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { services } from '../services.js';
import { addButton } from './widgets.js';
import { RATINGS, TABS, bestKillOf, monsterName, monsterLevel } from '../config/ratings.js';
import { leagueOf, DUEL, LEAGUES } from '../config/duel.js';
import { duelStateOf } from '../cloud/playerModel.js';
import { heroById } from '../config/heroes.js';
import { xpProgress } from '../state/heroProgress.js';

const FONT = UI.font;
const SH = UI.shadow;

export const windows28 = {
  /** tab — вкладка ('level' | 'monster' | 'arena' | 'online'); без неё — та, что была открыта в прошлый раз. */
  openRating(tab) {
    if (this.mode === 'combat') { this.toast('Рейтинг — после боя.'); return; }
    if (this.modal) this.closeModal(null);
    if (tab && TABS.some(t => t.id === tab)) this.ratingTab = tab;
    if (!this.ratingTab) this.ratingTab = 'level';
    tab = this.ratingTab;
    services.audio.play('journal');
    const ses = services.session;
    const online = !!ses?.signedIn;
    const src = tab === 'online' ? 'online' : 'board';
    if (online) this.ratingLoad(src);
    const st = services.state;
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        let cy = y;
        const text = (str, style = {}) => {
          const t = this.add.text(x, cy, str, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH, wordWrap: { width: w }, lineSpacing: 2, ...style });
          c.add(t); cy += t.height + 8; return t;
        };
        // --- вкладки
        const gap = 8, bw = (w - gap * (TABS.length - 1)) / TABS.length;
        TABS.forEach((t, i) => {
          const b = addButton(this, x + bw / 2 + i * (bw + gap), cy + 22, bw, 44, t.label, {
            primary: t.id === tab, accent: COLORS.gold, fontSize: UI.type.small,
            onPress: () => { if (this.modal?.scroll?.canTap?.() === false) return; services.audio.play('ui_click'); this.openRating(t.id); },
          });
          c.add(b.parts);
        });
        cy += 44 + 16;
        if (!online) {
          text('Рейтинг игроков и список «Онлайн» — в онлайн-аккаунте. Здесь только ваши результаты.', { color: COLORS.textDim });
          this.ratingOwnRows(text);
          return cy - y;
        }
        const cache = this.ratingCache?.[src];   // читается при каждой отрисовке: после ответа сервера окно перерисовывается
        const data = cache?.data;
        if (!data) {
          text(cache?.error ? 'Не удалось загрузить. Нажмите «Обновить».' : 'Загрузка…', { color: COLORS.textDim });
          return cy - y;
        }
        if (tab === 'online') this.ratingOnlineRows(text, data);
        else this.ratingBoardRows(text, data[tab], tab);
        return cy - y;
      },
    };
    const buttons = [
      { label: 'Обновить', onClick: () => { if (this.ratingCache) delete this.ratingCache[src]; this.openRating(tab); } },
    ];
    if (tab === 'arena' && st.hasEvent(DUEL.requires)) buttons.push({ label: 'Дуэль', onClick: () => this.openDuel() });
    buttons.push({ label: 'Закрыть', primary: true, cancel: true });
    this.openModal({ title: 'Рейтинг', color: COLORS.gold, text: '', content, buttons, rating: tab });
  },

  /** Запрос таблицы с сервера, если ответа нет или он старше RATINGS.cacheSec; после ответа окно перерисовывается. */
  ratingLoad(src) {
    const ses = services.session;
    this.ratingCache = this.ratingCache || {};
    const cur = this.ratingCache[src];
    if (cur?.loading) return;
    if (cur?.data && Date.now() - cur.at < RATINGS.cacheSec * 1000) return;
    this.ratingCache[src] = { ...cur, loading: true };
    const call = src === 'online' ? (t) => ses.api.onlinePlayers(t) : (t) => ses.api.ratingsBoard(t);
    ses._authed(call).then(
      (data) => { this.ratingCache[src] = { data, at: Date.now() }; },
      () => { this.ratingCache[src] = { ...this.ratingCache[src], loading: false, error: true, data: this.ratingCache[src]?.data || null }; },
    ).then(() => {
      if (this.modal?.opts?.rating && (this.modal.opts.rating === 'online') === (src === 'online')) this.reopenModal();
    });
  },

  /** Строки самого игрока (без сервера): уровень, лучшая победа, рейтинг арены. */
  ratingOwnRows(text) {
    const st = services.state, xp = xpProgress(st);
    text(`Уровень героя: ${xp.level}`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
    const best = bestKillOf(st.data.defeatedEnemies || []);
    text(best ? `Лучшая победа: ${monsterName(best.enemy)} (уровень ${best.level})` : 'Лучшая победа: пока нет');
    if (st.hasEvent(DUEL.requires)) {
      const d = duelStateOf({ objects: { duel: st.getObject('duel') } }, st.now());
      text(`Арена: ${d.rating} · ${leagueOf(d.rating).name}`);
    }
  },

  ratingRow(text, r, line, extra = {}) {
    return text(line, { color: r.me ? COLORS.textGold : COLORS.text, fontStyle: r.me ? 'bold' : 'normal', ...extra });
  },

  ratingBoardRows(text, b, tab) {
    const mine = b?.me;
    const st = services.state;
    if (tab === 'arena') {
      if (b?.endsAt) text(`Сезон ${b.season} · до ${new Date(b.endsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`, { color: COLORS.textDim });
      if (mine) {
        const lg = leagueOf(mine.rating), next = LEAGUES[LEAGUES.indexOf(lg) + 1];
        text(`Ваше место: ${mine.rank} · ${mine.rating} · ${lg.name}${next ? ` (до лиги «${next.name}» — ${next.from - mine.rating})` : ''}`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
      } else if (st.hasEvent(DUEL.requires)) text('Вас в таблице нет: проведите хотя бы один бой на арене в этом сезоне.', { color: COLORS.textDim });
      else text('Арена откроется после главы II.', { color: COLORS.textDim });
    } else if (mine) {
      const own = tab === 'level' ? `Уровень ${mine.level}` : `${monsterName(mine.enemy)}, уровень ${mine.level}`;
      text(`Ваше место: ${mine.rank} · ${own}`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
    } else if (!services.session?.registered) text('Выберите ник в аккаунте — и вы появитесь в таблице.', { color: COLORS.textDim });
    else text(tab === 'monster' ? 'Победите монстра — и вы появитесь в таблице.' : 'Вас пока нет в таблице.', { color: COLORS.textDim });
    const top = b?.top || [];
    if (!top.length) { text('В таблице пока никого — станьте первыми!', { color: COLORS.textDim }); return; }
    for (const r of top) {
      const who = `${r.rank}. ${r.nickname}`;
      if (tab === 'level') this.ratingRow(text, r, `${who} — уровень ${r.level}`);
      else if (tab === 'monster') this.ratingRow(text, r, `${who} — ${monsterName(r.enemy)} (ур. ${r.level || monsterLevel(r.enemy)})`);
      else this.ratingRow(text, r, `${who} — ${r.rating} · ${leagueOf(r.rating).name} · ${r.wins}/${r.losses}`);
    }
  },

  ratingOnlineRows(text, o) {
    const n = o?.count || 0;
    text(`Сейчас в игре: ${n}${o?.guests ? ` (из них без ника: ${o.guests})` : ''}`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
    const list = o?.players || [];
    if (!list.length) { text('Игроков с ником онлайн пока нет.', { color: COLORS.textDim }); return; }
    for (const p of list) {
      const hero = p.hero ? heroById(p.hero).name : '';
      this.ratingRow(text, p, `${p.nickname}${p.me ? ' (вы)' : ''} — ${hero ? hero + ', ' : ''}уровень ${p.level ?? 1}${p.fighting ? ' · в бою' : ''}`);
    }
  },
};
