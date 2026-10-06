"""Арт вылазок (Морозный лес и Старое кладбище): звери и стражи — перекраска ваших спрайтов, огонёк, надгробия и склеп — рисованные,
земля — перекраска травы (бесшовная, как исходная).
Запуск из корня репозитория:  python3 tools/art/v24_expeditions.py  ->  public/assets/sprites/*.png
"""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from v08_sprites import Cv, OL, rgb  # noqa: E402
from v19_items import recolor, frost, glow_under, load, save  # noqa: E402


def beasts():
    small = load('enemy_scavenger_small')
    wolf = recolor(small, to_hue=0.57, sat=0.18, val=1.35)                                    # белая шерсть с голубым отливом
    wolf = recolor(wolf, to_hue=0.52, sat=1.0, val=1.0, mask=lambda h, s, v: (s > 0.5) & (v > 0.6))   # глаза — ледяные
    save(glow_under(frost(wolf, 0.6), (170, 230, 255), 5, 0.35), 'enemy_frost_wolf')
    big = load('enemy_scavenger')
    alpha = recolor(big, to_hue=0.6, sat=0.3, val=1.2)
    save(glow_under(frost(alpha, 0.7), (150, 210, 255), 8, 0.5), 'enemy_frost_alpha')
    hound = recolor(big, to_hue=0.38, sat=0.25, val=0.75)                                     # могильный пёс — серо-зелёный
    save(glow_under(hound, (120, 255, 170), 6, 0.35), 'enemy_grave_hound')
    warden = recolor(load('enemy_guardian'), to_hue=0.33, sat=0.35, val=0.9)
    save(glow_under(warden, (120, 255, 170), 9, 0.4), 'enemy_barrow_warden')


def wisp():
    c = Cv(160, 200)
    c.glow(80, 90, 80, rgb('#7dffc0'), 0.7)
    c.poly([(80, 18), (112, 70), (118, 120), (100, 160), (84, 186), (76, 150), (58, 176), (48, 130), (44, 84)], (150, 255, 210, 200), rgb('#2f7a5a'), 2.6)
    c.poly([(80, 46), (100, 84), (98, 122), (80, 140), (62, 118), (62, 84)], (220, 255, 240, 230), None)
    c.ell(64, 88, 76, 102, rgb('#14352a'), None)
    c.ell(86, 88, 98, 102, rgb('#14352a'), None)
    c.save('enemy_grave_wisp')


def trees_and_ground():
    for src, dst in (('tree_dark_01', 'tree_frost_01'), ('tree_dark_02', 'tree_frost_02')):
        t = recolor(load(src), to_hue=0.55, sat=0.35, val=1.15, mask=lambda h, s, v: (h > 0.2) & (h < 0.95) & (s > 0.1))
        save(frost(t, 0.9), dst)
    dead = recolor(load('dead_tree_01'), to_hue=0.1, sat=0.2, val=0.75)
    save(dead, 'dead_tree_grey_01')
    g = load('grass_ground_01')
    snow = recolor(g, to_hue=0.58, sat=0.15, val=2.6)
    white = Image.new('RGBA', snow.size, (236, 244, 252, 255))
    snow = Image.blend(snow, white, 0.5)                       # снег: светлее и голубее, рисунок травы проступает
    save(snow, 'snow_ground_01')
    grave = recolor(g, to_hue=0.14, sat=0.3, val=1.35)
    save(grave, 'grave_ground_01')


def graves():
    for k, (w, h) in enumerate(((90, 110), (110, 96))):
        c = Cv(w + 20, h + 20)
        c.shadow((w + 20) / 2, h + 10, w * 0.45, 8)
        stone = rgb('#8a8f96') if k == 0 else rgb('#7a8078')
        if k == 0:
            c.poly([(14, h + 8), (14, 40), (24, 18), ((w + 20) / 2, 8), (w - 4, 18), (w + 6, 40), (w + 6, h + 8)], stone, OL, 3)
            c.line([((w + 20) / 2, 34), ((w + 20) / 2, 74)], rgb('#4a4f56'), 4)
            c.line([((w + 20) / 2 - 16, 48), ((w + 20) / 2 + 16, 48)], rgb('#4a4f56'), 4)
        else:
            c.rr(12, 30, w + 8, h + 8, 12, stone, OL, 3)
            c.line([(30, 56), (w - 10, 56)], rgb('#4a5048'), 3)
            c.line([(30, 72), (w - 26, 72)], rgb('#4a5048'), 3)
            c.poly([(w - 6, 30), (w + 8, 20), (w + 8, 40)], rgb('#5c8a5a'), OL, 1.6)    # мох
        c.save(f'gravestone_0{k + 1}')
    c = Cv(240, 220)                                  # склеп
    c.shadow(120, 210, 110, 12)
    c.poly([(20, 210), (20, 90), (120, 30), (220, 90), (220, 210)], rgb('#6e7378'), OL, 3)
    c.rr(86, 120, 154, 210, 6, rgb('#2a2d33'), OL, 3)
    c.line([(120, 124), (120, 206)], rgb('#14161a'), 2)
    c.glow(120, 170, 40, rgb('#7dffc0'), 0.35)
    c.save('crypt_01')
    c = Cv(110, 100)                                  # ледяной кристалл (место сбора)
    c.shadow(55, 92, 42, 8)
    for (x, hh, ww) in ((34, 70, 22), (56, 86, 26), (78, 60, 20)):
        c.poly([(x - ww / 2, 90), (x - ww / 3, 90 - hh), (x, 82 - hh), (x + ww / 3, 90 - hh * 0.95), (x + ww / 2, 90)], rgb('#bff0ff'), OL, 2.2)
    c.glow(55, 50, 40, rgb('#9fd8ff'), 0.5)
    c.save('ice_crystal_node_01')


def main():
    beasts(); wisp(); trees_and_ground(); graves()
    print('ok')


if __name__ == '__main__':
    main()
