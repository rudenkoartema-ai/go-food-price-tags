"""Shared definitions for extracting real glyphs from the owner's reference sheets."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'assets', 'reference') + '/'

# tag boxes in source pixels (x0, y0, x1, y1) and the real physical size (mm) measured earlier
SHEETS = {
    'L1': dict(file='L_chiabata_69.png', fmt='L', mm=(92.0, 88.0), boxes=[(54, 97, 516, 539)],
               names=[['ЧІАБАТА']], prices=['69']),
    'L2': dict(file='L_croissant_69.png', fmt='L', mm=(95.1, 90.2), boxes=[(39, 81, 517, 534)],
               names=[['КРУАСАН', 'КУРКА СИР']], prices=['69']),
    'SA': dict(file='S_sheet_2.png', fmt='S', mm=(82.9, 65.4),
               boxes=[(93, 137, 507, 465), (543, 137, 962, 465), (93, 491, 507, 820), (543, 491, 962, 820),
                      (94, 847, 507, 1155), (543, 847, 962, 1155), (94, 1181, 507, 1471), (543, 1181, 962, 1471)],
               names=[['ШОКОСЕНДВІЧ'], ['КРУАСАН', 'З НАЧИНКОЮ'], ['КРУАСАН', 'ПУСТИЙ'], ['ПАНКЕЙК'],
                      ['МАКАРОНС'], ['КУКІС'], ['АРАХІСОВИЙ', 'БАТОНЧИК'], ['ЦУКЕРКИ', 'KORISNI']],
               prices=['29', '35', '27', '29', '65', '12', '14', '55']),
    'SB': dict(file='S_sheet_1.png', fmt='S', mm=(79.8, 61.5),
               boxes=[(112, 157, 511, 466), (539, 157, 941, 466), (112, 489, 511, 793), (539, 489, 941, 793),
                      (112, 816, 511, 1116), (539, 816, 941, 1116), (112, 1139, 511, 1429), (539, 1139, 941, 1429)],
               names=[['ЕКЛЕР'], ['ПЕЧИВО З', 'ПЕРЕДБАЧЕННЯМ'], ['ВАФЛІ', 'НЕСКВІК'], ['ГОРІШОК'],
                      ['ДОНАТ'], ['ЖЕЛЕЙНІ', 'ЦУКЕРКИ'], ['ЗВІРЯТКО'], ['КРУАСАН']],
               prices=['45', '17', '14', '15', '45', '99', '15', '18']),
}
A4_PXMM_X = None  # px/mm is taken per sheet: image width / 210

def load_sheet(key):
    s = SHEETS[key]
    im = Image.open(REF + s['file']).convert('RGB')
    return im, s

def tag_array(key, i):
    im, s = load_sheet(key)
    x0, y0, x1, y1 = s['boxes'][i]
    arr = np.asarray(im.crop((x0, y0, x1, y1))).astype(np.float32)
    h, w, _ = arr.shape
    pxmm = ((x1 - x0) / s['mm'][0] + (y1 - y0) / s['mm'][1]) / 2.0  # px per mm of this tag
    return arr, pxmm

def white_soft(arr):
    m = arr.min(axis=2)
    return np.clip((m - 70.0) / (215.0 - 70.0), 0, 1)

def lime_soft(arr):
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    v = np.minimum(g - 0.55 * r, g - 1.1 * b)
    return np.clip(v * 2.2 / 255.0, 0, 1)

def ring_circle(arr):
    """centre/radius (px) of the lime ring of the logo, found as the big roundish lime component"""
    lime = lime_soft(arr) > 0.35
    lab, n = ndi.label(ndi.binary_closing(lime, iterations=1))
    best, ba = None, 0
    for i, sl in enumerate(ndi.find_objects(lab)):
        bw = sl[1].stop - sl[1].start; bh = sl[0].stop - sl[0].start
        if bw * bh > ba and bw > 50 and abs(bw - bh) < 14:
            ba, best = bw * bh, sl
    sl = best
    return ((sl[1].start + sl[1].stop) / 2.0, (sl[0].start + sl[0].stop) / 2.0,
            ((sl[1].stop - sl[1].start) + (sl[0].stop - sl[0].start)) / 4.0)
