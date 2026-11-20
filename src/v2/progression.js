import { CORE, ECONOMY, GIFT_RULES } from '../config/horizon/rules.js';
import { HORIZON_TABLES } from '../config/horizon/tables.generated.js';

const byId = rows => Object.fromEntries(rows.map(row => [row.id, row]));
export const POTIONS_41 = byId(HORIZON_TABLES.potions_20);
export const AMULETS_41 = byId(HORIZON_TABLES.amulets_20);
export const TIERS_41 = Object.fromEntries(HORIZON_TABLES.resource_tiers.map(row => [row.tier, row]));
const stars = HORIZON_TABLES.gift_progression.filter(row => row.axis === 'star');
const colors = HORIZON_TABLES.gift_progression.filter(row => row.axis === 'color');
const amuletRanks = HORIZON_TABLES.amulet_tiers;
const skyMinutes = HORIZON_TABLES.economy_tide.find(row => row.key === 'ritual_speedup_minutes').value;
const chestPrice = HORIZON_TABLES.economy_tide.find(row => row.key === 'chest_single').sapphire_cost;
const chestTenPrice = HORIZON_TABLES.economy_tide.find(row => row.key === 'chest_ten').sapphire_cost;
const chestPity = HORIZON_TABLES.economy_tide.find(row => row.key === 'chest_pity').threshold;
const blessing = HORIZON_TABLES.economy_tide.find(row=>row.key==='hunt_boost_hours');
const initialGift = () => ({ stars: 1, color: 'white', rank: 1 });
export const dayAt = now => new Date(now).toISOString().slice(0,10);
export const ITEM_LABELS = {
  coins: 'Монеты', moon_herb:'Лунная трава', tree_resin:'Древесная смола', lunar_wick:'Лунный фитиль',
  frost_herb:'Морозник', rune_dust:'Руническая пыль', cold_heart:'Сердце холода',
  mirra_lantern_restored:'Починенный фонарь Мирры', recipe_amulet_forest:'Рецепт Амулета леса',
  recipe_amulet_frost:'Рецепт Амулета инея', recipe_amulet_market:'Чертёж Бориса',
};
export const itemLabel = id => ITEM_LABELS[id] || POTIONS_41[id]?.name || AMULETS_41[id]?.name || id;
export const itemList = entries => Object.entries(entries).filter(([,qty])=>qty).map(([id,qty])=>itemLabel(id) + ' ×' + qty).join(' · ');

export function hydrateActProgress(raw, inventory, sapphires) {
  const p = {
    tasks: {}, giftShards: {}, gifts: {fire:initialGift(),telekinesis:initialGift()},
    loadout: ['telekinesis','fire'], tempers: {}, amuletLevels: {}, amulet: null, activeCompanion: null,
    wandLevel: 1, vigor: 1, satchel: ECONOMY['bag.base_slots'], rituals: {}, presets: {}, presetSlots: 1,
    chestOpens: 0, gathering: {}, field: {}, eliteDay: {}, dailyBoard: {},
    ...raw, inv: { ...inventory }, coins: inventory.coins ?? 0, herbs: inventory.moon_herb ?? 0, sapphires,
  };
  if (!raw.giftShards && raw.shards) p.giftShards = { fire: raw.shards };
  if (!raw.activeCompanion && raw.fox) p.activeCompanion = 'fox';
  return p;
}

function withItems(p, values) {
  const inv = { ...p.inv, coins:p.coins, moon_herb:p.herbs };
  for (const [id, qty] of Object.entries(values)) inv[id] = (inv[id] || 0) + qty;
  return {...p, inv, coins:inv.coins, herbs:inv.moon_herb};
}
export const hasCost = (p, cost) => Object.entries(cost || {}).every(([id,qty])=>(p.inv[id] || 0) >= qty);
export const payItems = (p, cost) => hasCost(p,cost) ? withItems(p,Object.fromEntries(Object.entries(cost || {}).map(([id,qty])=>[id,-qty]))) : null;
export function gearSpace(p) {
  return Object.entries(p.inv).reduce((sum,[id,n])=>sum + (id !== 'coins' && (id in ITEM_LABELS || id in POTIONS_41) && !id.startsWith('recipe_') && !id.startsWith('mirra_') ? n : 0),0);
}

