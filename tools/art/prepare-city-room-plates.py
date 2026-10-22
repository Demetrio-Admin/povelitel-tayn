"""Encode approved clean plates for the game; artwork pixels/layout are not edited."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
out = root / 'public/assets/city-rooms'
out.mkdir(parents=True, exist_ok=True)
manifest_path = out / 'provenance.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
for item in json.load(sys.stdin):
    source = Path(item['source'])
    image = Image.open(source).convert('RGB')
    target = out / (item['key'] + '-v1.webp')
    image.save(target, 'WEBP', quality=92, method=6)
    manifest[item['key']] = {
        'concept': item['concept'], 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'size': list(image.size), 'file': target.name,
        'workflow': 'ImageGen clean plate from approved concept; actors and UI removed; WebP encoding only',
    }
    print(item['key'], image.size, target.stat().st_size)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
