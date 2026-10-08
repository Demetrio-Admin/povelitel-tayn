// Real Phaser + touch input, not the UI stub. Screenshots stay outside the repository.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { playRealCombat } from '../helpers/e2e-combat.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.UI_SHOTS_DIR || '/tmp/witch-rpg-mobile-ui';
await fs.mkdir(out, { recursive: true });
// UI_BASE_URL — уже запущенная сборка (например, статическая папка после сборки без vite); иначе — dev-сервер vite.
const BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:5173/';
let server = null;
if (!process.env.UI_BASE_URL) {
  const { createServer } = await import('vite');
  server = await createServer({ root, server: { host: '127.0.0.1', port: 5173, strictPort: true } });
  await server.listen();
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const summary = [];
const HERO = process.env.UI_HERO || '';
try {
  const viewports = [[360, 800], [390, 844], [412, 915]].filter(([w]) => !process.env.UI_VIEWPORTS || process.env.UI_VIEWPORTS.split(',').includes(String(w)));
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    // Deterministically exercise the documented fallback font, including offline font loading.
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // UI_HERO=warlock — тот же сценарий колдуном (v0.9.2); снимки — с суффиксом героя
    await page.goto(new URL(`?reset&skipmenu${HERO ? `&hero=${HERO}` : ''}`, BASE).href);
    await page.waitForFunction(() => window.__game?.scene.isActive('UIScene'));
    if (HERO) assert.equal(await page.evaluate(() => window.__game.scene.getScene('ExplorationScene').player.view.texture.key), `${HERO === 'witch' ? 'hero' : HERO}_down`, 'в мире выбранный герой');
    assert.match(await page.title(), /v0\.9\.\d/);
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    assert.equal(await page.locator('canvas').count(), 1);
    const cdp = await context.newCDPSession(page);
    const screen = async (x, y) => page.evaluate(({x,y}) => {
      const b = document.querySelector('canvas').getBoundingClientRect();
      return { x: b.x + x * b.width / 720, y: b.y + y * b.height / 1280 };
    }, {x,y});
    const tap = async (x, y) => { const p = await screen(x,y); await page.touchscreen.tap(p.x,p.y); await page.waitForTimeout(180); };
    const drag = async (x, from, to) => {
      const start = await screen(x,from), end = await screen(x,to);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
      for (let i=1;i<=8;i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y + (end.y-start.y)*i/8, id:1 }] });
        await page.waitForTimeout(25);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(80);
    };
    let screenshotCount=0;
    const shot = async name => {
      screenshotCount++;
      await page.waitForTimeout(180);
      await page.screenshot({ path: path.join(out, `${width}x${height}${HERO ? '-' + HERO : ''}-${name}.png`) });
      const issues = await page.evaluate(() => {
        const ui = window.__game.scene.getScene('UIScene'), issues=[];
        if (ui.modal?.opts && (ui.modal.top < 0 || ui.modal.top+ui.modal.height > 1280)) issues.push('modal overflows');
        const walk = (o, parentVisible=true) => {
          const visible=parentVisible && o.visible && o.alpha>0.05;
          if (visible && o.type==='Text' && o.text && parseInt(o.style.fontSize)<24) issues.push('small text: '+o.text);
          if (visible && o.type==='Text' && /\[object|undefined|NaN/.test(o.text)) issues.push('broken text: '+o.text);
          if (o.list) o.list.forEach(c=>walk(c,visible));
        };
        ui.children.list.forEach(o=>walk(o));
        return issues;
      });
      assert.deepEqual(issues, [], name);
      console.log(`${width}×${height}: ${name}`);
    };
    const close = () => page.evaluate(() => { const u=window.__game.scene.getScene('UIScene');if(u.dlg)u.closeDialogue(true);else u.closeModal(null); });

    // ================================================================ v0.9: завязка, мана, зелья, лечение, обучение боя
    const ui = (fn, arg) => page.evaluate(fn, arg);
    const U = 'window.__game.scene.getScene("UIScene")';
    const textCenter = (label) => ui(label => { const u = window.__game.scene.getScene('UIScene'); const root = u.dlg?.container || u.modal?.container;
      let found = null; const walk = o => { if (found) return; if (o.type === 'Text' && o.text === label && o.visible !== false) found = o; (o.list || []).forEach(walk); }; walk(root);
      if (!found) return null; const r = found.getBounds(); return { x: r.centerX, y: r.centerY }; }, label);
    const tapText = async (label) => { const p = await textCenter(label); assert.ok(p, 'button not found: ' + label); await tap(p.x, p.y); await page.waitForTimeout(250); };
    { // ---- v0.9 сценарии (собственная область видимости)
    // вступление Мирры открывается само на новой игре
    await page.waitForFunction(() => !!window.__game.scene.getScene('UIScene').dlg, null, { timeout: 120000 });
    await ui(() => window.__game.scene.getScene('UIScene').finishTyping());
    await shot('v09-prologue');
    await ui(() => { const u = window.__game.scene.getScene('UIScene'); u.dialogueTap(); u.finishTyping(); });
    await shot('v09-prologue-hero');
    await ui(() => window.__game.scene.getScene('UIScene').closeDialogue(true));
    assert.equal(await ui(() => window.__witch.state.hasEvent('prologue_seen')), true);
    // первый дар: книга → окно дара → Мирра сама даёт два зелья
    await ui(() => { const ex = window.__game.scene.getScene('ExplorationScene'); const b = ex.objects.find(o => o.id === 'magic_book'); ex.player.setPosition(b.x, b.y + 40); ex.interaction.setFocus(b); ex.onContext(); });
    await page.waitForFunction(() => !!window.__game.scene.getScene('UIScene').modal, null, { timeout: 60000 });
    await shot('v09-first-gift');
    await ui(() => window.__game.scene.getScene('UIScene').pressModalButton(true));
    await page.waitForFunction(() => !!window.__game.scene.getScene('UIScene').dlg, null, { timeout: 60000 });
    await ui(() => window.__game.scene.getScene('UIScene').finishTyping());
    await shot('v09-mirra-kit');
    await ui(() => window.__game.scene.getScene('UIScene').closeDialogue(true));
    await page.waitForFunction(() => window.__witch.state.item('elixir_life') === 1 && window.__witch.state.item('elixir_mana') === 1, null, { timeout: 120000 });
    // сбор с расходом маны: цена видна в кнопке, после сбора «−4 маны» и подсветка маны
    await ui(() => { const ex = window.__game.scene.getScene('ExplorationScene'); const h = ex.objects.find(o => o.id === 'herb_g1'); ex.player.setPosition(h.x, h.y - 30); /* сверху: снизу рядом лунное растение (правки карты) */ ex.player.stop(); });
    await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').interaction.focus?.id === 'herb_g1', null, { timeout: 120000 });
    assert.match(await ui(() => window.__game.scene.getScene('UIScene').ctxLabel.text), /4 маны/);
    await shot('v09-gather-cost');
    await ui(() => { const st = window.__witch.state; st.data.mana = 50; st.data.vitalsClock = Date.now(); });   // v0.13.0: сбор — операция сервера (здесь её правило на устройстве); мана восстанавливается по часам
    const ctxp = await ui(() => { const u = window.__game.scene.getScene('UIScene'); const r = u.ctxBg.getBounds(); return { x: r.centerX, y: r.centerY }; });
    await tap(ctxp.x, ctxp.y);
    await page.waitForFunction(() => window.__witch.state.item('moon_herb') >= 1, null, { timeout: 120000 });
    { const m = await ui(() => window.__witch.state.data.mana); assert.ok(m >= 45.9 && m < 49, `gather spent 4 mana once (mana ${m})`); }
    await shot('v09-gather-spent');
    // нехватка маны: ничего не выдаётся
    await ui(() => { const ex = window.__game.scene.getScene('ExplorationScene'); window.__witch.state.data.mana = 2; window.__game.scene.getScene('UIScene').toasts.forEach(t => t.destroy()); window.__game.scene.getScene('UIScene').toasts = []; const h = ex.objects.find(o => o.id === 'herb_g2'); ex.player.setPosition(h.x, h.y + 40); ex.player.stop(); });
    await page.waitForFunction(() => window.__game.scene.getScene('ExplorationScene').interaction.focus?.id === 'herb_g2', null, { timeout: 120000 });
    const herbs = await ui(() => window.__witch.state.item('moon_herb'));
    await tap(ctxp.x, ctxp.y); await page.waitForTimeout(600);
    assert.equal(await ui(() => window.__witch.state.item('moon_herb')), herbs);
    await shot('v09-mana-short');
    // сумка: «Выпить» настой и эликсир вне боя (реальное касание кнопки)
    await ui(() => { const st = window.__witch.state; st.data.hp = 60; st.data.mana = 20; window.__game.scene.getScene('UIScene').openBag(); });
    await shot('v09-bag-drink');
    let bagY = await ui(() => window.__game.scene.getScene('UIScene').modal.scroll.y);
    for (let i = 0; i < 6; i++) { const p = await textCenter('Выпить'); if (p && p.y > bagY + 40 && p.y < bagY + (await ui(() => window.__game.scene.getScene('UIScene').modal.scroll.height)) - 40) break; await drag(350, bagY + 500, bagY + 200); }
    const hpBefore = await ui(() => window.__witch.state.data.hp);
    await tapText('Выпить');
    assert.ok(await ui(() => window.__witch.state.data.hp) > hpBefore, 'elixir from bag heals');
    assert.equal(await ui(() => window.__witch.state.item('elixir_life')), 0);
    await shot('v09-bag-after-drink');
    await close();
    // лечение у Мирры: не хватает монет → отказ; хватает → полное HP за монеты
    const healVia = async () => {
      await ui(() => { const ex = window.__game.scene.getScene('ExplorationScene'); const m = ex.objects.find(o => o.id === 'npc_mirra'); ex.player.setPosition(m.x, m.y + 50); ex.player.stop(); ex.interaction.setFocus(m); ex.onContext(); });
      await page.waitForFunction(() => !!window.__game.scene.getScene('UIScene').dlg);
      for (let i = 0; i < 8; i++) { await ui(() => { const u = window.__game.scene.getScene('UIScene'); u.finishTyping(); }); if (await textCenter('Восстановить здоровье')) break; await ui(() => window.__game.scene.getScene('UIScene').dialogueTap()); }
      await tapText('Восстановить здоровье');
      await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Лечение у Мирры');
    };
    await ui(() => { const st = window.__witch.state; st.data.hp = 50; st.data.inventory.coins = 3; });
    await healVia();
    await shot('v09-heal-poor');
    await close();
    { const hp = await ui(() => window.__witch.state.data.hp); assert.ok(hp >= 50 && hp < 100, 'без монет лечение не прошло, HP только восстанавливается по времени: ' + hp); }
    await ui(() => { window.__witch.state.data.inventory.coins = 30; });
    await healVia();
    await shot('v09-heal-ok');
    const healLabel = await ui(() => window.__game.scene.getScene('UIScene').modal.buttons.find(b => /^Восстановить за/.test(b.label)).label);
    await tapText(healLabel);
    await page.waitForFunction(() => window.__witch.state.data.hp === window.__witch.state.heroStats().maxHp, null, { timeout: 120000 });
    { const paid = 30 - await ui(() => window.__witch.state.item('coins')), shown = Number(healLabel.match(/за (\d+)/)[1]); assert.ok(paid >= shown - 3 && paid <= shown, `списано ${paid}, в окне было ${shown}: за секунды до нажатия HP успело подрасти`); }   // цена зависит от того, сколько HP успело восстановиться по времени
    await shot('v09-heal-done');
    // обучение первого боя: реальные касания «Понятно», камня и Телекинеза; прерывание опасной атаки
    await ui(() => { const s = window.__witch, g = window.__game; s.settings.set('hints', true); s.tutorial.hide(); g.scene.getScene('UIScene').toasts.forEach(t => t.destroy()); g.scene.getScene('UIScene').toasts = [];
      const ex = g.scene.getScene('ExplorationScene'); const t = ex.enemies.find(e => e.id === 'scavenger_01'); ex.player.setPosition(t.cfg.x, t.cfg.y + 200); ex.startCombat(t); });
    await page.waitForFunction(() => { const g = window.__game, c = g.scene.getScene('CombatScene'); return g.scene.isActive('CombatScene') && c.spawnId === 'scavenger_01' && c.started && c.coach?.visible; }, null, { timeout: 120000 });
    await ui(() => window.__witch.tutorial.hide());
    await shot('v09-tut-intro');
    const coachBtn = async (label) => ui(label => { const c = window.__game.scene.getScene('CombatScene'); const b = c.coachButtons.find(x => x.text.text === label); const r = b.hit.getBounds(); return { x: r.centerX, y: r.centerY }; }, label);
    let cp = await coachBtn('Понятно'); await tap(cp.x, cp.y);
    await page.waitForFunction(() => window.__game.scene.getScene('CombatScene').tut.step === 'select');
    await shot('v09-tut-select');
    const rock = await ui(() => { const c = window.__game.scene.getScene('CombatScene'); const v = c.fieldViews.get('rock_a'); return { x: v.img.x, y: v.img.y - v.img.displayHeight / 2 }; });
    await tap(rock.x, rock.y);
    await page.waitForFunction(() => window.__game.scene.getScene('CombatScene').tut.step === 'throw');
    await shot('v09-tut-throw');
    const tkb = await ui(() => { const r = window.__game.scene.getScene('UIScene').buttons.telekinesis.bg.getBounds(); return { x: r.centerX, y: r.centerY }; });
    await tap(tkb.x, tkb.y);
    await page.waitForFunction(() => window.__game.scene.getScene('CombatScene').tut.step === 'interrupt');
    await page.waitForFunction(() => window.__game.scene.getScene('CombatScene').cm.enemy.isPreparing && window.__game.scene.getScene('CombatScene').cm.abilityState('telekinesis').state === 'ready', null, { timeout: 180000 });
    await page.waitForTimeout(400);
    await shot('v09-tut-interrupt');
    await tap(tkb.x, tkb.y);
    await page.waitForFunction(() => window.__game.scene.getScene('CombatScene').tut.step === 'confirm', null, { timeout: 120000 });
    await shot('v09-tut-confirm');
    // подсказка зелья при низком HP (бой на паузе, чтобы медленный эмулятор не закончил его сам)
    await ui(() => { window.__game.scene.getScene('CombatScene').cm.tick = () => {}; });
    await page.waitForFunction(() => !window.__game.scene.getScene('CombatScene').tut.active, null, { timeout: 120000 });
    await ui(() => { const s = window.__witch; const c = window.__game.scene.getScene('CombatScene'); s.state.addItem('elixir_life', 1); c.sim.addItem('elixir_life', 1); const cx = s.state.data.combatCtx; if (cx) cx.potions.elixir_life = (cx.potions.elixir_life || 0) + 1; c.cm.tick = () => {};   // v0.14.0: сумка боя — копия на начало боя; бой на паузе для снимка
      c.cm.hero.hp = 40; c.cm.hitHero(4); c.processEvents(); c.refreshPotions(); c.hintQueue = c.hintQueue.filter(h => h.key === 'lowHp'); });
    await page.waitForFunction(() => window.__game.scene.getScene('CombatScene').coachKey === 'hint:lowHp', null, { timeout: 120000 });
    await shot('v09-combat-lowhp-hint');
    // победа (экран результата): здоровье полностью восстановлено, мана — остаток
    // v0.14.0: исход боя решает повтор записи, подделать победу нельзя — играем бой по-настоящему (бот), снимаем настоящий экран победы
    await ui(() => { const c = window.__game.scene.getScene('CombatScene'); delete c.cm.tick; });
    await playRealCombat(page);
    await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Победа!', null, { timeout: 120000 });
    await shot('v09-victory');
    await ui(() => window.__game.scene.getScene('UIScene').pressModalButton(true));
    await page.waitForFunction(() => { const g = window.__game; return g.scene.isActive('ExplorationScene') && !g.scene.isActive('CombatScene') && !g.scene.isSleeping('ExplorationScene') && !g.scene.getScene('ExplorationScene').inTransition && window.__witch.mode === 'exploration'; }, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    // поражение: героиня остаётся рядом с врагом; повтор — только «Сразиться снова»
    await ui(() => { const g = window.__game; const ex = g.scene.getScene('ExplorationScene'); const s = window.__witch; s.state.markEvent('lunar_quest_start');
      const t = ex.enemies.find(e => e.id === 'lunar_guard'); ex.player.setPosition(t.cfg.x, t.cfg.y + 150); window.__preFight = { x: t.cfg.x, y: t.cfg.y + 150 }; ex.startCombat(t); });
    await page.waitForFunction(() => { const g = window.__game, c = g.scene.getScene('CombatScene'); return g.scene.isActive('CombatScene') && c.spawnId === 'lunar_guard' && c.started && !c.ended; }, null, { timeout: 120000 });
    // настоящее поражение: игрок бездействует, страж побеждает (сервер проигрывает запись и подтверждает)
    await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Поражение', null, { timeout: 300000 });
    await shot('v09-defeat');
    await ui(() => window.__game.scene.getScene('UIScene').pressModalButton(true));
    await page.waitForFunction(() => { const g = window.__game; return g.scene.isActive('ExplorationScene') && !g.scene.isActive('CombatScene') && !g.scene.isSleeping('ExplorationScene') && !g.scene.getScene('ExplorationScene').inTransition && window.__witch.mode === 'exploration'; }, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.waitForTimeout(1500);
    const afterDefeat = await ui(() => { const ex = window.__game.scene.getScene('ExplorationScene'), s = window.__witch.state; return { x: ex.player.x, y: ex.player.y, pre: window.__preFight, hp: s.data.hp, max: s.heroStats().maxHp, sp: s.data.safePoint, focus: ex.interaction.focus?.label, combat: window.__game.scene.isActive('CombatScene') }; });
    assert.ok(Math.hypot(afterDefeat.x - afterDefeat.pre.x, afterDefeat.y - afterDefeat.pre.y) < 2, 'stays at the pre-combat spot near the enemy');
    assert.ok(afterDefeat.hp >= Math.ceil(afterDefeat.max * 0.2) && afterDefeat.hp < afterDefeat.max * 0.5, '20% HP after defeat (+ восстановление по часам, пока шли диалоги): ' + afterDefeat.hp);
    assert.equal(afterDefeat.combat, false);
    assert.equal(afterDefeat.focus, 'Сразиться снова');
    await shot('v09-retry-near');
    // порог предупреждения (40%) близок к HP после поражения (20% + восстановление по часам): на медленной машине HP успевает его перерасти — фиксируем
    await ui(() => { const st = window.__witch.state; st.data.hp = Math.ceil(st.heroStats().maxHp * 0.3); st.data.vitalsClock = Date.now(); });
    await ui(() => { const ex = window.__game.scene.getScene('ExplorationScene'); ex.onContext(); });
    await page.waitForFunction(() => window.__game.scene.getScene('UIScene').modal?.opts?.title === 'Мало здоровья', null, { timeout: 120000 });
    await shot('v09-retry-warning');
    await tapText('Подготовиться');
    assert.equal(await ui(() => window.__game.scene.isActive('CombatScene')), false);
    // профиль после изменения запасов
    await ui(() => window.__game.scene.getScene('UIScene').openHeroProfile());
    await shot('v09-profile');
    await close();
    }
    await page.evaluate(() => {
      const s=window.__witch,u=window.__game.scene.getScene('UIScene');
      s.settings.set('hints',false); s.tutorial.hide(); u.onTutorial(null);
      for(const [id,n] of Object.entries({moon_herb:12,forest_mushroom:8,tree_resin:9,rune_dust:8,lunar_shard:4,elixir_life:2,elixir_mana:2,resin_flask:2})) s.state.addItem(id,n);
      s.state.markEvent('lunar_quest_start'); ['sq_herbs','sq_hunter','sq_dust'].forEach(id=>s.log.accept(id));
      u.toasts.forEach(t=>t.destroy());u.toasts=[];
      u.refreshQuest();u.refreshHud();u.onFocus({icon:'icon_hand',color:0xe8c56a,label:'Открыть котёл'});
    });
    await shot('hud');
    // v0.8.2 layout: compact top zone, Journal above Menu, hit zones and labels apart, nothing over the HUD numbers.
    const layout = await page.evaluate(() => {
      const u=window.__game.scene.getScene('UIScene'), b=o=>{const r=o.getBounds();return {l:r.left,r:r.right,t:r.top,b:r.bottom};};
      const topItems=[u.portrait,u.levelText,u.xpCaption,u.coinText,u.shardText,u.hpText,u.manaText].map(b);
      return { top:Math.max(...topItems.map(r=>r.b)), resRight:Math.max(b(u.coinText).r,b(u.shardText).r,b(u.manaBar.trough).r),
        journal:b(u.journalBtn.hit), menu:b(u.menuBtn.hit), journalLabel:b(u.journalBtn.text), menuLabel:b(u.menuBtn.text),
        captionRight:b(u.xpCaption).r, coinLeft:b(u.coinIcon).l, captionBottom:b(u.xpCaption).b, shardTop:b(u.shardIcon).t,
        questHit:!!u.questHit, portraitHit:b(u.portraitHit) };
    });
    assert.ok(layout.top <= 180, 'top HUD fits 180 px: ' + layout.top);
    assert.ok(!layout.questHit, 'old quest hit zone removed');
    assert.ok(layout.menu.t - layout.journal.b >= 16 && layout.menu.t > layout.journalLabel.b, 'Journal above Menu with a gap');
    assert.ok(layout.journal.r - layout.journal.l >= 96 && layout.menu.b - layout.menu.t >= 96 && layout.portraitHit.r - layout.portraitHit.l >= 96, 'hit zones ≥ 96 px');
    assert.ok(layout.resRight < layout.journal.l, 'resources and bars stay left of the right column');
    assert.ok(layout.captionRight < layout.coinLeft || layout.captionBottom < layout.shardTop, 'XP caption does not overlap resources');
    // A tap where the old quest panel was now reaches the world (no hidden zone).
    const worldTap = await page.evaluate(()=>{window.__tapSeen=0;window.__witch.bus.on('world:tap',()=>window.__tapSeen++);return true;});
    await tap(330,230);
    assert.equal(await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal), null);
    assert.ok(worldTap && await page.evaluate(()=>window.__tapSeen) >= 1, 'world receives taps under the former quest panel');
    // Real touch on the Journal button opens the full journal; drag scrolls to the end when it overflows.
    const jb = await page.evaluate(()=>{const r=window.__game.scene.getScene('UIScene').journalBtn.hit.getBounds();return {x:r.centerX,y:r.centerY};});
    await tap(jb.x, jb.y);
    assert.equal(await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal?.opts.title),'Журнал');
    await shot('journal');
    let max=await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal.scroll.max);
    if (max > 0) {
      const sy=await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal.scroll.y);
      for(let i=0;i<4;i++)await drag(350,sy+620,sy+120);
      assert.equal(await page.evaluate(()=>{const sc=window.__game.scene.getScene('UIScene').modal.scroll;return sc.offset===sc.max;}),true);
      await shot('journal-bottom');
    }
    await close();
    // Menu: real taps. Outside tap closes without moving the heroine; items close the menu before opening the next window.
    const menuBtn = await ui(()=>{const r=window.__game.scene.getScene('UIScene').menuBtn.hit.getBounds();return {x:r.centerX,y:r.centerY};});
    await tap(menuBtn.x, menuBtn.y);
    await page.waitForFunction(()=>{const m=window.__game.scene.getScene('UIScene').modal;return m?.menu && m.container.x===0 && m.container.alpha===1;});
    await shot('game-menu');
    const heroBefore = await ui(()=>{const p=window.__game.scene.getScene('ExplorationScene').player;window.__tapSeen=0;return {x:p.x,y:p.y};});
    await tap(360, 900); await page.waitForTimeout(400);
    const after = await ui(()=>{const u=window.__game.scene.getScene('UIScene'),p=window.__game.scene.getScene('ExplorationScene').player;return {modal:u.modal,open:window.__witch.modalOpen,x:p.x,y:p.y,taps:window.__tapSeen};});
    assert.ok(!after.modal && !after.open && after.taps === 0 && Math.hypot(after.x-heroBefore.x, after.y-heroBefore.y) < 1, 'outside tap only closes the menu');
    const menuOpen = () => page.waitForFunction(()=>{const m=window.__game.scene.getScene('UIScene').modal;return m?.menu && m.container.x===0 && m.container.alpha===1;});
    const menuItem = async id => { await tap(menuBtn.x, menuBtn.y); await menuOpen();
      const p = await ui(id=>{const u=window.__game.scene.getScene('UIScene');const r=u.modal.items.find(i=>i.item.id===id).orb.getBounds();return {x:r.centerX,y:r.centerY};}, id);
      await tap(p.x, p.y); await page.waitForTimeout(250); };
    for (const id of ['city','forum']) {   // v0.20.0: «Банк» открывает кошелёк
      const before = await ui(()=>JSON.stringify({...window.__witch.state.data,hp:0,mana:0,vitalsClock:0,player:0,stats:{...window.__witch.state.data.stats,playTimeMs:0},tutorial:window.__witch.state.data.tutorial.filter(t=>!t.startsWith('hero:'))}))   /* v0.9: HP/мана восстанавливаются сами; v0.9.2: отложенные реплики героя о новых предметах не зависят от заглушки */;
      await menuItem(id);
      assert.equal(await ui(()=>window.__game.scene.getScene('UIScene').modal?.opts?.stub), id);
      if (id === 'city') await shot('stub-city');
      await close();
      assert.equal(await ui(()=>JSON.stringify({...window.__witch.state.data,hp:0,mana:0,vitalsClock:0,player:0,stats:{...window.__witch.state.data.stats,playTimeMs:0},tutorial:window.__witch.state.data.tutorial.filter(t=>!t.startsWith('hero:'))}))   /* v0.9: HP/мана восстанавливаются сами; v0.9.2: отложенные реплики героя о новых предметах не зависят от заглушки */, before, id + ' stub changes nothing');
      assert.equal(await ui(()=>window.__witch.modalOpen), false);
    }
    await menuItem('settings');
    assert.equal(await ui(()=>!!window.__game.scene.getScene('UIScene').modal?.settings), true);
    await shot('settings');
    // Change a value with a real tap on «−», then «Готово».
    const btn = async label => ui(label=>{const c=window.__game.scene.getScene('UIScene').modal.container;const t=c.list.find(o=>o.type==='Text'&&o.text===label);const r=t.getBounds();return {x:r.centerX,y:r.centerY};}, label);
    const sfx0 = await ui(()=>window.__witch.settings.get('sfx'));
    const minus = await btn('−'); await tap(minus.x, minus.y);
    const done = await btn('Готово'); await tap(done.x, done.y);
    assert.equal(await ui(()=>window.__game.scene.getScene('UIScene').modal), null);
    assert.ok(await ui(()=>window.__witch.settings.get('sfx')) < sfx0, 'settings value saved');
    assert.ok(await ui(s0=>JSON.parse(localStorage.getItem('witch_rpg_settings_v1')||'{}').sfx < s0, sfx0), 'settings persisted to storage');
    // Portrait opens the hero profile.
    const pp = await ui(()=>{const r=window.__game.scene.getScene('UIScene').portraitHit.getBounds();return {x:r.centerX,y:r.centerY};});
    await tap(pp.x, pp.y); await page.waitForTimeout(250);
    assert.equal(await ui(()=>window.__game.scene.getScene('UIScene').modal?.opts?.profile), true);
    await shot('profile');
    await close();
    assert.equal(await ui(()=>window.__witch.modalOpen), false);
    await ui(()=>window.__game.scene.getScene('UIScene').showGoalBanner(window.__witch.quests.objectiveText()));
    await shot('goal-banner');
    await close();
    await page.evaluate(()=>window.__game.scene.getScene('UIScene').openBag());await shot('bag');
    const bagY=await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal.scroll.y);
    await drag(350,bagY+600,bagY+100);await shot('bag-bottom');await close();
    await page.evaluate(()=>window.__game.scene.getScene('UIScene').openAlchemy());await shot('alchemy');
    // Tap a real recipe button. Drag starting on it must not craft another potion.
    const recipeButton=async index=>page.evaluate(index=>{
      const u=window.__game.scene.getScene('UIScene'),sc=u.modal.scroll;
      const content=u.modal.container.list.find(o=>o.type==='Container' && o.mask);
      const texts=content.list.filter(o=>o.type==='Text'&&o.text==='Сварить');const t=texts[index];
      return {x:t.x+sc.x,y:t.y+sc.y-sc.offset};
    },index);
    let b=await recipeButton(0),before=await page.evaluate(()=>window.__witch.state.item('elixir_life'));
    await tap(b.x,b.y);assert.equal(await page.evaluate(()=>window.__witch.state.item('elixir_life')),before+1);
    b=await recipeButton(0);before=await page.evaluate(()=>window.__witch.state.item('elixir_life'));
    await drag(b.x,b.y,b.y-240);assert.equal(await page.evaluate(()=>window.__witch.state.item('elixir_life')),before);
    await drag(350,800,450);
    await shot('alchemy-bottom');
    b=await recipeButton(2);before=await page.evaluate(()=>window.__witch.state.item('resin_flask'));
    await tap(b.x,b.y);assert.equal(await page.evaluate(()=>window.__witch.state.item('resin_flask')),before+1);
    await close();
    // Every deferred action is exercised by tapping its actual dialogue choice.
    for(const [npc,answer,title] of [['mirra','Сварить зелье','Котёл Мирры'],['mirra','Открыть журнал','Журнал'],['selena','Открыть алтарь','Изучение: Телекинез II']]) {
      await page.evaluate(npc=>{
        const s=window.__witch;for(const e of ['chapter_1_complete','sq_dust_done','fire_gate_open','lunar_quest_start','unlock_seal_1','seal_training_complete'])s.state.markEvent(e);s.state.data.tutorial=(s.state.data.tutorial||[]).filter(k=>k!=='dlg:mirra_epilogue');for(const v of ['selena_epilogue','selena_wick','selena_compound'])s.dialogue.markSeen(v);s.dialogue.start(npc);
        const u=window.__game.scene.getScene('UIScene');let n=0;while(!s.dialogue.view().choices&&n++<10){u.finishTyping();u.dialogueTap();}u.finishTyping();
      },npc);
      if(npc==='mirra'&&answer==='Сварить зелье')await shot('dialogue');
      const choice=await page.evaluate(answer=>{
        const d=window.__game.scene.getScene('UIScene').dlg;const b=d.choiceViews.find(b=>b.text.text===answer);if(!b)throw new Error('нет ответа «'+answer+'», есть: '+d.choiceViews.map(x=>x.text.text).join(' | ')+' (вариант '+window.__witch.dialogue.cur?.variant?.id+')');const r=b.hit.getBounds();return {x:r.centerX,y:r.centerY};
      },answer);
      await tap(choice.x,choice.y);
      assert.equal(await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal?.opts.title),title,answer);
      assert.equal(await page.evaluate(()=>window.__game.scene.getScene('UIScene').dlg),null);
      await close();
    }
    // Long replicated copy is a UI stress fixture, never shipped as game content.
    await page.evaluate(()=>{
      const s=window.__witch,u=window.__game.scene.getScene('UIScene');s.dialogue.start('mirra');
      s.dialogue.cur.variant={nodes:{start:{lines:[('Длинная реплика ведьмы: весь текст должен оставаться доступным. ').repeat(22)],choices:[{label:'Длинный ответ, который должен корректно переноситься и оставаться удобным для пальца.'},{label:'Закончить разговор.'}]}}};
      u.renderDialogue();u.finishTyping();
    });
    await shot('dialogue-long');
    const longY=await page.evaluate(()=>window.__game.scene.getScene('UIScene').dlg.scroll.y);
    for(let i=0;i<5;i++)await drag(350,longY+620,longY+80);
    await shot('dialogue-long-bottom');await close();
    // v0.10.0: сюжетные предметы в сумке, журнал с составом рецепта, сюжетные рецепты котла
    await page.evaluate(()=>{
      const st=window.__witch.state, chapter=['chapter_1_complete','gate_marks_revealed','unlock_seal_1','seal_training_complete','ancient_gate_open','chapter_trial_defeated','revealing_compound_crafted','restoration_bundle_crafted','guardian_defeated'];
      st.data.completedEvents=st.data.completedEvents.filter(e=>!chapter.includes(e));
      for(const e of ['lunar_quest_start','lunar_quest_complete','telekinesis_2_start','telekinesis_2_complete','heavy_path_open','unlock_fire_1','fire_gate_open']) st.markEvent(e);
      Object.assign(st.data.inventory,{lunar_wick:0,revealing_compound:1,restoration_bundle:1,rare_core:1,moon_herb:1,forest_mushroom:0,rune_dust:1});
    });
    await page.evaluate(()=>window.__game.scene.getScene('UIScene').openJournal());await shot('v10-journal-recipe');await close();
    await page.evaluate(()=>window.__game.scene.getScene('UIScene').openBag());
    { const y=await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal.scroll.y); for(let i=0;i<4;i++)await drag(350,y+600,y+80); }
    await shot('v10-bag-story');await close();
    await page.evaluate(()=>window.__game.scene.getScene('UIScene').openAlchemy());
    { for(let i=0;i<4;i++)await drag(350,900,350); }
    await shot('v10-alchemy-story');await close();
    await page.evaluate(()=>window.__game.scene.getScene('UIScene').openFinal({reward:'+100 опыта, +30 монет'}));await shot('v10-final');await close();
    for(const [name,method] of [['upgrade','openUpgrade'],['final','openFinal']]){
      await page.evaluate(({method})=>window.__game.scene.getScene('UIScene')[method](method==='openUpgrade'?'telekinesis_2':undefined),{method});
      await shot(name);await close();
    }
    await page.evaluate(()=>{
      const g=window.__game,s=window.__witch;g.scene.sleep('ExplorationScene');g.scene.start('CombatScene',{spawnId:'forest_guardian_01',enemyType:'forest_guardian'});
      s.tutorial.hide();g.scene.getScene('UIScene').onTutorial(null);
    });
    await page.waitForFunction(()=>{const g=window.__game,c=g.scene.getScene('CombatScene');return g.scene.isActive('CombatScene')&&c.spawnId==='forest_guardian_01'&&!!c.cm&&c.cm.def===c.def&&!c.ended;},null,{timeout:120000});
    await page.evaluate(()=>{
      const c=window.__game.scene.getScene('CombatScene');c.started=true;c.cm.tick=()=>{};
      c.cm.enemy.prepLeft=1.5;c.cm.hero.hp=40;c.cm.commit();c.warnTitle.setText('⚠ Тяжёлый удар!');c.warnHint.setText('Выберите тяжёлый камень и нажмите Телекинез');c.updateHud();
    });
    await shot('combat');
    // Combat: HP from the battle, Menu in the Journal slot, settings reachable, no exit/reset.
    await page.waitForFunction(()=>window.__game.scene.getScene('UIScene').hpText.text.startsWith('40 /'),null,{timeout:30000}).catch(()=>{});   // v0.14.0: панель обновляется раз в кадр (на медленном эмуляторе — не сразу)
    assert.equal(await ui(()=>window.__game.scene.getScene('UIScene').hpText.text.startsWith('40 /')), true);
    const cm = await ui(()=>{const u=window.__game.scene.getScene('UIScene');const r=u.menuBtn.hit.getBounds();return {x:r.centerX,y:r.centerY,j:u.journalBtn.c.visible};});
    assert.equal(cm.j, false);
    await tap(cm.x, cm.y);
    await page.waitForFunction(()=>{const m=window.__game.scene.getScene('UIScene').modal;return m?.menu && m.container.x===0 && m.container.alpha===1;});
    await shot('combat-menu');
    const cs = await ui(()=>{const r=window.__game.scene.getScene('UIScene').modal.items.find(i=>i.item.id==='settings').orb.getBounds();return {x:r.centerX,y:r.centerY};});
    await tap(cs.x, cs.y); await page.waitForTimeout(250);
    assert.equal(await ui(()=>{const u=window.__game.scene.getScene('UIScene');return !!u.modal?.settings && !u.modal.container.list.some(o=>o.text==='Главное меню');}), true);
    await close();
    assert.equal(await ui(()=>window.__witch.modalOpen), false);
    const controls=await page.evaluate(()=>{
      const c=window.__game.scene.getScene('CombatScene'),u=window.__game.scene.getScene('UIScene');
      const a=u.buttons.telekinesis.bg.getBounds();return [...c.potionViews.values()].map(v=>{const b=v.hit.getBounds();return {w:b.width,h:b.height,clear:b.bottom<a.top};});
    });assert.ok(controls.every(b=>b.w>=96&&b.h>=96&&b.clear));
    // v0.14.0: в бою сумка — копия героя (sim)
    before=await page.evaluate(()=>window.__game.scene.getScene('CombatScene').sim.item('elixir_life'));await tap(68,1028);
    assert.equal(await page.evaluate(()=>window.__game.scene.getScene('CombatScene').sim.item('elixir_life')),before-1);
    // A field object tap selects that object in the combat model.
    const object=await page.evaluate(()=>{const c=window.__game.scene.getScene('CombatScene');const o=c.cm.fieldObjects.find(o=>o.id!==c.cm.selectedId);const v=c.fieldViews.get(o.id);return {id:o.id,x:v.img.x,y:v.img.y-v.img.displayHeight/2};});
    await tap(object.x,object.y);assert.equal(await page.evaluate(()=>window.__game.scene.getScene('CombatScene').cm.selectedId),object.id);
    // Tutorial must leave potion controls free; the ordinary field hint is hidden while teaching.
    await page.evaluate(()=>{const s=window.__witch;s.settings.set('hints',true);s.tutorial.show('combat_warning');window.__game.scene.getScene('CombatScene').updateHud();});
    await shot('combat-tutorial');
    assert.equal(await page.evaluate(()=>{const c=window.__game.scene.getScene('CombatScene'),u=window.__game.scene.getScene('UIScene');return !c.fieldHint.visible && u.tutText.getBounds().bottom+15<c.potionViews.values().next().value.hit.getBounds().top;}),true);
    // v0.10.0: испытание — три фазы Стража узла (сообщения и предупреждение не мельче 24 px, ничего не вылезает)
    await page.evaluate(()=>{ const g=window.__game; if(g.scene.isActive('CombatScene')) g.scene.stop('CombatScene'); g.scene.sleep('ExplorationScene'); g.scene.start('CombatScene',{spawnId:'node_trial',enemyType:'node_guardian'}); window.__witch.tutorial.hide(); });
    await page.waitForFunction(()=>{const g=window.__game,c=g.scene.getScene('CombatScene');return g.scene.isActive('CombatScene')&&c.spawnId==='node_trial'&&!!c.cm&&!c.ended;},null,{timeout:120000});
    await page.evaluate(()=>{const c=window.__game.scene.getScene('CombatScene');c.started=true;c.cm.tick=()=>{};c.updateHud();});
    await shot('v10-trial-phase1');
    await page.evaluate(()=>{const c=window.__game.scene.getScene('CombatScene');c.cm.enemy.hp=590;c.cm.enemy.checkPhase();c.cm.flushPhases();c.processEvents();c.updateHud();});
    await page.waitForTimeout(400);await shot('v10-trial-phase2');
    await page.evaluate(()=>{const c=window.__game.scene.getScene('CombatScene');c.cm.enemy.hp=280;c.cm.enemy.checkPhase();c.cm.flushPhases();c.processEvents();
      c.cm.enemy.prepLeft=1.5;c.warnTitle.setText('⚠ Удар Хранителя!');c.warnHint.setText('Прервите Телекинезом!');c.warn.setVisible(true);c.updateHud();});
    await page.waitForTimeout(400);await shot('v10-trial-phase3');
    await page.evaluate(()=>{const g=window.__game;g.scene.stop('CombatScene');g.scene.stop('UIScene');g.scene.stop('ExplorationScene');g.scene.start('MenuScene');});
    await page.waitForFunction(()=>window.__game.scene.isActive('MenuScene'));
    {
    // v0.9.2: стартовый экран — с сохранением в предпросмотре герой сохранения, «Продолжить»; «Новая игра» → выбор героя
    const menuLayout = () => page.evaluate(() => {
      const m = window.__game.scene.getScene('MenuScene'), issues = [];
      const texts = m.children.list.filter(o => o.type === 'Text' && o.visible && o.alpha > 0.05 && o.text && o.depth >= 5);
      const boxes = texts.map(t => ({ t: t.text, b: t.getBounds() }));
      for (const { t, b } of boxes) {
        if (b.left < 0 || b.right > 720 || b.top < 0 || b.bottom > 1280) issues.push('за экраном: ' + t);
        const tt = texts.find(x => x.text === t); if (parseInt(tt.style.fontSize) < 24) issues.push('мелкий текст: ' + t);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].b, c = boxes[j].b;
        if (a.left < c.right - 2 && c.left < a.right - 2 && a.top < c.bottom - 2 && c.top < a.bottom - 2) issues.push(`наложение: «${boxes[i].t}» / «${boxes[j].t}»`);
      }
      if (m.primary.hit.height < 96) issues.push('главная кнопка ниже 96');
      return issues;
    });
    await page.waitForFunction(()=>!window.__game.scene.getScene('MenuScene').cameras.main.fadeEffect.isRunning);
    await shot('menu');
    const saved = await page.evaluate(()=>({ hero: window.__witch.state.data.heroId, events: window.__witch.state.data.completedEvents.length, tex: window.__game.scene.getScene('MenuScene').picker.image.texture.key, toggles: window.__game.scene.getScene('MenuScene').picker.toggles.length }));
    assert.equal(saved.tex, `${saved.hero === 'warlock' ? 'warlock' : 'hero'}_down`, 'меню с сохранением: в предпросмотре герой сохранения');
    assert.equal(saved.toggles, 0, 'с сохранением переключателя нет');
    assert.deepEqual(await menuLayout(), [], 'меню с сохранением: раскладка');
    await page.evaluate(()=>window.__game.scene.getScene('MenuScene').confirmNew()); await shot('menu-confirm-new');
    await page.evaluate(()=>{const m=window.__game.scene.getScene('MenuScene');m.closeOverlay();m.scene.restart({ newGame: true, hero: window.__witch.state.data.heroId });});
    await page.waitForFunction(()=>{const m=window.__game.scene.getScene('MenuScene');return m.scene.isActive()&&m.picker?.toggles.length===2&&!m.cameras.main.fadeEffect.isRunning;});
    await shot('start-select');
    assert.deepEqual(await menuLayout(), [], 'стартовый экран: раскладка');
    // нажатие на вариант (настоящий тап по зоне переключателя) сразу меняет рисунок, имя и роль и ничего не сохраняет
    for (const id of ['warlock', 'witch', 'warlock']) {
      const t = await page.evaluate((id)=>{const b=window.__game.scene.getScene('MenuScene').picker.toggles.find(t=>t.heroId===id);return {x:b.hit.x,y:b.hit.y};}, id);
      await tap(t.x, t.y);
      const st = await page.evaluate(()=>{const m=window.__game.scene.getScene('MenuScene');return { id:m.hero, tex:m.picker.image.texture.key, labels:m.children.list.filter(o=>o.type==='Text').map(o=>o.text) };});
      assert.equal(st.id, id); assert.equal(st.tex, `${id === 'witch' ? 'hero' : id}_down`);
      assert.ok(st.labels.includes(id === 'witch' ? 'Ученица лесной ведьмы' : 'Ученик лесной ведьмы'), 'роль под предпросмотром');
      await shot(`start-${id}`);
      assert.deepEqual(await menuLayout(), [], `стартовый экран (${id}): раскладка`);
    }
    const after = await page.evaluate(()=>({ hero: window.__witch.state.data.heroId, events: window.__witch.state.data.completedEvents.length }));
    assert.deepEqual(after, { hero: saved.hero, events: saved.events }, 'переключение предпросмотра не меняет и не сбрасывает сохранение');
    // «Как продолжить?» (онлайн-вариант) — без внешнего Supabase, только раскладка окна
    await page.evaluate(()=>window.__game.scene.getScene('MenuScene').showChoice());await shot('hero-choice');
    await page.evaluate(()=>window.__game.scene.getScene('MenuScene').back());
    }
    assert.deepEqual(errors,[],`${width}×${height}: browser console`);
    summary.push({width,height,status:'passed',screenshots:screenshotCount});
    await context.close();
  }
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(summary,null,2));
  console.log('Mobile UI passed:',JSON.stringify(summary));
} finally { await browser.close(); await server?.close(); }
