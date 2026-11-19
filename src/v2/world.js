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
import { campaign, saveCampaign } from './campaign.js';
import { DIALOGUE, STORY_ENCOUNTERS, claimMirraLantern, finishDialogue, huntOffers, tideStatus, upgradeWand, wandSeconds } from './episode.js';

const target = (key, label, x, y, texture, step = key) => ({
  id: 'v2_' + key, kind: 'horizon', action: key, label, x, y, texture, step, radius: 115,
});

const STORY_TARGETS = [
  target('intro', 'Мирра', 809, 4730, 'npc_mirra'),
  target('spark', 'Искроцап', 1061, 4610, 'enemy_scavenger_small'),
  target('lantern', 'Треснувший фонарь Мирры', 1056, 4558, 'lantern_02'),
  target('upgrade', 'Усилить палочку', 785, 4770, 'table_01'),
  target('frost', 'Морозун', 1112, 4422, 'enemy_frost_critter'),
  target('veda', 'Веда', 1185, 4430, 'npc_veda'),
  target('grom', 'Гром', 1260, 4280, 'npc_goran'),
  target('camp', 'Привал Грома', 1285, 4224, 'campfire_01', 'hunt'),
];

const HUNT_TARGETS = [
  target('camp-edge', 'Искроцап', 1020, 4290, 'enemy_scavenger_small', 'hunt'),
  target('pine-crossing', 'Колючник и Искроцап', 1404, 4190, 'enemy_rootling', 'hunt'),
  target('white-bridge', 'Морозун и Колючник', 1160, 4030, 'enemy_frost_critter', 'hunt'),
  target('wood-road', 'Лесной отряд', 1371, 3860, 'enemy_rootling', 'hunt'),
].map(o => ({ ...o, hunt: true }));

