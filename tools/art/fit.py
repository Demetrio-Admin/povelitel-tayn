# Вписывает вырезанные спрайты в размер текстуры игры (низ по центру, пропорции сохраняются).
# Ключи с DISPLAY_SIZE — x2 (игра масштабирует сама), остальные — точно в размер заглушки.
import os, sys, json
from PIL import Image
SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)
# key: (w, h, scale, align)  align: 'bottom' | 'center'
BOX = {
  'tree_autumn_01': (150, 210, 2, 'bottom'), 'tree_autumn_02': (140, 200, 2, 'bottom'),
  'tree_dark_01': (150, 220, 2, 'bottom'), 'tree_dark_02': (140, 210, 2, 'bottom'),
  'dead_tree_01': (110, 170, 2, 'bottom'), 'birch_01': (90, 220, 2, 'bottom'),
  'heavy_boulder_01': (210, 150, 2, 'bottom'), 'ancient_gate_01': (300, 300, 2, 'bottom'),
  'lunar_altar_01': (160, 110, 2, 'bottom'),
  'chest_01': (60, 48, 1, 'bottom'), 'chest_01_open': (60, 48, 1, 'bottom'),
  'magic_book_01': (70, 70, 1, 'bottom'), 'corrupted_roots_01': (220, 120, 1, 'bottom'),
}
ICONS = ['icon_telekinesis','icon_fire','icon_seal','icon_bag','icon_hand','icon_coin','icon_shard','icon_ember','icon_core','icon_lock']
for k in ICONS: BOX[k] = (64, 64, 1, 'center')

def place(im, W, H, align, margin=0):
    s = min((W - margin * 2) / im.width, (H - margin) / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    x = (W - im.width) // 2
    y = H - im.height if align == 'bottom' else (H - im.height) // 2
    c.alpha_composite(im, (x, y)); return c

done = []
for k, (w, h, sc, al) in BOX.items():
    p = os.path.join(SRC, k + '.png')
    if not os.path.exists(p): continue
    place(Image.open(p).convert('RGBA'), w * sc, h * sc, al, 2 if al == 'center' else 0).save(os.path.join(DST, k + '.png'), optimize=True)
    done.append(k)
# герой: высота 240 (x2 от displayHeight 120), одинаковый холст для всех ракурсов
hs = {k: Image.open(os.path.join(SRC, k + '.png')).convert('RGBA') for k in ['hero_down', 'hero_up', 'hero_side'] if os.path.exists(os.path.join(SRC, k + '.png'))}
if hs:
    H = 240
    sc = {k: H / im.height for k, im in hs.items()}
    W = max(round(im.width * sc[k]) for k, im in hs.items()) + 4
    for k, im in hs.items():
        place(im, W, H, 'bottom').save(os.path.join(DST, k + '.png'), optimize=True); done.append(k)
print(json.dumps(done))
