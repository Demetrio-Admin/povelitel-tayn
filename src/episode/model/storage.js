// Изолированное хранилище эпизода: собственный префикс ключей (без Phaser — проверяется в Node).
export const PREFIX = 'witch_episode_v1:';

export function isolatedStorage(raw) {
  const memory = new Map();
  const key = (k) => PREFIX + k;
  return {
    getItem(k) { try { return raw ? raw.getItem(key(k)) : memory.get(key(k)) ?? null; } catch { return memory.get(key(k)) ?? null; } },
    setItem(k, v) { try { if (raw) raw.setItem(key(k), v); else memory.set(key(k), String(v)); } catch { memory.set(key(k), String(v)); } },
    removeItem(k) { try { if (raw) raw.removeItem(key(k)); else memory.delete(key(k)); } catch { memory.delete(key(k)); } },
  };
}
