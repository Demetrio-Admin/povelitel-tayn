import { UIScene } from '../scenes/UIScene.js';
import { campaign, objective } from './campaign.js';
import { tideStatus, wandSeconds } from './episode.js';

export class HorizonUIScene extends UIScene {
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
