// Чистая логика редактора карты: история правок, выбор объекта под курсором, сетка, новые id.

/** Стек отмены/повтора. Операция: { label, undo(), redo() }; redo() вызывается при push не нужен — действие уже сделано. */
export class History {
  constructor(limit = 200) { this.limit = limit; this.undoStack = []; this.redoStack = []; this.collector = null; }
  push(op) {
    if (this.collector) { this.collector.push(op); return op; }   // внутри группы: станет частью одного шага
    this.undoStack.push(op); if (this.undoStack.length > this.limit) this.undoStack.shift(); this.redoStack.length = 0; return op;
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack.at(-1)?.label || ''; }
  get redoLabel() { return this.redoStack.at(-1)?.label || ''; }
  undo() { const op = this.undoStack.pop(); if (!op) return null; op.undo(); this.redoStack.push(op); return op; }
  redo() { const op = this.redoStack.pop(); if (!op) return null; op.redo(); this.undoStack.push(op); return op; }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; }
  /** Начать группу: всё, что попадёт в историю до end(), отменяется и повторяется одним шагом. Группы вкладываются. */
  begin() { const token = { ops: [], prev: this.collector }; this.collector = token.ops; return token; }
  /** Закончить группу. after.undo / after.redo вызываются после отмены / повтора всей группы (например, вернуть выбор). */
  end(token, label, after = {}) {
    this.collector = token.prev;
    const ops = token.ops;
    if (!ops.length) return null;
    return this.push({
      label,
      undo: () => { for (let i = ops.length - 1; i >= 0; i--) ops[i].undo(); after.undo?.(); },
      redo: () => { for (const op of ops) op.redo(); after.redo?.(); },
    });
  }
}

/**
 * Объект под точкой. entities: [{ id, bounds() → {x0,y0,x1,y1} }].
 * Выбирается самый маленький по площади (крона не перекрывает цветок под ней), при равенстве — тот, что ниже на экране.
 */
export function pickAt(entities, x, y, pad = 6) {
  let best = null, bestA = Infinity, bestY = -Infinity;
  for (const e of entities) {
    const b = e.bounds();
    if (x < b.x0 - pad || x > b.x1 + pad || y < b.y0 - pad || y > b.y1 + pad) continue;
    const a = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
    if (a < bestA || (a === bestA && b.y1 > bestY)) { best = e; bestA = a; bestY = b.y1; }
  }
  return best;
}

export const snapValue = (v, grid) => (grid > 0 ? Math.round(v / grid) * grid : Math.round(v));

/** Свободный id вида n001, n002… */
export function nextId(taken, prefix = 'n') {
  let i = 1;
  while (taken.has(`${prefix}${String(i).padStart(3, '0')}`)) i++;
  return `${prefix}${String(i).padStart(3, '0')}`;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
