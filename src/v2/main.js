import { CORE, STARTER_GIFTS } from '../config/horizon/rules.js';
import { HorizonBattle, HORIZON_STEP_MS } from '../systems/HorizonBattle.js';
import {
  ART, DIALOGUE, STORY_ENCOUNTERS, battleContext, finishDialogue, huntOffers, loadEpisode,
  restartEpisode, saveEpisode, settleVictory, tideStatus, titleOf, upgradeWand, wandSeconds,
} from './episode.js';

const root = document.querySelector('#game');
const assets = new URL('../assets/', document.baseURI);
const forest = new URL('../assets/backgrounds/dusk-forest.webp', import.meta.url).href;
const asset = key => new URL(ART[key] ?? key, assets).href;
const art = (key, style = '') => '<img class="' + style + '" alt="" draggable="false" src="' + asset(key) + '">';
const targets = {
  spark: { label: 'Искроцап', art: STORY_ENCOUNTERS.spark.enemies[0].art, x: 56, y: 57, hint: 'Отгони Искроцапа от фонаря.' },
  upgrade: { label: 'Усилить палочку', art: 'fire', x: 32, y: 64, hint: 'Влей лунную пыль в палочку.' },
  frost: { label: 'Морозун', art: STORY_ENCOUNTERS.frost.enemies[0].art, x: 77, y: 47, hint: 'Отгони Морозуна от калитки.' },
};
const huntPoints = [[25, 63], [72, 57], [35, 42], [66, 32]];
const portraits = { Мирра: 'mirra', Рыжик: 'fox', Веда: 'veda', Гром: 'grom' };

let storage;
try { storage = window.localStorage; } catch { /* Storage can be disabled. */ }
let state = loadEpisode(storage);
let line = 0;
let notice = '';
let result = false;
let active = null;
let position = { x: 50, y: 79 };
let walkTimer = 0;
let frameId = 0;

function commit(next) {
  state = next;
  saveEpisode(storage, state);
}

function top(title, extra = '') {
  return '<header class="topbar"><div><div class="location">Янтарный Бор</div><h1>' + title
    + '</h1></div><div class="row">' + extra + '<button class="quiet" data-action="bag">Сумка</button></div></header>';
}

function at(x, y) { return ' style="--x:' + x + '%;--y:' + y + '%"'; }
function prop(key, x, y) { return '<div class="prop ' + key + '"' + at(x, y) + '>' + art(key) + '</div>'; }
function marker(action, { label, art: key, x, y, meta, goal, unavailable }) {
  return '<button class="marker' + (goal ? ' goal' : '') + '"' + at(x, y) + ' data-action="' + action + '" data-x="' + x + '" data-y="' + y + '"'
    + (unavailable ? ' disabled' : '') + '>' + (goal ? '<span class="waypoint" aria-hidden="true">▾</span>' : '') + art(key)
    + '<span class="marker-label">' + label + (meta ? '<small>' + meta + '</small>' : '') + '</span></button>';
}

function world() {
  const flash = state.step === 'intro' && line === 2;
  const frozen = flash || ['spark', 'upgrade', 'frost'].includes(state.step);
  const visitor = state.step === 'intro' && !flash ? prop('mirra', 44, 64)
    : state.step === 'veda' ? prop('veda', 58, 62) : state.step === 'grom' ? prop('grom', 75, 57) : '';
  return '<section class="world' + (frozen ? ' frozen' : '') + (flash ? ' breach' : '') + '" style="--forest:url(\'' + forest + '\')" aria-label="Двор Очага Мирры">'
    + '<div class="clearing"></div><div class="beam"></div>'
    + prop('hut', 25, 57) + prop('cauldron', 22, 70) + prop('sign', 84, 55) + prop('lantern', 64, 63)
    + (state.fox ? prop('flower', 21, 78) : '') + visitor
    + (['grom', 'hunt'].includes(state.step) ? prop('camp', 84, 67) : '')
    + '<div class="hero"' + at(position.x, position.y) + '>' + art('hero') + (state.fox ? art('fox', 'map-fox') : '') + '</div>'
    + (targets[state.step] ? marker(state.step, { ...targets[state.step], goal: true }) : '')
    + (state.step === 'hunt' ? '<div class="hunt-markers"></div>' : '') + '</section>';
}

