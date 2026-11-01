// Browser plugin not available. Requires the project's Playwright Chromium installation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { playRealCombat } from '../helpers/e2e-combat.mjs';
import { runCameraChecks } from '../browser/camera-checks.js';
import { runHudChecks } from '../browser/camera-hud-checks.js';
process.env.VITE_SUPABASE_URL=''; process.env.VITE_SUPABASE_ANON_KEY='';
const vite=process.env.UI_BASE_URL?null:await createServer({server:{host:'127.0.0.1',port:5193,strictPort:true}});
await vite?.listen();
const base=process.env.UI_BASE_URL||'http://127.0.0.1:5193/';
const shots=process.env.UI_SHOTS_DIR||'/tmp/witch-camera-test';await fs.mkdir(shots,{recursive:true});
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const [width,height] of [[360,800],[390,844],[412,915],[320,568],[720,1280]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<720});
  const page=await context.newPage(),errors=[],api=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/supabase|\/rest\/v1|\/auth\/v1|\/functions\/v1/.test(r.url()))api.push(r.url());});
  await page.goto(new URL('camera-test/',base).href);
  await page.waitForFunction(()=>window.__game?.scene.isActive('UIScene'));
  const result=await page.evaluate(`(${runCameraChecks.toString()})(window, {quick:${width!==390}})`);
  console.log(width,height,result.results.length,'checks');
  // The compact mobile HUD: real values, no overlaps, 44 px touch targets, the «Магия» tray.
  const hud=await page.evaluate(`(${runHudChecks.toString()})(window, {log(){}, quick:${width!==390}})`);
  console.log(width,height,hud.results.length,'HUD checks');
  // Real touches on the bottom bar: «Магия» opens the tray of working gifts, a tap in the world closes it.
  const at=async(x,y)=>page.evaluate(([x,y])=>{const g=window.__game,r=g.canvas.getBoundingClientRect(),k=r.width/g.scale.gameSize.width,gh=g.scale.gameSize.height;return {x:r.left+x*k,y:r.top+(y-(1280-gh))*k};},[x,y]);
  const tray=()=>page.evaluate(()=>{const u=window.__game.scene.getScene('UIScene');return {open:u.trayOpen,visible:u.dockC.visible};});
  const magic=await at(184,1208);
  await page.touchscreen.tap(magic.x,magic.y);
  await page.waitForFunction(()=>window.__game.scene.getScene('UIScene').trayOpen);
  assert.equal((await tray()).visible,true,'«Магия» opens the tray');
  await page.touchscreen.tap(magic.x,magic.y);
  await page.waitForFunction(()=>!window.__game.scene.getScene('UIScene').trayOpen);
  if(width===390) {
    const bag=await at(536,1208);
    await page.touchscreen.tap(bag.x,bag.y);
    await page.waitForFunction(()=>!!window.__game.scene.getScene('UIScene').modal);
    await page.evaluate(()=>window.__game.scene.getScene('UIScene').pressModalButton(true));
    await page.waitForFunction(()=>!window.__game.scene.getScene('UIScene').modal);
    console.log('Real touch: «Магия» tray and «Сумка» window');
  }
  // Real touch events exercise the shared UI -> bus -> world route.
  const spot=await page.evaluate(()=>{const g=window.__game,s=g.scene.getScene('ExplorationScene'),c=s.cameras.main,b=g.canvas.getBoundingClientRect();return {x:b.x+(s.player.x-c.worldView.x)*c.zoom*b.width/g.scale.width,y:b.y+(s.player.y-150-c.worldView.y)*c.zoom*b.height/g.scale.height};});
  await page.touchscreen.tap(spot.x,spot.y);
  await page.waitForFunction(()=>!!window.__game.scene.getScene('ExplorationScene').player.moveTarget);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width*.25,y:height*.45,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width*.25+60,y:height*.45,id:1}]});
  await page.waitForFunction(()=>!window.__game.scene.getScene('ExplorationScene').player.moveTarget);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  if(width===390) {
    await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene');s.player.stop();s.startCombat(s.enemies.find(e=>e.id==='scavenger_01'));});
    await page.waitForFunction(()=>window.__game.scene.isActive('CombatScene')&&window.__game.scene.getScene('CombatScene').started);
    // In a fight the dock row is the production one: same place, same size, same spells.
    const dock=await page.evaluate(()=>{const u=window.__game.scene.getScene('UIScene');return {visible:u.dockC.visible,scale:u.dockC.scale,x:u.dockC.x,y:u.dockC.y,xs:u.dock.map(d=>Math.round(d.btn.x)),y0:Math.round(u.dock[0].btn.y),bar:u.magicBtn.c.visible,journal:u.journalBtn.c.visible};});
    assert.deepEqual(dock,{visible:true,scale:1,x:0,y:0,xs:[104,274,444],y0:1164,bar:false,journal:false},'combat dock row at production positions');
    const fight=await playRealCombat(page); assert.ok(['victory','defeat'].includes(fight.result));
    await page.waitForFunction(()=>!!window.__game.scene.getScene('UIScene').modal);
    if(fight.result==='victory') await page.locator('.victory-continue').click();
    else await page.evaluate(()=>window.__game.scene.getScene('UIScene').pressModalButton(true));
    await page.waitForFunction(()=>window.__game.scene.isActive('ExplorationScene')&&window.__witch.mode==='exploration');
    console.log('Unmodified combat transition and return:',fight.result);
    const back=await page.evaluate(()=>{const u=window.__game.scene.getScene('UIScene');return {tray:u.dockC.visible,bar:u.magicBtn.c.visible&&u.bagBtn.c.visible,journal:u.journalBtn.c.visible,interactive:!!u.magicBtn.hit.input?.enabled};});
    assert.deepEqual(back,{tray:false,bar:true,journal:true,interactive:true},'mobile HUD is restored after the fight');
  }
  await page.reload();await page.waitForFunction(()=>window.__game?.scene.isActive('UIScene'));
  assert.equal(await page.locator('vite-error-overlay').count(),0);
  assert.deepEqual(api,[]);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${shots}/${width}x${height}.png`});
  // The ordinary route still selects the unmodified classes and camera constants.
  await page.goto(new URL('?skipmenu',base).href);await page.waitForFunction(()=>window.__game?.scene.isActive('UIScene'));
  const original=await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene');return {experiment:typeof s.applyProfile==='function',body:s.player.sprite.body.width,image:s.player.view.displayHeight,panel:!!document.querySelector('#camera-test-panel')};});
  assert.equal(original.experiment,false);assert.equal(original.panel,false);assert.ok(Math.abs(original.body-34)<.01);assert.ok(Math.abs(original.image-120)<8);
  await context.close();
 }
 console.log('Camera experiment mobile E2E passed');
} finally {await browser?.close();await vite?.close();}
