#!/usr/bin/env python3
"""Walkable-town environment pieces for chapter II (v0.37.0).

Generates the lawn, light stone walls, low fences, compact town trees and
small yard props that sit between the approved witch facades. Everything is
drawn procedurally at 3x and reduced, with the same dark plum outline and
muted autumn palette as the facade atlases. Output: public/assets/city-walk.

Run: python3 tools/art/city-walk-art.py
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'city-walk')
os.makedirs(OUT, exist_ok=True)
SS = 3  # supersampling
OUTLINE = (43, 30, 34, 255)


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def save(img, name, size=None):
    if size:
        img = img.resize(size, Image.LANCZOS)
    path = os.path.join(OUT, name + '.webp')
    img.save(path, 'WEBP', quality=92, method=6)
    print('wrote', os.path.relpath(path, ROOT), img.size)


def periodic_noise(w, h, scale, seed):
    """Tileable smooth noise in [0,1] (low-pass filtered white noise in Fourier space)."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    filt = np.exp(-(f * scale) ** 2)
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * filt))
    out -= out.min()
    out /= max(out.max(), 1e-9)
    return out


# --------------------------------------------------------------------------- lawn
def lawn():
    W = H = 512
    base = np.array(hexc('#647d4f')[:3], dtype=float)
    sage = np.array(hexc('#7a8f63')[:3], dtype=float)
    moss = np.array(hexc('#556f43')[:3], dtype=float)
    warm = np.array(hexc('#7d8350')[:3], dtype=float)
    n1 = periodic_noise(W, H, 28, 11)
    n2 = periodic_noise(W, H, 9, 12)
    n3 = periodic_noise(W, H, 60, 13)
    img = base[None, None, :] * np.ones((H, W, 1))
    img = img + (sage - base)[None, None, :] * (np.clip(n1 - 0.45, 0, 1) * 1.3)[:, :, None]
    img = img + (moss - base)[None, None, :] * (np.clip(0.55 - n1, 0, 1) * 1.2)[:, :, None]
    img = img + (warm - base)[None, None, :] * (np.clip(n3 - 0.62, 0, 1) * 1.4)[:, :, None]
    img = img + ((n2 - 0.5) * 9)[:, :, None]
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')
    # Short, low strokes; drawn on a 3x3 wrapped canvas so the tile stays seamless.
    big = Image.new('RGBA', (W * 3, H * 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    rnd = random.Random(7)
    for _ in range(5200):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        light = rnd.random() < 0.55
        col = hexc('#87a06c', rnd.randint(40, 85)) if light else hexc('#45603a', rnd.randint(40, 80))
        ln = rnd.uniform(2.5, 5.5)
        ang = -math.pi / 2 + rnd.uniform(-0.6, 0.6)
        for ox in (0, W, 2 * W):
            for oy in (0, H, 2 * H):
                d.line([(x + ox, y + oy), (x + ox + math.cos(ang) * ln, y + oy + math.sin(ang) * ln)], fill=col, width=1)
    # A few clover rosettes and tiny daisies: tended, not wild.
    for _ in range(26):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        col = hexc('#e9e3c8', 150) if rnd.random() < 0.6 else hexc('#d9c271', 140)
        for ox in (0, W, 2 * W):
            for oy in (0, H, 2 * H):
                d.ellipse([x + ox - 1.2, y + oy - 1.2, x + ox + 1.2, y + oy + 1.2], fill=col)
    for _ in range(60):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        for ox in (0, W, 2 * W):
            for oy in (0, H, 2 * H):
                for k in range(3):
                    a = k * 2.1 + rnd.random()
                    d.ellipse([x + ox + math.cos(a) * 2 - 1.6, y + oy + math.sin(a) * 2 - 1.6,
                               x + ox + math.cos(a) * 2 + 1.6, y + oy + math.sin(a) * 2 + 1.6], fill=hexc('#7f9a64', 70))
    strokes = big.crop((W, H, 2 * W, 2 * H))
    im = im.convert('RGBA')
    im.alpha_composite(strokes)
    save(im.convert('RGB'), 'lawn')


# --------------------------------------------------------------------------- stone
STONE = [hexc('#cfc3a3'), hexc('#c4b796'), hexc('#d8cdb0'), hexc('#bcae8d'), hexc('#c9bea2')]
MORTAR = hexc('#8a7d66')


def stone_block(d, box, col, rnd):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius=3 * SS, fill=col)
    # top light, bottom shade
    d.line([(x0 + 3 * SS, y0 + 2 * SS), (x1 - 3 * SS, y0 + 2 * SS)], fill=mix(col, (255, 250, 232, 255), 0.45), width=2 * SS)
    d.line([(x0 + 3 * SS, y1 - 2 * SS), (x1 - 3 * SS, y1 - 2 * SS)], fill=mix(col, (70, 60, 50, 255), 0.35), width=2 * SS)
    for _ in range(int((x1 - x0) * (y1 - y0) / (SS * SS * 60))):
        px, py = rnd.uniform(x0 + 3 * SS, x1 - 3 * SS), rnd.uniform(y0 + 3 * SS, y1 - 3 * SS)
        r = rnd.uniform(0.6, 1.6) * SS
        d.ellipse([px - r, py - r, px + r, py + r], fill=mix(col, (90, 80, 64, 255), rnd.uniform(0.1, 0.25)))


def wall_face():
    """Low town wall seen from the front; tiles horizontally (256 px)."""
    W, H = 256 * SS, 112 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(21)
    cap_h = 22 * SS
    body_top = cap_h - 4 * SS
    d.rectangle([0, body_top, W, H], fill=MORTAR)
    rows = [(body_top + 2 * SS, 30 * SS), (body_top + 34 * SS, 28 * SS), (body_top + 64 * SS, H - body_top - 66 * SS)]
    for ri, (y, h) in enumerate(rows):
        x = -(ri % 2) * 32 * SS
        while x < W:
            bw = rnd.choice([52, 60, 64, 72]) * SS
            if x + bw > W - 18 * SS and x < W:  # close the row exactly at the tile edge
                bw = W - x
            stone_block(d, (x + 2 * SS, y, x + bw - 2 * SS, y + h - 3 * SS), rnd.choice(STONE), rnd)
            x += bw
    # capstones with a soft overhang shadow
    d.rectangle([0, cap_h - 2 * SS, W, cap_h + 5 * SS], fill=(84, 72, 60, 150))
    x = 0
    while x < W:
        bw = 64 * SS
        stone_block(d, (x + 1 * SS, 2 * SS, x + bw - 1 * SS, cap_h), mix(rnd.choice(STONE), (245, 238, 214, 255), 0.25), rnd)
        x += bw
    # grime and moss along the foot
    for _ in range(140):
        px = rnd.uniform(0, W)
        py = H - rnd.uniform(0, 16 * SS)
        r = rnd.uniform(1, 3.5) * SS
        d.ellipse([px - r, py - r, px + r, py + r], fill=hexc('#6c7a4d', rnd.randint(60, 140)))
    d.line([(0, 1 * SS), (W, 1 * SS)], fill=OUTLINE, width=2 * SS)
    d.line([(0, H - 1 * SS), (W, H - 1 * SS)], fill=(54, 44, 38, 200), width=2 * SS)
    save(im, 'wall_face', (256, 112))


def wall_top():
    """Wall cap seen from above for walls running north–south; tiles vertically."""
    W, H = 64 * SS, 256 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(31)
    d.rectangle([0, 0, W, H], fill=MORTAR)
    y = 0
    while y < H:
        bh = 64 * SS
        stone_block(d, (4 * SS, y + 2 * SS, W - 10 * SS, y + bh - 2 * SS), mix(rnd.choice(STONE), (245, 238, 214, 255), 0.2), rnd)
        y += bh
    d.rectangle([W - 10 * SS, 0, W, H], fill=(96, 84, 68, 255))  # sunlit face falls away to the east
    d.line([(1 * SS, 0), (1 * SS, H)], fill=OUTLINE, width=2 * SS)
    d.line([(W - 1 * SS, 0), (W - 1 * SS, H)], fill=OUTLINE, width=2 * SS)
    save(im, 'wall_top', (64, 256))


def wall_post():
    W, H = 52 * SS, 112 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(41)
    body = (6 * SS, 28 * SS, W - 6 * SS, H - 3 * SS)
    d.rounded_rectangle(body, radius=3 * SS, fill=OUTLINE)
    inner = (body[0] + 2 * SS, body[1] + 2 * SS, body[2] - 2 * SS, body[3] - 2 * SS)
    d.rectangle(inner, fill=MORTAR)
    y = inner[1]
    for i in range(3):
        h = (inner[3] - inner[1]) / 3
        stone_block(d, (inner[0] + 1 * SS, y + 1 * SS, inner[2] - 1 * SS, y + h - 1 * SS), rnd.choice(STONE), rnd)
        y += h
    d.rectangle([inner[2] - 9 * SS, inner[1], inner[2], inner[3]], fill=(110, 96, 78, 140))
    # pyramid cap
    cap = [(2 * SS, 30 * SS), (W / 2, 6 * SS), (W - 2 * SS, 30 * SS)]
    d.polygon(cap, fill=OUTLINE)
    d.polygon([(5 * SS, 28 * SS), (W / 2, 9 * SS), (W - 5 * SS, 28 * SS)], fill=hexc('#ddd3b8'))
    d.polygon([(W / 2, 9 * SS), (W - 5 * SS, 28 * SS), (W / 2, 28 * SS)], fill=hexc('#b9ab8b'))
    d.ellipse([W / 2 - 4 * SS, 2 * SS, W / 2 + 4 * SS, 10 * SS], fill=hexc('#a88a4e'), outline=OUTLINE, width=SS)
    save(im, 'wall_post', (52, 112))


# --------------------------------------------------------------------------- fences
def fence_iron():
    W, H = 256 * SS, 72 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    iron, hi = hexc('#2f2a33'), hexc('#6a6371')
    # rails
    for y in (24 * SS, 52 * SS):
        d.rectangle([0, y, W, y + 4 * SS], fill=iron)
        d.line([(0, y + SS), (W, y + SS)], fill=hi, width=SS)
    # bars with spear tips
    for i in range(16):
        x = i * 16 * SS + 8 * SS
        d.rectangle([x - 1.5 * SS, 14 * SS, x + 1.5 * SS, H - 4 * SS], fill=iron)
        d.polygon([(x - 4 * SS, 16 * SS), (x, 6 * SS), (x + 4 * SS, 16 * SS)], fill=iron)
        d.line([(x - 0.5 * SS, 16 * SS), (x - 0.5 * SS, H - 6 * SS)], fill=hi, width=SS)
    # decorative scrolls between rails
    for i in range(8):
        cx = i * 32 * SS + 16 * SS
        d.arc([cx - 7 * SS, 30 * SS, cx + 7 * SS, 46 * SS], 200, 340, fill=iron, width=2 * SS)
    # posts every 128 px
    for x in (0, 128 * SS):
        d.rectangle([x, 4 * SS, x + 7 * SS, H], fill=iron)
        d.ellipse([x - 2 * SS, 0, x + 9 * SS, 9 * SS], fill=hexc('#a88a4e'), outline=OUTLINE, width=SS)
    im.alpha_composite(Image.new('RGBA', (W, H), (0, 0, 0, 0)))
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([0, H - 6 * SS, W, H], fill=(20, 30, 16, 90))
    shadow.alpha_composite(im)
    save(shadow, 'fence_iron', (256, 72))


def fence_wood():
    W, H = 256 * SS, 72 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(51)
    d.rectangle([0, H - 6 * SS, W, H], fill=(20, 30, 16, 80))
    for y in (26 * SS, 50 * SS):
        d.rectangle([0, y - SS, W, y + 6 * SS], fill=OUTLINE)
        d.rectangle([0, y, W, y + 5 * SS], fill=hexc('#8c6a48'))
        d.line([(0, y + SS), (W, y + SS)], fill=hexc('#b38e64'), width=SS)
    for i in range(10):
        x = i * 25.6 * SS + 3 * SS
        w = 17 * SS
        col = mix(hexc('#a7845b'), hexc('#8a6b4a'), rnd.random())
        top = (10 + rnd.uniform(-1.5, 1.5)) * SS
        d.rounded_rectangle([x - SS, top - SS, x + w + SS, H - 5 * SS], radius=7 * SS, fill=OUTLINE)
        d.rounded_rectangle([x, top, x + w, H - 6 * SS], radius=7 * SS, fill=col)
        d.line([(x + 4 * SS, top + 5 * SS), (x + 4 * SS, H - 10 * SS)], fill=mix(col, (255, 236, 200, 255), 0.35), width=SS)
        d.line([(x + w - 3 * SS, top + 6 * SS), (x + w - 3 * SS, H - 9 * SS)], fill=mix(col, (50, 34, 24, 255), 0.4), width=SS)
    save(im, 'fence_wood', (256, 72))


# --------------------------------------------------------------------------- trees
def blob_crown(d, cx, cy, rx, ry, palette, rnd, lobes=11):
    """Rounded crown built from overlapping lobes: dark outline, shaded body, lit upper-left, leaf dabs."""
    shade, base, light, accent = palette
    deep = mix(shade, (24, 18, 22, 255), 0.35)
    circles = [(cx, cy + ry * 0.05, min(rx, ry) * 0.72)]
    for i in range(lobes):
        a = i / lobes * math.tau + rnd.uniform(-0.12, 0.12)
        rr = min(rx, ry) * rnd.uniform(0.36, 0.46)
        circles.append((cx + math.cos(a) * (rx - rr) * 0.98, cy + math.sin(a) * (ry - rr) * 0.98, rr))
    for (x, y, r) in circles:  # outline
        d.ellipse([x - r - 3 * SS, y - r - 3 * SS, x + r + 3 * SS, y + r + 3 * SS], fill=OUTLINE)
    for (x, y, r) in circles:  # deep shadow body
        d.ellipse([x - r, y - r, x + r, y + r], fill=deep)
    for (x, y, r) in circles:  # mid shade, slightly up-left
        ox, oy = x - r * 0.08, y - r * 0.12
        d.ellipse([ox - r * 0.9, oy - r * 0.9, ox + r * 0.9, oy + r * 0.9], fill=shade)
    for (x, y, r) in circles:  # lit body toward the upper-left light
        if y > cy + ry * 0.45:
            continue
        ox, oy = x - r * 0.2, y - r * 0.26
        d.ellipse([ox - r * 0.72, oy - r * 0.72, ox + r * 0.72, oy + r * 0.72], fill=base)
    for (x, y, r) in circles:  # crisp highlights on the upper lobes
        if y > cy - ry * 0.1 or x > cx + rx * 0.4:
            continue
        ox, oy = x - r * 0.28, y - r * 0.34
        d.ellipse([ox - r * 0.4, oy - r * 0.34, ox + r * 0.4, oy + r * 0.34], fill=light)
    for _ in range(int(rx * ry / (SS * SS * 9))):  # leaf dabs
        a = rnd.uniform(0, math.tau)
        rr = math.sqrt(rnd.random()) * 0.86
        x, y = cx + math.cos(a) * rx * rr, cy + math.sin(a) * ry * rr
        t = ((x - cx) / rx + (y - cy) / ry) / 2  # <0 toward the upper-left light
        col = light if t < -0.28 else base if t < 0.12 else shade
        if rnd.random() < 0.05:
            col = accent
        r = rnd.uniform(1.3, 2.5) * SS
        d.ellipse([x - r, y - r * 0.75, x + r, y + r * 0.75], fill=col)


def city_tree(name, palette, crown, seed, columnar=False):
    W, H = 110 * SS, 170 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(seed)
    cx = W / 2
    ground = H - 8 * SS
    # soft crown shadow on the lawn, then the stone tree ring with dark soil
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([cx - crown[2] * 0.8, ground - 16 * SS, cx + crown[2] * 1.05, ground + 9 * SS], fill=(18, 26, 14, 95))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(4 * SS)))
    d = ImageDraw.Draw(im)
    d.ellipse([cx - 26 * SS, ground - 10 * SS, cx + 26 * SS, ground + 7 * SS], fill=OUTLINE)
    d.ellipse([cx - 24 * SS, ground - 8 * SS, cx + 24 * SS, ground + 5 * SS], fill=hexc('#bdb091'))
    d.ellipse([cx - 18 * SS, ground - 5 * SS, cx + 18 * SS, ground + 2 * SS], fill=hexc('#4a3a2c'))
    for _ in range(14):
        a = rnd.uniform(0, math.tau)
        d.ellipse([cx + math.cos(a) * 21 * SS - 1.5 * SS, ground - 1.5 * SS + math.sin(a) * 6.5 * SS - 1.5 * SS,
                   cx + math.cos(a) * 21 * SS + 1.5 * SS, ground - 1.5 * SS + math.sin(a) * 6.5 * SS + 1.5 * SS], fill=hexc('#8f8268'))
    # slim trunk
    top = crown[1] + crown[3] * 0.3
    trunk = [(cx - 4.5 * SS, ground - 2 * SS), (cx - 3 * SS, top), (cx + 3 * SS, top), (cx + 4.5 * SS, ground - 2 * SS)]
    d.polygon([(x + (-1 if i < 2 else 1) * 2 * SS, y) for i, (x, y) in enumerate(trunk)], fill=OUTLINE)
    d.polygon(trunk, fill=hexc('#6e4e3a'))
    d.line([(cx - 1.5 * SS, ground - 4 * SS), (cx - 1 * SS, top + 4 * SS)], fill=hexc('#9a7458'), width=SS)
    # two thin branches into the crown
    for side in (-1, 1):
        d.line([(cx, top + 18 * SS), (cx + side * 12 * SS, top - 4 * SS)], fill=OUTLINE, width=4 * SS)
        d.line([(cx, top + 18 * SS), (cx + side * 12 * SS, top - 4 * SS)], fill=hexc('#6e4e3a'), width=2 * SS)
    ccx, ccy, rx, ry = cx, crown[1], crown[2], crown[3]
    blob_crown(d, ccx, ccy, rx, ry, palette, rnd, lobes=9 if columnar else 12)
    im = im.filter(ImageFilter.SMOOTH)
    save(im, name, (110, 170))


