// Играет настоящий бой в браузере (v0.14.0): нажимает дары и пьёт настой через обработчики сцены — так же, как игрок, —
// поэтому запись действий получается настоящая и сервер проигрывает именно её. Возвращает итог боя на устройстве.
export async function playRealCombat(p, { timeoutMs = 240000, potion = true } = {}) {
  await p.evaluate((potion) => {
    const S = window.__witch;
    S.settings.set('hints', false);   // без обучения: пауз врага нет
    const c = window.__game.scene.getScene('CombatScene');
    window.__botTick = 0;
    window.__bot = setInterval(() => {
      if (!c.started || c.ended || S.modalOpen) return;
      window.__botTick++;
      const cm = c.cm, h = cm.hero;
      if (potion && h.hp < h.maxHp * 0.4) c.onPotion('elixir_life');
      if (window.__botTick % 6 === 0) S.bus.emit('combat:cycle');   // выбрать предмет поля — бросок сильнее
      for (const id of ['fire', 'seal', 'telekinesis']) c.onAbility(id);
    }, 150);
  }, potion);
  await p.waitForFunction(() => window.__game.scene.getScene('CombatScene').ended, null, { timeout: timeoutMs });
  return p.evaluate(() => {
    clearInterval(window.__bot);
    const c = window.__game.scene.getScene('CombatScene');
    const log = c.rec.toJSON();
    return { result: c.cm.result, mana: c.cm.hero.mana, hp: c.cm.hero.hp, ticks: log.ticks, events: log.ev.length };
  });
}
