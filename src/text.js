'use strict';
const A = require('./assets');
const P = require('./path');

const TRACK_TRIM = 0; // tracking is baked into advances

function normalizeName(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase().replace(/’/g, "'");
}

/** pen advance between two glyphs: pair kerning measured from the real shapes (letters interlock when italic) */
function advance(table, prev, ch) {
  const g = table[prev];
  if (prev === ' ' || ch === ' ' || ch === undefined) return g.adv;
  const kt = table === A.fonts.name ? A.fonts.kern.name : A.fonts.kern.price;
  const k = kt[prev + ch];
  return k === undefined ? g.adv : k;
}

/** units = font units (em = 1000). Returns null when some character has no glyph. */
function widthUnits(table, str) {
  const cs = [...str];
  let w = 0;
  for (let i = 0; i < cs.length; i++) {
    if (!table[cs[i]]) return null;
    w += advance(table, cs[i], cs[i + 1]);
  }
  return w - TRACK_TRIM;
}

/** Real extent of the drawn glyphs in font units: {x0: left ink edge from the pen origin, w: ink width}. */
function inkExtent(table, str) {
  let pen = 0, left = null, right = null;
  const cs = [...str];
  for (let i = 0; i < cs.length; i++) {
    const g = table[cs[i]];
    if (!g) return null;
    if (g.bb) {
      if (left === null) left = pen + g.bb[0];
      right = pen + g.bb[1];
    }
    pen += advance(table, cs[i], cs[i + 1]);
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
  const cs = [...str];
  for (let i = 0; i < cs.length; i++) {
    const g = table[cs[i]];
    if (!g) continue;
    if (g.d) {
      d += P.transform(g.d, [k * xs * cos, k * xs * sin, k * sin, -k * cos, ax + pen * k * xs * cos, ay + pen * k * xs * sin]);
    }
    pen += advance(table, cs[i], cs[i + 1]);
  }
  return d;
}

module.exports = {
  normalizeName, widthUnits, inkExtent, missingChars, textPath,
  NAME: A.fonts.name, PRICE: A.fonts.price, CAP: A.fonts.cap, DIGIT: A.fonts.digit,
};