# --------------------------------------------------------------------------- small props
def hedge():
    W, H = 128 * SS, 70 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(61)
    d.ellipse([6 * SS, H - 16 * SS, W - 6 * SS, H - 2 * SS], fill=(24, 34, 20, 110))
    box = [6 * SS, 10 * SS, W - 6 * SS, H - 8 * SS]
    d.rounded_rectangle([box[0] - 3 * SS, box[1] - 3 * SS, box[2] + 3 * SS, box[3] + 3 * SS], radius=18 * SS, fill=OUTLINE)
    d.rounded_rectangle(box, radius=16 * SS, fill=hexc('#4f6a42'))
    d.rounded_rectangle([box[0], box[1], box[2], box[1] + 24 * SS], radius=14 * SS, fill=hexc('#6b8655'))
    for _ in range(260):
        x = rnd.uniform(box[0] + 5 * SS, box[2] - 5 * SS)
        y = rnd.uniform(box[1] + 3 * SS, box[3] - 4 * SS)
        top = y < box[1] + 22 * SS
        col = hexc('#8aa36d') if top and rnd.random() < 0.6 else (hexc('#5d7a4c') if top else hexc('#435c39'))
        r = rnd.uniform(1.8, 3.4) * SS
        d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=col)
    save(im, 'hedge', (128, 70))


