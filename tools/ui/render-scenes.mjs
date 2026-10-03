// Стенд интерфейса: запускает настоящие UIScene / MenuScene / CombatScene на заглушке Phaser
// и рисует получившиеся объекты в PNG (tools/ui/shots/*.png).
//   CANVAS_PATH=<путь к @napi-rs/canvas> node --import ./tools/ui/register.mjs tools/ui/render-scenes.mjs [имена сцен]
// Шрифт интерфейса здесь заменён на DejaVu Serif (шире Georgia — запас по ширине текста).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.CANVAS_PATH || '@napi-rs/canvas');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/ui/shots');
fs.mkdirSync(OUT, { recursive: true });

const { setupStage, freshWorld, mkHud } = await import('./stage.mjs');
const { Reg } = await setupStage({ createCanvas, loadImage, root: ROOT });
const { services } = await import('../../src/services.js');
const { bus } = await import('../../src/state/EventBus.js');
const { COLORS } = await import('../../src/config/game.config.js');

// ------------------------------------------------------------------ измерение текста
const FONT_FAMILY = 'DejaVu Serif';
const mctx = createCanvas(10, 10).getContext('2d');
const fontOf = (st) => `${st.fontStyle || ''} ${parseInt(st.fontSize || '16', 10)}px "${FONT_FAMILY}"`.trim();
Reg.measure = (o) => {
  const st = o.style || {}, px = parseInt(st.fontSize || '16', 10);
  mctx.font = fontOf(st);
  const wrap = st.wordWrap?.width;
  const lines = [];
  for (const para of String(o.str).split('\n')) {
    if (!wrap) { lines.push(para); continue; }
    let cur = '';
    for (const word of para.split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (mctx.measureText(t).width > wrap && cur) { lines.push(cur); cur = word; } else cur = t;
    }
    lines.push(cur);
  }
  const lh = px * 1.28 + (st.lineSpacing || 0);
  const sw = (st.strokeThickness || 0);
  const w = Math.max(1, ...lines.map(l => mctx.measureText(l).width)) + sw;
  return { w, h: lines.length * lh + sw, lines, lh };
};

