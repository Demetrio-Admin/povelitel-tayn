// Прогресс опыта героя внутри текущего уровня — для HUD и профиля героя (v0.8.2). Без Phaser.
// heroXP — суммарный опыт; пороги — levelRow().xp (начало уровня) и nextLevelXP() (следующий уровень или null).

/** { level, progress 0…1, remaining, nextLevel, max, caption } */
export function xpProgress(state) {
  const level = state.data.heroLevel;
  const xp = Number(state.data.heroXP) || 0;
  const startXP = state.levelRow().xp;
  const nextXP = state.nextLevelXP();
  if (nextXP == null) return { level, progress: 1, remaining: 0, nextLevel: null, max: true, caption: 'Максимальный уровень' };
  const span = Math.max(1, nextXP - startXP);
  const progress = Math.min(1, Math.max(0, (xp - startXP) / span));
  const remaining = Math.max(0, nextXP - xp);
  return { level, progress, remaining, nextLevel: level + 1, max: false, caption: `До ${level + 1} ур.: ${remaining} опыта` };
}
