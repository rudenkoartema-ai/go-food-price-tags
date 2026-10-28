'use strict';
const C = require('./config');

const ORDER = ['L', 'S'];

function capacity(fmtKey) {
  const F = C.formats[fmtKey];
  return F.cols * F.rows;
}

/**
 * items: [{name, price, format:'L'|'S', qty}] (already validated)
 * Returns sheets in order. Formats never share a sheet; formats go in order of first appearance.
 * Inside a format tags follow the order of the list, row by row, left to right.
 */
function layout(items) {
  const seen = [];
  const byFmt = {};
  for (const it of items) {
    if (!byFmt[it.format]) { byFmt[it.format] = []; seen.push(it.format); }
    for (let i = 0; i < it.qty; i++) byFmt[it.format].push({ name: it.name, price: it.price });
  }
  const sheets = [];
  for (const fmt of seen) {
    const F = C.formats[fmt];
    const cap = capacity(fmt);
    const list = byFmt[fmt];
    for (let start = 0; start < list.length; start += cap) {
      const chunk = list.slice(start, start + cap);
      const gridW = F.cols * F.cellW, gridH = F.rows * F.cellH;
      const left = (C.page.w - gridW) / 2 + C.printOffset.x;
      const top = (C.page.h - gridH) / 2 + C.printOffset.y;
      const tags = chunk.map((t, i) => {
        const col = i % F.cols, row = Math.floor(i / F.cols);
        return {
          name: t.name, price: t.price, col, row,
          x: left + col * F.cellW + (F.cellW - F.tagW) / 2,
          y: top + row * F.cellH + (F.cellH - F.tagH) / 2,
        };
      });
      sheets.push({ format: fmt, left, top, gridW, gridH, tags, usedCols: Math.min(chunk.length, F.cols), usedRows: Math.ceil(chunk.length / F.cols) });
    }
  }
  return sheets;
}

function summarize(items) {
  const per = { L: 0, S: 0 };
  for (const it of items) per[it.format] += it.qty;
  const sheetsL = Math.ceil(per.L / capacity('L'));
  const sheetsS = Math.ceil(per.S / capacity('S'));
  return { tags: per.L + per.S, perFormat: per, sheets: sheetsL + sheetsS, sheetsL, sheetsS };
}

module.exports = { layout, summarize, capacity, ORDER };
