// Browser plugin not available; validates the real Phaser HUD and bounded HTML profile with touch.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
process.env.VITE_SUPABASE_URL=''; process.env.VITE_SUPABASE_ANON_KEY='';
const shots=process.env.UI_SHOTS_DIR||'/tmp/witch-profile';await fs.mkdir(shots,{recursive:true});
const vite=await createServer({server:{host:'127.0.0.1',port:5191,strictPort:true,hmr:false,fs:{allow:[process.cwd(),await fs.realpath('node_modules')]}}});await vite.listen();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
const publicFixture={ok:true,self:false,nickname:'Demetrio',hero:'warlock',playerId:'6',level:15,xp:7900,
  abilities:Object.fromEntries(['telekinesis','fire','seal','ice'].map(id=>[id,{level:3,unlocked:true}])),
  build:{slots:['telekinesis','fire','ice'],amulets:['amulet_focus','amulet_frost']},amuletLevels:{amulet_focus:2,amulet_frost:1},
  strongest:{enemy:'severin_boss',heroLevel:14,wonAt:'2026-10-07T17:10:00Z'},uniqueWins:12,chapters:[true,true],
  coven:{name:'Лунный круг',role:'officer',given:85},duel:{rating:1200,wins:7,losses:2},registeredAt:'2026-10-06T15:14:00Z',lastSeenAt:'2026-10-08T01:42:00Z',online:false};
