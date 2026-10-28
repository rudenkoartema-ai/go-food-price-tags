'use strict';
/**
 * Minimal, dependency-free PDF writer for vector price-tag sheets.
 * - A4 portrait, 1 unit = 1/72 inch, drawing coordinates in mm.
 * - Static art of a format is stored once as a Form XObject and re-used per tag.
 * - Every stream is Flate-compressed (injected `deflate`: Node zlib or browser CompressionStream).
 */
const C = require('./config');
const S = require('./scene');
const L = require('./layout');
const P = require('./path');

const PT = 72 / 25.4;
const n3 = (v) => {
  const s = v.toFixed(3);
  return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
};
const rgb = (c) => c.map((v) => n3(v / 255)).join(' ');

/** SVG-ish path (M L Q C Z, absolute) -> PDF path operators, coordinates passed through. */
function pathOps(d) {
  const re = /([MLQCZ])|(-?\d*\.?\d+(?:e-?\d+)?)/g;
  let m, cmd = null, nums = [];
  const out = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const flush = () => {
    if (!cmd) return;
    if (cmd !== 'Z' && nums.length === 0) return;
    if (cmd === 'M') { cx = sx = nums[0]; cy = sy = nums[1]; out.push(n3(cx) + ' ' + n3(cy) + ' m'); }
    else if (cmd === 'L') { cx = nums[0]; cy = nums[1]; out.push(n3(cx) + ' ' + n3(cy) + ' l'); }
    else if (cmd === 'Q') {
      const qx = nums[0], qy = nums[1], x = nums[2], y = nums[3];
      out.push(n3(cx + (2 / 3) * (qx - cx)) + ' ' + n3(cy + (2 / 3) * (qy - cy)) + ' ' +
        n3(x + (2 / 3) * (qx - x)) + ' ' + n3(y + (2 / 3) * (qy - y)) + ' ' + n3(x) + ' ' + n3(y) + ' c');
      cx = x; cy = y;
    } else if (cmd === 'C') {
      out.push(nums.map(n3).join(' ') + ' c'); cx = nums[4]; cy = nums[5];
    } else if (cmd === 'Z') { out.push('h'); cx = sx; cy = sy; }
    nums = [];
  };
  while ((m = re.exec(d))) {
    if (m[1]) { flush(); cmd = m[1]; if (cmd === 'Z') { flush(); cmd = null; } }
    else {
      nums.push(parseFloat(m[2]));
      const need = { M: 2, L: 2, Q: 4, C: 6 }[cmd];
      if (need && nums.length === need) {
        flush();
        if (cmd === 'M') cmd = 'L'; // implicit lineto after moveto
      }
    }
  }
  return out.join('\n');
}

function circleOps(cx, cy, r) {
  const k = 0.5522847498 * r;
  return [
    n3(cx + r) + ' ' + n3(cy) + ' m',
    n3(cx + r) + ' ' + n3(cy + k) + ' ' + n3(cx + k) + ' ' + n3(cy + r) + ' ' + n3(cx) + ' ' + n3(cy + r) + ' c',
    n3(cx - k) + ' ' + n3(cy + r) + ' ' + n3(cx - r) + ' ' + n3(cy + k) + ' ' + n3(cx - r) + ' ' + n3(cy) + ' c',
    n3(cx - r) + ' ' + n3(cy - k) + ' ' + n3(cx - k) + ' ' + n3(cy - r) + ' ' + n3(cx) + ' ' + n3(cy - r) + ' c',
    n3(cx + k) + ' ' + n3(cy - r) + ' ' + n3(cx + r) + ' ' + n3(cy - k) + ' ' + n3(cx + r) + ' ' + n3(cy) + ' c',
    'h',
  ].join('\n');
}

function itemsToOps(items) {
  const out = [];
  for (const it of items) {
    if (it.kind === 'path') {
      out.push(rgb(it.color) + ' rg\n' + pathOps(it.d) + '\nf');
    } else if (it.kind === 'ring') {
      out.push(rgb(it.color) + ' RG\n' + n3(it.w) + ' w\n' + circleOps(it.cx, it.cy, it.r) + '\nS');
    }
  }
  return out.join('\n');
}

