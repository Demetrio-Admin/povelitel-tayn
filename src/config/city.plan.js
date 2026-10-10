// v0.37.0 — прогулочный город (план v4). Дома прежнего размера стоят асимметричными группами вдоль одной
// плавной главной улицы: ворота и склады → торговый двор → площадь → дуэль и ковены → сад и набережная →
// мост к Замёрзшему кварталу → затопленный проход → северный двор. Лаборатория — на тропе за западной стеной.
// Координаты в мире — от левого верхнего угла CITY_RECT (масштаб 1:1, дома не масштабируются).
// Независимые помещения (CITY_ROOMS) не переносятся; меняются только внешний план, двери и точки возврата.
import { buildRoad } from '../world/terrain.js';
import { distToPolygon, catmullRom } from '../world/geometry.js';

export const CITY_LAYOUT_VERSION = 4;
export const CITY_RECT = { x: 5600, y: 160, w: 2880, h: 5760 };
export const cityPoint = (x, y) => ({ x: CITY_RECT.x + x, y: CITY_RECT.y + y });
const local = p => ({ x: p.x - CITY_RECT.x, y: p.y - CITY_RECT.y });
export const legacyCityPoint = p => p && p.x >= 1800 && p.x < 3600 && p.y >= 1300 && p.y <= 5400;
/** v0.36 compact town (layout 3). Kept only to migrate saves once. */
export const V3_CITY = { origin: { x: 6720, y: 600 }, scale: 0.6, rect: { x: 6288, y: 600, w: 2232, h: 2592 } };
const v3Point = (x, y) => ({ x: V3_CITY.origin.x + x * V3_CITY.scale, y: V3_CITY.origin.y + y * V3_CITY.scale });
/** Push targets were authored in legacy units; outdoors they keep the compact step size. */
const TARGET_SCALE = 0.6;
const insideRect = (p, r) => p && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

// [id, name, doorX, doorY, footprintW, footprintH, doorOffsetX, requires] — footprint and facade art are unchanged;
// the door is the facade's anchor and sits on the footprint's lower edge.
export const BUILDINGS = [
  ['north_bay','Северный дом',1200,620,324,252,162,null],
  ['north_workshop','Дом с мастерской',2250,800,336,252,168,null],
  ['cellar','Дом с погребом',1250,1820,324,222,162,'ch2_rescue_cellar'],
  ['rescue','Дом за ледяной дверью',1990,1580,336,222,168,'ch2_rescue_door'],
  ['archive','Городской Архив',1250,2560,324,252,162,null],
  ['society','Общество Преображения',1950,2700,336,252,168,null],
  ['bank','Городской Банк',2050,4250,300,240,150,null],
  ['duel','Магическая Дуэль',1100,3270,360,252,180,'ch2_fin_seal'],
  ['coven','Дом Ковенов',1950,3170,336,252,216,null],
  ['warehouse_a','Склад А',1150,5010,360,204,180,null],
  ['warehouse_b','Склад Б',2050,5085,336,204,168,null],
  ['lab','Тайная лаборатория',330,3960,228,228,114,'ch2_lab_open'],
].map(([id,name,dx,dy,w,h,ox,requires]) => {
  const door=cityPoint(dx,dy);
  return { id,name,x:door.x-ox,y:door.y-h,w,h,door,requires };
});
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
const P = cityPoint;
export const CITY_POSITIONS = Object.fromEntries([
  // Дорога и тропа к лаборатории за западной стеной
  ['exit_city',P(110,5150)],['frostherb_r1',P(250,5060)],['frostherb_r2',P(385,4640)],['resin_r1',P(500,5290)],
  ['road_scavenger',P(520,5030)],
  ['lab_seal',P(330,3984)],
  // Торговый двор: отдельная площадка Бориса, банк, доска поручений
  ['npc_merchant',P(1470,4420)],['city_board',P(1820,4228)],
  ['final_collector',P(1720,4460)],['final_ice_wall',P(1560,4060)],
  // Центральная площадь: фонтан смещён к западу, восточная часть свободна для событий
  ['plaza_trace',P(1560,3620)],['plaza_debris',P(1620,3380)],['plaza_critter',P(1480,3650)],
  ['sapphire_city_cache_1',P(1230,3640)],['final_critter',P(1440,3320)],['final_construct',P(1700,3440)],
  // Двор Дуэльного зала и Дом Ковенов
  ['final_debris',P(1250,3420)],['final_rift',P(960,3440)],['final_ward',P(1100,3294)],['npc_nerys_final',P(1200,3480)],
  ['unstable_1',P(1760,3360)],
  // Сад и Общество
  ['lab_critter',P(2150,2880)],
  // Склады у ворот
  ['unstable_2',P(1450,4960)],['sapphire_city_cache_2',P(2480,5480)],
  // Ледяная стена стоит на мосту — единственном проходе через канал в Замёрзший квартал
  ['frost_barrier',{...P(1560,2166),collide:{w:150,h:44},editorStyle:{w:180,h:128}}],
  ['ice_construct',P(1760,1960)],['npc_nerys',P(1660,1930)],
  ['fq_cellar',P(1050,1830)],['fq_door',P(1990,1610)],['fq_cauldron',P(1900,2010)],
  ['fq_critter',P(950,1990)],['fq_collector',P(2200,1720)],
  // Затопленный проход в садовой стене и Северный двор за ним
  ['fq_water',{...P(1720,1142),collide:{w:230,h:52},editorStyle:{w:250,h:96}}],
  ['fq_training',P(1720,900)],['fq_deep_1',P(1450,500)],['fq_deep_2',P(1990,480)],['fq_guardian',P(1720,440)],
  ['yard_brittle_1',P(1460,800)],['yard_brittle_2',P(1990,800)],
  // Помещения не переносятся
  ['npc_ilaria',rp('archive',260,1050)],['archive_document',{...rp('archive',330,716),elevated:41}],
  ['npc_severin',rp('society',360,710)],['npc_banker',{...rp('bank',360,350),approach:rp('bank',360,510)}],
  ['npc_rowena',rp('coven',270,610)],['npc_duelist',rp('duel',260,1280)],
  ['lab_herb_1',rp('lab',140,720)],['lab_herb_2',rp('lab',810,940)],
  ['lab_chest',rp('lab',160,1880)],['lab_cauldron',rp('lab',820,1880)],
  ['npc_tikhon',rp('lab',240,1540)],['lab_journal',{...rp('lab',710,1786),elevated:41}],
  ['wh_cargo',rp('warehouse',1110,440)],['wh_equipment',rp('warehouse',400,630)],
  ['final_letters',{...rp('duel',840,626),elevated:41}],['npc_severin_after',rp('duel',770,820)],
  ['wh_collector_1',rp('warehouse',430,1160)],['wh_collector_2',rp('warehouse',1050,900)],['wh_elite',rp('warehouse',790,490)],
  ['vol_1',rp('lab',390,1240)],['vol_2',rp('lab',680,960)],['lab_construct',rp('lab',480,450)],
  ['final_severin',rp('duel',540,600)],
]);
export const plannedObject = o => {
  const p=CITY_POSITIONS[o.id];
  if(!p)return {...o};
  const out={...o,...p};
  const outdoors=insideRect(p,CITY_RECT);
  if(o.target)out.target={x:p.x+(o.target.x-o.x)*(outdoors?TARGET_SCALE:1),y:p.y+(o.target.y-o.y)*(outdoors?TARGET_SCALE:1)};
  return out;
};