def flowerbed(name, colors, seed, rim='#bfb293'):
    W, H = 140 * SS, 76 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(seed)
    box = [6 * SS, 26 * SS, W - 6 * SS, H - 6 * SS]
    d.ellipse([box[0] - 3 * SS, box[1] - 3 * SS, box[2] + 3 * SS, box[3] + 3 * SS], fill=OUTLINE)
    d.ellipse(box, fill=hexc(rim))
    d.ellipse([box[0] + 7 * SS, box[1] + 5 * SS, box[2] - 7 * SS, box[3] - 6 * SS], fill=hexc('#4b3b2d'))
    for _ in range(26):
        a = rnd.uniform(0, math.tau)
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        rx, ry = (box[2] - box[0]) / 2, (box[3] - box[1]) / 2
        d.ellipse([cx + math.cos(a) * rx * 0.94 - 2 * SS, cy + math.sin(a) * ry * 0.9 - 2 * SS,
                   cx + math.cos(a) * rx * 0.94 + 2 * SS, cy + math.sin(a) * ry * 0.9 + 2 * SS], fill=hexc('#958870'))
    # foliage tufts and blooms rising above the rim
    cx = W / 2
    for i in range(16):
        x = rnd.uniform(box[0] + 16 * SS, box[2] - 16 * SS)
        y = rnd.uniform(box[1] + 6 * SS, box[3] - 12 * SS)
        h = rnd.uniform(14, 26) * SS
        d.ellipse([x - 9 * SS, y - h, x + 9 * SS, y + 3 * SS], fill=OUTLINE)
        d.ellipse([x - 7.5 * SS, y - h + 1.5 * SS, x + 7.5 * SS, y + 1.5 * SS], fill=hexc('#5a7a46'))
        d.ellipse([x - 5 * SS, y - h + 3 * SS, x + 3 * SS, y - h * 0.4], fill=hexc('#7c9a5f'))
    for _ in range(46):
        x = rnd.uniform(box[0] + 14 * SS, box[2] - 14 * SS)
        y = rnd.uniform(box[1] - 10 * SS, box[3] - 18 * SS)
        col = hexc(rnd.choice(colors))
        r = rnd.uniform(2.2, 3.6) * SS
        d.ellipse([x - r - SS, y - r - SS, x + r + SS, y + r + SS], fill=OUTLINE)
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)
        d.ellipse([x - r * 0.35, y - r * 0.35, x + r * 0.35, y + r * 0.35], fill=mix(col, (255, 246, 210, 255), 0.6))
    save(im, name, (140, 76))


