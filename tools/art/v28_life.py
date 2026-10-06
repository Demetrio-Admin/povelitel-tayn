"""«Живой мир» (v0.28.1): птичка (3 кадра), белка (3 кадра), заяц (3 кадра), листик. Процедурная «живопись»:
градиентная заливка, шерсть мазками по форме, тонкий тёмный контур, блики и мягкая тень — под нарисованный стиль игры.
Запуск из корня репозитория:  python3 tools/art/v28_life.py  ->  public/assets/sprites/life_*.png
Текстуры в 2× от размера на экране (DISPLAY_SIZE — половина). Звери смотрят ВПРАВО (влево игра разворачивает зеркально).
Pivot — нижний центр (птица — центр).
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')
S = 4                                   # суперсэмплинг
OL = (50, 30, 22)                       # контур — тёплый тёмно-коричневый, как у остальных спрайтов


def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(c, k):
    """k>0 — светлее, k<0 — темнее."""
    if k >= 0:
        return tuple(min(255, c[i] + (255 - c[i]) * k) for i in range(3))
    return tuple(max(0, c[i] * (1 + k)) for i in range(3))


# ------------------------------------------------------------------ геометрия
def catmull(pts, closed=True, n=8):
    out = []
    m = len(pts)
    rng = range(m) if closed else range(m - 1)
    for i in rng:
        p0 = pts[(i - 1) % m] if closed or i > 0 else pts[i]
        p1 = pts[i]
        p2 = pts[(i + 1) % m]
        p3 = pts[(i + 2) % m] if closed or i + 2 < m else pts[(i + 1) % m]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    return out


def ellipse_pts(cx, cy, rx, ry, ang=0.0, n=28):
    a = math.radians(ang)
    ca, sa = math.cos(a), math.sin(a)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return pts


def fluff(pts, amp, per, rnd):
    """Пушистый край: точки по периметру, чередующиеся наружу/внутрь."""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)) / 2
    sign = 1 if area > 0 else -1
    seg = [math.dist(pts[i], pts[(i + 1) % n]) for i in range(n)]
    total = sum(seg)
    out, d, i, acc, k = [], 0.0, 0, 0.0, 0
    count = max(8, int(total / per))
    for c in range(count):
        target = total * c / count
        while acc + seg[i] < target and i < n - 1:
            acc += seg[i]; i += 1
        t = (target - acc) / (seg[i] or 1)
        a, b = pts[i], pts[(i + 1) % n]
        x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty) or 1
        nx, ny = sign * ty / L, -sign * tx / L          # наружу
        push = amp * (0.5 + 0.5 * rnd.random()) if k % 2 == 0 else -amp * 0.15
        out.append((x + nx * push, y + ny * push)); k += 1
    return catmull(out, True, 3)


class Painter:
    def __init__(self, w, h, seed=1):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
        self.rnd = random.Random(seed)
        self.np = np.random.default_rng(seed)

    # --- маски
    def mask(self, pts):
        m = Image.new('L', self.im.size, 0)
        ImageDraw.Draw(m).polygon([(x * S, y * S) for x, y in pts], fill=255)
        return m

    def limb(self, pts, width, tip=None):
        """Лапа/нога: ломаная с толщиной (можно сужать к концу)."""
        m = Image.new('L', self.im.size, 0)
        d = ImageDraw.Draw(m)
        for i in range(len(pts) - 1):
            t0, t1 = i / (len(pts) - 1), (i + 1) / (len(pts) - 1)
            w0 = width * (1 - (1 - (tip or 1)) * t0); w1 = width * (1 - (1 - (tip or 1)) * t1)
            a, b = pts[i], pts[i + 1]
            d.line([(a[0] * S, a[1] * S), (b[0] * S, b[1] * S)], fill=255, width=max(1, int(w1 * S)))
            d.ellipse([(a[0] - w0 / 2) * S, (a[1] - w0 / 2) * S, (a[0] + w0 / 2) * S, (a[1] + w0 / 2) * S], fill=255)
        e = pts[-1]
        wl = width * (tip or 1)
        d.ellipse([(e[0] - wl / 2) * S, (e[1] - wl / 2) * S, (e[0] + wl / 2) * S, (e[1] + wl / 2) * S], fill=255)
        return m

    # --- слой с заливкой, шерстью и контуром
    def part(self, mask, top, bottom, fur_dir=None, fur=0.5, fur_len=(3, 7), hl=None, ow=1.0, outline=OL, tone=14, sx=None):
        if isinstance(mask, list):
            mask = self.mask(mask)
        bb = mask.getbbox()
        if not bb:
            return
        x0, y0, x1, y1 = bb
        H = self.im.size[1]
        ys = np.clip((np.arange(H) - y0) / max(1, y1 - y0), 0, 1)[:, None, None]
        top_a, bot_a = np.array(top, dtype=float), np.array(bottom, dtype=float)
        arr = top_a * (1 - ys) + bot_a * ys
        arr = np.broadcast_to(arr, (H, self.im.size[0], 3)).astype(np.uint8)
        fill = Image.fromarray(arr, 'RGB').convert('RGBA')
        m_arr = np.array(mask)
        if fur_dir is not None:
            d = ImageDraw.Draw(fill)
            area = (m_arr > 128).sum() / (S * S)
            n = int(area * fur)
            idx = np.argwhere(m_arr > 128)
            if len(idx):
                pick = idx[self.np.integers(0, len(idx), n)]
                for (py, px) in pick:
                    t = (py - y0) / max(1, y1 - y0)
                    base = lerp(top, bottom, min(1, max(0, t)))
                    k = self.rnd.choice([-1, 1]) * (self.rnd.random() * tone / 100 + 0.04)
                    col = shade(base, k)
                    ang = math.radians(fur_dir + self.rnd.gauss(0, 24))
                    L = self.rnd.uniform(*fur_len) * S
                    d.line([(px, py), (px + math.cos(ang) * L, py + math.sin(ang) * L)], fill=tuple(int(v) for v in col) + (255,), width=max(1, int(S * 0.75)))
        if hl:
            lay = Image.new('L', self.im.size, 0)
            ld = ImageDraw.Draw(lay)
            for (cx, cy, rx, ry, col, a) in hl:
                tmp = Image.new('L', self.im.size, 0)
                ImageDraw.Draw(tmp).ellipse([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S], fill=int(255 * a))
                tmp = tmp.filter(ImageFilter.GaussianBlur(max(1, min(rx, ry) * S * 0.55)))
                solid = Image.new('RGBA', self.im.size, tuple(int(v) for v in col) + (255,))
                fill = Image.composite(solid, fill, tmp)
        layer = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
        layer.paste(fill, (0, 0), mask)
        if ow > 0:
            r = max(1, int(ow * S))
            dil = mask.filter(ImageFilter.MaxFilter(2 * r + 1))
            ring = ImageChops.subtract(dil, mask).filter(ImageFilter.GaussianBlur(0.5))
            ol = Image.new('RGBA', self.im.size, tuple(outline) + (255,))
            self.im = Image.alpha_composite(self.im, Image.composite(ol, Image.new('RGBA', self.im.size, (0, 0, 0, 0)), ring))
        self.im = Image.alpha_composite(self.im, layer)

    def eye(self, x, y, r=2.6, iris=(58, 34, 22)):
        d = ImageDraw.Draw(self.im)
        d.ellipse([(x - r) * S, (y - r * 1.1) * S, (x + r) * S, (y + r * 1.1) * S], fill=OL + (255,))
        d.ellipse([(x - r * 0.78) * S, (y - r * 0.9) * S, (x + r * 0.78) * S, (y + r * 0.9) * S], fill=iris + (255,))
        d.ellipse([(x - r * 0.35) * S, (y - r * 0.2) * S, (x + r * 0.35) * S, (y + r * 0.5) * S], fill=(20, 12, 10, 255))
        d.ellipse([(x - r * 0.1) * S, (y - r * 0.75) * S, (x + r * 0.55) * S, (y - r * 0.15) * S], fill=(255, 255, 255, 255))

    def line(self, pts, col, w=1.0, alpha=255):
        ImageDraw.Draw(self.im).line([(x * S, y * S) for x, y in pts], fill=tuple(int(v) for v in col) + (alpha,), width=max(1, int(w * S)))

    def save(self, name):
        im = self.im.resize((self.w, self.h), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.png'), optimize=True)
        return im


# ------------------------------------------------------------------ белка
SQ = dict(top=hx('#e0914c'), bot=hx('#a8501f'), dark=hx('#7c3a18'), light=hx('#f0b87a'), belly=hx('#f6e6c8'))


def squirrel(frame):
    W, H = 124, 96
    p = Painter(W, H, seed=10 + frame)
    r = random.Random(40 + frame)
    # позы: (центр тела, наклон, голова, хвост-подъём, передняя лапа[плечо→лапа], задняя[бедро, колено, лапа])
    poses = {
        1: dict(body=(56, 66, 24, 14, -8), head=(88, 54), tail=0, fl=[(74, 70), (84, 80), (92, 87)], hl=[(42, 70), (34, 80), (44, 88)]),
        2: dict(body=(58, 60, 26, 13, -22), head=(92, 42), tail=-8, fl=[(78, 62), (92, 66), (104, 68)], hl=[(40, 64), (26, 72), (12, 78)]),
        3: dict(body=(56, 63, 25, 14, -14), head=(90, 48), tail=-3, fl=[(76, 67), (88, 76), (98, 82)], hl=[(42, 68), (36, 80), (30, 88)]),
    }[frame]
    cx, cy, rx, ry, ang = poses['body']
    hxp, hyp = poses['head']
    lift = poses['tail']
    # --- задняя дальняя лапа (темнее, позади тела)
    hl = poses['hl']
    far = [(x - 5, y) for x, y in hl]
    p.part(p.limb(far, 10, 0.75), shade(SQ['bot'], -0.1), shade(SQ['dark'], 0.0), fur_dir=90, fur=0.5)
    # --- хвост: большой пушистый вопросительный знак
    tail = [(38, 68), (20, 64), (8, 48), (8, 28), (18, 12), (34, 5), (50, 10), (56, 22), (50, 32), (40, 28), (30, 32), (26, 46), (34, 58)]
    tail = [(x, y + lift * (1 - y / 70) * 0.8) for x, y in tail]
    sm = catmull(tail, True, 8)
    tf = fluff(sm, 2.0, 4.6, r)
    p.part(tf, SQ['light'], SQ['bot'], fur_dir=290, fur=1.1, fur_len=(5, 11), tone=20,
           hl=[(18, 22, 7, 12, hx('#ffd9a0'), 0.6), (36, 50, 5, 9, SQ['dark'], 0.4), (48, 16, 6, 6, hx('#ffe6bc'), 0.5)])
    # изогнутые линии шерсти вдоль хвоста
    # --- тело
    body = fluff(ellipse_pts(cx, cy, rx, ry, ang), 1.2, 4.0, r)
    p.part(body, SQ['top'], SQ['bot'], fur_dir=ang + 10, fur=0.9, fur_len=(4, 8),
           hl=[(cx - 4, cy - 8, 14, 5, SQ['light'], 0.55), (cx - 6, cy + 10, 16, 4, SQ['dark'], 0.4)])
    # грудка
    chest = ellipse_pts(cx + 14, cy + 4, 11, 9, ang + 20)
    p.part(p.mask(chest), SQ['belly'], shade(SQ['belly'], -0.15), fur_dir=70, fur=0.5, ow=0, hl=[(cx + 14, cy + 2, 7, 5, (255, 250, 235), 0.6)])
    # --- задняя ближняя лапа: бедро + голень + ступня
    p.part(p.mask(ellipse_pts(hl[0][0] + 2, hl[0][1] - 2, 11, 10, ang)), SQ['top'], SQ['bot'], fur_dir=ang + 40, fur=0.8,
           hl=[(hl[0][0], hl[0][1] - 7, 7, 3, SQ['light'], 0.5)])
    p.part(p.limb(hl, 8.4, 0.72), SQ['top'], SQ['bot'], fur_dir=95, fur=0.6)
    foot = hl[-1]
    p.part(p.mask(ellipse_pts(foot[0] + 3, foot[1] + 0.5, 6.5, 3.2, 0)), SQ['bot'], SQ['dark'], fur_dir=0, fur=0.4, fur_len=(2, 4))
    # --- шея + голова
    p.part(p.mask(ellipse_pts((cx + hxp) / 2 + 6, (cy + hyp) / 2 + 3, 13, 11, -40)), SQ['top'], SQ['bot'], fur_dir=-30, fur=0.6, ow=0)
    # дальнее ухо
    p.part(p.mask(catmull([(hxp - 15, hyp - 6), (hxp - 16, hyp - 20), (hxp - 11, hyp - 27), (hxp - 6, hyp - 14)], True, 5)), shade(SQ['bot'], -0.1), SQ['dark'], ow=0.9)
    head = fluff(ellipse_pts(hxp, hyp, 15, 13.5, 8), 1.1, 3.6, r)
    p.part(head, SQ['light'], SQ['bot'], fur_dir=10, fur=1.0, fur_len=(3, 6),
           hl=[(hxp - 3, hyp - 8, 9, 4, (255, 226, 176), 0.6), (hxp - 8, hyp + 6, 8, 4, SQ['dark'], 0.3)])
    # мордочка
    snout = ellipse_pts(hxp + 13, hyp + 4, 8.5, 6.5, 14)
    p.part(p.mask(snout), SQ['belly'], shade(SQ['belly'], -0.12), fur_dir=10, fur=0.4, fur_len=(2, 4), ow=0.9)
    # ближнее ухо с кисточкой
    ear = [(hxp - 11, hyp - 8), (hxp - 13, hyp - 20), (hxp - 9, hyp - 29), (hxp - 3, hyp - 31), (hxp + 2, hyp - 22), (hxp + 4, hyp - 10)]
    p.part(p.mask(fluff(catmull(ear, True, 5), 1.4, 3.6, r)), SQ['top'], SQ['dark'], fur_dir=-90, fur=0.9, fur_len=(3, 6))
    p.part(p.mask(catmull([(hxp - 8, hyp - 11), (hxp - 9, hyp - 21), (hxp - 6, hyp - 26), (hxp - 2, hyp - 20), (hxp - 1, hyp - 12)], True, 5)), hx('#e9a58e'), hx('#c97c68'), ow=0)
    # нос, рот, глаз
    d = ImageDraw.Draw(p.im)
    nx, ny = hxp + 20.5, hyp + 2
    d.ellipse([(nx - 2.3) * S, (ny - 1.9) * S, (nx + 2.3) * S, (ny + 1.9) * S], fill=(46, 28, 24, 255))
    d.ellipse([(nx - 1.2) * S, (ny - 1.4) * S, (nx + 0.4) * S, (ny - 0.2) * S], fill=(150, 110, 100, 255))
    p.line([(nx - 1, ny + 2), (nx - 5, ny + 5.5), (nx - 9, ny + 4.5)], OL, 0.7)
    p.eye(hxp + 5.5, hyp - 2.5, 3.1)
    # --- передняя лапка
    fl = poses['fl']
    p.part(p.limb(fl, 7.4, 0.8), SQ['top'], SQ['bot'], fur_dir=60, fur=0.6)
    paw = fl[-1]
    p.part(p.mask(ellipse_pts(paw[0] + 1.5, paw[1], 4.6, 3.1, 10)), SQ['belly'], shade(SQ['belly'], -0.2), ow=0.8)
    return p


# ------------------------------------------------------------------ заяц
RB = dict(top=hx('#c4ae90'), bot=hx('#8c7658'), dark=hx('#5e4c38'), light=hx('#e2d2b6'), belly=hx('#f3ebde'), inner=hx('#eaa9a4'))


def rabbit(frame):
    W, H = 120, 84
    p = Painter(W, H, seed=20 + frame)
    r = random.Random(60 + frame)
    poses = {
        1: dict(body=(54, 58, 25, 17, -4), head=(84, 44), ear=0, fl=[(72, 62), (80, 72), (86, 79)], hl=[(40, 62), (46, 72), (58, 79)], tail=(28, 54)),
        2: dict(body=(56, 52, 28, 14, -16), head=(88, 36), ear=-10, fl=[(76, 54), (90, 58), (102, 60)], hl=[(38, 56), (22, 62), (8, 66)], tail=(28, 44)),
        3: dict(body=(54, 55, 26, 16, -9), head=(86, 40), ear=-5, fl=[(74, 58), (86, 68), (94, 75)], hl=[(40, 60), (34, 72), (30, 79)], tail=(28, 50)),
    }[frame]
    cx, cy, rx, ry, ang = poses['body']
    hxp, hyp = poses['head']
    ea = poses['ear']
    hl = poses['hl']
    # дальнее заднее бедро и лапа
    p.part(p.limb([(x - 4, y) for x, y in hl], 10, 0.72), shade(RB['bot'], -0.05), RB['dark'], fur_dir=90, fur=0.5)
    # дальнее ухо
    far_ear = [(hxp - 8, hyp - 10), (hxp - 20 + ea, hyp - 34), (hxp - 24 + ea, hyp - 44), (hxp - 14 + ea, hyp - 40), (hxp - 2, hyp - 14)]
    p.part(p.mask(catmull(far_ear, True, 6)), shade(RB['bot'], -0.05), RB['dark'], fur_dir=-100, fur=0.5)
    # хвост-помпон
    tx, ty = poses['tail']
    p.part(p.mask(fluff(ellipse_pts(tx, ty, 8, 7.5, 0), 2.0, 3.4, r)), (255, 255, 255), hx('#dcd4c4'), fur_dir=180, fur=0.9, fur_len=(2, 5),
           hl=[(tx - 2, ty - 3, 4, 3, (255, 255, 255), 0.6)])
    # тело
    body = fluff(ellipse_pts(cx, cy, rx, ry, ang), 1.1, 4.0, r)
    p.part(body, RB['light'], RB['bot'], fur_dir=ang + 5, fur=0.9, fur_len=(4, 8),
           hl=[(cx, cy - 9, 15, 5, hx('#f1e4cc'), 0.6), (cx - 4, cy + 10, 16, 4, RB['dark'], 0.35)])
    # светлое брюшко
    p.part(p.mask(ellipse_pts(cx + 8, cy + 11, 14, 5.5, ang * 0.6)), RB['belly'], shade(RB['belly'], -0.12), fur_dir=0, fur=0.4, ow=0)
    # бедро
    haunch = ellipse_pts(hl[0][0] + 6, hl[0][1] - 6, 14, 12.5, ang + 20)
    p.part(p.mask(fluff(haunch, 0.9, 4, r)), RB['light'], RB['bot'], fur_dir=ang + 70, fur=0.9, fur_len=(4, 7),
           hl=[(hl[0][0] + 3, hl[0][1] - 13, 8, 4, hx('#f1e4cc'), 0.6)])
    p.part(p.limb(hl, 8.6, 0.68), RB['top'], RB['bot'], fur_dir=90, fur=0.6)
    foot = hl[-1]
    p.part(p.mask(ellipse_pts(foot[0] + 4, foot[1] + 0.5, 9, 3.4, 0)), RB['top'], RB['bot'], fur_dir=0, fur=0.5, fur_len=(2, 4))
    # шея и голова
    p.part(p.mask(ellipse_pts((cx + hxp) / 2 + 7, (cy + hyp) / 2 + 3, 13, 10, -35)), RB['light'], RB['bot'], fur_dir=-20, fur=0.6, ow=0)
    head = fluff(ellipse_pts(hxp, hyp, 14.5, 12.5, 10), 1.0, 3.4, r)
    p.part(head, RB['light'], RB['bot'], fur_dir=12, fur=1.0, fur_len=(3, 6),
           hl=[(hxp - 2, hyp - 7, 9, 4, hx('#f4e8d2'), 0.6), (hxp - 7, hyp + 6, 8, 3, RB['dark'], 0.3)])
    p.part(p.mask(ellipse_pts(hxp + 11.5, hyp + 4.5, 8, 6.4, 18)), RB['belly'], shade(RB['belly'], -0.12), fur_dir=10, fur=0.4, fur_len=(2, 4), ow=0.9)
    # ближнее ухо
    ear = [(hxp - 4, hyp - 11), (hxp - 12 + ea, hyp - 33), (hxp - 14 + ea, hyp - 47), (hxp - 6 + ea, hyp - 44), (hxp + 4, hyp - 24), (hxp + 6, hyp - 11)]
    p.part(p.mask(catmull(ear, True, 6)), RB['top'], RB['dark'], fur_dir=-95, fur=0.7, fur_len=(3, 6))
    inner = [(hxp - 2, hyp - 14), (hxp - 9 + ea, hyp - 32), (hxp - 10 + ea, hyp - 41), (hxp - 5 + ea, hyp - 39), (hxp + 1, hyp - 26), (hxp + 2, hyp - 14)]
    p.part(p.mask(catmull(inner, True, 6)), shade(RB['inner'], 0.15), shade(RB['inner'], -0.15), ow=0)
    # нос, рот, усы, глаз
    d = ImageDraw.Draw(p.im)
    nx, ny = hxp + 18.5, hyp + 2.5
    d.ellipse([(nx - 2.4) * S, (ny - 1.9) * S, (nx + 2.4) * S, (ny + 1.9) * S], fill=(214, 128, 128, 255), outline=OL + (255,), width=S // 2)
    p.line([(nx - 0.5, ny + 1.8), (nx - 1, ny + 4.5), (nx - 5, ny + 6.5)], OL, 0.7)
    for k, dy in enumerate((-1.5, 1.5, 4.0)):
        p.line([(nx - 4, ny + 3 + dy * 0.2), (nx - 13, ny + 1 + dy * 1.5)], (240, 232, 218), 0.55, 190)
    p.eye(hxp + 4.5, hyp - 2.5, 3.3)
    # передняя лапка
    fl = poses['fl']
    p.part(p.limb(fl, 7.0, 0.8), RB['top'], RB['bot'], fur_dir=70, fur=0.6)
    paw = fl[-1]
    p.part(p.mask(ellipse_pts(paw[0] + 1.5, paw[1], 4.8, 3.0, 8)), RB['belly'], shade(RB['belly'], -0.2), ow=0.8)
    return p


# ------------------------------------------------------------------ птичка (малиновка)
BD = dict(back=hx('#7a5638'), back_d=hx('#4e3624'), breast=hx('#ee7a3c'), breast_l=hx('#f9b078'), belly=hx('#f1e1c4'), wing=hx('#6a4a32'), wing_l=hx('#a98258'))


def feather_wing(p, root, ang, spread, length, far=False):
    """Крыло — веер из маховых перьев, закрашенный как одна форма с зубчатым краем."""
    rx, ry = root
    a0 = math.radians(ang - spread / 2)
    pts_top, pts_bot = [], []
    n = 5
    for i in range(n):
        t = i / (n - 1)
        a = a0 + math.radians(spread) * t
        L = length * (0.78 + 0.22 * math.sin(math.pi * (0.25 + 0.5 * t)))
        tip = (rx + math.cos(a) * L, ry + math.sin(a) * L)
        mid = (rx + math.cos(a + 0.12) * L * 0.86, ry + math.sin(a + 0.12) * L * 0.86)
        pts_top.append(tip); pts_top.append(mid)
    leading = (rx + math.cos(a0 - 0.28) * length * 0.55, ry + math.sin(a0 - 0.28) * length * 0.55)
    shape = [(rx - 3, ry + 1), leading] + pts_top + [(rx + 4, ry + 3)]
    col_t, col_b = (shade(BD['wing'], -0.2), shade(BD['back_d'], -0.15)) if far else (BD['wing_l'], BD['back_d'])
    mask = p.mask(catmull(shape, True, 3))
    p.part(mask, col_t, col_b, fur_dir=ang, fur=0.7, fur_len=(5, 10), tone=18, ow=0.9)


def bird(frame):
    W, H = 92, 68
    p = Painter(W, H, seed=30 + frame)
    r = random.Random(80 + frame)
    wing_ang = {1: -112, 2: -158, 3: 100}[frame]       # вверх / почти назад / вниз
    spread = {1: 52, 2: 34, 3: 52}[frame]
    wlen = {1: 36, 2: 38, 3: 34}[frame]
    cx, cy = 46, 40
    # дальнее крыло
    feather_wing(p, (cx - 2, cy - 6), wing_ang + (10 if frame != 2 else -12), spread, wlen * 0.9, far=True)
    # хвост
    tail = [(cx - 14, cy - 1), (cx - 30, cy - 5), (cx - 36, cy + 1), (cx - 32, cy + 8), (cx - 14, cy + 6)]
    p.part(p.mask(catmull(tail, True, 4)), BD['wing_l'], BD['back_d'], fur_dir=180, fur=0.6, fur_len=(4, 8))
    for k in (-2, 1, 4):
        p.line([(cx - 16, cy + 2 + k * 0.3), (cx - 32, cy + 1 + k)], shade(BD['back_d'], -0.2), 0.6, 160)
    # тельце
    body = ellipse_pts(cx, cy + 1, 21, 11.5, -6)
    p.part(p.mask(fluff(body, 0.8, 3.4, r)), BD['back'], BD['belly'], fur_dir=175, fur=1.0, fur_len=(3, 6),
           hl=[(cx - 4, cy - 6, 14, 3.5, hx('#9a7248'), 0.5)])
    # оранжевая грудка
    breast = ellipse_pts(cx + 11, cy + 4, 12, 9, 10)
    p.part(p.mask(fluff(breast, 0.7, 3.2, r)), BD['breast_l'], BD['breast'], fur_dir=60, fur=1.0, fur_len=(2.5, 5), ow=0,
           hl=[(cx + 12, cy + 2, 7, 4, hx('#ffd2a0'), 0.6)])
    # голова
    hx0, hy0 = cx + 18, cy - 5
    p.part(p.mask(fluff(ellipse_pts(hx0, hy0, 9.5, 9, 0), 0.7, 3.0, r)), BD['back'], BD['breast'], fur_dir=20, fur=1.0, fur_len=(2.5, 5),
           hl=[(hx0 - 2, hy0 - 5, 6, 2.8, hx('#9a7248'), 0.5), (hx0 + 3, hy0 + 4, 6, 4, BD['breast_l'], 0.7)])
    # клюв
    p.part(p.mask([(hx0 + 8, hy0 - 2.4), (hx0 + 17, hy0 + 0.6), (hx0 + 8, hy0 + 3)]), hx('#4a3426'), hx('#2a1c14'), ow=0.7)
    p.eye(hx0 + 3.2, hy0 - 1.5, 2.3)
    # ближнее крыло
    feather_wing(p, (cx + 2, cy - 5), wing_ang, spread, wlen)
    # лапка (поджата)
    p.line([(cx + 2, cy + 11), (cx + 6, cy + 15)], hx('#5a3e2e'), 0.9)
    return p


# ------------------------------------------------------------------ листик
def leaf():
    W, H = 36, 24
    p = Painter(W, H, seed=5)
    shape = [(3, 12), (9, 5), (19, 3), (31, 10), (32, 13), (22, 20), (11, 20)]
    p.part(p.mask(catmull(shape, True, 6)), (255, 255, 255), hx('#cfcfcf'), ow=0.0,
           hl=[(14, 8, 8, 3, (255, 255, 255), 0.6)])
    p.line([(2, 12.5), (30, 11.5)], hx('#9a9a9a'), 0.9)
    for k in range(4):
        x = 9 + k * 5.5
        p.line([(x, 12), (x + 4, 7 - k * 0.3)], hx('#b4b4b4'), 0.6)
        p.line([(x, 12), (x + 4, 17 + k * 0.3)], hx('#b4b4b4'), 0.6)
    return p


def main():
    for f in (1, 2, 3):
        bird(f).save(f'life_bird_{f}')
        squirrel(f).save(f'life_squirrel_{f}')
        rabbit(f).save(f'life_rabbit_{f}')
    leaf().save('life_leaf')
    print('life_* готовы')


if __name__ == '__main__':
    main()
