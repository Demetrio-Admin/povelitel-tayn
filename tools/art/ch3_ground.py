"""Chapter III ground and barrier tiles, v3: painted look instead of flat noise.

glass_ground / dry_ground are seamless 512x512 tiles (drawn at 1024 and reduced). Both are built from a torus Voronoi:
cells give plates of glass (or cracked earth), the cell borders give the cracks, and everything that is scattered on top
(frozen grass, shards, pebbles, roots) is pasted with wrap-around so the tile stays seamless.
thicket_tile / roots_tile are 256x160 strips drawn as real silhouettes (transparent top), so they work without the
rectangular outline the engine draws around ordinary ruins.
"""
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from ch3_lib import Canvas, hexrgb, outline, tileable_noise

LINE = (36, 44, 60)


def _voronoi(size, n, seed, warp=0.0):
    """Seamless Voronoi on a torus (optionally domain-warped so the seams wander): nearest / second-nearest distance,
    cell id, the cell points and the signed offset of every pixel from its own cell point."""
    rng = np.random.default_rng(seed)
    pts = rng.uniform(0, size, (n, 2)).astype(np.float32)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    if warp:
        xs = xs + (tileable_noise(size, 3, seed + 100) - 0.5) * 2 * warp
        ys = ys + (tileable_noise(size, 3, seed + 101) - 0.5) * 2 * warp
    best = np.full((size, size), 1e9, np.float32)
    second = np.full((size, size), 1e9, np.float32)
    cid = np.zeros((size, size), np.int32)
    ox = np.zeros((size, size), np.float32)
    oy = np.zeros((size, size), np.float32)
    for i, (px, py) in enumerate(pts):
        dx = (xs - px + size / 2) % size - size / 2
        dy = (ys - py + size / 2) % size - size / 2
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < best
        second = np.where(closer, best, np.minimum(second, d))
        cid = np.where(closer, i, cid)
        ox = np.where(closer, dx, ox)
        oy = np.where(closer, dy, oy)
        best = np.where(closer, d, best)
    return best, second, cid, pts, ox, oy


def _wrap_paste(base, sprite, x, y):
    w, h = base.size
    for dx in (-w, 0, w):
        for dy in (-h, 0, h):
            px, py = int(x + dx), int(y + dy)
            if px < w and py < h and px + sprite.width > 0 and py + sprite.height > 0:
                base.alpha_composite(sprite, (px, py)) if (px >= 0 and py >= 0) else base.alpha_composite(
                    sprite.crop((max(0, -px), max(0, -py), sprite.width, sprite.height)), (max(px, 0), max(py, 0)))


def _smooth(a, r):
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255


