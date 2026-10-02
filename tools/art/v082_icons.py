"""Иконки v0.8.2 (меню, HUD): меню/крестик, город, банк, рейтинг, чат, форум, настройки, сердце, капля.
Тот же стиль, что у v08_sprites.py: тёмный контур, тёплая заливка, рисунок в 4× и уменьшение.
Запуск из корня репозитория:  python3 tools/art/v082_icons.py   ->  public/assets/sprites/*.png (128×128)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from v08_sprites import Cv, OL, rgb, lighter, darker  # noqa: E402

N = 128
GOLD = rgb('#e8c56a')
GOLD_D = rgb('#a9802f')
PARCH = rgb('#f1e3c2')


def icon_menu(c):
    for y in (38, 64, 90):
        c.rr(26, y - 9, 102, y + 9, 9, GOLD, OL, 4)
        c.line([(34, y - 3), (94, y - 3)], lighter(GOLD, 0.45), 3)


def icon_close(c):
    a, b = (30, 30), (98, 98)
    a2, b2 = (98, 30), (30, 98)
    for p, q in ((a, b), (a2, b2)):
        c.line([p, q], OL, 26)
    for p, q in ((a, b), (a2, b2)):
        for pt in (p, q):
            c.ell(pt[0] - 13, pt[1] - 13, pt[0] + 13, pt[1] + 13, OL, None)
    for p, q in ((a, b), (a2, b2)):
        c.line([p, q], GOLD, 17)
        for pt in (p, q):
            c.ell(pt[0] - 8.5, pt[1] - 8.5, pt[0] + 8.5, pt[1] + 8.5, GOLD, None)


def icon_city(c):
    stone, stone_d, roof = rgb('#d8c9a8'), rgb('#a8957a'), rgb('#c8503a')
    c.grad_poly([(14, 112), (14, 66), (114, 66), (114, 112)], stone, stone_d, OL, 3.5)
    for x in range(14, 114, 16):        # зубцы стены
        c.rr(x, 58, x + 10, 68, 1, stone, OL, 3)
    c.grad_poly([(44, 112), (44, 46), (84, 46), (84, 112)], lighter(stone, 0.1), stone_d, OL, 3.5)
    c.poly([(40, 48), (64, 14), (88, 48)], roof, OL, 3.5)
    for x0 in (10, 92):
        c.grad_poly([(x0, 112), (x0, 56), (x0 + 26, 56), (x0 + 26, 112)], stone, stone_d, OL, 3.5)
        c.poly([(x0 - 4, 58), (x0 + 13, 30), (x0 + 30, 58)], darker(roof, 0.1), OL, 3.5)
    c.line([(64, 14), (64, 4)], OL, 3); c.poly([(64, 4), (80, 8), (64, 12)], rgb('#e0566a'), OL, 2)
    c.rr(54, 84, 74, 112, 9, rgb('#4a3324'), OL, 3)
    c.rr(58, 58, 70, 72, 5, rgb('#ffd27a'), OL, 2.5)


def icon_bank(c):
    def coin(x, y, w=44, h=14):
        c.grad_ell(x - w / 2, y - h / 2, x + w / 2, y + h / 2, lighter(GOLD, 0.25), GOLD_D, OL, 3)
    for i in range(5):                   # левая стопка
        c.grad_poly([(16, 104 - i * 12), (60, 104 - i * 12), (60, 112 - i * 12), (16, 112 - i * 12)], GOLD, GOLD_D, OL, 3)
        coin(38, 104 - i * 12)
    for i in range(3):                   # правая стопка
        c.grad_poly([(66, 104 - i * 12), (110, 104 - i * 12), (110, 112 - i * 12), (66, 112 - i * 12)], GOLD, GOLD_D, OL, 3)
        coin(88, 104 - i * 12)
    c.grad_ell(58, 22, 106, 70, lighter(GOLD, 0.35), GOLD_D, OL, 3.5)   # монета со звездой
    star = []
    for k in range(10):
        r = 15 if k % 2 == 0 else 7
        a = -math.pi / 2 + k * math.pi / 5
        star.append((82 + math.cos(a) * r, 46 + math.sin(a) * r))
    c.poly(star, rgb('#fff1b8'), darker(GOLD_D, 0.2), 2)


def icon_rating(c):
    c.rr(40, 98, 88, 114, 4, rgb('#6a4a30'), OL, 3)
    c.rr(52, 84, 76, 100, 3, GOLD_D, OL, 3)
    c.arc((14, 28, 50, 70), 90, 270, OL, 9); c.arc((14, 28, 50, 70), 90, 270, GOLD, 4)
    c.arc((78, 28, 114, 70), 270, 90, OL, 9); c.arc((78, 28, 114, 70), 270, 90, GOLD, 4)
    c.grad_poly([(30, 18), (98, 18), (92, 54), (76, 76), (52, 76), (36, 54)], lighter(GOLD, 0.35), GOLD_D, OL, 3.5)
    c.poly([(58, 76), (70, 76), (72, 86), (56, 86)], GOLD_D, OL, 3)
    star = []
    for k in range(10):
        r = 13 if k % 2 == 0 else 6
        a = -math.pi / 2 + k * math.pi / 5
        star.append((64 + math.cos(a) * r, 42 + math.sin(a) * r))
    c.poly(star, rgb('#fff1b8'), darker(GOLD_D, 0.2), 2)


def icon_chat(c):
    blue, blue_d = rgb('#7ab8ef'), rgb('#3f7fb8')
    c.grad_ell(46, 44, 120, 98, lighter(blue, 0.15), blue_d, OL, 3.5)
    c.poly([(98, 92), (114, 112), (84, 96)], blue_d, OL, 3)
    c.grad_ell(8, 14, 88, 72, rgb('#fbf3df'), rgb('#d8c9a8'), OL, 3.5)
    c.poly([(24, 64), (14, 88), (44, 70)], rgb('#d8c9a8'), OL, 3)
    for x in (30, 48, 66):
        c.ell(x - 5, 38, x + 5, 48, OL, None)


def icon_forum(c):
    c.grad_poly([(22, 22), (92, 22), (92, 104), (22, 104)], PARCH, rgb('#d8c4a0'), OL, 3.5)
    c.grad_ell(12, 14, 34, 32, PARCH, rgb('#c9b48a'), OL, 3)
    c.grad_ell(80, 96, 102, 114, PARCH, rgb('#c9b48a'), OL, 3)
    for y in (42, 56, 70, 84):
        c.line([(32, y), (72 - (y == 84) * 14, y)], rgb('#a8977a'), 3)
    # перо
    c.poly([(118, 8), (96, 30), (66, 82), (74, 86), (104, 40)], rgb('#6a7cff'), OL, 3.5)
    c.line([(114, 14), (72, 82)], rgb('#c9d0ff'), 2.5)
    c.line([(68, 84), (60, 98)], OL, 3.5)


def icon_settings(c):
    steel, steel_d = rgb('#d4d0c8'), rgb('#8a8680')
    pts = []
    teeth = 8
    for k in range(teeth * 4):
        a = k / (teeth * 4) * math.tau
        r = 54 if (k % 4) in (1, 2) else 42
        pts.append((64 + math.cos(a) * r, 64 + math.sin(a) * r))
    c.grad_poly(pts, lighter(steel, 0.2), steel_d, OL, 3.5)
    c.grad_ell(36, 36, 92, 92, steel_d, lighter(steel, 0.1), OL, 3)
    c.grad_ell(48, 48, 80, 80, lighter(GOLD, 0.2), GOLD_D, OL, 3)
    c.ell(56, 56, 72, 72, rgb('#2a1d14'), OL, 2)


def icon_heart(c):
    pts = []
    for i in range(64):
        t = i / 64 * math.tau
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((64 + x * 3.3, 62 + y * 3.3))
    c.grad_poly(pts, rgb('#ff6a6a'), rgb('#b0202c'), OL, 4)
    c.ell(34, 34, 52, 50, (255, 255, 255, 150), None)


def icon_drop(c):
    pts = []
    for i in range(64):
        t = i / 64 * math.tau
        r = 34
        x = 64 + math.sin(t) * r * (1 - 0.0 * math.cos(t))
        y = 76 + math.cos(t) * r
        if math.cos(t) < 0:                 # верхняя половина вытягивается в острие
            k = -math.cos(t)
            x = 64 + math.sin(t) * r * (1 - k) ** 0.9
            y = 76 - k * 66
        pts.append((x, y))
    c.grad_poly(pts, rgb('#8fd8ff'), rgb('#2a6fc0'), OL, 4)
    c.ell(48, 70, 60, 90, (255, 255, 255, 150), None)


def main():
    out = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')
    os.makedirs(out, exist_ok=True)
    for name, fn in [('icon_menu', icon_menu), ('icon_close', icon_close), ('icon_city', icon_city), ('icon_bank', icon_bank),
                     ('icon_rating', icon_rating), ('icon_chat', icon_chat), ('icon_forum', icon_forum),
                     ('icon_settings', icon_settings), ('icon_heart', icon_heart), ('icon_drop', icon_drop)]:
        c = Cv(N, N)
        fn(c)
        c.save(name)
    print('ok')


if __name__ == '__main__':
    main()
