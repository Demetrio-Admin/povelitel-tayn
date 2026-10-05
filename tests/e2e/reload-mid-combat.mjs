// v0.9: перезагрузка посреди боя (режим без сервера: сохранение в localStorage). Ожидание: отступление рядом с тем же врагом,
// HP/мана — последние сохранённые (не полные), повтор — только «Сразиться снова». Запуск: UI_BASE_URL=http://…/ node tests/e2e/reload-mid-combat.mjs
import { chromium } from 'playwright';
const BASE = process.env.UI_BASE_URL || 'http://127.0.0.1:5173/';   // уже запущенная игра (npm run dev или статика)
const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => p.evaluate(f, a);
await p.goto(new URL('?reset&skipmenu', BASE).href); await p.waitForFunction(() => window.__game?.scene.isActive('UIScene'));
await p.waitForFunction(() => !!window.__game.scene.getScene('UIScene').dlg, null, { timeout: 120000 });
await ev(() => window.__game.scene.getScene('UIScene').closeDialogue(true));
await ev(() => { const s = window.__witch; s.abilities.unlock('telekinesis', 1); s.quests.complete('unlock_telekinesis_1'); s.state.markEvent('mirra_starter_kit'); s.state.data.hp = 60; s.state.data.mana = 30; s.state.save(); });
// v0.14.0: бой идёт на копии героя; при перезагрузке остаются HP/мана на начало боя (60/30)
const pre = await ev(() => { const ex = window.__game.scene.getScene('ExplorationScene'); const t = ex.enemies.find(e => e.id === 'scavenger_01'); ex.player.setPosition(t.cfg.x, t.cfg.y + 30); return { x: t.cfg.x, y: t.cfg.y + 30 }; });
await p.waitForFunction(() => { const g = window.__game, c = g.scene.getScene('CombatScene'); return g.scene.isActive('CombatScene') && c.started; }, null, { timeout: 120000 });
const enc = await ev(() => window.__witch.state.getObject('enc:scavenger_01'));
await ev(() => { const c = window.__game.scene.getScene('CombatScene'); c.cm.hero.hp = 50; c.cm.hero.mana = 30; c.cm.commit(); window.__witch.state.save(); });
console.log('in combat: enc=', JSON.stringify(enc), 'saved hp/mana=', await ev(() => JSON.stringify(JSON.parse(localStorage.getItem('witch_rpg_save_v1') || localStorage.getItem(Object.keys(localStorage).find(k => /save/.test(k))) || '{}').hp)));
await p.goto(new URL('?skipmenu', BASE).href);
await p.waitForFunction(() => window.__game?.scene.isActive('ExplorationScene') && window.__game.scene.isActive('UIScene'), null, { timeout: 120000 });
await p.waitForTimeout(3000);
const r = await ev(() => { const ex = window.__game.scene.getScene('ExplorationScene'), s = window.__witch.state; const t = ex.enemies.find(e => e.id === 'scavenger_01');
  return { pos: { x: Math.round(ex.player.x), y: Math.round(ex.player.y) }, enc: s.getObject('enc:scavenger_01'), hp: s.data.hp, mana: s.data.mana, max: s.heroStats().maxHp, combat: window.__game.scene.isActive('CombatScene'), defeated: s.isEnemyDefeated('scavenger_01'), retry: t.awaitingRetry, coins: s.item('coins'), combats: s.data.stats.combats.length }; });
await p.waitForTimeout(8000);
const still = await ev(() => window.__game.scene.isActive('CombatScene'));
console.log('after reload:', JSON.stringify(r), 'combat after 8s:', still);
const ok = r.enc?.state === 'lost' && Math.hypot(r.pos.x - pre.x, r.pos.y - pre.y) < 3 && r.hp >= 59 && r.hp < r.max && !r.combat && !still && !r.defeated && r.retry;
console.log(ok ? '✓ перезагрузка посреди боя = отступление рядом с врагом, без полного HP, без автоповтора' : '✗ FAIL', 'errors:', JSON.stringify(errs));
await b.close(); process.exit(ok ? 0 : 1);