def planter():
    W, H = 96 * SS, 76 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(71)
    d.ellipse([8 * SS, H - 12 * SS, W - 8 * SS, H - 1 * SS], fill=(22, 30, 18, 110))
    box = [10 * SS, 34 * SS, W - 10 * SS, H - 5 * SS]
    # plants first, the box covers their stems
    for i in range(9):
        x = rnd.uniform(box[0] + 8 * SS, box[2] - 8 * SS)
        h = rnd.uniform(18, 30) * SS
        d.ellipse([x - 10 * SS, box[1] - h, x + 10 * SS, box[1] + 6 * SS], fill=OUTLINE)
        d.ellipse([x - 8.5 * SS, box[1] - h + 1.5 * SS, x + 8.5 * SS, box[1] + 4 * SS], fill=hexc('#5c7b47'))
        d.ellipse([x - 6 * SS, box[1] - h + 3 * SS, x + 2 * SS, box[1] - h * 0.35], fill=hexc('#80a062'))
    for _ in range(16):
        x = rnd.uniform(box[0] + 6 * SS, box[2] - 6 * SS)
        y = box[1] - rnd.uniform(4, 26) * SS
        col = hexc(rnd.choice(['#d58a4a', '#e2c070', '#c9746e']))
        d.ellipse([x - 3.6 * SS, y - 3.6 * SS, x + 3.6 * SS, y + 3.6 * SS], fill=OUTLINE)
        d.ellipse([x - 2.6 * SS, y - 2.6 * SS, x + 2.6 * SS, y + 2.6 * SS], fill=col)
    d.rectangle([box[0] - 2 * SS, box[1] - 2 * SS, box[2] + 2 * SS, box[3] + 2 * SS], fill=OUTLINE)
    d.rectangle(box, fill=hexc('#8c6745'))
    for k in range(3):
        y = box[1] + (box[3] - box[1]) * (k + 0.5) / 3
        d.line([(box[0] + 2 * SS, y), (box[2] - 2 * SS, y)], fill=hexc('#6c4e35'), width=SS)
    d.line([(box[0] + 2 * SS, box[1] + 2 * SS), (box[2] - 2 * SS, box[1] + 2 * SS)], fill=hexc('#b48c62'), width=2 * SS)
    for x in (box[0], box[2] - 6 * SS):
        d.rectangle([x, box[1], x + 6 * SS, box[3]], fill=hexc('#5d4330'))
    save(im, 'planter', (96, 76))