function worldPanel() {
  if (state.step === 'hunt') {
    return '<section class="quest-panel"><div class="row"><div><h2>Привал Грома</h2><span class="tide"></span></div>'
      + '<button class="quiet" data-action="bestiary">Бестиарий</button></div>'
      + '<p>' + (notice || 'Выбери отряд. Победы над равными и более сильными врагами поднимают уровень охоты.') + '</p></section>';
  }
  const dialogue = DIALOGUE[state.step]?.[line];
  const loot = notice ? '<p class="loot">' + notice + '</p>' : '';
  if (dialogue) {
    return '<section class="quest-panel dialogue"><div class="speaker row">' + art(portraits[dialogue[0]]) + '<div><h2>' + dialogue[0]
      + '</h2><p>' + dialogue[1] + '</p></div></div>' + loot + '<button class="primary" data-action="next">'
      + (state.step === 'grom' && line === 1 ? 'Открыть охоту' : 'Дальше') + '</button></section>';
  }
  const target = targets[state.step];
  const cost = ' · ' + CORE.act1_first_wand_coins + ' монет + ' + CORE.act1_first_wand_herbs + ' травы';
  return '<section class="quest-panel"><h2>' + titleOf(state.step) + '</h2><p>' + target.hint + '</p>' + loot
    + '<button class="primary" data-action="' + state.step + '" data-x="' + target.x + '" data-y="' + target.y + '">'
    + target.label + (state.step === 'upgrade' ? cost : ' · В бой') + '</button></section>';
}

function renderWorld() {
  root.innerHTML = top(titleOf(state.step)) + world() + worldPanel();
  refreshHunt();
}

function refreshHunt() {
  const holder = root.querySelector('.hunt-markers');
  if (!holder) return;
  const now = Date.now();
  const offers = huntOffers(state, now);
  const seconds = offers.map(offer => Math.max(0, Math.ceil((offer.readyAt - now) / 1000)));
  const signature = offers.map((offer, i) => offer.id + ':' + offer.level + ':' + seconds[i]).join('/');
  if (holder.dataset.signature !== signature) {
    holder.dataset.signature = signature;
    holder.innerHTML = offers.map((offer, i) => marker('hunt:' + offer.id, {
      label: offer.enemies[0].name, art: offer.enemies[0].art, x: huntPoints[i][0], y: huntPoints[i][1],
      meta: offer.ready ? 'Ур. ' + offer.level + ' · Врагов ' + offer.enemies.length : 'Через ' + seconds[i] + ' с',
      unavailable: !offer.ready,
    })).join('');
  }
  const { remaining, tide } = tideStatus(state, now);
  root.querySelector('.tide').textContent =
    (remaining ? tide.key + ' ' + remaining + '/' + tide.threshold : tide.key + ' · ×' + tide.value) + ' · Охота ' + state.huntLevel;
}

function walk(x, y, action) {
  const hero = root.querySelector('.world .hero');
  if (!hero || walkTimer) return;
  const distance = Math.hypot(x - position.x, y - position.y);
  position = { x, y };
  hero.style.setProperty('--x', x + '%');
  hero.style.setProperty('--y', y + '%');
  if (action) {
    walkTimer = window.setTimeout(() => {
      walkTimer = 0;
      approach(action);
    }, distance < 3 ? 0 : 290);
  }
}

function approach(action) {
  if (action === 'upgrade' && state.step === action) {
    const next = upgradeWand(state);
    if (next === state) return;
    commit(next);
    notice = 'Палочка усилена. Выстрел каждые ' + wandSeconds(state.wandRank) + ' с.';
    renderWorld();
    root.querySelector('.hero').classList.add('upgrade-glow');
    return;
  }
  const encounter = action === state.step ? STORY_ENCOUNTERS[action] : action.startsWith('hunt:')
    && huntOffers(state, Date.now()).find(offer => offer.ready && offer.id === action.slice(5));
  if (encounter) beginBattle(encounter);
}