// ---------------------------------------------------------------- места города (зоны, безопасные точки)
const doorFront = id => { const b=BUILDINGS.find(b=>b.id===id); return { x:b.door.x, y:b.door.y+100 }; };
export const CITY_SPOTS = {
  road: P(190,5175), labTrail: P(320,4300), gate: P(860,5175),
  market: P(1720,4480), square: P(1560,3740), garden: P(1600,2860), bridgeSouth: P(1560,2300),
  quarter: P(1580,1720), waterSouth: P(1720,1250), yard: P(1720,1000),
};
export function cityZoneData() {
  const roomZones=CITY_ROOMS.map(r=>({id:({archive:'AR',society:'SO',lab:'LB',duel:'DU',coven:'CV',bank:'BK',warehouse:'WH',cellar:'RC',rescue:'RD'})[r.key],name:r.name,...r.rect,interior:true,safePoint:r.arrival}));
  const zone=(id,name,x,y,w,h,safePoint)=>({id,name,...P(x,y),w,h,safePoint});
  // Порядок — с севера на юг; безопасная точка закрытой части всегда лежит перед её проходом.
  return [...roomZones,
    zone('FY','Северный двор',640,0,2000,1120,CITY_SPOTS.waterSouth),
    zone('FQ','Замёрзший квартал',640,1120,2000,1062,CITY_SPOTS.bridgeSouth),
    zone('GD','Сад у Архива',640,2182,2000,898,CITY_SPOTS.garden),
    zone('P','Центральная площадь',640,3080,2000,880,CITY_SPOTS.square),
    zone('M','Торговый двор',640,3960,2000,800,CITY_SPOTS.market),
    zone('G','Ворота и склады',640,4760,2000,1000,CITY_SPOTS.gate),
    zone('R','Дорога в город',0,3560,640,2200,CITY_SPOTS.road)];
}

