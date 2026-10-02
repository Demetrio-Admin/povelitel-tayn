// Минимальная шина событий без зависимости от Phaser (сцены общаются через неё).
export class EventBus {
  constructor() { this.map = new Map(); }
  on(name, fn, ctx) {
    if (!this.map.has(name)) this.map.set(name, []);
    this.map.get(name).push({ fn, ctx });
    return () => this.off(name, fn, ctx);
  }
  off(name, fn, ctx) {
    const list = this.map.get(name);
    if (!list) return;
    this.map.set(name, list.filter(l => !(l.fn === fn && (ctx === undefined || l.ctx === ctx))));
  }
  offContext(ctx) {
    for (const [k, list] of this.map) this.map.set(k, list.filter(l => l.ctx !== ctx));
  }
  emit(name, ...args) {
    const list = this.map.get(name);
    if (!list) return;
    [...list].forEach(l => l.fn.apply(l.ctx, args));
  }
}

export const bus = new EventBus();

// Имена внутренних событий шины (не путать с event keys мира).
export const MSG = {
  WORLD_EVENT: 'world:event',      // (key, payload)
  QUEST_CHANGED: 'quest:changed',
  HUD_REFRESH: 'hud:refresh',
  TOAST: 'ui:toast',               // (text, color?)
  DIALOG: 'ui:dialog',             // ({ title, text, color, buttons })
  ABILITY_USE: 'ability:use',      // (abilityId)
  CONTEXT_ACTION: 'ui:context',    // ()
  WORLD_TAP: 'world:tap',          // ({x, y}) screen coords
  UI_MODE: 'ui:mode',              // ('exploration' | 'combat' | 'modal')
  OPEN_UPGRADE: 'ui:upgrade',
  OPEN_BAG: 'ui:bag',
  REWARD: 'ui:reward',             // ({ title, granted, levelUps })
  RESEARCH_DONE: 'research:done',
  MODAL_OPEN: 'ui:modal-open',
  MODAL_CLOSED: 'ui:modal-closed',
  FOCUS_CHANGED: 'interaction:focus', // (info | null)
  COMBAT_CYCLE: 'combat:cycle',
  FINAL_SCREEN: 'ui:final',
  ZONE_CHANGED: 'world:zone',         // (zone)
  TUTORIAL: 'ui:tutorial',            // ({ id, text, target, ttl } | null)
  OPEN_PAUSE: 'ui:pause',
  // v0.8
  OPEN_JOURNAL: 'ui:journal',
  OPEN_ALCHEMY: 'ui:alchemy',
  NPC_TALK: 'npc:talk',               // (npcId) — открыть окно диалога
  NPC_TALK_END: 'npc:talk-end',       // (npcId)
  CRAFTED: 'alchemy:crafted',         // ({ recipeId, result, amount })
  GATHERED: 'gather:done',            // ({ item, amount, id })
  HERO_SAY: 'hero:say',               // (text) — реплика героини над головой
  GUIDE_HINT: 'guide:hint',           // (text | null) — мягкая подсказка под панелью цели
  GUIDE_POINTER: 'guide:pointer',     // ({ x, y, angle, dist } | null) — стрелка к цели на краю экрана
  SIDE_QUEST: 'quest:side',           // (questId, 'start' | 'ready' | 'done')
};
