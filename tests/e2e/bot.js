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
  // v0.9.2: какой герой, его текстуры и все показанные тексты (проверка обращений)
  const seenTexts = new Set();
  { const v0 = S.dialogue.view.bind(S.dialogue); S.dialogue.view = () => { const v = v0(); if (v) { seenTexts.add(v.text); (v.choices || []).forEach(c => seenTexts.add(c.label)); } return v; }; }
  const HT = window.__witchHero.T;
  S.bus.on('ui:toast', (t) => seenTexts.add(String(HT(t))));
  { const e = G.scene.getScene('ExplorationScene'), h0 = e.heroSay.bind(e); e.heroSay = (t, ms) => { seenTexts.add(String(HT(t))); return h0(t, ms); }; }
  { const u = G.scene.getScene('UIScene'), m0 = u.openModal.bind(u); u.openModal = (o) => { seenTexts.add(String(HT(o.title))); if (o.text) seenTexts.add(String(HT(o.text))); return m0(o); }; }
  L(`HERO: ${S.state.data.heroId} world=${G.scene.getScene('ExplorationScene').player.view.texture.key}`);

  // v0.9: запасы героини и обучение
  const V = () => ({ hp: S.state.data.hp ?? 999, mana: S.state.data.mana ?? 999 });
  const vit = () => { const st = S.state, hs = st.heroStats(); return { hp: st.data.hp ?? hs.maxHp, maxHp: hs.maxHp, mana: st.data.mana ?? hs.maxMana, maxMana: hs.maxMana }; };
  const tutLog = new Set();
  // BOT_LOSE=scavenger_01,forest_guardian_01 — первую попытку против этих врагов бот намеренно проигрывает (проверка поражения)
  const LOSE = new Set(window.__botLose || []);
  const lostOnce = new Set();

  async function fight() {
    const c = cb();
    L('  COMBAT start:', c.enemyType, `hp=${Math.round(c.cm.hero.hp)}/${c.cm.hero.maxHp} mana=${Math.round(c.cm.hero.mana)} hero=${c.heroSprite.texture.key}`);
    const t0 = performance.now();
    while (G.scene.isActive('CombatScene') && !c.ended) {
      await sleep(120);
      if (!c.canAct()) continue;
      const cm = c.cm, e = cm.enemy;
      if (LOSE.has(c.spawnId) && !lostOnce.has(c.spawnId)) {   // проиграть: только «Понятно»/пропуск обучения, без магии
        if (c.tut?.step) { L('    TUTORIAL skip (lose run)'); c.tut.skip(); }
        continue;
      }
      const step = c.tut?.step;
      if (step && !tutLog.has(step)) { tutLog.add(step); L('    TUTORIAL step:', step, '—', c.tut.view()?.text || ''); }
      if (step === 'intro') { await sleep(600); c.tut.confirmIntro(); continue; }
      if (step === 'select') { const r = cm.fieldObjects.find(o => o.available && o.def.throwable && o.def.weight !== 'heavy'); if (r) { c.tut.beforeSelect(r.id); cm.selectObject(r.id); c.processEvents(); } continue; }
      if (step === 'throw' && cm.abilityState('telekinesis').state === 'ready') { c.onAbility('telekinesis'); continue; }
      if (step === 'throw') continue;
      // зелья по ситуации (как сделал бы игрок)
      if (cm.hero.hp < cm.hero.maxHp * 0.35 && S.state.item('elixir_life') > 0) { c.onPotion('elixir_life'); L('    potion: life'); continue; }
      if (cm.hero.mana < 14 && S.state.item('elixir_mana') > 0 && e.hp > 60) { c.onPotion('elixir_mana'); L('    potion: mana'); continue; }
      // v0.10.0: смоляная склянка — по сильному врагу (бережёт ману для даров)
      if (S.state.item('resin_flask') > 0 && cm.def.tier === 'strong' && e.hp > 120 && !e.isPreparing && (cm.stats.potions || 0) < 4) { c.onPotion('resin_flask'); L('    potion: flask'); continue; }
      const tk = cm.abilityState('telekinesis').state === 'ready';
      const fire = cm.abilityState('fire').state === 'ready';
      const fo = id => cm.fieldObjects.find(o => o.available && o.def && (o.id === id));
      const sa = e.def.strongAttack;   // v0.10.0: у Стража узла параметры зависят от фазы
      const heavyCast = e.isPreparing && sa && !(sa.interruptBy || []).includes('telekinesis');
      const seal = cm.abilityState('seal').state === 'ready';   // v0.10.1: Астрал бьёт сквозь броню, атаки не прерывает
      if (e.isPreparing && tk) {
        const heavy = cm.fieldObjects.find(o => o.available && o.def.weight === 'heavy');
        if (heavy && cm.selectedId !== heavy.id) cm.selectObject(heavy.id);
        c.onAbility('telekinesis'); L('    interrupt try @', ((performance.now() - t0) / 1000).toFixed(1), heavyCast ? '(heavy)' : ''); continue;
      }
      const strongSoon = sa && e.strongCd < 2.5 && !e.isPreparing;
      if (e.armorActive && tk && !strongSoon) {
        const cr = cm.fieldObjects.find(o => o.available && o.def.breaksArmor);
        if (cr) { if (cm.selectedId !== cr.id) cm.selectObject(cr.id); c.onAbility('telekinesis'); continue; }
      }
      if (seal && cm.hero.mana >= 34 && !strongSoon && S.state.hasEvent('unlock_seal_1')) { c.onAbility('seal'); continue; }
      if (fire) { c.onAbility('fire'); continue; }
      // TK оставляем под прерывание, если враг умеет кастовать
      if (tk && !strongSoon && (!sa || cm.hero.mana > 40)) {
        const light = cm.fieldObjects.find(o => o.available && o.def.throwable && o.def.weight !== 'heavy');
        if (light && cm.selectedId !== light.id) cm.selectObject(light.id);
        c.onAbility('telekinesis');
      }
    }
    if (LOSE.has(c.spawnId)) lostOnce.add(c.spawnId);
    const last = S.state.data.stats.combats.at(-1);
    L('  COMBAT end:', JSON.stringify({ result: last?.result, timeSec: last?.timeSec, interrupts: last?.interrupts }), `after: hp=${Math.round(vit().hp)}/${vit().maxHp} mana=${Math.round(vit().mana)}`);
  }

  async function settle(maxMs = 90000) {
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs) {
      const u = ui();
      if (u.dlg) {   // диалог: дочитать и выбрать последний ответ (у вступления — «Пойду к книге.»)
        u.finishTyping();
        const v = S.dialogue.view();
        if (v?.choices?.length) { L('  dialogue:', v.npc.id, '→', v.choices.at(-1).label); u.dialogueChoose(v.choices.at(-1).index); }
        else u.dialogueTap();
        await sleep(300); continue;
      }
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

  /** Мана для действия: эликсир, если есть и маны совсем мало; иначе ждём восстановления (ходим к цели — тоже время). */
  async function needMana(cost, why) {
    if (!(cost > 0) || vit().mana + 1e-9 >= cost) return;
    if (S.state.item('elixir_mana') > 0 && vit().mana < cost) { await settle(); ui().drinkFromBag?.('elixir_mana'); L(`  mana: drank elixir for ${why} → ${Math.round(vit().mana)}`); }
    const t0 = performance.now();
    while (vit().mana + 1e-9 < cost && performance.now() - t0 < 240000) await sleep(500);
    L(`  mana: waited ${Math.round((performance.now() - t0) / 1000)}s for ${why} (${cost}) → ${Math.round(vit().mana)}`);
  }

  async function act(id, ability = null, note = '') {
    await settle();
    const o = obj(id);
    if (!o) { L('!! no object', id); return; }
    if (o.isAvailable() && !note.includes('expect')) await needMana(o.manaCost?.() || 0, id);
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
    L(`  after: removed=${!!o.removed} done=${o.isDone?.()} avail=${o.isAvailable()} mana=${Math.round(vit().mana)}`);
  }

  /** Разговор с NPC и выбор ответа по тексту (лечение у Мирры). */
  async function talk(npcId, answer) {
    await settle();
    const o = obj('npc_' + npcId);
    tp(o.x, o.y + 40); await sleep(300);
    ex().interaction.setFocus(o); await sleep(100); ex().onContext(); await sleep(300);
    const u = ui();
    for (let i = 0; i < 12 && u.dlg; i++) {
      u.finishTyping();
      const v = S.dialogue.view();
      const ch = v?.choices?.find(c => c.label === answer);
      if (ch) { L(`  talk ${npcId}: «${answer}»`); u.dialogueChoose(ch.index); break; }
      if (v?.choices?.length) { u.dialogueChoose(v.choices.at(-1).index); } else u.dialogueTap();
      await sleep(250);
    }
    await sleep(400);
  }

  async function healAtMirra() {
    const coins0 = S.state.item('coins'), hp0 = Math.round(vit().hp);
    await talk('mirra', 'Восстановить здоровье');
    const u = ui();
    L('  heal window:', (u.modal?.opts?.text || '').replace(/\n/g, ' | '));
    const b = u.modal?.buttons?.find(x => /^Восстановить за/.test(x.label));
    if (b) { u.closeModal(b); await sleep(800); }
    else if (u.modal) u.closeModal(null);
    L(`  heal at Mirra: hp ${hp0} → ${Math.round(vit().hp)}, coins ${coins0} → ${S.state.item('coins')}`);
  }

  function afterDefeatCheck(id) {
    const t = ex().enemies.find(e => e.id === id), p = ex().player;
    const enc = S.state.getObject('enc:' + id);
    L(`  after defeat: hp=${Math.round(vit().hp)}/${vit().maxHp} mana=${Math.round(vit().mana)} pos=(${Math.round(p.x)},${Math.round(p.y)}) enc=(${enc?.x},${enc?.y}) dist-to-enemy=${Math.round(Math.hypot(p.x - t.cfg.x, p.y - t.cfg.y))} retry=${t.awaitingRetry} safePoint=(${S.state.data.safePoint.x},${S.state.data.safePoint.y})`);
  }

  async function standNear(id, sec) {
    const t = ex().enemies.find(e => e.id === id);
    const t0 = performance.now(); let started = false;
    while (performance.now() - t0 < sec * 1000) { await sleep(500); if (G.scene.isActive('CombatScene')) { started = true; break; } }
    L(`  stood near ${id} for ${Math.round((performance.now() - t0) / 1000)}s: auto-combat=${started}, retry button=${ex().interaction.focusInfo()?.label || '-'}`);
  }

  /** v0.10.0: перед сильным боем — отдохнуть в доме Мирры (мана +2/с), пока мана и HP не наберутся (как сделал бы игрок). */
  async function prepare(frac = 0.9) {
    const v0 = vit();
    if (v0.mana >= v0.maxMana * frac && v0.hp >= v0.maxHp * 0.9) return;
    tp(900, 5150); await sleep(500);
    const t0 = performance.now();
    while ((vit().mana < vit().maxMana * frac || vit().hp < vit().maxHp * 0.9) && performance.now() - t0 < 300000) { await sleep(1000); await settle(); }
    L(`  rest at home ${Math.round((performance.now() - t0) / 1000)}s → hp=${Math.round(vit().hp)} mana=${Math.round(vit().mana)}`);
  }

  async function enemy(id) {
    await settle();
    const t = ex().enemies.find(e => e.id === id);
    if (t.def.tier === 'strong' && !LOSE.has(id)) await prepare(0.9);
    L(`> enemy ${id} visible=${t.sprite?.visible} retry=${t.awaitingRetry}`);
    if (t.awaitingRetry) {   // v0.9: после поражения — только «Сразиться снова»
      const v = vit();
      if (v.hp < v.maxHp * 0.6) {
        if (S.state.item('elixir_life') > 0) { ui().drinkFromBag?.('elixir_life'); L('  heal: elixir from bag'); }
        const t0 = performance.now();
        while (vit().hp < vit().maxHp * 0.6 && performance.now() - t0 < 300000) await sleep(1000);
        L(`  heal: waited ${Math.round((performance.now() - t0) / 1000)}s → hp=${Math.round(vit().hp)}`);
      }
      tp(t.cfg.x, t.cfg.y + 60); await sleep(400);
      ex().interaction.setFocus(t); await sleep(150);
      L('  retry:', ex().interaction.focusInfo()?.label);
      ex().onContext();
      await sleep(300); if (S.modalOpen) { const u = ui(); const b = u.modal?.buttons?.find(x => x.label === 'Всё равно сразиться'); if (b) u.closeModal(b); }
    } else tp(t.cfg.x, t.cfg.y + t.cfg.radius * 0.4);
    for (let i = 0; i < 40 && !G.scene.isActive('CombatScene'); i++) await sleep(100);
    if (!G.scene.isActive('CombatScene')) { L('!! combat did not start'); return; }
    await settle(180000);
    await sleep(1500); await settle();
  }

  /** v0.10.0: сварить в котле Мирры (тот же путь, что кнопка «Сварить» в окне котла). */
  async function craft(id) {
    await settle();
    const before = { ...S.state.data.inventory };
    await ui().craftRecipe(id);
    await sleep(400); await settle();
    const got = Object.entries(S.state.data.inventory).filter(([k, v]) => v !== (before[k] || 0)).map(([k, v]) => `${k}:${v - (before[k] || 0)}`).join(' ');
    L(`> craft ${id}: ${got || 'nothing'}`);
  }
  /** v0.10.0: запас перед испытанием — собрать доступное и сварить зелья (как в плане ТЗ: 2 настоя, 2 эликсира). */
  async function stock(life = 2, manaP = 2, flask = 1) {
    const nodes = ['herb_g1', 'herb_g2', 'herb_g3', 'herb_t1', 'herb_a1', 'mush_t1', 'mush_a1', 'mush_j1', 'rune_sigil', 'resin_t1', 'resin_a1'];
    for (let round = 0; round < 3; round++) {
      await gather(...nodes);
      for (const [id, n] of [['elixir_life', life], ['elixir_mana', manaP], ['resin_flask', flask]]) {
        while (S.state.item(id) < n && S.alchemy.missing(id).length === 0) { const k = S.state.item(id); await craft(id); if (S.state.item(id) === k) break; }
      }
      if (S.state.item('elixir_life') >= life && S.state.item('elixir_mana') >= manaP) break;
      L(`  stock: waiting for regrowth (life=${S.state.item('elixir_life')} mana=${S.state.item('elixir_mana')} flask=${S.state.item('resin_flask')})`);
      await sleep(80000);
    }
    L(`  stock: life=${S.state.item('elixir_life')} mana=${S.state.item('elixir_mana')} flask=${S.state.item('resin_flask')}`);
  }
  async function gather(...ids) { for (const id of ids) { const o = obj(id); if (o && o.isAvailable()) await act(id, null, '(gather)'); else L(`  skip ${id}: not ready`); } }

  const snap = (tag) => {
    const d = S.state.data, v = vit();
    L(`== ${tag}: lvl=${d.heroLevel} xp=${d.heroXP} hp=${Math.round(v.hp)}/${v.maxHp} mana=${Math.round(v.mana)}/${v.maxMana} tk=${d.telekinesisLevel} fire=${d.fireLevel} items=${JSON.stringify(d.inventory || d.items)} quest="${S.quests.objectiveText()}"`);
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
    await enemy('scavenger_01');
    if (LOSE.has('scavenger_01')) {
      afterDefeatCheck('scavenger_01');
      await standNear('scavenger_01', 20);
      snap('after first defeat');
      // восстановление: ждём естественного восстановления HP рядом с врагом, затем «Сразиться снова»
      await enemy('scavenger_01');
    }
    snap('after first fight');
    await act('lunar_altar'); snap('altar start');
    await act('heavy_boulder', 'telekinesis', '(expect too heavy)');
    await act('flame_a', 'telekinesis');
    await act('altar_stone', 'telekinesis');
    await enemy('lunar_guard');
    await act('flame_c', null, '(pickup)');
    await act('guard_cache');
    snap('flames');
    // v0.10.0: огоньки → Лунный фитиль (трава, смола, пыль) → алтарь; трава ×2 и пыль ×1 — ещё и на Телекинез II
    await gather('herb_a1', 'herb_t1', 'herb_g1', 'resin_a1', 'rune_sigil');
    L('  resources: herb=' + S.state.item('moon_herb') + ' resin=' + S.state.item('tree_resin') + ' dust=' + S.state.item('rune_dust'));
    await act('lunar_altar', null, '(expect: brew wick first)');
    await craft('lunar_wick');
    await act('lunar_altar', null, '(insert wick + research)');
    await act('lunar_altar', null, '(check research)');
    { const t0 = performance.now(); while (!S.state.hasEvent('telekinesis_2_complete') && performance.now() - t0 < 360000) { await sleep(1000); await settle(); }
      L(`  research: waited ${Math.round((performance.now() - t0) / 1000)}s (real timer, no debug)`); }
    await settle(); snap('research done');
    await act('heavy_boulder', 'telekinesis');
    await act('fire_circle'); snap('fire');
    await act('ritual_torch', 'fire');
    await act('dry_bush', 'fire');
    await gather('herb_g2', 'herb_g3');
    await act('corrupted_roots', 'fire');
    await sleep(1500);
    // старый лес: три Корневика, запас пыли, тайники
    await enemy('rootling_01');
    await gather('resin_j1');
    await enemy('rootling_02');
    await act('dust_stash');
    await act('dust_stash', null, '(expect: already taken this cycle)');
    await gather('mush_j1');
    await act('hollow_cache');
    await act('moonstone', null, '(pickup)');
    await enemy('rootling_03');
    await act('west_chest');
    await gather('mush_a1');
    await craft('revealing_compound');
    await enemy('rootling_04');
    await enemy('rootling_05');
    await act('approach_cache');
    snap('before guardian');
    await act('ancient_gate', 'seal', '(expect refuse: guardian alive)');
    for (let i = 0; i < 3 && !S.state.data.defeatedEnemies.includes('forest_guardian_01'); i++) {
      await enemy('forest_guardian_01'); snap('after guardian try ' + (i + 1));
      if (!S.state.data.defeatedEnemies.includes('forest_guardian_01')) {
        afterDefeatCheck('forest_guardian_01');
        // восстановление: лечение у Мирры за монеты, затем назад к Стражу
        await healAtMirra();
      }
    }
    // знаки, Печать, обучение, ворота
    await act('ancient_gate', null, '(reveal marks)');
    await act('ancient_gate', 'seal', '(expect: seal not learned)');
    await talk('selena', 'Научи меня.');
    await settle(); snap('seal');
    await act('seal_sigil', 'seal');
    await act('ancient_gate', 'fire', '(expect: only seal)');
    await act('ancient_gate', 'seal');
    await sleep(1500); await settle();
    // связка и испытание
    await gather('herb_a1', 'herb_t1', 'herb_g1', 'rune_sigil');
    await craft('restoration_bundle');
    await stock();
    if (vit().hp < vit().maxHp * 0.8) await healAtMirra();
    for (let i = 0; i < 3 && !S.state.hasEvent('chapter_trial_defeated'); i++) {
      await enemy('node_trial'); snap('after trial try ' + (i + 1));
      if (!S.state.hasEvent('chapter_trial_defeated')) { afterDefeatCheck('node_trial'); await healAtMirra(); await stock(); }
    }
    await act('forest_node', null, '(repair)');
    await sleep(1500); await settle();
    snap('end');
    L('completedEvents=' + JSON.stringify(S.state.data.completedEvents));
    const FEM = /(Поняла|принесла|нашла|заслужила|Проснулась|Вернулась|ведьмочка|помощница|Ты не одна|должна искать|героин[яиеую]|Ты цела|отдохни, ведьма|милая)/;
    const MALE = /(Понял(?![а-яё])|принёс|нашёл|заслужил(?![а-яё])|Проснулся|Вернулся|Эй, колдун|помощник|Ты не один|должен искать|Герой атакует|героя(?![а-яё])|Ты цел,|милый)/;
    const texts = [...seenTexts];
    L(`TEXTS seen=${texts.length} female=${texts.filter(t => FEM.test(t)).length} male=${texts.filter(t => MALE.test(t)).length}`);
    texts.filter(t => FEM.test(t) || MALE.test(t)).forEach(t => L('  form: ' + t.replace(/\n/g, ' ')));
    L('defeated=' + JSON.stringify(S.state.data.defeatedEnemies));
  } catch (e) { L('!! EXCEPTION ' + e.message + ' ' + e.stack); }
  return log;
};