def woodpile():
    W, H = 120 * SS, 80 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(81)
    d.ellipse([6 * SS, H - 14 * SS, W - 6 * SS, H - 2 * SS], fill=(22, 30, 18, 110))
    rows = [(H - 20 * SS, 7), (H - 38 * SS, 6), (H - 55 * SS, 4)]
    for ri, (y, n) in enumerate(rows):
        span = n * 15 * SS
        x0 = W / 2 - span / 2
        for i in range(n):
            x = x0 + i * 15 * SS + 7.5 * SS + rnd.uniform(-1, 1) * SS
            r = 8.5 * SS
            d.ellipse([x - r - 2 * SS, y - r - 2 * SS, x + r + 2 * SS, y + r + 2 * SS], fill=OUTLINE)
            d.ellipse([x - r, y - r, x + r, y + r], fill=hexc('#d3a874'))
            d.ellipse([x - r * 0.62, y - r * 0.62, x + r * 0.62, y + r * 0.62], outline=hexc('#a8794c'), width=SS)
            d.ellipse([x - r * 0.25, y - r * 0.25, x + r * 0.25, y + r * 0.25], fill=hexc('#a8794c'))
            d.arc([x - r, y - r, x + r, y + r], 30, 200, fill=hexc('#7b5537'), width=2 * SS)
    # an axe in the chopping block beside the stack
    bx = W - 14 * SS
    d.rectangle([bx - 10 * SS, H - 26 * SS, bx + 8 * SS, H - 8 * SS], fill=OUTLINE)
    d.rectangle([bx - 8 * SS, H - 24 * SS, bx + 6 * SS, H - 10 * SS], fill=hexc('#8a6647'))
    d.ellipse([bx - 8 * SS, H - 28 * SS, bx + 6 * SS, H - 21 * SS], fill=hexc('#c99e6c'), outline=OUTLINE, width=SS)
    d.line([(bx - 1 * SS, H - 25 * SS), (bx + 9 * SS, H - 46 * SS)], fill=OUTLINE, width=4 * SS)
    d.line([(bx - 1 * SS, H - 25 * SS), (bx + 9 * SS, H - 46 * SS)], fill=hexc('#9b744c'), width=2 * SS)
    d.polygon([(bx + 3 * SS, H - 32 * SS), (bx - 6 * SS, H - 38 * SS), (bx - 2 * SS, H - 27 * SS)], fill=hexc('#7d838c'), outline=OUTLINE)
    save(im, 'woodpile', (120, 80))


