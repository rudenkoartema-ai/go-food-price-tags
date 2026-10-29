#!/usr/bin/env python3
"""
Extract the REAL letters and digits from the owner's reference sheets.

  names : white brush letters  -> rotated back to a horizontal baseline, normalised to cap height = 1000
  digits: lime brush digits    -> normalised to digit height = 1000
  gaps  : measured letter-to-letter spacing, so the generator can reproduce the original rhythm

Output: build/glyphs_raw.pkl  (consumed by tools/build_glyphs.py)  + contact sheets in the scratchpad.
"""
import sys, os, math, pickle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import cv2
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from glyph_common import *

UPS = 8
SCR = '/tmp/claude-0/-home-claude/526cf247-ef25-5533-afc4-cd4c268c5e7f/scratchpad/work/'
LOG = []


def log(*a):
    s = ' '.join(str(x) for x in a)
    LOG.append(s)
    print(s)


# ------------------------------------------------------------------ components
def components(soft, thr, min_area, exclude=None):
    mask = soft > thr
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    out = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        m = lab[sl] == i + 1
        area = int(m.sum())
        if area < min_area:
            continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
        if exclude and exclude(cx, cy, (x0, y0, x1, y1)):
            continue
        out.append(dict(id=i + 1, bbox=(x0, y0, x1, y1), area=area, cx=cx, cy=cy))
    return lab, out


def contours_of(alpha_hi, thr=0.5):
    """alpha_hi: float 0..1 image (already upscaled). returns list of (pts Nx2 float, is_hole)"""
    m = (alpha_hi > thr).astype(np.uint8) * 255
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    res = []
    if hier is None:
        return res
    for i, c in enumerate(cs):
        if len(c) < 12 or cv2.contourArea(c) < 6 * UPS * UPS:
            continue
        res.append((c[:, 0, :].astype(np.float64), hier[0][i][3] != -1))
    return res


def smooth_closed(pts, sigma):
    out = np.empty_like(pts)
    for k in range(2):
        out[:, k] = ndi.gaussian_filter1d(pts[:, k], sigma, mode='wrap')
    return out


def resample_closed(pts, step):
    d = np.sqrt(((np.roll(pts, -1, axis=0) - pts) ** 2).sum(axis=1))
    L = d.sum()
    n = max(8, int(L / step))
    cum = np.concatenate([[0], np.cumsum(d)])
    ext = np.vstack([pts, pts[:1]])
    t = np.linspace(0, L, n, endpoint=False)
    return np.stack([np.interp(t, cum, ext[:, 0]), np.interp(t, cum, ext[:, 1])], axis=1)


def glyph_polys(soft, lab, ids, pad=3):
    """smooth polygons (source-pixel coordinates, float) of the union of components `ids`"""
    ys, xs = np.nonzero(np.isin(lab, ids))
    x0, x1, y0, y1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, soft.shape[1]), max(ys.min() - pad, 0), min(ys.max() + pad + 1, soft.shape[0])
    region = np.isin(lab[y0:y1, x0:x1], ids)
    region = ndi.binary_dilation(region, iterations=2)  # keep the anti-aliased edge of this glyph, not the neighbours'
    a = np.where(region, soft[y0:y1, x0:x1], 0).astype(np.float32)
    big = cv2.resize(a, ((x1 - x0) * UPS, (y1 - y0) * UPS), interpolation=cv2.INTER_CUBIC)
    polys = []
    for pts, hole in contours_of(big, 0.5):
        pts = smooth_closed(pts, 2.2)
        pts = resample_closed(pts, 4.0)
        # to source px coordinates (pixel centres)
        pts = np.stack([(pts[:, 0] + 0.5) / UPS + x0 - 0.5, (pts[:, 1] + 0.5) / UPS + y0 - 0.5], axis=1)
        polys.append((pts, hole))
    return polys


def theil_sen(x, y):
    x = np.asarray(x); y = np.asarray(y)
    sl = []
    for i in range(len(x)):
        for j in range(i + 1, len(x)):
            if abs(x[j] - x[i]) > 4:
                sl.append((y[j] - y[i]) / (x[j] - x[i]))
    a = float(np.median(sl)) if sl else 0.0
    b = float(np.median(y - a * x))
    return a, b


