// Real scene validation: new art must preserve access across the counter and to the document.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
process.env.VITE_SUPABASE_URL='';process.env.VITE_SUPABASE_ANON_KEY='';
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const out=process.env.CITY_SHOTS_DIR||'/tmp/koldovstvo-city-graphics';await fs.mkdir(out,{recursive:true});
const modules=await fs.realpath(path.join(root,'node_modules'));
const server=await createServer({root,server:{host:'127.0.0.1',port:5193,strictPort:true,hmr:false,fs:{allow:[root,modules]}}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const viewport of (process.env.CITY_VIEWPORTS?JSON.parse(process.env.CITY_VIEWPORTS):[{width:390,height:844},{width:320,height:568},{width:1280,height:900}])){
  const page=await browser.newPage({viewport,hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5193/?reset&skipmenu');
  await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.player,null,{timeout:120000});
  await page.evaluate(()=>{
   const w=window.__witch;
   for(const e of ['prologue_seen','chapter_1_complete','ch2_start'])w.state.markEvent(e);
   w.state.markEnemyDefeated('plaza_critter');w.settings.set('hints',false);w.tutorial.hide();
   window.__game.scene.getScene('ExplorationScene').travelToLocation('city');
  });
  await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city' && window.__witch.mode==='exploration');
  const settle=async()=>{await page.waitForTimeout(1800);await page.evaluate(()=>{
   const s=window.__game.scene.getScene('ExplorationScene'),u=window.__game.scene.getScene('UIScene');
   u.toasts.forEach(t=>t.destroy());u.toasts=[];u.goalBanner?.setVisible(false);u.zoneBanner?.setVisible(false);u.hintPlate?.setVisible(false);s.heroSay=()=>{};
   for(const e of s.enemies)e.grace=60000;
  });};
  const shot=async name=>{await settle();await page.screenshot({path:path.join(out,viewport.width+'-'+name+'.png')});};
  const move=async(x,y)=>{await page.evaluate(({x,y})=>{const s=window.__game.scene.getScene('ExplorationScene');s.player.stop();s.player.setPosition(x,y);},{x,y});await settle();};
  const door=async id=>{await page.evaluate(id=>{const s=window.__game.scene.getScene('ExplorationScene'),d=s.objects.find(o=>o.id===id);s.player.stop();s.player.setPosition(d.x,d.y+70);},id);await settle();};
  const clickObject=async id=>{
   const p=await page.evaluate(id=>{const s=window.__game.scene.getScene('ExplorationScene'),o=s.objects.find(o=>o.id===id),c=s.cameras.main,r=window.__game.canvas.getBoundingClientRect();return {x:r.x+(o.x-c.scrollX)*c.zoom*r.width/window.__game.scale.width,y:r.y+(o.sprite.y-o.sprite.displayHeight/2-c.scrollY)*c.zoom*r.height/window.__game.scale.height};},id);
   await page.mouse.click(p.x,p.y);
  };
  await door('door_bank');await shot('bank-exterior');
  await page.keyboard.press('Space');await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city_bank' && window.__witch.mode==='exploration');
  await move(10560,1050);await shot('bank-room');await clickObject('npc_banker');
  await page.waitForFunction(()=>window.__game.scene.getScene('UIScene').dlg?.npcId==='banker',null,{timeout:20000});
  const bankReach=await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene'),c=s.map.colliders.find(c=>c.id==='room_counter'),o=s.objects.find(o=>o.id==='npc_banker');return {player:{x:s.player.x,y:s.player.y},counter:c,npc:{x:o.x,y:o.y,radius:o.radius},distance:Math.hypot(s.player.x-o.x,s.player.y-o.y)};});
  assert.ok(bankReach.player.y>=bankReach.counter.y+bankReach.counter.h && bankReach.distance<=bankReach.npc.radius,'talk reaches Agata across the counter');
  await page.screenshot({path:path.join(out,viewport.width+'-bank-dialogue.png')});
  await page.evaluate(()=>{const u=window.__game.scene.getScene('UIScene');u.closeDialogue(true);window.__game.scene.getScene('ExplorationScene').travelToLocation('city');});
  await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city' && window.__witch.mode==='exploration');
  await door('door_archive');await shot('archive-exterior');
  await page.keyboard.press('Space');await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city_archive' && window.__witch.mode==='exploration');
  await move(12250,1120);await shot('archive-room');
  await clickObject('npc_ilaria');await page.waitForFunction(()=>window.__game.scene.getScene('UIScene').dlg?.npcId==='ilaria',null,{timeout:20000});
  await page.evaluate(()=>{const w=window.__witch,u=window.__game.scene.getScene('UIScene');u.closeDialogue(true);w.state.markEvent('ch2_trace_found');w.abilities.unlock('seal',1);w.state.setObject('player_build',{...w.state.buildData(),slots:['seal']});w.state.data.mana=110;window.__game.scene.getScene('ExplorationScene').refreshAll();});
  await move(12200,1010);await clickObject('archive_document');
  await page.waitForFunction(()=>window.__witch.state.hasEvent('ch2_archive_read'),null,{timeout:20000});
  // The story window appears after the casting animation, after the event is saved.
  await page.waitForFunction(()=>!!window.__game.scene.getScene('UIScene').modal);
  await page.keyboard.press('Space');await page.waitForFunction(()=>!window.__game.scene.getScene('UIScene').modal);
  await move(12200,1020);await shot('archive-desk');
  await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').travelToLocation('city'));
  await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city' && window.__witch.mode==='exploration');
  await move(7840,3260);await shot('square-frozen');
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').colliderViews.get('city_plan_fountain').img.texture.key),'city_final_fountain_frozen');
  await page.evaluate(()=>{window.__witch.state.markEvent('ch2_severin_defeated');window.__game.scene.getScene('ExplorationScene').refreshAll();});await shot('square-thawed');
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').colliderViews.get('city_plan_fountain').img.texture.key),'city_final_fountain');
  assert.deepEqual(errors,[]);console.log('✓ Graphics, bank counter, Archive dialogue/document and fountain:',viewport.width,viewport.height);await page.close();
 }
}finally{await browser.close();await server.close();}
