import {currencyHours}from'../tools/balance/progression-budget.mjs';
import assert from 'node:assert/strict';
import {simulate} from '../tools/balance/full-cycle.mjs';
const a=simulate({capital:1000}),b=simulate({capital:5000});
for(let i=0;i<2;i++){const x=a.cycles[i],y=b.cycles[i];for(const k of ['netCoins','seconds','expectedSapphires','fights','crafts','fees','purchases','sales'])assert.equal(x[k],y[k],`no capital subsidy: ${k}`);assert.ok(x.coinsPerHour>0);assert.equal(x.defeats,0);}
assert.ok(a.cycles[1].rare.crafting_core>a.cycles[0].rare.crafting_core);
console.log('Two successive closed-stock cycles conserve money/time, restore vitals and supplies, and do not count starting capital as earnings.');

assert.equal(currencyHours({coins:100,sapphires:100},{coins:100,sapphires:100}),1);assert.equal(currencyHours({coins:100},{coins:-1,sapphires:1}),null);
