import { CombatScene } from '../scenes/CombatScene.js';
import { CORE } from '../config/horizon/rules.js';
import { PREVIEW_GIFTS } from '../config/horizon/previewTuning.js';
import { VIEW, COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { bindSceneViewport } from '../ui/viewport.js';
import { UIBar } from '../ui/widgets.js';
import { applyDisplaySize } from '../objects/InteractiveObject.js';
import { HorizonBattle, HORIZON_STEP_MS, replayHorizonBattle } from '../systems/HorizonBattle.js';
import { battleContext, settleVictory } from './episode.js';
import { campaign, saveCampaign } from './campaign.js';

const HERO = { x: VIEW.width / 2, y: 1040 };
const POSITIONS = {
  solo: [[VIEW.width / 2, 581]],
  duo: [[VIEW.width * 0.31, 578], [VIEW.width * 0.69, 578]],
  trio: [[VIEW.width / 2, 512], [VIEW.width * 0.23, 622], [VIEW.width * 0.77, 622]],
};

export class HorizonCombatScene extends CombatScene {
  init({ encounter }) {
    this.encounter = encounter;
    this.duel = false;
    this.combatId = null;
    this.spawnId = encounter.id;
    this.spawn = {};
  }

  create() {
    this.bus = services.bus;
    this.viewport = bindSceneViewport(this);
    this.context = battleContext(campaign(), this.encounter);
    this.battle = new HorizonBattle(this.context);
    this.cm = { arena: { ground: 0x26362b }, enemy: { hasArmor: false } };
    this.def = { arena: this.encounter.id === 'frost' ? 'frostwood' : 'forest' };
    this.enemyType = this.encounter.id;
    this.started = false;
    this.ended = false;
    this.elapsed = 0;
    this.selected = null;
    this.hurtFlash = 0;
    services.mode = 'combat';
    this.bus.emit(MSG.UI_MODE, 'combat');

    this.buildArena();
    this.buildHero();
    this.buildHurtVignette();
    this.makeEnemyViews();
    this.makeArenaViews();
    this.makeBattleHud();
    this.registry.set('hudProvider', () => this.battleVitals());
    this.registry.set('abilityProvider', id => this.abilityView(id));
    this.bus.on(MSG.ABILITY_USE, this.cast, this);
    this.bus.on(MSG.COMBAT_CYCLE, this.cycleTarget, this);
    this.events.once('shutdown', () => this.bus.offContext(this));
    this.cameras.main.fadeIn(350);
    this.time.delayedCall(650, () => { this.started = true; });
    this.refreshBattle();
  }

  battleVitals() {
    const { hp, maxHp, mana, maxMana } = this.battle.hero;
    return { hp, maxHp, mana, maxMana: Math.ceil(maxMana) };
  }

  label(x, y, text, color = COLORS.textGold, width = 620) {
    return this.add.text(x, y, text, {
      fontFamily: UI.font, fontSize: UI.type.small, color, stroke: '#14101a', strokeThickness: 5,
      wordWrap: { width }, align: 'center',
    }).setOrigin(0.5).setDepth(5050);
  }

  makeEnemyViews() {
    this.enemyViews = this.battle.enemies.map((enemy, i) => {
      const [x, y] = POSITIONS[this.encounter.pack][i];
      this.def = { texture: enemy.texture, tier: 'normal' };
      this.enemyPos = { x, y };
      this.buildEnemy();
      const sprite = this.enemySprite;
      if (this.battle.enemies.length > 1) {
        this.idle.stop();
        const height = Math.min(200, sprite.displayHeight);
        sprite.setScale(sprite.scale * height / sprite.displayHeight);
        this.idle = this.tweens.add({ targets: sprite, scaleY: sprite.scaleY * 1.04, duration: 800, yoyo: true, repeat: -1 });
      }
      const size = this.battle.enemies.length === 1 ? 470 : 190;
      const healthY = this.battle.enemies.length === 1 ? 251 : y - sprite.displayHeight - 46;
      const ring = this.add.image(x, y - 4, 'fx_ring').setTint(COLORS.gold).setDisplaySize(150, 48).setDepth(y - 1);
      const bar = new UIBar(this, x - size / 2, healthY, size, 21, 'hp', 5000);
      const name = this.label(x, healthY - 25, enemy.name + ' · ' + this.encounter.level, '#fff0d6', size + 15);
      const tag = this.label(x, healthY + 28, '', '#ffb994', size);
      const hit = this.add.zone(x, y - sprite.displayHeight / 2, Math.max(138, sprite.displayWidth), sprite.displayHeight + 54)
        .setDepth(5040).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (!this.canAct() || !this.battle.command({ type: 'focus', target: i })) return;
        this.selected = null;
        this.refreshBattle();
      });
      return { x, y, sprite, bar, ring, name, tag };
    });
  }

  makeArenaViews() {
    const stones = Object.values(this.battle.objects);
    this.stones = Object.fromEntries(stones.map((stone, i) => {
      const x = stones.length === 1 ? VIEW.width / 2 : VIEW.width * (i ? 0.7 : 0.3);
      const y = 790;
      const texture = 'field_rock_' + stone.id;
      const sprite = applyDisplaySize(this.add.image(x, y, texture), texture).setOrigin(0.5, 1).setDepth(y);
      const glow = this.add.image(x, y - 30, 'fx_glow').setDisplaySize(150, 135).setBlendMode('ADD').setDepth(y - 1);
      const title = this.label(x, y + 23, stone.name);
      const hit = this.add.zone(x, y - 30, 155, 135).setDepth(5000).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (!this.canAct() || stone.respawnAt > this.battle.tick) return;
        this.selected = this.selected === stone.id ? null : stone.id;
        services.audio.play('ui_click');
        this.refreshBattle();
      });
      return [stone.id, { x, y, sprite, glow, title, hit }];
    }));
  }

  makeBattleHud() {
    this.hint = this.label(VIEW.width / 2, 885, '');
    if (this.battle.fox) {
      this.companion = applyDisplaySize(this.add.image(HERO.x + 156, HERO.y - 16, 'companion_fox'), 'companion_fox')
        .setOrigin(0.5, 1).setDepth(HERO.y);
      this.response = new UIBar(this, HERO.x + 93, HERO.y + 1, 126, 13, 'mp', 5050);
      this.responseLabel = this.label(HERO.x + 156, HERO.y + 33, 'Отклик');
    }
  }

  abilityView(id) {
    const gift = PREVIEW_GIFTS[id];
    if (!gift) return { id, state: 'locked' };
    if (!services.state.isEquipped(id)) return { id, state: 'benched' };
    const left = Math.max(0, (this.battle.cooldown[id] - this.battle.tick) * HORIZON_STEP_MS / 1000);
    if (left) return { id, state: 'cooldown', cdLeft: left, cdFrac: left / gift.cd_sec };
    if (this.battle.hero.mana < gift.mana) return { id, state: 'nomana' };
    const stone = this.selected && this.battle.objects[this.selected];
    return { id, state: 'ready', suggested: !!stone && id === (stone.tag ? 'telekinesis' : 'fire') };
  }

  cast(id) {
    if (!this.canAct() || this.abilityView(id).state !== 'ready') return;
    const object = this.selected;
    if (!this.battle.command({ type: object ? 'cast_on_object' : 'cast', gift: id, object })) return;
    this.selected = null;
    this.heroAnim.playCast(id);
    services.audio.play(id === 'fire' ? 'fire_cast' : 'telekinesis_cast');
    this.handleBattleEvents();
    this.refreshBattle();
    if (this.battle.result) this.finishBattle();
  }

  cycleTarget() {
    if (!this.canAct()) return;
    const living = this.battle.enemies.filter(enemy => enemy.hp > 0).map(enemy => enemy.index);
    const next = living[(living.indexOf(this.battle.focus) + 1) % living.length];
    this.battle.command({ type: 'focus', target: next });
    this.selected = null;
    this.refreshBattle();
  }

  update(_, delta) {
    this.updateHero(delta);
    if (!this.canAct()) return;
    this.elapsed += Math.min(delta, 150);
    while (this.elapsed >= HORIZON_STEP_MS && !this.battle.result) {
      this.battle.advance();
      this.elapsed -= HORIZON_STEP_MS;
    }
    this.handleBattleEvents();
    this.refreshBattle();
    if (this.battle.result) this.finishBattle();
  }

  refreshBattle() {
    for (const [i, enemy] of this.battle.enemies.entries()) {
      const view = this.enemyViews[i];
      view.bar.setFraction(enemy.hp / enemy.maxHp);
      view.ring.setVisible(enemy.hp > 0 && this.battle.focus === i);
      view.sprite.setAlpha(enemy.hp ? 1 : 0.27);
      const text = enemy.castUntil ? 'Готовит удар' : enemy.heat ? 'Жар ×' + enemy.heat : enemy.shield ? 'Щит' : '';
      if (view.tag.text !== text) view.tag.setText(text);
    }
    for (const stone of Object.values(this.battle.objects)) {
      const view = this.stones[stone.id];
      const wait = Math.max(0, Math.ceil((stone.respawnAt - this.battle.tick) * HORIZON_STEP_MS / 1000));
      view.sprite.setAlpha(wait ? 0.28 : 1);
      if (stone.tag) view.sprite.setTint(0xff9449);
      else view.sprite.clearTint();
      view.glow.setTint(stone.tag ? COLORS.fire : COLORS.telekinesis)
        .setAlpha(wait ? 0 : this.selected === stone.id ? 0.75 : stone.tag ? 0.5 : 0);
      const text = wait ? 'Через ' + wait + ' с' : stone.tag ? 'Раскалён' : stone.name;
      if (view.title.text !== text) view.title.setText(text);
    }
    this.response?.setFraction(this.battle.charge / CORE.companion_max_charge);
    if (this.responseLabel) this.responseLabel.setText('Отклик ' + this.battle.charge + '%');
    const stone = this.selected && this.battle.objects[this.selected];
    const teaching = this.encounter.id === 'spark' && !this.battle.combos;
    let hint = 'Выбери цель или заряди камень Огнём.';
    if (stone) hint = stone.tag ? 'Брось раскалённый камень Телекинезом.' : teaching ? 'Нажми «Огонь».' : 'Примени Огонь или Телекинез.';
    else if (teaching) hint = this.battle.objects.light.tag ? 'Снова нажми на раскалённый камень.' : 'Нажми на камень.';
    if (this.hint.text !== hint) this.hint.setText(hint);
  }

  handleBattleEvents() {
    for (const event of this.battle.drainEvents()) {
      const enemy = this.enemyViews[event.enemy];
      if (event.type === 'hit') {
        this.heroAnim.playHurt(false);
        services.audio.play('hero_hurt', { minGap: 160 });
        continue;
      }
      if (event.type === 'charge') {
        const rock = this.stones[event.object];
        this.burst(rock.x, rock.y - 28, COLORS.fire, 24);
        continue;
      }
      if (!enemy) continue;
      const y = enemy.y - enemy.sprite.displayHeight * 0.6;
      if (event.type === 'interrupt') {
        this.floatText(enemy.x, y - 35, 'Прервано', COLORS.telekinesis, 28);
        services.audio.play('interrupt');
      } else if (event.type === 'damage') {
        const { source } = event;
        const hot = ['fire', 'fire-stone', 'heat'].includes(source);
        const color = hot ? COLORS.fire : source === 'impulse' ? 0xffd578 : COLORS.telekinesis;
        this.floatText(enemy.x, y, '−' + event.amount, color, source === 'impulse' ? 43 : 30);
        if (['wand', 'impulse', 'stone', 'fire-stone', 'fox'].includes(source)) {
          const from = source === 'fox' && this.companion ? this.companion : this.heroSprite;
          const upgraded = this.context.wandRank > 0;
          const glow = source === 'wand' ? (upgraded ? 0x81e9df : 0xffd986) : color;
          const bolt = this.add.image(from.x, from.y - 62, 'fx_dot').setTint(glow).setBlendMode('ADD')
            .setScale(source === 'impulse' ? 2.8 : upgraded ? 1.65 : 1.1).setDepth(6000);
          this.tweens.add({ targets: bolt, x: enemy.x, y, duration: 210, onComplete: () => {
            bolt.destroy();
            if (source === 'impulse') this.burst(enemy.x, y, glow, 20);
          } });
          services.audio.play('auto_hit', { minGap: 150 });
        }
      }
    }
  }

  finishBattle() {
    if (this.ended) return;
    this.ended = true;
    const battle = this.battle;
    const replayed = replayHorizonBattle(this.context, battle.record());
    const victory = replayed.result === 'victory';
    this.hint.setVisible(false);
    const onClick = () => this.exit(victory ? 'victory' : 'defeat');
    if (victory) {
      const before = campaign();
      const reward = settleVictory(before, this.encounter, replayed.foxBonus, Date.now());
      saveCampaign(reward.state, { notify: false });
      services.audio.play('victory');
      if (reward.state.step === 'lantern') {
        const enemy = this.enemyViews[0];
        this.burst(enemy.x, enemy.y - 48, COLORS.gold, 34);
        this.bus.emit(MSG.DIALOG, {
          title: 'Победа!', text: reward.summary, color: COLORS.gold,
          buttons: [{ label: 'Продолжить', primary: true, onClick }],
        });
        return;
      }
      this.bus.emit(MSG.DIALOG, {
        title: 'Победа!', color: COLORS.gold,
        victory: {
          reward: { coins: reward.state.coins - before.coins, items: {
            ...(reward.state.herbs > before.herbs ? { moon_herb: reward.state.herbs - before.herbs } : {}),
            ...(!before.fox && reward.state.fox ? { companion_fox: 1 } : {}),
          } },
          vitals: this.battleVitals(), seconds: battle.tick * HORIZON_STEP_MS / 1000, interrupts: 0, levelUps: [],
        },
        buttons: [{ label: 'Продолжить', primary: true, onClick }],
      });
    } else {
      this.heroAnim.playDeath();
      services.audio.play('defeat');
      this.bus.emit(MSG.DIALOG, {
        title: 'Поражение', color: COLORS.danger,
        text: 'Враг остался на карте. Подойди к нему, чтобы попробовать снова.',
        buttons: [{ label: 'Вернуться', primary: true, onClick }],
      });
    }
  }
}
