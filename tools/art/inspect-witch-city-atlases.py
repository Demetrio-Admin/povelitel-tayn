import json
from pathlib import Path
import numpy as np
from PIL import Image

base = Path(__file__).resolve().parents[2] / 'docs/design/city-witch-v1'
groups = {
    'north': ['north_bay', 'north_workshop', 'cellar', 'rescue', 'archive', 'society'],
    'south': ['bank', 'duel', 'coven', 'warehouse_a', 'warehouse_b', 'lab'],
}
records = {}
for group, ids in groups.items():
    name = 'city-facades-' + group + '.png'
    im = Image.open(base / name)
    assert im.mode == 'RGBA', name
    rgba = np.array(im)
    a = rgba[:, :, 3]
    height, width = a.shape
    assert int(a.min()) == 0 and np.mean(a < 8) > .2, name + ' transparency'
    row_projection = (a >= 32).sum(axis=1)
    candidates = range(int(height*.43), int(height*.57))
    middle = min(candidates, key=lambda v: (int(row_projection[v]), abs(v-height/2)))
    rows = [0, middle, height]
    frames = {}
    for row in range(2):
        y0, y1 = rows[row], rows[row+1]
        col_projection = (a[y0:y1] >= 32).sum(axis=0)
        cuts = [0]
        for fraction in [1/3, 2/3]:
            center = width*fraction
            choices = range(int(center-width*.065), int(center+width*.065))
            cut = min(choices, key=lambda v: (int(col_projection[v]), abs(v-center)))
            assert int(col_projection[cut]) == 0, (name, row, cut, 'sprite overlaps frame boundary')
            cuts.append(cut)
        cuts.append(width)
        for col in range(3):
            ident = ids[row*3+col]
            x0, x1 = cuts[col], cuts[col+1]
            mask = a[y0:y1, x0:x1] >= 32
            ys, xs = np.where(mask)
            assert xs.size > 2000, ident
            bounds = {'x': int(xs.min()), 'y': int(ys.min()), 'w': int(xs.max()-xs.min()+1), 'h': int(ys.max()-ys.min()+1)}
            assert bounds['y'] > 0 and ys.max() < y1-y0-1, (ident, bounds, 'row clipping')
            frame = {'x': x0, 'y': y0, 'w': x1-x0, 'h': y1-y0}
            key = 'city_final_' + ident + '_exterior'
            frames[key] = {'frame': frame, 'rotated': False, 'trimmed': False,
                'spriteSourceSize': {'x':0,'y':0,'w':frame['w'],'h':frame['h']},
                'sourceSize': {'w':frame['w'],'h':frame['h']}}
            records[ident] = {'image': name, 'frameKey': key, 'frame': frame,
                'visibleBoundsAlpha32': bounds, 'doorAnchorRequiresVisualReview': True}
    atlas = {'frames': frames, 'meta': {'app':'Koldovstvo city art handoff', 'image':name,
        'format':'RGBA8888','size':{'w':width,'h':height},'scale':'1'}}
    (base / ('city-facades-' + group + '.json')).write_text(json.dumps(atlas, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'atlas': name, 'frames':len(frames), 'size':im.size,
        'transparentPercent':round(float(np.mean(a < 8))*100,1)},ensure_ascii=False))
layout_path = base / 'city-layout.json'
layout = json.loads(layout_path.read_text())
layout['facadeFrames'] = records
overview = Image.open(base / 'city-overview.png')
layout['overviewImageSize'] = {'w':overview.width,'h':overview.height}
layout_path.write_text(json.dumps(layout, ensure_ascii=False, indent=2)+'\n')
assert len(records) == 12 and {b['id'] for b in layout['buildings']} == set(records)
print('All 12 facade IDs match the coordinate blueprint; frames are separated and have real alpha.')
