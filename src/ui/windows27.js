// v0.27.0 — карта мира: нарисованная карта с точками локаций (главы и вылазки). Открыта у выхода (указатель «Карта мира») —
// можно отправиться в открытую локацию; из меню — только посмотреть (отправиться можно лишь у выхода).
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { services } from '../services.js';
import { MSG } from '../state/EventBus.js';
import { addButton } from './widgets.js';
import { LOCATIONS, locationAt, locationById, locationOpen } from '../config/locations.js';

const FONT = UI.font;
const SH = UI.shadow;
const MAP_W = 584, MAP_H = 760;

export const windows27 = {
  /** opts.exit — id выхода, у которого открыта карта (тогда можно отправиться); без него — только посмотреть. */
  openMap(opts = {}) {
    if (this.mode === 'combat') { this.toast('Карта мира — после боя.'); return; }
    if (this.modal) this.closeModal(null);
    const st = services.state;
    const p = st.data.player || { x: 0, y: 0 };
    const at = locationAt(p.x,p.y);
    const here = at.parent ? locationById(at.parent) : at;
    const canGo = !!opts.exit;
    const has = (k) => st.hasEvent(k);
    if (!this.mapSel || !locationById(this.mapSel) || locationById(this.mapSel).interior) this.mapSel = here.id;
    const sel = locationById(this.mapSel);
    services.audio.play('journal');
    const content = {
      height: 0,
      build: (c, x, y, w) => {
        const k = Math.min(1, w / MAP_W);
        const mw = MAP_W * k, mh = MAP_H * k, mx = x + (w - mw) / 2;
        const img = this.add.image(mx, y, 'world_map_01').setOrigin(0).setDisplaySize(mw, mh);
        c.add(img);
        for (const loc of LOCATIONS.filter(l=>!l.interior)) {
          const open = locationOpen(loc, has);
          const px = mx + loc.map.x * k, py = y + loc.map.y * k;
          const ring = this.add.circle(px, py, loc.id === here.id ? 17 : 13, open ? (loc.id === here.id ? 0xffe08a : 0xc9a24a) : 0x8a8478)
            .setStrokeStyle(3, loc.id === sel.id ? 0xffffff : 0x3a2a1a);
          c.add(ring);
          if (loc.id === here.id) {
            const yh = this.add.text(px, py - 36, 'вы здесь', { fontFamily: FONT, fontSize: UI.type.small, color: '#5a3a14', fontStyle: 'bold', stroke: '#f3e6c4', strokeThickness: 5 }).setOrigin(0.5);
            c.add(yh);
          }
          const label = loc.name;
          const probe = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: `${UI.type.small}px` });
          const bw = Math.ceil((probe.width + 44 + (open ? 0 : 24)) / 20) * 20; probe.destroy();   // место для настоящей иконки замка
          const bx = Math.max(mx + bw / 2 + 4, Math.min(mx + mw - bw / 2 - 4, px));   // кнопка не вылезает за края карты
          const b = addButton(this, bx, py + 34, bw, 40, label, {
            primary: loc.id === sel.id, accent: open ? COLORS.gold : null, fontSize: UI.type.small,
            onPress: () => { if (this.modal?.scroll?.canTap?.() === false) return; this.mapSel = loc.id; services.audio.play('ui_click'); this.closeModal(null); this.openMap(opts); },
          });
          if (!open) {
            b.text.setAlpha(0.75).setX(bx - 12);
            b.parts.push(this.add.image(b.text.x + b.text.width / 2 + 14, py + 34, 'icon_lock').setDisplaySize(18, 22));
          }
          c.add(b.parts);
        }
        let cy = y + mh + 14;
        const text = (str, style = {}) => {
          const t = this.add.text(x, cy, str, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH, wordWrap: { width: w }, lineSpacing: 2, ...style });
          c.add(t); cy += t.height + 8; return t;
        };
        text(`${sel.name} · ${sel.subtitle}`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
        text(sel.text);
        if (!locationOpen(sel, has)) text(sel.lockedText || 'Пока закрыто.', { color: '#ffb0a0' });
        else if (sel.id === here.id) text('Вы здесь.', { color: COLORS.textDim });
        else if (!canGo) text('Отправиться можно у выхода из локации — указатель «Карта мира».', { color: COLORS.textDim });
        return cy - y;
      },
    };
    const go = canGo && sel.id !== here.id && locationOpen(sel, has);
    this.openModal({
      title: 'Карта мира', color: COLORS.gold, text: '', content,
      buttons: go
        ? [{ label: `Отправиться: ${sel.name}`, primary: true, onClick: () => { this.mapSel = null; this.bus.emit(MSG.MAP_TRAVEL, sel.id); } }, { label: 'Остаться', onClick: () => { this.mapSel = null; } }]
        : [{ label: 'Закрыть', primary: true, onClick: () => { this.mapSel = null; } }],
    });
  },
};
