"""Willows for chapter III: glass (time stopped) and living (after the grove gets its name back)."""
import math
import random
from PIL import Image
from ch3_lib import Canvas, hexrgb, outline, trim, specular

GLASS = dict(
    back=[hexrgb('#6f93a6', 235), hexrgb('#7d8fb6', 235), hexrgb('#688ea0', 235)],
    mid=[hexrgb('#9ccbd8', 240), hexrgb('#aebce2', 240), hexrgb('#94c4d0', 240), hexrgb('#c4b6e0', 235)],
    front=[hexrgb('#d2eef3', 245), hexrgb('#e4defa', 245), hexrgb('#c5e8ee', 245)],
    twig=hexrgb('#8fb0c0', 250), trunk=hexrgb('#9fbac8', 250), trunk_dark=hexrgb('#5d7c8e', 255), trunk_hi=hexrgb('#eef8fb', 230),
    line=(36, 44, 60), ember=hexrgb('#ffb468', 220), glass=True,
)
ALIVE = dict(
    back=[hexrgb('#43692f'), hexrgb('#4d7734'), hexrgb('#3e612c')],
    mid=[hexrgb('#6e9f45'), hexrgb('#7bab4f'), hexrgb('#64953f'), hexrgb('#8ab35a')],
    front=[hexrgb('#a3cb6a'), hexrgb('#b4d77a'), hexrgb('#98c262')],
    twig=hexrgb('#6a4c33'), trunk=hexrgb('#7a5a3c'), trunk_dark=hexrgb('#4b3524'), trunk_hi=hexrgb('#a88a62', 210),
    line=(40, 32, 22), ember=None, glass=False,
)
DRY = dict(
    back=[hexrgb('#8c7b5e'), hexrgb('#7d6c52')], mid=[hexrgb('#a8946f'), hexrgb('#b39f78')], front=[hexrgb('#c9b58b')],
    twig=hexrgb('#6b5a46'), trunk=hexrgb('#857158'), trunk_dark=hexrgb('#5a4a38'), trunk_hi=hexrgb('#b8a483', 200),
    line=(46, 38, 30), ember=None, glass=False,
)


def cubic(p0, p1, p2, p3, n):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]))
    return out


def draw_trunk(c, cx, base, top, w0, w1, sway, pal, ember=False, cracked=False):
    n = 14
    pts = [(cx + math.sin(i / n * math.pi * 1.1) * sway, base + (top - base) * i / n) for i in range(n + 1)]
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        t = i / n
        w = w0 + (w1 - w0) * (t ** 0.8)
        left.append((x - w / 2, y))
        right.append((x + w / 2, y))
    bx, by = pts[0]
    c.poly([(bx - w0 * 1.0, by + 1)] + left + right[::-1] + [(bx + w0 * 1.0, by + 1)], pal['trunk'])
    mid = [((l[0] + r[0]) / 2 + w0 * 0.08, l[1]) for l, r in zip(left, right)]
    c.poly(mid + right[::-1] + [(bx + w0 * 1.0, by + 1)], pal['trunk_dark'])
    c.line([(l[0] * 0.72 + r[0] * 0.28, l[1]) for l, r in zip(left, right)][1:-2], pal['trunk_hi'], max(1.2, w1 * 0.16))
    if ember and pal['ember']:
        crack = [((l[0] + r[0]) / 2 + math.sin(i * 1.9) * w0 * 0.14, l[1]) for i, (l, r) in enumerate(zip(left, right))][1:-2]
        c.line(crack, pal['ember'], max(1.6, w0 * 0.14))
    return pts


