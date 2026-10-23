"""Extract ImageGen sprite sheets; never synthesizes poses or recolors artwork.

Usage: python3 tools/art/prepare_city_life_painted.py /path/to/sources.json
JSON maps variant names to {path, prompt}. Original PNGs remain untouched.
"""
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, find_objects, label

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/city-life/painted-v1'
HUMANS = ['man_a', 'man_b', 'woman_a', 'woman_b']
PETS = ['cat_ginger', 'cat_grey', 'cat_tux', 'dog_tan', 'dog_brown']


def figures(im, count):
    """Separate complete figures even when tails/whiskers cross an ideal grid.

    Nearest-component assignment keeps antialiased edges and detached fine details
    with their original figure; no opaque background removal or repainting.
    """
    rgba = np.asarray(im)
    regions, _ = label(rgba[:, :, 3] > 16)
    areas = np.bincount(regions.ravel())
    major = [i for i, n in enumerate(areas) if i and n > 1000]
    if len(major) != count:
        raise ValueError(f'Expected {count} complete figures, found {len(major)}')
    seeds = np.isin(regions, major)
    distance, nearest = distance_transform_edt(~seeds, return_distances=True, return_indices=True)
    owner = regions[tuple(nearest)]
    boxes = find_objects(regions)
    major.sort(key=lambda i: (boxes[i-1][0].start // (im.height // 2) if count == 10 else 0,
                              boxes[i-1][1].start))
    result = []
    for i in major:
        a = rgba.copy()
        a[(owner != i) | (distance > 12), 3] = 0
        sprite = Image.fromarray(a, 'RGBA')
        bbox = sprite.getchannel('A').getbbox()
        result.append(sprite.crop(bbox))
    return result


def register(frames, size):
    """One scale per character, stable foot baseline and alpha center per pose."""
    w, h = size
    pivots = []
    for f in frames:
        a = np.asarray(f.getchannel('A'), dtype=float)
        cx = float((a * np.arange(f.width)[None, :]).sum() / a.sum())
        pivots.append(cx)
    extent = max(max(cx, f.width - cx) for f, cx in zip(frames, pivots))
    scale = min((w - 8) / (extent * 2), (h - 8) / max(f.height for f in frames))
    out = []
    for f, cx in zip(frames, pivots):
        scaled = f.resize((round(f.width * scale), round(f.height * scale)), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', size)
        canvas.alpha_composite(scaled, (round(w / 2 - cx * scale), h - 3 - scaled.height))
        out.append(canvas)
    return out


def prepare(sources):
    OUT.mkdir(parents=True, exist_ok=True)
    metadata = {}
    for name in HUMANS + PETS + ['crow']:
        src = Path(sources[name]['path'])
        im = Image.open(src).convert('RGBA')
        if im.getchannel('A').getextrema() != (0, 255):
            raise ValueError(f'{name}: expected real transparency')
        if name in HUMANS:
            frames = register(figures(im, 10), (138 if name.startswith('man') else 172, 240))
            suffixes = [str(i) for i in range(5)] + [f'b_{i}' for i in range(5)]
        elif name in PETS:
            frames = register(figures(im, 5), (192, 120) if name.startswith('dog') else (160, 108))
            suffixes = ['walk1', 'walk2', 'run1', 'run2', 'sit']
        else:
            # Shared source coordinates retain the torso pivot through wing motion.
            cells = [im.crop((round(i*im.width/3), 0, round((i+1)*im.width/3), im.height)) for i in range(3)]
            b = [f.getchannel('A').getbbox() for f in cells]
            box = (min(r[0] for r in b), min(r[1] for r in b), max(r[2] for r in b), max(r[3] for r in b))
            scale = min(76 / (box[2]-box[0]), 64 / (box[3]-box[1]))
            frames = []
            for cell in cells:
                f = cell.crop(box)
                f = f.resize((round(f.width*scale), round(f.height*scale)), Image.Resampling.LANCZOS)
                canvas = Image.new('RGBA', (80, 68))
                canvas.alpha_composite(f, ((80-f.width)//2, 68-2-f.height))
                frames.append(canvas)
            suffixes = ['1', '2', '3']
        for suffix, frame in zip(suffixes, frames):
            # Existing names and frame count are the animation contract.
            encoded = io.BytesIO()
            frame.save(encoded, format='WEBP', lossless=True, exact=True, method=6)
            data = encoded.getvalue()
            if len(data) < 32:
                raise ValueError(f'{name}_{suffix}: WebP encoding failed')
            Image.open(io.BytesIO(data)).load()
            (OUT / f'{name}_{suffix}.webp').write_bytes(data)
        metadata[name] = {'source': src.name, 'sha256': hashlib.sha256(src.read_bytes()).hexdigest(),
                          'sourceSize': im.size, 'frameSize': frames[0].size, 'frames': suffixes,
                          'prompt': sources[name]['prompt']}
    (ROOT / 'tools/art/city-life-painted-v1.sources.json').write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n')
    print(f'Prepared {sum(len(m["frames"]) for m in metadata.values())} painted frames in {OUT}')


if __name__ == '__main__':
    prepare(json.loads(Path(sys.argv[1]).read_text()))
