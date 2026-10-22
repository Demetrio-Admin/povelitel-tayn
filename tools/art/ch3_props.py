"""Chapter III props painted from the approved chapter I–II paintings (v2 of the prototype art).

Instead of flat procedural shapes, the glass world is assembled from the same hand-painted sources the first
chapters use (ice wall, boulder, bridge, bottle glass, robin, frost critter, cobbles, snow ground ...), re-coloured
through a cold glass palette, so outline weight, shading and texture match the rest of the game.
Everything is still drawn in code (PIL + numpy); see ch3_grove_art.py for the pipeline and the manifest.
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from ch3_lib import (Canvas, hexrgb, mix, outline, glow, trim, gradient_map, hue_mask, blend_masked, glassify, specular,
                     tileable_noise)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LINE = (36, 44, 60)

GLASS_STOPS = [(0, (30, 40, 56)), (0.22, (74, 112, 136)), (0.5, (150, 196, 212)), (0.78, (214, 236, 244)), (1, (250, 254, 255))]
LILAC_STOPS = [(0, (34, 38, 62)), (0.22, (86, 100, 148)), (0.5, (164, 184, 224)), (0.78, (222, 230, 248)), (1, (252, 252, 255))]


def src(rel):
    return Image.open(os.path.join(ROOT, 'public', 'assets', rel)).convert('RGBA')


def fit_h(img, h):
    return img.resize((max(1, round(img.width * h / img.height)), h), Image.LANCZOS)


def fit_w(img, w):
    return img.resize((w, max(1, round(img.height * w / img.width))), Image.LANCZOS)


def tint(img, stops=GLASS_STOPS, amount=0.92, keep_hue=None):
    """Glass palette over luminance. keep_hue=(hmin,hmax,...) leaves those hues untouched (e.g. warm embers)."""
    out = gradient_map(img, stops, amount=amount)
    if keep_hue:
        out = blend_masked(out, img, hue_mask(img, *keep_hue))
    return out


def sparkle(img, seed=1, n=26, strength=0.9, size=(1.0, 2.4)):
    """Tiny frost glints scattered inside the sprite (painted-ice feel)."""
    rnd = random.Random(seed)
    a = np.asarray(img.split()[3]).astype(np.float32) / 255
    inner = np.asarray(img.split()[3].filter(ImageFilter.MinFilter(7))).astype(np.float32) / 255
    ys, xs = np.nonzero(inner > 0.9)
    if len(xs) == 0:
        return img
    c = Canvas(img.width, img.height)
    for _ in range(n):
        i = rnd.randrange(len(xs))
        x, y = float(xs[i]), float(ys[i])
        r = rnd.uniform(*size)
        c.ellipse(x, y, r, r, hexrgb('#ffffff', int(255 * strength)))
        if r > 1.6:
            c.line([(x - r * 2.2, y), (x + r * 2.2, y)], hexrgb('#ffffff', int(190 * strength)), 0.7)
            c.line([(x, y - r * 2.2), (x, y + r * 2.2)], hexrgb('#ffffff', int(190 * strength)), 0.7)
    layer = c.result()
    la = np.minimum(np.asarray(layer.split()[3]).astype(np.float32) / 255, inner)
    arr = np.asarray(layer).astype(np.float32)
    arr[:, :, 3] = la * 255
    out = img.copy()
    out.alpha_composite(Image.fromarray(arr.astype(np.uint8), 'RGBA'))
    return out


def ember_crack(img, seed=3, x0=0.5, y0=0.1, y1=0.95, spread=0.07, glow_color=(255, 150, 70)):
    """A jagged crack of frozen fire running down the sprite (the Willow's wound, the dam's heart)."""
    rnd = random.Random(seed)
    w, h = img.size
    c = Canvas(w, h)
    pts, x = [], x0 * w
    steps = 9
    for i in range(steps + 1):
        pts.append((x, h * (y0 + (y1 - y0) * i / steps)))
        x += rnd.uniform(-spread, spread) * w
    c.line(pts, hexrgb('#ff8a3a', 235), max(1.6, w * 0.012))
    c.line(pts, hexrgb('#ffe2a0', 255), max(0.8, w * 0.005))
    layer = c.result()
    # clip to the sprite so the crack never leaves the body
    la = np.minimum(np.asarray(layer.split()[3]).astype(np.float32), np.asarray(img.split()[3]).astype(np.float32))
    arr = np.asarray(layer).astype(np.float32)
    arr[:, :, 3] = la
    layer = glow(Image.fromarray(arr.astype(np.uint8), 'RGBA'), glow_color, radius=max(3, w * 0.02), strength=0.8)
    out = img.copy()
    out.alpha_composite(layer)
    return out


# ============================================================================ ice and glass barriers
def _unleaf(im):
    """Chapter II ice carries autumn leaves; in the glass grove they become pale glass flakes."""
    m = hue_mask(im, 0, 50, smin=0.3, vmin=0.25)
    flakes = gradient_map(im, [(0, (96, 120, 150)), (0.5, (200, 224, 238)), (1, (255, 255, 255))])
    return blend_masked(im, flakes, m)


def glass_dam():
    im = _unleaf(src('chapter2/ice_wall.webp'))
    out = tint(im, LILAC_STOPS, 0.8)
    out = ember_crack(out, seed=4, x0=0.5, y0=0.35, y1=0.92, spread=0.05)
    return trim(sparkle(specular(out, seed=5, count=6, strength=0.4), seed=2, n=30), 1)


def glass_wall():
    im = _unleaf(src('chapter2/ice_wall.webp')).transpose(Image.FLIP_LEFT_RIGHT)
    # taller, narrower: a thin curtain of spires standing across the path
    im = im.resize((int(im.width * 0.78), int(im.height * 1.45)), Image.LANCZOS)
    out = tint(im, GLASS_STOPS, 0.82)
    return trim(sparkle(specular(out, seed=8, count=6, strength=0.4), seed=5, n=26), 1)


def frost_floor():
    """The thick wall after Ice: brittle frost fallen flat — passable floor decoration."""
    im = src('chapter2/frost-ground.webp')
    out = tint(im, [(0, (96, 140, 170)), (0.5, (190, 222, 238)), (1, (255, 255, 255))], 0.7)
    c = Canvas(200, 70)
    rnd = random.Random(14)
    for i in range(10):
        x, y, l = rnd.uniform(14, 186), rnd.uniform(22, 60), rnd.uniform(8, 18)
        a = rnd.uniform(0, math.pi)
        c.poly([(x - math.cos(a) * l, y - math.sin(a) * l * 0.4), (x + math.sin(a) * 3, y - 3), (x + math.cos(a) * l, y + math.sin(a) * l * 0.4), (x - math.sin(a) * 3, y + 3)],
               [hexrgb('#cfe8f0', 245), hexrgb('#eaf8fc', 245), hexrgb('#b9d0ec', 240)][i % 3])
    shards = outline(c.result(), LINE, px=1, soft=0.5)
    base = fit_w(out, 200).crop((0, 0, 200, 70)) if fit_w(out, 200).height >= 70 else fit_w(out, 200)
    canvas = Image.new('RGBA', (200, 70), (0, 0, 0, 0))
    canvas.alpha_composite(base, (0, 70 - base.height) if base.height < 70 else (0, 0))
    canvas.alpha_composite(shards)
    return trim(canvas, 1)


def cracked_block():
    im = src('sprites/heavy_boulder_01.png')
    out = tint(im, GLASS_STOPS, 0.88)
    # moss → frost: lift the greens to white-blue
    m = hue_mask(im, 70, 170, smin=0.18, vmin=0.2)
    frost = gradient_map(im, [(0, (140, 176, 200)), (0.6, (222, 240, 248)), (1, (255, 255, 255))])
    out = blend_masked(out, frost, m * 0.85)
    rnd = random.Random(31)
    c = Canvas(out.width, out.height)
    for _ in range(7):
        x0, y0 = rnd.uniform(0.2, 0.8) * out.width, rnd.uniform(0.25, 0.75) * out.height
        pts = [(x0, y0)]
        for _ in range(5):
            x0 += rnd.uniform(-0.09, 0.09) * out.width
            y0 += rnd.uniform(-0.07, 0.09) * out.height
            pts.append((x0, y0))
        c.line(pts, hexrgb('#243448', 235), 2.0)
        c.line([(x + 1.6, y + 1.2) for x, y in pts], hexrgb('#ffffff', 170), 1.0)
    layer = c.result()
    la = np.minimum(np.asarray(layer.split()[3]).astype(np.float32), np.asarray(im.split()[3]).astype(np.float32))
    arr = np.asarray(layer).astype(np.float32)
    arr[:, :, 3] = la
    out.alpha_composite(Image.fromarray(arr.astype(np.uint8), 'RGBA'))
    return trim(sparkle(specular(out, seed=2, count=5, strength=0.45), seed=9, n=24), 1)


def glass_bridge(frozen=False):
    im = src('sprites/wooden_bridge_01.png')
    stops = GLASS_STOPS if not frozen else [(0, (60, 96, 130)), (0.4, (170, 214, 236)), (0.8, (232, 246, 252)), (1, (255, 255, 255))]
    out = tint(im, stops, 0.88)
    rnd = random.Random(41)
    c = Canvas(out.width, out.height)
    if not frozen:
        for _ in range(9):
            x0, y0 = rnd.uniform(0.25, 0.75) * out.width, rnd.uniform(0.15, 0.85) * out.height
            pts = [(x0, y0)]
            for _ in range(5):
                x0 += rnd.uniform(-0.06, 0.06) * out.width
                y0 += rnd.uniform(-0.05, 0.06) * out.height
                pts.append((x0, y0))
            c.line(pts, hexrgb('#1f2e40', 235), 2.0)
    layer = c.result()
    la = np.minimum(np.asarray(layer.split()[3]).astype(np.float32), np.asarray(im.split()[3]).astype(np.float32))
    arr = np.asarray(layer).astype(np.float32)
    arr[:, :, 3] = la
    out.alpha_composite(Image.fromarray(arr.astype(np.uint8), 'RGBA'))
    if frozen:
        out = glow(sparkle(out, seed=6, n=60, strength=1.0), (170, 232, 255), radius=7, strength=0.5)
    return trim(sparkle(specular(out, seed=6, count=4, strength=0.4), seed=3, n=18), 1)


# ============================================================================ jars, cocoon
def glass_dome(w, h, base_y, top_y, rx, alpha=1.0):
    """A bell jar: tinted body, darker edges, bright rim and reflections. Returns an RGBA layer (w x h)."""
    cx = w / 2
    c = Canvas(w, h)
    # superellipse silhouette: straighter sides, round top
    prof = [(cx - rx, base_y)]
    for i in range(0, 41):
        t = i / 40 * math.pi
        x = cx - rx * math.cos(t)
        y = base_y - (base_y - top_y) * (math.sin(t) ** 0.62)
        prof.append((x, y))
    prof.append((cx + rx, base_y))
    c.poly(prof, hexrgb('#d6eef4', int(34 * alpha)))
    inner = Canvas(w, h)
    sh = [(x * 0.94 + cx * 0.06, y + 1.5) for x, y in prof]
    inner.poly(sh, hexrgb('#ffffff', int(14 * alpha)))
    layer = c.result()
    layer.alpha_composite(inner.result())
    # rim light on the left, shade on the right
    rim = Canvas(w, h)
    rim.line(prof[1:-1], hexrgb('#3c5870', int(200 * alpha)), 3.4)
    rim.line(prof[1:-1], hexrgb('#f6fcfe', int(235 * alpha)), 1.8)
    rim.line([(x + 2.2, y + 2.2) for x, y in prof[3:12]], hexrgb('#ffffff', int(230 * alpha)), 2.6)
    rim.line([(cx - rx * 0.72, base_y - (base_y - top_y) * 0.7), (cx - rx * 0.84, base_y - (base_y - top_y) * 0.45), (cx - rx * 0.8, base_y - (base_y - top_y) * 0.22)], hexrgb('#ffffff', int(235 * alpha)), 3.4)
    rim.line([(cx + rx * 0.6, base_y - (base_y - top_y) * 0.62), (cx + rx * 0.8, base_y - (base_y - top_y) * 0.36)], hexrgb('#9ec0d2', int(210 * alpha)), 2.4)
    layer.alpha_composite(rim.result())
    return layer


def plinth(w, h, y):
    """Round wooden stand cut from the chapter II plank texture."""
    wood = src('chapter2/wood_floor.webp').resize((256, 256), Image.LANCZOS)
    c = Canvas(w, h)
    cx = w / 2
    rx = w * 0.42
    c.ellipse(cx, y + 5, rx + 3, 11, hexrgb('#000000', 70))
    c.poly([(cx - rx, y - 16), (cx - rx + 3, y + 2), (cx + rx - 3, y + 2), (cx + rx, y - 16)], hexrgb('#ffffff'))
    c.ellipse(cx, y + 2, rx - 3, 9, hexrgb('#ffffff'))
    c.ellipse(cx, y - 16, rx, 9, hexrgb('#ffffff'))
    mask = c.result().split()[3]
    tex = Image.new('RGBA', (w, h))
    for ty in range(0, h, 256):
        for tx in range(0, w, 256):
            tex.paste(wood, (tx, ty))
    arr = np.asarray(tex).astype(np.float32)
    shade = np.ones((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    shade *= 1.0 - 0.28 * np.clip((xx - (cx - rx)) / (2 * rx), 0, 1)                 # darker to the right
    shade *= np.where(yy < y - 12, 1.12, 0.92)                                      # lit top face
    arr[:, :, :3] = np.clip(arr[:, :, :3] * shade[:, :, None] * 0.78, 0, 255)
    arr[:, :, 3] = np.asarray(mask)
    return outline(Image.fromarray(arr.astype(np.uint8), 'RGBA'), (44, 30, 22), px=2, soft=0.5)


def _sprite_in_jar(kind):
    if kind == 'bird':
        s = src('forest/life-bird-3.webp')
        s = trim(s, 1)
        return s
    if kind == 'fox':
        s = src('chapter2/frost_critter.webp')
        warm = gradient_map(s, [(0, (74, 36, 18)), (0.35, (168, 82, 34)), (0.7, (236, 140, 62)), (1, (255, 238, 214))])
        out = blend_masked(s, warm, np.ones(s.size[::-1], np.float32) * 0.92)
        # cream muzzle and belly stay light: the warm map keeps the highlights
        return trim(out, 1)
    return None


def jar(kind):
    w, h = 130, 170
    plinth_y = h - 18
    base = plinth(w, h, plinth_y)
    inner = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    if kind in ('bird', 'fox'):
        s = _sprite_in_jar(kind)
        target_h = 50 if kind == 'bird' else 58
        s = fit_h(s, target_h)
        inner.alpha_composite(s, (int(w / 2 - s.width / 2), plinth_y - 20 - s.height + 6))
    elif kind == 'flower':
        s = trim(src('sprites/flower_purple_01.png'), 1)
        s = fit_h(s, 66)
        s2 = trim(src('sprites/flower_white_01.png'), 1)
        s2 = fit_h(s2, 56)
        inner.alpha_composite(s2, (int(w / 2 - s2.width / 2 - 10), plinth_y - 20 - s2.height + 4))
        inner.alpha_composite(s, (int(w / 2 - s.width / 2 + 8), plinth_y - 20 - s.height + 4))
    img = base.copy()
    if kind != 'empty':
        # inner contents sit under the glass: slightly cooled, a faint shadow on the stand
        arr = np.asarray(inner).astype(np.float32)
        arr[:, :, :3] = arr[:, :, :3] * 0.97 + np.array([190, 220, 232], np.float32) * 0.03
        inner = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        img.alpha_composite(outline(inner, (44, 34, 30), px=1, soft=0.4))
        dome = glass_dome(w, h, plinth_y - 14, 10, w * 0.37)
        img.alpha_composite(dome)
        knob = Canvas(w, h)
        knob.ellipse(w / 2, 11, 7, 6, hexrgb('#dff2f7'))
        knob.ellipse(w / 2 - 2, 9, 2.5, 2, hexrgb('#ffffff'))
        img.alpha_composite(outline(knob.result(), (60, 84, 100), px=1, soft=0.4))
    else:
        # the opened jar: lid off, a few broken shards of glass on the stand
        sh = Canvas(w, h)
        rnd = random.Random(5)
        for i in range(9):
            x = w / 2 + rnd.uniform(-32, 32)
            by = plinth_y - 14 + rnd.uniform(-4, 4)
            hh = rnd.uniform(10, 26)
            sh.poly([(x - 5, by), (x - 2 + rnd.uniform(-2, 2), by - hh * 0.6), (x + rnd.uniform(-3, 3), by - hh), (x + 4, by - hh * 0.5), (x + 6, by)],
                    [hexrgb('#cfe9f0', 240), hexrgb('#e4f4f8', 240), hexrgb('#bcd6ee', 240)][i % 3])
        shl = outline(sh.result(), LINE, px=1, soft=0.5)
        img.alpha_composite(specular(shl, seed=3, count=3))
    return trim(img, 1)


def cocoon():
    from ch3_trees import sapling
    w, h = 140, 170
    plinth_y = h - 14
    c = Canvas(w, h)
    c.ellipse(w / 2, plinth_y + 4, w * 0.36, 9, hexrgb('#000000', 70))
    ground = Canvas(w, h)
    ground.ellipse(w / 2, plinth_y - 3, w * 0.34, 10, hexrgb('#5a4332'))
    ground.ellipse(w / 2, plinth_y - 5, w * 0.3, 7, hexrgb('#72573f'))
    img = c.result()
    img.alpha_composite(outline(ground.result(), (40, 30, 22), px=1, soft=0.4))
    sp = sapling(seed=3, w=110, h=136)
    img.alpha_composite(sp, (int(w / 2 - sp.width / 2), int(plinth_y - 10 - sp.height)))
    dome = glass_dome(w, h, plinth_y - 4, 8, w * 0.36)
    dome = glow(dome, (190, 240, 210), radius=8, strength=0.55)
    img.alpha_composite(dome)
    return trim(img, 1)


# ============================================================================ small nodes and icons
def glass_sprig(w=130, h=140):
    """Glass reeds: painted cattails recoloured into a bundle of crystal blades."""
    s = src('sprites/reeds_01.png')
    out = tint(s, LILAC_STOPS, 0.85)
    out = sparkle(specular(out, seed=4, count=3, strength=0.5), seed=1, n=12)
    return trim(out, 1)


def spark_node():
    rock = src('sprites/rock_small_01.png')
    rock = tint(rock, GLASS_STOPS, 0.82)
    rock = fit_h(rock, 36)
    w, h = 90, 110
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    img.alpha_composite(rock, (int(w / 2 - rock.width / 2), h - rock.height - 2))
    orb = src('sprites/icon_ember.png')
    orb = gradient_map(orb, [(0, (140, 80, 20)), (0.5, (255, 214, 120)), (1, (255, 252, 232))], amount=0.9)
    orb = orb.resize((52, 52), Image.LANCZOS)
    halo = Canvas(w, h)
    halo.ellipse(w / 2, 46, 20, 20, hexrgb('#ffe9b0', 235))
    halo.ellipse(w / 2 - 4, 41, 8, 8, hexrgb('#ffffff', 255))
    for i in range(10):
        t = i / 10 * 2 * math.pi
        r2 = 33 if i % 2 == 0 else 27
        halo.line([(w / 2 + math.cos(t) * 24, 46 + math.sin(t) * 24), (w / 2 + math.cos(t) * r2, 46 + math.sin(t) * r2)], hexrgb('#ffe2a6', 220), 1.6)
    spark = glow(halo.result(), (255, 200, 110), radius=9, strength=0.95)
    img.alpha_composite(spark)
    return trim(img, 1)


def bark_node():
    log = src('sprites/resin_log_01.png')
    # amber resin drop → pale sap
    m = hue_mask(log, 20, 60, smin=0.5, vmin=0.5)
    sap = gradient_map(log, [(0, (120, 150, 90)), (0.6, (200, 224, 150)), (1, (250, 255, 220))])
    return trim(blend_masked(log, sap, m), 1)


def leaf_token():
    """A single glass leaf standing on a little wooden holder (quest item on the ground)."""
    herb = src('chapter2/frost_herb.webp')
    herb = tint(herb, [(0, (40, 56, 90)), (0.4, (150, 180, 224)), (0.75, (226, 236, 252)), (1, (255, 255, 255))], 0.86)
    herb = fit_h(herb, 84)
    w, h = 96, 100
    c = Canvas(w, h)
    c.ellipse(w / 2, h - 6, 24, 6, hexrgb('#000000', 70))
    c.poly([(w / 2 - 18, h - 6), (w / 2 - 12, h - 18), (w / 2 + 12, h - 18), (w / 2 + 18, h - 6)], hexrgb('#7a5638'))
    c.poly([(w / 2 - 12, h - 18), (w / 2 + 12, h - 18), (w / 2 + 14, h - 22), (w / 2 - 14, h - 22)], hexrgb('#a77a52'))
    img = outline(c.result(), (44, 30, 22), px=1.5, soft=0.5)
    img.alpha_composite(herb, (int(w / 2 - herb.width / 2), h - 14 - herb.height))
    return trim(glow(img, (255, 214, 150), radius=6, strength=0.4), 1)


def icon_glass_leaf():
    herb = src('chapter2/frost_herb.webp')
    out = tint(herb, [(0, (40, 56, 90)), (0.4, (150, 180, 224)), (0.75, (226, 236, 252)), (1, (255, 255, 255))], 0.86)
    out = fit_h(trim(out, 1), 124)
    return trim(sparkle(specular(out, seed=1, count=3, width=0.04, strength=0.55), seed=2, n=10), 2)


def icon_spark():
    orb = src('sprites/icon_ember.png')
    orb = gradient_map(orb, [(0, (120, 70, 16)), (0.45, (255, 208, 110)), (1, (255, 252, 232))], amount=0.95)
    orb = orb.resize((112, 112), Image.LANCZOS)
    c = Canvas(128, 128)
    for i in range(12):
        t = i / 12 * 2 * math.pi
        r2 = 60 if i % 2 == 0 else 50
        c.line([(64 + math.cos(t) * 40, 64 + math.sin(t) * 40), (64 + math.cos(t) * r2, 64 + math.sin(t) * r2)], hexrgb('#ffe3a8', 215), 3)
    c.ellipse(64, 64, 30, 30, hexrgb('#ffcf7a'))
    c.ellipse(64, 64, 22, 22, hexrgb('#ffe9b4'))
    c.ellipse(57, 57, 10, 10, hexrgb('#fffaea'))
    img = glow(c.result(), (255, 190, 90), radius=9, strength=0.95)
    return trim(outline(img, (96, 62, 28), px=1, soft=0.5), 2)


def icon_bark():
    log = bark_node()
    return trim(fit_w(log, 120), 2)


def ground_tiles():
    snow = Image.open(os.path.join(ROOT, 'public/assets/chapter2/snow_ground.webp')).convert('RGBA')
    glass = gradient_map(snow, [(0, (112, 132, 150)), (0.4, (156, 180, 196)), (0.75, (204, 222, 234)), (1, (244, 250, 252))], amount=0.9)
    n = tileable_noise(512, 2, seed=7)
    g = tileable_noise(512, 7, seed=11)
    arr = np.asarray(glass).astype(np.float32)
    lil = np.array([196, 186, 232], np.float32)
    mint = np.array([170, 214, 214], np.float32)
    for ch in range(3):
        arr[:, :, ch] = arr[:, :, ch] * (1 - 0.2 * n) + lil[ch] * 0.2 * n
        arr[:, :, ch] = arr[:, :, ch] * (1 - 0.16 * (1 - n)) + mint[ch] * 0.16 * (1 - n)
    glints = np.clip((g - 0.84) / 0.1, 0, 1) * 0.65
    for ch in range(3):
        arr[:, :, ch] = arr[:, :, ch] + (255 - arr[:, :, ch]) * glints
    glass = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
    grave = Image.open(os.path.join(ROOT, 'public/assets/chapter2/grave_ground.webp')).convert('RGBA')
    dry = gradient_map(grave, [(0, (86, 70, 50)), (0.4, (142, 122, 88)), (0.75, (190, 170, 128)), (1, (228, 212, 172))], amount=0.82)
    return glass.convert('RGB'), dry.convert('RGB')


# ============================================================================ stream strips
def stream_strip(water=False):
    W, H = 1300, 130
    rnd = random.Random(3)
    cob = Image.open(os.path.join(ROOT, 'public/assets/sprites/stone_path_01.png')).convert('RGB')
    cobs = Image.new('RGB', (W, H))
    for x in range(0, W, cob.width):
        cobs.paste(cob.crop((0, 0, cob.width, H)), (x, 0))
    cobs = cobs.convert('RGBA')
    cobs = gradient_map(cobs, [(0, (46, 40, 36)), (0.5, (132, 120, 106)), (1, (214, 202, 184))], amount=0.85)
    # banks and body masks
    def band(y_top, y_bot, amp, phase, seed):
        r = random.Random(seed)
        top = [(x, y_top + amp * math.sin(x / 90 + phase) + r.uniform(-2.5, 2.5)) for x in range(0, W + 26, 26)]
        bot = [(x, y_bot + amp * 0.8 * math.sin(x / 120 + phase + 1) + r.uniform(-2.5, 2.5)) for x in range(W, -26, -26)]
        return top, bot
    top, bot = band(28, H - 26, 7, 0, 3)
    bank = Canvas(W, H)
    bank.poly([(x, y - 13) for x, y in top] + [(x, y + 13) for x, y in bot], hexrgb('#ffffff'))
    bank_mask = bank.result().split()[3]
    bank_layer = cobs.copy()
    bank_layer.putalpha(bank_mask)
    body = Canvas(W, H)
    body.poly(top + bot, hexrgb('#ffffff'))
    body_mask = body.result().split()[3]
    # water: painterly bands from noise
    n1 = np.asarray(Image.fromarray((tileable_noise(512, 3, seed=5) * 255).astype(np.uint8)).resize((W, H * 4)).crop((0, 0, W, H))).astype(np.float32) / 255
    n2 = np.asarray(Image.fromarray((tileable_noise(512, 9, seed=8) * 255).astype(np.uint8)).resize((W * 2, H * 8)).crop((0, 0, W, H))).astype(np.float32) / 255
    yy = np.linspace(0, 1, H)[:, None]
    depth = 1 - np.abs(yy - 0.5) * 2                       # deeper in the middle
    if water:
        deep, mid, shallow = np.array([30, 88, 126]), np.array([62, 140, 176]), np.array([150, 206, 224])
    else:
        deep, mid, shallow = np.array([112, 150, 178]), np.array([178, 212, 228]), np.array([236, 248, 252])
    t = np.clip(0.55 * depth + 0.45 * (n1 - 0.5) * 2 * 0.5 + 0.1, 0, 1)
    col = np.where(t[:, :, None] < 0.5, deep + (mid - deep) * (t[:, :, None] / 0.5), mid + (shallow - mid) * ((t[:, :, None] - 0.5) / 0.5))
    # ripples
    ripple = np.clip((np.sin((n2 * 9 + yy * 2) * math.pi * 2) - 0.86) / 0.14, 0, 1)
    col = col + (np.array([255, 255, 255]) - col) * (ripple[:, :, None] * 0.45)
    water_rgb = np.clip(col, 0, 255).astype(np.uint8)
    wl = Image.fromarray(np.dstack([water_rgb, np.full((H, W), 255, np.uint8)]), 'RGBA')
    wl.putalpha(body_mask)
    # shore shadow: dark rim inside the water along the banks
    edge = body_mask.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(3))
    rim = Image.new('RGBA', (W, H), (14, 30, 46, 0))
    ra = np.clip(np.asarray(body_mask).astype(np.float32) - np.asarray(edge).astype(np.float32), 0, 255) * 0.55
    rim.putalpha(Image.fromarray(ra.astype(np.uint8)))
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.alpha_composite(bank_layer)
    out.alpha_composite(wl)
    out.alpha_composite(rim)
    c = Canvas(W, H)
    if water:
        for i in range(60):
            x, y = rnd.uniform(10, W - 10), rnd.uniform(44, H - 40)
            c.line([(x, y), (x + rnd.uniform(14, 32), y + rnd.uniform(-2, 2))], hexrgb('#e3f4fb', 190), 1.5)
        for i, x in enumerate(range(560, 760, 40)):          # the ford
            sx, sy = x + rnd.uniform(-6, 6), 62 + (i % 2) * 14
            c.ellipse(sx, sy + 3, 17, 9, hexrgb('#000000', 70))
            c.ellipse(sx, sy, 16, 9, hexrgb('#8e857a'))
            c.ellipse(sx - 3, sy - 2, 11, 5, hexrgb('#b3a99c'))
    else:
        for i in range(50):
            x0, y0 = rnd.uniform(10, W - 10), rnd.uniform(44, H - 40)
            pts = [(x0, y0)]
            for _ in range(4):
                x0 += rnd.uniform(-20, 20)
                y0 += rnd.uniform(-8, 8)
                pts.append((x0, max(40, min(H - 34, y0))))
            c.line(pts, hexrgb('#6e94ac', 215), 1.3)
        for i in range(34):
            x, y = rnd.uniform(10, W - 10), rnd.uniform(44, H - 40)
            c.line([(x, y), (x + 10, y - 16)], hexrgb('#ffffff', 215), 2)
    strokes = c.result()
    sa = np.minimum(np.asarray(strokes.split()[3]).astype(np.float32), np.asarray(body_mask).astype(np.float32))
    arr = np.asarray(strokes).astype(np.float32)
    arr[:, :, 3] = sa
    out.alpha_composite(Image.fromarray(arr.astype(np.uint8), 'RGBA'))
    return outline(out, (50, 44, 40), px=2, soft=0.6)


def thicket_tile(w=256, h=160):
    """Seamless row of glass spires cut from the painted ice wall (two staggered rows)."""
    wall = _unleaf(src('chapter2/ice_wall.webp'))
    wall = tint(wall, LILAC_STOPS, 0.78)
    wall = trim(wall, 0)
    piece = fit_h(wall, 118)
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for dx, y, scale in ((-0.15, h - piece.height + 18, 0.82), (0.45, h - piece.height + 2, 1.0)):
        pw = int(piece.width * scale)
        pic = piece.resize((pw, int(piece.height * scale)), Image.LANCZOS)
        x = int(dx * w)
        for k in (-1, 0, 1):
            canvas.alpha_composite(pic, (x + k * w, h - pic.height - (0 if scale == 1.0 else 6))) if -pw < x + k * w < w else None
    return sparkle(canvas, seed=4, n=14)


# ============================================================================ garden of Vetla and companions
def _textured(mask_img, tex, mul=1.0, tint_rgb=None):
    """Fill the non-transparent area of mask_img with a (tiled) texture, optionally darkened/tinted."""
    w, h = mask_img.size
    t = Image.new('RGBA', (w, h))
    for ty in range(0, h, tex.height):
        for tx in range(0, w, tex.width):
            t.paste(tex, (tx, ty))
    arr = np.asarray(t).astype(np.float32)
    arr[:, :, :3] *= mul
    if tint_rgb is not None:
        arr[:, :, :3] = arr[:, :, :3] * 0.7 + np.array(tint_rgb, np.float32) * 0.3
    arr[:, :, 3] = np.asarray(mask_img.split()[3])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def garden_bed(kind):
    """A raised bed of the Vetla garden: plank frame, dark soil, and what grows in it (kind: leaf / bark / spark / moon)."""
    from ch3_trees import sapling
    w, h = 170, 130
    cx = w / 2
    wood = src('chapter2/wood_floor.webp').resize((128, 128), Image.LANCZOS)
    soil = src('chapter2/grave_ground.webp').resize((128, 128), Image.LANCZOS)
    shadow = Canvas(w, h)
    shadow.ellipse(cx, h - 12, 76, 13, hexrgb('#000000', 80))
    out = shadow.result()
    # back rim, soil, front planks (drawn as flat masks, then textured)
    back = Canvas(w, h)
    back.poly([(10, h - 50), (w - 10, h - 50), (w - 4, h - 70), (4, h - 70)], hexrgb('#ffffff'))
    top = Canvas(w, h)
    top.poly([(14, h - 52), (w - 14, h - 52), (w - 9, h - 68), (9, h - 68)], hexrgb('#ffffff'))
    front = Canvas(w, h)
    front.poly([(8, h - 50), (w - 8, h - 50), (w - 8, h - 16), (8, h - 16)], hexrgb('#ffffff'))
    left = Canvas(w, h)
    left.poly([(8, h - 52), (16, h - 60), (16, h - 26), (8, h - 18)], hexrgb('#ffffff'))
    soil_mask = Canvas(w, h)
    soil_mask.poly([(16, h - 52), (w - 16, h - 52), (w - 11, h - 67), (11, h - 67)], hexrgb('#ffffff'))
    out.alpha_composite(outline(_textured(back.result(), wood, 0.62), (44, 30, 22), px=2, soft=0.4))
    out.alpha_composite(_textured(soil_mask.result(), soil, 0.52, (60, 44, 30)))
    plants = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    base_y = h - 58
    if kind == 'leaf':
        sp = glass_sprig()
        sp = fit_h(sp, 74)
        plants.alpha_composite(sp, (int(cx - sp.width / 2), base_y - sp.height + 6))
    elif kind == 'bark':
        sp = sapling(seed=7, w=120, h=150)
        sp = fit_h(sp, 84)
        plants.alpha_composite(sp, (int(cx - sp.width / 2), base_y - sp.height + 6))
    elif kind == 'spark':
        c = Canvas(w, h)
        rnd = random.Random(12)
        for i, (dx, dy, r) in enumerate([(-30, 26, 6), (-6, 40, 8), (22, 30, 6), (40, 50, 5), (-48, 46, 5)]):
            c.line([(cx + dx, base_y), (cx + dx + rnd.uniform(-3, 3), base_y - dy + 6)], hexrgb('#6f9a52'), 2.4)
            c.ellipse(cx + dx, base_y - dy, r + 2, r + 2, hexrgb('#ffe9b4', 235))
            c.ellipse(cx + dx - 1, base_y - dy - 1, r * 0.5, r * 0.5, hexrgb('#ffffff'))
        plants = glow(outline(c.result(), (70, 50, 24), px=1, soft=0.4), (255, 200, 110), radius=7, strength=0.8)
    else:   # moon
        cr = src('chapter2/ice_crystal.webp')
        cr = gradient_map(cr, [(0, (46, 40, 90)), (0.5, (160, 150, 232)), (1, (250, 246, 255))], amount=0.9)
        cr = fit_h(trim(cr, 1), 62)
        plants.alpha_composite(cr, (int(cx - cr.width / 2), base_y - cr.height + 10))
        plants = glow(plants, (190, 170, 255), radius=6, strength=0.5)
    out.alpha_composite(plants)
    out.alpha_composite(outline(_textured(front.result(), wood, 0.9), (44, 30, 22), px=2, soft=0.4))
    # plank seams on the front face
    seams = Canvas(w, h)
    for x in (w * 0.34, w * 0.67):
        seams.line([(x, h - 50), (x, h - 16)], hexrgb('#3a2616', 200), 1.6)
    seams.line([(8, h - 33), (w - 8, h - 33)], hexrgb('#3a2616', 140), 1.2)
    sl = seams.result()
    sa = np.minimum(np.asarray(sl.split()[3]).astype(np.float32), np.asarray(front.result().split()[3]).astype(np.float32))
    arr = np.asarray(sl).astype(np.float32); arr[:, :, 3] = sa
    out.alpha_composite(Image.fromarray(arr.astype(np.uint8), 'RGBA'))
    return trim(out, 1)


def companion_robin():
    s = trim(src('forest/life-bird-3.webp'), 1)
    return s


def companion_fox():
    s = src('chapter2/frost_critter.webp')
    warm = gradient_map(s, [(0, (74, 36, 18)), (0.35, (168, 82, 34)), (0.7, (236, 140, 62)), (1, (255, 238, 214))])
    return trim(blend_masked(s, warm, np.ones(s.size[::-1], np.float32) * 0.92), 1)


def icon_companion(kind):
    s = companion_robin() if kind == 'robin' else companion_fox()
    s = fit_w(s, 118) if s.width >= s.height else fit_h(s, 118)
    c = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    c.alpha_composite(s, ((128 - s.width) // 2, (128 - s.height) // 2))
    return trim(outline(glow(c, (255, 226, 160), radius=6, strength=0.4), (44, 34, 30), px=1.5, soft=0.5), 2)
