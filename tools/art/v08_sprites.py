"""Процедурные спрайты v0.8 (NPC, мебель дома, ресурсы, иконки) в стиле существующих: тёмный контур, тёплая заливка.
Запуск из корня репозитория:  python3 tools/art/v08_sprites.py   ->  public/assets/sprites/*.png
Каждый спрайт рисуется в 4× разрешении и уменьшается (сглаживание). Pivot объектов — нижний центр.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')
S = 4
OL = (43, 26, 20, 255)          # контур
OLS = (34, 20, 16, 255)

def rgb(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))

def lighter(c, t=0.25):
    return mix(c, (255, 255, 255, c[3]), t)

def darker(c, t=0.3):
    return mix(c, (0, 0, 0, c[3]), t)


class Cv:
    """Холст с координатами в «итоговых» пикселях (внутри — 4×)."""
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def p(self, pts):
        return [(x * S, y * S) for x, y in pts]

    def poly(self, pts, fill, outline=OL, ow=2.2):
        P = self.p(pts)
        self.d.polygon(P, fill=fill)
        if outline:
            self.d.line(P + [P[0]], fill=outline, width=int(ow * S), joint='curve')
            for x, y in P:
                r = ow * S / 2
                self.d.ellipse((x - r, y - r, x + r, y + r), fill=outline)

    def ell(self, x0, y0, x1, y1, fill, outline=OL, ow=2.2):
        self.d.ellipse((x0 * S, y0 * S, x1 * S, y1 * S), fill=fill, outline=outline if outline else None, width=int(ow * S) if outline else 0)

    def rr(self, x0, y0, x1, y1, r, fill, outline=OL, ow=2.2):
        self.d.rounded_rectangle((x0 * S, y0 * S, x1 * S, y1 * S), radius=r * S, fill=fill, outline=outline if outline else None, width=int(ow * S) if outline else 0)

    def line(self, pts, fill, w=2):
        self.d.line(self.p(pts), fill=fill, width=int(w * S), joint='curve')

    def arc(self, box, a0, a1, fill, w=2):
        x0, y0, x1, y1 = box
        self.d.arc((x0 * S, y0 * S, x1 * S, y1 * S), a0, a1, fill=fill, width=int(w * S))

    def grad_poly(self, pts, c0, c1, outline=OL, ow=2.2, horizontal=False):
        """Многоугольник с вертикальным градиентом c0 (верх) → c1 (низ)."""
        P = self.p(pts)
        xs = [x for x, _ in P]; ys = [y for _, y in P]
        x0, y0, x1, y1 = int(min(xs)), int(min(ys)), int(max(xs)) + 1, int(max(ys)) + 1
        g = Image.new('RGBA', (x1 - x0, y1 - y0))
        gd = ImageDraw.Draw(g)
        n = (x1 - x0) if horizontal else (y1 - y0)
        for i in range(n):
            c = mix(c0, c1, i / max(1, n - 1))
            if horizontal:
                gd.line((i, 0, i, y1 - y0), fill=c)
            else:
                gd.line((0, i, x1 - x0, i), fill=c)
        mask = Image.new('L', self.im.size, 0)
        ImageDraw.Draw(mask).polygon(P, fill=255)
        layer = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
        layer.paste(g, (x0, y0))
        layer.putalpha(ImageChops.multiply(layer.split()[3], mask))
        self.im.alpha_composite(layer)
        if outline:
            self.d.line(P + [P[0]], fill=outline, width=int(ow * S), joint='curve')
            for x, y in P:
                r = ow * S / 2
                self.d.ellipse((x - r, y - r, x + r, y + r), fill=outline)

    def grad_ell(self, x0, y0, x1, y1, c0, c1, outline=OL, ow=2.2):
        pts = []
        for i in range(48):
            a = i / 48 * math.tau
            pts.append(((x0 + x1) / 2 + math.cos(a) * (x1 - x0) / 2, (y0 + y1) / 2 + math.sin(a) * (y1 - y0) / 2))
        self.grad_poly(pts, c0, c1, outline, ow)

    def glow(self, x, y, r, color, a=0.5):
        g = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        for i in range(24, 0, -1):
            t = i / 24
            gd.ellipse(((x - r * t) * S, (y - r * t) * S, (x + r * t) * S, (y + r * t) * S), fill=(color[0], color[1], color[2], int(255 * a * (1 - t) ** 1.6 * 0.5)))
        self.im.alpha_composite(g)

    def shadow(self, cx, cy, rx, ry, a=70):
        g = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse(((cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S), fill=(0, 0, 0, a))
        self.im.alpha_composite(g.filter(ImageFilter.GaussianBlur(S * 2)))

    def save(self, name, size=None):
        im = self.im.resize((self.w, self.h), Image.LANCZOS)
        if size:
            im = im.resize(size, Image.LANCZOS)
        path = os.path.join(OUT, name + '.png')
        im.save(path, optimize=True)
        return im


# ------------------------------------------------------------------ части персонажей
SKIN = rgb('#f4c9a5')
SKIN_D = rgb('#d9a07c')

def face(c, cx, cy, r=24, eye=OL, blush=True, smile=True, glasses=False):
    c.grad_ell(cx - r, cy - r, cx + r, cy + r, lighter(SKIN, 0.2), SKIN_D)
    ex = r * 0.42
    for sx in (-1, 1):
        x = cx + sx * ex
        c.ell(x - 3.2, cy - 3.5, x + 3.2, cy + 5.5, eye, None)
        c.ell(x - 1.4, cy - 2.5, x + 0.4, cy - 0.5, (255, 255, 255, 255), None)
        if blush:
            c.ell(x - 5 + sx * 2.5, cy + 6, x + 5 + sx * 2.5, cy + 11, (240, 130, 120, 110), None)
    if smile:
        c.arc((cx - 6, cy + 2, cx + 6, cy + 14), 20, 160, OL, 1.6)
    if glasses:
        for sx in (-1, 1):
            x = cx + sx * ex
            c.ell(x - 8, cy - 8, x + 8, cy + 8, None, (90, 70, 40, 255), 1.5)
        c.line([(cx - 2, cy - 1), (cx + 2, cy - 1)], (90, 70, 40, 255), 1.4)


def hand(c, x, y, r=5):
    c.ell(x - r, y - r, x + r, y + r, SKIN, OL, 1.8)


def boot(c, x, y, col=rgb('#5a3a28')):
    c.rr(x - 9, y - 12, x + 9, y, 4, col, OL, 2)


# ------------------------------------------------------------------ NPC (160×240 → экран 80×120)
def npc_mirra():
    c = Cv(160, 240)
    c.shadow(80, 228, 40, 8)
    # платье
    c.grad_poly([(52, 120), (108, 120), (128, 226), (32, 226)], rgb('#6c4b8c'), rgb('#3e2a58'))
    # фартук
    c.grad_poly([(66, 126), (94, 126), (102, 224), (58, 224)], rgb('#f1e3c2'), rgb('#cdb98d'), ow=1.8)
    c.line([(66, 150), (94, 150)], rgb('#b9a26f'), 1.2)
    # шаль
    c.grad_poly([(40, 112), (120, 112), (130, 150), (80, 168), (30, 150)], rgb('#b27fd0'), rgb('#7a4f98'))
    c.poly([(80, 168), (70, 190), (90, 190)], rgb('#9b6bbd'), OL, 1.8)
    # руки
    c.ell(28, 128, 50, 168, rgb('#7a4f98'), OL, 2)
    c.ell(110, 128, 132, 168, rgb('#7a4f98'), OL, 2)
    hand(c, 40, 172); hand(c, 120, 172)
    boot(c, 66, 232); boot(c, 94, 232)
    # шея, голова
    c.rr(70, 100, 90, 118, 4, SKIN_D, OL, 1.8)
    # волосы сзади + пучок
    c.grad_ell(48, 18, 112, 88, rgb('#d9d6dc'), rgb('#9a97a3'))
    c.grad_ell(60, 4, 100, 34, rgb('#e6e4ea'), rgb('#aaa7b4'))
    face(c, 80, 68, 27, glasses=True)
    # чёлка
    c.poly([(54, 52), (66, 36), (80, 42), (96, 36), (108, 52), (100, 54), (80, 44), (62, 56)], rgb('#e0dde4'), OL, 1.8)
    # цветок в волосах
    c.ell(98, 14, 110, 26, rgb('#ff8fb0'), OL, 1.6)
    return c


def npc_veda():
    c = Cv(160, 240)
    c.shadow(80, 228, 38, 8)
    # платье зелёное
    c.grad_poly([(54, 118), (106, 118), (124, 226), (36, 226)], rgb('#6fbf73'), rgb('#3b7a46'))
    c.line([(80, 124), (80, 224)], rgb('#2f6038'), 1.4)
    # пояс и подол-орнамент
    c.rr(52, 150, 108, 160, 3, rgb('#a8743a'), OL, 1.8)
    for x in range(44, 120, 16):
        c.ell(x, 206, x + 8, 214, rgb('#f4e08a'), None)
    # корзина на руке
    c.grad_poly([(104, 166), (140, 166), (136, 196), (108, 196)], rgb('#c99a5a'), rgb('#8c6430'), ow=2)
    c.arc((104, 146, 140, 182), 180, 360, OL, 2.2)
    for i in range(5):
        c.ell(108 + i * 6, 156 + (i % 2) * 5, 118 + i * 6, 170 + (i % 2) * 5, rgb('#9fe9ff') if i % 2 else rgb('#8fe39a'), OL, 1.2)
    # руки
    c.ell(30, 128, 52, 166, rgb('#5aa863'), OL, 2)
    c.ell(108, 128, 130, 164, rgb('#5aa863'), OL, 2)
    hand(c, 41, 170); hand(c, 124, 168)
    boot(c, 66, 232, rgb('#7a5030')); boot(c, 94, 232, rgb('#7a5030'))
    c.rr(70, 100, 90, 118, 4, SKIN_D, OL, 1.8)
    # волосы: каштановые, коса
    c.grad_ell(46, 16, 114, 90, rgb('#a8643a'), rgb('#6e3c22'))
    c.poly([(110, 70), (128, 100), (122, 140), (110, 120)], rgb('#8e502c'), OL, 2)
    c.ell(112, 126, 126, 142, rgb('#7fd48a'), OL, 1.6)
    face(c, 80, 68, 27)
    c.poly([(54, 50), (68, 30), (82, 38), (98, 30), (108, 50), (100, 50), (82, 40), (64, 52)], rgb('#b87442'), OL, 1.8)
    # венок из лунных цветов
    for i, x in enumerate((58, 70, 82, 94, 106)):
        c.ell(x - 5, 28 + (i % 2) * 3, x + 5, 38 + (i % 2) * 3, rgb('#bff7ff'), OL, 1.4)
    return c


def npc_goran():
    c = Cv(160, 240)
    c.shadow(80, 228, 42, 8)
    # штаны
    c.rr(56, 168, 78, 226, 4, rgb('#4a3a2c'), OL, 2)
    c.rr(82, 168, 104, 226, 4, rgb('#4a3a2c'), OL, 2)
    boot(c, 66, 234, rgb('#3a2a1c')); boot(c, 94, 234, rgb('#3a2a1c'))
    # куртка
    c.grad_poly([(44, 112), (116, 112), (122, 176), (38, 176)], rgb('#9a6a3c'), rgb('#6a4424'))
    c.line([(80, 116), (80, 176)], rgb('#4a2e18'), 1.6)
    for y in (130, 146, 162):
        c.ell(77, y, 83, y + 6, rgb('#d9b45a'), OL, 1.2)
    c.rr(50, 164, 110, 174, 3, rgb('#3a2a1c'), OL, 1.8)
    # меховой воротник
    c.grad_ell(46, 100, 114, 126, rgb('#e9dcc0'), rgb('#b8a684'))
    # лук за спиной
    c.arc((112, 70, 150, 190), 270, 90, rgb('#7a4a24'), 3)
    c.line([(131, 72), (131, 188)], rgb('#e6d8b8'), 1)
    # руки на поясе
    c.ell(24, 120, 50, 168, rgb('#8a5c32'), OL, 2)
    c.ell(110, 120, 136, 168, rgb('#8a5c32'), OL, 2)
    hand(c, 42, 170); hand(c, 120, 170)
    # голова: борода, шапка с пером
    c.rr(70, 96, 90, 112, 4, SKIN_D, OL, 1.8)
    face(c, 80, 68, 28, blush=True, smile=False)
    c.grad_poly([(56, 76), (104, 76), (100, 104), (80, 116), (60, 104)], rgb('#8a5a34'), rgb('#5a3820'), ow=2)
    c.arc((70, 82, 90, 98), 20, 160, OL, 1.6)
    c.grad_poly([(48, 46), (112, 46), (104, 26), (86, 10), (74, 10), (56, 26)], rgb('#5e7a3c'), rgb('#3e5428'), ow=2.2)
    c.rr(44, 42, 116, 54, 5, rgb('#3e5428'), OL, 2)
    c.poly([(102, 34), (140, 4), (128, 36)], rgb('#d94a3a'), OL, 1.8)
    # брови
    c.line([(62, 58), (74, 56)], OL, 2); c.line([(86, 56), (98, 58)], OL, 2)
    return c


def npc_selena():
    c = Cv(160, 240)
    c.glow(80, 130, 90, rgb('#9fe9ff'), 0.9)
    # платье-свет, плавно тает вниз
    body = Image.new('RGBA', c.im.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    for i in range(110):
        t = i / 110
        y = 110 + i * 1.12
        w = 26 + 22 * math.sin(min(1, t * 1.2) * 1.4) * (1 - 0.35 * t)
        a = int(235 * (1 - t ** 1.7))
        col = mix(rgb('#e8fbff'), rgb('#7fc8ee'), t)
        bd.ellipse(((80 - w) * S, y * S, (80 + w) * S, (y + 3) * S), fill=(col[0], col[1], col[2], a))
    c.im.alpha_composite(body)
    # контур тела (светящийся, тонкий)
    c.arc((50, 106, 110, 200), 200, 340, rgb('#ffffffcc'), 1.4)
    # руки
    c.ell(36, 126, 54, 164, rgb('#d8f6ff', 230), rgb('#8fd8f2'), 1.6)
    c.ell(106, 126, 124, 164, rgb('#d8f6ff', 230), rgb('#8fd8f2'), 1.6)
    c.ell(36, 160, 48, 172, rgb('#f2fcff'), rgb('#8fd8f2'), 1.4)
    c.ell(112, 160, 124, 172, rgb('#f2fcff'), rgb('#8fd8f2'), 1.4)
    # волосы, длинные
    c.grad_poly([(48, 40), (112, 40), (128, 150), (100, 110), (60, 110), (32, 150)], rgb('#f4fbff'), rgb('#9fd6ee'), rgb('#6fb8d8'), 1.6)
    # лицо
    c.grad_ell(54, 42, 106, 96, rgb('#fffaf2'), rgb('#e4d4cc'), rgb('#9fd6ee'), 1.6)
    for sx in (-1, 1):
        x = 80 + sx * 12
        c.ell(x - 3, 66, x + 3, 76, rgb('#3c5c8c'), None)
        c.ell(x - 1.2, 67, x + 0.6, 69, (255, 255, 255, 255), None)
    c.arc((74, 76, 86, 88), 20, 160, rgb('#7a6a8a'), 1.4)
    # полумесяц на лбу
    c.arc((72, 46, 88, 62), 200, 340, rgb('#ffe08a'), 2.4)
    c.glow(80, 54, 14, rgb('#ffe08a'), 0.8)
    # искры вокруг
    for x, y, r in ((30, 70, 3), (130, 100, 3.4), (22, 150, 2.4), (136, 160, 2.6), (60, 30, 2.4), (110, 20, 2.8)):
        c.ell(x - r, y - r, x + r, y + r, rgb('#ffffff'), None)
        c.glow(x, y, r * 4, rgb('#bff7ff'), 0.8)
    return c


def portrait(npc_fn, name, box):
    c = npc_fn()
    im = c.im.resize((c.w, c.h), Image.LANCZOS)
    x0, y0, x1, y1 = box
    crop = im.crop((x0, y0, x1, y1)).resize((128, 128), Image.LANCZOS)
    crop.save(os.path.join(OUT, f'portrait_{name}.png'), optimize=True)


# ------------------------------------------------------------------ мебель дома (экран ×2)
WOOD = rgb('#9a6a3c'); WOOD_D = rgb('#5a3a22'); WOOD_L = rgb('#c4915a')

def bed_01():
    c = Cv(224, 240)
    c.shadow(112, 228, 100, 10)
    # изножье и изголовье
    c.grad_poly([(14, 70), (210, 70), (210, 224), (14, 224)], WOOD_L, WOOD_D)
    c.rr(14, 40, 210, 90, 8, WOOD, OL, 3)
    # матрас
    c.grad_poly([(24, 86), (200, 86), (204, 212), (20, 212)], rgb('#f1e3c2'), rgb('#cdb98d'))
    # лоскутное одеяло
    colors = [rgb('#b6496a'), rgb('#e0a458'), rgb('#4f8f6e'), rgb('#6a7fc4')]
    c.poly([(20, 128), (204, 128), (208, 216), (16, 216)], colors[0], OL, 2.6)
    for i in range(4):
        for j in range(3):
            x0 = 24 + i * 44; y0 = 134 + j * 27
            c.rr(x0, y0, x0 + 40, y0 + 24, 2, colors[(i + j) % 4], OL, 1.6)
    # подушка
    c.grad_ell(44, 92, 180, 132, rgb('#ffffff'), rgb('#d8d2e0'), OL, 2.4)
    c.line([(70, 112), (150, 112)], rgb('#c9c0d8'), 1.6)
    # изголовье: резьба с луной
    c.arc((90, 52, 134, 84), 200, 340, rgb('#f4e08a'), 3)
    # ножки
    c.rr(14, 218, 36, 238, 3, WOOD_D, OL, 2.4); c.rr(188, 218, 210, 238, 3, WOOD_D, OL, 2.4)
    return c


def table_01():
    c = Cv(224, 172)
    c.shadow(112, 164, 100, 8)
    c.grad_poly([(10, 44), (214, 44), (200, 80), (24, 80)], WOOD_L, WOOD, ow=2.6)
    c.rr(24, 78, 200, 92, 3, WOOD_D, OL, 2.4)
    for x in (30, 176):
        c.rr(x, 90, x + 18, 166, 3, WOOD, OL, 2.4)
    # скатерть-дорожка
    c.poly([(50, 46), (174, 46), (166, 74), (58, 74)], rgb('#6c4b8c'), OL, 2)
    # свеча
    c.rr(98, 14, 112, 46, 3, rgb('#f1e3c2'), OL, 2)
    c.poly([(105, 2), (110, 14), (100, 14)], rgb('#ffb84a'), OL, 1.4)
    c.glow(105, 8, 22, rgb('#ffb36b'), 0.8)
    # бутылочки
    for x, col in ((140, '#8fe39a'), (160, '#c9a2ff'), (178, '#ff8fa8')):
        c.rr(x, 16, x + 14, 44, 5, rgb(col, 230), OL, 2)
        c.rr(x + 4, 6, x + 10, 18, 2, rgb('#c4915a'), OL, 1.6)
    # книга
    c.rr(44, 30, 82, 46, 3, rgb('#a83a4a'), OL, 2); c.rr(46, 33, 80, 38, 1, rgb('#f1e3c2'), None)
    return c


def bookshelf_01():
    c = Cv(300, 256)
    c.shadow(150, 248, 130, 8)
    c.grad_poly([(10, 12), (290, 12), (290, 248), (10, 248)], WOOD_L, WOOD_D, ow=3)
    c.rr(4, 4, 296, 24, 6, WOOD, OL, 3)
    for k, y in enumerate((30, 100, 170)):
        c.rr(22, y, 278, y + 68, 4, rgb('#3a2616'), OL, 2.4)
        x = 28
        import random
        rnd = random.Random(k * 7 + 3)
        while x < 262:
            w = rnd.randint(9, 17); h = rnd.randint(40, 62)
            col = rnd.choice([rgb('#a83a4a'), rgb('#3f6aa8'), rgb('#4f8f6e'), rgb('#c98a3a'), rgb('#7a4a9a'), rgb('#d8c8a8')])
            c.rr(x, y + 66 - h, x + w, y + 66, 2, col, OL, 1.6)
            c.line([(x + 3, y + 66 - h + 8), (x + w - 3, y + 66 - h + 8)], lighter(col, 0.4), 1)
            x += w + 1
        if k == 1:  # склянки и череп вместо части книг
            c.rr(190, y + 36, 208, y + 66, 6, rgb('#8fe39a', 235), OL, 2); c.rr(196, y + 28, 202, y + 38, 2, WOOD_L, OL, 1.4)
            c.rr(216, y + 40, 232, y + 66, 5, rgb('#c9a2ff', 235), OL, 2)
            c.ell(244, y + 40, 270, y + 66, rgb('#f1e3c2'), OL, 2)
    return c


def cauldron_01():
    c = Cv(176, 200)
    c.shadow(88, 192, 74, 9)
    # камни очага
    for i, x in enumerate((20, 52, 84, 116)):
        c.grad_ell(x, 160 + (i % 2) * 4, x + 44, 196, rgb('#a8a4ae'), rgb('#5c5864'), OL, 2.4)
    # огонь
    c.poly([(70, 176), (88, 130), (106, 176)], rgb('#ff8a3a'), OL, 1.8)
    c.poly([(78, 176), (90, 148), (98, 176)], rgb('#ffd24a'), None)
    c.glow(88, 160, 40, rgb('#ff9a4a'), 0.7)
    # котёл
    c.grad_ell(18, 50, 158, 170, rgb('#58525e'), rgb('#26222c'), OL, 3)
    c.rr(10, 52, 166, 74, 10, rgb('#3a3640'), OL, 3)
    # варево
    c.grad_ell(22, 50, 154, 82, rgb('#b6f5a8'), rgb('#6fd48a'), OL, 2.4)
    for x, y, r in ((60, 62, 6), (92, 58, 8), (118, 66, 5), (76, 70, 4)):
        c.ell(x - r, y - r, x + r, y + r, rgb('#e4ffd8', 230), rgb('#4fa86a'), 1.4)
    c.glow(88, 62, 40, rgb('#8fe39a'), 0.7)
    # блик и заклёпки
    c.arc((34, 90, 90, 150), 150, 230, rgb('#9a94a4'), 3)
    for x in (30, 146):
        c.ell(x - 3, 66, x + 3, 72, rgb('#8a8494'), OL, 1.2)
    # ручки
    c.arc((2, 70, 26, 110), 90, 270, OL, 3); c.arc((150, 70, 174, 110), 270, 90, OL, 3)
    return c


def wardrobe_01():
    c = Cv(168, 272)
    c.shadow(84, 266, 70, 8)
    c.grad_poly([(10, 24), (158, 24), (158, 262), (10, 262)], WOOD_L, WOOD_D, ow=3)
    c.rr(4, 8, 164, 34, 8, WOOD, OL, 3)
    c.rr(22, 46, 80, 244, 4, rgb('#7a4f2a'), OL, 2.6)
    c.rr(88, 46, 146, 244, 4, rgb('#7a4f2a'), OL, 2.6)
    # резьба-луна на дверцах
    c.arc((36, 110, 66, 140), 200, 340, rgb('#f4e08a'), 2.6)
    c.arc((102, 110, 132, 140), 200, 340, rgb('#f4e08a'), 2.6)
    c.ell(74, 140, 82, 150, rgb('#f4e08a'), OL, 1.6); c.ell(86, 140, 94, 150, rgb('#f4e08a'), OL, 1.6)
    # рукав мантии торчит из двери
    c.poly([(80, 190), (96, 190), (98, 248), (80, 248)], rgb('#6c4b8c'), OL, 2)
    c.rr(14, 250, 40, 270, 3, WOOD_D, OL, 2.4); c.rr(128, 250, 154, 270, 3, WOOD_D, OL, 2.4)
    return c


def rug_01():
    c = Cv(500, 300)
    # овальный ковёр с узором
    c.grad_ell(6, 10, 494, 292, rgb('#a8456a'), rgb('#7a2e4e'), OL, 3)
    c.ell(34, 36, 466, 266, None, rgb('#f4e08a'), 3)
    c.grad_ell(64, 62, 436, 240, rgb('#3f6a88'), rgb('#2e4f68'), rgb('#f1e3c2'), 2.4)
    # ромбы и звёзды по кругу
    for i in range(10):
        a = i / 10 * math.tau
        x = 250 + math.cos(a) * 190; y = 150 + math.sin(a) * 100
        c.poly([(x, y - 10), (x + 9, y), (x, y + 10), (x - 9, y)], rgb('#f4e08a'), OL, 1.4)
    # центр: луна
    c.ell(204, 104, 296, 196, rgb('#f4e08a'), OL, 2.4)
    c.ell(224, 100, 310, 190, rgb('#3f6a88'), None)
    c.arc((205, 105, 295, 195), 110, 250, OL, 2)
    # бахрома
    for i in range(18):
        x = 30 + i * 26
        c.line([(x, 12 + 6 * math.cos(i)), (x, 2)], rgb('#e8d8b0'), 2)
    return c


def herb_bundle_01():
    c = Cv(68, 124)
    c.line([(34, 2), (34, 36)], rgb('#a8743a'), 2.2)
    c.line([(24, 36), (44, 36)], rgb('#e8d8b0'), 3)
    for dx, col, ln in ((-14, '#6fbf73', 70), (-6, '#9fe9ff', 84), (4, '#8fe39a', 76), (12, '#c9a2ff', 66), (0, '#6fbf73', 90)):
        c.poly([(34 + dx * 0.3, 38), (34 + dx - 5, 38 + ln * 0.5), (34 + dx, 38 + ln), (34 + dx + 5, 38 + ln * 0.5)], rgb(col), OL, 1.6)
    return c


def plant_pot_01():
    c = Cv(96, 144)
    c.shadow(48, 138, 34, 5)
    # горшок
    c.grad_poly([(22, 88), (74, 88), (68, 136), (28, 136)], rgb('#c4764a'), rgb('#8a4a2a'), ow=2.4)
    c.rr(18, 80, 78, 94, 4, rgb('#d8865a'), OL, 2.4)
    for ang, col in ((-60, '#4f9a5a'), (-30, '#6fbf73'), (0, '#3f8a4a'), (30, '#6fbf73'), (60, '#4f9a5a')):
        a = math.radians(ang - 90)
        x1 = 48 + math.cos(a) * 52; y1 = 82 + math.sin(a) * 66
        mx = 48 + math.cos(a) * 26; my = 82 + math.sin(a) * 34
        c.poly([(46, 82), (mx - 9, my), (x1, y1), (mx + 9, my), (50, 82)], rgb(col), OL, 1.8)
    c.ell(42, 6, 54, 18, rgb('#bff7ff'), OL, 1.6)
    c.glow(48, 12, 14, rgb('#bff7ff'), 0.7)
    return c


def cat_01():
    c = Cv(108, 76)
    c.shadow(54, 70, 40, 5)
    # свернувшийся чёрный кот
    c.grad_ell(8, 22, 100, 72, rgb('#4a4654'), rgb('#26222c'), OL, 2.6)
    c.grad_ell(64, 14, 98, 50, rgb('#58546a'), rgb('#2e2a38'), OL, 2.4)
    c.poly([(68, 20), (72, 4), (82, 18)], rgb('#4a4654'), OL, 2); c.poly([(84, 18), (92, 4), (96, 22)], rgb('#4a4654'), OL, 2)
    c.poly([(70, 18), (73, 9), (79, 17)], rgb('#e89aa8'), None); c.poly([(86, 17), (91, 9), (93, 20)], rgb('#e89aa8'), None)
    c.line([(72, 32), (80, 34)], rgb('#e8d86a'), 2); c.line([(86, 34), (94, 32)], rgb('#e8d86a'), 2)
    c.ell(82, 38, 88, 43, rgb('#e89aa8'), None)
    c.arc((8, 40, 70, 80), 160, 330, rgb('#3a3644'), 5)
    return c


def trunk_01():
    c = Cv(168, 116)
    c.shadow(84, 110, 72, 6)
    c.grad_poly([(10, 48), (158, 48), (156, 108), (12, 108)], rgb('#a8743a'), rgb('#6a4424'), ow=3)
    c.grad_poly([(14, 22), (154, 22), (158, 50), (10, 50)], rgb('#c4915a'), rgb('#8a5a30'), ow=3)
    for x in (30, 134):
        c.rr(x - 6, 22, x + 6, 108, 2, rgb('#3a3640'), OL, 1.8)
    c.rr(72, 40, 96, 62, 4, rgb('#d9b45a'), OL, 2.2)
    c.ell(80, 46, 88, 54, OL, None)
    return c


# ------------------------------------------------------------------ узлы сбора
def moon_herb_01():
    c = Cv(112, 100)
    c.shadow(56, 94, 30, 5)
    c.glow(56, 52, 50, rgb('#9fe9ff'), 0.8)
    for ang, ln, col in ((-50, 52, '#7fd4d0'), (-25, 62, '#9fe9ff'), (0, 70, '#7fe8c8'), (25, 62, '#9fe9ff'), (50, 52, '#7fd4d0')):
        a = math.radians(ang - 90)
        x1 = 56 + math.cos(a) * ln; y1 = 90 + math.sin(a) * ln
        mx = 56 + math.cos(a) * ln * 0.5; my = 90 + math.sin(a) * ln * 0.5
        c.poly([(54, 90), (mx - 10, my), (x1, y1), (mx + 10, my), (58, 90)], rgb(col), OL, 1.8)
        c.line([(56, 90), (x1 * 0.5 + 28, y1 * 0.5 + 45 * 0.0 + (y1 + 90) / 2 - y1 * 0.5)], lighter(rgb(col), 0.5), 1)
    c.ell(46, 26, 66, 46, rgb('#f4fcff'), OL, 2)
    c.glow(56, 36, 18, rgb('#ffffff'), 0.9)
    return c


def mushrooms_brown_01():
    c = Cv(120, 92)
    c.shadow(60, 86, 46, 5)
    for x, y, r in ((30, 62, 22), (68, 54, 28), (96, 70, 16)):
        c.rr(x - r * 0.22, y, x + r * 0.22, 86, 3, rgb('#eadcc0'), OL, 2)
        c.grad_ell(x - r, y - r * 0.8, x + r, y + r * 0.45, rgb('#c98a5a'), rgb('#8a5230'), OL, 2.2)
        for dx, dy in ((-0.4, -0.2), (0.3, -0.35), (0.1, 0.05)):
            c.ell(x + dx * r - 3, y + dy * r - 2, x + dx * r + 3, y + dy * r + 2, rgb('#f3e2c4'), None)
    return c


def resin_log_01():
    c = Cv(168, 132)
    c.shadow(84, 126, 70, 6)
    # пенёк-бревно
    c.grad_poly([(26, 44), (142, 44), (150, 122), (18, 122)], rgb('#8a5a34'), rgb('#4a2e18'), ow=3)
    for x in (44, 70, 98, 124):
        c.line([(x, 50), (x + 2, 118)], rgb('#6a4424'), 2)
    c.grad_ell(20, 24, 148, 66, rgb('#d9a86a'), rgb('#a8743a'), OL, 3)
    c.ell(46, 34, 122, 56, None, rgb('#8a5a30'), 1.8); c.ell(68, 40, 100, 52, None, rgb('#8a5a30'), 1.6)
    # янтарные потёки
    for x, ln in ((50, 40), (86, 56), (116, 34)):
        c.poly([(x - 7, 56), (x + 7, 56), (x + 6, 56 + ln), (x, 56 + ln + 9), (x - 6, 56 + ln)], rgb('#f0b13a'), OL, 1.8)
        c.line([(x - 2, 60), (x - 2, 56 + ln - 4)], rgb('#ffe08a'), 1.4)
    c.grad_ell(62, 94, 112, 124, rgb('#f6c04a'), rgb('#c88a20'), OL, 2)
    c.glow(86, 108, 22, rgb('#ffcc66'), 0.7)
    return c


def rune_sigil_01():
    c = Cv(180, 100)
    c.glow(90, 54, 80, rgb('#c9a2ff'), 0.8)
    c.grad_ell(8, 14, 172, 92, rgb('#9a96a4'), rgb('#5a5664'), OL, 3)
    c.ell(24, 24, 156, 82, None, rgb('#c9a2ff'), 2.4)
    c.ell(40, 32, 140, 74, None, rgb('#c9a2ff'), 1.6)
    for x, y in ((90, 38), (66, 52), (114, 52), (80, 66), (100, 66)):
        c.line([(x, y - 8), (x, y + 8)], rgb('#e6d4ff'), 2); c.line([(x - 5, y), (x + 5, y)], rgb('#e6d4ff'), 2)
    c.glow(90, 52, 30, rgb('#e6d4ff'), 0.9)
    return c


def rune_slab_01():
    c = Cv(192, 112)
    c.shadow(96, 104, 80, 7)
    c.grad_poly([(14, 40), (178, 40), (186, 100), (6, 100)], rgb('#aaa6b0'), rgb('#5c5864'), ow=3)
    c.grad_poly([(22, 18), (170, 18), (178, 44), (14, 44)], rgb('#c8c4ce'), rgb('#8a8694'), ow=3)
    for x in (50, 96, 142):
        c.line([(x, 58), (x, 86)], rgb('#c9a2ff'), 2.6); c.line([(x - 8, 72), (x + 8, 72)], rgb('#c9a2ff'), 2.6)
        c.glow(x, 72, 14, rgb('#c9a2ff'), 0.7)
    c.line([(30, 100), (50, 88)], rgb('#3a3640'), 1.6)
    return c


def bramble_01():
    c = Cv(192, 160)
    c.shadow(96, 152, 80, 7)
    import random
    rnd = random.Random(11)
    for i in range(14):
        a = rnd.uniform(-70, 70)
        ln = rnd.uniform(60, 120)
        ar = math.radians(a - 90)
        x1 = 96 + math.cos(ar) * ln * 0.9; y1 = 150 + math.sin(ar) * ln
        mx = (96 + x1) / 2 + rnd.uniform(-14, 14); my = (150 + y1) / 2
        c.line([(96 + rnd.uniform(-20, 20), 150), (mx, my), (x1, y1)], rgb('#3a2418'), 5)
        c.line([(96, 150), (mx, my), (x1, y1)], rgb('#6a3a2a'), 2.6)
        for t in (0.35, 0.6, 0.85):
            tx = (mx if t < 0.6 else x1) * 1; ty = (my if t < 0.6 else y1)
            c.poly([(tx - 3, ty), (tx + rnd.choice((-1, 1)) * 12, ty - 8), (tx + 3, ty + 3)], rgb('#d8c8a0'), OL, 1.2)
    for x, y in ((50, 80), (90, 52), (130, 84), (70, 110), (116, 118)):
        c.ell(x - 9, y - 7, x + 9, y + 7, rgb('#5a3a62'), OL, 2)
    # смола блестит внутри
    c.ell(84, 100, 108, 120, rgb('#f0b13a'), OL, 1.8); c.glow(96, 110, 22, rgb('#ffcc66'), 0.6)
    return c


def campfire_01():
    c = Cv(128, 112)
    c.shadow(64, 104, 52, 6)
    for i, x in enumerate((20, 46, 72, 98)):
        c.grad_ell(x, 82 + (i % 2) * 4, x + 28, 108, rgb('#a8a4ae'), rgb('#5c5864'), OL, 2.4)
    c.line([(30, 96), (98, 70)], rgb('#6a4424'), 8); c.line([(98, 96), (30, 70)], rgb('#8a5a34'), 8)
    c.line([(30, 96), (98, 70)], OL, 1);
    c.poly([(48, 80), (64, 34), (80, 80)], rgb('#ff7a2a'), OL, 1.8)
    c.poly([(54, 80), (66, 52), (74, 80)], rgb('#ffd24a'), None)
    return c


# ------------------------------------------------------------------ иконки 64×64
def icon(name, fn):
    c = Cv(64, 64)
    fn(c)
    c.save(name)


def icon_mushroom(c):
    c.rr(26, 36, 38, 58, 3, rgb('#eadcc0'), OL, 2)
    c.grad_ell(8, 12, 56, 46, rgb('#d9744a'), rgb('#9a4a2a'), OL, 2.4)
    for x, y in ((20, 24), (34, 20), (44, 30), (28, 33)):
        c.ell(x - 3, y - 3, x + 3, y + 3, rgb('#f6e8d0'), None)


def icon_resin(c):
    c.poly([(32, 6), (50, 36), (46, 54), (32, 60), (18, 54), (14, 36)], rgb('#f0b13a'), OL, 2.4)
    c.poly([(30, 14), (22, 36), (26, 50), (32, 44)], rgb('#ffe08a'), None)
    c.glow(32, 36, 26, rgb('#ffcc66'), 0.7)


def icon_dust(c):
    c.glow(32, 34, 30, rgb('#c9a2ff'), 0.9)
    c.poly([(14, 52), (50, 52), (44, 38), (20, 38)], rgb('#a68acb'), OL, 2.2)
    c.grad_ell(18, 24, 46, 46, rgb('#e6d4ff'), rgb('#a68acb'), OL, 2.2)
    for x, y in ((22, 14), (34, 8), (44, 16), (30, 20)):
        c.ell(x - 2, y - 2, x + 2, y + 2, rgb('#ffffff'), None)


def potion_icon(col, liquid):
    def fn(c):
        c.grad_ell(10, 24, 54, 62, lighter(liquid, 0.35), liquid, OL, 2.6)
        c.rr(24, 8, 40, 30, 4, rgb('#dfeff2', 230), OL, 2.2)
        c.rr(22, 2, 42, 12, 3, rgb('#c4915a'), OL, 2)
        c.ell(20, 34, 28, 42, rgb('#ffffff', 190), None)
        c.glow(32, 44, 24, col, 0.6)
    return fn


def icon_talk(c):
    c.poly([(6, 12), (58, 12), (58, 44), (36, 44), (24, 58), (24, 44), (6, 44)], rgb('#f6e8d0'), OL, 3)
    for x in (20, 32, 44):
        c.ell(x - 3.5, 24, x + 3.5, 31, rgb('#6a4a30'), None)


def icon_gather(c):
    c.poly([(32, 6), (52, 22), (46, 44), (32, 58), (18, 44), (12, 22)], rgb('#6fd48a'), OL, 2.6)
    c.line([(32, 12), (32, 56)], rgb('#2f7a46'), 2.4)
    c.line([(32, 28), (44, 20)], rgb('#2f7a46'), 1.8); c.line([(32, 38), (20, 30)], rgb('#2f7a46'), 1.8)


def icon_alchemy(c):
    c.grad_ell(8, 22, 56, 60, rgb('#58525e'), rgb('#26222c'), OL, 2.6)
    c.rr(6, 20, 58, 30, 5, rgb('#3a3640'), OL, 2.2)
    c.grad_ell(10, 20, 54, 34, rgb('#b6f5a8'), rgb('#6fd48a'), OL, 2)
    for x, y, r in ((24, 14, 4), (36, 8, 5), (44, 16, 3)):
        c.ell(x - r, y - r, x + r, y + r, rgb('#e4ffd8', 240), rgb('#4fa86a'), 1.4)


def icon_inspect(c):
    c.poly([(4, 32), (18, 16), (32, 12), (46, 16), (60, 32), (46, 48), (32, 52), (18, 48)], rgb('#f6e8d0'), OL, 3)
    c.ell(20, 20, 44, 44, rgb('#6aa8d8'), OL, 2.4)
    c.ell(27, 27, 37, 37, OL, None)
    c.ell(29, 26, 33, 30, rgb('#ffffff'), None)


def icon_journal(c):
    c.poly([(8, 12), (32, 18), (56, 12), (56, 52), (32, 58), (8, 52)], rgb('#a83a4a'), OL, 3)
    c.poly([(12, 16), (32, 22), (32, 54), (12, 48)], rgb('#f1e3c2'), OL, 2); c.poly([(52, 16), (32, 22), (32, 54), (52, 48)], rgb('#e8d8b0'), OL, 2)
    for y in (28, 34, 40):
        c.line([(16, y), (28, y + 2)], rgb('#a8977a'), 1.6); c.line([(36, y + 2), (48, y)], rgb('#a8977a'), 1.6)
    c.ell(46, 6, 58, 18, rgb('#ffe08a'), OL, 2)


def main():
    os.makedirs(OUT, exist_ok=True)
    npc_mirra().save('npc_mirra'); npc_veda().save('npc_veda'); npc_goran().save('npc_goran'); npc_selena().save('npc_selena')
    portrait(npc_mirra, 'mirra', (36, 0, 124, 104)); portrait(npc_veda, 'veda', (36, 0, 124, 104))
    portrait(npc_goran, 'goran', (36, 0, 124, 104)); portrait(npc_selena, 'selena', (32, 20, 128, 116))
    for fn in (bed_01, table_01, bookshelf_01, cauldron_01, wardrobe_01, rug_01, herb_bundle_01, plant_pot_01, cat_01, trunk_01,
               moon_herb_01, mushrooms_brown_01, resin_log_01, rune_sigil_01, rune_slab_01, bramble_01, campfire_01):
        fn().save(fn.__name__)
    icon('icon_mushroom', icon_mushroom); icon('icon_resin', icon_resin); icon('icon_dust', icon_dust)
    icon('icon_potion_life', potion_icon(rgb('#e0566a'), rgb('#e0566a')))
    icon('icon_potion_mana', potion_icon(rgb('#6ab4ff'), rgb('#6ab4ff')))
    icon('icon_potion_fire', potion_icon(rgb('#ff8a3a'), rgb('#ff8a3a')))
    icon('icon_talk', icon_talk); icon('icon_gather', icon_gather); icon('icon_alchemy', icon_alchemy)
    icon('icon_inspect', icon_inspect); icon('icon_journal', icon_journal)
    print('ok')


if __name__ == '__main__':
    main()
