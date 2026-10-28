import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from glyph_common import *
W = '/tmp/claude-0/-home-claude/526cf247-ef25-5533-afc4-cd4c268c5e7f/scratchpad/work/'

def name_components(arr):
    h, w, _ = arr.shape
    cx, cy, r = ring_circle(arr)
    wh = white_soft(arr) > 0.45
    lab, n = ndi.label(wh, structure=np.ones((3, 3)))
    objs = ndi.find_objects(lab)
    comps = []
    for i, sl in enumerate(objs):
        m = lab[sl] == i + 1
        area = int(m.sum())
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        ccx, ccy = (x0 + x1) / 2, (y0 + y1) / 2
        if area < 25: continue
        if np.hypot(ccx - cx, ccy - cy) < r * 1.12: continue          # logo
        comps.append(dict(i=i + 1, sl=sl, area=area, bbox=(x0, y0, x1, y1)))
    # swoosh = the widest component
    sw = max(comps, key=lambda c: c['bbox'][2] - c['bbox'][0])
    comps = [c for c in comps if c is not sw]
    return comps, sw, (cx, cy, r), lab

if __name__ == '__main__':
    out = []
    for key, s in SHEETS.items():
        for i in range(len(s['boxes'])):
            arr, pxmm = tag_array(key, i)
            comps, sw, circ, lab = name_components(arr)
            exp = s['names'][i]
            nlet = sum(len(t.replace(' ', '')) for t in exp)
            print(key, i, exp, 'expected letters', nlet, 'components', len(comps), 'swoosh w=%.0f' % (sw['bbox'][2] - sw['bbox'][0]))
            h, w, _ = arr.shape
            im = Image.fromarray(arr.astype(np.uint8)).resize((w * 2, h * 2), Image.NEAREST)
            d = ImageDraw.Draw(im)
            for k, c in enumerate(sorted(comps, key=lambda c: (c['bbox'][1] // 40, c['bbox'][0]))):
                x0, y0, x1, y1 = [v * 2 for v in c['bbox']]
                d.rectangle([x0, y0, x1, y1], outline=(255, 60, 60), width=1)
            x0, y0, x1, y1 = [v * 2 for v in sw['bbox']]
            d.rectangle([x0, y0, x1, y1], outline=(60, 160, 255), width=1)
            out.append(im)
    # contact: only the S sheets + L at half size
    ims = out
    cw = max(i.width for i in ims); ch = max(i.height for i in ims)
    cols = 4; rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (cw + 6), rows * (ch + 6)), (60, 60, 60))
    for k, im in enumerate(ims): sheet.paste(im, ((k % cols) * (cw + 6), (k // cols) * (ch + 6)))
    sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
    sheet.save(W + 'seg_debug.png'); print(sheet.size)
