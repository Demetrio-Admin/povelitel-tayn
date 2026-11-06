// Predictable, deliberately bounded policy. It only issues commands accepted by EpisodeBattle.
import { MOVES } from './combat.js';
export function autoCombatPolicy(b) {
  if (b.result || b.hero.cast || b.hero.focus) return null;
  const e = b.enemy, h = b.hero, it = b.intent();
  const can = id => !b.blocked(id);
  const action = e.action && b.def.actions[e.action];
  const impactSoon = it.state === 'channel' || (it.state === 'windup' && e.timer < .65);
  const dangerous = impactSoon && (action?.dmg >= 15 || e.action === 'breath');
  if (dangerous && h.ward <= .2) {
    if (can('barrier')) return 'barrier';
    if (can('ward')) return 'ward';
  }
  if (it.state === 'windup' || it.state === 'channel') {
    if (e.action === 'breath' && b.level('fire') >= 2 && can('flame')) return 'flame';
    if (MOVES.push.interrupts.includes(e.action) && can('push')) return 'push';
    if (can('hold')) return 'hold';
  }
  // Finish cheaply; do not build a combo against an already dying target.
  if (e.hp <= b.move('throw').dmg * (1 - e.armor) && can('throw')) return 'throw';
  if (e.armor > 0 && can('astral')) return 'astral';
  if (e.held > .6 && can('flame')) return 'flame';
  if (e.held > .5 && can('throw')) return 'throw';
  if (b.patch > 0 && can('push')) return 'push';
  if (e.cursed > 0 && can('flame')) return 'flame';
  if (e.cursed <= .3 && can('hex') && (e.hp > 25 || b.def.regen) && h.mana >= MOVES.hex.cost + MOVES.flame.cost) return 'hex';
  if (can('hold') && b.loadout.some(id => id === 'flame' || id === 'throw') && h.mana >= 26 && e.hp > 25) return 'hold';
  if (can('ignite') && b.loadout.includes('push') && h.mana >= 18 && e.hp > 20) return 'ignite';
  if (h.mana < 16 && can('focus') && it.state !== 'windup' && it.state !== 'channel') return 'focus';
  for (const id of ['flame', 'astral', 'throw', 'push']) if (can(id)) return id;
  // A support-only setup still progresses in time and restores mana without throwing unavailable moves.
  if (h.mana <= h.maxMana - 26 && can('focus') && it.state !== 'windup') return 'focus';
  return null;
}
export function battleDiagnosis(b) {
  const sources = Object.entries(b.stats.damageBySource).sort((a, c) => c[1] - a[1]);
  const reason = b.time >= 150 ? 'Не хватило атакующей магии.' : b.enemy.armor > 0 ? 'Броня духа сдерживает удары.' : sources[0]?.[0] === 'breath' ? 'Ледяное дыхание истощило защиту.' : 'Силы не хватило, чтобы пережить удары.';
  return [reason, 'Улучшите дар за опыт, монеты и ингредиенты у круга.', 'Попробуйте Удержание + Пламя или Порчу + Огонь.', 'Сварите настой; Барьер или Морвен помогут пережить бой.'];
}
