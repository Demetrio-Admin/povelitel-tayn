// Browser plugin not available. Real Phaser + DOM + pointer input through Playwright.
// ?edit -> search/add/edit/delete/undo -> reload -> ?draft renders the same map.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.EDITOR_SHOTS_DIR||'/tmp/witch-editor-catalog';await fs.mkdir(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:5184,strictPort:true,hmr:false}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const [name,viewport] of [['desktop',{width:1365,height:900}],['mobile',{width:390,height:844}]]){
  if(process.env.EDITOR_PROFILE && process.env.EDITOR_PROFILE!==name)continue;
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:name==='mobile',deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&/\/assets\//.test(r.url()))errors.push(`${r.status()} ${r.url()}`);});
  try{
   await page.goto('http://127.0.0.1:5184/?edit');
   await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.editor,null,{timeout:120000});
   assert.match(await page.title(),/Колдовство/);
   const panel=page.locator('#me-panel');await panel.waitFor();
   assert.equal(await page.locator('vite-error-overlay').count(),0);
   const catalog=await page.evaluate(async()=>{const {ASSET_CATALOG}=await import('/src/world/assetCatalog.js');const{ASSET_FILES}=await import('/src/config/assets.manifest.js');return{count:ASSET_CATALOG.length,expected:Object.values(ASSET_FILES).filter(Boolean).length};});
   assert.equal(catalog.count,catalog.expected);assert.ok(catalog.count>200);
   const search=panel.locator('[data-r=asset-search]');
   await search.fill('ящик');await panel.locator('[data-asset=city_crate]').click();await panel.locator('[data-a=add]').click();
   const id=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selectedId);
   const field=k=>panel.locator(`[data-p=${k}]`);
   const set=async(k,v)=>{await field(k).fill(String(v));await field(k).press('Tab');};
   await set('x',900);await set('y',4750);await set('w',120);await set('h',100);await set('s',1.4);await set('a',15);await set('alpha',0.8);
   await field('l').selectOption('front');await field('collision').selectOption('custom');await set('solid_w',50);await set('solid_h',25);
   await panel.locator('[data-a=flip]').click();
   let data=await page.evaluate(id=>{const e=window.__game.scene.getScene('ExplorationScene').editor.find(id);return{p:e.ref.p,w:e.img.displayWidth,h:e.img.displayHeight,angle:e.img.angle,flip:e.img.flipX,body:e.ref.blocker.body.width};},id);
   assert.equal(data.p.k,'city_crate');assert.ok(Math.abs(data.w-168)<0.01);assert.ok(Math.abs(data.h-140)<0.01);assert.equal(data.angle,15);assert.equal(data.flip,true);assert.equal(data.body,70);
   // Typing and deleting in search must not delete the selected world object.
   await search.fill('flower');await search.press('Backspace');
   assert.equal(await page.evaluate(id=>!!window.__game.scene.getScene('ExplorationScene').editor.find(id),id),true);
   await panel.locator('[data-a=dup]').click();const copy=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selectedId);
   assert.notEqual(copy,id);await panel.locator('[data-a=delete]').click();
   assert.equal(await page.evaluate(id=>!!window.__game.scene.getScene('ExplorationScene').editor.find(id),copy),false);
   await panel.locator('[data-a=undo]').click();assert.equal(await page.evaluate(id=>!!window.__game.scene.getScene('ExplorationScene').editor.find(id),copy),true);
   await panel.locator('[data-a=redo]').click();
   // A real canvas drag, with touch events on the mobile profile.
   await panel.locator('[data-a=min]').click();
   const point=await page.evaluate(id=>{
    const s=window.__game.scene.getScene('ExplorationScene'),e=s.editor.find(id),c=s.cameras.main;
    c.setZoom(1);c.centerOn(e.img.x,e.img.y-e.img.displayHeight/2);c.preRender();s.editor.select(null);
    const b=e.img.getBounds();return{x:(b.centerX-c.worldView.x)*c.zoom,y:(b.centerY-c.worldView.y)*c.zoom};
   },id);
   const box=await page.locator('canvas').first().boundingBox();
   const p={x:box.x+point.x*box.width/720,y:box.y+point.y*box.height/1280};
   const end={x:p.x+60*box.width/720,y:p.y+30*box.height/1280};
   if(name==='mobile'){
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0}]});
    for(let i=1;i<=6;i++){
     await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+(end.x-p.x)*i/6,y:p.y+(end.y-p.y)*i/6,id:0}]});
     await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   }else{await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();}
   await page.waitForFunction(id=>window.__game.scene.getScene('ExplorationScene').editor.selectedId===id,id);
   const dragged=await page.evaluate(id=>{const e=window.__game.scene.getScene('ExplorationScene').editor.find(id);return{x:e.x,y:e.y};},id);
   assert.ok(Math.abs(dragged.x-960)<=2 && Math.abs(dragged.y-4780)<=2,JSON.stringify(dragged));
   await panel.locator('[data-a=min]').click();await panel.locator('[data-a=undo]').click();
   // New plants use their native small size and remain walkable.
   await search.fill('flower_white_01');await panel.locator('[data-asset=flower_white_01]').click();await panel.locator('[data-a=add]').click();
   assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selected.ref.blocker),null);
   await panel.locator('[data-a=delete]').click();
   console.log(`  ✓ ${name}: полный каталог, поиск, размеры, поворот, слой, коллизия, копия и отмена`);
   // Existing hardcoded city lamps are now selectable placements.
   await panel.locator('summary').filter({hasText:'Объекты на карте'}).click();
   await panel.locator('[data-r=entity-filter]').selectOption('prop');
   const walkableLamp=await page.evaluate(()=>[...window.__game.scene.getScene('ExplorationScene').propViews.values()].find(v=>v.p.k==='lantern_01'&&v.blocker).p.id);
   await panel.locator('[data-r=entities]').selectOption(walkableLamp);await field('collision').selectOption('none');
   await panel.locator('[data-r=entities]').selectOption('bank_lamp_w');
   await panel.locator('[data-a=delete]').click();await panel.locator('[data-a=undo]').click();
   // Furniture shares its saved collider record; rendered size is independent of its footprint.
   await panel.locator('[data-r=entity-filter]').selectOption('col');
   const counter=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.cols.find(c=>c.tex==='city_bank_counter').id);
   await panel.locator('[data-r=entities]').selectOption(counter);await set('x',3330);await set('w',250);
   // A storyline entity can be removed and restored; deletion survives reload.
   await panel.locator('[data-r=entity-filter]').selectOption('obj');await panel.locator('[data-r=entities]').selectOption('npc_banker');
   await set('a',20);assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selected.img.angle),20);
   await panel.locator('[data-a=undo]').click();assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selected.img.angle),0);
   await panel.locator('[data-a=delete]').click();await panel.locator('[data-a=undo]').click();await panel.locator('[data-a=redo]').click();
   assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.buildEdits().pos.npc_banker),null);
   await panel.locator('[data-a=check]').click();assert.match(await panel.locator('[data-r=status]').innerText(),/удалён/);
   await panel.locator('[data-r=entities]').selectOption('npc_mirra');
   await set('w',100);await set('a',25);await set('alpha',0.6);await panel.locator('[data-a=flip]').click();
   // Native enemy scale must not distort an exact width entered in the inspector.
   await panel.locator('[data-r=entity-filter]').selectOption('enemy');
   const largeEnemy=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').enemies.find(e=>e.cfg.scale>1).id);
   await panel.locator('[data-r=entities]').selectOption(largeEnemy);await set('w',200);
   assert.ok(Math.abs(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selected.img.displayWidth)-200)<0.01);
   await panel.locator('[data-a=undo]').click();
   // Floor records also persist, and can be resized and retextured.
   await panel.locator('[data-r=entity-filter]').selectOption('ground');
   const floor=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.grounds.find(g=>g.tex==='city_wood_floor').id);
   await panel.locator('[data-r=entities]').selectOption(floor);await set('w',430);await set('tileScale',0.65);
   await panel.locator('[data-r=entity-filter]').selectOption('prop');await panel.locator('[data-r=entities]').selectOption(id);
   await search.fill('ящик');await panel.locator('[data-asset=crate_01]').click();await panel.locator('[data-a=replace]').click();
   assert.equal(await page.evaluate(id=>window.__game.scene.getScene('ExplorationScene').editor.find(id).ref.p.k,id),'crate_01');
   await panel.locator('[data-a=undo]').click();
   const saved=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.buildEdits());
   await page.reload();await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.editor);
   assert.deepEqual(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.buildEdits()),saved);
   assert.deepEqual(await page.evaluate(()=>{const im=window.__game.scene.getScene('ExplorationScene').editor.find('npc_mirra').img;return{w:Math.round(im.displayWidth*10000)/10000,a:im.angle,alpha:im.alpha,f:im.flipX};}),{w:100,a:25,alpha:0.6,f:true});
   const downloaded=page.waitForEvent('download');await panel.locator('[data-a=download]').click();
   const file=path.join(out,`${name}-world.edits.js`);await (await downloaded).saveAs(file);
   const {parseEditsFile}=await import('../../src/world/mapData.js');
   assert.deepEqual(parseEditsFile(await fs.readFile(file,'utf8')),saved);
   await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),panel.locator('[data-r=import]').setInputFiles(file)]);
   await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.editor);
   assert.deepEqual(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.buildEdits()),saved);
   console.log(`  ✓ ${name}: фонарь, мебель, сюжетные объекты и полы редактируются; черновик восстановлен точно`);
   await panel.locator('[data-r=location]').selectOption('city');await search.fill('фонарь');
   if(name==='mobile')await panel.locator('[data-r=assets]').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,`${name}-editor.png`)});
   // Play preview must use the same saved assets, styles, collisions and deleted entities.
   await panel.locator('[data-a=play]').click();await page.waitForFunction(()=>window.__game?.scene.isActive('UIScene')&&window.__game.scene.getScene('ExplorationScene')?.player);
   data=await page.evaluate(id=>{const s=window.__game.scene.getScene('ExplorationScene'),v=s.propViews.get(id);return{p:v.p,w:v.img.displayWidth,h:v.img.displayHeight,angle:v.img.angle,flip:v.img.flipX,body:v.blocker.body.width};},id);
   assert.equal(data.p.k,'city_crate');assert.ok(Math.abs(data.w-168)<0.01);assert.ok(Math.abs(data.h-140)<0.01);assert.equal(data.angle,15);assert.equal(data.flip,true);assert.equal(data.body,70);
   assert.equal(await page.evaluate(id=>!!window.__game.scene.getScene('ExplorationScene').propViews.get(id).blocker,walkableLamp),false);
   assert.deepEqual(await page.evaluate(()=>{const im=window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id==='npc_mirra').sprite;return{w:Math.round(im.displayWidth*10000)/10000,a:im.angle,alpha:im.alpha,f:im.flipX};}),{w:100,a:25,alpha:0.6,f:true});
   await page.evaluate(()=>{const w=window.__witch;w.state.markEvent('ch2_start');w.bus.emit('story:map-travel','city');});
   await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city');
   const live=await page.evaluate(({counter,floor})=>{const s=window.__game.scene.getScene('ExplorationScene');return{banker:s.objects.some(o=>o.id==='npc_banker'),counter:s.colliderViews.get(counter).img.displayWidth,floor:s.groundViews.get(floor).g};},{counter,floor});
   assert.equal(live.banker,false);assert.equal(live.counter,250);assert.equal(live.floor.w,430);assert.equal(live.floor.tileScale,0.65);
   assert.deepEqual(errors,[]);
   console.log(`  ✓ ${name}: «Играть с правками» отображает все изменения; ошибок и отсутствующих картинок нет`);
  }catch(e){await page.screenshot({path:path.join(out,`${name}-failure.png`)}).catch(()=>{});console.log(errors);throw e;}
  finally{await context.close();}
 }
}finally{await browser.close();await server.close();}
