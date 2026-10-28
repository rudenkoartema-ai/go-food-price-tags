'use strict';
/** SVG preview of the sheets. Uses the very same scene and layout as the PDF. */
const C = require('./config');
const S = require('./scene');

const col = (c) => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
const r2 = (v) => Math.round(v * 1000) / 1000;

function itemSvg(it) {
  if (it.kind === 'path') return '<path d="' + it.d + '" fill="' + col(it.color) + '"/>';
  return '<circle cx="' + r2(it.cx) + '" cy="' + r2(it.cy) + '" r="' + r2(it.r) + '" fill="none" stroke="' + col(it.color) + '" stroke-width="' + r2(it.w) + '"/>';
}

/** Hidden <svg> with the static art of each format, referenced by <use>. Insert once per page. */
function defsSvg() {
  let g = '';
  for (const k of Object.keys(C.formats)) {
    g += '<g id="gf-static-' + k + '">' + S.staticScene(k).map(itemSvg).join('') + '</g>';
  }
  return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + g + '</defs></svg>';
}

function cutLinesSvg(sheet) {
  const F = C.formats[sheet.format];
  const cc = C.cut;
  const xs = [], ys = [];
  for (let i = 0; i <= sheet.usedCols; i++) xs.push(sheet.left + i * F.cellW);
  for (let j = 0; j <= sheet.usedRows; j++) ys.push(sheet.top + j * F.cellH);
  const t = cc.tick;
  const y0 = ys[0] - t, y1 = ys[ys.length - 1] + t, x0 = xs[0] - t, x1 = xs[xs.length - 1] + t;
  let d = '';
  xs.forEach((x) => { d += 'M' + r2(x) + ' ' + r2(y0) + 'L' + r2(x) + ' ' + r2(y1); });
  ys.forEach((y) => { d += 'M' + r2(x0) + ' ' + r2(y) + 'L' + r2(x1) + ' ' + r2(y); });
  return '<path d="' + d + '" fill="none" stroke="#8c8c8c" stroke-width="0.25" stroke-dasharray="1.2 1.2"/>';
}

function sheetSvg(sheet, opts) {
  const o = Object.assign({ cutLines: true }, opts);
  let s = '<svg viewBox="0 0 ' + C.page.w + ' ' + C.page.h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Аркуш A4">';
  s += '<rect width="' + C.page.w + '" height="' + C.page.h + '" fill="#ffffff"/>';
  for (const t of sheet.tags) {
    s += '<g transform="translate(' + r2(t.x) + ' ' + r2(t.y) + ')"><use href="#gf-static-' + sheet.format + '"/>';
    s += S.dynamicScene(sheet.format, t.name, t.price).map(itemSvg).join('') + '</g>';
  }
  if (o.cutLines) s += cutLinesSvg(sheet);
  return s + '</svg>';
}

/** Small logo mark for the page header, built from the traced logo. */
function logoSvg(A, px) {
  const r = A.logo.r;
  return '<svg viewBox="' + -(r + 0.6) + ' ' + -(r + 0.6) + ' ' + 2 * (r + 0.6) + ' ' + 2 * (r + 0.6) + '" width="' + px + '" height="' + px + '" aria-hidden="true">' +
    '<circle r="' + r + '" fill="#0b0c0a"/>' +
    '<path d="' + A.logo.lime + '" fill="rgb(152,183,1)"/><path d="' + A.logo.white + '" fill="rgb(237,237,236)"/>' +
    '<circle r="' + r2(r - A.logo.ringW / 2) + '" fill="none" stroke="rgb(152,183,1)" stroke-width="' + A.logo.ringW + '"/></svg>';
}

module.exports = { defsSvg, sheetSvg, logoSvg };
