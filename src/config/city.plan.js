// Forest-sized streets and houses; interiors keep their independent playable space.
// Local blueprint coordinates are retained so quest routes share one consistent transform.
import { buildRoad } from '../world/terrain.js';
import { distToPolygon } from '../world/geometry.js';
export const CITY_ORIGIN = { x: 6720, y: 600 };
export const CITY_SCALE = 0.6;
const size = v => v * CITY_SCALE;
export const CITY_RECT = { x: 6288, y: 600, w: size(3720), h: size(4320) };
export const cityPoint = (x, y) => ({ x: CITY_ORIGIN.x + size(x), y: CITY_ORIGIN.y + size(y) });
export const legacyCityPoint = p => p && p.x >= 1800 && p.x < 3600 && p.y >= 1300 && p.y <= 5400;
export const BUILDINGS = [
  ['north_bay','Северный дом',560,100,540,420,830,520,null],
  ['north_workshop','Дом с мастерской',1900,100,560,420,2180,520,null],
  ['cellar','Дом с погребом',560,860,540,370,830,1230,'ch2_rescue_cellar'],
  ['rescue','Дом за ледяной дверью',1900,860,560,370,2180,1230,'ch2_rescue_door'],
  ['archive','Городской Архив',560,1640,540,420,830,2060,null],
  ['society','Общество Преображения',1900,1640,560,420,2180,2060,null],
  ['bank','Городской Банк',1960,2290,500,400,2210,2690,null],
  ['duel','Магическая Дуэль',500,2940,600,420,800,3360,'ch2_fin_seal'],
  ['coven','Дом Ковенов',1900,2940,560,420,2260,3360,null],
  ['warehouse_a','Склад А',500,3710,600,340,800,4050,null],
  ['warehouse_b','Склад Б',1900,3710,560,340,2180,4050,null],
  ['lab','Тайная лаборатория',-700,2920,380,380,-510,3300,'ch2_lab_open'],
].map(([id,name,x,y,w,h,dx,dy,requires]) => ({ id,name,...cityPoint(x,y),w:size(w),h:size(h),door:cityPoint(dx,dy),requires }));
const layouts = [
  ['bank','Городской Банк',10200,200,720,1440],
  ['archive','Городской Архив',11800,200,900,1500],
  ['society','Общество Преображения',13400,200,900,1320],
  ['lab','Тайная лаборатория',10200,2600,960,2160],
  ['duel','Магическая Дуэль',11800,2600,1080,1680],
  ['coven','Дом Ковенов',13400,2600,840,1440],
  ['warehouse','Складской комплекс',10200,5200,1440,1680],
  ['cellar','Дом с погребом',11800,5200,720,1440],
  ['rescue','Дом за ледяной дверью',13400,5200,720,1440],
];
export const CITY_ROOMS = layouts.map(([key,name,x,y,w,h]) => {
  const doors = BUILDINGS.filter(b => (key === 'warehouse' ? b.id.startsWith('warehouse_') : b.id === key));
  return { id:'city_'+key,key,name,interior:true,parent:'city',rect:{x,y,w,h},
    requires:doors[0]?.requires,lockedText:'Сначала завершите действие у входа.',
    arrival:{x:x+w/2,y:y+h-180},exit:'room_exit_'+doors[0].id,
    entrances:doors.map(b => 'door_'+b.id), extraTop:120,extraBottom:180 };
});
const room = key => CITY_ROOMS.find(r => r.key === key);
const rp = (key,x,y) => ({x:room(key).rect.x+x,y:room(key).rect.y+y});
export const CITY_PORTALS = BUILDINGS.filter(b => !b.id.startsWith('north_')).flatMap(b => {
  const key=b.id.startsWith('warehouse_')?'warehouse':b.id,r=room(key);
  const entryX=key==='warehouse'?(b.id==='warehouse_a'?300:1140):r.rect.w/2;
  const inside=rp(key,entryX,r.rect.h-180);
  return [
    {id:'door_'+b.id,kind:'room_door',x:b.door.x,y:b.door.y+28,ghost:{w:120,h:80},radius:110,
      target:inside,room:r.id,hint:'Войти: '+b.name,requiresEvent:b.requires},
    {id:'room_exit_'+b.id,kind:'room_door',...rp(key,entryX,r.rect.h-55),ghost:{w:160,h:80},radius:130,
      target:{x:b.door.x,y:b.door.y+100},room:'city',hint:'Выйти: '+b.name},
  ];
});
export const CITY_POSITIONS = Object.fromEntries([
  ['exit_city',cityPoint(-650,2510)],['frostherb_r1',cityPoint(-480,2380)],['frostherb_r2',cityPoint(-500,2800)],['resin_r1',cityPoint(-660,2640)],
  ['city_board',cityPoint(640,2430)],['npc_merchant',cityPoint(2530,3020)],
  ['plaza_trace',cityPoint(1540,2740)],['plaza_debris',cityPoint(1930,2370)],
  ['sapphire_city_cache_1',cityPoint(730,2710)],['sapphire_city_cache_2',cityPoint(2040,3470)],
  // The document sorts one pixel in front of the desk, with its art on the tabletop.
  ['npc_ilaria',rp('archive',260,1050)],['archive_document',{...rp('archive',330,716),elevated:41}],
  ['npc_severin',rp('society',360,710)],['npc_banker',{...rp('bank',360,350),approach:rp('bank',360,510)}],
  ['npc_rowena',rp('coven',270,610)],['npc_duelist',rp('duel',260,1280)],
  ['frost_barrier',{...cityPoint(1500,1520),collide:{w:size(540),h:size(40)},editorStyle:{w:size(580),h:120}}],
  ['fq_water',{...cityPoint(1500,780),collide:{w:size(540),h:size(40)},editorStyle:{w:size(540),h:70}}],
  ['ice_construct',cityPoint(1230,1350)],['npc_nerys',cityPoint(1580,1230)],
  ['fq_cellar',cityPoint(1010,1280)],['fq_door',cityPoint(2180,1280)],['fq_cauldron',cityPoint(1950,1350)],
  ['lab_seal',cityPoint(-510,3340)],['lab_herb_1',rp('lab',140,720)],['lab_herb_2',rp('lab',810,940)],
  ['lab_chest',rp('lab',160,1880)],['lab_cauldron',rp('lab',820,1880)],
  ['npc_tikhon',rp('lab',240,1540)],['lab_journal',{...rp('lab',710,1786),elevated:41}],
  ['wh_cargo',rp('warehouse',1110,440)],['wh_equipment',rp('warehouse',400,630)],
  ['final_debris',cityPoint(460,3530)],['final_ice_wall',cityPoint(2180,2810)],
  ['final_rift',cityPoint(280,3470)],['final_ward',cityPoint(500,3400)],['npc_nerys_final',cityPoint(850,3430)],
  ['final_letters',{...rp('duel',840,626),elevated:41}],['npc_severin_after',rp('duel',770,820)],
  ['plaza_critter',cityPoint(1620,2790)],['road_scavenger',cityPoint(-300,2510)],
  ['wh_collector_1',rp('warehouse',430,1160)],['wh_collector_2',rp('warehouse',1050,900)],['wh_elite',rp('warehouse',790,490)],
  ['lab_critter',cityPoint(2410,2220)],['fq_critter',cityPoint(850,1340)],['fq_collector',cityPoint(2280,1350)],
  ['fq_training',cityPoint(1500,590)],['fq_deep_1',cityPoint(940,320)],['fq_deep_2',cityPoint(2060,320)],['fq_guardian',cityPoint(1500,300)],
  ['yard_brittle_1',cityPoint(870,650)],['yard_brittle_2',cityPoint(2120,650)],
  ['vol_1',rp('lab',390,1240)],['vol_2',rp('lab',680,960)],['lab_construct',rp('lab',480,450)],
  ['unstable_1',cityPoint(2050,3450)],['unstable_2',cityPoint(950,3670)],
  ['final_critter',cityPoint(1390,2610)],['final_collector',cityPoint(1770,2870)],['final_construct',cityPoint(1020,3410)],
  ['final_severin',rp('duel',540,600)],
]);
export const plannedObject = o => {
  const p=CITY_POSITIONS[o.id];
  if(!p)return {...o};
  const out={...o,...p};
  const outdoors=p.x>=CITY_RECT.x && p.x<CITY_RECT.x+CITY_RECT.w;
  if(o.target)out.target={x:p.x+(o.target.x-o.x)*(outdoors?CITY_SCALE:1),y:p.y+(o.target.y-o.y)*(outdoors?CITY_SCALE:1)};
  return out;
};
export function cityArrival(p,hasEvent=()=>false,layout=2) {
  // Layout metadata travels with the existing save, so overlapping old/new city bounds
  // cannot transform the same player twice. Rooms and the forest never migrate.
  if(layout<3 && p && p.x>=6000 && p.x<9720 && p.y>=600 && p.y<4920)
    return cityPoint(p.x-CITY_ORIGIN.x,p.y-CITY_ORIGIN.y);
  if(!legacyCityPoint(p))return p;
  // Never migrate a saved player behind a still-closed quest gate.
  if(p.y<2000 && hasEvent('ch2_water_frozen'))return cityPoint(1500,620);
  if(p.y<2500 && hasEvent('ch2_quarter_open'))return cityPoint(1500,1370);
  return cityPoint(1500,2780);
}
export function cityZoneData() {
  const roomZones=CITY_ROOMS.map(r=>({id:({archive:'AR',society:'SO',lab:'LB',duel:'DU',coven:'CV',bank:'BK',warehouse:'WH',cellar:'RC',rescue:'RD'})[r.key],name:r.name,...r.rect,interior:true,safePoint:r.arrival}));
  return [...roomZones,{id:'FQ',name:'Замёрзший квартал',...cityPoint(0,0),w:size(3000),h:size(1520),safePoint:cityPoint(1500,1610)},
    {id:'P',name:'Центральная площадь',...cityPoint(0,2100),w:size(3000),h:size(800),safePoint:cityPoint(1500,2780)},
    {id:'R',name:'Дорога в город',...cityPoint(-720,2300),w:size(720),h:size(1240),safePoint:cityPoint(-560,2510)}];
}

