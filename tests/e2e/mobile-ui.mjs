// Real Phaser + touch input, not the UI stub. Screenshots stay outside the repository.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.UI_SHOTS_DIR || '/tmp/witch-rpg-mobile-ui';
await fs.mkdir(out, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5173, strictPort: true } });
await server.listen();
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
    await page.goto('http://127.0.0.1:5173/?reset&skipmenu');
    await page.waitForFunction(() => window.__game?.scene.isActive('UIScene'));
    assert.match(await page.title(), /v0\.8\.1/);
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
    assert.equal(await page.evaluate(()=>{const u=window.__game.scene.getScene('UIScene');return u.questBottom<340 && Math.abs(u.ctx.y-860)>104;}),true);
    // Actual HUD tap opens the journal; drag reaches the final quest and keeps the footer visible.
    await tap(654,158);
    assert.equal(await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal?.opts.title),'Журнал');
    await shot('journal');
    let max=await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal.scroll.max);assert.ok(max>0);
    const sy=await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal.scroll.y);
    for(let i=0;i<4;i++)await drag(350,sy+620,sy+120);
    assert.equal(await page.evaluate(()=>{const sc=window.__game.scene.getScene('UIScene').modal.scroll;return sc.offset===sc.max;}),true);
    await shot('journal-bottom');
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
    for(const [name,method] of [['upgrade','openUpgrade'],['pause','openPause'],['settings','openSettings'],['final','openFinal']]){
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
} finally { await browser.close();await server.close(); }