def rot(pts, th, c):
    """rotate points by angle th (radians, math sense in image coords y-down) about c"""
    ca, sa = math.cos(th), math.sin(th)
    d = pts - c
    return np.stack([d[:, 0] * ca - d[:, 1] * sa, d[:, 0] * sa + d[:, 1] * ca], axis=1)


# ------------------------------------------------------------------ names
DESC = set('ДЦЩ')          # letters with a tail below the baseline
SKIP_CAP = set('ДЦЩЙЇ-')    # not used for cap-height estimation


def split_lines(comps, nlines):
    if nlines == 1:
        return [comps], 0.0
    deg = -5.5
    th = math.radians(deg)
    med = np.median([c['area'] for c in comps])
    big = [c for c in comps if c['area'] > 0.35 * med]
    ysb = sorted((-c['cx'] * math.sin(th) + c['cy'] * math.cos(th)) for c in big)
    gaps = [(ysb[i + 1] - ysb[i], (ysb[i + 1] + ysb[i]) / 2) for i in range(len(ysb) - 1)]
    cut = max(gaps)[1]
    la, lb = [], []
    for c in comps:
        y = -c['cx'] * math.sin(th) + c['cy'] * math.cos(th)
        (la if y < cut else lb).append(c)
    return [la, lb], deg


def process_name_line(text, comps, th_deg, soft, lab, scale_info):
    """returns list of dict(char, polys(normalised), ...) for letters that could be assigned unambiguously"""
    letters = [ch for ch in text if ch != ' ']
    big_area = np.median([c['area'] for c in comps]) if comps else 0
    big = [c for c in comps if c['area'] > 0.18 * big_area]
    small = [c for c in comps if c not in big]
    big.sort(key=lambda c: c['cx'] * math.cos(math.radians(th_deg)) + c['cy'] * (-math.sin(math.radians(th_deg))))
    # attach small fragments (breve of Й, stray bits) to the big component they overlap in x
    groups = [[c] for c in big]
    for s in small:
        best, bd = None, 1e9
        for g in groups:
            gx0 = min(c['bbox'][0] for c in g); gx1 = max(c['bbox'][2] for c in g)
            d = 0 if gx0 <= s['cx'] <= gx1 else min(abs(s['cx'] - gx0), abs(s['cx'] - gx1))
            if d < bd:
                best, bd = g, d
        if best is not None and bd < 0.25 * np.sqrt(big_area):
            best.append(s)
    return letters, groups


def normalise_line(groups, letters, text, th_deg, soft, lab):
    th = math.radians(th_deg)
    # rotate every glyph polygon by -th about (0,0): this makes the baseline horizontal
    items = []
    for g, ch in zip(groups, letters):
        ids = [c['id'] for c in g]
        polys = glyph_polys(soft, lab, ids)
        rp = [(rot(p, -th, np.zeros(2)), h) for p, h in polys]
        allp = np.vstack([p for p, _ in rp])
        items.append(dict(ch=ch, polys=rp, x0=allp[:, 0].min(), x1=allp[:, 0].max(), y0=allp[:, 1].min(), y1=allp[:, 1].max(),
                          area=sum(c['area'] for c in g)))
    # baseline from the flat-bottom letters: median of bottoms
    flat = [it for it in items if it['ch'] not in DESC]
    base = float(np.median([it['y1'] for it in flat]))
    caps = [it['y1'] - it['y0'] for it in items if it['ch'] not in SKIP_CAP]
    cap = float(np.median(caps))
    return items, base, cap