def cart():
    W, H = 150 * SS, 110 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(91)
    d.ellipse([14 * SS, H - 16 * SS, W - 10 * SS, H - 2 * SS], fill=(22, 30, 18, 120))
    # handles
    for dy in (0, 8):
        d.line([(16 * SS, (66 + dy) * SS), (-2 * SS, (84 + dy) * SS)], fill=OUTLINE, width=6 * SS)
        d.line([(16 * SS, (66 + dy) * SS), (0 * SS, (82 + dy) * SS)], fill=hexc('#8a6647'), width=3 * SS)
    # sacks
    for (x, y, r) in [(54, 44, 17), (82, 38, 18), (108, 46, 16)]:
        d.ellipse([(x - r - 2) * SS, (y - r - 2) * SS, (x + r + 2) * SS, (y + r + 4) * SS], fill=OUTLINE)
        d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r + 2) * SS], fill=hexc('#cdb48a'))
        d.ellipse([(x - r * 0.6) * SS, (y - r * 0.8) * SS, (x + r * 0.2) * SS, (y - r * 0.1) * SS], fill=hexc('#e2cfa6'))
        d.line([((x - 5) * SS, (y - r + 2) * SS), ((x + 5) * SS, (y - r + 2) * SS)], fill=hexc('#8a6c48'), width=2 * SS)
    # box body
    body = [(22 * SS, 50 * SS), (W - 10 * SS, 50 * SS), (W - 16 * SS, 82 * SS), (28 * SS, 82 * SS)]
    d.polygon([(x + (-3 if i in (0, 3) else 3) * SS, y + (-3 if i < 2 else 3) * SS) for i, (x, y) in enumerate(body)], fill=OUTLINE)
    d.polygon(body, fill=hexc('#97714c'))
    for k in range(1, 3):
        y = 50 * SS + k * 32 * SS / 3
        d.line([(24 * SS, y), (W - 13 * SS, y)], fill=hexc('#6f5137'), width=SS)
    d.line([(24 * SS, 52 * SS), (W - 12 * SS, 52 * SS)], fill=hexc('#c29a6b'), width=2 * SS)
    # wheel
    cx, cy, r = 92 * SS, 84 * SS, 20 * SS
    d.ellipse([cx - r - 3 * SS, cy - r - 3 * SS, cx + r + 3 * SS, cy + r + 3 * SS], fill=OUTLINE)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hexc('#7a5839'))
    d.ellipse([cx - r + 5 * SS, cy - r + 5 * SS, cx + r - 5 * SS, cy + r - 5 * SS], fill=hexc('#3d2c22'))
    for k in range(8):
        a = k / 8 * math.tau
        d.line([(cx, cy), (cx + math.cos(a) * (r - 4 * SS), cy + math.sin(a) * (r - 4 * SS))], fill=hexc('#9b764e'), width=2 * SS)
    d.ellipse([cx - 4 * SS, cy - 4 * SS, cx + 4 * SS, cy + 4 * SS], fill=hexc('#a88a4e'), outline=OUTLINE, width=SS)
    d.rectangle([34 * SS, 80 * SS, 40 * SS, 100 * SS], fill=OUTLINE)  # rear leg
    save(im, 'cart', (150, 110))


