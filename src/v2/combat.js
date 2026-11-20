import { CombatScene } from '../scenes/CombatScene.js';
import { CORE } from '../config/horizon/rules.js';
import { POTIONS_41 } from './progression.js';
import { resolveHorizonBattle } from './battleResolution.js';
import { VIEW, COLORS } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { bindSceneViewport } from '../ui/viewport.js';
import { UIBar } from '../ui/widgets.js';
import { applyDisplaySize } from '../objects/InteractiveObject.js';
import { HorizonBattle, HORIZON_STEP_MS } from '../systems/HorizonBattle.js';
import { battleContext } from './episode.js';
import { campaign, saveCampaign } from './campaign.js';

const OBJECT_ART={light:'field_rock_light',heavy:'field_rock_heavy',crystal:'field_crystal',barrel:'barrel_01'};
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
    const atHearth = ['spark', 'frost'].includes(this.encounter.id);
    this.def = { arena: atHearth ? 'mirra_hearth' : this.encounter.region===2?'city':'forest' };
    this.enemyType = this.encounter.id;
    this.started = false;
    this.ended = false;
    this.elapsed = 0;
    this.selected = null;
    this.hurtFlash = 0;
    services.mode = 'combat';
    this.bus.emit(MSG.UI_MODE, 'combat');

    this.buildArena();
    if (this.encounter.id === 'frost') this.arenaArt?.setTint(0xc0d9ec);
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
      this.def = { texture: enemy.texture, tier: enemy.role==='boss'?'strong':'normal' };
      this.enemyPos = { x, y };
      this.buildEnemy();
      const sprite = this.enemySprite;
      if (enemy.id==='boss_august_grad') sprite.setScale(sprite.scale*152/sprite.displayHeight);
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
      const cast = new UIBar(this, x - size / 2, healthY + 19, size, 8, 'xp', 5000).setVisible(false);
      const tag = this.label(x, healthY + 38, '', '#ffb994', size);
      const hit = this.add.zone(x, y - sprite.displayHeight / 2, Math.max(138, sprite.displayWidth), sprite.displayHeight + 54)
        .setDepth(5040).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (!this.canAct() || !this.battle.command({ type: 'focus', target: i })) return;
        this.selected = null;
        this.refreshBattle();
      });
      return { x, y, sprite, bar, cast, ring, name, tag };
    });
  }

  makeArenaViews() {
    const stones = Object.values(this.battle.objects);
    this.stones = Object.fromEntries(stones.map((stone, i) => {
      const x = VIEW.width * (i+1)/(stones.length+1);
      const y = 790;
      const texture = OBJECT_ART[stone.id];
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
    this.hint = this.label(VIEW.width / 2, 875, '').setPadding(16, 8).setBackgroundColor('#251c24');
    this.quickPotions=Object.entries(this.battle.potions).filter(([id,n])=>n>0 && POTIONS_41[id] && POTIONS_41[id].category!=='pre_combat').slice(0,3)
      .map(([id],i)=>{
        const y=926+i*80,x=64;
        const ring=this.add.circle(x,y,33,0x221824,.94).setStrokeStyle(2,COLORS.gold).setDepth(5200);
        const kind=POTIONS_41[id].effect_type;
        const texture=kind.startsWith('mana')?'icon_potion_mana':kind.startsWith('heal')?'icon_potion_life':'icon_potion_fire';
        const icon=this.add.image(x,y,texture).setDisplaySize(39,41).setDepth(5201);
        const count=this.label(x+26,y+22,'','#fff3da').setDepth(5202);
        const hit=this.add.zone(x,y,75,75).setDepth(5203).setInteractive({useHandCursor:true});
        hit.on('pointerdown',()=>this.dose(id));
        return { id,ring,icon,count,hit };
      });
    if (this.battle.pet) {
      this.companion = applyDisplaySize(this.add.image(HERO.x + 156, HERO.y - 16, 'companion_'+this.battle.pet), 'companion_'+this.battle.pet)
        .setOrigin(0.5, 1).setDepth(HERO.y);
      this.response = new UIBar(this, HERO.x + 93, HERO.y + 1, 126, 13, 'mp', 5050);
      this.responseLabel = this.label(HERO.x + 156, HERO.y + 33, 'Отклик');
    }
  }

  abilityView(id) {
    const gift = this.battle.rules[id];
    if (!gift) return { id, state: 'locked' };
    if (!services.state.isEquipped(id)) return { id, state: 'benched' };
    const left = Math.max(0, (this.battle.cooldown[id] - this.battle.tick) * HORIZON_STEP_MS / 1000);
    if (left) return { id, state: 'cooldown', cdLeft: left, cdFrac: left / gift.cd_sec };
    if (this.battle.hero.mana < gift.mana) return { id, state: 'nomana' };
    const stone = this.selected && this.battle.objects[this.selected];
    return { id, state: 'ready', suggested: !!stone && id === (stone.tag ? 'telekinesis' : 'fire') };
  }

  teaching() { return this.encounter.id === 'spark' && !this.battle.combos; }

  cast(id) {
    if (!this.canAct() || this.abilityView(id).state !== 'ready') return;
    const object = this.selected;
    const stone = object && this.battle.objects[object];
    if (this.teaching() && (!stone || id !== (stone.tag ? 'telekinesis' : 'fire'))) return;
    const target = this.enemyViews[this.battle.focus], charged = stone?.tag === 'heat';
    if (!this.battle.command({ type: object ? 'cast_on_object' : 'cast', gift: id, object })) return;
    this.selected = null;
    this.heroAnim.playCast(id in COLORS?id:'seal');
    services.audio.play(id === 'fire' ? 'fire_cast' : 'telekinesis_cast');
    if (stone && this.battle.rules[id].role==='volya') this.animateThrownStone(object,target,charged);
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
    if (!this.canAct() || this.teaching()) return;
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
      const casting = enemy.castUntil > this.battle.tick;
      view.cast.setVisible(casting);
      if (casting) view.cast.setFraction((this.battle.tick-enemy.castStart)/(enemy.castUntil-enemy.castStart));
      const statuses={brittle:'Хрупкость',charge:'Разряд',breach:'Пролом',viscosity:'Вязкость',echo:'Эхо'};
      const tag=Object.keys(statuses).find(key=>this.battle.activeTag(enemy,key));
      const castName = enemy.id==='boss_august_grad'
        ? enemy.castCount%2===1?'Ледяной барьер':'Волна холода'
        : enemy.id==='boss_treegazer'
          ? enemy.castCount%2===1?'Кора веков':'Обвал корней'
          : enemy.cast_name || 'Готовит удар';
      const text = enemy.castUntil ? castName : enemy.shield ? 'Щит' : enemy.heat ? 'Жар ×' + enemy.heat : statuses[tag] || '';
      if (view.tag.text !== text) view.tag.setText(text);
    }
    for (const stone of Object.values(this.battle.objects)) {
      const view = this.stones[stone.id];
      const wait = Math.max(0, Math.ceil((stone.respawnAt - this.battle.tick) * HORIZON_STEP_MS / 1000));
      view.sprite.setAlpha(wait ? 0.28 : 1);
      const colors={heat:0xff9449,brittle:0x91edff,charge:0xb9a1ff,breach:0xc7b0fe,viscosity:0xefba72,echo:0xacdcff};
      if (stone.tag) view.sprite.setTint(colors[stone.tag] || 0xff9449);
      else view.sprite.clearTint();
      view.glow.setTint(stone.tag ? COLORS.fire : COLORS.telekinesis)
        .setAlpha(wait ? 0 : this.selected === stone.id ? 0.75 : stone.tag ? 0.5 : this.teaching() ? 0.36 : 0);
      const text=wait?'Через '+wait+' с':stone.tag==='heat'?'Раскалён':stone.name;
      if (view.title.text !== text) view.title.setText(text);
    }
    this.response?.setFraction(this.battle.charge / CORE.companion_max_charge);
    for (const view of this.quickPotions) {
      const available=(this.battle.potions[view.id] || 0)-(this.battle.usedPotions[view.id] || 0);
      view.count.setText(String(available));
      view.icon.setAlpha(available?1:.34);
    }
    if (this.responseLabel) this.responseLabel.setText('Отклик ' + this.battle.charge + '%');
    const stone = this.selected && this.battle.objects[this.selected];
    const teaching = this.teaching();
    let hint = this.encounter.id === 'frost' ? 'Палочка стреляет быстрее. Раскали камень Огнём и брось Телекинезом.' : '';
    const focused = this.battle.enemies[this.battle.focus];
    if (focused.id==='boss_august_grad') {
      if (focused.shield) hint='Астрал или Пролом снимет ледяной щит.';
      else if (focused.castUntil && focused.castCount%2===0) hint='Сбей волну броском или выпей Тёплый настой.';
    }
    if (stone) hint = stone.tag ? 'Нажми «Телекинез», чтобы бросить камень.' : 'Нажми «Огонь», чтобы раскалить камень.';
    else if (teaching) hint = this.battle.objects.light.tag ? 'Выбери раскалённый камень.' : 'Коснись камня на поляне.';
    this.hint.setVisible(!!hint);
    if (this.hint.text !== hint) this.hint.setText(hint);
  }

  animateThrownStone(id, enemy, charged) {
    const { x, y } = this.stones[id];
    const key = OBJECT_ART[id];
    const rock = applyDisplaySize(this.add.image(x, y - 27, key), key).setDepth(6010)
      .setTint(charged ? 0xffa15b : COLORS.telekinesis);
    const hitY = enemy.y - enemy.sprite.displayHeight * 0.46;
    this.tweens.addCounter({ from: 0, to: 1, duration: 330,
      onUpdate: tween => {
        const t = tween.getValue();
        rock.setPosition(x + (enemy.x - x) * t, y - 27 + (hitY - y + 27) * t - 250 * t * (1 - t));
        rock.setAngle(t * 115);
      },
      onComplete: () => {
        rock.destroy();
        this.burst(enemy.x, hitY, charged ? COLORS.fire : COLORS.telekinesis, 19);
      },
    });
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
        if (['wand', 'impulse', 'fox'].includes(source)) {
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

  dose(id) {
    if (!this.canAct() || !this.battle.command({type:'potion',id})) return false;
    this.handleBattleEvents();
    this.refreshBattle();
    if (this.battle.result) this.finishBattle();
    return true;
  }

  finishBattle() {
    if (this.ended) return;
    this.ended = true;
    const battle = this.battle;
    const before=campaign();
    let reward;
    try {
      reward=resolveHorizonBattle(before,this.context,battle.record(),Date.now());
    } catch (error) {
      console.error(error);
      this.bus.emit(MSG.DIALOG, {
        title: 'Итог боя не сохранён',
        text: 'Вернись на карту и попробуй ещё раз.',
        buttons: [{ label: 'На карту', primary: true, onClick: () => this.exit('cancelled') }],
      });
      return;
    }
    const {victory}=reward;
    saveCampaign(reward.state,{notify:false});
    this.hint.setVisible(false);
    const onClick = () => this.exit(victory ? 'victory' : 'defeat');
    if (victory) {
      services.audio.play('victory');
      if (this.encounter.id==='spark') {
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
          reward: { coins: reward.state.coins - before.coins, items: Object.fromEntries(Object.entries(reward.state.inv || {})
            .filter(([id,n])=>id!=='coins' && n>(before.inv[id]||0)).map(([id,n])=>[id,n-(before.inv[id]||0)]))
           },
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
