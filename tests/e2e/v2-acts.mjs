import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(process.env.UI_BASE_URL || 'http://127.0.0.1:5196/');
  const scene = loc=>page.waitForFunction(id=>{
    const world=window.__game?.scene.getScene('ExplorationScene');
    return world?.sys.isActive() && world.loc?.id===id && world.canAct();
  },loc,{timeout:60000});
  const ready=()=>page.waitForFunction(()=>{
    const world=window.__game?.scene.getScene('ExplorationScene');
    return world?.sys.isActive()&&world.canAct();
  });
  const modal=()=>page.waitForFunction(()=>!!window.__game.scene.getScene('UIScene').modal);
  async function next() {
    await modal();
    return page.evaluate(()=>{
      const ui=window.__game.scene.getScene('UIScene');
      const pages=[];
      do {
        if (ui.modal.opts?.chapterDialogue) pages.push([ui.modal.opts.title,ui.modal.opts.text]);
        ui.pressModalButton(true);
      } while (ui.modal?.opts?.chapterDialogue);
      return pages;
    });
  }
  const data=()=>page.evaluate(()=>window.__witch.state.getObject('horizon_campaign'));
  async function stage(patch,reload=true) {
    await page.evaluate(patch=>{
      const state=window.__witch.state;
      state.setObject('horizon_campaign',{...state.getObject('horizon_campaign'),...patch});
      state.data.inventory={...state.data.inventory,coins:3000,moon_herb:30,tree_resin:20,potion_fire_flask:2,potion_life_small:3,potion_warm:2};
      state.save();
    },patch);
    if (reload) {
      const id=await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').loc.id);
      await page.reload();
      await scene(id);
    } else await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').refreshAll());
  }
  async function interact(id) {
    await ready();
    const found=await page.evaluate(id=>{
      const world=window.__game.scene.getScene('ExplorationScene');
      const o=world.objects.find(t=>t.id===id && t.isAvailable());
      if (!o) return {exists:false};
      const route=world.planPath(o.cfg.approach?.x ?? o.x,o.cfg.approach?.y ?? o.y);
      const distance=route?Math.hypot(o.x-route.end.x,o.y-route.end.y):Infinity;
      const walkable=distance<=o.radius;
      const from=[world.player.x,world.player.y];
      if (walkable) {
        world.player.setPosition(route.end.x,route.end.y);
        world.advanceCampaign(o.cfg,o.cfg.gift);
      }
      return {exists:true,walkable,distance,from,end:route?.end,place:world.loc.id,position:[o.x,o.y]};
    },id);
    assert.ok(found.exists,id+' should be available');
    assert.ok(found.walkable,id+' has no walkable approach: '+JSON.stringify(found));
  }
  const inBattle=()=>page.waitForFunction(()=>{
    const b=window.__game.scene.getScene('CombatScene');
    return b.sys.isActive()&&b.started&&!b.ended;
  });
  async function win(id, intro=false, epilogue=false) {
    await interact(id);
    if (intro) await next();
    await inBattle();
    const result=await page.evaluate(()=>{
      const s=window.__game.scene.getScene('CombatScene');
      const b=s.battle=new s.battle.constructor(s.context);
      const tactics=['telekinesis','fire','seal','crimson_burst','ice','lunar_veil'];
      for (let i=0;!b.result && i<3000;i++) {
        if (b.hero.hp<b.hero.maxHp*.68) b.command({type:'potion',id:'potion_life_small'});
        if (b.enemies.some(e=>e.id==='boss_august_grad' && e.castUntil)) b.command({type:'potion',id:'potion_warm'});
        if (b.enemies.some(e=>e.id==='boss_treegazer' && e.hp<e.maxHp*.8 && !e.shield)) b.command({type:'potion',id:'potion_fire_flask'});
        for (const gift of tactics) {
          const obj=Object.values(b.objects).find(item=>item.respawnAt<=b.tick && (gift==='telekinesis'?item.tag:gift==='fire'&&!item.tag));
          b.command(obj?{type:'cast_on_object',gift,object:obj.id}:{type:'cast',gift});
        }
        b.advance();
      }
      if (b.result) s.finishBattle();
      return b.result;
    });
    assert.equal(result,'victory',id);
    await next();
    if (epilogue) await next();
    await ready();
  }
  const q=(id,index=0)=>'v2-quest-'+id+'-'+index;
  await scene('mirra-hearth');
  await stage({step:'hunt',workbenchRestored:true,fox:true,huntLevel:21,wandRank:16,wandLevel:21,vigor:21,activeCompanion:'fox'});
  await win(q('first_anomaly'),true);
  await interact(q('first_anomaly',1)); await next();
  assert.equal((await data()).tasks.first_anomaly,2);
  assert.ok((await data()).gifts.crimson_burst);
  await interact('v2_bor_route');
  await scene('amberwood');
  let board=await page.evaluate(()=>{
    const world=window.__game.scene.getScene('ExplorationScene');
    return {bounds:world.loc.rect,targets:world.objects.filter(o=>o.cfg.field && o.isAvailable()).length,
      resources:world.objects.filter(o=>o.cfg.gatherTier&&o.isAvailable()).length,
      trail:world.planPath(21080,1190)?.complete,
      art:world.textures.get('horizon_amberwood').source[0].width};
  });
  assert.deepEqual([board.bounds.w,board.bounds.h,board.targets,board.resources,board.art],[3600,2400,12,18,1536]);
  assert.equal(board.trail,true,'A path connects the hearth road to the eastern trail over real bridges');
  assert.match(await page.evaluate(()=>window.__game.scene.getScene('UIScene').manaText.text),/^\d+ \/ \d+$/);
  await interact(q('green_page'));
  assert.deepEqual(await next(),[
    ['Веда','Запомни главное правило: обычные травы не жги зря в склянках.'],
    ['Веда','Влей траву и смолу прямо в страницу дара — подними её до Зелёной ступени!'],
  ]);
  await interact(q('green_page',1)); await interact(q('green_page',2)); await next();
  assert.equal((await data()).gifts.telekinesis.color,'green');
  await interact(q('bridge_beacon')); await next();
  assert.equal((await data()).tasks.bridge_beacon,1);
  await win(q('veda_cauldron'),true,true);
  await win(q('birch_ambush'),true,true);
  await interact(q('brook_flame')); await interact(q('brook_flame',1)); await next();
  await win(q('outpost'),true); await interact(q('outpost',1)); await next();
  const beforeBoss=await data();
  await stage({huntLevel:20,wandRank:20,wandLevel:20,vigor:20,loadout:['fire','telekinesis','lunar_veil'],
    gifts:Object.fromEntries(Object.entries(beforeBoss.gifts).map(([id,g])=>[id,{...g,rank:20,stars:2,color:'green'}])),
    amulet:'amulet_forest',amuletLevels:{amulet_forest:1}},false);
  await win(q('treegazer'),true,true);
  assert.equal((await data()).tasks.treegazer,1);
  console.log('Amberwood loaded, 12 rotating marks, 18 gather points, bridges and first quest chain verified.');

  await interact('v2_town_route');
  await scene('city');
  board=await page.evaluate(()=>{
    const w=window.__game.scene.getScene('ExplorationScene');
    const findFountain=()=>w.colliderObjects.find(o=>o.texture?.key?.includes('fountain'));
    return {bounds:w.loc.rect,targets:w.objects.filter(o=>o.cfg.field&&o.isAvailable()).length,
      gate:w.questGates[0]?.solid.body.enable,frame:findFountain()?.texture.key};
  });
  assert.deepEqual([board.bounds.w,board.bounds.h,board.targets],[2880,5760,12]);
  assert.equal(board.gate,true); assert.equal(board.frame,'city_final_fountain_frozen');
  await stage({huntLevel:40,wandRank:30,wandLevel:40,vigor:40},false);
  await win(q('fountain'),true,true);
  assert.equal((await data()).tasks.fountain,1);
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').colliderObjects.find(o=>o.texture?.key?.includes('fountain'))?.texture.key),'city_final_fountain');
  await interact('door_archive'); await scene('city_archive');
  assert.deepEqual(await page.evaluate(()=>{
    const world=window.__game.scene.getScene('ExplorationScene');
    return [world.bounds.w,world.bounds.h,world.groundViews.has('floor_city_archive')];
  }),[900,1500,true]);
  await interact(q('klara')); await next();
  await interact('room_exit_archive'); await scene('city');
  await win(q('pavement')); await interact(q('pavement',1)); await interact(q('pavement',2)); await next();
  await interact('door_archive'); await scene('city_archive');
  await interact(q('archive'));
  assert.deepEqual((await next())[1],[
    'Ведомость Архива','Август Град. Общество Преображения\nПоставки на Южный склад А и Южный склад Б.',
  ]);
  await interact('room_exit_archive'); await scene('city');
  // B competes with A in the same section of the journal but has its own persisted checkpoint.
  await interact('door_warehouse_b'); await scene('city_warehouse_b');
  await win(q('warehouse_b'),true); await interact(q('warehouse_b',1)); await next();
  assert.deepEqual([(await data()).tasks.warehouse_b,(await data()).tasks.warehouse_a],[2,undefined]);
  await page.reload(); await scene('city_warehouse_b');
  assert.equal((await data()).tasks.warehouse_b,2);
  await interact('room_exit_warehouse_b'); await scene('city');
  await interact('door_warehouse_a'); await scene('city_warehouse_a');
  await win(q('warehouse_a')); await interact(q('warehouse_a',1)); await next();
  assert.deepEqual([(await data()).tasks.warehouse_a,(await data()).tasks.warehouse_b],[2,2]);
  assert.ok((await data()).gifts.ice);
  await interact('room_exit_warehouse_a'); await scene('city');
  await interact('door_society'); await scene('city_society');
  await interact(q('cold_truth')); await next();
  await interact('room_exit_society'); await scene('city');
  await win(q('cold_truth',1),true,true);
  await interact(q('bridge_wall')); await next();
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('ExplorationScene').questGates[0].solid.body.enable),false);
  await win(q('cellar_house'),true); await interact(q('cellar_house',1)); await next();
  await win(q('rescue_house')); await interact(q('rescue_house',1)); await next();
  assert.equal((await data()).activeCompanion,'robin');
  await interact(q('flood')); await next();
  await win(q('flood',1),false,true);
  console.log('Svetlodol fountain, both warehouses, the cold wall and ice crossing verified.');
  await interact(q('lab_seal'));
  await interact('door_lab'); await scene('city_lab');
  await win(q('lab_seal',1),true,true);
  await win(q('lab_journal')); await interact(q('lab_journal',1)); await next();
  await interact('room_exit_lab'); await scene('city');
  await interact(q('august')); await next();
  await interact('door_duel'); await scene('city_duel');
  const end=await data();
  await stage({loadout:['fire','ice','seal'],vigor:40,wandLevel:40,
    gifts:Object.fromEntries(Object.entries(end.gifts).map(([id,g])=>[id,{...g,rank:40,stars:2,color:'green'}]))},false);
  await win(q('august',1),true); await interact(q('august',2)); await next();
  assert.equal((await data()).tasks.august,3);
  assert.deepEqual(errors,[]);
  console.log('Act II browser walkthrough: fountain, rooms, both independent warehouses, bridge, rescued companion, lab and August’s letters.');
} finally {
  await browser.close();
}
