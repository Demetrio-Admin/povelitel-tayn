import assert from 'node:assert/strict';
import { isolatedStorage, lookAhead, PREFIX, PROFILES } from '../src/camera-test/model.js';
import { HUD, HUD_PAD, DOCK_ROW, topRects, bottomRects, overlaps, touchSize, shortNumber, cssPerUnit, barCenters } from '../src/camera-test/hud.js';
const saved=new Map([['witch_rpg_proto_save_v1','production'],['witch_rpg_settings_v1','settings'],['povelitel.companion','robin']]);
const raw={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
const sandbox=isolatedStorage(raw);
for(const k of ['witch_rpg_proto_save_v1','witch_rpg_settings_v1','povelitel.companion']){ assert.equal(sandbox.getItem(k),null);sandbox.setItem(k,'test');assert.equal(saved.get(PREFIX+k),'test');}
assert.equal(saved.get('witch_rpg_proto_save_v1'),'production'); assert.equal(saved.get('povelitel.companion'),'robin');
let look={x:0,y:0}; for(let i=0;i<180;i++)look=lookAhead(look,{x:230,y:0},1/60,720,1280,.09);
assert.ok(look.x>60&&look.x<=720*.09);assert.equal(look.y,0);
const before=look.x;look=lookAhead(look,{x:-230,y:0},1/60,720,1280,.09);assert.ok(Math.abs(look.x-before)<6,'brief turn is smoothed');
for(let i=0;i<180;i++)look=lookAhead(look,{x:0,y:0},1/60,720,1280,.09);assert.ok(Math.abs(look.x)<.1,'stopping returns to neutral');
assert.equal(PROFILES.a.scale,1.25);assert.equal(PROFILES.b.scale,1.25);assert.equal(PROFILES.original.scale,1);

// ---- mobile HUD geometry (pure data: the scene draws exactly these rectangles)
const top = topRects(), bottom = bottomRects();
const topNames = Object.keys(top);
for (const a of topNames) {
  const r = top[a];
  assert.ok(r.x >= 0 && r.x + r.w <= 720, `${a} stays inside the width`);
  assert.ok(r.y >= 0 && r.y + r.h <= HUD.topH, `${a} stays inside the top zone`);
  for (const b of topNames) if (a < b) assert.ok(!overlaps(top[a], top[b]), `${a} and ${b} do not overlap`);
}
assert.ok(top.hp.y + top.hp.h <= top.mana.y, 'HP bar sits above the mana bar');
assert.ok(top.mana.x + top.mana.w <= top.journal.x, 'bars end before the journal button');
assert.ok(top.portrait.x + top.portrait.w <= HUD.left, 'portrait is left of the level label and bars');
assert.ok(bottom.magic.x + bottom.magic.w < bottom.bag.x, 'Магия and Сумка do not touch');
for (const k of ['magic', 'bag']) {
  const r = bottom[k];
  assert.ok(r.x >= 0 && r.x + r.w <= 720 && r.y + r.h <= 1280, `${k} is on screen`);
  assert.ok(r.y >= HUD.bar.deadY, `${k} lies in the bottom-bar touch zone`);
}
assert.ok(barCenters()[0] < 360 && barCenters()[1] > 360);
// the Магия tray is the production dock row, lifted above the bar and clear of the contextual button
const plate = HUD.tray.plate, T = HUD.tray;
const trayTop = T.y + plate.y * T.scale, trayBottom = T.y + (plate.y + plate.h) * T.scale;
assert.ok(trayBottom <= bottom.magic.y, 'tray plate sits above the bar');
assert.ok(trayTop > HUD.topH + 200, 'tray leaves the top of the map free');
assert.ok(HUD.ctx.y < trayTop, 'contextual button is above the tray');
assert.ok(T.x + (plate.x + plate.w) * T.scale <= 720, 'tray fits the width');
assert.equal(DOCK_ROW.centers.length, 4);
// touch targets: >= 44 CSS px at every supported phone width, without spilling into the neighbour
for (const width of [320, 360, 390, 412, 720]) {
  const k = cssPerUnit(width, 720);
  assert.ok(touchSize(k, HUD.portrait.hit) * k >= 44 - 0.01, `portrait ${width}`);
  assert.ok(touchSize(k, HUD.bar.hit) * k >= 44 - 0.01, `bar ${width}`);
  const cap = Math.abs(HUD.top.menu.x - HUD.top.journal.x);
  assert.ok(touchSize(k, HUD.top.hit, cap) * k >= 44 - 0.01, `journal/menu ${width}`);
}
assert.equal(touchSize(1, 20), 44);
assert.equal(touchSize(2, 200), 200);
assert.equal(touchSize(0.4, 96, 100), 100);
// numbers
assert.equal(shortNumber(0), '0'); assert.equal(shortNumber(99999), '99999'); assert.equal(shortNumber(123456), '123к');
assert.equal(shortNumber(1234567), '1,2М'); assert.equal(shortNumber(-5), '0'); assert.equal(shortNumber('x'), '0'); assert.equal(shortNumber(12.9), '12');
assert.ok(HUD_PAD.top > HUD.topH && HUD_PAD.bottom > 0);
console.log('Camera isolation, look-ahead and mobile HUD geometry checks passed');
