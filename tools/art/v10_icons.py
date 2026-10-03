"""Иконки сюжетных предметов первой главы (v0.10.0): Лунный фитиль, Проявляющий состав, Восстановительная связка.
Собираются из уже нарисованных ассетов игры (тот же живописный стиль): огонёк алтаря, флакон эликсира, ядро Стража,
плюс несколько мазков (фитиль, лента, руна) с мягкой светотенью. Рисуются в 4× и уменьшаются до 64×64.
Запуск из корня репозитория:  python3 tools/art/v10_icons.py  ->  public/assets/sprites/icon_wick.png, icon_compound.png, icon_bundle.png
"""
import os
import colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SPR = os.path.join(ROOT, 'public', 'assets', 'sprites')
S = 256  # рабочий холст (4×)


def load(name):
    im = Image.open(os.path.join(SPR, name + '.png')).convert('RGBA')
    return im.crop(im.getbbox())   # без прозрачных полей — размер задаёт сам рисунок


def fit(im, w, h):
    s = min(w / im.width, h / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def hue_shift(im, target_h, sat_mul=1.0, val_mul=1.0, keep_grey=True):
    """Перекраска с сохранением светотени: оттенок → target_h (0..1) там, где пиксель цветной."""
    a = np.array(im).astype(float) / 255
    rgb = a[..., :3]
    out = rgb.copy()
    flat = rgb.reshape(-1, 3)
    res = out.reshape(-1, 3)
    for i, (r, g, b) in enumerate(flat):
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if keep_grey and s < 0.18:
            continue
        res[i] = colorsys.hsv_to_rgb(target_h, min(1, s * sat_mul), min(1, v * val_mul))
    a[..., :3] = out
    return Image.fromarray((a * 255).astype(np.uint8), 'RGBA')


def glow(size, color, radius, alpha=150):
    g = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    c = size // 2
    d.ellipse([c - radius, c - radius, c + radius, c + radius], fill=color + (alpha,))
    return g.filter(ImageFilter.GaussianBlur(radius * 0.45))


def shaded_line(d, pts, w, base, light, dark):
    d.line(pts, fill=dark, width=w + 6, joint='curve')
    d.line(pts, fill=base, width=w, joint='curve')
    d.line([(x - w * 0.18, y - w * 0.18) for x, y in pts], fill=light, width=max(2, w // 3), joint='curve')


def icon_wick():
    """Свитый из травы и смолы фитиль, на конце — три лунных огонька."""
    c = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c.alpha_composite(glow(S, (120, 220, 255), 70, 110), (0, -40))
    d = ImageDraw.Draw(c)
    # две свитые пряди: зелёная (трава) и янтарная (смола)
    import math
    pts_a, pts_b = [], []
    for i in range(0, 41):
        t = i / 40
        y = 244 - t * 128
        x = 128 + math.sin(t * math.pi * 2.5) * 20
        x2 = 128 - math.sin(t * math.pi * 2.5) * 20
        pts_a.append((x, y)); pts_b.append((x2, y))
    shaded_line(d, pts_b, 28, (214, 150, 52, 255), (255, 214, 120, 255), (70, 38, 18, 255))
    shaded_line(d, pts_a, 28, (96, 150, 92, 255), (170, 220, 150, 255), (30, 50, 30, 255))
    # руническая пыль-искры
    for (x, y, r) in [(92, 150, 5), (170, 130, 4), (160, 196, 4), (98, 206, 3)]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=(205, 170, 255, 230))
    flame = fit(load('lunar_flame_01'), 96, 120)
    for dx, dy, sc in [(-56, 10, 0.78), (56, 10, 0.78), (0, -6, 1.0)]:
        f = flame.resize((round(flame.width * sc), round(flame.height * sc)), Image.LANCZOS)
        c.alpha_composite(f, (int(128 + dx - f.width / 2), int(132 + dy - f.height)))
    return c


def icon_compound():
    """Флакон лунного эликсира, перекрашенный в фиолетовый, с проявленным знаком-руной."""
    c = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c.alpha_composite(glow(S, (190, 140, 255), 80, 120), (0, 8))
    base = fit(load('icon_potion_mana'), 236, 236)
    v = hue_shift(base, 0.78, sat_mul=1.1, val_mul=1.0)
    c.alpha_composite(v, ((S - v.width) // 2, (S - v.height) // 2 + 6))
    # знак: глаз-руна, проявленный светом
    rune = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(rune)
    cx, cy = 128, 160
    d.ellipse([cx - 34, cy - 18, cx + 34, cy + 18], outline=(255, 236, 160, 255), width=7)
    d.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], fill=(255, 236, 160, 255))
    d.line([(cx, cy - 40), (cx, cy - 24)], fill=(255, 236, 160, 255), width=6)
    d.line([(cx, cy + 24), (cx, cy + 40)], fill=(255, 236, 160, 255), width=6)
    halo = rune.filter(ImageFilter.GaussianBlur(6))
    c.alpha_composite(halo); c.alpha_composite(halo); c.alpha_composite(rune)
    return c


def icon_bundle():
    """Ядро Стража, стянутое смоляной лентой, с лунной травой — бирюзовое сияние восстановления."""
    c = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c.alpha_composite(glow(S, (110, 240, 170), 86, 120))
    core = hue_shift(fit(load('icon_core'), 200, 200), 0.42, sat_mul=1.05, val_mul=1.05)
    c.alpha_composite(core, ((S - core.width) // 2, (S - core.height) // 2 + 18))
    d = ImageDraw.Draw(c)
    # две смоляные ленты вокруг ядра и узел
    shaded_line(d, [(40, 118), (90, 106), (166, 106), (216, 118)], 20, (206, 136, 44, 255), (255, 210, 120, 255), (72, 40, 16, 255))
    shaded_line(d, [(40, 190), (90, 204), (166, 204), (216, 190)], 20, (206, 136, 44, 255), (255, 210, 120, 255), (72, 40, 16, 255))
    d.ellipse([108, 90, 148, 126], fill=(240, 196, 92, 255), outline=(72, 40, 16, 255), width=5)
    # пучок лунной травы за узлом
    herb = fit(load('icon_moon_herb'), 140, 140)
    for ang, dx in [(24, -46), (-24, 46)]:
        h = herb.rotate(ang, resample=Image.BICUBIC, expand=True)
        c.alpha_composite(h, (int(128 + dx - h.width / 2), -14))
    return c


def main():
    for name, fn in [('icon_wick', icon_wick), ('icon_compound', icon_compound), ('icon_bundle', icon_bundle)]:
        im = fn().resize((64, 64), Image.LANCZOS)
        im.save(os.path.join(SPR, name + '.png'), optimize=True)
        print(name, im.size)


if __name__ == '__main__':
    main()
