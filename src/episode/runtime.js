// Связка эпизода с игрой: изолированное хранилище, прогресс, разговоры. Один экземпляр на страницу.
import { DialogueSystem } from '../systems/DialogueSystem.js';
import { MSG } from '../state/EventBus.js';
import { ITEMS } from '../config/balance.progression.js';
import { services } from '../services.js';
import { EPISODE_DIALOGUES } from './dialogues.js';
import { readProgress, writeProgress, advance, goalLine, stepDef, fireControl } from './model/story.js';

export { PREFIX, isolatedStorage } from './model/storage.js';

export const episode = {
  ep: null,
  listeners: new Set(),
  load() { this.ep = readProgress(services.state); return this.ep; },
  save() { writeProgress(services.state, this.ep); this.changed(); },
  changed() { for (const f of this.listeners) f(this.ep); services.bus.emit(MSG.QUEST_CHANGED); services.bus.emit(MSG.HUD_REFRESH); },
  on(f) { this.listeners.add(f); return () => this.listeners.delete(f); },
  get step() { return this.ep?.step; },
  advance(from) { if (advance(this.ep, from)) { this.save(); return true; } return false; },
  goal() {
    const names = Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.name]));
    names.tree_resin = 'смола'; names.moon_herb = 'лунная трава'; names.frost_shard = 'осколок льда';
    return goalLine(this.ep, services.state.data.inventory, names);
  },
  why() { return stepDef(this.ep.step).why || ''; },
  control() { return fireControl(this.ep); },
  note(flag) { if (!this.ep.found.includes(flag)) { this.ep.found.push(flag); return true; } return false; },
  give(items) {
    const inv = services.state.data.inventory;
    for (const [id, n] of Object.entries(items)) inv[id] = (inv[id] || 0) + n;
  },
  take(items) {
    const inv = services.state.data.inventory;
    for (const [id, n] of Object.entries(items)) inv[id] = Math.max(0, (inv[id] || 0) - n);
  },
};

/** Разговоры эпизода: те же окна и формат, другие реплики и эффекты. */
export class EpisodeDialogue extends DialogueSystem {
  context() {
    return { ...super.context(), step: episode.ep?.step, ep: episode.ep || {} };
  }
  pick(npcId) {
    const list = EPISODE_DIALOGUES[npcId];
    if (!list) return null;
    const c = this.context();
    return list.find(v => v.when(c)) || null;
  }
  runEffects(list) {
    if (!list) return;
    const rest = [];
    let touched = false;
    for (const e of list) {
      if (e.advance) { advance(episode.ep, e.advance); touched = true; }
      if (e.give) { episode.give(e.give); touched = true; this.bus?.emit(MSG.TOAST, `Получено: ${Object.entries(e.give).map(([id, n]) => `${ITEMS[id]?.name || id} ×${n}`).join(', ')}`, 0xffc46b); }
      if (e.found) { episode.note(e.found); touched = true; }
      if (e.lesson) { episode.ep.lesson = true; touched = true; }
      if (!e.advance && !e.give && !e.found && !e.lesson) rest.push(e);
    }
    if (touched) episode.save();
    super.runEffects(rest);
  }
}

export function installEpisodeServices() {
  services.dialogue = new EpisodeDialogue({ state: services.state, log: services.log, bus: services.bus, goalText: () => episode.goal() });
  episode.load();
}