const rect=(id,x,y,w,h,tex,more={})=>({id,...cityPoint(x,y),w:size(w),h:size(h),tex,...more});
export function cityMapData() {
  const grounds=[
    rect('city_frost_quarter',1280,800,440,680,'city_final_paving',{tileScale:0.12,tint:0x92cddd,alpha:0.35,layerOffset:0.2}),
    rect('city_frost_plaza',700,2450,1420,250,'city_final_paving',{tileScale:0.12,tint:0x92cddd,alpha:0.35,layerOffset:0.2}),
    ...CITY_ROOMS.map(r=>({id:'floor_'+r.id,...r.rect,
      tex:['society','lab','duel','warehouse'].includes(r.key)?'city_final_stone_floor':'city_final_wood_floor',
      tileScale:['society','lab','duel','warehouse'].includes(r.key)?0.25:0.22,
      ...(['lab','warehouse'].includes(r.key)?{tint:0xc6c0b3}:{}),interior:true})),
  ];
  const road=(id,w,pts,kind='stone')=>({id:'city_street_'+id,kind,w,pts:pts.map(([x,y])=>{const p=cityPoint(x,y);return [p.x,p.y];}),seamless:true,
    ...(kind==='stone'?{texture:'city_final_paving',tileScale:0.12,urban:true}:{})});
  const roads=[
    road('avenue',200,[[1500,80],[1470,580],[1500,780],[1500,1520],[1460,2150],[1540,2800],[1480,3460],[1500,4220]]),
    road('entry',150,[[-690,2510],[-430,2490],[-120,2530],[350,2500],[800,2530]]),
    road('square',330,[[640,2560],[1000,2530],[1530,2560],[2300,2580]]),
    road('lab',100,[[-150,2560],[-180,2870],[-200,3200],[-510,3370]],'dirt'),
    ...[590,1300,2130,2820,3430,4120].map((y,i)=>road('cross_'+i,120,[[640,y+10],[1000,y-15],[1480,y+30],[2100,y],[2440,y+20]])),
    ...BUILDINGS.filter(b=>b.id!=='lab').map(b=>{
      const x=(b.door.x-CITY_ORIGIN.x)/CITY_SCALE,y=(b.door.y-CITY_ORIGIN.y)/CITY_SCALE;
      return road('forecourt_'+b.id,85,[[x-b.w/CITY_SCALE*.35,y+40],[x+b.w/CITY_SCALE*.35,y+40]]);
    }),
  ];
  const colliders=[];
  const col=(id,x,y,w,h,kind='ruin',extra={})=>colliders.push({id:'city_plan_'+id,...cityPoint(x,y),w:size(w),h:size(h),kind,...extra});
  // Physically closed outer wall and story precincts, with one controlled opening each.
  [[0,0,40,2300],[0,2740,40,1580],[0,0,3000,40],[2960,0,40,4320],[0,4280,3000,40],
    [0,1480,1230,40],[1770,1480,1230,40],[0,740,1230,40],[1770,740,1230,40]].forEach((a,i)=>col('wall_'+i,...a));
  // Forest confines the approach without blocking the side path to the lab.
  [[-720,0,720,2300],[-720,2740,420,180],[-60,2740,60,1580],[-720,3540,720,780]].forEach((a,i)=>col('edge_'+i,...a,'trees'));
  for(const b of BUILDINGS)colliders.push({id:'city_plan_building_'+b.id,kind:'furniture',x:b.x,y:b.y,w:b.w,h:b.h,
    tex:'city_final_'+b.id+'_exterior',
    editorStyle:{w:b.w,h:size(({bank:460,archive:490,society:490,lab:450,duel:470,coven:470,
      warehouse_a:380,warehouse_b:380,cellar:420,rescue:420,north_bay:490,north_workshop:420})[b.id])},building:b.id});
  col('fountain',860,2460,180,180,'furniture',{tex:'city_final_fountain',editorStyle:{w:210,h:200}});
  for(const [i,[x,y]] of [[710,2390],[710,2770],[1940,2540]].entries())col('bench_'+i,x,y,160,28,'furniture',{tex:'city_final_bench'});
  col('market',2420,2830,220,80,'furniture',{tex:'market_stall_01'});
  for(const r of CITY_ROOMS) {
    const {x,y,w,h}=r.rect,t=24;
    const xs=r.key==='warehouse'?[300,1140]:[w/2];
    colliders.push(...[{x,y,w,h:t},{x,y,w:t,h},{x:x+w-t,y,w:t,h}].map((a,i)=>({id:r.id+'_wall_'+i,kind:'wall',tex:'city_timber',...a})));
    let last=0;
    for(const dx of xs){colliders.push({id:r.id+'_wall_bottom_'+dx,kind:'wall',tex:'city_timber',x:x+last,y:y+h-t,w:dx-90-last,h:t});last=dx+90;}
    colliders.push({id:r.id+'_wall_end',kind:'wall',tex:'city_timber',x:x+last,y:y+h-t,w:w-last,h:t});
  }
  const furniture=(key,id,x,y,w,h,tex,extra={})=>colliders.push({id:'room_'+id,kind:'furniture',...rp(key,x,y),w,h,tex,...extra});
  furniture('bank','counter',150,400,420,40,'city_final_bank_counter');
  furniture('bank','safe',520,230,80,35,'city_bank_safe');
  furniture('archive','shelf_left',50,380,170,35,'city_final_archive_shelf');
  furniture('archive','shelf_right',680,380,170,35,'city_final_archive_shelf');
  furniture('archive','shelf_middle_left',50,800,170,35,'city_final_archive_shelf');
  furniture('archive','shelf_middle_right',680,800,170,35,'city_final_archive_shelf');
  furniture('archive','shelf_lower_right',680,1170,170,35,'city_final_archive_shelf');
  furniture('archive','desk',220,680,240,35,'city_final_archive_desk');
  furniture('society','bench',110,350,190,40,'city_society_workbench');
  furniture('society','reservoir',690,370,70,40,'city_coolant_stable');
  furniture('society','side_bench',610,800,190,40,'city_society_workbench');
  furniture('coven','table',100,420,240,40,'city_final_coven_map_table');
  furniture('coven','cabinet',620,280,120,35,'city_coven_cabinet');
  furniture('coven','tea_sofa',540,700,240,40,'city_final_coven_sofa');
  furniture('duel','rack_a',90,450,80,30,'city_duel_rack');
  furniture('duel','rack_b',880,450,80,30,'city_duel_rack');
  furniture('lab','bed_a',90,1410,130,40,'bed_01',{editorStyle:{w:140,h:150}});
  furniture('lab','bed_b',740,1220,130,40,'bed_01',{editorStyle:{w:140,h:150}});
  furniture('lab','machine_a',110,440,150,35,'city_lab_machine');
  furniture('lab','machine_b',710,540,150,35,'city_lab_machine');
  furniture('lab','journal',630,1750,160,35,'city_archive_desk',{editorStyle:{w:180,h:130}});
  furniture('duel','letters',760,590,160,35,'city_archive_desk',{editorStyle:{w:180,h:130}});
  furniture('warehouse','crate_a',180,550,100,30,'city_crate');
  furniture('warehouse','crate_b',1170,300,100,30,'city_crate');
  furniture('cellar','cellar_kitchen_table',100,690,170,35,'city_coven_table');
  furniture('rescue','rescue_bed',500,510,120,35,'bed_01',{editorStyle:{w:130,h:150,tint:0xbecfe4}});
  for(const key of ['cellar','rescue']){
    furniture(key,key+'_stove',85,410,110,35,'city_final_home_stove');
    furniture(key,key+'_shelf',510,310,140,35,'city_archive_shelf');
  }
  const props=[];
  const roomProp=(key,id,k,x,y,extra={})=>props.push({id:'room_decor_'+key+'_'+id,k,...rp(key,x,y),solid:null,...extra});
  roomProp('bank','back_wall','city_final_bank_wall',360,250,{l:'back'});
  roomProp('archive','back_wall','city_final_archive_wall',450,290,{l:'back'});
  for(const [key,tex,y] of [['society','society',270],['lab','lab',280],['duel','duel',310],
    ['coven','coven',270],['warehouse','warehouse',300],['cellar','home',250],['rescue','home',250]]){
    roomProp(key,'back_wall','city_final_'+tex+'_wall',room(key).rect.w/2,y,{l:'back'});
  }
  roomProp('duel','arena_inlay','city_final_duel_circle',540,1120,{l:'room-floor'});
  roomProp('society','rug','city_final_archive_rug',450,1070,{l:'room-floor',w:300,h:350,tint:0x9ab6b0});
  roomProp('coven','rug','city_final_archive_rug',420,1180,{l:'room-floor',w:270,h:430,tint:0xd0a4c1});
  for(const key of ['cellar','rescue']){
    roomProp(key,'rug','city_final_bank_rug',360,1060,{l:'room-floor',w:300,h:260,...(key==='rescue'?{tint:0xb7c8e2}:{})});
    roomProp(key,'entry_bench','city_final_bench',570,1160,{solid:{w:150,h:24}});
    roomProp(key,'plant','plant_pot_01',70,1180,{solid:{w:28,h:14}});
  }
  for(const [key,x,y] of [['society',140,990],['coven',150,1140],['duel',160,1040],['duel',920,1230]]){
    roomProp(key,'bench_'+x,'city_final_bench',x,y,{solid:{w:150,h:24}});
  }
  for(const [key,x,y] of [['society',80,1170],['society',820,1170],['coven',760,1220]]){
    roomProp(key,'plant_'+x,'plant_pot_01',x,y,{solid:{w:28,h:14}});
  }
  for(const [i,[x,y]] of [[170,920],[1240,1180],[170,380],[1270,650]].entries()){
    roomProp('warehouse','stack_'+i,i%2?'barrel_01':'city_crate',x,y,{solid:{w:i%2?50:90,h:26}});
  }
  // Two stocked sections frame a clear 360px centre aisle on portrait screens.
  for(const [i,[x,y]] of [[430,980],[1040,1240],[430,380],[1040,660]].entries()){
    roomProp('warehouse','section_stock_'+i,'city_crate',x,y,{w:180,h:165,solid:{w:160,h:32}});
  }
  roomProp('bank','rug','city_final_bank_rug',360,760,{l:'room-floor'});
  roomProp('archive','rug','city_final_archive_rug',450,1210,{l:'room-floor'});
  roomProp('bank','waiting_bench','city_final_bench',140,650,{solid:{w:150,h:24}});
  roomProp('bank','entry_bench','city_final_bench',580,1130,{solid:{w:150,h:24}});
  roomProp('bank','entry_plant','plant_pot_01',70,1240,{solid:{w:28,h:14}});
  roomProp('bank','plant_left','plant_pot_01',70,510,{solid:{w:28,h:14}});
  roomProp('bank','plant_right','plant_pot_01',650,510,{solid:{w:28,h:14}});
  roomProp('archive','plant_left','plant_pot_01',80,1300,{solid:{w:28,h:14}});
  roomProp('archive','plant_right','plant_pot_01',820,1300,{solid:{w:28,h:14}});
  const prop=(id,k,x,y,extra={})=>props.push({id:'city_plan_'+id,k,...cityPoint(x,y),solid:null,...extra});
  for(const [i,[x,y]] of [[1050,2160],[1940,2160],[1050,2900],[1940,2900],[1040,3490],[1940,3490],[80,550],[2900,550]].entries())prop('lamp_'+i,'city_lamp_01',x,y);
  for(const [i,[x,y]] of [[850,1750],[2100,1750],[820,3010],[2100,3010],[80,860],[2900,860],[80,3750],[2900,3750]].entries())prop('tree_'+i,i%2?'tree_autumn_01':'tree_autumn_02',x,y);
  prop('archive_sign','city_sign_archive',810,2140);prop('society_sign','city_sign_society',2110,2140);
  for(const [i,[x,y]] of [[700,2560],[1080,2560],[710,2840],[2140,2540]].entries())prop('plaza_flowers_'+i,'flower_purple_01',x,y,{w:64,h:62});
  prop('duel_sign','city_sign_duel',890,3430);prop('coven_sign','city_sign_coven',2110,3430);
  // Use the forest's actual trees, bushes and flowers at their native scale.
  // Small groups border the streets; doors and quest objects keep a clear approach.
  const doorClear = p => BUILDINGS.some(b => Math.abs(p.x-b.door.x)<110 && p.y>b.door.y-25 && p.y<b.door.y+125);
  const questClear = p => Object.values(CITY_POSITIONS).some(o => Math.hypot(p.x-o.x,p.y-o.y)<100);
  let gardenIndex=0;
  const streetShapes=roads.map((r,i)=>buildRoad(r,100+i));
  const garden=(k,x,y,extra={})=>{
    const p=cityPoint(x,y);
    if(doorClear(p)||questClear(p))return;
    if(extra.solid && streetShapes.some(r=>distToPolygon(p.x,p.y,r.poly)<35))return;
    props.push({id:'city_garden_'+gardenIndex++,k,...p,solid:null,...extra});
  };
  for(const y of [400,1030,1800,2470,3110,3880]){
    for(const x of [260,2740]){
      garden(x<1500?'tree_autumn_02':'tree_dark_01',x,y,{solid:{w:26,h:14}});
      garden('bush_01',x+115,y+65);
      garden('bush_02',x-75,y+155);
      garden('flower_white_01',x+120,y+200);
      garden('flower_purple_01',x-40,y+230);
    }
  }
  for(const y of [200,920,1690,2310,3010,3770]){
    for(const x of [1190,1810]){
      garden(x<1500?'tree_autumn_01':'birch_01',x,y,{solid:{w:24,h:12}});
      garden('bush_02',x-30,y+115);
      garden('flower_white_01',x+45,y+170);
      garden('flower_purple_01',x-70,y+210);
      garden('city_lamp_01',x+35,y+270);
    }
  }
  for(const b of BUILDINGS.filter(b=>b.id!=='lab')){
    // Doorstep flowers frame the facade without covering the centre of the door.
    const y=(b.door.y-CITY_ORIGIN.y)/CITY_SCALE;
    const x=(b.door.x-CITY_ORIGIN.x)/CITY_SCALE;
    garden('plant_pot_01',x-225,y+45);
    garden('flower_purple_01',x+235,y+70);
    garden('bush_01',x-280,y+120);
  }
  // Tree-lined edge rather than empty grass beyond the town wall.
  for(let y=130;y<4260;y+=240)for(const x of [85,2920]){
    garden(y%480<240?'tree_dark_02':'tree_autumn_02',x,y,{fill:true});
    garden('bush_01',x+40,y+90);
  }
  return {grounds,colliders,props,roads};
}