def dummy():
    W, H = 70 * SS, 120 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = W / 2
    d.ellipse([cx - 22 * SS, H - 12 * SS, cx + 22 * SS, H - 2 * SS], fill=(22, 30, 18, 110))
    d.rectangle([cx - 4 * SS, 20 * SS, cx + 4 * SS, H - 6 * SS], fill=OUTLINE)
    d.rectangle([cx - 2.5 * SS, 20 * SS, cx + 2.5 * SS, H - 6 * SS], fill=hexc('#7b5a3f'))
    d.rectangle([cx - 30 * SS, 40 * SS, cx + 30 * SS, 47 * SS], fill=OUTLINE)
    d.rectangle([cx - 28 * SS, 41.5 * SS, cx + 28 * SS, 45.5 * SS], fill=hexc('#8a6647'))
    d.ellipse([cx - 17 * SS, 34 * SS, cx + 17 * SS, 92 * SS], fill=OUTLINE)
    d.ellipse([cx - 15 * SS, 36 * SS, cx + 15 * SS, 90 * SS], fill=hexc('#c9a865'))
    for k in range(7):
        y = (42 + k * 7) * SS
        d.arc([cx - 15 * SS, y - 6 * SS, cx + 15 * SS, y + 6 * SS], 20, 160, fill=hexc('#9f8045'), width=SS)
    d.ellipse([cx - 10 * SS, 6 * SS, cx + 10 * SS, 30 * SS], fill=OUTLINE)
    d.ellipse([cx - 8.5 * SS, 7.5 * SS, cx + 8.5 * SS, 28.5 * SS], fill=hexc('#d9bd7c'))
    d.ellipse([cx - 9 * SS, 56 * SS, cx + 9 * SS, 74 * SS], outline=hexc('#a33f3a'), width=3 * SS)
    d.ellipse([cx - 3 * SS, 62 * SS, cx + 3 * SS, 68 * SS], fill=hexc('#a33f3a'))
    save(im, 'dummy', (70, 120))


