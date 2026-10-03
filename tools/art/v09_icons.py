"""Иконка v0.9: «Сразиться снова» (маркер над врагом, которого можно вызвать на бой повторно).
Стиль v08_sprites.py. Запуск из корня репозитория:  python3 tools/art/v09_icons.py  ->  public/assets/sprites/icon_fight.png (64×64)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from v08_sprites import Cv, OL, rgb, lighter  # noqa: E402


def icon_fight(c):
    # скрещённые посох и коготь-кинжал на красном щите
    c.poly([(32, 4), (56, 12), (54, 38), (32, 60), (10, 38), (8, 12)], rgb('#b8343a'), OL, 2.6)
    c.poly([(32, 9), (51, 15), (49, 36), (32, 54)], lighter(rgb('#b8343a'), 0.15), None)
    for a, b in (((16, 18), (46, 48)), ((48, 18), (18, 48))):
        c.line([a, b], OL, 7)
    c.line([(16, 18), (46, 48)], rgb('#e8c56a'), 4)
    c.line([(48, 18), (18, 48)], rgb('#e8e2d0'), 4)
    c.ell(12, 14, 20, 22, rgb('#9fe9ff'), OL, 1.8)
    c.poly([(48, 14), (54, 12), (52, 20)], rgb('#e8e2d0'), OL, 1.6)


def main():
    out = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')
    c = Cv(64, 64)
    icon_fight(c)
    c.save('icon_fight')
    print('ok')


if __name__ == '__main__':
    main()