// ------------------------------------------------------------------ рендер
const hex = (c, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const tintCache = new Map();
function tinted(img, col, fill) {
  const c = createCanvas(img.width, img.height), g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = fill ? 'source-in' : 'multiply';
  g.fillStyle = hex(col); g.fillRect(0, 0, c.width, c.height);
  if (!fill) { g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0); }
  return c;
}
function rrect(g, x, y, w, h, r) {
  const R = typeof r === 'number' ? { tl: r, tr: r, bl: r, br: r } : { tl: 0, tr: 0, bl: 0, br: 0, ...r };
  g.beginPath(); g.moveTo(x + R.tl, y); g.lineTo(x + w - R.tr, y); g.arcTo(x + w, y, x + w, y + R.tr, R.tr);
  g.lineTo(x + w, y + h - R.br); g.arcTo(x + w, y + h, x + w - R.br, y + h, R.br); g.lineTo(x + R.bl, y + h); g.arcTo(x, y + h, x, y + h - R.bl, R.bl);
  g.lineTo(x, y + R.tl); g.arcTo(x, y, x + R.tl, y, R.tl); g.closePath();
}
function drawObj(g, o, parentAlpha = 1) {
  if (!o.visible || o.destroyed) return;
  const alpha = parentAlpha * o.alpha;
  if (alpha <= 0.002) return;
  g.save();
  g.globalAlpha = alpha;
  if (o.blend === 'ADD' || o.blend === 1) g.globalCompositeOperation = 'lighter';
  g.translate(o.x, o.y);
  if (o.angle) g.rotate((o.angle * Math.PI) / 180);
  switch (o.type) {
    case 'container': {
      g.scale(o.scaleX, o.scaleY);
      for (const c of o.children) drawObj(g, c, alpha);   // как в Phaser: в порядке добавления в контейнер
      break;
    }
    case 'image': {
      let img = Reg.textures.get(o.texKey);
      if (!img) break;
      if (o.tintCol != null) img = tinted(img, o.tintCol, o.tintFill);
      const sx = o.scaleX, sy = o.scaleY, W = o.frameW, H = o.frameH;
      const cr = o.crop || { x: 0, y: 0, w: W, h: H };
      g.drawImage(img, cr.x, cr.y, Math.max(0.01, cr.w), cr.h, -o.originX * W * sx + cr.x * sx, -o.originY * H * sy + cr.y * sy, Math.max(0.01, cr.w) * sx, cr.h * sy);
      break;
    }
    case 'rect': case 'circle': case 'ellipse': {
      const w = o.frameW * o.scaleX, h = o.frameH * o.scaleY, x0 = -o.originX * w, y0 = -o.originY * h;
      const shape = () => { if (o.type === 'rect') { g.beginPath(); g.rect(x0, y0, w, h); } else { g.beginPath(); g.ellipse(x0 + w / 2, y0 + h / 2, w / 2, h / 2, 0, 0, 7); } };
      if (o.fillAlpha > 0) { shape(); g.fillStyle = hex(o.fillCol, o.fillAlpha); g.fill(); }
      if (o.lineW) { shape(); g.lineWidth = o.lineW; g.strokeStyle = hex(o.lineCol, o.lineAlpha); g.stroke(); }
      break;
    }
    case 'text': {
      const m = Reg.measure(o), st = o.style || {};
      g.font = fontOf(st); g.textBaseline = 'top';
      g.scale(o.scaleX, o.scaleY);
      const bx = -o.originX * m.w, by = -o.originY * m.h;
      const col = (st.color || '#fff');
      m.lines.forEach((ln, i) => {
        const lw = g.measureText(ln).width;
        const al = st.align || 'left';
        const x = bx + (al === 'center' ? (m.w - lw) / 2 : al === 'right' ? m.w - lw : 0) + (st.strokeThickness || 0) / 2;
        const y = by + i * m.lh + (st.strokeThickness || 0) / 2;
        if (st.shadow) { g.save(); g.shadowColor = st.shadow.color || '#000'; g.shadowBlur = st.shadow.blur || 0; g.shadowOffsetX = st.shadow.offsetX || 0; g.shadowOffsetY = st.shadow.offsetY || 0; g.fillStyle = col; g.fillText(ln, x, y); g.restore(); }
        if (st.strokeThickness) { g.lineJoin = 'round'; g.lineWidth = st.strokeThickness; g.strokeStyle = st.stroke || '#000'; g.strokeText(ln, x, y); }
        g.fillStyle = col; g.fillText(ln, x, y);
      });
      break;
    }
    case 'graphics': {
      for (const [n, a, fc, fa, lw, lc, la] of o.cmds) {
        g.fillStyle = hex(fc, fa); g.strokeStyle = hex(lc, la); g.lineWidth = lw;
        if (n === 'fillRect') g.fillRect(...a);
        else if (n === 'strokeRect') g.strokeRect(...a);
        else if (n === 'fillRoundedRect') { rrect(g, ...a); g.fill(); }
        else if (n === 'strokeRoundedRect') { rrect(g, ...a); g.stroke(); }
        else if (n === 'fillCircle') { g.beginPath(); g.arc(a[0], a[1], a[2], 0, 7); g.fill(); }
        else if (n === 'strokeCircle') { g.beginPath(); g.arc(a[0], a[1], a[2], 0, 7); g.stroke(); }
        else if (n === 'fillTriangle') { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[2], a[3]); g.lineTo(a[4], a[5]); g.closePath(); g.fill(); }
        else if (n === 'strokeTriangle') { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[2], a[3]); g.lineTo(a[4], a[5]); g.closePath(); g.stroke(); }
        else if (n === 'lineBetween') { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[2], a[3]); g.stroke(); }
        else if (n === 'fillEllipse') { g.beginPath(); g.ellipse(a[0], a[1], a[2] / 2, a[3] / 2, 0, 0, 7); g.fill(); }
      }
      break;
    }
    default: break;
  }
  g.restore();
}
const sortList = (l) => [...l].sort((a, b) => (a.depth - b.depth) || (a._order - b._order));
export function renderScenes(scenes, bg) {
  const c = createCanvas(720, 1280), g = c.getContext('2d');
  if (bg) bg(g);
  for (const s of scenes) for (const o of sortList(s._list)) drawObj(g, o);
  return c;
}
async function forestBackdrop(g, dark = 1) {
  const gr = g.createLinearGradient(0, 0, 0, 1280); gr.addColorStop(0, '#2c4126'); gr.addColorStop(1, '#1b2c1c');
  g.fillStyle = gr; g.fillRect(0, 0, 720, 1280);
  const g2 = g.createRadialGradient(360, 760, 40, 360, 760, 520); g2.addColorStop(0, 'rgba(255,200,120,0.16)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = g2; g.fillRect(0, 0, 720, 1280);
  const put = (k, x, y, w, h) => { const im = Reg.textures.get(k); if (im) g.drawImage(im, x - w / 2, y - h, w, h); };
  put('tree_dark_01', 70, 620, 150, 220); put('tree_autumn_01', 640, 700, 150, 210); put('tree_dark_02', 90, 980, 140, 210); put('tree_autumn_02', 650, 940, 140, 200);
  put('heavy_boulder_01', 300, 860, 210, 150); put('rock_medium_01', 480, 760, 100, 77); put('bush_01', 200, 760, 80, 68); put('mushroom_red_01', 540, 880, 52, 39);
  put('hero_down', 360, 1000, 64, 128);
  if (dark < 1) { g.fillStyle = `rgba(0,0,0,${1 - dark})`; g.fillRect(0, 0, 720, 1280); }
}
const save = (name, canvas) => { fs.writeFileSync(path.join(OUT, name + '.png'), canvas.toBuffer('image/png')); console.log('  shot', name); };

const want = new Set(process.argv.slice(2));
const on = (n) => !want.size || want.has(n);
let failures = 0;
console.info = () => {};   // [event] из QuestFlags
const guard = async (name, fn) => { try { await fn(); } catch (e) { failures++; console.log(`  ✗ ${name}: ${e.stack?.split('\n').slice(0, 4).join('\n')}`); } };

// ---- 1. HUD исследования
if (on('hud')) await guard('hud', async () => {
  await freshWorld('mid');
  const { UIScene } = await import('../../src/scenes/UIScene.js');
  const ui = new UIScene(); ui.create(); mkHud(ui);
  ui.zoneName = 'Стартовая поляна'; ui.refreshQuest(); ui.refreshHud();
  ui.onFocus({ icon: 'icon_hand', color: COLORS.telekinesis, label: 'Сдвинуть камень', ability: 'telekinesis' });
  ui.toast('+1 Лунный осколок', COLORS.gold); ui.toast('Не хватает маны', COLORS.fire);
  ui.update(5000, 16); ui.update(5016, 16);
  ui.onTutorial({ id: 'telekinesis', text: 'Нажмите Телекинез, чтобы подвинуть камень', target: 'telekinesis' });
  save('hud', renderScenes([ui], (g) => forestBackdrop(g)));
  // варианты: низкое здоровье, полоса 0
  mkHud(ui, { hp: 0, mana: 100 }); ui.update(5032, 16);
  if (ui.hpBar.fill.visible) throw new Error('hp=0: заливка должна быть скрыта');
});

// ---- 2. Окна
if (on('modals')) await guard('modals', async () => {
  await freshWorld('mid');
  const { UIScene } = await import('../../src/scenes/UIScene.js');
  const texBefore = Reg.textures.size;
  const mk = () => { const ui = new UIScene(); ui.create(); mkHud(ui); return ui; };
  let ui = mk(); ui.openPause();           save('modal_pause', renderScenes([ui], (g) => forestBackdrop(g, 0.8)));
  ui.closeModal(null); ui.openBag();       save('modal_bag', renderScenes([ui], (g) => forestBackdrop(g, 0.8)));
  ui.closeModal(null); ui.openUpgrade('telekinesis_2'); save('modal_upgrade', renderScenes([ui], (g) => forestBackdrop(g, 0.8)));
  ui.closeModal(null); ui.openSettings(); save('modal_settings', renderScenes([ui], (g) => forestBackdrop(g, 0.8)));
  ui.closeModal(null); ui.confirmReset();  save('modal_reset', renderScenes([ui], (g) => forestBackdrop(g, 0.8)));
  ui.closeModal(null); ui.openFinal();     save('modal_final', renderScenes([ui], (g) => forestBackdrop(g, 0.8)));
  ui.closeModal(null);
  // временные текстуры окон освобождены
  const leaked = [...Reg.textures.keys()].filter(k => k.startsWith('ui:panel:') && /:(640x|600x)/.test(k) && !k.includes(':600x640'));
  if (leaked.length) throw new Error('утечка текстур окон: ' + leaked.join(', '));
});

// ---- 3. Меню
if (on('menu')) await guard('menu', async () => {
  await freshWorld('mid');
  const { MenuScene } = await import('../../src/scenes/MenuScene.js');
  const m = new MenuScene(); m.create();
  save('menu', renderScenes([m]));
  m.confirmNew(); save('menu_confirm', renderScenes([m]));
});

// ---- 3б. Онлайн: стартовый экран без входа, выбор героя, «Как продолжить?», меню гостя и игрока (фальшивый сервер)
if (on('account')) await guard('account', async () => {
  await freshWorld('new');
  const { PlayerSession } = await import('../../src/cloud/PlayerSession.js');
  const { SupabaseApi } = await import('../../src/cloud/api.js');
  const { FakeSupabase } = await import('../../tests/helpers/fake-supabase.mjs');
  const { services } = await import('../../src/services.js');
  const { MenuScene } = await import('../../src/scenes/MenuScene.js');
  const { UIScene } = await import('../../src/scenes/UIScene.js');
  const srv = new FakeSupabase();
  const api = new SupabaseApi({ url: srv.url, anonKey: srv.anonKey, loginDomain: 'players.witch-rpg.invalid', fetchFn: srv.fetch });
  const m0 = new Map(); const store = { getItem: k => m0.get(k) ?? null, setItem: (k, v) => m0.set(k, String(v)), removeItem: k => m0.delete(k) };
  services.state.storage = null;
  const ses = new PlayerSession({ api, state: services.state, storage: store, setTimer: () => 0, clearTimer: () => {} });
  services.session = ses;
  const m1 = new MenuScene(); m1.create(); save('menu_online_start', renderScenes([m1]));
  m1.picker.select('warlock', true); save('menu_online_warlock', renderScenes([m1]));
  m1.startNew(); save('hero_choice', renderScenes([m1]));
  await ses.playAsGuest('witch');
  const mg = new MenuScene(); mg.create(); save('menu_guest', renderScenes([mg]));
  await ses.registerGuest({ nickname: 'Дмитрий', password: 'password-1', password2: 'password-1' });
  services.state.data.heroLevel = 3; services.state.data.completedEvents = ['a', 'b', 'c'];
  const ms = new MenuScene(); ms.create(); save('menu_signed', renderScenes([ms]));
  const ui = new UIScene(); ui.create(); mkHud(ui); ui.zoneName = 'Стартовая поляна'; ui.refreshQuest(); ui.refreshHud(); ui.update(5000, 16);
  ui.openPause();
  save('hud_signed_pause', renderScenes([ui], (g) => forestBackdrop(g)));
  services.session = null;
});

// ---- 4. Бой
if (on('combat')) await guard('combat', async () => {
  await freshWorld('mid');
  const { CombatScene } = await import('../../src/scenes/CombatScene.js');
  const { UIScene } = await import('../../src/scenes/UIScene.js');
  const cs = new CombatScene(); cs.init({ spawnId: 'forest_guardian_01', enemyType: 'forest_guardian' }); cs.create();
  const ui = new UIScene(); ui.create(); ui.setMode('combat'); ui.refreshQuest();
  ui.registry.get; // hudProvider ставит боевая сцена в свой реестр: переносим
  ui.registry.set('hudProvider', cs.registry.get('hudProvider')); ui.registry.set('abilityProvider', cs.registry.get('abilityProvider'));
  cs.started = true;
  cs.updateHud();
  cs.warn.setVisible(true); cs.warnTitle.setText('⚠ Тяжёлый удар!'); cs.warnHint.setText('Выберите тяжёлый камень и нажмите Телекинез'); cs.warnBar.width = 300;
  ui.update(5000, 16);
  save('combat', renderScenes([cs, ui]));
});

console.log(failures ? `✗ падений: ${failures}` : '✓ стенд отработал без падений');
const unknown = [...Reg.unknownCalls.entries()].sort((a, b) => b[1] - a[1]);
if (unknown.length) console.log('Вызовы, которых нет в заглушке (проверьте по документации Phaser):\n' + unknown.map(([k, n]) => `  ${k} ×${n}`).join('\n'));
if (Reg.missingTextures.size) console.log('Нет текстур:', [...Reg.missingTextures].join(', '));
process.exit(failures ? 1 : 0);
