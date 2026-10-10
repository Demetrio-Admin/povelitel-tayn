// Visual QA capture of the actual Phaser map. CHROME_PATH may select an installed browser.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { CITY_RECT, CITY_SPOTS } from '../../src/config/city.plan.js';
const out=process.env.CITY_SHOTS_DIR || 'docs/design/city-cozy';
await fs.mkdir(out,{recursive:true});
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const server=await createServer({root,server:{host:'127.0.0.1',port:5195,strictPort:true,hmr:false}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:2000}});
 await page.goto('http://127.0.0.1:5195/?reset&skipmenu');
 await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.player,null,{timeout:120000});
 await page.evaluate(()=>{
  const w=window.__witch;for(const e of ['prologue_seen','chapter_1_complete','ch2_start','ch2_quarter_open','ch2_water_frozen','ch2_severin_defeated'])w.state.markEvent(e);
  w.state.markEnemyDefeated('plaza_critter');w.settings.set('hints',false);w.tutorial.hide();window.__game.scene.getScene('ExplorationScene').travelToLocation('city');
 });
 await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city'&&window.__witch.mode==='exploration');
 await page.waitForTimeout(2200);
 await page.evaluate(({R,spot})=>{
  const game=window.__game,s=game.scene.getScene('ExplorationScene'),u=game.scene.getScene('UIScene');
  u.scene.setVisible(false);s.player.stop();s.player.setPosition(spot.x,spot.y);s.player.sprite.setVisible(false);
  for(const e of s.enemies)e.grace=60000;s.heroSay=()=>{};
  const c=s.cameras.main;c.stopFollow();c.setViewport(0,0,game.scale.width,game.scale.height);c.useBounds=false;c.setZoom(game.scale.width/R.w);c.centerOn(R.x+R.w/2,R.y+R.h/2);
 },{R:CITY_RECT,spot:CITY_SPOTS.square});
 await page.waitForTimeout(1800);
 await page.locator('canvas').screenshot({path:path.join(out,'city-cozy-overview.png')});
 console.log('✓ Actual Phaser town overview:',out);
}finally{await browser.close();await server.close();}
