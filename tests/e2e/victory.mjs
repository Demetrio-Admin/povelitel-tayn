// Browser plugin not available. Playwright runs the existing Phaser game and actual result renderer.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
process.env.VITE_SUPABASE_URL = ''; process.env.VITE_SUPABASE_ANON_KEY = '';
const shots = process.env.UI_SHOTS_DIR || '/tmp/witch-victory';
await fs.mkdir(shots, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1', port: 5196, strictPort: true, hmr: false } });
await vite.listen();
console.log("Vite ready");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
console.log("Browser ready");
const errors = [];
const open = async (page, { large = false, empty = false, schoolCount = 3, lootCount = 2 } = {}) => {
  await page.evaluate(({ large, empty, schoolCount, lootCount }) => {
    const w = window.__witch, g = window.__game, ui = g.scene.getScene('UIScene');
    ui.closeModal(); ui.closeDialogue(true); w.settings.set('hints', false); w.tutorial.hide(); w.state.markEvent('prologue_seen');
    ui.goalBanner?.destroy(); ui.goalBanner = null;
    w.state.data.heroLevel = 15; w.state.data.mana = 161; w.state.data.hp = 255;
    for (const id of ['telekinesis', 'fire', 'ice']) w.state.unlockAbility(id, 3);
    ui.refreshHud();
    g.scene.sleep('ExplorationScene'); g.scene.run('CombatScene', { enemyType: 'frost_collector', spawnId: 'wh_collector_1' }); g.scene.bringToTop('UIScene');
    window.__victoryTest = { large, empty, schoolCount, lootCount };
  }, { large, empty, schoolCount, lootCount });
  await page.waitForFunction(() => window.__game.scene.isActive('CombatScene') && window.__game.scene.getScene('CombatScene').cm);
  await page.evaluate(async () => {
    const { ITEMS } = await import('/src/config/balance.progression.js');
    const { large, empty, schoolCount, lootCount } = window.__victoryTest, cs = window.__game.scene.getScene('CombatScene');
    cs.ended = true; cs.enemySprite.setVisible(false); cs.warn.setVisible(false); cs.coach.setVisible(false); cs.cm.stats.interrupts = 6;
    const reward = empty ? {} : { heroXP: 65, schoolXP: Object.fromEntries(Object.entries({ telekinesis: 50, fire: 10, ice: 30 }).slice(0, schoolCount)), items: large ? Object.fromEntries(Object.keys(ITEMS).slice(0, 24).map(id => [id, 12345])) : lootCount === 1 ? { coins: 18 } : { ice_crystal: 1, coins: 18 } };
    window.__victoryReward = JSON.stringify(reward); window.__victoryInventory = JSON.stringify(window.__witch.state.data.inventory);
    cs.showOutcome({ ok: true, verdict: { outcome: 'victory', reward, entry: { timeSec: 70.2 } }, outcome: { levelUps: large ? [{ level: 15, note: 'Здоровье и мана увеличены.' }] : [] } }, 999);
  });
  console.log('Outcome emitted');
  await page.getByRole('dialog', { name: 'Победа!', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.victory-window img')].every(img => img.complete && img.naturalWidth > 0));
};
let page;
try {
  const viewports = process.env.VICTORY_VIEWPORTS ? JSON.parse(process.env.VICTORY_VIEWPORTS) : [[390, 844, 'warlock'], [390, 638, 'witch'], [360, 800, 'witch'], [320, 568, 'warlock'], [1280, 900, 'warlock']];
  for (const [width, height, hero] of viewports) {
    if (!page || width >= 900) {
      await page?.close();
      page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: width < 900 });
      page.on('pageerror', e => { errors.push(e.message); console.error('Page error:', e.message); }); page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.error('Console error:', m.text()); } });
      console.log(`Loading ${width}×${height}`);
      await page.goto(`http://127.0.0.1:5196/?skipmenu&reset&hero=${hero}`);
      try { await page.waitForFunction(() => window.__game?.scene.isActive('UIScene') && window.__game.scene.isActive('ExplorationScene') && window.__game.scene.getScene('UIScene').portraitHit, null, { timeout: 120000 }); }
      catch(e) { console.error('Boot state:', await page.evaluate(() => ({ game: !!window.__game, scenes: window.__game?.scene.getScenes(false).map(s => ({ key: s.scene.key, active: s.scene.isActive() })), ui: window.__game?.scene.keys.UIScene && { dialog: !!window.__game.scene.keys.UIScene.dlg, modal: window.__game.scene.keys.UIScene.modal?.opts?.title } }))); await page.screenshot({path: `${shots}/boot-failure.png`}); throw e; }
    } else await page.setViewportSize({ width, height });
    await page.evaluate(id => { window.__witch.state.data.heroId = id; }, hero);
    assert.match(await page.title(), /Колдовство/); assert.equal(await page.locator('vite-error-overlay').count(), 0);
    console.log('Game ready');
    await open(page);
    assert.equal(await page.locator('.victory-drop').count(), 2); assert.equal(await page.locator('.victory-school').count(), 3);
    assert.match(await page.locator('.victory-drop[data-item=coins]').innerText(), /\+18/);
    assert.match(await page.locator('.victory-hero-xp').innerText(), /\+65/);
    assert.match(await page.locator('.victory-time').innerText(), /70,2/);
    assert.match(await page.locator('.victory-crest').getAttribute('src'), new RegExp(`hero-${hero}\\.`));
    const bounded = () => page.evaluate(() => {
      const frame = document.querySelector('.victory-window .acc-shell').getBoundingClientRect(), crest = document.querySelector('.victory-crest').getBoundingClientRect(), button = document.querySelector('.victory-continue').getBoundingClientRect(), game = window.__game.canvas.getBoundingClientRect(), card = document.querySelector('.victory-rewards');
      return { inside: frame.x >= game.x - 1 && frame.right <= game.right + 1 && frame.y >= game.y - 1 && frame.bottom <= game.bottom + 1,
        crest: crest.top >= game.top - 1 && crest.left >= game.left - 1 && crest.right <= game.right + 1,
        button: button.top >= game.top && button.bottom <= game.bottom && button.height >= 44,
        overflow: card.scrollWidth > card.clientWidth + 1 };
    });
    await page.screenshot({ path: `${shots}/${width}x${height}-${hero}.png` });
    assert.deepEqual(await bounded(), { inside: true, crest: true, button: true, overflow: false });
    assert.equal(await page.locator('.victory-rewards').evaluate(node => [...node.querySelectorAll('.victory-school-quantity')].every(n => n.getBoundingClientRect().bottom <= node.getBoundingClientRect().bottom + 1)), true, 'ordinary rewards show every gift XP value without scrolling');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__witch.state.data.inventory) === window.__victoryInventory), true, 'rendering never awards items again');
    await page.getByRole('button', { name: 'Продолжить', exact: true }).tap();
    await page.waitForFunction(() => !window.__game.scene.isActive('CombatScene') && window.__game.scene.isActive('ExplorationScene'));
    assert.equal(await page.locator('.victory-window').count(), 0);
    await open(page, { large: true });
    await page.screenshot({ path: `${shots}/${width}x${height}-many-top.png` });
    assert.deepEqual(await bounded(), { inside: true, crest: true, button: true, overflow: false });
    assert.equal(await page.locator('.victory-rewards').evaluate(node => node.scrollHeight > node.clientHeight), true, 'large reward list scrolls');
    await page.locator('.victory-rewards').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.screenshot({ path: `${shots}/${width}x${height}-many.png` });
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.__game.scene.isActive('CombatScene'));
    await open(page, { empty: true });
    assert.equal(await page.locator('.victory-drop').count(), 0); assert.equal(await page.locator('.victory-magic').count(), 0);
    assert.equal(await page.locator('.victory-rewards').count(), 0);
    await page.keyboard.press('Enter'); await page.waitForFunction(() => !window.__game.scene.isActive('CombatScene'));
    if (width === 390 && height === 844) {
      for (const schoolCount of [1, 2]) {
        await open(page, { schoolCount, lootCount: 1 });
        assert.equal(await page.locator('.victory-school').count(), schoolCount);
        assert.equal(await page.locator('.victory-drop').count(), 1);
        assert.deepEqual(await bounded(), { inside: true, crest: true, button: true, overflow: false });
        const centered = await page.locator('.victory-schools').evaluate(grid => {
          const g = grid.getBoundingClientRect(), a = grid.firstElementChild.getBoundingClientRect(), b = grid.lastElementChild.getBoundingClientRect();
          return Math.abs((a.x + a.width / 2 + b.x + b.width / 2) / 2 - (g.x + g.width / 2)) < 1;
        });
        assert.equal(centered, true, 'one or two gifts are centered rather than leaving unused columns');
        await page.screenshot({path: `${shots}/${width}x${height}-${schoolCount}-gifts.png`});
        await page.getByRole('button', {name: 'Продолжить', exact: true}).tap();
        await page.waitForFunction(() => !window.__game.scene.isActive('CombatScene'));
      }
      await page.evaluate(() => {
        const u = window.__game.scene.getScene('UIScene'); window.__victoryExits = 0;
        u.openModal({title: 'Победа!', victory: {reward: {}}, buttons: [{primary: true, onClick: () => { window.__victoryExits++; }}]});
        const close = u.modal.close;
        u.openModal({title: 'После боя', text: 'Продолжение истории', buttons: [{label: 'Закрыть', primary: true}]});
        u.reopenModal(); close(); close();
      });
      assert.equal(await page.evaluate(() => window.__victoryExits), 1, 'double close advances exactly once');
      assert.equal(await page.evaluate(() => window.__game.scene.getScene('UIScene').modal.opts.title), 'После боя', 'queued story dialog survives victory close');
      await page.evaluate(() => window.__game.scene.getScene('UIScene').closeModal());
    }
    console.log(`✓ Victory ${width}×${height}: ${hero}, real outcome method, correct rewards, read-only display, bounded art/button, scroll, Continue/Escape/Enter`);
  }
  assert.deepEqual(errors, []); console.log('✓ No page/console errors');
} finally { await browser.close(); await vite.close(); }
