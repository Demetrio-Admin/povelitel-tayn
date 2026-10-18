"""Shared helpers for the chapter III prototype art (tools/art/ch3_grove_art.py).

Everything is drawn in code: PIL + numpy, supersampled 4x and reduced with a box filter for clean edges.
Sprites keep the project convention: transparent background, bottom-centre pivot, dark warm outline.
"""
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 4  # supersampling factor


def hexrgb(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(len(c1)))


class Canvas:
    """A supersampled RGBA layer. Coordinates are in final pixels; drawing happens at SS scale."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def s(self, v):
        return v * SS

    def pts(self, pts):
        return [(x * SS, y * SS) for x, y in pts]

    def poly(self, pts, fill, outline=None, width=0):
        self.d.polygon(self.pts(pts), fill=fill, outline=outline, width=int(width * SS) if width else 0)

    def line(self, pts, fill, width):
        p = self.pts(pts)
        self.d.line(p, fill=fill, width=max(1, int(width * SS)), joint='curve')
        r = width * SS / 2
        for (x, y) in (p[0], p[-1]):
            self.d.ellipse((x - r, y - r, x + r, y + r), fill=fill)

    def ellipse(self, cx, cy, rx, ry, fill, outline=None, width=0):
        self.d.ellipse((self.s(cx - rx), self.s(cy - ry), self.s(cx + rx), self.s(cy + ry)), fill=fill, outline=outline, width=int(width * SS) if width else 0)

    def rotated_ellipse(self, cx, cy, rx, ry, ang, fill, n=18):
        pts = []
        ca, sa = math.cos(ang), math.sin(ang)
        for i in range(n):
            t = 2 * math.pi * i / n
            x, y = rx * math.cos(t), ry * math.sin(t)
            pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
        self.poly(pts, fill)

    def layer(self, other):
        self.img.alpha_composite(other.img)

    def result(self):
        return self.img.resize((self.w, self.h), Image.LANCZOS)


def alpha_of(img):
    return np.asarray(img)[:, :, 3].astype(np.float32) / 255.0


def outline(img, color=(42, 32, 30), px=2.0, soft=0.6):
    """Dark contour behind the sprite: dilated alpha, slightly blurred."""
    a = img.split()[3]
    big = a.filter(ImageFilter.MaxFilter(int(px) * 2 + 1)) if px >= 1 else a
    if soft:
        big = big.filter(ImageFilter.GaussianBlur(soft))
    base = Image.new('RGBA', img.size, color + (0,))
    base.putalpha(big)
    base.alpha_composite(img)
    return base


def glow(img, color, radius=8, strength=0.6):
    a = img.split()[3].filter(ImageFilter.GaussianBlur(radius))
    a = a.point(lambda v: int(v * strength))
    base = Image.new('RGBA', img.size, color + (0,))
    base.putalpha(a)
    base.alpha_composite(img)
    return base


def pad(img, l=0, t=0, r=0, b=0):
    out = Image.new('RGBA', (img.width + l + r, img.height + t + b), (0, 0, 0, 0))
    out.alpha_composite(img, (l, t))
    return out


def trim(img, margin=2):
    bbox = img.split()[3].point(lambda v: 255 if v > 6 else 0).getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - margin), max(0, y0 - margin)
    x1, y1 = min(img.width, x1 + margin), min(img.height, y1 + margin)
    return img.crop((x0, y0, x1, y1))


def gradient_map(img, stops, keep_alpha=True, amount=1.0):
    """Recolour by luminance through colour stops [(t, (r,g,b)), ...]."""
    arr = np.asarray(img.convert('RGBA')).astype(np.float32)
    rgb, a = arr[:, :, :3], arr[:, :, 3:4]
    lum = (0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]) / 255.0
    ts = np.array([s[0] for s in stops], np.float32)
    cs = np.array([s[1] for s in stops], np.float32)
    out = np.zeros_like(rgb)
    for ch in range(3):
        out[:, :, ch] = np.interp(lum, ts, cs[:, ch])
    out = rgb * (1 - amount) + out * amount
    res = np.concatenate([np.clip(out, 0, 255), a], axis=2).astype(np.uint8)
    return Image.fromarray(res, 'RGBA')


def hue_mask(img, hmin, hmax, smin=0.15, vmin=0.1):
    """Mask (0..1) of pixels whose hue (0..360) lies in [hmin, hmax] (wraps)."""
    arr = np.asarray(img.convert('RGBA')).astype(np.float32) / 255.0
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mx, mn = np.max(arr[:, :, :3], axis=2), np.min(arr[:, :, :3], axis=2)
    d = mx - mn + 1e-6
    h = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, d / (mx + 1e-6), 0)
    inside = (h >= hmin) & (h <= hmax) if hmin <= hmax else ((h >= hmin) | (h <= hmax))
    return (inside & (s >= smin) & (mx >= vmin)).astype(np.float32)


def blend_masked(img, other, mask):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    b = np.asarray(other.convert('RGBA')).astype(np.float32)
    m = mask[:, :, None]
    out = a.copy()
    out[:, :, :3] = a[:, :, :3] * (1 - m) + b[:, :, :3] * m
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')


def glassify(img, tint=(196, 228, 236), deep=(70, 104, 122), light=(255, 255, 255), alpha=0.86, inner=None, seed=3, streaks=True):
    """Turn an illustrated sprite into 'glass': luminance mapped to a cold palette, body slightly see-through,
    dark contour kept, white specular streaks. inner — optional warm glow colour inside (frozen fire)."""
    src = img.convert('RGBA')
    arr = np.asarray(src).astype(np.float32)
    lum = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]) / 255.0
    a = arr[:, :, 3] / 255.0
    stops_t = np.array([0.0, 0.18, 0.5, 0.82, 1.0], np.float32)
    dark = np.array([34, 40, 52], np.float32)
    cols = np.array([dark, deep, tint, mix(tint, light, 0.55)[:3], light], np.float32)
    out = np.zeros(arr.shape[:2] + (3,), np.float32)
    for ch in range(3):
        out[:, :, ch] = np.interp(lum, stops_t, cols[:, ch])
    # interior transparency: outlines (dark) stay opaque, bright interior lets the ground show through a little
    trans = np.clip((lum - 0.25) / 0.6, 0, 1)
    na = a * (1 - (1 - alpha) * trans)
    res = np.concatenate([out, (na * 255)[:, :, None]], axis=2)
    im = Image.fromarray(np.clip(res, 0, 255).astype(np.uint8), 'RGBA')
    if inner is not None:
        # warm core: a blurred, shrunken alpha mask tinted with the glow colour, composited with 'screen'-ish add
        core = src.split()[3].filter(ImageFilter.MinFilter(int(max(3, min(src.size) * 0.12)) | 1)).filter(ImageFilter.GaussianBlur(min(src.size) * 0.06))
        c = np.asarray(core).astype(np.float32) / 255.0 * 0.55
        base = np.asarray(im).astype(np.float32)
        for ch in range(3):
            base[:, :, ch] = base[:, :, ch] + (np.array(inner, np.float32)[ch] - base[:, :, ch]) * c * (0.6 + 0.4 * (1 - lum))
        im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), 'RGBA')
    if streaks:
        im = specular(im, seed=seed)
    return im


def specular(img, seed=1, count=None, width=0.035, strength=0.55):
    """Diagonal white streaks clipped to the sprite: the classic 'glass' read."""
    w, h = img.size
    rnd = random.Random(seed)
    layer = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(layer)
    n = count or max(2, int(min(w, h) / 70))
    for _ in range(n):
        x0 = rnd.uniform(-0.2, 0.9) * w
        y0 = rnd.uniform(0.0, 0.8) * h
        L = rnd.uniform(0.15, 0.4) * min(w, h)
        ww = max(1, int(min(w, h) * width * rnd.uniform(0.5, 1.2)))
        d.line((x0, y0, x0 + L * 0.55, y0 - L), fill=int(255 * strength * rnd.uniform(0.6, 1)), width=ww)
    layer = layer.filter(ImageFilter.GaussianBlur(max(1, min(w, h) * 0.008)))
    a = img.split()[3]
    inner = a.filter(ImageFilter.MinFilter(5))
    sp = np.minimum(np.asarray(layer).astype(np.float32), np.asarray(inner).astype(np.float32)) / 255.0
    arr = np.asarray(img).astype(np.float32)
    for ch in range(3):
        arr[:, :, ch] = arr[:, :, ch] + (255 - arr[:, :, ch]) * sp
    arr[:, :, 3] = np.maximum(arr[:, :, 3], sp * 255 * (np.asarray(a) > 0))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def tileable_noise(size, scale, seed, octaves=4):
    """Seamless value noise (sum of random-phase sinusoids on a torus)."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size * 2 * np.pi
    out = np.zeros((size, size), np.float32)
    amp = 1.0
    for o in range(octaves):
        f = scale * (2 ** o)
        for _ in range(6):
            kx, ky = rng.integers(-f, f + 1), rng.integers(-f, f + 1)
            if kx == 0 and ky == 0:
                continue
            ph = rng.uniform(0, 2 * np.pi)
            out += amp * np.sin(kx * x + ky * y + ph)
        amp *= 0.5
    out -= out.min()
    out /= out.max() + 1e-6
    return out


def save_webp(img, path, quality=88):
    img.save(path, 'WEBP', quality=quality, method=6, exact=True)
