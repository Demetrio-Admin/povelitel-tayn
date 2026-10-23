#!/usr/bin/env python3
"""Сжатие графики в public/assets без заметной потери качества.

  python3 tools/art/optimize-assets.py            # отчёт, ничего не пишет
  python3 tools/art/optimize-assets.py --apply    # записать результат

Правила:
  * PNG-спрайты -> WebP (q90, альфа без потерь). Если PSNR ниже порога — q94, затем lossless WebP,
    если и он не меньше PNG — файл остаётся как есть.
  * Крупные WebP (>= 100 КБ) пережимаются, но только если экономия >= 15 %
    и PSNR относительно исходника не ниже порога (иначе файл не трогается). Лесенка качества 88→72.
Скрипт идемпотентен: уже сжатые файлы вторым прогоном не проходят порог экономии.
После --apply пути *.png в src/ нужно обновить (см. tools/art/rename-png-refs.mjs).
"""
import io
import os
import sys

from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image

ROOT = 'public/assets'
APPLY = '--apply' in sys.argv
PNG_Q = 90
PNG_Q_HI = 94
WEBP_LADDER = (88, 84, 80, 76, 72)   # от лучшего к худшему
PSNR_PNG = 40.0
PSNR_PNG_HI = 38.0
PSNR_WEBP = 38.0
MIN_SAVING = 0.15
MIN_WEBP_BYTES = 100 * 1024
METHOD = 4


def flat(im):
    """RGBA -> float RGB на нейтральном сером фоне + отдельно альфа."""
    a = np.asarray(im.convert('RGBA'), dtype=np.float32)
    al = a[..., 3:4] / 255.0
    rgb = a[..., :3] * al + 128.0 * (1 - al)
    return rgb, a[..., 3]


def psnr(a_im, b_im):
    ra, aa = flat(a_im)
    rb, ab = flat(b_im)
    mse = np.mean((ra - rb) ** 2)
    mse_a = np.mean((aa - ab) ** 2)
    p_rgb = 99.0 if mse == 0 else 10 * np.log10(255.0 ** 2 / mse)
    p_a = 99.0 if mse_a == 0 else 10 * np.log10(255.0 ** 2 / mse_a)
    return min(p_rgb, p_a)


def encode(im, **kw):
    b = io.BytesIO()
    im.save(b, 'WEBP', method=METHOD, **kw)
    return b.getvalue()


def work(p):
    """Обрабатывает один файл. Возвращает (было, стало, путь, режим, psnr)."""
    low = p.lower()
    size = os.path.getsize(p)
    if low.endswith('.webp') and size < MIN_WEBP_BYTES:
        return (size, size, p, 'small', 0.0)
    im = Image.open(p)
    im.load()
    rgba = im.convert('RGBA')
    if low.endswith('.png'):
        data = encode(rgba, quality=PNG_Q, alpha_quality=100)
        q = psnr(rgba, Image.open(io.BytesIO(data)))
        mode = 'q%d' % PNG_Q
        if q < PSNR_PNG:   # акварельные листы: пробуем качество повыше, и только потом lossless
            data = encode(rgba, quality=PNG_Q_HI, alpha_quality=100)
            q = psnr(rgba, Image.open(io.BytesIO(data)))
            mode = 'q%d' % PNG_Q_HI
        if q < PSNR_PNG_HI:
            data = encode(rgba, lossless=True)
            q = 99.0
            mode = 'lossless'
        if len(data) >= size:
            return (size, size, p, 'keep-png', 0.0)
        if APPLY:
            with open(p[:-4] + '.webp', 'wb') as fh:
                fh.write(data)
            os.remove(p)
        return (size, len(data), p, mode, q)
    # самое низкое качество из лесенки, при котором PSNR ещё не ниже порога
    best = None
    for qual in WEBP_LADDER:
        data = encode(rgba, quality=qual, alpha_quality=100)
        q = psnr(rgba, Image.open(io.BytesIO(data)))
        if q < PSNR_WEBP:
            break
        best = (data, qual, q)
    if best is None or len(best[0]) > size * (1 - MIN_SAVING):
        return (size, size, p, 'keep', q)
    data, qual, q = best
    if APPLY:
        with open(p, 'wb') as fh:
            fh.write(data)
    return (size, len(data), p, 'q%d' % qual, q)


def main():
    files = sorted(os.path.join(d, f) for d, _, fs in os.walk(ROOT) for f in fs if f.lower().endswith(('.png', '.webp')))
    with ProcessPoolExecutor(max_workers=os.cpu_count() or 2) as ex:
        rows = list(ex.map(work, files, chunksize=4))
    before = sum(r[0] for r in rows)
    after = sum(r[1] for r in rows)
    for s, n, p, mode, q in sorted(rows, key=lambda r: r[0] - r[1], reverse=True)[:25]:
        print('%7d -> %7d  %-22s %5.1f dB  %s' % (s, n, mode, q, p))
    for label, ext in (('png->webp', '.png'), ('webp recompress', '.webp')):
        sel = [r for r in rows if r[2].lower().endswith(ext)]
        print('%-16s %3d files  %.1f MB -> %.1f MB' % (label, len(sel), sum(r[0] for r in sel) / 1048576, sum(r[1] for r in sel) / 1048576))
    changed = [r for r in rows if r[1] < r[0]]
    print('\nfiles changed: %d of %d' % (len(changed), len(rows)))
    print('total: %.1f MB -> %.1f MB' % (before / 1048576, after / 1048576))
    if not APPLY:
        print('(dry run, pass --apply to write)')


if __name__ == '__main__':
    main()
