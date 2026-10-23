"""Extract genuine ImageGen overhead pet poses; preserve original source sheets."""
import hashlib
import io
import json
import sys
from pathlib import Path
from PIL import Image
from prepare_city_life_painted import ROOT, figures, register

def prepare(sources):
    out = ROOT / 'public/assets/city-life/painted-v2'
    out.mkdir(parents=True, exist_ok=True)
    metadata = {}
    for name, source in sources.items():
        src = Path(source['path'])
        im = Image.open(src).convert('RGBA')
        alpha_min, alpha_max = im.getchannel('A').getextrema()
        if alpha_min != 0 or alpha_max < 250:
            raise ValueError(f'{name}: expected real transparency')
        size = (112, 144) if name.startswith('dog') else (96, 128)
        frames = register(figures(im, 10), size)
        suffixes = [f'{direction}_{pose}' for direction in ['up', 'down']
                    for pose in ['walk1', 'walk2', 'run1', 'run2', 'sit']]
        for suffix, frame in zip(suffixes, frames):
            buffer = io.BytesIO()
            frame.save(buffer, format='WEBP', lossless=True, exact=True, method=6)
            data = buffer.getvalue()
            if len(data) < 32:
                raise ValueError(f'{name}_{suffix}: failed WebP encoding')
            Image.open(io.BytesIO(data)).load()
            (out / f'{name}_{suffix}.webp').write_bytes(data)
        metadata[name] = {'source': src.name, 'sha256': hashlib.sha256(src.read_bytes()).hexdigest(),
                          'sourceSize': im.size, 'frameSize': size, 'frames': suffixes, 'prompt': source['prompt']}
    (ROOT / 'tools/art/city-life-directions-v2.sources.json').write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n')
    print(f'Prepared {len(sources)*10} overhead pet frames')

if __name__ == '__main__':
    prepare(json.loads(Path(sys.argv[1]).read_text()))