class CampaignTarget extends InteractiveObject {
  constructor(scene, cfg) {
    super(scene, cfg);
    this.caption = scene.add.text(cfg.x, this.markerY - 14, '', {
      fontFamily: UI.font, fontSize: UI.type.small, color: COLORS.textGold, align: 'center', stroke: '#180f16', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(DEPTH.markers).setVisible(false);
  }

  get label() {
    if (!this.cfg.hunt) return this.cfg.label;
    const offer = this.offer();
    return offer ? this.cfg.label + ' · ур. ' + offer.level : this.cfg.label;
  }

  get markerIcon() {
    if (this.cfg.hunt || ['spark', 'frost'].includes(this.cfg.action)) return 'icon_fight';
    if (this.cfg.action === 'lantern') return 'icon_gather';
    return this.cfg.action === 'upgrade' ? 'icon_fire' : 'icon_talk';
  }

  get markerColor() { return this.cfg.hunt ? COLORS.danger : COLORS.gold; }

  offer() {
    return huntOffers(campaign(), Date.now()).find(o => o.id === this.cfg.action);
  }

  requirementsMet() {
    return campaign().step === this.cfg.step && (!this.cfg.hunt || !!this.offer()?.ready);
  }

  refresh() {
    super.refresh();
    this.caption?.setVisible(this.sprite.visible).setText(this.label);
  }

  interact() { this.scene.advanceCampaign(this.cfg); }
}

export class HorizonExplorationScene extends ExplorationScene {
  worldContent() {
    const base = super.worldContent();
    const resources = base.interactives.filter(o => o.kind === 'gather');
    return { interactives: [...STORY_TARGETS, ...HUNT_TARGETS, ...resources], enemies: [] };
  }

  createObject(cfg) {
    return cfg.kind === 'horizon' ? new CampaignTarget(this, cfg) : super.createObject(cfg);
  }

  // The authored episode supplies the story beats, while the normal world still handles walking and interactions.
  scheduleStory() {}

  create() {
    this.campaignPoll = 0;
    this.storyPending = false;
    super.create();
    this.decorateHearth();
    this.scheduleCampBeat();
  }

  decorateHearth() {
    this.lantern = applyDisplaySize(this.add.image(1090, 4589, 'lantern_02'), 'lantern_02')
      .setOrigin(0.5, 1).setDepth(DEPTH.mainBase + 4589);
    this.lanternGlow = this.add.image(1090, 4511, 'fx_glow').setTint(0xffbd61).setBlendMode('ADD')
      .setDisplaySize(158, 190).setDepth(DEPTH.mainBase + 4590);
    this.flowers = [0, 1, 2].map(i => applyDisplaySize(
      this.add.image(1100 + i * 29, 4549 + i * 8, i === 1 ? 'flower_white_01' : 'flower_purple_01'),
      i === 1 ? 'flower_white_01' : 'flower_purple_01',
    ).setOrigin(0.5, 1).setDepth(DEPTH.mainBase + 4550 + i));
    this.hearthGate = this.add.image(1102, 4420, 'horizon_hearth_gate')
      .setOrigin(0.5, 1).setDisplaySize(138, 76).setDepth(DEPTH.mainBase + 4418);
    this.rug = this.add.image(852, 4746, 'rug_01').setDisplaySize(119, 70)
      .setDepth(DEPTH.path + 1);
    this.waitingFox = this.add.image(850, 4744, 'companion_fox').setOrigin(0.5, 1)
      .setDisplaySize(43, 27).setDepth(DEPTH.mainBase + 4744);
    this.cauldron = this.add.image(773, 4738, 'cauldron_01').setOrigin(0.5, 1)
      .setDisplaySize(62, 70).setDepth(DEPTH.mainBase + 4738);
    this.ember = this.add.image(1056, 4519, 'fx_glow').setDisplaySize(56, 58)
      .setTint(0xffb76f).setBlendMode('ADD').setDepth(DEPTH.mainBase + 4559);
    this.campSign = this.add.image(1337, 4229, 'signpost_01').setOrigin(0.5, 1)
      .setDisplaySize(53, 90).setDepth(DEPTH.mainBase + 4229);
    this.campGlow = this.add.image(1285, 4194, 'fx_glow').setDisplaySize(160, 130)
      .setTint(0xffad5a).setBlendMode('ADD').setDepth(DEPTH.mainBase + 4225);
    this.tweens.add({ targets: [this.campGlow, this.lanternGlow, this.ember], alpha: { from: 0.62, to: 0.95 },
      duration: 840, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
    this.steam = [0, 1, 2].map(i => {
      const puff = this.add.image(768 + i * 6, 4684, 'fx_glow').setDisplaySize(20, 18)
        .setTint(0xffe4c7).setDepth(DEPTH.mainBase + 4741);
      this.tweens.add({ targets: puff, x: puff.x + 12, y: puff.y - 31, alpha: { from: 0.5, to: 0 },
        delay: i * 400, duration: 1270, repeat: -1 });
      return puff;
    });
    this.refreshHearth();
  }

  refreshHearth() {
    if (!this.lantern) return;
    const { step, fox } = campaign();
    const lit = step === 'intro' || fox;
    const frozen = !lit;
    this.hearthGate.setTint(frozen ? 0xaddbff : 0xffedcb);
    this.waitingFox.setVisible(!fox);
    this.ember.setVisible(step === 'spark' || step === 'lantern');
    this.campSign.setVisible(step === 'grom' || step === 'hunt');
    this.campGlow.setVisible(step === 'hunt');
    for (const puff of this.steam) puff.setVisible(step === 'intro');
    this.lantern.setTint(lit ? 0xffdfaa : 0xa2cfff);
    this.lanternGlow.setVisible(lit);
    for (const flower of this.flowers) flower.setVisible(fox);
    if (fox) setCompanionPref('fox');
    this.setupCompanion();
  }

  guideTarget() {
    const { step } = campaign();
    const key = step === 'hunt' ? 'v2_camp' : 'v2_' + step;
    return this.objects.some(o => o.id === key && o.isAvailable()) ? key : null;
  }

  guideTargetPos() {
    const id = this.guideTarget();
    return id ? this.targetPos(id) : null;
  }

  onZoneLine() {} // the scripted speech belongs to the current campaign

  travelToLocation(id, at) {
    if (id === 'forest') return super.travelToLocation(id, at);
    this.toast('Дальние тропы открываются в следующих эпизодах.');
  }

  update(time, delta) {
    super.update(time, delta);
    if (campaign().step === 'hunt' && time >= this.campaignPoll) {
      this.campaignPoll = time + 950;
      for (const object of this.objects) if (object.cfg.hunt) object.refresh();
    }
  }

  advanceCampaign(cfg) {
    if (cfg.hunt) {
      const encounter = huntOffers(campaign(), Date.now()).find(o => o.id === cfg.action && o.ready);
      if (encounter) this.enterHorizonBattle(encounter);
      return;
    }
    if (DIALOGUE[cfg.action]) this.playDialogue(cfg.action);
    else if (cfg.action === 'lantern') this.pickUpLantern();
    else if (cfg.action === 'upgrade') this.upgradeWindow();
    else if (cfg.action === 'camp') this.campWindow();
    else if (STORY_ENCOUNTERS[cfg.action]) this.enterHorizonBattle(STORY_ENCOUNTERS[cfg.action]);
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
    if (step === 'intro' && line === lines.length - 1) this.grimoireRift();
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
          this.mirraVanishes();
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
    const horizon = this.add.image(1190, 4270, 'fx_glow').setTint(0xbd63de)
      .setBlendMode('ADD').setDisplaySize(116, 590).setDepth(DEPTH.markers - 2);
    const gold = this.add.image(1190, 4270, 'fx_glow').setTint(0xffcb76)
      .setBlendMode('ADD').setDisplaySize(20, 550).setDepth(DEPTH.markers - 1);
    this.tweens.add({ targets: [horizon, gold], alpha: 0, duration: 1250, onComplete: () => {
      horizon.destroy();
      gold.destroy();
    } });
    this.cameras.main.flash(550, 157, 90, 195);
    this.lanternGlow.setVisible(false);
    this.lantern.setTint(0xa2cfff);
    this.hearthGate.setTint(0xaddbff);
    this.burst(this.player.x, this.player.y - 80, COLORS.gold, 26);
    this.heroRing(0xffd471, 1050);
  }

  mirraVanishes() {
    const mirra = this.add.image(809, 4730, 'npc_mirra').setOrigin(0.5, 1)
      .setDisplaySize(84, 126).setDepth(DEPTH.markers - 2);
    this.cameras.main.shake(350, 0.006);
    this.tweens.add({ targets: mirra, x: 1110, y: 4400, alpha: 0, angle: 21, duration: 720,
      ease: 'Quad.In', onComplete: () => {
        mirra.destroy();
        this.burst(1056, 4519, COLORS.gold, 18);
        services.audio.play('quest_update');
      } });
  }

  pickUpLantern() {
    const current = campaign(), next = claimMirraLantern(current);
    if (next === current) return;
    saveCampaign(next);
    const dust = this.add.image(1056, 4519, 'fx_glow').setTint(0xffdb8d)
      .setBlendMode('ADD').setDisplaySize(70, 70).setDepth(DEPTH.markers - 1);
    this.tweens.add({ targets: dust, x: this.player.x, y: this.player.y - 64, alpha: 0, duration: 460,
      onComplete: () => { dust.destroy(); this.heroRing(COLORS.gold, 480); } });
    this.toast('65 монет · 3 Лунные травы · Расколотая страница Гримуара');
    services.audio.play('quest_update');
    this.refreshAll();
    this.refreshHearth();
  }

  scheduleCampBeat() {
    const step = campaign().step;
    if (step !== 'thaw' || this.storyPending) return;
    this.storyPending = true;
    this.time.delayedCall(650, () => {
      this.storyPending = false;
      if (!this.canAct()) { this.scheduleCampBeat(); return; }
      this.burst(1102, 4375, COLORS.gold, 30);
      this.burst(1090, 4515, COLORS.gold, 16);
      this.playDialogue('thaw');
    });
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
          this.refreshAll();
        } },
        { label: 'Закрыть', cancel: true },
      ],
    });
  }

  campWindow() {
    const ep = campaign(), { remaining, tide } = tideStatus(ep, Date.now());
    const labels = ['Искроцап', 'Морозун', 'Колючник'];
    const kills = ['spark', 'frost', 'thorn'].map((id, index) => labels[index] + ' · ' + (ep.bestiary[id] || 0)).join('\n');
    this.dialog({
      title: 'Привал Грома',
      text: 'Уровень охоты ' + ep.huntLevel + '\n' + tide.key + (remaining ? ' ' + remaining + '/' + tide.threshold : ' · ×' + tide.value)
        + '\nОсколки Огня · ' + ep.shards + '\n\nБестиарий\n' + kills,
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

  onWake(system) {
    super.onWake(system);
    this.refreshHearth();
    this.scheduleCampBeat();
    this.bus.emit(MSG.QUEST_CHANGED);
  }
}
