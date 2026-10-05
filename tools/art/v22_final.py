"""Арт финала главы II (лаборатория, Ковены, финал): добровольцы, конструкт, Северин-босс, Ровена, Тихон — перекраска ваших
спрайтов; астральный барьер, нестабильная печать и разлом — рисованные.
Запуск из корня репозитория:  python3 tools/art/v22_final.py  ->  public/assets/sprites/*.png
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from v08_sprites import Cv, OL, rgb  # noqa: E402
from v19_items import recolor, frost, glow_under, load, save  # noqa: E402
from v20_city import band, portrait_from  # noqa: E402

ICE = rgb('#bff0ff'); ICE_M = rgb('#8fd8f0'); VIOLET = rgb('#c77dff'); VIOLET_D = rgb('#7a3fc0')


def people():
    # Тихон — доброволец эксперимента, уже стабилизированный: охотник Горан в серо-голубом, с инеем на плечах
    for src, dst in (('npc_goran', 'npc_tikhon'), ('portrait_goran', 'portrait_tikhon')):
        im = recolor(load(src), to_hue=0.58, sat=0.45, val=1.0, mask=band(0.105, 0.5, 0.18))    # оливковые шляпа и плащ → серо-голубые
        im = recolor(im, to_hue=0.6, sat=0.3, val=0.9, mask=lambda h, s, v: (h < 0.1) & (s > 0.45) & (v < 0.6))   # тёмная кожа куртки → холодная
        save(frost(im, 0.45), dst)
    # Ровена — глава Ковена Пепельной Луны: Селена в тёплых пепельно-янтарных тонах
    for src, dst in (('npc_selena', 'npc_rowena'), ('portrait_selena', 'portrait_rowena')):
        im = recolor(load(src), to_hue=0.08, sat=0.55, val=0.8, mask=lambda h, s, v: (h > 0.45) & (h < 0.8) & (s > 0.08))   # голубое → янтарное
        im = recolor(im, to_hue=0.75, sat=0.25, val=0.78, mask=lambda h, s, v: (v > 0.8) & (s < 0.12))                   # белые волосы → пепельно-лиловые
        save(im, dst)
    # Доброволец без контроля: тот же силуэт, что у Тихона, но в нестабильном холоде (лиловое свечение)
    vol = recolor(load('npc_goran'), to_hue=0.72, sat=0.6, val=0.85, mask=band(0.105, 0.5, 0.18))
    vol = recolor(vol, to_hue=0.72, sat=0.5, val=0.8, mask=lambda h, s, v: (h < 0.1) & (s > 0.45) & (v < 0.6))
    save(glow_under(frost(vol, 0.8), (199, 125, 255), 8, 0.55), 'enemy_volunteer')
    # Экспериментальный конструкт: каменный страж леса, перекрашенный в лиловый лёд
    g = recolor(load('enemy_guardian'), to_hue=0.72, sat=0.45, val=1.0)
    save(glow_under(frost(g, 0.6), (199, 125, 255), 9, 0.5), 'enemy_experimental_construct')
    # Северин в эксперименте: его спрайт с инеем и холодным сиянием
    sev = load('npc_severin')
    w, h = sev.size
    big = sev.resize((int(w * 1.25), int(h * 1.25)), Image.LANCZOS)
    canvas = Image.new('RGBA', (big.width + 40, big.height + 30), (0, 0, 0, 0))
    canvas.alpha_composite(big, (20, 15))
    save(glow_under(frost(canvas, 0.7), (150, 220, 255), 12, 0.6), 'enemy_severin')


def astral_ward():
    """Астральный барьер на двери Дуэльного зала: светящаяся завеса с рунами."""
    c = Cv(220, 180)
    c.shadow(110, 170, 96, 10)
    c.glow(110, 96, 100, rgb('#b59cff'), 0.55)
    c.poly([(20, 170), (24, 40), (60, 18), (160, 18), (196, 40), (200, 170)], (170, 150, 255, 120), rgb('#6b52c8'), 3)
    for k in range(5):
        x = 46 + k * 32
        c.line([(x, 40), (x + 8, 160)], (230, 220, 255, 170), 2)
    for (x, y) in ((70, 70), (150, 70), (110, 110), (70, 140), (150, 140)):
        c.ell(x - 9, y - 9, x + 9, y + 9, (240, 230, 255, 220), rgb('#6b52c8'), 2)
    c.save('astral_ward_01')


def unstable_seal():
    """Нестабильная печать на двери лаборатории и разлом на площади; замёрзшие — успокоенный лёд."""
    for name, w, hh, door in (('lab_seal_01', 200, 170, True), ('rift_01', 200, 150, False)):
        for frozen in (False, True):
            c = Cv(w, hh)
            c.shadow(w / 2, hh - 10, w * 0.42, 10)
            if door:
                c.rr(30, 20, w - 30, hh - 8, 10, rgb('#4a3a4a'), OL, 3)
                c.line([(w / 2, 24), (w / 2, hh - 12)], rgb('#2e242e'), 3)
            core = ICE if frozen else VIOLET
            edge = ICE_M if frozen else VIOLET_D
            cx, cy = w / 2, hh * 0.55
            if frozen:
                c.poly([(cx - 60, cy + 40), (cx - 40, cy - 40), (cx, cy - 56), (cx + 44, cy - 36), (cx + 60, cy + 40)], (200, 240, 255, 220), OL, 2.4)
                for a in range(6):
                    t = a * math.pi / 3
                    c.line([(cx, cy), (cx + math.cos(t) * 40, cy + math.sin(t) * 30)], (255, 255, 255, 230), 2)
                c.glow(cx, cy, 60, ICE, 0.4)
            else:
                c.glow(cx, cy, 80, VIOLET, 0.7)
                for r in (52, 38, 24):
                    c.arc((cx - r, cy - r * 0.7, cx + r, cy + r * 0.7), 20 + r, 320 + r, edge, 4)
                c.ell(cx - 14, cy - 10, cx + 14, cy + 10, core, OL, 2)
                for a in range(5):
                    t = a * 1.3
                    c.line([(cx + math.cos(t) * 30, cy + math.sin(t) * 22), (cx + math.cos(t) * 62, cy + math.sin(t) * 44)], (230, 190, 255, 200), 2)
            c.save(name.replace('_01', '_frozen_01') if frozen else name)


def main():
    people(); astral_ward(); unstable_seal()
    print('ok')


if __name__ == '__main__':
    main()
