# Хромакей по пурпурному фону + нарезка листа на отдельные спрайты.
# usage: python3 key.py src.jpeg outdir name1,name2,...  (имена слева-направо, сверху-вниз)
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage

src, outdir, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
os.makedirs(outdir, exist_ok=True)
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
h, w, _ = im.shape
# цвет фона — медиана по рамке 6px
border = np.concatenate([im[:6].reshape(-1,3), im[-6:].reshape(-1,3), im[:, :6].reshape(-1,3), im[:, -6:].reshape(-1,3)])
bg = np.median(border, axis=0)
R, G, B = im[...,0], im[...,1], im[...,2]
# «пурпурность»: насколько min(R,B) превышает G, относительно фона
mag = (np.minimum(R, B) - G)
bgmag = min(bg[0], bg[2]) - bg[1]
d = np.linalg.norm(im - bg, axis=2)
# альфа: фон = 0, явный объект = 1; мягкий переход
alpha = np.clip((d - 38) / 60, 0, 1)
# FLOOD=1: фоном считается только область, связанная с краем кадра (белые пятна внутри объектов сохраняются)
if os.environ.get("FLOOD"):
    cand = d < 70
    lab0, _ = ndimage.label(cand)
    edge = set(np.unique(np.concatenate([lab0[0], lab0[-1], lab0[:, 0], lab0[:, -1]]))) - {0}
    bgr = np.isin(lab0, list(edge))
    near = ndimage.binary_dilation(bgr, iterations=3)
    alpha = np.where(bgr, 0.0, np.where(near, alpha, 1.0))
    # замкнутые «дырки» фона (просветы в кустах, между ножками): чистый фон и не мельче HOLE px
    HOLE = int(os.environ.get('HOLE', 600))
    lab1, n1 = ndimage.label(d < 28)
    if n1:
        sizes = ndimage.sum(np.ones_like(d), lab1, index=np.arange(1, n1 + 1))
        big = np.where(sizes >= HOLE)[0] + 1
        hole = np.isin(lab1, big) & ~bgr
        holen = ndimage.binary_dilation(hole, iterations=2) & ~hole
        alpha = np.where(hole, 0.0, np.where(holen, np.minimum(alpha, np.clip((d - 20) / 60, 0, 1)), alpha))
# частично прозрачный пиксель: восстановить цвет переднего плана из смеси с фоном
afg = np.clip(alpha, 0.05, 1)[..., None]
fg = (im - (1 - afg) * bg) / afg
out = np.where(alpha[..., None] < 0.98, np.clip(fg, 0, 255), im)
# краевая зона: убираем пурпурный ореол (свечение, смешанное с фоном)
BAND = int(os.environ.get("BAND", 14))
if BAND > 0:
    solid = alpha > 0.5
    dist = ndimage.distance_transform_edt(solid)
    band = np.clip(1 - dist / BAND, 0, 1)
    o = out
    sp = np.clip(np.minimum(o[...,0], o[...,2]) - o[...,1], 0, None) / max(bgmag, 1)
    SPT = float(os.environ.get('SPT', 0.25))
    sp = np.clip((sp - SPT) / 0.5, 0, 1) * band
    alpha = alpha * (1 - sp)
    sub = np.clip(np.minimum(o[...,0], o[...,2]) - o[...,1], 0, None) * band
    o[...,0] -= sub * 0.85; o[...,2] -= sub * 0.85
    out = o
# тонкий контур снаружи не должен быть розовым
rgba = np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)

# нарезка: маска -> дилатация -> компоненты
mask = alpha > 0.5
mask = ndimage.binary_opening(mask, iterations=1)
dil = ndimage.binary_dilation(mask, iterations=int(os.environ.get("DIL",14)))
lab, n = ndimage.label(dil)
objs = ndimage.find_objects(lab)
boxes = []
for i, sl in enumerate(objs):
    area = (lab[sl] == i + 1).sum()
    if area < 2500: continue
    boxes.append((sl, i + 1, area))
# сортировка по строкам: сначала по центру y (кластер строк), затем по x
boxes.sort(key=lambda b: (b[0][0].start + b[0][0].stop) / 2)
rows = []
for b in boxes:
    cy = (b[0][0].start + b[0][0].stop) / 2
    if rows and abs(cy - rows[-1][0]) < h * 0.18: rows[-1][1].append(b)
    else: rows.append([cy, [b]])
ordered = [b for r in rows for b in sorted(r[1], key=lambda b: b[0][1].start)]
print('found', len(ordered), 'objects, names', len(names))
for (sl, idx, area), name in zip(ordered, names):
    pad = 4
    ys, xs = sl
    y0, y1 = max(ys.start - pad, 0), min(ys.stop + pad, h)
    x0, x1 = max(xs.start - pad, 0), min(xs.stop + pad, w)
    crop = rgba[y0:y1, x0:x1].copy()
    crop[..., 3] = np.where(lab[y0:y1, x0:x1] == idx, crop[..., 3], 0)
    img = Image.fromarray(crop)
    bb = img.getbbox(); img = img.crop(bb)
    img.save(os.path.join(outdir, name + '.png'))
    print(name, img.size)
