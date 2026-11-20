import { cityPoint } from '../config/city.plan.js';
import { ACT_CITY_PORTALS, ACT_CITY_POSITIONS as CITY_POSITIONS } from './rooms.js';
import { COLORS, DEPTH, PLAYER } from '../config/game.config.js';
import { MOBS_41, PACKS, ECONOMY } from '../config/horizon/rules.js';
import { applyDisplaySize } from '../objects/InteractiveObject.js';
import { BOR, BOR_TRACT, borPoint, CITY_ACTORS, HEARTH_TRAIL, TOWN, TOWN_GATE, actLocationAt, gatherZones, spawnZones } from './regions.js';
import { claimAnomaly, dailyElite, disturbedAnomaly, fieldEncounter, gather, populateHunt, questDone, questStep, townOpen } from './actProgress.js';
import { QUESTS, QUEST_BY_ID } from './quests.js';
import { campaign, saveCampaign } from './campaign.js';
import { TIERS_41, itemLabel } from './progression.js';

const actTarget = (id, {x,y}, label, texture, opts) => ({
  x, y, id, kind:'horizon', action:id, label, texture, radius:112, ...opts,
});
const portal = (id, where, label, texture, to, at, lock) => actTarget(id,where,label,texture,{to,at,lock,portal:true});
const service=(kind,where,label,texture,more)=>actTarget('service-'+kind,where,label,texture,{service:kind,...more});
const asya=actTarget('v2-asya',CITY_ACTORS.asya,'Ася-Фонарщица','horizon_asya',{resident:true,service:'asya',height:90});

const portals = [
  portal('v2_bor_route',HEARTH_TRAIL,'Ярмарочная дорога','signpost_01',BOR.id,null,'hunt'),
  portal('v2_hearth_route',borPoint(46,443),'Дорога к Очагу Мирры','signpost_01','mirra-hearth',{x:1740,y:1110}),
  portal('v2_town_route',BOR_TRACT,'Восточный тракт в Светлодол','signpost_01','city',TOWN.arrival,'town'),
  portal('v2_bor_return',TOWN_GATE,'Южные ворота · Янтарный Бор','signpost_01',BOR.id,borPoint(690,188)),
  ...ACT_CITY_PORTALS.map(door => portal(door.id,door,door.hint || (door.room==='city'?'Выйти':'Войти'),null,door.room,door.target,
    ['city_lab','city_cellar','city_rescue','city_duel','city_warehouse_a','city_warehouse_b'].includes(door.room)?door.room:null)),
].map(row => row.texture ? row : { ...row, ghost:{w:135,h:90} });
export function canUsePortal(p,cfg) {
  switch(cfg.lock) {
    case 'hunt': return p.step==='hunt';
    case 'town': return townOpen(p);
    case 'city_lab': return (p.tasks.lab_seal || 0)>0;
    case 'city_cellar': return questDone(p,'cellar_house');
    case 'city_rescue': return questDone(p,'rescue_house');
    case 'city_duel': return questStep(p,QUEST_BY_ID.august)?.index!==0;
    case 'city_warehouse_a':
    case 'city_warehouse_b': return questDone(p,'archive');
    default: return true;
  }
}

