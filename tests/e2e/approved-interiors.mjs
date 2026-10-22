// Browser plugin unavailable; Playwright checks the actual Phaser camera, physics and loaded art.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
process.env.VITE_SUPABASE_URL='';process.env.VITE_SUPABASE_ANON_KEY='';
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const server=await createServer({root,server:{host:'127.0.0.1',port:5198,strictPort:true,hmr:false}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const out=process.env.CITY_SHOTS_DIR||'/tmp/approved-interiors-qa';await fs.mkdir(out,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.setDefaultTimeout(120000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5198/?reset&skipmenu');await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.player);
 await page.evaluate(()=>{const w=window.__witch;for(const e of ['prologue_seen','chapter_1_complete','ch2_start','ch2_city_arrived','ch2_cargo_start','ch2_lab_open','ch2_fin_seal','ch2_rescue_cellar','ch2_rescue_door'])w.state.markEvent(e);w.settings.set('hints',false);w.tutorial.hide();});
 for(const key of ['bank','archive','society','lab','duel','coven','warehouse_a','warehouse_b']){
  await page.evaluate(key=>{const u=window.__game.scene.getScene('UIScene');u.closeDialogue(true);u.closeModal(null);window.__game.scene.getScene('ExplorationScene').travelToLocation('city_'+key);},key);
  await page.waitForFunction(key=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city_'+key&&window.__witch.mode==='exploration',key);
  await page.waitForFunction(()=>!window.__game.scene.getScene('ExplorationScene').cameras.main.fadeEffect.isRunning);
  await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene');for(const e of s.enemies)e.grace=60000;s.heroSay=()=>{};});
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:430,height:1000},{width:1280,height:900}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(200);
   for(const [x,y] of [[.5,.5],[.02,.02],[.98,.02],[.02,.98],[.98,.98]]){
    await page.evaluate(([x,y])=>{const s=window.__game.scene.getScene('ExplorationScene'),r=s.loc.rect;s.player.stop();s.player.setPosition(r.x+r.w*x,r.y+r.h*y);s.cameras.main.centerOn(s.player.x,s.player.y-s.followOffsetY);},[x,y]);
    await page.waitForTimeout(80);
    const v=await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene'),r=s.loc.rect,c=s.cameras.main;return {r,v:{x:c.worldView.x,y:c.worldView.y,w:c.worldView.width,h:c.worldView.height},missing:s.children.list.filter(o=>o.texture?.key==='__MISSING').length};});
    assert.equal(v.missing,0,key+' loads every asset');
    assert.ok(v.v.x>=v.r.x-1&&v.v.y>=v.r.y-1&&v.v.x+v.v.w<=v.r.x+v.r.w+1&&v.v.y+v.v.h<=v.r.y+v.r.h+1,JSON.stringify({key,viewport,...v}));
   }
  }
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
  const bottom=await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene'),r=s.loc.rect,c=s.map.colliders.find(c=>c.id===s.loc.id+'_wall_back');s.player.stop();s.player.setPosition(r.x+r.w/2,c.y+c.h+90);return c.y+c.h;});
  await page.keyboard.down('ArrowUp');
  try{await page.waitForFunction(y=>window.__game.scene.getScene('ExplorationScene').player.y<=y+25,bottom,{timeout:10000});await page.waitForTimeout(250);assert.ok(await page.evaluate(y=>window.__game.scene.getScene('ExplorationScene').player.y>=y+21,bottom),key+' wall stops live keyboard movement');}
  finally{await page.keyboard.up('ArrowUp');}
  await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene'),r=s.loc.rect;s.player.stop();s.player.setPosition(r.x+r.w/2,r.y+r.h*.61);s.cameras.main.centerOn(s.player.x,s.player.y-s.followOffsetY);const u=window.__game.scene.getScene('UIScene');u.toasts.forEach(t=>t.destroy());u.toasts=[];u.goalBanner?.setVisible(false);u.zoneBanner?.setVisible(false);u.hintPlate?.setVisible(false);});
  await page.waitForTimeout(250);await page.screenshot({path:path.join(out,key+'.png')});
  console.log('✓',key,'physics + camera at 4 viewports, 5 positions including tables/edges');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close();}
