"""Арт главы II, часть 2 (склады, Замёрзший квартал): Нэрис, морозные враги — перекраска ваших спрайтов; лёд и вода — рисованные.
Запуск из корня репозитория:  python3 tools/art/v21_quarter.py  ->  public/assets/sprites/*.png
"""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from v08_sprites import Cv, OL, rgb, lighter, darker  # noqa: E402
from v19_items import recolor, frost, glow_under, load, save  # noqa: E402
from v20_city import band, portrait_from  # noqa: E402

ICE = rgb('#bff0ff'); ICE_M = rgb('#8fd8f0'); ICE_D = rgb('#4fa8d8')


def nerys():
    """Нэрис — маг Льда: травница Веда с серебряными волосами и в тёмно-синем плаще (кожа и лицо не трогаются)."""
    hair = lambda h, s, v: ((h < 0.09) | (h > 0.95)) & (s > 0.5) & (v < 0.85)   # рыжие волосы — насыщеннее и темнее кожи
    for src, dst in (('npc_veda', 'npc_nerys'), ('portrait_veda', 'portrait_nerys')):
        im = load(src)
        im = recolor(im, to_hue=0.57, sat=0.75, val=0.95, mask=lambda h, s, v: (h > 0.17) & (h < 0.5) & (s > 0.15))   # зелёное → ледяная синева
        im = recolor(im, to_hue=0.58, sat=0.18, val=1.45, mask=hair)                                                   # волосы → серебро
        save(frost(im, 0.35), dst)


def enemies():
    root = load('enemy_rootling')
    col = recolor(root, to_hue=0.55, sat=0.45, val=1.15)
    save(glow_under(frost(col, 0.6), (160, 230, 255), 5, 0.4), 'enemy_frost_collector')
    elite = recolor(root, to_hue=0.62, sat=0.7, val=0.85)
    save(glow_under(frost(elite, 0.7), (120, 170, 255), 7, 0.55), 'enemy_frost_collector_elite')
    g = load('enemy_guardian')
    ig = recolor(g, to_hue=0.54, sat=0.5, val=1.1)
    save(glow_under(frost(ig, 0.6), (170, 235, 255), 8, 0.45), 'enemy_ice_guardian')


def ice_wall():
    c = Cv(220, 200)
    c.shadow(110, 190, 100, 12)
    rng = np.random.default_rng(3)
    for i in range(9):
        x = 14 + i * 22 + rng.uniform(-4, 4)
        h = 90 + rng.uniform(0, 80)
        w = 30 + rng.uniform(0, 14)
        col = ICE if i % 2 else ICE_M
        c.poly([(x, 190), (x + w * 0.2, 190 - h), (x + w * 0.55, 182 - h - 12), (x + w, 190 - h * 0.9), (x + w, 190)], col, OL, 2.2)
        c.line([(x + w * 0.35, 186), (x + w * 0.45, 196 - h)], (255, 255, 255, 220), 2.2)
    c.glow(110, 120, 90, ICE, 0.35)
    c.save('ice_wall_01')


def ice_construct():
    c = Cv(240, 240)
    c.shadow(120, 228, 104, 14)
    c.glow(120, 130, 110, rgb('#9fd8ff'), 0.6)
    pts = [(120, 20), (160, 70), (176, 150), (150, 226), (90, 226), (64, 150), (80, 70)]
    c.poly(pts, ICE_M, OL, 3)
    c.poly([(120, 20), (160, 70), (130, 120), (100, 70)], ICE, None)
    c.poly([(64, 150), (90, 226), (110, 160)], ICE_D, None)
    for a, b in (((70, 120), (40, 190)), ((172, 110), (206, 176))):
        c.poly([a, (a[0] + 12, a[1] - 6), b, (b[0] - 8, b[1] + 8)], ICE, OL, 2.2)
    c.ell(104, 110, 136, 142, rgb('#c77dff'), OL, 2)          # нестабильное ядро
    c.glow(120, 126, 34, rgb('#c77dff'), 0.8)
    c.save('ice_construct_01')


def water_patch():
    c = Cv(260, 140)
    c.ell(6, 14, 254, 134, rgb('#2f5f7a'), OL, 2.4)
    c.ell(20, 24, 240, 124, rgb('#3f7f9f'), None)
    for k in range(4):
        y = 50 + k * 18
        c.arc((40 + k * 20, y - 6, 200 - k * 10, y + 10), 200, 340, rgb('#9fd8f0'), 2)
    c.save('water_patch_01')
    c = Cv(260, 140)
    c.ell(6, 14, 254, 134, ICE_M, OL, 2.4)
    c.ell(20, 24, 240, 124, ICE, None)
    rng = np.random.default_rng(11)
    for _ in range(10):
        x, y = rng.uniform(40, 220), rng.uniform(40, 110)
        a = rng.uniform(0, math.pi)
        c.line([(x, y), (x + math.cos(a) * 26, y + math.sin(a) * 10)], (255, 255, 255, 230), 2)
    c.save('ice_floor_01')


def frozen_door():
    c = Cv(160, 170)
    c.shadow(80, 160, 70, 10)
    c.rr(14, 20, 146, 160, 8, rgb('#7a5a3c'), OL, 3)
    for x in (48, 80, 112):
        c.line([(x, 26), (x, 154)], rgb('#5a3a22'), 2)
    c.poly([(10, 60), (40, 30), (90, 50), (150, 26), (152, 120), (110, 150), (40, 140), (8, 110)], (200, 240, 255, 200), OL, 2.2)
    c.line([(40, 60), (70, 120)], (255, 255, 255, 220), 2)
    c.line([(100, 50), (120, 110)], (255, 255, 255, 220), 2)
    c.save('frozen_door_01')


def main():
    nerys(); enemies(); ice_wall(); ice_construct(); water_patch(); frozen_door()
    print('ok')


if __name__ == '__main__':
    main()
