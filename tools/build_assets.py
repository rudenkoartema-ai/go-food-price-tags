#!/usr/bin/env python3
"""
Build vector assets for the GO FOOD price tag generator.

Input : reference sheets (PNG) from the owner + Inter Black Italic (system font, SIL OFL)
Output: src/assets.js  (CommonJS module with traced swoosh/logo paths and glyph outlines)

Everything is converted to vector paths in millimetres (tag-local, y down), so the PDF
stays sharp at any print resolution instead of reusing the ~127 dpi raster of the samples.
"""
import json, math, sys, os, random
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UP = os.path.join(ROOT, 'assets', 'reference') + '/'
SRC = {
    'L': dict(file=UP + 'L_chiabata_69.png', box=(54, 97, 516, 539), mm=(92.0, 88.0)),
    'S': dict(file=UP + 'S_sheet_2.png', box=(93, 137, 507, 465), mm=(83.0, 65.0)),
}
UPS = 8  # supersampling for tracing


def load_tag(fmt):
    s = SRC[fmt]
    im = Image.open(s['file']).convert('RGB')
    x0, y0, x1, y1 = s['box']
    arr = np.asarray(im.crop((x0, y0, x1, y1))).astype(np.float32)
    h, w, _ = arr.shape
    return arr, (s['mm'][0] / w, s['mm'][1] / h)


# ---------------------------------------------------------------- tracing helpers
def smooth_closed(pts, sigma):
    if len(pts) < 8:
        return pts
    out = np.empty_like(pts, dtype=np.float64)
    for k in range(2):
        out[:, k] = ndi.gaussian_filter1d(pts[:, k].astype(np.float64), sigma, mode='wrap')
    return out


def resample_closed(pts, step):
    d = np.sqrt(((np.roll(pts, -1, axis=0) - pts) ** 2).sum(axis=1))
    L = d.sum()
    n = max(8, int(L / step))
    cum = np.concatenate([[0], np.cumsum(d)])
    ext = np.vstack([pts, pts[:1]])
    t = np.linspace(0, L, n, endpoint=False)
    x = np.interp(t, cum, ext[:, 0])
    y = np.interp(t, cum, ext[:, 1])
    return np.stack([x, y], axis=1)


