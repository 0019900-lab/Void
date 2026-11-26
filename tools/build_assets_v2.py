#!/usr/bin/env python3
"""v2 asset builder (platformer). Raw packs extracted under S2 (new packs) and S1 (old packs).
Usage: python3 tools/build_assets_v2.py <S1> <S2> <OUT>"""
import sys, os, glob, json
from PIL import Image
import numpy as np
S1, S2, OUT = sys.argv[1:4]
def sub(*p):
    d = os.path.join(OUT, *p); os.makedirs(d, exist_ok=True); return d
meta = {}
def frames(pattern): return sorted(glob.glob(pattern))
# ---- union crop for all Void character frames (same crop => no jitter / no scale pops)
char = {}
for a in ('idle','move','dash','swallow','hurt','heavy'): char[a] = frames(f'{S2}/Void_anim_1/{a}/*.png')
for a in ('win','sleep','respawn','dizzy','death','checkpoint'): char[a] = frames(f'{S2}/Void_anim_2/{a}/*.png')
for d in ('left','right','up','down'): char['move_'+d] = frames(f'{S2}/V3_5_dir_move/directional/move_{d}/*.png')
x0=y0=999; x1=y1=0
for fl in char.values():
    for f in fl[::3]:
        bb = Image.open(f).convert('RGBA').split()[3].point(lambda v: 255 if v > 25 else 0).getbbox()
        x0=min(x0,bb[0]);y0=min(y0,bb[1]);x1=max(x1,bb[2]);y1=max(y1,bb[3])
cx, cy = (x0+x1)//2, (y0+y1)//2; half = max(x1-x0, y1-y0)//2 + 6
CROP = (cx-half, cy-half, cx+half, cy+half); print('char crop', CROP)
def sheet(files, name, size, cols, fps, loop, crop=None, q=84):
    ims = []
    for f in files:
        im = Image.open(f).convert('RGBA')
        if crop: im = im.crop(crop)
        ims.append(im.resize((size, size), Image.LANCZOS))
    rows = (len(ims)+cols-1)//cols; sh = Image.new('RGBA', (cols*size, rows*size), (0,0,0,0))
    for i, im in enumerate(ims): sh.paste(im, ((i%cols)*size, (i//cols)*size))
    sh.save(os.path.join(sub('sprites'), name+'.webp'), 'WEBP', quality=q, method=6)
    meta[name] = {'n': len(ims), 'cols': cols, 'size': size, 'fps': fps, 'loop': loop}
FPS = {'idle':10,'sleep':8,'move':14,'move_left':14,'move_right':14,'move_up':12,'move_down':12,'heavy':10,'dizzy':12}
LOOP = {'idle','sleep','heavy','dizzy','move','move_left','move_right'}
for a, fl in char.items(): sheet(fl, a, 168, 6, FPS.get(a, 12), a in LOOP, CROP)
# ---- menu tap clips (224)
for n in ('tap_poke','tap_spam','idle_alive'): sheet(frames(f'{S2}/Void_tap_idle/{n}/*.png'), 'ui_'+n, 224, 4, 10, False, CROP)
# ---- effects + objects (tight per-group crop)
def groupcrop(fls):
    x0=y0=999;x1=y1=0
    for f in fls[::2]:
        bb = Image.open(f).convert('RGBA').split()[3].point(lambda v: 255 if v > 25 else 0).getbbox()
        if bb: x0=min(x0,bb[0]);y0=min(y0,bb[1]);x1=max(x1,bb[2]);y1=max(y1,bb[3])
    cx,cy=(x0+x1)//2,(y0+y1)//2;h=max(x1-x0,y1-y0)//2+4; return (cx-h,cy-h,cx+h,cy+h)
for g, names in (('effects',('dash','swallow','shield','phase','time','burst')),('objects',('checkpoint','exit','matter','mine','pulse','current'))):
    for n in names:
        fl = frames(f'{S2}/Void_{g}/{g}/{n}/*.png'); sheet(fl, ('fx_' if g=='effects' else 'ob_')+n, 160, 6, 12, True, None if g=='effects' else groupcrop(fl))
json.dump(meta, open(os.path.join(sub('sprites'),'meta.json'),'w'))
# ---- story slides: keep native aspect, cut the baked-in dialogue boxes (art only)
for f in frames(f'{S1}/V3_1c_story_slides/story/slides/*.jpg'):
    im = Image.open(f).convert('RGB'); a = np.asarray(im.convert('L')).astype(float); s = a.std(axis=1); h = len(s)
    end = next((i for i in range(int(h*.45), h-6) if s[i:i+6].max() < 16), h)
    art = im.crop((7, 5, im.width-7, max(200, end-4)))
    art.save(os.path.join(sub('img','story'), os.path.basename(f)[:-4]+'.webp'), 'WEBP', quality=80, method=6)
# ---- screens backgrounds
for f in glob.glob(f'{S2}/Void_screens_bgs_v5/*/bgs/*.jpg'):
    Image.open(f).convert('RGB').resize((1280,720), Image.LANCZOS).save(os.path.join(sub('img','bg'), os.path.basename(f)[:-4]+'.webp'),'WEBP',quality=78,method=6)
print('ok')
