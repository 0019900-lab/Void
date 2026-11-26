#!/usr/bin/env python3
"""v3 builder: platformer pack (v6 spec). Usage: python3 tools/build_assets_v3.py <SPEC_DIR> <STORY_DIR> <OUT>"""
import sys, os, glob, json, shutil
from PIL import Image
SPEC, STORY, OUT = sys.argv[1:4]
def sub(*p):
    d = os.path.join(OUT, *p); os.makedirs(d, exist_ok=True); return d
def trim(im, pad=1):
    bb = im.split()[3].point(lambda v: 255 if v > 10 else 0).getbbox(); return im.crop(bb) if bb else im
def conv(src, dst, maxs, trimmed=True):
    im = Image.open(src).convert('RGBA'); im = trim(im) if trimmed else im
    s = maxs / max(im.size)
    if s < 1: im = im.resize((round(im.width*s), round(im.height*s)), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=88, method=6); return im.size
sizes = {}
P = f'{SPEC}/pack/platformer'
for f in glob.glob(P + '/*.png'):
    n = os.path.basename(f)[:-4]
    if n.startswith(('w2_', 'w3_')) and n[:2] != 'w1': keep = True
    sizes[n] = conv(f, os.path.join(sub('img', 'pf'), n + '.webp'), 320)
# hero faces: one sheet, fixed cell, same anchor (no trim!)
faces = sorted(glob.glob(f'{SPEC}/pack/hero/hero_*.png')); names = [os.path.basename(f)[5:-4] for f in faces]; C = 192
sh = Image.new('RGBA', (C*7, C*2), (0,0,0,0))
for i, f in enumerate(faces): sh.paste(Image.open(f).convert('RGBA').resize((C, C), Image.LANCZOS), ((i%7)*C, (i//7)*C))
sh.save(os.path.join(sub('img'), 'hero.webp'), 'WEBP', quality=88, method=6)
json.dump({'faces': names, 'cell': C, 'cols': 7, 'sizes': sizes}, open(os.path.join(sub('img'), 'pf_meta.json'), 'w'))
# story art (cover, 1280x720) + data
for f in glob.glob(f'{STORY}/story/art/*.jpg'):
    Image.open(f).convert('RGB').resize((1280, 720), Image.LANCZOS).save(os.path.join(sub('img', 'story6'), os.path.basename(f)[:-4] + '.webp'), 'WEBP', quality=74, method=6)
sub('data'); shutil.copy(f'{SPEC}/out/levels.json', os.path.join(OUT, '..', 'data', 'levels6.json')); shutil.copy(f'{SPEC}/out/story.json', os.path.join(OUT, '..', 'data', 'story6.json'))
print(names)
