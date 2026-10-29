import assert from 'node:assert/strict';
import { isolatedStorage, lookAhead, PREFIX, PROFILES } from '../src/camera-test/model.js';
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
console.log('Camera isolation and look-ahead checks passed');