const services = [
  service('hearth-forge',{x:910,y:664},'Верстак','table_01',{ghost:{w:110,h:72},when:'workbench'}),
  service('cauldron',{x:925,y:744},'Котёл алхимии','cauldron_01',{ghost:{w:70,h:85},when:'workbench'}),
  service('bor-camp',borPoint(99,414),'Привал Грома','campfire_01'),
  service('town-camp',CITY_ACTORS.grom,'Привал Грома','npc_goran'),
  service('trader',CITY_ACTORS.boris,'Лавка и амулеты Бориса','npc_merchant'),
  service('agenda',CITY_POSITIONS.city_board,'Доска поручений','notice_board_01'),
  service('vault',{x:CITY_POSITIONS.npc_banker.x+120,y:CITY_POSITIONS.npc_banker.y+90},'Банк Агаты','chest_01'),
  service('coven',{x:CITY_POSITIONS.npc_rowena.x+110,y:CITY_POSITIONS.npc_rowena.y+112},'Цели Ковена','magic_book_01'),
  service('duel',{x:CITY_POSITIONS.npc_duelist.x+84,y:CITY_POSITIONS.npc_duelist.y+175},'Зал Дуэлей','notice_board_01'),
];
const questTargets = QUESTS.flatMap(q => q.steps.map((step,index)=>{
  const first=step.pack && MOBS_41[PACKS[step.pack]?.archetypes?.[0]];
  return actTarget('v2-quest-'+q.id+'-'+index,step.where,step.label,step.texture||first?.sprite_key,{quest:q.id,index,gift:step.gift,pack:step.pack});
}));
const slots = [1,2].flatMap(tier=>spawnZones(tier).map((p,i)=>actTarget('v2-field-'+tier+'-'+i,p,'Отряд','enemy_scavenger_small',{field:tier,zone:i})));
const elites=[
  actTarget('v2-elite-1',borPoint(197,108),'Осколочная элита · Угольный Цап','enemy_scavenger',{elite:1,pack:'t1_elite_ember'}),
  actTarget('v2-elite-2',cityPoint(1760,2340),'Осколочная элита · Ледолом','enemy_experimental_construct',{elite:2,pack:'t2_elite_golem'}),
];
const sources = [1,2].flatMap(tier=>gatherZones(tier).map((p,i)=>{
  const kinds=TIERS_41['tier_'+tier];
  const id=i%3===0?kinds.rare_id:kinds.common_id;
  const tex=tier===1?(i%3===0?'resin_log_01':'moon_herb_01'):(i%3===0?'rune_sigil_01':'city_frost_herb');
  return actTarget('v2-gather-'+tier+'-'+i,p,itemLabel(id),tex,{gatherTier:tier,zone:i});
}));
const anomalySpots = {
  1:[borPoint(128,223),borPoint(367,175),borPoint(541,183),borPoint(165,340),borPoint(446,372),borPoint(597,242)],
  2:[cityPoint(1580,4600),cityPoint(1950,3960),cityPoint(2050,2872),cityPoint(1820,4650),cityPoint(1390,3750),cityPoint(2210,3500)],
};
const anomalyGifts=['fire','telekinesis','seal'];
const anomalies = [1,2].flatMap(tier=>anomalySpots[tier].map((point,i)=>actTarget('v2-anomaly-'+tier+'-'+i,point,
  'Стихийная аномалия','fire_circle_01',{anomaly:tier,zone:i,gift:anomalyGifts[i%3],size:[106,66]})));
export function actsTargets() { return [...portals,...services,asya,...questTargets,...slots,...sources,...anomalies,...elites]; }
export function runtimeEncounter(p,cfg) { return cfg.field?fieldEncounter(p,cfg.field,cfg.zone):null; }
export function actsTargetAvailable(p,cfg) {
  if (cfg.quest) return questStep(p,QUEST_BY_ID[cfg.quest])?.index===cfg.index;
  if (cfg.portal) return cfg.lock!=='hunt'||p.step==='hunt';
  if (cfg.service) return p.step==='hunt'&&(!cfg.when||questDone(p,cfg.when));
  if (p.step!=='hunt') return false;
  if (cfg.field) return !!runtimeEncounter(p,cfg);
  if (cfg.elite) return !!dailyElite(p,cfg.elite,Date.now());
  if (cfg.gatherTier) return (p.gathering.points?.[cfg.gatherTier+'-'+cfg.zone]||0)<=Date.now();
  if (cfg.anomaly) {
    const state=disturbedAnomaly(p,cfg.anomaly,cfg.zone%3,Date.now());
    return state.ready && state.generation%2===Math.floor(cfg.zone/3);
  }
  return true;
}