def sack_stack():
    W, H = 96 * SS, 70 * SS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([6 * SS, H - 14 * SS, W - 6 * SS, H - 2 * SS], fill=(22, 30, 18, 110))
    for (x, y, r, col) in [(30, 50, 17, '#cdb48a'), (64, 52, 18, '#bfa47a'), (47, 30, 16, '#d6c095')]:
        d.ellipse([(x - r - 2) * SS, (y - r - 2) * SS, (x + r + 2) * SS, (y + r + 3) * SS], fill=OUTLINE)
        d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r + 1) * SS], fill=hexc(col))
        d.ellipse([(x - r * 0.6) * SS, (y - r * 0.8) * SS, (x + r * 0.2) * SS, (y - r * 0.1) * SS], fill=hexc('#e6d4ab'))
        d.line([((x - 6) * SS, (y - r + 3) * SS), ((x + 6) * SS, (y - r + 3) * SS)], fill=hexc('#7f6342'), width=2 * SS)
    save(im, 'sacks', (96, 70))


if __name__ == '__main__':
    lawn()
    wall_face()
    wall_top()
    wall_post()
    fence_iron()
    fence_wood()
    city_tree('tree_sage', (hexc('#48653f'), hexc('#6d9055'), hexc('#a8c47e'), hexc('#d3a94d')), (55 * SS, 52 * SS, 44 * SS, 44 * SS), 101)
    city_tree('tree_amber', (hexc('#94532a'), hexc('#cf8a3b'), hexc('#f0c06c'), hexc('#b44c3b')), (55 * SS, 54 * SS, 42 * SS, 42 * SS), 102)
    city_tree('tree_plum', (hexc('#583852'), hexc('#865f80'), hexc('#bc97b3'), hexc('#d4ae5c')), (55 * SS, 58 * SS, 30 * SS, 52 * SS), 103, columnar=True)
    hedge()
    flowerbed('flowerbed', ['#a991c9', '#e8dfc8', '#d59a59', '#c47b8f'], 111)
    flowerbed('herbbed', ['#8fb6a0', '#b4c98c', '#9d8cc0', '#d9d0a8'], 112, rim='#a99b7f')
    planter()
    woodpile()
    cart()
    dummy()
    sack_stack()