def glass_ground(size=1024, out=512, seed=31):
    """Pale frosted glass: big lilac / mint plates tilted a little toward the light, thin wandering cracks, glints."""
    best, second, cid, pts, ox, oy = _voronoi(size, 30, seed, warp=26)
    rng = np.random.default_rng(seed + 1)
    edge = second - best
    n_low = tileable_noise(size, 2, seed + 2)
    n_mid = tileable_noise(size, 5, seed + 3)
    tone = rng.uniform(-1, 1, len(pts))[cid]
    hue = rng.uniform(0, 1, len(pts))[cid]
    base = np.array([208, 228, 240], np.float32)
    lil = np.array([212, 202, 244], np.float32)
    mint = np.array([172, 226, 224], np.float32)
    deep = np.array([108, 140, 172], np.float32)
    col = base[None, None, :] + (lil - base) * (hue * 0.6)[:, :, None] * (0.4 + 0.6 * n_low[:, :, None])
    col = col + (mint - col) * ((1 - hue) * 0.5)[:, :, None] * (1 - n_low[:, :, None]) * 0.7
    col = col * (1 + tone * 0.04)[:, :, None]
    # every plate is a slightly tilted pane: brighter toward the upper left, darker toward the lower right
    tilt = np.clip((-(ox + oy) / 90.0), -1, 1)
    col = col * (1 + tilt * 0.06)[:, :, None]
    col = col + (255 - col) * (np.clip(tilt, 0, 1) * 0.12)[:, :, None]
    # soft fog in hollows and a faint deep colour in low plates
    col = col + (np.array([236, 246, 252]) - col) * (np.clip(n_mid - 0.6, 0, 1) * 1.1)[:, :, None]
    col = col + (deep - col) * (np.clip(0.5 - n_mid, 0, 1) * 0.28)[:, :, None]
    # thin crack: dark core and a bright lip on the lit side
    crack = np.clip(1 - edge / 2.4, 0, 1)
    col = col + (deep - col) * (0.62 * crack)[:, :, None]
    lip = np.clip(1 - np.abs(edge - 3.6) / 1.6, 0, 1) * np.clip(0.4 + tilt, 0, 1)
    col = col + (255 - col) * (0.55 * lip)[:, :, None]
    hair, hair2, _, _, _, _ = _voronoi(size, 120, seed + 9, warp=14)
    col = col + (deep - col) * (np.clip(1 - (hair2 - hair) / 1.3, 0, 1) * 0.16)[:, :, None]
    img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')

    prng = random.Random(seed + 4)
    scatter = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for _ in range(80):                                     # frozen grass blades
        x, y = prng.uniform(0, size), prng.uniform(0, size)
        spr = _blade_tuft(prng)
        _wrap_paste(scatter, spr, x - spr.width / 2, y - spr.height)
    for _ in range(34):                                     # glass shards lying about
        x, y = prng.uniform(0, size), prng.uniform(0, size)
        spr = _shard(prng)
        _wrap_paste(scatter, spr, x - spr.width / 2, y - spr.height / 2)
    img.alpha_composite(scatter)
    g = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for _ in range(70):                                     # glints: four-point sparkles
        x, y = prng.uniform(0, size), prng.uniform(0, size)
        r = prng.uniform(4, 11)
        a = prng.randint(120, 220)
        for dx in (-size, 0, size):
            for dy in (-size, 0, size):
                cx, cy = x + dx, y + dy
                gd.polygon([(cx, cy - r), (cx + r * 0.14, cy - r * 0.14), (cx + r, cy), (cx + r * 0.14, cy + r * 0.14),
                            (cx, cy + r), (cx - r * 0.14, cy + r * 0.14), (cx - r, cy), (cx - r * 0.14, cy - r * 0.14)], fill=(255, 255, 255, a))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(0.7)))
    return img.convert('RGB').resize((out, out), Image.LANCZOS)


def _blade_tuft(rnd):
    w, h = 44, 40
    c = Canvas(w, h)
    cols = [hexrgb('#9ccfd6', 235), hexrgb('#c9d6f4', 235), hexrgb('#b4e0d8', 235)]
    for i in range(rnd.randint(3, 5)):
        x0 = w / 2 + rnd.uniform(-5, 5)
        lean = rnd.uniform(-10, 10)
        ht = rnd.uniform(12, 26)
        c.poly([(x0 - 1.8, h - 2), (x0 + lean * 0.5, h - ht * 0.6), (x0 + lean, h - ht), (x0 + lean * 0.5 + 1, h - ht * 0.6), (x0 + 1.8, h - 2)], cols[i % 3])
        c.line([(x0 - 0.2, h - 3), (x0 + lean * 0.5, h - ht * 0.6)], hexrgb('#ffffff', 190), 0.8)
    out = outline(c.result(), (70, 92, 124), px=1.0, soft=0.5)
    return out.resize((out.width, out.height), Image.LANCZOS)


