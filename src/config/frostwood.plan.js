// Original user-supplied 1024 × 1536 painting, displayed at one uniform scale.
export const FROSTWOOD_ART = { key: 'frostwood_painted', width: 1024, height: 1536 };
export const FROSTWOOD_RECT = { x: 3700, y: 100, w: 1600, h: 2400 };
export const frostwoodPoint = (x, y) => ({
  x: FROSTWOOD_RECT.x + x * FROSTWOOD_RECT.w / FROSTWOOD_ART.width,
  y: FROSTWOOD_RECT.y + y * FROSTWOOD_RECT.h / FROSTWOOD_ART.height,
});
export const FROSTWOOD_ARRIVAL = frostwoodPoint(735, 1440);
export const FROSTWOOD_POSITIONS = Object.fromEntries(Object.entries({
  exit_frostwood: [795, 1470],
  fw_herb_1: [510, 1280], fw_herb_2: [540, 810], fw_herb_3: [450, 195],
  fw_crystal_1: [910, 1080], fw_crystal_2: [300, 410], fw_cache: [765, 230],
  fw_wolf_1: [535, 1230], fw_wolf_2: [470, 880],
  fw_wolf_3: [790, 550], fw_wolf_4: [410, 300], fw_alpha: [820, 260],
}).map(([id, p]) => [id, frostwoodPoint(...p)]));

// Snowy path edges traced on the painting. The side paths reach the three
// bridges and the sanctuary; the surrounding trees, rocks and water are solid.
const EDGES = [
  [0,380,500],[80,435,520],[160,420,515],[240,395,500],
  [320,350,465],[360,360,515],[400,480,655],[450,625,780],
  [500,735,875],[550,745,875],[600,695,825],[650,625,765],
  [700,550,710],[750,460,620],[800,390,570],[850,395,535],
  [900,405,520],[950,430,540],[1000,455,585],[1050,490,630],
  [1100,510,650],[1150,505,640],[1200,450,590],[1250,420,565],
  [1300,440,590],[1350,500,660],[1400,585,725],[1450,640,790],
  [1500,690,840],[1536,690,855],
];

function corridor(points, width) {
  const radius = width / 2;
  const polygons = points.map(([x,y]) => Array.from({length:12}, (_,i) =>
    [x + Math.cos(i*Math.PI/6)*radius, y + Math.sin(i*Math.PI/6)*radius]));
  for (let i=1;i<points.length;i++) {
    const [x,y]=points[i-1], [xx,yy]=points[i], len=Math.hypot(xx-x,yy-y);
    const dx=-(yy-y)/len*radius, dy=(xx-x)/len*radius;
    polygons.push([[x+dx,y+dy],[xx+dx,yy+dy],[xx-dx,yy-dy],[x-dx,y-dy]]);
  }
  return polygons;
}
function walkPolygons() { return [
  [...EDGES.map(([y,l]) => [l,y]), ...[...EDGES].reverse().map(([y,,r]) => [r,y])],
  // Frozen sanctuary: snow approach, stairs and platform below the crystal.
  ...corridor([[660,425],[735,370],[800,335],[835,285],[820,235]],80),
  [[730,190],[905,190],[905,290],[760,310],[730,270]],
  // North-west bridge, east bridge and south-west bridge, including their banks.
  ...corridor([[430,380],[330,400],[245,390],[160,370],[80,340]],56),
  ...corridor([[590,1120],[680,1120],[765,1085],[860,1055],[925,1035]],64),
  ...corridor([[485,1250],[390,1235],[300,1255],[210,1310],[100,1360]],60),
]; }

function walkIntervals(y, polygons) {
  const spans=[];
  for (const p of polygons) {
    const hits=[];
    for (let i=0,j=p.length-1;i<p.length;j=i++) {
      const [x1,y1]=p[j], [x2,y2]=p[i];
      if ((y1<=y&&y<y2)||(y2<=y&&y<y1)) hits.push(x1+(y-y1)/(y2-y1)*(x2-x1));
    }
    hits.sort((a,b)=>a-b);
    for(let i=0;i+1<hits.length;i+=2) spans.push([hits[i],hits[i+1]]);
  }
  spans.sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const span of spans) {
    const last=merged.at(-1);
    if(last&&span[0]<=last[1]) last[1]=Math.max(last[1],span[1]);
    else merged.push([...span]);
  }
  return merged;
}

export function frostwoodMapData() {
  const colliders=[];
  const polygons=walkPolygons();
  const box=(id,x,y,w,h)=>{
    if(w<=0)return;
    colliders.push({id:'frostwood_'+id,kind:'painted_obstacle',...frostwoodPoint(x,y),
      w:w*FROSTWOOD_RECT.w/1024,h:h*FROSTWOOD_RECT.h/1536});
  };
  // Close the coordinate island as well as the live scene's physics bounds.
  box('north_boundary',0,0,1024,12);box('south_boundary',0,1524,1024,12);
  for(let y=12;y<1524;y+=12) {
    let x=0,n=0;
    for(const [left,right] of walkIntervals(y+6,polygons)) {
      box('edge_'+y+'_'+n++,x,y,Math.max(0,left+2-x),12);
      x=right-2;
    }
    box('edge_'+y+'_'+n,x,y,1024-x,12);
  }
  return {colliders,grounds:[{id:'frostwood_painting',tex:FROSTWOOD_ART.key,...FROSTWOOD_RECT,plate:true}]};
}

export const legacyFrostwoodPoint = p => p.x>=3600&&p.x<5400&&p.y>=0&&p.y<2650;
export function withoutLegacyFrostwood(c) {
  if(!legacyFrostwoodPoint(c)||c.y>=2500)return c;
  // Keep the old outer borders outside the new art, preserving global isolation.
  if(c.kind==='trees'&&c.w===100&&(c.x===3600||c.x===5300))return c;
  return null;
}
