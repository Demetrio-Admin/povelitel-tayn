import { pathToFileURL } from 'node:url';
import { playBot } from '../../tests/helpers/combat-bot.mjs';
import { stormDriver } from './storm-heart.mjs';
import { emptySnapshot } from '../../src/cloud/playerModel.js';
import { verifyCombat } from '../../src/cloud/combatVerify.js';
import { DUEL_VERSION, DUEL_PACING } from '../../src/config/duelPacing.js';
const gifts = (ids, level) => Object.fromEntries(ids.map(id => [id, { level, unlocked: true }]));
const profile = (id, slots, level, amulets, branches) => ({ id, level: 15, abilities: gifts(slots, level),
  build: { slots, amulets: Object.keys(amulets), amuletLevels: amulets, branches } });
export const TEMPO_PROFILES = [
  profile('throw_storm_v', ['telekinesis','fire','storm'], 5, { amulet_storm_heart:5, amulet_lunar:5 }, { telekinesis:'breaker',fire:'arsonist',storm:'discharge' }),
  profile('piercing_shards_v', ['telekinesis','seal','ice'], 5, { amulet_focus:5, amulet_astral_eye:5 }, { telekinesis:'breaker',seal:'piercer',ice:'shard' }),
  profile('spell_storm_v', ['fire','seal','storm'], 5, { amulet_storm_heart:5, amulet_lunar:5 }, { fire:'arsonist',seal:'seer',storm:'field' }),
  profile('defensive_lord_v', ['telekinesis','fire','ice'], 5, { amulet_forest:5, amulet_lunar:5 }, { telekinesis:'lord',fire:'blaster',ice:'frost' }),
  profile('frost_field_v', ['telekinesis','ice','storm'], 5, { amulet_forest:5, amulet_storm_heart:5 }, { telekinesis:'breaker',ice:'frost',storm:'field' }),
  profile('basic_i', ['telekinesis','fire','seal'], 1, {}, {}),
  profile('developed_iii', ['telekinesis','fire','ice'], 3, { amulet_forest:1, amulet_focus:1 }, { telekinesis:'lord',fire:'blaster',ice:'shard' }),
  profile('heavy_throw_v', ['telekinesis'], 5, { amulet_focus:5, amulet_breaker:5 }, { telekinesis:'breaker' }),
];
export function tempoContext(attacker, defender, version = DUEL_VERSION, potions = false) {
  return { spawn:'duel',enemy:'duel_mage',balanceVersion:40,level:15,hp:255,mana:205,abilities:attacker.abilities,build:attacker.build,
    potions: potions ? { potion_life_large:3,potion_mana_large:3,potion_crystal_shield:2,potion_antiburn:2 } : {},
    potionLoadout: potions ? ['potion_life_large','potion_mana_large','potion_crystal_shield','potion_antiburn'] : [],
    duel:{ version,rating:1000,opponent:{...defender,rating:1000} } };
}
export function tempoDriver(policy = 'aggressive', potions = false) {
  return (cm, act) => {
    if (potions) {
      if (cm.hero.hp < cm.hero.maxHp * .45) act('p','potion_life_large');
      if (cm.hero.mana < 35) act('p','potion_mana_large');
      if (cm.duelBody?.burning && !cm.burnWard) act('p','potion_antiburn');
      else if (cm.hero.hp < cm.hero.maxHp * .6 && !(cm.shields.potion?.amount > 0)) act('p','potion_crystal_shield');
    }
    if (policy === 'objects' && cm.abilityState('telekinesis').state === 'ready') {
      const objects = cm.fieldObjects.filter(o=>o.available&&o.def.throwable&&cm.canLift(o));
      const o = objects.find(o=>o.def.weight==='heavy')||objects[0];
      if (o && cm.selectedId !== o.id) act('s',o.id);
    }
    if (policy === 'aggressive' || policy === 'objects') { stormDriver(cm, act); return; }
    const ready = id => cm.abilityState(id).state === 'ready';
    if (cm.enemy.isPreparing && ready('telekinesis')) { act('a','telekinesis'); return; }
    if (cm.stormCharges === 3 && ready('storm')) { act('a','storm'); return; }
    for (const id of ['ice','seal','fire','telekinesis','storm']) if (ready(id)) { act('a',id); return; }
  };
}
export function tempoFight(ctx, policy = 'aggressive', potions = false, verify = true) {
  const p = playBot(ctx, { driver:tempoDriver(policy,potions),seed:7,potions:false,maxTicks:60*240 });
  const d = p.cm.duelBattle.defender, events = p.cm.drainEvents();
  const result = { outcome:p.cm.result,time:p.cm.time,hp:p.cm.hero.hp,mana:p.cm.hero.mana,defenderHp:p.cm.enemy.hp,
    stats:p.cm.stats,defenderStats:d.stats,heroStormHits:events.filter(e=>e.type==='damage'&&e.school==='storm'&&e.target==='enemy').length,
    defenderStormHits:events.filter(e=>e.type==='damage'&&e.school==='storm'&&e.target==='hero').length };
  if (ctx.duel.version >= 3) {
    result.manaFromHeart = events.filter(e=>e.type==='stormRefund').reduce((n,e)=>n+e.mana,0);
    result.defenderHeartRefundAt = Number.isFinite(d.stormAmuletRefundAt) ? d.stormAmuletRefundAt : null;
  }
  if (verify) {
    const snap = {...emptySnapshot(),combatSince:1000,combatCtx:ctx};
    const v = verifyCombat(snap,p.log,2000+p.log.ticks/60*1000);
    result.verified = !!(v.ok && v.verdict.outcome === (p.cm.result||'retreat') && v.verdict.mana === p.cm.hero.mana && !v.verdict.reward?.items?.sapphires);
  }
  return result;
}
export function tempoMatrix(version = DUEL_VERSION, verify = true) {
  const rows = [];
  for (const policy of ['aggressive','counter','objects']) for (const a of TEMPO_PROFILES) for (const d of TEMPO_PROFILES)
    rows.push({ attacker:a.id,defender:d.id,policy,potions:false,...tempoFight(tempoContext(a,d,version),policy,false,verify) });
  for (const a of TEMPO_PROFILES) rows.push({attacker:a.id,defender:a.id,policy:'counter',potions:true,...tempoFight(tempoContext(a,a,version,true),'counter',true,verify)});
  return rows;
}
export function tempoSummary(rows) {
  const mirror=rows.filter(r=>r.attacker===r.defender&&!r.potions);
  return { battles:rows.length,unfinished:rows.filter(r=>!r.outcome).length,min:Math.min(...rows.map(r=>r.time)),max:Math.max(...rows.map(r=>r.time)),
    mirrorMin:Math.min(...mirror.map(r=>r.time)),mirrorMax:Math.max(...mirror.map(r=>r.time)),
    mirrorUnder3:mirror.filter(r=>r.time<3).length,wins:rows.filter(r=>r.outcome==='victory').length,
    defenderCasts:rows.reduce((n,r)=>n+Object.values(r.defenderStats.abilityUses).reduce((a,b)=>a+b,0),0) };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const rows=tempoMatrix(),after={version:DUEL_VERSION,summary:tempoSummary(rows),rows};
 const out={kind:'local deterministic bots, not player win rates',balanceVersion:40,pacing:DUEL_PACING,profiles:TEMPO_PROFILES,after};
 if(process.argv.includes('--compare')){const before=tempoMatrix(2);out.before={version:2,summary:tempoSummary(before),rows:before};}
 console.log(JSON.stringify(out,null,2));
}