def poly_area(p):
    x, y = p[:, 0], p[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def q_path(pts, fx=1.0, fy=1.0, ox=0.0, oy=0.0, dec=2):
    """closed smooth path through midpoints with the points as quadratic control points"""
    P = np.stack([pts[:, 0] * fx + ox, pts[:, 1] * fy + oy], axis=1)
    n = len(P)
    mids = (P + np.roll(P, -1, axis=0)) / 2.0
    f = lambda v: ('%.*f' % (dec, v)).rstrip('0').rstrip('.') if dec else str(int(round(v)))
    s = 'M%s %s' % (f(mids[-1][0]), f(mids[-1][1]))
    for i in range(n):
        s += 'Q%s %s %s %s' % (f(P[i][0]), f(P[i][1]), f(mids[i][0]), f(mids[i][1]))
    return s + 'Z'


def trace_soft(soft, thr, fx, fy, ox=0.0, oy=0.0, sigma=2.4, step=4.0, min_area=40.0):
    """soft: 2D float image 0..255 (source resolution). returns svg path (mm)."""
    h, w = soft.shape
    big = cv2.resize(soft, (w * UPS, h * UPS), interpolation=cv2.INTER_CUBIC)
    mask = (big > thr).astype(np.uint8) * 255
    cnts, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    if hier is None:
        return ''
    hier = hier[0]
    for i, c in enumerate(cnts):
        pts = c[:, 0, :].astype(np.float64)
        if len(pts) < 12 or abs(poly_area(pts)) < min_area * UPS * UPS / 16:
            continue
        pts = smooth_closed(pts, sigma)
        pts = resample_closed(pts, step)
        is_hole = hier[i][3] != -1
        a = poly_area(pts)
        # outer contours: positive area, holes: negative (non-zero fill rule works)
        if (a < 0 and not is_hole) or (a > 0 and is_hole):
            pts = pts[::-1]
        parts.append(q_path(pts, fx / UPS, fy / UPS, ox, oy))
    return ''.join(parts)


# ---------------------------------------------------------------- swoosh + logo from samples
def lum_min(arr):
    return arr.min(axis=2)


def lime_soft(arr, loose=False):
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    # "limeness": green dominance over red and blue
    v = np.minimum(g - 0.55 * r, g - 1.1 * b)
    if loose:
        v = v * 1.25
    return np.clip(v * 2.2, 0, 255).astype(np.float32)


def find_swoosh(arr):
    h, w, _ = arr.shape
    white = lum_min(arr) > 170
    lab, n = ndi.label(white)
    best, bw = None, 0
    for i, sl in enumerate(ndi.find_objects(lab)):
        wid = sl[1].stop - sl[1].start
        if wid > bw:
            bw, best = wid, i + 1
    reg = ndi.binary_dilation(lab == best, iterations=4)
    soft = np.where(reg, lum_min(arr), 0).astype(np.float32)
    return soft


def ring_of(arr):
    """fit the lime ring of the logo: returns cx, cy, r (px) from the biggest lime component"""
    lime = lime_soft(arr) > 90
    lab, n = ndi.label(ndi.binary_closing(lime, iterations=1))
    best, ba = None, 0
    for i, sl in enumerate(ndi.find_objects(lab)):
        bw = sl[1].stop - sl[1].start
        bh = sl[0].stop - sl[0].start
        if bw * bh > ba and bw > 60 and abs(bw - bh) < 12:
            ba, best = bw * bh, sl
    sl = best
    cx = (sl[1].start + sl[1].stop) / 2.0
    cy = (sl[0].start + sl[0].stop) / 2.0
    r = ((sl[1].stop - sl[1].start) + (sl[0].stop - sl[0].start)) / 4.0
    return cx, cy, r


out = {'tags': {}, 'fonts': {}}

for fmt in ('L', 'S'):
    arr, (sx, sy) = load_tag(fmt)
    h, w, _ = arr.shape
    sw = trace_soft(find_swoosh(arr), 140, sx, sy)
    cx, cy, r = ring_of(arr)
    out['tags'][fmt] = dict(
        w=SRC[fmt]['mm'][0], h=SRC[fmt]['mm'][1], swoosh=sw,
        logo=dict(cx=round(cx * sx, 2), cy=round(cy * sy, 2), r=round(r * sx, 2)),
        lime=[int(round(v)) for v in np.median(arr[(lime_soft(arr) > 120) & (arr[..., 0] > 100)], axis=0)],
        white=[int(round(v)) for v in np.median(arr[lum_min(arr) > 215], axis=0)],
    )
    if fmt == 'L':
        # master logo, relative to ring centre, in mm at L scale
        R = int(r + 3)
        x0, y0 = int(round(cx)) - R, int(round(cy)) - R
        sub = arr[y0:y0 + 2 * R, x0:x0 + 2 * R]
        ccx, ccy = cx - x0, cy - y0
        yy, xx = np.mgrid[0:sub.shape[0], 0:sub.shape[1]]
        dist = np.hypot(xx - ccx, (yy - ccy))
        inner = dist < (r - 3.0)            # inside the ring
        white_soft = np.where(inner & (yy < ccy + 0.30 * r), lum_min(sub), 0).astype(np.float32)
        lime_s = np.where(inner, lime_soft(sub, loose=True), 0).astype(np.float32)
        ox, oy = -ccx * sx, -ccy * sy
        out['logo'] = dict(
            r=round(r * sx, 3),
            ringW=0.55,
            white=trace_soft(white_soft, 150, sx, sy, ox, oy, sigma=2.0, step=3.5),
            lime=trace_soft(lime_s, 105, sx, sy, ox, oy, sigma=2.0, step=3.5),
        )
        # tiny caption position relative to ring centre (white text under FOOD)
        cap = np.where(inner & (yy > ccy + 0.30 * r), lum_min(sub), 0)
        ys, xs = np.nonzero(cap > 150)
        out['logo']['caption'] = dict(
            cx=round(((xs.min() + xs.max()) / 2.0 - ccx) * sx, 2),
            baseline=round((ys.max() - ccy) * sy, 2),
            width=round((xs.max() - xs.min()) * sx, 2),
            cap=round((ys.max() - ys.min()) * sy, 2),
        )

# ---------------------------------------------------------------- glyph outlines
FONT = '/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf'
font = TTFont(FONT)
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font['head'].unitsPerEm
K = 1000.0 / upm


def flatten(glyph_name, step=7.0):
    pen = RecordingPen()
    gs[glyph_name].draw(pen)
    contours, cur, pos = [], [], None

    def cubic(p0, p1, p2, p3):
        L = math.dist(p0, p1) + math.dist(p1, p2) + math.dist(p2, p3)
        n = max(4, int(L * K / step))
        for i in range(1, n + 1):
            t = i / n
            u = 1 - t
            x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0]
            y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]
            cur.append((x * K, y * K))

    for op, a in pen.value:
        if op == 'moveTo':
            cur = [(a[0][0] * K, a[0][1] * K)]
            pos = a[0]
        elif op == 'lineTo':
            p0, p1 = pos, a[0]
            n = max(1, int(math.dist(p0, p1) * K / step))
            for i in range(1, n + 1):
                t = i / n
                cur.append(((p0[0] + (p1[0] - p0[0]) * t) * K, (p0[1] + (p1[1] - p0[1]) * t) * K))
            pos = p1
        elif op == 'curveTo':
            cubic(pos, a[0], a[1], a[2])
            pos = a[2]
        elif op == 'qCurveTo':
            raise SystemExit('quadratic outlines not expected in Inter OTF')
        elif op in ('closePath', 'endPath'):
            if len(cur) > 2:
                contours.append(np.array(cur, dtype=np.float64))
            cur = []
    return contours


