import Phaser from 'phaser';
import { ExplorationScene } from '../scenes/ExplorationScene.js';
import { InteractiveObject, applyDisplaySize } from '../objects/InteractiveObject.js';
import { setCompanionPref } from '../objects/Companion.js';
import { COLORS, DEPTH } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { CORE } from '../config/horizon/rules.js';
import { PREVIEW_CORE } from '../config/horizon/previewTuning.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { campaign, saveCampaign, completeActStep, objective } from './campaign.js';
import { ensureLocationWithScreen } from '../systems/assetPacks.js';
import { findPath } from '../world/nav.js';
import { CITY_LAYOUT_VERSION } from '../config/city.plan.js';
import { BOR, TOWN, TOWN_WEST_PASSAGE, actLocation, actLocationAt, arrivalFor, borMap, crossesTownWall } from './regions.js';
import { QUEST_BY_ID } from './quests.js';
import { dailyElite, questStep, plannedEncounter, townOpen } from './actProgress.js';
import { actsTargets, actsTargetAvailable, runtimeEncounter, regionForPoint, canUsePortal,
  installActPresentation, refreshActPresentation, claimWorldAction, pollField } from './actWorld.js';
import { HEARTH, GATE, WORKBENCH, LANTERN, FROST, FOX, CAMPFIRE, HearthPresentation, gateClosed, hearthArrival, hearthMap } from './hearth.js';
import { DIALOGUE, MIRRA_NOTE, STORY_ENCOUNTERS, claimMirraLantern, finishDialogue, huntOffers, restoreWorkbench, tideStatus, upgradeWand, wandSeconds } from './episode.js';

const MIRRA = { x: 561, y: 680 };
const target = (key, label, { x, y }, texture, step = key, options = {}) => ({
  id: 'v2_' + key, kind: 'horizon', action: key, label, x, y, texture, step, radius: 97, ...options,
});
const interactWithProp = { ghost: { w: 110, h: 72 } };
const workbenchTarget = { ...interactWithProp, approach: { x: WORKBENCH.x, y: WORKBENCH.y + 50 } };

const STORY_TARGETS = [
  target('intro', 'Мирра', MIRRA, 'npc_mirra'),
  target('spark', 'Искроцап', { x: 889, y: 794 }, 'enemy_scavenger_small'),
  target('lantern', 'Треснувший фонарь', LANTERN, 'lantern_02', 'lantern', { size: [34, 57] }),
  target('upgrade', 'Верстак Мирры', WORKBENCH, null, 'upgrade', workbenchTarget),
  target('frost', 'Морозун', FROST, 'enemy_frost_critter'),
  target('thaw', 'Открыть калитку', { x: GATE.x, y: GATE.y - 20 }, null, 'thaw', interactWithProp),
  target('veda', 'Веда', { x: 773, y: 977 }, 'npc_veda', 'veda', { resident: true }),
  target('grom', 'Гром', { x: 1167, y: 1069 }, 'npc_goran', 'grom', { resident: true }),
  target('workbench', 'Отогреть верстак', WORKBENCH, null, 'hunt', workbenchTarget),
  target('camp', 'Привал Грома', CAMPFIRE, null, 'hunt', interactWithProp),
];

const HUNT_TARGETS = [
  target('camp-edge', 'Искроцап', { x: 1468, y: 1045 }, 'enemy_scavenger_small', 'hunt'),
  target('pine-crossing', 'Колючник и Искроцап', { x: 1287, y: 790 }, 'enemy_rootling', 'hunt'),
  target('white-bridge', 'Морозун и Колючник', { x: 1454, y: 570 }, 'enemy_frost_critter', 'hunt'),
  target('wood-road', 'Лесной отряд', { x: 1690, y: 857 }, 'enemy_rootling', 'hunt'),
].map(o => ({ ...o, hunt: true }));

