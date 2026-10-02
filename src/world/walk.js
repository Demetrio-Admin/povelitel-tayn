// Проходимость мира на сетке: может ли тело героини (hitbox 34×22 у ног) дойти из точки A в точку B.
// Нужна тестам и инструментам; в игре физику считает Arcade. Сетка 4-связная — намеренно строгая:
// щели, в которые герой «может протиснуться по диагонали», считаются закрытыми.

export function buildWalkGrid({ width, height, solids, hero = { w: 34, h: 22 }, cell = 10 }) {
  const cols = Math.ceil(width / cell) + 1, rows = Math.ceil(height / cell) + 1;
  const blocked = new Uint8Array(cols * rows);
  const hw = hero.w / 2;
  for (const s of solids) {
    // позиции ног героини (px, py), при которых тело пересекает препятствие
    const x0 = Math.max(0, Math.ceil((s.x - hw) / cell + 0.0001)), x1 = Math.min(cols - 1, Math.floor((s.x + s.w + hw) / cell - 0.0001));
    const y0 = Math.max(0, Math.ceil(s.y / cell + 0.0001)), y1 = Math.min(rows - 1, Math.floor((s.y + s.h + hero.h) / cell - 0.0001));
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) blocked[j * cols + i] = 1;
  }
  // границы мира
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const px = i * cell, py = j * cell;
    if (px < hw || px > width - hw || py < hero.h || py > height) blocked[j * cols + i] = 1;
  }
  return { cols, rows, cell, blocked };
}

/** Заливка от точки: Uint8Array посещённых клеток. Старт сдвигается к ближайшей свободной клетке. */
export function floodFrom(grid, x, y) {
  const { cols, rows, cell, blocked } = grid;
  const seen = new Uint8Array(cols * rows);
  let si = Math.round(x / cell), sj = Math.round(y / cell);
  if (blocked[sj * cols + si]) {
    let found = false;
    for (let r = 1; r < 8 && !found; r++) for (let dj = -r; dj <= r && !found; dj++) for (let di = -r; di <= r && !found; di++) {
      const i = si + di, j = sj + dj;
      if (i >= 0 && j >= 0 && i < cols && j < rows && !blocked[j * cols + i]) { si = i; sj = j; found = true; }
    }
    if (!found) return seen;
  }
  const stack = [sj * cols + si];
  seen[stack[0]] = 1;
  while (stack.length) {
    const k = stack.pop();
    const i = k % cols, j = (k / cols) | 0;
    if (i > 0 && !seen[k - 1] && !blocked[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
    if (i < cols - 1 && !seen[k + 1] && !blocked[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
    if (j > 0 && !seen[k - cols] && !blocked[k - cols]) { seen[k - cols] = 1; stack.push(k - cols); }
    if (j < rows - 1 && !seen[k + cols] && !blocked[k + cols]) { seen[k + cols] = 1; stack.push(k + cols); }
  }
  return seen;
}

/** Есть ли достижимая клетка не дальше radius от точки. */
export function reachableNear(grid, seen, x, y, radius) {
  const { cols, rows, cell } = grid;
  const r = Math.ceil(radius / cell);
  const ci = Math.round(x / cell), cj = Math.round(y / cell);
  for (let j = Math.max(0, cj - r); j <= Math.min(rows - 1, cj + r); j++) {
    for (let i = Math.max(0, ci - r); i <= Math.min(cols - 1, ci + r); i++) {
      if (seen[j * cols + i] && Math.hypot((i - ci) * cell, (j - cj) * cell) <= radius) return true;
    }
  }
  return false;
}
