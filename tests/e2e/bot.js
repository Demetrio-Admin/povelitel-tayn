// In-page autoplay bot: проходит весь маршрут прототипа и логирует результат.
window.__bot = async function () {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__game, S = window.__witch;
  const ex = () => G.scene.getScene('ExplorationScene');
  const ui = () => G.scene.getScene('UIScene');
  const cb = () => G.scene.getScene('CombatScene');
  const log = [];
  const L = (...a) => { const s = a.join(' '); log.push(s); console.log('[bot] ' + s); };
  S.bus.on('ui:toast', (t) => L('  toast:', String(t).replace(/\n/g, ' ')));
  S.bus.on('world:event', (k) => L('  EVENT:', k));
  S.bus.on('ui:final', () => L('  FINAL_SCREEN'));

  async function fight() {
    const c = cb();
    L('  COMBAT start:', c.enemyType);
    const t0 = performance.now();
    while (G.scene.isActive('CombatScene') && !c.ended) {
      await sleep(120);
      if (!c.canAct()) continue;
      const cm = c.cm, e = cm.enemy;
      const tk = cm.abilityState('telekinesis').state === 'ready';
      const fire = cm.abilityState('fire').state === 'ready';
      const fo = id => cm.fieldObjects.find(o => o.available && o.def && (o.id === id));
      const heavyCast = e.isPreparing && cm.def.strongAttack && !(cm.def.strongAttack.interruptBy || []).includes('telekinesis');
      if (e.isPreparing && tk) {
        const heavy = cm.fieldObjects.find(o => o.available && o.def.weight === 'heavy');
        if (heavy && cm.selectedId !== heavy.id) cm.selectObject(heavy.id);
        c.onAbility('telekinesis'); L('    interrupt try @', ((performance.now() - t0) / 1000).toFixed(1), heavyCast ? '(heavy)' : ''); continue;
      }
      const strongSoon = cm.def.strongAttack && e.strongCd < 2.5 && !e.isPreparing;
      if (e.armorActive && tk && !strongSoon) {
        const cr = cm.fieldObjects.find(o => o.available && o.def.breaksArmor);
        if (cr) { if (cm.selectedId !== cr.id) cm.selectObject(cr.id); c.onAbility('telekinesis'); continue; }
      }
      if (fire) { c.onAbility('fire'); continue; }
      // TK оставляем под прерывание, если враг умеет кастовать
      if (tk && !strongSoon && (!cm.def.strongAttack || cm.hero.mana > 40)) {
        const light = cm.fieldObjects.find(o => o.available && o.def.throwable && o.def.weight !== 'heavy');
        if (light && cm.selectedId !== light.id) cm.selectObject(light.id);
        c.onAbility('telekinesis');
      }
    }
    const last = S.state.data.stats.combats.at(-1);
    L('  COMBAT end:', JSON.stringify(last));
  }

  async function settle(maxMs = 90000) {
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs) {
      const u = ui();
      if (S.modalOpen && u.modal) {
        const title = u.modal.container.list[2]?.text;
        L('  modal:', title, '→', (u.modal.buttons.find(b => b.primary) || u.modal.buttons[0]).label);
        await sleep(250); u.pressModalButton(true); await sleep(250); continue;
      }
      if (G.scene.isActive('CombatScene') && cb().cm && !cb().ended) { await fight(); continue; }
      if (S.mode !== 'exploration' || G.scene.isActive('CombatScene')) { await sleep(150); continue; }
      await sleep(300);
      if (!S.modalOpen && S.mode === 'exploration') return;
    }
    L('  !! settle timeout, mode=' + S.mode);
  }

  const obj = id => ex().objects.find(o => o.id === id);
  function tp(x, y) { ex().player.setPosition(x, y); ex().player.stop(); }

  async function act(id, ability = null, note = '') {
    await settle();
    const o = obj(id);
    if (!o) { L('!! no object', id); return; }
    L(`> ${id} ${ability || 'context'} ${note}`, `avail=${o.isAvailable()} done=${o.isDone?.()}`);
    tp(o.x, o.y + Math.min(o.radius * 0.5, 50));
    await sleep(350);
    ex().interaction.setFocus(o);
    await sleep(150);
    if (S.modalOpen) await settle();
    ex().interaction.setFocus(o);
    if (ability) ex().onAbility(ability); else ex().onContext();
    await sleep(1200);
    await settle();
    L(`  after: removed=${!!o.removed} done=${o.isDone?.()} avail=${o.isAvailable()}`);
  }

  async function enemy(id) {
    await settle();
    const t = ex().enemies.find(e => e.id === id);
    L(`> enemy ${id} visible=${t.sprite?.visible} cleared=${t.cleared}`);
    tp(t.cfg.x, t.cfg.y + t.cfg.radius * 0.4);
    for (let i = 0; i < 40 && !G.scene.isActive('CombatScene'); i++) await sleep(100);
    if (!G.scene.isActive('CombatScene')) { L('!! combat did not start'); return; }
    await settle(180000);
    await sleep(1500); await settle();
  }

  const snap = (tag) => {
    const d = S.state.data;
    L(`== ${tag}: lvl=${d.heroLevel} xp=${d.heroXP} tk=${d.telekinesisLevel} fire=${d.fireLevel} items=${JSON.stringify(d.inventory || d.items)} paths=${JSON.stringify(d.openedPaths)} quest="${ui().objText?.text || ''}"`);
  };

  try {
    await sleep(1500);
    await act('magic_book'); snap('book');
    await act('glade_rock', 'telekinesis');
    await act('moon_plant', 'telekinesis');
    await act('glade_cache');
    await act('corrupted_roots', null, '(expect fire required)');
    await act('corrupted_roots', 'telekinesis', '(wrong ability)');
    await act('trail_cache');
    snap('before first fight');
    await enemy('scavenger_01'); snap('after first fight');
    await act('lunar_altar'); snap('altar start');
    await act('heavy_boulder', 'telekinesis', '(expect too heavy)');
    await act('flame_a', 'telekinesis');
    await act('altar_stone', 'telekinesis');
    await enemy('lunar_guard');
    await act('flame_c', null, '(pickup)');
    snap('flames');
    await act('lunar_altar', null, '(complete + research)');
    await act('lunar_altar', null, '(check research)');
    S.abilities.update(true); await sleep(800); await settle(); snap('research forced');
    await act('heavy_boulder', 'telekinesis');
    await act('fire_circle'); snap('fire');
    await act('ritual_torch', 'fire');
    await act('dry_bush', 'fire');
    await act('corrupted_roots', 'fire');
    await sleep(1500);
    await act('moonstone', null, '(pickup)');
    await act('west_chest');
    snap('before guardian');
    await act('ancient_gate', 'seal', '(expect refuse: guardian alive)');
    for (let i = 0; i < 3 && !S.state.data.defeatedEnemies.includes('forest_guardian_01'); i++) { await enemy('forest_guardian_01'); snap('after guardian try ' + (i + 1)); }
    await act('ancient_gate', 'seal');
    await sleep(1500); await settle();
    snap('end');
    L('completedEvents=' + JSON.stringify(S.state.data.completedEvents));
    L('defeated=' + JSON.stringify(S.state.data.defeatedEnemies));
  } catch (e) { L('!! EXCEPTION ' + e.message + ' ' + e.stack); }
  return log;
};
