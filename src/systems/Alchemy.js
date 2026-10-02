// Алхимия (v0.8): котёл в доме ведьмы. Без Phaser. Рецепт — это «ингредиенты → расходник», без шансов и уровней.
import { RECIPES, RECIPE_ORDER } from '../config/recipes.js';
import { ITEMS } from '../config/balance.progression.js';
import { MSG } from '../state/EventBus.js';

export class Alchemy {
  constructor(state, bus = null) {
    this.state = state;
    this.bus = bus;
  }

  recipes() { return RECIPE_ORDER.map(id => ({ id, ...RECIPES[id] })); }

  /** { ok, needs:[{ id, name, have, need, ok }] } */
  check(recipeId) {
    const r = RECIPES[recipeId];
    if (!r) return { ok: false, needs: [], unknown: true };
    const needs = Object.entries(r.needs).map(([id, need]) => {
      const have = this.state.item(id);
      return { id, name: ITEMS[id]?.name || id, have, need, ok: have >= need };
    });
    return { ok: needs.every(n => n.ok), needs };
  }

  /** Сколько раз рецепт можно сварить из имеющегося. */
  maxCount(recipeId) {
    const c = this.check(recipeId);
    if (c.unknown) return 0;
    return Math.min(...c.needs.map(n => Math.floor(n.have / n.need)));
  }

  /** Варит один раз. Возвращает { ok, result, amount } или { ok:false, missing }. */
  craft(recipeId) {
    const c = this.check(recipeId);
    if (!c.ok) return { ok: false, missing: c.needs.filter(n => !n.ok) };
    const r = RECIPES[recipeId];
    for (const [id, need] of Object.entries(r.needs)) this.state.removeItem(id, need);
    this.state.addItem(r.result, r.amount);
    this.state.save();
    const out = { ok: true, recipeId, result: r.result, amount: r.amount };
    this.bus?.emit(MSG.CRAFTED, out);
    this.bus?.emit(MSG.HUD_REFRESH);
    this.bus?.emit(MSG.QUEST_CHANGED);
    return out;
  }
}