function renderBattle() {
  const { battle, encounter } = active;
  root.innerHTML = top(encounter.name.replaceAll(' и ', ' · '), '<small>Ур. ' + encounter.level + '</small>')
    + '<section class="arena" style="--back:url(\'' + asset('forestArena') + '\')" aria-label="Арена">'
    + '<div class="enemy-row pack-' + encounter.pack + '">' + battle.enemies.map((enemy, i) =>
      '<button class="enemy enemy-' + i + '" data-action="focus:' + i + '"><span class="enemy-name">' + enemy.name
      + '</span><span class="bar enemy-hp"><i></i></span><span class="cast" hidden>Готовит удар</span><span class="heat" hidden></span>'
      + art(enemy.art) + '</button>').join('') + '</div>'
    + '<div class="objects">' + Object.values(battle.objects).map(stone => '<button class="stone" data-action="stone:' + stone.id + '">'
      + art(stone.id) + '<span></span></button>').join('') + '</div>'
    + '<div class="battle-hero">' + art('hero') + '</div>'
    + (battle.fox ? '<div class="battle-fox">' + art('fox') + '<div class="response"><i></i><span></span></div></div>' : '')
    + '<div class="effects" aria-hidden="true"></div></section>'
    + '<section class="control-panel"><div class="battle-vitals"><div class="bar hp"><i></i><span></span></div>'
    + '<div class="bar mana"><i></i><span></span></div></div><p class="hint" aria-live="polite"></p>'
    + '<div class="dock">' + Object.values(STARTER_GIFTS).map(gift => '<button class="gift" data-action="gift:' + gift.id + '">'
      + art(gift.id) + '<span>' + gift.name + '</span><small></small></button>').join('')
    + '<button class="gift empty" disabled aria-label="Третий слот дара свободен">＋</button></div></section>';
  const find = selector => root.querySelector(selector);
  const buttonMap = (selector, offset) =>
    Object.fromEntries([...root.querySelectorAll(selector)].map(node => [node.dataset.action.slice(offset), node]));
  active.view = {
    arena: find('.arena'), hero: find('.battle-hero'), fox: find('.battle-fox'), effects: find('.effects'),
    enemies: [...root.querySelectorAll('.enemy')], stones: buttonMap('.stone', 6), gifts: buttonMap('.gift[data-action]', 5),
    hp: find('.hp'), mana: find('.mana'), hint: find('.hint'),
  };
  updateBattle();
}

function bar(node, n, max, label) {
  node.firstElementChild.style.width = 100 * n / max + '%';
  if (label) node.lastElementChild.textContent = Math.ceil(n) + ' / ' + Math.ceil(max) + ' ' + label;
}

