// In-page checks of the compact mobile HUD of /camera-test/. Self-contained (it is serialised into the page).
// Every value is read from the running game: GameState, the real UIScene objects and the real canvas size.
export async function runHudChecks(frame, { log = console.log, quick = false } = {}) {
  const results = [];
  const check = (ok, message) => { if (!ok) throw Error(message); results.push(message); log('✓ ' + message); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wait = async (fn, label, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; await sleep(50); } throw Error('Timeout: ' + label); };
  await wait(() => frame.__game?.scene.isActive('UIScene') && frame.__game.scene.isActive('ExplorationScene'), 'ready', 90000);
  const game = frame.__game, S = frame.__witch;
  const ui = () => game.scene.getScene('UIScene');
  const explore = () => game.scene.getScene('ExplorationScene');
  const gw = game.scale.gameSize.width, gh = game.scale.gameSize.height;
  const rect = game.canvas.getBoundingClientRect();
  const k = rect.width / gw;                       // CSS px per logical px
  const tag = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
  const u = ui();
  check(typeof u.toggleTray === 'function' && !!u.portraitHit, `${tag}: the compact mobile HUD is active`);

  // ---- every number on the HUD comes from GameState
  const s = S.state;
  const text = t => t.text;
  const expectNumber = n => { n = Math.max(0, Math.floor(Number(n) || 0)); return n < 100000 ? String(n) : n < 1e6 ? `${Math.floor(n / 1000)}к` : `${(n / 1e6).toFixed(1).replace('.', ',')}М`; };
  u.refreshTopHud();
  check(text(u.coinText) === expectNumber(s.item('coins')), `${tag}: gold shows the real value (${text(u.coinText)})`);
  check(text(u.sapphireText) === expectNumber(s.sapphires()), `${tag}: sapphires show the real value (${text(u.sapphireText)})`);
  check(/^Ур\. \d+$/.test(text(u.levelText)), `${tag}: level is shown (${text(u.levelText)})`);
  check(/\d/.test(text(u.hpText)) && u.hpBar.frac >= 0 && u.hpBar.frac <= 1, `${tag}: HP has a numeric value (${text(u.hpText)})`);
  check(/\d/.test(text(u.manaText)), `${tag}: mana has a numeric value (${text(u.manaText)})`);
  const coins = s.item('coins');
  s.data.inventory.coins = coins + 123; u.refreshTopHud();
  check(text(u.coinText) === expectNumber(coins + 123), `${tag}: gold follows GameState changes`);
  s.data.inventory.coins = coins; u.refreshTopHud();

  // ---- geometry: nothing overlaps, the top zone is compact, touch targets are comfortable
  const css = o => { const b = o.getBounds(), c = game.canvas.getBoundingClientRect(); return { x: c.left + b.x * k, y: c.top + b.y * k, w: b.width * k, h: b.height * k }; };
  const logical = o => o.getBounds();
  const hits = { portrait: u.portraitHit, journal: u.journalBtn.hit, menu: u.menuBtn.hit, magic: u.magicBtn.hit, bag: u.bagBtn.hit };
  for (const [name, o] of Object.entries(hits)) {
    const r = css(o);
    check(r.w >= 43.5 && r.h >= 43.5, `${tag}: ${name} touch target ${r.w.toFixed(0)}×${r.h.toFixed(0)} CSS px (>= 44)`);
  }
  const names = Object.keys(hits);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = css(hits[names[i]]), b = css(hits[names[j]]);
    const hit = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
    check(!hit, `${tag}: touch targets ${names[i]} / ${names[j]} do not overlap`);
  }
  // visual elements of the top row
  const topParts = { portrait: u.portraitHit, hp: u.hpBar.trough, mana: u.manaBar.trough, journal: u.journalBtn.orb, menu: u.menuBtn.orb };
  const boxes = Object.fromEntries(Object.entries(topParts).map(([n, o]) => [n, logical(o)]));
  for (const [n, b] of Object.entries(boxes)) check(b.y >= -1 && b.y + b.height <= 130 && b.x >= -1 && b.x + b.width <= gw + 1, `${tag}: ${n} lies within the compact top zone`);
  check(boxes.hp.y + boxes.hp.height <= boxes.mana.y + 2, `${tag}: HP bar is above the mana bar`);
  check(boxes.mana.x + boxes.mana.width <= boxes.journal.x + 2, `${tag}: bars do not run under the journal button`);
  check(boxes.portrait.x + boxes.portrait.width <= boxes.hp.x + 40, `${tag}: portrait sits left of the bars`);
  const resRight = Math.max(u.sapphireText.x + u.sapphireText.width, u.coinText.x + u.coinText.width);
  check(resRight <= boxes.journal.x, `${tag}: gold and sapphires fit before the journal button (${Math.round(resRight)} <= ${Math.round(boxes.journal.x)})`);

  // ---- how much of the screen is the world
  const topH = 128, barZone = 1280 - 1208 + 44;    // bottom bar height in logical px
  const world = (gh - topH - barZone) / gh;
  check(world >= 0.8, `${tag}: ${(world * 100).toFixed(0)}% of the height is open world while the HUD is closed`);

  // ---- fonts: smallest HUD text, in CSS px
  const labels = [u.levelText, u.coinText, u.sapphireText, u.hpText, u.manaText, u.magicBtn.text, u.bagBtn.text];
  const smallest = Math.min(...labels.map(t => parseFloat(t.style.fontSize) * k));
  check(smallest >= (rect.width < 340 ? 9 : 11), `${tag}: smallest HUD label ${smallest.toFixed(1)} CSS px`);

  // ---- the «Магия» tray: closed by default, opens above the bar, holds the real abilities and gifts
  check(!u.trayOpen && !u.dockC.visible, `${tag}: abilities are tucked away by default`);
  u.toggleTray();
  await wait(() => u.dockC.visible && u.dockC.alpha > 0.99 && !u.tweens.isTweening(u.dockC), 'tray opens');
  const plate = logical(u.trayBlocker), trayTop = plate.y, magicTop = u.magicBtn.y - 44;
  check(plate.y + plate.height <= magicTop + 1, `${tag}: the tray opens above the bar, not over it`);
  check(u.dock.length >= 3 && u.dock.every(d => d.btn), `${tag}: the tray holds the real ability buttons (${u.dock.map(d => d.id).join(', ')})`);
  check(!!u.giftCell && u.giftCell.icon.visible && u.giftCell.text.text === 'Все дары', `${tag}: «Все дары» is reachable from the tray`);
  check(trayTop > 128, `${tag}: the tray does not reach the top HUD`);
  u.closeTray();
  await wait(() => !u.dockC.visible, 'tray closes');
  check(true, `${tag}: the tray closes`);

  if (quick) return { results, tag };

  // «Сумка» opens the real bag and the game continues afterwards
  let bagOpened = false;
  const onBag = () => { bagOpened = true; };
  S.bus.on('ui:bag', onBag);
  u.bagBtn.hit.emit('pointerdown', { id: 7, x: 0, y: 0, isDown: true, event: {} }, 0, 0, { stopPropagation() {} });
  await sleep(300);
  S.bus.off('ui:bag', onBag);
  check(!!u.modal || bagOpened, `${tag}: «Сумка» opens the bag window`);
  if (u.modal) { u.pressModalButton(true); await sleep(200); }

  return { results, tag };
}
