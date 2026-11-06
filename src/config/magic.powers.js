// Opt-in metadata adapter. Production ABILITIES/UPGRADES remain the authoritative definitions.
// Experimental entries are returned only to the isolated episode. No Phaser dependency.
import { ABILITIES } from './balance.abilities.js';
import { UPGRADES } from './balance.progression.js';

const action = (level, mana, effect, extra = {}) => ({ level, mana, effect, ...extra });
export const POWER_METADATA = {
  telekinesis: { school: 'Чародейство', icon: 'icon_telekinesis',
    worldActions: { pull: action(1, 3, 'collect'), heavy: action(1, 0, 'move', { manual: true, drain: 7 }) },
    milestones: [{ level: 1, features: ['pull', 'throw', 'push'] }, { level: 2, features: ['hold', 'heavy_mastery'] }],
    combatEffects: ['physical', 'interrupt', 'hold'], },
  fire: { school: 'Разрушение', icon: 'icon_fire',
    worldActions: { heat: action(1, 4, 'thaw', { manual: true }), resin: action(1, 4, 'collect'), lantern: action(1, 3, 'light'), stream: action(2, 0, 'melt', { manual: true, drain: 6 }) },
    milestones: [{ level: 1, features: ['flame', 'ignite', 'ward'] }, { level: 2, features: ['stream', 'melt_breath'] }, { level: 3, features: ['burn'] }],
    combatEffects: ['fire', 'burn', 'heldFlame', 'firePush'], },
  seal: { school: 'Чародейство', icon: 'icon_seal',
    worldActions: { unseal: action(1, 5, 'open_cache') },
    milestones: [{ level: 1, features: ['astral', 'pierce'] }], combatEffects: ['astral', 'armor_break'], },
  curse: { name: 'Порча', school: 'Проклятия', icon: 'icon_seal', experimental: true,
    worldActions: { unravel: action(1, 5, 'cleanse') },
    milestones: [{ level: 1, features: ['hex', 'weaken'] }, { level: 2, features: ['deny_regen'] }], combatEffects: ['weaken', 'curseFire', 'deny_regen'], },
  barrier: { name: 'Барьер', school: 'Чародейство', icon: 'icon_seal', experimental: true,
    worldActions: { protect: action(1, 5, 'disarm') },
    milestones: [{ level: 1, features: ['barrier', 'shield'] }, { level: 2, features: ['reflect'] }], combatEffects: ['shield', 'reflect'], },
};

export function powerDefinition(id, { experimental = false, metadata = POWER_METADATA } = {}) {
  const meta = metadata[id];
  if (!meta || (meta.experimental && !experimental)) return null;
  const base = ABILITIES[id];
  return { ...meta, id, name: base?.name || meta.name, levels: base?.levels || {}, branches: base?.branches || {},
    upgrades: Object.fromEntries(Object.entries(UPGRADES).filter(([, u]) => u.ability === id)),
    visuals: { icon: meta.icon, sound: id === 'fire' ? 'unlock_magic' : 'telekinesis_impact' }, };
}
export function powerLevel(data, id) {
  return data.unlockedAbilities?.includes(id) ? Math.max(0, Number(data[`${id}Level`]) || 0) : 0;
}
export function featuresAt(def, level) {
  return (def?.milestones || []).filter(m => m.level <= level).flatMap(m => m.features);
}
export function checkWorldAction(data, id, actionId, { mana = Infinity, experimental = false } = {}) {
  const def = powerDefinition(id, { experimental }), a = def?.worldActions[actionId];
  if (!a) return { ok: false, reason: 'Это применение пока неизвестно.' };
  if (powerLevel(data, id) < a.level) return { ok: false, reason: `Нужен ${def.name} ${a.level}: откройте «Магию», чтобы узнать путь развития.` };
  if (mana < Math.max(a.mana, a.drain ? 1 : 0)) return { ok: false, reason: 'Недостаточно маны. Подождите восстановления.' };
  return { ok: true, action: a, power: def };
}

// Episode moves refer to the SAME power id as world actions and GameState levels.
export const EPISODE_MOVES = {
  throw: { powerId: 'telekinesis', level: 1, name: 'Бросок', cost: 6, cd: 1.2, cast: .35, dmg: 9, desc: 'Дешёвый камень. По скованной цели сильнее.' },
  push: { powerId: 'telekinesis', level: 1, name: 'Толчок', cost: 10, cd: 3, cast: .25, dmg: 4, interrupts: ['bite', 'leap', 'howl'], desc: 'Прерывает прыжок. В горящий хворост — сильный удар.' },
  hold: { powerId: 'telekinesis', level: 2, name: 'Удержание', cost: 14, cd: 7, cast: .3, holdSec: 2.6, interrupts: 'all', desc: 'Сковывает цель. Следом Огонь или Бросок — сильнее.' },
  flame: { powerId: 'fire', level: 1, name: 'Пламя', cost: 12, cd: 1.6, cast: .45, dmg: 15, interrupts: ['breath'], desc: 'Огонь II прерывает дыхание; III оставляет горение.' },
  ignite: { powerId: 'fire', level: 1, name: 'Поджог', cost: 8, cd: 5, cast: .3, patchSec: 7, desc: 'Поджигает хворост. Следом Толчок — в огонь!' },
  ward: { powerId: 'fire', level: 1, name: 'Тёплый щит', cost: 10, cd: 8, cast: .15, wardSec: 3, wardCut: .7, desc: 'Смягчает опасный удар и защищает от холода.' },
  astral: { powerId: 'seal', level: 1, name: 'Астрал', cost: 10, cd: 3, cast: .3, dmg: 12, desc: 'Снимает броню духа и открывает древние печати.' },
  hex: { powerId: 'curse', level: 1, name: 'Порча', cost: 9, cd: 6, cast: .3, curseSec: 5, desc: 'Ослабляет удары. Огонь по проклятой цели ×1,5.' },
  barrier: { powerId: 'barrier', level: 1, name: 'Барьер', cost: 9, cd: 7, cast: .15, wardSec: 3, wardCut: .8, desc: 'Защищает от удара. На II отражает часть урона.' },
};
for (const m of Object.values(EPISODE_MOVES)) {
  m.school = m.powerId; // legacy animation key, not a restrictive magic school
  m.icon = POWER_METADATA[m.powerId].icon;
  m.tags = POWER_METADATA[m.powerId].combatEffects;
}
export function learnedMoves(data) {
  return Object.keys(EPISODE_MOVES).filter(id => powerLevel(data, EPISODE_MOVES[id].powerId) >= EPISODE_MOVES[id].level);
}