class CampaignTarget extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    if (cfg.size) { this.sprite.setDisplaySize(...cfg.size); this.baseScale = { x: this.sprite.scaleX, y: this.sprite.scaleY }; }
    else if (cfg.texture?.startsWith('npc_')) {
      const size=120/this.sprite.displayHeight;
      this.sprite.setScale(this.sprite.scaleX*size,this.sprite.scaleY*size);
      this.baseScale={x:this.sprite.scaleX,y:this.sprite.scaleY};
    }
    if (cfg.action === 'workbench') this.ability = 'fire';
    if (cfg.gift) this.ability=cfg.gift;
    this.caption = scene.add.text(cfg.x, this.markerY - 14, '', {
      fontFamily: UI.font, fontSize: UI.type.small, color: COLORS.textGold, align: 'center', stroke: '#180f16', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(DEPTH.markers).setVisible(false);
  }

  get label() {
    if (this.cfg.field) {
      const encounter=runtimeEncounter(campaign(),this.cfg);
      return encounter ? encounter.name+' · '+encounter.level : this.cfg.label;
    }
    if (!this.cfg.hunt) return this.cfg.label;
    const offer = this.offer();
    return offer ? this.cfg.label + ' · ур. ' + offer.level : this.cfg.label;
  }

  get markerIcon() {
    if (this.cfg.field || this.cfg.pack || this.cfg.hunt || ['spark', 'frost'].includes(this.cfg.action)) return 'icon_fight';
    if (this.cfg.action === 'lantern' || this.cfg.gatherTier) return 'icon_gather';
    if (this.cfg.gift) return 'icon_'+this.cfg.gift;
    if (this.cfg.portal) return 'icon_hand';
    if (this.cfg.action === 'thaw') return 'icon_hand';
    return ['upgrade', 'workbench'].includes(this.cfg.action) ? 'icon_fire' : 'icon_talk';
  }

  get markerColor() { return this.cfg.hunt || this.cfg.field || this.cfg.pack ? COLORS.danger : COLORS.gold; }

  offer() {
    return huntOffers(campaign(), Date.now()).find(o => o.id === this.cfg.action);
  }

  requirementsMet() {
    const p=campaign(), { step, workbenchRestored } = p;
    if (!this.cfg.step) return actsTargetAvailable(p,this.cfg);
    if (step !== this.cfg.step) return false;
    if (this.cfg.action === 'workbench') return !workbenchRestored;
    return !this.cfg.hunt || !!this.offer()?.ready;
  }

  refresh() {
    super.refresh();
    if (this.cfg.resident) this.sprite.setVisible(true);
    if (this.cfg.field && this.sprite.visible) {
      const texture=runtimeEncounter(campaign(),this.cfg)?.enemies[0].texture;
      if (texture && this.sprite.texture.key!==texture && this.scene.textures.exists(texture)) {
        applyDisplaySize(this.sprite.setTexture(texture),texture);
        this.baseScale={x:this.sprite.scaleX,y:this.sprite.scaleY};
      }
    }
    this.caption?.setVisible(this.isAvailable() && !this.cfg.gatherTier && !this.cfg.field && !this.cfg.portal)
      .setText(this.label).setY(this.markerY-14);
  }

  interact(ability) { this.scene.advanceCampaign(this.cfg, ability); }
}

export class HorizonExplorationScene extends ExplorationScene {
  locationFor(p) { return actLocationAt(p) || HEARTH; }
  mapForLocation() {
    if (this.loc===HEARTH) return hearthMap();
    if (this.loc===BOR) return borMap();
    return super.mapForLocation();
  }
  fixStartPosition(p) { return this.locationFor(p)===HEARTH ? hearthArrival(p,campaign().step) : p; }
  worldContent() { return { interactives:[...STORY_TARGETS,...HUNT_TARGETS,...actsTargets()],enemies:[] }; }
  buildGround() {
    if (![HEARTH,BOR].includes(this.loc)) { super.buildGround(); return; }
    const {x,y,w,h}=this.loc.rect;
    this.add.image(x,y,this.loc===HEARTH?'horizon_hearth_yard':'horizon_amberwood').setOrigin(0)
      .setDisplaySize(w,h).setDepth(DEPTH.ground);
  }

  createObject(cfg) {
    return cfg.kind === 'horizon' ? new CampaignTarget(this, cfg) : super.createObject(cfg);
  }

  scheduleStory() {}
  migrateV10() {}
  updateZone() {}
  refreshAll() {
    super.refreshAll();
    if (this.questDecor) refreshActPresentation(this);
  }
  canAct() { return !this.storyPending && super.canAct(); }

  create() {
    this.campaignPoll = 0;
    this.storyPending = false;
    this.trackedHunt = null;
    this.hearth=null;
    this.questDecor=null;
    this.questBattle=null;
    super.create();
    if (this.loc===HEARTH) {
      this.hearth=new HearthPresentation(this);
      this.refreshHearth();
    }
    installActPresentation(this);
    pollField(this);
  }

  setupCompanion() {
    if (!gateClosed(campaign().step)) super.setupCompanion();
  }

  refreshHearth(frozen) {
    this.hearth?.refresh(campaign(), frozen);
    this.setupCompanion();
  }

