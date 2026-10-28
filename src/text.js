'use strict';
const A = require('./assets');
const P = require('./path');

const TRACK_TRIM = 0; // tracking is baked into advances

function normalizeName(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase().replace(/’/g, "'");
}

/** units = font units (em = 1000). Returns null when some character has no glyph. */
function widthUnits(table, str) {
  let w = 0;
  for (const ch of str) {
    const g = table[ch];
    if (!g) return null;
    w += g.adv;
  }
  return w - TRACK_TRIM;
}

/** Real extent of the drawn glyphs in font units: {x0: left ink edge from the pen origin, w: ink width}. */
function inkExtent(table, str) {
  let pen = 0, left = null, right = null;
  for (const ch of str) {
    const g = table[ch];
    if (!g) return null;
    if (g.bb) {
      if (left === null) left = pen + g.bb[0];
      right = pen + g.bb[1];
    }
    pen += g.adv;
  }
  if (left === null) return null;
  return { x0: left, w: right - left };
}

function missingChars(table, str) {
  const bad = new Set();
  for (const ch of str) if (!table[ch]) bad.add(ch);
  return [...bad];
}

/**
 * Lay a string out as one SVG path (millimetres, y down).
 * k: mm per font unit; (ax, ay): baseline start; angleDeg: rotation about (ax, ay), negative = rising to the right.
 */
function textPath(table, str, k, ax, ay, angleDeg, xs) {
  xs = xs || 1;
  const th = ((angleDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  let pen = 0;
  let d = '';
  for (const ch of str) {
    const g = table[ch];
    if (!g) continue;
    if (g.d) {
      d += P.transform(g.d, [k * xs * cos, k * xs * sin, k * sin, -k * cos, ax + pen * k * xs * cos, ay + pen * k * xs * sin]);
    }
    pen += g.adv;
  }
  return d;
}

module.exports = {
  normalizeName, widthUnits, inkExtent, missingChars, textPath,
  NAME: A.fonts.name, PRICE: A.fonts.price, CAP: A.fonts.cap, DIGIT: A.fonts.digit,
};