class Writer {
  constructor(deflate) {
    this.deflate = deflate;
    this.objs = []; // Uint8Array|string per object (1-based)
    this.enc = new TextEncoder();
  }
  add(body) { this.objs.push(body); return this.objs.length; }
  reserve() { this.objs.push(null); return this.objs.length; }
  set(id, body) { this.objs[id - 1] = body; }
  async stream(dict, text) {
    const data = await this.deflate(this.enc.encode(text));
    const head = this.enc.encode(`<< ${dict} /Filter /FlateDecode /Length ${data.length} >>\nstream\n`);
    const tail = this.enc.encode('\nendstream');
    const buf = new Uint8Array(head.length + data.length + tail.length);
    buf.set(head, 0); buf.set(data, head.length); buf.set(data.length ? tail : tail, head.length + data.length);
    return buf;
  }
  finish(rootId, infoId) {
    const parts = [];
    let pos = 0;
    const push = (u8) => { parts.push(u8); pos += u8.length; };
    push(this.enc.encode('%PDF-1.5\n%âãÏÓ\n'));
    const offsets = [];
    this.objs.forEach((o, i) => {
      offsets.push(pos);
      push(this.enc.encode(`${i + 1} 0 obj\n`));
      push(typeof o === 'string' ? this.enc.encode(o) : o);
      push(this.enc.encode('\nendobj\n'));
    });
    const xref = pos;
    let x = `xref\n0 ${this.objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) x += String(off).padStart(10, '0') + ' 00000 n \n';
    x += `trailer\n<< /Size ${this.objs.length + 1} /Root ${rootId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    push(this.enc.encode(x));
    const out = new Uint8Array(pos);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

const pdfStr = (s) => {
  let h = 'FEFF';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c > 0xffff) { const v = c - 0x10000; h += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0'); }
    else h += c.toString(16).padStart(4, '0');
  }
  return '<' + h.toUpperCase() + '>';
};

function cutOps(sheet, F) {
  const cc = C.cut;
  const o = [];
  o.push(rgb(cc.color.map((v) => v * 255)) + ' RG ' + n3(cc.thickness) + ' w');
  o.push('[' + cc.dash.map(n3).join(' ') + '] 0 d');
  const x0 = sheet.left, y0 = sheet.top;
  const xs = [], ys = [];
  for (let i = 0; i <= sheet.usedCols; i++) xs.push(x0 + i * F.cellW);
  for (let j = 0; j <= sheet.usedRows; j++) ys.push(y0 + j * F.cellH);
  const ext = cc.tick;
  const yTop = ys[0] - ext, yBot = ys[ys.length - 1] + ext;
  const xL = xs[0] - ext, xR = xs[xs.length - 1] + ext;
  for (const x of xs) o.push(n3(x) + ' ' + n3(yTop) + ' m ' + n3(x) + ' ' + n3(yBot) + ' l S');
  for (const y of ys) o.push(n3(xL) + ' ' + n3(y) + ' m ' + n3(xR) + ' ' + n3(y) + ' l S');
  return o.join('\n');
}

/**
 * sheets: result of layout(); options: {cutLines:boolean, title}
 * Returns Uint8Array (PDF).
 */
async function buildPdf(sheets, deflate, options) {
  const opt = Object.assign({ cutLines: true, title: 'GO FOOD — цінники', keywords: '' }, options);
  const W = new Writer(deflate);
  const catalogId = W.reserve();
  const pagesId = W.reserve();
  const infoId = W.reserve();
  const formIds = {};
  const pageW = C.page.w * PT, pageH = C.page.h * PT;

  // static art, once per used format
  for (const sh of sheets) {
    if (formIds[sh.format]) continue;
    const F = C.formats[sh.format];
    const hpt = F.tagH * PT;
    const body = `q\n${n3(PT)} 0 0 ${n3(-PT)} 0 ${n3(hpt)} cm\n${itemsToOps(S.staticScene(sh.format))}\nQ`;
    const st = await W.stream(`/Type /XObject /Subtype /Form /BBox [0 0 ${n3(F.tagW * PT)} ${n3(hpt)}]`, body);
    formIds[sh.format] = W.add(st);
  }
  const xobjDict = '<< ' + Object.keys(formIds).map((k) => `/F${k} ${formIds[k]} 0 R`).join(' ') + ' >>';

  const pageIds = [];
  for (const sh of sheets) {
    const F = C.formats[sh.format];
    let c = '';
    for (const t of sh.tags) {
      const px = t.x * PT, py = (C.page.h - t.y - F.tagH) * PT;
      c += `q 1 0 0 1 ${n3(px)} ${n3(py)} cm /F${sh.format} Do Q\n`;
      c += `q 1 0 0 1 ${n3(px)} ${n3(py)} cm ${n3(PT)} 0 0 ${n3(-PT)} 0 ${n3(F.tagH * PT)} cm\n`;
      c += itemsToOps(S.dynamicScene(sh.format, t.name, t.price)) + '\nQ\n';
    }
    if (opt.cutLines) {
      c += `q ${n3(PT)} 0 0 ${n3(-PT)} 0 ${n3(pageH)} cm\n${cutOps(sh, F)}\nQ\n`;
    }
    const content = await W.stream('', c);
    const cid = W.add(content);
    const pid = W.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n3(pageW)} ${n3(pageH)}] ` +
      `/Resources << /XObject ${xobjDict} >> /Contents ${cid} 0 R >>`);
    pageIds.push(pid);
  }
  W.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((i) => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
  W.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  W.set(infoId, `<< /Title ${pdfStr(opt.title)} /Creator ${pdfStr('GO FOOD price tag generator')} ` +
    `/Subject ${pdfStr(opt.keywords)} >>`);
  return W.finish(catalogId, infoId);
}

/** Calibration sheet: 100 mm ruler line, 50x50 mm square, frame of the printable area. */
async function buildCalibrationPdf(deflate) {
  const W = new Writer(deflate);
  const catalogId = W.reserve(), pagesId = W.reserve(), infoId = W.reserve();
  const pageW = C.page.w * PT, pageH = C.page.h * PT;
  const ops = [];
  ops.push('0 0 0 RG 0.3 w');
  // frame: 5 mm inside the sheet edge
  const m = 5;
  ops.push(`${n3(m)} ${n3(m)} ${n3(C.page.w - 2 * m)} ${n3(C.page.h - 2 * m)} re S`);
  // 100 mm line with ticks every 10 mm
  const lx = 55, ly = 70;
  ops.push(`0.5 w ${n3(lx)} ${n3(ly)} m ${n3(lx + 100)} ${n3(ly)} l S`);
  for (let i = 0; i <= 10; i++) {
    const h = i % 5 === 0 ? 6 : 3;
    ops.push(`0.3 w ${n3(lx + i * 10)} ${n3(ly - h)} m ${n3(lx + i * 10)} ${n3(ly + h)} l S`);
  }
  // 50 x 50 square
  ops.push(`0.5 w ${n3(80)} ${n3(100)} 50 50 re S`);
  // diagonal cross for skew check
  ops.push(`0.2 w 80 100 m 130 150 l S 130 100 m 80 150 l S`);
  // vertical 100 mm ruler
  const vx = 30, vy = 120;
  ops.push(`0.5 w ${n3(vx)} ${n3(vy)} m ${n3(vx)} ${n3(vy + 100)} l S`);
  for (let i = 0; i <= 10; i++) {
    const h = i % 5 === 0 ? 6 : 3;
    ops.push(`0.3 w ${n3(vx - h)} ${n3(vy + i * 10)} m ${n3(vx + h)} ${n3(vy + i * 10)} l S`);
  }
  const body = `q ${n3(PT)} 0 0 ${n3(-PT)} 0 ${n3(pageH)} cm\n${ops.join('\n')}\nQ`;
  const cid = W.add(await W.stream('', body));
  const pid = W.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n3(pageW)} ${n3(pageH)}] /Resources << >> /Contents ${cid} 0 R >>`);
  W.set(pagesId, `<< /Type /Pages /Kids [${pid} 0 R] /Count 1 >>`);
  W.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  W.set(infoId, `<< /Title ${pdfStr('GO FOOD calibration')} >>`);
  return W.finish(catalogId, infoId);
}

module.exports = { buildPdf, buildCalibrationPdf, pathOps, itemsToOps };