def _shard(rnd):
    w, h = 36, 26
    c = Canvas(w, h)
    ang = rnd.uniform(0, math.pi)
    cx, cy = w / 2, h / 2
    L, W = rnd.uniform(9, 15), rnd.uniform(2.8, 5)
    pts = [(cx + math.cos(ang) * L, cy + math.sin(ang) * L * 0.55), (cx + math.cos(ang + math.pi / 2) * W, cy + math.sin(ang + math.pi / 2) * W * 0.55),
           (cx - math.cos(ang) * L * 0.7, cy - math.sin(ang) * L * 0.4), (cx + math.cos(ang - math.pi / 2) * W, cy + math.sin(ang - math.pi / 2) * W * 0.55)]
    c.poly(pts, hexrgb('#cfe6f2', 235))
    c.poly([pts[0], pts[1], (cx, cy)], hexrgb('#ffffff', 210))
    c.poly([pts[2], pts[3], (cx, cy)], hexrgb('#8fb0cc', 220))
    return outline(c.result(), (70, 96, 130), px=1.0, soft=0.5)


def dry_ground(size=1024, out=512, seed=44):
    """Dry gully: warm clay with wandering hairline cracks, mottled patches, a few pebbles, dead grass and roots."""
    best, second, cid, pts, ox, oy = _voronoi(size, 22, seed, warp=34)
    rng = np.random.default_rng(seed + 1)
    edge = second - best
    n_low = tileable_noise(size, 2, seed + 2)
    n_mid = tileable_noise(size, 6, seed + 5)
    n_hi = tileable_noise(size, 16, seed + 3)
    tone = rng.uniform(-1, 1, len(pts))[cid]
    warm = np.array([168, 138, 96], np.float32)
    pale = np.array([212, 188, 142], np.float32)
    dark = np.array([112, 88, 60], np.float32)
    col = warm[None, None, :] + (pale - warm) * (n_low * 0.85)[:, :, None]
    col = col + (dark - col) * (np.clip(n_mid - 0.55, 0, 1) * 0.9)[:, :, None]
    col = col * (1 + tone * 0.05)[:, :, None]
    col = col * (0.94 + 0.12 * n_hi)[:, :, None]
    tilt = np.clip((-(ox + oy) / 120.0), -1, 1)
    col = col * (1 + tilt * 0.05)[:, :, None]
    crack = np.clip(1 - edge / 3.2, 0, 1)
    col = col + (np.array([48, 36, 26]) - col) * (0.85 * crack)[:, :, None]
    col = col + (np.array([232, 212, 170]) - col) * (0.38 * np.clip(1 - np.abs(edge - 5.5) / 2.0, 0, 1) * np.clip(0.4 + tilt, 0, 1))[:, :, None]
    img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    prng = random.Random(seed + 4)
    scatter = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for _ in range(55):
        x, y = prng.uniform(0, size), prng.uniform(0, size)
        spr = _pebble(prng, prng.uniform(3.5, 8))
        _wrap_paste(scatter, spr, x - spr.width / 2, y - spr.height / 2)
    for _ in range(80):
        x, y = prng.uniform(0, size), prng.uniform(0, size)
        spr = _dead_grass(prng)
        _wrap_paste(scatter, spr, x - spr.width / 2, y - spr.height)
    for _ in range(5):
        x, y = prng.uniform(0, size), prng.uniform(0, size)
        spr = _root(prng)
        _wrap_paste(scatter, spr, x - spr.width / 2, y - spr.height / 2)
    img.alpha_composite(scatter)
    return img.convert('RGB').resize((out, out), Image.LANCZOS)


def _pebble(rnd, r):
    w, h = int(r * 3.4), int(r * 2.8)
    c = Canvas(w, h)
    cx, cy = w / 2, h / 2
    c.ellipse(cx + 1.2, cy + r * 0.45, r * 1.05, r * 0.55, hexrgb('#2c2018', 90))
    tone = rnd.choice(['#9a8a74', '#b0a088', '#8a7a68', '#a89480'])
    c.ellipse(cx, cy, r, r * 0.78, hexrgb(tone))
    c.ellipse(cx - r * 0.25, cy - r * 0.28, r * 0.5, r * 0.3, hexrgb('#e4d8c0', 200))
    return outline(c.result(), (52, 40, 32), px=1.2, soft=0.5)