// ---------------------------------------------------------------- однократный перенос сохранений
// Точки компактного города v3 (локальные координаты v0.36) → куда встаёт герой в новом плане.
const V3_LANDMARKS = [
  [[-560,2510],'road'],[[-500,3200],'labTrail'],[[1500,2780],'square'],[[860,2560],'square'],[[640,2430],'square'],
  [[2530,3020],'market'],[[2210,2790],doorFront('bank')],[[830,2160],doorFront('archive')],[[2180,2160],doorFront('society')],
  [[800,3460],doorFront('duel')],[[2260,3460],doorFront('coven')],[[800,4150],doorFront('warehouse_a')],[[2180,4150],doorFront('warehouse_b')],
  [[1500,4220],'gate'],[[1500,3450],'square'],[[1500,1900],'garden'],
];
const spot = s => typeof s === 'string' ? { ...CITY_SPOTS[s] } : { ...s };
/** Admin «safe point» destinations near Nerys (src/admin/config.js). A teleport writes these exact coordinates
 * without touching city_layout, so they are never reinterpreted as an old-town position. */
export const CITY_ADMIN_POINTS = { nerys: P(1700,1840), nerys_final: P(1180,3560) };
export const CITY_FIXED_POINTS = Object.values(CITY_ADMIN_POINTS);
function fromV3(p, hasEvent) {
  const lx=(p.x-V3_CITY.origin.x)/V3_CITY.scale, ly=(p.y-V3_CITY.origin.y)/V3_CITY.scale;
  const quarter=hasEvent('ch2_quarter_open'), water=hasEvent('ch2_water_frozen');
  if(lx>=0 && ly<740) return spot(water?'yard':quarter?'waterSouth':'bridgeSouth');
  if(lx>=0 && ly<1480) {
    if(!quarter)return spot('bridgeSouth');
    return spot(lx<1200?doorFront('cellar'):lx>1800?doorFront('rescue'):'quarter');
  }
  let best=V3_LANDMARKS[0],bd=Infinity;
  for(const l of V3_LANDMARKS){const d=Math.hypot(l[0][0]-lx,l[0][1]-ly);if(d<bd){bd=d;best=l;}}
  return spot(best[1]);
}
/**
 * Где окажется сохранённая позиция после обновления города. layout — worldObjects.city_layout.version из того же
 * сохранения: v2 (просторный город 0.35), v3 (компактный 0.36), v4 — текущий план, который больше не переносится.
 */
export function cityArrival(p,hasEvent=()=>false,layout=2) {
  if(!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || layout>=CITY_LAYOUT_VERSION)return p;
  if(CITY_FIXED_POINTS.some(f=>Math.abs(f.x-p.x)<1 && Math.abs(f.y-p.y)<1))return p;
  if(layout<3 && p.x>=6000 && p.x<9720 && p.y>=600 && p.y<4920)return fromV3(v3Point(p.x-V3_CITY.origin.x,p.y-V3_CITY.origin.y),hasEvent);
  if(legacyCityPoint(p)){
    // Never migrate a saved player behind a still-closed quest gate.
    if(p.y<2000 && hasEvent('ch2_water_frozen'))return spot('yard');
    if(p.y<2500 && hasEvent('ch2_quarter_open'))return spot('quarter');
    return spot('square');
  }
  if(insideRect(p,V3_CITY.rect))return fromV3(p,hasEvent);
  return p;
}

// ---------------------------------------------------------------- карта: улицы, стены, дома, детали
const rect=(id,x,y,w,h,tex,more={})=>({id,...P(x,y),w,h,tex,...more});
export const CITY_CANAL = { id:'city_canal', type:'canal', urban:true, half:48,
  pts:[[P(600,2130).x,P(600,2130).y],[P(2680,2130).x,P(2680,2130).y]], gaps:[[P(1505,0).x,P(1615,0).x]] };
