# Партия 2: размер на экране = пропорции арта, длинная сторона = L; текстура x2. Печатает DISPLAY_SIZE.
import os, sys, json
from PIL import Image
SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)
L = {'bush_01':80,'bush_02':80,'dry_bush_01':84,'flower_white_01':48,'flower_purple_01':48,'mushroom_red_01':52,'mushroom_blue_01':46,
 'reeds_01':70,'moon_plant_01':60,'rock_small_01':56,'rock_medium_01':100,'lantern_01':90,'lantern_02':100,'signpost_01':90,'torch_01':90,
 'candle_group_01':44,'claw_marks_01':72,'wooden_bridge_01':180,'fire_circle_01':240,'enemy_scavenger':140,'enemy_scavenger_small':104,
 'enemy_guardian':210,'enemy_rootling':96,'field_rock_light':76,'field_rock_heavy':116,'field_crystal':110}
ROT = {'wooden_bridge_01': 90}
ds = {}
for k, l in L.items():
    im = Image.open(os.path.join(SRC, k + '.png')).convert('RGBA')
    if k in ROT: im = im.rotate(ROT[k], expand=True)
    im = im.crop(im.getbbox())
    s = l / max(im.size); w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
    im.resize((w * 2, h * 2), Image.LANCZOS).save(os.path.join(DST, k + '.png'), optimize=True)
    ds[k] = [w, h]
print(', '.join(f"{k}: [{w}, {h}]" for k, (w, h) in ds.items()))
