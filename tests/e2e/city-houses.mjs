// Browser plugin not available; Playwright validates the actual Phaser rooms and pointer actions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
process.env.VITE_SUPABASE_URL='';process.env.VITE_SUPABASE_ANON_KEY='';
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const out=process.env.CITY_SHOTS_DIR||'/tmp/koldovstvo-city-houses';await fs.mkdir(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:5195,strictPort:true,hmr:false}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const viewport of (process.env.CITY_VIEWPORTS?JSON.parse(process.env.CITY_VIEWPORTS):[{width:390,height:844},{width:320,height:568},{width:1280,height:900}])){
  const page=await browser.newPage({viewport,hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5195/?reset&skipmenu');
  assert.match(await page.title(),/Колдовство/);
  await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.player,null,{timeout:120000});
  await page.evaluate(()=>{
   const w=window.__witch;w.settings.set('hints',false);w.tutorial.hide();
   for(const e of ['prologue_seen','chapter_1_complete','ch2_start','ch2_cargo_start','ch2_quarter_open','ch2_water_frozen','ch2_lab_open','ch2_fin_seal','ch2_rescue_cellar','ch2_rescue_door','ch2_vol_1'])w.state.markEvent(e);
   w.state.setObject('lab_seal',{state:'frozen'});w.state.setObject('fq_door',{state:'destroyed'});
   w.state.setObject('fq_cellar',{state:'moved'});
   w.state.markEnemyDefeated('plaza_critter');
   window.__game.scene.getScene('ExplorationScene').travelToLocation('city');
  });
  const ready=async loc=>page.waitForFunction(loc=>window.__game.scene.getScene('ExplorationScene').loc?.id===loc && window.__witch.mode==='exploration',loc);
  await ready('city');
  const settle=async()=>{await page.waitForFunction(()=>!window.__game.scene.getScene('ExplorationScene').cameras.main.fadeEffect.isRunning);await page.waitForTimeout(600);await page.evaluate(()=>{
   const s=window.__game.scene.getScene('ExplorationScene'),u=window.__game.scene.getScene('UIScene');
   u.toasts.forEach(t=>t.destroy());u.toasts=[];u.goalBanner?.setVisible(false);u.zoneBanner?.setVisible(false);u.hintPlate?.setVisible(false);s.heroSay=()=>{};
   for(const e of s.enemies)e.grace=60000;
  });};
  const shot=async name=>{await settle();await page.screenshot({path:path.join(out,viewport.width+'-'+name+'.png')});};
  const move=async(x,y)=>{await page.evaluate(({x,y})=>{const s=window.__game.scene.getScene('ExplorationScene');for(const e of s.enemies)e.grace=60000;s.player.stop();s.player.setPosition(x,y);s.cameras.main.centerOn(x,y-s.followOffsetY);},{x,y});await settle();};
  const click=async id=>{
   const p=await page.evaluate(id=>{const s=window.__game.scene.getScene('ExplorationScene'),o=s.objects.find(o=>o.id===id),c=s.cameras.main,r=window.__game.canvas.getBoundingClientRect();return {x:r.x+(o.x-c.scrollX)*c.zoom*r.width/window.__game.scale.width,y:r.y+(o.sprite.y-o.sprite.displayHeight/2-c.scrollY)*c.zoom*r.height/window.__game.scale.height};},id);
   await page.mouse.click(p.x,p.y);
  };
  // Every exterior uses its own sprite. North houses stay decorative, without invented entrances.
  for(const id of ['society','lab','duel','coven','warehouse_a','warehouse_b','cellar','rescue','north_bay','north_workshop']){
   const b=await page.evaluate(id=>{const s=window.__game.scene.getScene('ExplorationScene'),v=s.colliderViews.get('city_plan_building_'+id);return {x:v.c.x+v.c.w/2,y:v.c.y+v.c.h,key:v.img.texture.key};},id);
   assert.equal(b.key,'city_final_'+id+'_exterior');await move(b.x,b.y+150);await shot(id+'-exterior');
  }
  await page.evaluate(()=>{window.__witch.state.markEvent('ch2_frost_wave');window.__game.scene.getScene('ExplorationScene').refreshAll();});
  await move(9240,1910);await shot('rescue-frozen');
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').colliderViews.get('city_plan_building_rescue').img.tintTopLeft),0xb6dbea);
  for(const key of (process.env.HOUSE_ROOMS?process.env.HOUSE_ROOMS.split(','):['society','coven','lab','duel','warehouse','cellar','rescue'])){
   const door=key==='warehouse'?'warehouse_a':key;
   await page.evaluate(id=>{const s=window.__game.scene.getScene('ExplorationScene'),d=s.objects.find(o=>o.id===id);s.player.stop();s.player.setPosition(d.x,d.y+12);for(const e of s.enemies)e.grace=60000;},'door_'+door);
   await settle();await page.keyboard.press('Space');await ready('city_'+key);
   const r=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').loc.rect);
   await move(r.x+r.w/2,r.y+({society:790,coven:800,lab:1510,duel:1140,warehouse:1120,cellar:790,rescue:790})[key]);
   await shot(key+'-room');
   if(key==='society'||key==='coven'){
    const npc=key==='society'?'severin':'rowena';await click('npc_'+npc);
    await page.waitForFunction(npc=>window.__game.scene.getScene('UIScene').dlg?.npcId===npc,npc,{timeout:20000});
    await page.evaluate(()=>window.__game.scene.getScene('UIScene').closeDialogue(true));
   }
   if(key==='lab'||key==='duel'){
    const id=key==='lab'?'lab_journal':'final_letters',boss=key==='lab'?'lab_construct':'final_severin',ev=key==='lab'?'ch2_lab_journal':'ch2_letters_read';
    await page.evaluate(boss=>{const w=window.__witch;w.state.markEnemyDefeated(boss);w.abilities.unlock('seal',1);w.state.setObject('player_build',{...w.state.buildData(),slots:['seal']});w.state.data.mana=110;window.__game.scene.getScene('ExplorationScene').refreshAll();},boss);
    const target=await page.evaluate(id=>{const s=window.__game.scene.getScene('ExplorationScene'),o=s.objects.find(o=>o.id===id),table=s.map.colliders.find(c=>c.id===(id==='lab_journal'?'room_journal':'room_letters'));return {x:o.x,y:o.y,depth:o.sprite.depth,tableBottom:table.y+table.h,artY:o.sprite.y};},id);
    assert.equal(target.y,target.tableBottom+1,'paper sorts in front of tabletop');assert.ok(target.artY<target.tableBottom);
    await move(target.x-140,target.y+190);await click(id);
    await page.waitForFunction(ev=>window.__witch.state.hasEvent(ev),ev,{timeout:20000});
    await page.waitForFunction(()=>!!window.__game.scene.getScene('UIScene').modal);await page.keyboard.press('Space');
    await page.waitForFunction(()=>!window.__game.scene.getScene('UIScene').modal);await shot(key+'-paper');
   }
   if(key==='lab'){
    await move(r.x+480,r.y+690);await shot('lab-experiments');
   }
   await page.evaluate(id=>{const s=window.__game.scene.getScene('ExplorationScene'),d=s.objects.find(o=>o.id===id);s.player.stop();s.player.setPosition(d.x,d.y-40);},'room_exit_'+door);
   await settle();await page.keyboard.press('Space');await ready('city');console.log('✓',viewport.width,key);
  }
  await page.evaluate(()=>{window.__witch.state.markEvent('ch2_severin_defeated');window.__game.scene.getScene('ExplorationScene').refreshAll();});
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').colliderViews.get('city_plan_building_rescue').img.isTinted),false,'story thaw keeps individual facade and clears frost');
  await move(9240,1910);await shot('rescue-thawed');
  assert.deepEqual(errors,[]);await page.close();console.log('✓ House graphics, dialogues, papers and frost',viewport);
 }
}finally{await browser.close();await server.close();}