def willow(seed=1, w=200, h=270, pal=GLASS, ember=False, crown_rx=0.44, crown_ry=0.27, strands=60, trunk_w=0.1):
    """Weeping willow: short trunk; branches arch up and out from the crown, then the leafy strands fall in a curtain."""
    rnd = random.Random(seed)
    sk = w / 200.0   # line widths and leaves scale with the canvas
    cx, base = w / 2, h - 5 * sk
    top = h * 0.4
    sway = w * 0.025 * (1 if seed % 2 else -1)
    O = (cx + sway * 0.6, top)
    rx, ry = w * crown_rx, h * crown_ry

    def strand(layer, colors, d, depth, leafy=1.0):
        d = max(-1.0, min(1.0, d))
        ad = abs(d)
        p0 = (O[0] + d * rx * 0.12, O[1] + rnd.uniform(-2, 4) * sk)
        p1 = (O[0] + d * rx * (0.35 + 0.15 * rnd.random()), O[1] - ry * (1.05 - 0.35 * ad) - rnd.uniform(0, 8) * sk)
        p2 = (O[0] + d * rx * (0.85 + 0.12 * rnd.random()), O[1] - ry * (0.55 - 0.3 * ad))
        drop = h * (0.30 + 0.24 * rnd.random()) * (1.0 - 0.18 * depth) * (0.8 + 0.25 * ad)
        p3 = (O[0] + d * rx * (0.95 + 0.15 * rnd.random()), min(base - 6 * sk, O[1] + drop))
        pts = cubic(p0, p1, p2, p3, 22)
        col = colors[rnd.randrange(len(colors))]
        if depth > 0.25:
            layer.line(pts[:9], pal['twig'], 1.1 * sk)
        hang = pts[7:] if depth > 0.25 else pts[9:]
        layer.line(hang, col, rnd.uniform(1.3, 2.0) * sk)
        for i in range(1, len(hang)):
            if rnd.random() < 0.85 * leafy:
                x, y = hang[i]
                ang = math.radians(rnd.uniform(-20, 20) - d * 14)
                layer.rotated_ellipse(x + rnd.uniform(-1.5, 1.5) * sk, y + sk, rnd.uniform(1.3, 2.1) * sk, rnd.uniform(3.8, 6.2) * sk, ang, col)

    back, dome, trunk, front, hi = (Canvas(w, h) for _ in range(5))
    nb = int(strands * 0.7)
    for k in range(nb):
        strand(back, pal['back'], -1 + 2 * (k + rnd.uniform(-0.4, 0.4)) / max(1, nb - 1), 0.3)
    # soft crown mass so the top reads as one shape (kept inside the crown ellipse)
    for i in range(22):
        a = rnd.uniform(0.25, math.pi - 0.25)
        r = rnd.uniform(0.1, 0.62)
        x = O[0] - math.cos(a) * rx * r
        y = O[1] - math.sin(a) * ry * r * 0.9 + 4 * sk
        rr = rnd.uniform(w * 0.05, w * 0.085)
        dome.ellipse(x, y, rr, rr * 0.7, pal['back'][rnd.randrange(len(pal['back']))])
    draw_trunk(trunk, cx, base, top + 4 * sk, w * trunk_w, w * trunk_w * 0.55, sway, pal, ember=ember)
    for k in range(strands):
        strand(front, pal['mid'], -1 + 2 * (k + rnd.uniform(-0.45, 0.45)) / max(1, strands - 1), 0.0)
    nh = int(strands * 0.4)
    for k in range(nh):
        strand(hi, pal['front'], -0.9 + 1.8 * (k + rnd.uniform(-0.5, 0.5)) / max(1, nh - 1), 0.1, leafy=0.8)
    c = Canvas(w, h)
    for L in (back, dome, trunk, front, hi):
        c.layer(L)
    img = c.result()
    img = outline(img, pal['line'], px=max(2, round(2 * sk)), soft=0.7 * sk)
    if pal.get('glass'):
        img = specular(img, seed=seed + 11, count=6, width=0.018, strength=0.55)
    return trim(img, 1)


def sapling(seed=5, w=70, h=86, pal=ALIVE):
    """A thin young willow (the sprout freed from the glass cocoon)."""
    rnd = random.Random(seed)
    c = Canvas(w, h)
    cx, base = w / 2, h - 4
    stem = [(cx + math.sin(i / 8 * 2.2) * 2, base - i / 8 * h * 0.62) for i in range(9)]
    c.line(stem, pal['trunk'], 2.4)
    tip = stem[-1]
    for k in range(9):
        d = -1 + 2 * k / 8
        pts = cubic(tip, (tip[0] + d * 8, tip[1] - 8), (tip[0] + d * 16, tip[1] - 2), (tip[0] + d * 18, tip[1] + rnd.uniform(14, 26)), 10)
        col = pal['mid'][k % len(pal['mid'])]
        c.line(pts, col, 1.2)
        for x, y in pts[4::2]:
            c.rotated_ellipse(x, y, 1.4, 3.6, math.radians(-d * 12), pal['front'][k % len(pal['front'])])
    # tiny soil mound
    c.ellipse(cx, base, w * 0.26, 4, hexrgb('#5a4630'))
    img = outline(c.result(), pal['line'], px=1, soft=0.5)
    return trim(img, 1)


if __name__ == '__main__':
    import sys
    out = sys.argv[1]
    sheet = Image.new('RGBA', (1100, 330), (70, 86, 80, 255))
    x = 10
    for i, (pal, em) in enumerate([(GLASS, True), (GLASS, False), (ALIVE, False), (ALIVE, False), (DRY, False)]):
        t = willow(seed=i + 1, pal=pal, ember=em)
        sheet.alpha_composite(t, (x, 320 - t.height))
        x += t.width + 14
    s = sapling()
    sheet.alpha_composite(s, (x, 320 - s.height))
    sheet.save(out)
