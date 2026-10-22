"""Прототипы «живого города» (docs/design/city-life-20261022.md): горожане, собаки, кошки, вороны.

Запуск из корня репозитория:
    python3 tools/art/city_life_art.py             -> public/assets/city-life/*.webp
    python3 tools/art/city_life_art.py --preview   -> ещё и docs/design/city-life/preview.png (все кадры на одном листе)

Горожане: берём нарисованных жителей (chapter2/resident_man, resident_woman), перекрашиваем одежду и собираем кадры ходьбы —
корпус остаётся, ноги разделяются и по очереди шагают, корпус чуть качается. Кадр 0 — «стоит», 1–4 — цикл шага.
Звери и вороны: собаки и кошки нарисованы кодом в той же тёплой «книжной» манере (тёмно-коричневый контур, мягкая тень),
вороны — перекрашенная малиновка из леса. Всё это ПРОТОТИПЫ: заменяются нарисованными файлами с теми же именами, код менять не нужно.
Спрайты смотрят вправо, влево игра зеркалит; точка опоры — низ по центру.
"""
import colorsys
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from ch3_lib import Canvas, gradient_map, outline, save_webp  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'public', 'assets', 'city-life')
INK = (68, 38, 28)           # тёплый тёмно-коричневый контур, как у нарисованных персонажей
os.makedirs(OUT, exist_ok=True)


# ------------------------------------------------------------------ перекраска
def _hsv(arr):
    rgb = arr[:, :, :3] / 255.0
    mx, mn = rgb.max(2), rgb.min(2)
    d = mx - mn
    h = np.zeros_like(mx)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    m = d > 1e-6
    rc = m & (mx == r); gc = m & (mx == g) & ~rc; bc = m & ~rc & ~gc
    h[rc] = ((g - b)[rc] / d[rc]) % 6
    h[gc] = (b - r)[gc] / d[gc] + 2
    h[bc] = (r - g)[bc] / d[bc] + 4
    h = h / 6.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def _rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    out = np.zeros(h.shape + (3,), np.float32)
    for k, (a, b, c) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k
        out[m, 0], out[m, 1], out[m, 2] = a[m], b[m], c[m]
    return out * 255


def recolor(img, rules):
    """rules: список {hue:(a,b) в градусах, sat:(min,max), val:(min,max), rows:(y0,y1), to:градусы, s:(множитель, прибавка), v:множитель}.
    Пиксели, подходящие под правило, получают новый оттенок; насыщенность и яркость сохраняют рисунок (тени остаются тенями)."""
    arr = np.asarray(img.convert('RGBA')).astype(np.float32)
    h, s, v = _hsv(arr)
    H, S, V = h.copy(), s.copy(), v.copy()
    yy = np.arange(arr.shape[0])[:, None] * np.ones((1, arr.shape[1]))
    for r in rules:
        a, b = r.get('hue', (0, 360))
        hd = h * 360
        m = (hd >= a) & (hd <= b) if a <= b else (hd >= a) | (hd <= b)
        lo, hi = r.get('sat', (0, 1)); m &= (s >= lo) & (s <= hi)
        lo, hi = r.get('val', (0, 1)); m &= (v >= lo) & (v <= hi)
        if 'rows' in r: m &= (yy >= r['rows'][0]) & (yy < r['rows'][1])
        if 'cols' in r: m &= (np.arange(arr.shape[1])[None, :] >= r['cols'][0]) & (np.arange(arr.shape[1])[None, :] < r['cols'][1])
        m &= arr[:, :, 3] > 8
        if 'to' in r: H = np.where(m, r['to'] / 360.0, H)
        mul, add = r.get('s', (1, 0)); S = np.where(m, np.clip(s * mul + add, 0, 1), S)
        V = np.where(m, np.clip(v * r.get('v', 1.0), 0, 1), V)
    rgb = _rgb(H, S, V)
    out = arr.copy(); out[:, :, :3] = np.where((arr[:, :, 3] > 0)[:, :, None], rgb, arr[:, :, :3])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')