  guideTarget() {
    const { step, workbenchRestored }=campaign();
    const available=id=>this.objects.some(o=>o.id===id&&o.isAvailable());
    if (this.trackedHunt && available(this.trackedHunt)) return this.trackedHunt;
    if (this.loc===HEARTH && step!=='hunt') return available('v2_'+step)?'v2_'+step:null;
    if (this.loc===HEARTH && !workbenchRestored) return 'v2_workbench';
    const goal=objective();
    if (available(goal.id)) return goal.id;
    const dest=goal.where && regionForPoint(goal.where);
    if (dest===this.loc.id) return null;
    const portals=this.objects.filter(o=>o.cfg.portal&&o.isAvailable());
    const target = portals.find(o=>o.cfg.to===dest)
      || (this.loc===HEARTH && portals.find(o=>o.cfg.to===BOR.id))
      || (this.loc===BOR && portals.find(o=>o.cfg.to==='city'&&townOpen(campaign())))
      || (this.loc.interior && portals.find(o=>o.cfg.to==='city'));
    return target?.id || null;
  }

  guideTargetPos() {
    const id = this.guideTarget();
    const target=id ? this.targetPos(id) : null;
    if (target && this.loc===TOWN && crossesTownWall(this.player,target)) {
      const side=target.x<TOWN_WEST_PASSAGE.x?-1:1;
      return {...TOWN_WEST_PASSAGE,x:TOWN_WEST_PASSAGE.x+side*96};
    }
    return target;
  }

  planPath(x,y) {
    const goal={x,y};
    if (this.loc!==TOWN || !crossesTownWall(this.player,goal)) return super.planPath(x,y);
    // The laboratory is outside the west wall. Split the walk at the town gate
    // so the long detour stays within the local pathfinder's search budget.
    const grids=this.navGrids();
    const toGate=findPath(grids,this.player,TOWN_WEST_PASSAGE);
    const fromGate=toGate?.complete && findPath(grids,TOWN_WEST_PASSAGE,goal);
    if (!fromGate) return super.planPath(x,y);
    return {...fromGate,points:[...toGate.points,...fromGate.points]};
  }

  onZoneLine() {} // the scripted speech belongs to the current campaign

  travelToLocation(id, at) {
    const loc=actLocation(id);
    if (!loc || !this.canAct() || this.inTransition || loc.id===this.loc.id) return;
    this.inTransition=true;
    services.mode='transition';
    this.player.stop();
    this.interaction.clearFocus();
    const cam=this.cameras.main;
    cam.fadeOut(260,0,0,0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,async()=>{
      if (loc.id!==BOR.id && loc.id!==HEARTH.id) await ensureLocationWithScreen(this,loc);
      const position=at || arrivalFor(id), state=services.state;
      // Use the painted city coordinates directly when arriving from the new forest.
      state.setObject('city_layout',{version:CITY_LAYOUT_VERSION});
      state.data.player={...position};
      state.data.safePoint={...position};
      state.save();
      this.scene.restart();
    });
  }

  onAbility(id) {
    const target=this.interaction.focus;
    if (this.canAct() && target instanceof CampaignTarget && target.cfg.gift) {
      target.interact(id);
      return;
    }
    super.onAbility(id);
  }

  update(time, delta) {
    super.update(time, delta);
    if (campaign().step === 'hunt' && time >= this.campaignPoll) {
      this.campaignPoll = time + 950;
      for (const object of this.objects) if (object.cfg.hunt) object.refresh();
      pollField(this);
    }
  }

