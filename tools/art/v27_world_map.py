"""Карта мира (v0.27.0): пергамент в стиле игры — лес Мирры, дорога, город, Морозный лес и Старое кладбище.
Точки локаций рисует игра поверх (координаты — config/locations.js, поле map). Рисованная, процедурная.
Запуск из корня репозитория:  python3 tools/art/v27_world_map.py  ->  public/assets/sprites/world_map_01.png
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from v08_sprites import Cv, OL, rgb  # noqa: E402

W, H = 584, 760
INK = rgb('#4a3424'); INK_L = rgb('#7a5a3c')


def tree(c, x, y, s=1.0, col='#3f6a3a', snow=False):
    c.poly([(x, y - 26 * s), (x + 11 * s, y), (x - 11 * s, y)], rgb(col), INK, 1.4)
    c.poly([(x, y - 36 * s), (x + 8 * s, y - 16 * s), (x - 8 * s, y - 16 * s)], rgb(col), INK, 1.4)
    if snow:
        c.poly([(x, y - 36 * s), (x + 4 * s, y - 26 * s), (x - 4 * s, y - 26 * s)], rgb('#f4fbff'), None)
    c.line([(x, y), (x, y + 5 * s)], INK, 2)


def main():
    rng = np.random.default_rng(27)
    c = Cv(W, H)
    # пергамент: тёплый фон, пятна, потемнение к краям
    c.rr(4, 4, W - 4, H - 4, 26, rgb('#e9d6a8'), rgb('#6b4a2c'), 5)
    base = c.im if hasattr(c, 'im') else None
    for _ in range(60):
        x, y, r = rng.uniform(20, W - 20), rng.uniform(20, H - 20), rng.uniform(20, 70)
        c.glow(x, y, r, rgb('#d8bf8a'), 0.18)
    # горы на севере
    for i in range(7):
        x = 40 + i * 52 + rng.uniform(-8, 8); y = 74 + rng.uniform(-6, 6); h = 40 + rng.uniform(0, 24)
        c.poly([(x - 30, y + 20), (x, y + 20 - h), (x + 30, y + 20)], rgb('#b9a27a'), INK, 1.6)
        c.poly([(x, y + 20 - h), (x + 9, y + 20 - h * 0.6), (x - 9, y + 20 - h * 0.6)], rgb('#f4f0e6'), None)
    # река с севера на юг
    pts = [(250, 100), (236, 180), (262, 260), (240, 330), (268, 420), (246, 520), (276, 620), (260, 730)]
    c.line(pts, rgb('#7fb0c8'), 10)
    c.line(pts, rgb('#a8d4e6'), 4)
    # лес Мирры (юго-запад)
    for _ in range(46):
        x, y = rng.uniform(40, 230), rng.uniform(450, 700)
        if math.hypot(x - 150, y - 560) < 34: continue
        tree(c, x, y, rng.uniform(0.7, 1.05), rng.choice(['#3f6a3a', '#4f7a3a', '#6a5a2a']))
    # Морозный лес (северо-восток) — заснеженный
    for _ in range(34):
        x, y = rng.uniform(380, 550), rng.uniform(110, 260)
        if math.hypot(x - 470, y - 170) < 30: continue
        tree(c, x, y, rng.uniform(0.7, 1.0), '#7f9aa8', snow=True)
    # Старое кладбище (юго-восток): надгробия
    for _ in range(22):
        x, y = rng.uniform(395, 545), rng.uniform(540, 690)
        if math.hypot(x - 470, y - 600) < 30: continue
        c.rr(x - 5, y - 12, x + 5, y, 3, rgb('#9a9a92'), INK, 1.2)
    # дороги (пунктир): лес → город, город → вылазки
    def road(a, b, n=14):
        for i in range(n):
            t0, t1 = i / n, (i + 0.55) / n
            c.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0), (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], INK_L, 3)
    road((150, 560), (330, 360), 16)
    road((330, 360), (470, 170), 12)
    road((330, 360), (470, 600), 14)
    # город: стены и башни
    cx, cy = 330, 360
    c.rr(cx - 46, cy - 40, cx + 46, cy + 34, 6, rgb('#c9b48a'), INK, 2.4)
    for (tx, ty) in ((cx - 46, cy - 40), (cx + 46, cy - 40), (cx - 46, cy + 34), (cx + 46, cy + 34)):
        c.ell(tx - 9, ty - 9, tx + 9, ty + 9, rgb('#b39c72'), INK, 2)
    for (bx, by, bw, bh) in ((cx - 30, cy - 22, 20, 18), (cx - 2, cy - 30, 26, 26), (cx + 16, cy + 4, 18, 16), (cx - 26, cy + 6, 16, 14)):
        c.rr(bx, by, bx + bw, by + bh, 2, rgb('#9a7a58'), INK, 1.4)
        c.poly([(bx - 2, by), (bx + bw / 2, by - 10), (bx + bw + 2, by)], rgb('#7a4a3a'), INK, 1.2)
    # роза ветров
    rx, ry = 520, 380
    c.ell(rx - 26, ry - 26, rx + 26, ry + 26, None, INK_L, 1.6)
    c.poly([(rx, ry - 34), (rx + 6, ry), (rx, ry + 34), (rx - 6, ry)], rgb('#8a6a48'), INK, 1.2)
    c.poly([(rx - 34, ry), (rx, ry - 6), (rx + 34, ry), (rx, ry + 6)], rgb('#c9b48a'), INK, 1.2)
    c.save('world_map_01')


if __name__ == '__main__':
    main()
