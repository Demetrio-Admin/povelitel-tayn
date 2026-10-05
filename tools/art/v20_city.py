"""Арт главы II, часть 1 (город): персонажи и враг — перекраска ваших спрайтов (стиль совпадает), реквизит города — рисованный.
Запуск из корня репозитория:  python3 tools/art/v20_city.py  ->  public/assets/sprites/*.png
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from v08_sprites import Cv, OL, rgb, lighter, darker  # noqa: E402
from v19_items import recolor, frost, glow_under, load, save  # noqa: E402

SP = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')


def portrait_from(sprite, box, name):
    """Портрет 128×128 — увеличенная голова со спрайта (так же сделаны портреты главы I)."""
    crop = sprite.crop(box).resize((128, 128), Image.LANCZOS)
    save(crop, name)


def band(lo, hi, smin=0.15):
    return lambda h, s, v: (h >= lo) & (h < hi) & (s > smin)


# ---------------------------------------------------------------- персонажи
def npcs():
    # Илария Восс — архивист: травница Веда в строгих сине-серых тонах
    veda, pv = load('npc_veda'), load('portrait_veda')
    def ilaria(im):
        im = recolor(im, to_hue=0.6, sat=0.55, val=0.85, mask=band(0.2, 0.5))     # зелёное → сине-серое
        im = recolor(im, to_hue=0.62, sat=0.6, val=0.9, mask=band(0.7, 0.95))      # лиловое → синее
        im = recolor(im, hue=-0.01, sat=0.65, val=0.55, mask=lambda h, s, v: ((h < 0.1) | (h > 0.95)) & (s > 0.4) & (v < 0.9) & (v > 0.25))   # волосы — тёмно-каштановые
        return im
    save(ilaria(veda), 'npc_ilaria'); save(ilaria(pv), 'portrait_ilaria')
    # Торговец — охотник Горан в бордовом и горчичном
    goran, pg = load('npc_goran'), load('portrait_goran')
    def merchant(im):
        im = recolor(im, to_hue=0.97, sat=0.85, val=0.9, mask=band(0.105, 0.5, 0.06))    # зелёный плащ и шляпа → бордовые
        return im
    save(merchant(goran), 'npc_merchant'); save(merchant(pg), 'portrait_merchant')
    # Банкир — Мирра в зелени и золоте
    mirra, pm = load('npc_mirra'), load('portrait_mirra')
    def banker(im):
        return recolor(im, to_hue=0.4, sat=0.7, val=0.85, mask=band(0.68, 0.95))
    save(banker(mirra), 'npc_banker'); save(banker(pm), 'portrait_banker')
    # Северин Вейр — колдун в тёмно-синем с серебром; портрет — голова со спрайта
    war = load('warlock_down')
    sev = recolor(war, to_hue=0.63, sat=0.7, val=0.7, mask=band(0.68, 0.98))
    sev = recolor(sev, to_hue=0.55, sat=0.25, val=1.1, mask=lambda h, s, v: ((h < 0.11) | (h > 0.95)) & (s > 0.4) & (v > 0.35))   # рыжие волосы → седые
    save(sev, 'npc_severin')
    w, h = sev.size
    portrait_from(sev, (int(w * 0.18), int(h * 0.02), int(w * 0.82), int(h * 0.02 + w * 0.64)), 'portrait_severin')
    # Дуэлянт у Дуэльного зала — колдун в алом
    duel = recolor(war, to_hue=0.0, sat=0.95, val=0.85, mask=band(0.68, 0.98))
    save(duel, 'npc_duelist')
    portrait_from(duel, (int(w * 0.18), int(h * 0.02), int(w * 0.82), int(h * 0.02 + w * 0.64)), 'portrait_duelist')


# ---------------------------------------------------------------- враг
def enemies():
    small = load('enemy_scavenger_small')
    critter = recolor(small, to_hue=0.55, sat=0.35, val=1.25)
    save(glow_under(frost(critter, 0.7), (170, 235, 255), 6, 0.45), 'enemy_frost_critter')


# ---------------------------------------------------------------- реквизит города
STONE = rgb('#9a9a9e'); STONE_D = rgb('#6a6a72'); STONE_L = rgb('#c4c4ca')
WOOD = rgb('#9a6a3c'); WOOD_D = rgb('#5a3a22'); WOOD_L = rgb('#c4915a')
ICE = rgb('#bff0ff')


def fountain():
    c = Cv(240, 200)
    c.shadow(120, 168, 104, 22)
    c.ell(16, 96, 224, 182, STONE_D, OL, 3)
    c.ell(20, 92, 220, 170, STONE, OL, 3)
    c.ell(36, 102, 204, 160, rgb('#7fc8e8'), OL, 2.4)          # вода подо льдом
    c.ell(44, 108, 196, 154, ICE, None)
    for x0, y0, x1, y1 in ((60, 118, 120, 126), (130, 132, 182, 138), (80, 140, 110, 144)):
        c.line([(x0, y0), (x1, y1)], rgb('#ffffff'), 2)        # трещины льда
    c.rr(104, 40, 136, 128, 8, STONE_L, OL, 2.4)                # колонна
    c.ell(84, 30, 156, 58, STONE, OL, 2.4)                       # верхняя чаша
    c.ell(92, 34, 148, 52, ICE, None)
    for x in (92, 108, 132, 146):                                # сосульки
        c.poly([(x, 52), (x + 6, 52), (x + 3, 72)], ICE, OL, 1.4)
    c.save('fountain_frozen')


def crate():
    c = Cv(120, 110)
    c.shadow(60, 98, 50, 10)
    c.rr(12, 18, 108, 98, 4, WOOD, OL, 3)
    c.rr(12, 18, 108, 34, 3, WOOD_L, OL, 2.4)
    for x in (34, 60, 86):
        c.line([(x, 36), (x, 96)], WOOD_D, 2)
    c.line([(16, 40), (104, 94)], WOOD_D, 5)
    c.line([(16, 40), (104, 94)], WOOD_L, 2.4)
    c.save('crate_01')


def barrel():
    c = Cv(90, 120)
    c.shadow(45, 110, 36, 9)
    c.rr(14, 14, 76, 108, 22, WOOD, OL, 3)
    c.ell(16, 8, 74, 28, WOOD_L, OL, 2.4)
    for y in (36, 86):
        c.line([(16, y), (74, y)], rgb('#4a4a50'), 5)
    c.save('barrel_01')


def stall():
    c = Cv(260, 220)
    c.shadow(130, 204, 116, 14)
    c.rr(30, 120, 230, 196, 6, WOOD, OL, 3)                      # прилавок
    c.rr(30, 120, 230, 136, 4, WOOD_L, OL, 2.2)
    for x in (40, 214):
        c.rr(x, 40, x + 10, 196, 3, WOOD_D, OL, 2.2)             # стойки
    pts = [(14, 70), (130, 26), (246, 70)]
    c.poly([(14, 70), (246, 70), (246, 92), (14, 92)], rgb('#b8343a'), OL, 2.4)   # навес
    for i in range(6):
        x0 = 14 + i * 232 / 6
        if i % 2 == 0:
            c.poly([(x0, 70), (x0 + 232 / 6, 70), (x0 + 232 / 6, 92), (x0, 92)], rgb('#f1e3c2'), None)
    c.poly([(14, 70), (130, 34), (246, 70)], rgb('#c84a4a'), OL, 2.4)
    for i, col in enumerate(('#9fe9ff', '#e8b04a', '#8fe39a', '#c9a2ff')):
        c.ell(60 + i * 40, 104, 84 + i * 40, 124, rgb(col), OL, 1.8)   # товары
    c.save('market_stall_01')


def board():
    c = Cv(160, 180)
    c.shadow(80, 170, 60, 9)
    for x in (30, 122):
        c.rr(x, 60, x + 10, 172, 3, WOOD_D, OL, 2.2)
    c.rr(14, 20, 146, 128, 6, WOOD, OL, 3)
    c.rr(22, 28, 138, 120, 4, rgb('#c9a46a'), None)
    for (x, y, col) in ((30, 36, '#f1e3c2'), (78, 40, '#e8e2d0'), (40, 76, '#f6efd9'), (90, 80, '#efe4c4')):
        c.rr(x, y, x + 40, y + 34, 2, rgb(col), OL, 1.4)
        c.line([(x + 6, y + 12), (x + 32, y + 12)], rgb('#8a7a62'), 1.4)
        c.line([(x + 6, y + 20), (x + 28, y + 20)], rgb('#8a7a62'), 1.4)
        c.ell(x + 17, y - 3, x + 23, y + 3, rgb('#b8343a'), OL, 1)
    c.save('notice_board_01')


def frost_patch():
    c = Cv(220, 120)
    rng = np.random.default_rng(7)
    c.ell(10, 20, 210, 110, (210, 245, 255, 150), None)
    c.ell(40, 34, 180, 96, (235, 252, 255, 170), None)
    for _ in range(14):
        x, y = rng.uniform(30, 190), rng.uniform(36, 96)
        a = rng.uniform(0, math.pi)
        c.line([(x, y), (x + math.cos(a) * 18, y + math.sin(a) * 8)], (255, 255, 255, 200), 1.6)
    c.save('frost_patch_01')


def lamp():
    c = Cv(70, 200)
    c.shadow(35, 194, 22, 6)
    c.rr(31, 50, 39, 194, 3, rgb('#3a3a42'), OL, 2)
    c.rr(16, 20, 54, 58, 6, rgb('#3a3a42'), OL, 2.4)
    c.rr(22, 26, 48, 52, 4, rgb('#bfe9ff'), None)                 # магический фонарь — холодный свет
    c.glow(35, 38, 30, rgb('#bfe9ff'), 0.7)
    c.poly([(14, 22), (35, 6), (56, 22)], rgb('#4a4a52'), OL, 2.2)
    c.save('city_lamp_01')


def main():
    npcs(); enemies()
    fountain(); crate(); barrel(); stall(); board(); frost_patch(); lamp()
    print('ok')


if __name__ == '__main__':
    main()