def _dead_grass(rnd):
    w, h = 48, 40
    c = Canvas(w, h)
    cols = [hexrgb('#9a8650'), hexrgb('#b49a62'), hexrgb('#786838')]
    for i in range(rnd.randint(4, 8)):
        x0 = w / 2 + rnd.uniform(-7, 7)
        lean = rnd.uniform(-15, 15)
        ht = rnd.uniform(15, 34)
        c.line([(x0, h - 2), (x0 + lean * 0.4, h - ht * 0.55), (x0 + lean, h - ht)], cols[i % 3], 1.9)
    return outline(c.result(), (62, 48, 28), px=0.9, soft=0.5)


def _root(rnd):
    w, h = 130, 50
    c = Canvas(w, h)
    pts = []
    y = h / 2 + rnd.uniform(-6, 6)
    for i in range(9):
        pts.append((8 + i * (w - 16) / 8, y + math.sin(i * 0.9 + rnd.uniform(0, 1)) * rnd.uniform(5, 9)))
    c.line(pts, hexrgb('#5c4630'), 6.5)
    c.line([(x, yy - 1.3) for x, yy in pts], hexrgb('#8a6c48'), 2.4)
    for x, yy in pts[2:7:2]:
        c.line([(x, yy), (x + rnd.uniform(-8, 8), yy + rnd.uniform(8, 16))], hexrgb('#5c4630'), 2.6)
    return outline(c.result(), (36, 26, 18), px=1.4, soft=0.5)


# ============================================================================ strips
def _spire(c, cx, base_y, bw, ht, lean, pal, rnd):
    """One faceted glass spire: left face lit, right face shaded, bright edge, inner crack and a pale core."""
    tip = (cx + lean, base_y - ht)
    left = [(cx - bw / 2, base_y), (cx - bw * 0.1, base_y - ht * 0.35), tip, (cx - bw * 0.04, base_y)]
    right = [(cx - bw * 0.04, base_y), tip, (cx + bw * 0.14, base_y - ht * 0.42), (cx + bw / 2, base_y)]
    c.poly(left, pal[0])
    c.poly(right, pal[1])
    c.poly([(cx - bw * 0.04, base_y), tip, (cx - bw * 0.1, base_y - ht * 0.35)], pal[2])
    c.line([(cx - bw * 0.1, base_y - ht * 0.32), tip], hexrgb('#ffffff', 215), 1.1)
    if ht > 36:
        mid = base_y - ht * rnd.uniform(0.3, 0.5)
        c.line([(cx + bw * 0.12, mid), (cx + bw * 0.02, mid - ht * 0.2), (cx + bw * 0.08, mid - ht * 0.34)], hexrgb('#5e7ca0', 150), 0.9)


def thicket_tile(w=256, h=160, seed=17):
    """A seamless row of glass spires in two depths over a low base of rubble; transparent above the spires."""
    rnd = random.Random(seed)
    c = Canvas(w, h)
    far = [hexrgb('#9fb6d8', 235), hexrgb('#7a93bc', 235), hexrgb('#c6d6f0', 235)]
    near = [hexrgb('#cfe4f4', 245), hexrgb('#8fb0d0', 245), hexrgb('#ffffff', 235)]
    lil = [hexrgb('#d6cdf2', 245), hexrgb('#9c92cc', 245), hexrgb('#f4f0ff', 235)]
    base_y = h - 8
    for pal, xs, hr in ((far, 9, (70, 108)), (None, 8, (60, 128))):
        for i in range(xs):
            x = (i + rnd.uniform(0.1, 0.9)) * w / xs
            ht = rnd.uniform(*hr)
            bw = rnd.uniform(24, 42)
            p = pal or (near if rnd.random() < 0.65 else lil)
            for dx in (-w, 0, w):
                _spire(c, x + dx, base_y - (0 if pal is None else 8), bw, ht, rnd.uniform(-7, 7), p, rnd)
    c.poly([(0, h), (0, base_y - 8)] + [(x, base_y - 8 - 7 * abs(math.sin(x / 11 + 1))) for x in range(0, w + 8, 8)] + [(w, h)], hexrgb('#b8cfe4', 245))
    img = outline(c.result(), LINE, px=1.6, soft=0.6)
    return _sparkles(img, seed + 1, 14)


