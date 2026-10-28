#!/usr/bin/env python3
"""glyphs_raw.pkl -> build/fonts.json (real brush glyphs from the owner's sheets + synthesised missing ones)"""
import sys, os, pickle, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, cv2
from glyph_common import ROOT

d = pickle.load(open(os.path.join(ROOT, 'build', 'glyphs_raw.pkl'), 'rb'))
S = 0.5            # raster px per unit
PADU = 300         # unit padding
H_U = 1800         # raster height in units (y from -400 .. 1400)
Y0 = 1400


def best(table, ch):
    return max(table[ch], key=lambda i: i['cap_px'])


def to_mask(inst, ox=0.0):
    w = int((inst['w'] + 2 * PADU) * S) + 4
    img = np.zeros((int(H_U * S), w), np.uint8)
    for p, hole in inst['polys']:
        q = np.stack([(p[:, 0] + PADU + ox) * S, (Y0 - p[:, 1]) * S], 1).astype(np.int32)
        cv2.fillPoly(img, [q], 0 if hole else 255)
    return img


def mask_canvas(w_u):
    return np.zeros((int(H_U * S), int((w_u + 2 * PADU) * S) + 4), np.uint8)


def poly_fill(img, pts):
    q = np.array([[(x + PADU) * S, (Y0 - y) * S] for x, y in pts], np.int32)
    cv2.fillPoly(img, [q], 255)


def ellipse(img, cx, cy, rx, ry, ang=0):
    cv2.ellipse(img, (int((cx + PADU) * S), int((Y0 - cy) * S)), (int(rx * S), int(ry * S)), -ang, 0, 360, 255, -1)


