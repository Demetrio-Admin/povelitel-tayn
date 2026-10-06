"""Export Image Gen forest/map artwork; only slicing, registration, resampling and encoding.

python3 tools/art/forest-assets.py /absolute/path/to/source-map.json
Input: {world_map|squirrel|rabbit|bird: {source: '/path/generated.png', prompt: '...'}}.
Each animal input is one transparent horizontal sheet containing three poses.
"""
import hashlib
from io import BytesIO
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/forest'
OUT.mkdir(parents=True, exist_ok=True)


def save(im, name):
    path = OUT / (name + '.webp')
    buffer = BytesIO()
    im.save(buffer, 'WEBP', quality=91, method=6, exact=True)
    data = buffer.getvalue()
    assert len(data) > 32, 'Encoder returned an empty file'
    tmp = path.with_suffix('.webp.tmp')
    tmp.write_bytes(data)
    tmp.replace(path)
    # Decode every final file completely, not just its header.
    with Image.open(path) as check:
        check.load()
        assert check.size == im.size
    return {'file': 'assets/forest/' + path.name, 'size': list(im.size)}


def frames(im, bird=False):
    alpha = np.asarray(im.getchannel('A'))
    occupied = (alpha > 8).sum(axis=0) > 4
    groups = []
    start = None
    for x, on in enumerate(occupied):
        if on and start is None:
            start = x
        if start is not None and (not on or x == len(occupied) - 1):
            end = x if not on else x + 1
            if end - start > im.width / 12:
                groups.append((start, end))
            start = None
    assert len(groups) == 3, f'Expected three separated poses, got {groups}'
    # Split at the gutters, not blindly at thirds (a paw can cross a cell boundary).
    cuts = [0] + [(groups[i][1] + groups[i + 1][0]) // 2 for i in range(2)] + [im.width]
    pieces = [im.crop((cuts[i], 0, cuts[i + 1], im.height)) for i in range(3)]
    boxes = [p.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox() for p in pieces]
    assert all(boxes)
    canvas = (192, 160)
    max_w = max(b[2] - b[0] for b in boxes)
    top = min(b[1] for b in boxes)
    bottom = max(b[3] for b in boxes)
    max_h = bottom - top if bird else max(b[3] - b[1] for b in boxes)
    scale = min((canvas[0] - 12) / max_w, (canvas[1] - 12) / max_h)
    out = []
    for p, b in zip(pieces, boxes):
        # Preserve the source alpha. Register animal feet, and the bird's beak/body.
        crop_box = (max(0, b[0] - 2), top if bird else max(0, b[1] - 2), min(p.width, b[2] + 2), bottom if bird else min(p.height, b[3] + 2))
        crop = p.crop(crop_box)
        crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', canvas)
        x = canvas[0] - 6 - crop.width if bird else (canvas[0] - crop.width) // 2
        frame.alpha_composite(crop, (x, canvas[1] - 6 - crop.height))
        out.append(frame)
    return out


sources = json.loads(Path(sys.argv[1]).read_text())
provenance = {}
for name, data in sources.items():
    source = Path(data['source'])
    im = Image.open(source).convert('RGBA')
    im.load()
    if name == 'world_map':
        outputs = [save(im.convert('RGB').resize((876, 1140), Image.Resampling.LANCZOS), 'world-map')]
    else:
        assert im.getchannel('A').getextrema()[0] == 0, 'Sprite sheet must be transparent'
        outputs = [save(frame, f'life-{name}-{i + 1}') for i, frame in enumerate(frames(im, bird=name == 'bird'))]
    provenance[name] = {'tool': data.get('tool', 'built-in image_gen'), 'prompt': data.get('prompt', ''),
                        'source_name': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                        'source_size': list(im.size), 'outputs': outputs}
(OUT / 'sources.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')
print(f'Exported {sum(len(v["outputs"]) for v in provenance.values())} verified WebP assets.')