export function pollField(scene) {
  const tier=scene.loc.tier;
  if (!tier || campaign().step!=='hunt') return;
  const points=spawnZones(tier);
  const view=scene.cameras.main.worldView;
  const away=i=>points[i].x<view.x-100 || points[i].x>view.right+100 || points[i].y<view.y-100 || points[i].y>view.bottom+100;
  const bodies=scene.solids.getChildren().map(o=>o.body).filter(b=>b?.enable);
  const walkable=i=>!bodies.some(b=>points[i].x >= b.x-30 && points[i].x<=b.right+30 && points[i].y>=b.y-30&&points[i].y<=b.bottom+30);
  const p=campaign();
  const next=populateHunt(p,tier,Date.now(),away,walkable);
  if (next!==p) saveCampaign(next,{notify:false});
  for (const o of scene.objects) if (o.cfg.field || o.cfg.gatherTier || o.cfg.anomaly) o.refresh();
}

const staticDecor = {
  'mirra-hearth': [
    [{x:514,y:700},'cat_01','birch_cat'],[{x:481,y:765},'city_walk_herbbed','moon_bed'],
    [{x:493,y:637},'city_walk_flowerbed','apothecary_garden'],[{x:532,y:657},'lunar_altar_01','north_workshop'],
    [{x:818,y:600},'rune_slab_01','duel_lesson_2'],
  ],
  amberwood:[
    [borPoint(78,124),'ancient_gate_01'],[borPoint(96,414),'signpost_01'],
    [borPoint(238,340),'forest_node_restored','bridge_beacon'],
    [borPoint(396,127),'forest_node_restored','birch_ambush'],
    [borPoint(330,194),'forest_node_restored','brook_flame','firstStep'],
    [borPoint(418,105),'lunar_altar_01'],[borPoint(419,92),'lunar_flame_01','brook_flame'],
    [borPoint(99,407),'rune_sigil_01','horseshoe'],[borPoint(101,377),'corrupted_roots_01','treegazer'],
  ],
  city:[
    [cityPoint(1750,3419),'fx_glow','asya_lamp'],
    [cityPoint(1427,2690),'city_cat_grey','archive_cat'],
    [cityPoint(1901,1690),'city_lamp_01','rescue_house'],
    [cityPoint(1280,1840),'city_lamp_01','cellar_house'],
    [cityPoint(897,5175),'field_crystal','august'],
    [cityPoint(2075,880),'npc_tikhon','lab_seal'],
    [cityPoint(2150,895),'enemy_volunteer_miron','lab_seal'],
    [cityPoint(1363,4390),'city_walk_market_stall','martha_pies'],
  ],
  city_warehouse_a:[[CITY_POSITIONS.wh_equipment,'cat_01','warehouse_a']],
};
export function installActPresentation(scene) {
  scene.questDecor=(staticDecor[scene.loc.id]||[]).filter(([,tex])=>scene.textures.exists(tex)).map(([p,tex,flag,phase])=>{
    const img=applyDisplaySize(scene.add.image(p.x,p.y,tex),tex).setOrigin(.5,1).setDepth(DEPTH.mainBase+p.y);
    if (tex.startsWith('npc_') || tex==='enemy_volunteer_miron') img.setScale(PLAYER.displayHeight/img.height);
    if (tex==='fx_glow') img.setTint(0xffc464).setBlendMode('ADD').setDisplaySize(122,146);
    if (flag==='moon_bed' || flag==='apothecary_garden') img.setDisplaySize(108,68);
    return {img,flag,phase};
  });
  scene.groveGlow = null;
  if (scene.loc===BOR) {
    const altar=borPoint(414,102);
    const light=scene.add.image(altar.x,altar.y,'fx_glow').setTint(0xffc36d)
      .setDisplaySize(730,520).setBlendMode('ADD').setAlpha(.29).setDepth(DEPTH.fx - 2);
    const beams=scene.add.graphics().setBlendMode('ADD').setDepth(DEPTH.fx - 1);
    for (const source of [borPoint(238,335),borPoint(396,122),borPoint(330,189)]) {
      beams.lineStyle(8,0xf5ad43,.2).lineBetween(source.x,source.y,altar.x,altar.y);
      beams.lineStyle(2,0xffe29a,.65).lineBetween(source.x,source.y,altar.x,altar.y);
    }
    scene.groveGlow={light,beams};
  }
  scene.questGates=[];
  if (scene.loc.id==='city') {
    for (const [id,key,texture,width,h] of [
      ['bridge_wall','frost_barrier','ice_wall_01',132,45], ['flood','fq_water','water_patch_01',222,56],
    ]) {
      const pos=CITY_POSITIONS[key];
      const solid=scene.addBlocker(pos.x,pos.y,width,h);
      const art=applyDisplaySize(scene.add.image(pos.x,pos.y,texture),texture).setOrigin(.5,1).setDepth(DEPTH.mainBase+pos.y);
      if (id==='bridge_wall') art.setDisplaySize(170,103);
      else art.setDisplaySize(245,100);
      const crossing=id==='flood' ? scene.add.image(pos.x,pos.y-26,'ice_floor_01')
        .setDisplaySize(240,90).setDepth(DEPTH.path+1).setVisible(false) : null;
      scene.questGates.push({id,solid,art,crossing});
    }
  }
  refreshActPresentation(scene);
}