export function award(p, reward) {
  if (!reward) return p;
  let next = withItems(p,{...reward.items,coins:reward.coins || 0});
  const count = {...next.giftShards};
  let gifts = {...next.gifts};
  for (const [id,qty] of Object.entries(reward.shards || {})) {
    if (!GIFT_RULES[id]) continue;
    count[id]=(count[id] || 0)+qty;
    if (!gifts[id] && count[id]>=Number(stars[0].shards_or_tier)) {
      gifts[id]=initialGift();
      count[id]-=Number(stars[0].shards_or_tier);
    }
  }
  if (reward.learn && !gifts[reward.learn]) gifts[reward.learn]=initialGift();
  next = {...next,giftShards:count,gifts,sapphires:next.sapphires+(reward.sapphires || 0)};
  if (reward.equip && gifts[reward.equip] && !next.loadout.includes(reward.equip)) {
    next.loadout=[...next.loadout.slice(0,2),reward.equip];
  }
  if (reward.companion) {
    next=withItems({...next,activeCompanion:reward.companion},{['companion_'+reward.companion]:1});
  }
  return next;
}

export function levelCost(level) {
  const pivot=CORE.soft_cap_level??CORE.target_year_levels;
  return Math.floor(ECONOMY['level.cost_base'] * ECONOMY['level.cost_growth'] ** (Math.min(level,pivot)-1)
    * ECONOMY['level.paragon_cost_growth'] ** Math.max(0,level-pivot));
}

export function levelTrack(p,id) {
  const rank=id==='wand' ? p.wandLevel : id==='vigor' ? p.vigor : id==='fox' || id==='robin' ? p.tempers[id] || 1 : p.gifts[id]?.rank;
  if (!rank || rank>=p.huntLevel) return null;
  const next=payItems(p,{coins:levelCost(rank)});
  if (!next) return null;
  if (id==='wand') return {...next,wandLevel:rank+1,wandRank:Math.min(CORE.wand_max_tempo_rank,p.wandRank+1)};
  if (id==='vigor') return {...next,vigor:rank+1};
  if (id==='fox' || id==='robin') return {...next,tempers:{...next.tempers,[id]:rank+1}};
  return {...next,gifts:{...next.gifts,[id]:{...next.gifts[id],rank:rank+1}}};
}

export function giftMultiplier(gift) {
  if (!gift) return 1;
  return (stars[gift.stars-1]?.mult ?? 1) * (colors.find(color=>color.step===gift.color)?.mult ?? 1);
}
export function starGift(p,id) {
  const gift=p.gifts[id], row=gift && stars[gift.stars];
  if (!row || (p.giftShards[id] || 0)<Number(row.shards_or_tier)) return null;
  const next=payItems(p,{coins:row.coin_cost});
  if (!next) return null;
  return {...next,gifts:{...next.gifts,[id]:{...gift,stars:gift.stars+1}},giftShards:{...next.giftShards,[id]:next.giftShards[id]-Number(row.shards_or_tier)}};
}
export function colorOffer(gift) {
  const i=colors.findIndex(row=>row.step===gift?.color);
  const row=i>=0 && colors[i+1];
  if (!row) return null;
  const tier=TIERS_41[row.shards_or_tier];
  const cost={ coins:row.coin_cost, [tier.common_id]:row.common_qty,[tier.rare_id]:row.rare_qty,[tier.catalyst_id]:row.catalyst_qty };
  return {...row,cost};
}
export function startColor(p,id,now,lesson = false) {
  const gift=p.gifts[id], row=colorOffer(gift);
  if (!row || p.rituals[id]) return null;
  const cost=lesson && gift.color==='white' ? {moon_herb:4,tree_resin:2} : row.cost;
  const next=payItems(p,cost);
  if (!next) return null;
  if (!row.ritual_min) return {...next,gifts:{...next.gifts,[id]:{...gift,color:row.step}}};
  return {...next,rituals:{...next.rituals,[id]:{ color:row.step,at:now+row.ritual_min*60000 }}};
}
export function finishRitual(p,id,now,accelerate = false,kind = 'gift') {
  const key=kind==='amulet'?'amulet:'+id:id;
  const ritual=p.rituals[key];
  if (!ritual) return null;
  const cost=Math.ceil(Math.max(0,ritual.at-now)/(skyMinutes*60000));
  if (cost>0 && (!accelerate || p.sapphires<cost)) return null;
  const rituals={...p.rituals}; delete rituals[key];
  const next={...p,rituals,sapphires:p.sapphires-cost};
  if (kind==='amulet') return {...next,amuletLevels:{...p.amuletLevels,[id]:ritual.rank}};
  return {...next,gifts:{...p.gifts,[id]:{...p.gifts[id],color:ritual.color}}};
}

