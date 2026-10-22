// Approved interiors: art coordinates are authored on the 852 × 1844 concept canvas.
// 600 world pixels across keeps the 120px heroine at the approved prop-to-person scale.
export const ROOM_WIDTH = 600;
export const ROOM_HEIGHT = 1300;
export const ROOM_ART = {
  warehouse_a:{wall:540,edges:[180,680],boxes:[[490,600,200,65],[110,720,110,55],[80,1040,140,65]],occlude:[[490,500,270,170,665]],positions:{wh_equipment:[590,760],wh_collector_1:[430,890]}},
  warehouse_b:{wall:320,edges:[170,690],boxes:[[180,410,170,45],[600,405,180,50],[530,550,160,50]],occlude:[[180,230,170,225,455],[570,300,210,155,455]],positions:{wh_cargo:[515,480],wh_collector_2:[310,730],wh_elite:[540,920]}},
  bank:{wall:480,edges:[130,705],boxes:[[245,635,405,48],[0,900,155,55],[625,1095,220,60]],occlude:[[240,520,415,165,683],[0,780,160,180,955],[620,930,230,225,1155]],positions:{npc_banker:[425,590]}},
  archive:{wall:480,edges:[150,715],boxes:[[60,665,195,45],[345,745,220,45],[20,1000,150,55],[665,1030,160,55]],occlude:[[50,550,210,160,710],[335,645,245,145,790],[20,910,155,145,1055],[660,935,175,150,1085]],positions:{npc_ilaria:[305,665],archive_document:[435,791],npc_severin_archive:[560,1000],ch3_glass_leaf:[165,711]}},
  society:{wall:540,edges:[120,730],boxes:[[50,610,155,50],[685,785,150,50],[0,1250,130,50],[740,1300,100,50]],occlude:[[45,510,165,150,660],[680,700,165,135,835],[0,1170,140,130,1300],[735,1230,110,120,1350]],positions:{npc_severin:[270,720]}},
  lab:{wall:480,edges:[145,730],boxes:[[590,610,210,42],[650,825,185,45],[200,500,145,40],[720,1230,125,50]],occlude:[[585,495,225,160,655],[645,685,200,190,875],[190,430,160,110,540],[710,1140,140,145,1280]],positions:{npc_tikhon:[260,870],vol_1:[260,870],vol_2:[565,980],lab_construct:[430,740],lab_herb_1:[190,630],lab_herb_2:[650,1000],lab_chest:[190,1110],lab_cauldron:[180,950],lab_journal:[777,1286]}},
  duel:{wall:510,edges:[115,735],boxes:[[25,620,105,40],[30,1110,125,40],[690,1120,150,42],[30,1320,125,42]],occlude:[[20,580,115,80,660],[25,1040,140,110,1150],[680,1040,165,122,1162],[25,1240,135,125,1365]],positions:{npc_duelist:[230,965],final_severin:[430,820],npc_severin_after:[520,960],final_letters:[765,1163]}},
  coven:{wall:480,edges:[140,720],boxes:[[325,630,240,50],[630,680,180,42],[45,1250,120,42]],occlude:[[315,510,265,175,685],[620,535,220,190,725],[40,1170,130,122,1292]],positions:{npc_rowena:[290,665]}},
  cellar:{wall:465,edges:[100,755],boxes:[[80,470,140,42],[330,525,200,42],[600,485,135,42],[85,740,65,40],[0,960,130,55],[0,1140,145,40],[0,1280,100,50],[735,1300,117,40]],occlude:[[75,355,150,157,512],[320,450,220,117,567],[590,350,150,177,527],[75,655,85,125,780],[0,890,135,125,1015],[0,1080,150,100,1180],[0,1190,110,140,1330],[725,1200,127,140,1340]],positions:{}},
  rescue:{wall:480,edges:[100,755],boxes:[[80,495,140,45],[325,550,200,42],[620,535,130,45],[45,875,135,45],[700,800,152,200],[640,810,60,40],[770,1000,82,55],[0,1220,105,55],[785,1240,67,50]],occlude:[[75,380,150,160,540],[315,470,220,122,592],[610,350,145,230,580],[40,780,145,140,920],[690,710,162,290,1000],[630,760,75,90,850],[760,985,92,70,1055],[0,1110,110,165,1275],[775,1140,77,150,1290]],positions:{}}
};
export const paintedRoom = key => Object.hasOwn(ROOM_ART,key);
export const roomPoint = (key, x, y, rooms) => {const r=rooms.find(r=>r.key===key).rect;return {x:r.x+x/852*r.w,y:r.y+y/1844*r.h};};
export const ROOM_FILES = Object.fromEntries(Object.keys(ROOM_ART).map(key=>['city_room_'+key,'assets/city-rooms/'+key+'-v1.webp']));

export function dressPaintedRooms({grounds,colliders,props},rooms) {
  for(const r of rooms.filter(r=>paintedRoom(r.key))){
    const a=ROOM_ART[r.key],p=(x,y)=>roomPoint(r.key,x,y,rooms),box=(id,x,y,w,h)=>{
      colliders.push({id:r.id+'_'+id,kind:'room_wall',...p(x,y),w:w/852*r.rect.w,h:h/1844*r.rect.h});
    };
    const g=grounds.find(g=>g.id==='floor_'+r.id);
    Object.assign(g,{tex:'city_room_'+r.key,plate:true,tint:undefined,tileScale:undefined});
    box('wall_back',0,0,852,a.wall);
    box('wall_left',0,a.wall,a.edges[0],1844-a.wall);
    box('wall_right',a.edges[1],a.wall,852-a.edges[1],1844-a.wall);
    // Physics bounds stop the hero at the lower edge; a small clear entry remains for the exit.
    box('wall_bottom_left',0,1810,335,34);box('wall_bottom_right',525,1810,327,34);
    a.boxes.forEach((b,i)=>{
      box('furniture_'+i,...b);
      const stable=({bank:{0:'room_counter'},archive:{1:'room_desk'},lab:{3:'room_journal'},duel:{2:'room_letters'}})[r.key]?.[i];
      if(stable)colliders.at(-1).id=stable;
    });
    // Cropped overlays from the same painting restore correct Y sorting behind tables/chairs.
    a.occlude.forEach(([x,y,w,h,bottom],i)=>props.push({id:'room_overlay_'+r.key+'_'+i,k:'city_room_'+r.key,...p(x,y),
      roomCrop:{x:x/852,y:y/1844,w:w/852,h:h/1844,bottom:p(0,bottom).y},solid:null,l:'main'}));
  }
}
