// Browser plugin unavailable; Playwright runs the real Phaser UI and HTTP gameplay RPCs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { startFakeHttp } from '../helpers/fake-http.mjs';
process.env.VITE_SUPABASE_URL='http://127.0.0.1:8174'; process.env.VITE_SUPABASE_ANON_KEY='anon-key';
const out=process.env.BALANCE_SHOTS_DIR || '/tmp/witch-balance-v30'; await fs.mkdir(out,{recursive:true});
const {srv,close}=await startFakeHttp({port:8174,delayMs:120});
const vite=await createServer({server:{host:'127.0.0.1',port:5188,strictPort:true,hmr:false}}); await vite.listen();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5188/'); await page.waitForFunction(()=>window.__witch?.session && window.__game.scene.isActive('MenuScene'),null,{timeout:120000});
 await page.evaluate(()=>window.__witch.session.playAsGuest('witch')); const uid=await page.evaluate(()=>window.__witch.session.userId);
 srv.grant(uid,{xp:1000,quests:['prologue_seen','mig_v10','unlock_telekinesis_1','unlock_fire_1','unlock_seal_1','fire_gate_open','guardian_defeated','sq_herbs_done'],
  inv:{forest_mushroom:2},abilities:{telekinesis:{level:2,unlocked:true},fire:{level:1,unlocked:true},seal:{level:1,unlocked:true}}});
 await page.evaluate(async()=>{const w=window.__witch;w.settings.set('hints',false);w.state.data.player={x:900,y:4350};w.state.save();await w.session.flush({force:true});});
 await page.goto('http://127.0.0.1:5188/?skipmenu');
 const ready=()=>page.waitForFunction(()=>window.__game.scene.isActive('ExplorationScene')&&window.__game.scene.isActive('UIScene')&&window.__witch.session.status==='ready'&&window.__game.scene.getScene('ExplorationScene').player,null,{timeout:120000}); await ready();
 await page.evaluate(()=>{const ui=window.__game.scene.getScene('UIScene'),orig=ui.toast.bind(ui);window.__toasts=[];ui.toast=(t,c)=>{window.__toasts.push(String(t));return orig(t,c);};});
 const tap=async p=>{assert.ok(p);const b=await page.locator('canvas').first().boundingBox();await page.touchscreen.tap(b.x+p.x*b.width/720,b.y+p.y*b.height/1280);await page.waitForTimeout(160);};
 const tapLabel=async label=>tap(await page.evaluate(label=>{const u=window.__game.scene.getScene('UIScene'),a=[];const visit=o=>{if(o.type==='Text')a.push(o);for(const c of o.list||[])visit(c);};visit(u.modal.container);const t=a.find(x=>x.text===label);if(!t)return null;const b=t.getBounds();return{x:b.centerX,y:b.centerY};},label));
 const interact=async id=>{
  await page.evaluate(id=>{const e=window.__game.scene.getScene('ExplorationScene'),o=e.objects.find(x=>x.id===id);if(!o)throw new Error(id);e.interaction.setFocus(null);e.player.setPosition(o.x,o.y+80);e.interaction.setFocus(o);},id);
  await page.waitForTimeout(700);await tap(await page.evaluate(()=>{const b=window.__game.scene.getScene('UIScene').ctxBg.getBounds();return{x:b.centerX,y:b.centerY};}));
 };
 const reveal=async()=>{for(let i=0;i<12;i++){const status=await page.evaluate(()=>{const w=window.__witch,u=window.__game.scene.getScene('UIScene');return{typing:u.dlg?.typing,choices:!!w.dialogue.view()?.choices};});if(!status.typing&&status.choices)return;await tapLabel('Далее');}throw new Error('No dialogue choices');};
 await interact('npc_veda'); await page.waitForFunction(()=>window.__game.scene.getScene('UIScene').dlg);
 assert.equal(await page.evaluate(()=>window.__witch.dialogue.cur.variant.id),'sq_mushrooms_ask'); await reveal();await tapLabel('Принесу.');
 await page.waitForFunction(()=>window.__witch.state.hasEvent('sq_mushrooms_start')&&!window.__witch.actions.busy);
 await interact('npc_veda');await page.waitForFunction(()=>window.__game.scene.getScene('UIScene').dlg,null,{timeout:10000});await reveal();assert.equal(await page.evaluate(()=>window.__witch.dialogue.cur.variant.id),'sq_mushrooms_ready');
 await page.screenshot({path:out+'/veda-mushrooms.png'});
 const label=await page.evaluate(()=>window.__witch.dialogue.view().choices[0].label);await tapLabel(label);await reveal();await tapLabel('Спасибо, Веда.');
 await page.waitForFunction(()=>window.__witch.state.hasEvent('sq_mushrooms_done')&&!window.__witch.actions.busy);
 assert.equal(srv.players.get(uid).snap.inventory.coins,35); assert.equal(srv.players.get(uid).snap.inventory.forest_mushroom,0);
 for(const id of ['sapphire_trail_cache','sapphire_oldwood_cache']){
  await interact(id);await page.waitForFunction(id=>window.__witch.state.getObject(id)?.state==='opened',id);await page.waitForTimeout(350);await page.screenshot({path:out+'/'+id+'.png'});
 }
 assert.equal(srv.players.get(uid).snap.wallet.sapphires,2);
 assert.ok((await page.evaluate(()=>window.__toasts)).some(t=>/1 сапфир/.test(t)));
 srv.grant(uid,{quests:['chapter_1_complete','ch2_start','ch2_city_arrived','ch2_quarter_cleared']});
 await page.evaluate(async()=>{await window.__witch.session.flush({force:true});window.__witch.bus.emit('story:map-travel','city');});
 await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city'&&window.__game.scene.getScene('ExplorationScene').player&&window.__witch.mode==='exploration',null,{timeout:20000});await ready();
 for(const id of ['sapphire_city_cache_1','sapphire_city_cache_2']){
  await interact(id);await page.waitForFunction(id=>window.__witch.state.getObject(id)?.state==='opened',id);await page.waitForTimeout(350);await page.screenshot({path:out+'/'+id+'.png'});
 }
 await page.evaluate(()=>window.__game.scene.getScene('UIScene').openWallet()); await page.waitForTimeout(350);await page.screenshot({path:out+'/bank.png'});
 assert.equal(await page.evaluate(()=>window.__witch.state.sapphires()),4);
 assert.deepEqual(errors,[]);console.log('✓ Portrait UI: Veda accepts and rewards, four caches render/open, sapphire toast and bank window work.');
} finally {await browser.close();await vite.close();await close();}
