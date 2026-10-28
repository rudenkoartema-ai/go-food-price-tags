"""Physical checks on generated PDFs: page size, page count, tag count, tag size/position in mm (from a 200 dpi raster),
tags inside the sheet, no overlap, cut lines outside the tags, embedded manifest (names + prices)."""
import subprocess, json, sys, os, re, time, glob
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = ROOT + '/build/chk'
os.makedirs(B, exist_ok=True)
DPI = 200
PXMM = DPI / 25.4
FMT = {'L': (92, 88, 6), 'S': (83, 65, 8)}
fails = []
def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)

def gen(name, rows):
    out = f'{B}/{name}.pdf'
    t = time.time()
    subprocess.run(['node', ROOT + '/tools/make_pdf.js', out, json.dumps(rows, ensure_ascii=False)], check=True, capture_output=True)
    return out, time.time() - t

def run(name, rows, expect):  # expect: list of (format, tags_on_sheet)
    print('\n==', name)
    pdf, dt = gen(name, rows)
    info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    pages = int(re.search(r'Pages:\s+(\d+)', info).group(1))
    size = re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info)
    w, h = float(size.group(1)) / 72 * 25.4, float(size.group(2)) / 72 * 25.4
    check(pages == len(expect), f'pages = {pages} (expected {len(expect)})')
    check(abs(w - 210) < 0.1 and abs(h - 297) < 0.1, f'page size {w:.2f} x {h:.2f} mm (A4)')
    check('FEFF' not in info and 'GO FOOD' in info, 'title readable (Unicode)')
    subprocess.run(['pdftoppm', '-r', str(DPI), '-png', pdf, f'{B}/{name}'], check=True)
    total = 0
    for i, (fmt, n) in enumerate(expect, 1):
        f = sorted(glob.glob(f'{B}/{name}-*{i}.png'))[-1] if pages > 1 else glob.glob(f'{B}/{name}-*.png')[0]
        im = np.asarray(Image.open(f).convert('RGB')).astype(int)
        dark = im.max(axis=2) < 25
        lab, cnt = ndi.label(dark)
        boxes = []
        for sl in ndi.find_objects(lab):
            hh, ww = (sl[0].stop - sl[0].start) / PXMM, (sl[1].stop - sl[1].start) / PXMM
            if ww > 40 and hh > 40: boxes.append((sl[1].start / PXMM, sl[0].start / PXMM, ww, hh))
        tw, th, cap = FMT[fmt]
        check(len(boxes) == n, f'sheet {i} ({fmt}): {len(boxes)} tags (expected {n})')
        ok_size = all(abs(b[2] - tw) < 0.35 and abs(b[3] - th) < 0.35 for b in boxes)
        check(ok_size, f'sheet {i}: every tag is {tw} x {th} mm ± 0.35 (got ' + ', '.join(f'{b[2]:.1f}x{b[3]:.1f}' for b in boxes[:2]) + ')')
        check(all(b[0] >= 5 and b[1] >= 5 and b[0] + b[2] <= 205 and b[1] + b[3] <= 292 for b in boxes), f'sheet {i}: all tags ≥5 mm from the sheet edge')
        bs = sorted(boxes, key=lambda b: (round(b[1]), b[0]))
        gaps_ok = True
        for a in bs:
            for c in bs:
                if a is c: continue
                if abs(a[1] - c[1]) < 2 and 0 < c[0] - a[0] - a[2] < 3: gaps_ok = False
        check(gaps_ok, f'sheet {i}: gap between tags ≥ 3 mm')
        # cut lines must not touch the black tags: grey pixels inside any tag bbox
        grey = (np.abs(im[..., 0] - im[..., 1]) < 12) & (im.max(axis=2) > 90) & (im.max(axis=2) < 200)
        inside = 0
        for x, y, ww, hh in boxes:
            x0, y0, x1, y1 = int((x + 1.5) * PXMM), int((y + 1.5) * PXMM), int((x + ww - 1.5) * PXMM), int((y + hh - 1.5) * PXMM)
            # only count long straight grey runs (cut lines), not anti-aliased glyph edges
            sub = grey[y0:y1, x0:x1]
            inside += int((sub.sum(axis=1) > (x1 - x0) * 0.5).sum() + (sub.sum(axis=0) > (y1 - y0) * 0.5).sum())
        check(inside == 0, f'sheet {i}: cut lines do not cross tag artwork')
        total += len(boxes)
    check(total == sum(n for _, n in expect), f'total tags = {total}')
    return pdf, dt

pdf, dt = run('mixed', [
    {'name': 'Чіабата', 'price': '69', 'format': 'L', 'qty': 9},
    {'name': 'Паніні', 'price': '89', 'format': 'L', 'qty': 3},
    {'name': 'Трубочки', 'price': '35', 'format': 'S', 'qty': 8}], [('L', 6), ('L', 6), ('S', 8)])
subj = re.search(r'Subject:\s+(.*)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1)
print('  manifest:', subj[:150])
check('ЧІАБАТА=69' in subj and 'ПАНІНІ=89' in subj and 'ТРУБОЧКИ=35' in subj, 'manifest lists the right names and prices')
run('s17', [{'name': 'Трубочки', 'price': '35', 'format': 'S', 'qty': 17}], [('S', 8), ('S', 8), ('S', 1)])
run('l7', [{'name': 'Круасан з шинкою', 'price': '129', 'format': 'L', 'qty': 7}], [('L', 6), ('L', 1)])
run('one', [{'name': 'Хот-дог', 'price': '105', 'format': 'S', 'qty': 1}], [('S', 1)])
pdf, dt = run('ten', [{'name': 'Чіабата', 'price': '69', 'format': 'L', 'qty': 30}, {'name': 'Трубочки', 'price': '35', 'format': 'S', 'qty': 40}], [('L', 6)] * 5 + [('S', 8)] * 5)
print(f'  10 sheets: generated in {dt:.2f} s (incl. node start), {os.path.getsize(pdf)/1024:.0f} KB')
check(dt < 5, '10 sheets under 5 s')
# calibration
subprocess.run(['node', ROOT + '/tools/make_pdf.js', '--calibration', B + '/calib.pdf'], check=True)
info = subprocess.run(['pdfinfo', B + '/calib.pdf'], capture_output=True, text=True).stdout
check('Pages:          1' in info.replace('Pages:           1', 'Pages:          1'), 'calibration sheet: 1 page')
subprocess.run(['pdftoppm', '-r', '200', '-png', B + '/calib.pdf', B + '/calib'], check=True)
im = np.asarray(Image.open(glob.glob(B + '/calib-*.png')[0]).convert('L'))
row = im[int(70 * PXMM) - 1: int(70 * PXMM) + 2].min(axis=0) < 128
row[:int(20 * PXMM)] = False; row[int(190 * PXMM):] = False  # ignore the sheet frame
xs = np.nonzero(row)[0]
check(abs((xs.max() - xs.min()) / PXMM - 100) < 0.6, f'calibration line = {(xs.max()-xs.min())/PXMM:.2f} mm (expected 100)')
print('\nRESULT:', 'ALL PASSED' if not fails else f'{len(fails)} FAILED: ' + '; '.join(fails))
sys.exit(1 if fails else 0)