function updateBattle() {
  const { battle, selected, view, encounter } = active;
  for (const [i, foe] of battle.enemies.entries()) {
    const node = view.enemies[i];
    const focus = i === battle.focus && foe.hp > 0;
    node.classList.toggle('focused', focus);
    node.classList.toggle('defeated', !foe.hp);
    node.disabled = !foe.hp;
    node.setAttribute('aria-pressed', String(focus));
    bar(node.querySelector('.enemy-hp'), foe.hp, foe.maxHp);
    node.querySelector('.cast').hidden = !foe.castUntil;
    const heat = node.querySelector('.heat');
    heat.hidden = !foe.heat;
    heat.textContent = foe.heat ? 'Жар ×' + foe.heat : '';
  }
  const cooldown = until => Math.max(0, Math.ceil((until - battle.tick) * HORIZON_STEP_MS / 1000));
  for (const stone of Object.values(battle.objects)) {
    const node = view.stones[stone.id];
    const seconds = cooldown(stone.respawnAt);
    node.disabled = seconds > 0;
    node.setAttribute('aria-pressed', String(selected === stone.id));
    node.classList.toggle('hot', stone.tag === 'heat');
    node.lastElementChild.textContent = seconds ? 'Вернётся через ' + seconds + ' с' : stone.tag ? 'Раскалён' : stone.name;
  }
  const stone = selected ? battle.objects[selected] : null;
  const lesson = encounter.id === 'spark' && battle.combos === 0;
  for (const [id, node] of Object.entries(view.gifts)) {
    const gift = STARTER_GIFTS[id];
    const seconds = cooldown(battle.cooldown[id]);
    node.disabled = seconds > 0 || battle.hero.mana < gift.mana || Boolean(stone?.tag && id === 'fire');
    node.lastElementChild.textContent = seconds ? seconds + ' с' : gift.mana + ' MP';
    node.classList.toggle('guided', lesson && Boolean(stone) && id === (stone?.tag ? 'telekinesis' : 'fire'));
  }
  bar(view.hp, battle.hero.hp, battle.hero.maxHp, 'HP');
  bar(view.mana, battle.hero.mana, battle.hero.maxMana, 'MP');
  if (view.fox) bar(view.fox.querySelector('.response'), battle.charge, CORE.companion_max_charge, 'отклика');
  const hot = Object.values(battle.objects).some(object => object.tag === 'heat');
  const targetHint = stone ? stone.name + ' выбран. Примени дар.' : battle.enemies.some(foe => foe.castUntil)
    ? 'Сбей подготовку Телекинезом.' : 'Нажми на врага для смены цели или выбери камень.';
  const lessonHint = stone ? (stone.tag ? 'Брось раскалённый камень Телекинезом.' : 'Нажми «Огонь», чтобы раскалить камень.')
    : hot ? 'Снова выбери раскалённый камень.' : 'Нажми на камень на арене.';
  const hint = lesson ? lessonHint : targetHint;
  if (hint !== view.hint.textContent) view.hint.textContent = hint;
  for (const event of battle.drainEvents()) animateEvent(event, view);
}