def mask_to_inst(img, name):
    big = cv2.resize(img, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    big = cv2.GaussianBlur(big, (0, 0), 3.0)
    cs, hier = cv2.findContours((big > 127).astype(np.uint8) * 255, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    polys = []
    allx = []
    for i, c in enumerate(cs):
        if cv2.contourArea(c) < 200:
            continue
        p = c[:, 0, :].astype(float)
        # px(big) -> units
        x = (p[:, 0] / 4 / S) - PADU
        y = Y0 - p[:, 1] / 4 / S
        polys.append((np.stack([x, y], 1), hier[0][i][3] != -1))
        allx.append(x)
    ax = np.concatenate(allx)
    x0 = ax.min()
    polys = [(np.stack([p[:, 0] - x0, p[:, 1]], 1), h) for p, h in polys]
    return dict(polys=polys, w=float(ax.max() - x0), cap_px=0)


def row_cols(img, y_u0, y_u1):
    r0, r1 = int((Y0 - y_u1) * S), int((Y0 - y_u0) * S)
    xs = np.nonzero(img[r0:r1].any(axis=0))[0]
    return (xs.min() / S - PADU, xs.max() / S - PADU) if len(xs) else (0, 0)


L = d['glyphs']
G = {}
for ch in L:
    G[ch] = best(L, ch)

# Latin look-alikes use the Cyrillic glyph (real Latin-only ones, N I R S, stay as extracted)
LOOK = {'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'H': 'Н', 'K': 'К', 'M': 'М', 'O': 'О', 'P': 'Р', 'T': 'Т', 'X': 'Х', 'Y': 'У'}
for lat, cyr in LOOK.items():
    G[lat] = G[cyr]

# ---- synthesised glyphs
# Ь : Б without its top bar
m = to_mask(G['Б'])
x0, x1 = row_cols(m, 0, 1000)
cut = np.zeros_like(m)
m2 = m.copy()
m2[: int((Y0 - 790) * S), int((PADU + 0.30 * G['Б']['w']) * S):] = 0
G['Ь'] = mask_to_inst(m2, 'Ь')

# Ї : І + two dots
m = to_mask(G['І'])
tx0, tx1 = row_cols(m, 880, 1000)
cx = (tx0 + tx1) / 2.0
for dx in (-105, 105):
    ellipse(m, cx + dx + 40, 1115, 55, 68, -12)
G['Ї'] = mask_to_inst(m, 'Ї')

# Ґ : Г + spur at the top right
m = to_mask(G['Г'])
gx0, gx1 = row_cols(m, 900, 1000)
poly_fill(m, [(gx1 - 170, 960), (gx1 + 10, 960), (gx1 + 55, 1135), (gx1 - 95, 1120)])
G['Ґ'] = mask_to_inst(m, 'Ґ')

# Є : С + middle bar
m = to_mask(G['С'])
w = G['С']['w']
a0, a1 = row_cols(m, 430, 570)
poly_fill(m, [(0.33 * w, 430), (0.78 * w, 440), (0.80 * w, 560), (0.35 * w, 550)])
G['Є'] = mask_to_inst(m, 'Є')

# Щ : Ш + the tail of Ц
c = G['Ц']; m_c = to_mask(c)
t0, t1 = row_cols(m_c, -380, -40)
sh = G['Ш']; m = to_mask(sh)
sx0, sx1 = row_cols(m, 100, 800)
r0 = int((Y0 - 60) * S)
shift = int((sx1 - t1 + 30) * S)
tail = np.zeros_like(m)
src = m_c[r0:, :]
for x in range(src.shape[1]):
    xx = x + shift
    if 0 <= xx < tail.shape[1]:
        tail[r0:, xx] = src[:, x]
m = np.maximum(m, tail)
G['Щ'] = mask_to_inst(m, 'Щ')

# hyphen and apostrophe
m = mask_canvas(380)
poly_fill(m, [(40, 360), (360, 440), (350, 590), (30, 510)])
G['-'] = mask_to_inst(m, '-')
m = mask_canvas(150)
poly_fill(m, [(60, 760), (170, 790), (230, 1000), (110, 990)])
G["'"] = mask_to_inst(m, "'")
G['’'] = G["'"]
m = mask_canvas(150)
ellipse(m, 75, 70, 70, 75, -10)
G['.'] = mask_to_inst(m, '.')
m = mask_canvas(150)
ellipse(m, 75, 70, 70, 75, -10)
poly_fill(m, [(40, 20), (120, 60), (20, -170), (-40, -140)])
G[','] = mask_to_inst(m, ',')

# ---- digits
D = {ch: best(d['digs'], ch) for ch in d['digs']}
wd = np.median([D[k]['w'] for k in '2345678'])
o = G['О']
sx = wd / o['w']
polys = [(np.stack([p[:, 0] * sx, p[:, 1]], 1), h) for p, h in o['polys']]
D['0'] = dict(polys=polys, w=o['w'] * sx, cap_px=0)

GAP_N = float(os.environ.get('GAP_N', '60'))
GAP_D = float(os.environ.get('GAP_D', '95'))
SPACE = float(os.environ.get('SPACE', '300'))


def q_path(pts, dec=0):
    P = pts
    mids = (P + np.roll(P, -1, axis=0)) / 2.0
    f = lambda v: str(int(round(v)))
    s = 'M%s %s' % (f(mids[-1][0]), f(mids[-1][1]))
    for i in range(len(P)):
        s += 'Q%s %s %s %s' % (f(P[i][0]), f(P[i][1]), f(mids[i][0]), f(mids[i][1]))
    return s + 'Z'


def emit(inst, gap):
    dd = ''
    xs = []
    for p, hole in inst['polys']:
        # thin out: keep ~every 2nd point for compact output
        pp = p[:: 2] if len(p) > 80 else p
        dd += q_path(pp)
        xs.append(pp[:, 0])
    ax = np.concatenate(xs)
    return dict(adv=round(float(inst['w'] + gap), 1), d=dd, bb=[round(float(ax.min()), 1), round(float(ax.max()), 1)])


def profiles(inst):
    m = to_mask(inst)
    ys = np.arange(0, 1001, 10)
    Lr = np.full(len(ys), np.nan); Rr = np.full(len(ys), np.nan)
    for i, y in enumerate(ys):
        r = int((Y0 - y) * S)
        xs = np.nonzero(m[min(r, m.shape[0] - 1)] > 0)[0]
        if len(xs):
            Lr[i] = xs.min() / S - PADU; Rr[i] = xs.max() / S - PADU
    return Lr, Rr


def kern_table(G_, gap):
    prof = {c: profiles(g) for c, g in G_.items()}
    out = {}
    for a, (La, Ra) in prof.items():
        for b, (Lb, Rb) in prof.items():
            v = Ra - Lb
            v = v[~np.isnan(v)]
            if len(v):
                out[a + b] = round(float(v.max() + gap), 1)
    return out


for dch, dg in D.items():
    G[dch] = dg   # digits inside product names use the same brush digits
name = {ch: emit(g, GAP_N) for ch, g in G.items()}
name[' '] = dict(adv=SPACE)
price = {ch: emit(g, GAP_D) for ch, g in D.items()}
price[' '] = dict(adv=300)
kern_n = kern_table({c: g for c, g in G.items() if c not in ",.'’-"}, GAP_N)
kern_p = kern_table(D, GAP_D)
out = dict(upm=1000, cap=1000, digit=1000, name=name, price=price, kern=dict(name=kern_n, price=kern_p))
json.dump(out, open(os.path.join(ROOT, "build", "fonts.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(',', ':'))
print('fonts.json: %d KB; name chars: %s; digits: %s' % (os.path.getsize(os.path.join(ROOT, 'build', 'fonts.json')) // 1024, ''.join(sorted(name)), ''.join(sorted(price))))
# contact sheet of synthesised ones
