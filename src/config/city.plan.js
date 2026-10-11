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
  // Торговый двор: Торговая улица уходит на запад от главной; лавка Бориса стоит на её конце, банк и доска — на востоке
  ['npc_merchant',P(1335,4420)],['city_board',P(1820,4228)],
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
    {id:'city_lawn',...CITY_RECT,tex:'city_walk_lawn',l:'ground'},
    // Иней лежит на всём квартале (трава и улицы), пока его не растопят; на площади — только в финале.
    rect('city_frost_quarter',680,160,1920,1922,'snow_ground_01',{tileScale:0.5,tint:0xdcf0f6,alpha:0.3,layerOffset:0.2}),
    rect('city_frost_plaza',680,3080,1920,1680,'snow_ground_01',{tileScale:0.5,tint:0xdcf0f6,alpha:0.36,layerOffset:0.2}),
    ...CITY_ROOMS.map(r=>({id:'floor_'+r.id,...r.rect,
      tex:['society','lab','duel','warehouse'].includes(r.key)?'city_final_stone_floor':'city_final_wood_floor',
      tileScale:['society','lab','duel','warehouse'].includes(r.key)?0.25:0.22,
      ...(['lab','warehouse'].includes(r.key)?{tint:0xc6c0b3}:{}),interior:true})),
  ];
  const road=(id,w,pts,kind='stone')=>({id:'city_street_'+id,kind,w,pts:pts.map(([x,y])=>{const p=P(x,y);return [p.x,p.y];}),seamless:true,
    ...(kind==='stone'?{texture:'city_walk_paving',tileScale:0.24,urban:true}:{})});
  const roads=[
    // Главная улица — одна прямая ось x=1560 от Складской улицы до моста, дальше мягкий поворот к проходу в Северный двор.
    // Всё остальное — ровные ответвления одной ширины под прямым углом, каждое ведёт к двери своего дома; без петель и пятачков.
    road('main_gate',130,[[640,5170],[1100,5170],[1560,5170]]),
    road('south_street',130,[[1560,5170],[1900,5170],[2200,5170]]),
    road('main_south',130,[[1560,5170],[1560,4600]]),
    road('main_market',130,[[1560,4610],[1560,3790]]),
    road('main_garden',130,[[1560,3270],[1560,2270]]),
    road('bridge',130,[[1560,2280],[1560,2010]]),
    road('main_quarter',130,[[1560,2030],[1560,1800],[1590,1610],[1670,1410],[1720,1260],[1720,1140],[1720,930]]),
    // Склады смотрят на Складскую улицу: короткие дорожки от неё к дверям
    road('a_path',90,[[1150,5170],[1150,5040]]),
    road('b_path',90,[[2050,5170],[2050,5105]]),
    // Торговая улица: на запад — к лавке Бориса, на восток — к банку; поперечная на всю ширину перекрёстка
    road('market_street',190,[[1190,4350],[1560,4350]]),
    road('bank_lane',110,[[1560,4300],[2050,4300]]),
    // Центральная площадь и тренировочный двор — круглые, с фонтаном и плацем внутри
    road('square',540,[[1490,3540],[1510,3540]]),
    road('yard',500,[[1710,690],[1730,690]]),
    // Ответвления к домам (дорожка заканчивается у самой двери)
    road('duel_lane',110,[[1400,3330],[1100,3330]]),
    road('coven_lane',110,[[1560,3220],[1950,3220]]),
    road('archive_lane',110,[[1560,2620],[1250,2620]]),
    road('society_lane',110,[[1560,2760],[1950,2760]]),
    road('cellar_lane',110,[[1560,1880],[1250,1880]]),
    road('rescue_lane',110,[[1600,1640],[1990,1640]]),
    road('bay_lane',110,[[1500,680],[1200,680]]),
    road('workshop_lane',110,[[1900,870],[2250,870]]),
    // Набережная на южном берегу канала: короткая аллея с фонарями и скамьями, не от стены до стены
    road('embankment',90,[[1080,2252],[2040,2252]]),
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
  col('fountain',1446,3484,108,108,'furniture',{tex:'city_final_fountain',editorStyle:{w:210,h:200}});   // в центре круглой площади
  // Скамьи: на площади и у лавки, на набережной и в тихих садах — всегда у дорожки или под деревом, а не посреди газона.
  for(const [i,[x,y]] of [[1330,3690],[1700,3670],[1400,4545],[1270,2338],[1850,2338],[1400,2850],[2280,2600],[1010,780],[1610,990],[2300,3880],[1870,5345]].entries())
    col('bench_'+i,x-48,y-17,96,17,'furniture',{tex:'city_final_bench'});
  col('market',1124,4332,132,48,'furniture',{tex:'market_stall_01'});
  // Ограды: одиночные заборчики посреди газона убраны — края садов держат живые изгороди и клумбы (см. декор ниже).
  const fence=(id,x,y,w,style)=>col('fence_'+id,x,y-12,w,12,'fence',{style});   // низкая ограда для правок редактора; в плане не используется
  void fence;
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

  // ---- уличные детали (v0.38): сады у домов, рощи, огород и фруктовый сад — группы со смыслом, без рядов и полос.
  // Подходы к дверям, улицы и квестовые места свободны; всё, что не прошло проверку, молча пропускается (skipped).
  const streetShapes=roads.map((r,i)=>buildRoad(r,100+i));
  const doorClear = p => BUILDINGS.some(b => Math.abs(p.x-b.door.x)<110 && p.y>b.door.y-25 && p.y<b.door.y+125);
  const questClear = p => Object.values(CITY_POSITIONS).some(o => insideRect(o,CITY_RECT) && Math.hypot(p.x-o.x,p.y-o.y)<(o.collide?130:100));
  const spotClear = p => [...Object.values(CITY_SPOTS),...Object.values(CITY_ADMIN_POINTS)].some(s => Math.hypot(p.x-s.x,p.y-s.y)<90);
  const onStreet = p => streetShapes.some(r=>distToPolygon(p.x,p.y,r.poly)<14);
  const footprint = (p,s) => colliders.some(c=>c.kind!=='trees' && p.x+s.w/2+6>c.x && p.x-s.w/2-6<c.x+c.w && p.y+6>c.y && p.y-s.h-6<c.y+c.h);
  const inCanal = p => Math.abs(p.y-CITY_CANAL.pts[0][1])<CITY_CANAL.half+6 && p.x>CITY_CANAL.pts[0][0] && p.x<CITY_CANAL.pts[1][0];
  const nearProp = (p,k) => props.some(q=>q.k===k && Math.hypot(q.x-p.x,q.y-p.y)<90);
  const stacked = (p,s) => props.some(q=>q.solid && p.x+s.w/2+8>q.x-q.solid.w/2 && p.x-s.w/2-8<q.x+q.solid.w/2 && p.y+8>q.y-q.solid.h && p.y-s.h-8<q.y);
  let index=0;const skipped=[];
  const SOLID={city_walk_tree_sage:{w:18,h:10},city_walk_tree_amber:{w:18,h:10},city_walk_tree_plum:{w:16,h:10},
    city_walk_hedge:{w:104,h:22},city_walk_flowerbed:{w:104,h:22},city_walk_herbbed:{w:104,h:22},city_walk_planter:{w:72,h:18},
    city_walk_pumpkins:{w:86,h:20},city_walk_porch_pots:{w:68,h:18},city_walk_lamp:{w:16,h:10},
    city_walk_woodpile:{w:96,h:22},city_walk_cart:{w:112,h:26},city_walk_dummy:{w:26,h:12},city_walk_sacks:{w:70,h:18},
    city_lamp_01:{w:16,h:10},city_crate:{w:56,h:20},city_barrel:{w:44,h:18},plant_pot_01:{w:30,h:14},bush_02:{w:48,h:22},bush_01:{w:48,h:22},
    city_duel_rack:{w:70,h:18},rune_slab_01:{w:70,h:20},table_01:{w:90,h:22},lantern_02:{w:30,h:12}};
  // paved: a stall's goods, a planter or a lamp may stand on paving on purpose; doors, quest spots and spots of the walk stay clear regardless.
  const place=(k,x,y,extra={})=>{
    const p=P(x,y);
    const {force,...rest}=extra,paved=rest.paved;
    if(!force && inCanal(p)){skipped.push([k,x,y,'water']);return false;}
    if(!force && (doorClear(p)||questClear(p)||spotClear(p))){skipped.push([k,x,y,doorClear(p)?'door':'quest']);return false;}
    if(!force && !paved && onStreet(p)){skipped.push([k,x,y,'street']);return false;}
    const solid=Object.hasOwn(rest,'solid')?rest.solid:SOLID[k]??null;
    if(solid && !force && (footprint(p,solid) || nearProp(p,k) || stacked(p,solid))){skipped.push([k,x,y,footprint(p,solid)?'footprint':'near']);return false;}
    if(rest.frost===undefined && y<2100)rest.frost=true;   // всё севернее канала лежит под инеем квартала
    props.push({id:'city_plan_'+(rest.name||k.replace(/^city_(walk_)?/,'')+'_'+index++),k,...p,solid,...rest});
    return true;
  };
  const group=(list)=>list.forEach(([k,x,y,extra])=>place(k,x,y,extra));
  // Rhythm along a street: a lamp on every long stretch, alternating sides.
  const along=(id,step,first,fn)=>{
    const r=roads.find(r=>r.id==='city_street_'+id),pts=catmullRom(r.pts,10);
    let acc=0,next=first,side=1;
    for(let i=1;i<pts.length;i++){
      const [ax,ay]=pts[i-1],[bx,by]=pts[i],d=Math.hypot(bx-ax,by-ay);acc+=d;
      if(acc<next)continue;
      const nx=-(by-ay)/d,ny=(bx-ax)/d;fn(bx-CITY_RECT.x,by-CITY_RECT.y,nx,ny,side,r.w/2);side=-side;next+=step;
    }
  };
  for(const id of ['main_gate','south_street','main_south','main_market','main_garden','main_quarter','embankment',
    'market_street','bank_lane','duel_lane','coven_lane','archive_lane','society_lane','cellar_lane','rescue_lane','bay_lane','workshop_lane']){
    along(id,id==='embankment'?240:330,id==='embankment'?60:/lane|street$|bank/.test(id)&&!/^(main|south)/.test(id)?170:120,(x,y,nx,ny,side,hw)=>{
      place('city_lamp_01',x+nx*side*(hw+22),y+ny*side*(hw+22))||place('city_lamp_01',x-nx*side*(hw+22),y-ny*side*(hw+22));
    });
  }
  // Seeded scatter: natural groves (never rows). Trees mix three species; the filter in place() drops anything that would block.
  const rng=seed=>{let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};};
  const TREES=['city_walk_tree_sage','city_walk_tree_amber','city_walk_tree_plum'];
  const grove=(cx,cy,rx,ry,n,seed,gap=125,kinds=TREES)=>{
    const r=rng(seed),pts=[];
    for(let tries=0;pts.length<n&&tries<n*60;tries++){
      const a=r()*Math.PI*2,d=Math.sqrt(r()),x=Math.round(cx+Math.cos(a)*d*rx),y=Math.round(cy+Math.sin(a)*d*ry);
      if(pts.some(q=>Math.hypot(q.x-x,q.y-y)<gap))continue;
      pts.push({x,y,k:kinds[Math.floor(r()*kinds.length)]});
    }
    pts.sort((a,b)=>a.y-b.y).forEach(q=>place(q.k,q.x,q.y));
  };
  // 1. Дорога и ворота: фонари у въезда, тропа к лаборатории уходит в лес
  group([['lantern_02',430,5070],['lantern_02',590,5262],['city_walk_wall_post',660,5088,{solid:null,force:true,name:'gate_post_n'}],
    ['city_walk_wall_post',660,5268,{solid:null,force:true,name:'gate_post_s'}],['city_lamp_01',730,5080],['city_lamp_01',730,5280],
    ['lantern_01',220,3990],['city_crate',480,3990],['rock_small_01',150,4060],['flower_white_01',410,4880],['flower_purple_01',200,4980]]);
  // 2. Склады на Складской улице: у каждого свой рабочий двор, перед дверью — клумбы и кадки
  group([['city_walk_cart',860,5040],['city_walk_sacks',880,4950],['city_crate',760,4990,{name:'crate_a_wall'}],['city_walk_woodpile',770,4870],
    ['city_barrel',760,5060,{name:'barrel_a_wall'}],['city_walk_tree_sage',860,4770],['city_crate',1385,5000],['city_barrel',1410,5055],
    ['city_walk_porch_pots',1025,5040,{paved:true}],['city_walk_porch_pots',1275,5040,{paved:true}],['city_walk_hedge',1040,5085],['city_walk_hedge',1260,5085]]);
  group([['city_crate',2290,5010],['city_crate',2335,5055],['city_barrel',2390,5015],['city_walk_sacks',2300,4940],['city_walk_cart',1790,5050],
    ['city_walk_tree_amber',2400,4880],['city_walk_woodpile',2470,5330],['city_walk_porch_pots',1925,5105,{paved:true}],['city_walk_porch_pots',2175,5105,{paved:true}],
    ['city_walk_hedge',1930,5090],['city_walk_hedge',2170,5090]]);
  // Южный сад вдоль стены: клумбы, скамья и тихие деревья
  group([['city_walk_tree_sage',900,5440],['city_walk_flowerbed',1050,5410],['city_walk_tree_plum',1250,5470],['city_walk_flowerbed',1450,5430],
    ['city_walk_planter',1680,5400],['city_walk_tree_amber',1810,5470],['city_walk_hedge',2050,5420],['city_walk_tree_sage',2210,5490],
    ['flower_purple_01',1120,5450],['city_walk_woodpile',1040,5475],['city_walk_pumpkins',2300,5420]]);
  // 3. Торговая улица: лавка Бориса со своим товаром (место покупателя свободно), перед банком — доска и кадки
  group([['city_crate',1120,4440,{paved:true}],['city_barrel',1120,4495,{paved:true}],['city_walk_sacks',1310,4330,{paved:true}],
    ['plant_pot_01',1400,4375,{paved:true,name:'merchant_herbs'}],['city_walk_tree_amber',1170,4225],['flower_purple_01',1400,4510],
    ['city_walk_planter',1840,4410],['city_walk_flowerbed',1960,4440],['city_walk_hedge',2110,4430],['city_walk_tree_sage',2260,4560],
    ['city_walk_porch_pots',1925,4325,{paved:true}],['city_walk_porch_pots',2175,4325,{paved:true}],['bush_01',1840,4640],['city_walk_pumpkins',1255,4560]]);
  // 4. Площадь: кольцо фонарей по краю, цветы на мостовой, четыре уголка зелени вокруг; восточная половина свободна для событий
  for(const a of [20,160,200,340])place('city_lamp_01',1500+Math.round(255*Math.cos(a*Math.PI/180)),3540+Math.round(255*Math.sin(a*Math.PI/180)),{paved:true});
  group([['flower_purple_01',1300,3550,{paved:true}],['flower_white_01',1460,3550,{paved:true}],
    ['city_walk_tree_amber',1190,3270],['city_walk_flowerbed',1250,3260],['city_walk_tree_plum',1810,3250],['city_walk_flowerbed',1780,3290],
    ['city_walk_tree_sage',1180,3830],['city_walk_hedge',1260,3850],['city_walk_tree_amber',1830,3840],['city_walk_flowerbed',1760,3860]]);
  // 5. Двор Дуэльного зала: чучела и стойка у западной стороны, перед дверью — кадки
  group([['city_walk_dummy',850,3290],['city_walk_dummy',790,3390],['city_duel_rack',960,3420],['city_sign_duel',1180,3300,{solid:null,paved:true,name:'duel_sign'}],
    ['city_walk_tree_amber',800,3170],['city_walk_hedge',1010,3480],['city_walk_porch_pots',975,3305,{paved:true}],['city_walk_porch_pots',1225,3305,{paved:true}]]);
  // 6. Дом Ковенов: травяной сад и фонари под полумесяцем
  group([['city_walk_herbbed',2210,3240],['city_walk_herbbed',2220,3090],['lantern_02',2120,3210],['city_sign_coven',1800,3195,{solid:null,paved:true,name:'coven_sign'}],
    ['city_walk_tree_plum',2250,2980],['candle_group_01',2090,3225,{solid:null,paved:true}],['city_walk_porch_pots',1825,3250,{paved:true}],
    ['city_walk_porch_pots',2075,3250,{paved:true}],['bush_02',2000,3330],['city_walk_hedge',1840,3330]]);
  // 7. Тихий сад у Архива: скамья в кольце живых изгородей, клумбы и деревья по краям
  group([['city_sign_archive',1420,2600,{solid:null,paved:true,name:'archive_sign'}],['city_walk_porch_pots',1125,2625,{paved:true}],['city_walk_porch_pots',1375,2650,{paved:true}],
    ['city_walk_tree_plum',770,2400],['city_walk_hedge',900,2680],['city_walk_hedge',1010,2680],['city_walk_flowerbed',860,2870],['city_walk_flowerbed',1020,2870],
    ['city_walk_tree_sage',760,2780],['city_walk_tree_amber',1080,2960],['flower_white_01',940,2780],['flower_purple_01',990,2900],['city_walk_hedge',810,2330],
    ['city_walk_tree_sage',1280,2900],['city_walk_flowerbed',1250,2990],['city_walk_planter',1440,2400],['city_walk_tree_amber',1450,2970]]);
  // 8. Общество Преображения: двор с рунной плитой и восточный сад
  group([['rune_slab_01',1780,2880],['city_sign_society',2100,2750,{solid:null,paved:true,name:'society_sign'}],['city_walk_planter',2160,2640],
    ['flower_purple_01',1830,2840],['city_walk_porch_pots',1825,2790,{paved:true}],['city_walk_porch_pots',2075,2790,{paved:true}],['city_walk_tree_sage',2180,2430],
    ['city_walk_tree_plum',2460,2680],['city_walk_flowerbed',2490,2420],['city_walk_hedge',2260,2960],['city_walk_tree_amber',2470,3000],
    ['city_walk_tree_sage',2330,2850],['city_walk_flowerbed',2160,2870]]);
  // 9. Набережная: фонари у воды и цветы на краях аллеи
  for(const x of [900,2350])place('city_lamp_01',x,2192);
  for(const [x,y] of [[1492,2084],[1628,2084],[1492,2186],[1628,2186]])place('city_walk_wall_post',x,y,{solid:null,force:true,name:'bridge_post_'+x+'_'+y});
  group([['city_walk_flowerbed',1050,2335],['city_walk_flowerbed',2080,2335],['city_walk_tree_plum',2240,2330],['city_walk_tree_sage',880,2335]]);
  // 10. Замёрзший квартал: дома за мостом, иней, котёл Нэрис у канала
  group([['city_walk_porch_pots',1125,1910,{paved:true}],['city_walk_porch_pots',1375,1910,{paved:true}],['city_walk_porch_pots',1865,1670,{paved:true}],
    ['city_walk_porch_pots',2115,1670,{paved:true}],['city_barrel',830,1850],['city_walk_planter',810,1720],['city_walk_woodpile',840,1450],['city_walk_planter',960,1470],
    ['city_walk_tree_sage',860,1580],['city_walk_hedge',1200,2040],['city_walk_woodpile',2250,1460],['city_walk_tree_plum',2420,1560],['city_walk_tree_sage',2310,1950],
    ['herb_bundle_01',2010,2010],['city_crate',2020,1945],['city_walk_flowerbed',2120,1830],['city_barrel',2480,1700],['city_walk_flowerbed',2450,2010],
    ['city_walk_tree_amber',2350,1230],['city_walk_hedge',2050,1250],['city_walk_tree_plum',820,1260],['city_walk_hedge',950,1310],['city_walk_planter',1350,1310],
    ['city_walk_tree_amber',1450,1560],['city_walk_tree_sage',1420,1400],['city_walk_flowerbed',2250,1290]]);
  for(const [x,y] of [[1350,2030],[1900,1760],[1150,1580],[2050,1460],[1700,1340],[2380,1980],[860,1980],[1500,1240]])
    props.push({id:`city_plan_frost_${x}_${y}`,k:'frost_patch_01',...P(x,y),solid:null,l:'floor',alpha:0.6});
  // 11. Северный двор: Северный дом с палисадником, мастерская с рабочим двором, учебный плац
  group([['city_walk_porch_pots',1075,705,{paved:true}],['city_walk_porch_pots',1325,705,{paved:true}],['city_walk_flowerbed',900,650],['city_barrel',960,590],
    ['city_walk_tree_plum',820,460],['city_walk_woodpile',2500,790],['table_01',2110,975],['city_walk_cart',2480,985],['city_walk_porch_pots',2125,890,{paved:true}],
    ['city_walk_porch_pots',2375,890,{paved:true}],['city_walk_dummy',1460,360],['city_walk_dummy',1990,360],['city_walk_tree_sage',2500,450],
    ['city_walk_tree_amber',2100,260],['city_walk_hedge',900,960],['city_walk_tree_sage',1350,960],['city_walk_tree_plum',2150,1020],['city_walk_planter',1040,830],
    ['city_walk_hedge',1440,250]]);
  // Палисадники вдоль ответвлений: клумба и живая изгородь по южной стороне каждой дорожки (с северной стоит фасад)
  roads.filter(r=>/_lane$/.test(r.id)).forEach((r,i)=>{
    const [[ax,ay],[bx,by]]=[r.pts[0],r.pts[r.pts.length-1]].map(([x,y])=>[x-CITY_RECT.x,y-CITY_RECT.y]);
    [0.32,0.68].forEach((f,j)=>place((i+j)%2?'city_walk_hedge':'city_walk_flowerbed',ax+(bx-ax)*f,ay+(by-ay)*f+128));
  });
  // Садовая стена Северного двора: кусты, клумбы и пара деревьев кучками, чтобы она не читалась голой полосой
  group([['city_walk_hedge',840,1180],['city_walk_flowerbed',960,1176],['bush_02',1250,1172],['city_walk_tree_plum',1330,1195],
    ['city_walk_flowerbed',2000,1176],['city_walk_hedge',2110,1180],['bush_01',2380,1172],['city_walk_tree_amber',2480,1195],
    ['bush_02',1010,1078],['city_walk_flowerbed',1450,1072],['city_walk_hedge',2300,1078],['city_walk_tree_sage',2050,1085]]);
  // Тренировочный плац: фонари по краю круглой площади
  for(const a of [25,155,205,335])place('city_lamp_01',1720+Math.round(235*Math.cos(a*Math.PI/180)),690+Math.round(235*Math.sin(a*Math.PI/180)),{paved:true});
  // 12. Рощи и сады на окраинах — у каждой своё назначение
  grove(860,380,150,150,4,11);grove(2450,330,110,110,3,12);grove(880,1190,160,150,3,13);grove(2480,1140,110,100,3,14);
  // Фруктовый сад между лавкой Бориса и Дуэльным залом
  grove(930,4070,200,520,13,21,135,['city_walk_tree_sage','city_walk_tree_amber','city_walk_tree_amber','city_walk_tree_plum']);
  group([['bush_02',760,4540],['city_walk_hedge',1060,4630],['city_walk_hedge',780,4400],['flower_white_01',1180,3960],['flower_purple_01',830,3620],['city_walk_flowerbed',1100,3830]]);
  // Аптекарский огород у Дома Ковенов и банка: компактные грядки с травами, скамья и несколько деревьев
  group([['city_walk_herbbed',2200,3640],['city_walk_herbbed',2330,3640],['city_walk_flowerbed',2460,3640],['city_walk_herbbed',2200,3730],
    ['city_walk_herbbed',2330,3730],['city_walk_flowerbed',2460,3730],['city_walk_hedge',2330,3560],['city_walk_planter',2150,3910],['city_walk_flowerbed',2440,3960]]);
  grove(2370,3880,190,330,8,31);grove(2400,4660,180,260,5,32);grove(2420,2200,120,90,2,33);
  grove(940,5290,140,100,3,34);grove(2250,5400,300,90,4,35);
  // Сады у стен: по одной живой группе, а не ряды вдоль ограды
  grove(760,2150,70,60,2,41);grove(2490,2300,80,80,3,42);grove(780,3600,60,150,3,43);grove(2500,4300,60,100,3,44);
  // Цветочные бордюры у домов
  for(const [x,y] of [[1000,3140],[1130,2990],[2400,3180],[2380,4090],[2160,4650],[1990,4770],[1300,4700],[990,5250],[1260,5390],[2260,5350],[1300,1390],[1050,950],[1930,1960],[2310,1980]])
    place('city_walk_flowerbed',x,y);
  // Cozy details belong to the houses, not the middle of a walking route.
  group([['city_walk_pumpkins',1170,4610],['city_walk_pumpkins',955,5030],['city_walk_pumpkins',2270,5090],['city_walk_pumpkins',1040,780],['city_walk_pumpkins',990,1970],
    ['city_walk_herbbed',185,4090],['city_walk_porch_pots',470,4140]]);
  // Keep the existing lantern positions and footprints; only the town artwork changes.
  for(const p of props)if(p.k==='city_lamp_01'){
    p.k='city_walk_lamp';p.light=42;
  }
  // Сюжетные детали: открытый погреб и спасённые жители (не мешают проходу, видны после событий)
  props.push({id:'city_plan_rescued_cellar',k:'city_cellar',...P(1050,1830),solid:null,l:'floor',requires:'ch2_rescue_cellar'});
  props.push({id:'city_plan_resident_woman',k:'city_resident_woman',...P(2160,1700),solid:null,requires:'ch2_rescue_door'});
  props.push({id:'city_plan_resident_man',k:'city_resident_man',...P(2230,1660),solid:null,requires:'ch2_rescue_door'});
  // Крупные лесные деревья — только за городской стеной.
  return {grounds,colliders,props,roads,waters:[CITY_CANAL],skipped};
}
export const cityLocal = local;