def name_pass():
    glyphs = {}      # ch -> list of instances
    pairs = []       # (cap_units gap) for adjacent letters in the same word
    wgaps = []       # gaps across a word space
    line_info = []
    for key, s in SHEETS.items():
        for ti in range(len(s['boxes'])):
            arr, pxmm = tag_array(key, ti)
            soft = white_soft(arr)
            cx, cy, r = ring_circle(arr)
            lab, comps = components(soft, 0.45, 20,
                                    exclude=lambda x, y, bb: math.hypot(x - cx, y - cy) < r * 1.12)
            sw = max(comps, key=lambda c: c['bbox'][2] - c['bbox'][0])
            comps = [c for c in comps if c is not sw]
            lines_txt = s['names'][ti]
            lines, deg = split_lines(comps, len(lines_txt)) if len(lines_txt) > 1 else ([comps], None)
            for li, text in enumerate(lines_txt):
                lc = lines[li]
                if deg is None:
                    # robust tilt from bottoms of the biggest comps
                    big = [c for c in lc if c['area'] > 0.5 * np.median([c['area'] for c in lc])]
                    a, b = theil_sen([c['cx'] for c in big], [c['bbox'][3] for c in big])
                    tdeg = math.degrees(math.atan(a))
                else:
                    tdeg = deg
                letters, groups = process_name_line(text, lc, tdeg, soft, lab, None)
                tag = '%s%d/%d %s' % (key, ti, li, text)
                if len(groups) != len(letters):
                    log('  SKIP', tag, ': letters', len(letters), 'groups', len(groups), '(merged or split letters)')
                    continue
                # refine the tilt from the assigned letters (bottoms of flat letters)
                flatg = [(g, ch) for g, ch in zip(groups, letters) if ch not in DESC]
                xs = [np.mean([c['cx'] for c in g]) for g, _ in flatg]; ys = [max(c['bbox'][3] for c in g if c['area'] > 0.3 * big_a) if False else max(c['bbox'][3] for c in g) for g, _ in flatg]
                if len(xs) >= 3:
                    a, b = theil_sen(xs, ys)
                    tdeg = math.degrees(math.atan(a))
                items, base, cap = normalise_line(groups, letters, text, tdeg, soft, lab)
                unit = 1000.0 / cap
                log('  ok  ', tag, 'tilt %.1f deg, cap %.1f px (%.1f mm)' % (tdeg, cap, cap / pxmm))
                line_info.append(dict(key=key, ti=ti, li=li, text=text, tilt=tdeg, cap_px=cap, cap_mm=cap / pxmm))
                for it in items:
                    polys = [(np.stack([(p[:, 0] - it['x0']) * unit, (base - p[:, 1]) * unit], axis=1), h) for p, h in it['polys']]
                    glyphs.setdefault(it['ch'], []).append(dict(src='%s%d' % (key, ti), cap_px=cap, polys=polys,
                                                                 w=(it['x1'] - it['x0']) * unit, area=it['area']))
                # spacing: row-wise min gap between neighbours, in cap units
                for k in range(len(items) - 1):
                    a_, b_ = items[k], items[k + 1]
                    g = min_row_gap(a_, b_, base, cap)
                    if g is None:
                        continue
                    # same word or across a space? decide by letters positions in text
                    word_break = text_gap_is_space(text, k)
                    (wgaps if word_break else pairs).append(g * 1000.0)
    return glyphs, pairs, wgaps, line_info


def text_gap_is_space(text, k):
    letters_idx = [i for i, ch in enumerate(text) if ch != ' ']
    i0, i1 = letters_idx[k], letters_idx[k + 1]
    return i1 - i0 > 1


def row_profile(item, base, cap, rows=64):
    """left/right ink edge per row (rotated frame) in pixels, NaN where empty"""
    ys = np.linspace(base - 1.05 * cap, base + 0.2 * cap, rows)
    L = np.full(rows, np.nan); R = np.full(rows, np.nan)
    img = np.zeros((int((item['y1'] - item['y0']) * 4) + 8, int((item['x1'] - item['x0']) * 4) + 8), np.uint8)
    for p, h in item['polys']:
        q = np.stack([(p[:, 0] - item['x0']) * 4 + 3, (p[:, 1] - item['y0']) * 4 + 3], axis=1).astype(np.int32)
        cv2.fillPoly(img, [q], 0 if h else 255)
    for i, y in enumerate(ys):
        yy = int((y - item['y0']) * 4 + 3)
        if 0 <= yy < img.shape[0]:
            xs = np.nonzero(img[yy] > 0)[0]
            if len(xs):
                L[i] = (xs.min() - 3) / 4.0 + item['x0']; R[i] = (xs.max() - 3) / 4.0 + item['x0']
    return L, R


