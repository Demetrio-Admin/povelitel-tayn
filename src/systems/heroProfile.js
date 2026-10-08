import { GameState } from '../state/GameState.js';
import { ENEMIES } from '../config/balance.enemies.js';
import { ENEMY_SPAWNS } from '../config/world.layout.js';
import { GIFT_IDS, AMULETS } from '../config/build.js';
import { ABILITIES } from '../config/balance.abilities.js';
import { heroById } from '../config/heroes.js';
import { DUEL, leagueOf, seasonOf } from '../config/duel.js';

const spawnKinds = new Map(ENEMY_SPAWNS.map(e => [e.id, e.enemy]));
export function localHeroProfile(state, session = null) {
  const d = state.data;
  const won = [...new Set(d.defeatedEnemies.map(id => spawnKinds.get(id)).filter(id => ENEMIES[id]))];
  won.sort((a, b) => ENEMIES[b].rank - ENEMIES[a].rank);
  const duel = state.getObject('duel');
  const currentDuel = duel?.season === seasonOf(state.now()) ? duel : null;
  return {
    ok: true, self: true, nickname: session?.nickname || heroById(session?.hero || d.heroId).name,
    hero: session?.hero || d.heroId, playerId: session?.meta?.playerId || null,
    level: d.heroLevel, xp: d.heroXP,
    abilities: Object.fromEntries(GIFT_IDS.map(id => [id, { level: state.abilityLevel(id), unlocked: state.isUnlocked(id) }])),
    build: { slots: state.equippedGifts(), amulets: state.equippedAmulets() },
    amuletLevels: Object.fromEntries(Object.keys(AMULETS).map(id => [id, state.buildData().amuletLevels[id] || 0])),
    strongest: won.length ? { enemy: won[0], heroLevel: null, wonAt: null } : null,
    uniqueWins: won.length,
    chapters: [state.hasEvent('chapter_1_complete'), state.hasEvent('chapter_2_complete')],
    duel: { rating: currentDuel?.rating ?? Math.round(DUEL.baseRating + ((duel?.rating ?? DUEL.baseRating) - DUEL.baseRating) / 2), wins: currentDuel?.wins || 0, losses: currentDuel?.losses || 0 },
    registeredAt: session?.meta?.registeredAt || null, lastSeenAt: session?.meta?.lastSeenAt || null,
    online: !!session?.ready, coven: null,
  };
}
export function heroProfileView(profile) {
  const state = new GameState();
  state.data.heroLevel = profile.level;
  for (const id of GIFT_IDS) if (profile.abilities?.[id]?.unlocked) state.unlockAbility(id, profile.abilities[id].level);
  const amulets = (profile.build?.amulets || []).filter(id => AMULETS[id]);
  for (const id of amulets) state.addItem(id, 1);
  state.setObject('player_build', { ...profile.build, amulets });
  // Амулеты в профиле показывают реальные уровни усиления; характеристики героя — те же, что в игре.
  const stats = state.heroStats();
  return {
    ...profile, heroDef: heroById(profile.hero), stats,
    gifts: GIFT_IDS.map(id => ({ id, name: ABILITIES[id].name, icon: id === 'seal' ? 'icon_seal' : `icon_${id}`, level: profile.abilities?.[id]?.unlocked ? profile.abilities[id].level : 0, active: state.equippedGifts().includes(id) })),
    amulets: amulets.map(id => ({ id, ...AMULETS[id], level: profile.amuletLevels?.[id] || 0 })),
    strongest: profile.strongest && ENEMIES[profile.strongest.enemy] ? { ...profile.strongest, ...ENEMIES[profile.strongest.enemy] } : null,
    league: leagueOf(profile.duel?.rating ?? DUEL.baseRating).name,
  };
}
export function profileDate(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
  return new Date(value).toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export function presenceText(profile) {
  if (profile.online) return 'В игре';
  return profile.lastSeenAt ? `Был в игре: ${profileDate(profile.lastSeenAt)}` : 'Последнее посещение неизвестно';
}
