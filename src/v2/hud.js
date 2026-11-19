import { UIScene } from '../scenes/UIScene.js';
import { VIEW } from '../config/game.config.js';
import { UI } from '../config/ui.config.js';
import { campaign, objective } from './campaign.js';
import { tideStatus, wandSeconds } from './episode.js';

export class HorizonUIScene extends UIScene {
  create() {
    super.create();
    this.tideLabel = this.add.text(VIEW.width / 2, 124, '', {
      fontFamily: UI.font, fontSize: UI.type.small, color: '#ffeeac', backgroundColor: '#2c2049',
      padding: { x: 14, y: 5 }, stroke: '#211625', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(5800).setVisible(false);
    this.viewport?.assign(this.tideLabel, 'top');
  }

  update(time, delta) {
    super.update(time, delta);
    const ep = campaign(), visible = this.mode === 'exploration' && ep.step === 'hunt' && !this.modal;
    this.tideLabel?.setVisible(visible);
    if (!visible) return;
    const { remaining, tide } = tideStatus(ep, Date.now());
    this.tideLabel.setText(remaining ? tide.key + ' ' + remaining + '/' + tide.threshold : tide.key + ' · ×' + tide.value);
  }

  openJournal() {
    const current = objective(), ep = campaign();
    const { remaining, tide } = tideStatus(ep, Date.now());
    const lines = [current.text, 'Темп палочки · ' + wandSeconds(ep.wandRank) + ' с'];
    if (ep.storyPage) lines.push('Найдена страница Гримуара.');
    if (ep.step === 'hunt') lines.push('Уровень охоты ' + ep.huntLevel,
      remaining ? tide.key + ' ' + remaining + '/' + tide.threshold : tide.key,
      'Осколки Огня · ' + ep.shards);
    this.openModal({ title: current.title, text: lines.join('\n\n') });
  }
}
