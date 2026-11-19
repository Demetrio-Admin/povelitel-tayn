import Phaser from 'phaser';
import { ExplorationScene } from '../scenes/ExplorationScene.js';
import { InteractiveObject, applyDisplaySize } from '../objects/InteractiveObject.js';
import { setCompanionPref } from '../objects/Companion.js';
import { COLORS, DEPTH } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { CORE } from '../config/horizon/rules.js';
import { MSG } from '../state/EventBus.js';
import { services } from '../services.js';
import { campaign, saveCampaign } from './campaign.js';
import { DIALOGUE, STORY_ENCOUNTERS, finishDialogue, huntOffers, tideStatus, upgradeWand, wandSeconds } from './episode.js';

const target = (key, label, x, y, texture, step = key) => ({
  id: 'v2_' + key, kind: 'horizon', action: key, label, x, y, texture, step, radius: 115,
});

const STORY_TARGETS = [
  target('intro', 'Мирра', 809, 4730, 'npc_mirra'),
  target('spark', 'Искроцап', 1061, 4610, 'enemy_scavenger_small'),
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
    this.refreshHearth();
  }

  refreshHearth() {
    if (!this.lantern) return;
    const { step, fox } = campaign();
    const lit = step === 'intro' || fox;
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
    else if (cfg.action === 'upgrade') this.upgradeWindow();
    else if (cfg.action === 'camp') this.campWindow();
    else if (STORY_ENCOUNTERS[cfg.action]) this.enterHorizonBattle(STORY_ENCOUNTERS[cfg.action]);
  }

  playDialogue(step, line = 0) {
    if (campaign().step !== step) return;
    this.player.stop();
    const lines = DIALOGUE[step];
    const [speaker, text] = lines[line];
    if (step === 'intro' && line === lines.length - 1) this.cameras.main.flash(550, 157, 90, 195);
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
          this.cameras.main.shake(350, 0.006);
          this.heroSay('Фонарь Мирры упал у тропы.');
        }
      } }],
    });
  }

  scheduleCampBeat() {
    const step = campaign().step;
    if (step !== 'thaw' || this.storyPending) return;
    this.storyPending = true;
    this.time.delayedCall(650, () => {
      this.storyPending = false;
      if (!this.canAct()) { this.scheduleCampBeat(); return; }
      this.burst(1090, 4515, COLORS.gold, 30);
      this.playDialogue('thaw');
    });
  }

  upgradeWindow() {
    const { act1_first_wand_coins: coins, act1_first_wand_herbs: herbs, episode_wand_rank_step: rank } = CORE;
    this.dialog({
      title: 'Искра в палочке',
      text: 'Влей лунную пыль в палочку. Темп выстрелов изменится с ' + wandSeconds(0) + ' до ' + wandSeconds(rank) + ' с.\n\nЦена — ' + coins + ' монет и ' + herbs + ' Лунные травы.',
      buttons: [
        { label: 'Усилить', primary: true, onClick: () => {
          const before = campaign();
          const next = upgradeWand(before);
          if (next === before) { this.toast('Не хватает трав или монет'); return; }
          saveCampaign(next);
          this.burst(this.player.x, this.player.y - 60, COLORS.gold, 30);
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