  advanceCampaign(cfg, ability) {
    if (!this.canAct()) return;
    if (cfg.portal) {
      if (canUsePortal(campaign(),cfg)) this.travelToLocation(cfg.to,cfg.at);
      else this.toast(cfg.lock==='town'?'Тракт откроется после Древогляда или на 21-м уровне охоты.':'Проход пока закрыт.');
      return;
    }
    if (cfg.quest) { this.actQuest(cfg,ability); return; }
    if (cfg.elite) {
      const encounter=dailyElite(campaign(),cfg.elite,Date.now());
      if (encounter) this.enterHorizonBattle(encounter);
      return;
    }
    if (cfg.field) {
      const encounter=runtimeEncounter(campaign(),cfg);
      if (encounter) { this.trackedHunt=null; this.enterHorizonBattle(encounter); }
      return;
    }
    if (cfg.gatherTier || cfg.anomaly) { claimWorldAction(this,cfg,ability); return; }
    if (cfg.service) { this.scene.get('UIScene').openActService(cfg.service); return; }
    if (cfg.hunt) {
      const encounter = huntOffers(campaign(), Date.now()).find(o => o.id === cfg.action && o.ready);
      if (encounter) { this.trackedHunt = null; this.enterHorizonBattle(encounter); }
      return;
    }
    if (cfg.action === 'thaw') this.openGate();
    else if (DIALOGUE[cfg.action]) this.playDialogue(cfg.action);
    else if (cfg.action === 'lantern') this.pickUpLantern();
    else if (cfg.action === 'upgrade') this.upgradeWindow();
    else if (cfg.action === 'camp') this.campWindow();
    else if (cfg.action === 'workbench') {
      if (ability === 'fire') this.workbenchWindow(cfg);
      else this.heroSay('Примени Огонь к верстаку.');
    }
    else if (STORY_ENCOUNTERS[cfg.action]) this.enterHorizonBattle(STORY_ENCOUNTERS[cfg.action]);
  }

  actQuest(cfg,ability) {
    const p=campaign(), quest=QUEST_BY_ID[cfg.quest], step=questStep(p,quest);
    if (!step || step.index!==cfg.index) return;
    if (step.pack) {
      const encounter=plannedEncounter(p,quest,step);
      const start=()=>{ this.questBattle=step; this.enterHorizonBattle(encounter); };
      if (step.intro) this.showActDialogue(step.intro,quest.title,start,'Вступить в бой');
      else start();
      return;
    }
    if (step.gift && (ability && ability!==step.gift || !p.gifts[step.gift])) {
      this.toast('Нужен дар «'+services.abilities.label(step.gift)+'».');
      return;
    }
    if (step.cost) {
      this.showActDialogue(step.after,quest.title,()=>this.finishActAction(cfg),'Помочь');
      return;
    }
    if (this.finishActAction(cfg) && step.after) this.showActDialogue(step.after,quest.title);
  }

  finishActAction(cfg) {
    const before=campaign(), quest=QUEST_BY_ID[cfg.quest];
    const {next,error}=completeActStep(before,quest,cfg.index);
    if (error) { this.toast(error); return false; }
    saveCampaign(next);
    if (cfg.gift) this.castFx(cfg.x,cfg.y-36,COLORS[cfg.gift] || COLORS.gold);
    else this.burst(cfg.x,cfg.y-40,COLORS.gold,16);
    if (before.activeCompanion!==next.activeCompanion) {
      setCompanionPref(next.activeCompanion);
      this.setupCompanion();
    }
    this.refreshAll();
    if (next.tasks[quest.id]>=quest.steps.length) this.toast('Задание выполнено · '+quest.title);
    return true;
  }

  showActDialogue(line,fallback,onClick,label='Дальше') {
    const parts=line.split('\n');
    this.dialog({title:parts.length>1?parts.shift():fallback,text:parts.join('\n'),
      buttons:[{label,primary:true,onClick}]});
  }

  playDialogue(step, line = 0) {
    if (campaign().step !== step) return;
    this.player.stop();
    const lines = DIALOGUE[step];
    const [speaker, text] = lines[line];
    if (step === 'intro' && line === 0) {
      this.heroRing(0xffd384, 660);
      services.audio.play('quest_update');
    }
    this.dialog({
      title: speaker, text,
      buttons: [{ label: step === 'grom' && line === lines.length - 1 ? 'Открыть охоту' : 'Дальше', primary: true, onClick: () => {
        if (line + 1 < lines.length) {
          this.playDialogue(step, line + 1);
          return;
        }
        saveCampaign(finishDialogue(campaign()));
        this.refreshAll();
        this.refreshHearth();
        if (step === 'intro') {
          this.grimoireRift();
          this.heroSay('Отгони Искроцапа от фонаря!');
        }
      } }],
    });
  }

  heroRing(color, duration) {
    const ring = this.add.image(this.player.x, this.player.y - 46, 'fx_ring').setDisplaySize(83, 83)
      .setTint(color).setBlendMode('ADD').setDepth(DEPTH.markers - 1);
    this.tweens.add({ targets: ring, displayWidth: 205, displayHeight: 205, alpha: 0, duration,
      onComplete: () => ring.destroy() });
  }

