// Browser plugin not available. Real Phaser + DOM + pointer input through Playwright.
// ?edit -> search/add/edit/delete/undo -> reload -> ?draft renders the same map.
// На ПК дополнительно: карта между панелями, подсветка под курсором, меню правой кнопки, рамка с Shift,
// перенос группы одним шагом отмены, Ctrl+C/V под курсор, перетаскивание из каталога, кисть, Tab, клавиши в русской раскладке.
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
  page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&/\/assets\//.test(r.url()))errors.push(`${r.status()} ${r.url()}`);});
  const ed=(fn,arg)=>page.evaluate(fn,arg);
  try{
   await page.goto('http://127.0.0.1:5184/?edit');
   await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.editor,null,{timeout:120000});
   assert.match(await page.title(),/Колдовство/);
   const panel=page.locator('#me-panel');await panel.waitFor();
   assert.equal(await page.locator('vite-error-overlay').count(),0);
   const catalog=await page.evaluate(async()=>{const {ASSET_CATALOG}=await import('/src/world/assetCatalog.js');const{ASSET_FILES}=await import('/src/config/assets.manifest.js');return{count:ASSET_CATALOG.length,expected:Object.values(ASSET_FILES).filter(Boolean).length};});
   assert.equal(catalog.count,catalog.expected);assert.ok(catalog.count>200);
   // Карта без затемнения при входе; на ПК холст занимает место между панелями, на телефоне — весь экран.
   const layout=await ed(()=>{const s=window.__game.scene.getScene('ExplorationScene'),r=s.game.canvas.getBoundingClientRect();return{fade:s.cameras.main.fadeEffect.isRunning,desk:document.documentElement.classList.contains('me-desktop'),x:r.x,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};});
   assert.equal(layout.fade,false);assert.equal(layout.desk,name==='desktop');
   if(name==='desktop'){assert.ok(layout.x>=250&&layout.w>=700&&layout.w>=layout.vw-layout.x-320,JSON.stringify(layout));}
   else assert.ok(layout.w>=layout.vw-1&&layout.h>=layout.vh-1,JSON.stringify(layout));
   const search=panel.locator('[data-r=asset-search]');
   const catalogTab=async()=>{await panel.locator('[data-tabbtn=catalog]').click();};
   // «Объекты на карте»: фильтр, поиск по id, щелчок по строке списка
   const pick=async(filter,id)=>{
    await panel.locator('[data-tabbtn=list]').click();await panel.locator(`[data-filter=${filter}]`).click();
    await panel.locator('[data-r=entity-search]').fill(id);await panel.locator(`[data-entity="${id}"]`).click();
    assert.equal(await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.selectedId),id);
   };
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
   // A real canvas drag, with touch events on the mobile profile. Panels are hidden first (Tab on a PC).
   await panel.locator('[data-a=min]').click();
   const point=await page.evaluate(id=>{
    const s=window.__game.scene.getScene('ExplorationScene'),e=s.editor.find(id),c=s.cameras.main;
    c.setZoom(1);c.centerOn(e.img.x,e.img.y-e.img.displayHeight/2);c.preRender();s.editor.select(null);
    const b=e.img.getBounds();return{x:(b.centerX-c.worldView.x)*c.zoom,y:(b.centerY-c.worldView.y)*c.zoom,w:window.__game.scale.width,h:window.__game.scale.height};
   },id);
   const box=await page.locator('canvas').first().boundingBox();
   if(name==='desktop')assert.ok(box.x<2&&box.width>=viewport.width-2,'Tab/«Спрятать панели» отдаёт карте всю ширину');
   const p={x:box.x+point.x*box.width/point.w,y:box.y+point.y*box.height/point.h};
   const end={x:p.x+60*box.width/point.w,y:p.y+30*box.height/point.h};
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
   const walkableLamp=await page.evaluate(()=>[...window.__game.scene.getScene('ExplorationScene').propViews.values()].find(v=>v.p.k==='city_walk_lamp'&&v.blocker).p.id);
   await pick('prop',walkableLamp);await field('collision').selectOption('none');
   await pick('prop',walkableLamp);
   await panel.locator('[data-a=delete]').click();await panel.locator('[data-a=undo]').click();
   // Furniture shares its saved collider record; rendered size is independent of its footprint.
   const counter=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.cols.find(c=>c.tex==='city_final_bank_counter').id);
   await pick('col',counter);await set('x',10400);await set('w',250);
   // A storyline entity can be removed and restored; deletion survives reload.
   await pick('obj','npc_banker');
   await set('a',20);assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selected.img.angle),20);
   await panel.locator('[data-a=undo]').click();assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selected.img.angle),0);
   await panel.locator('[data-a=delete]').click();await panel.locator('[data-a=undo]').click();await panel.locator('[data-a=redo]').click();
   assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.buildEdits().pos.npc_banker),null);
   await panel.locator('[data-a=check]').click();assert.match(await panel.locator('[data-r=status]').innerText(),/удалён/);
   assert.equal(await panel.locator('[data-r=problems]').isVisible(),true,'результаты проверки — списком');
   assert.match(await panel.locator('[data-r=problems]').innerText(),/npc_banker/);
   await panel.locator('[data-a=problems_close]').click();
   await pick('obj','npc_mirra');
   await set('w',100);await set('a',25);await set('alpha',0.6);await panel.locator('[data-a=flip]').click();
   // Native enemy scale must not distort an exact width entered in the inspector.
   const largeEnemy=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').enemies.find(e=>e.cfg.scale>1).id);
   await pick('enemy',largeEnemy);await set('w',200);
   assert.ok(Math.abs(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selected.img.displayWidth)-200)<0.01);
   await panel.locator('[data-a=undo]').click();
   // Floor records also persist, and can be resized and retextured.
   const floor=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.grounds.find(g=>g.id==='floor_city_bank').id);
   await pick('ground',floor);await set('w',430);await set('tileScale',0.65);
   await pick('prop',id);
   await catalogTab();await search.fill('ящик');await panel.locator('[data-asset=crate_01]').click();await panel.locator('[data-a=replace]').click();
   assert.equal(await page.evaluate(id=>window.__game.scene.getScene('ExplorationScene').editor.find(id).ref.p.k,id),'crate_01');
   await panel.locator('[data-a=undo]').click();
   // Current city artwork and linked building geometry must survive every editor path.
   await panel.locator('[data-r=location]').selectOption('city');
   await search.fill('Банк');await panel.locator('[data-asset=city_final_bank_exterior]').click();
   await page.waitForFunction(()=>{const cv=document.querySelector('[data-r=asset-preview] canvas');return cv&&cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data.some(v=>v>0);});
   await pick('col','city_plan_building_bank');
   const bankBefore=await page.evaluate(()=>{const e=window.__game.scene.getScene('ExplorationScene').editor;return{ref:structuredClone(e.selected.ref),door:structuredClone(e.scene.objects.find(o=>o.id==='door_bank').cfg),exit:structuredClone(e.scene.objects.find(o=>o.id==='room_exit_bank').cfg)};});
   const bankX=bankBefore.ref.x+bankBefore.ref.w/2;
   await set('x',bankX+120);
   const bankState=()=>page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene'),v=s.colliderViews.get('city_plan_building_bank');return{x:v.img.x,y:v.img.y,door:s.objects.find(o=>o.id==='door_bank').cfg,exit:s.objects.find(o=>o.id==='room_exit_bank').cfg};});
   let bankMoved=await bankState();
   assert.equal(bankMoved.door.x,bankBefore.door.x+120);assert.equal(bankMoved.x,bankMoved.door.x);
   assert.deepEqual(bankMoved.door.target,bankBefore.door.target);assert.equal(bankMoved.exit.target.x,bankBefore.exit.target.x+120);
   await panel.locator('[data-a=undo]').click();assert.equal((await bankState()).x,bankMoved.x-120);
   await panel.locator('[data-a=redo]').click();assert.equal((await bankState()).x,bankMoved.x);
   await panel.locator('[data-a=dup]').click();
   assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selected.ref.building),undefined);
   await panel.locator('[data-a=delete]').click();
   await pick('ground','city_lawn');
   await set('tileScale',0.9);
   await panel.locator('[data-a=fit]').click();
   assert.ok(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').cameras.main.zoom)<0.3);
   // Canal width uses its actual half-width, without writing an unused road width.
   await panel.locator('[data-a=mode_terrain]').click();
   const canal=await page.evaluate(()=>{const e=window.__game.scene.getScene('ExplorationScene').editor; e.selectT({kind:'water',id:'city_canal',i:0});return e.selShape.half;});
   await panel.locator('[data-a=wider]').click();assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selShape.half),canal+4);
   // Exact width field: 2 × half-width of the canal.
   await panel.locator('[data-t=cw]').fill(String((canal+10)*2));await panel.locator('[data-t=cw]').press('Enter');
   assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selShape.half),canal+10);
   await panel.locator('[data-a=undo]').click();await panel.locator('[data-a=undo]').click();
   assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.selShape.half),canal);
   await panel.locator('[data-a=mode_props]').click();
   console.log(`  ✓ ${name}: новый фасад, перенос дома/входа/возврата, отмена, трава и канал`);
   if(name==='desktop'){
    // фильтр «Полы» остался от прошлого шага: строка внизу об этом предупреждает; возвращаем «Все»
    assert.match(await panel.locator('[data-r=sel-status]').innerText(),/только: полы/);
    await panel.locator('[data-tabbtn=list]').click();await panel.locator('[data-filter=all]').click();await panel.locator('[data-r=entity-search]').fill('');
    await catalogTab();
    // Screen position of a world point; the map sits between the panels.
    const screenOf=(x,y)=>ed(({x,y})=>{const s=window.__game.scene.getScene('ExplorationScene'),c=s.cameras.main;c.preRender();const r=s.game.canvas.getBoundingClientRect(),sc=s.scale;
     return{x:r.left+(x-c.worldView.x)*c.zoom*r.width/sc.width,y:r.top+(y-c.worldView.y)*c.zoom*r.height/sc.height};},{x,y});
    await panel.locator('[data-r=location]').selectOption('forest');
    await ed(()=>{const e=window.__game.scene.getScene('ExplorationScene').editor;e.cam.setZoom(0.8);e.cam.centerOn(900,4600);e.select(null);});
    // Hover: outline and a label with the object name, without selecting it.
    // дерево, куст или камень, который под курсором выбирается сам (а не мелкий объект рядом)
    const target=await ed(()=>{const e=window.__game.scene.getScene('ExplorationScene').editor;e.cam.preRender();const t=e.pickEntities().find(x=>x.kind==='prop'&&/^(tree|bush|rock)_/.test(x.ref.p.k)&&Math.abs(x.x-900)<380&&Math.abs(x.y-4600)<220&&e.pickNear(x.x,x.y-12)?.id===x.id);return{id:t.id,x:t.x,y:t.y-12};});
    let sp=await screenOf(target.x,target.y);
    await page.mouse.move(sp.x,sp.y);await page.waitForTimeout(250);
    const hovered=await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.hover?.id);
    assert.equal(hovered,target.id,'объект под курсором подсвечен');
    assert.equal(await panel.locator('[data-r=tip]').isVisible(),true);
    assert.match(await panel.locator('[data-r=tip]').innerText(),new RegExp(hovered));
    assert.match(await panel.locator('[data-r=cursor]').innerText(),/Лес Мирры/);
    assert.equal(await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.selectedId),null,'подсветка не выбирает');
    // Right click: menu for the object under the cursor; Esc closes it.
    await page.mouse.click(sp.x,sp.y,{button:'right'});
    assert.equal(await panel.locator('[data-r=menu]').isVisible(),true);
    assert.equal(await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.selectedId),hovered);
    assert.match(await panel.locator('[data-r=menu]').innerText(),/Копировать[\s\S]*Удалить/);
    await page.keyboard.press('Escape');assert.equal(await panel.locator('[data-r=menu]').isHidden(),true);
    // Щелчок по карте при открытом меню только закрывает его и ничего не выбирает.
    await page.mouse.click(sp.x,sp.y,{button:'right'});assert.equal(await panel.locator('[data-r=menu]').isVisible(),true);
    await page.mouse.click(sp.x+180,sp.y+60);
    assert.equal(await panel.locator('[data-r=menu]').isHidden(),true);
    assert.equal(await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.selectedId),hovered,'щелчок мимо меню не меняет выбор');
    // Alt + перетаскивание: тянется копия, оригинал остаётся; копия и перенос отменяются одним шагом.
    const orig=await ed(id=>{const e=window.__game.scene.getScene('ExplorationScene').editor.find(id);return{x:e.x,y:e.y};},hovered);
    const props0=await ed(()=>window.__game.scene.getScene('ExplorationScene').propViews.size);
    await page.keyboard.down('Alt');await page.mouse.move(sp.x,sp.y);await page.mouse.down();await page.mouse.move(sp.x+60,sp.y+20,{steps:5});await page.mouse.up();await page.keyboard.up('Alt');
    const altCopy=await ed(id=>{const s=window.__game.scene.getScene('ExplorationScene'),e=s.editor,o=e.find(id),c=e.selected;return{orig:{x:o.x,y:o.y},copy:{id:c.id,x:c.x,y:c.y},n:s.propViews.size};},hovered);
    assert.deepEqual(altCopy.orig,orig);assert.notEqual(altCopy.copy.id,hovered);assert.ok(altCopy.copy.x>orig.x&&altCopy.n===props0+1,JSON.stringify(altCopy));
    await page.keyboard.press('Control+KeyZ');
    assert.equal(await ed(()=>window.__game.scene.getScene('ExplorationScene').propViews.size),props0,'одна отмена убирает копию');
    // Shift + frame selects a group even when it starts on a tree; one drag moves all, one undo returns all.
    const a=await screenOf(650,4420),b=await screenOf(1150,4700);
    await page.keyboard.down('Shift');await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();await page.keyboard.up('Shift');
    const group=await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.selection().map(e=>({id:e.id,x:e.x,y:e.y})));
    assert.ok(group.length>=4,`рамка выбрала ${group.length}`);
    // тянем за того из выбранных, кто действительно оказывается под курсором
    const g0=await ed(ids=>{const e=window.__game.scene.getScene('ExplorationScene').editor;return ids.map(id=>e.find(id)).find(x=>e.pickNear(x.x,x.y-8)?.id===x.id)?.id;},group.map(g=>g.id));
    assert.ok(g0,'в группе есть объект, за который можно взяться');
    const gObj=group.find(g=>g.id===g0),gp=await screenOf(gObj.x,gObj.y-8);
    await page.mouse.move(gp.x,gp.y);await page.mouse.down();await page.mouse.move(gp.x+48,gp.y+24,{steps:5});await page.mouse.up();
    const movedGroup=await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.selection().map(e=>({id:e.id,x:e.x,y:e.y})));
    const delta=movedGroup.map(m=>{const o=group.find(g=>g.id===m.id);return[m.x-o.x,m.y-o.y];});
    assert.ok(delta.every(d=>d[0]===delta[0][0]&&d[1]===delta[0][1])&&delta[0][0]>0,JSON.stringify(delta));
    assert.match(await panel.locator('[data-a=undo]').getAttribute('title'),/перенос \d+ объектов/);
    await page.keyboard.press('Control+z');
    const back=await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.selection().map(e=>({id:e.id,x:e.x,y:e.y})));
    assert.deepEqual(back.sort((p,q)=>p.id.localeCompare(q.id)),group.sort((p,q)=>p.id.localeCompare(q.id)));
    // Ctrl+C / Ctrl+V: the copy lands under the cursor. Keys work by physical key (Russian layout too).
    await ed(id=>window.__game.scene.getScene('ExplorationScene').editor.select(id),target.id);
    await page.keyboard.press('Control+KeyC');
    const pastePoint=await screenOf(1240,4380);await page.mouse.move(pastePoint.x,pastePoint.y);
    await page.keyboard.press('Control+KeyV');
    const pasted=await ed(()=>{const e=window.__game.scene.getScene('ExplorationScene').editor.selected;return{id:e.id,x:e.x,y:e.y};});
    assert.notEqual(pasted.id,target.id);assert.ok(Math.abs(pasted.x-1240)<=3&&Math.abs(pasted.y-4380)<=3,JSON.stringify(pasted));
    const before=await ed(()=>window.__game.scene.getScene('ExplorationScene').propViews.size);
    await page.keyboard.press('KeyD');   // «в» в русской раскладке — та же клавиша
    assert.equal(await ed(()=>window.__game.scene.getScene('ExplorationScene').propViews.size),before+1);
    await page.keyboard.press('Delete');await page.keyboard.press('Control+KeyZ');
    assert.equal(await ed(()=>window.__game.scene.getScene('ExplorationScene').propViews.size),before+1,'одно нажатие Ctrl+Z — одна отмена');
    // Drag a picture from the catalog onto the map: it lands where it was dropped.
    await search.fill('фонарь');
    const dropAt=await screenOf(980,4560),cbox=await page.locator('canvas').first().boundingBox();
    await panel.locator('[data-asset=city_walk_lamp]').dragTo(page.locator('canvas').first(),{targetPosition:{x:dropAt.x-cbox.x,y:dropAt.y-cbox.y}});
    const dropped=await ed(()=>{const s=window.__game.scene.getScene('ExplorationScene').editor.selected;return{k:s.ref.p.k,x:s.x,y:s.y};});
    assert.equal(dropped.k,'city_walk_lamp');assert.ok(Math.abs(dropped.x-980)<=3&&Math.abs(dropped.y-4560)<=3,JSON.stringify(dropped));
    // Brush: every click places the chosen picture; Esc ends it.
    await panel.locator('[data-a=brush]').click();
    const lamps=()=>ed(()=>[...window.__game.scene.getScene('ExplorationScene').propViews.values()].filter(v=>v.p.k==='city_walk_lamp').length);
    const lamps0=await lamps();
    for(const [x,y] of [[860,4480],[920,4480]]){const q=await screenOf(x,y);await page.mouse.click(q.x,q.y);}
    assert.equal(await lamps(),lamps0+2);
    await page.keyboard.press('Escape');
    assert.equal(await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.brush),false);
    // Double click on a road adds a point; the exact width field changes the road.
    await page.keyboard.press('Digit2');
    await ed(()=>{const e=window.__game.scene.getScene('ExplorationScene').editor;e.focusShape('road:cross');});
    const road=await ed(()=>{const e=window.__game.scene.getScene('ExplorationScene').editor,p=e.selShape.pts,x=(p[1][0]+p[2][0])/2,y=(p[1][1]+p[2][1])/2;e.cam.centerOn(x,y);return{n:p.length,x,y};});
    const near=await ed(({x,y})=>{const e=window.__game.scene.getScene('ExplorationScene').editor;return!!e.segmentHit(x,y)&&!e.handleAt(x,y);},road);
    if(near){const r=await screenOf(road.x,road.y);await page.mouse.dblclick(r.x,r.y);
     assert.equal(await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.selShape.pts.length),road.n+1,'двойной клик добавил точку');
     await page.keyboard.press('Control+KeyZ');}
    await panel.locator('[data-t=w]').fill('140');await panel.locator('[data-t=w]').press('Enter');
    assert.equal(await ed(()=>window.__game.scene.getScene('ExplorationScene').editor.selShape.w),140);
    await page.keyboard.press('Control+KeyZ');
    await page.keyboard.press('Digit1');
    // Help with all shortcuts.
    await page.keyboard.press('Shift+Slash');assert.equal(await panel.locator('[data-r=help]').isVisible(),true);
    await page.keyboard.press('Escape');assert.equal(await panel.locator('[data-r=help]').isHidden(),true);
    await page.screenshot({path:path.join(out,`${name}-pc-tools.png`)});
    console.log(`  ✓ ${name}: подсветка, меню правой кнопки, рамка и перенос группы, Ctrl+C/V под курсор, перетаскивание из каталога, кисть, точки и ширина дороги, справка`);
   }
   const saved=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.buildEdits());
   await page.reload();await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.editor);
   assert.deepEqual(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.buildEdits()),saved);
   assert.equal((await bankState()).x,bankMoved.x);
   assert.deepEqual(await page.evaluate(()=>{const im=window.__game.scene.getScene('ExplorationScene').editor.find('npc_mirra').img;return{w:Math.round(im.displayWidth*10000)/10000,a:im.angle,alpha:im.alpha,f:im.flipX};}),{w:100,a:25,alpha:0.6,f:true});
   assert.match(await panel.locator('[data-r=saved]').innerText(),/не в игре: \d+/,'строка внизу говорит, сколько правок ещё не в файле игры');
   await panel.locator('[data-a=file]').click();
   const downloaded=page.waitForEvent('download');await panel.locator('[data-a=download]').click();
   const file=path.join(out,`${name}-world.edits.js`);await (await downloaded).saveAs(file);
   const {parseEditsFile}=await import('../../src/world/mapData.js');
   assert.deepEqual(parseEditsFile(await fs.readFile(file,'utf8')),saved);
   await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),panel.locator('[data-r=import]').setInputFiles(file)]);
   await page.waitForFunction(()=>window.__game?.scene.getScene('ExplorationScene')?.editor);
   assert.deepEqual(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').editor.buildEdits()),saved);
   assert.equal((await bankState()).x,bankMoved.x);
   console.log(`  ✓ ${name}: фонарь, мебель, сюжетные объекты и полы редактируются; черновик восстановлен точно`);
   await panel.locator('[data-r=location]').selectOption('city');await search.fill('фонарь');
   if(name==='mobile')await panel.locator('[data-r=assets]').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,`${name}-editor.png`)});
   // Play preview must use the same saved assets, styles, collisions and deleted entities.
   await panel.locator('[data-a=play]').click();await page.waitForFunction(()=>window.__game?.scene.isActive('UIScene')&&window.__game.scene.getScene('ExplorationScene')?.player);
   assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('me-desktop')),false,'в игре раскладка редактора снята');
   data=await page.evaluate(id=>{const s=window.__game.scene.getScene('ExplorationScene'),v=s.propViews.get(id);return{p:v.p,w:v.img.displayWidth,h:v.img.displayHeight,angle:v.img.angle,flip:v.img.flipX,body:v.blocker.body.width};},id);
   assert.equal(data.p.k,'city_crate');assert.ok(Math.abs(data.w-168)<0.01);assert.ok(Math.abs(data.h-140)<0.01);assert.equal(data.angle,15);assert.equal(data.flip,true);assert.equal(data.body,70);
   assert.deepEqual(await page.evaluate(()=>{const im=window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id==='npc_mirra').sprite;return{w:Math.round(im.displayWidth*10000)/10000,a:im.angle,alpha:im.alpha,f:im.flipX};}),{w:100,a:25,alpha:0.6,f:true});
   await page.evaluate(()=>{const w=window.__witch;w.state.markEvent('ch2_start');w.bus.emit('story:map-travel','city');});
   await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city');
   assert.equal(await page.evaluate(id=>!!window.__game.scene.getScene('ExplorationScene').propViews.get(id).blocker,walkableLamp),false);
   const liveDoor=await page.evaluate(()=>{const s=window.__game.scene.getScene('ExplorationScene'),d=s.objects.find(o=>o.id==='door_bank');return{x:d.x,target:d.cfg.target};});
   assert.equal(liveDoor.x,bankMoved.door.x);assert.deepEqual(liveDoor.target,bankBefore.door.target);
   await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id==='door_bank').interact());
   await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city_bank'&&window.__witch.mode==='exploration');
   const live=await page.evaluate(({counter,floor})=>{const s=window.__game.scene.getScene('ExplorationScene');return{banker:s.objects.some(o=>o.id==='npc_banker'),counter:s.colliderViews.get(counter).img.displayWidth,floor:s.groundViews.get(floor).g};},{counter,floor});
   assert.equal(live.banker,false);assert.equal(live.counter,250);assert.equal(live.floor.w,430);assert.equal(live.floor.tileScale,0.65);
   const returnX=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id==='room_exit_bank').cfg.target.x);
   assert.equal(returnX,bankMoved.exit.target.x);
   await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').objects.find(o=>o.id==='room_exit_bank').interact());
   await page.waitForFunction(()=>window.__game.scene.getScene('ExplorationScene').loc?.id==='city'&&window.__witch.mode==='exploration');
   assert.deepEqual(errors,[]);
   console.log(`  ✓ ${name}: «Играть с правками» отображает все изменения; ошибок и отсутствующих картинок нет`);
  }catch(e){await page.screenshot({path:path.join(out,`${name}-failure.png`)}).catch(()=>{});console.log(errors);throw e;}
  finally{await context.close();}
 }
}finally{await browser.close();await server.close();}