# ------------------------------------------------------------------ ходьба из готового рисунка
def walk_frames(base, cut, split, lift=16, swing=7, bob=7, sway=2.2, out_h=240, feet_only=False):
    """base — рисунок человека (RGBA, лицом к зрителю). cut — строка, ниже которой начинаются ноги; split — x между левой и правой ногой.
    Возвращает [кадр0 (стоит), кадр1..4 (цикл шага)] уменьшенные до высоты out_h."""
    W, H = base.size
    arr = np.asarray(base).copy()
    legs = arr.copy(); legs[:cut, :, 3] = 0
    upper = arr.copy(); upper[cut + 10:, :, 3] = 0          # перекрытие 10 px: поднятая нога прячется под корпусом
    L, R = legs.copy(), legs.copy(); L[:, split:, 3] = 0; R[:, :split, 3] = 0
    L, R, U = (Image.fromarray(a, 'RGBA') for a in (L, R, upper))
    # (подъём левой, подъём правой, вынос левой, вынос правой, подъём корпуса, наклон корпуса)
    phases = [(lift, 0, 4, -4, 0, sway), (0, 0, 0, 0, bob, 0), (0, lift, -4, 4, 0, -sway), (0, 0, 0, 0, bob, 0)]
    frames = [base.copy()]
    pad = 24
    for lL, lR, sL, sR, rise, tilt in phases:
        cv = Image.new('RGBA', (W + pad * 2, H + pad * 2), (0, 0, 0, 0))
        for part, up, dx in ((R, lR, sR), (L, lL, sL)):
            cv.alpha_composite(part, (pad + int(dx * swing / 4), pad - int(up)))
        body = U.rotate(tilt, resample=Image.BICUBIC, center=(W // 2, cut), translate=(0, -rise))
        cv.alpha_composite(body, (pad, pad))
        frames.append(cv.crop((pad, pad, pad + W, pad + H)))
    k = out_h / H
    return [f.resize((round(W * k), out_h), Image.LANCZOS) for f in frames]


MAN_CUT, MAN_SPLIT = 380, 143
WOMAN_CUT, WOMAN_SPLIT = 414, 176

# Правила привязаны к областям рисунка (сетка 50 px): у мужчины кепка и жилет — серо-голубые (волосы и борода остаются седыми);
# у женщины платок и бант красные, шаль мягко-коричневая, юбка и фартук оранжевые. Кожа и волосы не трогаются.
_MAN_GARMENT = {'hue': (100, 270), 'sat': (0.04, 0.6), 'rows': (0, 312)}                      # кепка и жилет
_MAN_VEST = {'hue': (0, 360), 'sat': (0, 0.2), 'val': (0.2, 0.62), 'rows': (160, 312), 'cols': (50, 240)}  # жилет (тёмный, почти без цвета)
_WOMAN_KERCHIEF = {'hue': (338, 14), 'sat': (0.45, 1), 'val': (0.3, 1), 'rows': (0, 150)}      # платок
_WOMAN_SHAWL = {'hue': (338, 24), 'sat': (0.12, 0.5), 'val': (0.22, 0.66), 'rows': (125, 305)}  # шаль
_WOMAN_SKIRT = {'hue': (0, 26), 'sat': (0.45, 1), 'val': (0.3, 1), 'rows': (235, 413)}         # бант, фартук, юбка

CITIZENS = {
    # имя: (исходник, правила перекраски)
    'man_a': ('resident_man', [
        {**_MAN_GARMENT, 'to': 108, 's': (1.0, 0.24), 'v': 0.92},                                        # кепка и жилет → зелёные
        {**_MAN_VEST, 'to': 108, 's': (1.0, 0.3), 'v': 0.95},
    ]),
    'man_b': ('resident_man', [
        {**_MAN_GARMENT, 'to': 354, 's': (1.0, 0.3), 'v': 0.95},                                         # кепка и жилет → бордовые
        {**_MAN_VEST, 'to': 354, 's': (1.0, 0.34), 'v': 0.95},
    ]),
    'woman_a': ('resident_woman', [
        {**_WOMAN_KERCHIEF, 'to': 196, 's': (0.85, 0), 'v': 1.0},                                        # платок → бирюза
        {**_WOMAN_SHAWL, 'to': 222, 's': (1.0, 0.1), 'v': 1.08},                                         # шаль → голубая
        {**_WOMAN_SKIRT, 'to': 205, 's': (0.85, 0), 'v': 1.0},                                           # юбка → синяя
    ]),
    'woman_b': ('resident_woman', [
        {**_WOMAN_KERCHIEF, 'to': 48, 's': (0.85, 0), 'v': 1.0},                                         # платок → охра
        {**_WOMAN_SHAWL, 'to': 128, 's': (1.0, 0.1), 'v': 1.0},                                          # шаль → зелёная
        {**_WOMAN_SKIRT, 'to': 34, 's': (0.7, 0), 'v': 0.95},                                            # юбка → песочная
    ]),
}


def citizens():
    out = {}
    for name, (src, rules) in CITIZENS.items():
        base = Image.open(os.path.join(ROOT, 'public', 'assets', 'chapter2', src + '.webp')).convert('RGBA')
        img = recolor(base, rules)
        cut, split = (MAN_CUT, MAN_SPLIT) if src == 'resident_man' else (WOMAN_CUT, WOMAN_SPLIT)
        frames = walk_frames(img, cut, split, lift=16 if src == 'resident_man' else 10)
        out[name] = frames
        for i, f in enumerate(frames):
            save_webp(f, os.path.join(OUT, f'{name}_{i}.webp'), quality=90)
    return out


# ------------------------------------------------------------------ собаки и кошки (рисуются кодом, смотрят вправо)
def _shade(img, top=1.08, bottom=0.8):
    """Мягкая объёмная тень: сверху чуть светлее, снизу темнее (как на нарисованных персонажах)."""
    arr = np.asarray(img).astype(np.float32)
    h = arr.shape[0]
    k = np.linspace(top, bottom, h)[:, None, None]
    arr[:, :, :3] = np.clip(arr[:, :, :3] * k, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def _mul(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + ((c[3],) if len(c) > 3 else ())


def _limb(cv, a, b, w, color, paw=None):
    cv.line([a, b], color, w)
    if paw:
        cv.ellipse(b[0] + paw[0], b[1] - 1, paw[1], paw[2], paw[3] if len(paw) > 3 else color)


def _tail(cv, pts, w, color, tip=None):
    cv.line(pts, color, w)
    if tip:
        cv.ellipse(pts[-1][0], pts[-1][1], w * 0.55, w * 0.55, tip)


def _eye(cv, x, y, r=3.2):
    cv.ellipse(x, y, r, r * 1.25, (52, 30, 24, 255))
    cv.ellipse(x - r * 0.3, y - r * 0.45, r * 0.38, r * 0.38, (255, 255, 255, 255))


def cat(pose, body, light, stripe=None, patch=None, eye=(88, 150, 70)):
    """pose: walk1 | walk2 | run1 | run2 | sit. Холст 200×136, лапы стоят на y=126."""
    W, H = 200, 136
    cv = Canvas(W, H)
    dark = _mul(body, 0.72)
    far = _mul(body, 0.78)
    pink = (232, 150, 150, 255)
    if pose == 'sit':
        # сидит боком: большой «каравай»-бок, прямые передние лапы, хвост обвивает лапы
        cv.line([(70, 116), (110, 120), (140, 118)], far, 8)
        cv.ellipse(86, 96, 36, 32, body)                    # бедро и спина
        cv.ellipse(112, 84, 26, 36, body)                   # грудь
        cv.ellipse(112, 100, 16, 24, light if patch else _mul(body, 1.08))  # светлая грудка
        _limb(cv, (122, 96), (126, 124), 11, body, (4, 9, 5))
        _limb(cv, (108, 96), (110, 124), 11, far, (4, 9, 5, far))
        _tail(cv, [(52, 112), (42, 124), (90, 128), (132, 124)], 9, body, light if patch else None)
        hx, hy = 124, 50
        cv.ellipse(86, 118, 18, 9, body)
    else:
        run = pose.startswith('run')
        lift = {'walk1': (10, 0, 0, 10), 'walk2': (0, 10, 10, 0), 'run1': (0, 0, 0, 0), 'run2': (0, 0, 0, 0)}[pose]
        by = 84 if not run else (88 if pose == 'run1' else 80)
        bx, rx = 92, 46 if not run else 52
        # хвост
        if run:
            _tail(cv, [(52, by - 6), (28, by - 14), (12, by - 6)], 9, body, light if patch else None)
        else:
            _tail(cv, [(52, by + 2), (32, by - 4), (24, by - 24), (32, by - 44)], 9, body, light if patch else None)
        # дальние лапы
        if run and pose == 'run1':
            _limb(cv, (122, by + 10), (154, by + 24), 9, far, (5, 7, 4, far)); _limb(cv, (62, by + 8), (28, by + 26), 9, far, (-4, 7, 4, far))
        elif run:
            _limb(cv, (116, by + 14), (112, by + 30), 9, far, (3, 7, 4, far)); _limb(cv, (70, by + 14), (78, by + 30), 9, far, (3, 7, 4, far))
        else:
            _limb(cv, (112, by + 14), (112 + (8 if lift[1] else -4), 126 - lift[1]), 9, far, (3, 7, 4, far))
            _limb(cv, (74, by + 14), (74 + (8 if lift[2] else -4), 126 - lift[2]), 9, far, (3, 7, 4, far))
        cv.ellipse(bx, by, rx, 23, body)
        if patch:
            cv.ellipse(bx + 26, by + 12, 20, 11, light)
        # ближние лапы
        if run and pose == 'run1':
            _limb(cv, (128, by + 10), (160, by + 20), 10, body, (5, 8, 5, light if patch else body)); _limb(cv, (60, by + 10), (22, by + 22), 10, body, (-5, 8, 5, light if patch else body))
        elif run:
            _limb(cv, (122, by + 14), (118, by + 30), 10, body, (3, 8, 5, light if patch else body)); _limb(cv, (64, by + 14), (74, by + 30), 10, body, (3, 8, 5, light if patch else body))
        else:
            _limb(cv, (124, by + 14), (124 + (8 if lift[0] else -3), 126 - lift[0]), 10, body, (3, 8, 5, light if patch else body))
            _limb(cv, (66, by + 14), (66 + (8 if lift[3] else -3), 126 - lift[3]), 10, body, (3, 8, 5, light if patch else body))
        hx, hy = (150, by - 18) if not run else (156, by - 10)
    # голова
    cv.poly([(hx - 20, hy - 12), (hx - 17, hy - 38), (hx - 3, hy - 18)], body)       # дальнее ухо
    cv.poly([(hx + 2, hy - 18), (hx + 16, hy - 40), (hx + 22, hy - 10)], body)       # ближнее ухо
    cv.poly([(hx + 6, hy - 18), (hx + 15, hy - 32), (hx + 18, hy - 15)], pink)
    cv.ellipse(hx, hy, 22, 19, body)
    cv.ellipse(hx + 15, hy + 6, 11, 8, light if patch else _mul(body, 1.1))          # мордочка
    cv.ellipse(hx + 24, hy + 2, 3, 2.4, pink)                                        # нос
    img = cv.result()
    img = _shade(img)
    img = outline(img, INK, px=2.0, soft=0.7)
    # детали поверх контура
    c2 = Canvas(W + 4, H + 4) if False else None
    d = ImageDraw.Draw(img, 'RGBA')
    ex, ey = hx + 10, hy - 3
    d.ellipse((ex - 4, ey - 5, ex + 4, ey + 5), fill=eye + (255,))
    d.ellipse((ex - 2, ey - 3, ex + 2, ey + 3), fill=(30, 20, 16, 255))
    d.ellipse((ex - 3, ey - 4, ex - 1, ey - 2), fill=(255, 255, 255, 255))
    if stripe:
        for i in range(4):
            x = 72 + i * 16
            d.arc((x, 60, x + 12, 96), 250, 20, fill=stripe + (255,), width=3)
    d.line([(hx + 20, hy + 7), (hx + 24, hy + 9)], fill=(120, 60, 50, 255), width=1)
    for k in (-1, 1):
        d.line([(hx + 22, hy + 6 + k), (hx + 38, hy + 4 + k * 3)], fill=(240, 232, 220, 200), width=1)   # усы
    return img


def dog(pose, body, light, ear, eye=(70, 40, 30), collar=(190, 60, 52)):
    """pose: walk1 | walk2 | run1 | run2 | sit. Холст 240×150, лапы стоят на y=138."""
    W, H = 240, 150
    cv = Canvas(W, H)
    far = _mul(body, 0.76)
    nose = (60, 36, 32, 255)
    if pose == 'sit':
        cv.line([(60, 128), (100, 132)], far, 10)
        cv.ellipse(86, 100, 40, 36, body)
        cv.ellipse(120, 90, 28, 40, body)
        cv.ellipse(122, 106, 18, 26, light)
        _limb(cv, (130, 100), (136, 134), 13, body, (4, 11, 6))
        _limb(cv, (114, 100), (118, 134), 13, far, (4, 11, 6, far))
        cv.ellipse(86, 132, 22, 10, body)
        _tail(cv, [(52, 118), (36, 118), (30, 100)], 11, body)
        hx, hy = 138, 52
    else:
        run = pose.startswith('run')
        lift = {'walk1': (12, 0, 0, 12), 'walk2': (0, 12, 12, 0), 'run1': (0, 0, 0, 0), 'run2': (0, 0, 0, 0)}[pose]
        by = 92 if not run else (96 if pose == 'run1' else 88)
        bx, rx = 104, 52 if not run else 58
        _tail(cv, [(54, by - 4), (34, by - 16), (28, by - 34)] if not run else [(48, by - 6), (24, by - 18), (8, by - 14)], 11, body)
        if run and pose == 'run1':
            _limb(cv, (138, by + 12), (176, by + 28), 11, far, (5, 9, 5, far)); _limb(cv, (68, by + 10), (30, by + 30), 11, far, (-4, 9, 5, far))
        elif run:
            _limb(cv, (132, by + 16), (128, by + 36), 11, far, (3, 9, 5, far)); _limb(cv, (78, by + 16), (88, by + 36), 11, far, (3, 9, 5, far))
        else:
            _limb(cv, (128, by + 16), (128 + (9 if lift[1] else -4), 138 - lift[1]), 11, far, (3, 9, 5, far))
            _limb(cv, (82, by + 16), (82 + (9 if lift[2] else -4), 138 - lift[2]), 11, far, (3, 9, 5, far))
        cv.ellipse(bx, by, rx, 26, body)
        cv.ellipse(bx + 14, by + 14, 34, 13, light)                                  # светлое пузо
        if run and pose == 'run1':
            _limb(cv, (146, by + 12), (184, by + 24), 12, body, (5, 10, 6, light)); _limb(cv, (64, by + 12), (24, by + 26), 12, body, (-5, 10, 6, light))
        elif run:
            _limb(cv, (140, by + 16), (136, by + 36), 12, body, (3, 10, 6, light)); _limb(cv, (74, by + 16), (84, by + 36), 12, body, (3, 10, 6, light))
        else:
            _limb(cv, (140, by + 16), (140 + (9 if lift[0] else -3), 138 - lift[0]), 12, body, (3, 10, 6, light))
            _limb(cv, (74, by + 16), (74 + (9 if lift[3] else -3), 138 - lift[3]), 12, body, (3, 10, 6, light))
        hx, hy = (160, by - 22) if not run else (170, by - 14)
    # ошейник, голова
    cv.rotated_ellipse(hx - 14, hy + 20, 9, 18, -0.55, collar)
    cv.ellipse(hx, hy, 24, 22, body)
    cv.ellipse(hx + 20, hy + 9, 17, 12, light)                                      # морда
    cv.ellipse(hx + 34, hy + 4, 5, 4, nose)                                         # нос
    cv.rotated_ellipse(hx - 12, hy - 4, 10, 20, 0.25, ear)                           # ухо висит
    if pose.startswith('run'):
        cv.ellipse(hx + 28, hy + 19, 5, 6, (226, 120, 124, 255))                    # язык
    img = cv.result()
    img = _shade(img)
    img = outline(img, INK, px=2.0, soft=0.7)
    d = ImageDraw.Draw(img, 'RGBA')
    ex, ey = hx + 12, hy - 4
    d.ellipse((ex - 4, ey - 5, ex + 4, ey + 5), fill=(40, 24, 20, 255))
    d.ellipse((ex - 3, ey - 4, ex - 1, ey - 2), fill=(255, 255, 255, 255))
    d.arc((ex - 8, ey - 14, ex + 8, ey - 6), 200, 340, fill=(60, 36, 30, 255), width=2)  # бровь
    return img


CATS = {   # имя: (тело, светлое, полоски, пятна)
    'cat_ginger': ((226, 148, 78, 255), (250, 226, 190, 255), (176, 96, 44), False),
    'cat_grey': ((150, 150, 160, 255), (226, 224, 226, 255), (96, 96, 108), False),
    'cat_tux': ((60, 54, 62, 255), (248, 244, 238, 255), None, True),
}
DOGS = {   # имя: (тело, светлое, ухо)
    'dog_tan': ((214, 170, 112, 255), (248, 232, 204, 255), (146, 92, 54, 255)),
    'dog_brown': ((140, 96, 70, 255), (236, 220, 196, 255), (88, 56, 42, 255)),
}
POSES = ['walk1', 'walk2', 'run1', 'run2', 'sit']


def animals():
    out = {}
    for name, (body, light, stripe, patch) in CATS.items():
        fr = [cat(p, body, light, stripe, patch) for p in POSES]
        out[name] = fr
        for p, f in zip(POSES, fr):
            save_webp(f, os.path.join(OUT, f'{name}_{p}.webp'), quality=90)
    for name, (body, light, ear) in DOGS.items():
        fr = [dog(p, body, light, ear) for p in POSES]
        out[name] = fr
        for p, f in zip(POSES, fr):
            save_webp(f, os.path.join(OUT, f'{name}_{p}.webp'), quality=90)
    return out


# ------------------------------------------------------------------ вороны: перекрашенная малиновка из леса (три кадра взмаха)
def crows():
    out = []
    for i in (1, 2, 3):
        base = Image.open(os.path.join(ROOT, 'public', 'assets', 'forest', f'life-bird-{i}.webp')).convert('RGBA')
        img = gradient_map(base, [(0.0, (14, 14, 22)), (0.45, (40, 42, 56)), (0.8, (88, 92, 112)), (1.0, (150, 154, 172))])
        out.append(img)
        save_webp(img, os.path.join(OUT, f'crow_{i}.webp'), quality=90)
    return out


# ------------------------------------------------------------------ реестр для игры (src/config/cityLife.art.generated.js)
DISPLAY_H = {'man': 120, 'woman': 120}          # рост горожанина в игре — как у нарисованных жителей (69×120, 86×120)
PET_SCALE = {'cat': 0.4, 'dog': 0.4}            # кошка 200×136 → 80×54, собака 240×150 → 96×60
CROW_SCALE = 1.35                               # малиновка 30×25 в лесу → ворона ≈ 41×34


def write_manifest(res):
    files, sizes = {}, {}
    ver = 'city-life-1'
    for name, frames in res['citizens'].items():
        kind = name.split('_')[0]
        for i, f in enumerate(frames):
            key = f'cl_{name}_{i}'
            files[key] = f'assets/city-life/{name}_{i}.webp?v={ver}'
            sizes[key] = [round(f.width * DISPLAY_H[kind] / f.height), DISPLAY_H[kind]]
    for name, frames in res['animals'].items():
        kind = name.split('_')[0]
        for p, f in zip(POSES, frames):
            key = f'cl_{name}_{p}'
            files[key] = f'assets/city-life/{name}_{p}.webp?v={ver}'
            sizes[key] = [round(f.width * PET_SCALE[kind]), round(f.height * PET_SCALE[kind])]
    for i, f in enumerate(res['crows'], 1):
        key = f'cl_crow_{i}'
        files[key] = f'assets/city-life/crow_{i}.webp?v={ver}'
        sizes[key] = [round(30 * CROW_SCALE), round(25 * CROW_SCALE)]
    import json
    path = os.path.join(ROOT, 'src', 'config', 'cityLife.art.generated.js')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('// Generated by tools/art/city_life_art.py (prototype art for the living city, drawn in code). Do not edit by hand.\n')
        fh.write('export const CITY_LIFE_FILES = ' + json.dumps(files, indent=2) + ';\n')
        fh.write('export const CITY_LIFE_SIZES = ' + json.dumps(sizes, indent=2) + ';\n')


if __name__ == '__main__':
    res = {'citizens': citizens(), 'animals': animals(), 'crows': crows()}
    write_manifest(res)
    if '--preview' in sys.argv:
        rows = []
        for name, frames in res['citizens'].items():
            rows.append(frames)
        Wd = max(sum(f.width + 10 for f in r) for r in rows); Ht = sum(max(f.height for f in r) + 10 for r in rows)
        sheet = Image.new('RGBA', (Wd, Ht), (112, 128, 112, 255)); y = 0
        for r in rows:
            x = 0
            for f in r:
                sheet.alpha_composite(f, (x, y)); x += f.width + 10
            y += max(f.height for f in r) + 10
        d = os.path.join(ROOT, 'docs', 'design', 'city-life'); os.makedirs(d, exist_ok=True)
        sheet.convert('RGB').save(os.path.join(d, 'preview-citizens.png'))
        rows = list(res['animals'].values())
        Wd = max(sum(f.width + 10 for f in r) for r in rows); Ht = sum(max(f.height for f in r) + 10 for r in rows)
        sheet = Image.new('RGBA', (Wd, Ht), (112, 128, 112, 255)); y = 0
        for r in rows:
            x = 0
            for f in r:
                sheet.alpha_composite(f, (x, y)); x += f.width + 10
            y += max(f.height for f in r) + 10
        row = Image.new('RGBA', (sum(f.width * 2 + 10 for f in res['crows']), max(f.height * 2 for f in res['crows'])), (112, 128, 112, 255)); x = 0
        for f in res['crows']:
            row.alpha_composite(f.resize((f.width * 2, f.height * 2), Image.LANCZOS), (x, 0)); x += f.width * 2 + 10
        sheet.convert('RGB').save(os.path.join(d, 'preview-animals.png')); row.convert('RGB').save(os.path.join(d, 'preview-crows.png'))
        print('preview ok')
