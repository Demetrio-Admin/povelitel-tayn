# ВРЕМЕННАЯ графика колдуна (v0.9.2) — НЕ финальный рисунок.
# Получается из рисунков ведьмы: волосы укорочены и перекрашены в каштановые, вместо голых ног — брюки.
# Нужна, чтобы проверить выбор героя, сцены, медальон и анимации, пока художник готовит настоящие ракурсы.
# Релиз с этой графикой не выпускается: в src/config/assets.manifest.js ключи warlock_* отмечены как TEMPORARY_ART,
# и стартовый экран показывает метку «Временный рисунок».
#
# Запуск: python3 tools/art/warlock_placeholder.py  (читает public/assets/sprites/hero_*.png, пишет warlock_*.png)
# Финальные рисунки: положить warlock_down/up/side.png (166×240, RGBA, ноги у нижнего края, тот же масштаб)
# в public/assets/sprites/ и убрать ключи из TEMPORARY_ART.
import os
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SPR = os.path.join(ROOT, 'public', 'assets', 'sprites')
OUTLINE = np.array([58, 30, 38], float)
CHESTNUT = np.array([122, 72, 44], float)
TROUSERS = np.array([70, 66, 92], float)

# Параметры ракурсов (координаты холста 166×240): зона длинных волос (cut: что ниже — состригается),
# линии плаща под волосами (между ними плащ дорисовывается, снаружи — прозрачно), полоса ног между подолом и сапогами.
VIEWS = {
  'down': dict(box=(24, 56, 146, 140), cut=lambda x, y: y > 101 and (x < 60 or x > 108),
               face=(84, 90, 28, 20), keep=[(112, 108, 128, 127), (103, 124, 125, 142)],
               left=[(58, 106), (47, 128), (44, 141)], right=[(110, 106), (122, 128), (127, 141)], legs=(195, 212), legs_x=(60, 108)),
  'up':   dict(box=(22, 98, 148, 158), cut=lambda x, y: y > 111, face=None, keep=[],
               left=[(44, 106), (31, 140), (27, 158)], right=[(124, 106), (135, 140), (139, 158)], legs=(201, 214), legs_x=(58, 106)),
  'side': dict(box=(30, 52, 124, 148), cut=lambda x, y: (y > 97 and x < 71) or (y > 101 and x < 102),
               face=(110, 88, 17, 20), keep=[],
               left=[(71, 100), (47, 130), (38, 152)], right=[(220, 0), (220, 240)], legs=(198, 216), legs_x=(72, 100)),
}


def interp(pts, y):
  ys = [p[1] for p in pts]; xs = [p[0] for p in pts]
  return float(np.interp(y, ys, xs))


def hsv(rgb):
  h = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2HSV_FULL).astype(float)
  return h[..., 0] / 255, h[..., 1] / 255, h[..., 2] / 255


def lum(rgb):
  return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def dil(m, it=1):
  return cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=it).astype(bool)