def min_row_gap(a, b, base, cap):
    La, Ra = row_profile(a, base, cap); Lb, Rb = row_profile(b, base, cap)
    d = Lb - Ra
    d = d[~np.isnan(d)]
    if not len(d):
        return None
    return float(d.min()) / cap


# ------------------------------------------------------------------ digits
def digit_pass():
    digs = {}
    dgaps = []
    ginfo = []
    for key, s in SHEETS.items():
        for ti in range(len(s['boxes'])):
            arr, pxmm = tag_array(key, ti)
            soft = lime_soft(arr)
            cx, cy, r = ring_circle(arr)
            lab, comps = components(soft, 0.40, 60, exclude=lambda x, y, bb: math.hypot(x - cx, y - cy) < r * 1.2)
            if not comps:
                continue
            hmax = max(c['bbox'][3] - c['bbox'][1] for c in comps)
            dg = [c for c in comps if (c['bbox'][3] - c['bbox'][1]) > 0.6 * hmax]
            grn = [c for c in comps if c not in dg]
            dg.sort(key=lambda c: c['cx'])
            price = s['prices'][ti]
            tag = '%s%d %s' % (key, ti, price)
            if len(dg) != len(price):
                log('  SKIP digits', tag, ': digits', len(price), 'comps', len(dg))
                continue
            items = []
            for c, ch in zip(dg, price):
                polys = glyph_polys(soft, lab, [c['id']])
                allp = np.vstack([p for p, _ in polys])
                items.append(dict(ch=ch, polys=polys, x0=allp[:, 0].min(), x1=allp[:, 0].max(), y0=allp[:, 1].min(), y1=allp[:, 1].max()))
            base = float(np.median([it['y1'] for it in items]))
            hh = float(np.median([it['y1'] - it['y0'] for it in items]))
            unit = 1000.0 / hh
            log('  ok   digits', tag, 'height %.1f px (%.1f mm), baseline y %.1f' % (hh, hh / pxmm, base))
            ginfo.append(dict(key=key, ti=ti, price=price, h_mm=hh / pxmm, h_px=hh))
            for it in items:
                polys = [(np.stack([(p[:, 0] - it['x0']) * unit, (base - p[:, 1]) * unit], axis=1), h) for p, h in it['polys']]
                digs.setdefault(it['ch'], []).append(dict(src='%s%d' % (key, ti), cap_px=hh, polys=polys, w=(it['x1'] - it['x0']) * unit))
            for k in range(len(items) - 1):
                g = min_row_gap(items[k], items[k + 1], base, hh)
                if g is not None:
                    dgaps.append(g * 1000.0)
    return digs, dgaps, ginfo


if __name__ == '__main__':
    log('== names')
    glyphs, pairs, wgaps, line_info = name_pass()
    log('== digits')
    digs, dgaps, ginfo = digit_pass()
    log('letters found:', ''.join(sorted(glyphs)))
    log('digits found :', ''.join(sorted(digs)))
    log('letter pair gap (cap=1000): median %.0f  p25 %.0f  p75 %.0f  n=%d' % (np.median(pairs), np.percentile(pairs, 25), np.percentile(pairs, 75), len(pairs)))
    log('word gap      (cap=1000): median %.0f  n=%d' % (np.median(wgaps) if wgaps else -1, len(wgaps)))
    log('digit gap (h=1000)      : median %.0f  n=%d' % (np.median(dgaps), len(dgaps)))
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    with open(os.path.join(ROOT, 'build', 'glyphs_raw.pkl'), 'wb') as f:
        pickle.dump(dict(glyphs=glyphs, pairs=pairs, wgaps=wgaps, digs=digs, dgaps=dgaps, line_info=line_info, ginfo=ginfo), f)
