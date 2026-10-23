"""Покадровая ходьба героев: запекает цикл шага из готовых рисунков (hero_*.png, warlock_*.png).

Запуск из корня репозитория:
    python3 tools/art/hero_walk_frames.py            -> public/assets/sprites/{hero,warlock}_walk_{down,up,side}.png
    python3 tools/art/hero_walk_frames.py --preview  -> ещё и docs/design/hero-walk-frames/preview.jpg

Как это устроено. Рисунок героя режется на три слоя: корпус с плащом и две ноги с сапогами. Ноги поднимаются и
шагают по очереди, корпус чуть приподнимается на проходе, а плащ и шляпа запаздывают (корпус сдвигается тонкими
горизонтальными полосами). Каждый кадр цикла собирается заново в 4-кратном разрешении и уменьшается до 166×240.
Лист — ряд из FRAMES кадров 166×240; ракурс «вбок» нарисован лицом вправо, влево игра зеркалит.

Эти кадры можно заменить нарисованными: файл с тем же именем, FRAMES кадров 166×240 в ряд, ноги у нижнего края.
Код менять не нужно (src/config/hero.walk.js).
"""
import math
import os
import sys
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SPR = os.environ.get('HERO_SPRITE_DIR', os.path.join(ROOT, 'public', 'assets', 'sprites'))
W, H = 166, 240
SS = 4                 # запас разрешения при сборке кадра
FRAMES = 8             # кадров в цикле (два шага); то же число в src/config/hero.walk.js

# Параметры (в пикселях исходного рисунка).
# Герой едет быстро (230 px/с при росте 120 px), а ноги короткие, поэтому шаг должен быть заметно размашистым,
# иначе вместо шагов видно скольжение. Частота шага задаётся в config/hero.anim.js (walkFrames.rate).
LIFT = 8.0             # подъём сапога над землёй в махе
RISE = 4.0             # приподнимание корпуса на проходе
SPREAD = 0.8           # разведение ног в стороны, вид спереди и сзади
STRIDE_Y = 3.0         # вынос стопы вперёд-назад, вид спереди и сзади: вперёд стопа ниже (спереди) или выше (сзади)
SWING_DEG = 24         # вид сбоку: наклон ноги вперёд-назад от бедра

# Разрез на ноги. y0 — линия реза (ниже неё корпус не рисуется), box — где искать ноги,
# mode 'color': забрать только цвет сапог и кожи (ведьма: плащ рядом того же тона, что штаны колдуна, поэтому у колдуна 'box'),
# split — граница между левой и правой ногой.
# front (только профиль): на рисунке сапоги перекрываются, задний виден узкой полоской справа от переднего, остальное закрыто.
# Поэтому передняя нога берётся целиком (всё левее split плюс носок ниже toe_y), а задняя достраивается как её копия,
# сдвинутая на bx вправо и чуть темнее. Тогда при расхождении ног обе остаются целыми.
HEROES = {
    'hero': {
        'down': dict(y0=199, x0=58, x1=114, mode='color', split=86),
        'up': dict(y0=202, x0=56, x1=110, mode='color', split=84),
        'side': dict(y0=204, x0=68, x1=106, mode='color', front=dict(split=91, toe_y=225, bx=8)),
    },
    'warlock': {
        'down': dict(y0=200, x0=56, x1=116, mode='box', split=85),
        'up': dict(y0=201, x0=56, x1=112, mode='box', split=82),
        'side': dict(y0=205, x0=70, x1=114, mode='box', front=dict(split=91, toe_y=225, bx=8)),
    },
}
REAR_SHADE = 0.9       # задняя нога в профиле чуть темнее передней

# Each art pack may supply its own boot/hem bounds without changing legacy art.
if os.environ.get('HERO_WALK_CONFIG'):
    with open(os.environ['HERO_WALK_CONFIG'], encoding='utf-8') as config_file:
        HEROES = json.load(config_file)


def cut_layers(im, c):
    """-> (корпус без ног, нога A, нога B, bbox A, bbox B). A — левая на экране (в профиле — передняя)."""
    arr = np.array(im.convert('RGBA'))
    R, G, B, A = [arr[:, :, i].astype(int) for i in range(4)]
    y0, x0, x1 = c['y0'], c['x0'], c['x1']
    box = np.zeros(A.shape, bool)
    box[y0:, x0:x1] = True
    if c['mode'] == 'color':
        legcol = (A > 120) & ((R - B) >= 58) & (R > 95)
        dark = (A > 120) & (R + G + B < 230)
        grown = np.array(Image.fromarray(((legcol & box) * 255).astype('uint8')).filter(ImageFilter.MaxFilter(7))) > 0
        E = grown & box & (A > 0) & (legcol | dark | (A <= 120))
    else:
        E = box & (A > 0)
    body = arr.copy()
    body[E] = 0
    leg = np.zeros_like(arr)
    leg[E] = arr[E]
    f = c.get('front')
    if f:
        ys, xs = np.mgrid[0:A.shape[0], 0:A.shape[1]]
        if f.get('polygon'):
            mask = Image.new('L', im.size)
            ImageDraw.Draw(mask).polygon([tuple(p) for p in f['polygon']], fill=255)
            front = E & (np.array(mask) > 0)
        else:
            front = E & ((xs <= f['split']) | (ys >= f['toe_y']))
        fa = np.zeros_like(arr)
        fa[front] = arr[front]
        piece = Image.fromarray(fa)
        bb = piece.getbbox()
        a_img = piece.crop(bb)
        rear = np.array(a_img).astype(float)
        rear[:, :, :3] *= REAR_SHADE
        b_img = Image.fromarray(rear.astype('uint8'))
        return Image.fromarray(body), (a_img, bb), (b_img, (bb[0] + f['bx'], bb[1], bb[2] + f['bx'], bb[3]))
    split = c['split']
    out = []
    for xa, xb in ((x0, split), (split, x1)):
        p = np.zeros_like(leg)
        p[:, xa:xb] = leg[:, xa:xb]
        piece = Image.fromarray(p)
        bb = piece.getbbox()
        out.append((piece.crop(bb), bb))
    return Image.fromarray(body), out[0], out[1]


