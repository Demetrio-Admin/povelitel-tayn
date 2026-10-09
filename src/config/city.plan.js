// Playable blockout of the approved spacious town. Coordinate islands use the
// existing server-persisted x/y format; rooms never overlap outdoor locations.
export const CITY_ORIGIN = { x: 6720, y: 600 };
export const CITY_RECT = { x: 6000, y: 600, w: 3720, h: 4320 };
export const cityPoint = (x, y) => ({ x: CITY_ORIGIN.x + x, y: CITY_ORIGIN.y + y });
export const legacyCityPoint = p => p && p.x >= 1800 && p.x < 3600 && p.y >= 1300 && p.y <= 5400;
export const BUILDINGS = [
  ['north_bay','Северный дом',200,100,540,420,470,520,null],
  ['north_workshop','Дом с мастерской',2240,100,560,420,2520,520,null],
  ['cellar','Дом с погребом',200,860,540,370,470,1230,'ch2_rescue_cellar'],
  ['rescue','Дом за ледяной дверью',2240,860,560,370,2520,1230,'ch2_rescue_door'],
  ['archive','Городской Архив',200,1640,540,420,470,2060,null],
  ['society','Общество Преображения',2240,1640,560,420,2520,2060,null],
  ['bank','Городской Банк',2300,2290,500,400,2550,2690,null],
  ['duel','Магическая Дуэль',200,2940,600,420,500,3360,'ch2_fin_seal'],
  ['coven','Дом Ковенов',2240,2940,560,420,2520,3360,null],
  ['warehouse_a','Склад А',200,3710,600,340,500,4050,null],
  ['warehouse_b','Склад Б',2240,3710,560,340,2520,4050,null],
  ['lab','Тайная лаборатория',-700,2920,380,380,-510,3300,'ch2_lab_open'],
].map(([id,name,x,y,w,h,dx,dy,requires]) => ({ id,name,...cityPoint(x,y),w,h,door:cityPoint(dx,dy),requires }));
const layouts = [
  ['bank','Городской Банк',10200,200,720,960],
  ['archive','Городской Архив',11800,200,900,1500],
  ['society','Общество Преображения',13400,200,900,1320],
  ['lab','Тайная лаборатория',10200,2600,960,2160],
  ['duel','Магическая Дуэль',11800,2600,1080,1680],
  ['coven','Дом Ковенов',13400,2600,840,1200],
  ['warehouse','Складской комплекс',10200,5200,1440,1680],
  ['cellar','Дом с погребом',11800,5200,720,960],
  ['rescue','Дом за ледяной дверью',13400,5200,720,960],
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
    {id:'door_'+b.id,kind:'room_door',x:b.door.x,y:b.door.y+36,ghost:{w:160,h:100},radius:150,
      target:inside,room:r.id,hint:'Войти: '+b.name,requiresEvent:b.requires},
    {id:'room_exit_'+b.id,kind:'room_door',...rp(key,entryX,r.rect.h-55),ghost:{w:160,h:80},radius:130,
      target:{x:b.door.x,y:b.door.y+170},room:'city',hint:'Выйти: '+b.name},
  ];
});
export const CITY_POSITIONS = Object.fromEntries([
  ['exit_city',cityPoint(-650,2510)],['frostherb_r1',cityPoint(-480,2380)],['frostherb_r2',cityPoint(-500,2800)],['resin_r1',cityPoint(-660,2640)],
  ['city_board',cityPoint(370,2430)],['npc_merchant',cityPoint(2120,2930)],
  ['plaza_trace',cityPoint(1540,2740)],['plaza_debris',cityPoint(1930,2370)],
  ['sapphire_city_cache_1',cityPoint(730,2710)],['sapphire_city_cache_2',cityPoint(2040,3470)],
  ['npc_ilaria',rp('archive',260,1050)],['archive_document',rp('archive',330,650)],
  ['npc_severin',rp('society',360,710)],['npc_banker',rp('bank',360,510)],
  ['npc_rowena',rp('coven',270,610)],['npc_duelist',rp('duel',260,1280)],
  ['frost_barrier',{...cityPoint(1500,1520),collide:{w:540,h:40},editorStyle:{w:580,h:160}}],
  ['fq_water',{...cityPoint(1500,780),collide:{w:540,h:40},editorStyle:{w:540,h:90}}],
  ['ice_construct',cityPoint(1230,1350)],['npc_nerys',cityPoint(1580,1230)],
  ['fq_cellar',cityPoint(540,1280)],['fq_door',cityPoint(2520,1280)],['fq_cauldron',cityPoint(2110,1350)],
  ['lab_seal',cityPoint(-510,3340)],['lab_herb_1',rp('lab',140,720)],['lab_herb_2',rp('lab',810,940)],
  ['lab_chest',rp('lab',160,1880)],['lab_cauldron',rp('lab',820,1880)],
  ['npc_tikhon',rp('lab',240,1540)],['lab_journal',rp('lab',710,1720)],
  ['wh_cargo',rp('warehouse',1110,440)],['wh_equipment',rp('warehouse',400,630)],
  ['final_debris',cityPoint(730,3530)],['final_ice_wall',cityPoint(2180,2810)],
  ['final_rift',cityPoint(280,3470)],['final_ward',cityPoint(500,3400)],['npc_nerys_final',cityPoint(850,3430)],
  ['final_letters',rp('duel',840,590)],['npc_severin_after',rp('duel',770,820)],
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
  if(o.target)out.target={x:o.target.x+p.x-o.x,y:o.target.y+p.y-o.y};
  return out;
};
export function cityArrival(p,hasEvent=()=>false) {
  if(!legacyCityPoint(p))return p;
  // Never migrate a saved player behind a still-closed quest gate.
  if(p.y<2000 && hasEvent('ch2_water_frozen'))return cityPoint(1500,620);
  if(p.y<2500 && hasEvent('ch2_quarter_open'))return cityPoint(1500,1370);
  return cityPoint(1500,2780);
}
export function cityZoneData() {
  const roomZones=CITY_ROOMS.map(r=>({id:({archive:'AR',society:'SO',lab:'LB',duel:'DU',coven:'CV',bank:'BK',warehouse:'WH',cellar:'RC',rescue:'RD'})[r.key],name:r.name,...r.rect,interior:true,safePoint:r.arrival}));
  return [...roomZones,{id:'FQ',name:'Замёрзший квартал',...cityPoint(0,0),w:3000,h:1520,safePoint:cityPoint(1500,1610)},
    {id:'P',name:'Центральная площадь',...cityPoint(0,2100),w:3000,h:800,safePoint:cityPoint(1500,2780)},
    {id:'R',name:'Дорога в город',...cityPoint(-720,2300),w:720,h:1240,safePoint:cityPoint(-560,2510)}];
}

const rect=(id,x,y,w,h,tex,more={})=>({id,...cityPoint(x,y),w,h,tex,...more});
export function cityMapData() {
  const grounds=[
    rect('city_plaza',600,2220,1640,680,'city_paving'),
    rect('city_avenue',1100,40,800,4240,'city_paving'),
    rect('city_carriage_lane',1320,40,360,4240,'city_paving',{tint:0xa99c85}),
    rect('city_entry',-720,2300,1320,440,'stone_path_01'),
    rect('city_lab_path',-300,2740,240,800,'dirt_path_01'),
    rect('city_lab_forecourt',-700,3300,640,240,'stone_path_01'),
    rect('city_frost_quarter',40,800,2920,680,'city_paving_frost',{alpha:0.55,layerOffset:0.2}),
    rect('city_frost_plaza',600,2220,1640,680,'city_paving_frost',{alpha:0.6,layerOffset:0.2}),
    ...[560,1260,2100,2740,3400,4100].map((y,i)=>rect('city_cross_'+i,60,y,2880,240,'city_paving')),
    ...CITY_ROOMS.map(r=>({id:'floor_'+r.id,...r.rect,tex:['archive','coven','bank','cellar','rescue'].includes(r.key)?'city_wood_floor':'city_stone_floor',interior:true})),
  ];
  const colliders=[];
  const col=(id,x,y,w,h,kind='ruin',extra={})=>colliders.push({id:'city_plan_'+id,...cityPoint(x,y),w,h,kind,...extra});
  // Physically closed outer wall and story precincts, with one controlled opening each.
  [[0,0,40,2300],[0,2740,40,1580],[0,0,3000,40],[2960,0,40,4320],[0,4280,3000,40],
    [0,1480,1230,40],[1770,1480,1230,40],[0,740,1230,40],[1770,740,1230,40]].forEach((a,i)=>col('wall_'+i,...a));
  // Forest confines the approach without blocking the side path to the lab.
  [[-720,0,720,2300],[-720,2740,420,180],[-60,2740,60,1580],[-720,3540,720,780]].forEach((a,i)=>col('edge_'+i,...a,'trees'));
  for(const b of BUILDINGS)colliders.push({id:'city_plan_building_'+b.id,kind:'furniture',x:b.x,y:b.y,w:b.w,h:b.h,
    tex:b.id.startsWith('warehouse_')?'city_warehouse':b.id==='rescue'?'city_frozen_house':'city_house',
    editorStyle:{w:b.w,h:b.h},building:b.id});
  col('fountain',860,2460,180,180,'furniture',{tex:'city_fountain',editorStyle:{w:180,h:230}});
  col('market',2010,2800,220,80,'furniture',{tex:'market_stall_01'});
  for(const r of CITY_ROOMS) {
    const {x,y,w,h}=r.rect,t=24;
    const xs=r.key==='warehouse'?[300,1140]:[w/2];
    colliders.push(...[{x,y,w,h:t},{x,y,w:t,h},{x:x+w-t,y,w:t,h}].map((a,i)=>({id:r.id+'_wall_'+i,kind:'wall',tex:'city_timber',...a})));
    let last=0;
    for(const dx of xs){colliders.push({id:r.id+'_wall_bottom_'+dx,kind:'wall',tex:'city_timber',x:x+last,y:y+h-t,w:dx-90-last,h:t});last=dx+90;}
    colliders.push({id:r.id+'_wall_end',kind:'wall',tex:'city_timber',x:x+last,y:y+h-t,w:w-last,h:t});
  }
  const furniture=(key,id,x,y,w,h,tex)=>colliders.push({id:'room_'+id,kind:'furniture',...rp(key,x,y),w,h,tex});
  furniture('bank','counter',235,355,250,35,'city_bank_counter');
  furniture('bank','safe',520,230,80,35,'city_bank_safe');
  furniture('archive','shelf_left',70,280,140,35,'city_archive_shelf');
  furniture('archive','shelf_right',630,280,140,35,'city_archive_shelf');
  furniture('archive','desk',245,680,160,35,'city_archive_desk');
  furniture('society','bench',110,350,190,40,'city_society_workbench');
  furniture('society','reservoir',690,370,70,40,'city_coolant_stable');
  furniture('coven','table',130,380,170,30,'city_coven_table');
  furniture('coven','cabinet',620,280,120,35,'city_coven_cabinet');
  furniture('duel','rack_a',90,450,80,30,'city_duel_rack');
  furniture('duel','rack_b',880,450,80,30,'city_duel_rack');
  furniture('lab','bed_a',100,1410,70,30,'bed_01');
  furniture('lab','bed_b',750,1220,70,30,'bed_01');
  furniture('lab','machine_a',110,440,150,35,'city_lab_machine');
  furniture('lab','machine_b',710,540,150,35,'city_lab_machine');
  furniture('lab','journal',630,1750,140,35,'city_archive_desk');
  furniture('warehouse','crate_a',180,550,100,30,'city_crate');
  furniture('warehouse','crate_b',1170,300,100,30,'city_crate');
  for(const key of ['cellar','rescue']){furniture(key,key+'_bed',100,320,70,30,'bed_01');furniture(key,key+'_shelf',510,250,140,35,'city_archive_shelf');}
  const props=[];
  const prop=(id,k,x,y,extra={})=>props.push({id:'city_plan_'+id,k,...cityPoint(x,y),solid:null,...extra});
  for(const [i,[x,y]] of [[1050,2160],[1940,2160],[1050,2900],[1940,2900],[1040,3490],[1940,3490],[80,550],[2900,550]].entries())prop('lamp_'+i,'city_lamp_01',x,y);
  for(const [i,[x,y]] of [[850,1750],[2100,1750],[820,3010],[2100,3010],[80,860],[2900,860],[80,3750],[2900,3750]].entries())prop('tree_'+i,i%2?'tree_autumn_01':'tree_autumn_02',x,y);
  prop('archive_sign','city_sign_archive',810,2140);prop('society_sign','city_sign_society',2110,2140);
  prop('duel_sign','city_sign_duel',890,3430);prop('coven_sign','city_sign_coven',2110,3430);
  return {grounds,colliders,props};
}
