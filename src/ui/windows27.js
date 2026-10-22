// v0.27.0 — карта мира: нарисованная карта с точками локаций (главы и вылазки). Открыта у выхода (указатель «Карта мира») —
// можно отправиться в открытую локацию; из меню — только посмотреть (отправиться можно лишь у выхода).
import { WORLD_MAP } from '../config/worldMap.js';
import { COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { services } from '../services.js';
import { MSG } from '../state/EventBus.js';
import { addButton } from './widgets.js';
import { LOCATIONS, locationAt, locationById, locationOpen } from '../config/locations.js';

const FONT = UI.font;
const SH = UI.shadow;
const { width: MAP_W, height: MAP_H } = WORLD_MAP;

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
        const k = Math.min(w, 632) / MAP_W;
        const mw = MAP_W * k, mh = MAP_H * k, mx = x + (w - mw) / 2;
        const img = this.add.image(mx, y, 'world_map_01').setOrigin(0).setDisplaySize(mw, mh);
        c.add(img);
        c.add(this.add.rectangle(mx + mw / 2, y + mh / 2, mw, mh, 0, 0).setStrokeStyle(1.5, COLORS.gold, 0.8));
        for (const loc of LOCATIONS.filter(l=>!l.interior)) {
          const open = locationOpen(loc, has);
          const px = mx + loc.map.x * k, py = y + loc.map.y * k;
          const selected = loc.id === sel.id;
          // The medallion and nameplate share one generous touch target.
          const badge = this.add.image(px, py, `map_marker_${loc.id}`)
            .setDisplaySize(94 * k, 94 * k).setName(`map-marker-${loc.id}`);
          if (!open) badge.setTint(0x9d9aaf).setAlpha(0.85);
          else if (selected) badge.preFX?.addGlow?.(0xffdf85, 3, 0, false, 0.15, 16);
          c.add(badge);
          const label = loc.name;
          const probe = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: `${UI.type.small}px` });
          const bw = Math.ceil((probe.width + 30 + (open ? 0 : 24)) / 20) * 20; probe.destroy();   // место для настоящей иконки замка
          const bx = Math.max(mx + bw / 2 + 4, Math.min(mx + mw - bw / 2 - 4, px));   // кнопка не вылезает за края карты
          const b = addButton(this, bx, py + 48 * k, bw, 40, label, {
            primary: selected, radius: 20, accent: open ? COLORS.gold : null, fontSize: UI.type.small,
            onPress: () => { if (this.modal?.scroll?.canTap?.() === false || this.mapSel === loc.id) return; this.mapSel = loc.id; services.audio.play('ui_click'); this.startSwap(true); this.openMap(opts); },
          });
          const hitLeft = Math.min(px - 48 * k, bx - bw / 2);
          const hitRight = Math.max(px + 48 * k, bx + bw / 2);
          b.hit.setPosition((hitLeft + hitRight) / 2, py + 10 * k).setSize(hitRight - hitLeft, 120 * k);
          b.hit.setData('mapLocation', loc.id);
          if (!open) {
            b.text.setAlpha(0.75).setX(bx - 12);
            b.parts.push(this.add.image(b.text.x + b.text.width / 2 + 14, py + 48 * k, 'icon_lock').setDisplaySize(18, 22));
          }
          c.add(b.parts);
          if (loc.id === here.id) {
            const ry = py - 63 * k;
            c.add(this.add.image(px, ry, 'map_current_ribbon').setDisplaySize(130 * k, 42 * k));
            c.add(this.add.text(px, ry - 2, 'вы здесь', {
              fontFamily: FONT, fontSize: UI.type.small, color: '#654315', fontStyle: 'bold',
            }).setOrigin(0.5).setName('map-current-location'));
          }
        }
        let cy = y + mh + 14;
        const text = (str, style = {}) => {
          const t = this.add.text(x, cy, str, { fontFamily: FONT, fontSize: UI.type.small, color: COLORS.text, shadow: SH, wordWrap: { width: w }, lineSpacing: 2, ...style });
          c.add(t); cy += t.height + 8; return t;
        };
        text(`${sel.name} · ${sel.subtitle}`, { fontSize: UI.type.body, fontStyle: 'bold', color: COLORS.textGold });
        text(sel.text);
        if (!locationOpen(sel, has)) text(sel.lockedText || 'Пока закрыто.', { color: '#ffb0a0' });
        else if (sel.id !== here.id && !canGo) text('Отправиться можно у выхода из локации — указатель «Карта мира».', { color: COLORS.textDim });
        return cy - y;
      },
    };
    const go = canGo && sel.id !== here.id && locationOpen(sel, has);
    this.openModal({
      title: 'Карта мира', color: COLORS.gold, text: '', content, worldMap: true,
      buttons: go
        ? [{ label: `Отправиться: ${sel.name}`, primary: true, onClick: () => { this.mapSel = null; this.bus.emit(MSG.MAP_TRAVEL, sel.id); } }, { label: 'Остаться', onClick: () => { this.mapSel = null; } }]
        : [{ label: 'Закрыть', primary: true, onClick: () => { this.mapSel = null; } }],
    });
  },
};
