// Experiment-only configuration. Production constants and collision bodies stay unchanged.
export const PREFIX = 'witch_camera_test_v1:';
export const PROFILES = {
  original: { label: 'Исходный', scale: 1, look: 0 },
  a: { label: 'A — Герой крупнее', scale: 1.25, look: 0 },
  b: { label: 'B — Умная камера', scale: 1.25, look: 0.09 },
};
export const experiment = { profile: 'b', changing: false, panelOpen: false };
export function isolatedStorage(storage) {
  const memory = new Map();
  return {
    getItem(key) { try { return storage?.getItem(PREFIX + key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; } },
    setItem(key, value) { memory.set(key, String(value)); try { storage?.setItem(PREFIX + key, String(value)); } catch { /* session memory fallback */ } },
    removeItem(key) { memory.delete(key); try { storage?.removeItem(PREFIX + key); } catch { /* session memory fallback */ } },
  };
}
// Velocity low-pass filter absorbs brief route corners, then eases back to neutral.
export function lookAhead(previous, velocity, dt, width, height, amount) {
  const speed = Math.hypot(velocity.x, velocity.y);
  const strength = Math.min(1, speed / 180);
  const target = speed > 25 ? { x: velocity.x / speed * width * amount * strength, y: velocity.y / speed * height * amount * strength } : { x: 0, y: 0 };
  const alpha = 1 - Math.exp(-Math.max(0, Math.min(dt, .05)) / .4);
  return { x: previous.x + (target.x - previous.x) * alpha, y: previous.y + (target.y - previous.y) * alpha };
}