export function cityMapData() {
  const grounds=[
    // Иней лежит на всём квартале (трава и улицы), пока его не растопят; на площади — только в финале.
    rect('city_frost_quarter',680,160,1920,1922,'snow_ground_01',{tileScale:0.5,tint:0xdcf0f6,alpha:0.3,layerOffset:0.2}),
    rect('city_frost_plaza',680,3080,1920,1680,'snow_ground_01',{tileScale:0.5,tint:0xdcf0f6,alpha:0.36,layerOffset:0.2}),
    ...CITY_ROOMS.map(r=>({id:'floor_'+r.id,...r.rect,
      tex:['society','lab','duel','warehouse'].includes(r.key)?'city_final_stone_floor':'city_final_wood_floor',
      tileScale:['society','lab','duel','warehouse'].includes(r.key)?0.25:0.22,
      ...(['lab','warehouse'].includes(r.key)?{tint:0xc6c0b3}:{}),interior:true})),
  ];
  const road=(id,w,pts,kind='stone')=>({id:'city_street_'+id,kind,w,pts:pts.map(([x,y])=>{const p=P(x,y);return [p.x,p.y];}),seamless:true,
    ...(kind==='stone'?{texture:'city_final_paving',tileScale:0.11,urban:true}:{})});
  const roads=[
    // Главная улица: ровная ширина и длинные плавные повороты; дома стоят у неё вразбивку, с короткими подходами
    road('main_gate',130,[[640,5170],[1050,5185],[1400,5170],[1600,5060],[1680,4850],[1680,4600]]),
    road('main_market',130,[[1640,4250],[1560,4020],[1500,3780]]),
    road('main_garden',130,[[1480,3290],[1540,3060],[1600,2860],[1600,2640],[1560,2420],[1560,2270]]),
    road('bridge',130,[[1560,2280],[1560,2010]]),
    road('main_quarter',130,[[1560,2030],[1540,1880],[1600,1680],[1680,1480],[1720,1300],[1720,1140],[1720,840]]),
    // Дворы, площадки и подходы к дверям
    road('apron_a',160,[[1050,5090],[1250,5090]]),
    road('lane_b',100,[[1640,4980],[1880,5150],[2000,5160]]),
    road('apron_b',160,[[1960,5160],[2140,5160]]),
    road('market',300,[[1640,4400],[1800,4390]]),
    road('merchant_pad',230,[[1360,4430],[1440,4430]]),
    road('bank_court',150,[[1950,4310],[2120,4310]]),
    road('square',420,[[1400,3500],[1560,3490]]),
    road('duel_lane',90,[[1180,3345],[1300,3400]]),
    road('duel_court',150,[[1020,3340],[1180,3340]]),
    road('coven_lane',90,[[1640,3330],[1780,3260],[1880,3245]]),
    road('coven_court',150,[[1880,3240],[2040,3240]]),
    road('archive_lane',90,[[1560,2630],[1330,2630]]),
    road('archive_court',150,[[1170,2630],[1330,2630]]),
    road('society_lane',90,[[1600,2760],[1880,2770]]),
    road('society_court',150,[[1880,2770],[2040,2770]]),
    road('embankment',90,[[760,2252],[1200,2250],[1560,2250],[2100,2254],[2560,2250]]),
    road('cellar_lane',90,[[1540,1890],[1330,1890]]),
    road('cellar_court',150,[[1170,1890],[1330,1890]]),
    road('rescue_lane',90,[[1620,1640],[1910,1650]]),
    road('rescue_court',150,[[1910,1650],[2070,1650]]),
    road('yard',420,[[1600,640],[1840,620]]),
    road('bay_lane',90,[[1420,700],[1280,690]]),
    road('bay_court',150,[[1120,690],[1280,690]]),
    road('workshop_lane',90,[[2000,760],[2170,860]]),
    road('workshop_court',150,[[2170,870],[2330,870]]),
    // Узкие мощёные дорожки — боковые петли через сады: рынок → двор Дуэльного зала → набережная, банк → ковены → Общество
    road('orchard_walk',64,[[1250,4440],[1050,4250],[950,3950],[1000,3420]]),
    road('west_walk',64,[[960,3300],[880,3000],[900,2700],[960,2420],[900,2252]]),
    road('east_walk',64,[[2120,4310],[2350,4150],[2400,3700],[2300,3330],[2350,2950],[2300,2500],[2450,2252]]),
    // Дорога из леса и боковая тропа к лаборатории
    road('road',150,[[-40,5170],[220,5164],[440,5172],[700,5170]],'dirt'),
    road('lab_trail',110,[[330,5150],[300,4850],[370,4520],[320,4200],[330,4010]],'dirt'),
  ];
  const colliders=[];
  const col=(id,x,y,w,h,kind,extra={})=>colliders.push({id:'city_plan_'+id,...P(x,y),w,h,kind,...extra});
  // Внешняя стена из светлого камня; западные ворота — единственный вход с дороги.
  col('wall_west_n',640,160,40,4920,'citywall');col('wall_west_s',640,5260,40,340,'citywall');
  col('wall_east',2600,160,40,5440,'citywall');col('wall_north',640,120,2000,40,'citywall');col('wall_south',640,5560,2000,40,'citywall');
  // Садовая стена с затопленным проходом (fq_water) — граница Северного двора.
  col('wall_water_w',680,1100,940,36,'citywall',{low:true});col('wall_water_e',1820,1100,780,36,'citywall',{low:true});
  // Лес за стенами: дорога, тропа и поляна лаборатории остаются открыты.
  [[0,0,640,3620],[0,3620,80,480],[0,4100,240,900],[420,4100,220,900],[0,5330,640,430],
    [2640,0,240,5760],[640,0,2000,120],[640,5600,2000,160]].forEach((a,i)=>col('forest_'+i,...a,'trees'));
  for(const b of BUILDINGS)colliders.push({id:'city_plan_building_'+b.id,kind:'furniture',x:b.x,y:b.y,w:b.w,h:b.h,
    tex:'city_final_'+b.id+'_exterior',
    editorStyle:{w:b.w,h:({bank:276,archive:294,society:294,lab:270,duel:282,coven:282,
      warehouse_a:228,warehouse_b:228,cellar:252,rescue:252,north_bay:294,north_workshop:252})[b.id]},building:b.id});
  col('fountain',1326,3416,108,108,'furniture',{tex:'city_final_fountain',editorStyle:{w:210,h:200}});
  // Скамьи: у фонтана, на рынке, в садах и на набережной.
  for(const [i,[x,y]] of [[1330,3680],[1700,3660],[1580,4560],[1250,5430],[1380,2820],[2280,2600],[1000,2335],[2150,2335],[960,760],[820,3700],[2300,3880]].entries())
    col('bench_'+i,x-48,y-17,96,17,'furniture',{tex:'city_final_bench'});
  col('market',1264,4332,132,48,'furniture',{tex:'market_stall_01'});
  // Низкие лёгкие ограды: палисадники и края садов, а не замкнутые коробки вокруг домов.
  const fence=(id,x,y,w,style)=>col('fence_'+id,x,y-12,w,12,'fence',{style});
  fence('archive_garden',700,2960,150,'iron');fence('bay_garden',700,880,220,'wood');fence('yard_a',700,4770,180,'wood');
  fence('bank_garden',2400,4360,180,'iron');fence('coven_garden',2420,3360,160,'wood');fence('rescue_yard',2250,1840,300,'wood');
  fence('workshop_yard',2440,1030,140,'wood');fence('society_garden',2400,2960,180,'iron');fence('cellar_garden',700,1990,200,'wood');
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

  // ---- уличные детали: небольшие осмысленные группы, подходы к дверям и квестовым объектам свободны
  const streetShapes=roads.map((r,i)=>buildRoad(r,100+i));
  const doorClear = p => BUILDINGS.some(b => Math.abs(p.x-b.door.x)<110 && p.y>b.door.y-25 && p.y<b.door.y+125);
  const questClear = p => Object.values(CITY_POSITIONS).some(o => insideRect(o,CITY_RECT) && Math.hypot(p.x-o.x,p.y-o.y)<(o.collide?130:100));
  const onStreet = p => streetShapes.some(r=>distToPolygon(p.x,p.y,r.poly)<14);
  const footprint = (p,s) => colliders.some(c=>c.kind!=='trees' && p.x+s.w/2+6>c.x && p.x-s.w/2-6<c.x+c.w && p.y+6>c.y && p.y-s.h-6<c.y+c.h);
  const inCanal = p => Math.abs(p.y-CITY_CANAL.pts[0][1])<CITY_CANAL.half-4 && p.x>CITY_CANAL.pts[0][0] && p.x<CITY_CANAL.pts[1][0];
  const nearProp = (p,k) => props.some(q=>q.k===k && Math.hypot(q.x-p.x,q.y-p.y)<90);
  let index=0;const skipped=[];
  const SOLID={city_walk_tree_sage:{w:18,h:10},city_walk_tree_amber:{w:18,h:10},city_walk_tree_plum:{w:16,h:10},
    city_walk_hedge:{w:104,h:22},city_walk_flowerbed:{w:104,h:22},city_walk_herbbed:{w:104,h:22},city_walk_planter:{w:72,h:18},
    city_walk_woodpile:{w:96,h:22},city_walk_cart:{w:112,h:26},city_walk_dummy:{w:26,h:12},city_walk_sacks:{w:70,h:18},
    city_lamp_01:{w:16,h:10},city_crate:{w:56,h:20},city_barrel:{w:44,h:18},plant_pot_01:{w:30,h:14},bush_02:{w:48,h:22},bush_01:{w:48,h:22},
    city_duel_rack:{w:70,h:18},rune_slab_01:{w:70,h:20},table_01:{w:90,h:22},lantern_02:{w:30,h:12}};
  // paved: a stall's goods or a planter may stand on paving on purpose; doors and quest spots stay clear regardless.
  const place=(k,x,y,extra={})=>{
    const p=P(x,y);
    const {force,...rest}=extra,paved=rest.paved;
    if(!force && inCanal(p)){skipped.push([k,x,y,'water']);return false;}
    if(!force && (doorClear(p)||questClear(p))){skipped.push([k,x,y,doorClear(p)?'door':'quest']);return false;}
    const solid=Object.hasOwn(rest,'solid')?rest.solid:SOLID[k]??null;
    if(solid && !force && ((!paved && onStreet(p)) || footprint(p,solid) || nearProp(p,k))){skipped.push([k,x,y,onStreet(p)?'street':footprint(p,solid)?'footprint':'near']);return false;}
    props.push({id:'city_plan_'+(rest.name||k.replace(/^city_(walk_)?/,'')+'_'+index++),k,...p,solid,...rest});
    return true;
  };
  const group=(list)=>list.forEach(([k,x,y,extra])=>place(k,x,y,extra));
  // Rhythm along the main street: a lamp at every long stretch and a town tree between them, alternating sides.
  const along=(id,step,first,fn)=>{
    const r=roads.find(r=>r.id==='city_street_'+id),pts=catmullRom(r.pts,10);
    let acc=0,next=first,side=1;
    for(let i=1;i<pts.length;i++){
      const [ax,ay]=pts[i-1],[bx,by]=pts[i],d=Math.hypot(bx-ax,by-ay);acc+=d;
      if(acc<next)continue;
      const nx=-(by-ay)/d,ny=(bx-ax)/d;fn(bx-CITY_RECT.x,by-CITY_RECT.y,nx,ny,side,r.w/2);side=-side;next+=step;
    }
  };
  const TREES=['city_walk_tree_sage','city_walk_tree_amber','city_walk_tree_plum'];
  let treeTurn=0;
  for(const id of ['main_gate','main_market','main_garden','main_quarter','embankment']){
    along(id,330,120,(x,y,nx,ny,side,hw)=>{
      place('city_lamp_01',x+nx*side*(hw+22),y+ny*side*(hw+22))||place('city_lamp_01',x-nx*side*(hw+22),y-ny*side*(hw+22));
    });
    along(id,165,200,(x,y,nx,ny,side,hw)=>{
      const k=TREES[treeTurn++%3],o=hw+70;
      place(k,x-nx*side*o,y-ny*side*o,id==='main_quarter'?{frost:true}:{});
    });
  }

  // 1. Дорога и ворота: фонари у въезда, тропа к лаборатории уходит в лес
  group([['lantern_02',430,5070],['lantern_02',590,5262],['city_walk_wall_post',660,5088,{solid:null,force:true,name:'gate_post_n'}],
    ['city_walk_wall_post',660,5268,{solid:null,force:true,name:'gate_post_s'}],['city_lamp_01',730,5080],['city_lamp_01',730,5280],
    ['lantern_01',220,3990],['city_crate',480,3990],['rock_small_01',150,4060],['flower_white_01',410,4880],['flower_purple_01',200,4980]]);
  // Склад А: двор погрузки — телега, ящики, мешки; дрова у стены
  group([['city_walk_cart',880,5030],['city_crate',1380,4990],['city_barrel',1400,5050],['city_walk_sacks',890,4940],['city_crate',760,4980,{name:'crate_a_wall'}],
    ['city_walk_woodpile',760,4860],['city_walk_tree_sage',860,4780],['city_barrel',760,5050,{name:'barrel_a_wall'}]]);
  // Склад Б: отдельный двор за поворотом — штабель, бочки, мешки
  group([['city_crate',2260,5120],['city_crate',2300,5175],['city_barrel',2340,5110],['city_walk_sacks',2290,5260],
    ['city_walk_cart',1840,5290],['city_walk_tree_amber',2400,4950],['city_walk_woodpile',2450,5380]]);
  // Зелёный клин в повороте улицы и южная полоса вдоль стены
  group([['city_walk_flowerbed',1480,4930],['city_walk_hedge',1440,4800],['bush_02',1300,4760],
    ['city_walk_tree_sage',900,5440],['city_walk_flowerbed',1450,5450],['city_walk_planter',1650,5420],['city_walk_tree_plum',1800,5470],
    ['city_walk_hedge',2150,5420],['city_walk_tree_sage',2540,5300],['flower_purple_01',1120,5440],['city_walk_planter',1900,4800],['city_walk_hedge',2150,4780]]);
  // 2. Торговый двор: лавка Бориса со своим товаром; место покупателя перед лавкой свободно
  group([['city_crate',1250,4420,{paved:true}],['city_barrel',1250,4480,{paved:true}],['city_walk_sacks',1470,4320,{paved:true}],
    ['plant_pot_01',1530,4360,{paved:true,name:'merchant_herbs'}],['city_walk_tree_amber',1190,4260],['flower_purple_01',1360,4580],
    ['city_walk_planter',1880,4250,{paved:true}],['city_walk_planter',2230,4250],['city_walk_tree_sage',2260,4560],
    ['city_walk_flowerbed',2000,4520],['city_walk_hedge',2480,4440],['bush_01',1860,4600],['city_walk_tree_plum',2460,4000]]);
  // Сад вдоль дорожки от рынка к Дуэльному залу
  group([['city_walk_tree_sage',780,4200],['city_walk_tree_amber',1120,4080],['city_walk_tree_plum',780,3820],['city_walk_flowerbed',1100,3820],
    ['bush_02',760,4520],['city_walk_hedge',1060,4600],['city_walk_tree_sage',1150,3650],['flower_white_01',1180,3960],
    ['flower_purple_01',830,3600],['city_walk_planter',1320,4020],['city_walk_hedge',780,4380]]);
  // 3. Площадь: фонтан, скамьи, клумбы; восточная половина свободна для событий
  group([['flower_purple_01',1300,3550],['flower_white_01',1460,3550],['city_walk_planter',1400,3270,{paved:true}],
    ['city_walk_tree_amber',1770,3600],['city_walk_tree_plum',1140,3760],['city_walk_flowerbed',1800,3760],['city_walk_tree_sage',1680,3240]]);
  // Двор Дуэльного зала: тренировочные чучела и стойка
  group([['city_walk_dummy',860,3420],['city_walk_dummy',820,3330],['city_duel_rack',1230,3290],['city_sign_duel',1260,3300,{solid:null,name:'duel_sign'}],
    ['city_walk_tree_amber',800,3180],['city_walk_hedge',1340,3190]]);
  // Дом Ковенов: травяной сад и фонари под полумесяцем
  group([['city_walk_herbbed',1660,3150],['city_walk_herbbed',2170,3250],['lantern_02',2120,3170],['city_sign_coven',1800,3200,{solid:null,name:'coven_sign'}],
    ['city_walk_tree_plum',2150,3060],['candle_group_01',2090,3205],['city_walk_herbbed',2180,3420],['bush_02',2000,3420]]);
  // 4. Сад у Архива: тихий садик с западной стороны, клумбы и живые изгороди
  group([['city_walk_tree_plum',760,2420],['city_walk_hedge',800,2560],['city_walk_flowerbed',790,2860],['city_sign_archive',1420,2610,{solid:null,name:'archive_sign'}],
    ['city_walk_tree_sage',1060,2700],['city_walk_flowerbed',1250,2800],['city_walk_hedge',1220,2920],['city_walk_tree_amber',1420,2950],
    ['city_walk_tree_amber',1450,2420],['city_walk_planter',1460,2340],['city_walk_tree_sage',1050,3020],['bush_01',800,3060],
    ['city_walk_flowerbed',1250,3060],['city_walk_tree_plum',1420,3120],['city_walk_hedge',800,2300]]);
  // Общество Преображения: двор с рунной плитой и восточный сад вдоль дорожки
  group([['rune_slab_01',1780,2880],['city_sign_society',2100,2740,{solid:null,name:'society_sign'}],['city_walk_tree_sage',2180,2480],['city_walk_planter',2160,2640],
    ['flower_purple_01',1830,2830],['city_walk_tree_plum',2470,2700],['city_walk_flowerbed',2480,2420],['city_walk_hedge',2200,2960],
    ['city_walk_tree_amber',2500,3120],['city_walk_tree_sage',2480,3560],['city_walk_flowerbed',2220,3700],['city_walk_tree_plum',2500,4250]]);
  // Набережная: фонари у воды
  for(const x of [900,1250,1950,2350])place('city_lamp_01',x,2192);
  for(const [x,y] of [[1492,2084],[1628,2084],[1492,2186],[1628,2186]])place('city_walk_wall_post',x,y,{solid:null,force:true,name:'bridge_post_'+x+'_'+y});
  // 5. Замёрзший квартал: дома за мостом, иней, котёл Нэрис у канала
  group([['city_barrel',820,1850,{frost:true}],['city_walk_planter',800,1720,{frost:true}],['city_walk_tree_sage',820,1520,{frost:true}],
    ['city_walk_hedge',1200,2030,{frost:true}],['city_walk_woodpile',2250,1460,{frost:true}],['city_walk_tree_plum',2420,1560,{frost:true}],
    ['city_walk_tree_sage',2300,1950,{frost:true}],['herb_bundle_01',2010,2010],['city_crate',2020,1940,{frost:true}],['city_walk_flowerbed',2120,1820,{frost:true}],
    ['city_walk_hedge',2050,1250,{frost:true}],['city_walk_tree_amber',2350,1220,{frost:true}],['city_walk_hedge',950,1300,{frost:true}],
    ['city_walk_tree_plum',800,1250,{frost:true}],['city_walk_planter',1350,1300,{frost:true}],['city_walk_tree_amber',1460,1560,{frost:true}],
    ['city_barrel',2480,1700,{frost:true}],['city_walk_flowerbed',2450,2010,{frost:true}],['city_walk_tree_sage',1450,1420,{frost:true}]]);
  for(const [x,y] of [[1350,2030],[1900,1760],[1150,1580],[2050,1460],[1700,1340],[2380,1980],[860,1980],[1500,1240]])
    props.push({id:`city_plan_frost_${x}_${y}`,k:'frost_patch_01',...P(x,y),solid:null,l:'floor',alpha:0.6});
  // 6. Северный двор: Северный дом с палисадником, мастерская с рабочим двором, учебный плац
  group([['city_walk_flowerbed',900,640,{frost:true}],['city_barrel',960,580,{frost:true}],['city_walk_tree_plum',820,460,{frost:true}],
    ['city_walk_woodpile',2500,780,{frost:true}],['table_01',2100,960,{frost:true}],['city_walk_cart',2480,980,{frost:true}],
    ['city_walk_dummy',1460,360],['city_walk_dummy',1990,360],['city_walk_tree_sage',2500,450,{frost:true}],['city_walk_tree_amber',2100,250,{frost:true}],
    ['city_walk_hedge',900,960,{frost:true}],['city_walk_tree_sage',1350,960,{frost:true}],['city_walk_tree_plum',2150,1010,{frost:true}],
    ['city_walk_planter',1040,820,{frost:true}],['city_walk_hedge',1440,260,{frost:true}]]);
  // Сады на окраинах: у каждого свой характер и назначение.
  // Фруктовый сад между лавкой Бориса и Дуэльным залом — ряды деревьев вдоль узкой дорожки.
  for(let y=3600,row=0;y<=4640;y+=140,row++)for(let x=740+(row%2)*60;x<=1180;x+=150)place(row%3===1?'city_walk_tree_sage':'city_walk_tree_amber',x,y);
  // Аптекарский огород у восточной дорожки: грядки с травами между Домом Ковенов и банком.
  for(let y=3540,row=0;y<=3980;y+=110,row++)for(let x=2200+(row%2)*70;x<=2560;x+=150)place(row%2?'city_walk_herbbed':'city_walk_flowerbed',x,y);
  // Тихий сад у Архива: изгородь вокруг скамьи и клумбы.
  group([['city_walk_hedge',760,2700],['city_walk_hedge',760,2780],['city_walk_flowerbed',1000,2340,{paved:false}],['city_walk_tree_sage',1060,3100],
    ['city_walk_tree_amber',780,2960],['flower_white_01',940,2780],['flower_purple_01',990,2900]]);
  // Восточный сад Общества: клумбы рядами и деревья.
  for(let y=2420,row=0;y<=2900;y+=120,row++)for(let x=2180+(row%2)*80;x<=2560;x+=160)place(row%2?'city_walk_tree_plum':'city_walk_flowerbed',x,y);
  // Двор за банком и дровяной угол у южной стены.
  for(let y=4460;y<=4900;y+=110)place('city_walk_hedge',2510,y);
  group([['city_walk_tree_amber',2300,4700],['city_walk_tree_sage',2400,4840],['city_walk_planter',2300,4920],['city_walk_woodpile',1040,5470]]);
  // Жилые дворы квартала: огороды, поленницы, кадки за домами.
  group([['city_walk_woodpile',800,1400,{frost:true}],['city_walk_planter',960,1460,{frost:true}],['city_walk_tree_amber',1000,1200,{frost:true}],
    ['city_walk_flowerbed',2250,1300,{frost:true}],['city_walk_tree_sage',2520,1300,{frost:true}],['city_walk_planter',2400,1420,{frost:true}],
    ['city_walk_tree_sage',820,2010,{frost:true}],['city_walk_hedge',2480,1800,{frost:true}]]);
  // Вдоль внутренней стороны стены — ряд городских деревьев, как живая граница.
  for(const x of [730,2560])for(let y=300,i=0;y<=5480;y+=230,i++)place(['city_walk_tree_sage','city_walk_tree_amber','city_walk_tree_plum'][(i+(x>1000?1:0))%3],x,y,y<2080?{frost:true}:{});
  // Сюжетные детали: открытый погреб и спасённые жители (не мешают проходу, видны после событий)
  props.push({id:'city_plan_rescued_cellar',k:'city_cellar',...P(1050,1830),solid:null,l:'floor',requires:'ch2_rescue_cellar'});
  props.push({id:'city_plan_resident_woman',k:'city_resident_woman',...P(2160,1700),solid:null,requires:'ch2_rescue_door'});
  props.push({id:'city_plan_resident_man',k:'city_resident_man',...P(2230,1660),solid:null,requires:'ch2_rescue_door'});
  // Крупные лесные деревья — только за городской стеной.
  return {grounds,colliders,props,roads,waters:[CITY_CANAL],skipped};
}
export const cityLocal = local;