  grimoireRift() {
    const mirra = this.add.image(MIRRA.x, MIRRA.y, 'npc_mirra').setOrigin(0.5, 1)
      .setDisplaySize(84, 126).setDepth(DEPTH.mainBase + MIRRA.y + 1);
    this.burst(MIRRA.x, MIRRA.y - 57, 0xcc9df0, 26);
    this.heroRing(0xfed17c, 930);
    const ray=this.add.image(966,264,'fx_glow').setDisplaySize(151,730).setTint(0xc080ff)
      .setBlendMode('ADD').setAlpha(.8).setDepth(DEPTH.fx);
    const shield=this.add.image(this.player.x,this.player.y-52,'fx_ring').setDisplaySize(156,166)
      .setTint(0xffd58a).setBlendMode('ADD').setDepth(DEPTH.fx+1);
    this.tweens.add({targets:[ray,shield],alpha:0,duration:880,onComplete:()=>{ray.destroy();shield.destroy();}});
    this.tweens.add({ targets: mirra, y: mirra.y - 36, alpha: 0, duration: 630, ease: 'Quad.In',
      onComplete: () => { mirra.destroy(); this.sparkleShower(LANTERN.x, LANTERN.y - 20, COLORS.gold); } });
    services.audio.play('quest_update');
  }

  showFrostAttack() {
    this.storyPending = true;
    this.player.stop();
    this.refreshAll();
    this.refreshHearth(false);
    const source = this.objects.find(o => o.id === 'v2_frost').sprite;
    const jumpFrom = { x: FROST.x + 28, y: GATE.y + 72 };
    source.setPosition(jumpFrom.x, jumpFrom.y).setFlipX(true)
      .setDepth(DEPTH.mainBase + jumpFrom.y);
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(GATE.x + 72, GATE.y - 140, 610, Phaser.Math.Easing.Sine.InOut);
    this.tweens.addCounter({ from: 0, to: 1, delay: 130, duration: 450, onUpdate: tween => {
      const t = tween.getValue();
      const y = Phaser.Math.Linear(jumpFrom.y, FROST.y, t);
      source.setPosition(Phaser.Math.Linear(jumpFrom.x, FROST.x, t), y - 272 * t * (1 - t))
        .setDepth(DEPTH.mainBase + Math.max(y, GATE.y + 4));
    }, onComplete: () => {
      source.setPosition(FROST.x, FROST.y).setDepth(DEPTH.mainBase + FROST.y);
      this.burst(source.x, source.y - 46, COLORS.ice, 13);
      for (let i = 0; i < 7; i++) {
        const mote = this.add.image(source.x - 12, source.y - 40 + i * 4, 'fx_dot')
          .setTint(i % 2 ? 0xa9f5ff : 0xdffaff).setScale(0.45 + i * 0.08).setBlendMode('ADD').setDepth(DEPTH.fx);
        this.tweens.add({ targets: mote, x: GATE.x - 38 + i * 12, y: GATE.y - 54 + i * 3,
          delay: i * 29, duration: 380, ease: 'Quad.In', onComplete: () => mote.destroy() });
      }
      this.time.delayedCall(370, () => {
        this.refreshHearth(true);
        this.burst(GATE.x, GATE.y - 49, COLORS.ice, 32);
      });
    } });
    this.time.delayedCall(1550, () => {
      this.storyPending = false;
      this.follow();
    });
  }

  meltGate() {
    this.storyPending = true;
    this.burst(GATE.x, GATE.y - 47, COLORS.ice, 26);
    this.hearth.frostMist.stop();
    this.tweens.add({ targets: [this.hearth.ice, this.hearth.frostLight], alpha: 0, duration: 800,
      onComplete: () => { this.refreshHearth(); this.storyPending = false; } });
  }

  openGate() {
    const before = campaign();
    if (before.step !== 'thaw') return;
    const fox = this.hearth.fox;
    this.storyPending = true;
    this.player.stop();
    this.hearth.gate.setVisible(false);
    for (const leaf of this.hearth.openLeaves) leaf.setVisible(true);
    services.audio.play('ui_click');
    this.tweens.add({ targets: fox, y: GATE.y - 53, x: GATE.x - 9, duration: 440, ease: 'Sine.InOut',
      onUpdate: () => fox.setDepth(DEPTH.mainBase + fox.y),
      onComplete: () => {
        saveCampaign(finishDialogue(before));
        setCompanionPref('fox');
        this.storyPending = false;
        this.refreshAll();
        this.refreshHearth();
        this.burst(FOX.x, GATE.y - 62, COLORS.gold, 15);
        this.heroSay('Рыжик теперь с тобой. В бою он помогает, когда заполнится Отклик.');
      } });
  }

