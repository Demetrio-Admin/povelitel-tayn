"""«Живой мир» (v0.28.0): птица (2 кадра), белка (2 кадра), заяц (2 кадра), лист. Процедурные, в стиле игры.
Запуск из корня репозитория:  python3 tools/art/v28_life.py  ->  public/assets/sprites/life_*.png
Все зверьки смотрят ВПРАВО (влево игра разворачивает зеркально). Pivot — нижний центр.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from v08_sprites import Cv, OL, rgb  # noqa: E402


def bird(wings_up):
    c = Cv(44, 28)
    body = rgb('#4a3a34'); belly = rgb('#8a6e5c'); wing = rgb('#3a2c28')
    if wings_up:
        c.poly([(18, 15), (10, 2), (22, 8), (26, 15)], wing, OL, 1.6)
    else:
        c.poly([(18, 15), (8, 25), (22, 21), (26, 16)], wing, OL, 1.6)
    c.ell(10, 11, 34, 21, body, OL, 1.8)
    c.ell(14, 15, 30, 21, belly, None)
    c.poly([(8, 14), (1, 11), (3, 18)], wing, OL, 1.4)          # хвост
    c.ell(30, 8, 40, 17, body, OL, 1.6)                          # голова
    c.poly([(39, 11), (44, 13), (39, 14)], rgb('#e8b04a'), OL, 1.2)
    c.ell(35, 10, 37, 12, rgb('#ffffff'), None)
    if wings_up:
        c.poly([(22, 13), (30, 1), (28, 12)], wing, OL, 1.6)
    else:
        c.poly([(22, 17), (32, 26), (28, 16)], wing, OL, 1.6)
    return c


def squirrel(stretch):
    c = Cv(60, 46)
    c.shadow(30, 42, 18, 3, 55)
    fur = rgb('#b8642c'); fur_l = rgb('#e09a5a'); belly = rgb('#f2dcc0')
    # хвост пышной дугой над спиной
    c.grad_ell(2, 2, 24, 34, fur_l, fur, OL, 1.8)
    c.arc((2, 2, 24, 34), 200, 340, rgb('#7a3e1a'), 2)
    if stretch:   # прыжок: тело вытянуто, лапы вперёд и назад
        c.grad_ell(16, 18, 44, 34, fur_l, fur, OL, 1.8)
        c.ell(26, 26, 40, 34, belly, None)
        c.line([(38, 30), (50, 34)], OL, 3); c.line([(20, 31), (8, 38)], OL, 3)
    else:         # сжатая поза
        c.grad_ell(16, 20, 42, 38, fur_l, fur, OL, 1.8)
        c.ell(26, 29, 40, 38, belly, None)
        c.line([(36, 38), (40, 43)], OL, 3); c.line([(22, 38), (18, 43)], OL, 3)
    c.grad_ell(38, 14, 54, 28, fur_l, fur, OL, 1.8)             # голова
    c.poly([(41, 15), (42, 7), (47, 14)], fur, OL, 1.4)
    c.ell(48, 19, 51, 22, OL, None); c.ell(53, 21, 56, 24, OL, None)
    c.ell(46, 18, 47.5, 19.5, rgb('#ffffff'), None)
    return c


def rabbit(stretch):
    c = Cv(60, 42)
    c.shadow(30, 38, 18, 3, 55)
    fur = rgb('#a89480'); fur_l = rgb('#d6c6ae'); inner = rgb('#e8a0a8')
    if stretch:
        c.grad_ell(10, 14, 42, 32, fur_l, fur, OL, 1.8)
        c.line([(36, 28), (50, 33)], OL, 3); c.line([(14, 28), (2, 34)], OL, 3)
        c.ell(8, 18, 16, 26, rgb('#ffffff'), OL, 1.2)             # хвост
    else:
        c.grad_ell(10, 18, 40, 38, fur_l, fur, OL, 1.8)
        c.ell(6, 24, 15, 32, rgb('#ffffff'), OL, 1.2)
        c.line([(34, 37), (40, 40)], OL, 3); c.line([(16, 37), (10, 40)], OL, 3)
    c.grad_ell(36, 12, 54, 28, fur_l, fur, OL, 1.8)             # голова
    c.poly([(40, 14), (38, 1), (44, 3), (46, 14)], fur, OL, 1.5)  # уши
    c.poly([(46, 13), (46, 1), (51, 5), (50, 14)], fur, OL, 1.5)
    c.poly([(40, 12), (40, 4), (43, 5), (44, 12)], inner, None)
    c.ell(48, 17, 51, 20, OL, None); c.ell(52, 21, 55, 24, rgb('#e8a0a8'), OL, 1)
    c.ell(46, 16, 47.5, 17.5, rgb('#ffffff'), None)
    return c


def leaf():
    c = Cv(18, 12)
    c.poly([(1, 6), (7, 1), (15, 3), (17, 6), (13, 10), (6, 11)], rgb('#ffffff'), None)
    c.line([(2, 6), (15, 6)], rgb('#c8c8c8'), 1)
    return c


def main():
    bird(True).save('life_bird_1'); bird(False).save('life_bird_2')
    squirrel(False).save('life_squirrel_1'); squirrel(True).save('life_squirrel_2')
    rabbit(False).save('life_rabbit_1'); rabbit(True).save('life_rabbit_2')
    leaf().save('life_leaf')
    print('life_* готовы')


if __name__ == '__main__':
    main()