export function refreshActPresentation(scene) {
  const p=campaign();
  for (const row of scene.questDecor||[]) {
    row.img.setVisible(row.phase==='firstStep' ? p.tasks[row.flag]>0 : !row.flag||questDone(p,row.flag));
  }
  if (scene.groveGlow) {
    scene.groveGlow.beams.setVisible(p.tasks.brook_flame===1);
    scene.groveGlow.light.setVisible(questDone(p,'brook_flame'));
  }
  for (const gate of scene.questGates||[]) {
    const closed=gate.id==='flood' ? !(p.tasks.flood>0) : !questDone(p,gate.id);
    gate.solid.body.enable=closed;
    gate.crossing?.setVisible(!closed);
    if (gate.closed!==closed) {
      if (gate.closed===true) {
        scene.burst(gate.art.x,gate.art.y-40,COLORS.ice,24);
        scene.tweens.add({ targets:gate.art, alpha:0, duration:520, onComplete:()=>gate.art.setVisible(false) });
      } else gate.art.setVisible(closed);
      gate.closed=closed;
    }
  }
  if (scene.loc.id!=='city') return;
  const fountain=scene.colliderObjects?.find(o=>['city_final_fountain_frozen','city_final_fountain'].includes(o.texture?.key));
  if (fountain) {
    const key=questDone(p,'fountain')?'city_final_fountain':'city_final_fountain_frozen';
    if (fountain.texture.key!==key) {
      if (questDone(p,'fountain')) scene.burst(fountain.x,fountain.y-68,COLORS.ice,30);
      applyDisplaySize(fountain.setTexture(key),key);
    }
  }
  const quarter=scene.groundViews.get('city_frost_quarter')?.img;
  quarter?.setVisible(!questDone(p,'august')).setAlpha(p.tasks.flood>0?.13:questDone(p,'bridge_wall')?.25:.38);
  const plaza=scene.groundViews.get('city_frost_plaza')?.img;
  plaza?.setVisible(!questDone(p,'fountain')).setAlpha(.18);
}

export function claimWorldAction(scene,cfg,ability) {
  const p=campaign(), now=Date.now();
  if (cfg.gatherTier) {
    const result=gather(p,cfg.gatherTier,cfg.zone,now);
    if (!result) { scene.toast('Сбор недоступен. Проверь место в сумке.'); return; }
    saveCampaign(result.next);
    scene.toast(itemLabel(result.item)+' ×'+result.take);
  } else if (cfg.anomaly) {
    const gift=cfg.gift;
    if ((ability && ability!==gift)||!p.gifts[gift]) { scene.toast('Эта печать ждёт другой стихии.'); return; }
    const next=claimAnomaly(p,cfg.anomaly,cfg.zone%3,now);
    if (!next) return;
    saveCampaign(next);
    scene.castFx(cfg.x,cfg.y-25,COLORS[gift] || COLORS.gold);
    scene.toast('Аномалия раскрылась. Внутри материалы и осколки.');
  }
  scene.refreshAll();
}
export const regionForPoint = p=>actLocationAt(p)?.id;
