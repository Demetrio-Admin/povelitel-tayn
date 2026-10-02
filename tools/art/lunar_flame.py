"""Процедурный спрайт лунного огонька (lunar_flame_01.png), 144x192, pivot — нижний центр.
Запуск: python3 tools/art/lunar_flame.py  ->  public/assets/sprites/lunar_flame_01.png
"""
import numpy as np
from PIL import Image

W, H = 144, 192
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
cx = W / 2

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

# --- мягкое гало вокруг тела огонька
gx, gy = (xx - cx) / 68.0, (yy - 118) / 74.0
halo = np.clip(1 - np.sqrt(gx ** 2 + gy ** 2), 0, 1) ** 2.2 * 0.55

# --- силуэт огонька: одна гладкая кривая, широкое место ниже середины, округлое основание
t = np.clip((yy - 14) / (156 - 14), 0, 1)             # 0 — кончик, 1 — основание
half_w = 46 * np.clip(np.sin(np.pi * t ** 1.6), 0, 1) ** 0.6
bend = 12 * (1 - t) ** 2.2 * np.sin(t * 6.0 + 0.6) + 10 * (1 - t) ** 3   # язычок слегка гуляет
dx = np.abs(xx - cx - bend)
inside = (yy >= 14) & (yy <= 156)
body = smooth(0, 1, (half_w - dx) / 5.0) * inside

# --- цвет: белое ядро -> светлый циан -> бирюза по краю, края прозрачнее
core_d = np.sqrt(((xx - cx) / 17.0) ** 2 + ((yy - 124) / 30.0) ** 2)
core = np.clip(1 - core_d, 0, 1) ** 1.1
edge = np.clip(1 - dx / np.maximum(half_w, 1), 0, 1)  # 0 на краю, 1 по оси
r = 0.40 + 0.60 * np.clip(0.25 * edge + 0.95 * core, 0, 1)
g = 0.82 + 0.18 * np.clip(0.4 * edge + 0.8 * core, 0, 1)
b = np.full_like(r, 1.0)
rgb_body = np.stack([r, g, b], -1)
rgb_halo = np.stack([np.full_like(halo, 0.62), np.full_like(halo, 0.93), np.full_like(halo, 1.0)], -1)

a_body = body * (0.35 + 0.65 * smooth(0.0, 0.55, edge))
a = a_body + halo * (1 - a_body)
rgb = (rgb_body * a_body[..., None] + rgb_halo * (halo * (1 - a_body))[..., None]) / np.maximum(a[..., None], 1e-4)

# --- искорки рядом (фикс. seed — результат воспроизводим)
rng = np.random.default_rng(7)
for _ in range(9):
    sx, sy, sr = rng.uniform(30, 114), rng.uniform(30, 150), rng.uniform(1.2, 2.6)
    s = np.clip(1 - np.sqrt((xx - sx) ** 2 + (yy - sy) ** 2) / (sr * 2), 0, 1) ** 1.5
    rgb = rgb * (1 - s[..., None]) + np.array([0.85, 0.97, 1.0]) * s[..., None]
    a = np.maximum(a, s * 0.9)

out = np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(a, 0, 1) * 255]).astype(np.uint8)
Image.fromarray(out, 'RGBA').save('public/assets/sprites/lunar_flame_01.png', optimize=True)
print('ok', out.shape)