export function amuletOffer(p,id) {
  if (!AMULETS_41[id]) return null;
  const rank=p.amuletLevels[id];
  if (rank===undefined) {
    const recipe=id==='amulet_forest'?'recipe_amulet_forest':id==='amulet_frost'?'recipe_amulet_frost':'recipe_amulet_market';
    if (!p.inv[recipe]) return null;
    const row=amuletRanks[0];
    return {...row,cost:{coins:row.coin_cost}};
  }
  const row=amuletRanks[rank+1];
  if (!row) return null;
  return {...row,cost:{coins:row.coin_cost,[TIERS_41[row.catalyst_tier].catalyst_id]:row.catalyst_qty}};
}
export function forgeAmulet(p,id,now) {
  const row=amuletOffer(p,id);
  if (!row || p.rituals['amulet:'+id]) return null;
  const next=payItems(p,row.cost);
  if (!next) return null;
  if (row.ritual_min) return {...next,rituals:{...p.rituals,['amulet:'+id]:{rank:row.plus_level,at:now+row.ritual_min*60000}}};
  return {...next,amulet:id,amuletLevels:{...p.amuletLevels,[id]:row.plus_level}};
}
export const amuletPower = rank => amuletRanks[rank]?.power_mult ?? 1;
export function craftPotion(p,id) {
  const potion=POTIONS_41[id];
  if (!potion || gearSpace(p)>=p.satchel) return null;
  const next=payItems(p,potion.recipe_json);
  return next ? withItems(next,{[id]:1}) : null;
}
export function trade(p,id,tier,buy) {
  if (id!==tier.common_id && id!==tier.rare_id) return null;
  const price=id===tier.common_id?tier.buy_price_common:tier.buy_price_rare;
  if (buy && gearSpace(p)>=p.satchel) return null;
  const next=payItems(p,buy?{coins:price}:{[id]:1});
  return next ? withItems(next,buy?{[id]:1}:{coins:Math.floor(price*ECONOMY['gather.vendor_sell_ratio'])}) : null;
}
export function expandSatchel(p) {
  const row=HORIZON_TABLES.economy_tide.find(row=>row.section==='bag'&&row.key==='extra_slots');
  return p.sapphires<row.sapphire_cost?null:{...p,sapphires:p.sapphires-row.sapphire_cost,satchel:p.satchel+row.value};
}
export function blessHunt(p,now) {
  if (p.sapphires<blessing.sapphire_cost || p.blessingUntil>now) return null;
  return {...p,sapphires:p.sapphires-blessing.sapphire_cost,blessingUntil:now+blessing.value*3600000};
}
export function openChest(p,tier,amount) {
  if (amount!==1 && amount!==10) return null;
  const price=amount===1?chestPrice:chestTenPrice;
  const pool=Object.values(GIFT_RULES).filter(gift=>TIERS_41[gift.shard_tier]?.min_lvl<=TIERS_41[tier].max_lvl);
  const rare=pool.filter(r=>r.rarity!=='common');
  if (p.sapphires<price || !rare.length) return null;
  let next={...p,sapphires:p.sapphires-price};
  const found={};
  for (let i=0;i<amount;i++) {
    const index=p.chestOpens+i+1;
    const choices=index%chestPity===0?rare:pool;
    const gift=choices[(index*17+3)%choices.length];
    const qty=6+(index*7)%10;
    next=award(next,{shards:{[gift.id]:qty}});
    found[gift.name]=(found[gift.name] || 0)+qty;
  }
  return { next:{...next,chestOpens:p.chestOpens+amount},found };
}
