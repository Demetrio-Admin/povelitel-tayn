// Browser plugin unavailable; Playwright drives the real Phaser scene.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
process.env.VITE_SUPABASE_URL='';process.env.VITE_SUPABASE_ANON_KEY='';
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const out=process.env.CITY_SHOTS_DIR||'/tmp/koldovstvo-city-rooms';await fs.mkdir(out,{recursive:true});
const modules=await fs.realpath(path.join(root,'node_modules'));
const server=await createServer({root,server:{host:'127.0.0.1',port:5192,strictPort:true,hmr:false,fs:{allow:[root,modules]}}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const viewport of (process.env.CITY_VIEWPORTS?JSON.parse(process.env.CITY_VIEWPORTS):[{width:390,height:844},{width:320,height:568},{width:1280,height:900}])){
  const page=await browser.newPage({viewport,hasTouch:true}),errors=[];page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text(),m.location().url);}});
  await page.goto('http://127.0.0.1:5192/?reset&skipmenu');
  await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.player,null,{timeout:120000});console.log('Booted',viewport.width);
  await page.evaluate(()=>{
   const w=window.__witch,u=window.__game.scene.getScene('UIScene');
   for(const e of ['prologue_seen','chapter_1_complete','ch2_start','ch2_city_arrived'])w.state.markEvent(e);
   w.state.markEnemyDefeated('plaza_critter');w.settings.set('hints',false);w.tutorial.hide();u.closeDialogue(true);u.closeModal(null);u.toasts.forEach(t=>t.destroy());u.toasts=[];
   window.__game.scene.getScene('ExplorationScene').travelToLocation('city');
  });
  await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city' && window.__witch.mode==='exploration').catch(async e=>{console.log(await page.evaluate(()=>({loc:window.__game.scene.getScene('ExplorationScene').loc?.id,mode:window.__witch.mode,player:window.__witch.state.data.player,layout:window.__witch.state.getObject('city_layout')})));throw e;});
  const atDoor=async id=>{
   await page.evaluate(id=>{
    const s=window.__game.scene.getScene('ExplorationScene'),u=window.__game.scene.getScene('UIScene'),d=s.objects.find(o=>o.id===id);
    if(!d)throw new Error('Door missing: '+id);
    u.closeDialogue(true);u.closeModal(null);s.player.stop();s.player.setPosition(d.x,d.y+(d.cfg.room==='city'?-70:70));s.heroSay=()=>{};
    for(const e of s.enemies)e.grace=60000;
   },id);await page.waitForTimeout(300);
  };
  const enter=async(id,loc)=>{console.log('Door',viewport.width,id);await atDoor(id);await page.waitForFunction(id=>window.__game.scene.getScene('ExplorationScene').interaction.focus?.id===id,id);await page.keyboard.press('Space');await page.waitForFunction(loc=>window.__game.scene.getScene('ExplorationScene').loc?.id===loc && window.__witch.mode==='exploration',loc).catch(async e=>{console.log(await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene');return{loc:s.loc?.id,mode:window.__witch.mode,p:[s.player.x,s.player.y],focus:s.interaction.focus?.id,events:window.__witch.state.data.completedEvents,layout:window.__witch.state.getObject('city_layout'),fade:s.cameras.main.fadeEffect.isRunning};}));throw e;});};
  await page.waitForTimeout(4500);await atDoor('door_bank');await page.screenshot({path:path.join(out,viewport.width+'-bank-outside.png')});
  await page.keyboard.press('Space');await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city_bank' && window.__witch.mode==='exploration');
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').objects.some(o=>o.id==='npc_banker')),true);
  console.log('Bank entered');
  // A real pointer click on the floor exercises routing with the room's coordinate origin.
  const tap=await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene'),c=s.cameras.main,r=window.__game.canvas.getBoundingClientRect(),t={x:s.player.x+65,y:s.player.y-110};return {target:t,x:r.x+(t.x-c.scrollX)*c.zoom*r.width/window.__game.scale.width,y:r.y+(t.y-c.scrollY)*c.zoom*r.height/window.__game.scale.height};});
  await page.mouse.click(tap.x,tap.y);await page.waitForFunction(t=>{const p=window.__game.scene.getScene('ExplorationScene').player;return Math.hypot(p.x-t.x,p.y-t.y)<25;},tap.target);
  const inv=await page.evaluate(()=>JSON.stringify(window.__witch.state.data.inventory));
  await page.screenshot({path:path.join(out,viewport.width+'-bank-inside.png')});
  await page.evaluate(()=>{window.__game.scene.getScene('ExplorationScene').savePosition();history.replaceState({},'','/?skipmenu');});
  console.log('Reloading');await page.reload();await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.loc?.id==='city_bank');
  console.log('Reloaded');assert.equal(await page.evaluate(()=>JSON.stringify(window.__witch.state.data.inventory)),inv);
  await enter('room_exit_bank','city');await enter('door_archive','city_archive');
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').objects.some(o=>o.id==='npc_ilaria')),true);
  await page.screenshot({path:path.join(out,viewport.width+'-archive-inside.png')});await enter('room_exit_archive','city');
  await atDoor('door_lab');await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id==='door_lab').interact());
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').loc.id),'city');
  await page.evaluate(()=>{for(const e of ['ch2_lab_open','ch2_fin_seal','ch2_rescue_cellar','ch2_rescue_door'])window.__witch.state.markEvent(e);window.__game.scene.getScene('ExplorationScene').refreshAll();});
  for(const [door,loc,exit] of [['lab','city_lab','lab'],['society','city_society','society'],['coven','city_coven','coven'],['duel','city_duel','duel'],['cellar','city_cellar','cellar'],['rescue','city_rescue','rescue'],['warehouse_a','city_warehouse','warehouse_a'],['warehouse_b','city_warehouse','warehouse_b']]){
    console.log('Room',viewport.width,door);await atDoor('door_'+door);await page.evaluate(id=>window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id===id).interact(),'door_'+door);
    await page.waitForFunction(loc=>window.__game.scene.getScene('ExplorationScene').loc.id===loc && window.__witch.mode==='exploration',loc);
    assert.equal(await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene'),r=s.loc.rect,b=s.cameras.main._bounds;return b.x===r.x && b.width===r.w && b.y===r.y-s.loc.extraTop && b.height===r.h+s.loc.extraTop+s.loc.extraBottom && [...s.objects,...s.enemies].every(o=>o.cfg.x>=r.x && o.cfg.x<r.x+r.w && o.cfg.y>=r.y && o.cfg.y<r.y+r.h);}),true,'camera and objects stay inside '+loc);
    if(door==='warehouse_a' && viewport.width===390){
      await page.evaluate(()=>{const w=window.__witch,s=window.__game.scene.getScene('ExplorationScene');w.state.markEvent('ch2_cargo_start');w.abilities.unlock('telekinesis',1);w.state.data.hp=100;w.state.data.mana=100;s.refreshAll();s.startCombat(s.enemies.find(e=>e.id==='wh_collector_1'),{manual:true});});
      await page.waitForFunction(()=>window.__game.scene.isActive('CombatScene') && window.__game.scene.getScene('CombatScene').started);
      const coins=await page.evaluate(()=>window.__witch.state.item('coins'));
      await page.reload();await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.loc?.id==='city_warehouse' && window.__witch.mode==='exploration',null,{timeout:120000});
      assert.equal(await page.evaluate(()=>window.__witch.state.getObject('enc:wh_collector_1').state),'lost');
      assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').enemies.find(e=>e.id==='wh_collector_1').awaitingRetry),true);
      assert.equal(await page.evaluate(()=>window.__witch.state.item('coins')),coins,'interrupted combat grants no reward');
      await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene');for(const e of s.enemies)e.grace=60000;});
      console.log('✓ Warehouse combat reload stays in the same room');
    }
    const before=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').player.y);
    await page.keyboard.down('ArrowUp');
    try{await page.waitForFunction(before=>window.__game.scene.getScene('ExplorationScene').player.y<before,before,{timeout:10000});}
    finally{await page.keyboard.up('ArrowUp');}
    await atDoor('room_exit_'+exit);await page.evaluate(id=>window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id===id).interact(),'room_exit_'+exit);
    await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc.id==='city' && window.__witch.mode==='exploration');
  }
  assert.deepEqual(errors,[]);console.log('✓ Rooms and reload:',viewport.width,viewport.height);await page.close();
 }
}finally{await browser.close();await server.close();}