async function bounded(page) {
  const b=await page.evaluate(()=>{
    const p=document.querySelector('.hero-profile .acc-shell').getBoundingClientRect(),g=window.__game.canvas.getBoundingClientRect();
    const c=document.querySelector('.hp-card');return {p:{x:p.x,y:p.y,right:p.right,bottom:p.bottom},g:{x:g.x,y:g.y,right:g.right,bottom:g.bottom},overflow:c.scrollWidth>c.clientWidth+1};
  });
  assert.ok(b.p.x>=b.g.x-1&&b.p.y>=b.g.y-1&&b.p.right<=b.g.right+1&&b.p.bottom<=b.g.bottom+1,JSON.stringify(b));assert.equal(b.overflow,false);
}
async function portrait(page){
  const at=await page.evaluate(()=>{const ui=window.__game.scene.getScene('UIScene'),r=ui.portraitHit.getBounds(),c=ui.viewport.cameras.top,g=window.__game,b=g.canvas.getBoundingClientRect();return {x:b.x+(r.centerX-c.scrollX)*b.width/g.scale.width,y:b.y+(r.centerY-c.scrollY)*b.height/g.scale.height};});
  await page.touchscreen.tap(at.x,at.y);
  try { await page.locator('.hero-profile').waitFor({timeout:5000}); }
  catch(e){console.error('Profile input failure',JSON.stringify({at,errors,state:await page.evaluate(()=>{const ui=window.__game.scene.getScene('UIScene');return {modal:ui.modal?.opts?.title,dialogue:!!ui.modal?.dialogue,modalOpen:window.__witch.modalOpen,html:document.querySelectorAll('.acc-ov').length};})}));await page.screenshot({path:`${shots}/input-failure.png`});throw e;}
}
try {
  for(const [width,height] of [[390,638],[360,800],[1280,900]]){
    const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:width<900});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:5191/?skipmenu&reset&hero=warlock');
    await page.waitForFunction(()=>window.__game?.scene.isActive('UIScene')&&window.__game.scene.getScene('UIScene').dlg,null,{timeout:120000});
    assert.match(await page.title(),/Колдовство/);assert.equal(await page.locator('vite-error-overlay').count(),0);
    await page.waitForTimeout(500);
    await page.evaluate(()=>{const s=window.__witch,ui=window.__game.scene.getScene('UIScene');ui.closeDialogue(true);s.settings.set('hints',false);s.state.markEvent('prologue_seen');s.state.data.heroLevel=15;s.state.data.heroXP=7900;s.state.data.inventory.coins=3165;s.state.data.inventory.lunar_shard=999;s.state.data.wallet.sapphires=17;for(const id of ['telekinesis','fire','seal','ice'])s.state.unlockAbility(id,3);s.state.addItem('amulet_focus',1);s.state.addItem('amulet_frost',1);s.state.setObject('player_build',{slots:['telekinesis','fire','ice'],amulets:['amulet_focus','amulet_frost'],amuletLevels:{amulet_focus:2,amulet_frost:1}});ui.goalBanner?.destroy();ui.goalBanner=null;ui.refreshHud();ui.closeModal(null);});
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>window.__game.scene.getScene('UIScene').sapphireText.text),'17');
    await portrait(page);await bounded(page);
    assert.equal(await page.getByRole('button',{name:'Сумка',exact:true}).count(),0);
    assert.match(await page.locator('.hp-wallet').innerText(),/17/);assert.doesNotMatch(await page.locator('.hp-wallet').innerText(),/999/);
    assert.equal(await page.locator('.hp-gift.equipped').count(),3);
    await page.screenshot({path:`${shots}/${width}x${height}-own.png`});
    await page.getByRole('tab',{name:'Сведения',exact:true}).click();await page.getByText('Восстановление маны',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();assert.equal(await page.evaluate(()=>window.__witch.modalOpen),false);
    assert.equal(await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal),null,'profile clicks do not reach HUD underneath');
    await portrait(page);await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();
    await page.evaluate(async p=>{const {showHeroProfile}=await import('/src/ui/heroProfileUI.js');showHeroProfile({targetId:'6',session:{meta:{playerId:'42'}},service:{available:true,get:async()=>p}});},publicFixture);
    await page.getByText('Demetrio',{exact:true}).waitFor();await bounded(page);
    assert.equal(await page.locator('.hp-wallet').count(),0);assert.equal(await page.getByRole('button',{name:'Аккаунт',exact:true}).count(),0);
    await page.getByText('Советник',{exact:true}).waitFor();await page.getByRole('button',{name:'Астрал: уровень 3, изучен',exact:true}).click();
    await page.getByRole('tab',{name:'Подвиги',exact:true}).click();await page.getByText('Вклад в этом цикле: 85 очков',{exact:true}).waitFor();
    await page.getByRole('tab',{name:'Сведения',exact:true}).click();await page.getByText('Максимум здоровья',{exact:true}).waitFor();
    assert.match(await page.locator('#hp-sheet-info').innerText(),/06.10.2026/);
    await page.getByRole('tab',{name:'Герой',exact:true}).click();await page.screenshot({path:`${shots}/${width}x${height}-public.png`});
    await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__game.scene.getScene('UIScene').modal),null,'public profile clicks do not open underlying journal');
    if(width===390){
      await page.evaluate(()=>window.__game.scene.getScene('UIScene').openMenu());
      await page.waitForTimeout(300);
      const ratingAt=await page.evaluate(()=>{const u=window.__game.scene.getScene('UIScene'),r=u.modal.items.find(i=>i.item.id==='rating').hit.getBounds(),c=u.viewport.cameras.center,g=window.__game,b=g.canvas.getBoundingClientRect();return {x:b.x+(r.centerX-c.scrollX)*b.width/g.scale.width,y:b.y+(r.centerY-c.scrollY)*b.height/g.scale.height};});
      await page.touchscreen.tap(ratingAt.x,ratingAt.y);
      await page.waitForFunction(()=>window.__game.scene.getScene('UIScene').modal?.opts?.title==='Рейтинг');
      const ratingLabels=await page.evaluate(()=>{const out=[];function walk(o){if(o.type==='Text')out.push(o.text);(o.list||[]).forEach(walk);}walk(window.__game.scene.getScene('UIScene').modal.container);return out.join(' | ');});
      for(const tab of ['Уровень','Монстры','Арена','Онлайн'])assert.ok(ratingLabels.includes(tab),'merged main keeps rating tab '+tab);
      await page.screenshot({path:`${shots}/ratings.png`});
      await page.evaluate(()=>window.__game.scene.getScene('UIScene').closeModal(null));
      await portrait(page);await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();
      await page.evaluate(()=>{window.__game.scene.sleep('ExplorationScene');window.__game.scene.run('CombatScene',{enemyType:'forest_scavenger',spawnId:'forest_scavenger_01'});window.__game.scene.bringToTop('UIScene');});
      await page.waitForTimeout(700);
      const labels=await page.evaluate(()=>window.__game.scene.getScene('CombatScene').children.list.filter(o=>o.type==='Text').map(o=>o.text));
      assert.ok(labels.some(t=>t.includes('Ур. 2 · Обычный')));
      await page.screenshot({path:`${shots}/combat-level.png`});
    }
    await page.close();console.log(`✓ Profile ${width}x${height}: sapphire wallet, tabs, close/reopen, public gifts/coven/dates, bounded window.`);
  }
  assert.deepEqual(errors,[]);console.log('✓ No page errors; enemy level appears in actual combat HUD.');
}finally{await browser.close();await vite.close();}
