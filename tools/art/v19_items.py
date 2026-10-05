"""Иконки v0.19.0 (глава II): ресурсы, зелья, компоненты и амулеты.
Чтобы стиль совпадал с нарисованными иконками главы I, большинство иконок — перекраска существующих (сдвиг оттенка,
насыщенности, яркости) с небольшими добавками; оправа амулетов рисуется (v08_sprites.Cv), камень в ней — перекрашенный кристалл.
Запуск из корня репозитория:  python3 tools/art/v19_items.py  ->  public/assets/sprites/*.png (64×64)
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from v08_sprites import Cv, OL, rgb, lighter, darker  # noqa: E402

SP = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')


def load(name):
    return Image.open(os.path.join(SP, name + '.png')).convert('RGBA')


def save(im, name):
    im.save(os.path.join(SP, name + '.png'), optimize=True)


def recolor(im, hue=0.0, sat=1.0, val=1.0, to_hue=None, mask=None):
    """Сдвиг оттенка (доли круга), множители насыщенности и яркости. to_hue — поставить один оттенок всем пикселям.
    mask(h, s, v) -> bool-массив: перекрашивать только эти пиксели."""
    a = np.asarray(im).astype(np.float32) / 255.0
    rgbp, alpha = a[..., :3], a[..., 3:]
    hsv = np.asarray(Image.fromarray((rgbp * 255).astype(np.uint8), 'RGB').convert('HSV')).astype(np.float32) / 255.0
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = np.ones_like(h, dtype=bool) if mask is None else mask(h, s, v)
    nh = (to_hue if to_hue is not None else (h + hue)) % 1.0
    h = np.where(m, nh, h)
    s = np.where(m, np.clip(s * sat, 0, 1), s)
    v = np.where(m, np.clip(v * val, 0, 1), v)
    out = Image.fromarray((np.stack([h, s, v], -1) * 255).astype(np.uint8), 'HSV').convert('RGB')
    res = Image.merge('RGBA', (*out.split(), Image.fromarray((alpha[..., 0] * 255).astype(np.uint8))))
    return res


def frost(im, amount=0.35):
    """Иней: светлые пятна по краям силуэта."""
    alpha = im.split()[3]
    edge = alpha.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(1.2))
    white = Image.new('RGBA', im.size, (235, 250, 255, 0))
    white.putalpha(edge.point(lambda p: int(p * amount)))
    out = im.copy()
    out.alpha_composite(white)
    return out


def glow_under(im, color, radius=10, a=0.55):
    g = Image.new('RGBA', im.size, (0, 0, 0, 0))
    al = im.split()[3].point(lambda p: 255 if p > 120 else 0).filter(ImageFilter.GaussianBlur(radius))   # только сам предмет, без полупрозрачного фона
    col = Image.new('RGBA', im.size, color + (0,))
    col.putalpha(al.point(lambda p: int(p * a)))
    g.alpha_composite(col)
    g.alpha_composite(im)
    return g


# ---------------------------------------------------------------- ресурсы
def resources():
    herb = recolor(load('icon_moon_herb'), to_hue=0.47, sat=0.55, val=1.15, mask=lambda h, s, v: (h > 0.5) & (h < 0.75))   # колокольчики — бирюзово-белые
    herb = recolor(herb, hue=0.08, sat=0.6, mask=lambda h, s, v: (h > 0.15) & (h < 0.45))                                  # листья холоднее
    save(frost(herb, 0.6), 'icon_frost_herb')
    crystal = recolor(load('icon_shard'), to_hue=0.52, sat=0.45, val=1.12)
    save(glow_under(frost(crystal, 0.4), (170, 240, 255), 3, 0.35), 'icon_ice_crystal')
    shard = load('icon_shard').rotate(-38, resample=Image.BICUBIC).resize((52, 52), Image.LANCZOS)
    canvas = Image.new('RGBA', (64, 64), (0, 0, 0, 0)); canvas.alpha_composite(shard, (6, 6))
    shard = recolor(canvas, to_hue=0.62, sat=0.6, val=0.95)
    save(glow_under(frost(shard, 0.5), (140, 170, 255), 7, 0.6), 'icon_frost_shard')
    heart = recolor(load('icon_core'), to_hue=0.53, sat=0.8, val=1.05)
    save(frost(heart, 0.5), 'icon_cold_heart')


# ---------------------------------------------------------------- зелья и компоненты
def potions():
    life = load('icon_potion_life')
    liquid = lambda h, s, v: ((h < 0.06) | (h > 0.9)) & (s > 0.35)   # красная жидкость и красные блики
    save(recolor(life, to_hue=0.07, sat=1.0, val=1.08, mask=liquid), 'icon_potion_warm')
    save(recolor(life, to_hue=0.45, sat=0.6, val=1.05, mask=liquid), 'icon_potion_stable')
    save(frost(recolor(life, to_hue=0.53, sat=0.45, val=1.15, mask=liquid), 0.5), 'icon_potion_brittle')
    save(frost(recolor(life, to_hue=0.7, sat=0.75, val=1.0, mask=liquid), 0.35), 'icon_potion_guard')
    resin = recolor(load('icon_resin'), hue=-0.06, sat=1.1, val=0.95)
    save(glow_under(resin, (255, 120, 60), 8, 0.6), 'icon_reinforced_resin')
    # Астральная линза: золотая оправа и голубое стекло
    c = Cv(64, 64)
    c.glow(32, 30, 28, rgb('#8fb4ff'), 0.5)
    c.line([(44, 44), (56, 58)], OL, 8)
    c.line([(44, 44), (55, 57)], rgb('#b88a3e'), 4.4)
    c.ell(8, 6, 50, 48, rgb('#d9a94a'), OL, 2.4)
    c.ell(13, 11, 45, 43, rgb('#7fa6ff'), OL, 1.6)
    c.ell(17, 15, 41, 39, rgb('#a8c4ff'), None)
    c.ell(19, 17, 29, 25, rgb('#eaf2ff'), None)
    c.save('icon_astral_lens')


# ---------------------------------------------------------------- амулеты
def amulet(name, gem_im, metal='#d9a94a', chain='#b88a3e'):
    c = Cv(64, 64)
    M = rgb(metal)
    c.arc((10, -14, 54, 30), 20, 160, OL, 4.6)
    c.arc((10, -14, 54, 30), 20, 160, rgb(chain), 2.4)
    c.poly([(32, 18), (48, 30), (44, 52), (32, 60), (20, 52), (16, 30)], M, OL, 2.4)
    c.poly([(32, 21), (45, 31), (41, 50), (32, 56)], lighter(M, 0.2), None)
    c.ell(28, 12, 36, 20, M, OL, 1.8)
    im = c.im.resize((64, 64), Image.LANCZOS)
    gem = gem_im.resize((30, 30), Image.LANCZOS)
    im.alpha_composite(gem, (17, 24))
    save(im, name)


def amulets():
    core = load('icon_core'); shard = load('icon_shard')
    amulet('icon_amulet_focus', recolor(core, to_hue=0.0, sat=0.95, val=1.0))                       # алый — сила
    amulet('icon_amulet_forest', recolor(core, to_hue=0.33, sat=0.75, val=0.95), metal='#a8865a')  # зелёный — лес
    amulet('icon_amulet_lunar', recolor(shard, to_hue=0.76, sat=0.5, val=1.1), metal='#c9cfe0', chain='#9aa3b8')   # серебро и лиловый лунный камень
    amulet('icon_amulet_frost', frost(recolor(shard, to_hue=0.52, sat=0.6, val=1.15), 0.5), metal='#9fd8ec', chain='#6aa8c0')   # ледяная оправа


def main():
    resources(); potions(); amulets()
    print('ok')


if __name__ == '__main__':
    main()
