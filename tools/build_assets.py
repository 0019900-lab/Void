#!/usr/bin/env python3
"""Builds optimized web assets from the raw packs. Run: python3 tools/build_assets.py <src_dir> <out_dir>"""
import sys, os, glob, json
from PIL import Image
import numpy as np
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
def sub(*p):
    d = os.path.join(OUT, *p); os.makedirs(d, exist_ok=True); return d

def trim(im, pad=2):
    bb = im.split()[3].point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bb: return im
    x0,y0,x1,y1 = bb
    return im.crop((max(0,x0-pad),max(0,y0-pad),min(im.width,x1+pad),min(im.height,y1+pad)))

def save_trim(path, out, maxw):
    im = trim(Image.open(path).convert('RGBA'))
    if im.width > maxw: im = im.resize((maxw, round(im.height*maxw/im.width)), Image.LANCZOS)
    im.save(out, 'WEBP', quality=88, method=6)

# --- sprites for level / ui / icons (trimmed, webp)
A = os.path.join(SRC, 'V3_2_assets')
for grp, mw in (('levels', 360), ('icons', 200), ('ui', 360)):
    for f in glob.glob(f'{A}/{grp}/*.png'):
        save_trim(f, os.path.join(sub('img', grp), os.path.basename(f)[:-4] + '.webp'), mw)

# --- backgrounds / menu
for f in glob.glob(f'{A}/backgrounds/*.jpg'):
    Image.open(f).convert('RGB').resize((1280, 720), Image.LANCZOS).save(
        os.path.join(sub('img', 'bg'), os.path.basename(f)[:-4] + '.webp'), 'WEBP', quality=80, method=6)

# --- story slides
for f in sorted(glob.glob(f'{SRC}/V3_1c_story_slides/story/slides/*.jpg')):
    Image.open(f).convert('RGB').resize((960, 764), Image.LANCZOS).save(
        os.path.join(sub('img', 'story'), os.path.basename(f)[:-4] + '.webp'), 'WEBP', quality=78, method=6)

# --- icon
ic = Image.open('/mnt/user-data/uploads/game-icon.webp').convert('RGBA')
for s in (192, 512): ic.resize((s, s), Image.LANCZOS).save(os.path.join(sub('icons'), f'icon-{s}.png'))
mk = Image.new('RGBA', (512, 512), (14, 8, 36, 255))
inner = ic.resize((410, 410), Image.LANCZOS); mk.paste(inner, (51, 51), inner)
mk.save(os.path.join(sub('icons'), 'maskable-512.png'))
ic.resize((256,256), Image.LANCZOS).save(os.path.join(sub('img','ui'), 'logo.webp'), 'WEBP', quality=90) if os.path.isdir(os.path.join(OUT,'img','ui')) else None

# --- character spritesheets (v6 24-frame sets). Common square crop => no jitter between clips.
frames = {}
for d in os.listdir(SRC):
    if d.startswith('void-v6-frames'):
        for a in os.listdir(f'{SRC}/{d}/v6/frames'):
            frames[a] = sorted(glob.glob(f'{SRC}/{d}/v6/frames/{a}/*.png'))
fps = json.load(open(f'{SRC}/void-v6-gif-mp4/v6/animations.json'))
CROP = (8, 8, 376, 376)   # union of all alpha boxes + margin, same for every clip
SZ = 144; COLS = 6
meta = {}
report = []
for a, fl in frames.items():
    ims = [Image.open(f).convert('RGBA').crop(CROP).resize((SZ, SZ), Image.LANCZOS) for f in fl]
    # border-clip check + loop seam score
    arr = [np.asarray(i).astype(np.int16) for i in ims]
    edge = max(int(x[:2,:,3].max()) for x in arr)
    seam = float(np.abs(arr[0] - arr[-1]).mean()); step = float(np.mean([np.abs(arr[i]-arr[i+1]).mean() for i in range(len(arr)-1)]))
    report.append((a, len(ims), edge, round(seam,2), round(step,2)))
    rows = (len(ims)+COLS-1)//COLS
    sheet = Image.new('RGBA', (COLS*SZ, rows*SZ), (0,0,0,0))
    for i, im in enumerate(ims): sheet.paste(im, ((i%COLS)*SZ, (i//COLS)*SZ))
    sheet.save(os.path.join(sub('sprites'), a + '.webp'), 'WEBP', quality=84, method=6)
    meta[a] = {'n': len(ims), 'cols': COLS, 'size': SZ, 'fps': fps['fps'].get(a, 12), 'loop': a in fps['loop']}

# --- menu/tap clips (12 frames, 256px) and ability FX (12 frames, 256px)
def clip(files, name, fpsv, loop):
    SZ2 = 224; C = 4
    ims = [Image.open(f).convert('RGBA') for f in files]
    w = max(i.width for i in ims)
    ims = [i.resize((SZ2, SZ2), Image.LANCZOS) for i in ims]
    rows = (len(ims)+C-1)//C
    sh = Image.new('RGBA', (C*SZ2, rows*SZ2), (0,0,0,0))
    for i, im in enumerate(ims): sh.paste(im, ((i%C)*SZ2, (i//C)*SZ2))
    sh.save(os.path.join(sub('sprites'), name + '.webp'), 'WEBP', quality=84, method=6)
    meta[name] = {'n': len(ims), 'cols': C, 'size': SZ2, 'fps': fpsv, 'loop': loop}
for n in ('tap_poke', 'tap_spam', 'idle_alive'):
    clip(sorted(glob.glob(f'{SRC}/V3_3_anim_tap/anim/{n}/*.png')), 'ui_' + n, 10, n == 'idle_alive')
for pk in ('V3_4a_ability_anim', 'V3_4b_ability_anim'):
    for d in glob.glob(f'{SRC}/{pk}/ability_anim/*/'):
        n = os.path.basename(d.rstrip('/'))
        clip(sorted(glob.glob(d + '*.png')), 'fx_' + n, 12, False)
json.dump(meta, open(os.path.join(OUT, 'sprites', 'meta.json'), 'w'))
print('anim, frames, topEdgeAlpha, loopSeamDiff, avgStepDiff')
for r in report: print(r)
