"""Объекты мира первой главы (v0.10.0), собранные из уже нарисованных ассетов игры (тот же живописный стиль):
  forest_node_broken / forest_node_restored — повреждённый и восстановленный узел защиты леса (каменный круг + кристалл);
  seal_sigil_dim / seal_sigil_lit           — учебный знак Печати у алтаря до и после применения дара;
  dust_stash_01 / dust_stash_empty          — охраняемый запас рунической пыли в старом лесу (полный / разобранный).
Запуск из корня репозитория:  python3 tools/art/v10_world.py  ->  public/assets/sprites/*.png
"""
import os
import math
import random
import colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SPR = os.path.join(ROOT, 'public', 'assets', 'sprites')


def load(name):
    return Image.open(os.path.join(SPR, name + '.png')).convert('RGBA')


def save(im, name):
    im.save(os.path.join(SPR, name + '.png'), optimize=True)
    print(name, im.size)


def recolor(im, hue=None, sat=1.0, val=1.0, min_s=0.15):
    a = np.array(im).astype(float) / 255
    rgb = a[..., :3].reshape(-1, 3)
    out = rgb.copy()
    for i, (r, g, b) in enumerate(rgb):
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if hue is not None and s >= min_s:
            h = hue
        out[i] = colorsys.hsv_to_rgb(h, min(1, s * sat), min(1, v * val))
    a[..., :3] = out.reshape(a[..., :3].shape)
    return Image.fromarray((a * 255).astype(np.uint8), 'RGBA')


def glow(w, h, cx, cy, rx, ry, color, alpha):
    g = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color + (alpha,))
    return g.filter(ImageFilter.GaussianBlur(max(rx, ry) * 0.4))


def cracks(d, cx, cy, n, length, color, width, seed):
    rnd = random.Random(seed)
    for _ in range(n):
        ang = rnd.uniform(0, math.tau)
        x, y = cx, cy
        pts = [(x, y)]
        for _ in range(5):
            ang += rnd.uniform(-0.5, 0.5)
            step = length / 5 * rnd.uniform(0.7, 1.2)
            x += math.cos(ang) * step; y += math.sin(ang) * step * 0.55
            pts.append((x, y))
        d.line(pts, fill=color, width=width, joint='curve')


# ------------------------------------------------------------------ узел защиты леса
def forest_node(restored):
    ring = load('fire_circle_01')                 # 480×334, огонь в центре
    W, H = ring.size
    c = ring.copy()
    d = ImageDraw.Draw(c)
    # центр круга засыпаем землёй (цвет взят с утоптанной площадки внутри круга)
    ground = ring.getpixel((150, 230))[:3]
    d.ellipse([150, 120, 330, 255], fill=ground + (255,))
    soft = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(soft).ellipse([140, 112, 340, 262], fill=ground + (255,))
    c = Image.alpha_composite(c, soft.filter(ImageFilter.GaussianBlur(6)))
    c.alpha_composite(ring.crop((0, 230, W, H)), (0, 230))   # передние камни круга поверх засыпки
    # руническая черта по кругу
    d = ImageDraw.Draw(c)
    col = (110, 240, 200, 255) if restored else (96, 92, 104, 255)
    for k in range(10):
        a = k / 10 * math.tau
        x, y = 240 + math.cos(a) * 78, 190 + math.sin(a) * 42
        d.line([(x - 6, y), (x + 6, y)], fill=col, width=4)
    crystal = load('field_crystal').resize((132, 165), Image.LANCZOS)
    if restored:
        crystal = recolor(crystal, hue=0.45, sat=1.15, val=1.1)
        c.alpha_composite(glow(W, H, 240, 150, 120, 90, (120, 255, 210), 150))
    else:
        crystal = recolor(crystal, sat=0.25, val=0.6)
        crystal = crystal.rotate(9, resample=Image.BICUBIC, expand=True)
    c.alpha_composite(crystal, (240 - crystal.width // 2, 205 - crystal.height))
    d = ImageDraw.Draw(c)
    if not restored:
        cracks(d, 240, 200, 6, 90, (40, 34, 40, 255), 4, 7)
        cracks(d, 240, 200, 4, 70, (150, 90, 210, 180), 2, 11)   # след вытянутой силы
    else:
        for k in range(14):
            a = k / 14 * math.tau
            x, y = 240 + math.cos(a) * 120, 170 + math.sin(a) * 60
            d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(200, 255, 235, 230))
    return c


# ------------------------------------------------------------------ учебный знак Печати
def seal_sigil(lit):
    base = load('rune_sigil_01')                  # 180×100: каменное кольцо со светящимся знаком
    W, H = base.size
    c = recolor(base, sat=0.15, val=0.75)         # знак погашен: серый камень
    d = ImageDraw.Draw(c)
    d.ellipse([52, 32, 128, 72], fill=(78, 74, 82, 255))
    star = load('icon_seal').resize((70, 40), Image.LANCZOS)
    if lit:
        c.alpha_composite(glow(W, H, 90, 52, 60, 34, (200, 140, 255), 170))
        c.alpha_composite(star, (55, 32))
        c.alpha_composite(star.filter(ImageFilter.GaussianBlur(2)), (55, 32))
    else:
        dim = recolor(star, sat=0.1, val=0.55)
        dim.putalpha(dim.getchannel('A').point(lambda v: int(v * 0.8)))
        c.alpha_composite(dim, (55, 32))
        cracks(ImageDraw.Draw(c), 90, 52, 4, 40, (35, 32, 38, 255), 3, 3)
    return c


# ------------------------------------------------------------------ запас рунической пыли
def dust_stash(full):
    rock = load('rock_small_01')                  # 112×94
    W, H = 150, 110
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c.alpha_composite(rock, (W - rock.width - 6, H - rock.height - 2))
    d = ImageDraw.Draw(c)
    rnd = random.Random(5)
    if full:
        c.alpha_composite(glow(W, H, 46, 88, 44, 20, (190, 140, 255), 140))
        d = ImageDraw.Draw(c)
        d.ellipse([10, 78, 86, 104], fill=(122, 86, 170, 255))
        d.ellipse([18, 70, 74, 98], fill=(160, 120, 220, 255))
        d.ellipse([28, 66, 60, 88], fill=(200, 170, 255, 255))
        for _ in range(40):
            x, y = rnd.uniform(14, 82), rnd.uniform(68, 102)
            r = rnd.uniform(1, 2.6)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(235, 220, 255, 230))
    else:
        for _ in range(14):
            x, y = rnd.uniform(18, 80), rnd.uniform(88, 104)
            r = rnd.uniform(1, 2)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(150, 120, 200, 200))
    return c


def main():
    save(forest_node(False), 'forest_node_broken')
    save(forest_node(True), 'forest_node_restored')
    save(seal_sigil(False), 'seal_sigil_dim')
    save(seal_sigil(True), 'seal_sigil_lit')
    save(dust_stash(True), 'dust_stash_01')
    save(dust_stash(False), 'dust_stash_empty')


if __name__ == '__main__':
    main()
