// Алхимия (v0.8): котёл в доме ведьмы. Без Phaser. Рецепт — это «ингредиенты → расходник», без шансов и уровней.
// v0.10.0: шесть рецептов (три сюжетных). Изготовление — атомарная операция (services.actions.craft → player_action
// { op: 'craft' }); здесь — только проверки для окна котла и журнала (ничего не меняют).
import { RECIPES, RECIPE_ORDER } from '../config/recipes.js';
import { ITEMS } from '../config/balance.progression.js';

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

  /**
   * Состояние рецепта для окна котла (те же условия, что у операции сервера):
   *   'locked'  — сюжетный рецепт ещё неизвестен (нет событий requires): показать, откуда придёт знание;
   *   'have'    — сюжетный предмет уже изготовлен и лежит в сумке (применить);   'used' — задача выполнена;
   *   'ready'   — можно варить;   'missing' — не хватает ингредиентов.
   */
  status(recipeId) {
    const r = RECIPES[recipeId];
    if (!r) return { state: 'unknown', chk: { ok: false, needs: [] } };
    const chk = this.check(recipeId);
    const has = (ev) => this.state.hasEvent(ev);
    if ((r.requires || []).some(ev => !has(ev))) return { state: 'locked', chk };
    if ((r.blockedBy || []).some(has)) return { state: this.state.item(r.result) > 0 ? 'have' : 'used', chk };
    return { state: chk.ok ? 'ready' : 'missing', chk };
  }

  /** Нехватка для рецепта: [{ id, name, have, need }] (пусто — хватает). */
  missing(recipeId) { return this.check(recipeId).needs.filter(n => !n.ok); }
}