def leg_state(s):
    """s — доля цикла ноги: первая половина — мах (нога в воздухе), вторая — опора (нога идёт назад).
    -> (подъём сапога, вынос ноги st от -1 (назад) до +1 (вперёд))."""
    if s < 0.5:
        q = s / 0.5
        return LIFT * math.sin(math.pi * q), -math.cos(math.pi * q)
    q = (s - 0.5) / 0.5
    return 0.0, 1 - 2 * q


def strip_off(view, y, th, u):
    t = y / H
    if view == 'side':
        return 3.2 * (1 - t) ** 1.3 - 2.6 * t ** 2.4 + 1.5 * t ** 3 * math.sin(2 * math.pi * u - 0.8)
    return 3.2 * t ** 2.2 * math.sin(th) - 1.8 * max(0.0, (0.5 - t) / 0.5) ** 1.4 * math.sin(th - 0.4)


def render_frame(view, c, parts, cyc):
    body, (A, bbA), (B, bbB), y0 = parts
    u = (cyc * 2) % 1
    th = 2 * math.pi * cyc
    rise = RISE * math.sin(math.pi * u)
    layer = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    states = {'A': leg_state(cyc % 1), 'B': leg_state((cyc + 0.5) % 1)}
    for name, piece, bb in (('B', B, bbB), ('A', A, bbA)) if view == 'side' else (('A', A, bbA), ('B', B, bbB)):
        lift, st = states[name]
        top = bb[1] - rise
        if view == 'side':
            bottom, dx = bb[3] - lift, 0.0
        else:
            # спереди стопа, вынесенная вперёд, ниже на экране, сзади выше: нога идёт к зрителю или от него
            bottom = bb[3] - lift + (STRIDE_Y if view == 'down' else -STRIDE_Y) * st
            dx = SPREAD * st
        w = (bb[2] - bb[0]) * SS
        h = max(1, round((bottom - top) * SS))
        scaled = piece.resize((w, h), Image.LANCZOS)
        tmp = Image.new('RGBA', layer.size, (0, 0, 0, 0))
        tmp.paste(scaled, (round((bb[0] + dx) * SS), round(top * SS)))
        if view == 'side':
            # нога качается от бедра: сдвиг растёт книзу, верх ноги остаётся под подолом, подошва остаётся горизонтальной
            t = math.tan(math.radians(SWING_DEG)) * st
            tmp = tmp.convert('RGBa').transform(tmp.size, Image.AFFINE, (1, -t, t * top * SS, 0, 1, 0), resample=Image.BICUBIC).convert('RGBA')
        layer = Image.alpha_composite(layer, tmp)
    bodyS = body.resize((W * SS, H * SS), Image.LANCZOS)
    bl = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    shift = -round(rise * SS)
    for sy in range(0, H, 2):
        strip = bodyS.crop((0, sy * SS, W * SS, (sy + 2) * SS))
        off = round(strip_off(view, sy + 1, th, u) * SS)
        bl.paste(strip, (off, sy * SS + shift))
    layer = Image.alpha_composite(layer, bl)
    return layer.resize((W, H), Image.LANCZOS)


def build(hero, view):
    c = HEROES[hero][view]
    src = Image.open(os.path.join(SPR, f'{hero}_{view}.png')).convert('RGBA')
    body, A, B = cut_layers(src, c)
    parts = (body, A, B, c['y0'])
    off = 0.5 / FRAMES if FRAMES % 4 else 0.0
    sheet = Image.new('RGBA', (W * FRAMES, H), (0, 0, 0, 0))
    for k in range(FRAMES):
        sheet.paste(render_frame(view, c, parts, (k / FRAMES + off) % 1), (k * W, 0))
    return sheet


def main():
    preview = '--preview' in sys.argv
    rows = []
    for hero in HEROES:
        for view in ('down', 'up', 'side'):
            sheet = build(hero, view)
            out = os.path.join(SPR, f'{hero}_walk_{view}.png')
            sheet.save(out, optimize=True)
            rows.append(sheet)
            print('записан', os.path.relpath(out, ROOT), sheet.size)
    if preview:
        sheet = Image.new('RGBA', (W * FRAMES, H * len(rows)), (200, 213, 166, 255))
        for i, s in enumerate(rows):
            sheet.alpha_composite(s, (0, i * H))
        d = os.path.join(ROOT, 'docs', 'design', 'hero-walk-frames')
        os.makedirs(d, exist_ok=True)
        sheet.convert('RGB').save(os.path.join(d, 'preview.jpg'), quality=86, optimize=True)
        print('записан docs/design/hero-walk-frames/preview.jpg')


if __name__ == '__main__':
    main()
