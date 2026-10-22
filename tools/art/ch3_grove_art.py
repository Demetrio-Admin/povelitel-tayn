"""Chapter III «Безымянная роща» — prototype art drawn in code.

    python3 tools/art/ch3_grove_art.py            # writes public/assets/chapter3/*.webp,
                                                  # src/config/chapter3.art.generated.js and
                                                  # docs/design/chapter-3-art/contact-sheet.png

Procedural pieces (willows, jars, glass walls, stream, rift, ground tiles, icons) are drawn with PIL + numpy;
characters and creatures are recolours / glass treatments of existing chapter I–II paintings, so the style stays
close to the approved art. Everything here is temporary prototype art (TEMPORARY_ART in assets.manifest.js);
the final list of paintings is docs/design/chapter-3-art-inventory-v0.1.md.
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

sys.path.insert(0, os.path.dirname(__file__))
from ch3_lib import (Canvas, hexrgb, mix, outline, glow, trim, gradient_map, hue_mask, blend_masked, glassify, specular,
                     tileable_noise, save_webp)
from ch3_trees import willow, sapling, GLASS, ALIVE, DRY, cubic
import ch3_props as P

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'chapter3')
DOCS = os.path.join(ROOT, 'docs', 'design', 'chapter-3-art')
CONFIG = os.path.join(ROOT, 'src', 'config', 'chapter3.art.generated.js')
VERSION = 'ch3-proto-2'

FILES, SIZES, SHEET = {}, {}, []


def _old_sizes():
    try:
        txt = open(CONFIG, encoding='utf-8').read()
        return json.loads(txt.split('CHAPTER3_SIZES = ', 1)[1].rsplit(';', 1)[0])
    except Exception:
        return {}


OLD = _old_sizes()


def src(rel):
    return Image.open(os.path.join(ROOT, 'public', rel)).convert('RGBA')


def register(key, img, name=None, height=None, size=None, sheet=True):
    """Save as WebP and record the manifest entry. height — display height (width keeps the aspect); size — exact."""
    name = name or key
    path = os.path.join(OUT, name + '.webp')
    save_webp(img, path)
    FILES[key] = f'assets/chapter3/{name}.webp?v={VERSION}'
    if size:
        SIZES[key] = [int(size[0]), int(size[1])]
    elif height:
        SIZES[key] = [max(1, round(height * img.width / img.height)), int(height)]
    if sheet:
        SHEET.append((key, img))
    return img


def fit_h(img, h):
    w = max(1, round(img.width * h / img.height))
    return img.resize((w, h), Image.LANCZOS)


# ============================================================================ trees
def make_trees():
    register('glass_willow_01', willow(seed=1, w=400, h=540, pal=GLASS, ember=True), height=212)
    register('glass_willow_02', willow(seed=4, w=380, h=520, pal=GLASS, ember=False), height=200)
    register('tree_willow_01', willow(seed=1, w=400, h=540, pal=ALIVE), height=212)
    register('tree_willow_02', willow(seed=4, w=380, h=520, pal=ALIVE), height=200)
    register('willow_sprout_01', sapling(seed=5, w=140, h=172), height=80)


def rakita_glass():
    big = willow(seed=9, w=760, h=860, pal=GLASS, ember=True, crown_rx=0.47, crown_ry=0.3, strands=110, trunk_w=0.16)
    # lightning wound: a bright jagged crack of frozen fire down the trunk and a warm halo
    c = Canvas(big.width, big.height)
    cx = big.width / 2
    rnd = random.Random(4)
    pts = [(cx + rnd.uniform(-10, 10), big.height * 0.36)]
    y = big.height * 0.36
    while y < big.height * 0.93:
        y += rnd.uniform(18, 34)
        pts.append((cx + rnd.uniform(-22, 22), y))
    c.line(pts, hexrgb('#ffd27a', 255), 7)
    c.line(pts, hexrgb('#fff4d6', 255), 2.6)
    crack = c.result()
    warm = glow(crack, (255, 168, 80), radius=14, strength=0.9)
    big.alpha_composite(warm)
    return trim(big, 2)


def rakita_alive():
    """Burnt old willow: a charred broken trunk, ash, and young green shoots around it."""
    w, h = 520, 520
    c = Canvas(w, h)
    cx, base = w / 2, h - 10
    trunk = [(cx - 120, base), (cx - 96, base - 90), (cx - 92, base - 170), (cx - 70, base - 220), (cx - 40, base - 205),
             (cx - 20, base - 250), (cx + 6, base - 214), (cx + 30, base - 236), (cx + 56, base - 190), (cx + 94, base - 120), (cx + 124, base)]
    c.poly(trunk, hexrgb('#3b322d'))
    c.poly([(cx + 4, base), (cx + 6, base - 214), (cx + 30, base - 236), (cx + 56, base - 190), (cx + 94, base - 120), (cx + 124, base)], hexrgb('#2a2320'))
    # broken branch stubs
    c.line([(cx - 80, base - 160), (cx - 150, base - 220), (cx - 170, base - 214)], hexrgb('#3b322d'), 16)
    c.line([(cx + 70, base - 150), (cx + 140, base - 196)], hexrgb('#2a2320'), 14)
    for i in range(7):
        y0 = base - 30 - i * 28
        c.line([(cx - 80 + i * 3, y0), (cx - 30 + i * 2, y0 - 12), (cx + 30, y0 - 4)], hexrgb('#55473d'), 3)
    # roots and ash
    c.ellipse(cx, base, 150, 18, hexrgb('#6d665f', 230))
    for side in (-1, 1):
        c.line([(cx + side * 60, base - 6), (cx + side * 120, base - 2), (cx + side * 170, base + 4)], hexrgb('#3b322d'), 14)
    img = c.result()
    rnd = random.Random(2)
    for i, (dx, s) in enumerate([(-170, 0.7), (-110, 0.9), (-40, 0.6), (40, 0.8), (120, 1.0), (180, 0.75), (-60, 0.55), (90, 0.5)]):
        sp = sapling(seed=10 + i, w=int(140 * s), h=int(172 * s))
        img.alpha_composite(sp, (int(cx + dx - sp.width / 2), int(base + 6 - sp.height - rnd.uniform(0, 10))))
    img = outline(img, (36, 28, 24), px=3, soft=0.8)
    return trim(img, 2)


# ============================================================================ glass objects
GLASS_FILL = hexrgb('#cfeaf0', 150)
GLASS_EDGE = hexrgb('#eefafc', 235)
LINE = (36, 44, 60)


def shard(c, cx, by, w, h, lean, rnd, fill=None):
    """One crystal shard standing on y=by (bottom), pointing up."""
    tipx = cx + lean
    pts = [(cx - w / 2, by), (cx - w / 2 + rnd.uniform(-2, 2), by - h * rnd.uniform(0.55, 0.75)), (tipx, by - h),
           (cx + w / 2 + rnd.uniform(-2, 2), by - h * rnd.uniform(0.5, 0.7)), (cx + w / 2, by)]
    col = fill or [hexrgb('#bfe2ea', 225), hexrgb('#d4ccf0', 225), hexrgb('#a9d4de', 225), hexrgb('#e2f4f7', 230)][rnd.randrange(4)]
    c.poly(pts, col)
    c.poly([pts[0], pts[1], pts[2], (cx + lean * 0.4, by)], mix(col, (255, 255, 255, 240), 0.35))
    c.line([pts[1], pts[2]], hexrgb('#ffffff', 220), max(1.2, w * 0.06))


def glass_dam():
    w, h = 260, 140
    c = Canvas(w, h)
    rnd = random.Random(7)
    c.ellipse(w / 2, h - 16, w * 0.48, 16, hexrgb('#9cc9d4', 200))
    for i in range(22):
        x = rnd.uniform(18, w - 18)
        hh = rnd.uniform(40, 108) * (1 - abs(x - w / 2) / w * 0.9)
        shard(c, x, h - 10 + rnd.uniform(-6, 4), rnd.uniform(14, 30), hh, rnd.uniform(-10, 10), rnd)
    img = outline(c.result(), LINE, px=2, soft=0.6)
    return trim(specular(img, seed=5, count=4), 1)


def tapered(c, pts, w0, w1, col, hi=None, line=None):
    left, right = [], []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        t = i / (n - 1)
        wdt = w0 + (w1 - w0) * t
        j0, j1 = max(0, i - 1), min(n - 1, i + 1)
        dx, dy = pts[j1][0] - pts[j0][0], pts[j1][1] - pts[j0][1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        left.append((x + nx * wdt / 2, y + ny * wdt / 2))
        right.append((x - nx * wdt / 2, y - ny * wdt / 2))
    c.poly(left + right[::-1], col)
    if hi:
        c.line(left[1:-2], hi, max(1.0, w0 * 0.14))


def glass_roots(w=250, h=136, seed=3):
    """Gnarled glass roots arching over the path: thick at the ground, tapering, with rootlets and knots."""
    c = Canvas(w, h)
    rnd = random.Random(seed)
    cols = [hexrgb('#a3cad6', 245), hexrgb('#b8b0e0', 245), hexrgb('#93bccb', 245), hexrgb('#c6e3ea', 245)]
    hi = hexrgb('#f4fbfd', 210)
    for i in range(7):
        side = -1 if i % 2 else 1
        x0 = w / 2 + side * rnd.uniform(40, 110)
        x3 = w / 2 - side * rnd.uniform(10, 120)
        p0, p3 = (x0, h - rnd.uniform(4, 12)), (x3, h - rnd.uniform(2, 16))
        p1 = (x0 - side * rnd.uniform(10, 40), h - rnd.uniform(70, 125))
        p2 = (x3 + side * rnd.uniform(10, 50), h - rnd.uniform(40, 100))
        pts = cubic(p0, p1, p2, p3, 28)
        col = cols[rnd.randrange(len(cols))]
        tapered(c, pts, rnd.uniform(16, 24), rnd.uniform(3, 6), col, hi)
        for _ in range(2):
            k = rnd.randrange(6, 20)
            bx, by = pts[k]
            q = cubic((bx, by), (bx + rnd.uniform(-20, 20), by - rnd.uniform(4, 20)), (bx + rnd.uniform(-30, 30), by + rnd.uniform(0, 20)), (bx + rnd.uniform(-40, 40), min(h - 4, by + rnd.uniform(16, 40))), 12)
            tapered(c, q, rnd.uniform(5, 8), 1.5, col)
        for k in (8, 15):
            kx, ky = pts[k]
            c.ellipse(kx, ky, 5, 4, mix(col, (255, 255, 255, 255), 0.3))
    img = outline(c.result(), LINE, px=2, soft=0.6)
    return trim(specular(img, seed=seed + 2, count=3), 1)


def thicket_tile(w=256, h=160, seed=9):
    c = Canvas(w, h)
    rnd = random.Random(seed)
    for row in range(3):
        for i in range(10):
            x = (i + rnd.uniform(-0.3, 0.3)) * w / 9
            for dx in (0, -w, w):
                shard(c, x + dx, h - 6 - row * 14, rnd.uniform(16, 30), rnd.uniform(50, 110) - row * 15, rnd.uniform(-12, 12), rnd)
    return outline(c.result(), LINE, px=2, soft=0.6)


def roots_tile(w=256, h=160):
    c = Canvas(w, h)
    rnd = random.Random(21)
    cols = [hexrgb('#a7cdd8', 240), hexrgb('#bdb6e2', 240), hexrgb('#93bccb', 240)]
    for i in range(7):
        x0 = rnd.uniform(0, w)
        span = rnd.uniform(90, 170)
        for dx in (0, -w, w):
            p0 = (x0 + dx, h - rnd.uniform(4, 16))
            p3 = (x0 + dx + span, h - rnd.uniform(4, 16))
            pts = cubic(p0, (p0[0] + span * 0.3, h - rnd.uniform(70, 130)), (p0[0] + span * 0.7, h - rnd.uniform(60, 120)), p3, 26)
            col = cols[i % 3]
            c.line(pts, col, rnd.uniform(10, 16))
            c.line([(x, y - 3) for x, y in pts[3:-3]], hexrgb('#f2fbfd', 190), 2)
    return outline(c.result(), LINE, px=2, soft=0.6)


def glass_wall():
    w, h = 200, 160
    c = Canvas(w, h)
    rnd = random.Random(12)
    c.poly([(8, h - 8), (14, h - 70), (40, h - 120), (90, h - 150), (130, h - 140), (176, h - 112), (192, h - 64), (196, h - 8)], hexrgb('#a9cfd9', 235))
    for i in range(14):
        x = rnd.uniform(16, w - 16)
        shard(c, x, h - 8, rnd.uniform(20, 36), rnd.uniform(60, 140), rnd.uniform(-8, 8), rnd, fill=[hexrgb('#9cc6d2', 240), hexrgb('#b4c2e6', 240), hexrgb('#c6e6ec', 240)][i % 3])
    img = outline(c.result(), LINE, px=2, soft=0.6)
    return trim(specular(img, seed=8, count=5), 1)


def frost_shards():
    """The thick wall after Ice: brittle, frosted shards fallen flat — passable floor decoration."""
    w, h = 200, 70
    c = Canvas(w, h)
    rnd = random.Random(14)
    c.ellipse(w / 2, h / 2 + 6, w * 0.47, h * 0.32, hexrgb('#dff3f7', 150))
    for i in range(26):
        x, y = rnd.uniform(12, w - 12), rnd.uniform(18, h - 10)
        l = rnd.uniform(8, 22)
        a = rnd.uniform(0, math.pi)
        c.poly([(x - math.cos(a) * l, y - math.sin(a) * l * 0.4), (x + math.sin(a) * 3, y - 3), (x + math.cos(a) * l, y + math.sin(a) * l * 0.4), (x - math.sin(a) * 3, y + 3)],
               [hexrgb('#c8e6ee', 235), hexrgb('#e6f6fa', 235), hexrgb('#b3cde8', 230)][i % 3])
    return trim(outline(c.result(), LINE, px=1, soft=0.5), 1)


def cracked_block():
    w, h = 180, 130
    c = Canvas(w, h)
    rnd = random.Random(31)
    body = [(14, h - 8), (10, h - 60), (34, h - 104), (88, h - 122), (146, h - 104), (170, h - 56), (166, h - 8)]
    c.poly(body, hexrgb('#b9d6df', 235))
    c.poly([(14, h - 8), (10, h - 60), (34, h - 104), (88, h - 122), (90, h - 8)], hexrgb('#cfe6ec', 235))
    # frost and cracks
    for i in range(16):
        x0, y0 = rnd.uniform(24, w - 24), rnd.uniform(24, h - 20)
        pts = [(x0, y0)]
        for _ in range(4):
            x0 += rnd.uniform(-16, 16)
            y0 += rnd.uniform(-14, 14)
            pts.append((x0, y0))
        c.line(pts, hexrgb('#506a80', 220), 1.4)
    for i in range(30):
        c.ellipse(rnd.uniform(20, w - 20), rnd.uniform(20, h - 16), rnd.uniform(1, 2.5), rnd.uniform(1, 2.5), hexrgb('#ffffff', 220))
    img = outline(c.result(), LINE, px=2, soft=0.6)
    return trim(specular(img, seed=2, count=3), 1)


def glass_bridge(frozen=False):
    w, h = 180, 120
    c = Canvas(w, h)
    rnd = random.Random(41)
    # deck seen slightly from above: planks of glass with rails
    c.poly([(16, h - 14), (30, 22), (150, 22), (164, h - 14)], hexrgb('#a7c9d6', 230) if not frozen else hexrgb('#bfe6f2', 240))
    for i in range(9):
        y = 30 + i * (h - 50) / 8
        c.line([(30 - i * 1.6, y), (150 + i * 1.6, y)], hexrgb('#6f8fa2', 220), 1.6)
    for side in (0, 1):
        x0, x1 = (24, 10) if side == 0 else (156, 170)
        c.line([(x0, 18), (x1, h - 10)], hexrgb('#8fb3c4', 255), 6)
        for k in range(5):
            y = 26 + k * (h - 40) / 4
            x = x0 + (x1 - x0) * (y - 18) / (h - 28)
            c.ellipse(x, y, 4, 4, hexrgb('#d8f0f6', 255))
    if not frozen:
        for i in range(12):
            x0, y0 = rnd.uniform(40, 140), rnd.uniform(30, h - 24)
            pts = [(x0, y0)]
            for _ in range(5):
                x0 += rnd.uniform(-14, 14)
                y0 += rnd.uniform(-8, 8)
                pts.append((x0, y0))
            c.line(pts, hexrgb('#2c3c4c', 230), 1.6)
    else:
        for i in range(40):
            c.ellipse(rnd.uniform(34, 146), rnd.uniform(26, h - 20), rnd.uniform(2, 5), rnd.uniform(1, 3), hexrgb('#ffffff', 200))
    img = outline(c.result(), LINE, px=2, soft=0.6)
    if frozen:
        img = glow(img, (170, 230, 255), radius=6, strength=0.45)
    return trim(specular(img, seed=6, count=3), 1)


def cocoon():
    w, h = 130, 160
    c = Canvas(w, h)
    c.ellipse(w / 2, h - 10, w * 0.36, 9, hexrgb('#6f6a5e', 200))
    body = [(w / 2 + math.cos(t) * w * 0.33 * (1 - 0.18 * math.sin(t)), h * 0.52 + math.sin(t) * h * 0.42) for t in [i / 30 * 2 * math.pi for i in range(30)]]
    c.poly(body, hexrgb('#cfeaf0', 165))
    img = c.result()
    sp = sapling(seed=3, w=110, h=136)
    img.alpha_composite(sp, (int(w / 2 - sp.width / 2), int(h - 12 - sp.height)))
    c2 = Canvas(w, h)
    c2.poly(body, hexrgb('#dff3f6', 110))
    c2.line([(w * 0.32, h * 0.28), (w * 0.26, h * 0.5), (w * 0.3, h * 0.7)], hexrgb('#ffffff', 220), 3)
    img.alpha_composite(c2.result())
    img = outline(img, LINE, px=2, soft=0.6)
    return trim(glow(img, (190, 240, 210), radius=8, strength=0.5), 1)


def jar(kind):
    w, h = 110, 150
    c = Canvas(w, h)
    cx = w / 2
    # wooden plinth
    c.ellipse(cx, h - 14, w * 0.42, 10, hexrgb('#5a3f2a'))
    c.poly([(cx - w * 0.42, h - 14), (cx - w * 0.38, h - 30), (cx + w * 0.38, h - 30), (cx + w * 0.42, h - 14)], hexrgb('#7a573a'))
    c.ellipse(cx, h - 30, w * 0.38, 8, hexrgb('#8f6a48'))
    inner = Canvas(w, h)
    if kind == 'bird':
        inner.ellipse(cx, h - 62, 18, 15, hexrgb('#8a5f3d'))
        inner.ellipse(cx + 4, h - 58, 11, 10, hexrgb('#e8742f'))
        inner.ellipse(cx - 12, h - 76, 10, 9, hexrgb('#8a5f3d'))
        inner.ellipse(cx - 15, h - 78, 2.4, 2.4, hexrgb('#1b1612'))
        inner.poly([(cx - 22, h - 76), (cx - 30, h - 74), (cx - 22, h - 72)], hexrgb('#d9a441'))
        inner.poly([(cx + 14, h - 64), (cx + 30, h - 70), (cx + 26, h - 56)], hexrgb('#6e4b31'))
        inner.line([(cx - 4, h - 48), (cx - 4, h - 34)], hexrgb('#3b2a1e'), 2)
        inner.line([(cx + 6, h - 48), (cx + 6, h - 34)], hexrgb('#3b2a1e'), 2)
    elif kind == 'fox':
        inner.ellipse(cx + 2, h - 50, 26, 16, hexrgb('#d9752e'))
        inner.ellipse(cx - 18, h - 60, 14, 13, hexrgb('#e0803a'))
        inner.poly([(cx - 28, h - 66), (cx - 24, h - 86), (cx - 16, h - 70)], hexrgb('#c96524'))
        inner.poly([(cx - 14, h - 70), (cx - 6, h - 86), (cx - 4, h - 66)], hexrgb('#c96524'))
        inner.ellipse(cx - 20, h - 54, 6, 5, hexrgb('#f5ead8'))
        inner.ellipse(cx - 22, h - 62, 2.2, 2.2, hexrgb('#1b1612'))
        inner.ellipse(cx - 13, h - 62, 2.2, 2.2, hexrgb('#1b1612'))
        inner.line([(cx + 24, h - 48), (cx + 36, h - 60), (cx + 30, h - 74)], hexrgb('#d9752e'), 9)
        inner.ellipse(cx + 30, h - 76, 5, 5, hexrgb('#f5ead8'))
    elif kind == 'flower':
        for dx, col in ((-10, '#9fc2ff'), (8, '#f2f0ff'), (0, '#c7a6ff')):
            inner.line([(cx + dx * 0.4, h - 34), (cx + dx, h - 70)], hexrgb('#5f8f45'), 2.2)
            for a in range(5):
                t = a / 5 * 2 * math.pi
                inner.ellipse(cx + dx + math.cos(t) * 5, h - 72 + math.sin(t) * 5, 4, 4, hexrgb(col))
            inner.ellipse(cx + dx, h - 72, 2.6, 2.6, hexrgb('#f3d36a'))
    img = c.result()
    img.alpha_composite(inner.result())
    if kind != 'empty':
        dome = Canvas(w, h)
        pts = [(cx - w * 0.36, h - 30)] + [(cx + math.cos(t) * w * 0.36, h - 74 + math.sin(t) * 58) for t in [math.pi + i / 20 * math.pi for i in range(21)]] + [(cx + w * 0.36, h - 30)]
        dome.poly(pts, hexrgb('#d8f0f4', 95))
        dome.line(pts[1:-1], hexrgb('#f4fbfd', 230), 2.2)
        dome.line([(cx - w * 0.24, h - 110), (cx - w * 0.3, h - 80), (cx - w * 0.28, h - 52)], hexrgb('#ffffff', 230), 3)
        dome.ellipse(cx, h - 134, 6, 5, hexrgb('#cfe8ee', 240))
        img.alpha_composite(dome.result())
    else:
        sh = Canvas(w, h)
        rnd = random.Random(5)
        for i in range(10):
            x = cx + rnd.uniform(-34, 34)
            shard(sh, x, h - 26, rnd.uniform(6, 12), rnd.uniform(8, 22), rnd.uniform(-4, 4), rnd)
        img.alpha_composite(sh.result())
    img = outline(img, (44, 34, 30), px=2, soft=0.6)
    return trim(img, 1)


def ward_green():
    im = src('assets/chapter2/ward.webp')
    m = hue_mask(im, 240, 320, smin=0.12, vmin=0.15)       # violet curtain
    curtain = gradient_map(im, [(0, (20, 40, 44)), (0.35, (60, 140, 128)), (0.7, (150, 226, 200)), (1, (236, 255, 246))])
    out = blend_masked(im, curtain, m)
    m2 = hue_mask(out, 0, 40, smin=0.3, vmin=0.2)           # red/orange leaves → silver glass
    leaves = gradient_map(out, [(0, (40, 50, 64)), (0.5, (160, 196, 210)), (1, (240, 252, 255))])
    out = blend_masked(out, leaves, m2)
    out = gradient_map(out, [(0, (22, 30, 34)), (0.5, (128, 150, 150)), (1, (240, 250, 248))], amount=0.35)
    return glow(trim(out, 1), (120, 230, 190), radius=10, strength=0.45)


def echo(lit=False):
    """A silver imprint of the past: two girls by the water, all mist and moonlight."""
    girl = src('assets/chapter2/resident_woman.webp')
    g = fit_h(girl, 200)
    w, h = int(g.width * 1.75), 220
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(g.transpose(Image.FLIP_LEFT_RIGHT), (0, h - g.height))
    g2 = fit_h(girl, 186)
    canvas.alpha_composite(g2, (w - g2.width, h - g2.height))
    mist = gradient_map(canvas, [(0, (60, 70, 96)), (0.4, (150, 164, 200)), (0.75, (214, 222, 246)), (1, (250, 252, 255))])
    a = np.asarray(mist).astype(np.float32)
    a[:, :, 3] *= 0.62 if not lit else 0.82
    # fade toward the feet: the past has no ground
    fade = np.linspace(1, 0.35, h)[:, None]
    a[:, :, 3] *= fade
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(0.6))
    col = (255, 226, 160) if lit else (190, 200, 255)
    img = glow(img, col, radius=12, strength=0.75 if lit else 0.55)
    return trim(img, 2)


def gather_leaf_node():
    w, h = 100, 90
    c = Canvas(w, h)
    rnd = random.Random(8)
    c.ellipse(w / 2, h - 8, 34, 7, hexrgb('#6d7f86', 160))
    for i in range(11):
        a = math.radians(rnd.uniform(-70, 70))
        L = rnd.uniform(26, 44)
        x1, y1 = w / 2 + math.sin(a) * L, h - 10 - math.cos(a) * L
        c.line([(w / 2, h - 10), (x1, y1)], hexrgb('#8fb3c4', 255), 2)
        c.rotated_ellipse(x1, y1, 5, 12, a, [hexrgb('#cfe9ef', 240), hexrgb('#d9d1f3', 240), hexrgb('#b4dbe4', 240)][i % 3])
    img = outline(c.result(), LINE, px=2, soft=0.5)
    return trim(specular(img, seed=4, count=2), 1)


def spark_node():
    w, h = 80, 100
    c = Canvas(w, h)
    c.ellipse(w / 2, h - 8, 20, 5, hexrgb('#7d8a92', 150))
    c.poly([(w / 2 - 10, h - 8), (w / 2 - 4, h - 34), (w / 2 + 5, h - 36), (w / 2 + 10, h - 8)], hexrgb('#bcd8e2', 230))
    img = outline(c.result(), LINE, px=1, soft=0.5)
    orb = Canvas(w, h)
    orb.ellipse(w / 2, h - 58, 13, 13, hexrgb('#ffd88c', 255))
    orb.ellipse(w / 2 - 3, h - 61, 6, 6, hexrgb('#fff7e0', 255))
    for i in range(8):
        t = i / 8 * 2 * math.pi
        orb.line([(w / 2 + math.cos(t) * 16, h - 58 + math.sin(t) * 16), (w / 2 + math.cos(t) * 24, h - 58 + math.sin(t) * 24)], hexrgb('#ffe2a6', 200), 1.6)
    o = glow(orb.result(), (255, 200, 110), radius=10, strength=0.9)
    img.alpha_composite(o)
    return trim(img, 1)


def bark_node():
    w, h = 110, 84
    c = Canvas(w, h)
    c.ellipse(w / 2, h - 10, 46, 9, hexrgb('#5c4a37'))
    c.poly([(w / 2 - 34, h - 10), (w / 2 - 30, h - 52), (w / 2 + 28, h - 56), (w / 2 + 34, h - 10)], hexrgb('#857158'))
    c.ellipse(w / 2 - 1, h - 54, 31, 9, hexrgb('#c9b48c'))
    for r in (24, 16, 8):
        c.ellipse(w / 2 - 1, h - 54, r, r * 0.28, hexrgb('#a8916c'))
    for dx in (-24, -6, 14):
        c.line([(w / 2 + dx, h - 48), (w / 2 + dx + 6, h - 24), (w / 2 + dx + 2, h - 10)], hexrgb('#5f4d3b'), 2)
    c.poly([(w / 2 + 30, h - 44), (w / 2 + 48, h - 30), (w / 2 + 44, h - 18), (w / 2 + 32, h - 26)], hexrgb('#a48c66'))
    img = outline(c.result(), (40, 30, 22), px=2, soft=0.5)
    return trim(img, 1)


def leaf_token():
    w, h = 90, 90
    c = Canvas(w, h)
    c.poly([(w / 2 - 18, h - 6), (w / 2 - 12, h - 16), (w / 2 + 12, h - 16), (w / 2 + 18, h - 6)], hexrgb('#6e4f35'))
    c.line([(w / 2, h - 16), (w / 2, h - 30)], hexrgb('#5a3f2a'), 3)
    leaf = [(w / 2 + math.cos(t) * 12 * math.sin(t / 2) ** 0.8, h - 58 + math.sin(t) * 26) for t in [i / 30 * 2 * math.pi for i in range(31)]]
    c.rotated_ellipse(w / 2, h - 56, 13, 28, math.radians(12), hexrgb('#cfe9ef', 235))
    c.line([(w / 2 + 6, h - 30), (w / 2 - 6, h - 82)], hexrgb('#8fb3c4', 255), 1.6)
    for k in range(5):
        y = h - 40 - k * 9
        c.line([(w / 2 + 3 - k * 2, y), (w / 2 - 8 - k, y - 6)], hexrgb('#a6c8d4', 255), 1)
        c.line([(w / 2 + 3 - k * 2, y), (w / 2 + 10 - k, y - 8)], hexrgb('#a6c8d4', 255), 1)
    img = outline(c.result(), LINE, px=2, soft=0.5)
    img = glow(img, (255, 210, 140), radius=6, strength=0.45)
    return trim(specular(img, seed=9, count=2), 1)


def iva_hut():
    im = src('assets/chapter2/city_house.webp')
    roof = hue_mask(im, 180, 260, smin=0.1, vmin=0.05)   # slate roof
    out = blend_masked(im, gradient_map(im, [(0, (20, 40, 38)), (0.5, (78, 140, 120)), (1, (200, 240, 220))]), roof)
    out = gradient_map(out, [(0, (26, 30, 32)), (0.5, (140, 150, 146)), (1, (240, 246, 240))], amount=0.4)
    out = specular(out, seed=7, count=4, width=0.012, strength=0.35)
    # glass vines climbing the walls
    vine = Canvas(out.width, out.height)
    rnd = random.Random(19)
    for i in range(7):
        x0 = rnd.uniform(0.1, 0.9) * out.width
        pts = cubic((x0, out.height - 6), (x0 + rnd.uniform(-40, 40), out.height * 0.6), (x0 + rnd.uniform(-40, 40), out.height * 0.4), (x0 + rnd.uniform(-60, 60), out.height * 0.25), 24)
        vine.line(pts, hexrgb('#bfe3ea', 220), 3)
        for x, y in pts[4::3]:
            vine.rotated_ellipse(x, y, 4, 9, rnd.uniform(-1, 1), hexrgb('#d9f0f4', 220))
    out.alpha_composite(vine.result())
    return out


# ============================================================================ floor strips and tiles
def stream_strip(water=False):
    W, H = 1300, 130
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c = Canvas(W, H)
    rnd = random.Random(3)
    top = [(x, 28 + 8 * math.sin(x / 90) + rnd.uniform(-3, 3)) for x in range(0, W + 26, 26)]
    bot = [(x, H - 26 + 7 * math.sin(x / 120 + 1) + rnd.uniform(-3, 3)) for x in range(W, -26, -26)]
    bank = hexrgb('#7a6f62')
    c.poly([(x, y - 12) for x, y in top] + [(x, y + 12) for x, y in bot], bank)
    body = hexrgb('#4f8fb0', 255) if water else hexrgb('#bfe0e8', 255)
    c.poly(top + bot, body)
    # stones on the banks
    for i in range(60):
        x = rnd.uniform(0, W)
        y = rnd.choice([30, H - 26]) + rnd.uniform(-10, 8)
        c.ellipse(x, y, rnd.uniform(5, 11), rnd.uniform(3, 6), hexrgb(rnd.choice(['#8c8277', '#a39a8e', '#6e665d'])))
    if water:
        for i in range(70):
            x, y = rnd.uniform(10, W - 10), rnd.uniform(44, H - 40)
            c.line([(x, y), (x + rnd.uniform(14, 30), y + rnd.uniform(-2, 2))], hexrgb('#cfe9f5', 200), 1.6)
        # ford: stepping stones in the middle
        for i, x in enumerate(range(560, 760, 40)):
            c.ellipse(x + rnd.uniform(-6, 6), 62 + (i % 2) * 14, 16, 9, hexrgb('#9a9186'))
    else:
        for i in range(55):
            x0, y0 = rnd.uniform(10, W - 10), rnd.uniform(44, H - 40)
            pts = [(x0, y0)]
            for _ in range(4):
                x0 += rnd.uniform(-20, 20)
                y0 += rnd.uniform(-8, 8)
                pts.append((x0, max(40, min(H - 34, y0))))
            c.line(pts, hexrgb('#7fa4b6', 230), 1.4)
        for i in range(40):
            x, y = rnd.uniform(10, W - 10), rnd.uniform(44, H - 40)
            c.line([(x, y), (x + 10, y - 16)], hexrgb('#ffffff', 220), 2)
    img.alpha_composite(c.result())
    return outline(img, (60, 54, 48), px=2, soft=0.6)


def rift_strip():
    W, H = 1300, 90
    c = Canvas(W, H)
    rnd = random.Random(6)
    xs = list(range(0, W + 20, 20))
    top = [(x, H / 2 - rnd.uniform(10, 24)) for x in xs]
    bot = [(x, H / 2 + rnd.uniform(10, 24)) for x in reversed(xs)]
    c.poly([(x, y - 8) for x, y in top] + [(x, y + 8) for x, y in bot], hexrgb('#5a5146', 220))
    c.poly(top + bot, hexrgb('#1a1412', 255))
    c.line([(x, H / 2 + rnd.uniform(-4, 4)) for x in xs], hexrgb('#ff9a4a', 230), 3)
    img = c.result()
    img = glow(img, (255, 140, 60), radius=6, strength=0.5)
    return img


def ground_tiles():
    grass = Image.open(os.path.join(ROOT, 'public/assets/sprites/grass_ground_01.png')).convert('RGBA')
    glass = gradient_map(grass, [(0, (92, 112, 124)), (0.35, (138, 160, 172)), (0.7, (184, 202, 212)), (1, (232, 240, 246))])
    n = tileable_noise(512, 2, seed=7)
    sh = tileable_noise(512, 6, seed=11)
    arr = np.asarray(glass).astype(np.float32)
    lil = np.array([196, 186, 230], np.float32)
    for ch in range(3):
        arr[:, :, ch] = arr[:, :, ch] * (1 - 0.18 * n) + lil[ch] * 0.18 * n
    glints = (sh > 0.86).astype(np.float32) * 0.6
    for ch in range(3):
        arr[:, :, ch] = arr[:, :, ch] + (255 - arr[:, :, ch]) * glints
    glass = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
    dry = gradient_map(grass, [(0, (96, 80, 58)), (0.4, (150, 130, 96)), (0.75, (194, 176, 138)), (1, (226, 212, 178))])
    return glass.convert('RGB'), dry.convert('RGB')


# ============================================================================ characters
def poly_mask(size, polys):
    """Mask from polygons in normalised coordinates (0..1)."""
    w, h = size
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    for poly in polys:
        d.polygon([(x * w, y * h) for x, y in poly], fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32) / 255


def hsv_arrays(img):
    a = np.asarray(img.convert('RGBA')).astype(np.float32) / 255
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx, mn = a[:, :, :3].max(2), a[:, :, :3].min(2)
    d = mx - mn + 1e-6
    hh = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    ss = np.where(mx > 0, d / (mx + 1e-6), 0)
    return hh, ss, mx, a[:, :, 3]


def iva_young():
    im = src('assets/chapter2/rowena.webp')
    hh, ss, vv, al = hsv_arrays(im)
    robe = ((((hh >= 338) | (hh <= 14)) & (ss > 0.5) & (vv > 0.2)) & (al > 0.5)).astype(np.float32)
    green = gradient_map(im, [(0, (14, 32, 28)), (0.3, (46, 94, 78)), (0.6, (104, 162, 134)), (1, (210, 238, 222))])
    out = blend_masked(im, green, robe)
    # hair: the head and the long braid (outlined by hand on the source painting), skin and robe excluded
    region = poly_mask(im.size, [
        [(0.25, 0.04), (0.42, 0.0), (0.62, 0.02), (0.76, 0.1), (0.74, 0.26), (0.64, 0.22), (0.6, 0.14), (0.4, 0.13), (0.34, 0.26), (0.26, 0.3), (0.22, 0.18)],
        [(0.24, 0.24), (0.36, 0.24), (0.44, 0.4), (0.44, 0.58), (0.4, 0.68), (0.33, 0.66), (0.3, 0.5), (0.25, 0.36)],
    ])
    skin = ((vv > 0.74) & (ss < 0.55) & (hh > 12) & (hh < 40)).astype(np.float32)
    hair = region * (1 - skin) * (1 - robe) * (al > 0.5)
    silver = gradient_map(out, [(0, (56, 62, 76)), (0.15, (122, 132, 150)), (0.45, (200, 208, 222)), (1, (250, 252, 255))])
    out = blend_masked(out, silver, hair)
    # the hem has become glass: the lower robe and cape turn to glass, the boots stay
    g = glassify(out, tint=(196, 230, 238), deep=(72, 116, 134), alpha=0.76, seed=5, streaks=False)
    H, W = out.height, out.width
    ramp = np.clip((np.linspace(0, 1, H) - 0.66) / 0.1, 0, 1)[:, None] * np.ones((1, W))
    boots = poly_mask(im.size, [[(0.25, 0.86), (0.75, 0.86), (0.75, 1.0), (0.25, 1.0)]])
    cloth = ((robe > 0) | ((vv > 0.62) & (ss < 0.5) & (hh > 20) & (hh < 45))).astype(np.float32)
    out = blend_masked(out, g, ramp * (1 - boots) * np.maximum(cloth, 0.35))
    return specular(out, seed=13, count=3, width=0.02, strength=0.4)


def leaf_wreath(w, h, n=11, seed=3, pal=None, leaf=1.0):
    """A small wreath of willow leaves (worn on the head)."""
    rnd = random.Random(seed)
    c = Canvas(w, h)
    cols = pal or [hexrgb('#7bab4f'), hexrgb('#9cc96a'), hexrgb('#6a9a44')]
    for i in range(n):
        t = math.pi * (0.05 + 0.9 * i / (n - 1))
        x, y = w / 2 - math.cos(t) * w * 0.42, h * 0.75 - math.sin(t) * h * 0.4
        c.rotated_ellipse(x, y, w * 0.05 * leaf, h * 0.24 * leaf, t - math.pi / 2 + rnd.uniform(-0.3, 0.3), cols[i % len(cols)])
    return outline(c.result(), (40, 32, 22), px=1, soft=0.4)


def iva_old():
    im = src('assets/chapter2/banker.webp')
    hh, ss, vv, al = hsv_arrays(im)
    coat = ((hh >= 60) & (hh <= 200) & (ss > 0.1) & (al > 0.5)).astype(np.float32)
    sage = gradient_map(im, [(0, (70, 86, 78)), (0.18, (124, 148, 134)), (0.5, (182, 202, 188)), (1, (240, 248, 240))])
    out = blend_masked(im, sage, coat)
    hair = poly_mask(im.size, [[(0.28, 0.0), (0.74, 0.0), (0.8, 0.12), (0.7, 0.2), (0.3, 0.2), (0.24, 0.12)]]) * ((ss < 0.25) & (vv > 0.35)).astype(np.float32)
    white = gradient_map(out, [(0, (120, 120, 126)), (0.5, (222, 224, 230)), (1, (255, 255, 255))])
    out = blend_masked(out, white, hair)
    wreath = leaf_wreath(int(out.width * 0.42), int(out.height * 0.07), n=17, leaf=0.6)
    out.alpha_composite(wreath, (int(out.width * 0.3), int(out.height * 0.02)))
    sp = sapling(seed=7, w=60, h=74)
    out.alpha_composite(sp, (int(out.width * 0.56), int(out.height * 0.56)))
    return out


def spirit(kind):
    im = src('assets/sprites/npc_selena.png')
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    if kind == 'nameless':
        out = gradient_map(im, [(0, (54, 60, 76)), (0.35, (132, 140, 160)), (0.7, (206, 212, 228)), (1, (250, 251, 255))])
        a = np.asarray(out).astype(np.float32)
        a[:, :, 3] *= 0.78
        out = Image.fromarray(a.astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(0.8))
        out = glow(out, (200, 210, 255), radius=10, strength=0.5)
    else:
        out = gradient_map(im, [(0, (24, 44, 30)), (0.35, (70, 130, 84)), (0.65, (160, 214, 150)), (1, (244, 255, 232))])
        gold = hue_mask(im, 35, 70, smin=0.3, vmin=0.4)
        out = blend_masked(out, gradient_map(im, [(0, (80, 60, 20)), (1, (255, 232, 150))]), gold)
        out = glow(out, (150, 240, 150), radius=10, strength=0.45)
    return trim(out, 2)


def portrait_of(img, fx=0.2, fy=0.025, fs=0.64):
    w, h = img.size
    side = round(w * fs)
    x, y = round(w * fx), round(h * fy)
    crop = img.crop((x, y, x + side, y + side)).resize((256, 256), Image.LANCZOS)
    bg = Image.new('RGBA', crop.size, (0, 0, 0, 0))
    bg.alpha_composite(crop)
    return bg


# ============================================================================ enemies
def iridescent(img, seed=1, amount=0.28):
    n = tileable_noise(256, 1, seed=seed)
    n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize(img.size, Image.BILINEAR)).astype(np.float32) / 255
    arr = np.asarray(img).astype(np.float32)
    lil = np.array([196, 170, 244], np.float32)
    teal = np.array([150, 230, 226], np.float32)
    for ch in range(3):
        tint = lil[ch] * n + teal[ch] * (1 - n)
        arr[:, :, ch] = arr[:, :, ch] * (1 - amount) + tint * amount * (arr[:, :, ch] / 255 * 0.6 + 0.4)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def shard_crest(img, seed=2, count=7, frm=0.25, to=0.75, size=0.12):
    """Small glass shards along the top contour (back) of a creature."""
    a = np.asarray(img.split()[3])
    w, h = img.size
    rnd = random.Random(seed)
    c = Canvas(w, h)
    for i in range(count):
        x = int(w * (frm + (to - frm) * (i + rnd.uniform(-0.3, 0.3)) / max(1, count - 1)))
        x = max(1, min(w - 2, x))
        col = np.nonzero(a[:, x] > 128)[0]
        if not len(col):
            continue
        y = col[0] + 4
        hh = h * size * rnd.uniform(0.6, 1.1)
        shard(c, x, y + hh * 0.35, hh * 0.38, hh, rnd.uniform(-hh * 0.3, hh * 0.3), rnd)
    crest = outline(c.result(), LINE, px=2, soft=0.5)
    out = crest.copy()          # shards grow from the back: drawn behind the body
    out.alpha_composite(img)
    return out


def glass_creature(path, seed, crest=True, inner=None):
    im = src(path)
    g = glassify(im, tint=(160, 208, 232), deep=(52, 88, 128), light=(240, 250, 255), alpha=0.78, inner=inner, seed=seed)
    g = iridescent(g, seed=seed)
    if crest:
        g = shard_crest(g, seed=seed + 1)
    return specular(g, seed=seed + 7, count=4, width=0.02, strength=0.5)


def enemies():
    out = {}
    out['glass_stoat'] = glass_creature('assets/chapter2/frost_critter.webp', 1)
    out['glass_wolf'] = glass_creature('assets/chapter2/frost_wolf.webp', 2, inner=(255, 170, 96))
    wisp = src('assets/chapter2/grave_wisp.webp')
    e = gradient_map(wisp, [(0, (40, 44, 70)), (0.4, (150, 150, 196)), (0.75, (220, 220, 246)), (1, (255, 255, 255))])
    a = np.asarray(e).astype(np.float32)
    a[:, :, 3] *= 0.85
    out['echo'] = glow(Image.fromarray(a.astype(np.uint8), 'RGBA'), (200, 190, 255), radius=14, strength=0.7)
    col = src('assets/chapter2/frost_collector.webp')
    n = gradient_map(col, [(0, (20, 26, 24)), (0.35, (54, 82, 70)), (0.7, (120, 160, 136)), (1, (226, 246, 236))])
    ice = hue_mask(col, 170, 230, smin=0.15, vmin=0.4)
    n = blend_masked(n, gradient_map(col, [(0, (40, 20, 60)), (0.5, (170, 120, 230)), (1, (250, 236, 255))]), ice)
    out['needle'] = specular(n, seed=3, count=3)
    el = src('assets/chapter2/frost_collector_elite.webp')
    bronze = hue_mask(el, 15, 60, smin=0.25, vmin=0.15)
    ne = blend_masked(el, gradient_map(el, [(0, (18, 28, 24)), (0.4, (60, 96, 78)), (0.75, (136, 176, 150)), (1, (230, 248, 236))]), bronze)
    ice = hue_mask(el, 170, 230, smin=0.15, vmin=0.4)
    ne = blend_masked(ne, gradient_map(el, [(0, (40, 20, 60)), (0.5, (170, 120, 230)), (1, (250, 236, 255))]), ice)
    out['needle_elite'] = specular(ne, seed=4, count=3)
    gg = glassify(src('assets/chapter2/ice_guardian.webp'), tint=(160, 206, 230), deep=(48, 82, 120), light=(240, 250, 255), alpha=0.8, inner=None, seed=5)
    gg = iridescent(gg, seed=5, amount=0.22)
    # frozen fire in the chest
    w, h = gg.size
    fire = Canvas(w, h)
    fire.ellipse(w * 0.5, h * 0.36, w * 0.09, h * 0.07, hexrgb('#ffb060', 230))
    fire.ellipse(w * 0.5, h * 0.36, w * 0.045, h * 0.035, hexrgb('#fff0c8', 255))
    f = glow(fire.result(), (255, 150, 60), radius=10, strength=0.9)
    gg.alpha_composite(f)
    out['glass_guardian'] = specular(gg, seed=9, count=4)
    return out


def reflection(iva):
    g = glassify(iva, tint=(176, 220, 236), deep=(60, 100, 132), alpha=0.8, inner=None, seed=21)
    g = iridescent(g, seed=21, amount=0.2)
    return glow(g, (170, 240, 255), radius=12, strength=0.6)


# ============================================================================ icons
def icon_canvas():
    return Canvas(128, 128)


def leaf_shape(c, cx, cy, length, width, ang, col, vein=None):
    pts = []
    for i in range(25):
        t = i / 24
        x = (t - 0.5) * length
        y = math.sin(t * math.pi) ** 0.9 * width / 2
        pts.append((x, y))
    pts += [(x, -y) for x, y in reversed(pts)]
    ca, sa = math.cos(ang), math.sin(ang)
    c.poly([(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts], col)
    if vein:
        c.line([(cx - length * 0.48 * ca, cy - length * 0.48 * sa), (cx + length * 0.48 * ca, cy + length * 0.48 * sa)], vein, 2)


def icon_glass_leaf():
    c = icon_canvas()
    leaf_shape(c, 70, 58, 96, 34, math.radians(-58), hexrgb('#bfe2ea', 245), hexrgb('#8fb3c4', 255))
    leaf_shape(c, 46, 80, 70, 24, math.radians(-30), hexrgb('#d6cdf2', 240), hexrgb('#9a94c4', 255))
    c.line([(30, 114), (52, 84), (62, 74)], hexrgb('#8fb3c4', 255), 3)
    img = outline(c.result(), LINE, px=2, soft=0.5)
    return trim(specular(img, seed=1, count=3, width=0.04, strength=0.7), 2)


def icon_spark():
    c = icon_canvas()
    for i in range(12):
        t = i / 12 * 2 * math.pi
        r1, r2 = (30, 56) if i % 2 == 0 else (30, 44)
        c.line([(64 + math.cos(t) * r1, 64 + math.sin(t) * r1), (64 + math.cos(t) * r2, 64 + math.sin(t) * r2)], hexrgb('#ffe3a8', 220), 3)
    c.ellipse(64, 64, 26, 26, hexrgb('#ffcf7a'))
    c.ellipse(58, 58, 12, 12, hexrgb('#fff6dc'))
    img = glow(c.result(), (255, 196, 100), radius=8, strength=0.9)
    return trim(outline(img, (90, 60, 30), px=1, soft=0.5), 2)


def icon_bark():
    c = icon_canvas()
    c.poly([(30, 100), (22, 40), (54, 22), (100, 30), (108, 88), (80, 108)], hexrgb('#8c7558'))
    c.poly([(30, 100), (22, 40), (54, 22), (60, 100)], hexrgb('#a58b66'))
    for x in (40, 58, 76, 92):
        c.line([(x, 34), (x + 6, 70), (x - 2, 100)], hexrgb('#5f4b37'), 3)
    img = outline(c.result(), (40, 30, 22), px=2, soft=0.5)
    return trim(img, 2)


def icon_seed():
    c = icon_canvas()
    c.rotated_ellipse(60, 76, 26, 36, math.radians(-20), hexrgb('#9a7a4c'))
    c.rotated_ellipse(54, 70, 12, 22, math.radians(-20), hexrgb('#c09a62'))
    sp = sapling(seed=2, w=90, h=100)
    img = c.result()
    img.alpha_composite(sp, (52, 0))
    img = glow(outline(img, (40, 30, 22), px=2, soft=0.5), (160, 240, 150), radius=6, strength=0.5)
    return trim(img, 2)


def recolor_potion(path, stops, hue=None, extra=None):
    im = src(path)
    if hue:
        m = hue_mask(im, *hue)
        out = blend_masked(im, gradient_map(im, stops), m)
    else:
        out = gradient_map(im, stops, amount=0.85)
    if extra:
        out = extra(out)
    return out


def icon_amulet():
    im = src('assets/chapter2/amulet_frost.webp')
    gem = hue_mask(im, 170, 250, smin=0.15, vmin=0.3)
    out = blend_masked(im, gradient_map(im, [(0, (10, 40, 20)), (0.5, (70, 180, 100)), (1, (230, 255, 220))]), gem)
    return out


# ============================================================================ arenas
def arenas(rakita):
    base = Image.open(os.path.join(ROOT, 'public/assets/chapter2/arena_frostwood.webp')).convert('RGBA')
    glassy = gradient_map(base, [(0, (28, 36, 44)), (0.3, (78, 104, 118)), (0.6, (150, 174, 186)), (0.85, (204, 216, 232)), (1, (236, 240, 252))])
    arr = np.asarray(glassy).astype(np.float32)
    n = tileable_noise(512, 2, seed=3)
    n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize(base.size)).astype(np.float32) / 255
    lil = np.array([190, 176, 226], np.float32)
    for ch in range(3):
        arr[:, :, ch] = arr[:, :, ch] * (1 - 0.2 * n) + lil[ch] * 0.2 * n
    grove = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
    # glass willows along the edges (back row), the clearing stays open
    W, H = grove.size
    trees = [willow(seed=30 + i, w=300, h=400, pal=GLASS, ember=(i % 3 == 0)) for i in range(6)]
    for i, (x, y, s) in enumerate([(-40, 330, 0.95), (560, 300, 1.0), (-60, 760, 1.05), (600, 720, 1.0), (-30, 1180, 1.1), (590, 1170, 1.05)]):
        t = trees[i % len(trees)]
        t = t.resize((int(t.width * s), int(t.height * s)), Image.LANCZOS)
        grove.alpha_composite(t, (int(x), int(y - t.height)))
    grove = specular(grove, seed=40, count=10, width=0.004, strength=0.18)
    heart = grove.copy()
    r = rakita.resize((int(rakita.width * 0.55), int(rakita.height * 0.55)), Image.LANCZOS)
    heart.alpha_composite(r, (int(W / 2 - r.width / 2), int(330 - r.height)))
    warm = Image.new('RGBA', heart.size, (255, 160, 80, 0))
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - W / 2) / (W * 0.6)) ** 2 + ((yy - 640) / (H * 0.45)) ** 2)
    a = np.clip(1 - d, 0, 1) * 70
    warm.putalpha(Image.fromarray(a.astype(np.uint8)))
    heart.alpha_composite(warm)
    return grove.convert('RGB'), heart.convert('RGB')


# ============================================================================ world map
def world_map():
    m = Image.open(os.path.join(ROOT, 'public/assets/forest/world-map.webp')).convert('RGBA')
    k = m.width / 584
    cx, cy = 112 * k, 214 * k
    # parchment clearing
    clear = Image.new('L', m.size, 0)
    d = ImageDraw.Draw(clear)
    d.ellipse((cx - 70 * k, cy - 46 * k, cx + 70 * k, cy + 46 * k), fill=255)
    clear = clear.filter(ImageFilter.GaussianBlur(10 * k))
    parchment = Image.new('RGBA', m.size, (232, 214, 172, 255))
    pa = np.asarray(m).astype(np.float32)
    ca = np.asarray(clear).astype(np.float32)[:, :, None] / 255 * 0.85
    pa[:, :, :3] = pa[:, :, :3] * (1 - ca) + np.asarray(parchment).astype(np.float32)[:, :, :3] * ca
    out = Image.fromarray(pa.astype(np.uint8), 'RGBA')
    # a ring of small glass willows around the clearing, muted to sit in the painted map
    rnd = random.Random(5)
    ring = []
    for i in range(22):
        a = i / 22 * 2 * math.pi + rnd.uniform(-0.22, 0.22)
        if 0.95 < a < 2.2:          # the south side stays open: the clearing faces the road
            continue
        rx, ry = 84 * k * rnd.uniform(0.85, 1.18), 56 * k * rnd.uniform(0.85, 1.2)
        ring.append((cx + math.cos(a) * rx, cy + math.sin(a) * ry, 60 + i))
    for x, y, seed in sorted(ring, key=lambda t: t[1]):
        t = willow(seed=seed, w=200, h=270, pal=GLASS, ember=False)
        size = 27 * k * rnd.uniform(0.8, 1.15)
        t = t.resize((int(size), int(size * t.height / t.width)), Image.LANCZOS)
        t = gradient_map(t, [(0, (60, 70, 86)), (0.5, (150, 176, 190)), (1, (236, 244, 246))], amount=0.45)
        out.alpha_composite(t, (int(x - t.width / 2), int(y - t.height + 5 * k)))
    big = willow(seed=9, w=300, h=360, pal=GLASS, ember=True)
    big = big.resize((int(46 * k), int(46 * k * big.height / big.width)), Image.LANCZOS)
    out.alpha_composite(big, (int(cx - big.width / 2 + 34 * k), int(cy - big.height + 4 * k)))
    return out.convert('RGB')


# ============================================================================ main
def contact_sheet(path):
    cell = 210
    cols = 8
    rows = math.ceil(len(SHEET) / cols)
    sheet = Image.new('RGBA', (cols * cell, rows * (cell + 18)), (64, 74, 70, 255))
    d = ImageDraw.Draw(sheet)
    for i, (key, img) in enumerate(SHEET):
        x, y = (i % cols) * cell, (i // cols) * (cell + 18)
        t = img.convert('RGBA')
        t.thumbnail((cell - 12, cell - 12), Image.LANCZOS)
        sheet.alpha_composite(t, (x + (cell - t.width) // 2, y + 16 + (cell - 12 - t.height)))
        d.text((x + 4, y + 2), key, fill=(255, 255, 255, 255))
    sheet.convert('RGB').save(path)


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(DOCS, exist_ok=True)
    make_trees()
    register('dry_willow_01', willow(seed=7, w=380, h=500, pal=DRY), height=190)
    rk = register('grove_rakita_glass', rakita_glass(), height=400)
    register('grove_rakita_alive', rakita_alive(), height=300)
    register('glass_dam_01', P.glass_dam(), size=OLD.get('glass_dam_01') or (230, 124))
    register('glass_roots_01', glass_roots(), height=124)
    register('glass_wall_01', P.glass_wall(), size=OLD.get('glass_wall_01') or (160, 140))
    register('glass_wall_frost', P.frost_floor(), size=OLD.get('glass_wall_frost') or (170, 60))
    register('glass_block_cracked', P.cracked_block(), size=OLD.get('glass_block_cracked') or (150, 112))
    register('glass_bridge_01', P.glass_bridge(False), size=(160, 108))
    register('glass_bridge_frozen_01', P.glass_bridge(True), size=(160, 108))
    register('glass_cocoon_01', P.cocoon(), height=122)
    for kind in ('bird', 'fox', 'flower', 'empty'):
        register(f'glass_jar_{kind}', P.jar(kind), height={'bird': 96, 'fox': 96, 'flower': 84, 'empty': 44}[kind])
    register('iva_ward_01', ward_green(), height=134)
    register('grove_echo_01', echo(False), height=122)
    register('grove_echo_lit', echo(True), height=122)
    register('glass_leaf_node', P.glass_sprig(), height=58)
    register('memory_spark_node', P.spark_node(), height=60)
    register('willow_bark_node', P.bark_node(), height=52)
    register('glass_leaf_token', P.leaf_token(), height=56)
    register('iva_hut', iva_hut(), size=(300, 197))
    register('grove_stream_glass', P.stream_strip(False), size=(1300, 130))
    register('grove_stream_water', P.stream_strip(True), size=(1300, 130))
    register('grove_rift', rift_strip(), size=(1300, 90))
    register('glass_roots_tile', glass_roots(w=256, h=160, seed=5, tile=True) if False else roots_tile(), name='glass_roots_tile')
    register('glass_thicket_tile', P.thicket_tile(), name='glass_thicket_tile')
    glass_ground, dry_ground = P.ground_tiles()
    register('glass_ground_01', glass_ground, name='glass_ground')
    register('dry_ground_01', dry_ground, name='dry_ground')
    # characters
    young = iva_young()
    register('npc_iva', young, name='iva', height=124)
    register('portrait_iva', portrait_of(young), size=(128, 128))
    old = iva_old()
    register('npc_iva_old', old, name='iva_old', height=118)
    register('portrait_iva_old', portrait_of(old), size=(128, 128))
    for kind in ('nameless', 'vetla'):
        sp = spirit(kind)
        register(f'npc_{kind}', sp, name=kind, height=128)
        register(f'portrait_{kind}', portrait_of(sp, fx=0.22, fy=0.06, fs=0.58), size=(128, 128))
    for key, img in enemies().items():
        h = {'glass_stoat': 72, 'glass_wolf': 102, 'echo': 100, 'needle': 112, 'needle_elite': 132, 'glass_guardian': 192}[key]
        register(f'enemy_{key}', trim(img, 2), name=key, height=h)
    register('enemy_iva_reflection', reflection(young), name='iva_reflection', height=130)
    # icons
    register('icon_glass_leaf', P.icon_glass_leaf(), height=64)
    register('icon_memory_spark', P.icon_spark(), height=64)
    register('icon_willow_bark', P.icon_bark(), height=64)
    register('icon_vetla_seed', icon_seed(), height=64)
    for kind in ('leaf', 'bark', 'spark', 'moon'):
        register(f'garden_bed_{kind}', P.garden_bed(kind), height=84)
    register('companion_robin', P.companion_robin(), height=40)
    register('companion_fox', P.companion_fox(), height=46)
    register('icon_companion_robin', P.icon_companion('robin'), height=64)
    register('icon_companion_fox', P.icon_companion('fox'), height=64)
    register('icon_memory_draught', recolor_potion('assets/chapter2/potion_warm.webp', [(0, (60, 40, 10)), (0.5, (230, 170, 70)), (1, (255, 246, 214))], hue=(10, 60, 0.3, 0.3)), height=64)
    grove_arena, heart_arena = arenas(rk)
    register('arena_grove', grove_arena, name='arena_grove', sheet=False)
    register('arena_grove_heart', heart_arena, name='arena_grove_heart', sheet=False)
    wm = world_map()
    save_webp(wm, os.path.join(OUT, 'world-map.webp'), quality=90)
    FILES['world_map_01'] = f'assets/chapter3/world-map.webp?v={VERSION}'
    # config
    with open(CONFIG, 'w', encoding='utf-8') as f:
        f.write('// Generated by tools/art/ch3_grove_art.py (chapter III prototype art, drawn in code). Do not edit by hand.\n')
        f.write('export const CHAPTER3_FILES = ' + json.dumps(FILES, ensure_ascii=False, indent=2) + ';\n')
        f.write('export const CHAPTER3_SIZES = ' + json.dumps(SIZES, ensure_ascii=False, indent=2) + ';\n')
    contact_sheet(os.path.join(DOCS, 'contact-sheet.png'))
    small = wm.resize((wm.width // 2, wm.height // 2), Image.LANCZOS)
    small.save(os.path.join(DOCS, 'world-map.png'))
    Image.open(os.path.join(OUT, 'arena_grove.webp')).convert('RGB').resize((360, 640)).save(os.path.join(DOCS, 'arena-grove.png'))
    Image.open(os.path.join(OUT, 'arena_grove_heart.webp')).convert('RGB').resize((360, 640)).save(os.path.join(DOCS, 'arena-grove-heart.png'))
    print(f'{len(FILES)} files → {OUT}')


if __name__ == '__main__':
    main()
