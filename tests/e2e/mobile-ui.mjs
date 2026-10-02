// Real Phaser + touch input, not the UI stub. Screenshots stay outside the repository.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
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
    await page.goto(new URL('?reset&skipmenu', BASE).href);
    await page.waitForFunction(() => window.__game?.scene.isActive('UIScene'));
    assert.match(await page.title(), /v0\.8\.2/);
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
      await page.screenshot({ path: path.join(out, `${width}x${height}-${name}.png`) });
      const issues = await page.evaluate(() => {
        const ui = window.__game.scene.getScene('UIScene'), issues=[];
        if (ui.modal?.opts && (ui.modal.top < 0 || ui.modal.top+ui.modal.height > 1280)) issues.push('modal overflows');
        const walk = (o, parentVisible=true) => {
          const visible=parentVisible && o.visible && o.alpha>0.05;
          if (visible && o.type==='Text' && o.text && parseInt(o.style.fontSize)<24) issues.push('small text: '+o.text);
          if (o.list) o.list.forEach(c=>walk(c,visible));
        };
        ui.children.list.forEach(o=>walk(o));
        return issues;
      });
      assert.deepEqual(issues, [], name);
      console.log(`${width}×${height}: ${name}`);
    };
    const close = () => page.evaluate(() => { const u=window.__game.scene.getScene('UIScene');if(u.dlg)u.closeDialogue(true);else u.closeModal(null); });
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
    const ui = (fn, arg) => page.evaluate(fn, arg);
    const menuBtn = await ui(()=>{const r=window.__game.scene.getScene('UIScene').menuBtn.hit.getBounds();return {x:r.centerX,y:r.centerY};});
    await tap(menuBtn.x, menuBtn.y);
    await page.waitForFunction(()=>{const m=window.__game.scene.getScene('UIScene').modal;return m?.menu && m.container.x===0 && m.container.alpha===1;});
    await shot('menu');
    const heroBefore = await ui(()=>{const p=window.__game.scene.getScene('ExplorationScene').player;window.__tapSeen=0;return {x:p.x,y:p.y};});
    await tap(360, 900); await page.waitForTimeout(400);
    const after = await ui(()=>{const u=window.__game.scene.getScene('UIScene'),p=window.__game.scene.getScene('ExplorationScene').player;return {modal:u.modal,open:window.__witch.modalOpen,x:p.x,y:p.y,taps:window.__tapSeen};});
    assert.ok(!after.modal && !after.open && after.taps === 0 && Math.hypot(after.x-heroBefore.x, after.y-heroBefore.y) < 1, 'outside tap only closes the menu');
    const menuOpen = () => page.waitForFunction(()=>{const m=window.__game.scene.getScene('UIScene').modal;return m?.menu && m.container.x===0 && m.container.alpha===1;});
    const menuItem = async id => { await tap(menuBtn.x, menuBtn.y); await menuOpen();
      const p = await ui(id=>{const u=window.__game.scene.getScene('UIScene');const r=u.modal.items.find(i=>i.item.id===id).orb.getBounds();return {x:r.centerX,y:r.centerY};}, id);
      await tap(p.x, p.y); await page.waitForTimeout(250); };
    for (const id of ['city','bank','rating','chat','forum']) {
      const before = await ui(()=>JSON.stringify({...window.__witch.state.data,stats:{...window.__witch.state.data.stats,playTimeMs:0}}));
      await menuItem(id);
      assert.equal(await ui(()=>window.__game.scene.getScene('UIScene').modal?.opts?.stub), id);
      if (id === 'city') await shot('stub-city');
      await close();
      assert.equal(await ui(()=>JSON.stringify({...window.__witch.state.data,stats:{...window.__witch.state.data.stats,playTimeMs:0}})), before, id + ' stub changes nothing');
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
        const s=window.__witch;s.state.markEvent('seal_required_01');s.state.markEvent('sq_dust_done');s.dialogue.start(npc);
        const u=window.__game.scene.getScene('UIScene');let n=0;while(!s.dialogue.view().choices&&n++<10){u.finishTyping();u.dialogueTap();}u.finishTyping();
      },npc);
      if(npc==='mirra'&&answer==='Сварить зелье')await shot('dialogue');
      const choice=await page.evaluate(answer=>{
        const d=window.__game.scene.getScene('UIScene').dlg;const b=d.choiceViews.find(b=>b.text.text===answer);const r=b.hit.getBounds();return {x:r.centerX,y:r.centerY};
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
    for(const [name,method] of [['upgrade','openUpgrade'],['final','openFinal']]){
      await page.evaluate(({method})=>window.__game.scene.getScene('UIScene')[method](method==='openUpgrade'?'telekinesis_2':undefined),{method});
      await shot(name);await close();
    }
    await page.evaluate(()=>{
      const g=window.__game,s=window.__witch;g.scene.sleep('ExplorationScene');g.scene.start('CombatScene',{spawnId:'forest_guardian_01',enemyType:'forest_guardian'});
      s.tutorial.hide();g.scene.getScene('UIScene').onTutorial(null);
    });
    await page.waitForFunction(()=>window.__game.scene.getScene('CombatScene').cm);
    await page.evaluate(()=>{
      const c=window.__game.scene.getScene('CombatScene');c.started=true;c.cm.tick=()=>{};
      c.cm.enemy.prepLeft=1.5;c.cm.hero.hp=40;c.warnTitle.setText('⚠ Тяжёлый удар!');c.warnHint.setText('Выберите тяжёлый камень и нажмите Телекинез');c.updateHud();
    });
    await shot('combat');
    // Combat: HP from the battle, Menu in the Journal slot, settings reachable, no exit/reset.
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
    before=await page.evaluate(()=>window.__witch.state.item('elixir_life'));await tap(68,1028);
    assert.equal(await page.evaluate(()=>window.__witch.state.item('elixir_life')),before-1);
    // A field object tap selects that object in the combat model.
    const object=await page.evaluate(()=>{const c=window.__game.scene.getScene('CombatScene');const o=c.cm.fieldObjects.find(o=>o.id!==c.cm.selectedId);const v=c.fieldViews.get(o.id);return {id:o.id,x:v.img.x,y:v.img.y-v.img.displayHeight/2};});
    await tap(object.x,object.y);assert.equal(await page.evaluate(()=>window.__game.scene.getScene('CombatScene').cm.selectedId),object.id);
    // Tutorial must leave potion controls free; the ordinary field hint is hidden while teaching.
    await page.evaluate(()=>{const s=window.__witch;s.settings.set('hints',true);s.tutorial.show('combat_warning');window.__game.scene.getScene('CombatScene').updateHud();});
    await shot('combat-tutorial');
    assert.equal(await page.evaluate(()=>{const c=window.__game.scene.getScene('CombatScene'),u=window.__game.scene.getScene('UIScene');return !c.fieldHint.visible && u.tutText.getBounds().bottom+15<c.potionViews.values().next().value.hit.getBounds().top;}),true);
    await page.evaluate(()=>{const g=window.__game;g.scene.stop('CombatScene');g.scene.stop('UIScene');g.scene.stop('ExplorationScene');g.scene.start('MenuScene');});
    await page.waitForFunction(()=>window.__game.scene.isActive('MenuScene'));
    await shot('menu');
    await page.evaluate(()=>window.__game.scene.getScene('MenuScene').scene.start('HeroSelectScene'));
    await page.waitForFunction(()=>window.__game.scene.isActive('HeroSelectScene'));await shot('hero');
    // Compose account choice, without requiring external Supabase credentials.
    await page.evaluate(()=>window.__game.scene.getScene('HeroSelectScene').showChoice());await shot('hero-choice');
    assert.deepEqual(errors,[],`${width}×${height}: browser console`);
    summary.push({width,height,status:'passed',screenshots:screenshotCount});
    await context.close();
  }
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(summary,null,2));
  console.log('Mobile UI passed:',JSON.stringify(summary));
} finally { await browser.close(); await server?.close(); }
