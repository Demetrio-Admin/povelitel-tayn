// Загрузка пакетов графики по требованию (см. config/assets.packs.js).
//
// Один отдельный загрузчик на всю игру: он не привязан к сцене, поэтому перезапуск сцены при переходе
// между локациями не обрывает загрузку. Пакеты грузятся по очереди; повторный запрос того же пакета
// получает ту же очередь, а не вторую закачку.
import Phaser from 'phaser';
import { PACK_IDS, PACK_IMAGES, packsForLocation } from '../config/assets.packs.js';
import { DISPLAY_SIZE } from '../config/assets.manifest.js';
import { installCityWitchSprites } from '../world/cityWitchArt.js';
import { showLoadingScreen, setLoadingProgress, hideLoadingScreen } from '../ui/loadingScreen.js';

const done = new Set();
const pending = new Map();   // packId -> Promise
let loader = null;
let chain = Promise.resolve();

/** Привязать загрузчик к сцене, которая живёт всю игру (PreloadScene остаётся в менеджере). */
export function initAssetPacks(scene) {
  if (!loader) loader = new Phaser.Loader.LoaderPlugin(scene);
  return loader;
}

export const isPackLoaded = (id) => done.has(id);
export const markPackLoaded = (id) => { done.add(id); };

/** Серая заглушка для файла, который не загрузился (как у ключей без картинки). */
function placeholder(scene, key) {
  if (scene.textures.exists(key)) return;
  const [w, h] = DISPLAY_SIZE[key] || [64, 64];
  const tex = scene.textures.createCanvas(key, w, h);   // только менеджер текстур: сцена к этому моменту может быть остановлена
  const c = tex.getContext();
  c.fillStyle = '#777777'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
  tex.customData.placeholder = true;   // проверяется tools/ui/packs-test.py
  tex.refresh();
}

function loadOne(scene, id, onFile) {
  const images = PACK_IMAGES[id] || {};
  const entries = Object.entries(images).filter(([key]) => !scene.textures.exists(key));
  if (!entries.length) { done.add(id); return Promise.resolve(); }
  return new Promise((resolve) => {
    const l = initAssetPacks(scene);
    let count = 0;
    // Загрузчик Phaser подаёт файлы в очередь из update() своей сцены; PreloadScene к этому времени остановлена,
    // поэтому «тикаем» сами, пока пакет не загрузится.
    const tick = setInterval(() => l.update(), 40);
    const onAdd = () => { count++; onFile?.(count, entries.length); };
    const finish = () => {
      clearInterval(tick);
      l.off('filecomplete', onAdd); l.off('loaderror', onAdd); l.off('complete', finish);
      for (const [key] of entries) placeholder(scene, key);   // файл не пришёл — заглушка, а не «зелёный квадрат»
      if (id === 'city') installCityWitchSprites(scene.textures);
      done.add(id);
      resolve();
    };
    l.on('filecomplete', onAdd); l.on('loaderror', onAdd); l.on('complete', finish);
    for (const [key, path] of entries) l.image(key, path);
    l.start();
  });
}

/**
 * Дождаться пакетов. onProgress(0…1) — общий прогресс по файлам этого запроса.
 * Возвращает Promise, который не отклоняется (недогруженное закрывается заглушками).
 */
export function ensurePacks(scene, ids, onProgress) {
  const want = [...new Set(ids)].filter((id) => PACK_IDS.includes(id) && !done.has(id));
  if (!want.length) { onProgress?.(1); return Promise.resolve(); }
  const total = want.reduce((n, id) => n + Object.keys(PACK_IMAGES[id]).length, 0) || 1;
  const got = Object.fromEntries(want.map((id) => [id, 0]));
  const report = () => onProgress?.(Math.min(1, Object.values(got).reduce((a, b) => a + b, 0) / total));
  return Promise.all(want.map((id) => {
    if (!pending.has(id)) {
      const p = chain.then(() => loadOne(scene, id, (n) => { got[id] = n; report(); })).finally(() => pending.delete(id));
      pending.set(id, p);
      chain = p.catch(() => {});
    }
    return pending.get(id).then(() => { got[id] = Object.keys(PACK_IMAGES[id]).length; report(); });
  })).then(() => undefined);
}

export const ensureLocationPacks = (scene, loc, onProgress) => ensurePacks(scene, packsForLocation(loc), onProgress);

/** Фоновая подкачка пакетов открытых локаций — чтобы переход не ждал загрузки. Мобильный трафик экономим. */
export function prefetchLocations(scene, locations) {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return Promise.resolve();
  const ids = locations.flatMap((l) => packsForLocation(l));
  return ensurePacks(scene, ids);
}

/** Дождаться пакетов локации; экран загрузки появляется, только если ждать приходится дольше 120 мс. */
export function ensureLocationWithScreen(scene, loc, message = 'Собираем магию…') {
  let shown = false;
  const timer = setTimeout(() => { shown = true; showLoadingScreen(message); setLoadingProgress(0); }, 120);
  return ensureLocationPacks(scene, loc, (v) => { if (shown) setLoadingProgress(v); }).finally(() => {
    clearTimeout(timer);
    if (shown) hideLoadingScreen();
  });
}