def noise_closed(n_pts, L, lam, rng):
    k = max(3, int(L / lam))
    vals = rng.uniform(-1, 1, k)
    s = np.linspace(0, k, n_pts, endpoint=False)
    i0 = np.floor(s).astype(int) % k
    i1 = (i0 + 1) % k
    f = s - np.floor(s)
    f = (1 - np.cos(np.pi * f)) / 2
    return vals[i0] * (1 - f) + vals[i1] * f


def process_glyph(name, xscale, rough, seed, emb, shear=0.0, emit_step=12.0):
    cs = flatten(name)
    rng = np.random.default_rng(seed)
    if not cs:
        return []
    # orientation of the glyph's dominant (outer) contour: right-hand normal expands the fill when outer is CCW
    areas = [poly_area(c) for c in cs]
    outer_sign = 1.0 if areas[int(np.argmax(np.abs(areas)))] > 0 else -1.0
    parts = []
    for c in cs:
        c = c.copy()
        c[:, 0] *= xscale
        c[:, 0] += c[:, 1] * shear
        c = resample_closed(c, 5.0)
        t = np.roll(c, -1, axis=0) - np.roll(c, 1, axis=0)
        nrm = np.stack([t[:, 1], -t[:, 0]], axis=1) * outer_sign
        nrm /= (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9)
        # smooth normals a little so corners do not spike when emboldened
        nrm = np.stack([ndi.gaussian_filter1d(nrm[:, 0], 1.5, mode='wrap'), ndi.gaussian_filter1d(nrm[:, 1], 1.5, mode='wrap')], axis=1)
        nrm /= (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9)
        d = np.full(len(c), float(emb))
        if rough > 0:
            L = np.sqrt(((np.roll(c, -1, axis=0) - c) ** 2).sum(axis=1)).sum()
            d = d + (0.62 * noise_closed(len(c), L, 70, rng) + 0.38 * noise_closed(len(c), L, 22, rng)) * rough
        c = c + nrm * d[:, None]
        c = resample_closed(c, emit_step)
        parts.append(c)
    return parts


def glyph_table(chars, xscale, rough, seedbase, emb, tracking=0, shear=0.0):
    tab = {}
    for ch in chars:
        gname = cmap.get(ord(ch))
        if gname is None:
            continue
        adv = gs[gname].width * K * xscale + tracking
        parts = process_glyph(gname, xscale, rough, seedbase + ord(ch), emb, shear)
        d = ''
        for p in parts:
            # keep the original orientation: holes must stay opposite to outer contours (non-zero fill)
            d += q_path(p, 1, 1, 0, 0, dec=0)
        ent = dict(adv=round(adv, 1), d=d)
        if parts:
            allx = np.concatenate([q[:, 0] for q in parts])
            ent['bb'] = [round(float(allx.min()), 1), round(float(allx.max()), 1)]
        tab[ch] = ent
    return tab


CYR = 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯЪЫЭЁ'
LAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
DIG = '0123456789'
PUN = " -.,'’!?&%+/():;№«»\"*="
NAME_CHARS = CYR + LAT + DIG + PUN + 'by'
ROUGH = float(os.environ.get('ROUGH', '8'))

XN = float(os.environ.get('XN', '0.48'))
SH_N = float(os.environ.get('SH_N', '0.10'))
SH_P = float(os.environ.get('SH_P', '0.22'))
XP = float(os.environ.get('XP', '0.86'))
EMB_N = float(os.environ.get('EMB_N', '10'))
EMB_P = float(os.environ.get('EMB_P', '5'))
name_tab = glyph_table(NAME_CHARS, xscale=XN, rough=ROUGH, seedbase=1000, emb=EMB_N, tracking=6, shear=SH_N)
price_tab = glyph_table(DIG + ' ', xscale=XP, rough=ROUGH * 1.1, seedbase=5000, emb=EMB_P, tracking=-6, shear=SH_P)


def metrics(tab_src_chars, xscale):
    bp = BoundsPen(gs)
    gs[cmap[ord('H')]].draw(bp)
    cap = bp.bounds[3] * K
    bp = BoundsPen(gs)
    gs[cmap[ord('0')]].draw(bp)
    dig = (bp.bounds[3] - bp.bounds[1]) * K
    return cap, dig


cap, dig = metrics(None, 1)
out['fonts'] = dict(
    upm=1000, cap=round(cap, 1), digit=round(dig, 1),
    name=name_tab, price=price_tab,
)

js = '// GENERATED by tools/build_assets.py - do not edit by hand\nmodule.exports = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
with open(os.path.join(ROOT, 'src', 'assets.js'), 'w', encoding='utf-8') as f:
    f.write(js)
print('assets.js: %.0f KB' % (len(js) / 1024))
print('cap', cap, 'digit', dig)
for fmt in ('L', 'S'):
    t = out['tags'][fmt]
    print(fmt, 'logo', t['logo'], 'lime', t['lime'], 'white', t['white'], 'swoosh bytes', len(t['swoosh']))
print('master logo r', out['logo']['r'], 'white bytes', len(out['logo']['white']), 'lime bytes', len(out['logo']['lime']), out['logo']['caption'])