function animateEvent(event, view) {
  const flash = node => node?.animate([{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], 270);
  if (event.type === 'charge') { flash(view.stones[event.object]); return; }
  if (event.type === 'hit') { flash(view.hero); return; }
  if (event.type !== 'damage') { flash(view.enemies[event.enemy]); return; }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const arena = view.arena.getBoundingClientRect();
  const enemy = view.enemies[event.enemy].getBoundingClientRect();
  const x = enemy.left + enemy.width / 2 - arena.left;
  const y = enemy.top + enemy.height * 0.55 - arena.top;
  const label = document.createElement('span');
  label.className = 'damage ' + event.source;
  label.textContent = '−' + event.amount;
  label.style.left = x + 'px';
  label.style.top = y + 'px';
  view.effects.append(label);
  label.animate([{ transform: 'translate(-50%,0)', opacity: 1 }, { transform: 'translate(-50%,-35px)', opacity: 0 }], 560)
    .onfinish = () => label.remove();
  if (!['wand', 'impulse', 'fox', 'fire-stone', 'stone'].includes(event.source)) return;
  const origin = (event.source === 'fox' ? view.fox : view.hero).getBoundingClientRect();
  const fromX = origin.left + origin.width / 2 - arena.left;
  const fromY = origin.top + origin.height / 2 - arena.top;
  const bolt = document.createElement('span');
  bolt.className = 'bolt ' + event.source + (state.wandRank ? ' upgraded' : '');
  bolt.style.left = fromX + 'px';
  bolt.style.top = fromY + 'px';
  view.effects.append(bolt);
  bolt.animate([{ transform: 'translate(0,0) scale(.7)' }, {
    transform: 'translate(' + (x - fromX) + 'px,' + (y - fromY) + 'px) scale(1.3)',
  }], 210).onfinish = () => bolt.remove();
}

function beginBattle(encounter) {
  active = { encounter, battle: new HorizonBattle(battleContext(state, encounter)), selected: null, elapsed: 0, previous: null };
  notice = '';
  renderBattle();
  frameId = requestAnimationFrame(frame);
}

function frame(now) {
  const { battle } = active;
  const delta = active.previous === null ? 0 : Math.min(250, now - active.previous);
  active.previous = now;
  if (!root.querySelector('dialog[open]')) active.elapsed += delta;
  let updated = false;
  while (active.elapsed >= HORIZON_STEP_MS && !battle.result) {
    active.elapsed -= HORIZON_STEP_MS;
    battle.advance();
    updated = true;
  }
  if (updated) updateBattle();
  if (battle.result) endBattle();
  else frameId = requestAnimationFrame(frame);
}

function battleAction(action) {
  const { battle } = active;
  const [kind, id] = action.split(':');
  if (kind === 'focus') {
    active.selected = null;
    battle.command({ type: 'focus', target: Number(id) });
  } else if (kind === 'stone' && battle.objects[id]?.respawnAt <= battle.tick) {
    active.selected = active.selected === id ? null : id;
  } else if (kind === 'gift') {
    const object = active.selected;
    if (battle.command({ type: object ? 'cast_on_object' : 'cast', gift: id, object })) active.selected = null;
  }
  updateBattle();
  if (battle.result) endBattle();
}

function endBattle() {
  const { battle, encounter } = active;
  active = null;
  cancelAnimationFrame(frameId);
  const victory = battle.result === 'victory';
  if (victory) {
    const reward = settleVictory(state, encounter, battle.foxBonus, Date.now());
    commit(reward.state);
    notice = reward.summary;
  }
  result = true;
  root.insertAdjacentHTML('beforeend', '<div class="result-panel"><section class="quest-panel"><h2>' + (victory ? 'Победа' : 'Поражение')
    + '</h2><p>' + (victory ? notice : 'Очаг ждёт. Можно сразу попробовать ещё раз.') + '</p><button class="primary" data-action="leave">'
    + (victory ? 'Продолжить' : 'Вернуться') + '</button></section></div>');
  root.querySelector('.result-panel button').focus();
}

function openInfo(kind) {
  if (root.querySelector('dialog')) return;
  const bestiary = kind === 'bestiary';
  const rows = bestiary
    ? [['Искроцап', state.bestiary.spark ?? 0], ['Морозун', state.bestiary.frost ?? 0], ['Колючник', state.bestiary.thorn ?? 0]]
    : [['Монеты', state.coins], ['Лунная трава', state.herbs], ['Осколки Огня', state.shards],
      ...(state.storyPage ? [['Страница Гримуара', 1]] : []), ['Темп палочки', wandSeconds(state.wandRank) + ' с']];
  root.insertAdjacentHTML('beforeend', '<dialog><h2>' + (bestiary ? 'Бестиарий' : 'Сумка') + '</h2>'
    + rows.map(([name, value]) => '<p>' + name + ' · ' + value + '</p>').join('')
    + '<div class="row"><button class="primary" data-action="close">Закрыть</button>'
    + (!active && !bestiary ? '<button class="quiet" data-action="reset">Начать заново</button>' : '') + '</div></dialog>');
  const dialog = root.querySelector('dialog');
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}

root.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    const scene = event.target.closest('.world');
    if (scene && !DIALOGUE[state.step]) {
      const box = scene.getBoundingClientRect();
      walk(Math.max(7, Math.min(93, 100 * (event.clientX - box.left) / box.width)),
        Math.max(42, Math.min(92, 100 * (event.clientY - box.top) / box.height)));
    }
    return;
  }
  const { action, x, y } = button.dataset;
  if (action === 'leave') {
    result = false;
    renderWorld();
  } else if (result) {
    return;
  } else if (action === 'close') {
    root.querySelector('dialog')?.close();
  } else if (action === 'reset' && window.confirm('Начать «Погасший очаг» заново?')) {
    clearTimeout(walkTimer);
    walkTimer = 0;
    state = restartEpisode(storage);
    line = 0;
    notice = '';
    position = { x: 50, y: 79 };
    renderWorld();
  } else if (action === 'bag' || action === 'bestiary') {
    openInfo(action);
  } else if (active) {
    battleAction(action);
  } else if (action === 'next') {
    if (++line >= DIALOGUE[state.step].length) {
      commit(finishDialogue(state));
      line = 0;
      notice = '';
    }
    renderWorld();
  } else if (x) {
    walk(+x - 3, +y + 5, action);
  }
});

document.addEventListener('keydown', event => {
  if (!active || event.repeat || root.querySelector('dialog[open]')) return;
  const gift = { Digit1: 'fire', Digit2: 'telekinesis' }[event.code];
  if (gift) battleAction('gift:' + gift);
});
setInterval(refreshHunt, 400);
renderWorld();