  pickUpLantern() {
    const current = campaign(), next = claimMirraLantern(current);
    if (next === current) return;
    saveCampaign(next);
    const dust = this.add.image(LANTERN.x, LANTERN.y - 45, 'fx_glow').setTint(0xffdb8d)
      .setBlendMode('ADD').setDisplaySize(70, 70).setDepth(DEPTH.markers - 1);
    this.tweens.add({ targets: dust, x: this.player.x, y: this.player.y - 64, alpha: 0, duration: 460,
      onComplete: () => { dust.destroy(); this.heroRing(COLORS.gold, 480); } });
    this.toast('65 монет · 3 Лунные травы · Расколотая страница Гримуара');
    services.audio.play('quest_update');
    this.refreshAll();
    this.refreshHearth();
  }

  upgradeWindow() {
    const { act1_first_wand_coins: coins, act1_first_wand_herbs: herbs } = CORE;
    const rank = PREVIEW_CORE.episode_wand_rank_step;
    this.dialog({
      title: 'Искра в палочке',
      text: 'Влей лунную пыль в палочку — она станет быстрее и ярче.\n\nТемп выстрелов изменится с ' + wandSeconds(0) + ' до ' + wandSeconds(rank) + ' с.\n\nЦена — ' + coins + ' монет и ' + herbs + ' Лунные травы.',
      buttons: [
        { label: 'Усилить палочку', primary: true, onClick: () => {
          const before = campaign();
          const next = upgradeWand(before);
          if (next === before) { this.toast('Не хватает трав или монет'); return; }
          saveCampaign(next);
          this.burst(this.player.x, this.player.y - 60, COLORS.gold, 30);
          this.heroRing(0x80f0de, 820);
          services.audio.play('quest_update');
          this.showFrostAttack();
        } },
        { label: 'Закрыть', cancel: true },
      ],
    });
  }

  workbenchWindow(cfg) {
    this.castFx(cfg.x, cfg.y - 48, COLORS.fire);
    this.dialog({ title: 'Записка Мирры', text: MIRRA_NOTE, buttons: [
      { label: 'Прочитать записку', primary: true, onClick: () => {
        const current = campaign(), next = restoreWorkbench(current);
        if (next === current) return;
        saveCampaign(next);
        this.burst(cfg.x, cfg.y - 47, 0xffe5ac, 26);
        this.burst(WORKBENCH.x + 13, WORKBENCH.y + 27, 0xffc974, 20);
        this.refreshAll();
        this.refreshHearth();
        this.toast('50 монет · 3 Лунные травы');
        services.audio.play('quest_update');
      } },
    ] });
  }

  campWindow() {
    const ep = campaign(), { remaining, tide } = tideStatus(ep, Date.now());
    const labels = ['Искроцап', 'Морозун', 'Колючник'];
    const kills = ['spark', 'frost', 'thorn'].map((id, index) => labels[index] + ' · ' + (ep.bestiary[id] || 0)).join('\n');
    const offer = huntOffers(ep, Date.now()).find(o => o.ready);
    this.dialog({
      title: 'Привал Грома',
      text: 'Уровень охоты ' + ep.huntLevel + '\n' + tide.key + (remaining ? ' ' + remaining + '/' + tide.threshold : ' · ×' + tide.value)
        + '\nОсколки Огня · ' + ep.shards + '\n\nБестиарий\n' + kills,
      buttons: offer ? [
        { label: 'Выследить', primary: true, onClick: () => {
          this.trackedHunt = 'v2_' + offer.id;
          this.heroSay('Иди по тропе к отряду.');
        } },
        { label: 'Закрыть', cancel: true },
      ] : undefined,
    });
  }

  enterHorizonBattle(encounter) {
    if (!this.canAct() || this.inTransition) return;
    this.inTransition = true;
    services.mode = 'transition';
    this.player.stop();
    this.interaction.clearFocus();
    this.savePosition();
    services.audio.play('combat_start');
    const cam = this.cameras.main;
    cam.fadeOut(360, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.sleep();
      this.scene.run('CombatScene', { encounter });
      this.scene.bringToTop('UIScene');
    });
  }

  onWake(system, data) {
    super.onWake(system, data);
    if (campaign().step === 'thaw' && this.hearth?.frozen) this.meltGate();
    else this.refreshHearth();
    if (data?.result==='victory' && this.questBattle?.after) {
      this.time.delayedCall(450,()=>{ if(this.canAct()) this.showActDialogue(this.questBattle.after,'После боя'); });
    }
    this.bus.emit(MSG.QUEST_CHANGED);
  }
}