def roots_tile(w=256, h=160, seed=29):
    """Tangled glass roots with a pale amber core (they thaw under Fire); seamless, transparent above."""
    rnd = random.Random(seed)
    c = Canvas(w, h)
    cols = [hexrgb('#a7cdd8', 245), hexrgb('#bdb6e2', 245), hexrgb('#93bccb', 245)]
    for i in range(9):
        x0 = rnd.uniform(0, w)
        span = rnd.uniform(70, 150)
        height = rnd.uniform(60, 135)
        thick = rnd.uniform(10, 17)
        for dx in (-w, 0, w):
            p0 = (x0 + dx, h - rnd.uniform(4, 12))
            p3 = (x0 + dx + span * rnd.choice([-1, 1]), h - rnd.uniform(4, 12))
            p1 = (p0[0] + (p3[0] - p0[0]) * 0.2, h - height * 1.05)
            p2 = (p0[0] + (p3[0] - p0[0]) * 0.8, h - height * 0.9)
            pts = [((1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t * t * p2[0] + t ** 3 * p3[0],
                    (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t * t * p2[1] + t ** 3 * p3[1]) for t in [k / 28 for k in range(29)]]
            c.line(pts, cols[i % 3], thick)
            c.line([(x - thick * 0.2, y - thick * 0.22) for x, y in pts[2:-2]], hexrgb('#f4fbfe', 215), 2.4)
            c.line(pts[3:-3], hexrgb('#f5cf8c', 120), 2.2)
            c.line([(x + thick * 0.22, y + thick * 0.24) for x, y in pts[2:-2]], hexrgb('#7ea5bc', 190), 2.0)
    c.poly([(0, h), (0, h - 14)] + [(x, h - 14 - 6 * abs(math.sin(x / 9))) for x in range(0, w + 8, 8)] + [(w, h)], hexrgb('#a8c6d8', 245))
    return _sparkles(outline(c.result(), LINE, px=1.6, soft=0.6), seed + 2, 10)


def _sparkles(img, seed, n):
    rnd = random.Random(seed)
    arr = np.asarray(img)
    ys, xs = np.nonzero(arr[:, :, 3] > 200)
    if len(xs) == 0:
        return img
    d = ImageDraw.Draw(img)
    for _ in range(n):
        i = rnd.randrange(len(xs))
        x, y, r = int(xs[i]), int(ys[i]), rnd.uniform(2.0, 4.2)
        d.polygon([(x, y - r), (x + r * 0.2, y - r * 0.2), (x + r, y), (x + r * 0.2, y + r * 0.2), (x, y + r), (x - r * 0.2, y + r * 0.2), (x - r, y), (x - r * 0.2, y - r * 0.2)], fill=(255, 255, 255, 190))
    return img


# ============================================================================ rift and garden beds (v3)
def rift_strip(W=1300, H=90, seed=6):
    """Lightning fissure through the glass: dark deep chasm, amber seam of the strike, chipped pale rims and crystal teeth."""
    rnd = random.Random(seed)
    cy = H / 2
    xs = list(range(0, W + 12, 12))
    jag = 0.0
    centre, width = [], []
    for x in xs:
        jag = max(-12, min(12, jag + rnd.uniform(-5.5, 5.5)))
        centre.append(cy + jag)
        width.append(20 + 7 * math.sin(x / 71.0) + rnd.uniform(-3.5, 3.5))
    top = [(x, c - w / 2) for x, c, w in zip(xs, centre, width)]
    bot = [(x, c + w / 2) for x, c, w in zip(xs, centre, width)]
    # halo of frost around the crack
    halo = Canvas(W, H)
    halo.poly([(x, y - 9) for x, y in top] + [(x, y + 9) for x, y in reversed(bot)], hexrgb('#e6f2fa', 170))
    halo_img = halo.result().filter(ImageFilter.GaussianBlur(4))
    c = Canvas(W, H)
    # pale chipped rim, then the chasm, then a deeper core
    c.poly([(x, y - 3.6) for x, y in top] + [(x, y + 3.6) for x, y in reversed(bot)], hexrgb('#d8eaf6'))
    c.poly(top + list(reversed(bot)), hexrgb('#1c2038'))
    c.poly([(x, y + 2.2) for x, y in top] + [(x, y - 2.2) for x, y in reversed(bot)], hexrgb('#0c0e1e'))
    # strata inside the wall of the crack
    for k in range(0, len(xs) - 2, 3):
        x, y = top[k]
        c.line([(x, y + 1), (x + 10, y + 5 + rnd.uniform(0, 2))], hexrgb('#3a4470', 170), 0.9)
    # crystal teeth growing out of both lips
    for pts, sgn in ((top, -1), (bot, 1)):
        for k in range(1, len(pts) - 1, 2):
            if rnd.random() < 0.55:
                x, y = pts[k]
                ht, bw = rnd.uniform(5, 14), rnd.uniform(3, 6)
                tipx = x + rnd.uniform(-3, 3)
                c.poly([(x - bw, y), (tipx, y + sgn * ht), (x + bw, y)], hexrgb('#cde2f2'))
                c.poly([(x, y), (tipx, y + sgn * ht), (x + bw, y)], hexrgb('#8eaed0'))
                c.line([(x - bw * 0.4, y + sgn * 1), (tipx, y + sgn * ht * 0.95)], hexrgb('#ffffff', 220), 0.8)
    # the amber seam of the strike
    seam = [(x, cc + rnd.uniform(-2.2, 2.2)) for x, cc in zip(xs, centre)]
    c.line(seam, hexrgb('#ffb347', 235), 2.4)
    c.line(seam, hexrgb('#fff0b8', 255), 0.9)
    body = c.result()
    glowl = Canvas(W, H)
    glowl.line(seam, hexrgb('#ffa030', 255), 5)
    g = glowl.result().filter(ImageFilter.GaussianBlur(5))
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.alpha_composite(halo_img)
    out = outline(out, (255, 255, 255), px=0, soft=0) if False else out
    out.alpha_composite(outline(body, LINE, px=1.6, soft=0.6))
    out.alpha_composite(g)
    return _sparkles(out, seed + 3, 40)


def garden_bed(kind, W=190, H=126):
    """A round raised bed ringed with river stones; loam, sprigs of moss, and what grows there (leaf / bark / spark / moon)."""
    import ch3_props as P
    from ch3_trees import sapling
    from ch3_lib import glow, gradient_map, trim
    rnd = random.Random({'leaf': 1, 'bark': 2, 'spark': 3, 'moon': 4}[kind])
    cx, cy = W / 2, H - 36
    rx, ry = 80, 27
    out = Canvas(W, H)
    out.ellipse(cx + 3, cy + 12, rx + 12, ry + 8, hexrgb('#000000', 78))
    # back stones, soil, plants, front stones: so the bed reads as having a front and a back
    def ring(front):
        stones = []
        n = 17
        for i in range(n):
            ang = 2 * math.pi * i / n + rnd.uniform(-0.12, 0.12)
            if (math.sin(ang) >= 0) == front:
                stones.append(ang)
        c = Canvas(W, H)
        for ang in stones:
            sx = cx + (rx + 3) * math.cos(ang)
            sy = cy + (ry + 2) * math.sin(ang)
            w, h = rnd.uniform(11, 15), rnd.uniform(7.5, 10)
            tone = rnd.choice(['#aab6c4', '#bdc8d4', '#98a6b8', '#b4bcd0'])
            c.ellipse(sx + 1, sy + 2.4, w, h, hexrgb('#1c2430', 120))
            c.ellipse(sx, sy, w, h, hexrgb(tone))
            c.ellipse(sx - w * 0.22, sy - h * 0.3, w * 0.55, h * 0.4, hexrgb('#eef6fc', 215))
            c.ellipse(sx + w * 0.28, sy + h * 0.32, w * 0.5, h * 0.3, hexrgb('#7a8aa2', 150))
        return outline(c.result(), (40, 48, 64), px=1.4, soft=0.5)
    out_img = out.result()
    out_img.alpha_composite(ring(False))
    soil = Canvas(W, H)
    soil.ellipse(cx, cy, rx - 4, ry - 2, hexrgb('#46332a'))
    soil.ellipse(cx, cy - 2, rx - 10, ry - 7, hexrgb('#5c4636'))
    soil.ellipse(cx - 12, cy - 5, rx * 0.5, ry * 0.4, hexrgb('#7a6048', 170))
    for _ in range(26):
        a, r = rnd.uniform(0, 2 * math.pi), math.sqrt(rnd.random())
        px, py = cx + (rx - 14) * r * math.cos(a), cy + (ry - 8) * r * math.sin(a)
        soil.ellipse(px, py, rnd.uniform(1.0, 2.0), rnd.uniform(0.7, 1.3), hexrgb(rnd.choice(['#2e211a', '#8a6e52', '#6e5a3e'])))
    for _ in range(9):                                     # moss tufts at the rim
        a = rnd.uniform(0, 2 * math.pi)
        px, py = cx + (rx - 10) * math.cos(a), cy + (ry - 5) * math.sin(a)
        for k in range(3):
            soil.line([(px + k * 2 - 2, py), (px + k * 2 - 2 + rnd.uniform(-1.5, 1.5), py - rnd.uniform(3, 6))], hexrgb('#7aa860'), 1.2)
    out_img.alpha_composite(soil.result())
    plants = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    base_y = int(cy + 2)

    def put(sp, dx, bottom=0, dy=0):
        plants.alpha_composite(sp, (int(cx + dx - sp.width / 2), int(base_y + dy - sp.height + bottom)))
    if kind == 'leaf':
        sp = trim(P.glass_sprig(), 1)
        for dx, hh, dy in ((-38, 54, 3), (2, 68, 6), (40, 56, 3)):
            put(P.fit_h(sp, hh), dx, 6, dy)
    elif kind == 'bark':
        sp = trim(sapling(seed=7, w=120, h=150), 1)
        put(P.fit_h(sp, 76), -14, 8, 4)
        put(P.fit_h(sp, 58), 38, 8, 7)
    elif kind == 'spark':
        c = Canvas(W, H)
        for dx, dy, r in [(-46, 38, 6.5), (-22, 52, 8), (4, 62, 9), (30, 46, 7), (52, 32, 6), (-6, 36, 5)]:
            x0 = cx + dx
            c.line([(x0, base_y + 6), (x0 + rnd.uniform(-3, 3), base_y - dy + 6), (x0 + rnd.uniform(-2, 2), base_y - dy)], hexrgb('#6f9a52'), 2.2)
            c.poly([(x0, base_y - dy * 0.4), (x0 - 9, base_y - dy * 0.4 - 4), (x0 - 2, base_y - dy * 0.4 + 2)], hexrgb('#86b266'))
            c.ellipse(x0, base_y - dy, r + 2.2, r + 2.2, hexrgb('#ffe9b4', 240))
            c.ellipse(x0 - 1.2, base_y - dy - 1.2, r * 0.5, r * 0.5, hexrgb('#ffffff'))
        plants = glow(outline(c.result(), (70, 50, 24), px=1, soft=0.4), (255, 200, 110), radius=8, strength=0.9)
    else:
        cr = P.src('chapter2/ice_crystal.webp')
        cr = gradient_map(cr, [(0, (46, 40, 90)), (0.5, (160, 150, 232)), (1, (250, 246, 255))], amount=0.9)
        cr = trim(cr, 1)
        put(P.fit_h(cr, 64), 6, 8, 3)
        put(P.fit_h(cr, 40), -34, 8, 6)
        put(P.fit_h(cr, 30), 44, 8, 8)
        plants = glow(plants, (190, 170, 255), radius=7, strength=0.7)
    out_img.alpha_composite(plants)
    out_img.alpha_composite(ring(True))
    return trim(out_img, 1)