def make(view):
  P = VIEWS[view]
  im = np.array(Image.open(os.path.join(SPR, f'hero_{view}.png')).convert('RGBA')).astype(float)
  rgb, a = im[..., :3], im[..., 3]
  H, W = a.shape
  h, s, v = hsv(rgb)
  op = a > 40
  x0, y0, x1, y1 = P['box']
  inbox = np.zeros_like(op); inbox[y0:y1, x0:x1] = True
  orange = (h > 0.0) & (h < 0.12)
  hair_core = op & inbox & orange & (s > 0.42) & (v > 0.40)
  # только связные куски, касающиеся головы (не посох, не блики плаща)
  n, lab = cv2.connectedComponents(hair_core.astype(np.uint8), connectivity=8)
  core = np.zeros_like(hair_core)
  for i in range(1, n):
    comp = lab == i
    if comp.sum() >= 6 and np.nonzero(comp)[0].min() < y0 + 45: core |= comp
  # волосы целиком: ядро + тени и прядки рядом (тёплые тона), плюс тонкий контур
  warm = op & inbox & (orange | (h > 0.95)) & (s > 0.28) & (v > 0.22)
  hair = core | (warm & dil(core, 2))
  cloakish = (h > 0.7) & (h < 0.95) & (s > 0.2)       # фиолетовый воротник/плащ — не трогаем
  yy, xx = np.mgrid[0:H, 0:W]
  cutzone = np.vectorize(P['cut'])(xx, yy)
  remove = cutzone & op & inbox & (hair | (dil(hair, 2) & (v < 0.5) & ~cloakish))
  interior = np.zeros_like(remove)
  for y in range(H):
    interior[y] = (xx[y] >= interp(P['left'], y)) & (xx[y] <= interp(P['right'], y))
  # снаружи плаща в зоне стрижки не остаётся ничего, кроме посоха и кристалла (keep — их прямоугольники)
  keep = np.zeros_like(op)
  for (kx0, ky0, kx1, ky1) in P['keep']: keep[ky0:ky1, kx0:kx1] = True
  remove |= cutzone & op & inbox & ~interior & ~(keep & ~core)
  if P['face']:   # лицо не трогаем
    fx, fy, rx, ry = P['face']
    remove &= ~((((xx - fx) / rx) ** 2 + ((yy - fy) / ry) ** 2) < 1)
  fill = remove & interior
  out = im.copy()
  out[remove, 3] = 0
  # полупрозрачные остатки снаружи плаща (ореол волос) тоже убрать; у кристалла остаётся только он сам
  halo = cutzone & inbox & ~interior & (a <= 40)
  cyan = ((h > 0.3) & (h < 0.65) & (s > 0.12)) | ((s < 0.2) & (v > 0.85))   # кристалл и его блик
  staff = (h > 0.03) & (h < 0.12) & (s > 0.35) & (v > 0.2) & (v < 0.62)
  halo |= cutzone & inbox & ~interior & keep & (((a < 200) & ~cyan) | ~(cyan | staff | (v < 0.25)))
  out[halo, 3] = 0
  # плащ под волосами: зеркально продолжаем то, что ниже края волос в том же столбце (без шва), чуть темнее
  hole = np.zeros_like(fill)
  for x in range(W):
    col = np.nonzero(fill[:, x])[0]
    if not len(col): continue
    yb = int(np.nonzero(remove[:, x])[0].max())
    for y in col:
      ys = 2 * yb + 1 - y
      if ys < H and op[ys, x] and not remove[ys, x] and not hair[ys, x]:
        out[y, x, :3] = rgb[ys, x] * 0.9; out[y, x, 3] = 255
      else:
        hole[y, x] = True
  if hole.any():
    base = out[..., :3].astype(np.uint8).copy()
    base = cv2.inpaint(base, hole.astype(np.uint8), 3, cv2.INPAINT_TELEA)
    out[hole, :3] = base[hole]; out[hole, 3] = 255
  # перекрасить оставшиеся волосы в каштановый (светотень сохраняется)
  rest = hair & ~remove
  if P['face']:   # румянец на щеках того же оттенка, что волосы, — лицо не перекрашиваем
    fx, fy, rx, ry = P['face']
    rest &= ~((((xx - fx) / rx) ** 2 + ((yy - fy) / ry) ** 2 < 1) & (v > 0.88))
  L = lum(rgb[rest]); k = (L / max(1.0, np.percentile(L, 60)))[:, None]
  out[rest, :3] = np.clip(CHESTNUT * k, 0, 255)
  # ноги: кожа и светлые носки между подолом и сапогами → брюки
  ly0, ly1 = P['legs']
  lx0, lx1 = P['legs_x']
  band = np.zeros_like(op); band[ly0:ly1, lx0:lx1] = True
  skinish = (((h < 0.12) | (h > 0.93)) & (s < 0.55) & (v > 0.45)) | ((s < 0.22) & (v > 0.6))
  legs = op & band & skinish
  L = lum(rgb[legs]); k = (L / max(1.0, np.percentile(L, 70)))[:, None]
  out[legs, :3] = np.clip(TROUSERS * (0.7 + 0.4 * k), 0, 255)
  # контур: новый край силуэта и край стрижки — тёмная линия, как у остальных рисунков
  A = out[..., 3] > 40
  edge = A & dil(~A)
  touched = dil(remove, 2)
  out[edge & touched & (lum(out[..., :3]) > 60), :3] = OUTLINE
  hb = A & ~remove & dil(fill) & ~fill
  out[hb, :3] = np.minimum(out[hb, :3], OUTLINE * 1.4)
  return Image.fromarray(out.astype(np.uint8), 'RGBA')


if __name__ == '__main__':
  for view in VIEWS:
    img = make(view)
    assert img.size == (166, 240)
    img.save(os.path.join(SPR, f'warlock_{view}.png'), optimize=True)
    print('warlock_' + view, img.size)
