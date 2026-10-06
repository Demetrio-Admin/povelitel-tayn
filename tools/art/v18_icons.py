"""Иконки v0.17–0.18: дар «Лёд» (icon_ice) и сапфир (icon_sapphire). Стиль v08_sprites.py.
Запуск из корня репозитория:  python3 tools/art/v18_icons.py  ->  public/assets/sprites/icon_ice.png, icon_sapphire.png (64×64)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from v08_sprites import Cv, OL, rgb, lighter, darker  # noqa: E402

ICE = rgb('#9fe6ff')
ICE_D = rgb('#4fa8d8')
ICE_L = rgb('#e8fbff')


def icon_ice(c):
    """Шестилучевая ледяная звезда-кристалл с сиянием."""
    cx, cy = 32, 32
    c.glow(cx, cy, 30, ICE, 0.7)
    # шесть лучей-кристаллов
    for k in range(6):
        a = math.radians(k * 60 - 90)
        ux, uy = math.cos(a), math.sin(a)
        px, py = -uy, ux
        tip = (cx + ux * 30, cy + uy * 30)
        base = (cx + ux * 6, cy + uy * 6)
        w = 6.0
        pts = [(base[0] + px * w, base[1] + py * w), (cx + ux * 22 + px * 5.0, cy + uy * 22 + py * 5.0), tip,
               (cx + ux * 22 - px * 5.0, cy + uy * 22 - py * 5.0), (base[0] - px * w, base[1] - py * w)]
        c.poly(pts, ICE if k % 2 == 0 else lighter(ICE, 0.25), OL, 2.0)
        # блик на луче
        c.line([(cx + ux * 9 + px * 1.6, cy + uy * 9 + py * 1.6), (cx + ux * 22 + px * 1.6, cy + uy * 22 + py * 1.6)], ICE_L, 2.6)
        # боковые веточки
        for d in (15,):
            bx, by = cx + ux * d, cy + uy * d
            for s in (1, -1):
                bpx, bpy = math.cos(a + s * math.radians(55)), math.sin(a + s * math.radians(55))
                c.line([(bx, by), (bx + bpx * 9, by + bpy * 9)], OL, 5.6)
                c.line([(bx, by), (bx + bpx * 8.2, by + bpy * 8.2)], ICE_L, 3.0)
    # сердцевина
    hexp = [(cx + 9.5 * math.cos(math.radians(k * 60)), cy + 7.5 * math.sin(math.radians(k * 60))) for k in range(6)]
    c.poly(hexp, ICE_D, OL, 2.0)
    c.poly([(cx + 5 * math.cos(math.radians(k * 60)), cy - 1 + 5 * math.sin(math.radians(k * 60))) for k in range(6)], ICE_L, None)


def icon_sapphire(c):
    """Гранёный синий самоцвет."""
    B = rgb('#3a6fe0')
    c.glow(32, 32, 30, rgb('#6fa8ff'), 0.6)
    top = [(14, 24), (22, 12), (42, 12), (50, 24)]
    c.poly([(14, 24), (22, 12), (42, 12), (50, 24), (32, 56)], B, OL, 2.4)
    c.poly([(22, 12), (42, 12), (38, 24), (26, 24)], lighter(B, 0.45), None)
    c.poly([(14, 24), (26, 24), (32, 56)], darker(B, 0.2), None)
    c.poly([(50, 24), (38, 24), (32, 56)], lighter(B, 0.15), None)
    c.poly([(26, 24), (38, 24), (32, 56)], lighter(B, 0.3), None)
    c.line([(14, 24), (50, 24)], OL, 1.6)
    c.line([(26, 24), (32, 56), (38, 24)], OL, 1.2)
    c.line([(22, 12), (26, 24)], OL, 1.2)
    c.line([(42, 12), (38, 24)], OL, 1.2)
    c.line([(25, 15), (30, 15)], rgb('#ffffff'), 2)


def main():
    c = Cv(64, 64); icon_ice(c); c.save('icon_ice')
    c = Cv(64, 64); icon_sapphire(c); c.save('icon_sapphire')
    print('ok')


if __name__ == '__main__':
    main()
